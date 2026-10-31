# Brain Arena — Multiplayer browser game

A starter MVP for 2–10 players. Players create/join a six-character room, then compete in 10 timed logic questions. Correct answers earn 100 points plus a speed bonus (5 points per remaining second).

## Requirements
- Node.js 20+
- npm

## Run locally
```bash
npm install
npm start
```
Open http://localhost:3000 in two browser tabs or on two devices on the same network (use your computer's LAN IP for the second device).

## Deploy on Render
1. Create a GitHub repository and upload this project.
2. In Render, choose **New → Web Service** and connect the repository.
3. Set:
   - Build command: `npm install`
   - Start command: `npm start`
   - Runtime: Node
4. Deploy. Open the generated `https://YOUR-SERVICE.onrender.com` URL.
5. Test by opening the URL in two separate browsers/devices and joining with the room code.

The app listens on `process.env.PORT`, serves the browser client and Socket.IO from the same origin, and includes `/health`.

## Deploy on Railway
1. Upload the project to GitHub.
2. Create a new Railway project and deploy from the repository.
3. Railway detects Node.js; use `npm start` as the start command if it is not detected automatically.
4. Generate a public domain in the service's networking settings.

## Architecture
- `public/index.html`, `style.css`, `client.js`: browser interface and Socket.IO client.
- `server.js`: authoritative room/game state, question timer, answer validation, scoring and broadcasts.
- Socket.IO rooms isolate each match. The server, not the browser, decides correctness and points.

## MVP limitations / production checklist
- Rooms and scores are held in memory. A server restart clears all active matches.
- There is no account system or persistent leaderboard yet.
- A player who disconnects is removed; reconnect/rejoin recovery is not implemented.
- Add rate limits, profanity filtering, authentication if needed, persistent storage (Postgres), moderation/reporting, and automated tests before a public launch.
- Use a Redis-backed Socket.IO adapter if you later run multiple server instances.
- The included question bank is a demo. Review/edit question wording and answers before launch.

## Game rule note
The game is for entertainment and practice. Scores are not an IQ test, clinical assessment, or validated measure of cognitive ability.
