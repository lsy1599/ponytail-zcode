# 贴到 ponytail issue #445 的正文（英文，可直接复制）

> 说明：这是给 https://github.com/DietrichGebert/ponytail/issues/445 的回复草稿。
> 实测环境 ZCode Desktop 3.14.3.7762 / Windows。
> 最后一段是「愿意提 PR」的承诺，不想承诺就删掉那一句。

---

ZCode installs the plugin, but the SessionStart injection is a silent no-op.

ZCode Desktop 3.14.3.7762 (Windows) supports third-party marketplaces now, so ponytail installs cleanly through the `.claude-plugin` compatibility path and shows up as an installed plugin. What does not work is the always-on ruleset injection — and it fails silently, with nothing in the logs.

Both blockers come from the shipped runtime (`resources/glm/zcode.cjs`).

**1. Host detection falls through to the native-Claude branch.** For plugin hook processes ZCode sets only `CLAUDE_*` / `ZCODE_*` variables: `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`, `CLAUDE_PROJECT_DIR`, `CLAUDE_SESSION_ID` (plus the `ZCODE_` twins) and `ZCODE_PLUGIN_ID` / `ZCODE_PLUGIN_NAME`. It never sets a bare `PLUGIN_DATA`, `COPILOT_PLUGIN_DATA`, `CURSOR_VERSION` or `QODER_SESSION_ID`. So in `ponytail-runtime.js` all four host flags are false and control lands in the native-Claude path.

**2. Non-JSON stdout is ignored by design.** The native-Claude path does `process.stdout.write(context)` — the ruleset as plain text. ZCode reads hook stdout like this:

```js
let n = stdout.trim();
if (!n || !n.startsWith("{")) return;   // anything not starting with { is dropped
```

There is no plain-text compatibility branch anywhere in the runtime. Running `hooks/ponytail-activate.js` with ZCode's environment (only `CLAUDE_PLUGIN_ROOT` set) writes 5,749 bytes of plain text that never reach the conversation, and no error is logged — so this is easy to mistake for "it works".

**Also:** `SubagentStart` in `hooks/claude-codex-hooks.json` is not one of ZCode's supported events. ZCode supports exactly `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PostToolUseFailure`, `Stop`, so that hook cannot fire there either.

**What would fix it** — a `isZCode` branch alongside the existing ones:

```js
const isZCode = !isCopilot && !isCodex && !isQoder && !isCursor && Boolean(process.env.ZCODE_PLUGIN_ROOT);
```

- `stateDir` → `process.env.ZCODE_PLUGIN_DATA`. Without this the flag file lands in `~/.claude`, which is another tool's directory.
- `writeHookOutput` → `{"hookSpecificOutput":{"hookEventName":event,"additionalContext":context}}` (empty context means print nothing; ZCode also rejects the run if `hookEventName` does not match the event that fired).

I have been running exactly that as a thin wrapper around an unmodified `ponytail-instructions.js` / `ponytail-config.js` / `SKILL.md`, so the ruleset text and the intensity filtering stay yours. Happy to send it as a PR if that is useful.
