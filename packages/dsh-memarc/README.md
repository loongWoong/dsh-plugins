# dsh-memarc

DeepSeek Harness（DSH）本地插件：**长期记忆库 + 会话归档管理**。

## 功能

### 记忆（per-workspace）
- 记忆以 JSON 存于当前工作区 `<workspace>/.dsh-memory/memory.json`（通过 `ctx.fs`，写入受会话沙箱策略约束，workspace-write 不会越界）。
- 每条记忆：`id / text / tags / createdAt / updatedAt / sessionId`。
- 模型工具：`memory_save`、`memory_search`、`memory_list`、`memory_delete`。

### 会话归档
- 复用 `workspaceRegistry.archiveSession`：会话从侧边栏所有分组隐藏，日志保留、可打开。
- 复用 `sessionQuery` 做归档列表、标题解析与全文搜索。
- 模型工具：`session_archive`（缺省归档当前会话）、`session_unarchive`（单个/批量取消归档）、`archive_list`、`archive_search`。

### 归档管理（设置页，loopback 专用）
- 归档列表支持**复选框多选**（全选/计数），批量操作：
  - **取消归档**：把选中会话移回侧边栏分组视图（日志不动，可逆）。走 registry 自身的
    `enqueueOperation`/`setState`，域状态变更会实时推送 `host/archived-sessions-changed`。
  - **删除**：两步确认后**永久删除**选中会话及其日志目录（`sessionPersistence.locate`
    定位，回退为按会话 id 扫描存储根；`rm -rf` 会话目录）。删除时：
    - 正在使用中（live）的会话被拒绝（reason: `live`）；
    - 未在归档集合中的 id 被拒绝（reason: `not-archived`）；
    - 无日志的幽灵条目直接清理（reason: `missing`）；
    - 成功后清理 registry 头缓存、detach 工作区记账、移出归档集合。
  - 删除 RPC（`arc/delete`）仅限本机回环页面调用，**不暴露为模型工具**。
- 测试：`node test/behavior.mjs`（mock ctx + 真实临时目录，覆盖取消归档/删除全链路）。

### 设置页
- 设置 → 「记忆与归档」：记忆增删查 + 归档列表/全文搜索/点击打开会话。
- 数据通道：`connection.rpc` 私有频道 `/memarc`，`authority: loopback`（仅本机页面可调用）。

## 安装

通过 profile 的 `package.json` 依赖 + `dsh.profile.bundles` 条目接入（完整步骤见[仓库根 README](../../README.md#安装)）。

修改后：Host 半（`lib/index.js`）需**重启 DSH** 生效；Client 半（`lib/client.js`）由
`/plugins/<id>/client.js` 每次请求现读磁盘，重启后刷新页面即生效。

## 卸载
1. 从 `package.json` 的 `dependencies` 与 `dsh.profile.bundles` 移除 `dsh-memarc`，`pnpm install`；
2. 重启 DSH。记忆文件本身保留在各工作区的 `.dsh-memory/` 下。
