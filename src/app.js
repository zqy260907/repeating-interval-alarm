import { AlarmStatus, RepeatingAlarm } from "./repeatingAlarm.js";

const elements = {
  form: document.querySelector("#alarmForm"),
  intervalSeconds: document.querySelector("#intervalSeconds"),
  ringDurationSeconds: document.querySelector("#ringDurationSeconds"),
  repeatCount: document.querySelector("#repeatCount"),
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
  eventLog: document.querySelector("#eventLog"),
  errorMessage: document.querySelector("#errorMessage")
};

let alarm = null;
let countdownTimer = null;

elements.infiniteMode.addEventListener("change", () => {
  elements.repeatCount.disabled = elements.infiniteMode.checked;
  elements.repeatCount.value = elements.infiniteMode.checked ? "-1" : "5";
});

elements.startButton.addEventListener("click", () => {
  try {
    clearError();
    alarm?.stop();
    alarm = createAlarm();
    alarm.start();
    logEvent("任务已启动");
  } catch (error) {
    showError(error.message);
  }
});

elements.stopButton.addEventListener("click", () => {
  if (!alarm || alarm.getStatus() === AlarmStatus.IDLE) {
    return;
  }

  alarm.stop();
  stopCountdown();
  logEvent("任务已停止");
});

function createAlarm() {
  const config = {
    intervalSeconds: elements.intervalSeconds.value,
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
      playBeep();
      logEvent(`第 ${snapshot.completedCount + 1} 次响铃开始`);
    },
    onRingStop: (snapshot) => {
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
    repeatCount: null
  };

  elements.statusBadge.textContent = current.status;
  elements.statusBadge.dataset.status = current.status.toLowerCase();
  elements.ringIndicator.dataset.ringing = String(current.isRinging);
  elements.ringText.textContent = getRingText(current);
  elements.completedCount.textContent = String(current.completedCount);
  elements.remainingCount.textContent = formatRemaining(current.remainingCount);
  elements.cycleLabel.textContent = formatCycle(current);

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

function playBeep() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;

  if (!AudioContext) {
    return;
  }

  const audioContext = new AudioContext();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, audioContext.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.28);

  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.3);
}

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
