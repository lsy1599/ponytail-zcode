# Ponytail for ZCode

让 ZCode 的 agent 像「懒资深开发」一样干活：先问这事要不要做（YAGNI），能用标准库就不写代码，能一行就不写五十行。规则集来自 [ponytail](https://github.com/DietrichGebert/ponytail)，这里做的是 ZCode 适配层。

## 装之前

需要 **ZCode** 和 **Node.js**（在 PATH 上——hook 靠 `node` 启动；插件自身没有运行时，也不下载任何依赖）。

## 安装

1. 把这份目录放到本机任意位置（例如 `C:\plugins\zcode-plugins`）。
2. ZCode 里打开 **插件市场 → 添加 → 添加插件市场**，粘贴**这个目录的路径**（就是含 `marketplace.json` 的那一层，不是里面的 `ponytail-zcode`）。
3. 在 **个人 → ponytail-zcode-market** 里找到 **Ponytail for ZCode**，点安装。
4. **重启 ZCode**。这一步不能省：插件是在 app 启动时解析的，装完不重启，hook 不会注册。

## 验证装好了

重启后**新建一个任务**（不用发任何指令），规则集会在会话建立时自动注入上下文。你可以这样确认：

- 新任务开始时输入框附近会闪过 `PONYTAIL: loading rules...`；
- 你的第一条提问，回复开头会有一行 `ponytail: full`（当前档位）；
- 问它「当前 ponytail 档位是什么」，**回答 full** 也说明注入成功了（这个信息只可能来自注入的规则集）。

装不上的硬核排查：看 `~/.zcode/cli/log/zcode-<日期>.jsonl` 里 `bootstrap.app.startup.plugins.completed` 那行，`hookCount` 应该是 **2**。还是 0 就是 hook 没被认。

## 用法

规则集**自动生效，不需要触发**。要手动做的只有切档位：

| 想干什么 | 怎么写 |
|---|---|
| 用它（默认） | 什么都不用做，默认 **full** 档 |
| 切档位 | `ponytail ultra`（也可 `lite` / `full`） |
| 查当前档位 | `ponytail` |
| 确认是否启动 | 看第一条回复开头是否有 `ponytail: full` |
| 关掉 | `ponytail off`、`stop ponytail`、`normal mode` |
| 改默认档位 | `ponytail default ultra`，新会话生效 |

带不带前缀 `/` 都认，但**建议不带**：ZCode 输入 `/` 会弹命令选择器，前缀可能被拦掉。句子中间提到 ponytail 不会误触发（只认消息开头 + 四个档位词）。

代价：每个新会话注入约 1.4k tokens（规则集约 0.9k + 代码库地图上限 2k 字符），普通提问不产生任何额外输出。地图嫌费可在系统环境里设 `PONYTAIL_MAP=0` 关掉；不想要回复开头的 `ponytail: full` 状态行就设 `PONYTAIL_STATUS=0`。

## 升级

对着这份目录覆盖成新版本，然后在 ZCode 的 **插件市场 → 市场源** 里找到 `ponytail-zcode-market` 点刷新，再回 **个人** 打开插件点**更新**。源码改了不会热重载，必须走「刷新 + 更新」。

想让升级自动一些，可以把它推到一个 GitHub 仓库，别人改用**仓库地址**添加市场，之后刷新即可拿到新版本。

## 卸载

**设置 → 插件** 里禁用或卸载即可。本插件不写注册表、不改 ZCode 配置以外的任何东西；档位状态按会话存在 `~/.zcode/cli/plugins/data/ponytail-zcode@*/` 下，删掉该目录即可清干净。

## 许可与归属

规则集与 `hooks/ponytail-config.js`、`hooks/ponytail-instructions.js`、`hooks/ponytail-map.js`、`skills/ponytail/SKILL.md` 来自 [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail)，**MIT，原样未改**（见同目录 `LICENSE`）。本目录下另外三个文件（`hooks/zcode-*.js`）与 `hooks/hooks.json`、`.zcode-plugin/plugin.json` 是 ZCode 适配层：上游的 hook 只往 stdout 写纯文本（Claude Code 的契约），而 ZCode 只在 stdout 是 JSON 对象时才读，所以规则集注入不到对话里——适配层重写了输出格式与状态落盘位置，规则集仍由上游的函数生成。上游 5 的 `band` 是 Claude Code 状态栏功能，ZCode 没有对应机制，`/ponytail band` 会被忽略。
