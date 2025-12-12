// app.js

// 1. Initialize Socket but DO NOT connect yet
const socket = io(window.location.origin, {
  transports: ["websocket"],
  autoConnect: false // <--- Waits for user to click "Start Chatting"
});

// --- DOM ELEMENTS ---

// Login Screen Elements
const loginScreen = document.getElementById("loginScreen");
const usernameInput = document.getElementById("usernameInput");
const roomInput = document.getElementById("roomInput");
const joinRoomBtn = document.getElementById("joinRoomBtn");

// Chat UI Elements
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

// --- 1. LOGIN & JOIN LOGIC ---

// A. Check URL: If friend sent link (e.g., ?room=LoveNest), pre-fill the box
const urlParams = new URLSearchParams(window.location.search);
const urlRoom = urlParams.get('room');
if (urlRoom) {
  roomInput.value = urlRoom;
}

// B. Check Storage: Remember the user's name from last time
const savedName = localStorage.getItem("chat_username");
if (savedName) {
  usernameInput.value = savedName;
}

// C. Handle "Start Chatting" Click
joinRoomBtn.onclick = () => {
  const userVal = usernameInput.value.trim();
  const roomVal = roomInput.value.trim();

  // Validation
  if (!userVal || !roomVal) {
    alert("Please enter both your Name and a Room Name.");
    return;
  }

  // Set Global Variables
  userId = userVal;
  roomId = roomVal;

  // Save name for next time
  localStorage.setItem("chat_username", userId);

  // Update UI
  chatNameEl.textContent = `Room: ${roomId}`;
  loginScreen.classList.add("hidden"); // Hide the login box

  // Update URL (so it can be copied) without reloading
  const newUrl = `${window.location.pathname}?room=${roomId}`;
  window.history.pushState({ path: newUrl }, '', newUrl);

  // D. Connect to Server
  socket.connect();
  socket.emit("join", { roomId, userId });
};


// --- 2. SOCKET EVENTS ---

socket.on("connect", () => {
  console.log("Connected to server");
});

// Receive History (Loads from Supabase)
socket.on("history", (messages) => {
  messagesEl.innerHTML = ""; // Clear any demo text
  messages.forEach(msg => {
    const isMe = msg.from === userId;
    addMessageUI(msg.text, isMe, msg.from);
  });
});

// Receive New Message
socket.on("new_message", msg => {
  const isMe = msg.from === userId;
  addMessageUI(msg.text, isMe, msg.from);
  
  // Clear typing preview if it was from the other person
  if (!isMe) remotePreview.textContent = "";
});

// Live Typing Preview
socket.on("remote_typing_update", ({ from, draft }) => {
  if (from === userId) return;
  // Show "Name: typing..."
  remotePreview.textContent = `${from}: ${draft}`;
});

// Typing Status (dots)
socket.on("remote_typing_status", ({ from, status }) => {
  if (from === userId) return;
  typingIndicator.textContent = status === "typing" ? `${from} is typing...` : "";
});


// --- 3. UI HELPERS ---

function addMessageUI(text, isMe, senderName) {
  const el = document.createElement("div");
  el.className = "message " + (isMe ? "me" : "them");
  
  // Optional: You could add the sender's name in small text if you want
  // el.setAttribute('title', senderName); 

  el.textContent = text;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight; // Auto scroll
}

// Debounce (Limits network requests while typing)
function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}


// --- 4. INPUT & SENDING ---

const sendDraftDebounced = debounce(() => {
  // Send live characters to the room
  socket.emit("typing_update", { roomId, draft: input.value });
  socket.emit("typing_status", { roomId, status: "typing" });

  // Stop typing status after 1.2 seconds of no activity
  clearTimeout(window.stopTimer);
  window.stopTimer = setTimeout(() => {
    socket.emit("typing_status", { roomId, status: "stopped" });
  }, 1200);
}, 120);

// Listen for typing
input.addEventListener("input", () => {
  sendDraftDebounced();
});

// Send Button Logic
sendBtn.onclick = () => {
  const msg = input.value.trim();
  if (!msg) return;

  socket.emit("send_message", { roomId, message: msg });
  
  input.value = "";
  remotePreview.textContent = "";
};


// --- 5. EMOJI PICKER ---

emojiBtn.onclick = () => {
  emojiPicker.classList.toggle("hide");
};

emojiPicker.addEventListener("emoji-click", e => {
  input.value += e.detail.emoji;
  sendDraftDebounced(); // Update the live preview immediately
  emojiPicker.classList.add("hide");
  input.focus();
});