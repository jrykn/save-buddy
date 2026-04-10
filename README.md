# save-buddy

Preserve your Claude Code buddy companion after the feature is removed.

save-buddy captures everything about the buddy system - the deterministic companion generation, the ASCII art, the reaction API, the speech bubbles - and reimplements it using Claude Code's stable extension points: MCP servers, hooks, and the status line. Your companion keeps living in your terminal exactly as before.

```
  .---.
  (@>@)       "seen worse"
 /(   )\
  `---'
```

## Quick install

```bash
npx save-buddy
```

Restart Claude Code. Type `/buddy` to see your companion.

### Update

```bash
npx save-buddy update
```

### Uninstall

```bash
npx save-buddy uninstall
```

Uninstall surgically removes only save-buddy's entries from your settings. Your previous status line is restored, other hooks and MCP servers are untouched, and your companion data is preserved.

### Manual install

```bash
git clone https://github.com/jrykn/save-buddy ~/.save-buddy && cd ~/.save-buddy && npm i && node install.js
```

### What the installer does

1. Registers the MCP server in your Claude Code config
2. Adds Stop, UserPromptSubmit, and SessionStart hooks
3. Wraps your existing status line (preserving it) with the buddy renderer
4. Sets a 1-second refresh interval for buddy animation
5. Adds MCP tool permissions so companion interactions don't require approval
6. Backs up your companion data and current settings before making changes
7. Copies the `/buddy` skill for command routing

### Dry run

Preview what the installer would do without writing any files:

```bash
cd ~/.save-buddy && node install.js --dry-run
```

## Commands

| Command | What it does |
|---------|-------------|
| `/buddy` | Show your companion card with ASCII art, stats, and personality |
| `/buddy pet` | Pet your companion (increments counter, triggers reaction) |
| `/buddy stats` | Show runtime stats (pet count, recent reactions, mute state) |
| `/buddy mute` | Suppress reactions and status line rendering |
| `/buddy unmute` | Re-enable reactions |
| `/buddy react` | Manually trigger a reaction with current conversation context |

## How it works

Claude Code assigns every user a deterministic companion based on their account UUID. The species, eyes, hat, rarity, and stats are generated from an FNV-1a hash fed into a Mulberry32 PRNG - the same companion every time, without storing the result. Only the name and personality (generated during hatching) are persisted.

save-buddy reimplements this pipeline and wires it into Claude Code through:

- **MCP server** (stdio) - 5 tools for showing, petting, reacting, muting, and stats
- **System prompt injection** - companion awareness via the MCP `instructions` field
- **Stop hook** - detects coding events (test failures, errors, large diffs) and triggers reactions
- **UserPromptSubmit hook** - detects when you address your companion by name
- **SessionStart hook** - fires a greeting when you start or resume a session
- **Status line wrapper** - renders the sprite and speech bubble alongside your existing status line

Reactions come from the same `buddy_react` API endpoint that the native feature uses. This endpoint is not publicly documented by Anthropic and may be removed at any time. When the API is unavailable, local fallback templates keep your companion responsive.

## How reactions work

1. The Stop hook fires after every Claude response
2. It reads the last 12 lines of the conversation transcript
3. It detects event types: test failures, errors, large diffs, or a normal turn
4. A local fallback reaction is written immediately (no latency)
5. A detached worker process calls the `buddy_react` API asynchronously
6. If the API returns a reaction, it upgrades the fallback in the status line
7. The speech bubble displays for 10 seconds, dimming in the last 3

The API has a 30-second cooldown between calls. Addressing your companion by name or triggering a special event (test failure, error) bypasses the cooldown.

## Companion identity

Your companion's identity is fully deterministic:

| Trait | Source |
|-------|--------|
| Species (18 options) | PRNG from account UUID |
| Eye character (6 options) | PRNG from account UUID |
| Hat (8 options, common = none) | PRNG from account UUID |
| Rarity (common through legendary) | Weighted PRNG roll |
| Stats (5 attributes, 1-100) | PRNG with rarity floor |
| Shiny (1% chance) | PRNG roll |
| Name | AI-generated during hatching (stored) |
| Personality | AI-generated during hatching (stored) |

Bones are recomputed from the seed every time. Only the name and personality are persisted in `.claude.json`.

## Requirements

- Node.js 20 or later
- An active Claude Code installation with a hatched companion
- OAuth credentials (managed by Claude Code, no manual setup needed)

If you haven't hatched a buddy yet and the feature has already been removed from your Claude Code version, check if you have a backup of your `.claude.json` that includes a `companion` entry.

## Project structure

```
save-buddy/
  cli.js              npx entry point (bootstraps install to ~/.save-buddy)
  install.js          Wires MCP, hooks, status line, permissions, and skill
  uninstall.js        Clean removal (restores previous settings)
  server/
    index.js          MCP server (5 tools + system prompt injection)
    companion.js      PRNG engine (FNV-1a + Mulberry32) and config reader
    api.js            buddy_react API client with beta header fallback
    sprites.js        18 species, 3 frames each, hats, blink, speech bubbles
    card.js           Pre-rendered ASCII companion card
    reactions.js      Local fallback reaction templates
    state.js          Shared state read/write operations
    types.js          Constants (species, eyes, hats, rarities, stats, colors)
    ansi.js           Terminal color detection and ANSI styling
    util.js           Atomic writes, ANSI stripping, word wrap, tail reads
    paths.js          Config path auto-detection
  hooks/
    buddy-stop.js     Post-response event detection and reaction trigger
    buddy-prompt.js   Addressed-by-name detection
    buddy-session.js  Hatch greeting on session start/resume
    buddy-react-worker.js  Detached async API caller
  statusline/
    buddy-hud-wrapper.js   Sprite + bubble alongside your existing status line
  skill/
    SKILL.md          Routes /buddy commands to MCP tools
  test/
    test-prng.js      FNV-1a, Mulberry32, and bone generation verification
    test-sprites.js   All 18 species, frames, bubbles, cards
    test-util.js      Utilities, ANSI handling, reactions
    test-api.js       API client smoke test (requires live credentials)
```

## Testing

```bash
npm test                  # 140 tests across 14 suites
npm run test:prng         # PRNG algorithm verification
npm run test:sprites      # Sprite rendering for all 18 species
npm run test:util         # Utilities, ANSI, reactions
npm run test:api          # API smoke test (needs live credentials)
```

The PRNG test verifies your companion regenerates identically to the one stored in your Claude Code config. If you see your companion's correct name, species, and stats, the engine is working.

## Safety

- OAuth tokens are read on demand from Claude Code's credential store and never cached, logged, or written to save-buddy files
- Error messages report HTTP status codes, not token values
- Hooks write a local reaction immediately and spawn a detached worker for the API call - they never block the UI
- The status line wrapper uses `execFileSync` (no shell interpretation) to chain with previous status lines
- The uninstaller restores your previous configuration rather than deleting unrelated settings
- All file writes use atomic write-to-temp-then-rename to prevent corruption from concurrent readers
- Worker processes receive a minimal environment (HOME, PATH only)
- The Stop hook sends up to 5,000 characters of recent conversation to Anthropic's `buddy_react` API endpoint (the same one the native buddy used). This data goes to the same company that already has your full conversation. No conversation data is sent to any third party. When the API is unavailable, local fallback templates are used instead

## Attribution

The companion system implementation is based on publicly available community research:

- **[BonziClaude](https://github.com/zakarth/BonziClaude)** by [@zakarth](https://github.com/zakarth) - Comprehensive forensic analysis of the buddy system including the PRNG algorithm, species constants, ASCII art frames, hat system, rarity mechanics, stat generation, API contracts, and animation timing. The primary reference for this implementation.

- **[claude-buddy](https://github.com/1270011/claude-buddy)** by [@1270011](https://github.com/1270011) - Community MCP-based preservation approach that demonstrated the viability of reimplementing buddy through Claude Code's extension points.

- **[Community research](https://www.reddit.com/r/Anthropic/comments/1scx830/)** on r/Anthropic that identified the `buddy_react` endpoint runs Claude 3.5 Sonnet, making reactions higher quality than initially assumed.

## License

MIT. See [LICENSE](LICENSE).
