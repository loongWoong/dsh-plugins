# dsh-session-git

**Session Git 插件** —— 把 AI 会话从"个人孤岛"变成"团队资产"。

将 DSH 会话（Session）视为可版本化的项目资产：导出为项目路径下的 JSON 文件，随代码一起提交到 Git；团队成员拉取代码后一键导入，在会话列表中打开即可**完整复现之前的协作现场**并继续对话。

## 工作方式

保存目录：`<项目根>/.dsh-sessions/*.json`（自动创建，建议提交到 Git）。

导出文档携带**完整原始会话日志**：用户消息、助手输出、每一次工具调用与结果、compaction 历史、标题、todos、goal 状态，以及会话头（创建时间、原工作目录、agent 预设等）。格式：

```json
{
  "format": "dsh-session-git/v1",
  "savedAt": 1787000000000,
  "savedBy": "session-…（保存者）",
  "session": { "version": 0, "id": "…", "createdAt": …, "cwd": "…", "agentPreset": "…" },
  "title": "会话标题",
  "stats": { "events": 123, "userMessages": 10, "assistantMessages": 10, "toolCalls": 25, "turns": 6 },
  "eventCount": 123,
  "events": [ …原始事件日志，元数据在后、事件在前，便于大文件只读头部… ]
}
```

> 限制：二进制图片附件存放在附件库中，不随文件迁移；文本级内容全部保留。

## 模型工具（5 个）

| 工具 | 用途 |
|---|---|
| `session_git_save` | 导出会话到 `<项目>/.dsh-sessions/`。默认当前会话；`all: true` 保存该工作区最近 20 个 |
| `session_git_sessions` | 列出某工作区名下的 DSH 会话（保存候选） |
| `session_git_list` | 列出 `.dsh-sessions/` 下已保存的会话文件（大文件只读头部 256KB 元数据） |
| `session_git_show` | 预览一个会话文件（标题、统计、第一条用户消息、用过的工具），不导入 |
| `session_git_load` | 导入为一个**新会话**：写入本机持久存储，出现在会话列表，打开即可继续对话；原文件不受影响，可重复导入 |

## 典型流程

**A 同事（分享）**：会话里说"把这个会话保存到项目里" → `session_git_save` → `git add .dsh-sessions && git commit && git push`。

**B 同事（复用）**：`git pull` → 会话里说"列出项目里保存的会话，挑一个加载" → `session_git_list` → `session_git_show` 预览 → `session_git_load` → 侧边栏出现该会话 → 打开，完整上下文（含所有工具调用历史与中间产物）就位，直接继续协作。

## 交互界面（Settings 页）

设置页新增 **Session Git** 分区（loopback 连接下可用），两个标签页：

- **保存到项目**：列出当前项目路径下的 DSH 会话（标题、时间、预设、进行中/已持久化徽标），勾选多个后一键"保存选中"到 `<项目>/.dsh-sessions/`；显示保存结果（文件、事件数、体积、失败原因）。
- **从项目加载**：列出 `.dsh-sessions/` 下已保存的会话文件（标题、时间、事件数、体积、来源项目徽标），支持单文件"预览"（原会话信息、规模统计、用过的工具、第一条用户消息）与多选"加载选中"；导入成功后每条结果带"打开"按钮，点击直接在会话列表中打开该原生会话。

顶部可输入/切换项目根路径（留空 = 当前工作区，即最新会话的 cwd 或工作区根），"应用"后两个列表同步刷新。

UI 通过 Client→Host RPC 通道 `/session-git`（loopback-only）调用与模型工具相同的一组操作：`session/list`、`git/list`、`git/show`、`git/save`（批量）、`git/load`。

## 设计要点

- **导入 = 新会话，热加载**：生成全新 session id（`session-<hex>`），通过 `ctx.sessions.create(id, { seed, meta })` 进入内存 SessionStore 并广播 `session/created`——API proxy 转发为 `host/session-added` 帧，侧边栏**即时上插，无需重启**；持久化协调器监听同一事件自动落盘，`sessions.flush()` 等待写完。`meta` 保留原会话的 `createdAt`/`agentPreset`/`parentSession`，`cwd` 指向当前项目路径（会话归入当前项目），原生 resume 链路完整可用。注意：导入的会话挂在插件 fiber 上，若停止/更新 session-git 插件，它们会从内存 store 退出（磁盘日志仍在，重启后恢复）。
- **幂等文件名**：`session-<标题slug>-<原id尾8位>.json`，同一会话重复保存覆盖同一文件，对 Git 友好。
- **大文件友好**：原始日志含 token 级 `assistant/chunk` 事件，大会话文件可达数十 MB。fs 服务的 `readText` 有 256KB 硬上限、`readBytes` 的 maxBytes 约束**完整内容**（超限文件整体拒绝，并非前缀读取），两者都不能用于会话文件；本插件所有读取都走 `fs.streamText` 流式解码——`list` 用"流式 + 提前 break"实现真前缀读取（只扫头部 256K 字符元数据，元数据序列化在前、事件数组在后），读取/导入整流读完（实测 10.4MB / 42,220 事件文件 29ms 读完、529ms 完成导入）。
- **校验失败即报错**：格式版本、事件 seq 连续性（从 0 开始）在导入前校验，损坏文件不会写坏本机存储。
- **保留 `agentPreset`**：导入会话沿用原预设 id；若本机没有该预设，由 DSH 预设解析的默认回退处理。

## 安装

一条命令接入，`dsh plugin` 装完会自动把它登记进 profile 的 `dsh.profile.bundles`，无需手工编辑：

```powershell
# 只装这一个
dsh plugin --profile web add "github:loongWoong/dsh-plugins#path:packages/dsh-session-git"
# 或整仓库一条命令装五个插件
dsh plugin --profile web add github:loongWoong/dsh-plugins
```

装完重启 DSH（完整说明见[仓库根 README](../../README.md#安装)）。纯 host 行 + client 半区（设置页），消费 `fs` / `sandboxPolicy` / `sessionQuery` / `sessionPersistence` / `sessions` / `connection` / `tools`，无 isolate realm。

### 本地开发：源码目录与 node_modules 的链接

pnpm 对 `file:` 依赖默认做**拷贝**，`node_modules/<pkg>` 会滞后于源码（表现为重启后仍加载旧版本）。把 `node_modules/<pkg>` 替换为指向源码目录的 **directory junction** 即可让源码编辑实时生效，无需重新 install。若 pnpm install 把 junction 还原成拷贝，用以下命令恢复（PowerShell；`$local` 指向本仓库 clone 出来的 `packages/` 目录）：

```powershell
$nm = "$env:USERPROFILE\.dsh\profiles\web\node_modules"; $local = "<本仓库路径>\packages"
foreach ($pkg in @('dsh-memarc','dsh-goal-auto-resume','dsh-session-git')) {
  $dst = Join-Path $nm $pkg
  if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
  New-Item -ItemType Junction -Path $dst -Target (Join-Path $local $pkg) | Out-Null
}
```

host 半区改动需重启 DSH 进程生效；client 半区（`lib/client.js`）在 dev watcher 运行时由 HMR 轮询自动重载，新增 client 入口（首次）需重启一次进入模块图。
