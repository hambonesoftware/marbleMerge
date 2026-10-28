import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Marble Merge Grand Prix is an intentionally track-constrained physics racer.
// The simulation uses fixed-step integration, momentum-based collisions and
// mass-conserving merges. A full rigid-body solver is a possible later upgrade.

const FIXED_STEP = 1 / 120;
const MARBLE_COUNT = 32;
const TRACK_WIDTH = 5.8;
const TRACK_SAMPLES = 1250;
const MAX_RACE_SECONDS = 155;
const TWO_PI = Math.PI * 2;
const TROUGH_HALF_ANGLE = Math.PI / 4;
const TROUGH_RADIUS = TRACK_WIDTH / (2 * Math.sin(TROUGH_HALF_ANGLE));
const TROUGH_SEGMENTS = 18;
const IDENTITIES = [
  { name: 'RED', hex: 0xff6077 },
  { name: 'ORANGE', hex: 0xffad4e },
  { name: 'YELLOW', hex: 0xffe15e },
  { name: 'GREEN', hex: 0x55f6ac },
  { name: 'CYAN', hex: 0x45e5ff },
  { name: 'BLUE', hex: 0x6e91ff },
  { name: 'VIOLET', hex: 0xb78aff },
  { name: 'PINK', hex: 0xff79dc }
];
const TIER_COLORS = [0x65d9ff, 0xffc353, 0xff6385, 0x8cf19c, 0x8c8eff, 0xed85ff, 0xf3dd68, 0xffffff, 0x65e9e6, 0xffa6a1];
const SWIRL_COLORS = [0xffde8b, 0x47d8e8, 0xfd6f8b, 0x175f63, 0x244cc7, 0xffca79, 0xf9d46b, 0x82fbd7];

const viewport = document.querySelector('#viewport');
const loading = document.querySelector('#loading');
const timeEl = document.querySelector('#time');
const aliveEl = document.querySelector('#alive');
const mergesEl = document.querySelector('#merges');
const progressMarbles = document.querySelector('#progress-marbles');
const progressLeader = document.querySelector('#progress-leader');
const progressCurrent = document.querySelector('#progress-current');
const colorChoices = document.querySelector('#color-choices');
const playButton = document.querySelector('#play-btn');
const resetButton = document.querySelector('#reset-btn');
const speedButton = document.querySelector('#speed-btn');
const onboardGlass = document.querySelector('#onboard-glass');
const selectedLabel = document.querySelector('#selected-label');
const raceToast = document.querySelector('#race-toast');
const calloutTitle = document.querySelector('#callout-title');
const calloutSubtitle = document.querySelector('#callout-subtitle');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2530);
scene.fog = new THREE.FogExp2(0x27313a, 0.0018);
const camera = new THREE.PerspectiveCamera(57, 1, 0.035, 1700);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
} catch (error) {
  loading.innerHTML = '<div class="loader-orb"></div><strong>3D GRAPHICS UNAVAILABLE</strong><span>This browser could not start WebGL. Try Safari or Chrome on a device with WebGL enabled.</span>';
  loading.style.padding = '24px';
  loading.style.textAlign = 'center';
  throw error;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
viewport.appendChild(renderer.domElement);

const pmrem = new THREE.PMREMGenerator(renderer);
const environment = pmrem.fromScene(new RoomEnvironment(), 0.04);
scene.environment = environment.texture;
pmrem.dispose();

scene.add(new THREE.HemisphereLight(0xfff0d5, 0x283347, 2.6));
const keyLight = new THREE.DirectionalLight(0xffe9c9, 3.3);
keyLight.position.set(25, 60, -40);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0xa7cfff, 1.9);
rimLight.position.set(-40, 20, 65);
scene.add(rimLight);

const longCoursePoints = [
  [0, 26, 0], [13, 25.3, 0], [28, 24.3, 8], [46, 23, 13],
  [63, 22, 2], [82, 20.5, -14], [102, 19.6, -12],
  [122, 18, 8], [141, 16.8, 16], [160, 15.6, 6],
  [180, 14.2, -14], [199, 12.8, -11], [219, 11.6, 10],
  [239, 10.3, 15], [257, 9.3, -2], [277, 7.9, -13],
  [295, 6.7, -4], [312, 5.2, 0]
];
// The course remains long, while the vertical profile is steeper still.
// A 5.6× height scale produces about 116.5 units of descent.
const curve = new THREE.CatmullRomCurve3(longCoursePoints.map(([x, y, z]) =>
  new THREE.Vector3(x * 2.4, 8 + (y - 5.2) * 5.6, z * 2.3)
), false, 'catmullrom', 0.24);
const trackLength = curve.getLength();
const track = [];
const UP = new THREE.Vector3(0, 1, 0);
for (let i = 0; i <= TRACK_SAMPLES; i++) {
  const u = i / TRACK_SAMPLES;
  const point = curve.getPointAt(u);
  const tangent = curve.getTangentAt(u).normalize();
  const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
  track.push({ point, tangent, normal });
}

function frameAt(s) {
  if (s <= 0) {
    const first = track[0];
    return { point: first.point.clone().addScaledVector(first.tangent, s), tangent: first.tangent, normal: first.normal };
  }
  const index = Math.min(TRACK_SAMPLES - 1, Math.floor(s / trackLength * TRACK_SAMPLES));
  const frac = Math.min(1, s / trackLength * TRACK_SAMPLES - index);
  const a = track[index];
  const b = track[index + 1];
  return {
    point: a.point.clone().lerp(b.point, frac),
    tangent: a.tangent.clone().lerp(b.tangent, frac).normalize(),
    normal: a.normal.clone().lerp(b.normal, frac).normalize()
  };
}

function troughHeight(lane) {
  const x = THREE.MathUtils.clamp(lane, -TRACK_WIDTH / 2, TRACK_WIDTH / 2);
  return TROUGH_RADIUS - Math.sqrt(Math.max(0, TROUGH_RADIUS * TROUGH_RADIUS - x * x));
}

function worldAt(s, lane, height = 0) {
  const frame = frameAt(s);
  return frame.point.addScaledVector(frame.normal, lane).addScaledVector(UP, troughHeight(lane) + height);
}

function marbleCenterAt(s, lane, radius) {
  // A sphere resting against the inner wall of a circular channel is offset
  // along the wall normal; its center follows a concentric arc of radius R-r.
  const centerRadius = Math.max(0.75, TROUGH_RADIUS - radius);
  const x = THREE.MathUtils.clamp(lane, -centerRadius * Math.sin(TROUGH_HALF_ANGLE), centerRadius * Math.sin(TROUGH_HALF_ANGLE));
  const height = TROUGH_RADIUS - Math.sqrt(Math.max(0, centerRadius * centerRadius - x * x));
  const frame = frameAt(s);
  return frame.point.addScaledVector(frame.normal, x).addScaledVector(UP, height - 0.07);
}

const trackGroup = new THREE.Group();
scene.add(trackGroup);

// Paint continuous oak grain in the longitudinal direction. The broad and
// fine grain, changing pore density and knots are deterministic so the
// surface can be regenerated offline without downloading image assets.
function makeWoodTexture() {
  const width = 512;
  const height = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const image = context.createImageData(width, height);
  const data = image.data;
  const knots = [{ x: 133, y: 230, width: 38, length: 119 }, { x: 397, y: 777, width: 31, length: 105 }];
  const hash = (x, y) => {
    const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return value - Math.floor(value);
  };
  for (let y = 0; y < height; y++) {
    const lengthDrift = 12 * Math.sin(y * 0.007) + 4 * Math.sin(y * 0.022);
    for (let x = 0; x < width; x++) {
      let warpedX = x + lengthDrift + 7 * Math.sin(y * 0.018 + x * 0.011);
      let knotDarkness = 0;
      for (const knot of knots) {
        const dx = (x - knot.x) / knot.width;
        const dy = (y - knot.y) / knot.length;
        const falloff = Math.exp(-1.7 * (dx * dx + dy * dy));
        warpedX += 25 * falloff * Math.sin(3.5 * dy);
        const ellipse = Math.sqrt(dx * dx + dy * dy);
        knotDarkness += 0.45 * Math.exp(-Math.pow((ellipse - 0.43) * 4.2, 2)) * falloff;
      }
      const grain = 0.53 * Math.sin(warpedX * 0.075 + Math.sin(y * 0.005) * 0.8)
        + 0.27 * Math.sin(warpedX * 0.19 + y * 0.003)
        + 0.13 * Math.sin(warpedX * 0.53 + 0.3 * Math.sin(y * 0.016));
      const pore = hash(Math.floor(x * 0.75), Math.floor(y * 0.43)) - 0.5;
      const shade = grain * 16 + pore * 9 - knotDarkness * 62 + Math.sin(x * 0.018) * 4;
      const offset = (y * width + x) * 4;
      data[offset] = THREE.MathUtils.clamp(175 + shade, 0, 255);
      data[offset + 1] = THREE.MathUtils.clamp(110 + shade * 0.78, 0, 255);
      data[offset + 2] = THREE.MathUtils.clamp(56 + shade * 0.55, 0, 255);
      data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}
const oakGrain = makeWoodTexture();
const bottomPositions = [];
const topPositions = [];
const indices = [];
const surfaceUvs = [];
const rowSize = TROUGH_SEGMENTS + 1;
for (let i = 0; i <= TRACK_SAMPLES; i++) {
  const f = track[i];
  for (let j = 0; j <= TROUGH_SEGMENTS; j++) {
    const angle = -TROUGH_HALF_ANGLE + j / TROUGH_SEGMENTS * (2 * TROUGH_HALF_ANGLE);
    const lateral = TROUGH_RADIUS * Math.sin(angle);
    const rise = TROUGH_RADIUS * (1 - Math.cos(angle));
    const point = f.point.clone().addScaledVector(f.normal, lateral);
    topPositions.push(point.x, point.y + rise - 0.1, point.z);
    bottomPositions.push(point.x, point.y + rise - 0.38, point.z);
    surfaceUvs.push(j / TROUGH_SEGMENTS, i / TRACK_SAMPLES * trackLength / 24);
  }
  if (i < TRACK_SAMPLES) {
    for (let j = 0; j < TROUGH_SEGMENTS; j++) {
      const k = i * rowSize + j;
      indices.push(k, k + rowSize, k + 1, k + 1, k + rowSize, k + rowSize + 1);
    }
  }
}
function stripGeometry(positions) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(surfaceUvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
const underTrack = new THREE.Mesh(stripGeometry(bottomPositions), new THREE.MeshStandardMaterial({
  map: oakGrain, color: 0x796657, metalness: 0, roughness: 0.58, side: THREE.DoubleSide
}));
trackGroup.add(underTrack);
const surface = new THREE.Mesh(stripGeometry(topPositions), new THREE.MeshPhysicalMaterial({
  map: oakGrain, color: 0xffefcf, metalness: 0, roughness: 0.31,
  clearcoat: 0.82, clearcoatRoughness: 0.22, side: THREE.DoubleSide
}));
trackGroup.add(surface);

function pathTube(offset, height, radius, material) {
  const points = [];
  for (let i = 0; i <= TRACK_SAMPLES; i += 3) {
    const f = track[i];
    points.push(f.point.clone().addScaledVector(f.normal, offset).addScaledVector(UP, troughHeight(offset) + height));
  }
  points.push(worldAt(trackLength, offset, height));
  const path = new THREE.CatmullRomCurve3(points);
  return new THREE.Mesh(new THREE.TubeGeometry(path, Math.min(1500, Math.ceil(trackLength * 1.3)), radius, 5, false), material);
}
const railMaterial = new THREE.MeshPhysicalMaterial({ color: 0x6c3820, metalness: 0, roughness: 0.3, clearcoat: 0.75 });
const railHighlight = new THREE.MeshStandardMaterial({ color: 0xdca76a, metalness: 0.15, roughness: 0.32 });
for (const side of [-1, 1]) {
  trackGroup.add(pathTube(side * (TRACK_WIDTH / 2 + 0.04), 0.08, 0.12, railMaterial));
  trackGroup.add(pathTube(side * (TRACK_WIDTH / 2 + 0.04), 0.15, 0.036, railHighlight));
}

// No center groove or parallel dividing strips: this is one uninterrupted
// quarter-circle wooden chute, not multiple marble lanes.
const supportMaterial = new THREE.MeshStandardMaterial({ color: 0x41362e, metalness: 0.12, roughness: 0.58 });
const baseY = -23;
for (let s = 12; s < trackLength; s += 25) {
  const p = worldAt(s, 0);
  const h = p.y - baseY;
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.28, h, 7), supportMaterial);
  pillar.position.set(p.x, baseY + h / 2, p.z);
  trackGroup.add(pillar);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(TRACK_WIDTH + 0.5, 0.13, 0.3), supportMaterial);
  const t = frameAt(s).tangent;
  cap.rotation.y = Math.atan2(t.z, t.x);
  cap.position.copy(p).addScaledVector(UP, -0.46);
  trackGroup.add(cap);
}

const floor = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshStandardMaterial({ color: 0x1b2026, metalness: 0.07, roughness: 0.88 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = baseY - 0.5;
scene.add(floor);

const obstacles = [];
const obstacleMaterial = new THREE.MeshPhysicalMaterial({ color: 0x844b2e, metalness: 0.03, roughness: 0.34, clearcoat: 0.65 });
for (let s = 38, i = 0; s < trackLength - 30; s += 56, i++) {
  const lane = ([-1.6, 1.7, 0.2, -2.15, 1.1, 0.0][i % 6]);
  const radius = i % 4 === 0 ? 0.63 : 0.42;
  obstacles.push({ s, lane, radius, lastHits: new Map() });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.1, 1.45, 14), obstacleMaterial);
  post.position.copy(worldAt(s, lane, 0.65));
  trackGroup.add(post);
  const top = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.9, 0.07, 8, 24), railMaterial);
  top.rotation.x = Math.PI / 2;
  top.position.copy(worldAt(s, lane, 1.44));
  trackGroup.add(top);
}

const finishCrossSection = [];
for (let j = 0; j <= TROUGH_SEGMENTS; j++) {
  finishCrossSection.push(worldAt(trackLength - 2, -TRACK_WIDTH / 2 + j * TRACK_WIDTH / TROUGH_SEGMENTS, 0.07));
}
const finishBar = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(finishCrossSection), 64, 0.13, 8, false), new THREE.MeshStandardMaterial({ color: 0xe5c885, metalness: 0.72, roughness: 0.22 }));
trackGroup.add(finishBar);

const marbleGeometry = new THREE.SphereGeometry(1, 40, 30);
const coreGeometry = new THREE.SphereGeometry(0.69, 20, 14);
const labelTextureCache = new Map();
const swirlTextureCache = new Map();

function makeSwirlTexture(identity) {
  if (swirlTextureCache.has(identity.name)) return swirlTextureCache.get(identity.name);
  const index = IDENTITIES.indexOf(identity);
  const primary = identity.hex;
  const secondary = SWIRL_COLORS[index];
  const channel = (hex, shift) => (hex >> shift) & 255;
  const width = 384;
  const height = 192;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const image = context.createImageData(width, height);
  const pixels = image.data;
  const phaseOffset = index * 0.49;
  const smoothstep = value => {
    const n = THREE.MathUtils.clamp(value, 0, 1);
    return n * n * (3 - 2 * n);
  };
  for (let y = 0; y < height; y++) {
    const v = y / (height - 1);
    for (let x = 0; x < width; x++) {
      const u = x / (width - 1);
      // Latitude-dependent phase bends the second color into broad, flowing
      // helices rather than straight stripes. All u-dependent terms loop at
      // the sphere's seam, so the swirl stays continuous as it spins.
      const phase = TWO_PI * (u * 3 - v * 1.55)
        + 1.32 * Math.sin(TWO_PI * v * 1.8 + phaseOffset)
        + 0.27 * Math.sin(TWO_PI * (u * 5 + v * 2) + phaseOffset);
      const wave = Math.sin(phase) + 0.20 * Math.sin(2 * phase + 0.75);
      const accent = smoothstep((wave + 0.18) / 0.45);
      const paleVein = smoothstep((Math.sin(phase * 2 + 0.5) - 0.87) * 5.0) * 0.1;
      const shade = 0.94 + 0.08 * Math.sin(TWO_PI * (v * 1.3 + u * 4) + phaseOffset);
      const k = (y * width + x) * 4;
      for (const [offset, shift] of [[0, 16], [1, 8], [2, 0]]) {
        const main = channel(primary, shift);
        const highlight = channel(secondary, shift);
        pixels[k + offset] = THREE.MathUtils.clamp((main * (1 - accent) + highlight * accent) * shade + paleVein * 24, 0, 255);
      }
      pixels[k + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  swirlTextureCache.set(identity.name, texture);
  return texture;
}

function labelTexture(tier) {
  if (labelTextureCache.has(tier)) return labelTextureCache.get(tier);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, 128, 128);
  context.font = `900 ${tier >= 8 ? 42 : 54}px Inter, Arial, sans-serif`;
  context.fillStyle = '#fff';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.shadowColor = '#081422';
  context.shadowBlur = 12;
  context.lineWidth = 5;
  context.strokeStyle = '#102238';
  context.strokeText(String(2 ** tier), 64, 66);
  context.fillText(String(2 ** tier), 64, 66);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  labelTextureCache.set(tier, texture);
  return texture;
}

function createMarbleMesh(racer) {
  const group = new THREE.Group();
  const spin = new THREE.Group();
  group.add(spin);
  const material = new THREE.MeshPhysicalMaterial({
    map: makeSwirlTexture(racer.identity), color: 0xffffff, metalness: 0.03,
    roughness: 0.08, transmission: 0.045, thickness: 0.8,
    clearcoat: 1, clearcoatRoughness: 0.025, ior: 1.47,
    envMapIntensity: 1.8
  });
  const shell = new THREE.Mesh(marbleGeometry, material);
  spin.add(shell);
  const coreMaterial = new THREE.MeshStandardMaterial({
    color: racer.identity.hex, metalness: 0.05, roughness: 0.25,
    transparent: true, opacity: 0.28, depthWrite: false
  });
  const core = new THREE.Mesh(coreGeometry, coreMaterial);
  spin.add(core);
  const number = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(racer.tier), transparent: true, depthTest: true, depthWrite: false }));
  number.scale.set(1.18, 1.18, 1);
  number.position.set(0, 0.07, 0);
  group.add(number);
  racer.group = group;
  racer.spin = spin;
  racer.shell = shell;
  racer.number = number;
  racer.visibleRadius = racer.radius;
  scene.add(group);
}

let racers = [];
let selectedId = 0;
let cameraMode = 'chase';
let raceStatus = 'running';
let raceTime = 0;
let totalMerges = 0;
let speedMultiplier = 1;
let accumulator = 0;
let lastFrameTime = performance.now();
let lastHudTime = 0;
let leaderId = 0;
let winner = null;
let toastUntil = 0;
let lookPoint = new THREE.Vector3(9, 24, 0);
let seeded = 3;
const effects = [];

function rand() {
  seeded = (Math.imul(seeded, 1664525) + 1013904223) | 0;
  return (seeded >>> 0) / 4294967296;
}
function radiusForTier(tier) { return 0.30 * Math.cbrt(2 ** (tier - 1)); }
function massForTier(tier) { return 2 ** (tier - 1); }

function createRacers() {
  for (const racer of racers) {
    if (racer.group) {
      scene.remove(racer.group);
      racer.shell.material.dispose();
      racer.group.traverse(object => {
        if (object.isMesh && object !== racer.shell) object.material.dispose();
        if (object.isSprite) object.material.dispose();
      });
    }
  }
  racers = [];
  seeded = 3;
  for (let i = 0; i < MARBLE_COUNT; i++) {
    const identity = IDENTITIES[i % IDENTITIES.length];
    const tier = i % 5 === 0 ? 2 : 1;
    const row = Math.floor(i / 8);
    const lane = -2.38 + (i % 8) * 0.68;
    const s = -row * 1.28 - rand() * 0.12;
    const racer = {
      id: i, identity, tier, mass: massForTier(tier), radius: radiusForTier(tier),
      s, lane, prevS: s, prevLane: lane,
      v: 7.4 + rand() * 0.9, vl: 0,
      drag: 0.035 + rand() * 0.009,
      bias: rand() * TWO_PI, roll: rand() * TWO_PI,
      alive: true, finished: false, finishTime: null,
      lastObstacle: -1, lastObstacleTime: -100,
      group: null, spin: null, shell: null, number: null
    };
    createMarbleMesh(racer);
    racers.push(racer);
  }
  buildProgressMarkers();
}

function buildProgressMarkers() {
  progressMarbles.replaceChildren();
  for (const racer of racers) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'progress-marble';
    button.style.setProperty('--row', `${15 + (racer.id % 5) * 17.5}%`);
    button.style.setProperty('--progress', '0%');
    button.style.setProperty('--identity-color', `#${racer.identity.hex.toString(16).padStart(6, '0')}`);
    button.style.setProperty('--ball-color', `#${racer.identity.hex.toString(16).padStart(6, '0')}`);
    button.style.setProperty('--swirl-color', `#${SWIRL_COLORS[IDENTITIES.indexOf(racer.identity)].toString(16).padStart(6, '0')}`);
    button.textContent = String(2 ** racer.tier);
    button.title = `${racer.identity.name} #${racer.id + 1}`;
    button.setAttribute('aria-label', `Follow ${racer.identity.name.toLowerCase()} marble ${racer.id + 1}`);
    button.addEventListener('click', () => selectMarble(racer.id));
    racer.progressMarker = button;
    racer.progressTier = racer.tier;
    progressMarbles.appendChild(button);
  }
}

function sortedRacers() {
  return racers.filter(r => r.alive).sort((a, b) => b.s - a.s);
}
function selectedRacer() {
  return racers.find(r => r.id === selectedId && r.alive) || sortedRacers()[0];
}

function sparkMerge(racer) {
  const color = TIER_COLORS[Math.min(TIER_COLORS.length - 1, racer.tier - 1)];
  const position = worldAt(racer.s, racer.lane, racer.radius);
  for (let i = 0; i < 10; i++) {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09 + rand() * 0.08, 0),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }));
    mesh.position.copy(position);
    scene.add(mesh);
    effects.push({ mesh, life: 0.65, vx: (rand() - 0.5) * 8, vy: rand() * 5, vz: (rand() - 0.5) * 8 });
  }
  if (racer.id === selectedId || totalMerges < 4) showToast(`${2 ** racer.tier}  •  MERGE!`, 900);
}

function combine(a, b) {
  // Preserve the actively watched marble when it participates in a merge.
  const survivor = b.id === selectedId ? b : a;
  const absorbed = survivor === a ? b : a;
  const combinedMass = survivor.mass + absorbed.mass;
  const p = (survivor.s * survivor.mass + absorbed.s * absorbed.mass) / combinedMass;
  const lateral = (survivor.lane * survivor.mass + absorbed.lane * absorbed.mass) / combinedMass;
  const velocity = (survivor.v * survivor.mass + absorbed.v * absorbed.mass) / combinedMass;
  const lateralVelocity = (survivor.vl * survivor.mass + absorbed.vl * absorbed.mass) / combinedMass;
  survivor.s = p;
  survivor.lane = lateral;
  survivor.v = velocity;
  survivor.vl = lateralVelocity;
  survivor.mass = combinedMass;
  survivor.tier += 1;
  survivor.radius = radiusForTier(survivor.tier);
  survivor.prevS = p;
  survivor.prevLane = lateral;
  // Preserve the chosen marble's two-color glass after it levels up.
  survivor.number.material.map = labelTexture(survivor.tier);
  survivor.number.material.needsUpdate = true;
  absorbed.alive = false;
  absorbed.group.visible = false;
  totalMerges++;
  sparkMerge(survivor);
}

function resolveMarbleCollisions() {
  const active = racers.filter(r => r.alive && !r.finished);
  for (let i = 0; i < active.length; i++) {
    const a = active[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < active.length; j++) {
      const b = active[j];
      if (!b.alive || Math.abs(a.s - b.s) > a.radius + b.radius + 0.13) continue;
      const dx = b.s - a.s;
      const dz = b.lane - a.lane;
      const minDist = a.radius + b.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= minDist * minDist) continue;
      if (a.tier === b.tier && a.tier < 9) {
        combine(a, b);
        if (!a.alive) break;
        continue;
      }
      const d = Math.max(0.00001, Math.sqrt(d2));
      const nx = d > 0.0001 ? dx / d : 1;
      const nz = d > 0.0001 ? dz / d : 0;
      const overlap = minDist - d;
      const totalInvMass = 1 / a.mass + 1 / b.mass;
      const aShare = (1 / a.mass) / totalInvMass;
      const bShare = (1 / b.mass) / totalInvMass;
      a.s -= nx * overlap * aShare * 0.68;
      a.lane -= nz * overlap * aShare * 0.68;
      b.s += nx * overlap * bShare * 0.68;
      b.lane += nz * overlap * bShare * 0.68;
      const relative = (b.v - a.v) * nx + (b.vl - a.vl) * nz;
      if (relative >= 0) continue;
      const impulse = -(1 + 0.64) * relative / totalInvMass;
      a.v -= impulse * nx / a.mass;
      a.vl -= impulse * nz / a.mass;
      b.v += impulse * nx / b.mass;
      b.vl += impulse * nz / b.mass;
    }
  }
}

function updateRacer(r, dt) {
  r.prevS = r.s;
  r.prevLane = r.lane;
  if (!r.alive || r.finished) return;
  const frame = frameAt(r.s);
  const downhill = -frame.tangent.y;
  const acceleration = 1.9 + 21 * downhill - r.drag * r.v * Math.abs(r.v);
  r.v += acceleration * dt;
  r.v = THREE.MathUtils.clamp(r.v, 1.3, 18.5);
  // Gravity restores marbles toward the bottom of the 90-degree circular
  // trough. Curvature and small individual variations keep the pack dynamic.
  const centerRadius = Math.max(0.75, TROUGH_RADIUS - r.radius);
  const centeredLane = THREE.MathUtils.clamp(r.lane, -centerRadius * 0.707, centerRadius * 0.707);
  const lateralGravity = -(5 / 7) * 12.5 * centeredLane * Math.sqrt(Math.max(0, centerRadius * centerRadius - centeredLane * centeredLane)) / (centerRadius * centerRadius);
  const forwardTangent = frameAt(r.s + 1.5).tangent;
  const rearTangent = frameAt(r.s - 1.5).tangent;
  const signedCurvature = (rearTangent.x * forwardTangent.z - rearTangent.z * forwardTangent.x) / 3;
  const curvePush = -THREE.MathUtils.clamp(r.v * r.v * signedCurvature, -5, 5);
  const mildVariation = Math.sin(r.s * 0.055 + r.bias) * 0.28;
  r.vl += (lateralGravity + curvePush * 0.55 + mildVariation - r.vl * 1.45) * dt;
  r.s += r.v * dt;
  r.lane += r.vl * dt;
  const limit = Math.max(0.15, (TROUGH_RADIUS - r.radius) * Math.sin(TROUGH_HALF_ANGLE) - 0.06);
  if (r.lane > limit) { r.lane = limit; r.vl = -Math.abs(r.vl) * 0.48; r.v *= 0.993; }
  if (r.lane < -limit) { r.lane = -limit; r.vl = Math.abs(r.vl) * 0.48; r.v *= 0.993; }
  for (let k = 0; k < obstacles.length; k++) {
    const o = obstacles[k];
    if (Math.abs(o.s - r.s) > r.radius + o.radius + 0.25) continue;
    const dx = r.s - o.s;
    const dz = r.lane - o.lane;
    const contact = r.radius + o.radius;
    if (dx * dx + dz * dz > contact * contact) continue;
    if (r.lastObstacle === k && raceTime - r.lastObstacleTime < 0.23) continue;
    r.lastObstacle = k;
    r.lastObstacleTime = raceTime;
    const sign = dz === 0 ? (r.bias > Math.PI ? -1 : 1) : Math.sign(dz);
    r.v *= 0.71 + Math.min(0.16, r.mass * 0.007);
    r.vl += sign * (2.9 / Math.sqrt(r.mass));
    r.lane += sign * 0.11;
  }
  if (r.s >= trackLength - 2) {
    r.finished = true;
    r.finishTime = raceTime;
    if (!winner) finishRace(r);
  }
}

function fixedUpdate(dt) {
  if (raceStatus !== 'running') return;
  raceTime += dt;
  for (const racer of racers) updateRacer(racer, dt);
  resolveMarbleCollisions();
  if (raceTime >= MAX_RACE_SECONDS && !winner) finishRace(sortedRacers()[0]);
}

function finishRace(racer) {
  winner = racer;
  raceStatus = 'finished';
  selectedId = racer.id;
  showToast(`${racer.identity.name} WINS!`, 8000);
  calloutTitle.textContent = `${racer.identity.name} TAKES THE FLAG`;
  calloutSubtitle.textContent = `Number ${2 ** racer.tier}  ·  ${raceTime.toFixed(1)} seconds  ·  ${totalMerges} merges`;
  playButton.innerHTML = '↻ <span>RACE AGAIN</span>';
  updateColors();
}

function showToast(message, duration) {
  raceToast.textContent = message;
  raceToast.classList.add('visible');
  toastUntil = performance.now() + duration;
}

function updateParticles(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const effect = effects[i];
    effect.life -= dt;
    if (effect.life <= 0) {
      scene.remove(effect.mesh);
      effect.mesh.material.dispose();
      effect.mesh.geometry.dispose();
      effects.splice(i, 1);
      continue;
    }
    effect.vy -= 13 * dt;
    effect.mesh.position.x += effect.vx * dt;
    effect.mesh.position.y += effect.vy * dt;
    effect.mesh.position.z += effect.vz * dt;
    effect.mesh.material.opacity = Math.min(1, effect.life * 1.9);
  }
}

function updateMarbleMeshes(dt, alpha) {
  for (const racer of racers) {
    if (!racer.alive) continue;
    const s = THREE.MathUtils.lerp(racer.prevS, racer.s, alpha);
    const lane = THREE.MathUtils.lerp(racer.prevLane, racer.lane, alpha);
    racer.visibleRadius += (racer.radius - racer.visibleRadius) * (1 - Math.exp(-dt * 13));
    racer.group.position.copy(marbleCenterAt(s, lane, racer.visibleRadius));
    racer.spin.scale.setScalar(racer.visibleRadius);
    racer.number.scale.setScalar(racer.visibleRadius * 2.4);
    racer.roll += Math.max(0, racer.v * dt) / Math.max(0.1, racer.visibleRadius);
    racer.spin.rotation.set(racer.roll, racer.roll * 0.17, racer.roll * 0.5);
    racer.group.visible = !(cameraMode === 'onboard' && racer.id === selectedRacer()?.id);
  }
}

function updateProgressMarkers(alpha) {
  const finishDistance = trackLength - 2;
  for (const racer of racers) {
    const marker = racer.progressMarker;
    if (!marker) continue;
    if (!racer.alive) {
      marker.classList.add('out');
      continue;
    }
    const interpolatedDistance = THREE.MathUtils.lerp(racer.prevS, racer.s, alpha);
    const percent = THREE.MathUtils.clamp(interpolatedDistance / finishDistance * 100, 0, 100);
    marker.style.setProperty('--progress', `${percent.toFixed(3)}%`);
    if (racer.tier !== racer.progressTier) {
      racer.progressTier = racer.tier;
      marker.textContent = String(2 ** racer.tier);
    }
  }
}

const desiredCamera = new THREE.Vector3();
const desiredLook = new THREE.Vector3();
function updateCamera(dt) {
  const racer = selectedRacer();
  if (!racer) return;
  const f = frameAt(racer.s);
  const ballPos = marbleCenterAt(racer.s, racer.lane, racer.visibleRadius + 0.03);
  const tangent = f.tangent;
  if (cameraMode === 'onboard') {
    desiredCamera.copy(ballPos).addScaledVector(UP, 0.08);
    desiredLook.copy(worldAt(racer.s + 18, racer.lane, 1.4));
    camera.fov = THREE.MathUtils.damp(camera.fov, 83, 3, dt);
  } else if (cameraMode === 'aerial') {
    desiredCamera.copy(ballPos).addScaledVector(UP, 32).addScaledVector(tangent, -13).addScaledVector(f.normal, 16);
    desiredLook.copy(worldAt(racer.s + 15, 0, 0.6));
    camera.fov = THREE.MathUtils.damp(camera.fov, 57, 3, dt);
  } else {
    desiredCamera.copy(ballPos).addScaledVector(UP, 8.5).addScaledVector(tangent, -17).addScaledVector(f.normal, 10.0);
    desiredLook.copy(worldAt(racer.s + 9, racer.lane, 1.3));
    camera.fov = THREE.MathUtils.damp(camera.fov, 57, 3, dt);
  }
  camera.position.lerp(desiredCamera, 1 - Math.exp(-dt * (cameraMode === 'onboard' ? 4.5 : 2.3)));
  lookPoint.lerp(desiredLook, 1 - Math.exp(-dt * 2.9));
  camera.lookAt(lookPoint);
  camera.updateProjectionMatrix();
  if (cameraMode === 'onboard') {
    onboardGlass.style.setProperty('--glass-rotation', `${-racer.roll * 180 / Math.PI}deg`);
    onboardGlass.style.setProperty('--glass-tint', `#${racer.identity.hex.toString(16).padStart(6, '0')}33`);
  }
}

function formatTime(t) {
  const minutes = Math.floor(t / 60).toString().padStart(2, '0');
  const seconds = Math.floor(t % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}.${Math.floor((t % 1) * 10)}`;
}

function updateHud() {
  timeEl.textContent = formatTime(raceTime);
  aliveEl.textContent = String(racers.filter(r => r.alive).length);
  mergesEl.textContent = String(totalMerges);
  const leaders = sortedRacers();
  leaderId = leaders[0]?.id ?? -1;
  const leader = leaders[0];
  const selected = selectedRacer();
  const completion = racer => Math.round(THREE.MathUtils.clamp(racer.s / (trackLength - 2) * 100, 0, 100));
  progressLeader.textContent = leader ? `LEADER ${leader.identity.name} · ${completion(leader)}%` : 'NO MARBLES';
  progressCurrent.textContent = selected ? `FOLLOWING ${selected.identity.name} · ${completion(selected)}%` : '';
  for (const racer of racers) {
    if (!racer.progressMarker) continue;
    racer.progressMarker.classList.toggle('selected', racer.alive && racer.id === selected?.id);
    racer.progressMarker.classList.toggle('leader', racer.alive && racer.id === leaderId);
    racer.progressMarker.title = `${racer.identity.name} #${racer.id + 1} · ${completion(racer)}% · ${2 ** racer.tier}`;
  }
}

function updateColors() {
  const racer = selectedRacer();
  if (racer) selectedLabel.textContent = racer.identity.name;
  for (const [index, button] of colorChoices.querySelectorAll('button').entries()) {
    button.classList.toggle('active', index === IDENTITIES.findIndex(c => c.name === racer?.identity.name));
  }
}

function selectMarble(id) {
  if (!racers.some(r => r.id === id && r.alive)) return;
  selectedId = id;
  updateColors();
  updateHud();
}
for (const [i, identity] of IDENTITIES.entries()) {
  const button = document.createElement('button');
  button.className = 'color-choice';
  button.type = 'button';
  button.title = `Follow ${identity.name.toLowerCase()} marble`;
  button.setAttribute('aria-label', `Follow ${identity.name.toLowerCase()} marble`);
  button.style.setProperty('--color', `#${identity.hex.toString(16).padStart(6, '0')}`);
  button.addEventListener('click', () => {
    const options = racers.filter(r => r.alive && r.identity.name === identity.name).sort((a, b) => b.s - a.s);
    if (options[0]) selectMarble(options[0].id);
  });
  colorChoices.appendChild(button);
}

for (const button of document.querySelectorAll('[data-camera]')) {
  button.addEventListener('click', () => {
    cameraMode = button.dataset.camera;
    document.querySelectorAll('[data-camera]').forEach(other => other.classList.toggle('active', other === button));
    onboardGlass.classList.toggle('active', cameraMode === 'onboard');
    if (cameraMode === 'onboard') showToast('ONBOARD MARBLE CAM', 1000);
  });
}

function restart() {
  for (const effect of effects.splice(0)) {
    scene.remove(effect.mesh);
    effect.mesh.geometry.dispose();
    effect.mesh.material.dispose();
  }
  createRacers();
  selectedId = 0;
  raceStatus = 'running';
  winner = null;
  raceTime = 0;
  totalMerges = 0;
  accumulator = 0;
  calloutTitle.textContent = 'THE OAK DOWNHILL';
  calloutSubtitle.textContent = 'Matching numbers combine. First across wins.';
  playButton.innerHTML = 'Ⅱ <span>PAUSE</span>';
  updateColors();
  updateHud();
}

playButton.addEventListener('click', () => {
  if (raceStatus === 'finished') return restart();
  raceStatus = raceStatus === 'running' ? 'paused' : 'running';
  playButton.innerHTML = raceStatus === 'running' ? 'Ⅱ <span>PAUSE</span>' : '▶ <span>RESUME</span>';
});
resetButton.addEventListener('click', restart);
speedButton.addEventListener('click', () => {
  speedMultiplier = speedMultiplier === 1 ? 2 : 1;
  speedButton.textContent = `${speedMultiplier}×`;
});

function resize() {
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}
window.addEventListener('resize', resize);
window.addEventListener('visibilitychange', () => { lastFrameTime = performance.now(); accumulator = 0; });

function animate(now) {
  requestAnimationFrame(animate);
  const elapsed = Math.min(0.05, (now - lastFrameTime) / 1000);
  lastFrameTime = now;
  if (raceStatus === 'running') {
    accumulator += elapsed * speedMultiplier;
    let substeps = 0;
    while (accumulator >= FIXED_STEP && substeps < 14 && raceStatus === 'running') {
      fixedUpdate(FIXED_STEP);
      accumulator -= FIXED_STEP;
      substeps++;
    }
    // Avoid a spiral of death if the tab or the device is overloaded.
    if (substeps >= 14) accumulator = 0;
  }
  updateMarbleMeshes(elapsed, Math.min(1, accumulator / FIXED_STEP));
  updateProgressMarkers(Math.min(1, accumulator / FIXED_STEP));
  updateParticles(elapsed);
  updateCamera(elapsed);
  if (now - lastHudTime > 150) { updateHud(); lastHudTime = now; }
  if (toastUntil && now > toastUntil) {
    raceToast.classList.remove('visible');
    toastUntil = 0;
  }
  renderer.render(scene, camera);
}

createRacers();
resize();
updateColors();
updateHud();
camera.position.copy(worldAt(-18, 11, 12));
lookPoint.copy(worldAt(9, 0, 1));
camera.lookAt(lookPoint);
setTimeout(() => loading.classList.add('hidden'), 450);
requestAnimationFrame(animate);
