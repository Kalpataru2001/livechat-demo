// server.js
require('dotenv').config(); // Load environment variables
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// --- 1. SETUP DATABASE CONNECTION ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const app = express();
const server = http.createServer(app);

// Configure Socket.io with CORS (Cross-Origin Resource Sharing)
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_ORIGIN || "*" }
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', socket => {
  console.log('socket connected', socket.id);

  // --- 2. JOIN ROOM & LOAD HISTORY ---
  socket.on('join', async ({ roomId, userId }) => {
    if (!roomId || !userId) return;
    
    socket.join(roomId);
    socket.data.userId = userId;
    
    console.log(`${userId} joined ${roomId}`);

    // Fetch last 50 messages from Supabase
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true }) // Oldest first
      .limit(50);

    if (error) {
      console.error('Error fetching history:', error);
      return;
    }

    // Convert DB format to UI format
    const history = data.map(msg => ({
      id: msg.id,
      from: msg.user_id,
      text: msg.content,
      ts: new Date(msg.created_at).getTime(),
      read: msg.is_read // Critical: pass read status so old ticks show blue
    }));

    // Send history only to the person who joined
    socket.emit('history', history);
  });

  // --- 3. LIVE TYPING (In-Memory) ---
  socket.on('typing_update', ({ roomId, draft }) => {
    if (!roomId) return;
    socket.to(roomId).emit('remote_typing_update', {
      from: socket.data.userId,
      draft,
      ts: Date.now()
    });
  });

  socket.on('typing_status', ({ roomId, status }) => {
    if (!roomId) return;
    socket.to(roomId).emit('remote_typing_status', {
      from: socket.data.userId,
      status
    });
  });

  // --- 4. SEND MESSAGE & SAVE TO DB ---
  socket.on('send_message', async ({ roomId, message }) => {
    if (!roomId || typeof message !== 'string') return;

    // A. Insert into Supabase
    const { data, error } = await supabase
      .from('messages')
      .insert([
        { 
          room_id: roomId, 
          user_id: socket.data.userId, 
          content: message 
        }
      ])
      .select(); // Return the saved row (needed for ID and Timestamp)

    if (error) {
      console.error('Error saving message:', error);
      return; 
    }

    // B. Send to everyone in the room
    const savedMsg = data[0];
    const msgPayload = {
      id: savedMsg.id,
      from: socket.data.userId,
      text: message,
      ts: new Date(savedMsg.created_at).getTime(),
      read: false // New messages start unread
    };

    io.to(roomId).emit('new_message', msgPayload);
  });

  // --- 5. READ RECEIPTS (Mark as Read) ---
  socket.on('message_read', async ({ roomId, messageId }) => {
    // Validation: We need roomId to know where to send the ACK
    if (!roomId || !messageId) return;

    // A. Update Supabase (Persistent storage)
    const { error } = await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('id', messageId);
    
    if (error) {
      console.error("Error updating read status:", error);
      return;
    }

    // B. Notify the sender (Real-time update)
    // We send to everyone else in the room (which includes the sender)
    socket.to(roomId).emit('message_read_ack', {
      messageId,
      by: socket.data.userId,
      ts: Date.now()
    });
  });

  socket.on('disconnect', () => {
    console.log('socket disconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});