#!/usr/bin/env node
// 2026-04-09: Initial SessionStart hook with fast hatch greeting and async API upgrade.
// buddy-session.js - Fire a hatch-style reaction when a session starts or resumes.

// 2026-04-09: Use shared state.js, fix missing pushRecent (code review #10).
import { readFileSync, unlinkSync } from 'fs';
import { spawn } from 'child_process';
import { basename, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getCompanion, isMuted } from '../server/companion.js';
import { BUDDY_DIR, REACTION_PATH } from '../server/paths.js';
import { localReaction } from '../server/reactions.js';
import { readState, writeState, pushRecent } from '../server/state.js';
import { atomicWrite } from '../server/util.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let stdin = '';
process.stdin.setEncoding('utf-8');
for await (const chunk of process.stdin) {
  stdin += chunk;
}

let hookContext = {};
try {
  hookContext = JSON.parse(stdin);
} catch {}

if (hookContext.source && !['startup', 'resume'].includes(hookContext.source)) {
  process.exit(0);
}

// 2026-04-10: Reset persisted statusline left-width on session start. The
// statusline wrapper persists max leftWidth across renders to keep the buddy
// column stable, but the value should not survive across sessions because the
// HUD content (and therefore the natural leftWidth) can differ wildly between
// projects/terminals/HUD presets. Resetting per session lets the value
// re-converge from scratch.
if (hookContext.source === 'startup') {
  try {
    unlinkSync(join(BUDDY_DIR, 'state', 'left-width.txt'));
  } catch {}
}

const state = readState();

if (isMuted(state)) {
  process.exit(0);
}

const companion = getCompanion();
if (!companion) {
  process.exit(0);
}

const cwd = hookContext.cwd || process.cwd();
let transcript = '';

try {
  const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf-8'));
  if (pkg.name) {
    transcript += `project: ${pkg.name}${pkg.description ? ` - ${pkg.description}` : ''}\n`;
  }
} catch {}

if (!transcript) {
  transcript = `project directory: ${basename(cwd)}`;
}

if (!transcript.trim()) {
  transcript = 'new session started';
}

const fallbackReaction = localReaction(companion, 'hatch', Date.now());
atomicWrite(REACTION_PATH, JSON.stringify({ text: fallbackReaction, ts: Date.now() }));
state.lastReaction = fallbackReaction;
pushRecent(state, fallbackReaction);
writeState(state);

const workerPath = join(__dirname, 'buddy-react-worker.js');
const args = JSON.stringify({
  transcript: transcript.slice(0, 5000),
  reason: 'hatch',
  addressed: false,
  recent: state.recentReactions || [],
});

// 2026-04-09: Minimal env for worker (security review SEC-008).
const child = spawn(process.execPath, [workerPath, args], {
  detached: true,
  stdio: 'ignore',
  env: {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    PATH: process.env.PATH,
    ...(process.env.CLAUDE_CONFIG_DIR ? { CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR } : {}),
  },
});
child.unref();

process.exit(0);
