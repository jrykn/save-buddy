// 2026-04-09: Initial save-buddy constants from the public buddy forensics reference.
// types.js - Stable buddy constants and rendering metadata.

export const SPECIES = [
  'duck', 'goose', 'blob', 'cat', 'dragon', 'octopus', 'owl', 'penguin',
  'turtle', 'snail', 'ghost', 'axolotl', 'capybara', 'cactus', 'robot',
  'rabbit', 'mushroom', 'chonk',
];

export const EYES = [
  '\u00b7',
  '\u2726',
  '\u00d7',
  '\u25c9',
  '@',
  '\u00b0',
];

export const HATS = [
  'none',
  'crown',
  'tophat',
  'propeller',
  'halo',
  'wizard',
  'beanie',
  'tinyduck',
];

export const STAT_NAMES = ['DEBUGGING', 'PATIENCE', 'CHAOS', 'WISDOM', 'SNARK'];
export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

export const RARITY_WEIGHTS = {
  common: 60,
  uncommon: 25,
  rare: 10,
  epic: 4,
  legendary: 1,
};

export const RARITY_STARS = {
  common: '\u2605',
  uncommon: '\u2605\u2605',
  rare: '\u2605\u2605\u2605',
  epic: '\u2605\u2605\u2605\u2605',
  legendary: '\u2605\u2605\u2605\u2605\u2605',
};

export const RARITY_FLOOR = {
  common: 5,
  uncommon: 15,
  rare: 25,
  epic: 35,
  legendary: 50,
};

// 2026-04-10: Colors are brightened ~1.7x to compensate for Claude Code's
// <Text dimColor> wrapper on all statusline output. The native buddy was
// rendered as a separate Ink component (not in the statusline), so it wasn't
// dimmed. These brightened values approximate the native appearance after
// Claude Code's dim is applied.
export const RARITY_HEX = {
  common: { r: 220, g: 220, b: 220 },
  uncommon: { r: 40, g: 255, b: 130 },
  rare: { r: 70, g: 170, b: 255 },
  epic: { r: 210, g: 160, b: 255 },
  legendary: { r: 255, g: 230, b: 50 },
};

export const RARITY_256 = {
  common: 255,
  uncommon: 48,
  rare: 75,
  epic: 141,
  legendary: 227,
};

export const RARITY_16 = {
  common: 97,
  uncommon: 92,
  rare: 94,
  epic: 95,
  legendary: 93,
};
