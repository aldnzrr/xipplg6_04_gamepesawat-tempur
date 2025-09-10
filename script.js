const stars = [];
// ===== Utility & State =====
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const hudScore = document.getElementById('score');
const hudLives = document.getElementById('lives');
const hudLevel = document.getElementById('level');

const startScreen = document.getElementById('startScreen');
const settingsModal = document.getElementById('settingsModal');
const leaderboardModal = document.getElementById('leaderboardModal');
const gameOverModal = document.getElementById('gameOverModal');
const missionsModal = document.getElementById('missionsModal');
const gameHud = document.getElementById('gameHud');

const btnPlay = document.getElementById('btnPlay');
const btnOpenSettings = document.getElementById('btnOpenSettings');
const btnBoard = document.getElementById('btnBoard');
const btnPause = document.getElementById('btnPause');
const btnMissions = document.getElementById('btnMissions');

const difficultySel = document.getElementById('difficulty');
const soundToggle = document.getElementById('soundToggle');
const saveSettingsBtn = document.getElementById('saveSettings');
const closeSettingsBtn = document.getElementById('closeSettings');

const leaderboardTable = document.querySelector('#leaderboardTable tbody');
const closeBoardBtn = document.getElementById('closeBoard');

const finalScoreEl = document.getElementById('finalScore');
const playerNameInput = document.getElementById('playerName');
const saveScoreBtn = document.getElementById('saveScore');
const restartBtn = document.getElementById('restart');

const closeMissionsBtn = document.getElementById('closeMissions');

const STORAGE_KEYS = {
  settings: 'planeGame.settings.v1',
  board: 'planeGame.leaderboard.v1'
};

const defaultSettings = { difficulty: 'normal', sound: true };
let settings = loadSettings();

function loadSettings(){
  try{
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    return raw ? JSON.parse(raw) : {...defaultSettings};
  }catch{ return {...defaultSettings}; }
}
function saveSettings(){
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
}

// Resize canvas to device pixels
function resize(){
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0); // keep drawing in CSS pixels
  initStars(); // Inisialisasi bintang saat resize
}
const ro = new ResizeObserver(resize); ro.observe(document.getElementById('wrap'));

// ===== Game Objects =====
const keys = new Set();
window.addEventListener('keydown', (e)=>{ if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ' ,'w','a','s','d','W','A','S','D','p','P'].includes(e.key)) e.preventDefault(); keys.add(e.key); });
window.addEventListener('keyup', (e)=>{ keys.delete(e.key); });

const rand = (min,max)=> Math.random()*(max-min)+min;

let gameState = 'menu'; // menu | playing | paused | over
let score = 0, lives = 3, level = 1, time = 0;
let lastSpawnTime = 0; // Untuk mengontrol spawn musuh

const player = { x: 200, y: 500, w: 36, h: 40, speed: 8, cooldown: 0 }
const bullets = []; // {x,y,w,h,vy}
const enemies = []; // {x,y,w,h,vx,vy,hp}
const particles = []; // explosion particles
const powerups = []; // {x,y,w,h,type,vy} - type: 'triple', 'doubleScore', 'wipeout', 'life'
let powerupActive = null;
let powerupTimer = 0;
let enemyKillCount = 0; // Menghitung jumlah musuh yang dibunuh

// ===== Power-up Types =====
const POWERUP_TYPES = {
  TRIPLE: 'triple',
  DOUBLE_SCORE: 'doubleScore', 
  WIPEOUT: 'wipeout',
  LIFE: 'life' 
};

// ===== Reset Game =====
function resetGame(){
  score = 0; lives = 3; level = 1; time = 0; 
  bullets.length=0; enemies.length=0; particles.length=0; powerups.length=0;
  player.x = canvas.clientWidth/2 - player.w/2; player.y = canvas.clientHeight-100; 
  player.cooldown=0;
  powerupActive = null;
  powerupTimer = 0;
  enemyKillCount = 0;
  lastSpawnTime = 0;
  updateHUD();
}

// ===== Spawn Power-up =====
function spawnPowerup(x, y) {
  // 60% triple shot, 20% double score, 10% wipeout, 10% life
  const types = [
    POWERUP_TYPES.TRIPLE, POWERUP_TYPES.TRIPLE, POWERUP_TYPES.TRIPLE,
    POWERUP_TYPES.TRIPLE, POWERUP_TYPES.TRIPLE, POWERUP_TYPES.TRIPLE,
    POWERUP_TYPES.DOUBLE_SCORE, POWERUP_TYPES.DOUBLE_SCORE,
    POWERUP_TYPES.WIPEOUT,
    POWERUP_TYPES.LIFE // 10% chance untuk nyawa
  ];
  
  const randomType = types[Math.floor(Math.random() * types.length)];
  
  powerups.push({
    x: x,
    y: y,
    w: 20,
    h: 20,
    type: randomType,
    vy: 2
  });
}

// ===== Apply Power-up =====
function applyPowerup(type) {
  switch(type) {
    case POWERUP_TYPES.TRIPLE:
      powerupActive = type;
      powerupTimer = 300; // 5 detik (60 fps * 5)
      break;
    case POWERUP_TYPES.DOUBLE_SCORE:
      powerupActive = type;
      powerupTimer = 300;
      break;
    case POWERUP_TYPES.WIPEOUT:
      // Hapus semua musuh dan dapatkan score
      enemies.forEach(enemy => {
        explode(enemy.x + enemy.w/2, enemy.y + enemy.h/2);
        score += 10;
      });
      enemies.length = 0;
      break;
    case POWERUP_TYPES.LIFE:
      // Tambah nyawa
      lives = Math.min(lives + 1, 5); // Maksimal 5 nyawa
      updateHUD();
      // Power-up life langsung habis, tidak perlu timer
      break;
  }
}

// ===== Modified Shoot Function =====
function shoot(){
  const now = performance.now();
  if(now - player.cooldown < difficultyParams().shootDelay) return;
  player.cooldown = now;
  
  if (powerupActive === POWERUP_TYPES.TRIPLE) {
    // Triple shot
    bullets.push({ x: player.x + player.w/2 - 2, y: player.y - 10, w: 4, h: 10, vy: -8 });
    bullets.push({ x: player.x + player.w/2 - 8, y: player.y - 5, w: 4, h: 10, vy: -8 });
    bullets.push({ x: player.x + player.w/2 + 4, y: player.y - 5, w: 4, h: 10, vy: -8 });
  } else {
    // Normal shot
    bullets.push({ x: player.x + player.w/2 - 2, y: player.y - 10, w: 4, h: 10, vy: -8 });
  }
  
  if(settings.sound){
    try{
      const actx = new (window.AudioContext||window.webkitAudioContext)();
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type='square'; o.frequency.value=880; g.gain.value=.02; o.connect(g); g.connect(actx.destination); o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime+0.06); o.stop(actx.currentTime+0.06);
    }catch{}
  }
}

// ===== Draw Power-ups =====
function drawPowerup(x, y, type) {
  ctx.save();
  ctx.translate(x + 10, y + 10);
  
  switch(type) {
    case POWERUP_TYPES.TRIPLE:
      ctx.fillStyle = '#4f8cff';
      // Draw triple bullet icon
      ctx.fillRect(-8, -2, 4, 8);
      ctx.fillRect(-2, -4, 4, 10);
      ctx.fillRect(4, -2, 4, 8);
      break;
    case POWERUP_TYPES.DOUBLE_SCORE:
      ctx.fillStyle = '#ffd166';
      // Draw 2X icon
      ctx.font = 'bold 14px Arial';
      ctx.fillText('2X', -6, 4);
      break;
    case POWERUP_TYPES.WIPEOUT:
      ctx.fillStyle = '#ff5c7c';
      // Draw explosion icon
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-1, -3, 2, 6);
      ctx.fillRect(-3, -1, 6, 2);
      break;
    case POWERUP_TYPES.LIFE:
      ctx.fillStyle = '#ff5c7c'; // Warna merah muda untuk nyawa
      // Gambar ikon hati (nyawa)
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.bezierCurveTo(5, -8, 8, -5, 0, 5);
      ctx.bezierCurveTo(-8, -5, -5, -8, 0, -5);
      ctx.fill();
      break;
  }
  
  ctx.restore();
}

function getPowerupName(type) {
  switch(type) {
    case POWERUP_TYPES.TRIPLE: return 'Triple Shot';
    case POWERUP_TYPES.DOUBLE_SCORE: return 'Double Score';
    case POWERUP_TYPES.WIPEOUT: return 'Wipe Out';
    case POWERUP_TYPES.LIFE: return 'Extra Life';
    default: return '';
  }
}

// ===== Update HUD dengan power-up indicator =====
function updateHUD(){
  hudScore.textContent = score;
  hudLives.textContent = lives;
  hudLevel.textContent = level;
}

function difficultyParams(){
  const map = {
    easy:   { spawnRate: 1200, enemySpeed: [1.4,2.6], shootDelay: 200, maxEnemies: 5 }, // spawnRate dalam ms
    normal: { spawnRate: 900, enemySpeed: [1.8,3.2], shootDelay: 160, maxEnemies: 7 },
    hard:   { spawnRate: 700, enemySpeed: [2.2,3.8], shootDelay: 120, maxEnemies: 10 }
  };
  // Scale with level a bit
  const base = map[settings.difficulty] || map.normal;
  const scale = 1 + (level-1)*0.08;
  return { 
    spawnRate: Math.max(300, base.spawnRate / scale), // Minimal 300ms antara spawn
    enemySpeed: [base.enemySpeed[0]*scale, base.enemySpeed[1]*scale], 
    shootDelay: base.shootDelay/scale,
    maxEnemies: base.maxEnemies + Math.floor(level/2) // Maksimal musuh bertambah perlahan
  };
}

// ===== Drawing helpers =====
function drawShip(x,y,w,h){
  ctx.save();
  ctx.translate(x+w/2,y+h/2);
  // body
  ctx.fillStyle = '#7cc6ff';
  ctx.beginPath();
  ctx.moveTo(0,-h/2);
  ctx.lineTo(w/2, h/2-6);
  ctx.lineTo(0, h/2);
  ctx.lineTo(-w/2, h/2-6);
  ctx.closePath();
  ctx.fill();
  // cockpit
  ctx.fillStyle = '#c7f0ff';
  ctx.fillRect(-6,-h/2+8,12,10);
  // wings accent
  ctx.fillStyle = '#3b6fe0';
  ctx.fillRect(-w/2+2,h/2-12, w-4, 6);
  ctx.restore();
}

function drawEnemy(x,y,w,h){
  ctx.save();
  ctx.translate(x+w/2,y+h/2);
  ctx.fillStyle = '#ff8fa3';
  ctx.beginPath();
  ctx.moveTo(0,-h/2);
  ctx.lineTo(w/2, h/2);
  ctx.lineTo(-w/2, h/2);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e04866';
  ctx.fillRect(-w/2+2,h/2-8, w-4, 6);
  ctx.restore();
}

// ===== Enemy Types =====
const ENEMY_TYPES = {
  NORMAL: 'normal',    // Musuh biasa (merah) - sudah ada
  SHOOTER: 'shooter',  // Musuh penembak (hijau)
  KAMIKAZE: 'kamikaze' // Musuh kamikaze (kuning)
};

// ===== Modified spawnEnemy function =====
function spawnEnemy(){
  const params = difficultyParams();
  
  // Batasi jumlah musuh maksimal
  if (enemies.length >= params.maxEnemies) return;
  
  const w = rand(26, 40), h = w*1.1;
  
  // Tentukan jenis musuh secara acak
  let enemyType = ENEMY_TYPES.NORMAL;
  const typeRoll = Math.random();
  
  if (typeRoll < 0.6) {
    enemyType = ENEMY_TYPES.NORMAL; // 60% normal
  } else if (typeRoll < 0.8) {
    enemyType = ENEMY_TYPES.SHOOTER; // 20% shooter
  } else {
    enemyType = ENEMY_TYPES.KAMIKAZE; // 20% kamikaze
  }
  
  // Buat musuh dengan properti berdasarkan jenis
  const enemy = { 
    x: rand(0, canvas.clientWidth-w), 
    y: -h, 
    w, 
    h, 
    vx: rand(-0.6,0.6), 
    vy: rand(...params.enemySpeed), 
    hp: 1,
    type: enemyType,
    shootCooldown: 0 // Untuk musuh penembak
  };
  
  // Atur properti khusus berdasarkan jenis
  if (enemyType === ENEMY_TYPES.SHOOTER) {
    enemy.vy *= 0.7; // Musuh penembak lebih lambat
    enemy.shootDelay = 2000; // Delay tembakan dalam ms
  } else if (enemyType === ENEMY_TYPES.KAMIKAZE) {
    enemy.vy *= 1.3; // Musuh kamikaze lebih cepat
    enemy.vx = 0; // Tidak bergerak menyamping
  }
  
  enemies.push(enemy);
}

// ===== Modified drawEnemy function =====
function drawEnemy(x,y,w,h,type){
  ctx.save();
  ctx.translate(x+w/2,y+h/2);
  
  // Warna dan bentuk berdasarkan jenis musuh
  if (type === ENEMY_TYPES.NORMAL) {
    ctx.fillStyle = '#ff8fa3';
    ctx.beginPath();
    ctx.moveTo(0,-h/2);
    ctx.lineTo(w/2, h/2);
    ctx.lineTo(-w/2, h/2);
    ctx.closePath(); 
    ctx.fill();
    ctx.fillStyle = '#e04866';
    ctx.fillRect(-w/2+2,h/2-8, w-4, 6);
  } 
  else if (type === ENEMY_TYPES.SHOOTER) {
    // Musuh hijau penembak
    ctx.fillStyle = '#8fff9e';
    ctx.beginPath();
    ctx.moveTo(0,-h/2);
    ctx.lineTo(w/2, h/2);
    ctx.lineTo(-w/2, h/2);
    ctx.closePath(); 
    ctx.fill();
    ctx.fillStyle = '#48e066';
    ctx.fillRect(-w/2+2,h/2-8, w-4, 6);
    
    // Gambar "senjata"
    ctx.fillStyle = '#48e066';
    ctx.fillRect(-w/4, -h/2-5, w/2, 5);
  }
  else if (type === ENEMY_TYPES.KAMIKAZE) {
    // Musuh kuning kamikaze
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(0, 0, w/2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e0b148';
    ctx.beginPath();
    ctx.arc(0, 0, w/4, 0, Math.PI * 2);
    ctx.fill();
  }
  
  ctx.restore();
}

// ===== Enemy Bullets =====
const enemyBullets = []; // {x,y,w,h,vy}

// ===== Enemy Shooting Function =====
function enemyShoot(enemy){
  const now = performance.now();
  if(now - enemy.shootCooldown < enemy.shootDelay) return;
  enemy.shootCooldown = now;
  
  enemyBullets.push({ 
    x: enemy.x + enemy.w/2 - 2, 
    y: enemy.y + enemy.h, 
    w: 4, 
    h: 10, 
    vy: 5 
  });
  
  if(settings.sound){
    try{
      const actx = new (window.AudioContext||window.webkitAudioContext)();
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type='sawtooth'; o.frequency.value=220; g.gain.value=.02; o.connect(g); g.connect(actx.destination); o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime+0.06); o.stop(actx.currentTime+0.06);
    }catch{}
  }
}

function explode(x,y){
  for(let i=0;i<14;i++){
    particles.push({x,y, vx:rand(-2.2,2.2), vy:rand(-2.2,1.2), life: rand(18,32)});
  }
  if(settings.sound){
    try{
      const actx = new (window.AudioContext||window.webkitAudioContext)();
      const o = actx.createOscillator(); const g = actx.createGain();
      o.type='triangle'; o.frequency.value=120; g.gain.value=.05; o.connect(g); g.connect(actx.destination);
      o.start(); g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime+0.2); o.stop(actx.currentTime+0.22);
    }catch{}
  }
}

function rectsOverlap(a,b){
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function update(){
  if(gameState !== 'playing') return;
  time += 1;
  const width = canvas.clientWidth, height = canvas.clientHeight;

  // Update power-up timer
  if (powerupActive && powerupTimer > 0) {
    powerupTimer--;
    if (powerupTimer <= 0) {
      powerupActive = null;
    }
  }

  // Update powerups
  for(let i = powerups.length - 1; i >= 0; i--) {
    const p = powerups[i];
    p.y += p.vy;
    
    // Check collision with player
    if (rectsOverlap(player, p)) {
      applyPowerup(p.type);
      powerups.splice(i, 1);
      continue;
    }
    
    // Remove if out of screen
    if (p.y > height) {
      powerups.splice(i, 1);
    }
  }

  // Update enemy bullets
  for(let i=enemyBullets.length-1;i>=0;i--){
    const b = enemyBullets[i]; 
    b.y += b.vy; 
    if(b.y > height){ 
      enemyBullets.splice(i,1); 
      continue; 
    }
    
    // Check collision with player
    if(rectsOverlap({x:player.x,y:player.y,w:player.w,h:player.h}, b)){
      enemyBullets.splice(i,1); 
      explode(b.x, b.y);
      loseLife(); 
      continue;
    }
  }

  // Move player
  const speed = player.speed;
  if(keys.has('ArrowLeft')||keys.has('a')||keys.has('A')) player.x -= speed;
  if(keys.has('ArrowRight')||keys.has('d')||keys.has('D')) player.x += speed;
  if(keys.has('ArrowUp')||keys.has('w')||keys.has('W')) player.y -= speed;
  if(keys.has('ArrowDown')||keys.has('s')||keys.has('S')) player.y += speed;
  player.x = Math.max(0, Math.min(width - player.w, player.x));
  player.y = Math.max(0, Math.min(height - player.h, player.y));

  // Shoot
  if(keys.has(' ')) shoot();

  // Spawn enemies dengan kontrol waktu
  const now = performance.now();
  const params = difficultyParams();
  if(now - lastSpawnTime > params.spawnRate && enemies.length < params.maxEnemies) {
    spawnEnemy();
    lastSpawnTime = now;
  }

  // Update bullets
  for(let i=bullets.length-1;i>=0;i--){
    const b = bullets[i]; b.y += b.vy; if(b.y + b.h < 0){ bullets.splice(i,1); continue; }
  }

  // Update enemies
  for(let i=enemies.length-1;i>=0;i--){
    const e = enemies[i]; 
    e.x += e.vx; 
    e.y += e.vy;
    
    // Perilaku khusus berdasarkan jenis musuh
    if(e.type === ENEMY_TYPES.SHOOTER){
      // Musuh penembak - coba tembak player
      if(Math.random() < 0.01) { // 1% chance per frame untuk menembak
        enemyShoot(e);
      }
    } 
    else if(e.type === ENEMY_TYPES.KAMIKAZE){
      // Musuh kamikaze - arahkan ke player
      const dx = player.x + player.w/2 - (e.x + e.w/2);
      const dy = player.y + player.h/2 - (e.y + e.h/2);
      const dist = Math.sqrt(dx*dx + dy*dy);
      
      if(dist > 0) {
        e.vx = (dx/dist) * 2.5;
        e.vy = (dy/dist) * 2.5;
      }
    }
    
    if(e.x<0||e.x+e.w>width) e.vx *= -1;
    if(e.y > height){ enemies.splice(i,1); continue; }
  }

  // Collisions - Hanya di sini nyawa berkurang
  for(let i=enemies.length-1;i>=0;i--){
    const e = enemies[i];
    if(rectsOverlap({x:player.x,y:player.y,w:player.w,h:player.h}, e)){
      enemies.splice(i,1); explode(e.x+e.w/2, e.y+e.h/2); loseLife(); continue;
    }
    for(let j=bullets.length-1;j>=0;j--){
      const b = bullets[j];
      if(rectsOverlap({x:b.x,y:b.y,w:b.w,h:b.h}, e)){
        bullets.splice(j,1); enemies.splice(i,1); explode(e.x+e.w/2, e.y+e.h/2); 
        
        // Calculate score with power-up bonus
        let points = 10;
        if (powerupActive === POWERUP_TYPES.DOUBLE_SCORE) {
          points *= 2;
        }
        score += points;
        
        enemyKillCount++;
        
        // Spawn power-up setiap 15 kills dengan kemungkinan 10% untuk life
        if (enemyKillCount >= 15) {
          spawnPowerup(e.x, e.y);
          enemyKillCount = 0;
        } else if (Math.random() < 0.3) { // 10% chance untuk drop power-up langsung
          spawnPowerup(e.x, e.y);
        }
        
        if(score % 120 === 0) level++; 
        updateHUD(); 
        break;
      }
    }
  }

  // Particles
  for(let i=particles.length-1;i>=0;i--){
    const p = particles[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.04; p.life -= 1; if(p.life<=0) particles.splice(i,1);
  }
}

function explode(x,y){
  for(let i=0;i<14;i++){
    particles.push({x,y, vx:rand(-2.2,2.2), vy:rand(-2.2,1.2), life: rand(18,32)});
  }
  if(settings.sound){
    // Mainkan file mp3 saat musuh hancur
    const destroySound = document.getElementById("enemyDestroySound");
    if (destroySound) {
      destroySound.currentTime = 0; // reset agar bisa diputar berulang
      destroySound.play().catch(err => console.log("Gagal play sound:", err));
    }
  }
}


function loseLife(){
  lives--; updateHUD(); if(lives<=0){ endGame(); }
}

function render(){
  ctx.clearRect(0,0,canvas.clientWidth, canvas.clientHeight);
  drawBackground();
  
  // Draw entities
  drawShip(player.x, player.y, player.w, player.h);
  
  // Draw player bullets
  ctx.fillStyle = '#b9e6ff';
  bullets.forEach(b=> ctx.fillRect(b.x, b.y, b.w, b.h));
  
  // Draw enemy bullets
  ctx.fillStyle = '#ff8fa3';
  enemyBullets.forEach(b=> ctx.fillRect(b.x, b.y, b.w, b.h));
  
  // Draw enemies dengan jenisnya
  enemies.forEach(e=> drawEnemy(e.x, e.y, e.w, e.h, e.type));
  
  // Draw powerups
  powerups.forEach(p=> drawPowerup(p.x, p.y, p.type));
  
  // particles
  ctx.fillStyle = '#ffd166';
  particles.forEach(p=> ctx.fillRect(p.x, p.y, 3, 3));
  
  // Draw active power-up indicator
  if (powerupActive) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = '12px Arial';
    ctx.fillText(`Power-up: ${getPowerupName(powerupActive)} - ${Math.ceil(powerupTimer/60)}s`, 10, 20);
  }
}

function loop(){
  if(gameState==='playing') update();
  render();
  requestAnimationFrame(loop);
}

// ===== Leaderboard =====
function getBoard(){
  try{ return JSON.parse(localStorage.getItem(STORAGE_KEYS.board)||'[]'); }catch{ return []; }
}
function setBoard(arr){
  localStorage.setItem(STORAGE_KEYS.board, JSON.stringify(arr));
}
function addScore(name, score){
  const now = new Date();
  const item = { name: name||'Player', score, date: now.toISOString() };
  const arr = getBoard();
  arr.push(item);
  arr.sort((a,b)=> b.score - a.score);
  setBoard(arr.slice(0,10));
}
function formatDate(iso){
  try{ const d=new Date(iso); return d.toLocaleDateString(undefined, {year:'numeric',month:'short',day:'numeric'});}catch{return ''}
}
function renderBoard(){
  const arr = getBoard();
  leaderboardTable.innerHTML = arr.map((r,i)=>`<tr><td>#${i+1}</td><td>${escapeHtml(r.name)}</td><td>${r.score}</td><td>${formatDate(r.date)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Belum ada skor. Main dulu yuk!</td></tr>';
}
function escapeHtml(str){
  return (str||'').replace(/[&<>"]+/g, s=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[s]));
}

// ===== UI Events =====
function openModal(el){ el.classList.remove('hidden'); }
function closeModal(el){ el.classList.add('hidden'); }

btnPlay.onclick = ()=>{ startGame(); };
btnOpenSettings.onclick = ()=>{ openSettings(); };
btnBoard.onclick = ()=>{ openBoard(); };
btnMissions.onclick = ()=>{ openMissions(); };

btnPause.onclick = ()=>{ togglePause(); };
document.addEventListener('keydown', (e)=>{ if(e.key==='p' || e.key==='P') togglePause(); });

saveSettingsBtn.onclick = ()=>{
  settings = { difficulty: difficultySel.value, sound: soundToggle.checked };
  saveSettings(); closeModal(settingsModal);
};
closeSettingsBtn.onclick = ()=> closeModal(settingsModal);

// Hapus event handler untuk clearBoardBtn
closeBoardBtn.onclick = ()=> closeModal(leaderboardModal);

saveScoreBtn.onclick = ()=>{ 
  const name = playerNameInput.value.trim().slice(0,20);
  addScore(name, score); playerNameInput.value=''; closeModal(gameOverModal); openBoard();
};
restartBtn.onclick = ()=>{ closeModal(gameOverModal); startGame(); };

closeMissionsBtn.onclick = ()=> closeModal(missionsModal);

function openSettings(){
  difficultySel.value = settings.difficulty; soundToggle.checked = !!settings.sound; openModal(settingsModal);
}
function openBoard(){ renderBoard(); openModal(leaderboardModal); }
function openMissions(){ openModal(missionsModal); }

function togglePause(){
  if(gameState==='playing'){ gameState='paused'; btnPause.textContent='▶️ Lanjut'; }
  else if(gameState==='paused'){ gameState='playing'; btnPause.textContent='⏸️ Jeda'; }
}

function startGame(){
  closeModal(startScreen); closeModal(leaderboardModal); closeModal(settingsModal); closeModal(gameOverModal); closeModal(missionsModal);
  gameHud.classList.remove('hidden');
  settings = loadSettings(); 
  resetGame(); gameState='playing'; btnPause.textContent='⏸️ Jeda';

  const loseMusic = document.getElementById('loseMusic');
loseMusic.pause();
loseMusic.currentTime = 0;
backgroundMusic.play();
}
function endGame(){
  gameState = 'over';
  finalScoreEl.textContent = score;
  openModal(gameOverModal);
  gameHud.classList.add('hidden');

  // Hentikan musik background
  backgroundMusic.pause();
  backgroundMusic.currentTime = 0;

  // Putar musik kalah (jika sound aktif)
  const loseMusic = document.getElementById('loseMusic');
  loseMusic.currentTime = 0;
  if (settings.sound) {
    loseMusic.play().catch(err => console.log("Gagal play loseMusic:", err));
  }
}


// Fungsi toggle musik
function toggleMusic(){
  if(settings.sound){
    backgroundMusic.play();
  } else {
    backgroundMusic.pause();
  }
}

// start in menu
function init(){
  resize();
  openModal(startScreen);
  loop();
}
init();

function drawBackground(){
  const w = canvas.clientWidth, h = canvas.clientHeight;
  
  // Background warna dasar luar angkasa
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, w, h);
  
  // Gambar bintang-bintang bergerak
  stars.forEach(star => {
    // Update posisi bintang (bergerak ke bawah)
    star.y += star.speed;
    
    // Jika bintang keluar dari layar, reset ke atas
    if (star.y > h) {
      star.y = 0;
      star.x = Math.random() * w;
    }
    
    // Gambar bintang
    ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
    ctx.fillRect(star.x, star.y, star.size, star.size);
  });
  
  // Beberapa bintang berwarna (biru dan merah muda) - tetap statis
  ctx.fillStyle = 'rgba(135, 206, 250, 0.7)'; // light blue
  for(let i = 0; i < 10; i++){
    const x = Math.random() * w;
    const y = Math.random() * h;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
  
  ctx.fillStyle = 'rgba(255, 182, 193, 0.7)'; // light pink
  for(let i = 0; i < 8; i++){
    const x = Math.random() * w;
    const y = Math.random() * h;
    ctx.fillRect(x, y, 1.2, 1.2);
  }
}

function initStars() {
  stars.length = 0; // Reset stars array
  const w = canvas.clientWidth, h = canvas.clientHeight;
  
  // Bintang besar (lebih terang)
  for(let i = 0; i < 50; i++){
    stars.push({
      x: Math.random() * w,
      y: Math.random() * h,
      size: Math.random() * 2 + 1,
      speed: Math.random() * 0.3 + 0.1, // Kecepatan sangat lambat
      opacity: 0.9
    });
  }
  
  // Bintang kecil (lebih banyak)
  for(let i = 0; i < 150; i++){
    stars.push({
      x: Math.random() * w,
      y: Math.random() * h,
      size: Math.random() * 1 + 0.5,
      speed: Math.random() * 0.5 + 0.2, // Sedikit lebih cepat tapi masih lambat
      opacity: 0.6
    });
  }
}