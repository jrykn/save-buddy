// 2026-04-09: Initial local fallback reactions for endpoint failures and offline behavior.
// reactions.js - Deterministic fallback phrases when buddy_react is unavailable.

import { hashString, mulberry32 } from './companion.js';

const TEMPLATES = {
  error: [
    'ouch',
    '*winces*',
    'that stack trace though',
    '*peers at the error*',
    'seen worse',
    '*shuffles away from the fire*',
    'have you tried turning it off',
  ],
  'test-fail': [
    'hmm',
    'close but not quite',
    '*peers at test output*',
    'off by one?',
    "the test knows something you don't",
    '*squints at assertions*',
  ],
  'test-pass': [
    'nice',
    '*happy waddle*',
    'green across the board',
    'all clear',
  ],
  'large-diff': [
    'that was a lot of changes',
    '*stretches*',
    'quite the novel',
    '*counts the lines*',
    'bold moves',
  ],
  pet: [
    '*happy waddle*',
    '*leans into it*',
    '*contented chirp*',
    'thanks',
    '*fluffed*',
    '*wiggles contentedly*',
  ],
  hatch: [
    '*blinks*',
    '*looks around*',
    '...where am I',
    '*stretches*',
    'oh hello there',
  ],
  turn: [
    '*watches*',
    '*tilts head*',
    '*shuffles feet*',
    'interesting',
    '*blinks*',
    'hmm',
    '*nods slowly*',
  ],
  addressed: [
    '*perks up*',
    'yes?',
    '*looks at you*',
    'you called?',
  ],
};

export function localReaction(companion, eventType, seedExtra) {
  const templates = TEMPLATES[eventType] || TEMPLATES.turn;
  const seed = hashString(`${companion.personality || ''}${seedExtra || Date.now()}`);
  const rng = mulberry32(seed);
  const idx = Math.floor(rng() * templates.length);
  return templates[idx];
}
