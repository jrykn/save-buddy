// 2026-04-09: Initial deterministic companion regeneration based on the reviewed preservation plan.
// companion.js - PRNG engine plus persisted companion soul reader.

import { readFileSync } from 'fs';
import { CONFIG_PATH } from './paths.js';
import {
  EYES,
  HATS,
  RARITIES,
  RARITY_FLOOR,
  RARITY_WEIGHTS,
  SPECIES,
  STAT_NAMES,
} from './types.js';

const SALT = 'friend-2026-401';

export function hashString(value) {
  // 2026-04-09: Bun fast-path matches native Ab4 behavior (behavioral fidelity P1).
  // The native binary uses Bun.hash when running under Bun, which produces a different
  // result than the FNV-1a JS implementation. We must match whichever runtime is active.
  if (typeof globalThis.Bun !== 'undefined') {
    return Number(BigInt(globalThis.Bun.hash(value)) & 0xffffffffn);
  }
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let result = Math.imul(state ^ (state >>> 15), 1 | state);
    result = (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result;
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

// 2026-04-09: Cache .claude.json reads with 5s TTL (perf review finding #2).
// This file changes at most once per session (OAuth refresh). Reading it 3x per
// statusline tick (every 500ms) is wasteful.
let _configCache = null;
let _configCacheTime = 0;
const CONFIG_TTL_MS = 5000;

function readConfig() {
  const now = Date.now();
  if (_configCache !== null && now - _configCacheTime < CONFIG_TTL_MS) {
    return _configCache;
  }
  try {
    _configCache = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    _configCacheTime = now;
    return _configCache;
  } catch {
    _configCache = null;
    _configCacheTime = now;
    return null;
  }
}

function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}

function rollRarity(rng) {
  let remaining = rng() * Object.values(RARITY_WEIGHTS).reduce((sum, value) => sum + value, 0);
  for (const rarity of RARITIES) {
    remaining -= RARITY_WEIGHTS[rarity];
    if (remaining < 0) {
      return rarity;
    }
  }
  return 'common';
}

function rollStats(rng, rarity) {
  const floor = RARITY_FLOOR[rarity];
  const peak = pick(rng, STAT_NAMES);
  let secondary = pick(rng, STAT_NAMES);
  while (secondary === peak) {
    secondary = pick(rng, STAT_NAMES);
  }

  const stats = {};
  for (const name of STAT_NAMES) {
    if (name === peak) {
      stats[name] = Math.min(100, floor + 50 + Math.floor(rng() * 30));
    } else if (name === secondary) {
      stats[name] = Math.max(1, floor - 10 + Math.floor(rng() * 15));
    } else {
      stats[name] = floor + Math.floor(rng() * 40);
    }
  }

  return stats;
}

function rollFrom(rng) {
  const rarity = rollRarity(rng);
  const bones = {
    rarity,
    species: pick(rng, SPECIES),
    eye: pick(rng, EYES),
    hat: rarity === 'common' ? 'none' : pick(rng, HATS),
    shiny: rng() < 0.01,
    stats: rollStats(rng, rarity),
  };

  return {
    bones,
    inspirationSeed: Math.floor(rng() * 1e9),
  };
}

let rollCache;

export function roll(userId) {
  const key = `${userId || 'anon'}${SALT}`;
  if (rollCache?.key === key) {
    return rollCache.value;
  }

  const value = rollFrom(mulberry32(hashString(key)));
  rollCache = { key, value };
  return value;
}

export function companionUserId() {
  const config = readConfig();
  return config?.oauthAccount?.accountUuid ?? config?.userID ?? 'anon';
}

export function readCompanionConfig() {
  return readConfig()?.companion ?? null;
}

export function isNativeMuted() {
  return !!readConfig()?.companionMuted;
}

export function isMuted(state) {
  return !!state?.muted || isNativeMuted();
}

/**
 * Detects when a companion's stored personality was written for a different
 * species than the current algorithm produces (era 1 hatch mismatch).
 * Uses lenient substring matching — the hatching prompt embedded the species
 * name in the personality text, so "A patient penguin..." is a reliable signal.
 *
 * @param {object} companion - merged companion object with .personality and .species
 * @returns {string|null} species name found in personality if it differs from bones, else null
 */
export function detectEra1Mismatch(companion) {
  if (!companion?.personality || !companion?.species) return null;
  const text = companion.personality.toLowerCase();
  for (const s of SPECIES) {
    if (s !== companion.species && text.includes(s)) {
      return s;
    }
  }
  return null;
}

export function getCompanion() {
  const stored = readCompanionConfig();
  if (!stored) {
    return null;
  }
  const { bones } = roll(companionUserId());
  return { ...stored, ...bones };
}
