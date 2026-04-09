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

export const RARITY_HEX = {
  common: { r: 115, g: 115, b: 115 },
  uncommon: { r: 22, g: 163, b: 74 },
  rare: { r: 37, g: 99, b: 235 },
  epic: { r: 139, g: 92, b: 246 },
  legendary: { r: 234, g: 179, b: 8 },
};

export const RARITY_256 = {
  common: 245,
  uncommon: 35,
  rare: 33,
  epic: 135,
  legendary: 220,
};

export const RARITY_16 = {
  common: 90,
  uncommon: 32,
  rare: 34,
  epic: 35,
  legendary: 33,
};
