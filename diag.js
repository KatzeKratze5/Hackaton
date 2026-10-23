"use strict";
// diag.js: діагностика пристрою. Показує лише те, що реально виявлено.

// ---------- Налаштування (запасні значення; config.json їх перекриває) ----------
let config = {
  language: "uk-UA",
  speechRate: 1.0,
  diagShortPhrase: "Добрий день. Це перевірка голосу.",
  diagLongPhrase: "Це довга фраза для перевірки озвучення. ".repeat(11)
};
if (window.AppConfig) {
  AppConfig.load().then((res) => {
    const c = res.config;
    config.language = c.language;
    config.speechRate = c.profile.speechRate;
    config.diagShortPhrase = c.system.diagShortPhrase;
    config.diagLongPhrase = c.system.diagLongPhrase;
    $("rate").value = String(c.profile.speechRate);
    $("rateOut").textContent = Number(c.profile.speechRate).toFixed(1);
    $("pitch").value = String(c.profile.speechPitch);
    $("pitchOut").textContent = Number(c.profile.speechPitch).toFixed(1);
    AppConfig.applyProfile(c);
  }).catch(() => { /* лишаємо запасні значення */ });
}

const $ = (id) => document.getElementById(id);

// ---------- Звіт ----------
const S_YES = "Підтримується";
const S_NO = "Не підтримується";
const S_TODO = "Ще не перевірено";

const ITEMS = [
  ["https", "Захищене з'єднання (https)"],
  ["online", "Мережа зараз (онлайн/офлайн)"],
  ["sw", "Service worker (офлайн-режим)"],
  ["storage", "localStorage"],
  ["tts", "Озвучення (speechSynthesis)"],
  ["ttsUk", "Український голос у списку"],
  ["ttsShort", "Озвучення: коротка фраза"],
  ["ttsLong", "Озвучення: довга фраза без обриву"],
  ["stt", "Розпізнавання мови (API є)"],
  ["sttTest", "Розпізнавання мови: тест «Слухати»"],
  ["cam", "Камера (дозвіл і потік)"],
  ["mic", "Мікрофон (дозвіл і рівень сигналу)"],
  ["vib", "Вібрація (navigator.vibrate є)"],
  ["vibTest", "Вібрація: відчули на дотик"],
  ["wake", "Screen Wake Lock (API є)"],
  ["wakeTest", "Screen Wake Lock: тест запиту"],
  ["qr", "BarcodeDetector для QR (додатково)"]
];
const results = {};
ITEMS.forEach(([k, n]) => { results[k] = { name: n, status: S_TODO, detail: "" }; });
const extra = { permCam: "не запитано", permMic: "не запитано" };

function setResult(key, status, detail) {
  results[key].status = status;
  results[key].detail = detail || "";
  renderReport();
}

function isStandalone() {
  return window.navigator.standalone === true ||
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
}

function reportText() {
  const L = [];
  L.push("ЗВІТ ДІАГНОСТИКИ ПРИСТРОЮ");
  L.push("Час: " + new Date().toLocaleString("uk-UA"));
  L.push("Адреса: " + location.href);
  L.push("Режим: " + (isStandalone() ? "встановлений застосунок (standalone)" : "вкладка браузера"));
  L.push("userAgent: " + navigator.userAgent);
  L.push("Мова браузера: " + (navigator.language || "невідомо"));
  L.push("Екран: " + screen.width + "×" + screen.height + ", devicePixelRatio " + window.devicePixelRatio);
  L.push("Permissions API: камера — " + extra.permCam + "; мікрофон — " + extra.permMic);
  L.push("");
  ITEMS.forEach(([k], i) => {
    const r = results[k];
    L.push((i + 1) + ". " + r.name + ": " + r.status + (r.detail ? " — " + r.detail : ""));
  });
  L.push("");
  L.push("Голосів усього: " + voicesSorted.length);
  const uk = voicesSorted.filter(isUk);
  L.push("Українські голоси: " + (uk.length ? uk.map(voiceLabel).join("; ") : "немає"));
  return L.join("\n");
}

function renderReport() {
  const list = $("reportList");
  list.textContent = "";
  ITEMS.forEach(([k]) => {
    const r = results[k];
    const li = document.createElement("li");
    li.className = r.status === S_YES ? "yes" : r.status === S_NO ? "no" : "todo";
    const mark = r.status === S_YES ? "✔ " : r.status === S_NO ? "✖ " : "? ";
    const b = document.createElement("strong");
    b.textContent = mark + r.name + ": " + r.status;
    li.appendChild(b);
    if (r.detail) {
      const d = document.createElement("div");
      d.className = "detail";
      d.textContent = r.detail;
      li.appendChild(d);
    }
    list.appendChild(li);
  });
  $("reportPre").textContent = reportText();
}

// ---------- Допоміжне ----------
const hasTTS = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
let audioUnlocked = false;
let currentTest = null;
let watchdog = null;
let voicesSorted = [];

// Показати текст і (якщо звук увімкнено) озвучити
function notify(el, text) {
  el.textContent = text;
  announce(text);
}

function announce(text) {
  if (!hasTTS || !audioUnlocked) return;
  try {
    abortCurrentTest("перервано іншим озвученням");
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = config.language;
    const v = selectedVoice();
    if (v) u.voice = v;
    u.rate = Number($("rate").value);
    window.speechSynthesis.speak(u);
  } catch (e) { /* озвучення недоступне, текст уже на екрані */ }
}

// Питання «так/ні» до користувача
function ask(boxId, question, onAnswer) {
  $(boxId).hidden = false;
  $(boxId + "Q").textContent = question;
  $(boxId + "Yes").onclick = () => { $(boxId).hidden = true; onAnswer(true); };
  $(boxId + "No").onclick = () => { $(boxId).hidden = true; onAnswer(false); };
}

// ---------- Автоматичні перевірки ----------
function autoChecks() {
  setResult("https", window.isSecureContext ? S_YES : S_NO,
    "протокол " + location.protocol + ", isSecureContext=" + window.isSecureContext);

  updateOnline();
  window.addEventListener("online", updateOnline);
  window.addEventListener("offline", updateOnline);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistration().then((reg) => {
      setResult("sw", S_YES, "API є; реєстрація: " + (reg ? "є" : "немає") +
        "; керує цією сторінкою: " + (navigator.serviceWorker.controller ? "так" : "ні (відкрийте головну сторінку з інтернетом і перезавантажте)"));
    }).catch((e) => setResult("sw", S_YES, "API є, але getRegistration дав помилку: " + e.name));
  } else {
    setResult("sw", S_NO, "navigator.serviceWorker відсутній (можлива причина: немає https, перевірити)");
  }

  try {
    localStorage.setItem("diag_test", "1");
    const v = localStorage.getItem("diag_test");
    localStorage.removeItem("diag_test");
    setResult("storage", v === "1" ? S_YES : S_NO, v === "1" ? "запис і читання працюють" : "значення не збереглось");
  } catch (e) {
    setResult("storage", S_NO, "помилка: " + e.name);
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) {
    setResult("stt", S_YES, window.SpeechRecognition ? "SpeechRecognition" : "webkitSpeechRecognition");
  } else {
    setResult("stt", S_NO, "ні SpeechRecognition, ні webkitSpeechRecognition немає");
    $("sttMsg").textContent = "Розпізнавання мови не підтримується в цьому браузері. Потрібні кнопки замість голосу.";
  }

  if (typeof navigator.vibrate === "function") {
    setResult("vib", S_YES, "navigator.vibrate є (чи вібрує телефон, покаже тест нижче)");
  } else {
    setResult("vib", S_NO, "navigator.vibrate відсутній");
    setResult("vibTest", S_NO, "API відсутнє");
  }

  if ("wakeLock" in navigator) {
    setResult("wake", S_YES, "navigator.wakeLock є (чи працює, покаже тест нижче)");
  } else {
    setResult("wake", S_NO, "navigator.wakeLock відсутній");
    setResult("wakeTest", S_NO, "API відсутнє");
  }

  if ("BarcodeDetector" in window) {
    window.BarcodeDetector.getSupportedFormats().then((f) => {
      setResult("qr", f.includes("qr_code") ? S_YES : S_NO,
        "формати: " + (f.length ? f.join(", ") : "порожній список"));
    }).catch((e) => setResult("qr", S_NO, "помилка getSupportedFormats: " + e.name));
  } else {
    setResult("qr", S_NO, "BarcodeDetector відсутній (для QR знадобиться запасний варіант на JS)");
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setResult("cam", S_NO, "navigator.mediaDevices.getUserMedia відсутній (можлива причина: немає https, перевірити)");
    setResult("mic", S_NO, "navigator.mediaDevices.getUserMedia відсутній (можлива причина: немає https, перевірити)");
  }

  queryPerms();
}

function updateOnline() {
  setResult("online", navigator.onLine ? S_YES : S_NO,
    (navigator.onLine ? "зараз онлайн" : "зараз офлайн") + " (navigator.onLine може помилятися)");
}

async function queryPerm(name) {
  try {
    const p = await navigator.permissions.query({ name });
    return p.state;
  } catch (e) {
    return "недоступно";
  }
}
async function queryPerms() {
  extra.permCam = await queryPerm("camera");
  extra.permMic = await queryPerm("microphone");
  $("permInfo").textContent = "Стан дозволів (Permissions API): камера — " + extra.permCam +
    ", мікрофон — " + extra.permMic + ". «недоступно» означає, що браузер не підтримує цей запит.";
  renderReport();
}

// ---------- 1. Озвучення ----------
function normLang(l) { return (l || "").toLowerCase().replace("_", "-"); }
function isUk(v) { return normLang(v.lang).startsWith("uk"); }
function voiceLabel(v) {
  return v.name + " [" + v.lang + ", " + (v.localService ? "локальний" : "мережевий") + "]";
}
function selectedVoice() {
  const val = $("voiceSel").value;
  if (val === "") return null;
  return voicesSorted[Number(val)] || null;
}

let lastVoiceKey = "";
function loadVoices() {
  if (!hasTTS) return;
  const list = window.speechSynthesis.getVoices() || [];
  voicesSorted = list.slice().sort((a, b) => {
    const ua = isUk(a) ? 0 : 1, ub = isUk(b) ? 0 : 1;
    if (ua !== ub) return ua - ub;
    return (a.name || "").localeCompare(b.name || "");
  });

  // Запам'ятовуємо вибір, щоб він не збивався при оновленні списку
  const cur = selectedVoice();
  if (cur) lastVoiceKey = cur.name + "|" + cur.lang;

  const sel = $("voiceSel");
  sel.textContent = "";
  const auto = document.createElement("option");
  auto.value = "";
  auto.textContent = "Авто (мова " + config.language + ", голос обирає браузер)";
  sel.appendChild(auto);
  voicesSorted.forEach((v, i) => {
    const o = document.createElement("option");
    o.value = String(i);
    o.textContent = (isUk(v) ? "★ " : "") + v.name + " (" + v.lang + ")";
    sel.appendChild(o);
  });
  const keep = voicesSorted.findIndex((v) => v.name + "|" + v.lang === lastVoiceKey);
  sel.value = keep >= 0 ? String(keep) : "";

  const body = $("voiceBody");
  body.textContent = "";
  voicesSorted.forEach((v) => {
    const tr = document.createElement("tr");
    if (isUk(v)) tr.className = "uk";
    [v.name, v.lang, String(v.localService), isUk(v) ? "так" : "ні"].forEach((t) => {
      const td = document.createElement("td");
      td.textContent = t;
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
  $("voiceCount").textContent = String(voicesSorted.length);

  const n = voicesSorted.length;
  const uk = voicesSorted.filter(isUk);
  setResult("tts", S_YES, "API є; голосів у списку: " + n +
    (n === 0 ? " (список порожній: він може з'явитись пізніше, натисніть «Оновити список голосів»)" : ""));
  if (n === 0) {
    setResult("ttsUk", S_TODO, "список голосів порожній");
  } else if (uk.length) {
    setResult("ttsUk", S_YES, uk.map(voiceLabel).join("; "));
  } else {
    setResult("ttsUk", S_NO, "українських голосів у списку немає (озвучення може йти чужим голосом, перевірити на слух)");
  }
}

function initTTS() {
  if (!hasTTS) {
    setResult("tts", S_NO, "speechSynthesis або SpeechSynthesisUtterance відсутні");
    setResult("ttsUk", S_NO, "озвучення немає");
    setResult("ttsShort", S_NO, "озвучення немає");
    setResult("ttsLong", S_NO, "озвучення немає");
    $("ttsMsg").textContent = "Озвучення не підтримується в цьому браузері.";
    return;
  }
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
  // Деякі браузери віддають голоси із затримкою
  [500, 1500, 3000].forEach((ms) => setTimeout(loadVoices, ms));
}

$("rate").addEventListener("input", () => { $("rateOut").textContent = Number($("rate").value).toFixed(1); });
$("pitch").addEventListener("input", () => { $("pitchOut").textContent = Number($("pitch").value).toFixed(1); });
$("refreshBtn").addEventListener("click", () => {
  loadVoices();
  $("ttsMsg").textContent = "Список голосів оновлено: " + voicesSorted.length + ".";
});

$("unlockBtn").addEventListener("click", () => {
  if (!hasTTS) {
    $("ttsMsg").textContent = "Озвучення не підтримується в цьому браузері.";
    return;
  }
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance("Звук увімкнено");
    u.lang = config.language;
    const v = selectedVoice();
    if (v) u.voice = v;
    u.onerror = () => { $("ttsMsg").textContent = "Не вдалося озвучити, спробуйте ще раз."; };
    synth.speak(u);
    audioUnlocked = true;
    $("unlockBtn").textContent = "Звук увімкнено ✔";
    $("ttsMsg").textContent = "Якщо ви почули «Звук увімкнено», озвучення працює. Якщо ні, перевірте гучність і беззвучний режим.";
  } catch (e) {
    $("ttsMsg").textContent = "Не вдалося увімкнути звук: " + e.name;
  }
});

function abortCurrentTest(reason) {
  if (!currentTest) return;
  clearTimeout(watchdog);
  setResult(currentTest.key, S_TODO, reason);
  currentTest = null;
  $("ttsConfirm").hidden = true;
}

function describeTest(t, sec) {
  let s = t.text.length + " симв.; голос: " + (t.voice ? voiceLabel(t.voice) : "авто") +
    "; швидкість " + t.rate + ", висота " + t.pitch + "; тривало " + sec.toFixed(1) + " с";
  s += t.boundaries > 0
    ? "; подій boundary: " + t.boundaries + ", остання позиція " + t.lastChar + " із " + t.text.length
    : "; подій boundary не було (не всі браузери їх надсилають)";
  return s;
}

function runSpeechTest(kind) {
  const key = kind === "long" ? "ttsLong" : "ttsShort";
  const msgEl = $("ttsMsg");
  if (!hasTTS) {
    msgEl.textContent = "Озвучення не підтримується в цьому браузері.";
    return;
  }
  if (!audioUnlocked) {
    notify(msgEl, "Спочатку натисніть «Увімкнути звук».");
    return;
  }
  const synth = window.speechSynthesis;
  abortCurrentTest("перервано новим тестом");
  $("ttsConfirm").hidden = true;
  synth.cancel();

  const text = kind === "long" ? config.diagLongPhrase : config.diagShortPhrase;
  const rate = Number($("rate").value);
  const pitch = Number($("pitch").value);
  const voice = selectedVoice();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = config.language;
  u.rate = rate;
  u.pitch = pitch;
  if (voice) u.voice = voice;

  const t = { key, text, voice, rate, pitch, started: performance.now(), boundaries: 0, lastChar: 0 };
  currentTest = t;
  setResult(key, S_TODO, "тест іде…");
  msgEl.textContent = "Озвучується…";

  u.onstart = () => { if (currentTest === t) t.started = performance.now(); };
  u.onboundary = (e) => {
    if (currentTest !== t) return;
    t.boundaries++;
    if (typeof e.charIndex === "number") t.lastChar = e.charIndex;
  };
  u.onerror = (e) => {
    if (currentTest !== t) return;
    clearTimeout(watchdog);
    currentTest = null;
    const code = e.error || "невідома";
    setResult(key, S_NO, "помилка озвучення: " + code + "; " + describeTest(t, (performance.now() - t.started) / 1000));
    msgEl.textContent = "Не вдалося озвучити (помилка: " + code + "). Спробуйте ще раз.";
  };
  u.onend = () => {
    if (currentTest !== t) return;
    clearTimeout(watchdog);
    currentTest = null;
    const sec = (performance.now() - t.started) / 1000;
    const d = describeTest(t, sec);
    if (sec < Math.max(0.5, text.length / 60)) {
      setResult(key, S_NO, "завершилось надто швидко, ймовірно без звуку; " + d);
      msgEl.textContent = "Звуку, найімовірніше, не було.";
      return;
    }
    setResult(key, S_TODO, "onend отримано без помилок; " + d + "; чекаємо вашої відповіді");
    msgEl.textContent = "Озвучення завершилось.";
    ask("ttsConfirm",
      (kind === "long" ? "Довгу" : "Коротку") + " фразу було чути повністю, до кінця?",
      (ok) => setResult(key, ok ? S_YES : S_NO, d + "; користувач: " + (ok ? "чув повністю" : "обірвалось або не чути")));
  };

  // Запасний таймер: якщо onend так і не прийшов
  const limitSec = Math.round(text.length / (8 * Math.max(rate, 0.5)) + 10);
  watchdog = setTimeout(() => {
    if (currentTest !== t) return;
    currentTest = null;
    synth.cancel();
    setResult(key, S_NO, "onend не надійшов за " + limitSec + " с; " + describeTest(t, limitSec));
    msgEl.textContent = "Озвучення не завершилось вчасно.";
  }, limitSec * 1000);

  synth.speak(u);
}

$("shortBtn").addEventListener("click", () => runSpeechTest("short"));
$("longBtn").addEventListener("click", () => runSpeechTest("long"));
$("stopBtn").addEventListener("click", () => {
  if (!hasTTS) return;
  abortCurrentTest("зупинено користувачем");
  window.speechSynthesis.cancel();
  $("ttsMsg").textContent = "Озвучення зупинено.";
});

// ---------- 2. Розпізнавання мови ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
let listening = false;

const STT_ERRORS = {
  "not-allowed": "Доступ до мікрофона заборонено. Дозвольте його в налаштуваннях браузера.",
  "service-not-allowed": "Розпізнавання мови заборонено системою (на iPhone перевірте, чи ввімкнена диктовка, перевірити).",
  "no-speech": "Мовлення не почуто. Спробуйте ще раз.",
  "audio-capture": "Мікрофон не знайдено або він зайнятий.",
  "network": "Помилка мережі: розпізнавання, ймовірно, потребує інтернету (перевірити).",
  "language-not-supported": "Українська мова не підтримується розпізнаванням.",
  "aborted": "Розпізнавання перервано."
};

$("listenBtn").addEventListener("click", () => {
  const msgEl = $("sttMsg");
  if (!SR) {
    notify(msgEl, "Розпізнавання мови не підтримується в цьому браузері. Користуйтесь кнопками.");
    setResult("sttTest", S_NO, "API відсутнє");
    return;
  }
  if (listening && rec) {
    rec.stop();
    return;
  }
  let result = null, errCode = null, stoppedByUser = false;
  try {
    rec = new SR();
    rec.lang = config.language;
    rec.interimResults = false;
    rec.continuous = false;
    rec.maxAlternatives = 1;
  } catch (e) {
    notify(msgEl, "Не вдалося запустити розпізнавання: " + e.name);
    setResult("sttTest", S_NO, "помилка створення: " + e.name);
    return;
  }
  rec.onstart = () => {
    listening = true;
    $("listenBtn").textContent = "Зупинити";
    msgEl.textContent = "Слухаю… говоріть.";
    $("sttOut").textContent = "";
  };
  rec.onresult = (e) => {
    const r = e.results[0][0];
    result = { text: r.transcript, conf: r.confidence };
  };
  rec.onerror = (e) => { errCode = e.error || "unknown"; };
  rec.onend = () => {
    listening = false;
    $("listenBtn").textContent = "Слухати";
    if (result) {
      const c = typeof result.conf === "number" ? result.conf.toFixed(2) : "не повідомлено";
      msgEl.textContent = "Готово.";
      $("sttOut").textContent = "Розпізнано: «" + result.text + "». Впевненість: " + c +
        " (якщо 0, браузер, можливо, її не повідомляє, перевірити).";
      setResult("sttTest", S_YES, "текст: «" + result.text + "»; впевненість: " + c);
    } else if (errCode) {
      const human = STT_ERRORS[errCode] || ("Помилка розпізнавання: " + errCode);
      notify(msgEl, human);
      const soft = errCode === "no-speech" || errCode === "aborted";
      setResult("sttTest", soft ? S_TODO : S_NO, "помилка: " + errCode);
    } else if (stoppedByUser) {
      msgEl.textContent = "Зупинено до отримання результату.";
      setResult("sttTest", S_TODO, "зупинено користувачем без результату");
    } else {
      notify(msgEl, "Не вдалося почути, спробуйте ще раз.");
      setResult("sttTest", S_NO, "завершилось без результату і без повідомлення про помилку");
    }
  };
  const origStop = rec.stop.bind(rec);
  rec.stop = () => { stoppedByUser = true; origStop(); };
  try {
    rec.start();
  } catch (e) {
    notify(msgEl, "Не вдалося запустити розпізнавання: " + e.name);
    setResult("sttTest", S_NO, "помилка start(): " + e.name);
  }
});

// ---------- 3. Камера і мікрофон ----------
function mediaErrorText(err, kind) {
  const gen = kind === "cam" ? "камери" : "мікрофона";
  const notFound = kind === "cam" ? "Камеру не знайдено." : "Мікрофон не знайдено.";
  const busy = kind === "cam" ? "Камеру зайнято іншою програмою." : "Мікрофон зайнято іншою програмою.";
  const name = err && err.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Доступ до " + gen + " заборонено. Дозвольте його в налаштуваннях браузера й спробуйте ще раз.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return notFound;
  if (name === "NotReadableError" || name === "TrackStartError") return busy;
  return "Не вдалося увімкнути " + gen + ": " + (name || "невідома помилка") + ".";
}

let previewTimer = null;
function stopPreview() {
  clearTimeout(previewTimer);
  const v = $("preview");
  if (v.srcObject) v.srcObject.getTracks().forEach((t) => t.stop());
  v.srcObject = null;
  v.hidden = true;
}

$("camBtn").addEventListener("click", async () => {
  const msgEl = $("camMsg");
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    notify(msgEl, "Камера недоступна в цьому браузері (потрібен https).");
    setResult("cam", S_NO, "mediaDevices недоступний");
    return;
  }
  stopPreview();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    const track = stream.getVideoTracks()[0];
    const s = track && track.getSettings ? track.getSettings() : {};
    const v = $("preview");
    v.srcObject = stream;
    v.hidden = false;
    try { await v.play(); } catch (e) { /* автозапуск може бути заблокований, потік усе одно отримано */ }
    msgEl.textContent = "Камера працює. Показ триватиме 5 секунд.";
    setResult("cam", S_YES, "потік отримано; " + (s.width || "?") + "×" + (s.height || "?") +
      "; facingMode: " + (s.facingMode || "не повідомлено") + "; " + (track && track.label ? track.label : "назва не повідомлена"));
    queryPerms();
    previewTimer = setTimeout(() => { stopPreview(); msgEl.textContent = "Показ камери завершено."; }, 5000);
  } catch (err) {
    notify(msgEl, mediaErrorText(err, "cam"));
    setResult("cam", S_NO, "помилка: " + (err && err.name));
  }
});

let micBusy = false;
$("micBtn").addEventListener("click", async () => {
  const msgEl = $("micMsg");
  if (micBusy) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    notify(msgEl, "Мікрофон недоступний в цьому браузері (потрібен https).");
    setResult("mic", S_NO, "mediaDevices недоступний");
    return;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (err) {
    notify(msgEl, mediaErrorText(err, "mic"));
    setResult("mic", S_NO, "помилка: " + (err && err.name));
    return;
  }
  micBusy = true;
  queryPerms();
  const stopAll = () => stream.getTracks().forEach((t) => t.stop());
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) {
    stopAll();
    micBusy = false;
    msgEl.textContent = "Мікрофон дозволено. Рівень сигналу не виміряно: AudioContext відсутній.";
    setResult("mic", S_YES, "дозвіл надано; AudioContext відсутній, рівень не виміряно");
    return;
  }
  try {
    const ctx = new AC();
    if (ctx.state === "suspended") { try { await ctx.resume(); } catch (e) { /* ігноруємо */ } }
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    src.connect(an);
    const data = new Uint8Array(an.fftSize);
    const meter = $("meter");
    meter.hidden = false;
    msgEl.textContent = "Говоріть 4 секунди…";
    let max = 0;
    const started = performance.now();
    const timer = setInterval(() => {
      an.getByteTimeDomainData(data);
      let peak = 0;
      for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] - 128));
      const lvl = Math.round((peak / 128) * 100);
      max = Math.max(max, lvl);
      meter.value = lvl;
      if (performance.now() - started >= 4000) {
        clearInterval(timer);
        stopAll();
        try { ctx.close(); } catch (e) { /* ігноруємо */ }
        meter.hidden = true;
        micBusy = false;
        const quiet = max < 3;
        msgEl.textContent = "Максимальний рівень сигналу: " + max + "%." +
          (quiet ? " Майже тиша: мікрофон може не чути, спробуйте говорити голосніше." : "");
        setResult("mic", S_YES, "дозвіл надано; максимальний рівень " + max + "%" +
          (quiet ? " (майже тиша, перевірити)" : ""));
      }
    }, 100);
  } catch (e) {
    stopAll();
    micBusy = false;
    notify(msgEl, "Не вдалося виміряти рівень: " + e.name);
    setResult("mic", S_YES, "дозвіл надано; вимірювання рівня не вдалося: " + e.name);
  }
});

// ---------- 4. Вібрація, Wake Lock ----------
$("vibBtn").addEventListener("click", () => {
  const msgEl = $("miscMsg");
  if (typeof navigator.vibrate !== "function") {
    notify(msgEl, "Вібрація не підтримується в цьому браузері.");
    setResult("vibTest", S_NO, "navigator.vibrate відсутній");
    return;
  }
  const r = navigator.vibrate([300, 150, 300]);
  msgEl.textContent = "Команду вібрації надіслано (navigator.vibrate повернув " + r + ").";
  ask("vibConfirm", "Ви відчули вібрацію?", (ok) =>
    setResult("vibTest", ok ? S_YES : S_NO, "navigator.vibrate повернув " + r + "; користувач: " + (ok ? "відчув" : "не відчув")));
});

let wakeSentinel = null;
$("wakeBtn").addEventListener("click", async () => {
  const msgEl = $("miscMsg");
  if (!("wakeLock" in navigator)) {
    notify(msgEl, "Screen Wake Lock не підтримується в цьому браузері.");
    setResult("wakeTest", S_NO, "navigator.wakeLock відсутній");
    return;
  }
  if (wakeSentinel) {
    try { await wakeSentinel.release(); } catch (e) { /* ігноруємо */ }
    return;
  }
  try {
    wakeSentinel = await navigator.wakeLock.request("screen");
    wakeSentinel.addEventListener("release", () => {
      wakeSentinel = null;
      $("wakeBtn").textContent = "Перевірити Wake Lock";
      msgEl.textContent = "Wake Lock знято (вами або системою).";
    });
    $("wakeBtn").textContent = "Зняти Wake Lock";
    msgEl.textContent = "Запит прийнято. Щоб переконатися, що екран не гасне, не торкайтесь його довше за час автоблокування.";
    setResult("wakeTest", S_YES, "запит screen прийнято; фактичну роботу перевірте очікуванням (перевірити на iPhone і Android)");
  } catch (err) {
    notify(msgEl, "Не вдалося не гасити екран: " + (err && err.name) + ".");
    setResult("wakeTest", S_NO, "помилка: " + (err && err.name) + (err && err.message ? " (" + err.message + ")" : ""));
  }
});

// ---------- 5. Копіювання звіту ----------
$("copyBtn").addEventListener("click", async () => {
  const text = reportText();
  const msgEl = $("copyMsg");
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch (e) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "0";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      ok = document.execCommand("copy");
      document.body.removeChild(ta);
    } catch (e2) { ok = false; }
  }
  if (ok) {
    notify(msgEl, "Звіт скопійовано.");
  } else {
    $("reportDetails").open = true;
    notify(msgEl, "Не вдалося скопіювати. Виділіть текст звіту нижче й скопіюйте вручну.");
  }
});

// ---------- Старт ----------
renderReport();
autoChecks();
initTTS();
