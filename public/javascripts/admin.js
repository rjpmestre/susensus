function adminApp() {
  return {
    socket: null,
    adminName: '',
    roomCode: null,
    participants: [],
    templates: [],
    selectedTemplates: [],
    topic: '',
    timerSeconds: 0,
    timerRemaining: null,
    timerInterval: null,
    status: 'waiting', // waiting | voting | revealed
    currentRound: null,
    voteCount: 0,
    stats: null,
    detailedVotes: {},
    showDetailedVotes: localStorage.getItem('showDetailedVotes') === 'true' || false,
    participantsViewMode: localStorage.getItem('participantsViewMode') || 'cards', // cards | list
    initialized: false,
    toast: {
      show: false,
      message: '',
      type: 'success'
    },

    init() {
      // Prevent double initialization
      if (this.initialized) {
        console.log('Already initialized, skipping');
        return;
      }
      this.initialized = true;
      
      this.socket = io();
      
      // Check if room code is in URL
      const urlParams = new URLSearchParams(window.location.search);
      const roomCode = urlParams.get('room');
      
      this.socket.on('connect', () => {
        console.log('Connected to server');
        
        if (roomCode) {
          // Rejoin existing room
          this.rejoinRoom(roomCode);
        } else {
          // Auto-create new room
          this.createRoom();
        }
      });
      
      this.setupSocketListeners();
    },

    setupSocketListeners() {
      // Room updates
      this.socket.on('roomUpdate', (data) => {
        console.log('Room update:', data);
        this.participants = data.participants || [];
        this.voteCount = data.voteCount || 0;
        this.status = data.status || 'waiting';
      });

      // Participant events
      this.socket.on('participantJoined', (data) => {
        this.showToast(`${data.name} joined the room`, 'success');
      });

      this.socket.on('participantLeft', (data) => {
        this.showToast(`${data.name} left the room`, 'success');
      });

      // Voting events
      this.socket.on('votingStarted', (data) => {
        console.log('Voting started:', data);
        this.currentRound = data.round;
        this.status = 'voting';
        this.stats = null;
        this.detailedVotes = {};
        
        // Start timer if configured
        if (data.round.timerSeconds && data.round.timerSeconds > 0) {
          this.startTimer(data.round.timerSeconds);
        }
      });

      this.socket.on('resultsRevealed', (data) => {
        console.log('Results revealed:', data);
        this.status = 'revealed';
        this.stats = data.stats;
        
        // Process votes to include participant names
        this.detailedVotes = {};
        if (data.votes) {
          Object.entries(data.votes).forEach(([socketId, voteData]) => {
            // Check if voteData has a name property (from backend) or find in participants
            const name = voteData.name || 
                        this.participants.find(p => p.socketId === socketId)?.name || 
                        'Unknown';
            
            // Extract just the vote values (exclude the name property)
            const votes = {};
            Object.entries(voteData).forEach(([key, value]) => {
              if (key !== 'name') {
                votes[key] = value;
              }
            });
            
            // Only add if there are actual votes
            if (Object.keys(votes).length > 0) {
              this.detailedVotes[socketId] = {
                name: name,
                votes: votes
              };
            }
          });
        }
        
        this.stopTimer();
      });

      this.socket.on('roundEnded', () => {
        console.log('Round ended');
        this.status = 'waiting';
        this.currentRound = null;
        this.stats = null;
        this.detailedVotes = {};
        this.voteCount = 0;
        // Keep the topic, selectedTemplates and timerSeconds from last round
        this.stopTimer();
      });

      this.socket.on('roomClosed', () => {
        this.showToast('The room has been closed', 'error');
        setTimeout(() => location.reload(), 2000);
      });
    },

    async createRoom() {
      this.socket.emit('createRoom', 'Admin', (response) => {
        if (response.success) {
          this.roomCode = response.code;
          // Store admin token in localStorage
          localStorage.setItem(`admin_token_${response.code}`, response.adminToken);
          this.loadTemplates();
          this.showToast('Room created successfully!', 'success');
          // Update URL to include room code so refresh works
          window.history.pushState({}, '', `/admin.html?room=${response.code}`);
        } else {
          this.showToast(response.error || 'Error creating room', 'error');
        }
      });
    },

    rejoinRoom(code) {
      const adminToken = localStorage.getItem(`admin_token_${code}`);
      
      if (!adminToken) {
        this.showToast('No access to this room', 'error');
        window.history.replaceState({}, document.title, '/admin.html');
        this.createRoom();
        return;
      }
      
      this.socket.emit('rejoinRoom', { roomCode: code, adminToken }, (response) => {
        if (response.success) {
          this.roomCode = response.code;
          this.participants = response.participants || [];
          this.voteCount = response.voteCount || 0;
          this.status = response.status || 'waiting';
          this.loadTemplates();
          this.showToast('Reconnected to room', 'success');
        } else {
          this.showToast(response.error || 'Error joining room', 'error');
          // Clear URL parameter and create new room
          window.history.replaceState({}, document.title, '/admin.html');
          this.createRoom();
        }
      });
    },

    loadTemplates() {
      this.socket.emit('getTemplates', (response) => {
        this.templates = response.templates;
      });
    },

    async startVoting() {
      if (this.selectedTemplates.length === 0 || !this.topic.trim()) {
        this.showToast('Select at least one template and topic', 'error');
        return;
      }

      if (this.participants.length === 0) {
        this.showToast('Wait for participants to join', 'error');
        return;
      }

      const timerValue = this.timerSeconds > 0 ? this.timerSeconds : null;

      this.socket.emit('startVoting', {
        templateIds: this.selectedTemplates,
        topic: this.topic.trim(),
        timerSeconds: timerValue
      }, (response) => {
        if (response.success) {
          this.showToast('Voting started!', 'success');
        } else {
          this.showToast(response.error || 'Error starting voting', 'error');
        }
      });
    },

    revealResults() {
      this.socket.emit('revealResults', (response) => {
        if (!response.success) {
          this.showToast(response.error || 'Error revealing results', 'error');
        }
      });
    },

    endRound() {
      this.socket.emit('endRound', (response) => {
        if (response.success) {
          this.showToast('Round ended', 'success');
        } else {
          this.showToast(response.error || 'Error ending round', 'error');
        }
      });
    },

    kickParticipant(socketId) {
      const participant = this.participants.find(p => p.socketId === socketId);
      const confirmMsg = `Kick ${participant?.name}?`;
      
      if (!confirm(confirmMsg)) return;

      this.socket.emit('kickParticipant', socketId, (response) => {
        if (response.success) {
          this.showToast('Participant kicked', 'success');
        } else {
          this.showToast(response.error || 'Error kicking participant', 'error');
        }
      });
    },

    startTimer(seconds) {
      this.stopTimer(); // Clear any existing timer
      this.timerRemaining = seconds;
      
      this.timerInterval = setInterval(() => {
        this.timerRemaining--;
        
        if (this.timerRemaining <= 0) {
          this.timerRemaining = 0;
          this.stopTimer();
          this.playBeep();
          this.showToast('⏰ Time\'s up!', 'error');
        }
      }, 1000);
    },

    stopTimer() {
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
      this.timerRemaining = null;
    },

    playBeep() {
      // Simple beep usando Web Audio API
      try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
      } catch (e) {
        console.error('Could not play beep:', e);
      }
    },

    formatTime(seconds) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    },

    getVoteProgressEmoji() {
      const percentage = this.participants.length > 0 
        ? (this.voteCount / this.participants.length) * 100 
        : 0;
      
      if (percentage === 0) return '⏳';
      if (percentage < 50) return '🔴';
      if (percentage < 70) return '🟡';
      if (percentage < 100) return '🟢';
      return '✅';
    },

    getTemplateName(templateId) {
      const template = this.templates.find(t => t.id === templateId);
      return template ? template.name : templateId;
    },

    getTemplateShortName(templateId) {
      const template = this.templates.find(t => t.id === templateId);
      if (!template) return templateId;
      // Return first word or short version
      return template.name.split(' ')[0];
    },

    formatVoteValue(templateId, value) {
      const template = this.templates.find(t => t.id === templateId);
      if (!template) return value;
      
      // For categorical templates, try to find the label with icon
      if (template.type === 'categorical' && Array.isArray(template.options)) {
        const option = template.options.find(opt => 
          (typeof opt === 'object' && opt.value === value) || opt === value
        );
        if (option && typeof option === 'object' && option.label) {
          return option.label;
        }
      }
      
      return value;
    },

    formatCombination(comboString) {
      if (!this.currentRound || !comboString) return comboString;
      
      const values = comboString.split(' + ');
      const templateIds = this.currentRound.templateIds;
      
      const formattedParts = values.map((value, index) => {
        const templateId = templateIds[index];
        if (!templateId) return value;
        return this.formatVoteValue(templateId, value);
      });
      
      return formattedParts.join(' + ');
    },

    copyRoomCode() {
      if (!this.roomCode) return;
      
      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(this.roomCode).then(() => {
          this.showToast('Code copied!', 'success');
        }).catch(() => {
          this.fallbackCopyRoomCode();
        });
      } else {
        // Fallback for insecure contexts or older browsers
        this.fallbackCopyRoomCode();
      }
    },

    fallbackCopyRoomCode() {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = this.roomCode;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        
        if (successful) {
          this.showToast('Code copied!', 'success');
        } else {
          this.showToast('Copy failed - code: ' + this.roomCode, 'error');
        }
      } catch (err) {
        this.showToast('Copy failed - code: ' + this.roomCode, 'error');
      }
    },

    showToast(message, type = 'success') {
      this.toast.message = message;
      this.toast.type = type;
      this.toast.show = true;

      setTimeout(() => {
        this.toast.show = false;
      }, 3000);
    },

    toggleDetailedVotes() {
      this.showDetailedVotes = !this.showDetailedVotes;
      localStorage.setItem('showDetailedVotes', this.showDetailedVotes);
    },

    toggleParticipantsView() {
      this.participantsViewMode = this.participantsViewMode === 'cards' ? 'list' : 'cards';
      localStorage.setItem('participantsViewMode', this.participantsViewMode);
    }
  };
}
