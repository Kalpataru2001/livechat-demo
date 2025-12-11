// app.js
const socket = io();
let roomId = "room1";
let userId = "lover" + Math.floor(Math.random() * 1000);

// DOM elements
const input = document.getElementById("input");
const messagesEl = document.getElementById("messages");
const remotePreview = document.getElementById("remotePreview");
const typingIndicator = document.getElementById("typingIndicator");
const sendBtn = document.getElementById("sendBtn");
const emojiBtn = document.getElementById("emojiBtn");
const emojiPicker = document.getElementById("emojiPicker");

// Join automatically for demo
socket.emit("join", { roomId, userId });

// Debounce helper
function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// send typing preview
const sendDraftDebounced = debounce(() => {
  socket.emit("typing_update", { roomId, draft: input.value });
  socket.emit("typing_status", { roomId, status: "typing" });

  clearTimeout(window.stopTimer);
  window.stopTimer = setTimeout(() => {
    socket.emit("typing_status", { roomId, status: "stopped" });
  }, 1200);
}, 120);

// Handle input typing
input.addEventListener("input", () => {
  sendDraftDebounced();
});

// Send message
sendBtn.onclick = () => {
  const msg = input.value.trim();
  if (!msg) return;

  socket.emit("send_message", { roomId, message: msg });

  addMessageUI(msg, true);
  input.value = "";
  remotePreview.textContent = "";
};

// Add message bubble to UI
function addMessageUI(text, isMe) {
  const el = document.createElement("div");
  el.className = "message " + (isMe ? "me" : "them");
  el.textContent = text;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Receive remote message
socket.on("new_message", msg => {
  if (msg.from === userId) return; // already added
  addMessageUI(msg.text, false);
  remotePreview.textContent = "";
});

// Remote typing updates
socket.on("remote_typing_update", ({ from, draft }) => {
  remotePreview.textContent = draft;
});

socket.on("remote_typing_status", ({ status }) => {
  typingIndicator.textContent = status === "typing" ? "typing…" : "";
});

// EMOJI PICKER LOGIC
emojiBtn.onclick = () => {
  emojiPicker.classList.toggle("hide");
};

emojiPicker.addEventListener("emoji-click", e => {
  input.value += e.detail.emoji;
  sendDraftDebounced();
  emojiPicker.classList.add("hide");
});
