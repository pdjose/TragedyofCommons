// Tragedy of the Commons — WebSocket Server (Shared Sea Edition)
// All players fish from the SAME ocean. Max 10 players (up to 3 AI).
// Run: node server.js

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const os = require('os');
let localtunnel;
try { localtunnel = require('localtunnel'); } catch (e) { localtunnel = null; }

const PORT = process.env.PORT || 3000;
const isCloudHosted = !!process.env.PORT;
let publicTunnelUrl = null;

const MAX_PLAYERS = 10;
const MAX_AI = 3;

// ── Single Global Game State ───────────────────────────────────────
let game = null; // The ONE game (shared sea)

function createGame(cfg, ais, adminWs) {
    const code = String(1000 + Math.floor(Math.random() * 9000));
    game = {
        code,
        admin: adminWs,
        cfg,
        ais: ais.slice(0, MAX_AI), // enforce max 3 AI
        players: [],      // human players (ws connections)
        allP: [],          // all participants (humans + AI) — populated at game start
        state: null,
        pendingHarvests: {},
        expectedHumans: 0,
        started: false,
        roundTimer: null,
        waitingForNext: false,
        prevGames: []
    };
    return game;
}

// Get LAN IPs
function getNetworkIPs() {
    const ips = [];
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                ips.push(net.address);
            }
        }
    }
    return ips;
}

// Simple HTTP server to serve static files + API
const server = http.createServer((req, res) => {
    // API endpoint for server info
    if (req.url === '/api/info') {
        const ips = getNetworkIPs();
        let urls = ips.map(ip => 'http://' + ip + ':' + PORT);
        let tunnelUrl = publicTunnelUrl || null;
        const info = { port: PORT, ips: ips, urls: urls, tunnel: tunnelUrl };
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(info));
        return;
    }

    // CSV export endpoint
    if (req.url.startsWith('/api/export/')) {
        const code = req.url.split('/api/export/')[1];
        if (!game || game.code !== code) { res.writeHead(404); res.end('Game not found'); return; }
        let csv = 'Round,Population,' + game.allP.map(p => p.name + ' Harvest,' + p.name + ' Earnings').join(',') + '\n';
        const maxRounds = game.allP[0].harvests.length;
        for (let r = 0; r < maxRounds; r++) {
            const pop = game.state.hist[r] || 0;
            csv += (r + 1) + ',' + pop;
            game.allP.forEach(p => {
                const h = p.harvests[r] || 0;
                const cumEarn = p.harvests.slice(0, r + 1).reduce((a, b) => a + b, 0) * game.cfg.PRICE;
                csv += ',' + h + ',' + cumEarn;
            });
            csv += '\n';
        }
        csv += 'Final,' + Math.round(game.state.pop);
        game.allP.forEach(p => csv += ',,' + p.earn);
        csv += '\n';
        res.writeHead(200, { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="game_data_' + code + '.csv"' });
        res.end(csv);
        return;
    }

    let rawPath = req.url.split('?')[0];

    // Admin route — serves dedicated facilitator dashboard
    if (rawPath === '/admin' || rawPath === '/admin/') {
        fs.readFile(path.join(__dirname, 'admin.html'), (err, data) => {
            if (err) { res.writeHead(500); res.end('Server error'); return; }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
        return;
    }

    let filePath = rawPath === '/' ? '/index.html' : rawPath;
    filePath = path.join(__dirname, filePath);
    const ext = path.extname(filePath);
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
    const contentType = types[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

// WebSocket server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    ws.role = null;
    ws.pid = null;

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }

        switch (msg.type) {
            case 'create-room': {
                // Create the single global game (or replace existing)
                const ais = (msg.ais || []).slice(0, MAX_AI);
                createGame(msg.cfg, ais, ws);
                ws.role = 'admin';
                ws.send(JSON.stringify({ type: 'room-created', code: game.code }));
                break;
            }

            case 'join': {
                if (!game) { ws.send(JSON.stringify({ type: 'error', msg: 'No game exists. Ask the host to create one.' })); return; }
                if (game.code !== msg.code) { ws.send(JSON.stringify({ type: 'error', msg: 'Invalid room code' })); return; }
                if (game.started) { ws.send(JSON.stringify({ type: 'error', msg: 'Game already started' })); return; }
                const totalHumans = game.players.length;
                const maxHumans = MAX_PLAYERS - game.ais.length;
                if (totalHumans >= maxHumans) { ws.send(JSON.stringify({ type: 'error', msg: 'Game is full (' + MAX_PLAYERS + ' players max, ' + maxHumans + ' human slots)' })); return; }
                
                const pid = 'h' + game.players.length;
                const player = { id: pid, name: msg.name, human: true, ws };
                game.players.push(player);
                game.expectedHumans++;
                ws.role = 'player';
                ws.pid = pid;
                ws.send(JSON.stringify({ type: 'joined', pid }));
                // Notify admin
                game.admin.send(JSON.stringify({
                    type: 'player-joined',
                    pid,
                    name: msg.name,
                    count: game.players.length,
                    maxHumans: maxHumans
                }));
                break;
            }

            case 'start-game': {
                if (!game || ws.role !== 'admin') return;
                beginGame(game);
                break;
            }

            case 'reset-room': {
                if (!game || ws.role !== 'admin') return;
                if (game.roundTimer) { clearTimeout(game.roundTimer); game.roundTimer = null; }
                beginGame(game);
                break;
            }

            case 'force-advance': {
                if (!game || ws.role !== 'admin') return;
                if (game.started && !game.state.over && !game.waitingForNext) {
                    if (game.roundTimer) { clearTimeout(game.roundTimer); game.roundTimer = null; }
                    game.players.forEach(p => {
                        if (game.pendingHarvests[p.id] === undefined) {
                            game.pendingHarvests[p.id] = 0;
                        }
                    });
                    resolveRound(game);
                }
                break;
            }

            case 'harvest': {
                if (!game || ws.role !== 'player') return;
                let harvestAmt = msg.amount;
                // Enforce quota if enabled
                if (game.cfg.QUOTA && game.cfg.QUOTA_VAL > 0) {
                    harvestAmt = Math.min(harvestAmt, game.cfg.QUOTA_VAL);
                }
                game.pendingHarvests[ws.pid] = harvestAmt;
                const count = Object.keys(game.pendingHarvests).length;
                // Notify admin of progress
                game.admin.send(JSON.stringify({ type: 'harvest-progress', count, total: game.expectedHumans }));
                // If all harvests received, resolve round
                if (count >= game.expectedHumans) {
                    if (game.roundTimer) { clearTimeout(game.roundTimer); game.roundTimer = null; }
                    resolveRound(game);
                }
                break;
            }

            case 'next-round': {
                if (!game || ws.role !== 'admin') return;
                if (game.waitingForNext && !game.state.over) {
                    game.waitingForNext = false;
                    if (game.roundTimer) { clearTimeout(game.roundTimer); game.roundTimer = null; }
                    startRound(game);
                }
                break;
            }

            case 'change-ai-strat': {
                if (!game || ws.role !== 'admin') return;
                const aiPlayer = game.allP.find(p => p.id === msg.aiId);
                if (aiPlayer && !aiPlayer.human) {
                    aiPlayer.strat = msg.strat;
                }
                break;
            }

            case 'chat-msg': {
                if (!game) return;
                broadcastToGame(game, { type: 'chat-msg', from: ws.pid || 'admin', name: msg.name, text: msg.text });
                break;
            }

            case 'replay-game': {
                if (!game || ws.role !== 'admin') return;
                if (!game.cfg.REPLAY) return;
                // Store previous game results
                if (!game.prevGames) game.prevGames = [];
                game.prevGames.push({
                    hist: game.state.hist.slice(),
                    players: game.allP.map(p => ({ name: p.name, earn: p.earn, harvests: p.harvests.slice() }))
                });
                // Reset player earnings and harvests
                game.allP.forEach(p => { p.earn = 0; p.last = 0; p.harvests = []; });
                const startPop = Math.round(game.cfg.K * 0.8);
                game.state = { rnd: 1, pop: startPop, hist: [startPop], over: false, dead: false, avgH: 5 };
                game.pendingHarvests = {};
                game.waitingForNext = false;
                const gameNum = (game.prevGames ? game.prevGames.length : 0) + 1;
                const playerInfo = game.allP.map(p => ({ id: p.id, name: p.name, emoji: p.emoji, color: p.color, human: p.human }));
                broadcastToGame(game, { type: 'game-started', cfg: game.cfg, players: playerInfo, gameNum });
                startRound(game);
                break;
            }

            case 'update-config': {
                if (!game || ws.role !== 'admin') return;
                if (msg.key && msg.value !== undefined) {
                    game.cfg[msg.key] = msg.value;
                    broadcastToGame(game, { type: 'config-update', key: msg.key, value: msg.value });
                }
                break;
            }
        }
    });

    ws.on('close', () => {
        if (ws.role === 'admin' && game) {
            // Notify players admin disconnected
            broadcastToGame(game, { type: 'error', msg: 'Host disconnected' });
            game = null;
        }
    });
});

function broadcastToGame(g, msg) {
    const data = JSON.stringify(msg);
    g.players.forEach(p => {
        if (p.ws.readyState === 1) p.ws.send(data);
    });
    if (g.admin && g.admin.readyState === 1) g.admin.send(data);
}

function beginGame(g) {
    g.started = true;
    g.pendingHarvests = {};
    g.waitingForNext = false;
    const colors = ['#38bdf8', '#4ade80', '#fbbf24', '#f87171', '#a78bfa', '#fb923c', '#2dd4bf', '#e879f9', '#818cf8', '#34d399'];
    g.allP = [];
    g.players.forEach((p, i) => {
        g.allP.push({ id: p.id, name: p.name, emoji: '🧑', color: colors[i % colors.length], human: true, strat: 'Human', earn: 0, last: 0, harvests: [] });
    });
    g.ais.forEach((a, i) => {
        g.allP.push({ id: 'a' + i, name: a.name, emoji: a.emoji, color: a.color || colors[(g.players.length + i) % colors.length], human: false, strat: a.strat, earn: 0, last: 0, harvests: [] });
    });
    // Start at 80% of K so there is immediate regrowth (at K, regrowth = 0)
    const startPop = Math.round(g.cfg.K * 0.8);
    g.state = { rnd: 1, pop: startPop, hist: [startPop], over: false, dead: false, avgH: 5 };
    const playerInfo = g.allP.map(p => ({ id: p.id, name: p.name, emoji: p.emoji, color: p.color, human: p.human }));
    broadcastToGame(g, { type: 'game-started', cfg: g.cfg, players: playerInfo, totalPlayers: g.allP.length, sharedSea: true });
    startRound(g);
}

function startRound(g) {
    g.pendingHarvests = {};
    g.waitingForNext = false;
    const timerSec = g.cfg.TIMER || 0;
    const msg = { type: 'round-start', rnd: g.state.rnd, pop: Math.round(g.state.pop), timer: timerSec, totalPlayers: g.allP.length };
    broadcastToGame(g, msg);
    if (timerSec > 0) {
        g.roundTimer = setTimeout(() => {
            g.roundTimer = null;
            g.players.forEach(p => {
                if (g.pendingHarvests[p.id] === undefined) {
                    g.pendingHarvests[p.id] = 0;
                }
            });
            resolveRound(g);
        }, timerSec * 1000);
    }
}

function aiH(v, state, cfg, n) {
    const pop = state.pop, rg = cfg.R * pop * (1 - pop / cfg.K), fs = Math.max(0, rg / n);
    switch (v.strat) {
        case 'Sustainable': {
            const minFloor = (n * 1 > rg && rg > 0) ? 0 : 1;
            return Math.max(minFloor, Math.min(Math.round(fs), Math.floor(pop / n)));
        }
        case 'Greedy': return Math.min(Math.floor(pop * 0.12), Math.round(cfg.K * 0.08) + Math.floor(Math.random() * 3));
        case 'Copycat': return state.rnd === 1 ? Math.max(1, Math.round(fs)) : Math.round(state.avgH);
        case 'Adaptive': { const r = pop / cfg.K; if (r > 0.6) return Math.min(Math.round(fs * 1.3), Math.round(cfg.K * 0.1)); if (r > 0.3) return Math.max(1, Math.round(fs)); return Math.max(0, Math.round(fs * 0.5)); }
        case 'Cooperative': {
            const minFloor = (n * 1 > rg && rg > 0) ? 0 : 1;
            return Math.max(minFloor, Math.floor(fs * 0.8));
        }
        default: return 0;
    }
}

function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function resolveRound(g) {
    const S = g.state, cfg = g.cfg;
    const harvests = []; let tot = 0, hSum = 0, hCnt = 0;

    // Randomize processing order to eliminate harvest-order bias
    const processOrder = shuffleArray(g.allP);
    processOrder.forEach(p => {
        let h;
        if (p.human) {
            h = Math.min(g.pendingHarvests[p.id] || 0, Math.max(0, Math.floor(S.pop - tot)));
        } else {
            h = Math.min(aiH(p, S, cfg, g.allP.length), Math.max(0, Math.floor(S.pop - tot)));
        }
        p.last = h; p.earn += h * cfg.PRICE; p.harvests.push(h); tot += h;
        if (p.human) { hSum += h; hCnt++; }
        harvests.push({ id: p.id, name: p.name, emoji: p.emoji, h });
    });

    S.avgH = hCnt > 0 ? hSum / hCnt : 5;
    S.pop = Math.max(0, S.pop - tot);
    let rg = 0;
    const CRIT = Math.max(5, Math.round(cfg.K * 0.1));
    if (S.pop > CRIT) { rg = cfg.R * S.pop * (1 - S.pop / cfg.K); S.pop = Math.min(cfg.K, S.pop + rg); }
    else if (S.pop > 0) { rg = S.pop * 0.05; S.pop += rg; }
    S.pop = Math.round(S.pop * 100) / 100;
    S.hist.push(Math.round(S.pop));
    if (S.pop < 1) { S.pop = 0; S.dead = true; }

    const prevRnd = S.rnd;
    S.rnd++;
    if (S.rnd > cfg.MR || S.dead) S.over = true;

    broadcastToGame(g, {
        type: 'round-result',
        harvests, pop: Math.round(S.pop), rnd: S.rnd,
        hist: S.hist, dead: S.dead, over: S.over,
        total: tot, regrowth: Math.round(rg), prevRnd,
        totalPlayers: g.allP.length
    });

    if (S.over) {
        const finalPlayers = g.allP.map(p => ({
            id: p.id, name: p.name, emoji: p.emoji, color: p.color,
            human: p.human, strat: p.strat, earn: p.earn, last: p.last, harvests: p.harvests
        }));
        broadcastToGame(g, { type: 'game-over', dead: S.dead, pop: S.pop, hist: S.hist, finalPlayers });
        // Don't delete game so admin can replay/export
    } else {
        g.waitingForNext = true;
        const timerSec = g.cfg.TIMER || 0;
        if (timerSec > 0) {
            g.roundTimer = setTimeout(() => {
                g.roundTimer = null;
                if (g.waitingForNext) {
                    g.waitingForNext = false;
                    startRound(g);
                }
            }, Math.min(timerSec * 1000, 8000));
        }
    }
}

server.listen(PORT, async () => {
    console.log('\n🐟 Tragedy of the Commons Server (Shared Sea Edition)');
    console.log('=====================================================');
    console.log(`   Max Players: ${MAX_PLAYERS} (up to ${MAX_AI} AI)`);
    console.log(`\n📋 TEACHER (Admin Dashboard):`);
    console.log(`   Local:   http://localhost:${PORT}/admin`);
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                console.log(`   Network: http://${net.address}:${PORT}/admin`);
            }
        }
    }
    console.log(`\n🎮 STUDENTS (Player Join):`);
    console.log(`   Local:   http://localhost:${PORT}`);
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                console.log(`   Network: http://${net.address}:${PORT}`);
            }
        }
    }

    if (localtunnel && !isCloudHosted) {
        console.log('\nSetting up public internet tunnel (localtunnel)...');
        try {
            const tunnel = await localtunnel({ port: PORT });
            publicTunnelUrl = tunnel.url;
            console.log(`\n🌍 PUBLIC URLs:`);
            console.log(`   Students: ${tunnel.url}`);
            console.log(`   Teacher:  ${tunnel.url}/admin`);
            console.log('\nShare the Student URL with students to play from ANYWHERE.');
            console.log('NOTE: Players must click "Click to Continue" on the first visit.');

            tunnel.on('close', () => {
                console.log('Public tunnel closed.');
            });
        } catch (e) {
            console.log('Failed to start public tunnel:', e.message);
        }
    } else {
        console.log('\nShare the Network STUDENT URL with students on the same Wi-Fi.');
    }

    console.log('\nPress Ctrl+C to stop the server.\n');
});
