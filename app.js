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
};

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
        <button class="primary-button" id="reveal-button">${result.button}</button>
      </div>
    </section>
  `;

  const button = document.getElementById("reveal-button");
  const restartButton = document.getElementById("restart-button");
  const scoreProgress = document.getElementById("score-progress");
  scoreProgress.style.strokeDasharray = `${circumference}`;
  scoreProgress.style.strokeDashoffset = `${circumference}`;
  restartButton.addEventListener("click", resetToWelcome);
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
  }

  requestAnimationFrame(tick);
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
