// 2026-04-09: Initial ANSI styling helpers for rarity colors and bubble fade effects.
// ansi.js - Terminal capability detection plus simple styling helpers.

import { RARITY_16, RARITY_256, RARITY_HEX } from './types.js';

const ESC = '\u001b[';
const RESET = `${ESC}0m`;

export function detectColorLevel() {
  if (process.env.NO_COLOR !== undefined) {
    return 0;
  }

  if (process.env.TERM === 'dumb') {
    return 0;
  }

  if (process.env.FORCE_COLOR !== undefined) {
    const level = Number.parseInt(process.env.FORCE_COLOR, 10);
    if (Number.isFinite(level)) {
      if (level <= 0) return 0;
      if (level === 1) return 1;
      if (level === 2) return 2;
      return 3;
    }
    return 1;
  }

  const colorterm = (process.env.COLORTERM || '').toLowerCase();
  if (colorterm === 'truecolor' || colorterm === '24bit') {
    return 3;
  }

  if (process.env.WT_SESSION) {
    return 3;
  }

  const termProgram = process.env.TERM_PROGRAM || '';
  if (termProgram === 'iTerm.app' || termProgram === 'Apple_Terminal') {
    return 3;
  }

  const term = process.env.TERM || '';
  if (term.includes('256color')) {
    return 2;
  }

  return 1;
}

const COLOR_LEVEL = detectColorLevel();

export function colorize(text, rarity) {
  if (COLOR_LEVEL === 0) {
    return text;
  }

  if (COLOR_LEVEL >= 3) {
    const color = RARITY_HEX[rarity];
    if (!color) {
      return text;
    }
    return `${ESC}38;2;${color.r};${color.g};${color.b}m${text}${RESET}`;
  }

  if (COLOR_LEVEL === 2) {
    const color = RARITY_256[rarity];
    if (color === undefined) {
      return text;
    }
    return `${ESC}38;5;${color}m${text}${RESET}`;
  }

  const color = RARITY_16[rarity];
  if (color === undefined) {
    return text;
  }
  return `${ESC}${color}m${text}${RESET}`;
}

export function colorRGB(text, r, g, b, fallback256, fallback16) {
  if (COLOR_LEVEL === 0) {
    return text;
  }
  if (COLOR_LEVEL >= 3) {
    return `${ESC}38;2;${r};${g};${b}m${text}${RESET}`;
  }
  if (COLOR_LEVEL === 2 && fallback256 !== undefined) {
    return `${ESC}38;5;${fallback256}m${text}${RESET}`;
  }
  if (fallback16 !== undefined) {
    return `${ESC}${fallback16}m${text}${RESET}`;
  }
  return text;
}

export function bold(text) {
  if (COLOR_LEVEL === 0) {
    return text;
  }
  return `${ESC}1m${text}${ESC}22m`;
}

export function italic(text) {
  if (COLOR_LEVEL === 0) {
    return text;
  }
  return `${ESC}3m${text}${ESC}23m`;
}

export function dim(text) {
  if (COLOR_LEVEL === 0) {
    return text;
  }
  return `${ESC}2m${text}${ESC}22m`;
}

export function magenta(text) {
  if (COLOR_LEVEL === 0) {
    return text;
  }
  if (COLOR_LEVEL >= 3) {
    return `${ESC}38;2;236;72;153m${text}${RESET}`;
  }
  if (COLOR_LEVEL === 2) {
    return `${ESC}38;5;198m${text}${RESET}`;
  }
  return `${ESC}35m${text}${RESET}`;
}

export function compose(text, transforms) {
  return transforms.reduce((value, transform) => transform(value), text);
}

export function getColorLevel() {
  return COLOR_LEVEL;
}
