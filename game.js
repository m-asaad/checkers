// Pure checkers (American draughts) rules engine — server-authoritative.
// Board: 8x8 array, row 0 at top. Each cell is null or { color, king }.
// Red starts at the bottom (rows 5-7) and moves up (dr = -1).
// Black starts at the top (rows 0-2) and moves down (dr = +1).
// Red moves first. Captures are mandatory; multi-jumps must be completed.

export const RED = "red";
export const BLACK = "black";

export function createBoard() {
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const dark = (r + c) % 2 === 1;
      if (!dark) continue;
      if (r < 3) board[r][c] = { color: BLACK, king: false };
      else if (r > 4) board[r][c] = { color: RED, king: false };
    }
  }
  return board;
}

const inBounds = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

function cloneBoard(board) {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

function directions(piece) {
  if (piece.king) return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const dr = piece.color === RED ? -1 : 1;
  return [[dr, -1], [dr, 1]];
}

const kingRow = (color) => (color === RED ? 0 : 7);

// All capture sequences starting from (r,c). Each sequence is an array of
// positions [[r,c], ...] beginning at the start square. Multi-jumps recurse.
function captureSequences(board, r, c) {
  const piece = board[r][c];
  if (!piece) return [];

  const search = (b, row, col, current, path) => {
    let extended = false;
    const results = [];
    for (const [dr, dc] of directions(current)) {
      const mr = row + dr;
      const mc = col + dc;
      const lr = row + 2 * dr;
      const lc = col + 2 * dc;
      if (!inBounds(lr, lc)) continue;
      const mid = b[mr]?.[mc];
      if (!mid || mid.color === current.color) continue;
      if (b[lr][lc]) continue;

      extended = true;
      const nb = cloneBoard(b);
      nb[row][col] = null;
      nb[mr][mc] = null;
      let landed = { ...current };
      // A man that reaches the king row ends its turn (no jumping as a king).
      const promoted = !landed.king && lr === kingRow(landed.color);
      if (promoted) landed.king = true;
      nb[lr][lc] = landed;

      const nextPath = [...path, [lr, lc]];
      if (promoted) {
        results.push(nextPath);
      } else {
        const deeper = search(nb, lr, lc, landed, nextPath);
        if (deeper.length === 0) results.push(nextPath);
        else results.push(...deeper);
      }
    }
    return extended ? results : [];
  };

  return search(board, r, c, piece, [[r, c]]);
}

function simpleMoves(board, r, c) {
  const piece = board[r][c];
  if (!piece) return [];
  const moves = [];
  for (const [dr, dc] of directions(piece)) {
    const nr = r + dr;
    const nc = c + dc;
    if (inBounds(nr, nc) && !board[nr][nc]) {
      moves.push([[r, c], [nr, nc]]);
    }
  }
  return moves;
}

// All legal move sequences for a color. If any capture exists, only captures
// are legal (mandatory capture rule).
export function legalMoves(board, color) {
  const captures = [];
  const simples = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece || piece.color !== color) continue;
      captures.push(...captureSequences(board, r, c));
      simples.push(...simpleMoves(board, r, c));
    }
  }
  return captures.length > 0 ? captures : simples;
}

const samePath = (a, b) =>
  a.length === b.length && a.every(([r, c], i) => r === b[i][0] && c === b[i][1]);

// Apply a validated move sequence, returning a new board. Returns null if the
// sequence is not a legal move for `color`.
export function applyMove(board, color, sequence) {
  const legal = legalMoves(board, color);
  const match = legal.find((seq) => samePath(seq, sequence));
  if (!match) return null;

  const nb = cloneBoard(board);
  const [sr, sc] = match[0];
  const piece = { ...nb[sr][sc] };
  nb[sr][sc] = null;

  for (let i = 1; i < match.length; i++) {
    const [pr, pc] = match[i - 1];
    const [nr, nc] = match[i];
    // Remove a captured piece if this was a jump (distance 2).
    if (Math.abs(nr - pr) === 2) {
      nb[(pr + nr) / 2][(pc + nc) / 2] = null;
    }
  }

  const [er, ec] = match[match.length - 1];
  if (!piece.king && er === kingRow(piece.color)) piece.king = true;
  nb[er][ec] = piece;
  return nb;
}

// Returns the winning color if the game is over, otherwise null.
export function checkWinner(board, nextToMove) {
  let red = 0;
  let black = 0;
  for (const row of board) {
    for (const cell of row) {
      if (!cell) continue;
      if (cell.color === RED) red++;
      else black++;
    }
  }
  if (red === 0) return BLACK;
  if (black === 0) return RED;
  // The player to move with no legal moves loses.
  if (legalMoves(board, nextToMove).length === 0) {
    return nextToMove === RED ? BLACK : RED;
  }
  return null;
}
