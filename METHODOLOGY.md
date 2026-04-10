# Methodology

This document explains how save-buddy reconstructs the Claude Code buddy feature. Every technical detail here is sourced from public community research (see [Sources](#sources)) and cross-referenced against the save-buddy implementation.

## Contents

- [Design goals](#design-goals)
- [System overview](#system-overview)
- [Seed and bone pipeline](#seed-and-bone-pipeline)
- [PRNG and hash functions](#prng-and-hash-functions)
- [Species, eyes, hats, stats](#species-eyes-hats-stats)
- [Rarity system](#rarity-system)
- [Stats generation](#stats-generation)
- [Hatching and personality](#hatching-and-personality)
- [Reaction API](#reaction-api)
- [Trigger logic](#trigger-logic)
- [Rendering pipeline](#rendering-pipeline)
- [Storage model](#storage-model)
- [Sources](#sources)

## Design goals

save-buddy is a faithful reconstruction, not a reinvention. The implementation is bound by three rules:

1. **Behavioral fidelity.** Given the same Claude Code account, save-buddy produces the same companion as the native feature. Same species, same eye, same hat, same stats, same name and personality. The implementation mirrors the exact constants, PRNG algorithm, and ordering documented in the public forensic reference so the output is bit-for-bit identical to the native generator.
2. **No feature creep.** save-buddy does not add commands, tools, customization options, or behaviors that the native buddy did not have. The goal is preservation, not expansion.
3. **Stable extension points only.** save-buddy uses documented Claude Code extension points (MCP servers, hooks, status line commands, skills). It does not patch the Claude Code binary, intercept internal APIs, or depend on undocumented behavior beyond what the native feature itself depended on.

## System overview

The native buddy architecture, as documented in community forensic analysis:

```
accountUuid + "friend-2026-401"
            |
            v
      FNV-1a hash (32-bit)
            |
            v
     mulberry32 PRNG seed
            |
            v
   bones = { rarity, species, eye, hat, shiny, stats }
            |
            v
   AI hatching call -> { name, personality }
            |
            v
   stored in .claude.json: { name, personality, hatchedAt }
            |
            v
   render: bones recomputed from seed, merged with stored soul
            |
            v
   buddy_react API -> speech bubble reactions
```

The key insight: the companion is almost entirely **derived**, not **stored**. Only three fields persist to disk (`name`, `personality`, `hatchedAt`). Everything else - species, eye character, hat, rarity, stats, shiny status - is recomputed from the account UUID on every render. This is what makes the companion "deterministic": the same account always produces the same creature.

save-buddy reimplements this pipeline in Node.js:

- `server/companion.js` contains the PRNG (`hashString`, `mulberry32`) and the bone generator (`roll`).
- `server/types.js` holds the constants (species list, eyes, hats, rarity weights, stat names).
- `server/index.js` is the MCP server that exposes the 5 buddy tools.
- `server/api.js` handles the `buddy_react` endpoint call.
- `hooks/` contains the three event hooks (Stop, UserPromptSubmit, SessionStart).
- `statusline/buddy-hud-wrapper.js` renders the sprite alongside any existing status line.

## Seed and bone pipeline

The seed is constructed by appending a magic suffix to the user's account UUID:

```
seed = accountUuid + "friend-2026-401"
```

The account UUID comes from `oauthAccount.accountUuid` in `.claude.json` (or falls back to `userID`, then `"anon"` if neither exists). The suffix `"friend-2026-401"` is a domain-separator constant that prevents the same UUID from producing collisions with other seeded systems.

The seed is hashed into a 32-bit integer (FNV-1a), which seeds a deterministic PRNG (mulberry32). The PRNG is then called in a fixed sequence to produce:

1. Rarity (weighted selection)
2. Species (uniform random from 18)
3. Eye character (uniform random from 6)
4. Hat (uniform random from 8, forced to "none" if rarity is common)
5. Shiny flag (1% chance)
6. Stats block (primary/secondary/others, scaled by rarity)
7. Inspiration seed (integer for name generation)

Because the PRNG is seeded deterministically and called in a fixed order, the same input always produces the same bones.

See: [`server/companion.js`](server/companion.js) `hashString()`, `mulberry32()`, `roll()`.

## PRNG and hash functions

### FNV-1a hash

The Fowler-Noll-Vo 1a variant, a standard non-cryptographic hash function designed for fast hashing of short strings.

```javascript
function hashString(value) {
  let hash = 2166136261;              // FNV offset basis (32-bit)
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619); // FNV prime
  }
  return hash >>> 0;                  // coerce to unsigned 32-bit
}
```

Constants:

| Constant | Value | Hex |
|---|---|---|
| FNV offset basis | 2166136261 | 0x811c9dc5 |
| FNV prime | 16777619 | 0x01000193 |

Note: `Math.imul` is used instead of `*` because JavaScript numbers lose precision above 2^53, and the FNV prime times a character code can exceed that. `Math.imul` performs integer multiplication modulo 2^32, which matches the native Claude Code implementation. save-buddy also includes a `Bun.hash` fast-path for environments where Bun is the runtime, matching the native binary's behavior when running under Bun.

### mulberry32 PRNG

A small, fast seeded PRNG by Tommy Ettinger. Produces a sequence of floats in `[0, 1)` from a 32-bit seed.

```javascript
function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let result = Math.imul(state ^ (state >>> 15), 1 | state);
    result = (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result;
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}
```

The state increment constant `0x6d2b79f5` is the mulberry32 signature. Given the same seed, the sequence is deterministic and identical across platforms.

## Species, eyes, hats, stats

These constants are the exact lists used by the native buddy, in the exact order that matters for PRNG index selection.

**Species (18)** - `SPECIES` in `types.js`:

```
duck, goose, blob, cat, dragon, octopus, owl, penguin,
turtle, snail, ghost, axolotl, capybara, cactus, robot,
rabbit, mushroom, chonk
```

**Eyes (6)** - `EYES` in `types.js`:

| Index | Character | Unicode |
|---|---|---|
| 0 | · | U+00B7 (middle dot) |
| 1 | ✦ | U+2726 (four-pointed star) |
| 2 | × | U+00D7 (multiplication sign) |
| 3 | ◉ | U+25C9 (fisheye) |
| 4 | @ | U+0040 (at sign) |
| 5 | ° | U+00B0 (degree sign) |

**Hats (8)** - `HATS` in `types.js`:

```
none, crown, tophat, propeller, halo, wizard, beanie, tinyduck
```

Common rarity companions always get `"none"`. All other rarities pick uniformly from all 8, so non-common companions have a 1-in-8 chance of also having no hat.

**Stats (5)** - `STAT_NAMES` in `types.js`:

```
DEBUGGING, PATIENCE, CHAOS, WISDOM, SNARK
```

## Rarity system

Rarities are selected by weighted random draw:

| Rarity | Weight | Probability | Star display |
|---|---|---|---|
| common | 60 | 60% | ★ |
| uncommon | 25 | 25% | ★★ |
| rare | 10 | 10% | ★★★ |
| epic | 4 | 4% | ★★★★ |
| legendary | 1 | 1% | ★★★★★ |

The selection algorithm sums the weights (100), draws a random value in that range, then subtracts each weight in order until the remainder goes negative:

```javascript
function rollRarity(rng) {
  let remaining = rng() * 100;
  for (const rarity of RARITIES) {
    remaining -= RARITY_WEIGHTS[rarity];
    if (remaining < 0) return rarity;
  }
  return 'common';
}
```

The iteration order matches `RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary']`, so the draw is effectively "what bucket does this value fall into". Changing the order would change the mapping and break determinism against the native implementation.

See: [`server/companion.js`](server/companion.js) `rollRarity()`.

## Stats generation

Each companion has five stats. The generator picks a primary stat (high) and a secondary stat (low), leaving three as moderate. Base values scale with rarity:

| Rarity | Base | Primary range | Secondary range | Others range |
|---|---|---|---|---|
| common | 5 | 55-84 | 1-9 | 5-44 |
| uncommon | 15 | 65-94 | 5-19 | 15-54 |
| rare | 25 | 75-100 | 15-29 | 25-64 |
| epic | 35 | 85-100 | 25-39 | 35-74 |
| legendary | 50 | 100 | 40-54 | 50-89 |

The primary stat is `base + 50 + rand(0..30)` capped at 100. The secondary stat is `base - 10 + rand(0..15)` floored at 1. Other stats are `base + rand(0..40)`. Because the primary and secondary are picked before the values are computed, the stats block has a characteristic "spiky" shape: one standout skill, one weakness, three middling abilities.

See: [`server/companion.js`](server/companion.js) `rollStats()`.

## Hatching and personality

Bones describe *what* the companion is. Name and personality - the soul - come from an AI call made the first time a user runs `/buddy`. The call is made to a dedicated API endpoint and returns structured JSON:

```json
{
  "name": "string (1-14 chars)",
  "personality": "string"
}
```

The native system prompt used for hatching (documented in the forensic reference) instructs the model to generate a one-word name (max 12 chars) and a one-sentence personality based on the rarity, species, stats, and four "inspiration words" drawn from a 143-word pool. Higher rarity means weirder personalities; a legendary companion is specifically instructed to be "genuinely strange".

The hatched name and personality are stored in `.claude.json` under the `companion` key. On subsequent runs, save-buddy reads this persisted soul and merges it with freshly-regenerated bones. This is why you can't change your companion's species by re-rolling - the species is always recomputed from the seed - but the name and personality stay stable once hatched.

save-buddy does not call the hatching API itself. If your companion was already hatched by the native feature before you installed save-buddy, the stored `{name, personality, hatchedAt}` in `.claude.json` is what save-buddy reads. If your companion was never hatched, save-buddy cannot hatch it (that flow requires the hatching endpoint, which is part of Claude Code itself, not an extension point). See [Requirements](README.md#requirements).

## Reaction API

The native buddy reaches out to an undocumented endpoint to generate reactions:

```
POST https://api.anthropic.com/api/organizations/{orgUuid}/claude_code/buddy_react
```

The request carries the companion's identity and a transcript excerpt:

```json
{
  "name": "string (max 32)",
  "personality": "string (max 200)",
  "species": "string",
  "rarity": "string",
  "stats": { "DEBUGGING": 0, "PATIENCE": 0, "CHAOS": 0, "WISDOM": 0, "SNARK": 0 },
  "transcript": "string (max 5000)",
  "reason": "turn|error|test-fail|large-diff|hatch|pet",
  "recent": ["string (max 200)", ...],
  "addressed": false
}
```

Authentication uses the user's existing Claude Code OAuth bearer token with the beta header `ccr-byoc-2025-07-29`. The response is structured as `{ reaction: "string" }` and is typically under 350 characters.

save-buddy reads the OAuth token from `.credentials.json` **on demand, per call**. Tokens are never cached by save-buddy, never logged, and never written to any save-buddy file. If the endpoint is unreachable or the token is expired, save-buddy falls back to local reaction templates (`server/reactions.js`) so the companion stays responsive.

The endpoint is undocumented by Anthropic and may be removed or changed at any time. save-buddy's graceful degradation is a deliberate design choice: the companion should keep working even if the API disappears entirely.

See: [`server/api.js`](server/api.js), [`server/reactions.js`](server/reactions.js).

## Trigger logic

Reactions fire in response to specific events:

| Reason | Trigger |
|---|---|
| `turn` | After any Claude response, respecting a 30-second cooldown |
| `error` | Tool output matches `error:`, `exception`, `traceback`, `panicked at`, `fatal:`, `exit code [1-9]` |
| `test-fail` | Tool output matches `N failed`, `FAIL`, `✗`, `✘` |
| `large-diff` | Diff output has more than 80 changed lines |
| `hatch` | Fired by the SessionStart hook when you start or resume a session (save-buddy reuses this reason because it does not implement the initial hatching flow itself) |
| `pet` | User runs `/buddy pet` |

The cooldown (30 seconds between `turn` reactions) prevents the companion from commenting constantly. Special events bypass the cooldown: a test failure, an error, a large diff, addressing the companion by name, or a manual `/buddy pet` always triggers immediately.

Addressing the companion by name is detected with a word-boundary regex against the companion's stored name. Saying "good job, Pith" triggers a reaction from Pith; saying "I'm going to pith the apples" does not (the `\b` boundary excludes "pith" as a substring of a longer word).

save-buddy implements these triggers in `hooks/buddy-stop.js` (event detection after each response) and `hooks/buddy-prompt.js` (addressed-by-name detection on prompt submit).

## Rendering pipeline

### Sprite art

Each species has three animation frames. Each frame is an array of 5 strings, each 12 characters wide. Placeholder `{E}` is replaced with the companion's eye character at render time. Frame 0 is idle, frame 1 is an alternate idle, frame 2 is a species-specific action or expression.

The idle animation sequence is a 15-position cycle:

```
[0, 0, 0, 0, 1, 0, 0, 0, -1, 0, 0, 2, 0, 0, 0]
```

Index `-1` is a blink: frame 0 rendered with the eye character replaced by `-`. Over a full cycle, the companion is idle most of the time, alternates briefly, blinks once, and performs its special action once.

### Hats

Hats replace the top row of the sprite when present. The top row of frames 0-2 is left empty by design so a hat can be slotted in without reflowing the art. Common rarity companions always have `hat: "none"`, and their sprites are shifted up by one row (removing the empty top) to take up less vertical space.

### Status line composition

The save-buddy status line wrapper composes with any existing status line. On each render:

1. Read Claude Code's JSON payload from stdin (contains `session_id` and session metadata).
2. Execute the previously-configured status line command as a subprocess and capture its stdout.
3. Detect the widest line of the HUD output (monotonically within the session, to prevent horizontal jitter).
4. Build the buddy block: optional speech bubble, sprite rows, name, rarity stars.
5. Compose each output row: HUD content, padding to the locked leftWidth, fixed gap, buddy content.
6. Prefix every line with `\x1b[0m` (SGR reset) to prevent Claude Code's per-line `.trim()` from stripping leading padding on rows that have no HUD content.
7. Suffix every line with `\x1b[K` (erase to end of line) to prevent stale characters from previous renders surviving to the right of shorter new renders.

The `\x1b[0m` prefix trick is necessary because Claude Code processes status line output with `stdout.trim().split("\n").flatMap((j) => j.trim() || []).join("\n")`, which individually trims each line. Without the escape prefix, buddy-only rows (below the HUD) would have their leading padding stripped and the sprite would appear cut in half - top half aligned with the HUD, bottom half flush against the left margin.

See: [`statusline/buddy-hud-wrapper.js`](statusline/buddy-hud-wrapper.js).

### Status line colors

Claude Code wraps all status line output in an Ink `<Text dimColor>` component, which applies an SGR dim attribute. The native buddy was rendered as a separate Ink component *outside* this wrapper, so its colors appeared at full brightness. save-buddy has to work *inside* the status line, so its colors are pre-brightened to compensate for the dim that will be applied.

See the brightened `RARITY_HEX` values in [`server/types.js`](server/types.js).

## Storage model

save-buddy does not maintain its own companion database. It reads everything it needs from Claude Code's existing `.claude.json`:

- `oauthAccount.accountUuid` - the seed source for bone generation
- `oauthAccount.organizationUuid` - required for the `buddy_react` API URL
- `companion.name` - the hatched name
- `companion.personality` - the hatched personality
- `companion.hatchedAt` - the hatch timestamp (used to pick a deterministic hatching animation)
- `companionMuted` - boolean flag respected by save-buddy's mute/unmute commands

save-buddy's own state lives in `~/.config/save-buddy/state/`:

- `state.json` - pet count, mute flag, recent reactions, last API call timestamp (for cooldown)
- `reaction.json` - current speech bubble content and timestamp (for 10-second display window)
- `addressed.flag` - marker written by the UserPromptSubmit hook, read by the Stop hook
- `hud-{session_id}.txt` - cached last-good HUD output per session (for resilience when the chained HUD command fails)
- `lw-{session_id}.txt` - persisted max HUD width per session (for buddy position stability)

The `previous-statusline.json` and `companion-backup.json` files in `~/.config/save-buddy/` are written by the installer for clean uninstall and companion recovery respectively.

No conversation data, transcripts, credentials, or tokens are ever written to save-buddy state files.

## Sources

The methodology above is reconstructed from publicly available community research. save-buddy does not use or reference any proprietary Claude Code source code.

- **[BonziClaude](https://github.com/zakarth/BonziClaude)** by [@zakarth](https://github.com/zakarth) - The [BUDDY_SYSTEM_FORENSICS.md](https://github.com/zakarth/BonziClaude/blob/master/BUDDY_SYSTEM_FORENSICS.md) document (1,616 lines) is the primary reference for this implementation. It documents the PRNG algorithm, seed construction, species and eye constants, hat system, rarity weights, stat generation formulas, complete ASCII art for all 18 species, hat art, animation sequences, the `buddy_react` API contract, reaction trigger logic, storage model, and OAuth flow. Every numerical constant, every ordering decision, and every behavioral detail in save-buddy can be traced back to this document.

- **[claude-buddy](https://github.com/1270011/claude-buddy)** by [@1270011](https://github.com/1270011) - A community preservation project that demonstrated the viability of reimplementing the buddy through Claude Code's MCP, hook, and status line extension points. save-buddy's overall architectural approach - MCP server for tools and system prompt injection, hooks for event detection, status line wrapper for rendering - follows the path this project pioneered.

- **Community research on r/Anthropic** - Discussion threads that identified the `buddy_react` endpoint runs Claude 3.5 Sonnet (not Haiku, as initially assumed), which explains why reactions feel substantially smarter than a typical "NPC line" generator. The endpoint provides free Sonnet-class inference per reaction call, capped at a small `max_tokens` budget.

- **Claude Code official documentation** - For the MCP server protocol, hook event shapes, status line command contract, settings.json schema, and skill definition format. These are the stable extension points save-buddy builds on.

If you want to audit save-buddy's fidelity to the native buddy, read the BonziClaude forensics document alongside `server/companion.js`, `server/types.js`, and `server/sprites.js`. Every non-trivial line in those files corresponds to a specific section of the forensic reference.
