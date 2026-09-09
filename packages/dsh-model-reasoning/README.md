# dsh-model-reasoning

DSH 的「模型」设置页刻意**不提供推理强度控制**（见 DSH 自带 Models 页的说明）。这个包补上那块能力：新增一个 **「推理能力」** 设置分区，按 Provider / 模型直接编辑 `settings.yaml` 的 `llm-pi-ai` 命名空间——交互参考 pi-web 的模型编辑器（能力 / 模型规格 / 高级设置 · 思考等级映射）。

写入即生效：pi-ai 适配器每次请求都重读 profile，**不需要重启 DSH**。

## 能改什么

| 界面 | 落到配置的字段 | 说明 |
|---|---|---|
| 能力 · 推理 / 思考 | `models[].reasoningEfforts` | `继承`＝不写字段（用 pi-ai 目录）；`不支持推理`＝`false`；`自定义等级`＝等级字典 |
| 思考等级表（7 行） | `reasoningEfforts.<level>` | `off/minimal/low/medium/high/xhigh/max` 每行勾选 + **wire 值**（真正发给端点的字符串）；只有 `off` 可留空＝不发送参数 |
| 能力 · 图片输入 | `models[].input` | `继承` / `['text']` / `['text','image']` |
| 上下文窗口 | `models[].contextWindow` | 生效的上下文预算 |
| 最大输出 tokens | `models[].maxTokens` | 端点自身封顶之外的每模型上限 |
| 兼容性开关 | `models[].compat.<gate>` | 只列出该路由协议**真正读取**的字段：openai-completions 13 项（含 `thinkingFormat`、`maxTokensField`、`supportsReasoningEffort`…）、openai-responses 3 项、anthropic-messages 7 项；每项三态：继承 / 支持 / 不支持 |
| 默认推理强度（③ 面板头，作用于当前路由） | `providers.<route>.reasoning` | 选「— 继承 —」即 `unset` |
| 发送一次探测请求 | 不写配置 | 用选定等级发一句「只回复 OK」，回报是否真有思考返回、思考字数、`finish` 原因 |

## 界面结构（三段式）

| 分区 | 内容 | 为什么这样分 |
|---|---|---|
| ① 全局策略 | 默认强度滑杆 + 逐路由适配预览（路由 / 写入 / 依据 三列）+ 两个策略开关 + 执行按钮 | 档位、影响面、策略开关、执行动作是四个不同维度，分开放，减少误操作；「滑杆只写默认值」写在滑杆下方而不是角落小字 |
| ② 路由概览 | 一行一条路由：名称 / 协议 / 模型数 / 默认强度 / `X/Y 可推理` + 待声明·未知·已关计数 / 状态；点一行选中它并展开端点与模型名单 | 取代原来「概览列表 + 胶囊 tab」的重复导航；长注释（端点路径、模型名单）只占一格，超出省略号、完整内容在 `title` |
| ③ 模型明细 | 路由下拉 + 搜索 + 「只看需要处理」，下面是网格表格：模型 / 能力 / 思考等级 / 输入 / ctx / 输出 / 来源 | 列宽由网格统一定义，`ctx` 按 1024 进制缩写（`1048576` → `1M`）并右对齐；点行展开编辑器 |

- 告警色只留给「配置缺口 / 读不到」，并且**就地给出入口**：能力还没声明的模型，行里直接是「声明能力」按钮，一次点击只写 `reasoningEfforts`（局部 patch，`ctx` / `input` / `compat` 原样保留），不必先进编辑器再翻控件。
- 每次写入都有回执：右下角 toast（`已写入 N 个路由默认 · 声明了 M 个模型的能力`），页面顶部显示「读取于 hh:mm:ss」。
- 一个搜索框同时收窄路由列表与当前路由的模型列表；选中的路由始终保留在列表里，搜一下不会把当前上下文弄丢。

## 推理强度的两层控制

| 位置 | 作用范围 | 落到哪里 |
|---|---|---|
| 设置页 · 全局默认滑杆 | 勾选的每个路由 | `providers.<route>.reasoning`（可顺带写 `agent-default-model.reasoningEffort`） |
| 输入框 · 模型下拉左侧的滑杆 | 当前会话 | 会话的模型选择本身，与模型下拉、`/model` 共用同一份状态；优先于路由默认 |

- **全局滑杆按路由适配**：写入前取该路由**所有模型都支持**的等级交集。请求的等级不在交集里就落到最近的等级（你要思考，它就不会偷偷把思考关掉）；确实没有一个模型能思考则**跳过该路由**——否则 `resolveReasoningLevel` 会在发请求时直接抛 `UNSUPPORTED_REASONING_EFFORT`。预览与写入共用同一张适配表，所见即所写。
- **「没有推理元数据」≠「模型不会思考」**。条目上没写 `reasoningEfforts` 的模型（手填的那些，以及 pi-ai 目录里被标成不推理的），在 `getSupportedThinkingLevels` 眼里只认 `off`——这是**配置缺口**，不是能力上限。两条修法：模型行里的「声明能力」按钮（只补这一个字段），或勾上「顺带声明还没配置能力的模型」让滑杆批量补 `off/minimal/low/medium/high`（wire 值＝等级名）再写路由默认——批量那条把两步放在**同一次 `mutate`** 里，要么都成功要么都不写。之后照样能在模型卡片里逐档改 wire 值、删掉不该给的等级。
- 三类「现在写不了」分得清清楚楚，行内徽标与 toast 用词一致：`声明能力`（按钮）＝配置缺口，点一下就好；`已关推理`＝你显式写了 `reasoningEfforts: false`，本包永不擅自改它，它会挡住路由的思考档位并在预览里点名；`能力未知`＝`resolveModelInfo` 解析失败，既不写也不瞎猜，附错误原文。
- **输入框滑杆只列当前模型声明的等级**，最左的「默认」＝不写 `reasoningEffort`，请求回落到路由默认（即全局滑杆写入的值）。拖动只预览，松手才提交一次；模型没有推理元数据、或会话是被点名的子代理时不渲染。

## 写入语义（重要）

只发**路径寻址**的 `settings.mutate` op，绝不整份覆盖 provider，因此 `apiKeyEnv`、`baseURL` 以及本包不认识的字段一律存活：

- 有 `models` 列表的路由（自建/手填端点几乎都是）：`set ['providers', <route>, 'models']`，数组整体替换但只改命中的那一条（`applyPathOp` 不能按下标寻址，所以必须整数组写）；
- 没有 `models` 列表的 catalog 路由：逐字段 `set`/`unset` `['providers', <route>, 'modelOverrides', <id>, <field>]`（在有 `models` 列表的路由上写 `modelOverrides` 会被适配器 `assertServiceable` 拒绝，界面不会这么干）；
- 每次写入带 `expectedRevision`，配置被别处改过会报冲突而不是静默覆盖；
- `input: []`、`compat: {}` 这类配置层物化出来的空壳会被清掉，不写回文档。

校验在界面层就复刻了适配器规则，写进去才被拒的情况基本没有：等级字典不能为空、至少要有一个 `off` 以外的等级、非 `off` 的 wire 值不能为空、未知等级名一律拒绝、`contextWindow`/`maxTokens` 必须正整数、枚举取值限定在协议支持的集合内。

## 安装

```powershell
# 只装这一个
dsh plugin --profile web add "github:loongWoong/dsh-plugins#path:packages/dsh-model-reasoning"
# 或整仓库一条命令装五个插件
dsh plugin --profile web add github:loongWoong/dsh-plugins
```

`dsh plugin` 装完会自动把它登记进 profile 的 `dsh.profile.bundles`，无需手工编辑（完整说明见[仓库根 README](../../README.md#安装)）。重启 DSH 后打开「设置 → 推理能力」；输入框左侧那条强度滑杆属于 Client 半区，重启后刷新页面即出现——它懒依赖 `modelDirectories`，该服务不在时设置页照常可用，只是那条滑杆不渲染。

## 组成

- `lib/index.js` — Host 半区。消费 `settings`、`llm`、`connection`（可选 `agentDefaultModel`、`timer`），不发布任何服务，因此不需要 isolate realm。通过 loopback-only 的 RPC 通道 `/model-reasoning` 提供 `snapshot` / `save` / `test`。
- `lib/client.js` — Client 半区。手写形式的 `window.__ModuleLoader__` 模块（**无需构建**），注册 `settings.section` 与输入框席位 `conversation.input.left`（`id: model-reasoning-effort`，懒依赖 `modelDirectories`），React 取自 `require("react")`，样式随 Fiber 卸载。
- `cordis.patch.yml` — 向 composition 插入 `id: model-reasoning` 一行。

RPC 载荷只走无损 JSON：Host 侧把所有缺字段规范化为 `null`（`undefined` 会被 runner 直接拒掉），Client 侧 `null`/`undefined` 都按缺省处理。

## 本地开发

源码目录与 `node_modules` 的链接方式见 [`dsh-session-git` README](../dsh-session-git/README.md#本地开发源码目录与-node_modules-的链接)。改 Host 半区要重启进程；改 Client 半区重启后刷新页面。

## 测试

```powershell
node packages/dsh-model-reasoning/test/unit.mjs
```

自包含：用 stub 的 `settings` / `llm` / `connection` 跑 Host 半区（含无损 JSON 断言、写入路径与并发冲突、校验拒绝），并用 stub 的 `window.__ModuleLoader__` + React 在 `node:vm` 里渲染 Client 半区（等级表预填、兼容开关数量、继承/自定义模式切换、全局滑杆的路由适配预览、输入框席位的档位来源与「拖动不写盘 / 默认档不写 `reasoningEffort`」）。无需 DSH 进程、无需安装依赖。

## 已知边界

- 「自定义等级」是**整份替换**该模型的等级表：没勾的等级即视为不支持，这是适配器的语义，不是本包的取舍。
- 探测请求是真实调用端点，会计费、会占配额；只发一句话、`maxTokens: 64`、45 秒超时。
- 本包不管理 API Key、不改 `baseURL`/`api`，也不新增模型条目——那些仍归 DSH 自带「模型」页。
- 消费的是 DSH 内部服务契约（`settings`、`llm`），**没有稳定性承诺**；DSH 升级后不兼容请在仓库 issue 反馈。

## License

[MIT](../../LICENSE)
