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
const FUNNEL_RADIUS = 10.5;
const FUNNEL_DRAIN_RADIUS = 0.82;
const FUNNEL_DEPTH = 10.3;
const FUNNEL_HALF_SPAN = 14.5;
const TWO_PI = Math.PI * 2;
const TROUGH_HALF_ANGLE = Math.PI / 4;
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

// The first circuit traces the room's four walls. Its descending return
// leg steps inward, then makes another lap before spiraling into the middle.
// Generous radial gaps let the chute pass its own earlier segments safely.
const roomCourseXZ = [
  [-67, -51], [-29, -51], [27, -51], [59, -51], [68, -44],
  [68, -15], [68, 21], [68, 43], [59, 51], [19, 51],
  [-26, 51], [-59, 51], [-67, 43], [-67, 10], [-67, -24],
  [-63, -39], [-43, -41], [-6, -41], [32, -41], [46, -35],
  [49, -13], [49, 18], [43, 29], [13, 30], [-19, 30],
  [-38, 26], [-43, 8], [-43, -11], [-33, -18], [-5, -19],
  [18, -19], [24, -11], [24, 1], [17, 8], [8, 8], [0, 0]
];
const courseDistances = [0];
for (let i = 1; i < roomCourseXZ.length; i++) {
  const [ax, az] = roomCourseXZ[i - 1];
  const [bx, bz] = roomCourseXZ[i];
  courseDistances.push(courseDistances[i - 1] + Math.hypot(bx - ax, bz - az));
}
const totalPlanDistance = courseDistances.at(-1);
const curve = new THREE.CatmullRomCurve3(roomCourseXZ.map(([x, z], i) => {
  const percent = courseDistances[i] / totalPlanDistance;
  return new THREE.Vector3(x, 240 - percent * 208, z);
}), false, 'centripetal');
const trackLength = curve.getLength();
const FEATURE_BELLS = [0.15, 0.60].map((fraction, id) => ({ id, fraction, s: trackLength * fraction, spread: FUNNEL_HALF_SPAN }));
const FEATURE_DROPS = [0.22, 0.51, 0.81].map((fraction, id) => ({ id, fraction, s: trackLength * fraction }));
const FEATURE_WHEELS = [0.29, 0.76].map((fraction, id) => ({ id, s: trackLength * fraction }));
const FEATURE_SPINNERS = [0.45, 0.91].map((fraction, id) => ({ id, s: trackLength * fraction }));
const FEATURE_TILTERS = [0.195, 0.845].map((fraction, id) => ({ id, s: trackLength * fraction }));
const FEATURE_PENDULUMS = [0.385, 0.675].map((fraction, id) => ({ id, s: trackLength * fraction }));
const FEATURE_SPLITS = [[0.355, 0.412], [0.685, 0.735]].map(([start, end], id) => ({
  id, start: trackLength * start, end: trackLength * end
}));
const FEATURE_MILESTONES = [
  ...FEATURE_BELLS.map(item => ({ s: item.s, name: 'VORTEX FUNNEL', color: '#eac779' })),
  ...FEATURE_DROPS.map(item => ({ s: item.s, name: 'STEEP DROP', color: '#ff9a6a' })),
  ...FEATURE_WHEELS.map(item => ({ s: item.s, name: 'BALL-POWERED WHEEL', color: '#edc47b' })),
  ...FEATURE_SPINNERS.map(item => ({ s: item.s, name: 'CONTACT SPINNER', color: '#f67c61' })),
  ...FEATURE_TILTERS.map(item => ({ s: item.s, name: 'SEESAW BRIDGE', color: '#9ff2aa' })),
  ...FEATURE_PENDULUMS.map(item => ({ s: item.s, name: 'PENDULUM GATE', color: '#dda8ff' })),
  ...FEATURE_SPLITS.map(item => ({ s: item.start, name: 'SPLIT PATHS', color: '#77dfe7' }))
].sort((a, b) => a.s - b.s);
for (const feature of FEATURE_MILESTONES) {
  const marker = document.createElement('span');
  marker.className = 'progress-feature';
  marker.style.left = `${(feature.s / trackLength * 100).toFixed(3)}%`;
  marker.style.setProperty('--feature-color', feature.color);
  marker.title = `${feature.name} · ${Math.round(feature.s / trackLength * 100)}% of track`;
  document.querySelector('#progress-line').appendChild(marker);
}
const smoothstep = value => {
  const n = THREE.MathUtils.clamp(value, 0, 1);
  return n * n * (3 - 2 * n);
};
function dropProfile(u) {
  const cascades = FEATURE_DROPS.reduce((height, drop) =>
    height + 8 * smoothstep((u - drop.fraction + 0.011) / 0.022), 0);
  return FEATURE_BELLS.reduce((height, bell) =>
    height + FUNNEL_DEPTH * smoothstep((u - bell.fraction + 0.011) / 0.022), cascades);
}
function trackPointAt(u) {
  const p = curve.getPointAt(THREE.MathUtils.clamp(u, 0, 1));
  p.y -= dropProfile(u);
  return p;
}
function troughProfile(s) {
  let bell = 0;
  for (const feature of FEATURE_BELLS) {
    const scaled = (s - feature.s) / feature.spread;
    bell = Math.max(bell, Math.exp(-scaled * scaled * 1.8));
  }
  const width = TRACK_WIDTH + bell * 3.55;
  return {
    width,
    radius: width / (2 * Math.sin(TROUGH_HALF_ANGLE)),
    dip: bell * 2.25,
    bell
  };
}
const track = [];
const UP = new THREE.Vector3(0, 1, 0);
for (let i = 0; i <= TRACK_SAMPLES; i++) {
  const u = i / TRACK_SAMPLES;
  const point = trackPointAt(u);
  const tangent = trackPointAt(u + 1 / TRACK_SAMPLES)
    .sub(trackPointAt(u - 1 / TRACK_SAMPLES)).normalize();
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

function troughHeight(s, lane) {
  const profile = troughProfile(s);
  const x = THREE.MathUtils.clamp(lane, -profile.width / 2, profile.width / 2);
  return profile.radius - Math.sqrt(Math.max(0, profile.radius * profile.radius - x * x)) - profile.dip;
}

function worldAt(s, lane, height = 0) {
  const frame = frameAt(s);
  return frame.point.addScaledVector(frame.normal, lane).addScaledVector(UP, troughHeight(s, lane) + height);
}

function marbleCenterAt(s, lane, radius) {
  // A sphere resting against the inner wall of a circular channel is offset
  // along the wall normal; its center follows a concentric arc of radius R-r.
  const profile = troughProfile(s);
  const centerRadius = Math.max(0.75, profile.radius - radius);
  const x = THREE.MathUtils.clamp(lane, -centerRadius * Math.sin(TROUGH_HALF_ANGLE), centerRadius * Math.sin(TROUGH_HALF_ANGLE));
  const height = profile.radius - Math.sqrt(Math.max(0, centerRadius * centerRadius - x * x)) - profile.dip;
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
  const s = i / TRACK_SAMPLES * trackLength;
  const profile = troughProfile(s);
  for (let j = 0; j <= TROUGH_SEGMENTS; j++) {
    const angle = -TROUGH_HALF_ANGLE + j / TROUGH_SEGMENTS * (2 * TROUGH_HALF_ANGLE);
    const lateral = profile.radius * Math.sin(angle);
    const rise = profile.radius * (1 - Math.cos(angle)) - profile.dip;
    const point = f.point.clone().addScaledVector(f.normal, lateral);
    topPositions.push(point.x, point.y + rise - 0.1, point.z);
    bottomPositions.push(point.x, point.y + rise - 0.38, point.z);
    surfaceUvs.push(j / TROUGH_SEGMENTS, i / TRACK_SAMPLES * trackLength / 24);
  }
  if (i < TRACK_SAMPLES && !FEATURE_BELLS.some(bell => Math.abs(s - bell.s) < FUNNEL_HALF_SPAN - 1)) {
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

function pathTube(offset, height, radius, material, followOuterLip = false) {
  const group = new THREE.Group();
  let points = [];
  const flushSegment = () => {
    if (points.length >= 3) {
      const path = new THREE.CatmullRomCurve3(points);
      group.add(new THREE.Mesh(new THREE.TubeGeometry(path, Math.min(1200, points.length * 3), radius, 5, false), material));
    }
    points = [];
  };
  for (let i = 0; i <= TRACK_SAMPLES; i += 2) {
    const s = i / TRACK_SAMPLES * trackLength;
    if (FEATURE_BELLS.some(bell => Math.abs(s - bell.s) < FUNNEL_HALF_SPAN - 1)) {
      flushSegment();
      continue;
    }
    const lateral = followOuterLip ? Math.sign(offset) * (troughProfile(s).width / 2 + 0.04) : offset;
    points.push(worldAt(s, lateral, height));
  }
  flushSegment();
  return group;
}
const railMaterial = new THREE.MeshPhysicalMaterial({ color: 0x6c3820, metalness: 0, roughness: 0.3, clearcoat: 0.75 });
const railHighlight = new THREE.MeshStandardMaterial({ color: 0xdca76a, metalness: 0.15, roughness: 0.32 });
for (const side of [-1, 1]) {
  trackGroup.add(pathTube(side * (TRACK_WIDTH / 2 + 0.04), 0.08, 0.12, railMaterial, true));
  trackGroup.add(pathTube(side * (TRACK_WIDTH / 2 + 0.04), 0.15, 0.036, railHighlight, true));
}

// No center groove or parallel dividing strips: this is one uninterrupted
// quarter-circle wooden chute, not multiple marble lanes.
const supportMaterial = new THREE.MeshStandardMaterial({ color: 0x41362e, metalness: 0.12, roughness: 0.58 });
const ROOM = { halfX: 86, halfZ: 70, floorY: -23.5, ceilingY: 290 };
const baseY = ROOM.floorY + 0.5;
const roomGroup = new THREE.Group();
scene.add(roomGroup);

const plaster = new THREE.MeshStandardMaterial({ color: 0xc7bcaa, roughness: 0.89 });
const darkOak = new THREE.MeshStandardMaterial({ color: 0x66432d, roughness: 0.48, metalness: 0.02 });
const roomTrim = new THREE.MeshStandardMaterial({ color: 0xa2754c, roughness: 0.45 });
const windowGlass = new THREE.MeshPhysicalMaterial({
  color: 0x78939a, roughness: 0.24, metalness: 0.16,
  emissive: 0x718896, emissiveIntensity: 0.2, clearcoat: 0.7
});
function roomBox(width, height, depth, x, y, z, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  roomGroup.add(mesh);
  return mesh;
}

const roomHeight = ROOM.ceilingY - ROOM.floorY;
const midWallY = (ROOM.ceilingY + ROOM.floorY) / 2;
for (const side of [-1, 1]) {
  roomBox(ROOM.halfX * 2 + 2, roomHeight, 1.8, 0, midWallY, side * ROOM.halfZ, plaster);
  roomBox(1.8, roomHeight, ROOM.halfZ * 2 + 2, side * ROOM.halfX, midWallY, 0, plaster);
  // Wood-paneled lower walls and two raised architectural cornices.
  roomBox(ROOM.halfX * 2, 24, 0.72, 0, ROOM.floorY + 12, side * (ROOM.halfZ - 1.15), darkOak);
  roomBox(0.72, 24, ROOM.halfZ * 2, side * (ROOM.halfX - 1.15), ROOM.floorY + 12, 0, darkOak);
  for (const y of [ROOM.floorY + 24, 53, 153, 255]) {
    roomBox(ROOM.halfX * 2, 1.15, 1.2, 0, y, side * (ROOM.halfZ - 1.4), roomTrim);
    roomBox(1.2, 1.15, ROOM.halfZ * 2, side * (ROOM.halfX - 1.4), y, 0, roomTrim);
  }
}

// The tall framed windows and pilasters stay visible while the camera follows
// the high-level wall run, establishing that this is an enclosed race hall.
function roomWindow(offset, wallSide, isZWall) {
  const y = 194;
  const width = 13;
  const height = 35;
  const position = wallSide * ((isZWall ? ROOM.halfZ : ROOM.halfX) - 1.22);
  const x = isZWall ? offset : position;
  const z = isZWall ? position : offset;
  const thin = 0.24;
  roomBox(isZWall ? width : thin, height, isZWall ? thin : width, x, y, z, windowGlass);
  for (const sideways of [-1, 1]) {
    roomBox(isZWall ? 0.75 : 0.45, height + 1.4, isZWall ? 0.45 : 0.75,
      x + (isZWall ? sideways * width / 2 : 0), y,
      z + (isZWall ? 0 : sideways * width / 2), darkOak);
    roomBox(isZWall ? width + 1.1 : 0.48, 0.73, isZWall ? 0.48 : width + 1.1,
      x, y + sideways * height / 2, z, darkOak);
  }
  roomBox(isZWall ? 0.56 : 0.38, height, isZWall ? 0.38 : 0.56, x, y, z, roomTrim);
  roomBox(isZWall ? width : 0.38, 0.62, isZWall ? 0.38 : width, x, y + 1, z, roomTrim);
}
for (const side of [-1, 1]) {
  for (const x of [-61, -30, 0, 30, 61]) roomWindow(x, side, true);
  for (const z of [-45, -15, 15, 45]) roomWindow(z, side, false);
  for (let x = -78; x <= 78; x += 26) {
    roomBox(1.35, roomHeight - 2, 1.25, x, midWallY, side * (ROOM.halfZ - 1.6), roomTrim);
  }
  for (let z = -60; z <= 60; z += 24) {
    roomBox(1.25, roomHeight - 2, 1.35, side * (ROOM.halfX - 1.6), midWallY, z, roomTrim);
  }
}

const floorGrain = oakGrain.clone();
floorGrain.repeat.set(10, 8);
floorGrain.needsUpdate = true;
const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.halfX * 2, ROOM.halfZ * 2),
  new THREE.MeshStandardMaterial({ map: floorGrain, color: 0xb6a18b, roughness: 0.64 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = ROOM.floorY;
roomGroup.add(floor);
roomBox(ROOM.halfX * 2, 1.5, ROOM.halfZ * 2, 0, ROOM.ceilingY, 0, plaster);
for (let z = -57; z <= 57; z += 19) {
  roomBox(ROOM.halfX * 2, 1.7, 1.8, 0, ROOM.ceilingY - 1.2, z, darkOak);
}
for (const x of [-42, 0, 42]) {
  for (const z of [-33, 33]) {
    const lamp = new THREE.Mesh(new THREE.TorusGeometry(5, 0.32, 8, 32),
      new THREE.MeshStandardMaterial({ color: 0xf6dfae, emissive: 0xffc985, emissiveIntensity: 1.35 }));
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(x, ROOM.ceilingY - 4.5, z);
    roomGroup.add(lamp);
  }
}

function supportBeam(from, to, radius) {
  const direction = to.clone().sub(from);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 8), supportMaterial);
  beam.position.copy(from).addScaledVector(direction, 0.5);
  beam.quaternion.setFromUnitVectors(UP, direction.normalize());
  trackGroup.add(beam);
}

// Wall-side sections use cantilevered brackets. The inward turns stand on
// slimmer posts, so neither stretch appears to hover unsupported in the room.
for (let s = 12; s < trackLength; s += 24) {
  const p = worldAt(s, 0);
  const t = frameAt(s).tangent;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(TRACK_WIDTH + 0.5, 0.16, 0.48), supportMaterial);
  cap.rotation.y = Math.atan2(t.x, t.z);
  cap.position.copy(p).addScaledVector(UP, -0.5);
  trackGroup.add(cap);
  const dx = ROOM.halfX - Math.abs(p.x);
  const dz = ROOM.halfZ - Math.abs(p.z);
  if (Math.min(dx, dz) < 28) {
    const mount = p.clone();
    if (dx < dz) mount.x = Math.sign(p.x) * (ROOM.halfX - 1.6);
    else mount.z = Math.sign(p.z) * (ROOM.halfZ - 1.6);
    mount.y -= 3.6;
    supportBeam(p.clone().addScaledVector(UP, -0.48), mount, 0.31);
    roomBox(1.5, 3.0, 1.5, mount.x, mount.y, mount.z, darkOak);
  } else {
    const height = p.y - baseY;
    if (height <= 0) continue;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.44, height, 8), supportMaterial);
    pillar.position.set(p.x, baseY + height / 2, p.z);
    trackGroup.add(pillar);
  }
}

// Individual race modules: widened inverted-bell catch bowls, hinged-feeling
// drop chutes, spinning wheels, paddle rotors and two-way fork guide sections.
const brass = new THREE.MeshStandardMaterial({ color: 0xd9ad5c, metalness: 0.73, roughness: 0.25 });
const bronze = new THREE.MeshStandardMaterial({ color: 0x725438, metalness: 0.48, roughness: 0.37 });
const paddleMaterial = new THREE.MeshPhysicalMaterial({ color: 0xc77747, metalness: 0.15, roughness: 0.3, clearcoat: 0.7 });
const mechanismRotors = [];

function featureSign(s, text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = '#36251b';
  context.fillRect(7, 8, 498, 111);
  context.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
  context.lineWidth = 9;
  context.strokeRect(11, 12, 490, 103);
  context.fillStyle = '#fff4da';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '900 57px Arial, sans-serif';
  context.fillText(text, 256, 68, 462);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sign.position.copy(worldAt(s, 0, 9.0));
  sign.scale.set(12.5, 3.0, 1);
  trackGroup.add(sign);
}

function crossSectionTrim(s, material, thickness) {
  const points = [];
  const profile = troughProfile(s);
  for (let j = 0; j <= TROUGH_SEGMENTS; j++) {
    points.push(worldAt(s, (j / TROUGH_SEGMENTS - 0.5) * profile.width, 0.015));
  }
  const path = new THREE.CatmullRomCurve3(points);
  trackGroup.add(new THREE.Mesh(new THREE.TubeGeometry(path, 36, thickness, 6, false), material));
}

// High-contrast gantries distinguish each device while following the race.
function addTrackArch(s, material) {
  const profile = troughProfile(s);
  const left = -profile.width / 2 - 0.4;
  const right = profile.width / 2 + 0.4;
  const topHeight = 7.8;
  function rod(start, end, radius) {
    const span = end.clone().sub(start);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, span.length(), 10), material);
    mesh.position.copy(start).addScaledVector(span, 0.5);
    mesh.quaternion.setFromUnitVectors(UP, span.normalize());
    trackGroup.add(mesh);
  }
  for (const lane of [left, right]) {
    rod(worldAt(s, lane, 0.12), worldAt(s, lane, topHeight), 0.2);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.29, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe7b1 }));
    beacon.position.copy(worldAt(s, lane, topHeight));
    trackGroup.add(beacon);
  }
  rod(worldAt(s, left, topHeight), worldAt(s, right, topHeight), 0.22);
}

// Each trumpet is its own large three-dimensional surface. The ordinary
// wooden chute has a matching opening so marbles really circle the bowl
// instead of simply travelling through a widened section of the chute.
const funnels = [];
function funnelSurfaceY(radius, outerRadius) {
  return -FUNNEL_DEPTH * (1 - Math.pow(THREE.MathUtils.clamp(radius / outerRadius, 0, 1), 1.32));
}

for (const bell of FEATURE_BELLS) {
  const entryS = bell.s - FUNNEL_HALF_SPAN + 0.6;
  const exitS = bell.s + FUNNEL_HALF_SPAN - 0.6;
  const entrance = worldAt(entryS, 0, 0.15);
  const centerPoint = frameAt(bell.s).point;
  const outerRadius = THREE.MathUtils.clamp(
    Math.hypot(entrance.x - centerPoint.x, entrance.z - centerPoint.z), 10.2, 14.0
  );
  const center = new THREE.Vector3(centerPoint.x, entrance.y, centerPoint.z);
  const exitPoint = worldAt(exitS, 0, 0.22);
  const drainPoint = center.clone().addScaledVector(UP, -FUNNEL_DEPTH);
  const exitCurve = new THREE.CatmullRomCurve3([
    drainPoint.clone(),
    drainPoint.clone().add(new THREE.Vector3(0, -2.5, 0)),
    drainPoint.clone().lerp(exitPoint, 0.65).add(new THREE.Vector3(0, -2.1, 0)),
    exitPoint.clone()
  ]);
  const bowlProfile = [];
  for (let i = 0; i <= 40; i++) {
    const r = FUNNEL_DRAIN_RADIUS + (outerRadius - FUNNEL_DRAIN_RADIUS) * i / 40;
    bowlProfile.push(new THREE.Vector2(r, funnelSurfaceY(r, outerRadius)));
  }
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(bowlProfile, 112),
    new THREE.MeshPhysicalMaterial({
      map: oakGrain, color: 0xf1d3a4, roughness: 0.31, clearcoat: 0.62,
      clearcoatRoughness: 0.26, side: THREE.DoubleSide
    }));
  bowl.position.copy(center);
  trackGroup.add(bowl);
  const upperLip = new THREE.Mesh(new THREE.TorusGeometry(outerRadius, 0.26, 12, 112), brass);
  upperLip.rotation.x = -Math.PI / 2;
  upperLip.position.copy(center);
  trackGroup.add(upperLip);
  const innerLip = new THREE.Mesh(new THREE.TorusGeometry(FUNNEL_DRAIN_RADIUS + 0.18, 0.15, 9, 60), bronze);
  innerLip.rotation.x = -Math.PI / 2;
  innerLip.position.copy(drainPoint);
  trackGroup.add(innerLip);
  const drainTube = new THREE.Mesh(new THREE.TubeGeometry(exitCurve, 55, 0.86, 12, false),
    new THREE.MeshPhysicalMaterial({
      color: 0xc8934e, metalness: 0.26, roughness: 0.28,
      transparent: true, opacity: 0.43, depthWrite: false, side: THREE.DoubleSide
    }));
  trackGroup.add(drainTube);
  for (let brace = 0; brace < 8; brace++) {
    const angle = TWO_PI * brace / 8;
    const inner = FUNNEL_DRAIN_RADIUS + 0.35;
    const outer = outerRadius - 0.3;
    const base = center.clone().add(new THREE.Vector3(
      outer * Math.cos(angle), -0.48, outer * Math.sin(angle)
    ));
    const tip = center.clone().add(new THREE.Vector3(
      inner * Math.cos(angle), -FUNNEL_DEPTH - 0.4, inner * Math.sin(angle)
    ));
    supportBeam(base, tip, 0.16);
  }
  funnels.push({ bell, center, outerRadius, entryS, exitS, exitCurve, exitPoint });
  addTrackArch(entryS - 2, brass);
  featureSign(entryS - 6, 'VORTEX FUNNEL', 0xe2b75e);
}

for (const drop of FEATURE_DROPS) {
  crossSectionTrim(drop.s - 12, paddleMaterial, 0.13);
  crossSectionTrim(drop.s + 12, paddleMaterial, 0.13);
  addTrackArch(drop.s - 8, brass);
  featureSign(drop.s - 15, 'STEEP DROP', 0xf28a56);
}

for (const wheel of FEATURE_WHEELS) {
  const mount = new THREE.Group();
  mount.position.copy(worldAt(wheel.s, 0, 2.6));
  mount.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), frameAt(wheel.s).tangent);
  const rotor = new THREE.Group();
  mount.add(rotor);
  rotor.add(new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.2, 10, 48), brass));
  rotor.add(new THREE.Mesh(new THREE.TorusGeometry(1.95, 0.06, 7, 48), bronze));
  for (let arm = 0; arm < 6; arm++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.17, 4.55, 0.24), arm % 2 ? bronze : brass);
    spoke.rotation.z = arm * Math.PI / 6;
    rotor.add(spoke);
  }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.41, 0.41, 0.75, 20), paddleMaterial);
  axle.rotation.x = Math.PI / 2;
  rotor.add(axle);
  trackGroup.add(mount);
  mechanismRotors.push({ type: 'wheel', feature: wheel, rotor, angle: 0, omega: 0, inertia: 8.5 });
  addTrackArch(wheel.s - 8, brass);
  featureSign(wheel.s - 15, 'BALL-DRIVEN WHEEL', 0xe2b75e);
}

for (const spinner of FEATURE_SPINNERS) {
  const mount = new THREE.Group();
  mount.position.copy(worldAt(spinner.s, 0, 1.05));
  const rotor = new THREE.Group();
  mount.add(rotor);
  for (let arm = 0; arm < 4; arm++) {
    const spoke = new THREE.Group();
    spoke.rotation.y = arm * Math.PI / 2;
    const paddle = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.28, 0.55), paddleMaterial);
    paddle.position.x = 1.18;
    spoke.add(paddle);
    rotor.add(spoke);
  }
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.65, 16), brass);
  rotor.add(cap);
  trackGroup.add(mount);
  mechanismRotors.push({ type: 'spinner', feature: spinner, rotor, angle: 0, omega: 0, inertia: 6.0 });
  addTrackArch(spinner.s - 8, brass);
  featureSign(spinner.s - 14, 'CONTACT SPINNER', 0xf28a56);
}

for (const split of FEATURE_SPLITS) {
  const ridgePoints = [];
  const leftGuide = [];
  const rightGuide = [];
  for (let j = 0; j <= 30; j++) {
    const t = j / 30;
    const s = split.start + t * (split.end - split.start);
    const rise = 0.06 + 0.75 * Math.sin(Math.PI * t) ** 0.55;
    ridgePoints.push(worldAt(s, 0, rise));
    leftGuide.push(worldAt(s, -1.65, 0.035));
    rightGuide.push(worldAt(s, 1.65, 0.035));
  }
  trackGroup.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ridgePoints), 70, 0.21, 8, false), darkOak));
  for (const guide of [leftGuide, rightGuide]) {
    trackGroup.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(guide), 70, 0.055, 6, false), brass));
  }
  addTrackArch(split.start - 8, brass);
  featureSign(split.start - 12, 'SPLIT PATHS', 0x86d7dc);
}

// Additional modules react to ball contact rather than looping animations.
for (const feature of FEATURE_TILTERS) {
  const mount = new THREE.Group();
  mount.position.copy(worldAt(feature.s, 0, 0.30));
  mount.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), frameAt(feature.s).tangent);
  const rotor = new THREE.Group();
  mount.add(rotor);
  const plank = new THREE.Mesh(new THREE.BoxGeometry(TRACK_WIDTH - 0.5, 0.32, 7.3), paddleMaterial);
  rotor.add(plank);
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.53, 7.3), brass);
    rail.position.set(side * (TRACK_WIDTH - 0.7) / 2, 0.25, 0);
    rotor.add(rail);
  }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, TRACK_WIDTH + 0.7, 14), bronze);
  axle.rotation.z = Math.PI / 2;
  mount.add(axle);
  trackGroup.add(mount);
  mechanismRotors.push({ type: 'seesaw', feature, rotor, angle: 0, omega: 0, inertia: 5.8 });
  addTrackArch(feature.s - 7, brass);
  featureSign(feature.s - 14, 'SEESAW BRIDGE', 0x9be69b);
}

for (const feature of FEATURE_PENDULUMS) {
  const mount = new THREE.Group();
  mount.position.copy(worldAt(feature.s, 0, 5.9));
  mount.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), frameAt(feature.s).tangent);
  const rotor = new THREE.Group();
  mount.add(rotor);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 4.85, 16), bronze);
  shaft.position.y = -2.4;
  rotor.add(shaft);
  const weight = new THREE.Mesh(new THREE.SphereGeometry(0.94, 22, 16), brass);
  weight.position.y = -4.78;
  rotor.add(weight);
  trackGroup.add(mount);
  mechanismRotors.push({ type: 'pendulum', feature, rotor, angle: 0, omega: 0, inertia: 4.0 });
  addTrackArch(feature.s - 6, brass);
  featureSign(feature.s - 14, 'PENDULUM GATE', 0xdcaaff);
}

function updateMechanisms(dt) {
  for (const mechanism of mechanismRotors) {
    if (mechanism.type === 'seesaw') {
      mechanism.omega -= Math.sin(mechanism.angle) * 8.5 * dt;
    } else if (mechanism.type === 'pendulum') {
      mechanism.omega -= Math.sin(mechanism.angle) * 4.8 * dt;
    }
    const friction = mechanism.type === 'wheel' || mechanism.type === 'spinner' ? 0.42 : 0.86;
    mechanism.omega *= Math.exp(-friction * dt);
    mechanism.angle += mechanism.omega * dt;
    if (mechanism.type === 'seesaw') {
      mechanism.angle = THREE.MathUtils.clamp(mechanism.angle, -0.31, 0.31);
      if (Math.abs(mechanism.angle) >= 0.31) mechanism.omega *= -0.22;
      mechanism.rotor.rotation.x = mechanism.angle;
    } else if (mechanism.type === 'pendulum') {
      mechanism.angle = THREE.MathUtils.clamp(mechanism.angle, -0.88, 0.88);
      if (Math.abs(mechanism.angle) >= 0.88) mechanism.omega *= -0.38;
      mechanism.rotor.rotation.z = mechanism.angle;
    } else if (mechanism.type === 'wheel') {
      mechanism.rotor.rotation.z = mechanism.angle;
    } else {
      mechanism.rotor.rotation.y = mechanism.angle;
    }
  }
}

function impactMechanism(r, mechanism) {
  const feature = mechanism.feature;
  if (Math.abs(r.s - feature.s) > r.radius + 0.65) return;
  const key = mechanism.type + '-' + feature.id;
  if (raceTime - (r.lastFeatureHit[key] ?? -100) < 0.38) return;
  r.lastFeatureHit[key] = raceTime;
  // Contact impulse is proportional to approaching linear momentum and lever
  // arm. The mechanism receives an equal-and-opposite angular impulse.
  const side = r.lane < -0.08 ? -1 : r.lane > 0.08 ? 1 : r.bias > Math.PI ? -1 : 1;
  const arm = Math.max(0.56, Math.abs(r.lane));
  const contactSpeed = Math.max(0.5, r.v - side * mechanism.omega * arm);
  const transfer = mechanism.type === 'pendulum' ? 0.44 : mechanism.type === 'seesaw' ? 0.3 : 0.4;
  const angularImpulse = side * (r.mass * contactSpeed * arm * transfer) /
    (mechanism.inertia + r.mass * arm * arm);
  mechanism.omega = THREE.MathUtils.clamp(mechanism.omega + angularImpulse, -8, 8);
  const retained = mechanism.type === 'pendulum' ? 0.73
    : mechanism.type === 'seesaw' ? 0.91 : 0.84;
  r.v = Math.max(3.6, r.v * (retained + Math.min(0.09, r.mass * 0.004)));
  r.vl += side * Math.min(3.2, Math.abs(angularImpulse) * 1.5);
}

const obstacles = [];
const obstacleMaterial = new THREE.MeshPhysicalMaterial({ color: 0x844b2e, metalness: 0.03, roughness: 0.34, clearcoat: 0.65 });
for (let s = 38, i = 0; s < trackLength - 30; s += 83, i++) {
  if ([...FEATURE_BELLS, ...FEATURE_WHEELS, ...FEATURE_SPINNERS, ...FEATURE_DROPS]
    .some(feature => Math.abs(feature.s - s) < 20) || FEATURE_SPLITS.some(split => s > split.start - 7 && s < split.end + 7)) continue;
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
  // Each marble starts with a different static swirl orientation. Subsequent
  // motion is integrated as physical rolling, not scripted Euler-axis spin.
  spin.quaternion.setFromAxisAngle(new THREE.Vector3(0.34, 0.83, 0.44).normalize(), racer.roll);
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
let tourIndex = 0;
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
      drag: 0.016 + rand() * 0.003,
      bias: rand() * TWO_PI, roll: rand() * TWO_PI,
      mode: 'track', funnelState: null,
      alive: true, finished: false, finishTime: null,
      lastObstacle: -1, lastObstacleTime: -100,
      lastFeatureHit: Object.create(null), forkSelections: Object.create(null),
      group: null, spin: null, shell: null, number: null,
      lastRenderedPosition: null
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
      if (!b.alive || a.mode !== 'track' || b.mode !== 'track' || Math.abs(a.s - b.s) > a.radius + b.radius + 0.13) continue;
      const fork = FEATURE_SPLITS.find(split => (a.s + b.s) / 2 > split.start + 5 && (a.s + b.s) / 2 < split.end - 5);
      if (fork && a.lane * b.lane < 0) continue;
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

// A separate polar-coordinate solver drives each marble around the actual
// funnel wall. Angular momentum increases its angular speed as the orbit
// shrinks; surface slope, rolling loss and centrifugal force set radial drift.
function funnelContactNormal(funnel, radius, theta) {
  const slope = 1.32 * FUNNEL_DEPTH / funnel.outerRadius *
    Math.pow(Math.max(0.05, radius / funnel.outerRadius), 0.32);
  return new THREE.Vector3(-slope * Math.cos(theta), 1, -slope * Math.sin(theta)).normalize();
}

function funnelMarblePosition(funnel, radius, theta, ballRadius) {
  const x = radius * Math.cos(theta);
  const z = radius * Math.sin(theta);
  const normal = funnelContactNormal(funnel, radius, theta);
  return funnel.center.clone().add(new THREE.Vector3(
    x, funnelSurfaceY(radius, funnel.outerRadius), z
  )).addScaledVector(normal, ballRadius);
}

function racerPosition(r, alpha = 1) {
  if (r.mode === 'funnel' && r.funnelState) {
    const f = r.funnelState;
    const radius = THREE.MathUtils.lerp(f.prevRadius, f.radius, alpha);
    const theta = THREE.MathUtils.lerp(f.prevTheta, f.theta, alpha);
    return funnelMarblePosition(f.funnel, radius, theta, r.visibleRadius || r.radius);
  }
  if (r.mode === 'drain' && r.funnelState) {
    const f = r.funnelState;
    const t = THREE.MathUtils.lerp(f.prevDrainT, f.drainT, alpha);
    return f.funnel.exitCurve.getPointAt(THREE.MathUtils.clamp(t, 0, 1));
  }
  return marbleCenterAt(
    THREE.MathUtils.lerp(r.prevS, r.s, alpha),
    THREE.MathUtils.lerp(r.prevLane, r.lane, alpha),
    r.visibleRadius || r.radius
  );
}

function enterFunnel(r, funnel) {
  const entrance = worldAt(funnel.entryS, r.lane, r.radius);
  const theta = Math.atan2(entrance.z - funnel.center.z, entrance.x - funnel.center.x);
  const outerRadius = funnel.outerRadius - Math.max(0.22, r.radius * 0.5);
  r.mode = 'funnel';
  r.s = funnel.entryS;
  r.lane = 0;
  r.vl = 0;
  r.funnelState = {
    funnel, theta, prevTheta: theta, startTheta: theta, radius: outerRadius, prevRadius: outerRadius,
    radialVelocity: -1.0,
    angularMomentum: outerRadius * Math.max(17, r.v * 1.08),
    drainT: 0, prevDrainT: 0
  };
  if (r.id === selectedId) showToast('VORTEX FUNNEL · HOLD ON!', 1200);
}

function updateFunnelRacer(r, dt) {
  const f = r.funnelState;
  f.prevTheta = f.theta;
  f.prevRadius = f.radius;
  if (r.mode === 'drain') {
    f.prevDrainT = f.drainT;
    f.drainT = Math.min(1, f.drainT + dt / 0.62);
    r.s = THREE.MathUtils.lerp(f.funnel.exitS - 1.2, f.funnel.exitS, f.drainT);
    if (f.drainT >= 1) {
      r.mode = 'track';
      r.s = f.funnel.exitS;
      r.prevS = r.s;
      r.lane = Math.sin(f.theta) * Math.min(0.9, TRACK_WIDTH * 0.17);
      r.prevLane = r.lane;
      r.v = Math.max(14, Math.min(28, r.v * 0.91));
      r.funnelState = null;
    }
    return;
  }
  const radius = Math.max(FUNNEL_DRAIN_RADIUS, f.radius);
  const slope = 1.32 * FUNNEL_DEPTH / f.funnel.outerRadius *
    Math.pow(radius / f.funnel.outerRadius, 0.32);
  const tangentialSpeed = Math.min(26, f.angularMomentum / radius);
  const centrifugal = tangentialSpeed * tangentialSpeed / Math.max(1.8, radius);
  const gravityInward = 17.5 * slope / Math.sqrt(1 + slope * slope);
  f.radialVelocity -= (gravityInward - Math.min(4.5, centrifugal * 0.12)) * dt;
  f.radialVelocity = THREE.MathUtils.clamp(f.radialVelocity, -2.8, -0.8);
  f.radius = Math.max(FUNNEL_DRAIN_RADIUS + r.radius * 0.45,
    f.radius + f.radialVelocity * dt);
  const omega = Math.min(8.5, 26 / f.radius, f.angularMomentum / (f.radius * f.radius));
  f.theta += omega * dt;
  f.angularMomentum *= Math.exp(-0.045 * dt);
  r.v = Math.max(8, tangentialSpeed);
  const progress = THREE.MathUtils.clamp(
    (f.funnel.outerRadius - f.radius) / (f.funnel.outerRadius - FUNNEL_DRAIN_RADIUS), 0, 1);
  r.s = THREE.MathUtils.lerp(f.funnel.entryS, f.funnel.exitS - 1.2, progress);
  if (f.radius <= FUNNEL_DRAIN_RADIUS + r.radius * 0.45 + 0.00001) {
    r.mode = 'drain';
    f.drainT = 0;
    f.prevDrainT = 0;
  }
}

function updateRacer(r, dt) {
  r.prevS = r.s;
  r.prevLane = r.lane;
  if (!r.alive || r.finished) return;
  if (r.mode !== 'track') {
    updateFunnelRacer(r, dt);
    return;
  }
  for (const funnel of funnels) {
    if (r.s >= funnel.entryS && r.s < funnel.exitS) {
      enterFunnel(r, funnel);
      return;
    }
  }
  const frame = frameAt(r.s);
  // A flared catch bell dips below the ordinary chute; its entrance adds
  // downhill acceleration and its exit naturally costs that potential energy.
  const bellSlope = (troughProfile(r.s + 0.75).dip - troughProfile(r.s - 0.75).dip) / 1.5;
  const downhill = -frame.tangent.y + bellSlope;
  const sizeDrag = Math.pow(0.30 / r.radius, 0.9);
  const acceleration = 1.4 + 29 * downhill - r.drag * sizeDrag * r.v * Math.abs(r.v);
  r.v += acceleration * dt;
  r.v = THREE.MathUtils.clamp(r.v, 1.3, 29.5);
  // Gravity restores marbles toward the bottom of the 90-degree circular
  // trough. Curvature and small individual variations keep the pack dynamic.
  const profile = troughProfile(r.s);
  const centerRadius = Math.max(0.75, profile.radius - r.radius);
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
  const limit = Math.max(0.15, (troughProfile(r.s).radius - r.radius) * Math.sin(TROUGH_HALF_ANGLE) - 0.06);
  if (r.lane > limit) { r.lane = limit; r.vl = -Math.abs(r.vl) * 0.48; r.v *= 0.993; }
  if (r.lane < -limit) { r.lane = -limit; r.vl = Math.abs(r.vl) * 0.48; r.v *= 0.993; }
  for (const split of FEATURE_SPLITS) {
    if (r.s < split.start - 2 || r.s > split.end + 2) continue;
    if (!r.forkSelections[split.id]) {
      r.forkSelections[split.id] = r.lane > 0.08 ? 1 : r.lane < -0.08 ? -1 : (r.bias > Math.PI ? 1 : -1);
    }
    const side = r.forkSelections[split.id];
    const entrance = smoothstep((r.s - split.start) / 7);
    const exit = smoothstep((split.end - r.s) / 7);
    const clearance = (r.radius + 0.24) * entrance * exit;
    if (r.lane * side < clearance) {
      r.lane = side * clearance;
      // Remove only velocity into the divider; do not inject a repeated
      // outward kick that would make a marble jitter against the guide.
      r.vl = side * Math.max(0, r.vl * side) * 0.45;
    }
  }
  for (const mechanism of mechanismRotors) impactMechanism(r, mechanism);
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
  updateMechanisms(dt);
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

const rollPosition = new THREE.Vector3();
const rollSide = new THREE.Vector3();
const rollNormal = new THREE.Vector3();
const rollDisplacement = new THREE.Vector3();
const rollAxis = new THREE.Vector3();
const rollQuaternion = new THREE.Quaternion();

function updateMarbleMeshes(dt, alpha) {
  for (const racer of racers) {
    if (!racer.alive) continue;
    const s = THREE.MathUtils.lerp(racer.prevS, racer.s, alpha);
    const lane = THREE.MathUtils.lerp(racer.prevLane, racer.lane, alpha);
    racer.visibleRadius += (racer.radius - racer.visibleRadius) * (1 - Math.exp(-dt * 13));
    rollPosition.copy(racerPosition(racer, alpha));
    if (racer.lastRenderedPosition) {
      if (racer.mode === 'funnel' && racer.funnelState) {
        const f = racer.funnelState;
        const radius = THREE.MathUtils.lerp(f.prevRadius, f.radius, alpha);
        const theta = THREE.MathUtils.lerp(f.prevTheta, f.theta, alpha);
        rollNormal.copy(funnelContactNormal(f.funnel, radius, theta));
      } else if (racer.mode === 'drain') {
        rollNormal.copy(UP);
      } else {
        const frame = frameAt(s);
        const centerRadius = Math.max(0.75, troughProfile(s).radius - racer.visibleRadius);
        const laneAngle = Math.asin(THREE.MathUtils.clamp(lane / centerRadius,
          -Math.sin(TROUGH_HALF_ANGLE), Math.sin(TROUGH_HALF_ANGLE)));
        rollSide.copy(frame.normal).multiplyScalar(Math.cos(laneAngle))
          .addScaledVector(UP, Math.sin(laneAngle));
        rollNormal.crossVectors(rollSide, frame.tangent).normalize();
      }
      rollDisplacement.subVectors(rollPosition, racer.lastRenderedPosition);
      // Spin is generated only by displacement along a contact surface.
      rollDisplacement.addScaledVector(rollNormal, -rollDisplacement.dot(rollNormal));
      const rollingDistance = racer.mode === 'drain' ? 0 : rollDisplacement.length();
      if (rollingDistance > 0.00001 && rollingDistance < 4) {
        rollAxis.crossVectors(rollNormal, rollDisplacement).normalize();
        const angle = rollingDistance / Math.max(0.1, racer.visibleRadius);
        rollQuaternion.setFromAxisAngle(rollAxis, angle);
        racer.spin.quaternion.premultiply(rollQuaternion);
        racer.roll += angle;
      }
    }
    if (!racer.lastRenderedPosition) racer.lastRenderedPosition = new THREE.Vector3();
    racer.lastRenderedPosition.copy(rollPosition);
    racer.group.position.copy(rollPosition);
    racer.spin.scale.setScalar(racer.visibleRadius);
    racer.number.scale.setScalar(racer.visibleRadius * 2.4);
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
  const ballPos = racerPosition(racer, 1);
  const tangent = f.tangent;
  if (cameraMode === 'tour') {
    const target = FEATURE_MILESTONES[tourIndex];
    const activeFunnel = funnels.find(item => Math.abs(item.bell.s - target.s) < 0.2);
    const featureFrame = frameAt(target.s);
    const focus = activeFunnel
      ? activeFunnel.center.clone().addScaledVector(UP, -FUNNEL_DEPTH * 0.25)
      : worldAt(target.s, 0, 2.0);
    desiredCamera.copy(focus).addScaledVector(UP, activeFunnel ? 32 : 14)
      .addScaledVector(featureFrame.tangent, -26)
      .addScaledVector(featureFrame.normal, 15);
    desiredLook.copy(focus);
    camera.fov = THREE.MathUtils.damp(camera.fov, 65, 3, dt);
  } else if ((racer.mode === 'funnel' || racer.mode === 'drain') && racer.funnelState) {
    const f = racer.funnelState;
    const orbitTangent = new THREE.Vector3(-Math.sin(f.theta), -0.18, Math.cos(f.theta)).normalize();
    if (cameraMode === 'onboard') {
      desiredCamera.copy(ballPos).addScaledVector(UP, 0.08);
      desiredLook.copy(ballPos).addScaledVector(orbitTangent, 13);
      camera.fov = THREE.MathUtils.damp(camera.fov, 88, 3, dt);
    } else if (cameraMode === 'aerial') {
      desiredCamera.copy(ballPos).addScaledVector(UP, 20).addScaledVector(orbitTangent, -9);
      desiredLook.copy(f.funnel.center).addScaledVector(UP, -FUNNEL_DEPTH * 0.4);
      camera.fov = THREE.MathUtils.damp(camera.fov, 65, 3, dt);
    } else {
      desiredCamera.copy(ballPos).addScaledVector(UP, 9).addScaledVector(orbitTangent, -13);
      desiredLook.copy(ballPos).addScaledVector(orbitTangent, 5);
      camera.fov = THREE.MathUtils.damp(camera.fov, 67, 3, dt);
    }
  } else if (cameraMode === 'onboard') {
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
    camera.fov = THREE.MathUtils.damp(camera.fov, 57 + Math.min(11, racer.v * 0.34), 3, dt);
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
  if (selected && raceStatus !== 'finished') {
    const upcoming = FEATURE_MILESTONES.find(feature => feature.s > selected.s + 1);
    if (cameraMode === 'tour') {
      calloutTitle.textContent = 'TRACK TOUR';
      calloutSubtitle.textContent = (tourIndex + 1) + '/' + FEATURE_MILESTONES.length +
        ' · ' + FEATURE_MILESTONES[tourIndex].name + ' · TAP TOUR FOR NEXT';
    } else if (selected.mode === 'funnel' && selected.funnelState) {
      calloutTitle.textContent = 'SPIRALING INTO THE VORTEX';
      const turns = (selected.funnelState.theta - selected.funnelState.startTheta) / TWO_PI;
      calloutSubtitle.textContent = turns.toFixed(1) + ' revolutions · ' +
        Math.round(selected.v) + ' units/s orbital speed';
    } else {
      calloutTitle.textContent = 'THE OAK RACE HALL';
      calloutSubtitle.textContent = upcoming
        ? 'NEXT: ' + upcoming.name + ' · ' + Math.round(upcoming.s - selected.s) + ' units ahead'
        : 'FINAL RUN TO THE CENTER FINISH';
    }
  }
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
    if (button.dataset.camera === 'tour' && cameraMode === 'tour') {
      tourIndex = (tourIndex + 1) % FEATURE_MILESTONES.length;
    } else {
      cameraMode = button.dataset.camera;
      if (cameraMode === 'tour') tourIndex = 0;
    }
    document.querySelectorAll('[data-camera]').forEach(other => other.classList.toggle('active', other === button));
    onboardGlass.classList.toggle('active', cameraMode === 'onboard');
    if (cameraMode === 'onboard') showToast('ONBOARD MARBLE CAM', 1000);
    if (cameraMode === 'tour') {
      showToast('TRACK TOUR ' + (tourIndex + 1) + '/' + FEATURE_MILESTONES.length +
        ' · ' + FEATURE_MILESTONES[tourIndex].name, 1800);
    }
    updateHud();
  });
}

function restart() {
  for (const effect of effects.splice(0)) {
    scene.remove(effect.mesh);
    effect.mesh.geometry.dispose();
    effect.mesh.material.dispose();
  }
  for (const mechanism of mechanismRotors) {
    mechanism.angle = 0;
    mechanism.omega = 0;
    mechanism.rotor.rotation.set(0, 0, 0);
  }
  createRacers();
  selectedId = 0;
  raceStatus = 'running';
  winner = null;
  raceTime = 0;
  totalMerges = 0;
  accumulator = 0;
  calloutTitle.textContent = 'THE OAK RACE HALL';
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
  const renderAlpha = raceStatus === 'running' ? Math.min(1, accumulator / FIXED_STEP) : 1;
  updateMarbleMeshes(elapsed, renderAlpha);
  updateProgressMarkers(renderAlpha);
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
