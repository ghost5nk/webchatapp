const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Route handling
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/chat.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// User connection management
let waitingUser = null;
let onlineUsers = 0;

// Socket.io logic
io.on('connection', (socket) => {
  console.log('New connection:', socket.id);
  onlineUsers++;
  io.emit('updateOnlineCount', onlineUsers); // Broadcast online user count

  // Handle user matching logic
  if (waitingUser) {
    const partner = waitingUser;
    waitingUser = null;

    // Create a room for the two users
    const room = `room-${socket.id}-${partner}`;
    socket.join(room);
    io.sockets.sockets.get(partner)?.join(room);

    socket.room = room;
    io.sockets.sockets.get(partner).room = room;

    socket.emit('status', 'You are connected to a stranger.');
    io.sockets.sockets.get(partner).emit('status', 'You are connected to a stranger.');

    console.log(`Room created: ${room}`);
  } else {
    waitingUser = socket.id;
    socket.emit('status', 'Searching for a stranger...');
  }

  // Handle sending messages
  socket.on('sendMessage', (message) => {
    if (socket.room) {
      socket.to(socket.room).emit('receiveMessage', message);
    }
  });

  // Typing indicator logic
  socket.on('typing', (isTyping) => {
    if (socket.room) {
      socket.to(socket.room).emit('typing', isTyping);
    }
  });

  // Handle skipping the chat
  socket.on('skipChat', () => {
    if (socket.room) {
      const partner = [...io.sockets.adapter.rooms.get(socket.room)].find(
        (id) => id !== socket.id
      );
      if (partner) {
        io.sockets.sockets.get(partner)?.emit('status', 'Your partner has left.');
        io.sockets.sockets.get(partner)?.leave(socket.room);
        waitingUser = partner; // Return partner to the waiting list
      }
      socket.leave(socket.room);
    }

    socket.room = null;

    // Re-match logic after skipping
    if (!waitingUser) {
      waitingUser = socket.id;
      socket.emit('status', 'Searching for a stranger...');
    } else {
      const partner = waitingUser;
      waitingUser = null;

      const room = `room-${socket.id}-${partner}`;
      socket.join(room);
      io.sockets.sockets.get(partner)?.join(room);

      socket.room = room;
      io.sockets.sockets.get(partner).room = room;

      socket.emit('status', 'You are connected to a stranger.');
      io.sockets.sockets.get(partner).emit('status', 'You are connected to a stranger.');
    }
  });

  // Handle user disconnecting
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    onlineUsers--;
    io.emit('updateOnlineCount', onlineUsers); // Broadcast updated count

    // Handle cleanup when user disconnects
    if (socket.room) {
      const partner = [...io.sockets.adapter.rooms.get(socket.room)].find(
        (id) => id !== socket.id
      );
      if (partner) {
        io.sockets.sockets.get(partner)?.emit('status', 'Your partner has disconnected.');
        io.sockets.sockets.get(partner)?.leave(socket.room);
        waitingUser = partner; // Return partner to waiting list
      }
    } else if (waitingUser === socket.id) {
      waitingUser = null;
    }
  });
});

server.listen(8080, () => {
  console.log('Server is running on http://localhost:8080');
});
