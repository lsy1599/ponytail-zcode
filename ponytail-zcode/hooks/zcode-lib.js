// ZCode adapter for ponytail. ponytail-config.js, ponytail-instructions.js and
// skills/ponytail/SKILL.md in this plugin are byte-identical copies of
// DietrichGebert/ponytail; only the zcode-*.js files are ours.
//
// Why an adapter instead of upstream's own hooks: upstream's writeHookOutput()
// emits the ruleset as PLAIN TEXT, which is what Claude Code accepts. ZCode only
// reads hook stdout when it is a JSON object, so plain text is silently ignored
// and the ruleset never reaches the model. Upstream picks its host by env var and
// has no ZCode branch, so we wrap it rather than patch it.
const fs = require('fs');
const os = require('os');
const path = require('path');

const { getDefaultMode } = require('./ponytail-config');

// ponytail-config.js reads its own defaults from %APPDATA%\ponytail\config.json,
// so `/ponytail default <level>` keeps working through the vendored resolver.
function stateDir() {
  for (const v of [process.env.ZCODE_PLUGIN_DATA, process.env.CLAUDE_PLUGIN_DATA]) {
    if (v && !v.includes('${')) return v;
  }
  return path.join(os.homedir(), '.zcode', 'ponytail');
}

// Keyed by session so two concurrent ZCode sessions can't switch each other's
// level; upstream keeps one global flag file and does not try to separate them.
function modePath(sessionId) {
  const safe = String(sessionId || '').replace(/[^A-Za-z0-9_-]/g, '');
  return path.join(stateDir(), safe ? 'mode-' + safe : 'mode');
}

function readMode(sessionId) {
  try {
    return fs.readFileSync(modePath(sessionId), 'utf8').trim() || null;
  } catch (e) {
    return null;
  }
}

function writeMode(sessionId, mode) {
  try {
    fs.mkdirSync(stateDir(), { recursive: true });
    fs.writeFileSync(modePath(sessionId), mode);
  } catch (e) {
    // Mode state is best-effort: never block a session over it.
  }
}

// "off" is stored, not absent: an absent state means "this session has not been
// initialized yet", so clearing it on /ponytail off would let the next
// SessionStart(compact) silently re-enable ponytail behind the user's back.
function activeMode(sessionId) {
  return readMode(sessionId) || getDefaultMode();
}

function sessionIdOf(input) {
  for (const v of [input.sessionId, input.session_id, process.env.ZCODE_SESSION_ID, process.env.CLAUDE_SESSION_ID]) {
    if (v && !String(v).includes('${')) return String(v);
  }
  return '';
}

// Ported from upstream's guard for the same reason it exists there: a host that
// never closes stdin would otherwise hang the session. Process whatever arrived
// after a short fallback and exit.
function readInput() {
  return new Promise((resolve) => {
    let raw = '';
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try {
        resolve(JSON.parse(raw.replace(/^\uFEFF/, '')));
      } catch (e) {
        resolve({});
      }
    };
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { raw += chunk; });
    process.stdin.on('end', finish);
    process.stdin.on('error', finish);
    setTimeout(finish, 1500).unref();
  });
}

// ZCode parses stdout only when it is a JSON object, and rejects the run when
// hookEventName does not match the event that fired. No context means no output:
// empty stdout is the documented way to say nothing.
function emit(event, additionalContext) {
  if (!additionalContext) return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: event, additionalContext },
  }));
}

module.exports = { activeMode, emit, readInput, readMode, sessionIdOf, stateDir, writeMode };
