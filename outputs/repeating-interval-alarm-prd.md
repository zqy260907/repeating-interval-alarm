# Repeating Interval Alarm PRD

## 1. 项目目标

实现一个可配置的循环闹钟能力，用于支持“周期性提醒 + 短时持续提示”的场景。

用户可以定义：

- 每隔固定时间间隔触发一次响铃
- 每次响铃持续固定时长后自动停止
- 重复指定次数后自动结束任务
- 可选：创建后立即启动

典型场景：

- 每 5 分钟提醒一次，每次响 10 秒，共 5 次
- 每 30 秒提醒一次，每次响 3 秒，无限循环直到手动停止

## 2. 范围

### 2.1 本期范围

- 创建单个循环闹钟任务
- 启动任务
- 停止任务
- 按固定间隔触发响铃
- 按固定持续时间关闭响铃
- 按 `repeatCount` 精确控制响铃次数
- 支持 `autoStart`
- 支持 `repeatCount = -1` 表示无限循环
- 暴露当前任务状态与剩余次数

### 2.2 可预留扩展

- 暂停 / 恢复
- 多任务并行管理
- 音频、UI 提示、振动等响铃通道
- 任务持久化与跨页面恢复

## 3. 参数定义

闹钟任务配置如下：

```json
{
  "intervalSeconds": 300,
  "ringDurationSeconds": 10,
  "repeatCount": 5,
  "autoStart": true
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `intervalSeconds` | number | 是 | 每次响铃开始前等待的时间，单位秒 |
| `ringDurationSeconds` | number | 是 | 每次响铃持续时间，单位秒 |
| `repeatCount` | number | 是 | 总响铃次数；`-1` 表示无限循环 |
| `autoStart` | boolean | 否 | 是否创建后立即启动，默认 `false` |

参数约束：

- `intervalSeconds` 必须大于 0
- `ringDurationSeconds` 必须大于 0
- `repeatCount` 必须是正整数或 `-1`
- `autoStart` 缺省时按 `false` 处理

## 4. 核心行为

### 4.1 执行流程

任务启动后，系统按以下流程执行：

1. 任务进入 `RUNNING`
2. 等待 `intervalSeconds`
3. 触发响铃，执行 `ringOn`
4. 持续 `ringDurationSeconds`
5. 停止响铃，执行 `ringOff`
6. 已完成次数加 1
7. 如果还有剩余次数，继续等待下一轮 `intervalSeconds`
8. 如果达到 `repeatCount`，任务结束

重要规则：

- 下一轮等待应在本轮响铃结束后开始
- 不允许响铃计时器和下一轮等待计时器重叠导致重复触发
- 手动 `stop` 后必须立即清理所有等待中和响铃中的计时器
- `stop` 后不得再触发 `ringOn` 或 `ringOff`

### 4.2 时序示例

配置：

```txt
intervalSeconds = 300
ringDurationSeconds = 10
repeatCount = 5
```

执行时间线：

```txt
t=0       开始任务
t=5:00    第 1 次响铃开始
t=5:10    第 1 次响铃停止
t=10:10   第 2 次响铃开始
t=10:20   第 2 次响铃停止
...
第 5 次响铃停止后任务结束
```

说明：第二次响铃发生在第一次响铃停止后的 5 分钟，即 `intervalSeconds` 是两次响铃周期之间的等待时间，不包含上一轮响铃持续时长。

## 5. 状态设计

建议状态机：

```txt
IDLE -> RUNNING -> STOPPED
              \-> COMPLETED
```

预留扩展状态：

```txt
RUNNING -> PAUSED -> RUNNING
```

状态说明：

| 状态 | 含义 |
| --- | --- |
| `IDLE` | 已创建但未启动 |
| `RUNNING` | 正在等待下一次响铃或正在响铃 |
| `STOPPED` | 用户手动停止 |
| `COMPLETED` | 达到重复次数后自然结束 |
| `PAUSED` | 已暂停，预留 |

## 6. API 建议

### 6.1 单任务类

```ts
type AlarmStatus = "IDLE" | "RUNNING" | "STOPPED" | "COMPLETED" | "PAUSED";

type RepeatingAlarmConfig = {
  intervalSeconds: number;
  ringDurationSeconds: number;
  repeatCount: number;
  autoStart?: boolean;
};

class RepeatingAlarm {
  constructor(config: RepeatingAlarmConfig);
  start(): void;
  stop(): void;
  getStatus(): AlarmStatus;
  getRemainingCount(): number;
}
```

### 6.2 事件回调建议

为方便接入 UI、音频或测试，建议提供回调：

```ts
type RepeatingAlarmCallbacks = {
  onRingStart?: (context: AlarmEventContext) => void;
  onRingStop?: (context: AlarmEventContext) => void;
  onComplete?: () => void;
  onStop?: () => void;
  onStatusChange?: (status: AlarmStatus) => void;
};
```

## 7. 实现建议

推荐使用：

- `setTimeout`
- 或 `async loop + sleep`

不建议使用：

- `setInterval`

原因：

- 生命周期控制更复杂
- 暂停、停止、清理较难保证
- 容易因执行耗时产生漂移或重入问题

关键实现原则：

- 分别保存等待计时器和响铃计时器
- `stop` 时同时清理所有计时器
- 每次回调开始时检查任务是否仍处于 `RUNNING`
- 本轮响铃完全结束后再安排下一轮等待
- 对 `start` 做幂等处理，避免重复启动多个计时器

## 8. UI 最小需求

如果需要前端 UI，最小界面包含：

- `intervalSeconds` 输入框
- `ringDurationSeconds` 输入框
- `repeatCount` 输入框
- `autoStart` 开关
- `start` 按钮
- `stop` 按钮
- 当前状态显示
- 剩余次数显示

UI 状态要求：

- `RUNNING` 时可停止
- `STOPPED` / `COMPLETED` 时可重新开始或创建新任务
- 参数非法时禁止启动，并显示明确错误

## 9. 非功能要求

- 时间精度允许误差：`±100ms`
- 不允许 timer 重叠执行
- `stop` 后必须释放所有 timer
- 支持频繁 `start` / `stop`，不得崩溃
- 支持至少一个任务完整生命周期运行
- 行为应可通过自动化测试验证

## 10. 验收标准

必须满足：

- 能正确按 `intervalSeconds` 触发循环
- 每次响铃持续 `ringDurationSeconds` 后自动停止
- `repeatCount` 次数准确
- `repeatCount = -1` 时可无限循环，直到手动停止
- `stop` 能立即终止等待计时器和响铃计时器
- `stop` 后不会继续触发响铃开始或响铃停止
- 频繁调用 `start` 不会创建重复 timer
- 频繁调用 `stop` 不会抛错
- 完整生命周期结束后状态为 `COMPLETED`

## 11. 测试用例建议

### 11.1 正常重复

配置：

```json
{
  "intervalSeconds": 1,
  "ringDurationSeconds": 0.2,
  "repeatCount": 3
}
```

预期：

- `ringOn` 触发 3 次
- `ringOff` 触发 3 次
- 最终状态为 `COMPLETED`

### 11.2 手动停止等待中任务

步骤：

1. 启动任务
2. 在第一次响铃前调用 `stop`

预期：

- 不触发 `ringOn`
- 不触发 `ringOff`
- 状态为 `STOPPED`

### 11.3 手动停止响铃中任务

步骤：

1. 启动任务
2. 第一次响铃开始后调用 `stop`

预期：

- 当前响铃被立即停止或清理
- 后续不再触发新的响铃
- 状态为 `STOPPED`

### 11.4 无限循环

配置：

```json
{
  "intervalSeconds": 1,
  "ringDurationSeconds": 0.2,
  "repeatCount": -1
}
```

预期：

- 任务持续循环
- 手动 `stop` 后完全停止

### 11.5 重复 start

步骤：

1. 创建任务
2. 连续多次调用 `start`

预期：

- 只有一个活跃等待计时器
- 不出现重复响铃

## 12. 开放问题

- `stop` 发生在响铃中时，是否需要立即调用一次 `ringOff` 以确保音频关闭？
- 重新启动已完成任务时，是复用原任务并重置次数，还是必须创建新任务？
- 前端环境中是否需要页面后台、锁屏或浏览器节流场景支持？
- 是否需要持久化任务配置与运行状态？

