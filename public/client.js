const socket = io();
const $ = id => document.getElementById(id);
const screens = ["home", "lobby", "game", "results"];
let currentRoom = null;
let isHost = false;
let answered = false;
let latestQuestion = null;
let myChoice = null;

function showScreen(name) {
  screens.forEach(id => $(id).classList.toggle("hidden", id !== name));
}
function nameValue() { return $("playerName").value.trim() || "Player"; }
function showHomeError(message) { $("homeError").textContent = message || ""; }
function renderRoom(room) {
  currentRoom = room;
  isHost = room.hostId === socket.id;
  $("roomBadge").textContent = room.code;
  $("inviteCode").textContent = room.code;
  $("playerCount").textContent = `(${room.players.length}/10)`;
  $("playerList").innerHTML = "";
  room.players.forEach(p => {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = p.name;
    const role = document.createElement("span");
    role.className = "host";
    role.textContent = p.id === room.hostId ? "HOST" : (p.connected ? "READY" : "DISCONNECTED");
    li.append(name, role);
    $("playerList").append(li);
  });
  $("startBtn").classList.toggle("hidden", !isHost);
  $("startBtn").disabled = room.players.length < 2;
  $("lobbyHint").textContent = isHost
    ? (room.players.length < 2 ? "Invite at least one more player to start." : "Everyone is here. Start when ready!")
    : "Waiting for the host to start the competition…";
  renderScores(room.players);
}
function renderScores(players) {
  $("scoreList").innerHTML = "";
  [...players].sort((a,b) => b.score-a.score).forEach((p,i) => {
    const li = document.createElement("li");
    const n = document.createElement("span");
    n.textContent = `${i+1}. ${p.name}${p.id === socket.id ? " (you)" : ""}`;
    const s = document.createElement("strong");
    s.textContent = p.score;
    li.append(n,s);
    $("scoreList").append(li);
  });
}
function enterRoom(result) {
  currentRoom = result.room;
  showScreen("lobby");
  renderRoom(result.room);
}
function joinError(message) {
  if (!$("home").classList.contains("hidden")) showHomeError(message);
  else $("lobbyHint").textContent = message;
}

socket.on("connect", () => {
  $("connection").textContent = "● Connected";
  $("connection").classList.add("online");
});
socket.on("disconnect", () => {
  $("connection").textContent = "● Reconnecting…";
  $("connection").classList.remove("online");
});
socket.on("roomUpdate", room => {
  if (!currentRoom || room.code === currentRoom.code) {
    renderRoom(room);
    if (room.status === "lobby" && $("lobby").classList.contains("hidden") && $("game").classList.contains("hidden")) showScreen("lobby");
  }
});
socket.on("question", q => {
  latestQuestion = q;
  answered = false;
  myChoice = null;
  showScreen("game");
  $("questionProgress").textContent = `QUESTION ${q.number} / ${q.total}`;
  $("progressFill").style.width = `${(q.number/q.total)*100}%`;
  $("questionText").textContent = q.text;
  $("timer").textContent = q.seconds;
  $("answerStatus").textContent = "Choose your answer before time runs out.";
  $("reveal").classList.add("hidden");
  $("choices").innerHTML = "";
  q.choices.forEach((choice,index) => {
    const button = document.createElement("button");
    button.className = "choice";
    button.textContent = `${String.fromCharCode(65+index)}. ${choice}`;
    button.addEventListener("click", () => chooseAnswer(index));
    $("choices").append(button);
  });
});
function chooseAnswer(index) {
  if (answered) return;
  answered = true;
  myChoice = index;
  [...$("choices").children].forEach((b,i) => {
    b.disabled = true;
    if (i === index) b.classList.add("selected");
  });
  $("answerStatus").textContent = "Answer submitted. Waiting for the other players…";
  socket.emit("submitAnswer", { choice: index }, result => {
    if (!result || !result.ok) $("answerStatus").textContent = result?.error || "Could not submit answer.";
    else $("answerStatus").textContent = result.correct ? `Correct! +${result.points} points` : "Answer submitted. Keep going!";
  });
}
socket.on("tick", seconds => $("timer").textContent = seconds);
socket.on("answerCount", data => $("answerCount").textContent = `${data.answered} of ${data.total} players answered`);
socket.on("answerReveal", data => {
  [...$("choices").children].forEach((b,i) => {
    b.disabled = true;
    if (i === data.correctIndex) b.classList.add("correct");
    else if (i === myChoice) b.classList.add("wrong");
  });
  $("reveal").textContent = `Correct answer: ${String.fromCharCode(65+data.correctIndex)}. ${data.explanation}`;
  $("reveal").classList.remove("hidden");
  $("answerStatus").textContent = "Next question starting shortly…";
  if (currentRoom) renderScores(currentRoom.players);
});
socket.on("gameOver", data => {
  showScreen("results");
  $("finalRanking").innerHTML = "";
  data.ranking.forEach(p => {
    const li = document.createElement("li");
    li.textContent = `${p.rank}. ${p.name} — ${p.score} points`;
    $("finalRanking").append(li);
  });
});
$("createBtn").addEventListener("click", () => {
  showHomeError("");
  socket.emit("createRoom", { name: nameValue() }, result => {
    if (result?.ok) enterRoom(result);
    else showHomeError(result?.error || "Could not create room.");
  });
});
$("joinBtn").addEventListener("click", () => {
  showHomeError("");
  socket.emit("joinRoom", { name: nameValue(), code: $("roomCode").value }, result => {
    if (result?.ok) enterRoom(result);
    else showHomeError(result?.error || "Could not join room.");
  });
});
$("roomCode").addEventListener("input", e => e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""));
$("startBtn").addEventListener("click", () => {
  socket.emit("startGame", {}, result => {
    if (!result?.ok) $("lobbyHint").textContent = result?.error || "Could not start.";
  });
});
$("copyBtn").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(currentRoom.code);
    $("copyBtn").textContent = "Copied!";
    setTimeout(() => $("copyBtn").textContent = "Copy code", 1400);
  } catch { $("copyBtn").textContent = currentRoom.code; }
});
function leave() {
  socket.emit("leaveRoom");
  currentRoom = null;
  latestQuestion = null;
  showScreen("home");
}
$("leaveBtn").addEventListener("click", leave);
$("gameLeaveBtn").addEventListener("click", leave);
$("backBtn").addEventListener("click", () => {
  currentRoom = null;
  showHomeError("");
  showScreen("home");
});
showScreen("home");
