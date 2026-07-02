import assert from "node:assert/strict";
import test from "node:test";
import { AlarmStatus, RepeatingAlarm, normalizeConfig } from "../src/repeatingAlarm.js";

class FakeScheduler {
  constructor() {
    this.currentTime = 0;
    this.nextId = 1;
    this.timers = new Map();
  }

  setTimeout(callback, delay) {
    const id = this.nextId;
    this.nextId += 1;
    this.timers.set(id, {
      callback,
      runAt: this.currentTime + delay
    });
    return id;
  }

  clearTimeout(id) {
    this.timers.delete(id);
  }

  now() {
    return this.currentTime;
  }

  advance(ms) {
    const target = this.currentTime + ms;

    while (true) {
      const next = [...this.timers.entries()]
        .filter(([, timer]) => timer.runAt <= target)
        .sort((a, b) => a[1].runAt - b[1].runAt)[0];

      if (!next) {
        break;
      }

      const [id, timer] = next;
      this.timers.delete(id);
      this.currentTime = timer.runAt;
      timer.callback();
    }

    this.currentTime = target;
  }

  activeTimerCount() {
    return this.timers.size;
  }
}

test("normalizes valid config", () => {
  assert.deepEqual(
    normalizeConfig({
      intervalSeconds: "1.5",
      ringDurationSeconds: "0.2",
      repeatCount: 3,
      autoStart: true
    }),
    {
      intervalSeconds: 1.5,
      ringDurationSeconds: 0.2,
      repeatCount: 3,
      autoStart: true
    }
  );
});

test("rejects invalid config", () => {
  assert.throws(() => normalizeConfig({ intervalSeconds: 0, ringDurationSeconds: 1, repeatCount: 1 }));
  assert.throws(() => normalizeConfig({ intervalSeconds: 1, ringDurationSeconds: 0, repeatCount: 1 }));
  assert.throws(() => normalizeConfig({ intervalSeconds: 1, ringDurationSeconds: 1, repeatCount: 0 }));
  assert.throws(() => normalizeConfig({ intervalSeconds: 1, ringDurationSeconds: 1, repeatCount: 1.5 }));
});

test("rings for the configured repeat count and completes", () => {
  const scheduler = new FakeScheduler();
  const events = [];
  const alarm = new RepeatingAlarm(
    { intervalSeconds: 1, ringDurationSeconds: 0.2, repeatCount: 3 },
    {
      onRingStart: (snapshot) => events.push(["start", scheduler.now(), snapshot.completedCount]),
      onRingStop: (snapshot) => events.push(["stop", scheduler.now(), snapshot.completedCount]),
      onComplete: (snapshot) => events.push(["complete", scheduler.now(), snapshot.completedCount])
    },
    scheduler
  );

  alarm.start();
  scheduler.advance(3600);

  assert.deepEqual(events, [
    ["start", 1000, 0],
    ["stop", 1200, 1],
    ["start", 2200, 1],
    ["stop", 2400, 2],
    ["start", 3400, 2],
    ["stop", 3600, 3],
    ["complete", 3600, 3]
  ]);
  assert.equal(alarm.getStatus(), AlarmStatus.COMPLETED);
  assert.equal(alarm.getRemainingCount(), 0);
  assert.equal(scheduler.activeTimerCount(), 0);
});

test("stop before the first ring clears timers", () => {
  const scheduler = new FakeScheduler();
  let ringStarts = 0;
  const alarm = new RepeatingAlarm(
    { intervalSeconds: 1, ringDurationSeconds: 0.2, repeatCount: 3 },
    {
      onRingStart: () => {
        ringStarts += 1;
      }
    },
    scheduler
  );

  alarm.start();
  alarm.stop();
  scheduler.advance(2000);

  assert.equal(ringStarts, 0);
  assert.equal(alarm.getStatus(), AlarmStatus.STOPPED);
  assert.equal(scheduler.activeTimerCount(), 0);
});

test("stop during a ring prevents later callbacks", () => {
  const scheduler = new FakeScheduler();
  const events = [];
  const alarm = new RepeatingAlarm(
    { intervalSeconds: 1, ringDurationSeconds: 1, repeatCount: 3 },
    {
      onRingStart: () => events.push(["start", scheduler.now()]),
      onRingStop: (snapshot) => events.push(["stop", scheduler.now(), snapshot.reason])
    },
    scheduler
  );

  alarm.start();
  scheduler.advance(1000);
  alarm.stop();
  scheduler.advance(5000);

  assert.deepEqual(events, [
    ["start", 1000],
    ["stop", 1000, "manual-stop"]
  ]);
  assert.equal(alarm.getStatus(), AlarmStatus.STOPPED);
  assert.equal(scheduler.activeTimerCount(), 0);
});

test("repeatCount -1 keeps scheduling until stopped", () => {
  const scheduler = new FakeScheduler();
  let ringStarts = 0;
  const alarm = new RepeatingAlarm(
    { intervalSeconds: 1, ringDurationSeconds: 0.2, repeatCount: -1 },
    {
      onRingStart: () => {
        ringStarts += 1;
      }
    },
    scheduler
  );

  alarm.start();
  scheduler.advance(5000);

  assert.equal(ringStarts, 4);
  assert.equal(alarm.getStatus(), AlarmStatus.RUNNING);
  assert.equal(alarm.getRemainingCount(), -1);

  alarm.stop();
  assert.equal(scheduler.activeTimerCount(), 0);
});

test("calling start repeatedly does not create duplicate timers", () => {
  const scheduler = new FakeScheduler();
  let ringStarts = 0;
  const alarm = new RepeatingAlarm(
    { intervalSeconds: 1, ringDurationSeconds: 0.2, repeatCount: 1 },
    {
      onRingStart: () => {
        ringStarts += 1;
      }
    },
    scheduler
  );

  alarm.start();
  alarm.start();
  alarm.start();

  assert.equal(scheduler.activeTimerCount(), 1);
  scheduler.advance(1000);
  assert.equal(ringStarts, 1);
});
