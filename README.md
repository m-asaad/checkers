# Multiplayer Checkers

Real-time, two-player checkers (American draughts) over WebSockets. The server
is authoritative for all game rules, so moves can't be forged by a client.

## Run

```bash
npm install
npm start          # then open http://localhost:3000
```

Use `npm run dev` for auto-restart on file changes.

## How to play

- **Quick Match** pairs you with the next person who clicks Quick Match.
- **Room code** — type any code and share it with a friend to play privately
  (the first person to enter a code creates the room).
- Open two browser tabs to play against yourself.

The board is shown from your own perspective. Your turn highlights movable
pieces; click a piece, then a highlighted square. Captures are mandatory and
multi-jumps are completed one hop at a time. Reaching the far row crowns a king
(♛), which moves in all four diagonal directions.

## Layout

| File               | Responsibility                                  |
| ------------------ | ----------------------------------------------- |
| `game.js`          | Pure rules engine (moves, captures, win check). |
| `server.js`        | HTTP + WebSocket server, rooms, matchmaking.    |
| `public/`          | Client UI (board rendering & move selection).   |
