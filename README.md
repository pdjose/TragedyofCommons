# 🐟 Tragedy of the Commons — Shared Sea Simulation

A multiplayer classroom simulation exploring Garrett Hardin's "Tragedy of the Commons" and Elinor Ostrom's governance principles. All players share **one ocean** and must decide how much to harvest each round.

## 🎯 Features

- **Shared Sea**: Up to 10 players (max 3 AI + humans) fish from the same ocean
- **Separate Admin Dashboard**: Facilitator has a dedicated observer page at `/admin`
- **AI Players**: Sustainable, Greedy, Copycat, Adaptive, and Cooperative strategies
- **Pedagogical Tools**: Forecast tool, harvest quotas, communication rounds, anonymity toggle
- **Real-time**: WebSocket-powered, works on any device with a browser
- **Remote Play**: Built-in public tunnel for students connecting from anywhere
- **Data Export**: CSV download of all game data for classroom analysis

## 📦 Quick Install & Run

### Prerequisites
- **Node.js** (v16 or later) — download from [nodejs.org](https://nodejs.org/)

### Windows
```
1. Double-click START_GAME.bat
```
That's it! It auto-installs dependencies on first run.

### Mac / Linux
```bash
chmod +x start_game.sh
./start_game.sh
```

### Manual Start
```bash
npm install       # First time only
npm start         # Start the server
```

## 🖥️ How to Use

| Role | URL | Description |
|------|-----|-------------|
| **Teacher** | `http://localhost:3000/admin` | Facilitator dashboard (observer, controls) |
| **Students** | `http://localhost:3000` | Player join page |

### For the Teacher:
1. Open `http://localhost:3000/admin` in your browser
2. Configure game parameters (growth rate, capacity, rounds)
3. Add AI players (up to 3) if desired
4. Click **"Launch Shared Sea 🌊"**
5. Share the **room code** and **network URL** with students
6. Click **"Start Game"** when all students have joined
7. Use **"Next Round"** / **"Force Turn"** to advance the game

### For Students:
1. Open the URL shared by the teacher
2. Enter the **room code** and their **name**
3. Click **"Join Room"**
4. Each round: choose how many fish to harvest, click **"Cast Nets"**

## 📁 Project Files

```
├── server.js        # Node.js WebSocket server (shared sea engine)
├── admin.html       # Facilitator dashboard (observer-only)
├── index.html       # Player page (join & play)
├── game.js          # Client-side game logic (shared)
├── simulation.js    # Simulation math engine
├── styles.css       # Shared CSS design system
├── package.json     # Dependencies (ws, localtunnel)
├── START_GAME.bat   # Windows one-click launcher
└── start_game.sh    # Mac/Linux launcher
```

## 🌐 Network & Remote Access

- **Same Wi-Fi**: Students connect via the network URL shown in the terminal
- **Remote/Internet**: A public tunnel URL is automatically generated (localtunnel)
- Students on localtunnel must click "Click to Continue" on first visit

## 🔧 Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| Growth Rate (r) | 0.3 | Logistic regrowth speed |
| Carrying Capacity (K) | 100 | Maximum fish population |
| Rounds | 20 | Total rounds per game |
| Max Players | 10 | Hard limit (up to 3 AI) |
| Price | $3/fish | Earnings per fish harvested |

## 📚 Learning Objectives

- Garrett Hardin's tragedy of the commons (1968)
- Elinor Ostrom's governance of shared resources
- Nash equilibrium vs. social optimum
- Maximum Sustainable Yield (MSY) and conservation
- Impact of communication, transparency, and regulation
