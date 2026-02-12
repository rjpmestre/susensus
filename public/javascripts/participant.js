function participantApp() {
  return {
    socket: null,
    roomCode: '',
    name: '',
    joined: false,
    participants: [],
    participantCount: 0,
    status: 'waiting', // waiting | voting | revealed
    currentRound: null,
    templates: [],
    voteCount: 0,
    hasVoted: false,
    hasVotedAll: false,
    myVotes: {},
    stats: null,
    kicked: false,
    timerRemaining: null,
    timerInterval: null,
    participantsViewMode: localStorage.getItem('participantsViewMode') || 'cards', // cards | list
    toast: {
      show: false,
      message: '',
      type: 'success'
    },

    init() {
      this.socket = io();
      this.setupSocketListeners();
      
      // Check room code in URL
      const urlParams = new URLSearchParams(window.location.search);
      const roomCode = urlParams.get('room');
      if (roomCode) {
        this.roomCode = roomCode.toUpperCase();
      }
    },

    setupSocketListeners() {
      this.socket.on('connect', () => {
        console.log('Connected to server');
      });

      // Room updates
      this.socket.on('roomUpdate', (data) => {
        console.log('Room update:', data);
        this.participants = data.participants || [];
        this.participantCount = data.participantCount || 0;
        this.voteCount = data.voteCount || 0;
        this.status = data.status || 'waiting';
        
        // Check if current user has voted
        const me = this.participants.find(p => p.socketId === this.socket.id);
        if (me) {
          this.hasVoted = me.hasVoted;
        }
      });

      // Participant events
      this.socket.on('participantJoined', (data) => {
        this.showToast(`${data.name} entrou`, 'success');
      });

      this.socket.on('participantLeft', (data) => {
        this.showToast(`${data.name} saiu`, 'success');
      });

      // Voting events
      this.socket.on('votingStarted', (data) => {
        console.log('Voting started:', data);
        this.currentRound = data.round;
        this.templates = data.round.templates;
        this.status = 'voting';
        this.hasVoted = false;
        this.hasVotedAll = false;
        this.myVotes = {};
        this.stats = null;
        
        this.showToast('📊 Voting started!', 'success');

        // Start timer if configured
        if (data.round.timerSeconds && data.round.timerSeconds > 0) {
          this.startTimer(data.round.timerSeconds);
        }
      });

      this.socket.on('resultsRevealed', (data) => {
        console.log('Results revealed:', data);
        this.status = 'revealed';
        this.stats = data.stats;
        this.stopTimer();
        this.showToast('📊 Results revealed!', 'success');
      });

      this.socket.on('roundEnded', () => {
        console.log('Round ended');
        this.status = 'waiting';
        this.currentRound = null;
        this.templates = [];
        this.hasVoted = false;
        this.hasVotedAll = false;
        this.myVotes = {};
        this.stats = null;
        this.voteCount = 0;
        this.stopTimer();
        this.showToast('Round ended', 'success');
      });

      this.socket.on('kicked', () => {
        this.kicked = true;
        this.socket.disconnect();
      });

      this.socket.on('roomClosed', () => {
        this.showToast('The room has been closed', 'error');
        setTimeout(() => location.reload(), 2000);
      });
    },

    async joinRoom() {
      if (!this.roomCode.trim() || !this.name.trim()) {
        this.showToast('Fill in code and name', 'error');
        return;
      }

      this.socket.emit('joinRoom', {
        code: this.roomCode.trim(),
        name: this.name.trim()
      }, (response) => {
        if (response.success) {
          this.joined = true;
          this.status = response.room.status;
          this.currentRound = response.room.currentRound;
          this.showToast('Joined the room!', 'success');

          // If there's an active voting round, get template info
          if (this.currentRound) {
            this.requestTemplateInfo();
          }
        } else {
          this.showToast(response.error || 'Error joining room', 'error');
        }
      });
    },

    requestTemplateInfo() {
      // The template info should come with votingStarted event
      // This is a fallback to request templates
      this.socket.emit('getTemplates', (response) => {
        if (this.currentRound && this.currentRound.templateId) {
          this.template = response.templates.find(t => t.id === this.currentRound.templateId);
        }
      });
    },

    vote(templateId, value) {
      this.socket.emit('vote', { templateId, vote: value }, (response) => {
        if (response.success) {
          if (response.removed) {
            // Vote was removed
            delete this.myVotes[templateId];
            this.showToast('❌ Vote removed!', 'success');
          } else {
            // Vote was recorded or changed
            this.myVotes[templateId] = value;
            const message = response.changed ? '🔄 Vote changed!' : '✅ Vote recorded!';
            this.showToast(message, 'success');
          }
          
          // Check if voted on all templates
          const votedCount = Object.keys(this.myVotes).length;
          const requiredCount = this.templates.length;
          this.hasVotedAll = votedCount >= requiredCount;
        } else {
          this.showToast(response.error || 'Error voting', 'error');
        }
      });
    },

    startTimer(seconds) {
      this.stopTimer();
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

    getTemplateName(templateId) {
      const template = this.templates.find(t => t.id === templateId);
      return template ? template.name : templateId;
    },

    getTemplateShortName(templateId) {
      const template = this.templates.find(t => t.id === templateId);
      if (!template) return templateId;
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

    showToast(message, type = 'success') {
      this.toast.message = message;
      this.toast.type = type;
      this.toast.show = true;

      setTimeout(() => {
        this.toast.show = false;
      }, 3000);
    },

    toggleParticipantsView() {
      this.participantsViewMode = this.participantsViewMode === 'cards' ? 'list' : 'cards';
      localStorage.setItem('participantsViewMode', this.participantsViewMode);
    }
  };
}
