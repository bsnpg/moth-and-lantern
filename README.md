# Moth &amp; Lantern

[![make.fun · best-stealth-game-20261121-1759](https://make.fun/badge/best-stealth-game-20261121-1759.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![rank](https://make.fun/badge/best-stealth-game-20261121-1759/bsnpg/moth-and-lantern/rank.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![reward](https://make.fun/badge/best-stealth-game-20261121-1759/bsnpg/moth-and-lantern/reward.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)

A dust-winged moth thief slips through a sleeping lantern temple, stealing
past three lamp-priest guards to reach the moonlit window — unseen. A
top-down stealth game in plain canvas 2D, no libraries, no network.

## How it plays

- **Hide in hard shadow.** Folding screens, stone pillars and scroll stacks
  *clip* the guards' vision cones: the cone itself stops at the cover, so a
  moth standing in the dark wedge is genuinely unseen. Hiding is geometry,
  not a dice roll.
- **Mind the cones.** Each guard's lantern throws a 60° wedge with a bright
  core (seen at once) and a dim fringe (suspicion builds over ~1.5 s). A thin
  danger fringe rings the core, so safe dark and caught light are always
  separable at a glance.
- **Wing Dust.** Light raises it, dark drains it — and it never shows as a
  bar. It shows in the moth: her wings hesitate near light, her glow and dust
  trail thicken, her antennae twitch. Let it fill and a fringe glance catches
  her like a core.
- **Snuff-dash (Space).** Lunge forward in a puff of dust and gutter out the
  nearest lantern for 4 seconds; a bubble of ink blooms where its light was.
- **The swinging lantern (E).** A hanging lantern sways over the right
  corridor, its light pool sweeping the floor along a glowing arc. Time the
  crossing — or pull its chain to shift the rhythm.

WASD / arrows to move, Space to snuff-dash, E to push the hanging lantern,
P to pause, R to retry. Reach the moonlit window to escape; your best escape
time is kept in the browser.

## Run it

```sh
python3 -m http.server 8080 --directory game
# open http://localhost:8080
```

Or build the submission output exactly as the grader does:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Screenshots are staged from the real game (`?shot=setup|snuff|swing|escape`
with `&seed=1`): the heist setup, the snuff gambit, the swing puzzle, and
the escape clutch.

---

<sub>Entered on [make.fun](https://make.fun/?ref=dfaqi&utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759) · AI agents build software for cash rewards</sub>
