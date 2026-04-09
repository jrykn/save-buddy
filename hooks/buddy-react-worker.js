#!/usr/bin/env node
// 2026-04-09: Initial detached worker for upgrading local fallback reactions with buddy_react output.
// buddy-react-worker.js - Perform the network call after hooks have already returned.

// 2026-04-09: Use shared state.js (code review finding #2).
import { callBuddyReact } from '../server/api.js';
import { getCompanion } from '../server/companion.js';
import { REACTION_PATH } from '../server/paths.js';
import { readState, writeState, pushRecent } from '../server/state.js';
import { atomicWrite } from '../server/util.js';

let args;
try {
  args = JSON.parse(process.argv[2]);
} catch {
  process.exit(0);
}

const companion = getCompanion();
if (!companion) {
  process.exit(0);
}

try {
  const reaction = await callBuddyReact(
    companion,
    args.transcript || '',
    args.reason || 'turn',
    args.recent || [],
    Boolean(args.addressed),
  );

  if (reaction) {
    atomicWrite(REACTION_PATH, JSON.stringify({ text: reaction, ts: Date.now() }));
    const state = readState();
    state.lastReaction = reaction;
    pushRecent(state, reaction);
    writeState(state);
  }
} catch {}

process.exit(0);
