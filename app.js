(() => {
  "use strict";

  const QUESTIONS_PER_ROUND = 20;
  const CACHE_VERSION = 4;

  const REMOTE_DICT_URL  = "https://raw.githubusercontent.com/fatihmergin/dictionary/4077b0e4d56c8033dd974b160755a954635d4a49/dictionary.json";
  const REMOTE_WORDS_URL = "https://raw.githubusercontent.com/fatihmergin/dictionary/4077b0e4d56c8033dd974b160755a954635d4a49/words.json";

  const LS_WORDS_KEY = `anonas_words_v${CACHE_VERSION}`;
  const LS_DICT_KEY  = `anonas_dict_v${CACHE_VERSION}`;

  const backupWords = [
    { id: 1, word: "APPLE", difficulty: 1, icon: "🍎", hint: "I eat a red ______" },
    { id: 2, word: "CAR",   difficulty: 1, icon: "🚗", hint: "I drive a fast ______" }
  ];
  const backupDict = { "i":"ich", "eat":"esse", "red":"rot", "apple":"Apfel", "drive":"fahre", "fast":"schnell", "car":"Auto" };

  const gameState = {
    currentQuestionIndex: 0,
    roundProgress: 0,
    gems: 450,
    wordArr: [],
    userArr: [],
    pool: [],
    locked: false
  };

  let questionPool = [];
  let dictionary = {};
  let gameQueue = [];

  const elClose = document.getElementById("btn-close");
  const elJoker = document.getElementById("btn-joker");
  const elImage = document.getElementById("wb-image");
  const elHint  = document.getElementById("wb-hint-text");
  const elSlots = document.getElementById("wb-slots");
  const elPool  = document.getElementById("wb-pool");
  const elCheck = document.getElementById("wb-check");
  const elProg  = document.getElementById("wb-progress");
  const elGems  = document.getElementById("gem-count");
  const elFb    = document.getElementById("wb-feedback");
  const elTT    = document.getElementById("translate-tooltip");

  elClose.addEventListener("click", () => alert("Hauptmenü"));
  elJoker.addEventListener("click", useJoker);
  elImage.addEventListener("click", speakCurrentWord);
  elCheck.addEventListener("click", checkWord);

  function safeJsonParse(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
  }

  function readEmbeddedJson(id, fallback) {
    const node = document.getElementById(id);
    if (!node) return fallback;
    const text = (node.textContent || "").trim();
    if (!text) return fallback;
    return safeJsonParse(text, fallback);
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function normalizeWordToken(w) {
    return (w || "").replace(/[.,?!:;()"]/g, "").trim().toLowerCase();
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function safeConfetti(opts) {
    try {
      if (typeof confetti === "function") confetti(opts);
    } catch (_) {}
  }

  function safeSpeak(text) {
    try {
      if (!("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text));
      u.lang = "en-US";
      u.rate = 0.9;
      window.speechSynthesis.speak(u);
    } catch (_) {}
  }

  loadAllData();

  async function loadAllData() {
    const localWords = localStorage.getItem(LS_WORDS_KEY);
    const localDict  = localStorage.getItem(LS_DICT_KEY);

    if (localWords && localDict) {
      questionPool = safeJsonParse(localWords, []);
      dictionary   = safeJsonParse(localDict, {});
      if (questionPool.length && Object.keys(dictionary).length) {
        startGame();
        fetchRemoteData(false);
        return;
      }
    }

    const embeddedWords = readEmbeddedJson("embedded-words", []);
    const embeddedDict  = readEmbeddedJson("embedded-dict", {});
    if (Array.isArray(embeddedWords) && embeddedWords.length && embeddedDict && Object.keys(embeddedDict).length) {
      questionPool = embeddedWords;
      dictionary   = embeddedDict;
      localStorage.setItem(LS_WORDS_KEY, JSON.stringify(embeddedWords));
      localStorage.setItem(LS_DICT_KEY, JSON.stringify(embeddedDict));
      startGame();
      fetchRemoteData(false);
      return;
    }

    const ok = await fetchRemoteData(true);
    if (ok) return;

    questionPool = backupWords;
    dictionary = backupDict;
    startGame();
  }

  async function fetchRemoteData(isFirstLoad) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 8000);

      const [wordsRes, dictRes] = await Promise.all([
        fetch(REMOTE_WORDS_URL, { signal: controller.signal }),
        fetch(REMOTE_DICT_URL,  { signal: controller.signal })
      ]);

      clearTimeout(t);

      if (!wordsRes.ok || !dictRes.ok) throw new Error("Fetch not ok");

      const wordsData = await wordsRes.json();
      const dictData  = await dictRes.json();

      if (!Array.isArray(wordsData) || !dictData || typeof dictData !== "object") {
        throw new Error("Invalid JSON format");
      }

      questionPool = wordsData;
      dictionary = dictData;

      localStorage.setItem(LS_WORDS_KEY, JSON.stringify(wordsData));
      localStorage.setItem(LS_DICT_KEY, JSON.stringify(dictData));

      if (isFirstLoad) startGame();
      return true;
    } catch (e) {
      if (isFirstLoad) {
        alert("İnternet kurulamadı. Offline mod açılıyor.");
      }
      return false;
    }
  }

  function startGame() {
    if (!Array.isArray(questionPool) || questionPool.length === 0) questionPool = backupWords;
    if (!dictionary || typeof dictionary !== "object") dictionary = backupDict;

    generateGameQueue();
    gameState.currentQuestionIndex = 0;
    gameState.roundProgress = 0;
    initLevel();
  }

  function generateGameQueue() {
    const easy   = questionPool.filter(q => q && q.difficulty === 1);
    const medium = questionPool.filter(q => q && q.difficulty === 2);
    const hard   = questionPool.filter(q => q && q.difficulty === 3);

    shuffle(easy); shuffle(medium); shuffle(hard);

    gameQueue = [];
    while (easy.length || medium.length || hard.length) {
      if (easy.length) gameQueue.push(easy.pop());
      if (medium.length) gameQueue.push(medium.pop());
      if (easy.length) gameQueue.push(easy.pop());
      if (hard.length && Math.random() > 0.3) gameQueue.push(hard.pop());
      if (!easy.length && !medium.length && hard.length) gameQueue.push(hard.pop());
    }
    if (!gameQueue.length) gameQueue = [...backupWords];
  }

  function initLevel() {
    gameState.locked = false;

    if (gameState.currentQuestionIndex >= gameQueue.length) {
      alert("Tüm kelimeler bitti! Yeniden karıştırılıyor... 🎉");
      generateGameQueue();
      gameState.currentQuestionIndex = 0;
    }

    const data = gameQueue[gameState.currentQuestionIndex] || backupWords[0];

    const word = String(data.word || "").toUpperCase();
    gameState.wordArr = word.split("");
    gameState.userArr = new Array(gameState.wordArr.length).fill(null);

    const charMap = gameState.wordArr.map((char, i) => ({ char, id: `${data.id || "x"}_${i}` }));
    shuffle(charMap);
    gameState.pool = charMap;

    updateHeader();
    updateTopSection(data);
    renderSlots();
    renderPool();
    updateCheckBtn();
  }

  function updateHeader() {
    const pct = (gameState.roundProgress / QUESTIONS_PER_ROUND) * 100;
    elProg.style.width = `${pct}%`;
    elGems.textContent = String(gameState.gems);
  }

  function updateTopSection(data) {
    elImage.textContent = data.icon || "❓";

    const rawHint = String(data.hint || "").replace("______", "###BLANK###");
    const parts = rawHint.split(/\s+/).filter(Boolean);

    const html = parts.map((w) => {
      if (w.includes("###BLANK###")) return "<span class='hint-blank'></span>";
      const clean = normalizeWordToken(w);
      const safe = clean.replace(/'/g, "\\'");
      return `<span class="word-span" data-word="${safe}">${w}</span>`;
    }).join(" ");

    elHint.innerHTML = html;

    elHint.querySelectorAll(".word-span").forEach(span => {
      span.addEventListener("click", () => {
        const wordKey = span.getAttribute("data-word") || "";
        showTooltip(span, wordKey);
      });
    });

    hideFeedback();
  }

  function renderSlots() {
    elSlots.innerHTML = "";
    gameState.wordArr.forEach((_, idx) => {
      const val = gameState.userArr[idx];
      const slot = document.createElement("div");
      slot.className = `wb-slot ${val ? "filled" : ""}`;
      slot.id = `slot-${idx}`;
      slot.textContent = val ? val.char : "";
      slot.addEventListener("click", () => removeLetter(idx));
      elSlots.appendChild(slot);
    });
  }

  function renderPool() {
    elPool.innerHTML = "";
    gameState.pool.forEach((item) => {
      const btn = document.createElement("div");
      btn.className = "wb-letter-btn";
      btn.id = `pool-btn-${item.id}`;
      btn.textContent = item.char;
      btn.addEventListener("click", () => pickLetter(item));
      elPool.appendChild(btn);
    });
  }

  function pickLetter(itemObj) {
    if (gameState.locked) return;
    const btn = document.getElementById(`pool-btn-${itemObj.id}`);
    if (!btn || btn.classList.contains("used")) return;

    const emptyIdx = gameState.userArr.findIndex(x => x === null);
    if (emptyIdx === -1) return;

    gameState.userArr[emptyIdx] = itemObj;
    updateSlotDOM(emptyIdx, itemObj.char, true);
    updatePoolDOM(itemObj.id, true);
    updateCheckBtn();
  }

  function removeLetter(slotIdx) {
    if (gameState.locked) return;
    const item = gameState.userArr[slotIdx];
    if (!item) return;

    gameState.userArr[slotIdx] = null;
    updateSlotDOM(slotIdx, "", false);
    updatePoolDOM(item.id, false);
    updateCheckBtn();
  }

  function updateSlotDOM(idx, char, isFilled) {
    const el = document.getElementById(`slot-${idx}`);
    if (!el) return;
    el.textContent = char;
    el.classList.toggle("filled", !!isFilled);
  }

  function updatePoolDOM(id, isUsed) {
    const el = document.getElementById(`pool-btn-${id}`);
    if (!el) return;
    el.classList.toggle("used", !!isUsed);
  }

  function updateCheckBtn() {
    const isFull = gameState.userArr.every(x => x !== null);
    elCheck.disabled = !isFull;

    if (!gameState.locked) {
      elCheck.textContent = "ÜBERPRÜFEN";
      elCheck.style.backgroundColor = "var(--accent-purple)";
    }
  }

  function useJoker() {
    if (gameState.locked) return;
    if (gameState.gems < 10) { alert("Nicht genug Edelsteine! (Min: 10)"); return; }

    const emptyIdx = gameState.userArr.findIndex(x => x === null);
    if (emptyIdx === -1) return;

    const correctChar = gameState.wordArr[emptyIdx];

    const poolItem = gameState.pool.find(p => {
      if (p.char !== correctChar) return false;
      const el = document.getElementById(`pool-btn-${p.id}`);
      return el && !el.classList.contains("used");
    });

    if (!poolItem) return;

    gameState.gems -= 10;
    updateHeader();

    elGems.style.animation = "popScore 0.3s";
    setTimeout(() => { elGems.style.animation = ""; }, 300);

    pickLetter(poolItem);
  }

  function checkWord() {
    if (gameState.locked) return;

    const userWordStr = gameState.userArr.map(x => x?.char || "").join("");
    const targetWordStr = String((gameQueue[gameState.currentQuestionIndex] || {}).word || "");

    const slots = document.querySelectorAll(".wb-slot");

    if (userWordStr === targetWordStr) {
      gameState.locked = true;

      safeSpeak(targetWordStr);

      elCheck.textContent = "SUPER!";
      elCheck.disabled = true;
      elCheck.style.background = "var(--success-green)";

      slots.forEach(s => s.classList.add("correct-anim"));

      showFeedback("Richtig! +20 💎", "var(--success-green)");

      gameState.gems += 20;
      gameState.roundProgress += 1;
      updateHeader();

      safeConfetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });

      setTimeout(() => {
        if (gameState.roundProgress >= QUESTIONS_PER_ROUND) {
          alert(`GLÜCKWUNSCH! Du hast ${QUESTIONS_PER_ROUND} Wörter gelernt! 🎉`);
          gameState.roundProgress = 0;
        }
        gameState.currentQuestionIndex += 1;
        initLevel();
      }, 2000);
    } else {
      showFeedback("Falsch! Versuch es nochmal.", "var(--error-red)");
      slots.forEach(s => s.classList.add("wrong-anim"));
      setTimeout(() => {
        slots.forEach(s => s.classList.remove("wrong-anim"));
        hideFeedback();
      }, 800);
    }
  }

  function showFeedback(text, color) {
    elFb.textContent = text;
    elFb.style.opacity = "1";
    elFb.style.color = color;
  }

  function hideFeedback() {
    elFb.style.opacity = "0";
  }

  function showTooltip(anchorEl, word) {
    const key = normalizeWordToken(word);
    const trans = (dictionary && dictionary[key]) ? dictionary[key] : key || word || "";
    elTT.textContent = String(trans);
    elTT.classList.add("show");

    const rect = anchorEl.getBoundingClientRect();
    requestAnimationFrame(() => {
      const ttW = elTT.offsetWidth || 120;
      const desiredLeft = rect.left + rect.width / 2 - ttW / 2;
      const left = clamp(desiredLeft, 8, window.innerWidth - ttW - 8);
      const top = clamp(rect.top - 40, 8, window.innerHeight - 60);

      elTT.style.left = `${left}px`;
      elTT.style.top = `${top}px`;
    });

    setTimeout(() => elTT.classList.remove("show"), 1500);
  }

  function speakCurrentWord() {
    const data = gameQueue[gameState.currentQuestionIndex];
    if (!data) return;
    safeSpeak(data.word);
  }
})();