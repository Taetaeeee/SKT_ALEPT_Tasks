(() => {
  "use strict";

  const START_CODE_LENGTH = 3;
  const NORMAL_TARGET_LENGTH = 8;
  const EASY_TARGET_LENGTH = 7;
  const ROUND_TIME_SECONDS = 25;
  const TRANSITION_MS = 180;
  const STORAGE_KEY = "codeBreak.save.v3";
  const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  const state = {
    status: "menu",
    easyMode: false,
    code: "",
    currentLength: START_CODE_LENGTH,
    lastClearedLength: 0,
    cleared: 0,
    errors: 0,
    traceLevel: 0,
    remainingMs: ROUND_TIME_SECONDS * 1000,
    startedAt: null,
    deadline: null,
    pausedRemainingMs: null,
    rafId: null,
    autoPaused: false,
    bestMaxCode: null,
    muted: false,
    reducedMotion: false,
    isTransitioning: false,
    pendingTimeouts: new Set(),
    activeOscillators: new Set(),
  };

  const el = {
    terminal: document.querySelector("#terminal"),
    startScreen: document.querySelector("#start-screen"),
    gameScreen: document.querySelector("#game-screen"),
    resultScreen: document.querySelector("#result-screen"),
    startButton: document.querySelector("#start-button"),
    restartButton: document.querySelector("#restart-button"),
    resultRestartButton: document.querySelector("#result-restart-button"),
    homeButton: document.querySelector("#home-button"),
    pauseButton: document.querySelector("#pause-button"),
    resumeButton: document.querySelector("#resume-button"),
    pauseOverlay: document.querySelector("#pause-overlay"),
    codeInput: document.querySelector("#code-input"),
    securityCode: document.querySelector("#security-code"),
    securityCodeText: document.querySelector("#security-code-text"),
    timeLeft: document.querySelector("#time-left"),
    errorCount: document.querySelector("#error-count"),
    traceLevel: document.querySelector("#trace-level"),
    lockdownWarning: document.querySelector("#lockdown-warning"),
    traceFace: document.querySelector("#trace-face"),
    traceMessage: document.querySelector("#trace-message"),
    resultFace: document.querySelector("#result-face"),
    resultStory: document.querySelector("#result-story"),
    progressText: document.querySelector("#progress-text"),
    progressFill: document.querySelector("#progress-fill"),
    feedback: document.querySelector("#feedback"),
    gameStateText: document.querySelector("#game-state-text"),
    codePanel: document.querySelector("#code-panel"),
    penaltyPop: document.querySelector("#penalty-pop"),
    muteToggle: document.querySelector("#mute-toggle"),
    motionToggle: document.querySelector("#motion-toggle"),
    muteToggleGame: document.querySelector("#mute-toggle-game"),
    motionToggleGame: document.querySelector("#motion-toggle-game"),
    bestMaxStart: document.querySelector("#best-max-start"),
    bestMaxResult: document.querySelector("#best-max-result"),
    resultCard: document.querySelector("#result-card"),
    resultTitle: document.querySelector("#result-title"),
    resultKicker: document.querySelector("#result-kicker"),
    resultMain: document.querySelector("#result-main"),
    resultTime: document.querySelector("#result-time"),
    resultMaxCode: document.querySelector("#result-max-code"),
    resultCleared: document.querySelector("#result-cleared"),
    resultErrors: document.querySelector("#result-errors"),
    resultTrace: document.querySelector("#result-trace"),
    missionStartLength: document.querySelector("#mission-start-length"),
    missionTargetLength: document.querySelector("#mission-target-length"),
    easyTargetDisplay: document.querySelector("#easy-target-display"),
    currentLengthDisplay: document.querySelector("#current-length-display"),
    targetLengthDisplay: document.querySelector("#target-length-display"),
    startLengthDisplay: document.querySelector("#start-length-display"),
    targetLengthFooter: document.querySelector("#target-length-footer"),
    failTransition: document.querySelector("#fail-transition"),
    resetSaveButton: document.querySelector("#reset-save-button"),
    saveMessage: document.querySelector("#save-message"),
    easyModeEgg: document.querySelector("#easy-mode-egg"),
    easyModeStatus: document.querySelector("#easy-mode-status"),
    playModeDisplay: document.querySelector("#play-mode-display"),
    footerModeDisplay: document.querySelector("#footer-mode-display"),
  };

  function schedule(callback, delay) {
    const timeoutId = window.setTimeout(() => {
      state.pendingTimeouts.delete(timeoutId);
      callback();
    }, delay);
    state.pendingTimeouts.add(timeoutId);
    return timeoutId;
  }

  function clearPendingTimeouts() {
    for (const timeoutId of state.pendingTimeouts) {
      window.clearTimeout(timeoutId);
    }
    state.pendingTimeouts.clear();
  }

  function stopAllTones() {
    for (const oscillator of state.activeOscillators) {
      try { oscillator.stop(); } catch {}
    }
    state.activeOscillators.clear();
  }

  function clearVisualEffects() {
    el.codePanel.classList.remove("flash-success", "flash-error", "shake");
    el.terminal.classList.remove("counter-hack");
    el.penaltyPop.classList.remove("show");
    if (el.traceFace) {
      el.traceFace.classList.remove("face-success-pulse", "face-hit");
    }
  }

  function safeLoadSave() {
    const defaults = {
      bestMaxCode: null,
      muted: false,
      reducedMotion: false,
    };

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaults;

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return defaults;

      const bestMaxCode =
        Number.isInteger(parsed.bestMaxCode) && parsed.bestMaxCode >= START_CODE_LENGTH
          ? parsed.bestMaxCode
          : null;

      return {
        bestMaxCode,
        muted: typeof parsed.muted === "boolean" ? parsed.muted : false,
        reducedMotion:
          typeof parsed.reducedMotion === "boolean"
            ? parsed.reducedMotion
            : false,
      };
    } catch {
      return defaults;
    }
  }

  function savePersistentState() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          bestMaxCode: state.bestMaxCode,
          muted: state.muted,
          reducedMotion: state.reducedMotion,
        })
      );
    } catch {
      // 저장 실패 시에도 현재 게임은 계속 진행합니다.
    }
  }

  function syncSettingControls() {
    el.muteToggle.checked = state.muted;
    el.muteToggleGame.checked = state.muted;
    el.motionToggle.checked = state.reducedMotion;
    el.motionToggleGame.checked = state.reducedMotion;
    document.documentElement.classList.toggle("reduced-motion", state.reducedMotion);
  }

  function applySavedState() {
    const saved = safeLoadSave();
    state.bestMaxCode = saved.bestMaxCode;
    state.muted = saved.muted;
    state.reducedMotion = saved.reducedMotion;
    syncSettingControls();
    updateBestMaxLabels();
  }

  function setMuted(value) {
    state.muted = Boolean(value);
    syncSettingControls();
    if (state.muted) stopAllTones();
    savePersistentState();
  }

  function setReducedMotion(value) {
    state.reducedMotion = Boolean(value);
    syncSettingControls();
    if (state.reducedMotion) clearVisualEffects();
    savePersistentState();
  }

  function showScreen(target) {
    [el.startScreen, el.gameScreen, el.resultScreen].forEach((screen) => {
      screen.classList.toggle("active", screen === target);
    });
  }

  function currentCodeLength() {
    return state.currentLength;
  }

  function targetCodeLength() {
    return state.easyMode ? EASY_TARGET_LENGTH : NORMAL_TARGET_LENGTH;
  }

  function totalStages() {
    return targetCodeLength() - START_CODE_LENGTH + 1;
  }

  function updateProgressDisplay() {
    const target = targetCodeLength();
    const stages = totalStages();
    const progress = Math.min(state.cleared / stages, 1) * 100;

    el.currentLengthDisplay.textContent = String(state.currentLength);
    el.targetLengthDisplay.textContent = String(target);
    el.progressText.textContent = String(state.cleared);
    el.progressFill.style.width = `${progress}%`;
  }

  function updateModeUI() {
    const target = targetCodeLength();
    const modeLabel = state.easyMode ? "EASY" : "NORMAL";

    el.missionStartLength.textContent = String(START_CODE_LENGTH);
    el.missionTargetLength.textContent = String(target);
    el.easyTargetDisplay.textContent = String(EASY_TARGET_LENGTH);
    el.startLengthDisplay.textContent = String(START_CODE_LENGTH);
    el.targetLengthFooter.textContent = String(target);
    el.playModeDisplay.textContent = modeLabel;
    el.footerModeDisplay.textContent = modeLabel;

    el.easyModeStatus.hidden = !state.easyMode;
    el.easyModeEgg.setAttribute("aria-pressed", String(state.easyMode));
    el.easyModeEgg.textContent = state.easyMode ? "[ E ]" : "[ ? ]";

    el.terminal.classList.toggle("easy-mode", state.easyMode);

    updateProgressDisplay();
    updateBestMaxLabels();
  }

  function toggleEasyMode() {
    if (state.status !== "menu") return;

    state.easyMode = !state.easyMode;
    updateModeUI();
  }

  function generateCode() {
    let code = "";
    for (let i = 0; i < currentCodeLength(); i += 1) {
      code += CHARSET[Math.floor(Math.random() * CHARSET.length)];
    }
    return code;
  }

  function fitSecurityCode() {
    const length = state.code.length;
    const availableWidth = Math.max(160, el.securityCode.clientWidth - 28);

    // 짧은 암호는 크게, 길어질수록 단계적으로 축소합니다.
    let fontPx;
    let spacingPx;

    if (length <= 5) {
      fontPx = 64;
      spacingPx = 10;
    } else if (length <= 7) {
      fontPx = 56;
      spacingPx = 9;
    } else if (length <= 9) {
      fontPx = 48;
      spacingPx = 7;
    } else if (length <= 11) {
      fontPx = 40;
      spacingPx = 6;
    } else if (length <= 14) {
      fontPx = 32;
      spacingPx = 4;
    } else {
      fontPx = 28;
      spacingPx = 3;
    }

    const codeText = el.securityCodeText;

    codeText.style.fontSize = `${fontPx}px`;
    codeText.style.letterSpacing = `${spacingPx}px`;

    // 실제 텍스트 span의 폭만 측정합니다.
    // 공간이 부족할 때만 자간 → 글자 크기 순으로 추가 축소합니다.
    let guard = 0;

    while (
      codeText.getBoundingClientRect().width > availableWidth &&
      guard < 100 &&
      (spacingPx > 0 || fontPx > 14)
    ) {
      if (spacingPx > 0) {
        spacingPx = Math.max(0, spacingPx - 0.5);
      } else {
        fontPx = Math.max(14, fontPx - 1);
      }

      codeText.style.fontSize = `${fontPx}px`;
      codeText.style.letterSpacing = `${spacingPx}px`;
      guard += 1;
    }
  }

  function newSecurityCode() {
    state.code = generateCode();

    // 실제 공백 없이 별도 텍스트 span에 출력해 문자 폭만 정확히 측정합니다.
    el.securityCodeText.textContent = state.code;
    el.codeInput.value = "";
    el.feedback.textContent = "";
    el.feedback.className = "feedback";

    requestAnimationFrame(fitSecurityCode);
  }

  function setInputLocked(locked) {
    state.isTransitioning = locked;
    el.codeInput.disabled = locked;
  }

  function tracePercent() {
    if (state.status === "failed") return 100;

    const traceSteps = [0, 25, 50, 75, 90];
    return traceSteps[Math.min(state.traceLevel, 4)];
  }

  function updateFaceState() {
    const level = Math.min(state.traceLevel, 4);
    const states = [
      { className: "face-safe", message: "아직 탐지되지 않았습니다.", label: "역추적 상태 안전" },
      { className: "face-warning", message: "비정상 접근이 감지되었습니다.", label: "비정상 접근 감지" },
      { className: "face-tracing", message: "역추적이 시작되었습니다.", label: "역추적 진행 중" },
      { className: "face-danger", message: "접속 경로를 추적 중입니다.", label: "접속 경로 추적 중" },
      { className: "face-compromised", message: "접속 경로 노출이 임박했습니다.", label: "접속 경로 노출 임박" },
    ];

    const current = states[level];
    el.traceFace.classList.remove(
      "face-safe", "face-warning", "face-tracing", "face-danger", "face-compromised"
    );
    el.traceFace.classList.add(current.className);
    el.traceMessage.textContent = current.message;
    el.traceFace.setAttribute("aria-label", current.label);
  }

  function setResultFace(success) {
    el.resultFace.classList.remove(
      "face-safe", "face-warning", "face-tracing", "face-danger", "face-compromised"
    );
    if (success) {
      el.resultFace.classList.add("face-safe");
      el.resultFace.setAttribute("aria-label", "보안 시스템 해제 성공 및 역추적 차단");
    } else {
      el.resultFace.classList.add("face-compromised");
      el.resultFace.setAttribute("aria-label", "역추적 완료 및 접속 경로 노출");
    }
  }

  function updateTraceDisplay() {
    const percent = tracePercent();
    const traceClass = `trace-${Math.min(state.traceLevel, 4)}`;
    el.traceLevel.textContent = `${percent}%`;
    el.resultTrace.textContent = `${percent}%`;
    el.terminal.classList.remove("trace-0", "trace-1", "trace-2", "trace-3", "trace-4");
    el.terminal.classList.add(traceClass);
    updateFaceState();
  }

  function updateLockdownWarning() {
    if (state.status === "running" && state.remainingMs <= 5000) {
      el.lockdownWarning.textContent = "WARNING // LOCKDOWN IMMINENT";
      el.lockdownWarning.classList.add("active");
    } else {
      el.lockdownWarning.textContent = "";
      el.lockdownWarning.classList.remove("active");
    }
  }

  function resetRoundState() {
    cancelAnimationFrame(state.rafId);
    clearPendingTimeouts();
    stopAllTones();
    clearVisualEffects();

    state.status = "running";
    state.code = "";
    state.currentLength = START_CODE_LENGTH;
    state.lastClearedLength = 0;
    state.cleared = 0;
    state.errors = 0;
    state.traceLevel = 0;
    state.remainingMs = ROUND_TIME_SECONDS * 1000;
    state.pausedRemainingMs = null;
    state.autoPaused = false;
    state.isTransitioning = false;

    const now = performance.now();
    state.startedAt = now;
    state.deadline = now + state.remainingMs;

    el.pauseOverlay.hidden = true;
    el.failTransition.hidden = true;
    el.lockdownWarning.textContent = "";
    el.lockdownWarning.classList.remove("active");
    el.gameStateText.textContent = "RUNNING";
    el.timeLeft.textContent = ROUND_TIME_SECONDS.toFixed(2);
    el.errorCount.textContent = "0";
    updateProgressDisplay();
    el.pauseButton.textContent = "[ PAUSE ]";
    el.codeInput.disabled = false;

    updateTraceDisplay();
    newSecurityCode();
  }

  function startGame() {
    resetRoundState();
    showScreen(el.gameScreen);
    requestAnimationFrame(() => el.codeInput.focus());
    tick();
  }

  function restartGame() { startGame(); }

  function triggerFailureSequence() {
    cancelAnimationFrame(state.rafId);
    clearPendingTimeouts();
    setInputLocked(true);

    state.remainingMs = 0;
    state.status = "failed";
    state.traceLevel = Math.max(state.traceLevel, 4);

    el.timeLeft.textContent = "0.00";
    el.traceLevel.textContent = "100%";
    el.lockdownWarning.textContent = "";
    el.lockdownWarning.classList.remove("active");

    el.terminal.classList.remove("trace-0", "trace-1", "trace-2", "trace-3");
    el.terminal.classList.add("trace-4");

    el.traceFace.classList.remove(
      "face-safe",
      "face-warning",
      "face-tracing",
      "face-danger",
      "face-compromised"
    );
    el.traceFace.classList.add("face-compromised");
    el.traceMessage.textContent = "접속 경로가 노출되었습니다.";
    el.traceFace.setAttribute(
      "aria-label",
      "역추적 완료 및 접속 경로 노출"
    );

    el.failTransition.hidden = false;

    if (!state.reducedMotion) {
      el.terminal.classList.add("counter-hack");
    }

    window.setTimeout(
      () => {
        el.failTransition.hidden = true;
        el.terminal.classList.remove("counter-hack");
        finishGame(false);
      },
      state.reducedMotion ? 0 : 520
    );
  }

  function endRoundAtTimeLimit() {
    if (state.status !== "running") return;

    state.remainingMs = 0;
    el.timeLeft.textContent = "0.00";
    el.lockdownWarning.textContent = "";
    el.lockdownWarning.classList.remove("active");

    const success = state.lastClearedLength >= targetCodeLength();

    if (success) {
      finishGame(true);
    } else {
      triggerFailureSequence();
    }
  }

  function finishGame(success) {
    cancelAnimationFrame(state.rafId);
    clearPendingTimeouts();
    setInputLocked(false);

    state.status = success ? "success" : "failed";

    if (!state.easyMode) {
      const maxCode = state.lastClearedLength || 0;

      if (maxCode >= START_CODE_LENGTH) {
        if (state.bestMaxCode === null || maxCode > state.bestMaxCode) {
          state.bestMaxCode = maxCode;
          savePersistentState();
        }
      }
    }

    showScreen(el.resultScreen);
    el.resultCard.classList.toggle("failed", !success);

    if (success) {
      el.resultKicker.textContent = "> TIME LIMIT REACHED";
      el.resultTitle.textContent = "침투 목표를 달성했습니다.";
      el.resultMain.textContent =
        `MAX CODE ${state.lastClearedLength} DIGITS`;
      el.resultStory.innerHTML = `
        <p>25초 동안 최대 ${state.lastClearedLength}자리 암호까지 해제했습니다.</p>
        <p>목표 ${targetCodeLength()}자리를 달성해 역추적을 차단했습니다.</p>
      `;

      if (state.easyMode) {
        el.resultStory.innerHTML +=
          `<p>EASY MODE 기록은 BEST MAX CODE에 저장되지 않습니다.</p>`;
      }

      setResultFace(true);

      el.terminal.classList.remove(
        "trace-1",
        "trace-2",
        "trace-3",
        "trace-4",
        "counter-hack"
      );
      el.terminal.classList.add("trace-0");
      el.resultTrace.textContent = "BLOCKED";
    } else {
      el.resultKicker.textContent = "> TRACE COMPLETE";
      el.resultTitle.textContent = "역추적이 완료되었습니다.";
      el.resultMain.textContent = "접속 경로가 노출되었습니다.";
      el.resultStory.innerHTML =
        state.lastClearedLength > 0
          ? `<p>25초 동안 최대 ${state.lastClearedLength}자리 암호까지 해제했습니다.</p>
             <p>목표 ${targetCodeLength()}자리에 도달하지 못했습니다.</p>
             <p>보안 시스템 해제에 실패했습니다.</p>`
          : `<p>25초 동안 암호를 해제하지 못했습니다.</p>
             <p>목표 ${targetCodeLength()}자리에 도달하지 못했습니다.</p>
             <p>보안 시스템 해제에 실패했습니다.</p>`;

      setResultFace(false);

      el.terminal.classList.remove(
        "trace-0",
        "trace-1",
        "trace-2",
        "trace-3"
      );
      el.terminal.classList.add("trace-4");
      el.resultTrace.textContent = "100%";
    }

    el.resultTime.textContent = `${ROUND_TIME_SECONDS.toFixed(2)} SEC`;
    el.resultMaxCode.textContent =
      state.lastClearedLength > 0
        ? `${state.lastClearedLength} DIGITS`
        : "--";
    el.resultCleared.textContent = String(state.cleared);
    el.resultErrors.textContent = String(state.errors);

    updateBestMaxLabels();
    el.resultRestartButton.focus();

    playTone(success ? "success" : "failure");
  }

  function submitCode() {
    if (state.status !== "running" || state.isTransitioning) return;

    const entered = el.codeInput.value.trim().toUpperCase();
    if (!entered) return;

    const codeLength = currentCodeLength();

    if (entered.length !== codeLength) {
      el.feedback.textContent = `${codeLength}자리 암호를 모두 입력하세요.`;
      el.feedback.className = "feedback";
      el.codeInput.focus();
      return;
    }

    if (entered === state.code) {
      setInputLocked(true);

      const solvedLength = state.currentLength;
      state.lastClearedLength = solvedLength;
      state.cleared += 1;

      el.feedback.textContent = `CODE ${solvedLength} CLEARED // ACCESS GRANTED`;
      el.feedback.className = "feedback success";

      runVisualEffect("success");
      runFaceSuccessEffect();
      playTone("correct");

      state.currentLength += 1;
      updateProgressDisplay();

      schedule(() => {
        if (state.status === "running" || state.status === "paused") {
          newSecurityCode();
          setInputLocked(false);
          if (state.status === "running") el.codeInput.focus();
        }
      }, state.reducedMotion ? 0 : TRANSITION_MS);
    } else {
      state.errors += 1;
      state.traceLevel += 1;
      el.errorCount.textContent = String(state.errors);
      updateTraceDisplay();

      el.feedback.textContent =
        `COUNTER INTRUSION DETECTED // TRACE ${tracePercent()}% // SAME CODE RETRY`;
      el.feedback.className = "feedback error";
      el.codeInput.value = "";
      el.penaltyPop.textContent = `TRACE ${tracePercent()}%`;

      runVisualEffect("error");
      runFaceHitEffect();
      playTone("wrong");

      el.codeInput.focus();
    }
  }

  function updateRemainingTime() {
    if (state.status !== "running") return;
    state.remainingMs = Math.max(0, state.deadline - performance.now());
    el.timeLeft.textContent = (state.remainingMs / 1000).toFixed(2);
    updateLockdownWarning();
  }

  function tick() {
    if (state.status !== "running") return;
    updateRemainingTime();
    if (state.remainingMs <= 0) {
      state.remainingMs = 0;
      el.timeLeft.textContent = "0.00";
      endRoundAtTimeLimit();
      return;
    }
    state.rafId = requestAnimationFrame(tick);
  }

  function pauseGame({ auto = false } = {}) {
    if (state.status !== "running") return;
    updateRemainingTime();
    cancelAnimationFrame(state.rafId);

    state.status = "paused";
    state.pausedRemainingMs = state.remainingMs;
    state.autoPaused = auto;

    el.gameStateText.textContent = auto ? "FOCUS PAUSED" : "PAUSED";
    el.pauseOverlay.hidden = false;
    el.pauseButton.textContent = "[ RESUME ]";
    el.resumeButton.focus();
  }

  function resumeGame() {
    if (state.status !== "paused") return;
    state.status = "running";
    state.remainingMs = state.pausedRemainingMs ?? state.remainingMs;
    state.deadline = performance.now() + state.remainingMs;
    state.pausedRemainingMs = null;
    state.autoPaused = false;

    el.gameStateText.textContent = "RUNNING";
    el.pauseOverlay.hidden = true;
    el.pauseButton.textContent = "[ PAUSE ]";
    if (!state.isTransitioning) el.codeInput.focus();
    tick();
  }

  function togglePause() {
    if (state.status === "running") pauseGame();
    else if (state.status === "paused") resumeGame();
  }

  function goHome() {
    cancelAnimationFrame(state.rafId);
    clearPendingTimeouts();
    stopAllTones();
    clearVisualEffects();

    state.status = "menu";
    state.easyMode = false;
    state.autoPaused = false;
    state.isTransitioning = false;
    el.codeInput.disabled = false;
    el.pauseOverlay.hidden = true;

    showScreen(el.startScreen);
    updateModeUI();
    el.startButton.focus();
  }

  function runFaceSuccessEffect() {
    if (state.reducedMotion) return;
    el.traceFace.classList.remove("face-success-pulse");
    void el.traceFace.offsetWidth;
    el.traceFace.classList.add("face-success-pulse");
    schedule(() => el.traceFace.classList.remove("face-success-pulse"), 320);
  }

  function runFaceHitEffect() {
    if (state.reducedMotion) return;
    el.traceFace.classList.remove("face-hit");
    void el.traceFace.offsetWidth;
    el.traceFace.classList.add("face-hit");
    schedule(() => el.traceFace.classList.remove("face-hit"), 450);
  }

  function runVisualEffect(type) {
    if (state.reducedMotion) return;

    clearVisualEffects();
    void el.codePanel.offsetWidth;

    if (type === "success") {
      el.codePanel.classList.add("flash-success");
      schedule(() => clearVisualEffects(), 500);
      return;
    }

    if (type === "error") {
      el.codePanel.classList.add("flash-error", "shake");
      el.terminal.classList.add("counter-hack");
      void el.penaltyPop.offsetWidth;
      el.penaltyPop.classList.add("show");
      schedule(() => clearVisualEffects(), 720);
    }
  }

  function getAudioContext() {
    if (state.muted) return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!getAudioContext.ctx) getAudioContext.ctx = new AudioCtx();
    return getAudioContext.ctx;
  }

  function playTone(type) {
    if (state.muted) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      const config = {
        correct: { frequency: 620, duration: 0.07, wave: "square" },
        wrong: { frequency: 150, duration: 0.11, wave: "sawtooth" },
        success: { frequency: 820, duration: 0.18, wave: "square" },
        failure: { frequency: 110, duration: 0.18, wave: "sawtooth" },
      }[type];

      oscillator.type = config.wave;
      oscillator.frequency.setValueAtTime(config.frequency, now);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + config.duration);
      oscillator.connect(gain);
      gain.connect(ctx.destination);

      state.activeOscillators.add(oscillator);
      oscillator.addEventListener("ended", () => state.activeOscillators.delete(oscillator), { once: true });

      oscillator.start(now);
      oscillator.stop(now + config.duration);
    } catch {}
  }

  function formatSeconds(ms) { return `${(ms / 1000).toFixed(2)} SEC`; }

  function updateBestMaxLabels() {
    const normalLabel =
      state.bestMaxCode === null
        ? "--"
        : `${state.bestMaxCode} DIGITS`;

    if (state.easyMode) {
      el.bestMaxStart.textContent = "NOT RECORDED";
      el.bestMaxResult.textContent = "NOT RECORDED";
      return;
    }

    el.bestMaxStart.textContent = normalLabel;
    el.bestMaxResult.textContent = normalLabel;
  }

  function normalizeInput() {
    const normalized = el.codeInput.value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, currentCodeLength());
    if (el.codeInput.value !== normalized) el.codeInput.value = normalized;
  }

  function resetSaveData() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}

    state.bestMaxCode = null;
    state.muted = false;
    state.reducedMotion = false;

    syncSettingControls();
    updateBestMaxLabels();

    el.saveMessage.textContent = "저장 기록을 초기화했습니다.";

    window.setTimeout(() => {
      el.saveMessage.textContent = "";
    }, 1600);
  }

  function bindSettingToggle(control, setter) {
    control.addEventListener("change", () => setter(control.checked));
  }

  el.startButton.addEventListener("click", startGame);
  el.restartButton.addEventListener("click", restartGame);
  el.resultRestartButton.addEventListener("click", restartGame);
  el.homeButton.addEventListener("click", goHome);
  el.pauseButton.addEventListener("click", togglePause);
  el.resumeButton.addEventListener("click", resumeGame);
  el.resetSaveButton.addEventListener("click", resetSaveData);
  el.easyModeEgg.addEventListener("click", toggleEasyMode);

  el.codeInput.addEventListener("input", normalizeInput);
  el.codeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.repeat) {
      event.preventDefault();
      submitCode();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !event.repeat) {
      if (state.status === "running" || state.status === "paused") {
        event.preventDefault();
        togglePause();
      }
    }
  });

  bindSettingToggle(el.muteToggle, setMuted);
  bindSettingToggle(el.muteToggleGame, setMuted);
  bindSettingToggle(el.motionToggle, setReducedMotion);
  bindSettingToggle(el.motionToggleGame, setReducedMotion);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.status === "running") pauseGame({ auto: true });
  });
  window.addEventListener("blur", () => {
    if (state.status === "running") pauseGame({ auto: true });
  });
  window.addEventListener("resize", () => {
    if (state.status === "running" || state.status === "paused") {
      fitSecurityCode();
    }
  });

  applySavedState();
  updateModeUI();
  updateTraceDisplay();
  showScreen(el.startScreen);
})();
