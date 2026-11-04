# ponytail-zcode

[Ponytail](https://github.com/DietrichGebert/ponytail)（「懒资深开发」模式）的 ZCode 适配插件：会话开始时把规则集注入上下文，让 agent **写更少的代码**——省钱（token）、省时间、改动一眼能读懂。

```
agent 写:   200 行通用抽象 + 配置项 + 工厂函数
ponytail:   12 行最小完整改动，够用且只有够用
```

## 原理

| Hook | 事件 | 作用 |
|------|------|------|
| `hooks/zcode-session-start.js` | SessionStart | 注入「懒资深开发」规则集 + 代码库地图（3 秒超时 / 64KB 上限，`PONYTAIL_MAP=0` 可关） |
| `hooks/zcode-prompt.js` | UserPromptSubmit | 处理 `/ponytail lite|full|ultra|off` 档位切换（按会话存档于 `~/.zcode/ponytail/`） |

上游的 6 个 skill 之一（ponytail）随插件安装，`/ponytail` 命令由 hook 实现，不依赖 ZCode 的斜杠命令注册。上游文件（`ponytail-config.js`、`ponytail-instructions.js`、`ponytail-map.js`、SKILL.md）**原样搬运，未改一行**；ZCode 适配全部在 `zcode-*.js` 适配层。

## 前置条件

- **ZCode ≥ 3.1.8**（需要 hooks 支持，3.17.x 已验证）
- **node** 在 PATH 上（hook 是 node 脚本，无其他依赖）

## 安装

**方式一（推荐）：插件市场**

1. 打开 ZCode → **设置 → 插件管理 → 发现** → 点「+」添加插件市场
2. 粘贴本仓库地址：`https://github.com/lsy1599/ponytail-zcode`
3. 安装列表中的 **Ponytail 省钱模式（ZCode 适配）**（ponytail-zcode）插件
4. 重启 ZCode

**方式二（手动）：**

clone 本仓库到 ZCode 插件目录 `~/.zcode/plugins/ponytail-zcode`，然后在 `~/.zcode/cli/config.json` 的 `plugins` 块注册：

```jsonc
"plugins": {
    "dirs": ["C:\\Users\\<你>\\.zcode\\plugins\\ponytail-zcode"],
    ...
}
```

重启 ZCode 生效。

## 验证

1. 重启后新会话开头应出现「懒资深开发」规则注入（SessionStart）
2. 发送 `/ponytail full`，agent 回复 `ponytail: full`，之后改动明显变克制
3. 档位按会话记忆，`/ponytail off` 关闭；插件自带回归自测可跑：`node tests/acceptance.js`

## 回滚

市场安装：设置 → 插件管理 → 卸载 ponytail-zcode。手动安装：从 `plugins.dirs` 删掉那一行。两种方式都不修改 ZCode 其他文件。

## 目录结构

```
ponytail-zcode/                      # 仓库根 = 插件市场根
├── marketplace.json                 # 市场清单
└── ponytail-zcode/                  # 插件本体（目录名 = 插件名）
    ├── .zcode-plugin/plugin.json    # 插件清单（声明 hooks）
    ├── hooks/
    │   ├── hooks.json               # SessionStart + UserPromptSubmit 注册
    │   ├── zcode-lib.js             # ZCode 适配核心（JSON stdout、会话存档）
    │   ├── zcode-session-start.js   # 规则注入
    │   ├── zcode-prompt.js          # /ponytail 档位解析
    │   ├── ponytail-config.js       # 上游原样
    │   ├── ponytail-instructions.js # 上游原样
    │   └── ponytail-map.js          # 上游原样（代码库地图）
    ├── skills/ponytail/SKILL.md     # 上游原样（MIT）
    ├── tests/acceptance.js          # 59 断言回归自测
    └── LICENSE                      # 上游 MIT
```

## 许可与致谢

- 上游 [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail)（MIT，本包对应 commit `09c434a` = v5.3.2）
- 本仓库是它的 ZCode 适配层（hooks 输出 ZCode 要求的 JSON 格式、会话级档位存档），上游文件未改动，沿用 MIT，见 [LICENSE](ponytail-zcode/LICENSE)
