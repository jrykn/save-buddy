#!/usr/bin/env node
// 2026-04-09: New test file for shared utilities (test review finding F13).
// test-util.js - Verify stripAnsi, wrap, truncateAnsi, and localReaction.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { stripAnsi, wrap, truncateAnsi } from '../server/util.js';
import { localReaction } from '../server/reactions.js';

describe('stripAnsi', () => {
  it('returns plain text unchanged', () => {
    assert.equal(stripAnsi('hello world'), 'hello world');
  });

  it('strips SGR sequences (color codes)', () => {
    assert.equal(stripAnsi('\u001b[31mred text\u001b[0m'), 'red text');
  });

  it('strips 256-color sequences', () => {
    assert.equal(stripAnsi('\u001b[38;5;220myellow\u001b[0m'), 'yellow');
  });

  it('strips 24-bit truecolor sequences', () => {
    assert.equal(stripAnsi('\u001b[38;2;255;0;0mred\u001b[0m'), 'red');
  });

  it('strips bold and italic', () => {
    assert.equal(stripAnsi('\u001b[1mbold\u001b[22m \u001b[3mitalic\u001b[23m'), 'bold italic');
  });

  it('handles empty string', () => {
    assert.equal(stripAnsi(''), '');
  });

  it('coerces non-string input', () => {
    assert.equal(stripAnsi(null), 'null');
    assert.equal(stripAnsi(undefined), 'undefined');
    assert.equal(stripAnsi(42), '42');
  });
});

describe('wrap', () => {
  it('does not wrap short text', () => {
    assert.deepEqual(wrap('hello', 20), ['hello']);
  });

  it('wraps text at word boundaries', () => {
    const result = wrap('one two three four five', 10);
    assert(result.length > 1, 'should wrap into multiple lines');
    for (const line of result) {
      assert(line.length <= 10, `line "${line}" exceeds width 10`);
    }
  });

  it('handles newlines in input', () => {
    const result = wrap('line one\nline two', 40);
    assert.equal(result.length, 2);
    assert.equal(result[0], 'line one');
    assert.equal(result[1], 'line two');
  });

  it('handles empty string', () => {
    const result = wrap('', 20);
    assert.deepEqual(result, ['']);
  });

  it('handles null input', () => {
    const result = wrap(null, 20);
    assert(Array.isArray(result));
  });

  it('preserves single long word', () => {
    const result = wrap('superlongword', 5);
    // A single word longer than width should not be split (current behavior)
    assert.equal(result.length, 1);
    assert.equal(result[0], 'superlongword');
  });
});

describe('truncateAnsi', () => {
  it('truncates plain text to width', () => {
    assert.equal(truncateAnsi('hello world', 5), 'hello');
  });

  it('preserves ANSI codes without counting them', () => {
    const input = '\u001b[31mred\u001b[0m';
    const result = truncateAnsi(input, 3);
    // Should include the full "red" text plus its ANSI codes
    assert(result.includes('red'));
  });

  it('returns empty string for width 0', () => {
    assert.equal(truncateAnsi('hello', 0), '');
  });

  it('handles empty input', () => {
    assert.equal(truncateAnsi('', 10), '');
    assert.equal(truncateAnsi(null, 10), '');
  });
});

describe('localReaction', () => {
  const companion = {
    personality: 'A test companion.',
    species: 'duck',
    name: 'TestBuddy',
  };

  it('returns a string for each event type', () => {
    for (const event of ['error', 'test-fail', 'test-pass', 'large-diff', 'pet', 'hatch', 'turn', 'addressed']) {
      const result = localReaction(companion, event, 42);
      assert.equal(typeof result, 'string', `event "${event}" should return a string`);
      assert(result.length > 0, `event "${event}" should return non-empty string`);
    }
  });

  it('is deterministic for the same inputs', () => {
    const r1 = localReaction(companion, 'turn', 12345);
    const r2 = localReaction(companion, 'turn', 12345);
    assert.equal(r1, r2, 'same inputs should produce same reaction');
  });

  it('falls back to turn templates for unknown event type', () => {
    const result = localReaction(companion, 'unknown-event', 42);
    assert.equal(typeof result, 'string');
    assert(result.length > 0);
  });
});
