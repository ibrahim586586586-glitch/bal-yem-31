// --- HTML Elementleri ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const roomIdDisplay = document.getElementById('room-id');

// --- Canvas Boyutlandırma ---
canvas.width = 800;
canvas.height = 500;

// --- Varlık Yöneticisi ---
const assets = {
    playerSprite: { src: 'https://i.imgur.com/kNU22hE.png', img: new Image() },
    background: { src: 'https://i.imgur.com/S1r5I4P.png', img: new Image() },
    obstacleSprite: { src: 'https://i.imgur.com/sS5hH6M.png', img: new Image() },
    jumpSound: { src: 'https://storage.googleapis.com/codescreens/game-assets/jump.wav', audio: new Audio() },
    gameOverSound: { src: 'https://storage.googleapis.com/codescreens/game-assets/game-over.wav', audio: new Audio() }
};

let assetsLoaded = 0;
function loadAssets() {
    const assetKeys = Object.keys(assets);
    assetKeys.forEach(key => {
        if (assets[key].img) {
            assets[key].img.src = assets[key].src;
            assets[key].img.onload = () => assetLoaded();
        } else if (assets[key].audio) {
            assets[key].audio.src = assets[key].src;
            assets[key].audio.addEventListener('canplaythrough', () => assetLoaded(), { once: true });
        }
    });
}
function assetLoaded() {
    assetsLoaded++;
    if (assetsLoaded === Object.keys(assets).length) {
        console.log("Tüm varlıklar yüklendi. Oyun hazır.");
        connectWebSocket();
    }
}

// --- Oyun Durumu ---
let player = {};
let otherPlayers = {};
let obstacles = [];
let roomId = null;
let gameOver = false;
let winner = null;
let backgroundX = 0;

const gravity = 0.7;
const groundHeight = 50;
const gameSpeed = 5;

// --- WebSocket İletişimi ---
let ws;
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
        const urlParams = new URLSearchParams(window.location.search);
        const joinRoomId = urlParams.get('room');
        if (joinRoomId) {
            ws.send(JSON.stringify({ type: 'joinRoom', roomId: joinRoomId }));
        } else {
            ws.send(JSON.stringify({ type: 'createRoom' }));
        }
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        switch (data.type) {
            case 'roomCreated':
                roomId = data.roomId; player.id = data.playerId;
                roomIdDisplay.textContent = `Oda Kodu: ${roomId} - Linki Kopyala!`;
                window.history.pushState({}, '', `?room=${roomId}`);
                break;
            case 'joinedRoom':
                roomId = data.roomId; player.id = data.playerId;
                roomIdDisplay.textContent = `Odaya Katıldın: ${roomId}`;
                break;
            case 'gameState':
                otherPlayers = data.players;
                delete otherPlayers[player.id];
                if (data.players[player.id]) {
                    Object.assign(player, data.players[player.id]);
                    if (!player.initialized) initializePlayer();
                }
                obstacles = data.obstacles;
                break;
            case 'gameOver':
                gameOver = true;
                winner = data.winner;
                assets.gameOverSound.play();
                break;
            case 'error':
                alert(data.message);
                break;
        }
    };
}


// --- Oyun Mantığı ---
function initializePlayer() {
    player.width = 50; player.height = 70;
    player.speedY = 0; player.jumpPower = 16;
    player.isJumping = false; player.initialized = true;
}

const touchState = {
    touchStartX: 0,
    touchStartY: 0,
    touching: false,
    horizontalMove: 0 // -1 sol, 0 dur, 1 sağ
};

function updatePlayerPosition() {
    if (!player.initialized || gameOver) return;

    // Yatay hareketi dokunmatik girdiye göre ayarla
    player.x += touchState.horizontalMove * 6; // Hızı biraz artırdım

    player.speedY += gravity;
    player.y += player.speedY;

    if (player.y >= canvas.height - groundHeight - player.height) {
        player.y = canvas.height - groundHeight - player.height;
        player.speedY = 0;
        player.isJumping = false;
    }

    if (player.x < 0) player.x = 0;
    if (player.x + player.width > canvas.width) player.x = canvas.width - player.width;

    checkCollisions();

    ws.send(JSON.stringify({ type: 'playerUpdate', x: player.x, y: player.y }));
}

function checkCollisions() {
    obstacles.forEach(obs => {
        if (
            player.x < obs.x + obs.width &&
            player.x + player.width > obs.x &&
            player.y < obs.y + obs.height &&
            player.y + player.height > obs.y
        ) {
            gameOver = true;
            ws.send(JSON.stringify({ type: 'playerDied' }));
        }
    });
}

// --- Çizim ---
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    backgroundX = (backgroundX + gameSpeed / 5) % assets.background.img.width;
    ctx.drawImage(assets.background.img, -backgroundX, 0, canvas.width, canvas.height);
    ctx.drawImage(assets.background.img, canvas.width - backgroundX, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#6B8E23';
    ctx.fillRect(0, canvas.height - groundHeight, canvas.width, groundHeight);

    if (player.initialized) {
        ctx.drawImage(assets.playerSprite.img, player.x, player.y, player.width, player.height);
    }
    Object.values(otherPlayers).forEach(p => {
        ctx.drawImage(assets.playerSprite.img, p.x, p.y, 50, 70);
    });
    obstacles.forEach(obs => {
        ctx.drawImage(assets.obstacleSprite.img, obs.x, obs.y, obs.width, obs.height);
    });

    if (gameOver) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white';
        ctx.font = '50px Arial';
        ctx.textAlign = 'center';
        const winnerText = (winner === player.id) ? "Kazandın!" : "Kaybettin!";
        ctx.fillText(winnerText, canvas.width / 2, canvas.height / 2);
    }

    requestAnimationFrame(draw);
}

// --- KAYDIRMALI KONTROLLER ---
function jump() {
    if (player.initialized && !player.isJumping) {
        player.isJumping = true;
        player.speedY = -player.jumpPower;
        assets.jumpSound.play();
    }
}

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    touchState.touching = true;
    touchState.touchStartX = e.touches[0].clientX;
    touchState.touchStartY = e.touches[0].clientY;
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!touchState.touching) return;
    const touchCurrentX = e.touches[0].clientX;
    const deltaX = touchCurrentX - touchState.touchStartX;

    if (deltaX > 10) { // Sağa kaydırma
        touchState.horizontalMove = 1;
    } else if (deltaX < -10) { // Sola kaydırma
        touchState.horizontalMove = -1;
    } else {
        touchState.horizontalMove = 0;
    }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    const touchEndY = e.changedTouches[0].clientY;
    const deltaY = touchState.touchStartY - touchEndY;

    // Zıplama için yukarı kaydırma
    if (deltaY > 50) {
        jump();
    }

    touchState.touching = false;
    touchState.horizontalMove = 0;
});


// --- Oyunu Başlat ---
loadAssets();
draw();
