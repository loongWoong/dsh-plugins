# dsh-goal-auto-resume

Goal 异常停止后自动继续的 DSH host 插件。

原生 `goal-round-driver`（dsh-base 挂载）会把已武装（armed）的 active 目标推进为连续的 goal rounds，但它在异常停止时会解除武装（disarm）并放弃：步骤/轮次出错、轮次被中断、输出达到 max-tokens 上限、驱动排队失败，以及进程崩溃重启后的恢复场景。本插件监听同样的信号，在 agent 重新静止后通过 `ctx.goals.resume()` 重新武装目标——原生驱动收到 `goal/changed` 后自行排队下一轮，所有竞态防护与轮次记账仍由原生驱动承担。

## 覆盖场景

| 场景 | 检测信号 | 处理 |
|---|---|---|
| 步骤/轮次出错 | `agent/error` + turn/end `error` | 重新武装 active+disarmed 目标 |
| 轮次被中断（用户/parent/hook 取消） | turn/end `aborted` | 重新武装；轮次中途被取消导致驱动 pause 时救援 paused 目标 |
| 输出达到 max-tokens | turn/end `max-tokens` | 重新武装 |
| 进程崩溃后恢复 | `agent/created` 扫描 + 插件启动扫描 | 自动恢复续跑 |
| 驱动排队失败 | goal 被 block 为 `queue-failed` / `prompt-rejected` | 退避后救援 |

## 安全阀

- 指数退避：连续异常停止时延迟 1.5s → 5s → 10s → …，上限 5 分钟；
- 连续 `GIVE_UP_AFTER`（默认 6）次异常停止且中间没有任何成功完成的轮次后停止自动续跑并记录警告；人工 resume 重置计数；
- 绝不自动续跑：`round-limit`（轮次上限）、模型上报的 blocker、无异常伴随的用户主动 pause、已完成/已清除的目标；
- 任何一次成功完成的轮次都会重置健康计数。

## 配置

常量位于 `lib/index.js` 顶部：`RESUME_AFTER_USER_ABORT`（默认 `true`，用户手动停止后也继续；改 `false` 则尊重用户停止）、`GIVE_UP_AFTER`、`IMMEDIATE_DELAY_MS`、`BACKOFF_BASE_MS`、`BACKOFF_MAX_MS`、`SWEEP_DELAY_MS`、`INFRA_BLOCK_CODES`。

## 安装

一条命令接入，`dsh plugin` 装完会自动把它登记进 profile 的 `dsh.profile.bundles`，无需手工编辑：

```powershell
# 只装这一个
dsh plugin --profile web add "github:loongWoong/dsh-plugins#path:packages/dsh-goal-auto-resume"
# 或整仓库一条命令装五个插件
dsh plugin --profile web add github:loongWoong/dsh-plugins
```

装完重启 DSH（完整说明见[仓库根 README](../../README.md#安装)）。日志输出到 host logger（前缀 `goal-auto-resume:`）。
