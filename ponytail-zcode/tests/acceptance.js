// Acceptance test for the ponytail ZCode adapter hooks.
// Run: node tests/acceptance.js
// Sandboxes both the plugin data dir and APPDATA so nothing touches real state.
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PLUGIN = path.join(__dirname, '..');
// Spawn the scripts with the node that is running this test, so the suite is
// portable: hooks/hooks.json resolving its own "node" is checked separately.
const NODE = process.execPath;
const BOX = path.join(os.tmpdir(), 'pt-test');
const APPDATA_BOX = path.join(os.tmpdir(), 'pt-appdata-box');
// The map only recognizes ESM exports, so give it a fixture project instead of
// scanning the adapter's CommonJS hooks (which would produce an empty map).
const MAP_BOX = path.join(os.tmpdir(), 'pt-map-box');
fs.rmSync(BOX, { recursive: true, force: true });
fs.rmSync(APPDATA_BOX, { recursive: true, force: true });
fs.rmSync(MAP_BOX, { recursive: true, force: true });
fs.mkdirSync(BOX, { recursive: true });
fs.mkdirSync(APPDATA_BOX, { recursive: true });
fs.mkdirSync(MAP_BOX, { recursive: true });
fs.writeFileSync(path.join(MAP_BOX, 'util.js'), 'export function existingHelper() {}\n');

// Keys ZCode's hook-output schema accepts. Anything else would be a schema risk.
const ALLOWED_TOP = new Set(['additionalContext', 'additional_context', 'continue', 'decision',
  'hookSpecificOutput', 'reason', 'stopReason', 'suppressOutput', 'systemMessage']);

function run(script, payload, extraEnv) {
  const r = spawnSync(NODE, [path.join(PLUGIN, 'hooks', script)], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, ZCODE_PLUGIN_DATA: BOX, ZCODE_PROJECT_DIR: MAP_BOX, APPDATA: APPDATA_BOX, PONYTAIL_DEFAULT_MODE: '', PONYTAIL_MAP: '', PONYTAIL_STATUS: '', ...extraEnv },
  });
  const raw = r.stdout;
  return { raw, rc: r.status, err: r.stderr };
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  -> ' + detail : '')); }
}

// Parse a hook's stdout the way ZCode does: only if it starts with "{".
function ctxOf(res) {
  if (!res.raw.trim()) return { empty: true };
  if (!res.raw.trim().startsWith('{')) return { illegal: res.raw.slice(0, 40) };
  let o;
  try { o = JSON.parse(res.raw); } catch (e) { return { illegal: 'unparseable: ' + e.message }; }
  const extra = Object.keys(o).filter((k) => !ALLOWED_TOP.has(k));
  return { obj: o, h: o.hookSpecificOutput, extra,
    text: o.hookSpecificOutput ? o.hookSpecificOutput.additionalContext : undefined };
}

const S = (sid, payload) => ({ sessionId: sid, hookEventName: 'SessionStart', source: 'startup', ...payload });
const P = (sid, prompt) => ({ sessionId: sid, prompt });

// Section 0 also validates a packaged copy: when this test is run from a
// distribution directory (plugin sitting beside a marketplace.json), the
// catalog is checked against the manifest too.
console.log('\n0. wiring: manifest, hook declaration, resolvable command');
const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN, '.zcode-plugin/plugin.json'), 'utf8'));
const declared = path.resolve(PLUGIN, manifest.hooks.replace(/^\.\//, ''));
check('manifest hooks field points at a real file', fs.existsSync(declared), manifest.hooks);
const hooksJson = JSON.parse(fs.readFileSync(declared, 'utf8'));
check('manifest name matches the plugin directory name', manifest.name === path.basename(PLUGIN), manifest.name);
const EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PermissionRequest', 'PostToolUse', 'PostToolUseFailure', 'Stop'];
// ZCode's hook entry schema is .strict(): an unsupported key drops the hook.
const ENTRY_KEYS = new Set(['type', 'command', 'enabled', 'args', 'timeout', 'timeoutMs', 'statusMessage', 'async', 'shell']);
let declaredHooks = 0;
for (const ev of Object.keys(hooksJson.hooks)) {
  check('event name is one of ZCode\'s seven: ' + ev, EVENTS.includes(ev), ev);
  for (const entry of hooksJson.hooks[ev]) for (const h of entry.hooks) {
    declaredHooks++;
    check(ev + ' entry uses only schema keys', Object.keys(h).every((k) => ENTRY_KEYS.has(k)), JSON.stringify(Object.keys(h)));
    const bare = !h.command.includes('/') && !h.command.includes('\\');
    const ok = bare ? !spawnSync(h.command, ['--version'], { shell: false }).error : fs.existsSync(h.command);
    check(ev + ' command is runnable: ' + h.command, ok, 'not resolvable');
    for (const a of h.args || []) {
      const rel = a.replace('${ZCODE_PLUGIN_ROOT}/', '');
      const full = path.resolve(PLUGIN, rel);
      check(ev + ' arg exists and stays inside the plugin: ' + rel,
        fs.existsSync(full) && full.startsWith(path.resolve(PLUGIN) + path.sep));
    }
  }
}
check('declares exactly two hooks', declaredHooks === 2, String(declaredHooks));
const catalogPath = path.join(PLUGIN, '..', 'marketplace.json');
if (fs.existsSync(catalogPath)) {
  const cat = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const entry = (cat.plugins || []).find((p) => p.name === manifest.name);
  check('catalog lists this plugin', !!entry);
  check('catalog version matches manifest (' + manifest.version + ')', entry && entry.version === manifest.version, entry && entry.version);
  check('catalog source resolves', entry && fs.existsSync(path.resolve(path.dirname(catalogPath), entry.source)));
} else {
  console.log('  (no marketplace.json beside the plugin - source layout, catalog checks skipped)');
}

console.log('\n1. SessionStart, new session -> inject ruleset at the default level');
let r = ctxOf(run('zcode-session-start.js', S('sess-A')));
check('exit 0, valid JSON, no extra keys', r.obj && !r.extra.length, r.illegal || JSON.stringify(r.extra));
check('hookEventName matches the event', r.h && r.h.hookEventName === 'SessionStart', r.h && r.h.hookEventName);
check('context announces full level', (r.text || '').startsWith('PONYTAIL MODE ACTIVE — level: full'), (r.text || '').slice(0, 60));
check('upstream 5 codebase map is appended', (r.text || '').includes('Codebase map (what already exists'), (r.text || '').slice(-120));
check('visible status instruction present', (r.text || '').includes('`ponytail: full`'), (r.text || '').slice(-160));
const fullBody = r.text;

console.log('\n1b. PONYTAIL_MAP=0 -> ruleset still injected, map omitted');
r = ctxOf(run('zcode-session-start.js', S('sess-map-off'), { PONYTAIL_MAP: '0' }));
check('ruleset still arrives', (r.text || '').startsWith('PONYTAIL MODE ACTIVE — level: full'), (r.text || '').slice(0, 60));
check('no codebase map', !(r.text || '').includes('Codebase map'), (r.text || '').slice(-120));

console.log('\n1c. PONYTAIL_STATUS=0 -> visible status instruction omitted');
r = ctxOf(run('zcode-session-start.js', S('sess-status-off'), { PONYTAIL_STATUS: '0' }));
check('ruleset still arrives', (r.text || '').startsWith('PONYTAIL MODE ACTIVE — level: full'), (r.text || '').slice(0, 60));
check('no visible status instruction', !(r.text || '').includes('VISIBLE STATUS'), (r.text || '').slice(-120));

console.log('\n2. UserPromptSubmit, ordinary prompt -> silent');
r = ctxOf(run('zcode-prompt.js', P('sess-A', 'add a retry wrapper to the upload function')));
check('empty stdout (ZCode treats this as nothing to say)', r.empty, r.illegal);

console.log('\n3. /ponytail ultra -> switch confirmed + that level\'s ruleset');
r = ctxOf(run('zcode-prompt.js', P('sess-A', '/ponytail ultra')));
check('hookEventName is UserPromptSubmit', r.h && r.h.hookEventName === 'UserPromptSubmit', r.h && r.h.hookEventName);
check('context announces the switch', (r.text || '').startsWith('PONYTAIL MODE CHANGED — level: ultra'), (r.text || '').slice(0, 60));
check('ultra ruleset differs from full (mode filter applied)', r.text !== fullBody);
check('ultra keeps its own intensity row', r.text.includes('push back on any part the need does not justify'));
check('lite intensity row is filtered out', !r.text.includes('Build what was asked.'));
check('visible status switches to ultra', r.text.includes('`ponytail: ultra`'));

console.log('\n3b. /ponytail lite -> lite row kept, other levels filtered');
r = ctxOf(run('zcode-prompt.js', P('sess-lite', '/ponytail lite')));
check('announces the switch', (r.text || '').startsWith('PONYTAIL MODE CHANGED — level: lite'), (r.text || '').slice(0, 60));
check('lite keeps its own intensity row', r.text.includes('Build what was asked.'));
check('full and ultra rows are filtered out', !r.text.includes('The rules above. Default.') && !r.text.includes('push back on any part'));
check('visible status switches to lite', r.text.includes('`ponytail: lite`'));

console.log('\n4. bare /ponytail -> reports the live level (proves state persisted)');
r = ctxOf(run('zcode-prompt.js', P('sess-A', '/ponytail')));
check('reports ultra', (r.text || '').startsWith('PONYTAIL MODE ACTIVE — level: ultra'), JSON.stringify(r.text));
check('status query asks for a visible line', (r.text || '').includes('`ponytail: ultra`'), JSON.stringify(r.text));

console.log('\n5. /ponytail <garbage> -> ignored');
r = ctxOf(run('zcode-prompt.js', P('sess-A', '/ponytail turbo')));
check('empty stdout', r.empty, r.illegal);

console.log('\n6. SessionStart resume/startup, same session -> keeps the user\'s level, silent');
r = ctxOf(run('zcode-session-start.js', S('sess-A')));
check('empty stdout', r.empty, r.illegal);

console.log('\n7. SessionStart compact, same session -> re-injects the kept level (not the default)');
r = ctxOf(run('zcode-session-start.js', S('sess-A', { source: 'compact' })));
check('event ok', r.h && r.h.hookEventName === 'SessionStart');
check('still ultra after compaction', (r.text || '').startsWith('PONYTAIL MODE ACTIVE — level: ultra'), (r.text || '').slice(0, 60));

console.log('\n8. "stop ponytail" -> off');
r = ctxOf(run('zcode-prompt.js', P('sess-A', 'stop ponytail')));
check('announces off', (r.text || '').startsWith('PONYTAIL MODE OFF'), JSON.stringify(r.text));
check('off asks for a visible line', (r.text || '').includes('`ponytail: off`'), JSON.stringify(r.text));

console.log('\n9. off must survive a compaction (regression: off is a state, not an absence)');
r = ctxOf(run('zcode-session-start.js', S('sess-A', { source: 'compact' })));
check('empty stdout: ponytail stays off', r.empty, r.illegal || (r.text || '').slice(0, 60));

console.log('\n10. a different session does not inherit the first one\'s state');
r = ctxOf(run('zcode-session-start.js', S('sess-B')));
check('new session starts at full', (r.text || '').startsWith('PONYTAIL MODE ACTIVE — level: full'), (r.text || '').slice(0, 60));

console.log('\n11. /ponytail-review -> points at the review skill');
r = ctxOf(run('zcode-prompt.js', P('sess-B', '/ponytail-review')));
check('mentions review', /review/i.test(r.text || ''), JSON.stringify(r.text));
check('review mode gets no codebase map', !(r.text || '').includes('Codebase map'), JSON.stringify(r.text));
check('review asks for a visible line', (r.text || '').includes('`ponytail: review`'), JSON.stringify(r.text));

console.log('\n12. /ponytail default ultra -> persists for new sessions');
r = ctxOf(run('zcode-prompt.js', P('sess-B', '/ponytail default ultra')));
check('confirms the persisted default', /DEFAULT SET/.test(r.text || ''), JSON.stringify(r.text));
check('default asks for a visible line', (r.text || '').includes('`ponytail: default ultra`'), JSON.stringify(r.text));
const cfg = path.join(APPDATA_BOX, 'ponytail', 'config.json');
check('config written to the sandboxed APPDATA (real one untouched)', fs.existsSync(cfg));
check('config content', fs.existsSync(cfg) && JSON.parse(fs.readFileSync(cfg, 'utf8')).defaultMode === 'ultra');
r = ctxOf(run('zcode-session-start.js', S('sess-C')));
check('new session honours the persisted default', (r.text || '').startsWith('PONYTAIL MODE ACTIVE — level: ultra'), (r.text || '').slice(0, 60));

console.log('\n13. state isolation');
const states = fs.readdirSync(BOX).sort();
check('per-session state files under the plugin data dir', states.every((f) => f.startsWith('mode')), JSON.stringify(states));
check('no state written into ~/.claude', !fs.existsSync(path.join(os.homedir(), '.claude', '.ponytail-active')));

console.log('\n14. bare "ponytail <level>" works too, and prose must not false-trigger');
r = ctxOf(run('zcode-prompt.js', P('sess-D', 'ponytail ultra')));
check('bare form switches level', (r.text || '').startsWith('PONYTAIL MODE CHANGED — level: ultra'), (r.text || '').slice(0, 60));
r = ctxOf(run('zcode-prompt.js', P('sess-D', 'ponytail 是什么')));
check('prose asking what ponytail is stays silent', r.empty, r.illegal || JSON.stringify(r.text));
r = ctxOf(run('zcode-prompt.js', P('sess-D', 'ponytail 这个 skill 怎么用')));
check('prose about the skill stays silent', r.empty, r.illegal || JSON.stringify(r.text));
r = ctxOf(run('zcode-prompt.js', P('sess-D', 'add a normal mode toggle to the settings page')));
check('deactivation needs the whole message (upstream intent)', r.empty, r.illegal || JSON.stringify(r.text));
r = ctxOf(run('zcode-prompt.js', P('sess-D', 'ponytail off')));
check('bare off switches off', (r.text || '').startsWith('PONYTAIL MODE OFF'), JSON.stringify(r.text));

console.log('\n' + (fail ? 'FAILED' : 'ALL PASS') + ': ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
