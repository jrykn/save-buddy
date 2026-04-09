#!/usr/bin/env node
// 2026-04-09: Rewritten with real assertions (test review findings F3, F20, F23, F24).
// test-sprites.js - Verify sprite rendering, bubbles, faces, and card output.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderSprite, renderBlink, renderBubble, renderFace, spriteFrameCount } from '../server/sprites.js';
import { renderCompanionCard } from '../server/card.js';
import { SPECIES, STAT_NAMES } from '../server/types.js';

// --- Sprite rendering for all 18 species ---

describe('renderSprite', () => {
  for (const species of SPECIES) {
    it(`renders ${species} frame 0 with at least 4 lines`, () => {
      const lines = renderSprite({ species, eye: '@', hat: 'none' }, 0);
      assert(lines.length >= 4, `${species} frame 0 has ${lines.length} lines, expected >= 4`);
    });

    it(`replaces {E} placeholder in ${species}`, () => {
      const lines = renderSprite({ species, eye: '*', hat: 'none' }, 0);
      const joined = lines.join('\n');
      assert(!joined.includes('{E}'), `${species} should not contain unreplaced {E} placeholder`);
      assert(joined.includes('*'), `${species} should contain the custom eye character '*'`);
    });

    for (let frame = 0; frame < 3; frame++) {
      it(`renders ${species} frame ${frame} without throwing`, () => {
        const lines = renderSprite({ species, eye: '@', hat: 'none' }, frame);
        assert(Array.isArray(lines));
        assert(lines.length >= 4);
      });
    }
  }

  it('renders hat on non-common companion', () => {
    const lines = renderSprite({ species: 'duck', eye: '@', hat: 'crown' }, 0);
    const hasHat = lines.some((l) => l.includes('^^^'));
    assert(hasHat, 'crown hat should appear in sprite output');
  });

  it('does not render hat for hat="none"', () => {
    const lines = renderSprite({ species: 'duck', eye: '@', hat: 'none' }, 0);
    const hasHat = lines.some((l) => l.includes('^^^') || l.includes('[___]'));
    assert(!hasHat, 'no hat should appear for hat="none"');
  });

  it('handles negative frame index (blink)', () => {
    // Negative modulo should still produce valid output
    const lines = renderSprite({ species: 'duck', eye: '@', hat: 'none' }, -1);
    assert(Array.isArray(lines));
    assert(lines.length >= 4);
  });
});

describe('renderBlink', () => {
  it('replaces eye character with dash', () => {
    const lines = renderBlink({ species: 'duck', eye: '@', hat: 'none' });
    const joined = lines.join('\n');
    assert(!joined.includes('@'), 'blink should replace eye character');
    assert(joined.includes('-'), 'blink should contain dash');
  });

  it('works for all species', () => {
    for (const species of SPECIES) {
      const lines = renderBlink({ species, eye: '@', hat: 'none' });
      assert(Array.isArray(lines));
      assert(lines.length >= 4, `${species} blink has ${lines.length} lines`);
    }
  });
});

describe('renderFace', () => {
  it('returns a string for all species', () => {
    for (const species of SPECIES) {
      const face = renderFace({ species, eye: '@' });
      assert.equal(typeof face, 'string');
      assert(face.length > 0, `${species} face should be non-empty`);
    }
  });

  it('contains the eye character', () => {
    const face = renderFace({ species: 'penguin', eye: '*' });
    assert(face.includes('*'), 'face should contain the eye character');
  });
});

describe('renderBubble', () => {
  it('wraps text in box-drawing characters', () => {
    const lines = renderBubble('hello world');
    assert(lines.length >= 3, 'bubble should have at least 3 lines (top, content, bottom)');
    assert(lines[0].includes('\u256d'), 'first line should have top-left corner');
    assert(lines[lines.length - 1].includes('\u2570'), 'last line should have bottom-left corner');
  });

  it('returns empty array for empty text', () => {
    assert.deepEqual(renderBubble(''), []);
    assert.deepEqual(renderBubble(null), []);
    assert.deepEqual(renderBubble(undefined), []);
  });

  it('wraps long text across multiple lines', () => {
    const lines = renderBubble('this is a very long text that should wrap across multiple lines in the bubble');
    // Top border + content lines + bottom border
    assert(lines.length >= 4, 'long text should produce multiple content lines');
  });

  it('all lines have consistent visual width', () => {
    const lines = renderBubble('hello world');
    // All content lines should be the same length
    const lengths = lines.map((l) => l.length);
    const expected = lengths[0]; // Border line width
    for (let i = 0; i < lengths.length; i++) {
      assert.equal(lengths[i], expected, `line ${i} width ${lengths[i]} != expected ${expected}`);
    }
  });
});

describe('spriteFrameCount', () => {
  it('returns 3 for all species', () => {
    for (const species of SPECIES) {
      assert.equal(spriteFrameCount(species), 3, `${species} should have 3 frames`);
    }
  });
});

// --- Companion card ---

describe('renderCompanionCard', () => {
  const companion = {
    species: 'penguin',
    eye: '@',
    hat: 'none',
    rarity: 'common',
    shiny: false,
    stats: { DEBUGGING: 50, PATIENCE: 50, CHAOS: 50, WISDOM: 50, SNARK: 50 },
    name: 'TestBuddy',
    personality: 'A cheerful penguin who watches the code with quiet determination.',
  };

  it('contains all required sections', () => {
    const card = renderCompanionCard(companion, 'seen worse');
    assert(card.includes('COMMON'), 'card should show rarity');
    assert(card.includes('PENGUIN'), 'card should show species');
    assert(card.includes('TestBuddy'), 'card should show name');
    assert(card.includes('cheerful'), 'card should show personality');
    assert(card.includes('seen worse'), 'card should show last reaction');
  });

  it('shows all 5 stats', () => {
    const card = renderCompanionCard(companion, null);
    for (const stat of STAT_NAMES) {
      assert(card.includes(stat), `card should contain stat ${stat}`);
    }
  });

  it('omits last reaction section when null', () => {
    const card = renderCompanionCard(companion, null);
    assert(!card.includes('last said'), 'card should not show "last said" when reaction is null');
  });

  it('uses box-drawing characters', () => {
    const card = renderCompanionCard(companion, null);
    assert(card.includes('\u256d'), 'card should have top-left corner');
    assert(card.includes('\u256f'), 'card should have bottom-right corner');
  });
});
