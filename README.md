# dsh-plugins

DeepSeek Harness（DSH）插件集：长期记忆、会话归档、会话 Git 化、会话分支树、Goal 自动续跑。

## 插件一览

| 包名 | 功能 | 组成 |
|---|---|---|
| [`dsh-memarc`](packages/dsh-memarc) | 长期记忆库（per-workspace JSON）+ 会话归档管理（归档/全文搜索/批量恢复/彻底删除）+ 设置页 | host + client |
| [`dsh-session-git`](packages/dsh-session-git) | 把 DSH 会话导出为 `<项目>/.dsh-sessions/*.json` 随 Git 提交，团队任何人可一键导入为可继续会话 | host + client |
| [`dsh-session-branches`](packages/dsh-session-branches) | 会话分支关系树（fork / 子代理），侧边栏浮动面板 + 设置页，点击即打开 | host + client |
| [`dsh-goal-auto-resume`](packages/dsh-goal-auto-resume) | Goal 因错误/中断/max-tokens/崩溃异常停止后自动重新武装续跑（带退避与安全阀） | host |

## 环境要求

- DeepSeek Harness（`@deepseek-ai/dsh`）**≥ 0.1.1-rc.2**（实测版本）。插件消费 DSH 的内部服务与事件（`fs`、`sessionQuery`、`sessions`、`connection`、`goals`、`agent/*`、`turn/end` 等），这些契约**没有稳定性承诺**——DSH 升级后如遇不兼容，请在本仓库 issue 里反馈。
- peer 依赖（`@deepseek-ai/cordis`、`@deepseek-ai/dsh-tools`）由 DSH 进程加载插件时提供，**无需安装**。

## 安装

DSH 的 web profile 位于 `~/.dsh/profiles/web/`（Windows 为 `%USERPROFILE%\.dsh\profiles\web\`）。插件通过该目录 `package.json` 的 `dependencies` + `dsh.profile.bundles` 接入，随进程启动自动挂载。

### 方式一：Git 依赖（推荐）

DSH profile 使用 pnpm，支持从 Git 仓库的**子目录**安装单个插件。编辑 `~/.dsh/profiles/web/package.json`：

```jsonc
{
  "dependencies": {
    // 按需挑选，不必全装；<你的用户名> 换成实际 fork/clone 地址
    "dsh-memarc": "github:<你的用户名>/dsh-plugins#path:packages/dsh-memarc",
    "dsh-session-git": "github:<你的用户名>/dsh-plugins#path:packages/dsh-session-git",
    "dsh-session-branches": "github:<你的用户名>/dsh-plugins#path:packages/dsh-session-branches",
    "dsh-goal-auto-resume": "github:<你的用户名>/dsh-plugins#path:packages/dsh-goal-auto-resume"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-memarc",
        "dsh-session-git",
        "dsh-session-branches",
        "dsh-goal-auto-resume"
      ]
    }
  }
}
```

然后在 profile 目录执行 `pnpm install`，重启 DSH。锁定版本可在 hash 里加 tag/commit：`github:<你的用户名>/dsh-plugins#v0.1.0&path:packages/dsh-memarc`。

> 注意：`#path:` 子路径语法是 pnpm 特性，npm 不支持；DSH profile 本身就用 pnpm（目录内有 `pnpm-lock.yaml`），无需额外配置。

### 方式二：克隆到本地 + `file:` 依赖

```powershell
git clone https://github.com/<你的用户名>/dsh-plugins.git "$env:USERPROFILE\.dsh\profiles\web\local\dsh-plugins"
```

```jsonc
// ~/.dsh/profiles/web/package.json
"dsh-memarc": "file:./local/dsh-plugins/packages/dsh-memarc"
```

同样在 `dsh.profile.bundles` 里登记包名，`pnpm install` 后重启 DSH。

> pnpm 对 `file:` 依赖默认做拷贝，源码改动后需重新 `pnpm install`；开发时可用 directory junction 让编辑实时生效，见 [`dsh-session-git` README 的「本地开发」](packages/dsh-session-git/README.md#本地开发源码目录与-node_modules-的链接)。

## 说明与注意事项

- **bundle id 冲突**：每个包通过自带的 `cordis.patch.yml`（`dsh.bundle.patch`）向 composition 插入自己的行（短 id 如 `session-git`、`memarc`）。若同时安装的其他插件占用了相同 id 会加载冲突，改包内 `cordis.patch.yml` 的 id 即可。
- **生效方式**：Host 半区改动需重启 DSH 进程；Client 半区（设置页/浮层）重启后刷新页面生效。
- **卸载**：从 `dependencies` 与 `dsh.profile.bundles` 移除包名，`pnpm install`，重启。`dsh-memarc` 的记忆文件保留在各工作区 `.dsh-memory/`，`dsh-session-git` 导出的会话文件保留在各项目 `.dsh-sessions/`，均不受卸载影响。

## 测试

```powershell
pnpm test
# 或逐个运行：
node packages/dsh-memarc/test/behavior.mjs
node packages/dsh-session-git/test/unit.mjs
```

测试自包含（在临时目录 stub 掉 peer 依赖），用系统 Node 直接运行即可——无需安装依赖、无需 DSH 进程。

## 维护者清单（首次发布）

1. 在 GitHub 创建仓库并 push 本目录；
2. 全局替换 README 中的 `<你的用户名>`；如需 npm 发布，再去掉各 `package.json` 的 `"private": true` 并补 `repository` 字段；
3. 打 tag：`git tag v0.1.0 && git push --tags`，使用者即可用 `#v0.1.0&path:...` 锁定版本。

## License

[MIT](LICENSE)
