const socketConnection = (io, app) => {
    let users = [];
    console.log("🚀 ~ socketConnection ~ users:", users)
    
    // Make users globally available for notifications
    global.connectedUsers = users;
    global.io = io;

const addUser = (userId, socketId) => {
  userId = userId.toString(); // force string
  const existing = users.find((user) => user.userId === userId);
  if (!existing) {
    users.push({ userId, socketId });
  } else {
    users = users.map(u =>
      u.userId === userId ? { userId, socketId } : u
    );
  }
  if (app) app.set("connectedUsers", users);
  global.connectedUsers = users; // Update global reference
};

// Utility function to emit invoice updates
const emitInvoiceUpdate = (io, invoice, updateType = 'status_change') => {
  try {
    const updateData = {
      invoiceId: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      amount: invoice.totalAmount,
      amountPaid: invoice.amountPaid || 0,
      amountDue: invoice.amountDue || 0,
      property: invoice.property,
      updateType,
      timestamp: new Date().toISOString()
    };

    // Emit to seller if invoice has seller
    if (invoice.seller) {
      io.to(`seller-${invoice.seller}`).emit('invoice-update', updateData);
      console.log(`📧 Invoice update sent to seller ${invoice.seller}: ${invoice.invoiceNumber}`);
    }

    // Emit to buyer if invoice has buyer
    if (invoice.buyer) {
      io.to(`buyer-${invoice.buyer}`).emit('invoice-update', updateData);
      console.log(`📧 Invoice update sent to buyer ${invoice.buyer}: ${invoice.invoiceNumber}`);
    }

    // Emit to agent
    if (invoice.agent) {
      io.to(`agent-${invoice.agent}`).emit('invoice-update', updateData);
      console.log(`📧 Invoice update sent to agent ${invoice.agent}: ${invoice.invoiceNumber}`);
    }

  } catch (error) {
    console.error('Error emitting invoice update:', error);
  }
};

// Make emitInvoiceUpdate globally available
global.emitInvoiceUpdate = emitInvoiceUpdate;

const findUser = (userId) => {
  console.log("🚀 ~ findUser ~ userId:", userId)
  userId = userId.toString();
  return users.find((user) => user.userId === userId);
};


  const removeUser = (socketId) => {
    users = users.filter((user) => user.socketId !== socketId);
    if (app) app.set('connectedUsers', users);
    global.connectedUsers = users; // Update global reference
  };

io.on('connection', (socket) => {
  console.log(`✅ New connection: ${socket.id}`);

  // client sends their userId after connecting
  socket.on('add-user', (userId) => {
    if (userId) {
        addUser(userId, socket.id);

      socket.join(userId.toString()); // join personal room
      console.log(`User ${userId} joined room`);
    }
  });




    // Send message to receiver (buyer↔agent legacy: kebab-case)
    socket.on('send-message', (data) => {
      // data = { sender, receiver, text }
      console.log('📩 send-message:', data);

      const user = findUser(data.receiver);
      console.log('Target user:', user);

      if (user) {
        const sid = user.socketId;
        console.log("🚀 ~ socketConnection ~ sid:", sid)
        // simulate DB _id for message
        data._id = data._id || Math.random();
        console.log('Sent message ✅', data);
        io.to(sid).emit('receive-message', data);
        io.to(sid).emit('receive_message', data); // also emit snake_case for new clients
      }
    });

    // New seller↔agent alias: snake_case event, mirrors the above
    socket.on('send_message', (data) => {
      console.log('📩 send_message:', data);
      const user = findUser(data.receiver || data.receiver_id);
      if (user) {
        const sid = user.socketId;
        data._id = data._id || Math.random();
        io.to(sid).emit('receive_message', data);
        io.to(sid).emit('receive-message', data);
      }
    });

    // Handle notification acknowledgment
    socket.on('notification-received', (data) => {
      console.log('📱 Notification acknowledged:', data);
    });
    
    // Handle invoice notification events
    socket.on('join-seller-room', (sellerId) => {
      if (sellerId) {
        socket.join(`seller-${sellerId}`);
        console.log(`Seller ${sellerId} joined seller room`);
      }
    });

    // Handle buyer room joining for invoice updates
    socket.on('join-buyer-room', (buyerId) => {
      if (buyerId) {
        socket.join(`buyer-${buyerId}`);
        console.log(`Buyer ${buyerId} joined buyer room`);
      }
    });

    // Manual removal
    socket.on('remove-user', () => {
      removeUser(socket.id);
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log('❌ User disconnected');
      removeUser(socket.id);
    });
  });
};

module.exports = socketConnection;
