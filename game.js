
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score-val');
const highScoreEl = document.getElementById('high-score-val');
const strikeSlots = document.querySelectorAll('.strike-slot');
const comboBadge = document.getElementById('combo-badge');
const comboValEl = document.getElementById('combo-val');

const overlays = {
    start: document.getElementById('start-screen'),
    gameOver: document.getElementById('game-over-screen'),
    pause: document.getElementById('pause-screen')
};


const images = {};
let assetsLoaded = 0;
const totalAssets = Object.keys(ASSETS_CONFIG).length;

function loadAssets(callback) {
    console.log("Loading assets...");
    let loadedCount = 0;
    const entries = Object.entries(ASSETS_CONFIG);
    if (entries.length === 0) return callback();

    for (const [key, path] of entries) {
        const img = new Image();
        img.src = path;
        img.onload = () => {
            console.log(`Loaded: ${key}`);
            loadedCount++;
            if (loadedCount === entries.length) callback();
        };
        img.onerror = () => {
            console.error(`Failed to load: ${key} at ${path}`);
            loadedCount++;
            if (loadedCount === entries.length) callback();
        };
        images[key] = img;
    }
}


let width, height;
let score = 0;
let highScore = localStorage.getItem('eggCatcherBest') || 0;
let gameState = 'START';
let difficulty = 1;
let spawnTimer = 0;
let lastTime = 0;
let combo = 0;
let strikeCount = 0;
let speedTime = 0; // Game time in milliseconds for speed modulation wave


let bucket = { x: 0, y: 0, w: 100, h: 100, targetX: 0 };
let chickens = [];
let fallingItems = [];
let particles = [];
let popups = [];
let splats = [];
let decoration = { clouds: [] };

const CONFIG = {
    ITEM_TYPES: {
        NORMAL: { img: 'EGG_NORMAL', pts: 1, chance: 0.75, color: '#ffffff', sound: 600 },
        GOLDEN: { img: 'EGG_GOLDEN', pts: 5, chance: 0.05, color: '#fbc531', sound: 1200, special: true },
        RAINBOW: { img: 'EGG_RAINBOW', pts: 10, chance: 0.01, color: '#ef5777', sound: 1500, glow: true },
        BROKEN: { img: 'BROKEN_EGG', pts: -1, chance: 0.19, color: '#f1c40f', sound: 150, penalty: true }
    },
    GRAVITY: 0.2,
    MAX_DIFFICULTY: 5,
    CHICKEN_COUNT: 4
};



function init() {
    setupCanvas();
    loadHighScore();
    createDecorations();
    createChickens();


    window.addEventListener('resize', setupCanvas);
    canvas.addEventListener('mousemove', (e) => updateBucketPos(e.clientX / 0.8));
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        updateBucketPos(e.touches[0].clientX / 0.8);
    }, { passive: false });

    document.getElementById('start-btn').onclick = () => {
        initAudio();
        startGame();
    };
    document.getElementById('restart-btn').onclick = () => startGame();
    document.getElementById('new-game-btn').onclick = () => {
        highScore = 0;
        localStorage.setItem('eggCatcherBest', 0);
        highScoreEl.innerText = 0;
        startGame();
    };
    document.getElementById('pause-btn').onclick = togglePause;
    document.getElementById('resume-btn').onclick = togglePause;


    loadAssets(() => {
        console.log("All assets finished loading. Starting game loop.");
        requestAnimationFrame(gameLoop);
    });
}

function setupCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    width = canvas.width / 0.8;
    height = canvas.height / 0.8;
    bucket.y = height - 50;
    bucket.x = width / 2;
    bucket.targetX = width / 2;

    const totalSpacingWidth = width * 0.6;
    const startX = (width - totalSpacingWidth) / 2;
    const spacing = totalSpacingWidth / (CONFIG.CHICKEN_COUNT - 1 || 1);
    chickens.forEach((c, i) => {
        c.baseX = startX + spacing * i;
        c.x = c.baseX;
        c.y = 90;
        c.range = spacing * 0.4;
    });
}

function loadHighScore() {
    highScoreEl.innerText = highScore;
}

function createDecorations() {

    decoration.clouds = Array.from({ length: 3 }, () => ({
        x: Math.random() * width,
        y: 50 + Math.random() * 150,
        scale: 0.8 + Math.random() * 0.7,
        speed: 0.15 + Math.random() * 0.25,
        opacity: 0.4 + Math.random() * 0.3
    }));
}

function createChickens() {
    const totalSpacingWidth = width * 0.6;
    const startX = (width - totalSpacingWidth) / 2;
    const spacing = totalSpacingWidth / (CONFIG.CHICKEN_COUNT - 1 || 1);
    chickens = Array.from({ length: CONFIG.CHICKEN_COUNT }, (_, i) => ({
        x: startX + spacing * i,
        baseX: startX + spacing * i,
        y: 90,
        phase: Math.random() * Math.PI * 2,
        wiggle: 0,
        range: spacing * 0.4,
        speed: 0.001 + Math.random() * 0.001
    }));
}



function startGame() {
    score = 5;
    difficulty = 1;
    combo = 0;
    strikeCount = 0;
    speedTime = 0;
    fallingItems = [];
    particles = [];
    popups = [];
    splats = [];
    gameState = 'PLAYING';

    updateScoreUI();
    strikeSlots.forEach(s => s.classList.remove('filled'));
    overlays.start.classList.add('hidden');
    overlays.gameOver.classList.add('hidden');
    overlays.pause.classList.add('hidden');
}

function endGame(reason = "score") {
    gameState = 'GAMEOVER';
    const title = reason === "penalty" ? "3 BROKEN EGGS" : (reason === "dropped" ? "TOO MANY MISSED" : "CRACKED UP");
    const subtitle = reason === "penalty" ? "The chicken outsmarted you." : (reason === "dropped" ? "Eggs are extremely fragile!" : "Better luck next time!");
    document.getElementById('final-score').innerText = score;
    document.getElementById('final-best').innerText = highScore;
    document.querySelector('#game-over-screen h1').innerText = title;
    const subEl = document.getElementById('game-over-subtitle');
    if (subEl) subEl.innerText = subtitle;
    overlays.gameOver.classList.remove('hidden');
}

function togglePause() {
    if (gameState === 'PLAYING') {
        gameState = 'PAUSED';
        overlays.pause.classList.remove('hidden');
    } else if (gameState === 'PAUSED') {
        gameState = 'PLAYING';
        overlays.pause.classList.add('hidden');
    }
}

function updateBucketPos(clientX) {
    if (gameState !== 'PLAYING') return;
    bucket.targetX = clientX;
}

function updateScoreUI() {
    scoreEl.innerText = score;
    highScoreEl.innerText = highScore;
    if (score > highScore) {
        highScore = score;
        highScoreEl.innerText = highScore;
        localStorage.setItem('eggCatcherBest', highScore);
    }
}

function spawnItem() {

    let chicken;
    if (Math.random() < 0.3) {
        chicken = chickens.reduce((prev, curr) =>
            Math.abs(curr.x - bucket.x) > Math.abs(prev.x - bucket.x) ? curr : prev
        );
    } else {
        chicken = chickens[Math.floor(Math.random() * chickens.length)];
    }

    const roll = Math.random();
    let typeKey = 'NORMAL';

    let cumulative = 0;
    for (const [key, val] of Object.entries(CONFIG.ITEM_TYPES)) {
        cumulative += val.chance;
        if (roll <= cumulative) {
            typeKey = key;
            break;
        }
    }

    const type = CONFIG.ITEM_TYPES[typeKey];
    const speedBonus = (typeKey !== 'BROKEN' && Math.random() > 0.8) ? 1.5 : 0;
    const spawnX = chicken.x;

    fallingItems.push({
        x: spawnX,
        y: chicken.y + 5,
        type: typeKey,
        initialX: spawnX,
        vy: 2.5 + (difficulty * 0.8) + speedBonus,
        vx: (Math.random() - 0.5) * 2,
        behavior: typeKey === 'BROKEN' ? 'SWAY' : (Math.random() > 0.5 ? 'CURVE' : 'NORMAL'),
        targetX: bucket.x,
        phase: Math.random() * Math.PI * 2,
        rotation: 0,
        rotV: (Math.random() - 0.5) * 0.2,
        isDisguised: typeKey === 'BROKEN' && score >= 50 && Math.random() < 0.6
    });

    chicken.wiggle = 20;
    playCluckSound();


    if (typeKey !== 'BROKEN' && Math.random() < 0.4) {
        setTimeout(() => {
            if (gameState !== 'PLAYING') return;

            const otherChicken = chickens[Math.floor(Math.random() * chickens.length)];
            playCluckSound();
            fallingItems.push({
                x: otherChicken.x,
                y: otherChicken.y + 5,
                initialX: otherChicken.x,
                type: 'BROKEN',
                vy: 3.0 + (difficulty * 0.8),
                vx: 0,
                behavior: 'SWAY',
                targetX: bucket.x,
                phase: Math.random() * Math.PI * 2,
                rotation: 0,
                rotV: (Math.random() - 0.5) * 0.2,
                isDisguised: score >= 50 && Math.random() < 0.6
            });
            otherChicken.wiggle = 20;
        }, 400);
    }
}

function createFX(x, y, type) {
    const color = CONFIG.ITEM_TYPES[type].color;
    for (let i = 0; i < 12; i++) {
        particles.push({
            x, y,
            vx: (Math.random() - 0.5) * 12,
            vy: (Math.random() - 0.5) * 12,
            size: 4 + Math.random() * 6,
            life: 1,
            color
        });
    }
    const pts = CONFIG.ITEM_TYPES[type].pts;
    popups.push({
        x, y: y - 40,
        text: pts > 0 ? `+${pts}` : pts,
        life: 1,
        color
    });
}

function playSound(freq, duration = 0.1) {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch (e) { }
}

function playSpecialSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const now = audioCtx.currentTime;
        [600, 800, 1000, 1200].forEach((f, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.frequency.setValueAtTime(f, now + i * 0.05);
            gain.gain.setValueAtTime(0.1, now + i * 0.05);
            gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.05 + 0.1);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now + i * 0.05);
            osc.stop(now + i * 0.05 + 0.1);
        });
    } catch (e) { }
}

let cluckSound;

function initAudio() {
    if (!cluckSound) {
        cluckSound = new Audio(ASSETS_CONFIG.SOUND_LAY);
        cluckSound.load();
    }
}

function playCluckSound() {
    if (!cluckSound) initAudio();
    try {

        if (cluckSound.paused || cluckSound.ended) {
            cluckSound.currentTime = 4.05;
            cluckSound.playbackRate = 0.8;
            cluckSound.play().catch(() => { });
        }
    } catch (e) { }
}



function update(dt) {
    if (gameState !== 'PLAYING') return;

    bucket.x += (bucket.targetX - bucket.x) * 0.5;
    difficulty = Math.min(CONFIG.MAX_DIFFICULTY, 1 + score / 50);

    spawnTimer += dt;
    const currentSpawnInterval = Math.max(500, 1500 - difficulty * 200);

    if (spawnTimer > currentSpawnInterval) {
        spawnItem();
        spawnTimer = 0;
    }

    chickens.forEach(c => {
        c.wiggle *= 0.9;
        c.x = c.baseX;
    });

    for (let i = fallingItems.length - 1; i >= 0; i--) {
        const item = fallingItems[i];
        const info = CONFIG.ITEM_TYPES[item.type];

        if (item.isDisguised && item.y > height * 0.6) {
            item.isDisguised = false;
            createFX(item.x, item.y, 'BROKEN');
        }

        item.x += item.vx;

        item.y += item.vy;
        item.vy += CONFIG.GRAVITY;
        item.rotation += item.rotV;

        const hitX = Math.abs(item.x - bucket.x) < bucket.w / 2;
        const hitY = Math.abs(item.y - bucket.y) < 40;

        if (hitX && hitY) {
            score += info.pts;
            if (!info.penalty) {
                combo++;
                if (combo >= 5) {
                    score += Math.floor(combo / 5);
                    comboBadge.classList.remove('hidden');
                    comboValEl.innerText = combo;
                }
                if (info.special) playSpecialSound();
                else playSound(info.sound + combo * 10);
            } else {
                combo = 0;
                strikeCount++;
                if (strikeSlots[strikeCount - 1]) {
                    strikeSlots[strikeCount - 1].classList.add('filled');
                }
                if (strikeCount >= 3) {
                    endGame("penalty");
                }
                document.body.classList.add('shake');
                setTimeout(() => document.body.classList.remove('shake'), 400);
                playSound(info.sound, 0.3);
            }

            createFX(item.x, item.y, item.type);
            updateScoreUI();
            fallingItems.splice(i, 1);
            continue;
        }

        if (item.y > height + 50) {
            if (!info.penalty) {
                score -= 1;
                updateScoreUI();
                if (score <= 0) {
                    endGame("dropped");
                }
                createFX(item.x, height - 20, 'BROKEN');


                splats.push({ x: item.x, life: 1 });
                if (splats.length > 15) splats.shift();

                combo = 0;
                comboBadge.classList.add('hidden');
            }
            fallingItems.splice(i, 1);
        }
    }

    decoration.clouds.forEach(c => {
        c.x += c.speed;
        if (c.x > width + 200) c.x = -200;
    });

    particles.forEach((p, i) => {
        p.x += p.vx; p.y += p.vy; p.life -= 0.03;
        if (p.life <= 0) particles.splice(i, 1);
    });
    popups.forEach((p, i) => {
        p.y -= 1.5; p.life -= 0.02;
        if (p.life <= 0) popups.splice(i, 1);
    });
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(0.8, 0.8);


    const isSunset = Math.floor(score / 100) % 2 === 1;
    const bgKey = isSunset ? 'BG_SUNSET' : 'BG_DAY';
    const bgImg = images[bgKey];
    if (bgImg) {
        ctx.drawImage(bgImg, 0, 0, width, height);
    }


    decoration.clouds.forEach(c => {
        ctx.save();
        ctx.globalAlpha = c.opacity;
        ctx.fillStyle = 'white';
        ctx.beginPath();
        const r = 30 * c.scale;
        ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
        ctx.arc(c.x + r * 0.8, c.y - r * 0.4, r * 0.8, 0, Math.PI * 2);
        ctx.arc(c.x + r * 1.6, c.y, r, 0, Math.PI * 2);
        ctx.arc(c.x + r * 0.8, c.y + r * 0.2, r * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });


    ctx.fillStyle = '#6ab04c';
    ctx.fillRect(0, height - 20, width, 20);

    splats.forEach(s => {
        ctx.save();
        ctx.translate(s.x, height - 15);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.beginPath();
        ctx.ellipse(0, 5, 25, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffde59';
        ctx.beginPath();
        ctx.ellipse(0, 5, 12, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });


    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 90);
    ctx.lineTo(width, 90);
    ctx.stroke();


    chickens.forEach(c => {
        ctx.save();

        ctx.translate(c.x, c.y);
        const img = images.HEN;
        const aspect = (img.naturalWidth && img.naturalHeight) ? (img.naturalWidth / img.naturalHeight) : 1.0;
        const h = 90 + c.wiggle;
        const w = h * aspect;
        ctx.drawImage(img, -w / 2, -h, w, h);
        ctx.restore();
    });


    fallingItems.forEach(item => {
        const info = CONFIG.ITEM_TYPES[item.type];
        let img = images[info.img];
        if (item.isDisguised) {
            img = images['EGG_NORMAL'];
        }
        ctx.save();
        ctx.translate(item.x, item.y);
        ctx.rotate(item.rotation);

        if (info.glow) { ctx.shadowBlur = 20; ctx.shadowColor = info.color; }

        const size = 50;
        if (img && img.complete && img.naturalWidth !== 0) {
            ctx.drawImage(img, -size / 2, -size / 2, size, size);
        } else {
            ctx.font = '40px serif';
            ctx.fillText('🥚', 0, 0);
        }
        ctx.restore();
    });


    ctx.save();
    ctx.translate(bucket.x, bucket.y);
    const imgBucket = images.BUCKET;
    if (imgBucket && imgBucket.complete && imgBucket.naturalHeight !== 0) {
        const bHeight = 120;
        const bWidth = bHeight * (imgBucket.naturalWidth / imgBucket.naturalHeight);
        ctx.drawImage(imgBucket, -bWidth / 2, -bHeight / 2, bWidth, bHeight);
        bucket.w = bWidth;
    } else {
        const bSize = 120;
        ctx.drawImage(imgBucket, -bSize / 2, -bSize / 2, bSize, bSize);
    }
    ctx.restore();


    particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    });


    popups.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.font = 'bold 28px Poppins';
        ctx.textAlign = 'center';
        ctx.fillText(p.text, p.x, p.y);
    });
    ctx.globalAlpha = 1;
    ctx.restore();
}

function gameLoop(time) {
    const dt = time - lastTime;
    lastTime = time;
    update(dt);
    draw();
    requestAnimationFrame(gameLoop);
}

init();
