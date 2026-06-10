const app = document.getElementById("app");

const state = {
  content: null,
  screen: "loading",
  questionIndex: 0,
  answers: [],
  name: "",
  revealed: false,
  transitioning: false,
  infiniteScrollHandler: null,
  revealFollowupTimeout: null,
  flowerStreamIntensity: 0,
  celebratePressCount: 0,
  flowerSizeBoost: 0,
  lastCelebrateText: "",
  flowerSystem: null,
  flowerResizeHandler: null,
};

const FLOWER_EMOJIS = ["🌸", "🌷", "🌹", "💐", "🌺", "🌻", "🌼", "🪻", "🪷"];

function render() {
  if (!state.content) {
    app.innerHTML = `
      <div class="loading-shell">
        <div class="loading-dot" aria-hidden="true"></div>
      </div>
    `;
    return;
  }

  if (state.screen === "welcome") {
    renderWelcome();
    return;
  }

  if (state.screen === "question") {
    renderQuestion();
    return;
  }

  if (state.screen === "name") {
    renderNameStep();
    return;
  }

  renderResult();
}

function renderWelcome() {
  clearResultEffects();
  const { welcome } = state.content;

  app.innerHTML = `
    <section class="screen">
      <div class="stack">
        <p class="eyebrow">${welcome.eyebrow}</p>
        <h1 class="title">${welcome.title}</h1>
        <p class="body-copy">${welcome.body}</p>
      </div>
      <button class="primary-button" id="start-button">${welcome.button}</button>
    </section>
  `;

  document.getElementById("start-button").addEventListener("click", () => {
    transitionScreen(() => {
      state.questionIndex = 0;
      state.answers = [];
      state.name = "";
      enterFullscreen();
      state.screen = "name";
    });
  });
}

function renderNameStep() {
  clearResultEffects();
  const { nameStep, labels } = state.content;

  app.innerHTML = `
    <section class="screen">
      <div class="stack">
        <div class="question-topbar">
          <button class="back-button" id="name-back-button" type="button">
            ${labels.backButton}
          </button>
        </div>
        <p class="eyebrow">${nameStep.eyebrow}</p>
        <h2 class="question-title">${nameStep.title}</h2>
        <p class="question-copy">${nameStep.body}</p>
        <input
          class="text-input"
          id="name-input"
          name="quiz_name"
          type="text"
          placeholder="${nameStep.placeholder}"
          value="${escapeHtml(state.name)}"
          autocomplete="off"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
          inputmode="text"
        />
      </div>
      <button class="primary-button" id="name-next-button" type="button">${nameStep.button}</button>
    </section>
  `;

  const nameInput = document.getElementById("name-input");
  const nextButton = document.getElementById("name-next-button");
  const backButton = document.getElementById("name-back-button");

  nameInput.addEventListener("input", (event) => {
    state.name = event.target.value;
  });

  nextButton.addEventListener("click", () => {
    if (!isAllowedName(state.name)) {
      flashInvalidButton(nextButton);
      return;
    }

    transitionScreen(() => {
      state.screen = "question";
      state.questionIndex = 0;
    });
  });

  backButton.addEventListener("click", () => {
    if (state.transitioning) {
      return;
    }

    transitionScreen(() => {
      state.screen = "welcome";
    });
  });
}

function renderQuestion() {
  clearResultEffects();
  const question = state.content.questions[state.questionIndex];
  const total = state.content.questions.length;
  const optionConfig = getOptionConfig(question.options);

  teardownInfiniteOptions();

  app.innerHTML = `
    <section class="screen">
      <div class="stack">
        <div class="question-topbar">
          <button class="back-button" id="back-button" type="button">
            ${state.content.labels.backButton}
          </button>
          <p class="step-chip">${state.content.labels.questionPrefix} ${state.questionIndex + 1} / ${total}</p>
        </div>
        <h2 class="question-title">${question.prompt}</h2>
        <p class="question-copy">${question.helper}</p>
      </div>
      <div class="options${optionConfig.infinite ? " options-infinite" : ""}" id="options"></div>
    </section>
  `;

  const options = document.getElementById("options");
  optionConfig.visibleOptions.forEach((option) => {
    const button = document.createElement("button");
    button.className = "option-button";
    button.type = "button";
    button.textContent = option;
    button.addEventListener("click", () => handleAnswer(option, button));
    options.appendChild(button);
  });

  if (optionConfig.infinite) {
    setupInfiniteOptions(options, optionConfig.repeatOption);
  }

  document.getElementById("back-button").addEventListener("click", () => {
    if (state.transitioning) {
      return;
    }

    transitionScreen(() => {
      if (state.questionIndex === 0) {
        state.screen = "name";
        return;
      }

      state.questionIndex -= 1;
    });
  });
}

function setupInfiniteOptions(container, option) {
  teardownInfiniteOptions();

  appendRepeatedOptions(container, option, 12);

  const maybeAppendMore = () => {
    const remaining = document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
    if (remaining < 160) {
      appendRepeatedOptions(container, option, 8);
    }
  };

  state.infiniteScrollHandler = maybeAppendMore;
  window.addEventListener("scroll", maybeAppendMore, { passive: true });
  maybeAppendMore();
}

function teardownInfiniteOptions() {
  if (!state.infiniteScrollHandler) {
    return;
  }

  window.removeEventListener("scroll", state.infiniteScrollHandler);
  state.infiniteScrollHandler = null;
}

function appendRepeatedOptions(container, option, count) {
  for (let index = 0; index < count; index += 1) {
    const button = document.createElement("button");
    button.className = "option-button";
    button.type = "button";
    button.textContent = option;
    button.addEventListener("click", () => handleAnswer(option, button));
    container.appendChild(button);
  }
}

function getOptionConfig(options) {
  const infinityIndex = options.findIndex((option) => option.trim().toLowerCase() === "infinity");

  if (infinityIndex <= 0) {
    return {
      infinite: false,
      visibleOptions: options
    };
  }

  return {
    infinite: true,
    visibleOptions: options.slice(0, infinityIndex),
    repeatOption: options[infinityIndex - 1]
  };
}

function enterFullscreen() {
  const root = document.documentElement;

  if (document.fullscreenElement) {
    return;
  }

  const request =
    root.requestFullscreen ||
    root.webkitRequestFullscreen ||
    root.msRequestFullscreen;

  if (typeof request === "function") {
    request.call(root).catch?.(() => {});
  }
}

function handleAnswer(option, buttonElement) {
  if (state.transitioning) {
    return;
  }

  state.answers[state.questionIndex] = option;
  const screen = app.querySelector(".screen");
  buttonElement.classList.add("option-button-selected");

  transitionScreen(
    () => {
      if (state.questionIndex < state.content.questions.length - 1) {
        state.questionIndex += 1;
        return;
      }

      state.screen = "result";
    },
    { preDelay: 180, screen }
  );
}

function renderResult() {
  const { result } = state.content;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const particles = Array.from({ length: 14 }, (_, index) => {
    const random = particleRandom(index + 1);
    const angle = random() * Math.PI * 2;
    const x = Math.cos(angle).toFixed(3);
    const y = Math.sin(angle).toFixed(3);
    const duration = Math.round(1350 + random() * 900);
    const delay = -Math.round(random() * duration);
    const start = (72 + random() * 6).toFixed(1);
    const end = (112 + random() * 14).toFixed(1);
    const size = (6.5 + random() * 3.5).toFixed(1);

    return `<span class="score-particle" style="--x:${x}; --y:${y}; --delay:${delay}ms; --duration:${duration}ms; --start:${start}px; --end:${end}px; --size:${size}px;"></span>`;
  }).join("");

  app.innerHTML = `
    <section class="screen">
      <div class="stack">
        <div class="question-topbar">
          <button class="back-button" id="restart-button" type="button">
            ${state.content.labels.restartButton}
          </button>
        </div>
        <p class="eyebrow">${result.eyebrow}</p>
        <h2 class="question-title">${result.title}</h2>
        <p class="result-copy">${result.intro}</p>
      </div>
      <div class="score-wrap">
        <div class="score-scene" id="score-scene">
          <div class="score-particles" aria-hidden="true">${particles}</div>
          <div class="score-ring" id="score-ring">
            <svg class="score-svg" viewBox="0 0 120 120" aria-hidden="true">
              <circle class="score-track" cx="60" cy="60" r="52"></circle>
              <circle class="score-progress" id="score-progress" cx="60" cy="60" r="52"></circle>
            </svg>
            <span class="score-value" id="score-value">?</span>
          </div>
        </div>
        <p class="score-label">${result.scoreLabel}</p>
        <p class="result-copy hidden" id="result-body">${result.body}</p>
        <button class="primary-button celebrate-button" id="celebrate-button" type="button">${getCelebrateButtonText(0)}</button>
        <button class="primary-button" id="reveal-button">${result.button}</button>
      </div>
      <canvas class="flower-stream" id="flower-stream" aria-hidden="true"></canvas>
    </section>
  `;

  const button = document.getElementById("reveal-button");
  const celebrateButton = document.getElementById("celebrate-button");
  const restartButton = document.getElementById("restart-button");
  const scoreProgress = document.getElementById("score-progress");
  scoreProgress.style.strokeDasharray = `${circumference}`;
  scoreProgress.style.strokeDashoffset = `${circumference}`;
  restartButton.addEventListener("click", resetToWelcome);
  setCelebrateButtonVisible(false);
  celebrateButton.addEventListener("click", handleCelebrateButtonClick);
  button.addEventListener("click", revealScore, { once: true });
}

function resetToWelcome() {
  transitionScreen(() => {
    state.screen = "welcome";
    state.questionIndex = 0;
    state.answers = [];
    state.name = "";
  });
}

function revealScore() {
  const target = 100;
  const duration = 10000;
  const start = performance.now();
  const scoreScene = document.getElementById("score-scene");
  const scoreValue = document.getElementById("score-value");
  const scoreProgress = document.getElementById("score-progress");
  const resultBody = document.getElementById("result-body");
  const revealButton = document.getElementById("reveal-button");
  const celebrateButton = document.getElementById("celebrate-button");
  const radius = 52;
  const circumference = 2 * Math.PI * radius;

  revealButton.disabled = true;
  revealButton.classList.add("hidden");
  scoreScene.classList.remove("score-scene-finishing");
  scoreScene.classList.add("score-scene-active");
  scoreProgress.style.strokeDasharray = `${circumference}`;
  scoreProgress.style.strokeDashoffset = `${circumference}`;

  function tick(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = scoreCurve(progress);
    const rawValue = target * eased;
    const value = progress < 1 ? Math.min(99, Math.floor(rawValue)) : 100;
    const offset = circumference * (1 - rawValue / 100);

    scoreValue.textContent = `${value}%`;
    scoreProgress.style.strokeDashoffset = `${offset}`;

    if (progress < 1) {
      requestAnimationFrame(tick);
      return;
    }

    scoreScene.classList.add("score-scene-finishing");
    resultBody.classList.remove("hidden");
    celebrateButton.textContent = getCelebrateButtonText(state.celebratePressCount);
    scheduleCelebrateButton(1000);
  }

  requestAnimationFrame(tick);
}

function handleCelebrateButtonClick() {
  const celebrateButton = document.getElementById("celebrate-button");
  if (!celebrateButton || !celebrateButton.classList.contains("celebrate-button-visible")) {
    return;
  }

  state.celebratePressCount += 1;
  if (state.celebratePressCount <= 10) {
    state.flowerStreamIntensity = Math.min(10, state.flowerStreamIntensity + 1.1);
  }

  state.flowerSizeBoost = Math.min(5.4, state.flowerSizeBoost + 0.42);
  startFlowerStream();
  setCelebrateButtonVisible(false);
  window.setTimeout(() => {
    const nextCelebrateButton = document.getElementById("celebrate-button");
    if (!nextCelebrateButton) {
      return;
    }

    nextCelebrateButton.textContent = getCelebrateButtonText(state.celebratePressCount);
  }, 500);
  scheduleCelebrateButton(1000);
}

function scoreCurve(progress) {
  const stops = [
    { t: 0, value: 0 },
    { t: 0.08, value: 0.1 },
    { t: 0.16, value: 0.28 },
    { t: 0.28, value: 0.5 },
    { t: 0.42, value: 0.7 },
    { t: 0.56, value: 0.83 },
    { t: 0.68, value: 0.9 },
    { t: 0.8, value: 0.95 },
    { t: 0.9, value: 0.98 },
    { t: 0.96, value: 0.992 },
    { t: 0.988, value: 0.997 },
    { t: 0.997, value: 0.999 },
    { t: 1, value: 1 }
  ];

  for (let index = 1; index < stops.length; index += 1) {
    const previous = stops[index - 1];
    const current = stops[index];

    if (progress <= current.t) {
      const segmentProgress = (progress - previous.t) / (current.t - previous.t);
      const smoothed = easeScoreSegment(segmentProgress, current.value);
      return previous.value + (current.value - previous.value) * smoothed;
    }
  }

  return 1;
}

function easeScoreSegment(progress, currentValue) {
  if (currentValue <= 0.9) {
    return 1 - Math.pow(1 - progress, 2.6);
  }

  if (currentValue <= 0.98) {
    return progress * progress * (3 - 2 * progress);
  }

  if (currentValue <= 0.997) {
    return Math.pow(progress, 2.8);
  }

  return Math.pow(progress, 5.2);
}

function particleRandom(seed) {
  let value = seed * 9973;

  return function next() {
    value = (value * 48271) % 2147483647;
    return value / 2147483647;
  };
}

function startFlowerStream() {
  const canvas = document.getElementById("flower-stream");
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }

  canvas.classList.add("flower-stream-active");
  ensureFlowerSystem(canvas);

  const burstCount = Math.max(3, Math.round(state.flowerStreamIntensity) + 2);
  for (let index = 0; index < burstCount; index += 1) {
    spawnFlowerParticle(true);
  }
}

function ensureFlowerSystem(canvas) {
  if (!state.flowerSystem) {
    state.flowerSystem = {
      canvas,
      context: canvas.getContext("2d"),
      particles: [],
      rafId: 0,
      lastFrameTime: 0,
      spawnCarry: 0
    };
  } else {
    state.flowerSystem.canvas = canvas;
  }

  resizeFlowerCanvas();

  if (!state.flowerResizeHandler) {
    state.flowerResizeHandler = () => resizeFlowerCanvas();
    window.addEventListener("resize", state.flowerResizeHandler, { passive: true });
  }

  if (!state.flowerSystem.rafId) {
    state.flowerSystem.lastFrameTime = performance.now();
    state.flowerSystem.rafId = requestAnimationFrame(runFlowerFrame);
  }
}

function resizeFlowerCanvas() {
  if (!state.flowerSystem?.canvas || !state.flowerSystem.context) {
    return;
  }

  const { canvas, context } = state.flowerSystem;
  const dpr = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function runFlowerFrame(now) {
  const system = state.flowerSystem;
  if (!system?.context || !system.canvas) {
    return;
  }

  const deltaMs = Math.min(now - system.lastFrameTime || 16, 32);
  const deltaSeconds = deltaMs / 1000;
  system.lastFrameTime = now;

  updateFlowerParticles(deltaSeconds);
  drawFlowerParticles();

  system.rafId = requestAnimationFrame(runFlowerFrame);
}

function updateFlowerParticles(deltaSeconds) {
  const system = state.flowerSystem;
  if (!system) {
    return;
  }

  const spawnRate = 0.9 + state.flowerStreamIntensity * 1.35;
  system.spawnCarry += spawnRate * deltaSeconds;

  const maxParticles = 90 + Math.round(state.flowerStreamIntensity * 18);
  while (system.spawnCarry >= 1 && system.particles.length < maxParticles) {
    spawnFlowerParticle(false);
    system.spawnCarry -= 1;
  }

  system.particles = system.particles.filter((particle) => {
    particle.age += deltaSeconds;
    if (particle.age >= particle.life) {
      return false;
    }

    const progress = particle.age / particle.life;
    particle.x = particle.startX + particle.driftX * progress;
    particle.y = particle.startY - particle.travelY * progress;
    particle.rotation = particle.rotationStart + particle.rotationDelta * progress;
    particle.alpha = getFlowerAlpha(progress);
    return true;
  });
}

function drawFlowerParticles() {
  const system = state.flowerSystem;
  if (!system?.context || !system.canvas) {
    return;
  }

  const { context, canvas, particles } = system;
  context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  context.textAlign = "center";
  context.textBaseline = "middle";

  for (const particle of particles) {
    context.save();
    context.globalAlpha = particle.alpha;
    context.translate(particle.x, particle.y);
    context.rotate(particle.rotation);
    context.font = `${particle.size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    context.fillText(particle.emoji, 0, 0);
    context.restore();
  }
}

function spawnFlowerParticle(isBurst) {
  const system = state.flowerSystem;
  if (!system?.canvas) {
    return;
  }

  const width = window.innerWidth;
  const height = window.innerHeight;
  const overshootX = width * 0.12;
  const random = particleRandom(Date.now() + system.particles.length * 17 + Math.floor(Math.random() * 9999));
  const baseSize = 26 + random() * 18;
  const size = baseSize + state.flowerSizeBoost * 18 + state.celebratePressCount * 1.2;
  const life = (isBurst ? 4.2 : 4.6) + random() * 2.0;

  system.particles.push({
    emoji: FLOWER_EMOJIS[Math.floor(random() * FLOWER_EMOJIS.length)],
    size,
    age: 0,
    life,
    startX: -overshootX + random() * (width + overshootX * 2),
    startY: height + size * (0.5 + random() * 0.8),
    x: 0,
    y: 0,
    driftX: (-0.22 + random() * 0.44) * width,
    travelY: height * (1.14 + random() * 0.28),
    rotationStart: (-0.24 + random() * 0.48),
    rotationDelta: (-0.65 + random() * 1.3),
    rotation: 0,
    alpha: 0
  });
}

function getFlowerAlpha(progress) {
  if (progress < 0.08) {
    return progress / 0.08;
  }

  if (progress < 0.7) {
    return 0.95 - (progress - 0.08) * 0.18;
  }

  const fadeProgress = (progress - 0.7) / 0.3;
  return 0.84 * (1 - fadeProgress);
}

function transitionScreen(updateState, options = {}) {
  if (state.transitioning) {
    return;
  }

  const { preDelay = 0, duration = 220, screen = app.querySelector(".screen") } = options;
  state.transitioning = true;

  const buttons = app.querySelectorAll("button");
  buttons.forEach((button) => {
    button.disabled = true;
  });

  window.setTimeout(() => {
    if (screen) {
      screen.classList.add("screen-leave");
    }

    window.setTimeout(() => {
      updateState();
      state.transitioning = false;
      render();
    }, duration);
  }, preDelay);
}

function isAllowedName(value) {
  const normalized = String(value)
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();

  const allowedNames = new Set([
    "riana",
    "rian",
    "ryan",
    "riri",
    "riana binisan",
    "rian binisan",
    "ryan binisan",
    "riri binisan"
  ]);

  return allowedNames.has(normalized);
}

function flashInvalidButton(button) {
  button.classList.remove("primary-button-invalid");
  void button.offsetWidth;
  button.classList.add("primary-button-invalid");

  window.setTimeout(() => {
    button.classList.remove("primary-button-invalid");
  }, 900);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function clearResultEffects() {
  if (state.revealFollowupTimeout) {
    window.clearTimeout(state.revealFollowupTimeout);
    state.revealFollowupTimeout = null;
  }

  if (state.flowerSystem?.rafId) {
    cancelAnimationFrame(state.flowerSystem.rafId);
  }

  if (state.flowerResizeHandler) {
    window.removeEventListener("resize", state.flowerResizeHandler);
    state.flowerResizeHandler = null;
  }

  state.flowerSystem = null;
  state.flowerStreamIntensity = 0;
  state.celebratePressCount = 0;
  state.flowerSizeBoost = 0;
  state.lastCelebrateText = "";
}

function scheduleCelebrateButton(delay) {
  if (state.revealFollowupTimeout) {
    window.clearTimeout(state.revealFollowupTimeout);
  }

  state.revealFollowupTimeout = window.setTimeout(() => {
    setCelebrateButtonVisible(true);
    state.revealFollowupTimeout = null;
  }, delay);
}

function setCelebrateButtonVisible(isVisible) {
  const celebrateButton = document.getElementById("celebrate-button");
  if (!celebrateButton) {
    return;
  }

  celebrateButton.classList.toggle("celebrate-button-visible", isVisible);
}

function getCelebrateButtonText(index) {
  const result = state.content?.result ?? {};
  const texts = Array.isArray(result.celebrateButtons) && result.celebrateButtons.length > 0
    ? result.celebrateButtons
    : [result.celebrateButton || "Jetzt gib mir Blumen!"];

  if (texts.length === 1 || index <= 0) {
    state.lastCelebrateText = texts[0];
    return texts[0];
  }

  const pool = texts.slice(1);
  const candidates = pool.filter((text) => text !== state.lastCelebrateText);
  const selectionPool = candidates.length > 0 ? candidates : pool;
  const nextText = selectionPool[Math.floor(Math.random() * selectionPool.length)];
  state.lastCelebrateText = nextText;
  return nextText;
}

async function init() {
  render();

  try {
    const response = await fetch("content.json");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    state.content = await response.json();
    state.screen = "welcome";
    render();
  } catch (error) {
    app.innerHTML = `
      <section class="screen">
        <div class="stack">
          <p class="eyebrow">Load error</p>
          <h1 class="title">Content could not be loaded.</h1>
          <p class="body-copy">Serve this folder with a small local web server so the page can read <code>content.json</code>.</p>
        </div>
      </section>
    `;
    console.error(error);
  }
}

init();
