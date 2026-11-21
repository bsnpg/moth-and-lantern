// Drawing only: the world's state and the current screen in, pixels out.
// The 1280x720 temple is scaled to fit the window and centred. Everything the
// player needs to read — safe dark, dangerous light, a cone cut by a screen —
// is drawn from the same geometry the rules use, so the picture never lies.

import {
  CONE, COVER, DUST, EXIT, FIELD, LANTERN_LIGHT_RADIUS, PALETTE, SNUFF,
  SWING, WALLS,
} from './config.js';
import { castRay, conePolygon } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const TAU = Math.PI * 2;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }
  window.addEventListener('resize', resize);
  resize();

  const fonts = new Map();
  function text(value, x, y, size, color, align, font) {
    const key = size + (font ?? '');
    if (!fonts.has(key)) fonts.set(key, `${size}px ${font ?? 'Georgia, "Times New Roman", serif'}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align ?? 'left';
    // A dark cut-out under every line, so light text reads on the bright floor.
    context.strokeStyle = 'rgba(10, 10, 26, 0.85)';
    context.lineWidth = 4;
    context.strokeText(value, x, y);
    context.fillText(value, x, y);
  }

  function poly(points, close) {
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) context.lineTo(points[i].x, points[i].y);
    if (close !== false) context.closePath();
  }

  // The hard shadow a cover rect casts away from a light: the silhouette's two
  // outer corners, stretched far from the flame. High contrast, hard edges —
  // the dark wedge a moth can stand in.
  function shadowWedge(lx, ly, rect) {
    const corners = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.w, y: rect.y },
      { x: rect.x + rect.w, y: rect.y + rect.h },
      { x: rect.x, y: rect.y + rect.h },
    ];
    let minA = Infinity;
    let maxA = -Infinity;
    let minC = corners[0];
    let maxC = corners[0];
    for (const c of corners) {
      const a = Math.atan2(c.y - ly, c.x - lx);
      if (a < minA) { minA = a; minC = c; }
      if (a > maxA) { maxA = a; maxC = c; }
    }
    if (maxA - minA >= Math.PI) return null;
    // A shadow only reads within a few steps of its lantern; farther cover
    // throws a shadow too faint to matter, and drawing it only muddies the room.
    const reach = 380;
    const ext = (c) => {
      const d = Math.max(1, Math.hypot(c.x - lx, c.y - ly));
      return { x: c.x + ((c.x - lx) / d) * reach, y: c.y + ((c.y - ly) / d) * reach };
    };
    return [minC, maxC, ext(maxC), ext(minC)];
  }

  function drawFloor(state) {
    context.fillStyle = PALETTE.wall;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.floor;
    context.fillRect(WALLS.x, WALLS.y, WALLS.w, WALLS.h);
    // Stone tiles.
    context.strokeStyle = PALETTE.grout;
    context.lineWidth = 2;
    for (let x = WALLS.x + 64; x < WALLS.x + WALLS.w; x += 64) {
      context.beginPath();
      context.moveTo(x, WALLS.y);
      context.lineTo(x, WALLS.y + WALLS.h);
      context.stroke();
    }
    for (let y = WALLS.y + 64; y < WALLS.y + WALLS.h; y += 64) {
      context.beginPath();
      context.moveTo(WALLS.x, y);
      context.lineTo(WALLS.x + WALLS.w, y);
      context.stroke();
    }
    // A worn mosaic ring at the courtyard's heart.
    context.strokeStyle = 'rgba(90, 70, 40, 0.5)';
    context.lineWidth = 3;
    context.beginPath();
    context.arc(640, 320, 92, 0, TAU);
    context.stroke();
    context.beginPath();
    context.arc(640, 320, 70, 0, TAU);
    context.stroke();
    // Wall trim.
    context.strokeStyle = PALETTE.wallTop;
    context.lineWidth = 6;
    context.strokeRect(WALLS.x - 3, WALLS.y - 3, WALLS.w + 6, WALLS.h + 6);
  }

  function lightPool(x, y, radius, core, glow) {
    const g = context.createRadialGradient(x, y, 4, x, y, radius);
    g.addColorStop(0, core);
    g.addColorStop(0.45, glow);
    g.addColorStop(1, 'rgba(255, 215, 0, 0)');
    context.fillStyle = g;
    context.beginPath();
    context.arc(x, y, radius, 0, TAU);
    context.fill();
  }

  function drawLights(state) {
    // Moonlight spilling from the exit window: cold, pale, the goal itself.
    const mg = context.createRadialGradient(
      EXIT.x + EXIT.w / 2, EXIT.y + EXIT.h / 2, 6,
      EXIT.x + EXIT.w / 2, EXIT.y + EXIT.h / 2, 260,
    );
    mg.addColorStop(0, 'rgba(244, 250, 255, 0.85)');
    mg.addColorStop(0.35, 'rgba(220, 239, 255, 0.35)');
    mg.addColorStop(1, 'rgba(220, 239, 255, 0)');
    context.fillStyle = mg;
    context.beginPath();
    context.arc(EXIT.x + EXIT.w / 2, EXIT.y + EXIT.h / 2, 260, 0, TAU);
    context.fill();
    // Wall lanterns.
    for (const l of state.lanterns) {
      if (!l.lit) continue;
      lightPool(l.x, l.y, LANTERN_LIGHT_RADIUS, 'rgba(255, 249, 196, 0.68)', 'rgba(255, 215, 0, 0.22)');
    }
    // The swinging lantern's travelling pool.
    lightPool(state.swing.x, state.swing.y, SWING.lightRadius, 'rgba(255, 249, 196, 0.62)', 'rgba(255, 215, 0, 0.18)');
  }

  function drawShadows(state) {
    // Only the fixed wall lanterns cast hard wedges, and only the cover close
    // enough for its shadow to read. Each wedge fades with distance, darkest
    // at the cover that throws it — a shadow, not a black shard.
    for (const l of state.lanterns) {
      if (!l.lit) continue;
      for (const rect of COVER) {
        const cx = rect.x + rect.w / 2;
        const cy = rect.y + rect.h / 2;
        if (Math.hypot(cx - l.x, cy - l.y) > 320) continue;
        const wedge = shadowWedge(l.x, l.y, rect);
        if (wedge === null) continue;
        const nearX = (wedge[0].x + wedge[1].x) / 2;
        const nearY = (wedge[0].y + wedge[1].y) / 2;
        const farX = (wedge[2].x + wedge[3].x) / 2;
        const farY = (wedge[2].y + wedge[3].y) / 2;
        const g = context.createLinearGradient(nearX, nearY, farX, farY);
        g.addColorStop(0, 'rgba(10, 10, 26, 0.62)');
        g.addColorStop(1, 'rgba(10, 10, 26, 0)');
        context.fillStyle = g;
        poly(wedge);
        context.fill();
      }
    }
  }

  // One guard's cone, clipped by the same raycast the rules use. The bright
  // core, the dim fringe, and the thin danger fringe between them.
  function drawCone(state, guard) {
    if (guard.blindT > 0) return;
    const bubbles = state.bubbles;
    const full = conePolygon(guard, bubbles);
    const half = guard.state === 'investigate' ? CONE.widenHalfAngle : CONE.halfAngle;
    const suspicious = guard.suspicion > 0.25;
    // Fringe: the whole clipped wedge, warm and saturated enough to read
    // against the bright floor.
    poly(full);
    context.fillStyle = suspicious
      ? 'rgba(255, 110, 20, 0.26)'
      : 'rgba(255, 165, 0, 0.22)';
    context.fill();
    // Core: the inner wedge, bright gold, its edge ringed in danger fringe.
    const corePts = [{ x: guard.x, y: guard.y }];
    for (let i = 0; i <= CONE.rays; i += 1) {
      const a = guard.angle - CONE.coreHalfAngle + (2 * CONE.coreHalfAngle * i) / CONE.rays;
      const len = Math.min(CONE.range * CONE.coreRange, castRay(guard.x, guard.y, Math.cos(a), Math.sin(a), CONE.range * CONE.coreRange, bubbles));
      corePts.push({ x: guard.x + Math.cos(a) * len, y: guard.y + Math.sin(a) * len });
    }
    poly(corePts);
    const coreGrad = context.createRadialGradient(guard.x, guard.y, 6, guard.x, guard.y, CONE.range * CONE.coreRange);
    coreGrad.addColorStop(0, suspicious ? 'rgba(255, 110, 20, 0.62)' : 'rgba(255, 205, 0, 0.55)');
    coreGrad.addColorStop(1, 'rgba(255, 190, 0, 0.08)');
    context.fillStyle = coreGrad;
    context.fill();
    // The danger fringe: a thin yellow rim where safe dark becomes caught light.
    context.beginPath();
    context.moveTo(corePts[1].x, corePts[1].y);
    for (let i = 2; i < corePts.length; i += 1) context.lineTo(corePts[i].x, corePts[i].y);
    context.strokeStyle = PALETTE.dangerFringe;
    context.lineWidth = 2.5;
    context.globalAlpha = 0.85;
    context.stroke();
    context.globalAlpha = 1;
    void half;
  }

  function drawBubbles(state) {
    for (const b of state.bubbles) {
      const g = context.createRadialGradient(b.x, b.y, 2, b.x, b.y, b.r);
      g.addColorStop(0, 'rgba(5, 5, 15, 0.92)');
      g.addColorStop(0.8, 'rgba(5, 5, 15, 0.75)');
      g.addColorStop(1, 'rgba(5, 5, 15, 0)');
      context.fillStyle = g;
      context.beginPath();
      context.arc(b.x, b.y, b.r, 0, TAU);
      context.fill();
      context.strokeStyle = 'rgba(221, 160, 221, 0.5)';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(b.x, b.y, b.r * 0.96, 0, TAU);
      context.stroke();
    }
  }

  function drawCover() {
    for (const rect of COVER) {
      if (rect.kind === 'pillar') {
        context.fillStyle = PALETTE.stoneDark;
        context.fillRect(rect.x + 3, rect.y + 3, rect.w, rect.h);
        context.fillStyle = PALETTE.stone;
        context.fillRect(rect.x, rect.y, rect.w, rect.h);
        context.strokeStyle = '#3f382e';
        context.lineWidth = 2;
        context.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
        context.fillStyle = 'rgba(255, 240, 200, 0.25)';
        context.fillRect(rect.x + 4, rect.y + 4, rect.w - 8, 6);
      } else if (rect.kind === 'screen') {
        context.fillStyle = PALETTE.screenFrame;
        context.fillRect(rect.x, rect.y, rect.w, rect.h);
        context.fillStyle = PALETTE.screen;
        context.fillRect(rect.x + 2, rect.y + 2, rect.w - 4, rect.h - 4);
        context.strokeStyle = '#7a5a3a';
        context.lineWidth = 1.5;
        const vertical = rect.h > rect.w;
        for (let i = 1; i < 3; i += 1) {
          context.beginPath();
          if (vertical) {
            context.moveTo(rect.x, rect.y + (rect.h * i) / 3);
            context.lineTo(rect.x + rect.w, rect.y + (rect.h * i) / 3);
          } else {
            context.moveTo(rect.x + (rect.w * i) / 3, rect.y);
            context.lineTo(rect.x + (rect.w * i) / 3, rect.y + rect.h);
          }
          context.stroke();
        }
        // A painted sprig on the paper.
        context.strokeStyle = 'rgba(90, 60, 40, 0.65)';
        context.beginPath();
        context.moveTo(rect.x + rect.w / 2, rect.y + rect.h - 8);
        context.quadraticCurveTo(rect.x + rect.w / 2 + 4, rect.y + rect.h / 2, rect.x + rect.w / 2, rect.y + 8);
        context.stroke();
      } else if (rect.kind === 'stone') {
        context.fillStyle = PALETTE.stoneDark;
        context.fillRect(rect.x + 2, rect.y + 2, rect.w, rect.h);
        context.fillStyle = PALETTE.stone;
        context.fillRect(rect.x, rect.y, rect.w - 2, rect.h - 2);
        context.fillStyle = '#6b6156';
        context.fillRect(rect.x + 6, rect.y + 5, rect.w - 12, 5);
        context.fillStyle = 'rgba(255, 215, 0, 0.5)';
        context.beginPath();
        context.arc(rect.x + rect.w / 2, rect.y + rect.h / 2 + 4, 4, 0, TAU);
        context.fill();
      } else {
        // Scroll stack: cream rolls, bound with cord.
        context.fillStyle = '#c9b48a';
        context.fillRect(rect.x, rect.y, rect.w, rect.h);
        context.fillStyle = '#efe3c2';
        context.fillRect(rect.x + 2, rect.y + 2, rect.w - 4, rect.h - 4);
        context.strokeStyle = '#8a6f4d';
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(rect.x + rect.w / 3, rect.y + 2);
        context.lineTo(rect.x + rect.w / 3, rect.y + rect.h - 2);
        context.moveTo(rect.x + (2 * rect.w) / 3, rect.y + 2);
        context.lineTo(rect.x + (2 * rect.w) / 3, rect.y + rect.h - 2);
        context.stroke();
      }
    }
  }

  function drawLanterns(state) {
    for (const l of state.lanterns) {
      // The stone housing.
      context.fillStyle = PALETTE.stoneDark;
      context.fillRect(l.x - 9, l.y - 12, 18, 24);
      context.fillStyle = PALETTE.stone;
      context.fillRect(l.x - 7, l.y - 10, 14, 20);
      if (l.lit) {
        // Bloom: a soft radial glow at the core.
        const g = context.createRadialGradient(l.x, l.y, 1, l.x, l.y, 16);
        g.addColorStop(0, 'rgba(255, 249, 196, 0.95)');
        g.addColorStop(0.4, 'rgba(255, 215, 0, 0.55)');
        g.addColorStop(1, 'rgba(255, 140, 0, 0)');
        context.fillStyle = g;
        context.beginPath();
        context.arc(l.x, l.y, 16, 0, TAU);
        context.fill();
        context.fillStyle = PALETTE.lanternCore;
        context.beginPath();
        context.arc(l.x, l.y, 4.5, 0, TAU);
        context.fill();
      } else {
        // Snuffed: a cold wick, a thread of smoke.
        context.fillStyle = '#2c2838';
        context.beginPath();
        context.arc(l.x, l.y, 3.5, 0, TAU);
        context.fill();
        context.strokeStyle = 'rgba(200, 200, 210, 0.5)';
        context.lineWidth = 1.5;
        context.beginPath();
        context.moveTo(l.x, l.y - 4);
        context.quadraticCurveTo(l.x + 4, l.y - 14, l.x - 2, l.y - 22);
        context.stroke();
      }
    }
    // The swinging lantern: chain from the pivot, lantern at its end.
    const s = state.swing;
    context.strokeStyle = '#6b5a44';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(SWING.pivotX, SWING.pivotY);
    context.lineTo(s.x, s.y);
    context.stroke();
    const sg = context.createRadialGradient(s.x, s.y, 1, s.x, s.y, 20);
    sg.addColorStop(0, 'rgba(255, 249, 196, 0.95)');
    sg.addColorStop(0.4, 'rgba(255, 215, 0, 0.5)');
    sg.addColorStop(1, 'rgba(255, 140, 0, 0)');
    context.fillStyle = sg;
    context.beginPath();
    context.arc(s.x, s.y, 20, 0, TAU);
    context.fill();
    context.fillStyle = PALETTE.lanternCore;
    context.beginPath();
    context.arc(s.x, s.y, 6, 0, TAU);
    context.fill();
    // The glowing arc on the floor: the sweep the lantern paints, and the
    // bright "sweet spot" where its light is standing right now.
    context.strokeStyle = 'rgba(255, 215, 0, 0.55)';
    context.lineWidth = 3;
    context.beginPath();
    context.arc(SWING.pivotX, SWING.pivotY + SWING.arm, SWING.arm * SWING.amplitude * 2.2, Math.PI * 0.5 - 0.5, Math.PI * 0.5 + 0.5);
    context.stroke();
    context.fillStyle = 'rgba(255, 249, 196, 0.9)';
    context.beginPath();
    context.arc(s.x, s.y + 46, 5, 0, TAU);
    context.fill();
    // The pull zone: a small gold ring on the chain, where a push is taken.
    context.strokeStyle = 'rgba(255, 215, 0, 0.8)';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(SWING.pivotX, SWING.pivotY + SWING.arm / 2, 9, 0, TAU);
    context.stroke();
  }

  function drawExit(state) {
    // The arched moonlit window on the top wall.
    context.fillStyle = '#1c1830';
    context.fillRect(EXIT.x - 6, EXIT.y - 6, EXIT.w + 12, EXIT.h + 12);
    const g = context.createLinearGradient(0, EXIT.y, 0, EXIT.y + EXIT.h);
    g.addColorStop(0, PALETTE.moonCore);
    g.addColorStop(1, '#9db8d8');
    context.fillStyle = g;
    context.beginPath();
    context.moveTo(EXIT.x, EXIT.y + EXIT.h);
    context.lineTo(EXIT.x, EXIT.y + 22);
    context.quadraticCurveTo(EXIT.x + EXIT.w / 2, EXIT.y - 14, EXIT.x + EXIT.w, EXIT.y + 22);
    context.lineTo(EXIT.x + EXIT.w, EXIT.y + EXIT.h);
    context.closePath();
    context.fill();
    // Moon and mullions.
    context.fillStyle = '#f4faff';
    context.beginPath();
    context.arc(EXIT.x + EXIT.w - 26, EXIT.y + 22, 11, 0, TAU);
    context.fill();
    context.strokeStyle = '#1c1830';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(EXIT.x + EXIT.w / 2, EXIT.y + 4);
    context.lineTo(EXIT.x + EXIT.w / 2, EXIT.y + EXIT.h);
    context.moveTo(EXIT.x, EXIT.y + EXIT.h / 2);
    context.lineTo(EXIT.x + EXIT.w, EXIT.y + EXIT.h / 2);
    context.stroke();
    text('EXIT', EXIT.x + EXIT.w / 2, EXIT.y + EXIT.h + 22, 15, PALETTE.moon, 'center', 'system-ui, sans-serif');
  }

  function drawGuard(state, guard) {
    const g = guard;
    const facing = g.angle;
    const bob = Math.sin(state.elapsed * 6 + g.x) * 1.5;
    // Robe: a sand-coloured taper pointing where the guard looks.
    context.save();
    context.translate(g.x, g.y + bob * 0.4);
    context.rotate(facing);
    context.fillStyle = g.state === 'investigate' ? '#a86a3a' : PALETTE.robe;
    context.beginPath();
    context.moveTo(16, 0);
    context.lineTo(-10, -11);
    context.lineTo(-14, -6);
    context.lineTo(-14, 6);
    context.lineTo(-10, 11);
    context.closePath();
    context.fill();
    context.strokeStyle = PALETTE.robeDark;
    context.lineWidth = 2;
    context.stroke();
    // Hood.
    context.fillStyle = PALETTE.robeDark;
    context.beginPath();
    context.arc(-2, 0, 8, 0, TAU);
    context.fill();
    // The guard's own lantern, held ahead.
    if (g.blindT > 0) {
      context.fillStyle = '#2c2838';
      context.beginPath();
      context.arc(18, 0, 4, 0, TAU);
      context.fill();
    } else {
      const lg = context.createRadialGradient(18, 0, 1, 18, 0, 14);
      lg.addColorStop(0, 'rgba(255, 249, 196, 0.9)');
      lg.addColorStop(0.5, 'rgba(255, 140, 0, 0.4)');
      lg.addColorStop(1, 'rgba(255, 140, 0, 0)');
      context.fillStyle = lg;
      context.beginPath();
      context.arc(18, 0, 14, 0, TAU);
      context.fill();
      context.fillStyle = PALETTE.lanternCore;
      context.beginPath();
      context.arc(18, 0, 4, 0, TAU);
      context.fill();
    }
    context.restore();
    // Suspicion and alarm, floating above the hood.
    const markY = g.y - 26 + bob * 0.4;
    if (g.blindT > 0) {
      text('…', g.x, markY, 20, '#9a94a8', 'center');
    } else if (g.state === 'investigate') {
      text('!', g.x, markY, 24, '#ff5a3c', 'center');
    } else if (g.suspicion > 0.25) {
      const pulse = 0.6 + 0.4 * Math.sin(state.elapsed * 8);
      context.globalAlpha = pulse;
      text('?', g.x, markY, 22, PALETTE.gold, 'center');
      context.globalAlpha = 1;
    }
  }

  function drawMoth(state) {
    const p = state.player;
    const nearWindow = Math.hypot(p.x - (EXIT.x + EXIT.w / 2), p.y - (EXIT.y + EXIT.h / 2)) < 220;
    // Wing Dust shows as a pink glow: the brighter the moth, the hotter she is.
    if (p.dust > 0.05) {
      const glow = context.createRadialGradient(p.x, p.y, 2, p.x, p.y, 26 + p.dust * 34);
      glow.addColorStop(0, `rgba(221, 160, 221, ${0.12 + p.dust * 0.4})`);
      glow.addColorStop(1, 'rgba(221, 160, 221, 0)');
      context.fillStyle = glow;
      context.beginPath();
      context.arc(p.x, p.y, 26 + p.dust * 34, 0, TAU);
      context.fill();
    }
    context.save();
    context.translate(p.x, p.y);
    context.rotate(p.face + Math.PI / 2);
    const dash = p.dashT > 0 ? 1.35 : 1;
    // Wings hesitate near light: the flap slows as dust climbs, and the
    // antennae twitch in dim light.
    const flap = Math.sin(p.flap) * (0.55 + 0.45 * (1 - p.dust));
    const twitch = p.dust > 0.5 ? Math.sin(state.elapsed * 28) * 0.18 : 0;
    context.globalAlpha = nearWindow ? 0.92 : 1;
    for (const side of [-1, 1]) {
      context.save();
      context.translate(side * 4, 0);
      context.rotate(side * (0.5 + flap * 0.7));
      context.scale(dash, 1);
      const wg = context.createLinearGradient(0, -16, 0, 6);
      wg.addColorStop(0, nearWindow ? '#ffffff' : PALETTE.moth);
      wg.addColorStop(1, '#b9b3e0');
      context.fillStyle = wg;
      context.beginPath();
      context.ellipse(side * 8, -4, 11, 15, side * 0.35, 0, TAU);
      context.fill();
      context.strokeStyle = 'rgba(74, 68, 96, 0.6)';
      context.lineWidth = 1.2;
      context.stroke();
      context.restore();
    }
    // Body and antennae.
    context.fillStyle = PALETTE.mothBody;
    context.beginPath();
    context.ellipse(0, 2, 4.5, 9, 0, 0, TAU);
    context.fill();
    context.strokeStyle = PALETTE.mothBody;
    context.lineWidth = 1.5;
    for (const side of [-1, 1]) {
      context.beginPath();
      context.moveTo(side * 2, -6);
      context.quadraticCurveTo(side * 7, -14, side * (9 + twitch * 10), -16);
      context.stroke();
    }
    context.restore();
    // Dash streaks: three fading lines behind a lunging moth.
    if (p.dashT > 0) {
      context.strokeStyle = 'rgba(221, 160, 221, 0.7)';
      context.lineWidth = 2;
      for (let i = 0; i < 3; i += 1) {
        const bx = p.x - Math.cos(p.face) * (16 + i * 12);
        const by = p.y - Math.sin(p.face) * (16 + i * 12);
        context.beginPath();
        context.moveTo(bx, by - 4 + i * 4);
        context.lineTo(bx - Math.cos(p.face) * 14, by - Math.sin(p.face) * 14 - 4 + i * 4);
        context.stroke();
      }
    }
  }

  function drawParticles(state) {
    for (const pt of state.particles) {
      if (!pt.active) continue;
      const a = Math.max(0, pt.life / pt.max);
      context.fillStyle = `rgba(221, 160, 221, ${0.55 * a})`;
      context.beginPath();
      context.arc(pt.x, pt.y, pt.size, 0, TAU);
      context.fill();
    }
  }

  function drawHud(state, screen) {
    context.textBaseline = 'top';
    text('MOTH & LANTERN', 24, 14, 20, PALETTE.text, 'left', 'Georgia, serif');
    text('Reach the moonlit window — unseen', 24, 40, 15, PALETTE.muted, 'left', 'system-ui, sans-serif');
    const mins = Math.floor(state.elapsed / 60);
    const secs = Math.floor(state.elapsed % 60);
    text(`${mins}:${String(secs).padStart(2, '0')}`, FIELD.width - 24, 14, 20, PALETTE.text, 'right', 'system-ui, sans-serif');
    // Snuff cooldown, bottom-right where it never covers the exit: a little
    // lantern that refills, never a bar.
    const cx = FIELD.width - 24;
    const cy = FIELD.height - 24;
    const ready = state.snuffCooldown <= 0;
    context.fillStyle = ready ? PALETTE.lanternCore : '#5a5348';
    context.beginPath();
    context.arc(cx, cy, 9, 0, TAU);
    context.fill();
    if (!ready) {
      context.fillStyle = 'rgba(10, 10, 26, 0.75)';
      context.beginPath();
      context.moveTo(cx, cy);
      context.arc(cx, cy, 9, -Math.PI / 2, -Math.PI / 2 + TAU * (state.snuffCooldown / SNUFF.cooldown));
      context.closePath();
      context.fill();
    }
    text('SPACE — snuff', cx - 18, cy - 8, 13, PALETTE.muted, 'right', 'system-ui, sans-serif');
    if (screen === SCREEN_PLAY && state.elapsed < 10) {
      context.globalAlpha = clamp(1 - (state.elapsed - 8) / 2, 0, 1);
      text(
        'WASD / arrows — move · SPACE — snuff-dash · E — push the hanging lantern · P — pause',
        FIELD.width / 2, FIELD.height - 28, 15, PALETTE.text, 'center', 'system-ui, sans-serif',
      );
      context.globalAlpha = 1;
    }
    // Wing Dust near full: the edges of the room blush pink, faintly. No bar,
    // just dread — and never enough to wash the picture out.
    if (state.player.dust > 0.8 && screen === SCREEN_PLAY) {
      const vg = context.createRadialGradient(
        FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.55,
        FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.78,
      );
      vg.addColorStop(0, 'rgba(221, 160, 221, 0)');
      vg.addColorStop(1, `rgba(221, 160, 221, ${(state.player.dust - 0.8) * 0.7})`);
      context.fillStyle = vg;
      context.fillRect(0, 0, FIELD.width, FIELD.height);
    }
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 620;
    const height = 150 + lines.length * 34;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(10, 10, 26, 0.88)';
    context.fillRect(x, y, width, height);
    context.strokeStyle = accent;
    context.lineWidth = 3;
    context.strokeRect(x, y, width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 74, 46, PALETTE.text, 'center');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], FIELD.width / 2, y + 122 + i * 34, 20, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 36, 22, PALETTE.gold, 'center');
  }

  function fmtTime(t) {
    const mins = Math.floor(t / 60);
    const secs = Math.floor(t % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }

  function draw(state, screen, best) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.shadow;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    context.textBaseline = 'alphabetic';

    drawFloor(state);
    drawLights(state);
    drawShadows(state);
    for (const g of state.guards) drawCone(state, g);
    drawBubbles(state);
    drawCover();
    drawLanterns(state);
    drawExit(state);
    for (const g of state.guards) drawGuard(state, g);
    drawParticles(state);
    drawMoth(state);
    drawHud(state, screen);

    if (screen === SCREEN_TITLE) {
      drawPanel('MOTH & LANTERN', [
        'A dust-winged thief in a sleeping lantern temple.',
        'Hide in the hard shadows. Mind the cones. Snuff a lantern to pass.',
        'WASD / arrows — move · SPACE — snuff-dash · E — push the lantern',
      ], 'Press SPACE or click to begin', PALETTE.gold);
    } else if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['The priests wait. The lanterns burn.'], 'Press P or SPACE to go on', PALETTE.muted);
    } else if (screen === SCREEN_OVER) {
      drawPanel(`CAUGHT by ${state.caughtBy}`, [
        `The cone found her after ${fmtTime(state.elapsed)}.`,
        'Shadows are safety. A snuffed lantern is a door.',
      ], 'Press R to try again', '#ff5a3c');
    } else if (screen === SCREEN_WIN) {
      drawPanel('ESCAPED', [
        `Out the moonlit window in ${fmtTime(state.elapsed)}.`,
        `${state.snuffsUsed} lantern${state.snuffsUsed === 1 ? '' : 's'} snuffed · spotted ${state.timesSpotted} time${state.timesSpotted === 1 ? '' : 's'}.`,
        best > 0 ? `Best escape: ${fmtTime(best)}.` : 'Her first clean escape.',
      ], 'Press R to steal again', PALETTE.moon);
    }
  }

  return { draw, resize };
}
