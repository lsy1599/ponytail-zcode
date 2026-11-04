// SessionStart: put the ruleset in front of the model, at the level in force.
const { execFileSync } = require('child_process');
const path = require('path');
const { getDefaultMode } = require('./ponytail-config');
const { getPonytailInstructions } = require('./ponytail-instructions');
const lib = require('./zcode-lib');

// Upstream 5 appends a codebase map so the model reuses what already exists
// instead of re-writing it. Run it exactly the way upstream's activate hook
// does: hard 3s stop, 64KB cap, silently empty on any failure.
function projectMap(mode) {
  if (mode === 'review' || process.env.PONYTAIL_MAP === '0') return '';
  try {
    const map = execFileSync(process.execPath, [
      path.join(__dirname, 'ponytail-map.js'),
      process.env.ZCODE_PROJECT_DIR || process.cwd(),
    ], { encoding: 'utf8', timeout: 3000, maxBuffer: 64 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    return map.trim() ? '\n\n' + map.trim() : '';
  } catch (e) {
    return '';
  }
}

// The ruleset and map are model-only context, so the user cannot tell whether
// the hook ran. Ask the model to print one visible line on its first reply;
// this is the only reliable user-facing signal available to SessionStart.
// PONYTAIL_STATUS=0 turns it off.
function visibleStatus(mode) {
  if (process.env.PONYTAIL_STATUS === '0') return '';
  return '\n\nVISIBLE STATUS — REQUIRED: ponytail is ACTIVE at level "' + mode + '". ' +
    'Start your first reply in this session with exactly this line, before anything else: ' +
    '`ponytail: ' + mode + '`. Do not repeat it after the first reply.';
}

function inject(event, mode) {
  lib.emit(event, getPonytailInstructions(mode) + projectMap(mode) + visibleStatus(mode));
}

(async () => {
  const input = await lib.readInput();
  const sid = lib.sessionIdOf(input);
  const live = lib.readMode(sid);

  if (live) {
    // Same session coming back from resume/clear. Keep the level the user chose,
    // including "off". A compact dropped the ruleset along with the summarized
    // context, so re-inject it; otherwise stay quiet.
    if (input.source === 'compact' && live !== 'off') {
      inject('SessionStart', live);
    }
    return;
  }

  // Uninitialized session: take the configured level. A default of "off" writes
  // nothing and stays off.
  const mode = getDefaultMode();
  if (mode === 'off') return;
  lib.writeMode(sid, mode);
  inject('SessionStart', mode);
})();
