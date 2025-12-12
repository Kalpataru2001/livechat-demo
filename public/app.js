// app.js

// 1. Initialize Socket (Do not connect yet)
const socket = io(window.location.origin, {
  transports: ["websocket"],
  autoConnect: false
});

// --- AUDIO SETUP ---
// We use a Google-hosted "Pop" sound which is reliable and allows hotlinking
const notificationSound = new Audio("https://codeskulptor-demos.commondatastorage.googleapis.com/pang/pop.mp3");

// --- DOM ELEMENTS ---
const loginScreen = document.getElementById("loginScreen");
const usernameInput = document.getElementById("usernameInput");
const roomInput = document.getElementById("roomInput");
const joinRoomBtn = document.getElementById("joinRoomBtn");

const input = document.getElementById("input");
const messagesEl = document.getElementById("messages");
const remotePreview = document.getElementById("remotePreview");
const typingIndicator = document.getElementById("typingIndicator");
const sendBtn = document.getElementById("sendBtn");
const emojiBtn = document.getElementById("emojiBtn");
const emojiPicker = document.getElementById("emojiPicker");
const chatNameEl = document.querySelector(".chat-name");

// Global Variables
let roomId = "";
let userId = "";

// --- 1. LOGIN LOGIC ---

// Check URL parameters
const urlParams = new URLSearchParams(window.location.search);
const urlRoom = urlParams.get('room');
if (urlRoom) {
  roomInput.value = urlRoom;
}

// Check LocalStorage
const savedName = localStorage.getItem("chat_username");
if (savedName) {
  usernameInput.value = savedName;
}

joinRoomBtn.onclick = () => {
  const userVal = usernameInput.value.trim();
  const roomVal = roomInput.value.trim();

  if (!userVal || !roomVal) {
    alert("Please enter Name and Room ID");
    return;
  }

  // Set Globals
  userId = userVal;
  roomId = roomVal;
  localStorage.setItem("chat_username", userId);

  // UI Updates
  chatNameEl.textContent = `Room: ${roomId}`;
  loginScreen.classList.add("hidden");

  // Update URL
  const newUrl = `${window.location.pathname}?room=${roomId}`;
  window.history.pushState({ path: newUrl }, '', newUrl);

  // Unlock Audio (Browser requirement)
  notificationSound.volume = 0.5; // Set volume to 50%
  notificationSound.play().then(() => {
    notificationSound.pause();
    notificationSound.currentTime = 0;
  }).catch((e) => { console.log("Audio unlock failed (will try again on message)", e) });

  // Connect
  socket.connect();
  socket.emit("join", { roomId, userId });
};

// --- 2. SOCKET EVENTS ---

socket.on("connect", () => {
  console.log("Connected to server");
});

// A. HISTORY
socket.on("history", (messages) => {
  messagesEl.innerHTML = "";
  messages.forEach(msg => {
    const isMe = msg.from === userId;
    // CRITICAL: We pass 6 arguments here
    addMessageUI(msg.text, isMe, msg.from, msg.ts, msg.id, msg.read);
  });
});

// B. NEW MESSAGE
socket.on("new_message", msg => {
  const isMe = msg.from === userId;
  // CRITICAL: We pass 6 arguments here
  addMessageUI(msg.text, isMe, msg.from, msg.ts, msg.id, false);
  
  if (!isMe) {
    remotePreview.textContent = "";
    // Play Sound safely
    notificationSound.currentTime = 0;
     notificationSound.play().catch(e => console.warn("Audio blocked by browser policy", e));
  }
});

// C. READ RECEIPT (Turn Tick Blue)
socket.on("message_read_ack", ({ messageId }) => {
  const tickEl = document.getElementById(`tick-${messageId}`);
  if (tickEl) {
    tickEl.classList.add("read");
  }
});

// D. TYPING
socket.on("remote_typing_update", ({ from, draft }) => {
  if (from === userId) return;
  remotePreview.textContent = `${from}: ${draft}`;
});

socket.on("remote_typing_status", ({ from, status }) => {
  if (from === userId) return;
  typingIndicator.textContent = status === "typing" ? `${from} is typing...` : "";
});


// --- 3. UI HELPERS ---

// THIS WAS THE FIX: Added 'messageId' and 'isRead' to the arguments
function addMessageUI(text, isMe, senderName, timestamp, messageId, isRead) {
  const el = document.createElement("div");
  el.className = "message " + (isMe ? "me" : "them");
  
  // Store ID in DOM
  if (messageId) el.dataset.id = messageId;

  // Format Time
  const date = new Date(timestamp || Date.now());
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Tick Logic
  const tickClass = isRead ? "tick read" : "tick";
  const tickHtml = isMe ? `<span class="${tickClass}" id="tick-${messageId}">✓✓</span>` : "";

  // HTML Structure
  el.innerHTML = `
    <div class="msg-text">${text}</div>
    <div style="display:flex; justify-content:flex-end; align-items:center; gap:5px;">
      <span class="timestamp">${timeStr}</span>
      ${tickHtml}
    </div>
  `;

  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  // TRIGGER READ RECEIPT
  // If it's NOT me, and I have a valid ID, tell server I read it
  if (!isMe && messageId) {
    socket.emit("message_read", { roomId, messageId });
  }
}

// Debounce
function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// --- 4. INPUT ---

const sendDraftDebounced = debounce(() => {
  socket.emit("typing_update", { roomId, draft: input.value });
  socket.emit("typing_status", { roomId, status: "typing" });

  clearTimeout(window.stopTimer);
  window.stopTimer = setTimeout(() => {
    socket.emit("typing_status", { roomId, status: "stopped" });
  }, 1200);
}, 120);

input.addEventListener("input", () => {
  sendDraftDebounced();
});

sendBtn.onclick = () => {
  const msg = input.value.trim();
  if (!msg) return;

  socket.emit("send_message", { roomId, message: msg });
  input.value = "";
  remotePreview.textContent = "";
};

// Emoji
emojiBtn.onclick = () => {
  emojiPicker.classList.toggle("hide");
};

emojiPicker.addEventListener("emoji-click", e => {
  input.value += e.detail.emoji;
  sendDraftDebounced();
  emojiPicker.classList.add("hide");
  input.focus();
});