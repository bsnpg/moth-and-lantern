// MOTH & LANTERN — tuning, palette and the hand-authored temple layout.
// One screen, seen from above: a lantern temple at night. The moth thief starts
// bottom-left and must reach the moonlit window top-right, unseen. Every number
// here is a design choice for this level, not a generic default.

export const FIELD = { width: 1280, height: 720 };

// The room's inner walls (the play area the moth and the guards stay inside).
export const WALLS = { x: 36, y: 36, w: 1208, h: 648 };

export const STEP = 1 / 60;

// The moth: small, quick, and slower when her wings hesitate near light.
export const MOTH = {
  radius: 13,
  speed: 252,
  dashSpeed: 640,
  dashTime: 0.18,
  dashDistance: 118,
};

// Wing Dust is the game's hidden nerve: 0 is calm dark, 1 is fully lit.
// It is never drawn as a bar — it shows in the moth's wings, her glow and her trail.
export const DUST = {
  start: 0.15,
  lit: 0.95, // at this level a fringe glance catches her like a core
  calm: 0.6, // dust must fall back below this before the "lit" state ends
  inFringe: 0.24, // per second, standing in a cone's dim fringe
  inLight: 0.34, // per second, standing in a wall lantern's pool
  inSwingLight: 0.3, // per second, under the swinging lantern
  whileDashing: 0.16, // per second, while dashing (dust flies)
  inDark: -0.32, // per second, standing in shadow or plain dark
};

export const SNUFF = {
  range: 175, // how far the moth's puff can reach a lantern
  outSeconds: 4, // a snuffed lantern stays dark this long
  cooldown: 6, // seconds before the next snuff
  bubbleRadius: 132, // the ink bubble's full size
  bubbleGrow: 0.6, // seconds to reach full size
};

// A guard's lantern cone: a 60-degree wedge. Its bright core catches at once;
// its dim fringe only makes the guard suspicious, over about a second and a half.
export const CONE = {
  range: 272,
  halfAngle: (30 * Math.PI) / 180,
  coreHalfAngle: (20 * Math.PI) / 180,
  coreRange: 0.6, // fraction of range that is the bright core
  rays: 26, // raycast samples across the wedge (drives drawing AND detection)
  suspicionSeconds: 1.5,
  investigateSeconds: 4,
  patrolSpeed: 55,
  investigateSpeed: 88,
  catchRadius: 26, // an investigating guard this close catches the moth
  widenHalfAngle: (40 * Math.PI) / 180, // cone while investigating
};

// The hanging lantern in the right corridor: a pendulum the moth times —
// or pushes — to open a window across the floor.
export const SWING = {
  pivotX: 1080,
  pivotY: 116,
  arm: 92,
  amplitude: 0.46, // radians either side of straight down
  period: 5.5, // seconds per full swing
  lightRadius: 150,
  pushImpulse: 1.4, // extra angular speed when the moth pulls the chain
  pushRange: 70, // how close the moth must be to the chain to push it
};

// The moonlit window the moth must reach.
export const EXIT = { x: 1130, y: 40, w: 106, h: 76 };

// Static wall lanterns: fixed lights that paint pools and cast the hard shadows.
export const WALL_LANTERNS = [
  { x: 132, y: 172 },
  { x: 1150, y: 548 },
  { x: 640, y: 82 },
  { x: 92, y: 420 },
];
export const LANTERN_LIGHT_RADIUS = 195;

// Cover: anything that clips a vision cone and casts a hard shadow wedge.
// kind decides how it is drawn; the rect decides what it blocks.
export const COVER = [
  // Central courtyard ring around (640, 320)
  { kind: 'pillar', x: 540, y: 216, w: 44, h: 44 },
  { kind: 'pillar', x: 696, y: 216, w: 44, h: 44 },
  { kind: 'pillar', x: 540, y: 380, w: 44, h: 44 },
  { kind: 'pillar', x: 696, y: 380, w: 44, h: 44 },
  { kind: 'screen', x: 498, y: 258, w: 16, h: 124 },
  { kind: 'screen', x: 766, y: 258, w: 16, h: 124 },
  // Left open corridor: two stone lanterns to duck behind
  { kind: 'stone', x: 176, y: 296, w: 38, h: 38 },
  { kind: 'stone', x: 296, y: 476, w: 38, h: 38 },
  // Right screen corridor: a wall of folding screens with gaps to slip through
  { kind: 'screen', x: 956, y: 176, w: 16, h: 112 },
  { kind: 'screen', x: 956, y: 328, w: 16, h: 112 },
  { kind: 'screen', x: 956, y: 480, w: 16, h: 112 },
  // Scroll stacks and a lone stone lantern, low cover for the crossings
  { kind: 'scroll', x: 420, y: 560, w: 72, h: 26 },
  { kind: 'scroll', x: 860, y: 560, w: 72, h: 26 },
  { kind: 'scroll', x: 420, y: 138, w: 72, h: 26 },
  { kind: 'stone', x: 620, y: 556, w: 40, h: 40 },
];

// The three lamp-priests and their patrol loops (waypoints, in order).
export const GUARDS = [
  {
    name: 'Ash',
    x: 470, y: 300,
    waypoints: [
      { x: 470, y: 300 }, { x: 810, y: 300 }, { x: 810, y: 420 }, { x: 470, y: 420 },
    ],
    pause: 0.9,
  },
  {
    name: 'Ember',
    x: 200, y: 180,
    waypoints: [
      { x: 200, y: 180 }, { x: 200, y: 560 },
    ],
    pause: 1.1,
  },
  {
    name: 'Cinder',
    x: 1050, y: 200,
    waypoints: [
      { x: 1050, y: 200 }, { x: 1050, y: 560 }, { x: 1150, y: 560 }, { x: 1150, y: 200 },
    ],
    pause: 0.8,
  },
];

export const PLAYER_START = { x: 122, y: 618 };

// The palette, exactly as the art direction calls for it.
export const PALETTE = {
  floor: '#b9a88c',
  floorDark: '#a08e6e',
  grout: '#8f7f62',
  wall: '#2a2438',
  wallTop: '#3a324e',
  lanternCore: '#ffd700',
  lanternGlow: '#fff9c4',
  halo: '#ff8c00',
  dangerFringe: '#ffb347',
  shadow: '#0a0a1a',
  shadowSoft: '#1a1a2e',
  moth: '#e6e6fa',
  mothBody: '#4a4460',
  dust: '#dda0dd',
  robe: '#b08d5a',
  robeDark: '#7d6240',
  moon: '#dcefff',
  moonCore: '#f4faff',
  ink: '#05050f',
  text: '#efe8d2',
  muted: '#b9b09a',
  screen: '#e8dcc0',
  screenFrame: '#4a3226',
  stone: '#8a7f70',
  stoneDark: '#5f564a',
  gold: '#e8c15a',
};

export const FONT = 'Georgia, "Times New Roman", serif';
export const UI_FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
