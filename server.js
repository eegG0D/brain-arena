const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true },
  pingInterval: 25000,
  pingTimeout: 20000
});

app.use(express.static("public"));
app.get("/health", (_req, res) => res.json({ ok: true, service: "brain-arena" }));

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 10;
const MIN_PLAYERS = 2;
const QUESTION_SECONDS = 15;
const TOTAL_QUESTIONS = 10;

const QUESTION_BANK = [
  { text: "What number comes next? 2, 4, 8, 16, ...", choices: ["18", "24", "32", "64"], answer: 2, explain: "Each number is multiplied by 2." },
  { text: "Which is the odd one out?", choices: ["Triangle", "Square", "Circle", "Cube"], answer: 3, explain: "A cube is three-dimensional; the others are 2D shapes." },
  { text: "If all Bloops are Razzies and all Razzies are Lazzies, are all Bloops Lazzies?", choices: ["Yes", "No", "Cannot tell", "Only some"], answer: 0, explain: "The relationship is transitive." },
  { text: "What is 15% of 200?", choices: ["15", "20", "30", "35"], answer: 2, explain: "0.15 × 200 = 30." },
  { text: "Which option is NOT a synonym of joyful?", choices: ["Happy", "Cheerful", "Miserable", "Glad"], answer: 2, explain: "Miserable means very unhappy; the others are close synonyms of joyful." },
  { text: "A clock shows 3:00. What is the angle between its hands?", choices: ["45°", "60°", "90°", "180°"], answer: 2, explain: "At 3:00 the hands form a right angle." },
  { text: "Which number does not belong? 3, 5, 7, 9, 11", choices: ["3", "5", "9", "11"], answer: 2, explain: "9 is not prime; the others are prime." },
  { text: "A dozen eggs cost $3. How much do 4 eggs cost?", choices: ["$0.50", "$0.75", "$1.00", "$1.50"], answer: 2, explain: "Four eggs are one-third of a dozen, so they cost $1." },
  { text: "Complete the pattern: A, C, F, J, O, ...", choices: ["S", "T", "U", "V"], answer: 2, explain: "The jumps are +2, +3, +4, +5, then +6: U." },
  { text: "You pass the person in second place in a race. What place are you now in?", choices: ["First", "Second", "Third", "It depends"], answer: 1, explain: "You take the position of the person you passed: second." },
  { text: "What is the smallest?", choices: ["0.8", "0.08", "0.18", "0.80"], answer: 1, explain: "0.08 is smaller than the others." },
  { text: "If yesterday was Monday, what day is tomorrow?", choices: ["Tuesday", "Wednesday", "Thursday", "Sunday"], answer: 1, explain: "Yesterday Monday means today Tuesday and tomorrow Wednesday." },
  { text: "Which pair has the same relationship as Bird : Nest?", choices: ["Bee : Hive", "Dog : Bark", "Fish : Water", "Cow : Grass"], answer: 0, explain: "A nest is a bird's home; a hive is a bee's home." },
  { text: "What is 7 × 8 − 6?", choices: ["42", "48", "50", "56"], answer: 2, explain: "56 − 6 = 50." },
  { text: "Which word can be made from LISTEN?", choices: ["Silent", "Little", "Island", "Stone"], answer: 0, explain: "LISTEN and SILENT use the same letters." }
];

const rooms = new Map();
const timers = new Map();

function cleanName(value) {
  return String(value || "").trim().replace(/[<>]/g, "").slice(0, 18) || "Player";
}
function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = Array.from({ length: 6 }, () => chars[crypto.randomInt(chars.length)]).join("");
  } while (rooms.has(code));
  return code;
}
function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, score: p.score, connected: p.connected
    })),
    questionNumber: room.questionIndex + 1,
    totalQuestions: TOTAL_QUESTIONS,
    secondsLeft: room.secondsLeft
  };
}
function broadcastRoom(room) {
  io.to(room.code).emit("roomUpdate", publicRoom(room));
}
function stopTimer(code) {
  if (timers.has(code)) clearInterval(timers.get(code));
  timers.delete(code);
}
function shuffledQuestions() {
  return [...QUESTION_BANK]
    .sort(() => Math.random() - 0.5)
    .slice(0, TOTAL_QUESTIONS);
}
function sendQuestion(room) {
  const q = room.questions[room.questionIndex];
  room.secondsLeft = QUESTION_SECONDS;
  room.answers = new Map();
  io.to(room.code).emit("question", {
    number: room.questionIndex + 1,
    total: TOTAL_QUESTIONS,
    text: q.text,
    choices: q.choices,
    seconds: QUESTION_SECONDS
  });
  broadcastRoom(room);
  stopTimer(room.code);
  const timer = setInterval(() => {
    room.secondsLeft -= 1;
    io.to(room.code).emit("tick", room.secondsLeft);
    if (room.secondsLeft <= 0) finishQuestion(room);
  }, 1000);
  timers.set(room.code, timer);
}
function finishQuestion(room) {
  if (room.status !== "playing") return;
  stopTimer(room.code);
  const q = room.questions[room.questionIndex];
  const results = [...room.players.values()].map(p => ({
    id: p.id,
    name: p.name,
    score: p.score,
    answer: room.answers.has(p.id) ? room.answers.get(p.id).choice : null,
    correct: room.answers.has(p.id) && room.answers.get(p.id).choice === q.answer
  }));
  io.to(room.code).emit("answerReveal", {
    correctIndex: q.answer,
    explanation: q.explain,
    results
  });
  room.status = "between";
  broadcastRoom(room);
  room.nextTimer = setTimeout(() => {
    room.questionIndex += 1;
    if (room.questionIndex >= TOTAL_QUESTIONS) endGame(room);
    else {
      room.status = "playing";
      sendQuestion(room);
    }
  }, 3500);
}
function endGame(room) {
  room.status = "finished";
  stopTimer(room.code);
  const ranking = [...room.players.values()]
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({ rank: i + 1, name: p.name, score: p.score }));
  io.to(room.code).emit("gameOver", { ranking });
  broadcastRoom(room);
}
function removePlayer(socket) {
  const code = socket.data.roomCode;
  if (!code || !rooms.has(code)) return;
  const room = rooms.get(code);
  room.players.delete(socket.id);
  socket.leave(code);
  socket.data.roomCode = null;
  if (room.players.size === 0) {
    stopTimer(code);
    if (room.nextTimer) clearTimeout(room.nextTimer);
    rooms.delete(code);
    return;
  }
  if (room.hostId === socket.id) room.hostId = room.players.keys().next().value;
  broadcastRoom(room);
}

io.on("connection", socket => {
  socket.on("createRoom", ({ name } = {}, ack = () => {}) => {
    const code = makeCode();
    const player = { id: socket.id, name: cleanName(name), score: 0, connected: true };
    const room = {
      code, hostId: socket.id, players: new Map([[socket.id, player]]),
      status: "lobby", questionIndex: 0, questions: [], answers: new Map(),
      secondsLeft: QUESTION_SECONDS, nextTimer: null
    };
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    ack({ ok: true, code, room: publicRoom(room) });
    broadcastRoom(room);
  });

  socket.on("joinRoom", ({ code, name } = {}, ack = () => {}) => {
    code = String(code || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return ack({ ok: false, error: "Room not found. Check the code." });
    if (room.status !== "lobby") return ack({ ok: false, error: "This game has already started." });
    if (room.players.size >= MAX_PLAYERS) return ack({ ok: false, error: "This room is full (10 players maximum)." });
    const player = { id: socket.id, name: cleanName(name), score: 0, connected: true };
    room.players.set(socket.id, player);
    socket.join(code);
    socket.data.roomCode = code;
    ack({ ok: true, code, room: publicRoom(room) });
    broadcastRoom(room);
  });

  socket.on("startGame", (_payload, ack = () => {}) => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room) return ack({ ok: false, error: "Room no longer exists." });
    if (room.hostId !== socket.id) return ack({ ok: false, error: "Only the host can start." });
    if (room.status !== "lobby") return ack({ ok: false, error: "Game has already started." });
    if (room.players.size < MIN_PLAYERS) return ack({ ok: false, error: "At least 2 players are required." });
    room.status = "playing";
    room.questionIndex = 0;
    room.questions = shuffledQuestions();
    for (const p of room.players.values()) p.score = 0;
    ack({ ok: true });
    sendQuestion(room);
  });

  socket.on("submitAnswer", ({ choice } = {}, ack = () => {}) => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room || room.status !== "playing") return ack({ ok: false, error: "No active question." });
    if (!room.players.has(socket.id)) return ack({ ok: false, error: "You are not in this room." });
    if (room.answers.has(socket.id)) return ack({ ok: false, error: "You already answered." });
    const q = room.questions[room.questionIndex];
    const n = Number(choice);
    if (!Number.isInteger(n) || n < 0 || n >= q.choices.length) return ack({ ok: false, error: "Invalid answer." });
    const correct = n === q.answer;
    const points = correct ? 100 + Math.max(0, room.secondsLeft) * 5 : 0;
    room.answers.set(socket.id, { choice: n });
    room.players.get(socket.id).score += points;
    ack({ ok: true, correct, points });
    io.to(code).emit("answerCount", { answered: room.answers.size, total: room.players.size });
    if (room.answers.size >= room.players.size) finishQuestion(room);
  });

  socket.on("leaveRoom", () => removePlayer(socket));
  socket.on("disconnect", () => removePlayer(socket));
});

server.listen(PORT, () => console.log(`Brain Arena listening on ${PORT}`));
