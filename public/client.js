const $ = (id) => document.getElementById(id);

const lobby = $("lobby");
const game = $("game");
const boardEl = $("board");
const statusEl = $("status");
const roomCodeEl = $("roomCode");
const colorBadge = $("colorBadge");
const rematchBtn = $("rematchBtn");
const leaveBtn = $("leaveBtn");
const toastEl = $("toast");

let ws = null;
let state = null; // latest server state
let myColor = null;
let roomId = null;

// Interactive move selection
let path = []; // [[r,c], ...] chosen so far
let candidates = []; // legal sequences matching the current path prefix

function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}`);
  return new Promise((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = reject;
    ws.onmessage = onMessage;
    ws.onclose = () => {
      statusEl.textContent = "Disconnected. Refresh to reconnect.";
    };
  });
}

async function join(room) {
  if (!ws || ws.readyState !== WebSocket.OPEN) await connect();
  send({ type: "join", room: room || "" });
  lobby.classList.add("hidden");
  game.classList.remove("hidden");
  statusEl.textContent = "Joining…";
}

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function onMessage(ev) {
  const msg = JSON.parse(ev.data);
  switch (msg.type) {
    case "joined":
      roomId = msg.room;
      myColor = msg.color;
      roomCodeEl.textContent = msg.room;
      updateBadge();
      break;
    case "waiting":
      statusEl.textContent = "Waiting for an opponent…";
      rematchBtn.classList.add("hidden");
      renderEmpty();
      break;
    case "start":
      resetSelection();
      rematchBtn.classList.add("hidden");
      toast("Game on!");
      break;
    case "state":
      state = msg;
      resetSelection();
      render();
      break;
    case "rematchOffer":
      toast("Opponent wants a rematch");
      break;
    case "opponentLeft":
      toast("Opponent left the game");
      state = null;
      break;
    case "error":
      toast(msg.message);
      break;
  }
}

function updateBadge() {
  if (!myColor) return;
  colorBadge.innerHTML = `<span class="dot ${myColor}"></span>You are ${
    myColor[0].toUpperCase() + myColor.slice(1)
  }`;
}

// --- Rendering ----------------------------------------------------------

// Map a display cell (top-left origin) to board coordinates. Black sees the
// board rotated 180° so its own pieces sit at the bottom.
function toBoard(dr, dc) {
  if (myColor === "black") return [7 - dr, 7 - dc];
  return [dr, dc];
}

function renderEmpty() {
  buildGrid(() => {});
}

function buildGrid(decorate) {
  boardEl.innerHTML = "";
  for (let dr = 0; dr < 8; dr++) {
    for (let dc = 0; dc < 8; dc++) {
      const [r, c] = toBoard(dr, dc);
      const sq = document.createElement("div");
      const dark = (r + c) % 2 === 1;
      sq.className = `square ${dark ? "dark" : "light"}`;
      sq.dataset.r = r;
      sq.dataset.c = c;
      decorate(sq, r, c, dark);
      boardEl.appendChild(sq);
    }
  }
}

function render() {
  if (!state) return;
  const { board, turn, winner } = state;

  // Status line
  if (winner) {
    statusEl.textContent =
      winner === myColor ? "You win! 🎉" : "You lost.";
    rematchBtn.classList.remove("hidden");
  } else {
    statusEl.textContent = turn === myColor ? "Your turn" : "Opponent's turn";
    rematchBtn.classList.add("hidden");
  }
  updateBadge();

  const myTurn = !winner && turn === myColor;
  const movableStarts = new Set(
    myTurn ? state.legalMoves.map((seq) => `${seq[0][0]},${seq[0][1]}`) : []
  );
  const selectedStart = path.length ? `${path[0][0]},${path[0][1]}` : null;
  const nextTargets = new Set(
    path.length
      ? candidates
          .filter((seq) => seq.length > path.length)
          .map((seq) => {
            const [tr, tc] = seq[path.length];
            return `${tr},${tc}`;
          })
      : []
  );

  buildGrid((sq, r, c, dark) => {
    const key = `${r},${c}`;
    const cell = board[r][c];

    if (cell) {
      const piece = document.createElement("div");
      piece.className = `piece ${cell.color}${cell.king ? " king" : ""}`;
      sq.appendChild(piece);
    }

    if (dark && myTurn) {
      sq.classList.add("playable");
      if (movableStarts.has(key) && !path.length) sq.classList.add("movable");
      if (key === selectedStart) sq.classList.add("selected");
      if (nextTargets.has(key)) sq.classList.add("target");
      sq.addEventListener("click", () => onSquareClick(r, c));
    }
  });
}

// --- Move selection -----------------------------------------------------

function resetSelection() {
  path = [];
  candidates = [];
}

function onSquareClick(r, c) {
  if (!state || state.winner || state.turn !== myColor) return;
  const key = `${r},${c}`;

  // No piece selected yet: try to start a move from here.
  if (path.length === 0) {
    const starts = state.legalMoves.filter(
      (seq) => seq[0][0] === r && seq[0][1] === c
    );
    if (starts.length === 0) return;
    path = [[r, c]];
    candidates = starts;
    render();
    return;
  }

  // Clicking the selected piece again clears the selection.
  if (path[0][0] === r && path[0][1] === c && path.length === 1) {
    resetSelection();
    render();
    return;
  }

  // Otherwise, treat the click as the next step in the sequence.
  const advanced = candidates.filter(
    (seq) =>
      seq.length > path.length &&
      seq[path.length][0] === r &&
      seq[path.length][1] === c
  );
  if (advanced.length === 0) {
    // Clicked an invalid square — maybe selecting a different piece.
    resetSelection();
    onSquareClick(r, c);
    return;
  }

  path.push([r, c]);
  candidates = advanced;

  // If the path now equals a complete sequence and cannot extend, submit it.
  const mustContinue = candidates.some((seq) => seq.length > path.length);
  if (!mustContinue) {
    send({ type: "move", sequence: path });
    resetSelection();
  }
  render();
}

// --- Toast --------------------------------------------------------------

let toastTimer = null;
function toast(text) {
  toastEl.textContent = text;
  toastEl.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 2600);
}

// --- Lobby wiring -------------------------------------------------------

$("quickMatch").addEventListener("click", () => join(""));
$("joinRoom").addEventListener("click", () => {
  const code = $("roomInput").value.trim();
  join(code);
});
$("roomInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("joinRoom").click();
});

rematchBtn.addEventListener("click", () => {
  send({ type: "rematch" });
  toast("Rematch requested…");
});

leaveBtn.addEventListener("click", () => {
  send({ type: "leave" });
  if (ws) ws.close();
  game.classList.add("hidden");
  lobby.classList.remove("hidden");
  state = null;
  resetSelection();
});
