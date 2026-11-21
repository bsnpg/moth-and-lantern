// MOTH & LANTERN — the rules and the state, with no drawing and no browser in it.
// The moth, three lamp-priest guards, the lanterns, the swinging lantern and the
// Wing Dust meter live here. step() advances one fixed step and reports what
// happened as bit flags, so the caller can react without the world knowing
// about screens or sound. Nothing here allocates after createWorld returns.

import {
  CONE, COVER, DUST, EXIT, FIELD, GUARDS, LANTERN_LIGHT_RADIUS, MOTH,
  PLAYER_START, SNUFF, SWING, WALLS, WALL_LANTERNS,
} from './config.js';

export const EVENT_CAUGHT = 1;
export const EVENT_ESCAPED = 2;
export const EVENT_SNUFF = 4;
export const EVENT_SPOTTED = 8;
export const EVENT_PUSH = 16;

const TAU = Math.PI * 2;

function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Distance from (ox,oy) along unit (dx,dy) to the first cover rect, bubble or
// wall the ray meets, capped at maxLen. This one function is the whole stealth
// model: it clips the cones for drawing, and it decides whether a guard can
// actually see the moth. A moth behind cover is never in a cone, because the
// cone itself stops at the cover.
export function castRay(ox, oy, dx, dy, maxLen, bubbles) {
  let best = maxLen;
  for (let i = 0; i < COVER.length; i += 1) {
    const r = COVER[i];
    // Slab test against the rect.
    let tmin = 0;
    let tmax = best;
    let hit = true;
    if (dx === 0) {
      if (ox < r.x || ox > r.x + r.w) hit = false;
    } else {
      let t1 = (r.x - ox) / dx;
      let t2 = (r.x + r.w - ox) / dx;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) hit = false;
    }
    if (hit) {
      if (dy === 0) {
        if (oy < r.y || oy > r.y + r.h) hit = false;
      } else {
        let t1 = (r.y - oy) / dy;
        let t2 = (r.y + r.h - oy) / dy;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) hit = false;
      }
    }
    if (hit && tmin > 0.001 && tmin < best) best = tmin;
  }
  for (let i = 0; i < bubbles.length; i += 1) {
    const b = bubbles[i];
    if (b.r <= 0) continue;
    const cx = b.x - ox;
    const cy = b.y - oy;
    const proj = cx * dx + cy * dy;
    if (proj < 0 || proj > best) continue;
    const perp2 = cx * cx + cy * cy - proj * proj;
    const rr = b.r * b.r;
    if (perp2 > rr) continue;
    const t = proj - Math.sqrt(rr - perp2);
    if (t > 0.001 && t < best) best = t;
  }
  // The room's walls stop a ray too.
  if (dx > 0) best = Math.min(best, (WALLS.x + WALLS.w - ox) / dx);
  else if (dx < 0) best = Math.min(best, (WALLS.x - ox) / dx);
  if (dy > 0) best = Math.min(best, (WALLS.y + WALLS.h - oy) / dy);
  else if (dy < 0) best = Math.min(best, (WALLS.y - oy) / dy);
  return best;
}

// The clipped cone of a guard, as a polygon: the apex plus one point per ray.
// Drawing it and testing it use the same rays, so what the player sees is
// exactly where the guard can see.
export function conePolygon(guard, bubbles) {
  const half = guard.state === 'investigate' ? CONE.widenHalfAngle : CONE.halfAngle;
  const points = [{ x: guard.x, y: guard.y }];
  for (let i = 0; i <= CONE.rays; i += 1) {
    const a = guard.angle - half + (2 * half * i) / CONE.rays;
    const len = castRay(guard.x, guard.y, Math.cos(a), Math.sin(a), CONE.range, bubbles);
    points.push({ x: guard.x + Math.cos(a) * len, y: guard.y + Math.sin(a) * len });
  }
  return points;
}

// Is (x,y) lit by the lantern at (lx,ly) — inside its pool with a clear line?
function litBy(lx, ly, radius, x, y, bubbles) {
  const dx = x - lx;
  const dy = y - ly;
  const d = Math.hypot(dx, dy);
  if (d >= radius || d < 0.001) return false;
  return castRay(lx, ly, dx / d, dy / d, d, bubbles) >= d - 2;
}

const PARTICLE_MAX = 240;

export function createWorld(random) {
  const player = {
    x: PLAYER_START.x, y: PLAYER_START.y, radius: MOTH.radius,
    face: -Math.PI / 2, flap: 0, dust: DUST.start, lit: false,
    dashT: 0, dashX: 0, dashY: 0, moving: false, speed: 0,
  };
  const guards = GUARDS.map((g) => ({
    name: g.name,
    x: g.x, y: g.y, angle: 0,
    waypoints: g.waypoints, wp: 1, pause: g.pause, pauseT: 0,
    state: 'patrol', suspicion: 0, spotted: false,
    targetX: 0, targetY: 0, investigateT: 0, sweepFrom: 0,
    blindT: 0, turnTo: null,
  }));
  const lanterns = WALL_LANTERNS.map((l) => ({ x: l.x, y: l.y, lit: true, outT: 0 }));
  const swing = {
    phase: 0, phaseVel: (TAU / SWING.period),
    x: SWING.pivotX, y: SWING.pivotY + SWING.arm, angle: 0,
  };
  const bubbles = [];
  const particles = [];
  for (let i = 0; i < PARTICLE_MAX; i += 1) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2 });
  }
  const state = {
    player, guards, lanterns, swing, bubbles, particles,
    outcome: null, elapsed: 0, snuffCooldown: 0, pushCooldown: 0,
    snuffsUsed: 0, timesSpotted: 0, caughtBy: '',
  };

  function freeParticle() {
    for (let i = 0; i < PARTICLE_MAX; i += 1) {
      if (!particles[i].active) return particles[i];
    }
    return particles[0];
  }

  function spawnDust(x, y, n, spread, speed) {
    for (let i = 0; i < n; i += 1) {
      const p = freeParticle();
      const a = random() * TAU;
      const s = speed * (0.3 + random() * 0.7);
      p.active = true;
      p.x = x + Math.cos(a) * spread * random();
      p.y = y + Math.sin(a) * spread * random();
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s - 6;
      p.max = 0.9 + random() * 0.7;
      p.life = p.max;
      p.size = 1.5 + random() * 2.5;
    }
  }

  function reset() {
    player.x = PLAYER_START.x;
    player.y = PLAYER_START.y;
    player.face = -Math.PI / 2;
    player.flap = 0;
    player.dust = DUST.start;
    player.lit = false;
    player.dashT = 0;
    player.moving = false;
    player.speed = 0;
    for (let i = 0; i < guards.length; i += 1) {
      const g = guards[i];
      const def = GUARDS[i];
      g.x = def.x;
      g.y = def.y;
      g.angle = Math.PI / 2;
      g.waypoints = def.waypoints;
      g.wp = 1;
      g.pauseT = 0;
      g.state = 'patrol';
      g.suspicion = 0;
      g.spotted = false;
      g.investigateT = 0;
      g.blindT = 0;
      g.turnTo = null;
    }
    for (const l of lanterns) {
      l.lit = true;
      l.outT = 0;
    }
    swing.phase = 0;
    swing.phaseVel = TAU / SWING.period;
    swing.angle = 0;
    swing.x = SWING.pivotX;
    swing.y = SWING.pivotY + SWING.arm;
    bubbles.length = 0;
    for (const p of particles) p.active = false;
    state.outcome = null;
    state.elapsed = 0;
    state.snuffCooldown = 0;
    state.pushCooldown = 0;
    state.snuffsUsed = 0;
    state.timesSpotted = 0;
    state.caughtBy = '';
    // A few ambient motes already drifting, so the temple never looks dead.
    for (let i = 0; i < 26; i += 1) {
      const p = freeParticle();
      p.active = true;
      p.x = WALLS.x + random() * WALLS.w;
      p.y = WALLS.y + random() * WALLS.h;
      p.vx = (random() - 0.5) * 8;
      p.vy = -4 - random() * 8;
      p.max = 4 + random() * 4;
      p.life = random() * p.max;
      p.size = 1 + random() * 1.6;
    }
  }

  // Push a circle out of every cover rect it overlaps, and keep it in the room.
  function resolveCover(body) {
    for (const r of COVER) {
      const cx = clamp(body.x, r.x, r.x + r.w);
      const cy = clamp(body.y, r.y, r.y + r.h);
      const dx = body.x - cx;
      const dy = body.y - cy;
      const d2 = dx * dx + dy * dy;
      const rad = body.radius ?? 14;
      if (d2 >= rad * rad) continue;
      if (d2 < 0.0001) {
        body.y = r.y - rad;
        continue;
      }
      const d = Math.sqrt(d2);
      body.x += (dx / d) * (rad - d);
      body.y += (dy / d) * (rad - d);
    }
    const rad = body.radius ?? 14;
    body.x = clamp(body.x, WALLS.x + rad, WALLS.x + WALLS.w - rad);
    body.y = clamp(body.y, WALLS.y + rad, WALLS.y + WALLS.h - rad);
  }

  function nearestLantern(x, y) {
    let best = null;
    let bestD = SNUFF.range;
    for (const l of lanterns) {
      if (!l.lit) continue;
      const d = Math.hypot(l.x - x, l.y - y);
      if (d < bestD) {
        bestD = d;
        best = { kind: 'wall', ref: l };
      }
    }
    for (const g of guards) {
      if (g.blindT > 0) continue;
      const d = Math.hypot(g.x - x, g.y - y);
      if (d < bestD) {
        bestD = d;
        best = { kind: 'guard', ref: g };
      }
    }
    return best;
  }

  function stepGuard(g, dt, events) {
    if (g.blindT > 0) {
      g.blindT = Math.max(0, g.blindT - dt);
      return;
    }
    if (g.state === 'investigate') {
      g.investigateT -= dt;
      const dx = g.targetX - g.x;
      const dy = g.targetY - g.y;
      const d = Math.hypot(dx, dy);
      if (d > 14) {
        const want = Math.atan2(dy, dx);
        g.angle += wrapAngle(want - g.angle) * Math.min(1, dt * 6);
        g.x += (dx / d) * CONE.investigateSpeed * dt;
        g.y += (dy / d) * CONE.investigateSpeed * dt;
        resolveCover(g);
      } else {
        // Arrived: sweep the cone in a slow full turn, looking for the moth.
        g.angle += (TAU / 2.5) * dt;
      }
      if (g.investigateT <= 0) {
        g.state = 'patrol';
        g.suspicion = 0;
        g.spotted = false;
        // Resume from the nearest waypoint.
        let nearest = 0;
        let nearestD = Infinity;
        for (let i = 0; i < g.waypoints.length; i += 1) {
          const w = g.waypoints[i];
          const dd = (w.x - g.x) ** 2 + (w.y - g.y) ** 2;
          if (dd < nearestD) {
            nearestD = dd;
            nearest = i;
          }
        }
        g.wp = nearest;
        g.pauseT = 0;
      }
      return;
    }
    // Patrol: walk the loop, pausing at each waypoint to look around.
    if (g.pauseT > 0) {
      g.pauseT -= dt;
      g.angle += Math.sin(state.elapsed * 1.4 + g.x) * 0.35 * dt;
      return;
    }
    const w = g.waypoints[g.wp];
    const dx = w.x - g.x;
    const dy = w.y - g.y;
    const d = Math.hypot(dx, dy);
    if (d < 6) {
      g.wp = (g.wp + 1) % g.waypoints.length;
      g.pauseT = g.pause;
      return;
    }
    const want = Math.atan2(dy, dx);
    g.angle += wrapAngle(want - g.angle) * Math.min(1, dt * 5);
    g.x += (dx / d) * CONE.patrolSpeed * dt;
    g.y += (dy / d) * CONE.patrolSpeed * dt;
    resolveCover(g);
  }

  // One fixed step. `harmless` runs the temple as a backdrop (the title screen):
  // guards patrol and lanterns burn, but nothing can be caught and nothing scores.
  function step(dt, input, harmless) {
    let events = 0;
    if (state.outcome !== null) return events;
    state.elapsed += dt;

    // The swinging lantern: a pendulum whose phase the moth can push.
    swing.phaseVel += ((TAU / SWING.period) - swing.phaseVel) * Math.min(1, dt * 0.5);
    swing.phase += swing.phaseVel * dt;
    swing.angle = SWING.amplitude * Math.sin(swing.phase);
    swing.x = SWING.pivotX + Math.sin(swing.angle) * SWING.arm;
    swing.y = SWING.pivotY + Math.cos(swing.angle) * SWING.arm;

    if (state.snuffCooldown > 0) state.snuffCooldown -= dt;
    if (state.pushCooldown > 0) state.pushCooldown -= dt;

    // Lanterns relight when their dark seconds run out.
    for (const l of lanterns) {
      if (!l.lit) {
        l.outT -= dt;
        if (l.outT <= 0) l.lit = true;
      }
    }
    // Ink bubbles grow, then fade with the dark they carry.
    for (let i = bubbles.length - 1; i >= 0; i -= 1) {
      const b = bubbles[i];
      b.t += dt;
      b.r = Math.min(SNUFF.bubbleRadius, (b.t / SNUFF.bubbleGrow) * SNUFF.bubbleRadius);
      if (b.t >= SNUFF.outSeconds) bubbles.splice(i, 1);
    }

    // Snuff-dash: one button, one lunge, one puff of dust. If a lantern is close
    // enough when the puff goes off, its flame gutters out and the dark blooms.
    if (input.snuff && state.snuffCooldown <= 0) {
      state.snuffCooldown = SNUFF.cooldown;
      state.snuffsUsed += 1;
      const mx = input.mx;
      const my = input.my;
      const len = Math.hypot(mx, my);
      if (len > 0.01) {
        player.dashX = mx / len;
        player.dashY = my / len;
        player.face = Math.atan2(my, mx);
      } else {
        player.dashX = Math.cos(player.face);
        player.dashY = Math.sin(player.face);
      }
      player.dashT = MOTH.dashTime;
      const target = nearestLantern(player.x, player.y);
      if (target !== null) {
        bubbles.push({ x: target.ref.x, y: target.ref.y, r: 8, t: 0 });
        if (target.kind === 'wall') {
          target.ref.lit = false;
          target.ref.outT = SNUFF.outSeconds;
        } else {
          target.ref.blindT = SNUFF.outSeconds;
        }
        events |= EVENT_SNUFF;
      }
      spawnDust(player.x, player.y, 26, 10, 130);
    }

    // Push the swinging lantern's chain: a nudge that shifts its rhythm.
    if (input.push && state.pushCooldown <= 0) {
      const d = Math.hypot(swing.x - player.x, swing.y - player.y);
      const dChain = Math.hypot(SWING.pivotX - player.x, (SWING.pivotY + SWING.arm / 2) - player.y);
      if (d < SWING.pushRange || dChain < SWING.pushRange) {
        state.pushCooldown = 0.4;
        const side = player.x < swing.x ? 1 : -1;
        swing.phaseVel += side * SWING.pushImpulse;
        events |= EVENT_PUSH;
        spawnDust(swing.x, swing.y, 8, 6, 60);
      }
    }

    // Move the moth: a dash overrides steering while it lasts.
    let vx = 0;
    let vy = 0;
    if (player.dashT > 0) {
      player.dashT -= dt;
      vx = player.dashX * MOTH.dashSpeed;
      vy = player.dashY * MOTH.dashSpeed;
    } else {
      const len = Math.hypot(input.mx, input.my);
      if (len > 0.01) {
        vx = (input.mx / len) * MOTH.speed;
        vy = (input.my / len) * MOTH.speed;
        player.face = Math.atan2(input.my, input.mx);
      }
    }
    player.speed = Math.hypot(vx, vy);
    player.moving = player.speed > 1;
    player.x += vx * dt;
    player.y += vy * dt;
    resolveCover(player);

    // Wings hesitate near light: the flap slows as Wing Dust climbs.
    const flapRate = 14 - 8 * player.dust;
    player.flap += TAU * flapRate * dt;

    // Dust trail, thicker while dashing.
    if (player.moving) {
      state.trailAcc = (state.trailAcc ?? 0) + dt * (player.dashT > 0 ? 130 : 26);
      while (state.trailAcc >= 1) {
        state.trailAcc -= 1;
        spawnDust(player.x - Math.cos(player.face) * 10, player.y - Math.sin(player.face) * 10, 1, 4, 18);
      }
    }

    // The guards move and watch. Detection is the raycast: a moth the cone
    // cannot reach — cut off by a screen, a pillar, a bubble — is not seen.
    let inFringe = false;
    let inLight = false;
    for (const g of guards) {
      stepGuard(g, dt, events);
      if (g.blindT > 0) continue;
      const dx = player.x - g.x;
      const dy = player.y - g.y;
      const dist = Math.hypot(dx, dy);
      if (dist > CONE.range || dist < 0.001) continue;
      const diff = Math.abs(wrapAngle(Math.atan2(dy, dx) - g.angle));
      const half = g.state === 'investigate' ? CONE.widenHalfAngle : CONE.halfAngle;
      if (diff > half) continue;
      const rayLen = castRay(g.x, g.y, dx / dist, dy / dist, dist, bubbles);
      if (rayLen < dist - 2) continue; // something stands between them
      const core = diff <= CONE.coreHalfAngle && dist < CONE.range * CONE.coreRange;
      if (core || player.lit) {
        if (harmless) continue;
        state.outcome = 'caught';
        state.caughtBy = g.name;
        events |= EVENT_CAUGHT;
        return events;
      }
      if (harmless) continue;
      inFringe = true;
      g.suspicion = Math.min(1, g.suspicion + dt / CONE.suspicionSeconds);
      if (g.suspicion > 0.5 && !g.spotted) {
        g.spotted = true;
        state.timesSpotted += 1;
        events |= EVENT_SPOTTED;
      }
      if (g.suspicion >= 1 && g.state !== 'investigate') {
        g.state = 'investigate';
        g.targetX = player.x;
        g.targetY = player.y;
        g.investigateT = CONE.investigateSeconds;
      }
      // A suspicious guard turns toward the glimpse.
      g.angle += wrapAngle(Math.atan2(dy, dx) - g.angle) * Math.min(1, dt * 2.5);
    }
    // Suspicion fades when the moth is out of every cone.
    if (!inFringe) {
      for (const g of guards) {
        if (g.state === 'patrol') g.suspicion = Math.max(0, g.suspicion - dt / 1.2);
      }
    }

    // Light pools raise Wing Dust; shadow and plain dark drain it.
    for (const l of lanterns) {
      if (l.lit && litBy(l.x, l.y, LANTERN_LIGHT_RADIUS, player.x, player.y, bubbles)) {
        inLight = true;
        break;
      }
    }
    if (!inLight && litBy(swing.x, swing.y, SWING.lightRadius, player.x, player.y, bubbles)) {
      inLight = true;
    }
    let dustDelta = inLight ? DUST.inLight : DUST.inDark;
    if (inFringe) dustDelta = Math.max(dustDelta, DUST.inFringe);
    if (player.dashT > 0) dustDelta += DUST.whileDashing;
    player.dust = clamp(player.dust + dustDelta * dt, 0, 1);
    if (player.dust >= DUST.lit) player.lit = true;
    else if (player.dust < DUST.calm) player.lit = false;

    // Dust motes drift; near a cone they stretch toward its light.
    for (const p of particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      for (const g of guards) {
        if (g.blindT > 0) continue;
        const dx = g.x - p.x;
        const dy = g.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d < CONE.range * 0.7 && d > 1) {
          p.vx += (dx / d) * 14 * dt;
          p.vy += (dy / d) * 14 * dt;
        }
      }
      if (p.x < WALLS.x || p.x > WALLS.x + WALLS.w || p.y < WALLS.y || p.y > WALLS.y + WALLS.h) {
        p.active = false;
      }
    }
    // A thin ambient drift keeps the air alive.
    if (random() < dt * 3) {
      const p = freeParticle();
      p.active = true;
      p.x = WALLS.x + random() * WALLS.w;
      p.y = WALLS.y + WALLS.h - random() * 40;
      p.vx = (random() - 0.5) * 6;
      p.vy = -5 - random() * 7;
      p.max = 5 + random() * 3;
      p.life = p.max;
      p.size = 1 + random() * 1.4;
    }

    // The window: reach it unseen and the heist is done.
    if (
      !harmless &&
      player.x + player.radius > EXIT.x &&
      player.x - player.radius < EXIT.x + EXIT.w &&
      player.y + player.radius > EXIT.y &&
      player.y - player.radius < EXIT.y + EXIT.h
    ) {
      state.outcome = 'escaped';
      events |= EVENT_ESCAPED;
    }
    return events;
  }

  reset();
  return { state, reset, step, castRay, conePolygon };
}
