# save-buddy

Preserve your Claude Code buddy companion after the feature is removed.

save-buddy captures everything about the buddy system - the deterministic companion generation, the ASCII art, the reaction API, the speech bubbles - and reimplements it using Claude Code's stable extension points: MCP servers, hooks, and the status line. Your companion keeps living in your terminal exactly as before.

```
  .---.
  (@>@)       "seen worse"
 /(   )\
  `---'
```

> [!IMPORTANT]
> **Reaction API status (~April 10, 2026): the `buddy_react` endpoint has been taken down by Anthropic.**
>
> The endpoint still accepts requests and returns HTTP 200, but every response body is now `{"reaction":""}` - an empty string, with server-side response times of roughly 86ms confirming that no model inference is occurring. The `/buddy` command has also been removed from Claude Code itself in recent versions. This was independently observed by the [BonziClaude](https://github.com/zakarth/BonziClaude) project, which reverse-engineered the same endpoint. save-buddy detects the empty response and **currently falls back to local deterministic reaction templates** (see [`server/reactions.js`](server/reactions.js)), so your companion keeps showing up, petting still works, the sprite still animates, and the speech bubble still appears. The bubble contents just come from a small template bank instead of live Claude inference.
>
> **Planned workaround: route reactions through Claude Haiku 4.5 on your existing Claude Code plan.** The plan is to reuse the same OAuth token Claude Code already manages and send reactions to Haiku 4.5 as a normal authenticated Claude request, so reactions come out of **your existing Claude subscription (Pro, Max, Team, or Enterprise)** rather than a separate pay-as-you-go API key. No new billing setup, no second account, no credit card. Haiku 4.5 generally outperforms the Claude 3.5 Sonnet that the original endpoint used, and each reaction is small (~2,000 input tokens and ~100 output tokens per call with the 30-second cooldown and event-gated triggers bounding volume), so the quota impact is a negligible slice of a typical plan. At Haiku 4.5 list pricing ($1/MTok input, $5/MTok output) the *monetary equivalent* works out to roughly **$0.0025 per reaction** - about **$1-2/month for typical use** (20-40 reactions/day), so you can sanity-check that it won't meaningfully dent any current Claude plan. This fallback is planned but **not implemented yet** and has **no specific timeline**; contributions are welcome. See the [FAQ on reaction cost](#will-this-cost-me-anything-in-tokens-or-money) for the full breakdown.

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

## Philosophy

save-buddy is a faithful reconstruction, not a reinvention. The goal is preservation.

- **Behavioral fidelity**: Given the same Claude Code account, save-buddy produces the same companion as the native feature. Same species, same eye, same hat, same stats, same name and personality. The implementation mirrors the exact constants, PRNG algorithm, and ordering documented in the public forensic reference so the output is bit-for-bit identical.
- **No feature creep**: save-buddy does not add commands, customization options, or behaviors that the native buddy did not have. If it was not in the original, it is not here.
- **Stable extension points only**: MCP servers, hooks, status line commands, and skills are the Claude Code extension contracts. save-buddy uses only these. It does not patch the Claude Code binary or depend on undocumented internals beyond what the native feature itself depended on.

## How it works

Claude Code assigns every user a deterministic companion based on their account UUID. The species, eyes, hat, rarity, and stats are generated by feeding `accountUuid + "friend-2026-401"` through an FNV-1a hash into a mulberry32 PRNG, then drawing from fixed constant lists in a fixed order. The result is the same companion every time, without storing the result anywhere. Only the AI-generated name and personality (created during hatching) are persisted.

save-buddy reimplements this pipeline and wires it into Claude Code through:

- **MCP server** (stdio) - 5 tools for showing, petting, reacting, muting, and stats
- **System prompt injection** - companion awareness via the MCP `instructions` field
- **Stop hook** - detects coding events (test failures, errors, large diffs) and triggers reactions
- **UserPromptSubmit hook** - detects when you address your companion by name
- **SessionStart hook** - fires a greeting when you start or resume a session
- **Status line wrapper** - renders the sprite and speech bubble alongside your existing status line

Reactions were originally generated by the same `buddy_react` API endpoint that the native feature used. **As of April 2026 that endpoint has been shut down** - it now returns an empty string for every request (see the status note at the top of this README). save-buddy still makes the call so that a future re-enable is picked up automatically, but the empty response falls through to the local deterministic template bank in `server/reactions.js`, which is what you're currently seeing in the speech bubble. A live-model fallback via Claude Haiku 4.5 is planned.

For the complete technical breakdown - PRNG algorithm, seed construction, species constants, rarity weights, stats generation formulas, API contract, trigger logic, rendering pipeline, and storage model - see **[METHODOLOGY.md](METHODOLOGY.md)**.

## How reactions work

1. The Stop hook fires after every Claude response
2. It reads the last 12 lines of the conversation transcript
3. It detects event types: test failures, errors, large diffs, or a normal turn
4. A local fallback reaction is written immediately (no latency)
5. A detached worker process calls the `buddy_react` API asynchronously
6. If the API returns a non-empty reaction, it upgrades the fallback in the status line (as of April 2026 the endpoint returns an empty string, so the local fallback stays in place - see the status note at the top of this README)
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

## Frequently asked questions

### Will this cost me anything in tokens or money?

**Right now, nothing.** The `buddy_react` endpoint that save-buddy calls has been shut down by Anthropic as of April 2026 and returns an empty string, so save-buddy is falling back to local deterministic reaction templates. No tokens are consumed, no API is charged, no usage quota is touched. The planned future fallback routes reactions through Claude Haiku 4.5 **on your existing Claude subscription (Pro, Max, Team, or Enterprise) via OAuth** - not a separate pay-as-you-go API key - so there is no new bill to set up and no additional charge beyond your current Claude plan.

<details>
<summary><b>More detail, cost breakdown, and the planned Haiku 4.5 fallback</b></summary>

**Current state (April 2026).** save-buddy calls `buddy_react` exactly as the native buddy did, with the same payload shape and the same OAuth-authenticated flow. The endpoint still accepts requests and still returns HTTP 200, but every response is `{"reaction":""}` - an empty string with no model inference happening server-side. Community research and server-side response times confirm the endpoint has been turned off rather than rate-limited. save-buddy detects the empty reaction and falls through to the local deterministic template bank in [`server/reactions.js`](server/reactions.js), so your companion keeps responding with no cost and no network round-trip to a model.

**Planned Haiku 4.5 fallback, on your existing Claude plan.** The plan is to reuse the same OAuth token Claude Code already manages and route reactions to Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) as a normal authenticated Claude request. This means:

- **No separate API key.** You do not need to create or pay for a pay-as-you-go API account. save-buddy uses the Claude Code OAuth session you already have.
- **No separate bill.** Reactions come out of the usage quota that ships with your current Claude subscription (Pro, Max, Team, Enterprise, or whatever you are on), the same way Claude Code's own chat consumption does.
- **No setup.** If Claude Code is already working on your machine, the fallback will just work - the OAuth credentials, the Anthropic endpoint, and the user agent are all things save-buddy already knows how to handle.

Haiku 4.5 generally outperforms the Claude 3.5 Sonnet the original endpoint used, and is the cheapest first-party model in the Claude family, so the impact on your plan's usage quota is a small slice rather than a meaningful dent.

**Quota sanity check (converted to list-price dollars).** Your plan is not billed per token, but it can help to convert usage to dollar-equivalent to check it will not eat your quota. Haiku 4.5 list pricing is $1 per million input tokens and $5 per million output tokens. A reaction call sends:

- System prompt (~300 tokens)
- Companion identity block (~100 tokens)
- Transcript excerpt capped at 5,000 characters (~1,250 tokens)
- Recent reactions window (~50 tokens)

That's roughly **2,000 input tokens per call**, with output capped at ~100 tokens (reactions are typically under 350 characters).

| Daily volume | Dollar-equivalent/month | Notes |
|---|---|---|
| 20 reactions/day | ~$1.50 | Typical light use |
| 40 reactions/day | ~$3.00 | Typical moderate use |
| 100 reactions/day | ~$7.50 | Heavy use, many errors/test-fails |

Those numbers are the pay-as-you-go price you would *not* be charged, because reactions will be drawn from your OAuth-authenticated Claude plan instead of a metered API key. The 30-second cooldown between `turn` reactions and the event-gated triggers (test failures, errors, large diffs, addressed-by-name) keep volume naturally bounded, so the actual quota impact for a typical user is tiny.

**When will this ship?** No specific timeline. The fallback is planned and welcomed as a pull request. The reason it is not already implemented is that save-buddy's first priority has been faithfulness to the original experience, including the speech bubble flow and trigger cadence, and the local template bank is good enough to preserve the feeling of the companion while the endpoint is down. If you want to help ship it, the design is in [`server/api.js`](server/api.js) and the sketch lives in the status note at the top of this README.

</details>

### Which operating systems are supported?

**Windows, macOS, and Linux.** save-buddy is a Node.js application that requires Node.js 20 or later. Nothing is hard-coded to a specific platform.

<details>
<summary><b>More detail and compatibility matrix</b></summary>

All paths are resolved with `path.join()` and `process.env.HOME || process.env.USERPROFILE`, which works on every supported OS without any branching.

| Platform | Status | Notes |
|---|---|---|
| Linux (x64, arm64) | Supported | Any distro with Node.js 20+ |
| macOS (Intel, Apple Silicon) | Supported | Any recent macOS |
| Windows 10/11 | Supported | Works in PowerShell, cmd, Git Bash, and WSL |
| Windows Subsystem for Linux | Supported | Treated as Linux |
| Docker containers | Supported | Mount your `~/.claude.json` or `~/.claude` directory into the container |

The only platform-specific dependency is `git`, which the `npx save-buddy` bootstrapper uses to clone the repository to `~/.save-buddy`. Git is virtually always present on developer machines; if it is not, the manual install instructions use the same clone command.

</details>

### Does the shell I use matter?

**No.** save-buddy runs in any terminal emulator and any shell Claude Code itself runs in. All scripts are Node.js, invoked directly via `node`.

<details>
<summary><b>More detail</b></summary>

The installer, hooks, and status line wrapper are all Node.js scripts invoked via `node` (or the `node` binary found through `process.execPath`). They work identically in PowerShell, cmd, Git Bash, zsh, bash, fish, Nushell, Windows Terminal, iTerm2, GNOME Terminal, Alacritty, Kitty, WezTerm, and any other terminal emulator you might use.

If your existing status line command is a shell script (for example, `bash ~/.claude/statusline.sh`), save-buddy preserves and chains it transparently. The wrapper executes the previous command via `execFileSync` with explicit argument arrays, so no shell interpretation happens on the save-buddy side.

</details>

### Can I hatch a new companion if I never had one before?

**Not directly, yet.** save-buddy does not currently replicate the native hatching flow. Four workarounds exist, from most faithful to least.

<details>
<summary><b>Workarounds and design for a proper hatching tool</b></summary>

The native buddy's hatching flow makes a structured-output call to the Claude API with a specific system prompt, asks the model to generate a name and personality, and writes the result to `.claude.json`. save-buddy focuses on preserving the experience for users who already hatched a companion, which is why hatching is not a first-class feature yet.

**Workaround 1 (most faithful): Roll back Claude Code, hatch natively, roll forward, install save-buddy.** If you still have access to an older Claude Code version that includes the buddy feature (v2.1.94 or earlier), you can use Anthropic's own hatching flow and then upgrade.

```bash
# 1. Install the old version with buddy still enabled
npm install -g @anthropic-ai/claude-code@2.1.94

# 2. Launch Claude Code and run /buddy to trigger the hatching animation
#    You will see the egg-cracking sequence and get a name and personality
#    generated by the native flow.
claude

# 3. Once hatched, your companion is persisted in ~/.claude.json under
#    the "companion" key. Verify it exists:
cat ~/.claude.json | grep -A3 companion      # macOS/Linux
type %USERPROFILE%\.claude.json | findstr companion  # Windows cmd

# 4. Upgrade Claude Code back to the latest version
npm install -g @anthropic-ai/claude-code@latest

# 5. Install save-buddy, which will read your now-hatched companion
npx save-buddy
```

Your companion's bones (species, eye, hat, rarity, stats) are derived from your `accountUuid`, so they will be the same across Claude Code versions. The name and personality from the native hatching will be preserved in `.claude.json` and save-buddy will pick them up automatically. This is the closest you can get to the original experience.

**Workaround 2: Manually author a companion entry.** Add a `companion` object to your `~/.claude.json`:

```json
{
  "companion": {
    "name": "Pith",
    "personality": "A curious penguin who insists on reading every stack trace twice.",
    "hatchedAt": 1712188800000
  }
}
```

save-buddy reads this object on next render, regenerates the bones from your `accountUuid`, and displays your new companion. The species, eye, hat, rarity, and stats are determined by your account - you cannot change those without changing your account, but the name and personality are whatever you write.

**Workaround 3: Ask Claude to generate one.** In your Claude Code session, run `/buddy` (which will show a prompt indicating no companion exists), then ask Claude directly: "Generate a name and one-sentence personality for a common penguin companion with high DEBUGGING and low PATIENCE, then save it to my `.claude.json`." Claude can combine the save-buddy MCP tools with its Edit tool to construct the entry. The output matches the native hatching tone because it is generated by Claude.

**Workaround 4 (future): a `buddy_hatch` MCP tool.** A first-class implementation would add a new MCP tool that reads the user's bones, makes a Claude API call using the user's OAuth token with a system prompt mirroring the native `fD1` prompt from the forensic reference, parses the structured `{name, personality}` response, writes it atomically to `.claude.json`, and returns the new companion card. The addition is roughly 100 lines and is welcome as a pull request. The reason it is not already built is that the native hatching was tied to a specific UI animation (egg-cracking, loading words) that cannot be reproduced from outside Claude Code, so save-buddy intentionally focused on the static companion experience first.

</details>

### Does this work with Claude Code running against a Codex (OpenAI) backend?

**Yes, unchanged.** save-buddy hooks into Claude Code's extension points, not into whichever model Claude Code is using for chat. Your `accountUuid`, OAuth credentials, and the `buddy_react` endpoint are all independent of the chat backend.

<details>
<summary><b>More detail</b></summary>

In setups where Claude Code is configured to route to an OpenAI model through a local proxy gateway (such as CLIProxyAPI with device auth), save-buddy continues to work without modification. When you run `/buddy` or trigger a reaction, save-buddy reads the companion from `.claude.json`, regenerates the bones, and optionally calls `api.anthropic.com/.../buddy_react` with your existing Claude OAuth token. None of that touches the Codex/OpenAI path. You still need a valid Claude account for the reaction endpoint to work, but you do not need to be using Claude for chat completions.

</details>

### Does this work with OpenAI Codex (the standalone CLI) or other coding assistants?

**Not out of the box.** OpenAI Codex and other coding assistants have their own config formats and authentication. save-buddy assumes Claude Code's `.claude.json` exists. Porting it is possible but is a meaningful fork.

<details>
<summary><b>Design sketch for a port</b></summary>

OpenAI Codex is a separate product from Claude Code, with its own configuration format, its own authentication, and no concept of a companion or an `accountUuid`. save-buddy's data model assumes `.claude.json` exists and contains the fields documented in `server/paths.js`.

Porting save-buddy to another coding assistant would require three changes:

1. **Abstract the config reader.** Move `server/paths.js` and `server/companion.js` behind an interface that can read from multiple config formats. For OpenAI Codex, this means reading from wherever Codex stores its identity - and since there is no direct equivalent to `accountUuid`, the replacement would be a synthetic per-install UUID written once at install time.

2. **Abstract the reaction source.** The `buddy_react` endpoint is Anthropic-specific. For other assistants, substitute either (a) a local-fallback-only mode (works offline and costs nothing), or (b) a standard chat completion call to whichever model the user already has credentials for, with a system prompt that mirrors the buddy_react server's intended behavior.

3. **Abstract the extension surface.** MCP is an open standard that other tools are adopting. Hooks, skills, and status line commands are Claude Code specific. For assistants that support MCP but not hooks, the companion loses automatic reactions but still works as an on-demand tool (`/buddy show`, `/buddy pet`).

This is a fork, not a feature flag, and it is not in scope for save-buddy itself. The MIT license and the "Free to use" section give you everything you need to build it.

</details>

### What happens if I run the installer more than once?

**Nothing bad.** The installer is idempotent and updates existing entries in place. Re-running is how you apply updates.

<details>
<summary><b>More detail</b></summary>

Running `npx save-buddy` or `node install.js` again re-registers any hooks or settings that may have drifted and pulls the latest source. Your previous status line command, companion data, and Claude Code config are backed up before any changes, with timestamped filenames in `~/.config/save-buddy/` and next to the original files.

</details>

### How do I confirm save-buddy is actually running?

**Run `/buddy` in Claude Code.** You should see the companion card with your species, rarity stars, stats, name, and personality. The status line should also show your buddy after the next refresh.

<details>
<summary><b>Diagnostics if nothing appears</b></summary>

Check the following in order:

1. `~/.save-buddy/` exists and contains the cloned repository.
2. `~/.config/save-buddy/state/state.json` has been created (this happens on first render).
3. Your Claude Code settings (`~/.claude/settings.json`, `~/.claude-work/settings.json`, or the directory pointed to by `CLAUDE_CONFIG_DIR`) contain a `statusLine.command` that points to `buddy-hud-wrapper.js` and a `statusLine.refreshInterval` of `1`.
4. Your `.claude.json` contains an `oauthAccount.accountUuid` and a `companion` object.
5. You have restarted your Claude Code session after installing - settings load at session start.

If all of those are in place and the buddy still does not appear, open an issue with the output of `node ~/.save-buddy/statusline/buddy-hud-wrapper.js < /dev/null` (Linux/macOS) or `echo '{}' | node ~/.save-buddy/statusline/buddy-hud-wrapper.js` (any platform).

</details>

### Does save-buddy collect or transmit any data about me?

**save-buddy itself collects nothing.** No telemetry, no analytics, no home calls. The Stop hook sends up to 5,000 characters of recent conversation to Anthropic's `buddy_react` endpoint - identical to what the native buddy did - and nothing to any third party.

<details>
<summary><b>More detail</b></summary>

The data sent to `buddy_react` goes to the same company that is already processing your full Claude Code conversation. When the endpoint is unavailable or muted, no network calls are made at all.

OAuth tokens are read from Claude Code's credential store on demand, used once per API call, and immediately discarded. They are never cached, logged, or written to any save-buddy file. State files in `~/.config/save-buddy/` contain only reaction text, pet counts, mute flags, and per-session HUD caches - never credentials, never conversation transcripts.

</details>

### Can I customize my companion's species, stats, or appearance?

**No, and that is intentional.** save-buddy's philosophy is faithful preservation, not expansion. If you want a customizable companion, fork it.

<details>
<summary><b>Why, and how to fork</b></summary>

Your companion's species, eyes, hat, rarity, and stats are determined by your Claude Code `accountUuid` via the exact PRNG that the native feature used. Changing those would mean no longer being faithful to the original, and it would break the one-line promise save-buddy makes to users: "your buddy is exactly who they were before."

If you want customization, the MIT license and the "Free to use" section explicitly encourage you to fork save-buddy and build something new. The sprite system, reaction pipeline, and MCP integration are all documented in [METHODOLOGY.md](METHODOLOGY.md) and designed to be readable and modifiable. Good starting points: `server/companion.js` for the bone generator, `server/sprites.js` for the art, and `server/types.js` for the constants.

</details>

### How do I uninstall save-buddy cleanly?

**`npx save-buddy uninstall`.** This restores your previous status line and removes save-buddy's hooks, MCP registration, skill, and permissions without touching anything else.

<details>
<summary><b>What is preserved and what is removed</b></summary>

The uninstaller surgically removes only save-buddy's entries: the three hook entries (Stop, UserPromptSubmit, SessionStart), the MCP server registration from `.claude.json`, the `/buddy` skill directory, and the auto-allow permissions. It does not touch any other hooks, MCP servers, skills, or settings you may have configured separately.

Your companion data in `.claude.json` is preserved. Your save-buddy state files in `~/.config/save-buddy/` are also preserved so a future reinstall picks up where you left off - delete that directory manually if you want a clean slate.

</details>

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

The PRNG suite checks the hash, the mulberry32 state machine, rarity distribution, and bone generation against known values. If you open `/buddy` after install and see your expected name, species, rarity, hat, and stats, the reconstruction is working end to end.

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

The companion system implementation is based on publicly available community research. Every technical detail in save-buddy can be traced back to one of these sources. See [METHODOLOGY.md](METHODOLOGY.md) for a complete breakdown of what came from where.

- **[BonziClaude](https://github.com/zakarth/BonziClaude)** by [@zakarth](https://github.com/zakarth) - The [BUDDY_SYSTEM_FORENSICS.md](https://github.com/zakarth/BonziClaude/blob/master/BUDDY_SYSTEM_FORENSICS.md) document is the primary technical reference: PRNG algorithm, species and eye constants, hat and rarity systems, stat generation formulas, complete ASCII art for all 18 species, animation sequences, the `buddy_react` API contract, reaction trigger logic, and storage model.

- **[claude-buddy](https://github.com/1270011/claude-buddy)** by [@1270011](https://github.com/1270011) - Community preservation project that pioneered the MCP + hooks + status line architectural approach save-buddy builds on.

- **[Community research on r/Anthropic](https://www.reddit.com/r/Anthropic/)** that identified the `buddy_react` endpoint runs Claude 3.5 Sonnet, not Haiku as initially assumed.

- **Claude Code official documentation** for the MCP server protocol, hook event shapes, status line command contract, settings schema, and skill definition format.

## Free to use

save-buddy is provided completely free of charge, with no restrictions beyond what the law requires.

You may use it. You may copy it. You may modify it. You may redistribute it. You may use pieces of it in your own projects. You may build entirely new things on top of it. You may do any of this for personal use, for commercial use, for research, for teaching, or for any other purpose you can think of - no permission needed, no attribution required, no royalties owed.

No rights are reserved beyond those that cannot be waived under applicable law. To the maximum extent permitted, the author waives all copyright and related rights in the save-buddy source code.

This is a preservation project. Its entire reason for existing is that something people cared about was being taken away. The last thing the world needs is another layer of friction on top of that. Take what is useful. Share what you make.

## License

save-buddy is released under the MIT License. The full text is in [LICENSE](LICENSE).

### Disclaimer of warranty

save-buddy is provided "as is", without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose, and non-infringement.

### Limitation of liability

In no event shall the author or contributors be liable for any claim, damages, or other liability, whether in an action of contract, tort, or otherwise, arising from, out of, or in connection with save-buddy or the use or other dealings in save-buddy. The author expressly waives any liability for loss of data, loss of profits, business interruption, lost companions, or any other damages arising from use of this software.

### Third-party services

save-buddy calls the Anthropic `buddy_react` API endpoint on your behalf when available. This endpoint is operated by Anthropic, not by save-buddy or its author. Your use of that endpoint is governed by Anthropic's terms of service, not by this license. save-buddy does not bill, track, or intermediate that relationship in any way.

### Trademarks

"Claude", "Claude Code", and "Anthropic" are trademarks of Anthropic PBC. save-buddy is not affiliated with, endorsed by, or sponsored by Anthropic. This project preserves functionality that Anthropic previously offered to its users and has since removed; it is an independent community effort.
