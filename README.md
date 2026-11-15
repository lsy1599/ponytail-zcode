# ponytail for ZCode

把 [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail)（让 agent 写最少代码的「懒资深开发」规则集）接到 ZCode 上的本地插件。

## 为什么需要这一层

上游的 hook 靠嗅探宿主环境变量分流（Codex / Copilot / Qoder / Cursor / 原生 Claude），**没有 ZCode 分支**。落到「原生 Claude」分支时它把规则集当**纯文本**写 stdout——那是 Claude Code 的契约。ZCode 只在 stdout 是 JSON 对象时才读（`zcode.cjs` 里 `if(!n.startsWith("{"))return`：不以 `{` 开头就静默忽略），所以直接装上游插件的话，规则集一次也进不了对话。

这一层不改上游，只在外面重写「输出格式」和「状态落盘位置」两件事，规则集本身仍然由上游的 `getPonytailInstructions()` 生成，档位过滤也是它的逻辑。

## 目录

```
~/.agents/ponytail-zcode/
  marketplace.json                    ← 本地市场清单（市场根目录就是本目录）
  ponytail-zcode/                     ← 插件源码，目录名与 manifest name 必须一致
    .zcode-plugin/plugin.json
    hooks/
      hooks.json                      ← 注册 SessionStart + UserPromptSubmit
      zcode-lib.js                    ← 适配层：JSON 输出、状态、读 stdin
      zcode-session-start.js          ← 会话开始注入规则集
      zcode-prompt.js                 ← /ponytail 档位切换，普通提问保持沉默
      ponytail-config.js              ← 上游原样（见下）
      ponytail-instructions.js        ← 上游原样
      ponytail-map.js                 ← 上游原样，SessionStart 代码库地图
    skills/ponytail/SKILL.md          ← 上游原样；被 ponytail-instructions.js 按相对路径读取
  upstream/                           ← 上游的原始 git clone，只读参考（shallow，用 fetch/reset 更新）
```

`ponytail-instructions.js` 用 `__dirname/../skills/ponytail/SKILL.md` 取规则集正文，所以这三个文件必须落在上面这个相对位置，插件才是自包含的（ZCode 安装时会把它拷进自己的缓存目录，靠绝对路径指向上游会断）。

## 与上游的关系

`hooks/ponytail-config.js`、`hooks/ponytail-instructions.js`、`hooks/ponytail-map.js`、`skills/ponytail/SKILL.md` 是**逐字节副本**，未改一行。当前对应上游 commit `96608e0`（v5.3.3）。只有 `zcode-*.js`、`hooks.json`、`plugin.json` 是本地的。

上游 5 的规则集更短，并在 SessionStart 追加一份**代码库地图**（按目录列出现有函数/类/导出，默认 2000 字符、3 秒硬超时），让模型优先复用现有代码。适配层只是按上游 `ponytail-activate.js` 的方式调用 `ponytail-map.js`，地图本身未改。`PONYTAIL_MAP=0` 可关闭地图。上游 5 的 `band` 是 Claude Code 状态栏功能，ZCode 没有对应机制，`/ponytail band` 会被忽略。

规则集更新（上游改了 prompt）：

```bash
cd ~/.agents/ponytail-zcode/upstream && git fetch --depth=1 origin main && git reset --hard origin/main
P=~/.agents/ponytail-zcode/ponytail-zcode
cp upstream/hooks/ponytail-config.js       $P/hooks/
cp upstream/hooks/ponytail-instructions.js $P/hooks/
cp upstream/hooks/ponytail-map.js          $P/hooks/
cp upstream/skills/ponytail/SKILL.md       $P/skills/ponytail/
```

然后升 `ponytail-zcode/.zcode-plugin/plugin.json` 与 `marketplace.json` 里的 `version`，再到 UI 里刷新市场 + 更新插件。

重拷后跑一遍回归验收（68 条断言，会沙箱化状态目录和地图目录，不碰真实数据）：

```bash
node ~/.agents/ponytail-zcode/ponytail-zcode/tests/acceptance.js
```

## 用法

**规则集是自动的，不需要触发。** 每次新会话开始，SessionStart hook 把当前档位的规则集和代码库地图注入上下文——这段文字只进模型上下文，你在对话里看不到。为了让你能确认它真的启动了，适配层会要求模型**在本次会话的第一条回复开头打印一行** `ponytail: full`（当前档位）；切档位时同样会打印 `ponytail: ultra` 之类的确认行。`PONYTAIL_STATUS=0` 可关掉这行可见状态。副作用是每次会话约 1.4k tokens（规则集约 0.9k + 地图上限 2k 字符），普通提问不产生任何输出。地图嫌费可在系统环境里设 `PONYTAIL_MAP=0` 关掉。

唯一要手动做的是切档位，两种写法都行：

| 想干什么 | 写法 | 说明 |
|---|---|---|
| 注入生效（默认） | 什么都不用做 | 装了就是 **full** 档 |
| 切档位 | `/ponytail ultra` 或直接 `ponytail ultra` | 也支持 `lite` / `full` |
| 查当前档位 | `/ponytail` 或 `ponytail` | 回一句当前 level |
| 确认是否启动 | 看第一条回复开头 | 应有 `ponytail: full`（或当前档位） |
| 关掉 | `/ponytail off`、`ponytail off`、`stop ponytail`、`normal mode` | 后两个必须整条消息就这一句 |
| 改默认档位 | `/ponytail default ultra` | 写进 `%APPDATA%\ponytail\config.json`，新会话生效 |
| 用 review 档 | `/ponytail-review` 或 `/ponytail review` | 指向 `ponytail-review` skill，不注入规则集 |

**前缀 `/` 是可选的**，这是刻意的：ZCode 输入 `/` 会弹命令/技能选择器，而 `ponytail` 本身又是个已装 skill 名，所以打 `/ponytail ultra` 时 hook 拿到的可能不是字面量。写成 `ponytail ultra` 一定命中。反过来，句子里提到 ponytail 不会误触发——正则锚定在消息开头，且要求 `ponytail` 后面紧跟空白或行尾，所以「ponytail 是什么」「ponytail是什么」「ponytail-mode is noisy」都静默；档位参数只认四个档位词。

装上后**新开一个任务**才生效（SessionStart 是会话级触发，当前已开的会话不会有）。新任务开始时输入框附近会短暂出现 `PONYTAIL: loading rules...`，随后第一条回复会以一行 `ponytail: full` 开头——看到任意一个就说明 hook 跑起来了。两个都没看到就重启一次 ZCode，或按下面的边界排查。

档位状态按会话 id 分开存在 ZCode 的插件数据目录里，`/ponytail off` 之后即使上下文被压缩也不会自己偷偷开回来。上下文被压缩或 `/clear` 后，SessionStart 会把当前档位的规则集重新注入一遍（off 保持安静）。

## 卸载

UI 里禁用或卸载插件即可；另外用户级还装了一份同内容的 skill（`~/.agents/skills/ponytail*`，6 个），要一起清就删那些目录。

## 已知边界

- hook 用 `"command": "node"`（靠 PATH 解析），所以**需要机器上装了 Node.js**。这是为跨机器分发选的：hook 的声明 schema 是 `.strict()` 的，不支持 `env`，所以没法借用 ZCode 自带的 Electron node（官方插件是靠 MCP 的 `env` 字段设 `ELECTRON_RUN_AS_NODE=1` 才做到的，hook 没有这个字段）。node 不在 PATH 上就改成绝对路径。
- 分发包的生成方式见 `tools/package.js`（默认输出到 `C:\Users\simon\Documents\zcode-plugins`），别手工拷贝，否则两份会漂移。
- 只在本机或分发路径有效——本地市场没发布，换机器要重来一遍（`~/.agents/` 与 `~/.zcode/` 都不在 git 里）。
- 可见的 `ponytail: full` 行是模型按注入指令打印的，不是 hook 直接写进对话；模型偶尔不遵守时，用 `/ponytail` 查档位或看启动时的 `PONYTAIL: loading rules...` 兜底。`PONYTAIL_STATUS=0` 可关闭这行。
- 规则集在 SessionStart 注入约 0.9k tokens，代码库地图最多 2k 字符（约 0.5k tokens）；普通提问不产生任何输出。
- 本仓库 `AGENTS.md` 的核对门禁优先于 ponytail 的「测试也可以 YAGNI」——ponytail 只管少写代码，不能用来砍单测与核对。
- vendored 的 `ponytail-map.js` 有两个上游已知小坑（改它就破坏 sha256 门禁，等上游修）：`PONYTAIL_MAP_CHARS` 设成非数字时字符上限失效；路径含空格的文件/目录会被地图跳过。
- hook 契约（stdout 仅认 JSON 对象、hook 崩溃 fail-open、SessionStart 的 source 枚举 startup/resume/fork/clear/compact 等）已对照 ZCode 3.18.2 源码逐一核实。
