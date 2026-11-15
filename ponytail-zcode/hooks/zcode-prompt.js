// UserPromptSubmit: handle /ponytail commands, stay silent on ordinary prompts.
const { isDeactivationCommand, writeDefaultMode } = require('./ponytail-config');
const { getPonytailInstructions } = require('./ponytail-instructions');
const lib = require('./zcode-lib');

const LEVELS = ['lite', 'full', 'ultra', 'off'];

// The injected ruleset is hidden from the user, so commands ask the model for
// one visible confirmation line. PONYTAIL_STATUS=0 turns it off.
function visibleStatus(line) {
  if (process.env.PONYTAIL_STATUS === '0') return '';
  return '\n\nVISIBLE STATUS — REQUIRED: reply with exactly this line, before anything else: `' + line + '`';
}

(async () => {
  const input = await lib.readInput();
  const sid = lib.sessionIdOf(input);
  const prompt = String(input.prompt || '').trim();
  const lower = prompt.toLowerCase();

  // review is a session-only mode defined by the ponytail-review skill; there is
  // no ruleset to inject, only the pointer to that skill.
  if (/^[/@$]?ponytail(?:-review|\s+review|:ponytail-review)\b/.test(lower)) {
    lib.emit('UserPromptSubmit', getPonytailInstructions('review') + visibleStatus('ponytail: review'));
    return;
  }

  // The leading / is optional: ZCode opens its slash/skill picker on "/", and
  // `ponytail` is also an installed skill name, so a typed "/ponytail ultra" may
  // reach this hook expanded rather than literally. Accepting the bare form makes
  // switching work either way. Anchored, and the word must be followed by
  // whitespace or end-of-line (lookahead, \w is ASCII-only so \b would miss
  // CJK gluing), so prose mentioning ponytail is ignored.
  const cmd = lower.match(/^[/@$]?ponytail(?::ponytail)?(?=\s|$)(?:[\s]+(\S+))?(?:[\s]+(\S+))?/);
  if (cmd) {
    const level = cmd[1];
    const rest = cmd[2];

    if (level === 'default') {
      if (rest && LEVELS.includes(rest)) {
        // writeDefaultMode is vendored and unguarded: an unwritable config dir
        // must not crash this hook (crash = exit 1, raw stack on stderr).
        try {
          writeDefaultMode(rest);
          lib.emit('UserPromptSubmit', 'PONYTAIL DEFAULT SET — new sessions start in ' + rest + '.' +
            visibleStatus('ponytail: default ' + rest));
        } catch (e) {
          lib.emit('UserPromptSubmit', 'PONYTAIL: could not save default mode (' + (e.code || e.message) + ').');
        }
      }
      return;
    }
    if (!level) {
      const mode = lib.activeMode(sid);
      lib.emit('UserPromptSubmit', 'PONYTAIL MODE ACTIVE — level: ' + mode +
        visibleStatus('ponytail: ' + mode));
      return;
    }
    if (!LEVELS.includes(level)) return;

    if (level === 'off') {
      lib.writeMode(sid, 'off');
      lib.emit('UserPromptSubmit', 'PONYTAIL MODE OFF' + visibleStatus('ponytail: off'));
      return;
    }
    lib.writeMode(sid, level);
    // Upstream's Claude path emits only the header here, relying on the model
    // re-reading the skill for the new level. We re-inject that level's ruleset
    // too, because this is the moment the level actually changes.
    lib.emit('UserPromptSubmit',
      'PONYTAIL MODE CHANGED — level: ' + level + '\n\n' + getPonytailInstructions(level) +
      visibleStatus('ponytail: ' + level));
    return;
  }

  if (isDeactivationCommand(prompt)) {
    lib.writeMode(sid, 'off');
    lib.emit('UserPromptSubmit', 'PONYTAIL MODE OFF' + visibleStatus('ponytail: off'));
  }
})();
