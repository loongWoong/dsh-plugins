# dsh-plugins

DeepSeek Harness（DSH）插件集：长期记忆、会话归档、会话 Git 化、会话分支树、Goal 自动续跑、模型推理能力/推理强度编辑。

**本仓库自身就是一个可安装单元**：根 `package.json` 声明了 `dsh.bundle`，根 `cordis.patch.yml` 是聚合装配清单，所以插件中心 / hub 的「按仓库一键安装」直接把整个仓库当成一个插件装进 profile——无需克隆、无需构建。

## 插件一览

| 包名 | 功能 | 组成 |
|---|---|---|
| [`dsh-memarc`](packages/dsh-memarc) | 长期记忆库（per-workspace JSON）+ 会话归档管理（归档/全文搜索/批量恢复/彻底删除）+ 设置页 | host + client |
| [`dsh-session-git`](packages/dsh-session-git) | 把 DSH 会话导出为 `<项目>/.dsh-sessions/*.json` 随 Git 提交，团队任何人可一键导入为可继续会话 | host + client |
| [`dsh-session-branches`](packages/dsh-session-branches) | 会话分支关系树（fork / 子代理），侧边栏浮动面板 + 设置页，点击即打开 | host + client |
| [`dsh-goal-auto-resume`](packages/dsh-goal-auto-resume) | Goal 因错误/中断/max-tokens/崩溃异常停止后自动重新武装续跑（带退避与安全阀） | host |
| [`dsh-model-reasoning`](packages/dsh-model-reasoning) | 三段式设置页（全局策略 / 路由概览 / 模型明细）编辑推理能力与推理强度：思考等级映射（wire 值）、上下文/输出上限、协议兼容开关，缺能力的模型行内一键声明；另有输入框里模型下拉左侧的会话级强度滑杆。直写 `llm-pi-ai` 命名空间即时生效 | host + client |

## 推理强度：两层控制

| 位置 | 作用范围 | 落到哪里 |
|---|---|---|
| 设置页「推理能力」· ① 全局滑杆 | 勾选的每个路由 | `providers.<路由>.reasoning`（可顺带写 `agent-default-model.reasoningEffort`） |
| 输入框 · 模型下拉左侧的滑杆 | 当前会话 | 会话的模型选择本身，与模型下拉、`/model` 共用同一份状态；优先于路由默认 |

滑杆写入前按该路由**模型实际支持的等级**适配——请求路径对不支持的等级直接抛 `UNSUPPORTED_REASONING_EFFORT`，不会降级，所以预览必须说清「这一档在这条路由上实际会写成什么」。条目上缺 `reasoningEfforts` 的模型可以被顺带声明：「没有推理元数据」是**配置缺口**，不是模型不会思考。细节见 [dsh-model-reasoning README](packages/dsh-model-reasoning/README.md#推理强度的两层控制)。

## 环境要求

- DeepSeek Harness（`@deepseek-ai/dsh`）**≥ 0.1.1-rc.2**（实测版本）。插件消费 DSH 的内部服务与事件（`fs`、`sessionQuery`、`sessions`、`connection`、`goals`、`agent/*`、`turn/end` 等），这些契约**没有稳定性承诺**——DSH 升级后如遇不兼容，请在本仓库 issue 里反馈。
- peer 依赖（`@deepseek-ai/cordis`、`@deepseek-ai/dsh-tools`、`react`）由 DSH 进程加载插件时提供，**无需安装**。本仓库零运行时依赖，离线也能装。

## 安装

### 方式一：整仓库一键安装（推荐，也是 hub 走的路）

```powershell
dsh plugin --profile web add github:loongWoong/dsh-plugins
```

一条命令装五个插件。`dsh plugin` 是 pnpm 转发器：装完后它会按**已安装状态**做 reconcile——凡依赖里声明了 `dsh.bundle.patch` 的包自动进入 profile 的 `dsh.profile.bundles` 层栈，所以 `dsh.profile.bundles` 里只会出现一个 `dsh-plugins`，不需要手工登记。重启 DSH 后，根装配清单把五行插进 composition。

卸载：`dsh plugin --profile web remove dsh-plugins`（同样自动从层栈摘掉）。

### 方式二：只装其中某个插件

```powershell
dsh plugin --profile web add "github:loongWoong/dsh-plugins#path:packages/dsh-memarc"
```

此时那个成员包自己就是 layer，用它包内的 `cordis.patch.yml`（行名是包名）。`#path:` 子路径是 pnpm 特性，npm 不支持；DSH profile 本身就用 pnpm，无需额外配置。

### 方式三：本地开发（改源码即时生效）

```powershell
# 在仓库根目录执行；dsh plugin 会把相对路径 spec 重写成绝对路径，不会自连 profile
dsh plugin --profile web add .
```

pnpm 对 `file:` 依赖默认做拷贝，源码改动后需再跑一次 `dsh plugin --profile web install`；想让编辑实时生效可用 directory junction，见 [`dsh-session-git` README 的「本地开发」](packages/dsh-session-git/README.md#本地开发源码目录与-node_modules-的链接)。

### 整仓库 vs 单插件的区别

| | 整仓库（方式一） | 单插件（方式二） |
|---|---|---|
| profile 依赖 | 1 个 `dsh-plugins` | N 个成员包 |
| `dsh.profile.bundles` | `dsh-plugins` 一层 | 每个成员各一层 |
| 生效的装配清单 | 仓库根 `cordis.patch.yml` | 成员包内 `cordis.patch.yml` |
| 装配行 `name` | 相对路径 `./packages/<pkg>/lib/index.js` | 包名 `dsh-<pkg>` |
| 升级 | 一次更新五个插件 | 逐个更新 |

**为什么根清单用相对路径而不是包名**：pnpm 安装 git 依赖时，包内的 `file:./packages/x` 会被解析到消费者目录（`ERR_PNPM_LINKED_PKG_DIR_NOT_FOUND`），`workspace:*` 也拿不到被拉取的 workspace（`ERR_PNPM_WORKSPACE_PKG_NOT_FOUND`），而 pnpm 的严格布局不会把传递依赖提升到 profile 顶层 `node_modules`——按包名解析必然落空。DSH 的 `anchorInsertedPluginNames` 会把 `insert` 行里以 `./` 开头的 `name` 重写成**该清单文件旁边**的 file URL，Host 半区于是直接从安装目录里的成员入口加载；Client 半区由 `@deepseek-ai/dsh-client-modules` 的 `locatePkgJson` 沿同一个入口向上找到成员自己的 `package.json`，成员各自的 `dsh.client.platform` / `exports["./client"]` 照常生效。因此聚合根**没有** `dependencies`，也**不能**声明 `dsh.client`（自己既无浏览器半区也无 `./client` 导出，声明了会让 client-modules 直接报错）。

> 改某个成员插件的入口路径或装配方式时，仓库根 `cordis.patch.yml` 和该成员包内的 `cordis.patch.yml` 两份要一起改。

已实测路径：临时 git 仓库 → `dsh plugin --profile probe add git+file:///...` → 只装 1 个包、`dsh.profile.bundles` 自动出现 `dsh-plugins` → `dsh --profile probe --dump-config` 中五行分别解析到 `node_modules/dsh-plugins/packages/*/lib/index.js`，四个客户端半区的归属清单各自正确。

## 说明与注意事项

- **bundle id 冲突**：每个插件向 composition 插入自己的行（短 id 如 `session-git`、`memarc`）。若同时安装的其他插件占用了相同 id 会加载冲突，改对应 `cordis.patch.yml` 的 id 即可。
- **不要同时用两种方式**：整仓库安装与单插件安装若同时启用，同一个插件会被挂两次（两个 layer、重复的服务/工具注册）。选一种即可。
- **生效方式**：Host 半区改动需重启 DSH 进程；Client 半区（设置页/浮层/输入框控件）重启后刷新页面生效。
- **卸载**：见上面的 `remove` 命令。`dsh-memarc` 的记忆文件保留在各工作区 `.dsh-memory/`，`dsh-session-git` 导出的会话文件保留在各项目 `.dsh-sessions/`，均不受卸载影响。

## 测试

```powershell
npm test
# 或逐个运行：
node packages/dsh-memarc/test/behavior.mjs
node packages/dsh-session-git/test/unit.mjs
node packages/dsh-model-reasoning/test/unit.mjs
```

测试自包含（在临时目录 stub 掉 peer 依赖），用系统 Node 直接运行即可——无需安装依赖、无需 DSH 进程。

## 维护者清单

1. 在 GitHub 创建仓库并 push 本目录（`pi-web-main/`、`scratch/` 已进 `.gitignore`，是本地参考资料，不属于可安装内容）；
2. 打 tag：`git tag v0.1.0 && git push --tags`，使用者可用 `#v0.1.0` 锁定版本；
3. 提交 hub / 插件中心条目时 `install` 字段填 `dsh plugin --profile web add github:loongWoong/dsh-plugins`；
4. **npm 名称**：`dsh-plugins` 在 npm 上已被他人占用（一个无关的 `dsp` CLI）。git 安装不受影响；若要发 npm 需换名或加 scope。五个成员名（`dsh-memarc` 等）目前未被占用，成员各自发布后，用户可直接 `dsh plugin --profile web add dsh-memarc` 按包名安装。

## License

[MIT](LICENSE)
