// 2026-04-09: Extracted from 4 files that each had duplicate state logic (code review finding #2).
// state.js - Single source of truth for buddy state read/write/push operations.
// Consumers: index.js, api.js, buddy-stop.js, buddy-session.js, buddy-react-worker.js

import { readFileSync } from 'fs';
import { STATE_PATH } from './paths.js';
import { atomicWrite } from './util.js';

const DEFAULT_STATE = {
  muted: false,
  petCount: 0,
  petHeartsUntil: 0,
  lastReaction: null,
  lastCallTime: 0,
  recentReactions: [],
  era1WarningSeen: false,
};

export function readState() {
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf-8'));
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function writeState(state) {
  atomicWrite(STATE_PATH, JSON.stringify(state, null, 2));
}

export function pushRecent(state, reaction) {
  if (!reaction) return;
  if (!Array.isArray(state.recentReactions)) {
    state.recentReactions = [];
  }
  if (state.recentReactions[state.recentReactions.length - 1] !== reaction) {
    state.recentReactions.push(reaction.slice(0, 200));
  }
  while (state.recentReactions.length > 3) {
    state.recentReactions.shift();
  }
}
