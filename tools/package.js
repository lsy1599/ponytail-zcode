#!/usr/bin/env node
// 把插件源码打成可分发的一份：别人把这个目录当市场加上去，或压 zip 发出去。
// 用法: node tools/package.js [目标目录]
// 默认目标: C:\Users\simon\Documents\zcode-plugins
//
// 为什么要脚本而不是手拷：源目录（~/.agents/ponytail-zcode）与分发包是两份，
// 手拷迟早漂移；这里同时把「上游文件必须逐字节未改」和「版本号两处一致」钉成
// 打包前置条件，违反就中止。
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..');
const PLUGIN_SRC = path.join(SRC, 'ponytail-zcode');
const UPSTREAM = path.join(SRC, 'upstream');
const OUT = path.resolve(process.argv[2] || 'C:\\Users\\simon\\Documents\\zcode-plugins');
const MARKET_ID = 'ponytail-zcode-market';

// upstream/ 与本地市场清单不进包：分发包只需要自包含的插件本体。
const INCLUDE = ['.zcode-plugin', 'hooks', 'skills', 'tests'];
const VENDORED = [
  'hooks/ponytail-config.js',
  'hooks/ponytail-instructions.js',
  'hooks/ponytail-map.js',
  'skills/ponytail/SKILL.md',
];

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const die = (msg) => { console.error('中止: ' + msg); process.exit(1); };

const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN_SRC, '.zcode-plugin/plugin.json'), 'utf8'));

if (OUT === SRC || OUT.startsWith(SRC + path.sep) || SRC.startsWith(OUT + path.sep)) {
  die('目标目录与源目录不能互相包含: ' + OUT);
}

// 铁律：上游文件只许原样搬运。被改过就说明适配层越界了，先修再打包。
const drifted = VENDORED.filter((rel) => {
  const up = path.join(UPSTREAM, rel);
  return !fs.existsSync(up) || sha(up) !== sha(path.join(PLUGIN_SRC, rel));
});
if (drifted.length) die('上游文件被改动过（应为逐字节副本）: ' + drifted.join(', '));

// 幂等重建：只清自己生成的东西，不动目标目录里别人的文件。
fs.rmSync(path.join(OUT, 'ponytail-zcode'), { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const dir of INCLUDE) {
  fs.cpSync(path.join(PLUGIN_SRC, dir), path.join(OUT, 'ponytail-zcode', dir), { recursive: true });
}
fs.copyFileSync(path.join(SRC, 'dist', 'README.md'), path.join(OUT, 'README.md'));
fs.copyFileSync(path.join(UPSTREAM, 'LICENSE'), path.join(OUT, 'LICENSE'));

// 清单由脚本生成，版本号只从 manifest 来，避免两处手写不一致。
const catalog = {
  name: MARKET_ID,
  plugins: [{
    name: manifest.name,
    source: './' + manifest.name,
    version: manifest.version,
    description: manifest.description,
    displayName: 'Ponytail for ZCode',
    displayName_i18n: { 'zh-CN': 'Ponytail 省钱模式（ZCode 适配）' },
    description_i18n: { 'zh-CN': '会话开始时注入「懒资深开发」规则集，让 agent 少写代码；ponytail lite|full|ultra|off 切换档位。' },
    category: 'productivity',
  }],
};
fs.writeFileSync(path.join(OUT, 'marketplace.json'), JSON.stringify(catalog, null, 2) + '\n', 'utf8');

// 自检：清单的 source 必须真的指到插件，版本必须与 manifest 一致。
const check = (ok, what) => { if (!ok) die('自检失败: ' + what); };
check(fs.existsSync(path.join(OUT, manifest.name, '.zcode-plugin', 'plugin.json')), '清单 source 指向的插件不存在');
for (const rel of VENDORED) check(fs.existsSync(path.join(OUT, manifest.name, rel)), '分发包缺文件 ' + rel);

const files = INCLUDE.flatMap(function walk(dir, acc) {
  return fs.readdirSync(path.join(OUT, manifest.name, dir), { withFileTypes: true })
    .flatMap((e) => e.isDirectory()
      ? walk(path.join(dir, e.name), acc)
      : [path.join(dir, e.name).replace(/\\/g, '/')]);
}, []);

console.log('已生成分发包');
console.log('  目标目录 : ' + OUT);
console.log('  市场 id  : ' + MARKET_ID);
console.log('  插件 id  : ' + manifest.name + '@' + MARKET_ID);
console.log('  版本     : ' + manifest.version);
console.log('  插件文件 : ' + files.length + ' 个，上游副本 ' + VENDORED.length + ' 个逐字节未改');
console.log('  下一步   : 对方在 ZCode「插件市场 → 添加」里粘贴上面的目标目录，安装后重启 ZCode');
console.log('  验收     : node "' + path.join(OUT, manifest.name, 'tests', 'acceptance.js') + '"');
