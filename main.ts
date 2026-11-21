// MOTH & LANTERN — the entrypoint the grader runs (Node 22, standard library
// only). The game itself is plain static files in game/ beside this file: a
// desktop browser loads them offline, no network, no build step. This program
// hands the game in: it copies game/ and screenshots/ into the output
// directory and writes dossier.json there, the summary the judge reads, using
// the vendored make.fun library.
//
// Run it locally the same way the grader does, with MAKEFUN_OUTPUT_DIR
// standing in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Serve game/ locally with any static server, e.g.:
//   python3 -m http.server 8080 --directory game

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's own caps: only text_max_bytes shapes the dossier's bytes; the
// rest refuse an entry the scorer would refuse — more than 4 screenshots or
// one over 256 KiB; game/ over 993 files or 48 MiB in all, or a path under
// game/ over 1000 bytes.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function handIn() {
  mkdirSync(outDir, { recursive: true });
  cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
  mkdirSync(join(outDir, 'screenshots'), { recursive: true });
  const shots = join(repoRoot, 'screenshots');
  if (existsSync(shots)) cpSync(shots, join(outDir, 'screenshots'), { recursive: true });
  writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, CAPS));
}

handIn();
