const crypto = require('crypto');

module.exports = {
  rooms: {},

  // Generates an unique room code
  generateRoomCode() {
    let code;
    do {
      code = crypto.randomBytes(2).toString('hex').toUpperCase();
    } while (this.rooms[code]);
    return code;
  },

  // Generates a secure admin token
  generateAdminToken() {
    return crypto.randomBytes(32).toString('hex');
  },

  // Creates a new room
  createRoom(adminSocketId, adminName) {
    const code = this.generateRoomCode();
    const adminToken = this.generateAdminToken();
    this.rooms[code] = {
      code,
      admin: {
        socketId: adminSocketId,
        name: adminName,
        token: adminToken
      },
      participants: {},
      currentRound: null,
      rounds: [],
      createdAt: Date.now(),
      status: "waiting" // waiting | voting | revealed
    };
    return { code, adminToken };
  },

  // Check if room exists
  roomExists(code) {
    return !!this.rooms[code];
  },

  // Gets a room
  getRoom(code) {
    return this.rooms[code];
  },

  // Adds a participant
  addParticipant(code, socketId, name) {
    if (!this.roomExists(code)) return false;
    
    this.rooms[code].participants[socketId] = {
      socketId,
      name,
      joinedAt: Date.now(),
      hasVoted: false
    };
    return true;
  },

  // Removes a participant
  removeParticipant(code, socketId) {
    if (!this.roomExists(code)) return false;
    delete this.rooms[code].participants[socketId];
    return true;
  },

  // Gets list of participants
  getParticipants(code) {
    if (!this.roomExists(code)) return [];
    return Object.values(this.rooms[code].participants);
  },

  // Counts participants
  getParticipantCount(code) {
    return this.getParticipants(code).length;
  },

  // Starts a new voting round
  startRound(code, templateIds, topic, timerSeconds = null) {
    if (!this.roomExists(code)) return false;

    // Support both single template and array of templates
    const templates = Array.isArray(templateIds) ? templateIds : [templateIds];

    const room = this.rooms[code];
    const roundId = room.rounds.length + 1;

    room.currentRound = {
      id: roundId,
      templateIds: templates,
      topic,
      timerSeconds,
      startedAt: Date.now(),
      votes: {}, // Will be { socketId: { templateId: vote, ... } }
      status: "voting"
    };

    room.status = "voting";

    // Reset hasVoted flag
    Object.values(room.participants).forEach(p => p.hasVoted = false);

    return room.currentRound;
  },

  // Casts a vote
  recordVote(code, socketId, templateId, vote) {
    if (!this.roomExists(code)) return false;
    
    const room = this.rooms[code];
    if (!room.currentRound || room.currentRound.status !== "voting") return false;

    // Initialize participant votes if not exists
    if (!room.currentRound.votes[socketId]) {
      room.currentRound.votes[socketId] = {};
    }

    room.currentRound.votes[socketId][templateId] = {
      value: vote,
      votedAt: Date.now()
    };

    // Check if participant voted on all templates
    const participantVotes = room.currentRound.votes[socketId];
    const votedCount = Object.keys(participantVotes).length;
    const requiredCount = room.currentRound.templateIds.length;
    
    if (room.participants[socketId]) {
      room.participants[socketId].hasVoted = votedCount >= requiredCount;
    }

    return true;
  },

  // Removes a vote
  removeVote(code, socketId, templateId) {
    if (!this.roomExists(code)) return false;
    
    const room = this.rooms[code];
    if (!room.currentRound || room.currentRound.status !== "voting") return false;
    if (!room.currentRound.votes[socketId]) return false;

    // Remove the vote for this template
    delete room.currentRound.votes[socketId][templateId];

    // If no more votes from this participant, remove the entry
    if (Object.keys(room.currentRound.votes[socketId]).length === 0) {
      delete room.currentRound.votes[socketId];
    }

    // Update hasVoted flag
    const participantVotes = room.currentRound.votes[socketId] || {};
    const votedCount = Object.keys(participantVotes).length;
    const requiredCount = room.currentRound.templateIds.length;
    
    if (room.participants[socketId]) {
      room.participants[socketId].hasVoted = votedCount >= requiredCount;
    }

    return true;
  },

  // Check if participant has voted
  hasVoted(code, socketId, templateId = null) {
    if (!this.roomExists(code)) return false;
    const room = this.rooms[code];
    if (!room.currentRound || !room.currentRound.votes[socketId]) return false;
    
    // Check specific template or all templates
    if (templateId) {
      return !!room.currentRound.votes[socketId][templateId];
    }
    
    // Check if voted on all templates
    const votedCount = Object.keys(room.currentRound.votes[socketId]).length;
    return votedCount >= room.currentRound.templateIds.length;
  },

  // Count votes
  getVoteCount(code) {
    if (!this.roomExists(code)) return 0;
    const room = this.rooms[code];
    if (!room.currentRound) return 0;
    return Object.keys(room.currentRound.votes).length;
  },

  // Reveal round results
  revealResults(code) {
    if (!this.roomExists(code)) return false;
    
    const room = this.rooms[code];
    if (!room.currentRound) return false;

    room.currentRound.status = "revealed";
    room.currentRound.revealedAt = Date.now();
    room.status = "revealed";

    return true;
  },

  // Ends a round and moves it to history
  endRound(code) {
    if (!this.roomExists(code)) return false;
    
    const room = this.rooms[code];
    if (!room.currentRound) return false;

    room.currentRound.endedAt = Date.now();
    room.rounds.push(room.currentRound);
    room.currentRound = null;
    room.status = "waiting";

    // Reset hasVoted flags
    Object.values(room.participants).forEach(p => p.hasVoted = false);

    return true;
  },

  // Gets current round statistics
  getRoundStats(code) {
    if (!this.roomExists(code)) return null;
    
    const room = this.rooms[code];
    if (!room.currentRound) return null;

    const stats = {};
    
    // Calculate stats for each template
    room.currentRound.templateIds.forEach(templateId => {
      const votes = [];
      Object.values(room.currentRound.votes).forEach(participantVotes => {
        if (participantVotes[templateId]) {
          votes.push(participantVotes[templateId]);
        }
      });

      const voteValues = votes.map(v => v.value);
      
      // Groups votes
      const distribution = {};
      voteValues.forEach(v => {
        distribution[v] = (distribution[v] || 0) + 1;
      });

      // Calculates metrics (only for numeric votes)
      const numericVotes = voteValues.filter(v => !isNaN(parseFloat(v))).map(v => parseFloat(v));
      let average = null;
      let median = null;

      if (numericVotes.length > 0) {
        average = numericVotes.reduce((a, b) => a + b, 0) / numericVotes.length;
        
        const sorted = [...numericVotes].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        median = sorted.length % 2 === 0 
          ? (sorted[mid - 1] + sorted[mid]) / 2 
          : sorted[mid];
      }

      stats[templateId] = {
        totalVotes: votes.length,
        distribution,
        average: average !== null ? Math.round(average * 10) / 10 : null,
        median
      };
    });

    // Calculate vote combinations if multiple templates
    let combinations = null;
    if (room.currentRound.templateIds.length > 1) {
      const combinationMap = {};
      
      Object.values(room.currentRound.votes).forEach(participantVotes => {
        // Only include participants who voted on all templates
        const votedTemplates = Object.keys(participantVotes);
        if (votedTemplates.length === room.currentRound.templateIds.length) {
          // Create combination key
          const combo = room.currentRound.templateIds.map(tid => {
            return participantVotes[tid] ? participantVotes[tid].value : null;
          }).join(' + ');
          
          combinationMap[combo] = (combinationMap[combo] || 0) + 1;
        }
      });

      // Sort combinations by count
      combinations = Object.entries(combinationMap)
        .map(([combo, count]) => ({ combo, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10); // Top 10 combinations
    }

    return {
      totalParticipants: Object.keys(room.participants).length,
      byTemplate: stats,
      combinations,
      votes: room.currentRound.status === "revealed" ? room.currentRound.votes : null
    };
  },

  // Checks if socket is admin
  isAdmin(code, socketId) {
    if (!this.roomExists(code)) return false;
    return this.rooms[code].admin.socketId === socketId;
  },

  // Deletes a room
  deleteRoom(code) {
    delete this.rooms[code];
  },

  // Cleanup old empty rooms (> 2 hours)
  cleanupOldRooms() {
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    const now = Date.now();

    Object.keys(this.rooms).forEach(code => {
      const room = this.rooms[code];
      const isEmpty = Object.keys(room.participants).length === 0;
      const isOld = (now - room.createdAt) > TWO_HOURS;

      if (isEmpty && isOld) {
        console.log(`Cleaning up old empty room: ${code}`);
        this.deleteRoom(code);
      }
    });
  }
};

