const rooms = require('./rooms');
const templates = require('./templates');

module.exports = (io) => {
  // Track pending room deletions for admin reconnection grace period
  const pendingDeletions = new Map();
  
  // Cleanup old rooms every hour
  setInterval(() => {
    rooms.cleanupOldRooms();
  }, 60 * 60 * 1000);

  io.on("connection", (socket) => {
    console.log("New client connected:", socket.id);

    // ========== ADMIN EVENTS ==========

    // Admin creates room
    socket.on("createRoom", (adminName, callback) => {
      try {
        const { code, adminToken } = rooms.createRoom(socket.id, adminName);
        socket.join(code);
        socket.data.roomCode = code;
        socket.data.isAdmin = true;
        socket.data.name = adminName;

        console.log(`Admin ${adminName} created room ${code}`);
        
        callback({ success: true, code, adminToken });
      } catch (error) {
        console.error("Error creating room:", error);
        callback({ success: false, error: error.message });
      }
    });

    // Admin rejoins existing room
    socket.on("rejoinRoom", ({ roomCode, adminToken }, callback) => {
      try {
        if (!rooms.roomExists(roomCode)) {
          return callback({ success: false, error: "Room not found" });
        }

        const room = rooms.getRoom(roomCode);
        
        // Validate admin token
        if (room.admin.token !== adminToken) {
          console.log(`Invalid admin token for room ${roomCode}`);
          return callback({ success: false, error: "Unauthorized" });
        }

        // Cancel pending deletion if exists
        if (pendingDeletions.has(roomCode)) {
          clearTimeout(pendingDeletions.get(roomCode));
          pendingDeletions.delete(roomCode);
          console.log(`Cancelled pending deletion for room ${roomCode}`);
        }

        // Transfer admin to new socket
        room.admin.socketId = socket.id;
        
        socket.join(roomCode);
        socket.data.roomCode = roomCode;
        socket.data.isAdmin = true;
        socket.data.name = 'Admin';

        console.log(`Admin rejoined room ${roomCode}`);
        
        // Send current room state
        const participants = rooms.getParticipants(roomCode);
        const voteCount = rooms.getVoteCount(roomCode);
        
        callback({ 
          success: true, 
          code: roomCode,
          participants,
          voteCount,
          status: room.status
        });
        
        broadcastRoomUpdate(roomCode);
      } catch (error) {
        console.error("Error rejoining room:", error);
        callback({ success: false, error: error.message });
      }
    });

    // Admin starts a round 
    socket.on("startVoting", ({ templateIds, topic, timerSeconds }, callback) => {
      const code = socket.data.roomCode;
      
      if (!code || !rooms.isAdmin(code, socket.id)) {
        return callback({ success: false, error: "Not authorized" });
      }

      // Support both single and multiple templates
      const ids = Array.isArray(templateIds) ? templateIds : [templateIds];
      
      // Validate all templates
      const templateData = [];
      for (const id of ids) {
        const template = templates.getTemplate(id);
        if (!template) {
          return callback({ success: false, error: `Invalid template: ${id}` });
        }
        templateData.push(template);
      }

      const round = rooms.startRound(code, ids, topic, timerSeconds);
      
      // Notify everyone in the room
      io.to(code).emit("votingStarted", {
        round: {
          id: round.id,
          templateIds: round.templateIds,
          topic: round.topic,
          timerSeconds: round.timerSeconds,
          templates: templateData
        }
      });

      console.log(`Voting started in room ${code}: ${topic}`);
      callback({ success: true });
    });

    // Admin reveals results
    socket.on("revealResults", (callback) => {
      const code = socket.data.roomCode;
      
      if (!code || !rooms.isAdmin(code, socket.id)) {
        return callback({ success: false, error: "Not authorized" });
      }

      rooms.revealResults(code);
      const stats = rooms.getRoundStats(code);
      const room = rooms.getRoom(code);
      const participants = rooms.getParticipants(code);

      // Map votes with participant names
      const votesWithNames = {};
      if (room.currentRound && room.currentRound.votes) {
        Object.entries(room.currentRound.votes).forEach(([socketId, voteData]) => {
          const participant = participants.find(p => p.socketId === socketId);
          votesWithNames[socketId] = {
            ...voteData,
            name: participant ? participant.name : "Desconhecido"
          };
        });
      }

      io.to(code).emit("resultsRevealed", {
        stats,
        votes: votesWithNames
      });

      console.log(`Results revealed in room ${code}`);
      callback({ success: true, stats });
    });

    // Admin ends round
    socket.on("endRound", (callback) => {
      const code = socket.data.roomCode;
      
      if (!code || !rooms.isAdmin(code, socket.id)) {
        return callback({ success: false, error: "Not authorized" });
      }

      rooms.endRound(code);
      
      io.to(code).emit("roundEnded");
      broadcastRoomUpdate(code);

      console.log(`Round ended in room ${code}`);
      callback({ success: true });
    });

    // Admin kicks participant
    socket.on("kickParticipant", (participantSocketId, callback) => {
      const code = socket.data.roomCode;
      
      if (!code || !rooms.isAdmin(code, socket.id)) {
        return callback({ success: false, error: "Not authorized" });
      }

      const participant = rooms.getParticipants(code).find(p => p.socketId === participantSocketId);
      
      rooms.removeParticipant(code, participantSocketId);
      
      // Notify the kicked participant
      io.to(participantSocketId).emit("kicked");
      
      // Forces participant disconnection
      const participantSocket = io.sockets.sockets.get(participantSocketId);
      if (participantSocket) {
        participantSocket.leave(code);
        participantSocket.data.roomCode = null;
      }

      broadcastRoomUpdate(code);

      console.log(`Participant ${participant?.name} kicked from room ${code}`);
      callback({ success: true });
    });

    // Admin requests template list
    socket.on("getTemplates", (callback) => {
      callback({ templates: templates.getAllTemplates() });
    });

    // ========== PARTICIPANT EVENTS ==========

    // Participant joins the room
    socket.on("joinRoom", ({ code, name }, callback) => {
      code = code.toUpperCase().trim();

      if (!rooms.roomExists(code)) {
        return callback({ success: false, error: "Room not found" });
      }

      if (!name || name.trim().length === 0) {
        return callback({ success: false, error: "Name is required" });
      }

      socket.join(code);
      socket.data.roomCode = code;
      socket.data.name = name.trim();
      socket.data.isAdmin = false;

      rooms.addParticipant(code, socket.id, name.trim());

      const room = rooms.getRoom(code);
      
      // Notify everyone about new participant
      io.to(code).emit("participantJoined", {
        socketId: socket.id,
        name: name.trim()
      });

      broadcastRoomUpdate(code);

      console.log(`${name} joined room ${code}`);
      
      // If joining during active voting, send the voting round details
      if (room.currentRound && room.currentRound.status === 'voting') {
        const roundTemplates = room.currentRound.templateIds.map(tid => 
          templates.getTemplate(tid)
        ).filter(Boolean);
        
        socket.emit('votingStarted', {
          round: {
            ...room.currentRound,
            templates: roundTemplates
          }
        });
      }
      
      callback({ 
        success: true, 
        room: {
          code,
          status: room.status,
          currentRound: room.currentRound
        }
      });
    });

    // User casts a vote
    socket.on("vote", ({ templateId, vote }, callback) => {
      const code = socket.data.roomCode;
      
      if (!code) {
        return callback({ success: false, error: "Not in a room" });
      }

      const room = rooms.getRoom(code);
      if (!room.currentRound || room.currentRound.status !== "voting") {
        return callback({ success: false, error: "No active voting" });
      }

      // Check if template is part of current round
      if (!room.currentRound.templateIds.includes(templateId)) {
        return callback({ success: false, error: "Invalid template for this round" });
      }

      // Check if clicking on the same vote (unvote)
      const currentVote = room.currentRound.votes[socket.id]?.[templateId];
      if (currentVote && currentVote.value === vote) {
        // Remove the vote
        rooms.removeVote(code, socket.id, templateId);
        broadcastRoomUpdate(code);
        console.log(`${socket.data.name} removed vote for ${templateId} in room ${code}`);
        return callback({ success: true, removed: true });
      }

      // Validate casted vote
      if (!templates.validateVote(templateId, vote)) {
        return callback({ success: false, error: "Invalid vote" });
      }

      const wasVoted = rooms.hasVoted(code, socket.id, templateId);
      rooms.recordVote(code, socket.id, templateId, vote);

      // Notify admin about progress
      broadcastRoomUpdate(code);

      const action = wasVoted ? "changed vote" : "voted";
      console.log(`${socket.data.name} ${action} for ${templateId} in room ${code}`);
      callback({ success: true, changed: wasVoted });
    });

    // ========== DISCONNECT ==========

    socket.on("disconnect", () => {
      const code = socket.data.roomCode;
      
      if (code && rooms.roomExists(code)) {
        if (socket.data.isAdmin) {
          // Admin left, schedule room deletion with grace period for reconnection
          console.log(`Admin disconnected from room ${code}, grace period started`);
          
          const deletionTimeout = setTimeout(() => {
            if (rooms.roomExists(code)) {
              io.to(code).emit("roomClosed");
              rooms.deleteRoom(code);
              pendingDeletions.delete(code);
              console.log(`Room ${code} closed after grace period`);
            }
          }, 10000); // 10 second grace period
          
          pendingDeletions.set(code, deletionTimeout);
        } else {
          // Participant left
          rooms.removeParticipant(code, socket.id);
          io.to(code).emit("participantLeft", {
            socketId: socket.id,
            name: socket.data.name
          });
          broadcastRoomUpdate(code);
          console.log(`${socket.data.name} left room ${code}`);
        }
      }

      console.log("Client disconnected:", socket.id);
    });

    // ========== HELPER FUNCTIONS ==========

    function broadcastRoomUpdate(code) {
      const room = rooms.getRoom(code);
      if (!room) return;

      const participants = rooms.getParticipants(code);
      const voteCount = rooms.getVoteCount(code);

      io.to(code).emit("roomUpdate", {
        participants,
        participantCount: participants.length,
        voteCount,
        status: room.status,
        currentRound: room.currentRound ? {
          id: room.currentRound.id,
          topic: room.currentRound.topic,
          status: room.currentRound.status
        } : null
      });
    }
  });
};

