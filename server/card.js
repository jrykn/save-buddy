// 2026-04-09: Initial pre-rendered companion card so buddy_show stays deterministic.
// card.js - Render a complete ASCII companion card for the MCP tool.

import { renderSprite } from './sprites.js';
import { STAT_NAMES, RARITY_STARS } from './types.js';
import { wrap } from './util.js';

export function renderCompanionCard(companion, lastReaction, era1Species = null) {
  const width = 38;
  const lines = [];
  const stars = RARITY_STARS[companion.rarity] || '';
  const rarity = String(companion.rarity || '').toUpperCase();
  const species = String(companion.species || '').toUpperCase();
  const sprite = renderSprite(companion, 0);

  lines.push(`\u256d${'\u2500'.repeat(width)}\u256e`);
  lines.push(`\u2502${' '.repeat(width)}\u2502`);

  const left = `  ${stars} ${rarity}`.trimEnd();
  const right = `${species}  `;
  lines.push(`\u2502${left}${' '.repeat(Math.max(0, width - left.length - right.length))}${right}\u2502`);
  lines.push(`\u2502${' '.repeat(width)}\u2502`);

  for (const spriteLine of sprite) {
    const padded = `    ${spriteLine.trimEnd()}`;
    lines.push(`\u2502${padded.padEnd(width)}\u2502`);
  }

  lines.push(`\u2502${' '.repeat(width)}\u2502`);
  lines.push(`\u2502${`  ${companion.name}`.padEnd(width)}\u2502`);
  lines.push(`\u2502${' '.repeat(width)}\u2502`);

  for (const line of wrap(`"${companion.personality}"`, width - 4)) {
    lines.push(`\u2502${`  ${line}`.padEnd(width)}\u2502`);
  }

  lines.push(`\u2502${' '.repeat(width)}\u2502`);

  if (era1Species) {
    lines.push(`\u2502${'  \u26a0 possible species mismatch (see #2)'.padEnd(width)}\u2502`);
    const detail = `  personality: ${era1Species} \u00b7 bones: ${companion.species}`;
    lines.push(`\u2502${detail.padEnd(width)}\u2502`);
    lines.push(`\u2502${' '.repeat(width)}\u2502`);
  }

  for (const statName of STAT_NAMES) {
    const statValue = Number(companion.stats?.[statName] || 0);
    const filled = Math.round(statValue / 10);
    const bar = `${'\u2588'.repeat(filled)}${'\u2591'.repeat(Math.max(0, 10 - filled))}`;
    const content = `  ${statName.padEnd(10)} ${bar}${String(statValue).padStart(3)}`;
    lines.push(`\u2502${content.padEnd(width)}\u2502`);
  }

  lines.push(`\u2502${' '.repeat(width)}\u2502`);

  if (lastReaction) {
    lines.push(`\u2502${'  last said'.padEnd(width)}\u2502`);
    for (const line of wrap(`"${lastReaction}"`, width - 6)) {
      lines.push(`\u2502${`  ${line}`.padEnd(width)}\u2502`);
    }
    lines.push(`\u2502${' '.repeat(width)}\u2502`);
  }

  lines.push(`\u2570${'\u2500'.repeat(width)}\u256f`);
  return lines.join('\n');
}
