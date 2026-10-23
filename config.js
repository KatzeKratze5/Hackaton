"use strict";
// config.js: завантаження, перевірка й збереження налаштувань.
// Підключається на всіх сторінках перед їхнім власним скриптом. Дає глобальний об'єкт AppConfig.
(function () {
  const KEY_USER = "pomichnyk.config.user";      // налаштування, збережені на цьому пристрої (з форми або імпорту)
  const KEY_GOOD = "pomichnyk.config.lastGood";  // остання робоча копія (резерв)
  const VERSION = 1;

  const THEMES = ["auto", "light", "dark"];
  const SCAN_MODES = ["auto", "step"];
  // Блоки, які знає застосунок. Нові заготовки додають сюди свої id.
  const BLOCKS = [
    { id: "phrases", title: "Фрази (озвучувач)" },
    { id: "schedule", title: "Розклад" },
    { id: "contacts", title: "Контакти" },
    { id: "places", title: "Місця" },
    { id: "scan", title: "Режим сканування" }
  ];
  const LIMITS = { phrases: 50, schedule: 50, contacts: 20, places: 50 };

  const ID_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  const PHONE_RE = /^\+?\d{7,15}$/;
  const TOPIC_RE = /^[A-Za-z0-9_-]{1,64}$/;
  const LANG_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

  // Вбудовані налаштування: використовуються, лише якщо немає жодної робочої версії
  function defaults() {
    return {
      version: VERSION,
      language: "uk-UA",
      profile: { name: "", speechRate: 1, speechPitch: 1, fontSize: 24, theme: "auto", confirmCriticalActions: true },
      phrases: [],
      schedule: [],
      contacts: [],
      places: [],
      blocks: BLOCKS.map((b) => ({ id: b.id, enabled: b.id === "phrases" })),
      remote: { enabled: false, url: "", topic: "" },
      scanning: { speedMs: 1500, mode: "auto" },
      system: {
        checkPhrase: "Застосунок працює",
        diagShortPhrase: "Добрий день. Це перевірка голосу.",
        diagLongPhrase: "Це довга фраза для перевірки озвучення. ".repeat(11)
      }
    };
  }

  function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  function isNum(v, min, max, int) {
    return typeof v === "number" && isFinite(v) && v >= min && v <= max && (!int || Number.isInteger(v));
  }

  // ---------- Перевірка ----------
  // Повертає { ok, errors, warnings, value }. value: очищена копія з доданими значеннями за замовчуванням.
  function validate(raw) {
    const errors = [];
    const warnings = [];
    if (!isObj(raw)) {
      return { ok: false, errors: ["Файл має бути об'єктом JSON: починатися з { і закінчуватися }."], warnings, value: null };
    }
    const out = defaults();
    const err = (m) => errors.push(m);

    const KNOWN = ["version", "language", "profile", "phrases", "schedule", "contacts", "places", "blocks", "remote", "scanning", "system"];
    Object.keys(raw).forEach((k) => {
      if (KNOWN.indexOf(k) < 0) warnings.push("Невідомий розділ «" + k + "» проігноровано.");
    });

    // Допоміжні перевірки
    function str(v, where, label, min, max) {
      if (typeof v !== "string" || v.trim().length < min || v.trim().length > max) {
        err(where + ": поле «" + label + "» має бути " + (min > 0 ? "непорожнім " : "") + "текстом до " + max + " символів.");
        return typeof v === "string" ? v.trim().slice(0, max) : "";
      }
      return v.trim();
    }
    function idOf(v, where) {
      if (typeof v !== "string" || !ID_RE.test(v)) {
        err(where + ": поле «id» має містити малі латинські літери, цифри, «-» або «_» (до 32 символів), наприклад «water».");
        return typeof v === "string" ? v : "";
      }
      return v;
    }
    function sec(key, title) {
      const v = raw[key];
      if (v === undefined) return {};
      if (!isObj(v)) { err(title + ": очікується група полів { }."); return {}; }
      return v;
    }
    function fld(src, dst, key, test, msg, norm) {
      const v = src[key];
      if (v === undefined) return; // лишається значення за замовчуванням
      if (!test(v)) { err(msg); return; }
      dst[key] = norm ? norm(v) : v;
    }
    function arr(key, title, max, fn) {
      const v = raw[key];
      if (v === undefined) return [];
      if (!Array.isArray(v)) { err(title + ": очікується список [ ]."); return []; }
      if (v.length > max) err(title + ": забагато пунктів (" + v.length + "), максимум " + max + ".");
      return v.slice(0, max).map((it, i) => {
        const where = title + ", пункт " + (i + 1);
        if (!isObj(it)) { err(where + ": очікується група полів { }."); return null; }
        return fn(it, where);
      }).filter(Boolean);
    }
    function uniq(list, title) {
      const seen = {};
      list.forEach((x) => {
        if (seen[x.id]) err(title + ": код «" + x.id + "» повторюється, коди мають бути різними.");
        seen[x.id] = true;
      });
    }
    const isBool = (v) => typeof v === "boolean";

    // Службові поля
    if (raw.version !== undefined) {
      if (!isNum(raw.version, 1, 1000000, true)) err("Поле version має бути цілим числом.");
      else if (raw.version > VERSION) err("Файл створено новішою версією застосунку (version " + raw.version + "), ця версія підтримує " + VERSION + ".");
    }
    fld(raw, out, "language", (v) => typeof v === "string" && LANG_RE.test(v), "Мова (language) має бути у форматі uk-UA.");

    // Профіль
    const P = sec("profile", "Профіль");
    fld(P, out.profile, "name", (v) => typeof v === "string" && v.trim().length <= 40, "Профіль: ім'я має бути текстом до 40 символів.", (v) => v.trim());
    fld(P, out.profile, "speechRate", (v) => isNum(v, 0.5, 2), "Профіль: швидкість мовлення має бути числом від 0.5 до 2.");
    fld(P, out.profile, "speechPitch", (v) => isNum(v, 0, 2), "Профіль: висота голосу має бути числом від 0 до 2.");
    fld(P, out.profile, "fontSize", (v) => isNum(v, 20, 40, true), "Профіль: розмір шрифту має бути цілим числом від 20 до 40.");
    fld(P, out.profile, "theme", (v) => THEMES.indexOf(v) >= 0, "Профіль: тема має бути «auto», «light» або «dark».");
    fld(P, out.profile, "confirmCriticalActions", isBool, "Профіль: «підтверджувати критичні дії» має бути true або false.");

    // Фрази
    out.phrases = arr("phrases", "Фрази", LIMITS.phrases, (it, w) => ({
      id: idOf(it.id, w),
      label: str(it.label, w, "label", 1, 40),
      text: str(it.text, w, "text", 1, 300)
    }));
    uniq(out.phrases, "Фрази");

    // Розклад
    out.schedule = arr("schedule", "Розклад", LIMITS.schedule, (it, w) => {
      let time = it.time;
      if (typeof time !== "string" || !TIME_RE.test(time)) {
        err(w + ": час має бути у форматі ГГ:ХХ, наприклад 08:30.");
        time = typeof time === "string" ? time : "";
      }
      const title = str(it.title, w, "title", 1, 80);
      let days = it.repeatDays;
      if (!Array.isArray(days) || days.length === 0 || !days.every((d) => isNum(d, 1, 7, true))) {
        err(w + ": оберіть дні повторення (числа від 1 = понеділок до 7 = неділя, хоча б один).");
        days = [];
      } else {
        days = Array.from(new Set(days)).sort((a, b) => a - b);
      }
      return { time, title, repeatDays: days };
    });

    // Контакти
    out.contacts = arr("contacts", "Контакти", LIMITS.contacts, (it, w) => {
      const label = str(it.label, w, "label", 1, 40);
      let phone = typeof it.phone === "string" ? it.phone.replace(/[\s()\-]/g, "") : it.phone;
      if (typeof phone !== "string" || !PHONE_RE.test(phone)) {
        err(w + ": номер телефону має складатися з 7–15 цифр, можна з «+» на початку (пробіли, дужки й дефіси допустимі).");
        phone = typeof it.phone === "string" ? it.phone : "";
      }
      return { label, phone };
    });

    // Місця
    out.places = arr("places", "Місця", LIMITS.places, (it, w) => ({
      id: idOf(it.id, w),
      name: str(it.name, w, "name", 1, 60),
      description: it.description === undefined ? "" : str(it.description, w, "description", 0, 500),
      nextSteps: it.nextSteps === undefined ? "" : str(it.nextSteps, w, "nextSteps", 0, 500)
    }));
    uniq(out.places, "Місця");

    // Блоки (порядок у списку = порядок на екрані)
    if (raw.blocks !== undefined) {
      if (!Array.isArray(raw.blocks)) {
        err("Блоки: очікується список [ ].");
      } else {
        const seen = {};
        out.blocks = raw.blocks.map((b, i) => {
          const w = "Блоки, пункт " + (i + 1);
          if (!isObj(b)) { err(w + ": очікується група полів { }."); return null; }
          if (!BLOCKS.some((x) => x.id === b.id)) {
            err(w + ": невідомий блок «" + b.id + "». Допустимі: " + BLOCKS.map((x) => x.id).join(", ") + ".");
            return null;
          }
          if (seen[b.id]) err(w + ": блок «" + b.id + "» повторюється.");
          seen[b.id] = true;
          if (!isBool(b.enabled)) err(w + ": «enabled» має бути true або false.");
          return { id: b.id, enabled: b.enabled === true };
        }).filter(Boolean);
      }
    }

    // Віддалене керування
    const R = sec("remote", "Віддалене керування");
    fld(R, out.remote, "enabled", isBool, "Віддалене керування: «enabled» має бути true або false.");
    fld(R, out.remote, "url", (v) => typeof v === "string" && v.trim().length <= 300, "Віддалене керування: адреса має бути текстом до 300 символів.", (v) => v.trim());
    fld(R, out.remote, "topic", (v) => typeof v === "string" && (v.trim() === "" || TOPIC_RE.test(v.trim())),
      "Віддалене керування: тема (topic) може містити лише латинські літери, цифри, «-» і «_» (до 64 символів).", (v) => v.trim());
    if (out.remote.enabled) {
      if (!/^https:\/\/[^\s]+$/.test(out.remote.url)) err("Віддалене керування: увімкнено, тож адреса має починатися з https://.");
      if (!out.remote.topic) err("Віддалене керування: увімкнено, тож вкажіть тему (topic).");
    }

    // Сканування
    const S = sec("scanning", "Сканування");
    fld(S, out.scanning, "speedMs", (v) => isNum(v, 300, 10000, true), "Сканування: швидкість має бути цілим числом мілісекунд від 300 до 10000.");
    fld(S, out.scanning, "mode", (v) => SCAN_MODES.indexOf(v) >= 0, "Сканування: режим має бути «auto» або «step».");

    // Службові тексти (не редагуються у формі)
    const Y = sec("system", "Службові тексти");
    fld(Y, out.system, "checkPhrase", (v) => typeof v === "string" && v.trim().length >= 1 && v.trim().length <= 200, "Службові тексти: checkPhrase має бути текстом до 200 символів.", (v) => v.trim());
    fld(Y, out.system, "diagShortPhrase", (v) => typeof v === "string" && v.trim().length >= 1 && v.trim().length <= 200, "Службові тексти: diagShortPhrase має бути текстом до 200 символів.", (v) => v.trim());
    fld(Y, out.system, "diagLongPhrase", (v) => typeof v === "string" && v.trim().length >= 1 && v.trim().length <= 1000, "Службові тексти: diagLongPhrase має бути текстом до 1000 символів.", (v) => v.trim());

    out.version = VERSION;
    return { ok: errors.length === 0, errors, warnings, value: errors.length === 0 ? out : null };
  }

  // ---------- Сховище ----------
  function readStore(key) {
    try {
      const t = localStorage.getItem(key);
      return t ? JSON.parse(t) : null;
    } catch (e) { return null; }
  }
  function writeStore(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); return true; } catch (e) { return false; }
  }

  // ---------- Завантаження ----------
  // Порядок: 1) збережене на пристрої, 2) файл config.json, 3) остання робоча копія, 4) вбудоване.
  // Повертає { config, source: "user"|"file"|"backup"|"default", warnings }.
  async function load() {
    const warnings = [];
    let cfg = null;
    let source = "default";

    const u = readStore(KEY_USER);
    if (u !== null) {
      const r = validate(u);
      if (r.ok) { cfg = r.value; source = "user"; }
      else warnings.push("Налаштування, збережені на цьому пристрої, пошкоджені й пропущені.");
    }

    if (!cfg) {
      try {
        const resp = await fetch("config.json", { cache: "no-store" });
        if (!resp.ok) throw new Error("відповідь " + resp.status);
        let data;
        try { data = await resp.json(); } catch (e) { throw new Error("файл не є правильним JSON"); }
        const r = validate(data);
        if (r.ok) {
          cfg = r.value; source = "file";
          r.warnings.forEach((w) => warnings.push(w));
        } else {
          warnings.push("У файлі config.json є помилки, його не використано: " + r.errors.slice(0, 3).join(" ") + (r.errors.length > 3 ? " …" : ""));
        }
      } catch (e) {
        warnings.push("Не вдалося завантажити config.json (" + e.message + ").");
      }
    }

    if (!cfg) {
      const g = readStore(KEY_GOOD);
      if (g !== null) {
        const r = validate(g);
        if (r.ok) { cfg = r.value; source = "backup"; warnings.push("Використано останню робочу копію налаштувань."); }
      }
    }

    if (!cfg) {
      cfg = defaults();
      source = "default";
      warnings.push("Використано вбудовані налаштування за замовчуванням.");
    } else {
      writeStore(KEY_GOOD, cfg);
    }
    return { config: cfg, source, warnings };
  }

  // Зберегти налаштування з форми. Перед збереженням завжди перевіряє.
  function save(raw) {
    const r = validate(raw);
    if (!r.ok) return r;
    if (!writeStore(KEY_USER, r.value)) {
      return { ok: false, errors: ["Не вдалося зберегти на цьому пристрої: сховище браузера недоступне або переповнене."], warnings: r.warnings, value: null };
    }
    writeStore(KEY_GOOD, r.value);
    return r;
  }

  function clearUser() {
    try { localStorage.removeItem(KEY_USER); return true; } catch (e) { return false; }
  }

  function exportText(cfg) { return JSON.stringify(cfg, null, 2); }

  // Розмір шрифту й тема з профілю
  function applyProfile(cfg) {
    const root = document.documentElement;
    root.style.fontSize = cfg.profile.fontSize + "px";
    if (cfg.profile.theme === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", cfg.profile.theme);
  }

  // Озвучення. Викликайте лише після дотику користувача. Повертає false, якщо озвучення немає.
  function speak(text, opts, onError) {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return false;
    try {
      const o = opts || {};
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = o.language || "uk-UA";
      u.rate = isFinite(o.rate) ? o.rate : 1;
      u.pitch = isFinite(o.pitch) ? o.pitch : 1;
      const v = (synth.getVoices() || []).find((x) => (x.lang || "").toLowerCase().replace("_", "-").indexOf("uk") === 0);
      if (v) u.voice = v; // TODO: перевірити на iPhone і Android
      u.onerror = () => { if (onError) onError(); };
      synth.speak(u);
      return true;
    } catch (e) { return false; }
  }

  window.AppConfig = { load, validate, save, clearUser, exportText, applyProfile, speak, BLOCKS, LIMITS, DEFAULTS: defaults };
})();
