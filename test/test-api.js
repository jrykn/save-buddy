// 2026-04-09: Initial API smoke test with graceful fallback to local reactions.
// test-api.js - Probe buddy_react and confirm fallback behavior when the endpoint is unavailable.

import { callBuddyReact } from '../server/api.js';
import { getCompanion } from '../server/companion.js';
import { localReaction } from '../server/reactions.js';

const companion = getCompanion();
if (!companion) {
  console.error('No companion found. Cannot test API without companion data.');
  process.exit(1);
}

console.log('Testing buddy_react API...');
const reaction = await callBuddyReact(
  companion,
  'user: how do I fix this null pointer?\nclaude: Check if the variable is initialized.',
  'turn',
  [],
  false,
);

if (reaction) {
  console.log('API reaction:', reaction);
} else {
  console.log('API returned null (cooldown, auth, or endpoint issue)');
  console.log('Testing local fallback...');
  console.log('Fallback reaction:', localReaction(companion, 'turn', 42));
}

console.log('\nTesting pet reaction...');
const petReaction = await callBuddyReact(companion, '(you were just petted)', 'pet', [], false);
console.log('Pet reaction:', petReaction || localReaction(companion, 'pet', Date.now()));
