import { createServer } from "http";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import express from "express";
import { WebSocketServer } from "ws";
import {
  RED,
  BLACK,
  createBoard,
  applyMove,
  legalMoves,
  checkWinner,
} from "./game.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.static(join(__dirname, "public")));

const server = createServer(app);
const wss = new WebSocketServer({ server });

/** @type {Map<string, Room>} */
const rooms = new Map();

function makeRoomId() {
  let id;
  do {
    id = Math.random().toString(36).slice(2, 6).toUpperCase();
  } while (rooms.has(id));
  return id;
}

function newRoom(id) {
  const room = {
    id,
    players: [], // { ws, color }
    board: createBoard(),
    turn: RED,
    winner: null,
    rematchVotes: new Set(),
  };
  rooms.set(id, room);
  return room;
}

function findOrCreatePublicRoom() {
  for (const room of rooms.values()) {
    if (!room.isPrivate && room.players.length === 1 && !room.winner) {
      return room;
    }
  }
  const room = newRoom(makeRoomId());
  return room;
}

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcastState(room) {
  const winner = room.winner;
  for (const player of room.players) {
    send(player.ws, {
      type: "state",
      board: room.board,
      turn: room.turn,
      yourColor: player.color,
      players: room.players.length,
      winner,
      // Send the moving player's own legal moves so the client can highlight.
      legalMoves: !winner && room.turn === player.color
        ? legalMoves(room.board, player.color)
        : [],
    });
  }
}

function resetRoom(room) {
  room.board = createBoard();
  room.turn = RED;
  room.winner = null;
  room.rematchVotes.clear();
}

function handleJoin(ws, data) {
  let room;
  const code = (data.room || "").trim().toUpperCase();

  if (code) {
    room = rooms.get(code);
    if (!room) {
      room = newRoom(code);
      room.isPrivate = true;
    } else if (room.players.length >= 2) {
      send(ws, { type: "error", message: `Room ${code} is full.` });
      return;
    }
  } else {
    room = findOrCreatePublicRoom();
  }

  const color = room.players.length === 0 ? RED : BLACK;
  const player = { ws, color };
  room.players.push(player);
  ws.roomId = room.id;
  ws.color = color;

  send(ws, { type: "joined", room: room.id, color });

  if (room.players.length < 2) {
    send(ws, { type: "waiting", room: room.id });
  } else {
    for (const p of room.players) send(p.ws, { type: "start" });
    broadcastState(room);
  }
}

function handleMove(ws, data) {
  const room = rooms.get(ws.roomId);
  if (!room || room.winner || room.players.length < 2) return;
  if (room.turn !== ws.color) {
    send(ws, { type: "error", message: "Not your turn." });
    return;
  }

  const next = applyMove(room.board, ws.color, data.sequence);
  if (!next) {
    send(ws, { type: "error", message: "Illegal move." });
    broadcastState(room); // resync the client
    return;
  }

  room.board = next;
  const upcoming = ws.color === RED ? BLACK : RED;
  room.turn = upcoming;
  room.winner = checkWinner(room.board, upcoming);
  broadcastState(room);
}

function handleRematch(ws) {
  const room = rooms.get(ws.roomId);
  if (!room || !room.winner) return;
  room.rematchVotes.add(ws.color);
  if (room.rematchVotes.size === room.players.length && room.players.length === 2) {
    resetRoom(room);
    for (const p of room.players) send(p.ws, { type: "start" });
    broadcastState(room);
  } else {
    for (const p of room.players) {
      if (p.ws !== ws) send(p.ws, { type: "rematchOffer" });
    }
  }
}

function handleLeave(ws) {
  const room = rooms.get(ws.roomId);
  if (!room) return;
  room.players = room.players.filter((p) => p.ws !== ws);
  if (room.players.length === 0) {
    rooms.delete(room.id);
    return;
  }
  // Opponent left: notify the remaining player and reset for a fresh game.
  resetRoom(room);
  for (const p of room.players) {
    p.color = RED; // remaining player becomes red, waits for a new opponent
    p.ws.color = RED;
    send(p.ws, { type: "opponentLeft" });
    send(p.ws, { type: "joined", room: room.id, color: RED });
    send(p.ws, { type: "waiting", room: room.id });
  }
}

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }
    switch (data.type) {
      case "join":
        handleJoin(ws, data);
        break;
      case "move":
        handleMove(ws, data);
        break;
      case "rematch":
        handleRematch(ws);
        break;
      case "leave":
        handleLeave(ws);
        break;
    }
  });

  ws.on("close", () => handleLeave(ws));
});

server.listen(PORT, () => {
  console.log(`Checkers server running at http://localhost:${PORT}`);
});
