// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// In production, configure CORS to restrict origins
const io = new Server(server, {
  cors: { origin: "*" }
});

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// Simple in-memory message store for demo (replace with DB in prod)
const messages = {}; // { roomId: [ { id, from, text, ts } ] }

io.on('connection', socket => {
  console.log('socket connected', socket.id);

  // join a room (1:1 or group). roomId should be validated in production
  socket.on('join', ({ roomId, userId }) => {
    if (!roomId || !userId) return;
    socket.join(roomId);
    socket.data.userId = userId;
    console.log(`${userId} joined ${roomId}`);

    // send last messages to this client (simple history)
    const history = messages[roomId] || [];
    socket.emit('history', history);
  });

  // coalesced typing update (client sends current draft text periodically)
  socket.on('typing_update', ({ roomId, draft }) => {
    if (!roomId) return;
    // sanitize length to prevent abuse
    if (typeof draft !== 'string' || draft.length > 5000) return;
    socket.to(roomId).emit('remote_typing_update', {
      from: socket.data.userId,
      draft,
      ts: Date.now()
    });
  });

  // typing status: 'typing' or 'stopped' (for indicator)
  socket.on('typing_status', ({ roomId, status }) => {
    if (!roomId) return;
    socket.to(roomId).emit('remote_typing_status', {
      from: socket.data.userId,
      status
    });
  });

  // send final message: persist and notify room
  socket.on('send_message', ({ roomId, message }) => {
    if (!roomId || typeof message !== 'string') return;
    const msg = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
      from: socket.data.userId || 'anon',
      text: message,
      ts: Date.now()
    };
    messages[roomId] = messages[roomId] || [];
    messages[roomId].push(msg);

    // emit message to everyone in the room
    io.to(roomId).emit('new_message', msg);
  });

  // read ack: mark message as read (for UI updates)
  socket.on('message_read', ({ roomId, messageId }) => {
    if (!roomId || !messageId) return;
    socket.to(roomId).emit('message_read_ack', {
      messageId,
      by: socket.data.userId,
      ts: Date.now()
    });
  });

  socket.on('disconnect', reason => {
    console.log('socket disconnected', socket.id, reason);
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
