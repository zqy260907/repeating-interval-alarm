export const AlarmStatus = Object.freeze({
  IDLE: "IDLE",
  RUNNING: "RUNNING",
  STOPPED: "STOPPED",
  COMPLETED: "COMPLETED"
});

const DEFAULT_SCHEDULER = {
  setTimeout(callback, delay) {
    return globalThis.setTimeout(callback, delay);
  },
  clearTimeout(timerId) {
    globalThis.clearTimeout(timerId);
  },
  now() {
    return Date.now();
  }
};

export class RepeatingAlarm {
  constructor(config, callbacks = {}, scheduler = DEFAULT_SCHEDULER) {
    this.config = normalizeConfig(config);
    this.callbacks = callbacks;
    this.scheduler = scheduler;
    this.status = AlarmStatus.IDLE;
    this.completedCount = 0;
    this.waitTimer = null;
    this.ringTimer = null;
    this.isRinging = false;
    this.nextRingAt = null;

    if (this.config.autoStart) {
      this.start();
    }
  }

  start() {
    if (this.status === AlarmStatus.RUNNING) {
      return;
    }

    this.clearTimers();
    this.completedCount = 0;
    this.isRinging = false;
    this.setStatus(AlarmStatus.RUNNING);
    this.scheduleNext();
  }

  stop() {
    if (this.status === AlarmStatus.STOPPED) {
      return;
    }

    const wasRinging = this.isRinging;
    this.clearTimers();

    if (wasRinging) {
      this.emitRingStop("manual-stop");
    }

    this.setStatus(AlarmStatus.STOPPED);
    this.callbacks.onStop?.(this.getSnapshot());
  }

  getStatus() {
    return this.status;
  }

  getRemainingCount() {
    if (this.config.repeatCount === -1) {
      return -1;
    }

    return Math.max(this.config.repeatCount - this.completedCount, 0);
  }

  getSnapshot() {
    return {
      status: this.status,
      isRinging: this.isRinging,
      completedCount: this.completedCount,
      remainingCount: this.getRemainingCount(),
      repeatCount: this.config.repeatCount,
      intervalSeconds: this.config.intervalSeconds,
      ringDurationSeconds: this.config.ringDurationSeconds,
      nextRingAt: this.nextRingAt
    };
  }

  scheduleNext() {
    if (this.status !== AlarmStatus.RUNNING) {
      return;
    }

    if (this.isComplete()) {
      this.complete();
      return;
    }

    const delay = this.config.intervalSeconds * 1000;
    this.nextRingAt = this.scheduler.now() + delay;
    this.callbacks.onTick?.(this.getSnapshot());
    this.waitTimer = this.scheduler.setTimeout(() => {
      this.waitTimer = null;
      this.beginRing();
    }, delay);
  }

  beginRing() {
    if (this.status !== AlarmStatus.RUNNING || this.isComplete()) {
      return;
    }

    this.nextRingAt = null;
    this.isRinging = true;
    this.callbacks.onRingStart?.(this.getSnapshot());

    const duration = this.config.ringDurationSeconds * 1000;
    this.ringTimer = this.scheduler.setTimeout(() => {
      this.ringTimer = null;
      this.finishRing();
    }, duration);
  }

  finishRing() {
    if (this.status !== AlarmStatus.RUNNING || !this.isRinging) {
      return;
    }

    this.completedCount += 1;
    this.emitRingStop("duration-ended");

    if (this.isComplete()) {
      this.complete();
      return;
    }

    this.scheduleNext();
  }

  complete() {
    this.clearTimers();
    this.setStatus(AlarmStatus.COMPLETED);
    this.callbacks.onComplete?.(this.getSnapshot());
  }

  emitRingStop(reason) {
    this.isRinging = false;
    this.callbacks.onRingStop?.({
      ...this.getSnapshot(),
      reason
    });
  }

  clearTimers() {
    if (this.waitTimer !== null) {
      this.scheduler.clearTimeout(this.waitTimer);
      this.waitTimer = null;
    }

    if (this.ringTimer !== null) {
      this.scheduler.clearTimeout(this.ringTimer);
      this.ringTimer = null;
    }

    this.nextRingAt = null;
  }

  setStatus(status) {
    if (this.status === status) {
      return;
    }

    this.status = status;
    this.callbacks.onStatusChange?.(this.getSnapshot());
  }

  isComplete() {
    return this.config.repeatCount !== -1 && this.completedCount >= this.config.repeatCount;
  }
}

export function normalizeConfig(config) {
  const intervalSeconds = Number(config.intervalSeconds);
  const ringDurationSeconds = Number(config.ringDurationSeconds);
  const repeatCount = Number(config.repeatCount);

  if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
    throw new Error("间隔时间必须大于 0 秒");
  }

  if (!Number.isFinite(ringDurationSeconds) || ringDurationSeconds <= 0) {
    throw new Error("响铃时长必须大于 0 秒");
  }

  if (!Number.isInteger(repeatCount) || (repeatCount <= 0 && repeatCount !== -1)) {
    throw new Error("重复次数必须是正整数，或使用 -1 表示无限循环");
  }

  return {
    intervalSeconds,
    ringDurationSeconds,
    repeatCount,
    autoStart: Boolean(config.autoStart)
  };
}
