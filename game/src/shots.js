// The four screenshot scenes behind ?shot=setup|snuff|swing|escape. Each one
// plays the real rules forward from a fresh world for a fixed number of steps
// (or poses the world by hand), so the frame is what the game really looks
// like and the same seed always gives the same frame. One element pops in
// each shot, and no two shots are framed the same way.

import { STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

function idle(world, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    world.step(STEP, { mx: 0, my: 0, snuff: false, push: false }, true);
  }
}

function stepN(world, n, input, harmless) {
  for (let i = 0; i < n; i += 1) {
    world.step(STEP, input, harmless);
  }
}

// 1 — The Heist Setup. A wide courtyard: the moth dim at bottom-left, the
// exit glowing top-right, three cones cutting across the lantern shadows.
function stageSetup(world) {
  world.reset();
  idle(world, 6);
  return { screen: SCREEN_TITLE, best: 0 };
}

// 2 — The Snuff Gambit. The open corridor, close in: the moth mid-dash with
// dust behind her, a lantern just snuffed with ink blooming, a guard's cone
// half swallowed by the dark. Posed by hand so every element lands exactly:
// she stands inside the ink, and the cone that should have caught her stops
// at the bubble's edge.
function stageSnuff(world) {
  world.reset();
  const st = world.state;
  // The wall lantern on the corridor's west wall, guttered out.
  const lamp = st.lanterns[3];
  lamp.lit = false;
  lamp.outT = 4;
  st.bubbles.push({ x: lamp.x, y: lamp.y, r: 120, t: 0.5 });
  // The moth, mid-dash north through the ink, dust thick behind her.
  st.player.x = 150;
  st.player.y = 480;
  st.player.face = -Math.PI / 2;
  st.player.dust = 0.55;
  st.player.dashT = 0.1;
  st.player.dashX = 0;
  st.player.dashY = -1;
  for (let i = 0; i < 14; i += 1) {
    const p = st.particles[i];
    p.active = true;
    p.x = 150 + (i % 5) * 8 - 16;
    p.y = 492 + Math.floor(i / 5) * 14;
    p.vx = -4 - i;
    p.vy = 10 + i * 2;
    p.max = 1.4;
    p.life = 1.4 - i * 0.06;
    p.size = 2 + (i % 3);
  }
  // Ember, south of the bubble, his cone cut short by the dark, suspicion up.
  const ember = st.guards[1];
  ember.x = 205;
  ember.y = 330;
  ember.angle = Math.PI / 2;
  ember.state = 'patrol';
  ember.suspicion = 0.62;
  return { screen: SCREEN_PLAY, best: 0 };
}

// 3 — The Swing Puzzle. The narrow screen corridor: the hanging lantern
// mid-swing with its glowing arc on the floor, the moth peeking from cover.
function stageSwing(world) {
  world.reset();
  const st = world.state;
  // Place the moth peeking from behind the middle screen of the right wall.
  st.player.x = 930;
  st.player.y = 400;
  st.player.face = 0;
  st.player.dust = 0.35;
  // Swing the lantern to the left end of its arc and let it hang there a beat.
  st.swing.phase = -Math.PI / 2;
  st.swing.phaseVel = (Math.PI * 2) / 5.5;
  stepN(world, 40, { mx: 0, my: 0, snuff: false, push: false }, true);
  // Cinder patrols the corridor just past the screens, cone sweeping away.
  const cinder = st.guards[2];
  cinder.x = 1080;
  cinder.y = 500;
  cinder.angle = Math.PI / 2;
  cinder.state = 'patrol';
  cinder.suspicion = 0;
  return { screen: SCREEN_PLAY, best: 0 };
}

// 4 — The Escape Clutch. The final dash: the moth backlit against the moonlit
// window, Wing Dust nearly full, two cones wide and sweeping — and missing.
function stageEscape(world) {
  world.reset();
  const st = world.state;
  st.player.x = 1093;
  st.player.y = 142;
  st.player.face = -Math.PI / 2;
  st.player.dust = 0.88;
  st.player.lit = false;
  stepN(world, 30, { mx: 0, my: 0, snuff: false, push: false }, true);
  // Ash and Cinder have lost her and are sweeping wide. Their cones reach
  // for the window but the fringe only ever grazes her.
  const ash = st.guards[0];
  ash.x = 900;
  ash.y = 260;
  ash.angle = -0.17;
  ash.state = 'investigate';
  ash.investigateT = 3;
  ash.suspicion = 1;
  const cinder = st.guards[2];
  cinder.x = 1120;
  cinder.y = 420;
  cinder.angle = -Math.PI * 0.35;
  cinder.state = 'investigate';
  cinder.investigateT = 3;
  cinder.suspicion = 1;
  // A last burst of dust behind her, as if she has just dashed.
  st.player.dashT = 0.1;
  st.player.dashX = 0;
  st.player.dashY = -1;
  return { screen: SCREEN_PLAY, best: 0 };
}

/**
 * Set `world` to the named scene (setup, snuff, swing or escape; any other
 * name is setup) and return the screen to draw over it and the best time.
 */
export function stageShot(name, world) {
  if (name === 'snuff') return stageSnuff(world);
  if (name === 'swing') return stageSwing(world);
  if (name === 'escape') return stageEscape(world);
  return stageSetup(world);
}
