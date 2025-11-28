# <img src="public/images/geeko-color.svg" alt="SUSE" height="40"> Susensus

**Simultaneous Real-Time Voting Tool**
Everyone votes at once, results revealed together. Ideal for Planning Poker, Health Checks, Retrospectives and more.

---

## Features

- **Simultaneous Voting**: Everyone votes at the same time without influencing each other
- **Multiple Rooms**: Support for multiple simultaneous sessions
- **Pre-defined Voting Templates**: Fibonacci, 1-5/1-10 scales, traffic light, trends, yes/no, t-shirt sizes, MoSCoW prioritization, starfish retrospectives
- **Multiple Questions**: Vote on multiple templates in a single round 
- **Optional Timer**: Set time limit with sound alert (client-side controlled)
- **Progress Visibility**: Everyone sees who has voted during the round
- **Statistics**: Average, distribution and results visualization
- **No Persistence**: In-memory state, ie, ephemeral sessions

---

## Use Cases

### Planning Poker

1. Template: **Fibonacci**
2. Topic: "Estimate complexity of task #123"
3. Team votes simultaneously
4. Results reveal consensus or need for discussion

### Health Check

1. Template: **Traffic Light** and **Trend**
2. Topic: "How fun is it working together?"
3. Quick visualization of general status

### Retrospective

1. Template: **Trend**
2. Topic: "The team velocity is..."
3. Identifies perceptions about evolution

---

## Requirements

- Node.js (v14+)
- npm or yarn

---

## How to Use

### Admin

1. Access main page
2. Click on `Create Room`
4. Share the room code with participants
5. Wait for participants to join
6. Enter the voting topic
7. Choose one or more templates (Fibonacci, 1-5, Traffic Light, etc)
8. (Optional) Set a timer in seconds
9. Start the voting
10. When ready, reveal the results
12. End the round to start a new one

### Participant

1. Access main page
2. Click on `Join Room`
3. Enter the room code and your name
4. Click `Join`
5. Wait for admin to start the voting round
6. Vote (you can change your vote before reveal)
7. See the results when admin reveals them

---

## Available Templates

| Template | Description | Options |
|----------|-----------|--------|
| **Fibonacci** | Classic Planning Poker | 0, 0.5, 1, 2, 3, 5, 8, 13, 20, 40, 100, ?, ☕ |
| **Scale 1-5** | Simple assessment | 1, 2, 3, 4, 5 |
| **Scale 1-10** | Detailed assessment | 1 to 10 |
| **Traffic Light** | Visual status | 🟢 Green, 🟡 Yellow, 🔴 Red |
| **Trend** | Temporal evolution | ↗️ Improving, ➡️ Stable, ↘️ Worsening |
| **Yes/No** | Binary decision | 👍 Yes, 👎 No |
| **T-Shirt Sizes** | Size estimation | XS, S, M, L, XL, XXL |
| **MoSCoW Priority** | Prioritization method | Must have, Should have, Could have, Won't have |
| **Starfish** | Retrospective feedback | ▶️ Start doing, ⬆️ More of, ⭐ Keep doing, ⬇️ Less of, ⛔ Stop doing |

---

## Installation

```bash
# Clone the repository
git clone <repo>
cd susensus

# Install dependencies
npm install

# Start the server
npm start
```

The server will be available at: **http://localhost:3000**

---

## Configuration

### Server Port

By default, the server runs on port **3000**. To change:

```bash
PORT=8080 npm start
```

Or edit `bin/www`:

```javascript
var port = normalizePort(process.env.PORT || '3000');
```

### Room Cleanup

Empty rooms older than 2 hours are automatically removed. Can be adjusted in `utils/rooms.js`:

```javascript
cleanupOldRooms() {
    const TWO_HOURS = 2 * 60 * 60 * 1000; // Change here
    ...
}
```

---
## Deploy

### Traditional

1. Set up Node.js on the server
2. Clone the repository
3. Install dependencies: `npm install`
4. Configure `PORT` environment variable if needed
5. Use PM2 or similar to keep the process alive:

```bash
npm install -g pm2
pm2 start bin/www --name susensus
pm2 save
pm2 startup
```

### Docker

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

Build and run:

```bash
docker build -t susensus .
docker run -d --name susensus-app -p 3000:3000 susensus

```

## Socket.IO API Events 

### Admin Events (Emitted by Admin)

| Event | Parameters | Description |
|--------|-----------|-------------|
| `createRoom` | `adminName` | Creates new room |
| `startVoting` | `{templateId, topic, timerSeconds}` | Starts voting round |
| `revealResults` | - | Reveals the results |
| `endRound` | - | Ends current round |
| `kickParticipant` | `socketId` | Kicks participant |
| `getTemplates` | - | Gets list of templates |

### Participant Events (Emitted by Participants)

| Event | Parameters | Description |
|--------|-----------|-------------|
| `joinRoom` | `{code, name}` | Join a room |
| `vote` | `{templateId, vote}` | Submit a vote |

### Broadcast Events (Server → Clients)

| Event | Description |
|--------|-------------|
| `roomUpdate` | Room state update |
| `participantJoined` | New participant joined |
| `participantLeft` | Participant left |
| `votingStarted` | Voting started |
| `resultsRevealed` | Results revealed |
| `roundEnded` | Round ended |
| `kicked` | Participant was kicked |
| `roomClosed` | Room closed |

---

## Considerations

- **In-Memory State**: Restarting the server loses all active rooms
- **No Persistent History**: No information is persisted

---

## Contributing

Pull requests are welcome! For major changes, please open an issue first.

---

## Contacts and Links
- **GitHub:** [rjpmestre](https://github.com/rjpmestre)
- **Email:** [ricardo.mestre@suse.com](mailto:ricardo.mestre@suse.com)
- Developed as part of [SUSE Hack Week 25](https://hackweek.opensuse.org/25/projects/susensus)


