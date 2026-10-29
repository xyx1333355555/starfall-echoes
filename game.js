/* =========================================================================
   星渊回响 · Echoes of the Starfall
   An original single-file Canvas action RPG inspired by open-world fantasy.
   ========================================================================= */
(() => {
'use strict';

/* ---------------------------------- utils -------------------------------- */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
const angleDiff = (a, b) => { let d = (a - b + Math.PI) % TAU; if (d < 0) d += TAU; return d - Math.PI; };
const rand = (a = 1, b = 0) => b + Math.random() * (a - b);
const pick = arr => arr[(Math.random() * arr.length) | 0];

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const R = mulberry32(0x51a7c0de);

/* ---------------------------------- audio -------------------------------- */
const AudioEngine = {
  ctx: null, master: null, musicGain: null, sfxGain: null, enabled: true,
  started: false, combat: false, musicTimer: null, beat: 0,
  init() {
    if (this.started) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.62;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.enabled ? 1 : 0;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.enabled ? 0.9 : 0;
      this.sfxGain.connect(this.master);
      this.started = true;
      this.startMusic();
    } catch (e) { console.warn('audio unavailable', e); }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  setEnabled(on) {
    this.enabled = on;
    if (!this.ctx) return;
    this.musicGain.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.15);
    this.sfxGain.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.1);
  },
  tone(freq, dur, type = 'sine', vol = 0.1, slide = 0, when = 0, dest = null) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfxGain);
    o.start(t); o.stop(t + dur + 0.03);
  },
  noise(dur, vol = 0.1, freq = 1000, type = 'bandpass', when = 0, dest = null) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + when;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = 0.8;
    const g = this.ctx.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(dest || this.sfxGain);
    s.start(t);
  },
  sfx(name) {
    if (!this.ctx || !this.enabled) return;
    switch (name) {
      case 'swing': this.noise(0.12, 0.11, 1700, 'highpass'); this.tone(320, 0.09, 'triangle', 0.035, -80); break;
      case 'heavy': this.noise(0.18, 0.14, 900, 'bandpass'); this.tone(150, 0.18, 'sawtooth', 0.05, -80); break;
      case 'hit': this.tone(150, 0.055, 'square', 0.035, -70); this.noise(0.06, 0.08, 2400, 'highpass'); break;
      case 'crit': this.tone(880, 0.08, 'triangle', 0.06, 240); this.noise(0.12, 0.1, 3200, 'highpass'); break;
      case 'skill': this.tone(260, 0.28, 'sine', 0.07, 640); this.noise(0.2, 0.06, 1200, 'bandpass'); break;
      case 'burst': this.tone(90, 0.8, 'sawtooth', 0.14, -40); this.noise(0.65, 0.15, 600, 'lowpass'); this.tone(520, 0.6, 'sine', 0.05, 400); break;
      case 'heal': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.32, 'sine', 0.045, 0, i * 0.07)); break;
      case 'pickup': this.tone(920, 0.12, 'triangle', 0.045, 420); break;
      case 'coin': this.tone(1180, 0.09, 'sine', 0.035, 300); break;
      case 'chest': [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.42, 'triangle', 0.06, 0, i * 0.075)); break;
      case 'ui': this.tone(620, 0.06, 'sine', 0.03, 80); break;
      case 'switch': this.tone(440, 0.16, 'sine', 0.04, 280); this.noise(0.12, 0.04, 2400, 'highpass'); break;
      case 'dodge': this.noise(0.16, 0.08, 2400, 'highpass'); this.tone(540, 0.12, 'sine', 0.035, -240); break;
      case 'level': [392, 523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.6, 'sine', 0.07, 0, i * 0.11)); break;
      case 'hurt': this.tone(120, 0.2, 'sawtooth', 0.07, -50); this.noise(0.16, 0.08, 500, 'lowpass'); break;
      case 'alert': this.tone(330, 0.12, 'square', 0.025, 120); break;
      case 'reaction': this.tone(700, 0.16, 'triangle', 0.06, 500); this.noise(0.22, 0.09, 2000, 'bandpass'); break;
      case 'boss': this.tone(55, 1.4, 'sawtooth', 0.13, -10); this.noise(1.0, 0.1, 260, 'lowpass'); break;
      case 'death': this.tone(180, 0.6, 'sine', 0.08, -120); break;
    }
  },
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const scale = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25];
    const pad = (notes, dur) => {
      if (!this.ctx || !this.enabled) return;
      const t = this.ctx.currentTime;
      notes.forEach(f => {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain(), ftr = this.ctx.createBiquadFilter();
        o.type = 'triangle'; o.frequency.value = f;
        ftr.type = 'lowpass'; ftr.frequency.value = 900;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.018, t + 1.4);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        o.connect(ftr); ftr.connect(g); g.connect(this.musicGain);
        o.start(t); o.stop(t + dur + 0.1);
      });
    };
    const chords = [[130.81, 196.00, 261.63], [146.83, 220.00, 293.66], [110.00, 164.81, 220.00], [98.00, 146.83, 196.00]];
    let bar = 0;
    const tick = () => {
      if (!this.ctx) return;
      const ch = chords[bar % chords.length];
      pad(ch, 7.5);
      if (this.enabled) {
        const count = this.combat ? 4 : 2;
        for (let i = 0; i < count; i++) {
          if (Math.random() < 0.72) {
            const f = scale[(Math.random() * scale.length) | 0] * (Math.random() < 0.34 ? 2 : 1);
            this.tone(f, 1.2, 'sine', 0.022, 0, i * 1.35 + Math.random() * 0.2, this.musicGain);
          }
        }
        if (this.combat) {
          this.tone(55, 0.3, 'sine', 0.055, -18, 0, this.musicGain);
          this.tone(55, 0.3, 'sine', 0.04, -18, 1.5, this.musicGain);
          this.noise(0.08, 0.018, 5000, 'highpass', 2.6, this.musicGain);
        }
      }
      bar++;
      this.musicTimer = setTimeout(tick, 5200);
    };
    this.musicTimer = setTimeout(tick, 500);
  }
};

/* ---------------------------------- data --------------------------------- */
const ELEMENTS = {
  anemo:   { name: '风', color: '#63d9c2', light: '#c4fff5', dark: '#1b5d54' },
  pyro:    { name: '火', color: '#ff7d55', light: '#ffd2b8', dark: '#6d2c20' },
  hydro:   { name: '水', color: '#5bb9ff', light: '#c4e9ff', dark: '#1d4c6d' },
  electro: { name: '雷', color: '#b88cff', light: '#e4d1ff', dark: '#46286e' },
  physical:{ name: '物理', color: '#e9dec6', light: '#fff6e2', dark: '#5c5548' }
};
const ELEMENT_ORDER = ['anemo', 'pyro', 'hydro', 'electro'];

const CHARACTERS = [
  {
    id: 'ling', name: '风羽·翎', short: '翎', element: 'anemo', weapon: 'sword',
    baseHp: 1060, baseAtk: 23, title: '随风而行的剑士',
    skill: { name: '逐风', cd: 5 }, burst: { name: '风息之舞', cost: 100 },
    palette: { hair: '#dff7ef', hair2: '#86bfb2', coat: '#337e75', coat2: '#1a4945', trim: '#95ead9', pants: '#203a39', skin: '#f1c9a4', accent: '#72e6d0', boot: '#8a6549' },
    hairStyle: 'long', cape: true
  },
  {
    id: 'yan', name: '烬羽·炎', short: '炎', element: 'pyro', weapon: 'claymore',
    baseHp: 1380, baseAtk: 31, title: '把黄昏点燃的人',
    skill: { name: '燎原', cd: 7 }, burst: { name: '赤日', cost: 100 },
    palette: { hair: '#c84830', hair2: '#77251d', coat: '#5b2b27', coat2: '#341817', trim: '#e8a15d', pants: '#2a1b1a', skin: '#e8b58c', accent: '#ff8b5b', boot: '#3c2823' },
    hairStyle: 'spiky', cape: false, scarf: true
  },
  {
    id: 'xi', name: '潮音·汐', short: '汐', element: 'hydro', weapon: 'catalyst',
    baseHp: 940, baseAtk: 20, title: '聆听潮汐的祭司',
    skill: { name: '涌泉', cd: 9 }, burst: { name: '潮汐领域', cost: 100 },
    palette: { hair: '#a9d9f2', hair2: '#4f83a5', coat: '#2b5677', coat2: '#172f43', trim: '#9fdcff', pants: '#1d394d', skin: '#f4d2b2', accent: '#78ceff', boot: '#4d6a7d' },
    hairStyle: 'wave', cape: true, robe: true
  },
  {
    id: 'ting', name: '雷弦·霆', short: '霆', element: 'electro', weapon: 'bow',
    baseHp: 980, baseAtk: 22, title: '追逐落雷的猎手',
    skill: { name: '雷矢', cd: 6 }, burst: { name: '千雷', cost: 100 },
    palette: { hair: '#cdb1f2', hair2: '#6f4b9e', coat: '#3e3358', coat2: '#211a31', trim: '#c3a2ff', pants: '#292238', skin: '#eac5a5', accent: '#b489ff', boot: '#4b3b58' },
    hairStyle: 'twin', cape: false, hood: true
  }
];

const ENEMY_TYPES = {
  slime_hydro: { name: '水史莱姆', kind: 'slime', element: 'hydro', hp: 78, atk: 10, speed: 62, radius: 20, aggro: 250, range: 58, xp: 18, mora: 15, color: '#5bb9ff' },
  slime_pyro:  { name: '火史莱姆', kind: 'slime', element: 'pyro', hp: 86, atk: 12, speed: 66, radius: 20, aggro: 255, range: 60, xp: 19, mora: 16, color: '#ff7d55', explodes: true },
  slime_electro:{ name: '雷史莱姆', kind: 'slime', element: 'electro', hp: 82, atk: 11, speed: 72, radius: 19, aggro: 270, range: 58, xp: 19, mora: 16, color: '#b88cff' },
  goblin:      { name: '荒原丘丘人', kind: 'goblin', element: 'physical', hp: 132, atk: 16, speed: 78, radius: 19, aggro: 285, range: 72, xp: 27, mora: 24 },
  goblin_elite:{ name: '丘丘暴徒', kind: 'goblin', element: 'physical', hp: 210, atk: 22, speed: 72, radius: 23, aggro: 300, range: 82, xp: 42, mora: 38, elite: true },
  shaman_pyro: { name: '火 rite 萨满', kind: 'shaman', element: 'pyro', hp: 150, atk: 15, speed: 52, radius: 18, aggro: 340, range: 250, xp: 36, mora: 30, ranged: true, color: '#ff7d55' },
  shaman_electro:{ name: '雷祭萨满', kind: 'shaman', element: 'electro', hp: 146, atk: 15, speed: 54, radius: 18, aggro: 350, range: 260, xp: 36, mora: 30, ranged: true, color: '#b88cff' },
  shaman_hydro:{ name: '潮祭萨满', kind: 'shaman', element: 'hydro', hp: 148, atk: 14, speed: 54, radius: 18, aggro: 340, range: 250, xp: 35, mora: 30, ranged: true, color: '#5bb9ff' },
  boss:        { name: '深渊咏者 · 渊火', kind: 'boss', element: 'pyro', hp: 2900, atk: 26, speed: 58, radius: 44, aggro: 520, range: 150, xp: 420, mora: 600, elite: true, boss: true, color: '#ff6b45' }
};

const ROADS = [
  [[1560,1920],[1390,2035],[1180,2140],[1005,2225]],
  [[1560,1890],[1465,1650],[1330,1400],[1170,1160],[1050,1000]],
  [[1560,1890],[1745,1750],[1975,1600],[2215,1345],[2440,1065],[2510,840]],
  [[1560,1890],[1750,1990],[1955,2130],[2175,2235],[2385,2325]],
  [[1560,1880],[1565,1630],[1615,1350],[1690,1050],[1775,780]],
  [[1005,2225],[1330,2400],[1690,2475],[2050,2420],[2355,2315]],
  [[1050,1000],[1400,830],[1800,760],[2150,760],[2510,840]]
];

const SHRINE_DEFS = [
  { id: 's0', name: '风语林星坛', x: 1085, y: 965, element: 'anemo', guards: [['goblin', 2], ['shaman_electro', 2]] },
  { id: 's1', name: '燃霞坡星坛', x: 2485, y: 900, element: 'pyro', guards: [['slime_pyro', 3], ['slime_pyro', 3], ['shaman_pyro', 3]] },
  { id: 's2', name: '镜湖星坛', x: 690, y: 2435, element: 'hydro', guards: [['slime_hydro', 3], ['shaman_hydro', 3]] }
];

const CHEST_DEFS = [
  { id: 'c0', x: 1795, y: 1460, rarity: 'common' },
  { id: 'c1', x: 1225, y: 1060, rarity: 'common' },
  { id: 'c2', x: 2285, y: 1040, rarity: 'exquisite' },
  { id: 'c3', x: 900, y: 2100, rarity: 'common' },
  { id: 'c4', x: 2245, y: 2180, rarity: 'exquisite' },
  { id: 'c5', x: 1660, y: 860, rarity: 'precious' }
];

const HERB_DEFS = [
  { id: 'h0', x: 640, y: 2190 }, { id: 'h1', x: 845, y: 2075 }, { id: 'h2', x: 1080, y: 2345 },
  { id: 'h3', x: 675, y: 2590 }, { id: 'h4', x: 955, y: 2595 }
];

const CAMPS = [
  { id: 'camp0', x: 1900, y: 1650, r: 150, enemies: [['slime_hydro', 1], ['slime_hydro', 1], ['slime_pyro', 1]] },
  { id: 'camp1', x: 1200, y: 1280, r: 160, enemies: [['goblin', 2], ['shaman_electro', 2], ['slime_electro', 2]] },
  { id: 'camp2', x: 2320, y: 990, r: 160, enemies: [['slime_pyro', 3], ['slime_pyro', 3], ['shaman_pyro', 3]] },
  { id: 'camp3', x: 955, y: 2505, r: 150, enemies: [['slime_hydro', 2], ['slime_hydro', 2], ['goblin', 2]] },
  { id: 'camp4', x: 2250, y: 2240, r: 170, enemies: [['goblin', 3], ['goblin', 3], ['shaman_hydro', 3]] },
  { id: 'camp5', x: 1780, y: 1130, r: 150, enemies: [['slime_electro', 2], ['slime_electro', 2], ['goblin', 2]] }
];

const REGIONS = [
  { id: 'meadow', name: '风起原野', x: 1560, y: 1810, r: 520, color: '#7fd3b0' },
  { id: 'forest', name: '风语林', x: 1050, y: 1020, r: 460, color: '#4b8a68' },
  { id: 'ridge', name: '燃霞坡', x: 2470, y: 930, r: 430, color: '#d78a50' },
  { id: 'lake', name: '镜湖', x: 830, y: 2340, r: 430, color: '#5a9dbb' },
  { id: 'ruins', name: '沉星遗迹', x: 2700, y: 2510, r: 420, color: '#8f7ca6' }
];

/* ---------------------------------- state -------------------------------- */
const WORLD = { w: 3200, h: 3200 };
const SAVE_KEY = 'starfall_echoes_save_v1';

const game = {
  mode: 'loading', started: false, time: 9 * 60 + 20, playtime: 0,
  kills: 0, bossStarted: false, bossDefeated: false, bossReward: false,
  region: '风起原野', shake: 0, shakeX: 0, shakeY: 0, hitStop: 0,
  titleTime: 0, faded: false, mapOpenFrom: 'playing'
};

const progress = {
  main: 0, shards: [false, false, false], side: 0, herbs: [],
  chests: [], mora: 0, level: 1, xp: 0, bonusHp: 0, kills: 0
};

const player = {
  x: 1560, y: 2050, vx: 0, vy: 0, r: 15, facing: -Math.PI / 2,
  moving: false, sprinting: false, inWater: false, stamina: 100, maxStamina: 100,
  staminaDelay: 0, invuln: 0, dashTime: 0, dashVx: 0, dashVy: 0, dashCd: 0,
  attackTimer: 0, attackHeld: false, combo: 0, comboWindow: 0, attackAnim: 0,
  animTime: 0, footTimer: 0, hurtFlash: 0, healFlash: 0, locked: false,
  interactCd: 0, afterimages: [], buffs: { atk: 0 }, aura: null
};

const camera = { x: 1560, y: 1900, zoom: 1, tx: 1560, ty: 1900 };

let party = [];
let active = 0;
let enemies = [];
let projectiles = [];
let pickups = [];
let particles = [];
let texts = [];
let effects = [];
let fields = [];
let npcs = [];
let shrines = [];
let chests = [];
let herbs = [];
let camps = [];
let decor = [];
let solids = [];
let solidGrid = new Map();
let houses = [];
let ambientMotes = [];
let boss = null;
let bossBarVisible = false;
let interactionTarget = null;
let dialogue = null;
let lastSave = 0;
let hudTick = 0;
let toastSeq = 0;
let questPulse = 0;

const input = {
  keys: new Set(), mouse: { x: 0, y: 0, wx: 0, wy: 0, down: false, inside: false },
  attackHeld: false
};

/* ------------------------------- canvases -------------------------------- */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false });
const miniMap = document.getElementById('miniMap');
const mctx = miniMap.getContext('2d');
const worldMap = document.getElementById('worldMap');
const wmctx = worldMap.getContext('2d');
const portraitCanvas = document.getElementById('portraitCanvas');
const pctx = portraitCanvas.getContext('2d');

let vw = 1280, vh = 720, dpr = 1;
const TERRAIN_SIZE = 1024;
const terrainCanvas = document.createElement('canvas');
terrainCanvas.width = terrainCanvas.height = TERRAIN_SIZE;
const tctx = terrainCanvas.getContext('2d', { willReadFrequently: true });
const treeSprites = {};
const rockSprites = [];
const bushSprites = [];

/* ------------------------------- noise ----------------------------------- */
let noiseSeed = 9173;
function hash2(ix, iy) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(noiseSeed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}
function fbm(x, y, oct = 4) {
  let v = 0, amp = 0.55, freq = 1;
  for (let i = 0; i < oct; i++) {
    v += vnoise(x * freq, y * freq) * amp;
    freq *= 2.03; amp *= 0.5;
  }
  return v / 0.96;
}

/* --------------------------- world field helpers ------------------------- */
function lakeField(x, y) {
  const nx = (x - 810) / 510, ny = (y - 2345) / 390;
  let d = nx * nx + ny * ny;
  d += (fbm(x * 0.011 + 12, y * 0.011 - 4) - 0.5) * 0.12;
  // small island for the lake shrine
  const ix = (x - 690) / 125, iy = (y - 2435) / 105;
  d -= 0.3 * Math.exp(-(ix * ix + iy * iy) * 0.7);
  return d;
}
function isWater(x, y) { return lakeField(x, y) < 1; }
function isRoadPoint(x, y) {
  for (const road of ROADS) {
    for (let i = 0; i < road.length - 1; i++) {
      if (distToSegment(x, y, road[i][0], road[i][1], road[i + 1][0], road[i + 1][1]) < 38) return true;
    }
  }
  return false;
}
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return dist(px, py, x1, y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = clamp(t, 0, 1);
  return dist(px, py, x1 + t * dx, y1 + t * dy);
}

function regionAt(x, y) {
  let best = REGIONS[0], bd = Infinity;
  for (const r of REGIONS) {
    const d = dist(x, y, r.x, r.y) - r.r * 0.35;
    if (d < bd) { bd = d; best = r; }
  }
  return best.name;
}

/* ------------------------------ terrain gen ------------------------------ */
function generateTerrain(progressCb) {
  const size = TERRAIN_SIZE, img = tctx.createImageData(size, size), d = img.data;
  const scale = size / WORLD.w;
  for (let py = 0; py < size; py++) {
    const wy = (py + 0.5) / scale;
    for (let px = 0; px < size; px++) {
      const wx = (px + 0.5) / scale;
      const n = fbm(wx * 0.0016 + 10, wy * 0.0016 - 3);
      const fine = fbm(wx * 0.0105 + 50, wy * 0.0105 + 20, 3);
      const e = fbm(wx * 0.0032 + 400, wy * 0.0032 + 80);
      const e2 = fbm((wx + 24) * 0.0032 + 400, (wy + 24) * 0.0032 + 80);
      const slope = (e - e2) * 175;

      const forest = (1 - smoothstep(980, 1560, wx)) * (1 - smoothstep(1160, 1860, wy));
      const autumn = smoothstep(2040, 2780, wx) * (1 - smoothstep(760, 1500, wy));
      const ruins = smoothstep(2160, 2780, wx) * smoothstep(2020, 2640, wy);

      let r = 111 + n * 26 + fine * 9;
      let g = 142 + n * 28 + fine * 9;
      let b = 82 + n * 14 + fine * 6;

      r = lerp(r, 62 + n * 18, forest * 0.78); g = lerp(g, 103 + n * 24, forest * 0.78); b = lerp(b, 76 + n * 13, forest * 0.78);
      r = lerp(r, 170 + n * 32, autumn * 0.82); g = lerp(g, 108 + n * 24, autumn * 0.82); b = lerp(b, 62 + n * 17, autumn * 0.82);
      r = lerp(r, 102 + n * 24, ruins * 0.88); g = lerp(g, 94 + n * 20, ruins * 0.88); b = lerp(b, 112 + n * 25, ruins * 0.88);

      const lf = lakeField(wx, wy);
      if (lf < 1.2) {
        const shore = smoothstep(1.2, 1.02, lf);
        const depth = clamp(1 - lf, 0, 1);
        const wr = lerp(82, 30, depth) + fine * 10;
        const wg = lerp(159, 87, depth) + fine * 12;
        const wb = lerp(174, 121, depth) + fine * 13;
        const t = smoothstep(1.2, 1.0, lf);
        r = lerp(r, wx > 1300 ? 92 : 120, t * 0.35);
        g = lerp(g, 154, t * 0.35);
        b = lerp(b, 130, t * 0.35);
        r = lerp(r, wr, smoothstep(1.03, 0.86, lf));
        g = lerp(g, wg, smoothstep(1.03, 0.86, lf));
        b = lerp(b, wb, smoothstep(1.03, 0.86, lf));
        if (lf > 0.9 && lf < 1.06) { r += 12; g += 15; b += 9; }
        if (shore > 0) { r += shore * 8; g += shore * 9; }
      }

      const shade = clamp(slope * 0.7, -16, 16);
      r += shade; g += shade; b += shade;

      const arenaD = dist(wx, wy, 2700, 2510);
      const villageD = dist(wx, wy, 1560, 1900);
      if (arenaD < 350) {
        const t = smoothstep(350, 300, arenaD);
        r = lerp(r, 117 + n * 15, t * 0.8); g = lerp(g, 107 + n * 13, t * 0.8); b = lerp(b, 132 + n * 18, t * 0.8);
      }
      if (villageD < 235) {
        const t = smoothstep(235, 185, villageD);
        r = lerp(r, 159 + n * 16, t * 0.62); g = lerp(g, 143 + n * 14, t * 0.62); b = lerp(b, 108 + n * 12, t * 0.62);
      }

      const grain = (fine - 0.5) * 10;
      const i = (py * size + px) * 4;
      d[i] = clamp(r + grain, 0, 255);
      d[i + 1] = clamp(g + grain, 0, 255);
      d[i + 2] = clamp(b + grain, 0, 255);
      d[i + 3] = 255;
    }
    if (py % 64 === 0 && progressCb) progressCb(py / size);
  }
  tctx.putImageData(img, 0, 0);
  paintTerrainDetails(scale);
  if (progressCb) progressCb(1);
}

function texPoint(p, scale) { return [p[0] * scale, p[1] * scale]; }

function strokeRoad(points, width, color, alpha, scale) {
  tctx.save();
  tctx.globalAlpha = alpha;
  tctx.strokeStyle = color;
  tctx.lineWidth = width * scale;
  tctx.lineCap = 'round'; tctx.lineJoin = 'round';
  tctx.beginPath();
  const p = points.map(pt => texPoint(pt, scale));
  tctx.moveTo(p[0][0], p[0][1]);
  for (let i = 1; i < p.length - 1; i++) {
    const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2;
    tctx.quadraticCurveTo(p[i][0], p[i][1], mx, my);
  }
  tctx.lineTo(p[p.length - 1][0], p[p.length - 1][1]);
  tctx.stroke();
  tctx.restore();
}

function paintTerrainDetails(scale) {
  // roads
  for (const road of ROADS) {
    strokeRoad(road, 66, '#6f7a58', 0.36, scale);
    strokeRoad(road, 50, '#bc9f6d', 0.9, scale);
    strokeRoad(road, 31, '#cdb58a', 0.55, scale);
  }

  // village plaza
  tctx.save();
  tctx.translate(1560 * scale, 1900 * scale);
  tctx.fillStyle = '#b8a279'; tctx.globalAlpha = 0.72;
  tctx.beginPath(); tctx.ellipse(0, 0, 215 * scale, 172 * scale, -0.2, 0, TAU); tctx.fill();
  tctx.strokeStyle = '#8b7c5f'; tctx.globalAlpha = 0.55; tctx.lineWidth = 2;
  for (let rr = 55; rr < 205; rr += 32) { tctx.beginPath(); tctx.ellipse(0, 0, rr * scale, rr * 0.78 * scale, -0.2, 0, TAU); tctx.stroke(); }
  tctx.globalAlpha = 0.34;
  for (let i = 0; i < 90; i++) {
    const a = R() * TAU, rr = Math.sqrt(R()) * 200;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr * 0.8;
    tctx.fillStyle = R() > 0.5 ? '#d6c39b' : '#8d7c5c';
    tctx.beginPath(); tctx.ellipse(x * scale, y * scale, (2 + R() * 3) * scale, (1.3 + R() * 2) * scale, R() * TAU, 0, TAU); tctx.fill();
  }
  tctx.restore();

  // ruins plaza
  tctx.save();
  tctx.translate(2700 * scale, 2510 * scale);
  tctx.globalAlpha = 0.82; tctx.fillStyle = '#877d99';
  tctx.beginPath(); tctx.arc(0, 0, 335 * scale, 0, TAU); tctx.fill();
  tctx.globalAlpha = 0.9; tctx.fillStyle = '#9d93aa';
  tctx.beginPath(); tctx.arc(0, 0, 292 * scale, 0, TAU); tctx.fill();
  tctx.globalAlpha = 0.5; tctx.strokeStyle = '#5a526b'; tctx.lineWidth = 2;
  for (let rr = 90; rr < 320; rr += 58) { tctx.beginPath(); tctx.arc(0, 0, rr * scale, 0, TAU); tctx.stroke(); }
  tctx.globalAlpha = 0.62; tctx.strokeStyle = '#d9b879'; tctx.lineWidth = 2.5;
  tctx.beginPath(); tctx.arc(0, 0, 235 * scale, 0, TAU); tctx.stroke();
  tctx.globalAlpha = 0.5;
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU;
    tctx.save(); tctx.rotate(a); tctx.translate(0, -235 * scale);
    tctx.fillStyle = '#e5c98d';
    tctx.beginPath(); tctx.moveTo(0, -5); tctx.lineTo(4, 0); tctx.lineTo(0, 5); tctx.lineTo(-4, 0); tctx.closePath(); tctx.fill();
    tctx.restore();
  }
  tctx.globalAlpha = 0.35; tctx.strokeStyle = '#403a51'; tctx.lineWidth = 1.4;
  for (let i = 0; i < 44; i++) {
    const a = R() * TAU, rr = 40 + R() * 270, x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    tctx.beginPath(); tctx.moveTo(x * scale, y * scale); tctx.lineTo((x + 15) * scale, (y + 9) * scale); tctx.lineTo((x + 24) * scale, (y + 3) * scale); tctx.stroke();
  }
  tctx.restore();

  // lake shore + water lines
  tctx.save();
  tctx.strokeStyle = '#d6e8db'; tctx.globalAlpha = 0.34; tctx.lineWidth = 1.6;
  tctx.beginPath(); tctx.ellipse(810 * scale, 2345 * scale, 505 * scale, 386 * scale, 0.02, 0, TAU); tctx.stroke();
  tctx.strokeStyle = '#78c3d2'; tctx.globalAlpha = 0.28;
  for (let i = 1; i < 8; i++) {
    tctx.beginPath(); tctx.ellipse(810 * scale, 2345 * scale, (505 - i * 42) * scale, (386 - i * 33) * scale, 0.02, 0, TAU); tctx.stroke();
  }
  tctx.restore();

  // ground texture: grass, flowers, leaf litter
  for (let i = 0; i < 14500; i++) {
    const x = R() * WORLD.w, y = R() * WORLD.h;
    if (isWater(x, y) || isRoadPoint(x, y)) continue;
    const forest = x < 1450 && y < 1700;
    const autumn = x > 2050 && y < 1450;
    const ruins = x > 2250 && y > 2050;
    if (ruins && R() < 0.6) continue;
    const px = x * scale, py = y * scale;
    const len = 1 + R() * (forest ? 3.5 : 2.4);
    tctx.globalAlpha = 0.18 + R() * 0.3;
    tctx.strokeStyle = autumn ? (R() > 0.5 ? '#d1a15d' : '#a8753d') : forest ? (R() > 0.5 ? '#81ae7d' : '#58856a') : (R() > 0.5 ? '#b6d087' : '#8cae6d');
    tctx.lineWidth = 0.8 + R() * 0.7;
    tctx.beginPath(); tctx.moveTo(px, py); tctx.lineTo(px + (R() - 0.5) * 2, py - len); tctx.stroke();
  }
  const flowerColors = ['#f4df9a', '#f0b9c2', '#d7d5f2', '#f5f1d8', '#b6b4ec'];
  for (let i = 0; i < 2700; i++) {
    const x = R() * WORLD.w, y = R() * WORLD.h;
    if (isWater(x, y) || isRoadPoint(x, y)) continue;
    if (x > 2300 && y > 2100) continue;
    const px = x * scale, py = y * scale;
    const c = flowerColors[(R() * flowerColors.length) | 0];
    tctx.globalAlpha = 0.35 + R() * 0.45;
    tctx.fillStyle = c;
    const s = 0.7 + R() * 1.4;
    tctx.beginPath(); tctx.arc(px, py, s, 0, TAU); tctx.fill();
    if (R() > 0.6) { tctx.beginPath(); tctx.arc(px + 2, py + 1, s * 0.8, 0, TAU); tctx.fill(); }
  }
  // forest leaf litter
  for (let i = 0; i < 3400; i++) {
    const x = R() * 1500, y = R() * 1700;
    if (isWater(x, y) || isRoadPoint(x, y)) continue;
    tctx.globalAlpha = 0.12 + R() * 0.22;
    tctx.fillStyle = R() > 0.5 ? '#3f6b50' : '#5a7f56';
    tctx.beginPath(); tctx.ellipse(x * scale, y * scale, 1 + R() * 2.2, 0.7 + R(), R() * TAU, 0, TAU); tctx.fill();
  }
  // autumn leaves
  for (let i = 0; i < 3200; i++) {
    const x = 2000 + R() * 1100, y = R() * 1450;
    if (isWater(x, y) || isRoadPoint(x, y)) continue;
    tctx.globalAlpha = 0.2 + R() * 0.3;
    tctx.fillStyle = R() > 0.5 ? '#d98b4f' : '#e0b269';
    tctx.beginPath(); tctx.ellipse(x * scale, y * scale, 1.2 + R() * 2, 0.7 + R(), R() * TAU, 0, TAU); tctx.fill();
  }
  // ruin cracks / moss
  for (let i = 0; i < 360; i++) {
    const a = R() * TAU, rr = R() * 330;
    const x = 2700 + Math.cos(a) * rr, y = 2510 + Math.sin(a) * rr;
    tctx.globalAlpha = 0.16 + R() * 0.2;
    tctx.strokeStyle = R() > 0.5 ? '#4a4558' : '#6d8a6a';
    tctx.lineWidth = 0.8 + R();
    tctx.beginPath(); tctx.moveTo(x * scale, y * scale);
    tctx.lineTo((x + (R() - 0.5) * 45) * scale, (y + (R() - 0.5) * 35) * scale); tctx.stroke();
  }
  tctx.globalAlpha = 1;
}

/* ------------------------------ sprite cache ----------------------------- */
function makeTreeSprite(kind, variant) {
  const W = 230, H = 300;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const rr = mulberry32(1000 + variant * 31 + kind.length * 97);
  const baseX = W / 2, baseY = H - 12;
  // trunk
  g.save();
  g.translate(baseX, baseY);
  g.fillStyle = '#5a4432';
  g.beginPath();
  g.moveTo(-9, 4); g.bezierCurveTo(-7, -30, -12, -70, -5, -120);
  g.lineTo(6, -120); g.bezierCurveTo(12, -72, 7, -30, 9, 4); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,220,170,.08)';
  g.beginPath(); g.moveTo(-4, -120); g.lineTo(1, -118); g.lineTo(4, 2); g.lineTo(0, 2); g.closePath(); g.fill();
  // branches
  g.strokeStyle = '#5a4432'; g.lineWidth = 5; g.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const y = -75 - i * 15;
    g.beginPath(); g.moveTo(0, y); g.quadraticCurveTo((i % 2 ? 1 : -1) * 25, y - 15, (i % 2 ? 1 : -1) * 42, y - 42); g.stroke();
  }
  g.restore();

  const palettes = {
    oak: { dark: '#2f5a3e', mid: '#497a4b', light: '#6c9f5d', hi: '#9bc373' },
    pine: { dark: '#1f493c', mid: '#2f6650', light: '#478361', hi: '#72a978' },
    autumn: { dark: '#7c3f22', mid: '#a95b2b', light: '#cf813a', hi: '#e8ad58' },
    blossom: { dark: '#8a5262', mid: '#bc7a8b', light: '#e0a3ad', hi: '#f5c8cd' }
  };
  const pal = palettes[kind] || palettes.oak;

  if (kind === 'pine') {
    for (let layer = 0; layer < 4; layer++) {
      const y = baseY - 105 - layer * 38, w = 82 - layer * 12, h = 76;
      g.fillStyle = layer % 2 ? pal.mid : pal.dark;
      g.beginPath(); g.moveTo(baseX, y - h); g.lineTo(baseX + w, y + 20); g.quadraticCurveTo(baseX, y + 34, baseX - w, y + 20); g.closePath(); g.fill();
      g.fillStyle = pal.light;
      g.beginPath(); g.moveTo(baseX - 3, y - h + 6); g.lineTo(baseX + w * 0.6, y + 15); g.quadraticCurveTo(baseX, y + 22, baseX - w * 0.7, y + 12); g.closePath(); g.fill();
    }
  } else {
    // canopy clusters
    const cy = baseY + (kind === 'blossom' ? -185 : -175);
    const blobs = [];
    for (let i = 0; i < 19; i++) {
      const a = rr() * TAU, rad = Math.pow(rr(), 0.6) * 72;
      blobs.push({ x: baseX + Math.cos(a) * rad * 1.15, y: cy + Math.sin(a) * rad * 0.72, r: 30 + rr() * 30 });
    }
    blobs.sort((a, b) => a.y - b.y);
    for (const b of blobs) {
      g.fillStyle = pal.dark;
      g.beginPath(); g.arc(b.x + 2, b.y + 5, b.r, 0, TAU); g.fill();
    }
    for (const b of blobs) {
      g.fillStyle = pal.mid;
      g.beginPath(); g.arc(b.x, b.y, b.r * 0.93, 0, TAU); g.fill();
    }
    for (const b of blobs) {
      g.fillStyle = pal.light;
      g.beginPath(); g.arc(b.x - b.r * 0.18, b.y - b.r * 0.2, b.r * 0.58, 0, TAU); g.fill();
    }
    for (let i = 0; i < 24; i++) {
      const b = blobs[(rr() * blobs.length) | 0];
      g.fillStyle = pal.hi; g.globalAlpha = 0.55;
      g.beginPath(); g.arc(b.x - b.r * 0.35 + rr() * b.r * 0.5, b.y - b.r * 0.4 + rr() * b.r * 0.35, 3 + rr() * 6, 0, TAU); g.fill();
      g.globalAlpha = 1;
    }
    if (kind === 'blossom') {
      for (let i = 0; i < 45; i++) {
        const b = blobs[(rr() * blobs.length) | 0];
        g.fillStyle = rr() > 0.5 ? '#ffe0e3' : '#f7b7c1'; g.globalAlpha = 0.8;
        g.beginPath(); g.arc(b.x + (rr() - 0.5) * b.r * 1.5, b.y + (rr() - 0.5) * b.r * 1.2, 2 + rr() * 3, 0, TAU); g.fill();
      }
      g.globalAlpha = 1;
    }
  }
  return c;
}

function makeRockSprite(variant) {
  const W = 130, H = 100;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const rr = mulberry32(500 + variant * 17);
  const baseX = W / 2, baseY = H - 8;
  g.fillStyle = '#5b5f58';
  g.beginPath();
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = Math.PI + i / 7 * Math.PI;
    const rad = 28 + rr() * 16;
    pts.push([baseX + Math.cos(a) * rad * 1.25, baseY + Math.sin(a) * rad * 0.85]);
  }
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath(); g.fill();
  g.fillStyle = '#777b70';
  g.beginPath(); g.ellipse(baseX - 5, baseY - 30, 26, 15, -0.2, 0, TAU); g.fill();
  g.fillStyle = '#8e9284';
  g.beginPath(); g.ellipse(baseX - 12, baseY - 38, 16, 8, -0.25, 0, TAU); g.fill();
  g.strokeStyle = '#464a43'; g.globalAlpha = 0.5;
  g.beginPath(); g.moveTo(baseX - 20, baseY - 32); g.lineTo(baseX - 4, baseY - 20); g.lineTo(baseX + 13, baseY - 26); g.stroke();
  g.globalAlpha = 1;
  return c;
}

function makeBushSprite(kind, variant) {
  const W = 130, H = 100;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const rr = mulberry32(800 + variant * 23);
  const baseX = W / 2, baseY = H - 6;
  const cols = kind === 'autumn' ? ['#8f4e26', '#b86832', '#d08b44', '#e2ac63'] : kind === 'berry' ? ['#28533f', '#3e7250', '#5c9160', '#82b173'] : ['#315e45', '#477a50', '#63985b', '#86b56b'];
  for (let i = 0; i < 10; i++) {
    const x = baseX + (rr() - 0.5) * 65, y = baseY - rr() * 28, r = 18 + rr() * 18;
    g.fillStyle = cols[1]; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  for (let i = 0; i < 7; i++) {
    const x = baseX + (rr() - 0.5) * 55, y = baseY - 8 - rr() * 25, r = 12 + rr() * 12;
    g.fillStyle = cols[2]; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  for (let i = 0; i < 5; i++) {
    const x = baseX + (rr() - 0.5) * 40, y = baseY - 20 - rr() * 16, r = 7 + rr() * 8;
    g.fillStyle = cols[3]; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  if (kind === 'berry') {
    for (let i = 0; i < 10; i++) {
      g.fillStyle = '#d8565b';
      g.beginPath(); g.arc(baseX + (rr() - 0.5) * 60, baseY - 8 - rr() * 35, 2 + rr() * 2, 0, TAU); g.fill();
    }
  }
  return c;
}

function buildSprites() {
  for (const kind of ['oak', 'pine', 'autumn', 'blossom']) {
    treeSprites[kind] = [];
    for (let v = 0; v < 5; v++) treeSprites[kind].push(makeTreeSprite(kind, v));
  }
  for (let v = 0; v < 5; v++) rockSprites.push(makeRockSprite(v));
  for (const kind of ['green', 'berry', 'autumn']) {
    bushSprites[kind] = [];
    for (let v = 0; v < 4; v++) bushSprites[kind].push(makeBushSprite(kind, v));
  }
}

/* ------------------------------- solids --------------------------------- */
function addSolid(x, y, r) {
  const s = { x, y, r };
  solids.push(s);
  const key = `${Math.floor(x / 180)},${Math.floor(y / 180)}`;
  if (!solidGrid.has(key)) solidGrid.set(key, []);
  solidGrid.get(key).push(s);
}
function querySolids(x, y, radius) {
  const out = [];
  const cx = Math.floor(x / 180), cy = Math.floor(y / 180);
  for (let gx = cx - 1; gx <= cx + 1; gx++) {
    for (let gy = cy - 1; gy <= cy + 1; gy++) {
      const arr = solidGrid.get(`${gx},${gy}`);
      if (arr) for (const s of arr) if (dist2(x, y, s.x, s.y) < (radius + s.r) * (radius + s.r)) out.push(s);
    }
  }
  return out;
}
function resolveSolids(e, radius) {
  const near = querySolids(e.x, e.y, radius);
  for (const s of near) {
    const dx = e.x - s.x, dy = e.y - s.y;
    const d = Math.hypot(dx, dy) || 0.001;
    const overlap = radius + s.r - d;
    if (overlap > 0) {
      e.x += dx / d * overlap;
      e.y += dy / d * overlap;
    }
  }
  e.x = clamp(e.x, 60, WORLD.w - 60);
  e.y = clamp(e.y, 60, WORLD.h - 60);
}

/* ------------------------------- world gen ------------------------------- */
function buildWorld() {
  buildSprites();
  generateTerrain(p => {
    const bar = document.getElementById('loadingBar');
    if (bar) bar.style.width = `${12 + p * 48}%`;
  });
  const bar = document.getElementById('loadingBar');
  if (bar) bar.style.width = '66%';

  // houses
  houses = [
    { x: 1400, y: 1740, w: 172, h: 126, variant: 0, flip: false },
    { x: 1705, y: 1735, w: 158, h: 116, variant: 1, flip: true },
    { x: 1740, y: 2015, w: 150, h: 112, variant: 2, flip: false },
    { x: 1290, y: 1955, w: 146, h: 110, variant: 1, flip: true }
  ];
  for (const h of houses) {
    addSolid(h.x - h.w * 0.28, h.y - 20, 34);
    addSolid(h.x + h.w * 0.28, h.y - 20, 34);
    addSolid(h.x, h.y - 55, 38);
  }

  // trees
  const treeTarget = 380;
  let tries = 0, treeCount = 0;
  while (treeCount < treeTarget && tries < 12000) {
    tries++;
    const x = 80 + R() * (WORLD.w - 160), y = 110 + R() * (WORLD.h - 190);
    if (isWater(x, y) || isRoadPoint(x, y)) continue;
    if (dist(x, y, 1560, 1900) < 315) continue;
    if (dist(x, y, 2700, 2510) < 380) continue;
    if (SHRINE_DEFS.some(s => dist(x, y, s.x, s.y) < 90)) continue;
    if (CAMPS.some(c => dist(x, y, c.x, c.y) < 100)) continue;
    const forest = x < 1500 && y < 1800;
    const autumn = x > 2050 && y < 1500;
    const lake = isWater(x, y + 10);
    if (lake) continue;
    let p = 0.18;
    if (forest) p = 0.85;
    if (autumn) p = 0.62;
    if (x > 2300 && y > 2100) p = 0.08;
    if (R() > p) continue;
    let kind = 'oak';
    if (forest) kind = R() < 0.6 ? 'pine' : 'oak';
    else if (autumn) kind = R() < 0.68 ? 'autumn' : 'pine';
    else if (dist(x, y, 1560, 1900) < 780 && R() < 0.3) kind = 'blossom';
    else if (R() < 0.16) kind = 'pine';
    const scale = 0.58 + R() * 0.48;
    decor.push({ type: 'tree', kind, variant: (R() * 5) | 0, x, y, scale, phase: R() * TAU, solid: true });
    addSolid(x, y - 4, 13 * scale);
    treeCount++;
  }

  // rocks
  for (let i = 0; i < 145; i++) {
    let x, y, guard = 0;
    do { x = 80 + R() * (WORLD.w - 160); y = 100 + R() * (WORLD.h - 180); guard++; }
    while ((isWater(x, y) || isRoadPoint(x, y) || dist(x, y, 1560, 1900) < 220 || dist(x, y, 2700, 2510) < 360) && guard < 60);
    if (guard >= 60) continue;
    const scale = 0.55 + R() * 0.9;
    decor.push({ type: 'rock', variant: (R() * 5) | 0, x, y, scale, phase: R() * TAU, solid: true });
    if (scale > 0.8) addSolid(x, y - 6, 20 * scale);
  }

  // bushes
  for (let i = 0; i < 240; i++) {
    let x, y, guard = 0;
    do { x = 80 + R() * (WORLD.w - 160); y = 100 + R() * (WORLD.h - 180); guard++; }
    while ((isWater(x, y) || isRoadPoint(x, y) || dist(x, y, 1560, 1900) < 190 || dist(x, y, 2700, 2510) < 340) && guard < 40);
    if (guard >= 40) continue;
    const autumn = x > 2050 && y < 1500;
    const kind = autumn ? 'autumn' : (R() < 0.12 ? 'berry' : 'green');
    decor.push({ type: 'bush', kind, variant: (R() * 4) | 0, x, y, scale: 0.55 + R() * 0.65, phase: R() * TAU });
  }

  // decorative grass tufts (dynamic, culled)
  for (let i = 0; i < 2200; i++) {
    const x = R() * WORLD.w, y = R() * WORLD.h;
    if (isWater(x, y) || isRoadPoint(x, y) || (x > 2300 && y > 2100)) continue;
    decor.push({ type: 'grass', x, y, scale: 0.7 + R() * 0.9, phase: R() * TAU });
  }

  // ruin pillars
  const pillarAngles = [0.25, 0.95, 1.65, 2.45, 3.15, 3.85, 4.6, 5.45];
  for (let i = 0; i < pillarAngles.length; i++) {
    const a = pillarAngles[i], rr = 316;
    const x = 2700 + Math.cos(a) * rr, y = 2510 + Math.sin(a) * rr;
    decor.push({ type: 'pillar', x, y, scale: 0.9 + (i % 3) * 0.18, phase: R() * TAU, variant: i });
    addSolid(x, y - 4, 20);
  }
  // village lanterns / fences / props
  const props = [
    ['lantern', 1430, 1885], ['lantern', 1685, 1880], ['lantern', 1545, 1705],
    ['fence', 1465, 1810], ['fence', 1655, 1810], ['fence', 1465, 1985], ['fence', 1650, 1990],
    ['stall', 1450, 1855], ['well', 1610, 1980], ['signpost', 1490, 1930]
  ];
  for (const p of props) {
    decor.push({ type: p[0], x: p[1], y: p[2], scale: 1, phase: R() * TAU, variant: (R() * 4) | 0 });
    if (p[0] === 'well' || p[0] === 'stall') addSolid(p[1], p[2] - 10, p[0] === 'well' ? 25 : 30);
  }

  // camps decoration
  for (const c of CAMPS) {
    decor.push({ type: 'campfire', x: c.x, y: c.y + 20, scale: 1, phase: R() * TAU });
    decor.push({ type: 'tent', x: c.x - 52, y: c.y - 16, scale: 1, flip: R() > 0.5 });
  }

  // shrine decor
  for (const s of SHRINE_DEFS) {
    decor.push({ type: 'shrineRuin', x: s.x - 65, y: s.y - 10, scale: 1, phase: R() * TAU });
    addSolid(s.x - 65, s.y - 8, 18);
    addSolid(s.x + 63, s.y - 16, 16);
  }

  // npcs
  npcs = [
    { id: 'lan', name: '岚', x: 1602, y: 1858, palette: { hair: '#c8a46b', hair2: '#7b5a35', coat: '#45664f', coat2: '#263d31', trim: '#d1b071', pants: '#2b3429', skin: '#e5bc95', accent: '#8fce9e' }, hairStyle: 'short', role: '守林人', marker: true },
    { id: 'xiaoman', name: '小满', x: 986, y: 2160, palette: { hair: '#6e4a35', hair2: '#3f2b20', coat: '#b57f45', coat2: '#6f4a2c', trim: '#f0cf86', pants: '#50402c', skin: '#edc5a0', accent: '#f2cc7b' }, hairStyle: 'twin', role: '湖边的小孩', marker: false, child: true }
  ];

  // shrines
  shrines = SHRINE_DEFS.map((def, i) => ({ ...def, index: i, collected: false, guardsAlive: true }));
  // chests
  chests = CHEST_DEFS.map(def => ({ ...def, opened: false, openAnim: 0 }));
  // herbs
  herbs = HERB_DEFS.map(def => ({ ...def, collected: false, bob: R() * TAU }));
  // camps
  camps = CAMPS.map(c => ({ ...c, respawn: 0, alive: 0, cleared: false }));
  spawnAllEnemies();
  buildAmbient();

  // restore saved flags later
  if (bar) bar.style.width = '82%';
}

function buildAmbient() {
  ambientMotes = [];
  for (let i = 0; i < 90; i++) {
    ambientMotes.push({
      x: R() * WORLD.w, y: R() * WORLD.h, z: R() * 30,
      phase: R() * TAU, speed: 0.2 + R() * 0.5, kind: R() < 0.55 ? 'firefly' : 'leaf',
      size: 1 + R() * 2.4
    });
  }
}

/* ------------------------------ enemy spawn ------------------------------ */
function makeEnemy(type, x, y, level, campId, extra = {}) {
  const t = ENEMY_TYPES[type];
  const hpScale = 1 + (level - 1) * 0.34;
  const atkScale = 1 + (level - 1) * 0.2;
  return {
    id: Math.random().toString(36).slice(2), type, name: t.name, kind: t.kind,
    element: t.element, x, y, homeX: x, homeY: y, level,
    maxHp: Math.round(t.hp * hpScale), hp: Math.round(t.hp * hpScale),
    atk: t.atk * atkScale, speed: t.speed, radius: t.radius,
    aggroRange: t.aggro, attackRange: t.range, xp: t.xp, mora: t.mora,
    elite: !!t.elite, boss: !!t.boss, campId: campId || null,
    state: 'idle', stateTime: 0, attackCd: 0.8 + Math.random(), windup: 0,
    facing: R() * TAU, vx: 0, vy: 0, knockX: 0, knockY: 0,
    hitFlash: 0, stagger: 0, dead: false, deathTime: 0,
    aura: t.element !== 'physical' ? { el: t.element, t: 999, innate: true } : null,
    anim: R() * 10, moveAnim: 0, aggroed: false, telegraphs: [],
    bossPhase: 1, nextPattern: 0, castTime: 0, action: null,
    ...extra
  };
}

function spawnEnemy(type, x, y, level, campId, extra) {
  const e = makeEnemy(type, x, y, level, campId, extra);
  enemies.push(e);
  return e;
}

function spawnAllEnemies() {
  enemies = [];
  camps.forEach(camp => {
    camp.alive = 0;
    camp.enemies.forEach(([type, lvl], i) => {
      const a = i / camp.enemies.length * TAU + R();
      const rad = 30 + R() * 55;
      spawnEnemy(type, camp.x + Math.cos(a) * rad, camp.y + Math.sin(a) * rad, lvl, camp.id);
      camp.alive++;
    });
  });
  // shrine guards
  shrines.forEach(s => {
    s.guardIds = [];
    s.guards.forEach(([type, lvl], i) => {
      const a = i / s.guards.length * TAU + 0.6;
      const e = spawnEnemy(type, s.x + Math.cos(a) * 85, s.y + Math.sin(a) * 65, lvl, `shrine_${s.id}`, { shrineId: s.id, noRespawn: true });
      s.guardIds.push(e.id);
    });
  });
  // boss
  boss = spawnEnemy('boss', 2745, 2575, 6, 'boss', { noRespawn: true, dormant: true });
  boss.maxHp = 2900; boss.hp = 2900;
  boss.boss = true;
}

function campAlive(campId) {
  return enemies.some(e => e.campId === campId && !e.dead);
}
function shrineGuardsAlive(s) {
  return enemies.some(e => e.shrineId === s.id && !e.dead);
}

/* ------------------------------- party ---------------------------------- */
function charMaxHp(c) {
  return Math.round((c.baseHp + progress.bonusHp) * (1 + (progress.level - 1) * 0.115));
}
function charAtk(c) {
  return c.baseAtk * (1 + (progress.level - 1) * 0.16);
}
function xpNeed() {
  return Math.round(80 * Math.pow(progress.level, 1.42));
}
function initParty() {
  party = CHARACTERS.map(c => ({
    ...c,
    hp: charMaxHp(c), maxHp: charMaxHp(c),
    energy: 0, cd: 0, dead: false, hitFlash: 0
  }));
  active = 0;
}
function currentChar() { return party[active]; }
function aliveCount() { return party.filter(c => !c.dead).length; }
function inCombat() {
  if (game.bossStarted) return true;
  return enemies.some(e => !e.dead && !e.dormant && e.aggroed && dist(e.x, e.y, player.x, player.y) < 640);
}

function recalcParty(healRatio = 0) {
  for (const c of party) {
    const old = c.maxHp;
    c.maxHp = charMaxHp(c);
    if (!c.dead) c.hp = Math.min(c.maxHp, c.hp + Math.max(0, c.maxHp - old) + c.maxHp * healRatio);
  }
}

function gainXp(amount) {
  progress.xp += amount;
  let leveled = false;
  while (progress.xp >= xpNeed() && progress.level < 20) {
    progress.xp -= xpNeed();
    progress.level++;
    leveled = true;
  }
  if (leveled) {
    recalcParty(0.3);
    showLevelBanner();
    AudioEngine.sfx('level');
    addBurstParticles(player.x, player.y - 30, '#f3dfad', 34, 4);
    addRing(player.x, player.y, '#f3dfad', 18, 150, 0.9, 3);
  }
  updateHUD();
}

function gainEnergy(amount, activeOnly = false) {
  const c = currentChar();
  if (!c.dead) c.energy = clamp(c.energy + amount, 0, 100);
  if (!activeOnly) {
    party.forEach((p, i) => { if (i !== active && !p.dead) p.energy = clamp(p.energy + amount * 0.42, 0, 100); });
  }
}

/* ------------------------------- effects -------------------------------- */
function addParticle(x, y, opts = {}) {
  if (particles.length > 760) particles.shift();
  particles.push({
    x, y, vx: opts.vx ?? 0, vy: opts.vy ?? 0,
    life: opts.life ?? 0.6, maxLife: opts.life ?? 0.6,
    size: opts.size ?? 2, color: opts.color ?? '#fff',
    type: opts.type ?? 'spark', gravity: opts.gravity ?? 0, drag: opts.drag ?? 0.96,
    glow: opts.glow ?? false, rot: opts.rot ?? Math.random() * TAU,
    spin: opts.spin ?? rand(4, -4), alpha: opts.alpha ?? 1
  });
}
function addBurstParticles(x, y, color, count = 16, speed = 3, type = 'spark') {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * TAU, s = speed * (0.35 + Math.random() * 0.9);
    addParticle(x, y, {
      vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.5,
      life: 0.35 + Math.random() * 0.6, size: 1.5 + Math.random() * 3.2,
      color, type, gravity: type === 'spark' ? 2.2 : -0.2, drag: 0.94, glow: type === 'spark'
    });
  }
}
function addText(x, y, text, color = '#fff', size = 17, opts = {}) {
  texts.push({
    x, y, text, color, size, life: opts.life ?? 1.0, maxLife: opts.life ?? 1.0,
    vy: opts.vy ?? -42, vx: opts.vx ?? rand(8, -8), crit: !!opts.crit, reaction: !!opts.reaction,
    outline: opts.outline ?? 'rgba(0,0,0,.72)'
  });
}
function addRing(x, y, color, r0, r1, life = 0.55, width = 3, opts = {}) {
  effects.push({ type: 'ring', x, y, color, r0, r1, life, maxLife: life, width, ...opts });
}
function addSlash(x, y, angle, radius, color, life = 0.24, arc = 1.8, width = 10) {
  effects.push({ type: 'slash', x, y, angle, radius, color, life, maxLife: life, arc, width });
}
function addBolt(x1, y1, x2, y2, color, life = 0.28, width = 3) {
  const pts = [{ x: x1, y: y1 }];
  const segs = 5;
  for (let i = 1; i < segs; i++) {
    const t = i / segs;
    pts.push({ x: lerp(x1, x2, t) + rand(16, -16), y: lerp(y1, y2, t) + rand(16, -16) });
  }
  pts.push({ x: x2, y: y2 });
  effects.push({ type: 'bolt', pts, color, life, maxLife: life, width });
}
function addDelayed(delay, fn) {
  effects.push({ type: 'delayed', delay, life: delay, maxLife: delay, fn });
}
function shakeScreen(amount) {
  game.shake = Math.min(22, game.shake + amount);
}
function hitStop(amount) {
  game.hitStop = Math.max(game.hitStop, amount);
}

/* ------------------------------ combat math ------------------------------ */
const REACTION_TABLE = {
  'hydro|pyro': { name: '蒸发', mult: 2.0, color: '#ffd0ae' },
  'pyro|hydro': { name: '蒸发', mult: 1.55, color: '#ffd0ae' },
  'pyro|electro': { name: '超载', mult: 1.45, color: '#ff9d7d', aoe: true },
  'electro|pyro': { name: '超载', mult: 1.45, color: '#ff9d7d', aoe: true },
  'hydro|electro': { name: '感电', mult: 1.28, color: '#c9a8ff', chain: true },
  'electro|hydro': { name: '感电', mult: 1.28, color: '#c9a8ff', chain: true }
};

function getReaction(auraEl, incomingEl) {
  if (!auraEl || !incomingEl || auraEl === 'physical' || incomingEl === 'physical') return null;
  if (auraEl === incomingEl) return null;
  if (incomingEl === 'anemo') return { name: '扩散', mult: 1.22, color: ELEMENTS[auraEl]?.color || '#c4fff5', swirl: true, swirlEl: auraEl };
  if (auraEl === 'anemo') return { name: '扩散', mult: 1.12, color: ELEMENTS[incomingEl]?.color || '#c4fff5', swirl: true, swirlEl: incomingEl };
  return REACTION_TABLE[`${auraEl}|${incomingEl}`] || null;
}

function damageEnemy(enemy, base, element, opts = {}) {
  if (!enemy || enemy.dead || enemy.dormant) return 0;
  const el = element || 'physical';
  let crit = !opts.noCrit && Math.random() < (opts.critChance ?? 0.18);
  let mult = 1;
  let reaction = null;
  const aura = enemy.aura;
  if (!opts.secondary) {
    reaction = getReaction(aura?.el, el);
    if (reaction) {
      mult *= reaction.mult;
      if (reaction.name === '蒸发') mult *= (el === 'pyro' ? 1.08 : 0.96);
    }
  }
  let amount = base * mult * (crit ? 1.82 : 1) * rand(1.06, 0.94);
  amount = Math.max(1, Math.round(amount));
  enemy.hp -= amount;
  enemy.hitFlash = 0.13;
  if (!enemy.boss) enemy.stagger = Math.max(enemy.stagger, reaction ? 0.32 : 0.13);
  if (opts.knockback) {
    const a = opts.knockAngle ?? angleTo(player.x, player.y, enemy.x, enemy.y);
    enemy.knockX += Math.cos(a) * opts.knockback;
    enemy.knockY += Math.sin(a) * opts.knockback;
  }
  if (!enemy.aggroed && !enemy.dormant) { enemy.aggroed = true; enemy.state = 'chase'; }

  const color = ELEMENTS[el]?.color || '#f2e8d2';
  addText(enemy.x + rand(8, -8), enemy.y - enemy.radius - 38, String(amount), crit ? '#ffe1a3' : color, crit ? 22 : 16, { crit });
  addParticle(enemy.x, enemy.y - enemy.radius * 0.7, { vx: rand(2, -2), vy: -1.5, life: 0.35, size: 4, color, type: 'spark', glow: true });
  for (let i = 0; i < (crit ? 10 : 5); i++) {
    addParticle(enemy.x, enemy.y - enemy.radius * 0.65, {
      vx: rand(120, -120), vy: rand(60, -140), life: rand(0.5, 0.2), size: rand(3, 1),
      color, type: 'spark', glow: true, gravity: 2.4
    });
  }
  AudioEngine.sfx(crit ? 'crit' : 'hit');
  hitStop(crit ? 0.035 : 0.015);
  if (crit) shakeScreen(2.2);

  if (reaction) {
    enemy.aura = null;
    enemy.auraCd = 3.4;
    addText(enemy.x, enemy.y - enemy.radius - 64, reaction.name, reaction.color, 15, { reaction: true, vy: -26, life: 1.15 });
    applyReaction(enemy, reaction, amount, el);
    AudioEngine.sfx('reaction');
  } else if (!opts.secondary && el !== 'physical') {
    if (!enemy.aura || enemy.aura.el === el) {
      enemy.aura = { el, t: el === 'anemo' ? 3.8 : 6.5, innate: false };
    } else {
      enemy.aura = { el, t: 6.5, innate: false };
    }
    enemy.auraCd = 0;
  }

  if (enemy.hp <= 0) killEnemy(enemy);
  updateBossBar();
  return amount;
}

function applyReaction(enemy, reaction, amount, incomingEl) {
  if (reaction.name === '超载') {
    addRing(enemy.x, enemy.y, '#ff9c71', 12, 118, 0.5, 5);
    addBurstParticles(enemy.x, enemy.y - 10, '#ff9c71', 22, 4.6);
    shakeScreen(6);
    for (const other of enemies) {
      if (other === enemy || other.dead || other.dormant) continue;
      if (dist(other.x, other.y, enemy.x, enemy.y) < 125) {
        damageEnemy(other, amount * 0.48, 'pyro', { secondary: true, knockback: 155, knockAngle: angleTo(enemy.x, enemy.y, other.x, other.y) });
      }
    }
  } else if (reaction.name === '感电') {
    let chained = 0;
    for (const other of enemies) {
      if (other === enemy || other.dead || other.dormant) continue;
      if (chained >= 2) break;
      if (dist(other.x, other.y, enemy.x, enemy.y) < 180) {
        addBolt(enemy.x, enemy.y - 20, other.x, other.y - 20, '#c9a8ff', 0.3, 3);
        damageEnemy(other, amount * 0.38, 'electro', { secondary: true });
        chained++;
      }
    }
    addBurstParticles(enemy.x, enemy.y - 15, '#c9a8ff', 14, 3.2);
  } else if (reaction.name === '扩散') {
    const spreadEl = reaction.swirlEl || (enemy.aura ? enemy.aura.el : incomingEl);
    addRing(enemy.x, enemy.y, ELEMENTS[spreadEl]?.color || '#9ff4e7', 8, 96, 0.4, 4);
    const targets = enemies.filter(o => o !== enemy && !o.dead && !o.dormant && dist(o.x, o.y, enemy.x, enemy.y) < 180).slice(0, 4);
    for (const other of targets) {
      addBolt(enemy.x, enemy.y - 20, other.x, other.y - 20, ELEMENTS[spreadEl]?.color || '#9ff4e7', 0.24, 2);
      damageEnemy(other, amount * 0.34, spreadEl, { secondary: true });
    }
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * TAU;
      addParticle(enemy.x, enemy.y - 16, {
        vx: Math.cos(a) * rand(160, 60), vy: Math.sin(a) * rand(100, 20) - 40,
        life: rand(0.7, 0.3), size: rand(4, 1.4), color: ELEMENTS[spreadEl]?.color || '#9ff4e7', type: 'leaf', glow: true
      });
    }
  } else if (reaction.name === '蒸发') {
    for (let i = 0; i < 16; i++) {
      addParticle(enemy.x + rand(25, -25), enemy.y - rand(55, 5), {
        vx: rand(40, -40), vy: rand(-30, -90), life: rand(1.1, 0.5), size: rand(9, 3),
        color: '#f4dfc8', type: 'smoke', alpha: 0.65
      });
    }
    addRing(enemy.x, enemy.y - 8, '#ffe2c8', 6, 52, 0.35, 3);
  }
}

/* ---------------------------- player combat ----------------------------- */
function startDash() {
  if (modeNotPlaying() || player.dashCd > 0 || player.stamina < 21) return;
  let ax = Math.cos(player.facing), ay = Math.sin(player.facing);
  let ix = (input.keys.has('d') ? 1 : 0) - (input.keys.has('a') ? 1 : 0);
  let iy = (input.keys.has('s') ? 1 : 0) - (input.keys.has('w') ? 1 : 0);
  if (ix || iy) { const l = Math.hypot(ix, iy); ax = ix / l; ay = iy / l; }
  player.dashTime = 0.2;
  player.dashVx = ax * 690; player.dashVy = ay * 690;
  player.invuln = Math.max(player.invuln, 0.34);
  player.stamina -= 21; player.staminaDelay = 0.55; player.dashCd = 0.42;
  player.afterimages.push({ x: player.x, y: player.y, life: 0.28, maxLife: 0.28, facing: player.facing });
  for (let i = 0; i < 10; i++) {
    addParticle(player.x, player.y - 20, {
      vx: -ax * rand(160, 40) + rand(40, -40), vy: -ay * rand(160, 40) + rand(30, -30),
      life: rand(0.45, 0.15), size: rand(4, 1), color: ELEMENTS[currentChar().element].color, type: 'spark', glow: true
    });
  }
  AudioEngine.sfx('dodge');
}

function normalAttack() {
  const c = currentChar();
  if (c.dead || player.dashTime > 0) return;
  const weapon = c.weapon;
  let duration = 0.34, mult = 1.0, arc = 1.9, reach = 92;
  if (weapon === 'claymore') { duration = 0.52; arc = 2.3; reach = 108; }
  if (weapon === 'catalyst') { duration = 0.42; }
  if (weapon === 'bow') { duration = 0.36; }
  player.combo = player.comboWindow > 0 ? (player.combo + 1) % 3 : 0;
  player.comboWindow = 0.95;
  const combo = player.combo;
  if (weapon === 'sword') mult = [1.0, 1.08, 1.36][combo];
  else if (weapon === 'claymore') mult = [1.28, 1.62][combo % 2];
  else if (weapon === 'catalyst') mult = 0.92;
  else mult = 0.88;
  player.attackTimer = duration;
  player.attackAnim = 1;
  const atk = charAtk(c);
  const dirX = Math.cos(player.facing), dirY = Math.sin(player.facing);
  if (weapon === 'sword' || weapon === 'claymore') {
    const radius = reach;
    const color = ELEMENTS[c.element].color;
    addSlash(player.x + dirX * 20, player.y - 21 + dirY * 12, player.facing, radius, color, 0.22, weapon === 'claymore' ? 2.45 : arc, weapon === 'claymore' ? 16 : 10);
    let hits = 0;
    for (const e of enemies) {
      if (e.dead || e.dormant) continue;
      const d = dist(player.x, player.y, e.x, e.y);
      if (d > radius + e.radius) continue;
      const a = angleTo(player.x, player.y, e.x, e.y);
      if (Math.abs(angleDiff(a, player.facing)) > arc * 0.56) continue;
      damageEnemy(e, atk * mult, c.element, {
        knockback: weapon === 'claymore' ? 155 : (combo === 2 ? 90 : 35),
        knockAngle: a
      });
      hits++;
    }
    if (hits) {
      gainEnergy(weapon === 'claymore' ? 6 : 4.5, true);
      if (weapon === 'claymore') shakeScreen(2.5);
    }
    if (weapon === 'claymore') AudioEngine.sfx('heavy'); else AudioEngine.sfx('swing');
  } else if (weapon === 'catalyst') {
    const color = ELEMENTS[c.element].color;
    projectiles.push({
      owner: 'player', x: player.x + dirX * 20, y: player.y - 24 + dirY * 8,
      vx: dirX * 560, vy: dirY * 560, r: 9, life: 1.05, damage: atk * mult,
      element: c.element, color, trail: [], type: 'orb'
    });
    AudioEngine.sfx('swing');
  } else {
    projectiles.push({
      owner: 'player', x: player.x + dirX * 22, y: player.y - 24 + dirY * 8,
      vx: dirX * 920, vy: dirY * 920, r: 6, life: 0.8, damage: atk * mult,
      element: c.element, color: ELEMENTS[c.element].color, trail: [], type: 'arrow', angle: player.facing
    });
    AudioEngine.sfx('swing');
    addParticle(player.x + dirX * 24, player.y - 22, { vx: dirX * 80, vy: dirY * 80, life: 0.2, size: 3, color: '#fff2d0', type: 'spark', glow: true });
  }
  if (player.attackTimer > 0) gainEnergy(0.8, true);
}

function useSkill() {
  if (modeNotPlaying()) return;
  const c = currentChar();
  if (c.dead || c.cd > 0) return;
  const dirX = Math.cos(player.facing), dirY = Math.sin(player.facing);
  c.cd = c.skill.cd;
  c.energy = clamp(c.energy + 26, 0, 100);
  AudioEngine.sfx('skill');
  const atk = charAtk(c);
  const el = c.element;
  const color = ELEMENTS[el].color;

  if (c.id === 'ling') {
    const sx = player.x, sy = player.y;
    player.x += dirX * 142; player.y += dirY * 142;
    resolveSolids(player, player.r);
    player.invuln = Math.max(player.invuln, 0.3);
    addSlash(player.x, player.y - 24, player.facing, 128, color, 0.3, 2.6, 15);
    for (let i = 0; i < 22; i++) {
      addParticle(lerp(sx, player.x, Math.random()) + rand(20, -20), lerp(sy, player.y, Math.random()) - 20 + rand(20, -20), {
        vx: rand(140, -140), vy: rand(80, -180), life: rand(0.6, 0.2), size: rand(4, 1.2), color, type: 'spark', glow: true
      });
    }
    for (const e of enemies) {
      if (e.dead || e.dormant) continue;
      const d = dist(player.x, player.y, e.x, e.y);
      if (d < 150) {
        damageEnemy(e, atk * 1.9, 'anemo', { knockback: 170 });
        e.auraCd = 0;
      }
    }
    addRing(player.x, player.y, color, 10, 112, 0.45, 4);
    shakeScreen(3);
  } else if (c.id === 'yan') {
    const cx = player.x + dirX * 25, cy = player.y + dirY * 25;
    addRing(cx, cy, color, 12, 175, 0.6, 8);
    addRing(cx, cy, '#ffd8a0', 5, 105, 0.35, 3);
    addBurstParticles(cx, cy, color, 34, 6.2);
    for (let i = 0; i < 20; i++) {
      addParticle(cx + rand(80, -80), cy + rand(40, -40), {
        vx: rand(30, -30), vy: rand(-60, -170), life: rand(1.2, 0.5), size: rand(7, 2),
        color: Math.random() > 0.5 ? '#ffb35e' : '#ff6f43', type: 'ember', glow: true
      });
    }
    for (const e of enemies) {
      if (e.dead || e.dormant) continue;
      if (dist(cx, cy, e.x, e.y) < 170 + e.radius) damageEnemy(e, atk * 2.45, 'pyro', { knockback: 220, knockAngle: angleTo(cx, cy, e.x, e.y) });
    }
    shakeScreen(9);
    hitStop(0.04);
  } else if (c.id === 'xi') {
    const heal = Math.round(c.maxHp * 0.3);
    party.forEach((p, i) => { if (!p.dead) { const h = Math.round(heal * (i === active ? 1 : 0.58)); p.hp = Math.min(p.maxHp, p.hp + h); } });
    addRing(player.x, player.y, color, 16, 170, 0.85, 6);
    addRing(player.x, player.y, '#d4f4ff', 8, 118, 0.6, 2);
    for (let i = 0; i < 26; i++) {
      addParticle(player.x + rand(90, -90), player.y + rand(30, -40), {
        vx: rand(16, -16), vy: rand(-30, -100), life: rand(1.3, 0.5), size: rand(5, 2),
        color: '#a8e9ff', type: 'heal', glow: true
      });
    }
    for (const e of enemies) {
      if (e.dead || e.dormant) continue;
      if (dist(player.x, player.y, e.x, e.y) < 180) {
        damageEnemy(e, atk * 1.1, 'hydro', { knockback: 50 });
        e.aura = { el: 'hydro', t: 8, innate: false };
      }
    }
    player.healFlash = 1;
    document.getElementById('healFlash').classList.add('on');
    setTimeout(() => document.getElementById('healFlash').classList.remove('on'), 180);
    AudioEngine.sfx('heal');
    addText(player.x, player.y - 80, `+${heal}`, '#a8e9ff', 20, { vy: -34, life: 1.2 });
  } else if (c.id === 'ting') {
    projectiles.push({
      owner: 'player', x: player.x + dirX * 24, y: player.y - 28 + dirY * 10,
      vx: dirX * 1050, vy: dirY * 1050, r: 12, life: 0.85, damage: atk * 2.2,
      element: 'electro', color, trail: [], type: 'lightningArrow', pierce: 12, angle: player.facing
    });
    addBolt(player.x + dirX * 18, player.y - 22, player.x + dirX * 150, player.y - 22 + dirY * 150, color, 0.2, 3);
    shakeScreen(3);
  }
  c.cd = c.skill.cd;
  player.attackAnim = Math.max(player.attackAnim, 0.45);
  updateHUD();
  saveGame();
}

function useBurst() {
  if (modeNotPlaying()) return;
  const c = currentChar();
  if (c.dead || c.energy < 100) return;
  c.energy = 0;
  const atk = charAtk(c), color = ELEMENTS[c.element].color;
  player.attackAnim = 1;
  AudioEngine.sfx('burst');
  shakeScreen(12);
  player.invuln = Math.max(player.invuln, 0.55);
  effects.push({ type: 'burst', life: 0.8, maxLife: 0.8, color, name: c.burst.name, x: player.x, y: player.y - 40 });
  const dirX = Math.cos(player.facing), dirY = Math.sin(player.facing);

  if (c.id === 'ling') {
    const fx = player.x + dirX * 95, fy = player.y + dirY * 95;
    fields.push({ type: 'vortex', x: fx, y: fy, r: 190, life: 4.4, maxLife: 4.4, tick: 0, el: 'anemo', color });
    addRing(fx, fy, color, 20, 210, 0.8, 7);
    for (let i = 0; i < 50; i++) {
      const a = Math.random() * TAU, rr = rand(180, 30);
      addParticle(fx + Math.cos(a) * rr, fy + Math.sin(a) * rr * 0.7 - 20, {
        vx: -Math.sin(a) * 100, vy: Math.cos(a) * 60 - 30, life: rand(1.4, 0.5),
        size: rand(4, 1.2), color, type: 'spark', glow: true, drag: 0.98
      });
    }
  } else if (c.id === 'yan') {
    const tx = clamp(player.x + dirX * 190, 100, WORLD.w - 100);
    const ty = clamp(player.y + dirY * 190, 100, WORLD.h - 100);
    addRing(tx, ty, '#ffb35e', 14, 230, 0.9, 10);
    addRing(tx, ty, '#fff0c0', 8, 130, 0.5, 4);
    addBurstParticles(tx, ty, '#ff8b50', 60, 8, 'ember');
    for (let i = 0; i < 26; i++) {
      addParticle(tx + rand(140, -140), ty + rand(80, -80), {
        vx: rand(70, -70), vy: rand(-90, -240), life: rand(1.6, 0.6), size: rand(10, 3),
        color: Math.random() > 0.5 ? '#ffb35e' : '#ff5b36', type: 'ember', glow: true
      });
    }
    for (const e of enemies) {
      if (e.dead || e.dormant) continue;
      if (dist(tx, ty, e.x, e.y) < 215 + e.radius) damageEnemy(e, atk * 4.4, 'pyro', { knockback: 320, knockAngle: angleTo(tx, ty, e.x, e.y), critChance: 0.3 });
    }
    fields.push({ type: 'fire', x: tx, y: ty, r: 165, life: 3.2, maxLife: 3.2, tick: 0, el: 'pyro', color: '#ff7d55' });
    for (const e of enemies) {
      if (!e.dead && !e.dormant && dist(tx, ty, e.x, e.y) < 230) e.aura = { el: 'pyro', t: 8, innate: false };
    }
  } else if (c.id === 'xi') {
    fields.push({ type: 'hydro', x: player.x, y: player.y, r: 235, life: 6.5, maxLife: 6.5, tick: 0, el: 'hydro', color });
    addRing(player.x, player.y, color, 22, 260, 1.0, 8);
    addRing(player.x, player.y, '#e3f8ff', 12, 185, 0.7, 3);
    party.forEach(p => {
      if (p.dead) {
        p.dead = false;
        p.hp = Math.round(p.maxHp * 0.16);
        addText(p.x ?? player.x, (p.y ?? player.y) - 80, `${p.name} 复苏`, '#a8e9ff', 13, { life: 1.8 });
      } else {
        p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * 0.22));
      }
    });
    for (let i = 0; i < 50; i++) {
      addParticle(player.x + rand(160, -160), player.y + rand(80, -60), {
        vx: rand(20, -20), vy: rand(-30, -120), life: rand(1.8, 0.6), size: rand(6, 2),
        color: '#9fe4ff', type: 'heal', glow: true
      });
    }
    AudioEngine.sfx('heal');
    player.healFlash = 1;
    document.getElementById('healFlash').classList.add('on');
    setTimeout(() => document.getElementById('healFlash').classList.remove('on'), 260);
  } else if (c.id === 'ting') {
    const tx = clamp(player.x + dirX * 165, 100, WORLD.w - 100);
    const ty = clamp(player.y + dirY * 165, 100, WORLD.h - 100);
    fields.push({ type: 'thunder', x: tx, y: ty, r: 190, life: 2.7, maxLife: 2.7, tick: 0, el: 'electro', color, strikes: 0 });
    addRing(tx, ty, color, 18, 220, 0.7, 6);
    for (let i = 0; i < 35; i++) {
      addParticle(tx + rand(150, -150), ty + rand(90, -90), {
        vx: rand(80, -80), vy: rand(-180, -20), life: rand(0.9, 0.2), size: rand(4, 1),
        color, type: 'spark', glow: true
      });
    }
  }
  updateHUD();
  saveGame();
}

function switchCharacter(index) {
  if (modeNotPlaying() && game.mode !== 'title') return;
  if (index < 0 || index >= party.length || index === active) return;
  if (party[index].dead) { showToast(`${party[index].name} 已经倒下`); return; }
  if (player.switchCd > 0) return;
  const prevColor = ELEMENTS[currentChar().element].color;
  active = index;
  player.switchCd = 0.55;
  player.invuln = Math.max(player.invuln, 0.45);
  player.attackTimer = 0.2;
  AudioEngine.sfx('switch');
  addRing(player.x, player.y, ELEMENTS[currentChar().element].color, 10, 70, 0.45, 3);
  addBurstParticles(player.x, player.y - 26, prevColor, 12, 3.5);
  addBurstParticles(player.x, player.y - 26, ELEMENTS[currentChar().element].color, 18, 4.5);
  updateHUD();
}

/* ------------------------------- player --------------------------------- */
function modeNotPlaying() { return game.mode !== 'playing'; }

function updatePlayer(dt) {
  const c = currentChar();
  player.invuln = Math.max(0, player.invuln - dt);
  player.dashCd = Math.max(0, player.dashCd - dt);
  player.switchCd = Math.max(0, (player.switchCd || 0) - dt);
  player.attackTimer = Math.max(0, player.attackTimer - dt);
  player.comboWindow = Math.max(0, player.comboWindow - dt);
  player.interactCd = Math.max(0, player.interactCd - dt);
  player.attackAnim = Math.max(0, player.attackAnim - dt * 4.5);
  player.hurtFlash = Math.max(0, player.hurtFlash - dt * 4);
  player.healFlash = Math.max(0, player.healFlash - dt * 2);
  player.staminaDelay = Math.max(0, player.staminaDelay - dt);
  if (player.staminaDelay <= 0 && player.dashTime <= 0 && !player.sprinting) {
    player.stamina = clamp(player.stamina + 17 * dt, 0, player.maxStamina);
  }

  let ix = (input.keys.has('d') ? 1 : 0) - (input.keys.has('a') ? 1 : 0);
  let iy = (input.keys.has('s') ? 1 : 0) - (input.keys.has('w') ? 1 : 0);
  if (ix || iy) {
    const l = Math.hypot(ix, iy); ix /= l; iy /= l;
  }
  player.moving = !!(ix || iy);
  player.facing = angleTo(player.x, player.y, input.mouse.wx, input.mouse.wy);
  const wasWater = player.inWater;
  player.inWater = isWater(player.x, player.y);
  if (player.inWater && !wasWater) {
    addBurstParticles(player.x, player.y, '#a6e7f7', 12, 3, 'splash');
  }

  if (player.dashTime > 0) {
    player.dashTime -= dt;
    player.x += player.dashVx * dt;
    player.y += player.dashVy * dt;
    player.afterimages.push({ x: player.x, y: player.y, life: 0.24, maxLife: 0.24, facing: player.facing });
    if (Math.random() < 0.55) addParticle(player.x, player.y - 16, { vx: rand(20, -20), vy: rand(20, -20), life: 0.35, size: 4, color: ELEMENTS[c.element].color, type: 'spark', glow: true });
  } else {
    player.sprinting = input.keys.has('shift') && player.moving && player.stamina > 1 && !player.inWater;
    let speed = 202;
    if (player.inWater) speed *= 0.58;
    if (player.sprinting) {
      speed *= 1.5;
      player.stamina -= 25 * dt;
      player.staminaDelay = 0.45;
      if (player.stamina <= 0) { player.stamina = 0; player.sprinting = false; }
      if (Math.random() < 0.35) addParticle(player.x, player.y - 4, { vx: rand(20, -20), vy: rand(10, -20), life: 0.4, size: 2.4, color: '#e9d9ad', type: 'smoke', alpha: 0.28 });
    }
    const accel = 16;
    player.vx = lerp(player.vx, ix * speed, 1 - Math.exp(-accel * dt));
    player.vy = lerp(player.vy, iy * speed, 1 - Math.exp(-accel * dt));
    player.x += player.vx * dt;
    player.y += player.vy * dt;
  }
  const movingSpeed = Math.hypot(player.vx, player.vy);
  resolveSolids(player, player.r);

  if (game.bossStarted && !game.bossDefeated) {
    const d = dist(player.x, player.y, 2700, 2510);
    if (d > 326) {
      const a = angleTo(2700, 2510, player.x, player.y);
      player.x = 2700 + Math.cos(a) * 326;
      player.y = 2510 + Math.sin(a) * 326;
    }
  }
  if (progress.main < 3 && !game.bossDefeated) {
    // soft seal at the ruin gate
    if (player.y > 2280 && player.y < 2390 && player.x > 2330 && player.x < 2450) {
      player.y = 2280;
      if (Math.random() < 0.08) showToast('遗迹被星辉封印着，似乎还需要三枚碎片。');
    }
  }

  player.animTime += dt * (player.sprinting ? 14 : player.moving ? 9.5 : 2.2);
  if (player.moving && player.dashTime <= 0) {
    player.footTimer -= dt * (player.sprinting ? 1.7 : 1);
    if (player.footTimer <= 0) {
      player.footTimer = 0.26;
      const col = player.inWater ? '#a6e7f7' : '#d6c8a2';
      if (player.inWater) {
        for (let i = 0; i < 3; i++) addParticle(player.x + rand(10, -10), player.y, { vx: rand(30, -30), vy: rand(-20, -50), life: 0.4, size: 2.5, color: col, type: 'splash' });
      } else {
        addParticle(player.x + rand(8, -8), player.y, { vx: rand(12, -12), vy: rand(4, -9), life: 0.45, size: rand(3.5, 1.5), color: col, type: 'smoke', alpha: 0.24 });
      }
    }
  }

  if (player.attackHeld && player.attackTimer <= 0 && player.dashTime <= 0) normalAttack();

  // interaction scan
  interactionTarget = findInteraction();
  updateInteractPrompt();

  // ambient aura on player
  if (player.aura) {
    if (player.aura.el !== 'anemo' && Math.random() < 0.05) {
      addParticle(player.x + rand(12, -12), player.y - rand(40, 5), {
        vx: rand(10, -10), vy: rand(-8, -20), life: 0.6, size: 2.2,
        color: ELEMENTS[player.aura.el].color, type: 'spark', glow: true
      });
    }
    player.aura.t -= dt;
    if (player.aura.t <= 0) player.aura = null;
  }
  if (player.aura?.el === 'pyro') {
    player.burnTick = (player.burnTick || 0) + dt;
    if (player.burnTick > 1.1) {
      player.burnTick = 0;
      damagePlayer(4 + progress.level, 'pyro', null, true);
    }
  }

  player.afterimages = player.afterimages.filter(a => { a.life -= dt; return a.life > 0; });

  // health regen in village plaza
  if (dist(player.x, player.y, 1560, 1900) < 190 && !inCombat()) {
    const regen = c.maxHp * 0.035 * dt;
    if (c.hp < c.maxHp) c.hp = Math.min(c.maxHp, c.hp + regen);
  }
}

function findInteraction() {
  let best = null, bd = Infinity;
  for (const n of npcs) {
    const d = dist(player.x, player.y, n.x, n.y);
    if (d < 92 && d < bd) { bd = d; best = { type: 'npc', obj: n, text: `与「${n.name}」交谈`, x: n.x, y: n.y }; }
  }
  for (const c of chests) {
    if (c.opened) continue;
    const d = dist(player.x, player.y, c.x, c.y);
    if (d < 76 && d < bd) { bd = d; best = { type: 'chest', obj: c, text: c.rarity === 'precious' ? '开启华丽的宝箱' : c.rarity === 'exquisite' ? '开启精致的宝箱' : '开启普通宝箱', x: c.x, y: c.y }; }
  }
  for (const s of shrines) {
    if (s.collected) continue;
    const d = dist(player.x, player.y, s.x, s.y);
    if (d < 95 && d < bd) {
      const locked = shrineGuardsAlive(s);
      bd = d;
      best = {
        type: 'shrine', obj: s, locked,
        text: locked ? '星坛被守卫的气息笼罩' : '取回星辉碎片', x: s.x, y: s.y
      };
    }
  }
  return best;
}

function doInteract() {
  if (game.mode !== 'playing' || !interactionTarget || player.interactCd > 0) return;
  const t = interactionTarget;
  if (t.type === 'npc') talkTo(t.obj);
  else if (t.type === 'chest') openChest(t.obj);
  else if (t.type === 'shrine') {
    if (t.locked) { showToast('先击败祭坛附近的守卫。'); AudioEngine.sfx('ui'); }
    else collectShrine(t.obj);
  }
}

/* ------------------------------- damage --------------------------------- */
function damagePlayer(amount, element, source, silent = false) {
  if (player.invuln > 0 || game.mode === 'dead' || game.mode === 'title') return;
  const c = currentChar();
  if (c.dead) return;
  let mult = 1;
  if (element && player.aura) {
    const r = getReaction(player.aura.el, element);
    if (r) {
      mult *= r.name === '蒸发' ? 1.4 : 1.15;
      player.aura = null;
      addText(player.x, player.y - 62, r.name, r.color, 13, { reaction: true });
      if (r.name === '蒸发') for (let i = 0; i < 10; i++) addParticle(player.x, player.y - 20, { vx: rand(30, -30), vy: rand(-60, -10), life: rand(0.7, 0.3), size: rand(7, 2), color: '#f4dfc8', type: 'smoke', alpha: 0.5 });
    }
  }
  const dmg = Math.max(1, Math.round(amount * mult));
  c.hp = Math.max(0, c.hp - dmg);
  c.hitFlash = 0.2;
  player.invuln = 0.62;
  player.hurtFlash = 1;
  player.staminaDelay = 0.8;
  AudioEngine.sfx('hurt');
  shakeScreen(silent ? 2 : 7);
  addText(player.x + rand(10, -10), player.y - 76, `-${dmg}`, '#ff8c8c', 17, { vy: -30 });
  addBurstParticles(player.x, player.y - 28, '#ff8c8c', 10, 2.8);
  const df = document.getElementById('damageFlash');
  df.classList.add('on');
  setTimeout(() => df.classList.remove('on'), 100);
  if (element && element !== 'physical') {
    player.aura = { el: element, t: 5.5 };
    player.burnTick = 0;
  }
  if (source) {
    const a = angleTo(source.x, source.y, player.x, player.y);
    player.x += Math.cos(a) * 14;
    player.y += Math.sin(a) * 14;
  }
  if (c.hp <= 0) knockOut();
  updateHUD();
}

function knockOut() {
  const c = currentChar();
  c.hp = 0; c.dead = true; c.energy = 0;
  addBurstParticles(player.x, player.y - 26, ELEMENTS[c.element].color, 28, 4.2);
  AudioEngine.sfx('death');
  const next = party.findIndex(p => !p.dead);
  if (next >= 0) {
    active = next;
    player.invuln = 1.2;
    player.aura = null;
    addRing(player.x, player.y, '#f3dfad', 8, 80, 0.7, 3);
    showToast(`<b>${c.name}</b> 倒下了 · ${party[next].name} 接替战斗`);
    updateHUD();
  } else {
    wipeOut();
  }
}

function wipeOut() {
  if (game.mode === 'dead') return;
  game.mode = 'dead';
  game.deathTimer = 2.6;
  player.attackHeld = false;
  addText(player.x, player.y - 80, '队伍全灭', '#ff9b9b', 24, { life: 2, vy: -18 });
  showToast('星辉黯淡……你将在风起驿站苏醒。');
  if (game.bossStarted) resetBoss();
  setTimeout(() => {
    if (game.mode !== 'dead') return;
    progress.mora = Math.max(0, progress.mora - Math.floor(progress.mora * 0.08));
    party.forEach(p => { p.dead = false; p.hp = Math.round(p.maxHp * 0.55); p.energy = Math.min(50, p.energy); p.cd = 0; });
    active = 0;
    player.x = 1560; player.y = 2050; player.vx = player.vy = 0; player.aura = null; player.invuln = 1.6;
    camera.x = player.x; camera.y = player.y;
    game.mode = 'playing';
    updateHUD();
    showToast('你在星辉中复苏了。');
    saveGame();
  }, 2600);
}

/* -------------------------------- enemies -------------------------------- */
function startEnemyAttack(e) {
  if (e.ranged) {
    e.windup = 0.62;
    e.pending = 'shoot';
    e.attackCd = 2.1 + Math.random() * 0.8;
  } else {
    e.windup = e.kind === 'goblin' ? 0.5 : 0.38;
    e.pending = 'melee';
    e.attackCd = e.kind === 'goblin' ? 1.5 : 1.15;
  }
  e.facing = angleTo(e.x, e.y, player.x, player.y);
}

function resolveEnemyAttack(e) {
  if (e.dead || game.mode !== 'playing') return;
  if (e.pending === 'shoot') {
    const baseA = angleTo(e.x, e.y, player.x, player.y);
    const count = e.kind === 'shaman' ? 1 : 1;
    for (let i = 0; i < count; i++) {
      const a = baseA + rand(0.08, -0.08);
      projectiles.push({
        owner: 'enemy', x: e.x, y: e.y - 35, vx: Math.cos(a) * 235, vy: Math.sin(a) * 235,
        r: 11, life: 3.2, damage: e.atk, element: e.element,
        color: ELEMENTS[e.element]?.color || '#ff9c78', trail: [], type: 'enemyOrb',
        homing: 0.22, target: 'player'
      });
    }
    AudioEngine.sfx('skill');
  } else {
    const d = dist(e.x, e.y, player.x, player.y);
    if (d < e.attackRange + 32) {
      damagePlayer(e.atk * (e.elite ? 1.35 : 1.0), e.element, e);
      addSlash(e.x, e.y - 20, e.facing, e.attackRange + 10, '#e8b58c', 0.18, 1.4, 8);
      shakeScreen(2.5);
    } else {
      addSlash(e.x, e.y - 20, e.facing, e.attackRange, '#d2b08b', 0.18, 1.4, 5);
    }
    if (e.kind === 'slime' && Math.random() < 0.5) {
      addBurstParticles(e.x, e.y, ELEMENTS[e.element].color, 8, 2.5, 'splash');
    }
  }
  e.windup = 0; e.pending = null;
}

function updateEnemies(dt) {
  for (const e of enemies) {
    if (e.dead) { e.deathTime += dt; continue; }
    if (e.boss) { updateBoss(e, dt); continue; }
    if (e.dormant) continue;
    e.hitFlash = Math.max(0, e.hitFlash - dt);
    e.stagger = Math.max(0, e.stagger - dt);
    e.anim += dt * (e.aggroed ? 6 : 2);
    e.attackCd = Math.max(0, e.attackCd - dt);
    e.knockX *= Math.pow(0.0015, dt); e.knockY *= Math.pow(0.0015, dt);
    e.auraCd = Math.max(0, (e.auraCd || 0) - dt);

    if (e.aura && !e.aura.innate) {
      e.aura.t -= dt;
      if (e.aura.t <= 0) e.aura = null;
    }
    if (!e.aura && e.element !== 'physical' && e.auraCd <= 0) {
      e.aura = { el: e.element, t: 999, innate: true };
    }

    if (e.windup > 0 && game.mode === 'playing') {
      e.windup -= dt;
      if (e.windup <= 0) resolveEnemyAttack(e);
    }

    const d = dist(e.x, e.y, player.x, player.y);
    if (!e.aggroed && game.mode === 'playing' && d < e.aggroRange) {
      e.aggroed = true;
      e.state = 'chase';
      if (Math.random() < 0.45) AudioEngine.sfx('alert');
    }
    if (e.aggroed && d > 820 && !e.boss) {
      e.aggroed = false;
      e.state = 'idle';
    }
    if (e.aggroed && game.mode === 'playing') {
      e.facing = angleTo(e.x, e.y, player.x, player.y);
      if (e.windup <= 0 && e.stagger <= 0) {
        if (e.ranged) {
          if (d < 155) {
            e.vx = lerp(e.vx, -Math.cos(e.facing) * e.speed, 0.1);
            e.vy = lerp(e.vy, -Math.sin(e.facing) * e.speed, 0.1);
          } else if (d > 330) {
            e.vx = lerp(e.vx, Math.cos(e.facing) * e.speed, 0.1);
            e.vy = lerp(e.vy, Math.sin(e.facing) * e.speed, 0.1);
          } else {
            const strafe = e.facing + Math.PI / 2 * (e.id.charCodeAt(0) % 2 ? 1 : -1);
            e.vx = lerp(e.vx, Math.cos(strafe) * e.speed * 0.65, 0.06);
            e.vy = lerp(e.vy, Math.sin(strafe) * e.speed * 0.65, 0.06);
          }
          if (e.attackCd <= 0 && d < 390) startEnemyAttack(e);
        } else {
          if (d > e.attackRange * 0.72) {
            e.vx = lerp(e.vx, Math.cos(e.facing) * e.speed, 0.1);
            e.vy = lerp(e.vy, Math.sin(e.facing) * e.speed, 0.1);
          } else {
            e.vx = lerp(e.vx, 0, 0.25); e.vy = lerp(e.vy, 0, 0.25);
          }
          if (e.attackCd <= 0 && d < e.attackRange + 24) startEnemyAttack(e);
        }
        if (e.kind === 'slime') {
          e.hop = (e.hop || 0) + dt * 5;
          const hopBoost = Math.max(0, Math.sin(e.hop)) * 0.85;
          e.vx *= (0.62 + hopBoost * 0.75);
          e.vy *= (0.62 + hopBoost * 0.75);
        }
      } else {
        e.vx = lerp(e.vx, 0, 0.2); e.vy = lerp(e.vy, 0, 0.2);
      }
    } else {
      e.vx = lerp(e.vx, 0, 0.1); e.vy = lerp(e.vy, 0, 0.1);
    }

    e.x += (e.vx + e.knockX) * dt;
    e.y += (e.vy + e.knockY) * dt;
    resolveSolids(e, e.radius * 0.7);
  }
}

function resetBoss() {
  if (!boss) return;
  boss.hp = boss.maxHp;
  boss.dead = false;
  boss.deathTime = 0;
  boss.dormant = true;
  boss.aggroed = false;
  boss.x = boss.homeX; boss.y = boss.homeY;
  boss.action = null; boss.casts = []; boss.attackCd = 2;
  boss.bossPhase = 1;
  enemies = enemies.filter(e => e === boss || e.campId !== 'bossAdds');
  game.bossStarted = false;
  bossBarVisible = false;
  document.getElementById('bossBar').classList.add('hidden');
  if (els.worldCounters) els.worldCounters.classList.remove('hidden');
}

function startBossFight() {
  if (game.bossStarted || game.bossDefeated) return;
  game.bossStarted = true;
  boss.dormant = false;
  boss.aggroed = true;
  boss.hp = boss.maxHp;
  boss.action = null;
  boss.casts = [];
  boss.attackCd = 1.6;
  boss.bossPhase = 1;
  bossBarVisible = true;
  document.getElementById('bossBar').classList.remove('hidden');
  if (els.worldCounters) els.worldCounters.classList.add('hidden');
  AudioEngine.sfx('boss');
  AudioEngine.combat = true;
  shakeScreen(14);
  hitStop(0.12);
  showObjective('深渊咏者 · 渊火', '击败遗迹深处的古老存在');
  addRing(2700, 2510, '#ff6b45', 20, 420, 1.4, 8);
  addBurstParticles(2745, 2545, '#ff6b45', 46, 5.2, 'ember');
  updateBossBar();
}

function bossChoosePattern() {
  const d = dist(boss.x, boss.y, player.x, player.y);
  const r = Math.random();
  let name = 'volley';
  if (boss.bossPhase === 2 && !boss.summoned && r < 0.2) name = 'summon';
  else if (d < 190 && r < 0.45) name = 'nova';
  else if (r < 0.3) name = 'meteor';
  else if (r < 0.48) name = 'blink';
  boss.action = {
    name, t: 0,
    total: name === 'volley' ? 0.85 : name === 'meteor' ? 1.15 : name === 'nova' ? 1.05 : name === 'summon' ? 1.2 : 0.7,
    stage: 0
  };
  if (name === 'summon') boss.summoned = true;
  AudioEngine.sfx('boss');
}

function updateBoss(e, dt) {
  e.hitFlash = Math.max(0, e.hitFlash - dt);
  e.anim += dt * 2.5;
  if (e.dead) { e.deathTime += dt; return; }
  if (e.dormant) return;
  if (!game.bossStarted) startBossFight();
  const d = dist(e.x, e.y, player.x, player.y);
  e.facing = angleTo(e.x, e.y, player.x, player.y);
  if (e.hp < e.maxHp * 0.5 && e.bossPhase === 1) {
    e.bossPhase = 2;
    document.getElementById('bossPhase').textContent = '焚天 · 狂怒之相';
    showToast('<b>渊火</b> 进入狂怒之相，火焰护盾升腾。');
    addRing(e.x, e.y, '#ff6b45', 20, 180, 0.9, 8);
    addBurstParticles(e.x, e.y - 30, '#ff6b45', 40, 5.5, 'ember');
    shakeScreen(10);
  }

  e.casts = (e.casts || []).filter(c => {
    c.delay -= dt;
    if (c.delay <= 0) {
      addRing(c.x, c.y, '#ff6b45', 10, c.r + 20, 0.5, 7);
      addBurstParticles(c.x, c.y, '#ff8b50', 26, 5.4, 'ember');
      shakeScreen(5);
      if (dist(player.x, player.y, c.x, c.y) < c.r + 14) damagePlayer(e.atk * 1.35, 'pyro', c);
      return false;
    }
    return true;
  });

  if (e.action) {
    e.action.t += dt;
    const a = e.action;
    if (a.stage === 0) {
      if (a.name === 'volley' && a.t > 0.5) {
        a.stage = 1;
        const base = angleTo(e.x, e.y, player.x, player.y);
        for (let i = -1; i <= 1; i++) {
          const ang = base + i * 0.16;
          projectiles.push({
            owner: 'enemy', x: e.x + Math.cos(ang) * 34, y: e.y - 48 + Math.sin(ang) * 20,
            vx: Math.cos(ang) * 265, vy: Math.sin(ang) * 265, r: 12, life: 3.6,
            damage: e.atk * 0.9, element: 'pyro', color: '#ff7d55', trail: [], type: 'enemyOrb', homing: 0.06
          });
        }
        addBurstParticles(e.x, e.y - 40, '#ff7d55', 16, 3.5);
      } else if (a.name === 'meteor' && a.t > 0.35) {
        a.stage = 1;
        for (let i = 0; i < 5; i++) {
          const ang = Math.random() * TAU, rr = i === 0 ? 0 : rand(130, 25);
          const tx = clamp(player.x + Math.cos(ang) * rr + rand(50, -50), 2410, 2990);
          const ty = clamp(player.y + Math.sin(ang) * rr + rand(50, -50), 2220, 2800);
          e.casts.push({ x: tx, y: ty, r: 62, delay: 0.85 + i * 0.1 });
        }
        addRing(e.x, e.y, '#ff6b45', 30, 120, 0.5, 4);
      } else if (a.name === 'nova' && a.t > 0.72) {
        a.stage = 1;
        addRing(e.x, e.y, '#ff6b45', 20, 285, 0.75, 10);
        addRing(e.x, e.y, '#ffd0a0', 12, 230, 0.5, 4);
        shakeScreen(12);
        if (dist(player.x, player.y, e.x, e.y) < 290) damagePlayer(e.atk * 1.55, 'pyro', e);
        addBurstParticles(e.x, e.y - 10, '#ff7d55', 34, 6, 'ember');
      } else if (a.name === 'blink' && a.t > 0.32) {
        a.stage = 1;
        addBurstParticles(e.x, e.y - 30, '#b838ff', 24, 4.2);
        const ang = angleTo(player.x, player.y, e.x, e.y);
        e.x = clamp(player.x + Math.cos(ang) * 105, 2420, 2980);
        e.y = clamp(player.y + Math.sin(ang) * 105, 2230, 2790);
        addBurstParticles(e.x, e.y - 30, '#ff6b45', 28, 4.4);
        addRing(e.x, e.y, '#ff6b45', 8, 100, 0.4, 4);
      } else if (a.name === 'summon' && a.t > 0.55) {
        a.stage = 1;
        for (let i = 0; i < 2; i++) {
          const ang = i / 2 * TAU + 0.6;
          spawnEnemy('slime_pyro', e.x + Math.cos(ang) * 95, e.y + Math.sin(ang) * 70, 5, 'bossAdds');
        }
        showToast('渊火唤出了燃烧的眷属。');
      }
    } else if (a.name === 'blink' && a.t > 0.52 && a.stage === 1) {
      a.stage = 2;
      if (dist(e.x, e.y, player.x, player.y) < 160) damagePlayer(e.atk * 1.5, 'pyro', e);
      addSlash(e.x, e.y - 35, e.facing, 165, '#ff8b50', 0.3, 2.4, 16);
      shakeScreen(8);
    }
    if (a.t >= a.total) {
      e.action = null;
      e.attackCd = e.bossPhase === 2 ? 1.5 : 2.0;
    }
  } else {
    e.attackCd -= dt;
    if (e.attackCd <= 0) bossChoosePattern();
    else if (d > 150) {
      e.x += Math.cos(e.facing) * e.speed * 0.45 * dt;
      e.y += Math.sin(e.facing) * e.speed * 0.45 * dt;
    }
  }
  resolveSolids(e, e.radius * 0.8);
  updateBossBar();
}

function killEnemy(e) {
  if (e.dead) return;
  e.dead = true; e.deathTime = 0; e.hp = 0; e.windup = 0;
  game.kills++; progress.kills++;
  gainXp(e.xp);
  gainEnergy(10);
  const color = ELEMENTS[e.element]?.color || '#f2e8d2';
  addBurstParticles(e.x, e.y - 25, color, e.boss ? 70 : 26, e.boss ? 8 : 4.4);
  addRing(e.x, e.y, color, 6, e.boss ? 250 : 70, e.boss ? 1.2 : 0.45, e.boss ? 8 : 3);
  addText(e.x, e.y - e.radius - 55, `+${e.xp} XP`, '#d9e7c0', 12, { life: 1.2, vy: -28 });
  AudioEngine.sfx('death');
  let total = e.mora;
  const drops = 2 + ((Math.random() * 3) | 0);
  for (let i = 0; i < drops; i++) {
    const a = Math.random() * TAU, rr = rand(38, 8);
    pickups.push({ kind: 'mora', x: e.x + Math.cos(a) * rr, y: e.y + Math.sin(a) * rr, value: Math.max(1, Math.round(total / drops)), life: 16, bob: Math.random() * TAU, vx: 0, vy: 0 });
  }
  if (Math.random() < 0.16) pickups.push({ kind: 'heal', x: e.x, y: e.y, value: 0.09, life: 20, bob: Math.random() * TAU, vx: 0, vy: 0 });
  if (Math.random() < 0.2) pickups.push({ kind: 'energy', x: e.x + rand(18, -18), y: e.y + rand(8, -8), value: 18, life: 18, bob: Math.random() * TAU, vx: 0, vy: 0 });

  if (e.type === 'slime_pyro') {
    addDelayed(0.22, () => {
      addRing(e.x, e.y, '#ff7d55', 10, 105, 0.45, 5);
      addBurstParticles(e.x, e.y - 10, '#ff7d55', 20, 4);
      if (dist(player.x, player.y, e.x, e.y) < 115) damagePlayer(e.atk * 0.9, 'pyro', e);
    });
  }
  if (e.campId) {
    const camp = camps.find(c => c.id === e.campId);
    if (camp) {
      camp.alive = enemies.filter(x => x.campId === e.campId && !x.dead).length;
      if (camp.alive <= 0 && !camp.cleared) {
        camp.cleared = true;
        camp.respawn = 110;
        showToast('营地已肃清 · 此处暂时安静了');
      }
    }
  }
  if (e.shrineId) {
    const s = shrines.find(x => x.id === e.shrineId);
    if (s && !shrineGuardsAlive(s)) showToast(`<b>${s.name}</b> 的守卫已被清除`);
  }
  if (e.boss) killBoss();
  updateHUD();
  saveGame();
}

function killBoss() {
  if (game.bossDefeated) return;
  game.bossDefeated = true;
  game.bossStarted = false;
  bossBarVisible = false;
  progress.main = 4;
  AudioEngine.combat = false;
  document.getElementById('bossBar').classList.add('hidden');
  if (els.worldCounters) els.worldCounters.classList.remove('hidden');
  addRing(boss.x, boss.y, '#ffd0a0', 20, 520, 1.8, 12);
  addBurstParticles(boss.x, boss.y - 30, '#ff8b50', 100, 9, 'ember');
  shakeScreen(24);
  hitStop(0.22);
  addText(boss.x, boss.y - 100, '深渊咏者 · 渊火  已击败', '#ffe6b8', 20, { life: 3, vy: -20 });
  boss.action = null;
  boss.casts = [];
  enemies.forEach(e => { if (e.campId === 'bossAdds' && !e.dead) killEnemy(e); });
  // reward chest
  if (!chests.find(c => c.id === 'bossReward')) {
    chests.push({ id: 'bossReward', x: 2700, y: 2545, rarity: 'precious', opened: false, openAnim: 0, boss: true });
  }
  addDelayed(0.8, () => {
    showObjective('星渊的回响', '回到风起驿站，将一切告诉岚');
    showToast('<b>第一章目标完成</b> · 沉星遗迹的封印解开了');
  });
  updateQuestUI();
  saveGame();
}

/* ------------------------------- projectiles ----------------------------- */
function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;
    if (p.trail) {
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 8) p.trail.shift();
    }
    if (p.homing) {
      const target = p.owner === 'enemy' ? player : null;
      if (target) {
        const targetAng = angleTo(p.x, p.y, target.x, target.y - 24);
        const curAng = Math.atan2(p.vy, p.vx);
        const na = curAng + angleDiff(targetAng, curAng) * p.homing * dt * 5;
        const spd = Math.hypot(p.vx, p.vy);
        p.vx = Math.cos(na) * spd; p.vy = Math.sin(na) * spd;
      }
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.life <= 0 || p.x < 0 || p.y < 0 || p.x > WORLD.w || p.y > WORLD.h) {
      projectiles.splice(i, 1); continue;
    }
    if (p.owner === 'player') {
      let hit = false;
      for (const e of enemies) {
        if (e.dead || e.dormant) continue;
        if (dist2(p.x, p.y, e.x, e.y - 20) < (p.r + e.radius) * (p.r + e.radius)) {
          damageEnemy(e, p.damage, p.element, { knockback: p.type === 'lightningArrow' ? 90 : 20 });
          addBurstParticles(p.x, p.y, p.color, 10, 3);
          hit = true;
          if (p.pierce) p.pierce--;
          else break;
        }
      }
      if (hit && (!p.pierce || p.pierce <= 0)) { projectiles.splice(i, 1); continue; }
    } else {
      if (dist2(p.x, p.y, player.x, player.y - 24) < (p.r + player.r) * (p.r + player.r)) {
        damagePlayer(p.damage, p.element, p);
        addBurstParticles(p.x, p.y, p.color, 12, 3);
        projectiles.splice(i, 1); continue;
      }
    }
  }
}

/* -------------------------------- fields -------------------------------- */
function updateFields(dt) {
  for (let i = fields.length - 1; i >= 0; i--) {
    const f = fields[i];
    f.life -= dt; f.tick -= dt;
    if (f.life <= 0) { fields.splice(i, 1); continue; }
    if (f.tick <= 0) {
      if (f.type === 'vortex') {
        f.tick = 0.42;
        for (const e of enemies) {
          if (e.dead || e.dormant) continue;
          const d = dist(e.x, e.y, f.x, f.y);
          if (d < f.r) {
            damageEnemy(e, charAtk(currentChar()) * 0.42, 'anemo', { secondary: true });
            const a = angleTo(e.x, e.y, f.x, f.y);
            e.x += Math.cos(a) * 10; e.y += Math.sin(a) * 10;
            if (d < f.r * 0.5) { e.knockX += Math.cos(a) * 30; e.knockY += Math.sin(a) * 30; }
          }
        }
        for (let k = 0; k < 7; k++) {
          const a = Math.random() * TAU, rr = f.r * (0.35 + Math.random() * 0.7);
          addParticle(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr * 0.7, {
            vx: -Math.sin(a) * 130, vy: Math.cos(a) * 80 - 30, life: 0.7, size: rand(3, 1),
            color: f.color, type: 'spark', glow: true
          });
        }
      } else if (f.type === 'hydro') {
        f.tick = 0.52;
        const c = currentChar();
        c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.014);
        party.forEach((p, idx) => { if (idx !== active && !p.dead) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.006); });
        for (const e of enemies) {
          if (e.dead || e.dormant) continue;
          if (dist(e.x, e.y, f.x, f.y) < f.r + e.radius) {
            damageEnemy(e, charAtk(c) * 0.28, 'hydro', { secondary: true });
            e.aura = { el: 'hydro', t: 4, innate: false };
            e.auraCd = 0;
          }
        }
        for (let k = 0; k < 5; k++) {
          const a = Math.random() * TAU, rr = Math.random() * f.r;
          addParticle(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr * 0.65, {
            vx: rand(12, -12), vy: rand(-18, -45), life: rand(1, 0.4), size: rand(4, 1.4),
            color: '#a8e9ff', type: 'heal', glow: true
          });
        }
      } else if (f.type === 'fire') {
        f.tick = 0.55;
        for (const e of enemies) {
          if (e.dead || e.dormant) continue;
          if (dist(e.x, e.y, f.x, f.y) < f.r + e.radius) damageEnemy(e, charAtk(currentChar()) * 0.22, 'pyro', { secondary: true });
        }
        for (let k = 0; k < 7; k++) {
          addParticle(f.x + rand(f.r, -f.r) * 0.8, f.y + rand(f.r * 0.5, -f.r * 0.5), {
            vx: rand(20, -20), vy: rand(-40, -110), life: rand(0.9, 0.4), size: rand(5, 1),
            color: Math.random() > 0.5 ? '#ff9b55' : '#ff5b36', type: 'ember', glow: true
          });
        }
      } else if (f.type === 'thunder') {
        f.tick = 0.23;
        f.strikes++;
        const a = Math.random() * TAU, rr = Math.random() * f.r;
        const tx = f.x + Math.cos(a) * rr, ty = f.y + Math.sin(a) * rr * 0.8;
        addBolt(tx, ty - 260, tx, ty, f.color, 0.22, 4);
        addRing(tx, ty, f.color, 5, 58, 0.35, 3);
        addBurstParticles(tx, ty, f.color, 12, 3.2);
        if (dist(player.x, player.y, tx, ty) < 60) shakeScreen(2);
        for (const e of enemies) {
          if (!e.dead && !e.dormant && dist(e.x, e.y, tx, ty) < 66 + e.radius) {
            damageEnemy(e, charAtk(currentChar()) * 0.68, 'electro', { secondary: true, critChance: 0.22 });
          }
        }
      }
    }
  }
}

/* ------------------------------- pickups -------------------------------- */
function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.life -= dt; p.bob += dt * 3.2;
    const d = dist(p.x, p.y, player.x, player.y);
    if (d < 190 && p.life < 14) {
      const a = angleTo(p.x, p.y, player.x, player.y);
      const pull = p.kind === 'mora' ? 260 : 190;
      p.vx = lerp(p.vx, Math.cos(a) * pull, 0.16);
      p.vy = lerp(p.vy, Math.sin(a) * pull, 0.16);
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    if (d < 26) {
      if (p.kind === 'mora') { progress.mora += p.value; AudioEngine.sfx('coin'); }
      else if (p.kind === 'heal') {
        const c = currentChar(); c.hp = Math.min(c.maxHp, c.hp + Math.round(c.maxHp * p.value));
        addText(player.x, player.y - 75, `+${Math.round(c.maxHp * p.value)}`, '#9fe8b9', 14, { vy: -28 });
        AudioEngine.sfx('heal');
      } else if (p.kind === 'energy') {
        gainEnergy(p.value, true);
        addText(player.x, player.y - 70, '元素能量 +' + p.value, '#c9a8ff', 11, { vy: -26 });
        AudioEngine.sfx('pickup');
      }
      for (let k = 0; k < 5; k++) addParticle(p.x, p.y - 4, { vx: rand(40, -40), vy: rand(-50, -10), life: 0.4, size: 2, color: p.kind === 'heal' ? '#9fe8b9' : p.kind === 'energy' ? '#c9a8ff' : '#ffd782', type: 'spark', glow: true });
      pickups.splice(i, 1);
      updateHUD();
      continue;
    }
    if (p.life <= 0) pickups.splice(i, 1);
  }
}

/* ------------------------------- herbs ---------------------------------- */
function updateHerbs(dt) {
  for (const h of herbs) {
    if (h.collected) continue;
    h.bob += dt * 2.2;
    if (dist(player.x, player.y, h.x, h.y) < 42) {
      h.collected = true;
      progress.herbs.push(h.id);
      addBurstParticles(h.x, h.y - 10, '#bff4c8', 12, 2.2, 'heal');
      addText(h.x, h.y - 30, '灯芯草 +1', '#c8f0c8', 12, { vy: -26 });
      AudioEngine.sfx('pickup');
      if (progress.side === 1) {
        const count = progress.herbs.length;
        showToast(`灯芯草 <b>${Math.min(count, 5)} / 5</b>`);
        if (count >= 5) {
          showToast('灯芯草已经采齐，回去找小满吧。');
          addText(player.x, player.y - 80, '任务目标完成', '#f3dfad', 14, { life: 2 });
        }
      }
      updateHUD();
      saveGame();
    }
  }
}

/* ------------------------------ particles ------------------------------- */
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.vx *= Math.pow(p.drag, dt * 60);
    p.vy = p.vy * Math.pow(p.drag, dt * 60) + p.gravity * dt * 60;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.rot += p.spin * dt;
  }
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i];
    t.life -= dt;
    if (t.life <= 0) { texts.splice(i, 1); continue; }
    t.y += t.vy * dt; t.x += t.vx * dt;
    t.vy *= 0.97; t.vx *= 0.97;
  }
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.life -= dt;
    if (e.type === 'delayed') {
      e.delay -= dt;
      if (e.delay <= 0) { e.fn(); effects.splice(i, 1); }
      continue;
    }
    if (e.life <= 0) effects.splice(i, 1);
  }
}

/* -------------------------------- camera -------------------------------- */
function updateCamera(dt) {
  if (game.mode === 'title') {
    game.titleTime += dt;
    camera.x = 1730 + Math.sin(game.titleTime * 0.045) * 290;
    camera.y = 1590 + Math.cos(game.titleTime * 0.033) * 180;
    return;
  }
  const lookX = clamp((input.mouse.wx - player.x) * 0.09, -55, 55);
  const lookY = clamp((input.mouse.wy - player.y) * 0.07, -40, 40);
  camera.tx = player.x + lookX;
  camera.ty = player.y + lookY - 20;
  const k = 1 - Math.exp(-5.4 * dt);
  camera.x = lerp(camera.x, camera.tx, k);
  camera.y = lerp(camera.y, camera.ty, k);
}

function clampCamera() {
  const hw = vw / 2 / camera.zoom, hh = vh / 2 / camera.zoom;
  camera.x = clamp(camera.x, hw, WORLD.w - hw);
  camera.y = clamp(camera.y, hh, WORLD.h - hh);
}

/* ------------------------------- progress -------------------------------- */
function collectShrine(s) {
  if (s.collected) return;
  if (shrineGuardsAlive(s)) { showToast('先击败祭坛附近的守卫。'); return; }
  if (progress.main === 0) {
    progress.main = 1;
    showToast('星辉在你掌心苏醒 · 也许该去风起驿站问问岚');
    updateQuestUI();
  }
  s.collected = true;
  progress.shards[s.index] = true;
  const count = progress.shards.filter(Boolean).length;
  addRing(s.x, s.y, '#f3dfad', 12, 160, 0.9, 5);
  addBurstParticles(s.x, s.y - 40, ELEMENTS[s.element].color, 40, 5, 'star');
  addText(s.x, s.y - 80, `星辉碎片 ${count} / 3`, '#f7e6b9', 16, { life: 2.2, vy: -22 });
  AudioEngine.sfx('chest');
  shakeScreen(4);
  if (count >= 3) {
    progress.main = 2;
    showObjective('星辉重聚', '回到风起驿站，将三枚碎片交给岚');
    saveGame();
  } else {
    showToast(`已取回星辉碎片 <b>${count} / 3</b>`);
  }
  updateQuestUI();
  updateHUD();
  saveGame();
}

function openChest(c) {
  if (c.opened) return;
  c.opened = true;
  c.openAnim = 1;
  progress.chests.push(c.id);
  const table = c.rarity === 'precious' ? { mora: 260, xp: 70 } : c.rarity === 'exquisite' ? { mora: 120, xp: 36 } : { mora: 55, xp: 18 };
  const bonus = c.boss ? 600 : 0;
  progress.mora += table.mora + bonus;
  gainXp(table.xp);
  for (let i = 0; i < 22; i++) {
    addParticle(c.x + rand(30, -30), c.y - 20, {
      vx: rand(90, -90), vy: rand(-40, -160), life: rand(1.2, 0.4), size: rand(4, 1),
      color: i % 3 === 0 ? '#fff3c4' : '#e8bf67', type: 'star', glow: true, gravity: 2
    });
  }
  addRing(c.x, c.y - 8, '#f3dfad', 6, 85, 0.7, 3);
  addText(c.x, c.y - 55, `摩拉 +${table.mora + bonus}`, '#ffe5a3', 16, { life: 1.8, vy: -28 });
  AudioEngine.sfx('chest');
  showToast(`开启${c.rarity === 'precious' ? '华丽的' : c.rarity === 'exquisite' ? '精致的' : '普通的'}宝箱 · 摩拉 <b>+${table.mora + bonus}</b>`);
  if (c.boss) {
    showObjective('星渊的回响', '回到风起驿站，将一切告诉岚');
  }
  updateHUD(); updateQuestUI(); saveGame();
}

/* ================================ RENDER ================================ */
function pathRoundRect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function ellipse(g, x, y, rx, ry, rot = 0) { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); }
function inView(x, y, pad = 180) {
  const hw = vw / 2 / camera.zoom + pad, hh = vh / 2 / camera.zoom + pad;
  return x > camera.x - hw && x < camera.x + hw && y > camera.y - hh && y < camera.y + hh;
}

function render(now) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#081016';
  ctx.fillRect(0, 0, vw, vh);
  if (!game.loaded) return;

  const t = now * 0.001;
  ctx.save();
  const shx = game.shake ? rand(game.shake, -game.shake) : 0;
  const shy = game.shake ? rand(game.shake, -game.shake) : 0;
  ctx.translate(vw / 2 + shx, vh / 2 + shy);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  drawTerrain();
  drawWater(t);
  drawCloudShadows(t);
  drawGroundFlora(t);
  drawTelegraphs(t);
  drawSeal(t);
  drawArenaBarrier(t);
  drawFields(t);
  drawEntityLayer(t);
  drawProjectiles(t);
  drawParticles(t);
  drawEffects(t);
  drawFloatingTexts();
  ctx.restore();

  drawLighting(t);
  ctx.save();
  ctx.translate(vw / 2 + shx, vh / 2 + shy);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);
  drawLocalLights(t);
  drawQuestBeacons(t);
  drawAmbientMotes(t);
  ctx.restore();

  drawScreenGrade(t);
  drawOffscreenQuestArrow();
  drawMiniMap(t);
}

function drawTerrain() {
  const scale = TERRAIN_SIZE / WORLD.w;
  const pad = 80;
  const x0 = clamp(camera.x - vw / 2 / camera.zoom - pad, 0, WORLD.w);
  const y0 = clamp(camera.y - vh / 2 / camera.zoom - pad, 0, WORLD.h);
  const x1 = clamp(camera.x + vw / 2 / camera.zoom + pad, 0, WORLD.w);
  const y1 = clamp(camera.y + vh / 2 / camera.zoom + pad, 0, WORLD.h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(terrainCanvas,
    Math.floor(x0 * scale), Math.floor(y0 * scale),
    Math.ceil((x1 - x0) * scale), Math.ceil((y1 - y0) * scale),
    x0, y0, x1 - x0, y1 - y0);
}

function drawWater(t) {
  if (!inView(810, 2345, 650)) return;
  const cx = 810, cy = 2345, rx = 505, ry = 386;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0.02, 0, TAU);
  ctx.ellipse(690, 2435, 118, 98, 0.1, 0, TAU);
  ctx.clip('evenodd');

  // deep water glow
  const g = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
  g.addColorStop(0, 'rgba(88,176,196,.08)');
  g.addColorStop(0.55, 'rgba(32,98,130,.12)');
  g.addColorStop(1, 'rgba(21,67,94,.16)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);

  ctx.lineCap = 'round';
  for (let row = 0; row < 28; row++) {
    const yy = cy - ry + (row + 0.5) * (ry * 2 / 28) + Math.sin(t * 0.9 + row * 0.8) * 3;
    const half = rx * Math.sqrt(Math.max(0, 1 - Math.pow((yy - cy) / ry, 2))) * 1.02;
    const alpha = 0.055 + 0.04 * (0.5 + 0.5 * Math.sin(t * 1.5 + row));
    ctx.strokeStyle = row % 3 === 0 ? `rgba(189,239,243,${alpha + 0.03})` : `rgba(126,208,223,${alpha})`;
    ctx.lineWidth = row % 4 === 0 ? 1.4 : 1;
    ctx.beginPath();
    for (let x = cx - half; x <= cx + half; x += 26) {
      const ya = yy + Math.sin(x * 0.018 + t * 1.7 + row) * 2.4;
      if (x === cx - half) ctx.moveTo(x, ya); else ctx.lineTo(x, ya);
    }
    ctx.stroke();
  }
  // glints
  for (let i = 0; i < 34; i++) {
    const a = i * 2.399 + Math.sin(t * 0.25 + i) * 0.2;
    const rr = Math.sqrt((i * 0.618) % 1) * 0.92;
    const x = cx + Math.cos(a) * rx * rr;
    const y = cy + Math.sin(a) * ry * rr;
    if (!isWater(x, y)) continue;
    const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 2.1 + i * 1.7));
    ctx.strokeStyle = `rgba(231,253,255,${0.22 * tw})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x - 6 * tw, y); ctx.lineTo(x + 6 * tw, y); ctx.stroke();
  }
  ctx.restore();

  // shore foam
  ctx.save();
  ctx.strokeStyle = 'rgba(215,240,232,.28)';
  ctx.lineWidth = 1.6;
  ctx.setLineDash([28, 34]);
  ctx.lineDashOffset = -t * 14;
  ctx.beginPath(); ctx.ellipse(cx, cy, rx - 2, ry - 2, 0.02, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // player ripple
  if (player.inWater) {
    ctx.save();
    ctx.strokeStyle = 'rgba(210,246,255,.35)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      const rr = 12 + i * 8 + Math.sin(t * 3 + i) * 2;
      ctx.beginPath(); ctx.ellipse(player.x, player.y + 2, rr, rr * 0.42, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }
}

function drawCloudShadows(t) {
  if (game.mode === 'title') return;
  ctx.save();
  for (let i = 0; i < 4; i++) {
    const x = ((t * (7 + i * 2) + i * 930) % (WORLD.w + 1100)) - 550;
    const y = 500 + i * 720 + Math.sin(t * 0.04 + i) * 180;
    const g = ctx.createRadialGradient(x, y, 10, x, y, 430);
    g.addColorStop(0, 'rgba(18,34,38,.085)');
    g.addColorStop(0.6, 'rgba(18,34,38,.045)');
    g.addColorStop(1, 'rgba(18,34,38,0)');
    ctx.fillStyle = g;
    ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.55); ctx.beginPath(); ctx.arc(0, 0, 430, 0, TAU); ctx.fill(); ctx.restore();
  }
  ctx.restore();
}

function drawGroundFlora(t) {
  for (const d of decor) {
    if (d.type !== 'grass') continue;
    if (!inView(d.x, d.y, 60)) continue;
    const sway = Math.sin(t * 1.5 + d.phase) * 2.2;
    const h = (7 + (d.scale - 0.7) * 10);
    ctx.strokeStyle = (d.x > 2050 && d.y < 1450) ? 'rgba(214,167,92,.55)' : 'rgba(143,180,103,.55)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(d.x, d.y);
    ctx.quadraticCurveTo(d.x + sway * 0.5, d.y - h * 0.6, d.x + sway, d.y - h);
    ctx.moveTo(d.x - 1.5, d.y);
    ctx.quadraticCurveTo(d.x - 2 + sway * 0.4, d.y - h * 0.5, d.x - 3 + sway * 0.7, d.y - h * 0.72);
    ctx.stroke();
    if (d.scale > 1.2) {
      ctx.fillStyle = 'rgba(240,225,178,.5)';
      ctx.beginPath(); ctx.arc(d.x + sway, d.y - h, 1.3, 0, TAU); ctx.fill();
    }
  }
}

function drawTelegraphs(t) {
  ctx.save();
  for (const e of enemies) {
    if (e.dead || e.dormant) continue;
    if (e.boss) continue;
    if (e.windup > 0) {
      const a = e.facing;
      const rad = e.attackRange + 30;
      ctx.fillStyle = 'rgba(255,88,78,.10)';
      ctx.strokeStyle = 'rgba(255,120,100,.42)';
      ctx.lineWidth = 1.5;
      if (e.ranged) {
        ctx.setLineDash([7, 9]);
        ctx.beginPath(); ctx.moveTo(e.x, e.y - 20); ctx.lineTo(player.x, player.y - 20); ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(e.x, e.y, 34 + Math.sin(t * 18) * 3, 0, TAU); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.moveTo(e.x, e.y);
        ctx.arc(e.x, e.y, rad, a - 0.6, a + 0.6); ctx.closePath();
        ctx.fill();
        ctx.beginPath(); ctx.arc(e.x, e.y, rad, a - 0.6, a + 0.6); ctx.stroke();
      }
    }
  }
  if (boss && !boss.dead && game.bossStarted) {
    for (const c of (boss.casts || [])) {
      ctx.fillStyle = 'rgba(255,90,55,.10)';
      ctx.strokeStyle = 'rgba(255,140,90,.62)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(c.x, c.y, Math.max(2, c.r * clamp(c.delay, 0, 1)), 0, TAU); ctx.strokeStyle = 'rgba(255,220,170,.55)'; ctx.stroke();
      ctx.beginPath(); ctx.arc(c.x, c.y, 4, 0, TAU); ctx.fillStyle = 'rgba(255,200,150,.7)'; ctx.fill();
    }
    if (boss.action?.name === 'nova' && boss.action.stage === 0) {
      const p = clamp(boss.action.t / 0.72, 0, 1);
      ctx.fillStyle = `rgba(255,90,55,${0.05 + p * 0.1})`;
      ctx.strokeStyle = `rgba(255,150,100,${0.25 + p * 0.5})`;
      ctx.lineWidth = 2 + p * 4;
      ctx.beginPath(); ctx.arc(boss.x, boss.y, 290 * (0.4 + p * 0.6), 0, TAU); ctx.fill(); ctx.stroke();
    }
  }
  ctx.restore();
}

function drawSeal(t) {
  if (progress.main >= 3 || game.bossDefeated) return;
  const x = 2388, y = 2322;
  if (!inView(x, y, 220)) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(8,14,18,.3)';
  ctx.beginPath(); ctx.ellipse(0, 4, 66, 12, 0, 0, TAU); ctx.fill();
  // stone posts
  for (const sx of [-54, 54]) {
    ctx.fillStyle = '#5d5769'; ctx.fillRect(sx - 8, -92, 16, 92);
    ctx.fillStyle = '#7a728c'; ctx.fillRect(sx - 5, -88, 8, 84);
    ctx.fillStyle = '#484353'; ctx.fillRect(sx - 12, -96, 24, 8);
    ctx.fillStyle = `rgba(243,223,173,${0.3 + Math.sin(t * 2 + sx) * 0.15})`;
    ctx.beginPath(); ctx.arc(sx, -64, 3, 0, TAU); ctx.fill();
  }
  // barrier
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(0, -92, 0, 0);
  g.addColorStop(0, 'rgba(243,223,173,.03)');
  g.addColorStop(0.55, 'rgba(243,223,173,.11)');
  g.addColorStop(1, 'rgba(120,220,220,.14)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(-46, 0); ctx.lineTo(-46, -88); ctx.quadraticCurveTo(0, -102, 46, -88); ctx.lineTo(46, 0); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = `rgba(243,223,173,${0.35 + Math.sin(t * 1.8) * 0.15})`;
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 4; i++) {
    const yy = -18 - i * 19;
    ctx.beginPath(); ctx.moveTo(-42, yy); ctx.quadraticCurveTo(0, yy - 9, 42, yy); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,238,188,.75)';
  ctx.font = '9px "STKaiti","KaiTi",serif'; ctx.textAlign = 'center';
  ctx.fillText('星 辉 封 印', 0, -50);
  ctx.restore();
}

function drawArenaBarrier(t) {
  if (!game.bossStarted || game.bossDefeated) return;
  if (!inView(2700, 2510, 430)) return;
  ctx.save();
  ctx.translate(2700, 2510);
  ctx.globalCompositeOperation = 'lighter';
  const pulse = 0.65 + Math.sin(t * 2.5) * 0.2;
  ctx.strokeStyle = `rgba(255,126,80,${0.3 * pulse})`;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 326, 0, TAU); ctx.stroke();
  ctx.strokeStyle = `rgba(255,190,120,${0.2 * pulse})`;
  ctx.setLineDash([18, 28]);
  ctx.lineDashOffset = -t * 30;
  ctx.beginPath(); ctx.arc(0, 0, 320, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * TAU + t * 0.04;
    const x = Math.cos(a) * 326, y = Math.sin(a) * 326 * 0.98;
    ctx.fillStyle = `rgba(255,180,120,${0.25 + 0.25 * Math.sin(t * 3 + i)})`;
    ctx.beginPath(); ctx.arc(x, y, 2.2, 0, TAU); ctx.fill();
  }
  // vertical shimmer at the barrier edge nearest camera
  const g = ctx.createLinearGradient(0, -326, 0, -240);
  g.addColorStop(0, 'rgba(255,120,70,0)');
  g.addColorStop(0.6, `rgba(255,140,90,${0.045 * pulse})`);
  g.addColorStop(1, 'rgba(255,140,90,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-326, -326, 652, 90);
  ctx.restore();
}

function drawFields(t) {
  for (const f of fields) {
    if (!inView(f.x, f.y, f.r + 100)) continue;
    ctx.save();
    const a = clamp(f.life / 0.8, 0, 1);
    if (f.type === 'vortex') {
      ctx.globalAlpha = 0.18 * a;
      const g = ctx.createRadialGradient(f.x, f.y, 8, f.x, f.y, f.r);
      g.addColorStop(0, 'rgba(195,255,243,.12)');
      g.addColorStop(0.65, 'rgba(85,215,195,.08)');
      g.addColorStop(1, 'rgba(85,215,195,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.7 * a;
      for (let k = 0; k < 5; k++) {
        const a0 = t * 2.6 + k / 5 * TAU;
        ctx.strokeStyle = k % 2 ? 'rgba(180,255,242,.5)' : 'rgba(99,217,194,.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let s = 0; s < 12; s++) {
          const rr = f.r * (0.18 + s / 12 * 0.82);
          const aa = a0 + s * 0.24;
          const x = f.x + Math.cos(aa) * rr, y = f.y + Math.sin(aa) * rr * 0.7;
          if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    } else if (f.type === 'hydro') {
      ctx.globalAlpha = 0.22 * a;
      const g = ctx.createRadialGradient(f.x, f.y, 10, f.x, f.y, f.r);
      g.addColorStop(0, 'rgba(154,231,255,.24)');
      g.addColorStop(0.6, 'rgba(65,154,220,.12)');
      g.addColorStop(1, 'rgba(65,154,220,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.65 * a;
      ctx.strokeStyle = 'rgba(174,237,255,.7)';
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 4; k++) {
        const rr = f.r * (0.55 + k * 0.12);
        ctx.beginPath(); ctx.ellipse(f.x, f.y, rr, rr * 0.62, 0, 0, TAU); ctx.stroke();
      }
    } else if (f.type === 'fire') {
      ctx.globalAlpha = 0.18 * a;
      const g = ctx.createRadialGradient(f.x, f.y, 10, f.x, f.y, f.r);
      g.addColorStop(0, 'rgba(255,180,90,.3)');
      g.addColorStop(0.7, 'rgba(255,90,40,.12)');
      g.addColorStop(1, 'rgba(255,90,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,150,86,.55)';
      ctx.setLineDash([12, 15]);
      ctx.lineDashOffset = -t * 25;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 0.8, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    } else if (f.type === 'thunder') {
      ctx.globalAlpha = 0.2 * a;
      const g = ctx.createRadialGradient(f.x, f.y, 8, f.x, f.y, f.r);
      g.addColorStop(0, 'rgba(202,164,255,.24)');
      g.addColorStop(0.7, 'rgba(146,95,235,.1)');
      g.addColorStop(1, 'rgba(146,95,235,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(201,168,255,.6)';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 10]);
      ctx.lineDashOffset = t * 30;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 0.85, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }
}

/* ---------------------------- entity draw list --------------------------- */
function drawEntityLayer(t) {
  const list = [];
  for (const d of decor) {
    if (d.type === 'grass') continue;
    if (!inView(d.x, d.y, 240)) continue;
    list.push({ y: d.y, kind: 'decor', obj: d });
  }
  for (const h of houses) if (inView(h.x, h.y, 250)) list.push({ y: h.y, kind: 'house', obj: h });
  for (const n of npcs) if (inView(n.x, n.y, 160)) list.push({ y: n.y, kind: 'npc', obj: n });
  for (const s of shrines) if (inView(s.x, s.y, 180)) list.push({ y: s.y, kind: 'shrine', obj: s });
  for (const c of chests) if (!c.opened || inView(c.x, c.y, 100)) list.push({ y: c.y, kind: 'chest', obj: c });
  for (const h of herbs) if (!h.collected && inView(h.x, h.y, 80)) list.push({ y: h.y, kind: 'herb', obj: h });
  for (const e of enemies) {
    if (e.dead && e.deathTime > 1.5) continue;
    if (!inView(e.x, e.y, 220)) continue;
    list.push({ y: e.y + (e.boss ? 10 : 0), kind: 'enemy', obj: e });
  }
  list.push({ y: player.y + 0.5, kind: 'player' });
  list.sort((a, b) => a.y - b.y);
  for (const item of list) {
    if (item.kind === 'decor') drawDecor(item.obj, t);
    else if (item.kind === 'house') drawHouse(item.obj, t);
    else if (item.kind === 'npc') drawNPC(item.obj, t);
    else if (item.kind === 'shrine') drawShrine(item.obj, t);
    else if (item.kind === 'chest') drawChest(item.obj, t);
    else if (item.kind === 'herb') drawHerb(item.obj, t);
    else if (item.kind === 'enemy') drawEnemy(item.obj, t);
    else drawPlayerFigure(t);
  }
  // interaction halo after sorted
  drawInteractionHalo(t);
}

function drawInteractionHalo(t) {
  if (game.mode !== 'playing' || !interactionTarget) return;
  const it = interactionTarget;
  const locked = !!it.locked;
  const col = locked ? '255,93,99' : '243,223,173';
  const pulse = 0.65 + Math.sin(t * 3.2) * 0.25;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgba(${col},${0.55 * pulse})`;
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.ellipse(it.x, it.y + 1, 28 + pulse * 4, 9 + pulse * 2, 0, 0, TAU); ctx.stroke();
  ctx.strokeStyle = `rgba(${col},${0.2 * pulse})`;
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.ellipse(it.x, it.y + 1, 32 + pulse * 5, 11 + pulse * 2, 0, 0, TAU); ctx.stroke();
  ctx.fillStyle = `rgba(${col},${0.55 * pulse})`;
  for (let i = 0; i < 3; i++) {
    const a = t * 1.4 + i / 3 * TAU;
    ctx.beginPath();
    ctx.arc(it.x + Math.cos(a) * (26 + pulse * 3), it.y + Math.sin(a) * 8, 1.5, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawDecor(d, t) {
  if (d.type === 'tree') {
    const sc = d.scale;
    ctx.save();
    ctx.fillStyle = 'rgba(10,24,20,.22)';
    ctx.beginPath(); ctx.ellipse(d.x + 14 * sc, d.y + 2, 38 * sc, 12 * sc, -0.2, 0, TAU); ctx.fill();
    ctx.translate(d.x, d.y);
    ctx.rotate(Math.sin(t * 0.6 + d.phase) * 0.012);
    const spr = treeSprites[d.kind][d.variant % 5];
    const w = 230 * sc, h = 300 * sc;
    // fade foreground trees that would hide the player
    const nearPlayer = dist(d.x, d.y - 90 * sc, player.x, player.y - 25) < 125 && d.y > player.y - 20;
    ctx.globalAlpha = nearPlayer ? 0.38 : 0.98;
    ctx.drawImage(spr, -w / 2, -h + 12 * sc, w, h);
    ctx.restore();
  } else if (d.type === 'rock') {
    const sc = d.scale;
    ctx.save();
    ctx.fillStyle = 'rgba(10,20,18,.2)';
    ctx.beginPath(); ctx.ellipse(d.x + 8 * sc, d.y + 1, 31 * sc, 9 * sc, -0.1, 0, TAU); ctx.fill();
    const spr = rockSprites[d.variant % 5];
    ctx.drawImage(spr, d.x - 65 * sc, d.y - 92 * sc, 130 * sc, 100 * sc);
    ctx.restore();
  } else if (d.type === 'bush') {
    const sc = d.scale;
    ctx.save();
    ctx.fillStyle = 'rgba(10,22,17,.18)';
    ctx.beginPath(); ctx.ellipse(d.x + 5 * sc, d.y + 1, 30 * sc, 8 * sc, 0, 0, TAU); ctx.fill();
    const spr = bushSprites[d.kind][d.variant % 4];
    ctx.drawImage(spr, d.x - 65 * sc, d.y - 92 * sc, 130 * sc, 100 * sc);
    ctx.restore();
  } else if (d.type === 'pillar') {
    drawPillar(d, t);
  } else if (d.type === 'lantern') {
    drawLantern(d, t);
  } else if (d.type === 'fence') {
    drawFence(d, t);
  } else if (d.type === 'stall') {
    drawStall(d, t);
  } else if (d.type === 'well') {
    drawWell(d, t);
  } else if (d.type === 'signpost') {
    drawSignpost(d, t);
  } else if (d.type === 'campfire') {
    drawCampfire(d, t);
  } else if (d.type === 'tent') {
    drawTent(d, t);
  } else if (d.type === 'shrineRuin') {
    drawShrineRuin(d, t);
  }
}

function drawPillar(d, t) {
  const s = d.scale;
  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.fillStyle = 'rgba(12,14,24,.26)';
  ctx.beginPath(); ctx.ellipse(10 * s, 2, 28 * s, 8 * s, -0.15, 0, TAU); ctx.fill();
  ctx.fillStyle = '#5a5368';
  ctx.beginPath(); ctx.moveTo(-20 * s, 0); ctx.lineTo(-14 * s, -78 * s); ctx.lineTo(14 * s, -86 * s); ctx.lineTo(21 * s, -4 * s); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#797089';
  ctx.beginPath(); ctx.moveTo(-13 * s, -72 * s); ctx.lineTo(0, -92 * s); ctx.lineTo(15 * s, -79 * s); ctx.lineTo(13 * s, -6 * s); ctx.lineTo(-2 * s, -2 * s); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#464052'; ctx.fillRect(-22 * s, -6 * s, 45 * s, 8 * s);
  ctx.strokeStyle = 'rgba(211,184,120,.4)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-4 * s, -45 * s); ctx.lineTo(4 * s, -54 * s); ctx.lineTo(-2 * s, -63 * s); ctx.lineTo(5 * s, -69 * s); ctx.stroke();
  ctx.fillStyle = `rgba(195,170,120,${0.18 + 0.12 * Math.sin(t * 1.4 + d.phase)})`;
  ctx.beginPath(); ctx.arc(1 * s, -57 * s, 4 * s, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawLantern(d, t) {
  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.strokeStyle = '#4b4032'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -52); ctx.stroke();
  ctx.fillStyle = '#d3ab61';
  ctx.beginPath(); ctx.moveTo(-10, -52); ctx.quadraticCurveTo(0, -66, 10, -52); ctx.closePath(); ctx.fill();
  const glow = 0.6 + Math.sin(t * 3 + d.phase) * 0.15;
  ctx.fillStyle = `rgba(255,204,112,${glow})`;
  ctx.fillRect(-6, -48, 12, 15);
  ctx.strokeStyle = '#8b6b40'; ctx.lineWidth = 1;
  ctx.strokeRect(-7, -49, 14, 17);
  ctx.restore();
}

function drawFence(d, t) {
  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.strokeStyle = '#6a5038'; ctx.fillStyle = '#7e6347';
  for (let i = -3; i <= 3; i++) {
    ctx.fillRect(i * 15, -22, 3, 22);
    ctx.beginPath(); ctx.moveTo(i * 15, -22); ctx.lineTo(i * 15 + 1.5, -27); ctx.lineTo(i * 15 + 3, -22); ctx.fill();
  }
  ctx.fillRect(-47, -17, 94, 3);
  ctx.fillRect(-47, -9, 94, 3);
  ctx.restore();
}

function drawStall(d, t) {
  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(0, 2, 48, 10, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#7d5d3e'; ctx.fillRect(-38, -32, 76, 30);
  ctx.fillStyle = '#a98252'; ctx.fillRect(-38, -32, 76, 5);
  ctx.fillStyle = '#4e7469';
  ctx.beginPath(); ctx.moveTo(-48, -52); ctx.lineTo(0, -68); ctx.lineTo(48, -52); ctx.lineTo(38, -34); ctx.lineTo(-38, -34); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#d9c59a';
  for (let i = -3; i <= 3; i += 2) {
    ctx.beginPath(); ctx.moveTo(i * 12, -51); ctx.lineTo(i * 12 + 7, -51); ctx.lineTo(i * 12 + 3, -35); ctx.lineTo(i * 12 - 4, -35); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#b84d3e'; ctx.beginPath(); ctx.arc(-19, -43, 4, 0, TAU); ctx.fill();
  ctx.fillStyle = '#e0b15d'; ctx.beginPath(); ctx.arc(18, -41, 5, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawWell(d, t) {
  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(0, 3, 30, 9, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#777368'; ctx.beginPath(); ctx.ellipse(0, -8, 25, 13, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#3b4c51'; ctx.beginPath(); ctx.ellipse(0, -9, 17, 8, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#898478'; ctx.fillRect(-25, -8, 50, 12);
  ctx.strokeStyle = '#5b4632'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-18, -12); ctx.lineTo(-18, -48); ctx.moveTo(18, -12); ctx.lineTo(18, -48); ctx.stroke();
  ctx.fillStyle = '#517067';
  ctx.beginPath(); ctx.moveTo(-26, -47); ctx.lineTo(0, -63); ctx.lineTo(26, -47); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawSignpost(d, t) {
  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.fillStyle = '#59452f'; ctx.fillRect(-2, -56, 4, 56);
  ctx.fillStyle = '#8b6a43'; ctx.fillRect(-18, -58, 38, 12);
  ctx.fillStyle = '#2f2a20'; ctx.font = '7px "Microsoft YaHei"'; ctx.textAlign = 'center'; ctx.fillText('风起驿站', 1, -49);
  ctx.fillStyle = '#8b6a43'; ctx.fillRect(-6, -40, 30, 10);
  ctx.restore();
}

function drawCampfire(d, t) {
  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.fillStyle = '#4e463b';
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * TAU, x = Math.cos(a) * 16, y = Math.sin(a) * 7;
    ctx.beginPath(); ctx.ellipse(x, y, 5, 3.4, a, 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = '#5d3c25'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(-9, -3); ctx.lineTo(8, -7); ctx.moveTo(-8, -7); ctx.lineTo(9, -2); ctx.stroke();
  for (let i = 0; i < 3; i++) {
    const h = 15 + i * 8 + Math.sin(t * 7 + i) * 3;
    ctx.fillStyle = i === 0 ? 'rgba(255,90,40,.9)' : i === 1 ? 'rgba(255,171,62,.8)' : 'rgba(255,231,150,.75)';
    ctx.beginPath(); ctx.moveTo(-7, -4); ctx.quadraticCurveTo(-2, -h, 1, -4); ctx.quadraticCurveTo(5, -h * 0.7, 7, -4); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function drawTent(d, t) {
  ctx.save();
  ctx.translate(d.x, d.y);
  if (d.flip) ctx.scale(-1, 1);
  ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(0, 2, 42, 9, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#8a6141';
  ctx.beginPath(); ctx.moveTo(-42, 0); ctx.lineTo(-5, -55); ctx.lineTo(20, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#a97a50';
  ctx.beginPath(); ctx.moveTo(-35, 0); ctx.lineTo(-7, -47); ctx.lineTo(2, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#3e2c20'; ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-2, -24); ctx.lineTo(5, 0); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#5f422c'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(20, -20); ctx.stroke();
  ctx.restore();
}

function drawShrineRuin(d, t) {
  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.fillStyle = 'rgba(8,12,16,.25)'; ctx.beginPath(); ctx.ellipse(0, 2, 33, 9, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#6a6475'; ctx.fillRect(-28, -12, 56, 12);
  ctx.fillStyle = '#7d7688';
  ctx.beginPath(); ctx.moveTo(-24, -10); ctx.lineTo(-16, -62); ctx.lineTo(-5, -68); ctx.lineTo(-2, -10); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#595366';
  ctx.beginPath(); ctx.moveTo(14, -10); ctx.lineTo(20, -48); ctx.lineTo(31, -44); ctx.lineTo(28, -10); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#4c4659'; ctx.fillRect(-18, -10, 48, 6);
  ctx.restore();
}

/* ---------------------------------- houses ------------------------------- */
function drawHouse(h, t) {
  const w = h.w, hh = h.h;
  ctx.save();
  ctx.translate(h.x, h.y);
  if (h.flip) ctx.scale(-1, 1);
  ctx.fillStyle = 'rgba(9,16,18,.28)';
  ctx.beginPath(); ctx.ellipse(10, 3, w * 0.6, 20, -0.08, 0, TAU); ctx.fill();
  // stone base
  ctx.fillStyle = '#8a7c68';
  ctx.fillRect(-w / 2 + 6, -20, w - 12, 22);
  ctx.fillStyle = '#a5967e';
  ctx.fillRect(-w / 2 + 6, -20, w - 12, 5);
  // wall
  const wallTop = -hh * 0.7;
  ctx.fillStyle = '#d8c8a8';
  ctx.beginPath();
  ctx.moveTo(-w / 2 + 10, wallTop);
  ctx.lineTo(w / 2 - 10, wallTop);
  ctx.lineTo(w / 2 - 7, -16);
  ctx.lineTo(-w / 2 + 7, -16);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(106,80,53,.12)';
  ctx.fillRect(-w / 2 + 10, wallTop + 6, w - 20, 4);
  // timber frame
  ctx.strokeStyle = '#6c4f35'; ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-w / 2 + 10, wallTop + 3); ctx.lineTo(w / 2 - 10, wallTop + 3);
  ctx.moveTo(-w / 2 + 13, wallTop); ctx.lineTo(-w / 2 + 13, -16);
  ctx.moveTo(w / 2 - 13, wallTop); ctx.lineTo(w / 2 - 13, -16);
  ctx.moveTo(-w / 2 + 10, wallTop + 3); ctx.lineTo(-w / 2 + 32, -16);
  ctx.moveTo(w / 2 - 10, wallTop + 3); ctx.lineTo(w / 2 - 32, -16);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(88,62,40,.5)'; ctx.lineWidth = 2;
  for (let x = -w / 2 + 28; x < w / 2 - 20; x += 24) {
    ctx.beginPath(); ctx.moveTo(x, wallTop + 5); ctx.lineTo(x, -17); ctx.stroke();
  }
  // door
  ctx.fillStyle = '#5d412d';
  ctx.beginPath();
  ctx.moveTo(-16, -16); ctx.lineTo(-16, -50); ctx.quadraticCurveTo(0, -62, 16, -50); ctx.lineTo(16, -16); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#3b2a1e';
  ctx.fillRect(-12, -18, 24, 2);
  ctx.fillStyle = '#d9b66c'; ctx.beginPath(); ctx.arc(9, -34, 2, 0, TAU); ctx.fill();
  // window
  const wx = w / 2 - 48, wy = wallTop + 18;
  ctx.fillStyle = '#f6d38b';
  ctx.fillRect(wx - 12, wy - 12, 24, 22);
  ctx.strokeStyle = '#6c4f35'; ctx.lineWidth = 3;
  ctx.strokeRect(wx - 12, wy - 12, 24, 22);
  ctx.beginPath(); ctx.moveTo(wx, wy - 12); ctx.lineTo(wx, wy + 10); ctx.moveTo(wx - 12, wy - 1); ctx.lineTo(wx + 12, wy - 1); ctx.stroke();
  // roof
  const roofY = wallTop - 2;
  ctx.fillStyle = '#2f5554';
  ctx.beginPath();
  ctx.moveTo(-w / 2 - 18, roofY);
  ctx.quadraticCurveTo(-w / 2 + 10, roofY - 18, -w * 0.18, roofY - 54);
  ctx.quadraticCurveTo(0, roofY - 68, w * 0.18, roofY - 54);
  ctx.quadraticCurveTo(w / 2 - 10, roofY - 18, w / 2 + 18, roofY);
  ctx.quadraticCurveTo(w / 2, roofY + 12, w / 2 - 10, roofY + 10);
  ctx.lineTo(-w / 2 + 10, roofY + 10);
  ctx.quadraticCurveTo(-w / 2, roofY + 12, -w / 2 - 18, roofY);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#426c66';
  ctx.beginPath();
  ctx.moveTo(-w / 2 - 8, roofY + 1);
  ctx.quadraticCurveTo(0, roofY - 48, w / 2 + 8, roofY + 1);
  ctx.quadraticCurveTo(0, roofY - 28, -w / 2 - 8, roofY + 1);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(20,43,42,.55)'; ctx.lineWidth = 2;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(i * w * 0.09, roofY - 43 + Math.abs(i) * 7);
    ctx.quadraticCurveTo(i * w * 0.13, roofY - 12, i * w * 0.18, roofY + 4);
    ctx.stroke();
  }
  // chimney
  ctx.fillStyle = '#8a7b67'; ctx.fillRect(w * 0.24, roofY - 62, 15, 34);
  ctx.fillStyle = '#6d6255'; ctx.fillRect(w * 0.24 - 3, roofY - 64, 21, 6);
  ctx.restore();
}

/* ----------------------------------- NPCs -------------------------------- */
function drawNPC(n, t) {
  const questState = n.id === 'lan' ? progress.main : n.id === 'xiaoman' ? progress.side : -1;
  const showMarker = n.id === 'lan' ? [0, 2, 4].includes(progress.main) : n.id === 'xiaoman' ? progress.side === 0 || (progress.side === 1 && progress.herbs.length >= 5) : false;
  const bob = Math.sin(t * 1.4 + n.x) * 1.2;
  drawCharacterFigure(n.x, n.y, n.palette, {
    scale: n.child ? 0.82 : 0.94, facing: Math.PI / 2 + Math.sin(t * 0.3 + n.x) * 0.15,
    moving: false, animTime: t * 1.4, hairStyle: n.hairStyle, cape: false, child: n.child,
    weapon: 'none'
  });
  if (dist(player.x, player.y, n.x, n.y) < 170) {
    ctx.save();
    ctx.font = '10px "Microsoft YaHei"';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(5,10,13,.6)';
    ctx.fillRect(n.x - 34, n.y - 102, 68, 15);
    ctx.fillStyle = '#e6dcc6';
    ctx.fillText(n.name, n.x, n.y - 91);
    ctx.restore();
  }
  if (showMarker) {
    const my = n.y - 115 + Math.sin(t * 2.2) * 4;
    ctx.save();
    ctx.translate(n.x, my);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = 'rgba(243,223,173,.16)';
    ctx.fillRect(-9, -9, 18, 18);
    ctx.strokeStyle = 'rgba(243,223,173,.8)'; ctx.lineWidth = 1.2;
    ctx.strokeRect(-7, -7, 14, 14);
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = '#f8e8bc'; ctx.font = 'bold 13px "Microsoft YaHei"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('!', 0, 1);
    ctx.restore();
  }
}

/* ---------------------------------- shrines ------------------------------ */
function drawShrine(s, t) {
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.fillStyle = 'rgba(10,16,20,.28)'; ctx.beginPath(); ctx.ellipse(0, 3, 52, 15, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#5e586b'; ctx.beginPath(); ctx.ellipse(0, 0, 48, 17, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#78718a'; ctx.beginPath(); ctx.ellipse(0, -6, 40, 14, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#9189a3'; ctx.beginPath(); ctx.ellipse(0, -10, 30, 10, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(229,201,138,.45)'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.ellipse(0, -10, 25, 8, 0, 0, TAU); ctx.stroke();
  for (let i = 0; i < 3; i++) {
    const a = t * (0.5 + i * 0.15) + i * 2.1;
    const rr = 22 + i * 7;
    ctx.strokeStyle = `rgba(223,193,126,${0.3 + i * 0.12})`;
    ctx.beginPath(); ctx.ellipse(Math.cos(a) * 4, -55 + i * 8, rr, rr * 0.3, a * 0.2, 0, TAU); ctx.stroke();
  }
  if (!s.collected) {
    const cy = -72 + Math.sin(t * 1.8) * 5;
    const el = ELEMENTS[s.element];
    ctx.save();
    ctx.translate(0, cy);
    ctx.rotate(t * 0.4);
    ctx.fillStyle = el.light;
    ctx.shadowColor = el.color; ctx.shadowBlur = 26;
    ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(11, 0); ctx.lineTo(0, 20); ctx.lineTo(-11, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(4, 0); ctx.lineTo(0, 11); ctx.lineTo(-4, 0); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.shadowBlur = 0;
  } else {
    ctx.fillStyle = 'rgba(180,200,210,.25)';
    ctx.beginPath(); ctx.arc(0, -52, 3, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawChest(c, t) {
  const colors = c.rarity === 'precious' ? { wood: '#7a4f2c', metal: '#e2bd65', glow: 'rgba(255,214,125,.4)' } : c.rarity === 'exquisite' ? { wood: '#6c4a2e', metal: '#b9a06e', glow: 'rgba(208,196,150,.18)' } : { wood: '#5e4633', metal: '#89765a', glow: 'rgba(200,190,160,.1)' };
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.fillStyle = 'rgba(8,14,15,.26)'; ctx.beginPath(); ctx.ellipse(0, 2, 28, 8, 0, 0, TAU); ctx.fill();
  const opened = c.opened;
  ctx.fillStyle = colors.wood;
  pathRoundRect(ctx, -23, -25, 46, 25, 4); ctx.fill();
  ctx.strokeStyle = colors.metal; ctx.lineWidth = 2.4;
  ctx.strokeRect(-23, -18, 46, 3);
  ctx.strokeRect(-18, -25, 3, 25);
  ctx.strokeRect(15, -25, 3, 25);
  if (!opened) {
    ctx.fillStyle = '#60452e';
    ctx.beginPath(); ctx.moveTo(-25, -25); ctx.quadraticCurveTo(0, -44, 25, -25); ctx.lineTo(25, -21); ctx.quadraticCurveTo(0, -38, -25, -21); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = colors.metal; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(-25, -24); ctx.quadraticCurveTo(0, -42, 25, -24); ctx.stroke();
    ctx.fillStyle = colors.metal; ctx.fillRect(-4, -24, 8, 9);
    ctx.fillStyle = '#2d2419'; ctx.fillRect(-1.5, -21, 3, 4);
  } else {
    ctx.save();
    ctx.translate(0, -25);
    ctx.rotate(-0.72);
    ctx.fillStyle = '#60452e';
    ctx.beginPath(); ctx.moveTo(-25, 0); ctx.quadraticCurveTo(0, -22, 25, 0); ctx.lineTo(25, 4); ctx.quadraticCurveTo(0, -15, -25, 4); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = colors.metal; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(-25, 1); ctx.quadraticCurveTo(0, -20, 25, 1); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,226,158,.18)';
    ctx.beginPath(); ctx.ellipse(0, -24, 18, 8, 0, 0, TAU); ctx.fill();
  }
  if (!opened) {
    const pulse = 0.5 + Math.sin(t * 2.4 + c.x) * 0.2;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = colors.glow;
    ctx.beginPath(); ctx.arc(0, -14, 30, 0, TAU); ctx.fill();
    for (let i = 0; i < 2; i++) {
      const yy = -38 - ((t * 16 + i * 18) % 22);
      ctx.fillStyle = 'rgba(255,232,170,.7)';
      ctx.beginPath(); ctx.arc(Math.sin(t * 2 + i * 3 + c.x) * 12, yy, 1.6, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}

function drawHerb(h, t) {
  ctx.save();
  ctx.translate(h.x, h.y);
  const sway = Math.sin(t * 1.8 + h.bob) * 2;
  ctx.strokeStyle = 'rgba(129,190,128,.8)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(sway, -11, sway * 1.4, -20); ctx.stroke();
  ctx.fillStyle = 'rgba(159,231,178,.9)';
  for (let i = 0; i < 3; i++) {
    const a = -0.7 + i * 0.7;
    ctx.beginPath(); ctx.ellipse(Math.cos(a) * 6 + sway, -8 + Math.sin(a) * 4, 4.2, 2.2, a, 0, TAU); ctx.fill();
  }
  const glow = 0.35 + Math.sin(t * 2.5 + h.bob) * 0.18;
  ctx.fillStyle = `rgba(205,255,213,${glow})`;
  ctx.beginPath(); ctx.arc(sway * 1.4, -21, 5, 0, TAU); ctx.fill();
  ctx.restore();
}

/* -------------------------------- player --------------------------------- */
function drawPlayerFigure(t) {
  const c = currentChar();
  ctx.save();
  if (player.invuln > 0 && Math.sin(t * 45) > 0.4) ctx.globalAlpha = 0.6;
  // afterimages
  for (const a of player.afterimages) {
    ctx.save();
    ctx.globalAlpha = (a.life / a.maxLife) * 0.3;
    ctx.fillStyle = ELEMENTS[c.element].color;
    ctx.beginPath(); ctx.ellipse(a.x, a.y - 28, 12, 27, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  drawCharacterFigure(player.x, player.y, c.palette, {
    scale: 1, facing: player.facing, moving: player.moving, sprinting: player.sprinting,
    animTime: player.animTime, weapon: c.weapon, element: c.element,
    cape: c.cape, scarf: c.scarf, hood: c.hood, robe: c.robe, hairStyle: c.hairStyle,
    flash: c.hitFlash > 0, attack: player.attackAnim, water: player.inWater,
    active: true
  });
  ctx.restore();
}

function drawCharacterFigure(x, y, pal, opt = {}) {
  const scale = opt.scale || 1;
  const facing = opt.facing ?? -Math.PI / 2;
  const fx = Math.cos(facing), fy = Math.sin(facing);
  const moving = opt.moving;
  const anim = opt.animTime || 0;
  const bob = moving ? Math.abs(Math.sin(anim)) * 2.2 : Math.sin(anim * 0.6) * 0.7;
  const flip = fx < -0.08 ? -1 : 1;
  const swing = moving ? Math.sin(anim) * (opt.sprinting ? 5.4 : 4) : 0;
  const height = opt.child ? 0.86 : 1;
  const bodyY = -28;

  ctx.save();
  ctx.translate(x, y);
  // shadow
  ctx.fillStyle = opt.water ? 'rgba(80,150,160,.16)' : 'rgba(8,18,17,.28)';
  ctx.beginPath(); ctx.ellipse(0, 0, 18 * scale, 6 * scale, 0, 0, TAU); ctx.fill();

  ctx.translate(0, -bob);
  ctx.scale(scale, scale);
  if (opt.flash) ctx.filter = 'brightness(1.85) saturate(.55)';

  // cape / robe back
  if (opt.cape) {
    ctx.fillStyle = pal.coat2;
    ctx.beginPath();
    ctx.moveTo(-9, -48);
    ctx.quadraticCurveTo(-22 - fx * 3, -30, -17 - fx * 8 + Math.sin(anim * 0.9) * 2, -4);
    ctx.lineTo(-2, -18);
    ctx.lineTo(2, -48);
    ctx.closePath(); ctx.fill();
  }
  if (opt.robe) {
    ctx.fillStyle = pal.coat2;
    ctx.beginPath();
    ctx.moveTo(-10, -42); ctx.lineTo(10, -42);
    ctx.quadraticCurveTo(18, -15, 14, -2);
    ctx.lineTo(-14, -2);
    ctx.quadraticCurveTo(-18, -15, -10, -42);
    ctx.closePath(); ctx.fill();
  }
  const attacking = (opt.attack || 0) > 0.08;
  if (opt.weapon && opt.weapon !== 'none' && opt.weapon !== 'catalyst' && !opt.child && !attacking) {
    drawWeapon(opt.weapon, pal, facing, opt, true);
  }
  // legs
  ctx.lineCap = 'round';
  ctx.strokeStyle = pal.pants; ctx.lineWidth = 6.5;
  ctx.beginPath(); ctx.moveTo(-4.5, -21); ctx.lineTo(-5 + swing, -3); ctx.stroke();
  ctx.strokeStyle = pal.pants; ctx.beginPath(); ctx.moveTo(4.5, -21); ctx.lineTo(5 - swing, -3); ctx.stroke();
  ctx.strokeStyle = pal.boot; ctx.lineWidth = 7.5;
  ctx.beginPath(); ctx.moveTo(-5 + swing, -4); ctx.lineTo(-5 + swing * 1.1, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(5 - swing, -4); ctx.lineTo(5 - swing * 1.1, 0); ctx.stroke();

  // torso
  ctx.fillStyle = pal.coat;
  pathRoundRect(ctx, -11, -49, 22, 30, 7); ctx.fill();
  ctx.fillStyle = pal.coat2;
  ctx.beginPath(); ctx.moveTo(-11, -25); ctx.lineTo(11, -25); ctx.lineTo(9, -19); ctx.lineTo(-9, -19); ctx.closePath(); ctx.fill();
  ctx.fillStyle = pal.trim; ctx.fillRect(-10, -29, 20, 3);
  // belt
  ctx.fillStyle = pal.boot; ctx.fillRect(-10, -22, 20, 3);
  ctx.fillStyle = pal.trim; ctx.fillRect(-2, -22, 4, 3);
  // shoulders
  ctx.fillStyle = pal.coat2;
  ctx.beginPath(); ctx.ellipse(-10, -45, 5.5, 4.5, -0.2, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(10, -45, 5.5, 4.5, 0.2, 0, TAU); ctx.fill();

  // arms
  ctx.strokeStyle = pal.coat; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-10, -42); ctx.lineTo(-13 - swing * 0.35, -28); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(10, -42); ctx.lineTo(13 + swing * 0.35, -29); ctx.stroke();
  ctx.fillStyle = pal.skin;
  ctx.beginPath(); ctx.arc(-13 - swing * 0.35, -27, 2.6, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(13 + swing * 0.35, -28, 2.6, 0, TAU); ctx.fill();

  // scarf
  if (opt.scarf) {
    ctx.fillStyle = pal.trim;
    ctx.beginPath();
    ctx.moveTo(-9, -48); ctx.lineTo(8, -48); ctx.lineTo(11, -45); ctx.lineTo(-11, -45); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-7, -47);
    ctx.quadraticCurveTo(-18 - fx * 2, -36, -19 + Math.sin(anim) * 3, -22);
    ctx.lineTo(-13, -24);
    ctx.quadraticCurveTo(-12, -36, -3, -44);
    ctx.closePath(); ctx.fill();
  }

  // neck + head
  ctx.fillStyle = pal.skin;
  ctx.fillRect(-3.6, -53, 7.2, 5);
  // hair back
  ctx.fillStyle = pal.hair2;
  if (opt.hairStyle === 'long' || opt.hairStyle === 'wave') {
    ctx.beginPath();
    ctx.moveTo(-11, -62);
    ctx.quadraticCurveTo(-18, -50, -13 + Math.sin(anim * 0.8) * 2, -35);
    ctx.lineTo(0, -42);
    ctx.lineTo(13 - Math.sin(anim * 0.8) * 2, -35);
    ctx.quadraticCurveTo(18, -50, 11, -62);
    ctx.closePath(); ctx.fill();
  } else if (opt.hairStyle === 'twin') {
    ctx.beginPath(); ctx.ellipse(-13, -54, 6, 14, 0.3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(13, -54, 6, 14, -0.3, 0, TAU); ctx.fill();
  } else if (opt.hairStyle === 'spiky') {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = Math.PI + i / 7 * Math.PI;
      ctx.lineTo(Math.cos(a) * 14 + (i % 2 ? 5 : 0), -61 + Math.sin(a) * 14);
    }
    ctx.closePath(); ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(0, -61, 13, 0, TAU); ctx.fill();
  }
  if (opt.hood) {
    ctx.fillStyle = pal.coat2;
    ctx.beginPath(); ctx.arc(0, -62, 15.5, Math.PI * 0.94, Math.PI * 2.06); ctx.lineTo(14, -49); ctx.lineTo(-14, -49); ctx.closePath(); ctx.fill();
  }
  // head
  ctx.fillStyle = pal.skin;
  ctx.beginPath(); ctx.arc(0, -61, 11.3, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(190,120,90,.18)';
  ctx.beginPath(); ctx.arc(3, -57, 3.2, 0, TAU); ctx.fill();
  // hair front
  ctx.fillStyle = pal.hair;
  ctx.beginPath();
  ctx.moveTo(-11.5, -64);
  ctx.quadraticCurveTo(-9, -75, 0, -74);
  ctx.quadraticCurveTo(10, -74, 11.5, -63);
  ctx.quadraticCurveTo(6, -68, 2, -65);
  ctx.quadraticCurveTo(-4, -70, -11.5, -64);
  ctx.closePath(); ctx.fill();
  if (opt.hairStyle === 'spiky') {
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(-10 + i * 5, -71);
      ctx.lineTo(-13 + i * 5.4, -79 - (i % 2) * 4);
      ctx.lineTo(-6 + i * 5, -71);
      ctx.closePath(); ctx.fill();
    }
  }
  if (opt.hairStyle === 'twin') {
    ctx.fillStyle = pal.hair;
    ctx.beginPath(); ctx.ellipse(-14, -52, 4, 12, 0.35, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(14, -52, 4, 12, -0.35, 0, TAU); ctx.fill();
    ctx.fillStyle = pal.trim;
    ctx.beginPath(); ctx.arc(-14, -63, 2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(14, -63, 2, 0, TAU); ctx.fill();
  }
  // face
  const ex = clamp(fx * 1.6, -1.6, 1.6), ey = clamp(fy * 1.0, -1, 1);
  ctx.fillStyle = '#2b2926';
  ctx.beginPath(); ctx.ellipse(-3.5 + ex, -59 + ey, 1.25, 1.7, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(3.5 + ex, -59 + ey, 1.25, 1.7, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.65)';
  ctx.beginPath(); ctx.arc(-3.1 + ex, -59.5 + ey, 0.45, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(3.9 + ex, -59.5 + ey, 0.45, 0, TAU); ctx.fill();

  // weapon
  if (opt.weapon && opt.weapon !== 'none' && !opt.child && (opt.weapon === 'catalyst' || attacking)) {
    drawWeapon(opt.weapon, pal, facing, opt, false);
  }

  // element glint
  if (opt.element && opt.active) {
    const col = ELEMENTS[opt.element].color;
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.5 + Math.sin(anim * 2) * 0.2;
    ctx.beginPath(); ctx.arc(-16, -32 + Math.sin(anim * 1.3) * 2, 1.3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(15, -20 + Math.cos(anim * 1.1) * 2, 1.1, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.filter = 'none';
  ctx.restore();
}

function drawWeapon(weapon, pal, facing, opt, resting = false) {
  ctx.save();
  if (resting) {
    if (weapon === 'sword') { ctx.translate(2, -33); ctx.rotate(-2.32); }
    else if (weapon === 'claymore') { ctx.translate(-2, -36); ctx.rotate(-2.12); }
    else { ctx.translate(13, -33); ctx.rotate(1.46); }
  } else {
    ctx.translate(0, -34);
    ctx.rotate(facing);
  }
  if (weapon === 'sword') {
    ctx.fillStyle = '#8a6b46'; ctx.fillRect(10, -2.4, 11, 4.8);
    ctx.fillStyle = '#d8bd78'; ctx.fillRect(20, -4.8, 3, 9.6);
    const g = ctx.createLinearGradient(24, 0, 58, 0);
    g.addColorStop(0, '#d7e4e2'); g.addColorStop(0.55, '#f8ffff'); g.addColorStop(1, '#9fb8b6');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(23, -3.4); ctx.lineTo(55, -1.4); ctx.lineTo(61, 0); ctx.lineTo(55, 1.4); ctx.lineTo(23, 3.4); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = pal.trim; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(24, 0); ctx.lineTo(52, 0); ctx.stroke();
  } else if (weapon === 'claymore') {
    ctx.fillStyle = '#5a3f2a'; ctx.fillRect(8, -3.5, 15, 7);
    ctx.fillStyle = '#c9a25a'; ctx.fillRect(21, -7, 4, 14);
    ctx.fillStyle = '#3d3433';
    ctx.beginPath(); ctx.moveTo(25, -8); ctx.lineTo(61, -12); ctx.lineTo(70, -4); ctx.lineTo(71, 3); ctx.lineTo(59, 10); ctx.lineTo(25, 7); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#ff9b64'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(29, -6); ctx.lineTo(59, -9); ctx.lineTo(67, -3); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,216,160,.55)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(31, 5); ctx.lineTo(59, 8); ctx.stroke();
  } else if (weapon === 'bow') {
    ctx.strokeStyle = '#8b6a45'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(18, 0, 19, -1.15, 1.15); ctx.stroke();
    ctx.strokeStyle = 'rgba(240,235,215,.75)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(25, -17.5); ctx.lineTo(18, 0); ctx.lineTo(25, 17.5); ctx.stroke();
    ctx.strokeStyle = pal.trim; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(42, 0); ctx.stroke();
    ctx.fillStyle = pal.trim; ctx.beginPath(); ctx.moveTo(46, 0); ctx.lineTo(38, -3.5); ctx.lineTo(38, 3.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7b5a3a'; ctx.fillRect(-13, -2, 6, 4);
  } else if (weapon === 'catalyst') {
    const col = ELEMENTS[opt.element]?.color || '#5bb9ff';
    ctx.translate(23, -4);
    ctx.fillStyle = col;
    ctx.shadowColor = col; ctx.shadowBlur = 13;
    ctx.beginPath(); ctx.arc(0, 0, 5.2, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.ellipse(0, 0, 8, 3.4, opt.animTime || 0, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 0, 3.6, 8, 0, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}

/* --------------------------------- enemies ------------------------------- */
function drawEnemy(e, t) {
  if (e.dead) {
    const k = clamp(1 - e.deathTime / 1.5, 0, 1);
    if (k <= 0) return;
    ctx.save();
    const color = ELEMENTS[e.element]?.color || '#d8c9a0';
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * TAU + e.deathTime * 2.4;
      const rr = 10 + e.deathTime * 24;
      ctx.globalAlpha = k * 0.55;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(e.x + Math.cos(a) * rr, e.y - 18 + Math.sin(a) * 8 - e.deathTime * 12, 2.4 * k, 0, TAU); ctx.fill();
    }
    ctx.restore();
    return;
  }
  const auraColor = e.aura ? (ELEMENTS[e.aura.el]?.color || '#fff') : null;
  if (auraColor) {
    ctx.save();
    ctx.strokeStyle = auraColor;
    ctx.globalAlpha = 0.25 + Math.sin(t * 3 + e.x) * 0.08;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(e.x, e.y + 1, e.radius * 0.9, e.radius * 0.3, 0, 0, TAU); ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const a = t * 1.4 + i / 3 * TAU;
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = auraColor;
      ctx.beginPath(); ctx.arc(e.x + Math.cos(a) * e.radius * 0.85, e.y - 12 + Math.sin(a) * 8, 1.6, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  if (e.kind === 'slime') drawSlime(e, t);
  else if (e.kind === 'goblin') drawGoblin(e, t);
  else if (e.kind === 'shaman') drawShaman(e, t);
  else if (e.kind === 'boss') drawBoss(e, t);
  if (!e.boss) drawEnemyHealth(e);
}

function drawSlime(e, t) {
  const r = e.radius;
  const hop = Math.abs(Math.sin((e.hop || 0))) * 5;
  const squash = 1 + Math.sin(t * 4 + e.anim) * 0.04;
  const color = e.color || '#5bb9ff';
  ctx.save();
  if (e.hitFlash > 0) ctx.filter = 'brightness(1.65) saturate(.65)';
  ctx.translate(e.x, e.y - hop);
  ctx.fillStyle = 'rgba(6,12,15,.25)';
  ctx.beginPath(); ctx.ellipse(0, hop + 2, r * 0.9, r * 0.3, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.92;
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.bezierCurveTo(-r * 1.1, -r * 1.25 * squash, -r * 0.55, -r * 1.7, 0, -r * 1.7);
  ctx.bezierCurveTo(r * 0.55, -r * 1.7, r * 1.1, -r * 1.25 * squash, r, 0);
  ctx.quadraticCurveTo(0, r * 0.28, -r, 0);
  ctx.fill();
  // highlight
  ctx.globalAlpha = 0.28; ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.ellipse(-r * 0.34, -r * 1.15, r * 0.28, r * 0.14, -0.5, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  // face
  ctx.fillStyle = '#1f2424';
  ctx.beginPath(); ctx.ellipse(-r * 0.32, -r * 0.75, r * 0.1, r * 0.16, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(r * 0.32, -r * 0.75, r * 0.1, r * 0.16, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#1f2424'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(0, -r * 0.47, r * 0.17, 0.15, Math.PI - 0.15); ctx.stroke();
  ctx.restore();
}

function drawGoblin(e, t) {
  const r = e.radius;
  const sc = e.elite ? 1.18 : 1;
  const bob = Math.sin(t * 5 + e.anim) * (e.aggroed ? 2 : 0.7);
  ctx.save();
  if (e.hitFlash > 0) ctx.filter = 'brightness(1.7) saturate(.65)';
  ctx.translate(e.x, e.y);
  ctx.fillStyle = 'rgba(6,12,14,.3)'; ctx.beginPath(); ctx.ellipse(0, 2, r * 1.2, r * 0.35, 0, 0, TAU); ctx.fill();
  ctx.translate(0, -bob);
  ctx.scale(sc, sc);
  // legs
  ctx.strokeStyle = '#4a3f33'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-6, -18); ctx.lineTo(-8, -2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(6, -18); ctx.lineTo(8, -2); ctx.stroke();
  // body
  ctx.fillStyle = '#6d533b';
  pathRoundRect(ctx, -15, -45, 30, 28, 8); ctx.fill();
  ctx.fillStyle = '#8a7253'; ctx.fillRect(-14, -24, 28, 5);
  // arms
  ctx.strokeStyle = '#7f5c3e'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(-13, -39); ctx.lineTo(-20, -24); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(13, -39); ctx.lineTo(20, -25); ctx.stroke();
  // head
  ctx.fillStyle = '#886a4c';
  ctx.beginPath(); ctx.arc(0, -55, 12, 0, TAU); ctx.fill();
  // mask
  ctx.fillStyle = '#d7c6a3';
  ctx.beginPath(); ctx.ellipse(0, -56, 10.5, 11, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#6a4f36';
  ctx.beginPath(); ctx.arc(-4.5, -58, 2.2, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(4.5, -58, 2.2, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#b34d3d'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-7, -62); ctx.lineTo(-2, -60); ctx.moveTo(7, -62); ctx.lineTo(2, -60); ctx.stroke();
  // horns
  ctx.fillStyle = '#a58b68';
  ctx.beginPath(); ctx.moveTo(-9, -66); ctx.lineTo(-15, -78); ctx.lineTo(-4, -68); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(9, -66); ctx.lineTo(15, -78); ctx.lineTo(4, -68); ctx.closePath(); ctx.fill();
  // club
  ctx.save();
  ctx.translate(19, -26); ctx.rotate(-0.4 + Math.sin(e.anim) * 0.1);
  ctx.fillStyle = '#5a4129'; ctx.fillRect(0, -2.5, 22, 5);
  ctx.fillStyle = '#7b5a39'; ctx.beginPath(); ctx.ellipse(25, 0, 7, 9, 0, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.restore();
}

function drawShaman(e, t) {
  const bob = Math.sin(t * 2.2 + e.anim) * 3;
  const col = e.color || '#ff7d55';
  ctx.save();
  if (e.hitFlash > 0) ctx.filter = 'brightness(1.7) saturate(.65)';
  ctx.translate(e.x, e.y + bob);
  ctx.fillStyle = 'rgba(6,12,14,.28)'; ctx.beginPath(); ctx.ellipse(0, -bob + 2, 24, 7, 0, 0, TAU); ctx.fill();
  // robe
  ctx.fillStyle = '#3b304a';
  ctx.beginPath();
  ctx.moveTo(-10, -44); ctx.quadraticCurveTo(-27, -16, -24, 0); ctx.lineTo(24, 0); ctx.quadraticCurveTo(27, -16, 10, -44); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#524064';
  ctx.beginPath(); ctx.moveTo(-10, -44); ctx.quadraticCurveTo(-16, -20, -10, 0); ctx.lineTo(10, 0); ctx.quadraticCurveTo(16, -20, 10, -44); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = col; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(-15, -10); ctx.lineTo(0, -22); ctx.lineTo(15, -10); ctx.stroke();
  ctx.globalAlpha = 1;
  // arms
  ctx.strokeStyle = '#3b304a'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(-12, -38); ctx.lineTo(-21, -28); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(12, -38); ctx.lineTo(22, -30); ctx.stroke();
  // mask head
  ctx.fillStyle = '#d9c9a6';
  ctx.beginPath(); ctx.ellipse(0, -53, 10, 12, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#3b2f2b';
  ctx.beginPath(); ctx.ellipse(-3.8, -55, 2, 2.6, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(3.8, -55, 2, 2.6, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(-6, -63); ctx.lineTo(-3, -60); ctx.moveTo(6, -63); ctx.lineTo(3, -60); ctx.stroke();
  // horns / crown
  ctx.fillStyle = '#8a7659';
  ctx.beginPath(); ctx.moveTo(-8, -63); ctx.lineTo(-13, -75); ctx.lineTo(-3, -66); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(8, -63); ctx.lineTo(13, -75); ctx.lineTo(3, -66); ctx.closePath(); ctx.fill();
  // staff
  ctx.save();
  ctx.translate(23, -26); ctx.rotate(-0.1);
  ctx.strokeStyle = '#6b5036'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(0, -38); ctx.stroke();
  ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 15;
  ctx.beginPath(); ctx.arc(0, -42, 5.5 + Math.sin(t * 4) * 1, 0, TAU); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
  ctx.restore();
}

function drawBoss(e, t) {
  const sc = 2.25;
  const bob = Math.sin(t * 1.6) * 4;
  const phase2 = e.bossPhase === 2;
  ctx.save();
  if (e.hitFlash > 0) ctx.filter = 'brightness(1.55) saturate(.7)';
  ctx.translate(e.x, e.y + bob);
  ctx.fillStyle = 'rgba(10,6,8,.45)'; ctx.beginPath(); ctx.ellipse(0, -bob + 4, 64, 18, 0, 0, TAU); ctx.fill();
  // aura
  const aura = ctx.createRadialGradient(0, -30, 10, 0, -30, 120);
  aura.addColorStop(0, phase2 ? 'rgba(255,90,50,.2)' : 'rgba(255,110,60,.12)');
  aura.addColorStop(1, 'rgba(255,90,50,0)');
  ctx.fillStyle = aura; ctx.beginPath(); ctx.arc(0, -30, 125, 0, TAU); ctx.fill();
  ctx.scale(sc, sc);
  // cape
  ctx.fillStyle = '#241726';
  ctx.beginPath();
  ctx.moveTo(-17, -50);
  ctx.quadraticCurveTo(-34, -30, -29 + Math.sin(t * 1.3) * 4, 2);
  ctx.lineTo(29 - Math.sin(t * 1.3) * 4, 2);
  ctx.quadraticCurveTo(34, -30, 17, -50);
  ctx.closePath(); ctx.fill();
  // legs
  ctx.strokeStyle = '#2a1f2d'; ctx.lineWidth = 10; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-9, -18); ctx.lineTo(-13, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(9, -18); ctx.lineTo(13, 0); ctx.stroke();
  // body
  ctx.fillStyle = '#3b293c';
  pathRoundRect(ctx, -18, -57, 36, 41, 10); ctx.fill();
  ctx.fillStyle = '#57405a';
  ctx.beginPath(); ctx.moveTo(-18, -45); ctx.lineTo(18, -45); ctx.lineTo(13, -21); ctx.lineTo(-13, -21); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#20161f';
  ctx.beginPath(); ctx.arc(0, -38, 13, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#ff7d55'; ctx.lineWidth = 2.2; ctx.shadowColor = '#ff5b36'; ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.arc(0, -38, 9, 0.3, Math.PI * 2 - 0.3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-9, -38); ctx.lineTo(9, -38); ctx.moveTo(0, -47); ctx.lineTo(0, -29); ctx.stroke();
  ctx.shadowBlur = 0;
  // shoulders / arms
  ctx.fillStyle = '#2c202f';
  ctx.beginPath(); ctx.ellipse(-19, -51, 9, 7, -0.25, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(19, -51, 9, 7, 0.25, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#3b293c'; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(-19, -49); ctx.lineTo(-29, -27); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(19, -49); ctx.lineTo(31, -33); ctx.stroke();
  // head
  ctx.fillStyle = '#241a27';
  ctx.beginPath(); ctx.arc(0, -68, 12.5, 0, TAU); ctx.fill();
  // horns
  ctx.fillStyle = '#8b7359';
  ctx.beginPath(); ctx.moveTo(-9, -75); ctx.quadraticCurveTo(-27, -95, -20, -104); ctx.quadraticCurveTo(-12, -89, -3, -77); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(9, -75); ctx.quadraticCurveTo(27, -95, 20, -104); ctx.quadraticCurveTo(12, -89, 3, -77); ctx.closePath(); ctx.fill();
  // face
  ctx.fillStyle = phase2 ? '#ff5b36' : '#ff8b50';
  ctx.shadowColor = '#ff5b36'; ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.ellipse(-4.2, -69, 2, 1.4, 0.15, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(4.2, -69, 2, 1.4, -0.15, 0, TAU); ctx.fill();
  ctx.shadowBlur = 0;
  // crown
  ctx.fillStyle = '#b6955e';
  ctx.beginPath(); ctx.moveTo(-9, -78); ctx.lineTo(-4, -86); ctx.lineTo(0, -79); ctx.lineTo(4, -86); ctx.lineTo(9, -78); ctx.closePath(); ctx.fill();
  // weapon
  ctx.save();
  ctx.translate(30, -30); ctx.rotate(0.4 + Math.sin(t * 1.1) * 0.08);
  ctx.fillStyle = '#392a3a'; ctx.fillRect(-3, -4, 13, 8);
  ctx.fillStyle = '#4a3547';
  ctx.beginPath(); ctx.moveTo(8, -7); ctx.lineTo(52, -13); ctx.lineTo(62, -3); ctx.lineTo(48, 9); ctx.lineTo(8, 7); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#ff6b45'; ctx.lineWidth = 2; ctx.shadowColor = '#ff6b45'; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.moveTo(12, -5); ctx.lineTo(49, -10); ctx.stroke();
  ctx.restore();
  ctx.restore();
}

function drawEnemyHealth(e) {
  const w = e.elite ? 58 : 44;
  const yy = e.y - (e.kind === 'slime' ? 54 : e.elite ? 92 : 82);
  if (!e.aggroed && e.hp >= e.maxHp) return;
  ctx.save();
  ctx.fillStyle = 'rgba(4,8,10,.68)'; ctx.fillRect(e.x - w / 2, yy, w, 5);
  ctx.fillStyle = e.elite ? '#ffb15e' : '#e56058';
  ctx.fillRect(e.x - w / 2 + 1, yy + 1, (w - 2) * clamp(e.hp / e.maxHp, 0, 1), 3);
  ctx.strokeStyle = 'rgba(240,220,190,.3)'; ctx.lineWidth = 0.7; ctx.strokeRect(e.x - w / 2, yy, w, 5);
  if (e.elite) {
    ctx.fillStyle = '#e3c486'; ctx.font = '8px "Microsoft YaHei"'; ctx.textAlign = 'center';
    ctx.fillText(`Lv.${e.level}`, e.x, yy - 4);
  }
  ctx.restore();
}

/* ------------------------------ projectiles ------------------------------ */
function drawProjectiles(t) {
  ctx.save();
  for (const p of projectiles) {
    if (!inView(p.x, p.y, 80)) continue;
    if (p.trail) {
      for (let i = 0; i < p.trail.length; i++) {
        const tr = p.trail[i];
        const a = (i / p.trail.length) * 0.24;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = a;
        ctx.beginPath(); ctx.arc(tr.x, tr.y, p.r * (0.3 + i / p.trail.length * 0.7), 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    if (p.type === 'arrow') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle || Math.atan2(p.vy, p.vx));
      ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-6, -2.4); ctx.lineTo(-2, 0); ctx.lineTo(-6, 2.4); ctx.closePath(); ctx.fill();
      ctx.restore();
    } else if (p.type === 'lightningArrow') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle || Math.atan2(p.vy, p.vx));
      ctx.strokeStyle = p.color; ctx.lineWidth = 3; ctx.shadowColor = p.color; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(16, 0); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(12, -4); ctx.lineTo(12, 4); ctx.closePath(); ctx.fill();
      ctx.restore();
    } else {
      const g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, p.r * 3);
      g.addColorStop(0, '#fff');
      g.addColorStop(0.35, p.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.55, 0, TAU); ctx.fill();
      if (p.type === 'enemyOrb') {
        ctx.strokeStyle = p.color; ctx.globalAlpha = 0.7;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 1.7 + Math.sin(t * 8) * 2, 0, TAU); ctx.stroke();
      }
    }
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

/* ------------------------------- particles ------------------------------- */
function drawParticles(t) {
  ctx.save();
  for (const p of particles) {
    if (!inView(p.x, p.y, 60)) continue;
    const a = clamp(p.life / p.maxLife, 0, 1) * p.alpha;
    ctx.globalAlpha = a;
    if (p.glow) { ctx.globalCompositeOperation = 'lighter'; } else ctx.globalCompositeOperation = 'source-over';
    if (p.type === 'spark') {
      ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(0.6, p.size * 0.55); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.026, p.y - p.vy * 0.026); ctx.stroke();
    } else if (p.type === 'smoke') {
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.4 - a * 0.4), 0, TAU); ctx.fill();
    } else if (p.type === 'leaf') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.ellipse(0, 0, p.size * 1.6, p.size * 0.65, 0, 0, TAU); ctx.fill();
      ctx.restore();
    } else if (p.type === 'heal') {
      ctx.strokeStyle = p.color; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(p.x - p.size, p.y); ctx.lineTo(p.x + p.size, p.y); ctx.moveTo(p.x, p.y - p.size); ctx.lineTo(p.x, p.y + p.size); ctx.stroke();
    } else if (p.type === 'splash') {
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size * 0.8, p.size * 1.5, Math.atan2(p.vy, p.vx), 0, TAU); ctx.fill();
    } else if (p.type === 'ember') {
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.7), 0, TAU); ctx.fill();
    } else if (p.type === 'star') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.moveTo(0, -p.size * 1.5); ctx.lineTo(p.size * 0.4, -p.size * 0.4); ctx.lineTo(p.size * 1.5, 0); ctx.lineTo(p.size * 0.4, p.size * 0.4); ctx.lineTo(0, p.size * 1.5); ctx.lineTo(-p.size * 0.4, p.size * 0.4); ctx.lineTo(-p.size * 1.5, 0); ctx.lineTo(-p.size * 0.4, -p.size * 0.4); ctx.closePath(); ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}

function drawEffects(t) {
  ctx.save();
  for (const e of effects) {
    if (e.type === 'ring') {
      const p = 1 - e.life / e.maxLife;
      const radius = lerp(e.r0, e.r1, 1 - Math.pow(1 - p, 2.1));
      ctx.globalAlpha = (1 - p) * 0.9;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = e.width * (1 - p * 0.6);
      ctx.beginPath(); ctx.arc(e.x, e.y, radius, 0, TAU); ctx.stroke();
      ctx.globalAlpha = (1 - p) * 0.18;
      ctx.lineWidth = e.width * 2.2;
      ctx.stroke();
    } else if (e.type === 'slash') {
      const p = 1 - e.life / e.maxLife;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.globalAlpha = (1 - p) * 0.95;
      ctx.lineCap = 'round';
      ctx.strokeStyle = e.color;
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = e.width * (1 - p * 0.55);
      ctx.beginPath(); ctx.arc(0, 0, e.radius * (0.9 + p * 0.12), -e.arc / 2, e.arc / 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.lineWidth = Math.max(1, e.width * 0.22);
      ctx.beginPath(); ctx.arc(0, 0, e.radius * (0.9 + p * 0.12), -e.arc / 2, e.arc / 2); ctx.stroke();
      ctx.restore();
    } else if (e.type === 'bolt') {
      const a = e.life / e.maxLife;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a;
      ctx.strokeStyle = e.color; ctx.lineWidth = e.width * 2.2; ctx.shadowColor = e.color; ctx.shadowBlur = 12;
      ctx.beginPath(); for (let i = 0; i < e.pts.length; i++) { const p = e.pts[i]; if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); } ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(0.8, e.width * 0.55); ctx.beginPath(); for (let i = 0; i < e.pts.length; i++) { const p = e.pts[i]; if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); } ctx.stroke();
      ctx.shadowBlur = 0;
    } else if (e.type === 'burst') {
      const p = 1 - e.life / e.maxLife;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - p) * 0.28;
      const g = ctx.createRadialGradient(0, 0, 10, 0, 0, 220);
      g.addColorStop(0, e.color); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 220, 0, TAU); ctx.fill();
      ctx.globalAlpha = (1 - p) * 0.9;
      ctx.strokeStyle = e.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 60 + p * 170, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}

function drawFloatingTexts() {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const t of texts) {
    const a = clamp(t.life / t.maxLife * 1.6, 0, 1);
    ctx.globalAlpha = a;
    ctx.font = t.reaction ? `600 ${t.size}px "STKaiti","KaiTi",serif` : `${t.crit ? 700 : 600} ${t.size}px "Microsoft YaHei",sans-serif`;
    ctx.lineWidth = t.reaction ? 4 : 3;
    ctx.strokeStyle = t.outline;
    ctx.strokeText(t.text, t.x, t.y);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.restore();
}

/* -------------------------------- lighting ------------------------------- */
function getAmbient() {
  const h = (game.time / 60) % 24;
  if (h >= 5 && h < 7.2) {
    const p = (h - 5) / 2.2;
    return { color: `rgba(255,156,102,${0.12 * (1 - p)})`, night: 0.35 * (1 - p), h };
  }
  if (h >= 7.2 && h < 16.8) return { color: 'rgba(255,246,214,0.018)', night: 0, h };
  if (h >= 16.8 && h < 19) {
    const p = (h - 16.8) / 2.2;
    return { color: `rgba(255,128,72,${0.04 + p * 0.13})`, night: p * 0.45, h };
  }
  if (h >= 19 && h < 20.4) {
    const p = (h - 19) / 1.4;
    return { color: `rgba(38,36,92,${0.2 + p * 0.2})`, night: 0.55 + p * 0.4, h };
  }
  const p = h >= 20.4 ? 1 : 0;
  return { color: `rgba(8,20,54,${0.45 + p * 0.04})`, night: 1, h };
}

function drawLighting(t) {
  const amb = getAmbient();
  ctx.save();
  ctx.fillStyle = amb.color;
  ctx.fillRect(0, 0, vw, vh);
  if (amb.night > 0.05) {
    const g = ctx.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0, `rgba(6,15,42,${0.18 * amb.night})`);
    g.addColorStop(0.55, 'rgba(4,10,24,0)');
    g.addColorStop(1, `rgba(5,12,30,${0.22 * amb.night})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
  }
  if (amb.h > 6.5 && amb.h < 17.5) {
    ctx.globalCompositeOperation = 'lighter';
    const sunX = vw * 0.2, sunY = vh * 0.08;
    const g = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, vh * 0.9);
    g.addColorStop(0, 'rgba(255,236,180,.07)');
    g.addColorStop(1, 'rgba(255,236,180,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
  }
  ctx.restore();
}

function drawLocalLights(t) {
  const amb = getAmbient();
  const nf = amb.night;
  if (nf < 0.08) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const glow = (x, y, r, color, alpha) => {
    const g = ctx.createRadialGradient(x, y, 2, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(0.4, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha * nf;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  };
  for (const d of decor) {
    if (d.type === 'lantern' && inView(d.x, d.y, 100)) glow(d.x, d.y - 40, 100, 'rgba(255,180,86,.55)', 0.55);
    if (d.type === 'campfire' && inView(d.x, d.y, 160)) glow(d.x, d.y - 12, 155 + Math.sin(t * 7) * 7, 'rgba(255,132,56,.6)', 0.65);
  }
  for (const s of shrines) {
    if (!s.collected && inView(s.x, s.y, 200)) {
      const el = ELEMENTS[s.element];
      glow(s.x, s.y - 72, 115, el.color + 'aa', 0.55);
    }
  }
  for (const f of fields) if (inView(f.x, f.y, f.r)) glow(f.x, f.y, f.r * 0.8, f.color + '66', 0.45);
  if (game.bossStarted && boss && !boss.dead) glow(boss.x, boss.y - 50, 220, 'rgba(255,76,42,.55)', 0.55);
  glow(player.x, player.y - 30, 80, ELEMENTS[currentChar().element].color + '44', 0.25);
  ctx.restore();
}

function drawAmbientMotes(t) {
  const amb = getAmbient();
  const night = amb.night > 0.4;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const m of ambientMotes) {
    if (!inView(m.x, m.y, 50)) continue;
    let x = m.x + Math.sin(t * m.speed + m.phase) * 22;
    let y = m.y + Math.cos(t * m.speed * 0.7 + m.phase) * 12;
    if (m.kind === 'firefly') {
      if (!night) continue;
      const a = 0.3 + 0.7 * Math.max(0, Math.sin(t * 2.4 + m.phase));
      ctx.globalAlpha = a * 0.85;
      ctx.fillStyle = '#f4e7a2';
      ctx.beginPath(); ctx.arc(x, y, m.size, 0, TAU); ctx.fill();
      ctx.globalAlpha = a * 0.15;
      ctx.beginPath(); ctx.arc(x, y, m.size * 5, 0, TAU); ctx.fill();
    }
  }
  // drifting pollen in daylight
  if (!night) {
    for (let i = 0; i < 40; i++) {
      const x = ((t * (6 + i % 5) + i * 197) % (vw / camera.zoom)) + camera.x - vw / camera.zoom / 2;
      const y = ((t * 3 + i * 131) % (vh / camera.zoom)) + camera.y - vh / camera.zoom / 2;
      ctx.globalAlpha = 0.18 + 0.14 * Math.sin(t * 2 + i);
      ctx.fillStyle = '#f2e6b2';
      ctx.beginPath(); ctx.arc(x + Math.sin(t + i) * 9, y + Math.cos(t * 0.8 + i) * 6, 1.2, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}

function drawQuestBeacons(t) {
  const targets = getQuestTargets();
  for (const q of targets) {
    if (!inView(q.x, q.y, 120)) continue;
    const pulse = 0.5 + Math.sin(t * 2 + q.x) * 0.2;
    ctx.save();
    const g = ctx.createLinearGradient(q.x, q.y - 300, q.x, q.y);
    g.addColorStop(0, 'rgba(243,223,173,0)');
    g.addColorStop(0.65, `rgba(243,223,173,${0.035 * pulse})`);
    g.addColorStop(1, `rgba(243,223,173,${0.12 * pulse})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(q.x - 4, q.y); ctx.lineTo(q.x - 22, q.y - 300); ctx.lineTo(q.x + 22, q.y - 300); ctx.lineTo(q.x + 4, q.y); ctx.closePath(); ctx.fill();
    ctx.translate(q.x, q.y - 105 + Math.sin(t * 2.2) * 5);
    ctx.rotate(Math.PI / 4);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(243,223,173,.13)';
    ctx.fillRect(-11, -11, 22, 22);
    ctx.strokeStyle = 'rgba(248,232,188,.9)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(-8, -8, 16, 16);
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = '#f8e8bc'; ctx.font = '12px "Microsoft YaHei"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(q.icon || '!', 0, 1);
    ctx.restore();
  }
}

function getQuestTargets() {
  const out = [];
  if (progress.main === 0 || progress.main === 2 || progress.main === 4) {
    out.push({ x: 1602, y: 1858, icon: '!', label: '岚' });
  } else if (progress.main === 1) {
    for (const s of shrines) if (!s.collected) out.push({ x: s.x, y: s.y, icon: '◇', label: s.name, element: s.element });
  } else if (progress.main === 3) {
    out.push({ x: 2700, y: 2510, icon: '!', label: '沉星遗迹' });
  }
  if (progress.side === 0) out.push({ x: 986, y: 2160, icon: '?', label: '小满' });
  else if (progress.side === 1) {
    if (progress.herbs.length < 5) {
      for (const h of herbs) if (!h.collected) out.push({ x: h.x, y: h.y, icon: '·', label: '灯芯草', small: true });
    } else out.push({ x: 986, y: 2160, icon: '?', label: '小满' });
  }
  return out;
}

/* ------------------------------- screen fx ------------------------------- */
function drawScreenGrade(t) {
  const amb = getAmbient();
  // vignette
  const g = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.32, vw / 2, vh / 2, Math.max(vw, vh) * 0.72);
  g.addColorStop(0, 'rgba(3,7,10,0)');
  g.addColorStop(0.72, `rgba(3,7,10,${0.14 + amb.night * 0.1})`);
  g.addColorStop(1, `rgba(2,5,8,${0.48 + amb.night * 0.15})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
  // top/bottom cinematic shade
  const g2 = ctx.createLinearGradient(0, 0, 0, vh);
  g2.addColorStop(0, `rgba(3,7,10,${0.2 + amb.night * 0.1})`);
  g2.addColorStop(0.14, 'rgba(3,7,10,0)');
  g2.addColorStop(0.86, 'rgba(3,7,10,0)');
  g2.addColorStop(1, 'rgba(3,7,10,0.22)');
  ctx.fillStyle = g2; ctx.fillRect(0, 0, vw, vh);
  // burst flash
  const burst = effects.find(e => e.type === 'burst');
  if (burst) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (burst.life / burst.maxLife) * 0.09;
    ctx.fillStyle = burst.color;
    ctx.fillRect(0, 0, vw, vh);
    ctx.restore();
  }
  if (game.bossStarted) {
    const bg = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.4, vw / 2, vh / 2, Math.max(vw, vh) * 0.72);
    bg.addColorStop(0, 'rgba(80,10,5,0)');
    bg.addColorStop(1, 'rgba(90,10,5,.18)');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, vw, vh);
  }
}

function drawOffscreenQuestArrow() {
  if (game.mode !== 'playing') return;
  const targets = getQuestTargets();
  if (!targets.length) return;
  let best = null, bd = Infinity;
  for (const q of targets) {
    const d = dist(player.x, player.y, q.x, q.y);
    if (d < bd) { bd = d; best = q; }
  }
  if (!best) return;
  const sx = (best.x - camera.x) * camera.zoom + vw / 2;
  const sy = (best.y - camera.y) * camera.zoom + vh / 2;
  const margin = 74;
  if (sx > margin && sx < vw - margin && sy > margin && sy < vh - margin) return;
  const cx = vw / 2, cy = vh / 2;
  const a = Math.atan2(sy - cy, sx - cx);
  const rx = vw / 2 - margin, ry = vh / 2 - margin;
  const scale = Math.min(rx / Math.abs(Math.cos(a) || 0.001), ry / Math.abs(Math.sin(a) || 0.001));
  const x = cx + Math.cos(a) * scale, y = cy + Math.sin(a) * scale;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.fillStyle = 'rgba(243,223,173,.9)';
  ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(-7, -7); ctx.lineTo(-3, 0); ctx.lineTo(-7, 7); ctx.closePath(); ctx.fill();
  ctx.rotate(-a);
  ctx.fillStyle = 'rgba(238,228,203,.75)';
  ctx.font = '9px "Microsoft YaHei"'; ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(bd / 10)}m`, 0, 20);
  ctx.restore();
}

/* --------------------------------- minimap ------------------------------- */
function drawMiniMap(t) {
  const S = 256;
  const scale = S / 1500;
  mctx.clearRect(0, 0, S, S);
  mctx.save();
  mctx.beginPath(); mctx.arc(S / 2, S / 2, S / 2, 0, TAU); mctx.clip();
  const texScale = TERRAIN_SIZE / WORLD.w;
  const viewR = 750;
  mctx.fillStyle = '#18242a'; mctx.fillRect(0, 0, S, S);
  mctx.drawImage(terrainCanvas,
    (player.x - viewR) * texScale, (player.y - viewR) * texScale,
    viewR * 2 * texScale, viewR * 2 * texScale,
    0, 0, S, S);
  mctx.fillStyle = 'rgba(6,13,17,.16)'; mctx.fillRect(0, 0, S, S);
  const pos = (x, y) => [S / 2 + (x - player.x) * scale, S / 2 + (y - player.y) * scale];

  // terrain ring
  mctx.strokeStyle = 'rgba(216,184,120,.25)'; mctx.lineWidth = 2;
  mctx.beginPath(); mctx.arc(S / 2, S / 2, S / 2 - 4, 0, TAU); mctx.stroke();

  // chests
  for (const c of chests) {
    if (c.opened) continue;
    if (dist(c.x, c.y, player.x, player.y) > viewR) continue;
    const [x, y] = pos(c.x, c.y);
    mctx.fillStyle = '#dfa65f'; mctx.beginPath(); mctx.arc(x, y, 3, 0, TAU); mctx.fill();
  }
  // npcs
  for (const n of npcs) {
    if (dist(n.x, n.y, player.x, player.y) > viewR) continue;
    const [x, y] = pos(n.x, n.y);
    mctx.fillStyle = '#8fd7ff'; mctx.beginPath(); mctx.arc(x, y, 3.2, 0, TAU); mctx.fill();
    mctx.strokeStyle = 'rgba(210,245,255,.5)'; mctx.lineWidth = 1; mctx.beginPath(); mctx.arc(x, y, 6, 0, TAU); mctx.stroke();
  }
  // shrines
  for (const s of shrines) {
    if (dist(s.x, s.y, player.x, player.y) > viewR) continue;
    const [x, y] = pos(s.x, s.y);
    mctx.fillStyle = s.collected ? 'rgba(120,130,135,.55)' : ELEMENTS[s.element].color;
    mctx.save(); mctx.translate(x, y); mctx.rotate(Math.PI / 4); mctx.fillRect(-3.5, -3.5, 7, 7); mctx.restore();
  }
  // boss
  if (progress.main === 3 && !game.bossDefeated) {
    if (dist(2700, 2510, player.x, player.y) < viewR * 1.4) {
      let [x, y] = pos(2700, 2510);
      x = clamp(x, 12, S - 12); y = clamp(y, 12, S - 12);
      mctx.fillStyle = '#ff6b45'; mctx.beginPath(); mctx.arc(x, y, 5, 0, TAU); mctx.fill();
      mctx.fillStyle = 'rgba(255,120,80,.25)'; mctx.beginPath(); mctx.arc(x, y, 10 + Math.sin(t * 3) * 2, 0, TAU); mctx.fill();
    }
  }
  // quest targets
  for (const q of getQuestTargets()) {
    let [x, y] = pos(q.x, q.y);
    const d = dist(q.x, q.y, player.x, player.y);
    if (d > viewR) {
      const a = angleTo(player.x, player.y, q.x, q.y);
      x = S / 2 + Math.cos(a) * (S / 2 - 16);
      y = S / 2 + Math.sin(a) * (S / 2 - 16);
    }
    mctx.save(); mctx.translate(x, y); mctx.rotate(Math.PI / 4);
    mctx.fillStyle = '#f3dfad';
    mctx.fillRect(-4, -4, 8, 8);
    mctx.strokeStyle = 'rgba(255,246,215,.8)'; mctx.lineWidth = 1; mctx.strokeRect(-6, -6, 12, 12);
    mctx.restore();
  }
  // player
  mctx.save(); mctx.translate(S / 2, S / 2); mctx.rotate(player.facing + Math.PI / 2);
  mctx.fillStyle = '#fff4d0'; mctx.beginPath(); mctx.moveTo(0, -8); mctx.lineTo(5.5, 6); mctx.lineTo(0, 3); mctx.lineTo(-5.5, 6); mctx.closePath(); mctx.fill();
  mctx.restore();
  // fov / shine
  const g = mctx.createRadialGradient(S / 2, S / 2, S * 0.25, S / 2, S / 2, S * 0.5);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(2,8,12,.48)');
  mctx.fillStyle = g; mctx.fillRect(0, 0, S, S);
  mctx.restore();
}

/* -------------------------------- world map ------------------------------ */
function drawWorldMap() {
  const S = 1100, sc = S / WORLD.w;
  wmctx.clearRect(0, 0, S, S);
  wmctx.save();
  wmctx.drawImage(terrainCanvas, 0, 0, TERRAIN_SIZE, TERRAIN_SIZE, 0, 0, S, S);
  wmctx.fillStyle = 'rgba(231,209,164,.12)'; wmctx.fillRect(0, 0, S, S);
  // parchment grain
  for (let i = 0; i < 1200; i++) {
    wmctx.fillStyle = `rgba(80,65,40,${Math.random() * 0.035})`;
    wmctx.fillRect(Math.random() * S, Math.random() * S, 1.4, 1.4);
  }
  // region labels
  wmctx.textAlign = 'center';
  for (const r of REGIONS) {
    wmctx.save();
    wmctx.translate(r.x * sc, r.y * sc);
    wmctx.rotate(-0.04);
    wmctx.font = '20px "STKaiti","KaiTi",serif';
    wmctx.fillStyle = 'rgba(246,234,207,.86)';
    wmctx.shadowColor = 'rgba(20,16,10,.85)'; wmctx.shadowBlur = 6;
    wmctx.fillText(r.name, 0, 0);
    wmctx.shadowBlur = 0;
    wmctx.restore();
  }
  // markers
  const marker = (x, y, color, size, shape = 'dot') => {
    wmctx.save(); wmctx.translate(x * sc, y * sc);
    wmctx.fillStyle = color; wmctx.strokeStyle = 'rgba(20,20,15,.55)'; wmctx.lineWidth = 1.2;
    if (shape === 'diamond') { wmctx.rotate(Math.PI / 4); wmctx.fillRect(-size, -size, size * 2, size * 2); wmctx.strokeRect(-size, -size, size * 2, size * 2); }
    else { wmctx.beginPath(); wmctx.arc(0, 0, size, 0, TAU); wmctx.fill(); wmctx.stroke(); }
    wmctx.restore();
  };
  for (const c of chests) if (!c.opened) marker(c.x, c.y, '#a96d33', 4, 'diamond');
  for (const s of shrines) marker(s.x, s.y, s.collected ? '#6e7777' : ELEMENTS[s.element].color, 6, 'diamond');
  for (const n of npcs) marker(n.x, n.y, '#4f8fb5', 5);
  if (progress.main === 3 && !game.bossDefeated) {
    marker(2700, 2510, '#b64a34', 9, 'diamond');
    wmctx.font = '12px "STKaiti",serif'; wmctx.fillStyle = '#7e2f24'; wmctx.textAlign = 'center';
    wmctx.fillText('沉星遗迹', 2700 * sc, 2510 * sc - 18);
  }
  // quest path line to current target
  const qs = getQuestTargets();
  if (qs.length) {
    const q = qs[0];
    wmctx.save();
    wmctx.strokeStyle = 'rgba(199,157,86,.55)'; wmctx.lineWidth = 1.5; wmctx.setLineDash([6, 7]);
    wmctx.beginPath(); wmctx.moveTo(player.x * sc, player.y * sc);
    wmctx.quadraticCurveTo((player.x + q.x) / 2 * sc, (player.y + q.y) / 2 * sc - 40, q.x * sc, q.y * sc); wmctx.stroke();
    wmctx.setLineDash([]);
    wmctx.restore();
  }
  for (const q of qs) {
    marker(q.x, q.y, '#e9cb8e', 7, 'diamond');
    wmctx.strokeStyle = 'rgba(243,223,173,.4)'; wmctx.lineWidth = 1;
    wmctx.beginPath(); wmctx.arc(q.x * sc, q.y * sc, 13, 0, TAU); wmctx.stroke();
  }
  // player marker
  wmctx.save(); wmctx.translate(player.x * sc, player.y * sc); wmctx.rotate(player.facing + Math.PI / 2);
  wmctx.fillStyle = '#fff8e2'; wmctx.strokeStyle = '#2e2a20'; wmctx.lineWidth = 1.2;
  wmctx.beginPath(); wmctx.moveTo(0, -10); wmctx.lineTo(6, 7); wmctx.lineTo(0, 4); wmctx.lineTo(-6, 7); wmctx.closePath(); wmctx.fill(); wmctx.stroke();
  wmctx.restore();
  // border vignette
  const g = wmctx.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(42,32,18,.24)');
  wmctx.fillStyle = g; wmctx.fillRect(0, 0, S, S);
  wmctx.strokeStyle = 'rgba(60,48,30,.5)'; wmctx.lineWidth = 3; wmctx.strokeRect(2, 2, S - 4, S - 4);
  wmctx.restore();
}

/* -------------------------------- portrait ------------------------------- */
function drawPortrait(key) {
  const c = pctx;
  const S = 220;
  c.clearRect(0, 0, S, S);
  let pal, hairStyle = 'long', name = '';
  if (['ling', 'yan', 'xi', 'ting'].includes(key)) {
    const ch = CHARACTERS.find(x => x.id === key);
    pal = ch.palette; hairStyle = ch.hairStyle; name = ch.name;
  } else if (key === 'lan') {
    pal = npcs.find(n => n.id === 'lan').palette; hairStyle = 'short'; name = '岚';
  } else if (key === 'xiaoman') {
    pal = npcs.find(n => n.id === 'xiaoman').palette; hairStyle = 'twin'; name = '小满';
  } else {
    pal = CHARACTERS[0].palette;
  }
  const bg = c.createRadialGradient(110, 70, 10, 110, 110, 140);
  bg.addColorStop(0, '#4b665f'); bg.addColorStop(0.55, '#1c2b2e'); bg.addColorStop(1, '#0a1117');
  c.fillStyle = bg; c.fillRect(0, 0, S, S);
  // halo
  c.strokeStyle = 'rgba(216,184,120,.28)'; c.lineWidth = 1;
  c.beginPath(); c.arc(110, 104, 76, 0, TAU); c.stroke();
  c.strokeStyle = 'rgba(216,184,120,.12)';
  c.beginPath(); c.arc(110, 104, 88, 0, TAU); c.stroke();
  // shoulders
  c.fillStyle = pal.coat;
  c.beginPath(); c.moveTo(24, 220); c.quadraticCurveTo(38, 160, 78, 148); c.lineTo(142, 148); c.quadraticCurveTo(182, 160, 196, 220); c.closePath(); c.fill();
  c.fillStyle = pal.coat2;
  c.beginPath(); c.moveTo(78, 148); c.lineTo(110, 176); c.lineTo(142, 148); c.lineTo(142, 220); c.lineTo(78, 220); c.closePath(); c.fill();
  c.fillStyle = pal.trim;
  c.beginPath(); c.moveTo(78, 148); c.quadraticCurveTo(110, 190, 142, 148); c.lineTo(136, 160); c.quadraticCurveTo(110, 194, 84, 160); c.closePath(); c.fill();
  // neck
  c.fillStyle = pal.skin; c.fillRect(98, 126, 24, 28);
  // hair back
  c.fillStyle = pal.hair2;
  if (hairStyle === 'long' || hairStyle === 'wave') {
    c.beginPath(); c.moveTo(58, 100); c.quadraticCurveTo(42, 160, 58, 196); c.quadraticCurveTo(88, 172, 82, 116); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(162, 100); c.quadraticCurveTo(178, 160, 162, 196); c.quadraticCurveTo(132, 172, 138, 116); c.closePath(); c.fill();
  } else if (hairStyle === 'twin') {
    c.beginPath(); c.ellipse(64, 130, 15, 42, 0.2, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(156, 130, 15, 42, -0.2, 0, TAU); c.fill();
  }
  // head
  c.fillStyle = pal.skin;
  c.beginPath(); c.ellipse(110, 95, 40, 46, 0, 0, TAU); c.fill();
  c.fillStyle = 'rgba(201,131,104,.13)';
  c.beginPath(); c.ellipse(84, 112, 13, 18, -0.2, 0, TAU); c.fill();
  c.beginPath(); c.ellipse(136, 112, 13, 18, 0.2, 0, TAU); c.fill();
  // hair front
  c.fillStyle = pal.hair;
  c.beginPath();
  c.moveTo(66, 94);
  c.quadraticCurveTo(66, 48, 110, 44);
  c.quadraticCurveTo(154, 48, 154, 94);
  c.quadraticCurveTo(150, 72, 128, 66);
  c.quadraticCurveTo(110, 80, 92, 66);
  c.quadraticCurveTo(70, 72, 66, 94);
  c.closePath(); c.fill();
  if (hairStyle === 'spiky') {
    for (let i = 0; i < 6; i++) {
      c.beginPath(); c.moveTo(76 + i * 12, 64); c.lineTo(68 + i * 13, 38 - (i % 2) * 8); c.lineTo(86 + i * 11, 62); c.closePath(); c.fill();
    }
  }
  if (hairStyle === 'twin') {
    c.fillStyle = pal.hair; c.beginPath(); c.arc(64, 104, 7, 0, TAU); c.fill(); c.beginPath(); c.arc(156, 104, 7, 0, TAU); c.fill();
    c.fillStyle = pal.trim; c.beginPath(); c.arc(64, 104, 3, 0, TAU); c.fill(); c.beginPath(); c.arc(156, 104, 3, 0, TAU); c.fill();
  }
  // eyes
  c.fillStyle = '#2e2925';
  c.beginPath(); c.ellipse(91, 103, 5, 7.5, 0, 0, TAU); c.fill();
  c.beginPath(); c.ellipse(129, 103, 5, 7.5, 0, 0, TAU); c.fill();
  c.fillStyle = '#f7f2e6';
  c.beginPath(); c.arc(93, 100, 1.8, 0, TAU); c.fill();
  c.beginPath(); c.arc(131, 100, 1.8, 0, TAU); c.fill();
  // brows
  c.strokeStyle = pal.hair2; c.lineWidth = 2; c.lineCap = 'round';
  c.beginPath(); c.moveTo(81, 90); c.quadraticCurveTo(90, 86, 99, 90); c.stroke();
  c.beginPath(); c.moveTo(121, 90); c.quadraticCurveTo(130, 86, 139, 90); c.stroke();
  // nose/mouth
  c.strokeStyle = 'rgba(139,88,74,.55)'; c.lineWidth = 1.4;
  c.beginPath(); c.moveTo(110, 112); c.lineTo(108, 118); c.stroke();
  c.strokeStyle = 'rgba(152,83,79,.7)'; c.lineWidth = 2;
  c.beginPath(); c.arc(110, 126, 7, 0.15, Math.PI - 0.15); c.stroke();
  // highlight
  c.fillStyle = 'rgba(255,255,255,.09)';
  c.beginPath(); c.ellipse(80, 62, 20, 12, -0.4, 0, TAU); c.fill();
}

/* ================================= UI ================================== */
const els = {};
let toastTimerMap = new Map();
let objectiveTimer = null;
let levelTimer = null;
let hudTimer = 0;
let ambientTimer = 0;
let saveTimer = 0;
let regionTimer = 0;
let helpReturn = 'title';
let mapReturn = 'playing';
let pausedReturn = 'playing';

function cacheDom() {
  const ids = [
    'hud', 'startScreen', 'loadingScreen', 'loadingBar', 'miniMap', 'regionName', 'clockText',
    'questPanel', 'questTitle', 'questObjective', 'questProgress', 'party', 'charElement', 'charName',
    'charLevel', 'hpFill', 'hpText', 'staminaFill', 'statusRow', 'skillE', 'skillQ', 'skillECd',
    'skillQCd', 'skillETimer', 'skillQTimer', 'skillEName', 'skillQName', 'moraCount', 'shardCount',
    'bossBar', 'bossName', 'bossLevel', 'bossFill', 'bossGhost', 'bossPhase', 'interactPrompt',
    'interactText', 'toastStack', 'objectiveBanner', 'obTitle', 'obSub', 'levelBanner', 'levelNum',
    'reticle', 'dialogueScreen', 'dialogueSpeaker', 'dialogueText', 'dialogueHint', 'portraitCanvas',
    'mapScreen', 'worldMap', 'helpScreen', 'pauseScreen', 'pauseStats', 'endingScreen', 'endingStats',
    'damageFlash', 'healFlash', 'btnNew', 'btnContinue', 'btnTutorial', 'btnMap',
    'btnHelp', 'btnSound', 'btnPause', 'btnResume', 'btnPauseMap', 'btnPauseHelp', 'btnRestart',
    'btnEndingClose', 'dialogueAdvance', 'cinemaBars', 'worldCounters'
  ];
  for (const id of ids) if (!els[id]) els[id] = document.getElementById(id);
  els.soundIcon = document.querySelector('#btnSound .icon');
  els.worldCounters = document.querySelector('.world-counters');
}

function buildPartyUI() {
  els.party.innerHTML = party.map((c, i) => `
    <div class="char-card" data-index="${i}" style="--el:${ELEMENTS[c.element].color};--energy:${Math.round(c.energy)}" title="${c.name}">
      <div class="ring"></div>
      <div class="orb">${c.short}</div>
      <div class="char-tag">${i + 1}</div>
      <div class="char-label">${c.name}</div>
      <div class="hp-pip"><i></i></div>
    </div>`).join('');
  els.party.querySelectorAll('.char-card').forEach(card => {
    card.addEventListener('click', () => switchCharacter(Number(card.dataset.index)));
  });
  updatePartyUI();
}

function updatePartyUI() {
  for (const card of els.party.querySelectorAll('.char-card')) {
    const i = Number(card.dataset.index);
    const c = party[i];
    card.classList.toggle('active', i === active);
    card.classList.toggle('dead', c.dead);
    card.style.setProperty('--energy', Math.round(c.energy));
    const pip = card.querySelector('.hp-pip i');
    if (pip) pip.style.width = `${clamp(c.hp / c.maxHp * 100, 0, 100)}%`;
  }
}

function updateHUD() {
  if (!party.length) return;
  const c = currentChar();
  const el = ELEMENTS[c.element];
  els.charElement.textContent = el.name;
  els.charElement.style.setProperty('--active-el', el.color);
  els.charName.textContent = c.name;
  els.charLevel.textContent = `Lv.${progress.level}`;
  const hpPct = clamp(c.hp / c.maxHp * 100, 0, 100);
  els.hpFill.style.width = `${hpPct}%`;
  els.hpFill.style.background = hpPct < 28 ? 'linear-gradient(90deg,#c94b4b,#ef7b72)' : 'linear-gradient(90deg,#4fbd7c,#8fe0a3)';
  els.hpText.textContent = `${Math.ceil(c.hp)} / ${c.maxHp}`;
  els.staminaFill.style.width = `${clamp(player.stamina / player.maxStamina * 100, 0, 100)}%`;
  els.statusRow.innerHTML = player.aura ? `<span class="status-chip ${player.aura.el === 'hydro' ? 'wet' : player.aura.el === 'pyro' ? 'burn' : ''}">${ELEMENTS[player.aura.el].name}元素附着</span>` : '';
  els.moraCount.textContent = progress.mora;
  els.shardCount.textContent = `${progress.shards.filter(Boolean).length} / 3`;

  const eRatio = c.skill.cd > 0 ? clamp(c.cd / c.skill.cd, 0, 1) : 0;
  els.skillE.classList.toggle('cooling', c.cd > 0);
  els.skillE.classList.toggle('ready', c.cd <= 0);
  els.skillE.style.setProperty('--p', (eRatio * 100).toFixed(1));
  els.skillETimer.textContent = c.cd > 0 ? Math.ceil(c.cd) : '';
  els.skillEName.textContent = c.skill.name;

  const energy = Math.floor(c.energy);
  els.skillQ.classList.toggle('ready', energy >= 100);
  els.skillQ.classList.toggle('charging', energy < 100);
  els.skillQ.style.setProperty('--p', (100 - energy).toFixed(1));
  els.skillQTimer.textContent = energy >= 100 ? '' : energy;
  els.skillQName.textContent = c.burst.name;
  els.clockText.textContent = formatClock(game.time);
  els.regionName.textContent = game.region;
  updatePartyUI();
  updateBossBar();
}

function updateQuestUI() {
  const m = progress.main;
  let title = '星陨之约';
  let obj = '';
  const shards = progress.shards.filter(Boolean).length;
  if (m === 0) { obj = '前往风起驿站，寻找守林人「岚」。'; }
  else if (m === 1) {
    obj = '取回散落在三座星辉祭坛的碎片。';
  } else if (m === 2) {
    obj = '回到风起驿站，将三枚碎片交给岚。';
  } else if (m === 3) {
    title = '沉星遗迹';
    obj = '前往东南方的沉星遗迹，击败深渊咏者·渊火。';
  } else if (m === 4) {
    title = '星渊的回响';
    obj = '回到风起驿站，将一切告诉岚。';
  } else {
    title = '旅途仍在继续';
    obj = '第一章已完成。星落之境还有更多的回声等待发现。';
  }
  els.questTitle.textContent = title;
  els.questObjective.textContent = obj;
  let pips = '';
  if (m === 1 || m === 2) {
    pips = `<div class="pips">${[0, 1, 2].map(i => `<span class="pip"><i style="width:${progress.shards[i] ? 100 : 0}%"></i></span>`).join('')}</div><span>星辉碎片 ${shards} / 3</span>`;
  } else if (m === 3) {
    pips = '<span>封印已松动</span>';
  } else if (m === 4) {
    pips = '<span>渊火已陨落</span>';
  }
  let side = '';
  if (progress.side === 1) {
    const n = Math.min(5, progress.herbs.length);
    side = `<div class="side-quest-line"><b>支线 · 湖边的灯</b><span>灯芯草 ${n} / 5</span></div>`;
  }
  els.questProgress.innerHTML = pips + side;
}

function updateBossBar() {
  if (!els.bossBar) return;
  if (!boss || !bossBarVisible) { els.bossBar.classList.add('hidden'); return; }
  els.bossBar.classList.remove('hidden');
  const pct = clamp(boss.hp / boss.maxHp * 100, 0, 100);
  els.bossFill.style.width = `${pct}%`;
  els.bossGhost.style.width = `${pct}%`;
  els.bossName.textContent = boss.name;
  els.bossLevel.textContent = `Lv.${boss.level}`;
}

function updateInteractPrompt() {
  if (game.mode !== 'playing' || !interactionTarget) {
    els.interactPrompt.classList.add('hidden');
    return;
  }
  els.interactPrompt.classList.remove('hidden');
  els.interactPrompt.classList.toggle('locked', !!interactionTarget.locked);
  els.interactText.textContent = interactionTarget.locked ? '需要先清理守卫' : interactionTarget.text;
}

function showToast(html) {
  const div = document.createElement('div');
  div.className = 'toast';
  div.innerHTML = html;
  els.toastStack.appendChild(div);
  const id = ++toastSeq;
  const timer = setTimeout(() => {
    div.style.opacity = '0';
    div.style.transition = 'opacity .3s';
    setTimeout(() => div.remove(), 300);
    toastTimerMap.delete(id);
  }, 3100);
  toastTimerMap.set(id, timer);
  while (els.toastStack.children.length > 4) els.toastStack.firstElementChild.remove();
}

function showObjective(title, sub) {
  els.obTitle.textContent = title;
  els.obSub.textContent = sub;
  els.objectiveBanner.classList.remove('hidden');
  if (objectiveTimer) clearTimeout(objectiveTimer);
  objectiveTimer = setTimeout(() => els.objectiveBanner.classList.add('hidden'), 3400);
  AudioEngine.sfx('level');
}

function showLevelBanner() {
  els.levelNum.textContent = `Lv.${progress.level}`;
  els.levelBanner.classList.remove('hidden');
  els.levelBanner.style.animation = 'none';
  void els.levelBanner.offsetWidth;
  els.levelBanner.style.animation = '';
  if (levelTimer) clearTimeout(levelTimer);
  levelTimer = setTimeout(() => els.levelBanner.classList.add('hidden'), 2900);
}

function formatClock(minutes) {
  const h = Math.floor((minutes / 60) % 24);
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function formatDuration(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}小时${m}分` : `${m}分钟`;
}

/* ------------------------------- dialogue -------------------------------- */
function startDialogue(key, name, lines, onEnd) {
  dialogue = { key, name, lines, index: 0, char: 0, typing: true, onEnd };
  game.mode = 'dialogue';
  player.attackHeld = false;
  input.attackHeld = false;
  interactionTarget = null;
  updateInteractPrompt();
  els.hud.classList.add('dialogue-mode');
  els.reticle.classList.add('hidden');
  els.dialogueScreen.classList.remove('hidden');
  els.dialogueSpeaker.textContent = name;
  drawPortrait(key);
  refreshDialogueLine(true);
  AudioEngine.sfx('ui');
}

function refreshDialogueLine(instant = false) {
  if (!dialogue) return;
  const full = dialogue.lines[dialogue.index] || '';
  if (instant) dialogue.char = full.length;
  els.dialogueText.textContent = full.slice(0, Math.floor(dialogue.char));
  els.dialogueHint.textContent = dialogue.char >= full.length ? '点击继续' : '点击显示全文';
  const next = els.dialogueScreen.querySelector('.dialogue-next');
  if (next) next.style.opacity = dialogue.char >= full.length ? '1' : '0.5';
}

function updateDialogue(dt) {
  if (!dialogue) return;
  const full = dialogue.lines[dialogue.index] || '';
  if (dialogue.char < full.length) {
    dialogue.char += dt * 38;
    if (dialogue.char > full.length) dialogue.char = full.length;
    const prev = Math.floor(dialogue.char - dt * 38);
    if (Math.floor(dialogue.char) !== prev && Math.floor(dialogue.char) % 3 === 0) {
      AudioEngine.tone(720 + Math.random() * 120, 0.02, 'sine', 0.008, 0, 0, AudioEngine.sfxGain);
    }
    els.dialogueText.textContent = full.slice(0, Math.floor(dialogue.char));
    els.dialogueHint.textContent = '点击显示全文';
  } else {
    els.dialogueHint.textContent = '点击继续';
  }
}

function advanceDialogue() {
  if (!dialogue) return;
  const full = dialogue.lines[dialogue.index] || '';
  if (dialogue.char < full.length) {
    dialogue.char = full.length;
    els.dialogueText.textContent = full;
    els.dialogueHint.textContent = '点击继续';
    return;
  }
  dialogue.index++;
  dialogue.char = 0;
  if (dialogue.index >= dialogue.lines.length) {
    endDialogue();
    return;
  }
  refreshDialogueLine(false);
  AudioEngine.sfx('ui');
}

function endDialogue() {
  if (!dialogue) return;
  const cb = dialogue.onEnd;
  els.dialogueScreen.classList.add('hidden');
  dialogue = null;
  game.mode = 'playing';
  player.interactCd = 0.5;
  els.hud.classList.remove('dialogue-mode');
  els.reticle.classList.remove('hidden');
  if (cb) cb();
}

/* --------------------------------- quests -------------------------------- */
function talkTo(npc) {
  if (npc.id === 'lan') talkLan();
  else if (npc.id === 'xiaoman') talkXiaoman();
}

function talkLan() {
  const m = progress.main;
  if (m === 0) {
    startDialogue('lan', '岚', [
      '你终于来了。昨夜，三颗星从天上落了下来。',
      '它们不是流星。那是「星辉」——被深渊追逐了千年的碎片。',
      '我把它们封在三座星坛里，但守卫已经被惊动。去风语林、燃霞坡和镜湖，把碎片带回来。',
      '记住，元素之间会彼此回应。风能扩散，火与水会蒸发，雷会引爆。善用它们。'
    ], () => {
      progress.main = 1;
      updateQuestUI();
      showObjective('星陨之约', '取回散落在三座星坛的碎片');
      showToast('主线任务已更新 · <b>星陨之约</b>');
      saveGame();
    });
  } else if (m === 1) {
    const n = progress.shards.filter(Boolean).length;
    startDialogue('lan', '岚', [
      `已经找到 ${n} 枚碎片了？风会把你的脚步带向正确的地方。`,
      '三座星坛分别在西北的风语林、东北的燃霞坡，以及西南镜湖中央的小岛。',
      '祭坛的守卫不会轻易让路。若觉得棘手，就换一个元素试试。'
    ]);
  } else if (m === 2) {
    startDialogue('lan', '岚', [
      '你身上有星辉的味道。三枚碎片……都齐了。',
      '把它们放到遗迹的祭坛上，封印就会松动。渊火在那里沉睡，它一直在等这一刻。',
      '去吧。风会为你让路。'
    ], () => {
      progress.main = 3;
      updateQuestUI();
      showObjective('沉星遗迹', '前往东南方，击败深渊咏者·渊火');
      showToast('遗迹封印已松动 · <b>沉星遗迹</b>');
      addRing(2385, 2320, '#f3dfad', 20, 160, 1.2, 4);
      saveGame();
    });
  } else if (m === 3) {
    startDialogue('lan', '岚', [
      '遗迹就在东南方，沿着南边的旧路走。',
      '渊火会召唤火焰与陨星。别硬接，用闪避穿过它的攻击。',
      '如果撑不住，就回来。风不会责怪一个活着的人。'
    ]);
  } else if (m === 4) {
    startDialogue('lan', '岚', [
      '你回来了。深渊的门暂时合上了。',
      '但星辉告诉我，这只是开始。地底还有更古老的回声。',
      '收下这些吧。愿风记得你的名字，也记得你为这片原野做过的事。'
    ], () => {
      progress.main = 5;
      progress.mora += 1200;
      gainXp(320);
      updateQuestUI();
      updateHUD();
      saveGame();
      setTimeout(() => showEndingScreen(), 500);
    });
  } else {
    startDialogue('lan', '岚', [
      '风起驿站的门永远为你开着。',
      '等你想继续走的时候，就往地平线那边去吧。'
    ]);
  }
}

function talkXiaoman() {
  const s = progress.side;
  if (s === 0) {
    startDialogue('xiaoman', '小满', [
      '你是旅行者吗？湖边的灯芯草在夜里会发光，像小小的心愿。',
      '我想采五株送给岚姐姐，可是我够不到水边……',
      '你能帮我采五株灯芯草吗？就在镜湖附近。'
    ], () => {
      progress.side = 1;
      updateQuestUI();
      showObjective('湖边的灯', '收集 5 株灯芯草');
      showToast('支线任务已接取 · <b>湖边的灯</b>');
      saveGame();
    });
  } else if (s === 1) {
    const n = Math.min(5, progress.herbs.length);
    if (n >= 5) {
      startDialogue('xiaoman', '小满', [
        '哇，真的采到了！它们还在发光……',
        '谢谢你，旅行者。岚姐姐一定会喜欢的。',
        '这个给你，是我在湖边捡到的漂亮石头。'
      ], () => {
        progress.side = 2;
        progress.mora += 250;
        progress.bonusHp += 120;
        recalcParty(0.25);
        updateQuestUI();
        updateHUD();
        showObjective('湖边的灯', '支线完成 · 生命上限提升');
        showToast('支线完成 · 摩拉 <b>+250</b> · 生命上限 <b>+120</b>');
        saveGame();
      });
    } else {
      startDialogue('xiaoman', '小满', [
        `还差 ${5 - n} 株呢。灯芯草喜欢长在水边，会发出淡淡的绿光。`,
        '慢慢来，我会在这里等你。'
      ]);
    }
  } else {
    startDialogue('xiaoman', '小满', [
      '灯芯草真好看。谢谢你，旅行者！',
      '等你下次回来，我再给你讲湖里的故事。'
    ]);
  }
}

function showEndingScreen() {
  if (game.mode === 'ending') return;
  game.mode = 'ending';
  const stats = [
    ['冒险等阶', `Lv.${progress.level}`],
    ['旅途时长', formatDuration(game.playtime)],
    ['击败敌人', game.kills],
    ['星辉碎片', '3 / 3']
  ];
  els.endingStats.innerHTML = stats.map(s => `<div><b>${s[1]}</b><span>${s[0]}</span></div>`).join('');
  els.endingScreen.classList.remove('hidden');
  AudioEngine.sfx('level');
}

/* --------------------------------- save --------------------------------- */
function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
}
function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; }
}
function saveGame() {
  if (!game.started || game.mode === 'title') return;
  try {
    const data = {
      version: 1,
      savedAt: Date.now(),
      player: { x: player.x, y: player.y },
      time: game.time,
      playtime: game.playtime,
      bossDefeated: game.bossDefeated,
      progress: {
        main: progress.main,
        shards: [...progress.shards],
        side: progress.side,
        herbs: [...progress.herbs],
        chests: [...progress.chests],
        mora: progress.mora,
        level: progress.level,
        xp: progress.xp,
        bonusHp: progress.bonusHp,
        kills: progress.kills
      }
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) { /* storage may be unavailable */ }
}

function applySave() {
  const data = loadSave();
  if (!data || !data.progress) return false;
  const p = data.progress;
  progress.main = p.main ?? 0;
  progress.shards = Array.isArray(p.shards) ? p.shards.slice(0, 3) : [false, false, false];
  progress.side = p.side ?? 0;
  progress.herbs = Array.isArray(p.herbs) ? [...p.herbs] : [];
  progress.chests = Array.isArray(p.chests) ? [...p.chests] : [];
  progress.mora = p.mora ?? 0;
  progress.level = p.level ?? 1;
  progress.xp = p.xp ?? 0;
  progress.bonusHp = p.bonusHp ?? 0;
  progress.kills = p.kills ?? 0;
  if (data.player) { player.x = data.player.x ?? 1560; player.y = data.player.y ?? 2050; }
  game.time = data.time ?? 9 * 60 + 20;
  game.playtime = data.playtime ?? 0;
  game.kills = progress.kills;
  game.bossDefeated = !!data.bossDefeated || progress.main >= 4;
  initParty();
  recalcParty(0);
  for (const c of party) c.hp = c.maxHp;
  for (const c of chests) c.opened = progress.chests.includes(c.id);
  for (const s of shrines) s.collected = !!progress.shards[s.index];
  for (const h of herbs) h.collected = progress.herbs.includes(h.id);
  if (game.bossDefeated) {
    if (boss) { boss.dead = true; boss.deathTime = 3; boss.dormant = true; }
    if (!chests.some(c => c.id === 'bossReward')) {
      chests.push({ id: 'bossReward', x: 2700, y: 2545, rarity: 'precious', opened: progress.chests.includes('bossReward'), openAnim: 0, boss: true });
    }
  }
  bossBarVisible = false;
  if (els.bossBar) els.bossBar.classList.add('hidden');
  camera.x = player.x; camera.y = player.y;
  return true;
}

function resetGame() {
  Object.assign(progress, {
    main: 0, shards: [false, false, false], side: 0, herbs: [], chests: [],
    mora: 0, level: 1, xp: 0, bonusHp: 0, kills: 0
  });
  game.time = 9 * 60 + 20;
  game.playtime = 0;
  game.kills = 0;
  game.bossStarted = false;
  game.bossDefeated = false;
  game.region = '风起原野';
  player.x = 1560; player.y = 2050; player.vx = player.vy = 0;
  player.facing = -Math.PI / 2; player.aura = null; player.invuln = 0;
  player.stamina = 100; player.attackHeld = false;
  for (const c of chests) { c.opened = false; c.openAnim = 0; }
  for (const s of shrines) s.collected = false;
  for (const h of herbs) h.collected = false;
  for (const c of camps) { c.cleared = false; c.respawn = 0; }
  initParty();
  enemies = [];
  boss = null;
  spawnAllEnemies();
  bossBarVisible = false;
  if (els.bossBar) els.bossBar.classList.add('hidden');
  camera.x = player.x; camera.y = player.y;
  AudioEngine.combat = false;
}

/* -------------------------------- screens -------------------------------- */
function startGame(useSave) {
  AudioEngine.init();
  AudioEngine.resume();
  if (useSave) {
    if (!applySave()) resetGame();
    else buildPartyUI();
  } else {
    resetGame();
    buildPartyUI();
  }
  game.started = true;
  game.mode = 'playing';
  game.loaded = true;
  els.startScreen.style.transition = 'opacity .8s ease';
  els.startScreen.style.opacity = '0';
  setTimeout(() => els.startScreen.classList.add('hidden'), 820);
  els.hud.classList.remove('hidden');
  requestAnimationFrame(() => els.hud.classList.add('show'));
  if (!useSave) {
    els.cinemaBars.classList.add('on');
    setTimeout(() => els.cinemaBars.classList.remove('on'), 1600);
  }
  updateQuestUI();
  updateHUD();
  camera.x = player.x; camera.y = player.y;
  if (!useSave) {
    showObjective('星陨之约', '前往风起驿站，寻找守林人「岚」');
    setTimeout(() => showToast('WASD 移动 · 鼠标瞄准 / 攻击 · <b>E</b> 战技 · <b>Q</b> 爆发'), 900);
    setTimeout(() => showToast('靠近人物或宝箱时按 <b>F</b> 交互 · <b>M</b> 打开地图'), 4600);
  } else {
    showToast(`欢迎回来，旅行者 · <b>Lv.${progress.level}</b>`);
  }
  updateInteractPrompt();
  saveGame();
}

function openPause() {
  if (game.mode !== 'playing') return;
  pausedReturn = 'playing';
  game.mode = 'paused';
  player.attackHeld = false;
  input.attackHeld = false;
  els.pauseStats.innerHTML = [
    [`Lv.${progress.level}`, '冒险等阶'],
    [formatDuration(game.playtime), '旅途时长'],
    [`${game.kills}`, '击败敌人'],
    [`${progress.shards.filter(Boolean).length}/3`, '星辉碎片']
  ].map(s => `<div><b>${s[0]}</b><span>${s[1]}</span></div>`).join('');
  els.pauseScreen.classList.remove('hidden');
  els.reticle.classList.add('hidden');
  updateInteractPrompt();
}

function closePause() {
  els.pauseScreen.classList.add('hidden');
  game.mode = 'playing';
  els.reticle.classList.remove('hidden');
}

function openMap(fromPause = false) {
  if (game.mode !== 'playing' && game.mode !== 'paused') return;
  mapReturn = fromPause ? 'paused' : 'playing';
  game.mode = 'map';
  player.attackHeld = false;
  input.attackHeld = false;
  if (fromPause) els.pauseScreen.classList.add('hidden');
  drawWorldMap();
  els.mapScreen.classList.remove('hidden');
  els.reticle.classList.add('hidden');
  AudioEngine.sfx('ui');
}

function closeMap() {
  els.mapScreen.classList.add('hidden');
  if (mapReturn === 'paused') {
    game.mode = 'paused';
    els.pauseScreen.classList.remove('hidden');
  } else {
    game.mode = 'playing';
    els.reticle.classList.remove('hidden');
  }
}

function openHelp() {
  if (game.mode === 'help') return;
  helpReturn = game.mode;
  if (game.mode === 'playing' || game.mode === 'paused') game.mode = 'help';
  player.attackHeld = false;
  input.attackHeld = false;
  els.helpScreen.classList.remove('hidden');
  els.reticle.classList.add('hidden');
}

function closeHelp() {
  els.helpScreen.classList.add('hidden');
  if (helpReturn === 'paused') { game.mode = 'paused'; els.pauseScreen.classList.remove('hidden'); }
  else if (helpReturn === 'title') { game.mode = 'title'; }
  else { game.mode = 'playing'; els.reticle.classList.remove('hidden'); }
}

function closeEnding() {
  els.endingScreen.classList.add('hidden');
  game.mode = 'playing';
  els.reticle.classList.remove('hidden');
  showToast('第一章已完成 · 继续探索星落之境');
}

/* -------------------------------- input --------------------------------- */
function updateMouseWorld() {
  input.mouse.wx = (input.mouse.x - vw / 2) / camera.zoom + camera.x;
  input.mouse.wy = (input.mouse.y - vh / 2) / camera.zoom + camera.y;
}

function bindInput() {
  window.addEventListener('resize', resize);
  window.addEventListener('mousemove', e => {
    input.mouse.x = e.clientX; input.mouse.y = e.clientY; input.mouse.inside = true;
    if (els.reticle) { els.reticle.style.left = e.clientX + 'px'; els.reticle.style.top = e.clientY + 'px'; }
    updateMouseWorld();
    if (game.mode === 'playing') els.reticle.classList.remove('hidden');
  });
  document.addEventListener('mouseleave', () => { input.mouse.inside = false; if (els.reticle) els.reticle.classList.add('hidden'); });
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (game.mode !== 'playing') return;
    input.mouse.down = true; player.attackHeld = true;
    input.mouse.x = e.clientX; input.mouse.y = e.clientY;
    updateMouseWorld();
    els.reticle.classList.add('attack');
  });
  window.addEventListener('pointerup', () => {
    input.mouse.down = false; player.attackHeld = false;
    if (els.reticle) els.reticle.classList.remove('attack');
  });
  window.addEventListener('blur', () => {
    input.keys.clear(); player.attackHeld = false; input.mouse.down = false;
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  window.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'tab'].includes(key)) e.preventDefault();
    if (key === 'shift') { input.keys.add('shift'); return; }
    if (['w', 'a', 's', 'd'].includes(key)) { input.keys.add(key); return; }
    if (e.repeat) return;
    if (game.mode === 'dialogue') {
      if (key === 'f' || key === ' ' || key === 'enter') advanceDialogue();
      return;
    }
    if (game.mode === 'map') {
      if (key === 'm' || key === 'escape') closeMap();
      return;
    }
    if (game.mode === 'help') {
      if (key === 'h' || key === 'escape') closeHelp();
      return;
    }
    if (game.mode === 'paused') {
      if (key === 'escape') closePause();
      else if (key === 'm') openMap(true);
      else if (key === 'h') openHelp();
      return;
    }
    if (game.mode === 'ending') {
      if (key === 'escape' || key === 'enter') closeEnding();
      return;
    }
    if (game.mode === 'title') {
      if (key === 'enter' && !hasSave()) startGame(false);
      return;
    }
    if (game.mode !== 'playing') return;

    if (key === ' ') { startDash(); return; }
    if (key === 'e') { useSkill(); return; }
    if (key === 'q') { useBurst(); return; }
    if (key === 'f') { doInteract(); return; }
    if (key === 'm') { openMap(false); return; }
    if (key === 'h') { openHelp(); return; }
    if (key === 'escape') { openPause(); return; }
    if (key === 'j') { player.attackHeld = true; return; }
    if (['1', '2', '3', '4'].includes(key)) { switchCharacter(Number(key) - 1); return; }
  });
  window.addEventListener('keyup', e => {
    const key = e.key.toLowerCase();
    if (key === 'shift') input.keys.delete('shift');
    else input.keys.delete(key);
    if (key === 'j') player.attackHeld = false;
  });

  els.dialogueAdvance.addEventListener('click', advanceDialogue);
  els.dialogueScreen.addEventListener('click', e => {
    if (e.target.closest('.dialogue-main') || e.target.closest('.dialogue-click') || e.target.closest('.dialogue-portrait')) advanceDialogue();
  });
  els.btnNew.addEventListener('click', () => {
    if (hasSave() && !confirm('已有旅程进度。开始新的旅程会覆盖当前存档，确定继续吗？')) return;
    startGame(false);
  });
  els.btnContinue.addEventListener('click', () => startGame(true));
  els.btnTutorial.addEventListener('click', openHelp);
  els.btnMap.addEventListener('click', () => openMap(false));
  els.btnHelp.addEventListener('click', openHelp);
  els.btnPause.addEventListener('click', openPause);
  els.btnResume.addEventListener('click', closePause);
  els.btnPauseMap.addEventListener('click', () => openMap(true));
  els.btnPauseHelp.addEventListener('click', openHelp);
  els.btnRestart.addEventListener('click', () => {
    if (confirm('确定要重新开始吗？当前进度将被清除。')) {
      try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
      location.reload();
    }
  });
  els.btnEndingClose.addEventListener('click', closeEnding);
  els.btnSound.addEventListener('click', () => {
    AudioEngine.init();
    AudioEngine.setEnabled(!AudioEngine.enabled);
    els.soundIcon.classList.toggle('muted', !AudioEngine.enabled);
    els.btnSound.querySelector('em').textContent = AudioEngine.enabled ? '声音' : '静音';
    AudioEngine.sfx('ui');
  });
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.close === 'map') closeMap();
      else if (btn.dataset.close === 'help') closeHelp();
    });
  });
  document.addEventListener('pointerdown', () => { AudioEngine.init(); AudioEngine.resume(); }, { once: true });
}

/* -------------------------------- loop ---------------------------------- */
function update(dt) {
  if (game.shake > 0) {
    game.shake *= Math.pow(0.0007, dt);
    if (game.shake < 0.08) game.shake = 0;
  }
  if (game.mode === 'title') {
    updateCamera(dt);
    updateAmbient(dt, true);
    updateParticles(dt * 0.65);
    return;
  }
  if (game.mode === 'dialogue') {
    updateDialogue(dt);
    updateParticles(dt * 0.45);
    return;
  }
  if (game.mode === 'paused' || game.mode === 'map' || game.mode === 'help' || game.mode === 'ending') return;
  if (game.mode === 'dead') { updateParticles(dt); updateCamera(dt); return; }
  if (game.hitStop > 0) {
    game.hitStop -= dt;
    updateParticles(dt * 0.16);
    updateCamera(dt);
    return;
  }
  game.playtime += dt;
  updateMouseWorld();
  updatePlayer(dt);
  updateEnemies(dt);
  updateProjectiles(dt);
  updateFields(dt);
  updatePickups(dt);
  updateHerbs(dt);
  updateParticles(dt);
  updateAmbient(dt, false);
  updateCamera(dt);
  clampCamera();

  regionTimer -= dt;
  if (regionTimer <= 0) {
    regionTimer = 0.8;
    const r = regionAt(player.x, player.y);
    if (r !== game.region) {
      game.region = r;
      showToast(`进入 · <b>${r}</b>`);
    }
  }
  if (progress.main >= 3 && !game.bossDefeated && !game.bossStarted && boss && !boss.dead) {
    if (dist(player.x, player.y, boss.x, boss.y) < 410) startBossFight();
  }
  for (const c of camps) {
    if (c.cleared && c.respawn > 0) {
      c.respawn -= dt;
      if (c.respawn <= 0 && dist(player.x, player.y, c.x, c.y) > 420) respawnCamp(c);
    }
  }
  hudTimer -= dt;
  if (hudTimer <= 0) { hudTimer = 0.08; updateHUD(); }
  saveTimer += dt;
  if (saveTimer > 18) { saveTimer = 0; saveGame(); }
}

function respawnCamp(camp) {
  camp.cleared = false;
  camp.respawn = 0;
  camp.alive = 0;
  camp.enemies.forEach(([type, lvl], i) => {
    const a = i / camp.enemies.length * TAU + R();
    const rad = 30 + R() * 55;
    spawnEnemy(type, camp.x + Math.cos(a) * rad, camp.y + Math.sin(a) * rad, lvl, camp.id);
    camp.alive++;
  });
}

function updateAmbient(dt, titleMode) {
  if (!titleMode) {
    game.time += dt * 1.6;
    if (game.time >= 1440) game.time -= 1440;
  }
  ambientTimer -= dt;
  if (ambientTimer > 0) return;
  ambientTimer = 0.14;
  const night = getAmbient().night > 0.45;
  for (const h of houses) {
    if (!inView(h.x, h.y, 300)) continue;
    if (Math.random() < 0.25) {
      addParticle(h.x + h.w * 0.24, h.y - h.h * 0.7 - 54, {
        vx: rand(8, -2), vy: rand(-10, -22), life: rand(2.2, 1.2), size: rand(6, 3),
        color: night ? 'rgba(120,130,145,.28)' : 'rgba(220,220,210,.24)', type: 'smoke', drag: 0.995, alpha: 0.5
      });
    }
  }
  for (const d of decor) {
    if (d.type !== 'campfire') continue;
    if (!inView(d.x, d.y, 250)) continue;
    if (Math.random() < 0.55) {
      addParticle(d.x + rand(7, -7), d.y - 12, {
        vx: rand(12, -12), vy: rand(-22, -50), life: rand(0.8, 0.35), size: rand(2.4, 0.8),
        color: Math.random() > 0.5 ? '#ffb35e' : '#ff6a3d', type: 'ember', glow: true
      });
    }
  }
  if (Math.random() < 0.62) {
    const nearAutumn = player.x > 2050 && player.y < 1500;
    const nearBlossom = dist(player.x, player.y, 1560, 1800) < 700;
    const color = nearAutumn ? (Math.random() > 0.5 ? '#d99a58' : '#b96d3c') : nearBlossom ? '#f2c1ca' : '#a9c57f';
    const x = player.x + rand(vw / camera.zoom * 0.55, -vw / camera.zoom * 0.55);
    const y = player.y + rand(vh / camera.zoom * 0.5, -vh / camera.zoom * 0.55);
    addParticle(x, y, {
      vx: rand(24, 8), vy: rand(12, -8), life: rand(4.5, 2.2), size: rand(2.2, 1.1),
      color, type: 'leaf', drag: 0.998, gravity: 1.5, alpha: 0.7
    });
  }
  if (night && Math.random() < 0.35) {
    const a = Math.random() * TAU, rr = rand(180, 30);
    addParticle(player.x + Math.cos(a) * rr, player.y + Math.sin(a) * rr * 0.6 - 20, {
      vx: rand(12, -12), vy: rand(10, -10), life: rand(3.2, 1.4), size: rand(1.6, 0.7),
      color: '#f7ea9d', type: 'star', glow: true, drag: 0.996, alpha: 0.7
    });
  }
}

/* --------------------------------- boot --------------------------------- */
let lastFrame = 0;
function frame(ts) {
  if (!lastFrame) lastFrame = ts;
  let dt = (ts - lastFrame) / 1000;
  lastFrame = ts;
  if (dt > 0.06) dt = 0.06;
  if (game.loaded) update(dt);
  if (game.loaded) render(ts);
  requestAnimationFrame(frame);
}

function resize() {
  const oldW = vw, oldH = vh;
  vw = window.innerWidth; vh = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(vw * dpr);
  canvas.height = Math.floor(vh * dpr);
  canvas.style.width = vw + 'px';
  canvas.style.height = vh + 'px';
  const z = clamp(Math.min(vw / 1500, vh / 850), 0.72, 1.15);
  camera.zoom = z;
  if (oldW && oldH) {
    camera.x = clamp(camera.x, vw / 2 / z, WORLD.w - vw / 2 / z);
    camera.y = clamp(camera.y, vh / 2 / z, WORLD.h - vh / 2 / z);
  }
  updateMouseWorld();
}

function boot() {
  cacheDom();
  initParty();
  buildPartyUI();
  bindInput();
  resize();
  game.mode = 'title';
  game.loaded = false;
  els.loadingBar.style.width = '8%';
  if (hasSave()) {
    els.btnContinue.classList.remove('hidden');
    const newLabel = els.btnNew.querySelector('span');
    if (newLabel) newLabel.textContent = '新的旅程';
    const s = loadSave();
    if (s?.progress) {
      const span = els.btnContinue.querySelector('small');
      if (span) span.textContent = `CONTINUE · LV.${s.progress.level || 1}`;
    }
  }
  setTimeout(() => {
    try {
      buildWorld();
      game.loaded = true;
      updateQuestUI();
      updateHUD();
      els.loadingBar.style.width = '100%';
      setTimeout(() => {
        els.loadingScreen.classList.add('done');
        setTimeout(() => els.loadingScreen.classList.add('hidden'), 900);
      }, 420);
      requestAnimationFrame(frame);
    } catch (err) {
      console.error(err);
      const t = document.querySelector('.loading-text');
      if (t) t.textContent = '世界生成失败：' + err.message;
      const tip = document.querySelector('.loading-tip');
      if (tip) tip.textContent = '请刷新页面重试。';
    }
  }, 120);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

})();
