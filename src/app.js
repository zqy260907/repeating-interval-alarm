import { AlarmStatus, RepeatingAlarm } from "./repeatingAlarm.js";

const elements = {
  form: document.querySelector("#alarmForm"),
  intervalMinutes: document.querySelector("#intervalMinutes"),
  ringDurationSeconds: document.querySelector("#ringDurationSeconds"),
  repeatCount: document.querySelector("#repeatCount"),
  soundPreset: document.querySelector("#soundPreset"),
  infiniteMode: document.querySelector("#infiniteMode"),
  startButton: document.querySelector("#startButton"),
  stopButton: document.querySelector("#stopButton"),
  statusBadge: document.querySelector("#statusBadge"),
  ringIndicator: document.querySelector("#ringIndicator"),
  ringText: document.querySelector("#ringText"),
  completedCount: document.querySelector("#completedCount"),
  remainingCount: document.querySelector("#remainingCount"),
  nextRingIn: document.querySelector("#nextRingIn"),
  cycleLabel: document.querySelector("#cycleLabel"),
  feedbackText: document.querySelector("#feedbackText"),
  eventLog: document.querySelector("#eventLog"),
  errorMessage: document.querySelector("#errorMessage")
};

let alarm = null;
let countdownTimer = null;
let soundPlayer = null;

elements.infiniteMode.addEventListener("change", () => {
  elements.repeatCount.disabled = elements.infiniteMode.checked;
  elements.repeatCount.value = elements.infiniteMode.checked ? "-1" : "5";
});

elements.startButton.addEventListener("click", () => {
  try {
    clearError();
    soundPlayer.stop();
    alarm?.stop();
    alarm = createAlarm();
    alarm.start();
    elements.startButton.textContent = "已开始";
    elements.startButton.dataset.active = "true";
    logEvent("任务已启动");
  } catch (error) {
    elements.startButton.dataset.active = "false";
    elements.startButton.textContent = "开始闹钟";
    showError(error.message);
  }
});

elements.stopButton.addEventListener("click", () => {
  if (!alarm || alarm.getStatus() === AlarmStatus.IDLE) {
    return;
  }

  alarm.stop();
  soundPlayer.stop();
  stopCountdown();
  logEvent("任务已停止");
});

function createAlarm() {
  const intervalMinutes = Number(elements.intervalMinutes.value);

  if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
    throw new Error("间隔时间必须大于 0 分钟");
  }

  const config = {
    intervalSeconds: intervalMinutes * 60,
    ringDurationSeconds: elements.ringDurationSeconds.value,
    repeatCount: elements.infiniteMode.checked ? -1 : Number(elements.repeatCount.value)
  };

  return new RepeatingAlarm(config, {
    onStatusChange: updateView,
    onTick: (snapshot) => {
      updateView(snapshot);
      startCountdown(snapshot.nextRingAt);
    },
    onRingStart: (snapshot) => {
      updateView(snapshot);
      stopCountdown();
      soundPlayer.start(elements.soundPreset.value);
      logEvent(`第 ${snapshot.completedCount + 1} 次响铃开始`);
    },
    onRingStop: (snapshot) => {
      soundPlayer.stop();
      updateView(snapshot);
      logEvent(snapshot.reason === "manual-stop" ? "响铃已手动停止" : "响铃自动停止");
    },
    onComplete: (snapshot) => {
      updateView(snapshot);
      stopCountdown();
      logEvent("任务已完成");
    },
    onStop: updateView
  });
}

function updateView(snapshot) {
  const current = snapshot ?? alarm?.getSnapshot() ?? {
    status: AlarmStatus.IDLE,
    isRinging: false,
    completedCount: 0,
    remainingCount: null,
    repeatCount: null,
    nextRingAt: null
  };

  elements.statusBadge.textContent = current.status;
  elements.statusBadge.dataset.status = current.status.toLowerCase();
  elements.ringIndicator.dataset.ringing = String(current.isRinging);
  elements.ringText.textContent = getRingText(current);
  elements.completedCount.textContent = String(current.completedCount);
  elements.remainingCount.textContent = formatRemaining(current.remainingCount);
  elements.cycleLabel.textContent = formatCycle(current);
  elements.feedbackText.textContent = getFeedbackText(current);
  elements.stopButton.disabled = current.status !== AlarmStatus.RUNNING;
  elements.startButton.disabled = current.status === AlarmStatus.RUNNING;
  elements.startButton.dataset.active = String(current.status === AlarmStatus.RUNNING);

  if (current.status !== AlarmStatus.RUNNING) {
    elements.startButton.textContent = "开始闹钟";
  }

  if (!current.nextRingAt && current.status !== AlarmStatus.RUNNING) {
    elements.nextRingIn.textContent = "-";
  }
}

function getRingText(snapshot) {
  if (snapshot.isRinging) {
    return "正在响铃";
  }

  if (snapshot.status === AlarmStatus.RUNNING) {
    return "等待下一次响铃";
  }

  if (snapshot.status === AlarmStatus.COMPLETED) {
    return "任务已完成";
  }

  if (snapshot.status === AlarmStatus.STOPPED) {
    return "已停止";
  }

  return "等待开始";
}

function getFeedbackText(snapshot) {
  if (snapshot.isRinging) {
    return "铃声会持续到本轮时长结束";
  }

  if (snapshot.status === AlarmStatus.RUNNING) {
    return "正在计时，停止按钮在这里";
  }

  if (snapshot.status === AlarmStatus.COMPLETED) {
    return "全部完成，可以重新开始";
  }

  if (snapshot.status === AlarmStatus.STOPPED) {
    return "已停止，所有计时和铃声已清理";
  }

  return "设置好后点击开始";
}

function formatRemaining(value) {
  if (value === -1) {
    return "∞";
  }

  if (value === null || value === undefined) {
    return "-";
  }

  return String(value);
}

function formatCycle(snapshot) {
  if (snapshot.status === AlarmStatus.IDLE) {
    return "未启动";
  }

  if (snapshot.repeatCount === -1) {
    return `第 ${snapshot.completedCount + (snapshot.isRinging ? 1 : 0)} 次`;
  }

  return `${Math.min(snapshot.completedCount + (snapshot.isRinging ? 1 : 0), snapshot.repeatCount)} / ${snapshot.repeatCount}`;
}

function startCountdown(nextRingAt) {
  stopCountdown();

  if (!nextRingAt) {
    return;
  }

  const updateCountdown = () => {
    const remainingMs = Math.max(nextRingAt - Date.now(), 0);
    elements.nextRingIn.textContent = `${(remainingMs / 1000).toFixed(1)}s`;

    if (remainingMs <= 0) {
      stopCountdown();
    }
  };

  updateCountdown();
  countdownTimer = window.setInterval(updateCountdown, 100);
}

function stopCountdown() {
  if (countdownTimer !== null) {
    window.clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

class AlarmSoundPlayer {
  constructor() {
    this.audioContext = null;
    this.nodes = [];
    this.timers = [];
  }

  start(presetName) {
    this.stop();

    const AudioContext = window.AudioContext || window.webkitAudioContext;

    if (!AudioContext) {
      return;
    }

    this.audioContext = this.audioContext ?? new AudioContext();

    if (this.audioContext.state === "suspended") {
      this.audioContext.resume();
    }

    const preset = SOUND_PRESETS[presetName] ?? SOUND_PRESETS.candy;
    preset.play(this);
  }

  stop() {
    this.timers.forEach((timer) => window.clearInterval(timer));
    this.timers = [];

    this.nodes.forEach((node) => {
      try {
        if (typeof node.stop === "function") {
          node.stop();
        }
      } catch {
        // The oscillator may already be stopped by the browser audio engine.
      }

      try {
        node.disconnect();
      } catch {
        // Disconnect is best-effort cleanup for mixed audio node types.
      }
    });

    this.nodes = [];
  }

  addNode(node) {
    this.nodes.push(node);
    return node;
  }

  addTimer(timer) {
    this.timers.push(timer);
    return timer;
  }

  tone({ frequency, type = "sine", gainValue = 0.1 }) {
    const oscillator = this.addNode(this.audioContext.createOscillator());
    const gain = this.addNode(this.audioContext.createGain());
    const now = this.audioContext.currentTime;

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.03);

    oscillator.connect(gain);
    gain.connect(this.audioContext.destination);
    oscillator.start();

    return { oscillator, gain };
  }

  pulseTone(options) {
    const { gain } = this.tone(options);
    const low = options.lowGain ?? 0.025;
    const high = options.gainValue ?? 0.12;
    let lifted = true;

    this.addTimer(
      window.setInterval(() => {
        const now = this.audioContext.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setTargetAtTime(lifted ? low : high, now, 0.04);
        lifted = !lifted;
      }, options.pulseMs ?? 420)
    );
  }
}

const SOUND_PRESETS = {
  candy: {
    play(player) {
      const lead = player.tone({ frequency: 784, type: "sine", gainValue: 0.12 });
      const sparkle = player.tone({ frequency: 1175, type: "triangle", gainValue: 0.055 });

      player.addTimer(
        window.setInterval(() => {
          const now = player.audioContext.currentTime;
          lead.oscillator.frequency.setTargetAtTime(988, now, 0.04);
          lead.oscillator.frequency.setTargetAtTime(784, now + 0.18, 0.05);
          sparkle.gain.gain.setTargetAtTime(0.09, now, 0.025);
          sparkle.gain.gain.setTargetAtTime(0.035, now + 0.2, 0.04);
        }, 520)
      );
    }
  },
  starlight: {
    play(player) {
      player.pulseTone({ frequency: 1047, type: "triangle", gainValue: 0.11, lowGain: 0.018, pulseMs: 360 });
      player.pulseTone({ frequency: 1319, type: "sine", gainValue: 0.045, lowGain: 0.012, pulseMs: 720 });
    }
  },
  bubble: {
    play(player) {
      const bubble = player.tone({ frequency: 523, type: "sine", gainValue: 0.1 });

      player.addTimer(
        window.setInterval(() => {
          const now = player.audioContext.currentTime;
          const next = bubble.oscillator.frequency.value > 700 ? 523 : 740;
          bubble.oscillator.frequency.setTargetAtTime(next, now, 0.06);
          bubble.gain.gain.setTargetAtTime(0.13, now, 0.03);
          bubble.gain.gain.setTargetAtTime(0.04, now + 0.16, 0.04);
        }, 300)
      );
    }
  },
  classic: {
    play(player) {
      player.pulseTone({ frequency: 880, type: "square", gainValue: 0.08, lowGain: 0.01, pulseMs: 240 });
    }
  }
};

function logEvent(message) {
  const item = document.createElement("li");
  const time = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date());

  item.textContent = `${time} ${message}`;
  elements.eventLog.prepend(item);

  while (elements.eventLog.children.length > 8) {
    elements.eventLog.lastElementChild.remove();
  }
}

function showError(message) {
  elements.errorMessage.textContent = message;
}

function clearError() {
  elements.errorMessage.textContent = "";
}

updateView();
soundPlayer = new AlarmSoundPlayer();
