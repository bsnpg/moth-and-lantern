// Boot and the one loop: input is read once per frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between five screens: title,
// play, paused, caught and escaped. One-shot presses are taken once per frame
// and handed to the first step only, so a press is never lost and never
// counted twice.
//
// ?seed=N fixes the dust and the patrols. ?shot=setup|snuff|swing|escape (with
// &seed=N) stages that scene instead of running the loop, paints it twice and
// sets window.__shotReady for a screenshot.

import { STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld,
  EVENT_CAUGHT,
  EVENT_ESCAPED,
  EVENT_PUSH,
  EVENT_SNUFF,
  EVENT_SPOTTED,
} from './world.js';
import {
  ACTION_CONFIRM,
  ACTION_PAUSE,
  ACTION_PUSH,
  ACTION_RESTART,
  ACTION_SNUFF,
  createInput,
} from './input.js';
import {
  createRenderer,
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  SCREEN_WIN,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;
const BEST_KEY = 'moth-and-lantern.best';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
// A handle for automated checks (determinism, mechanics): the page's own
// test scripts step the world directly through it.
window.__world = world;

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best time then lasts one visit.
  }
}

function fmtTime(t) {
  const mins = Math.floor(t / 60);
  const secs = Math.floor(t % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted === 2) window.__shotReady = true;
    // Keep repainting: a resize clears the canvas, and the shot must stay
    // fresh until the screenshot is taken.
    requestAnimationFrame(paint);
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Reach the moonlit window, unseen.');
  }

  function endGame(escaped) {
    if (escaped) {
      screen = SCREEN_WIN;
      const seconds = Math.floor(world.state.elapsed);
      if (best === 0 || seconds < best) {
        best = seconds;
        saveBest(best);
      }
      announce(`Escaped in ${fmtTime(world.state.elapsed)}.`);
    } else {
      screen = SCREEN_OVER;
      announce(`Caught by ${world.state.caughtBy}.`);
    }
  }

  function handleActions(actions) {
    if (screen === SCREEN_TITLE || screen === SCREEN_WIN || screen === SCREEN_OVER) {
      if (actions & (ACTION_CONFIRM | ACTION_RESTART | ACTION_SNUFF)) startGame();
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM | ACTION_SNUFF)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
  }

  function step(actions) {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { mx: 0, my: 0, snuff: false, push: false }, true);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const move = input.move();
    const events = world.step(STEP, {
      mx: move.mx,
      my: move.my,
      snuff: Boolean(actions & ACTION_SNUFF),
      push: Boolean(actions & ACTION_PUSH),
    }, false);
    if (events & EVENT_CAUGHT) endGame(false);
    else if (events & EVENT_ESCAPED) endGame(true);
    else if (events & EVENT_SPOTTED) announce('A priest grows suspicious…');
    else if (events & EVENT_SNUFF) announce('A lantern gutters out.');
    else if (events & EVENT_PUSH) announce('The hanging lantern swings.');
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    handleActions(actions);
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      let first = true;
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step(first ? actions : 0);
        first = false;
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting a cone find her.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Moth and Lantern. Press Space or click to begin.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
