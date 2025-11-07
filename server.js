const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const wss = new WebSocket.Server({ port: 8080 });

const rooms = {};

console.log("WebSocket sunucusu (Oda ve Engellerle) 8080 portunda başlatıldı...");

function broadcastRoomState(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    // Engelleri güncelle
    updateObstacles(room);

    const gameState = {
        type: 'gameState',
        players: room.players,
        obstacles: room.obstacles
    };

    // Oyuncuların ws nesnesini göndermeden temiz bir kopya oluştur
    const cleanPlayers = {};
    for (const id in room.players) {
        const p = room.players[id];
        cleanPlayers[id] = { id: p.id, x: p.x, y: p.y, color: p.color, score: p.score, gameOver: p.gameOver };
    }
    gameState.players = cleanPlayers;

    const message = JSON.stringify(gameState);
    Object.values(room.players).forEach(player => {
        if (player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(message);
        }
    });
}

function updateObstacles(room) {
    room.obstacleTimer++;
    if (room.obstacleTimer % room.obstacleInterval === 0) {
        const obstacleHeight = Math.random() * 60 + 40;
        room.obstacles.push({
            id: uuidv4(),
            x: 1000, // Başlangıç X pozisyonu (canvas genişliğinden büyük)
            y: 500 - 50 - obstacleHeight, // Zemin - yükseklik
            width: 35,
            height: obstacleHeight
        });
    }

    for (let i = room.obstacles.length - 1; i >= 0; i--) {
        const obs = room.obstacles[i];
        obs.x -= room.gameSpeed;
        if (obs.x + obs.width < 0) {
            room.obstacles.splice(i, 1);
        }
    }
}


wss.on('connection', ws => {
    const playerId = uuidv4();
    ws.playerId = playerId;

    ws.on('message', message => {
        const data = JSON.parse(message);
        const player = rooms[ws.roomId]?.players[playerId];

        switch (data.type) {
            case 'createRoom':
                const roomId = uuidv4().substring(0, 6);
                ws.roomId = roomId;
                rooms[roomId] = {
                    id: roomId,
                    players: {},
                    obstacles: [],
                    obstacleTimer: 0,
                    obstacleInterval: 100,
                    gameSpeed: 5,
                    gameOver: false
                };
                rooms[roomId].players[playerId] = { ws, id: playerId, x: 50, y: 300, score: 0, gameOver: false, color: `hsl(${Math.random() * 360}, 100%, 50%)` };
                ws.send(JSON.stringify({ type: 'roomCreated', roomId, playerId }));
                break;

            case 'joinRoom':
                if (rooms[data.roomId] && Object.keys(rooms[data.roomId].players).length < 2) {
                    ws.roomId = data.roomId;
                    rooms[data.roomId].players[playerId] = { ws, id: playerId, x: 100, y: 300, score: 0, gameOver: false, color: `hsl(${Math.random() * 360}, 100%, 50%)` };
                    ws.send(JSON.stringify({ type: 'joinedRoom', roomId: data.roomId, playerId }));
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: 'Oda dolu veya bulunamadı.' }));
                }
                break;

            case 'playerUpdate':
                if (player) {
                    player.x = data.x;
                    player.y = data.y;
                }
                break;

            case 'playerDied':
                if (player) {
                    player.gameOver = true;
                    // Diğer oyuncuyu kazanan yap
                    const room = rooms[ws.roomId];
                    if(room && Object.keys(room.players).length === 2) {
                        const otherPlayerId = Object.keys(room.players).find(id => id !== playerId);
                        if(otherPlayerId) {
                            ws.send(JSON.stringify({ type: 'gameOver', winner: otherPlayerId }));
                        }
                    }
                }
                break;
        }
    });

    ws.on('close', () => {
        const roomId = ws.roomId;
        if (roomId && rooms[roomId]) {
            delete rooms[roomId].players[playerId];
            if (Object.keys(rooms[roomId].players).length === 0) {
                delete rooms[roomId];
            }
        }
    });
});

setInterval(() => {
    for (const roomId in rooms) {
        broadcastRoomState(roomId);
    }
}, 1000 / 60);
