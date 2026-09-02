# dsh-session-branches

**Session Branches 插件** —— 会话分支关系可视化。

DSH 支持在新对话中从已有会话 fork 出分支（`parentSession`）、子代理会话（`origin: subagent`），但原生侧边栏只按工作区/时间平铺，看不出分叉关系。本插件把每个工作区的会话按父子关系构建成树，提供两个入口：

1. **侧边栏左下角 ⑂ 浮动按钮**（`shell.overlay` 槽位，纯增量、不替换任何原生 UI）→ 浮动分支树面板；
2. **设置 → 会话分支**（`settings.section` 槽位）→ 同样的树。

## 展示内容

- 按工作区分组（可折叠），组头显示项目路径 + 会话数；父会话在其他工作区的分支单独计数提示；
- 树形缩进 + 引导线展示分叉层级；子代理会话嵌在父会话之下并带 `子代理` 徽章；
- 每行：状态点（🟢 进行中 / 灰 已持久化 / 空心 仅内存）+ 标题 + 徽章（`子代理` / `已归档` / `N 分支`）+ 创建时间；
- 悬停显示会话 id 与继承事件数（seedLength）；
- 顶部标题筛选框（命中节点保留其祖先链）+ 刷新按钮；
- **点击任一会话直接打开**（浮动面板自动收起）。

## 架构

- **Host 半**（`lib/index.js`）：`sessionQuery.listSessions()` 全量枚举 + `readTitleSnapshots` 批量解析标题，按 cwd 分组、按 `parentSession` 建树，经 loopback RPC 通道 `/sesbr`（`connection.rpc.handle`）提供给浏览器；
- **Client 半**（`lib/client.js`）：`shell.overlay` + `settings.section` 两个槽位注册，`connection.rpc.call` 拉取数据，纯 React.createElement 渲染，主题走 `--dsw-alias-*` 变量。

## 安装

通过 profile 的 `package.json` 依赖 + `dsh.profile.bundles` 条目接入，随进程启动自动挂载，Client 模块随页面自动加载（无动态插件的"待激活"步骤）。完整步骤见[仓库根 README](../../README.md#安装)。
