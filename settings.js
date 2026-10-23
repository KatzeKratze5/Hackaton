"use strict";
// settings.js: форма налаштувань. Усі поля змінюються тут, збереження лише після перевірки.

const $ = (id) => document.getElementById(id);
const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
const THEME_LABELS = { auto: "Як у телефоні", light: "Світла", dark: "Темна" };
const MODE_LABELS = { auto: "Автоматично (одна кнопка)", step: "Покроково (дві кнопки: «Далі» і «Обрати»)" };
const SOURCE_LABELS = {
  user: "ваші налаштування, збережені на цьому пристрої",
  file: "файл config.json",
  backup: "резервна копія (файл config.json не вдалося використати)",
  default: "вбудовані налаштування"
};

let uid = 0;
let active = AppConfig.DEFAULTS(); // налаштування, що зараз діють
let meta = { version: 1, language: "uk-UA", system: active.system }; // поля, яких немає у формі

// ---------- Побудова елементів ----------
function el(tag, attrs, kids) {
  const e = document.createElement(tag);
  Object.keys(attrs || {}).forEach((k) => {
    const v = attrs[k];
    if (v === null || v === undefined || v === false) return;
    if (k === "text") e.textContent = v;
    else if (k === "class") e.className = v;
    else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  });
  (kids || []).forEach((c) => { if (c) e.append(c); });
  return e;
}
const num = (v, fallback) => (typeof v === "number" && isFinite(v) ? v : fallback);

function labeled(labelContent, input, hint) {
  const id = "f" + (++uid);
  input.id = id;
  const label = el("label", { for: id });
  label.append(labelContent);
  const wrap = el("div", { class: "field" }, [label, input]);
  if (hint) wrap.append(el("div", { class: "hint", text: hint }));
  return wrap;
}
function textInput(k, v, extra) {
  return el("input", Object.assign({ type: "text", "data-k": k, "data-type": "text", value: v === undefined || v === null ? "" : v, autocomplete: "off" }, extra || {}));
}
function areaInput(k, v, max) {
  const t = el("textarea", { "data-k": k, "data-type": "text", maxlength: max });
  t.value = v || "";
  return t;
}
function rangeInput(k, v, min, max, step, fmt, text, hint) {
  const input = el("input", { type: "range", min, max, step, "data-k": k, "data-type": "number" });
  input.value = String(num(v, min));
  const out = el("output", { text: fmt(input.value) });
  input.addEventListener("input", () => { out.textContent = fmt(input.value); });
  const lab = document.createDocumentFragment();
  lab.append(text + ": ", out);
  return labeled(lab, input, hint);
}
function selectInput(k, v, options) {
  const s = el("select", { "data-k": k, "data-type": "text" });
  options.forEach(([val, label]) => {
    const o = el("option", { value: val, text: label });
    if (val === v) o.selected = true;
    s.append(o);
  });
  return s;
}
function checkField(k, v, text, hint) {
  const id = "f" + (++uid);
  const input = el("input", { type: "checkbox", id, "data-k": k, "data-type": "bool", checked: v === true });
  const wrap = el("div", { class: "field" }, [el("div", { class: "check" }, [input, el("label", { for: id, text })])]);
  if (hint) wrap.append(el("div", { class: "hint", text: hint }));
  return wrap;
}

// ---------- Читання значень з форми ----------
function readValue(node) {
  switch (node.dataset.type) {
    case "number": return node.value === "" ? NaN : Number(node.value);
    case "bool": return node.checked;
    case "days": return Array.from(node.querySelectorAll("input")).filter((i) => i.checked).map((i) => Number(i.value));
    default: return node.value;
  }
}
function readGroup(container) {
  const o = {};
  container.querySelectorAll("[data-k]").forEach((n) => { o[n.dataset.k] = readValue(n); });
  return o;
}
function readList(box) {
  return Array.from(box.children).filter((c) => c.classList.contains("item")).map((it) => readGroup(it));
}
function readForm() {
  return {
    version: meta.version,
    language: meta.language,
    profile: readGroup($("profileBox")),
    phrases: readList($("phrasesList")),
    schedule: readList($("scheduleList")),
    contacts: readList($("contactsList")),
    places: readList($("placesList")),
    blocks: Array.from($("blocksList").children).filter((c) => c.classList.contains("item")).map((it) => ({
      id: it.dataset.block,
      enabled: it.querySelector("[data-k=enabled]").checked
    })),
    remote: readGroup($("remoteBox")),
    scanning: readGroup($("scanBox")),
    system: meta.system
  };
}

// ---------- Показ розділів ----------
function renderProfile(p) {
  const box = $("profileBox");
  box.textContent = "";
  box.append(
    labeled("Ім'я", textInput("name", p.name, { maxlength: 40 })),
    rangeInput("speechRate", p.speechRate, 0.5, 2, 0.1, (v) => Number(v).toFixed(1), "Швидкість мовлення"),
    rangeInput("speechPitch", p.speechPitch, 0, 2, 0.1, (v) => Number(v).toFixed(1), "Висота голосу", "На iPhone висота голосу може не враховуватись (перевірити)."),
    rangeInput("fontSize", p.fontSize, 20, 40, 1, (v) => v + " px", "Розмір шрифту", "Застосується після збереження."),
    labeled("Тема", selectInput("theme", p.theme, Object.keys(THEME_LABELS).map((k) => [k, THEME_LABELS[k]]))),
    checkField("confirmCriticalActions", p.confirmCriticalActions, "Підтверджувати критичні дії двома натисканнями", "Рекомендовано залишити ввімкненим: це захищає від випадкових дзвінків і повідомлень.")
  );
}

function itemShell(title, listKey, index, fields, extraHead) {
  const head = el("div", { class: "item-head" }, [el("strong", { text: title })]);
  (extraHead || []).forEach((b) => head.append(b));
  if (listKey) {
    head.append(el("button", {
      type: "button", class: "btn small", text: "Видалити", "aria-label": "Видалити: " + title, "data-act": "remove",
      onclick: () => removeItem(listKey, index)
    }));
  }
  return el("div", { class: "item" }, [head].concat(fields));
}

const builders = {
  phrases: (it, i) => itemShell("Фраза " + (i + 1), "phrases", i, [
    labeled("Назва на кнопці", textInput("label", it.label, { maxlength: 40 })),
    labeled("Текст, який озвучується", areaInput("text", it.text, 300)),
    labeled("Код (латиницею, без пробілів)", textInput("id", it.id, { maxlength: 32, autocapitalize: "off", spellcheck: "false" }))
  ]),
  schedule: (it, i) => {
    const days = el("div", { class: "days", "data-k": "repeatDays", "data-type": "days", role: "group", "aria-label": "Дні повторення" });
    DAYS.forEach((d, n) => {
      const id = "f" + (++uid);
      const cb = el("input", { type: "checkbox", id, value: String(n + 1), checked: Array.isArray(it.repeatDays) && it.repeatDays.indexOf(n + 1) >= 0 });
      days.append(el("label", { for: id }, [cb, d]));
    });
    return itemShell("Пункт розкладу " + (i + 1), "schedule", i, [
      labeled("Час", el("input", { type: "time", "data-k": "time", "data-type": "text", value: it.time || "" })),
      labeled("Що нагадати", textInput("title", it.title, { maxlength: 80 })),
      el("div", { class: "field" }, [el("strong", { text: "Дні" }), days])
    ]);
  },
  contacts: (it, i) => itemShell("Контакт " + (i + 1), "contacts", i, [
    labeled("Ім'я або підпис", textInput("label", it.label, { maxlength: 40 })),
    labeled("Телефон", textInput("phone", it.phone, { type: "tel", inputmode: "tel", maxlength: 24 }), "Наприклад +380501234567")
  ]),
  places: (it, i) => itemShell("Місце " + (i + 1), "places", i, [
    labeled("Назва", textInput("name", it.name, { maxlength: 60 })),
    labeled("Опис (що це за місце)", areaInput("description", it.description, 500)),
    labeled("Що робити далі", areaInput("nextSteps", it.nextSteps, 500)),
    labeled("Код для QR-мітки (латиницею, без пробілів)", textInput("id", it.id, { maxlength: 32, autocapitalize: "off", spellcheck: "false" }))
  ])
};
const LIST_IDS = { phrases: "phrasesList", schedule: "scheduleList", contacts: "contactsList", places: "placesList" };

function renderList(key, items) {
  const box = $(LIST_IDS[key]);
  box.textContent = "";
  items.forEach((it, i) => box.append(builders[key](it, i)));
  if (!items.length) box.append(el("p", { text: "Поки порожньо." }));
}

function renderBlocks(blocks) {
  const box = $("blocksList");
  box.textContent = "";
  const titles = {};
  AppConfig.BLOCKS.forEach((b) => { titles[b.id] = b.title; });
  blocks.forEach((b, i) => {
    const id = "f" + (++uid);
    const cb = el("input", { type: "checkbox", id, "data-k": "enabled", "data-type": "bool", checked: b.enabled === true });
    const item = el("div", { class: "item", "data-block": b.id }, [
      el("div", { class: "check" }, [cb, el("label", { for: id, text: titles[b.id] || b.id })]),
      el("div", { class: "row" }, [
        el("button", { type: "button", class: "btn small", text: "Вище", "aria-label": "Перемістити вище: " + (titles[b.id] || b.id), "data-act": "up", onclick: () => moveBlock(i, -1) }),
        el("button", { type: "button", class: "btn small", text: "Нижче", "aria-label": "Перемістити нижче: " + (titles[b.id] || b.id), "data-act": "down", onclick: () => moveBlock(i, 1) })
      ])
    ]);
    box.append(item);
  });
}

function renderRemote(r) {
  const box = $("remoteBox");
  box.textContent = "";
  box.append(
    checkField("enabled", r.enabled, "Увімкнути віддалене керування", "Потрібне лише для фізичної кнопки (доказ ідеї). Не вписуйте паролі й ключі: файл налаштувань може потрапити в репозиторій."),
    labeled("Адреса (https://…)", textInput("url", r.url, { type: "text", inputmode: "url", maxlength: 300, autocapitalize: "off", spellcheck: "false" })),
    labeled("Тема (topic)", textInput("topic", r.topic, { maxlength: 64, autocapitalize: "off", spellcheck: "false" }), "Лише латиниця, цифри, «-» і «_».")
  );
}

function renderScan(s) {
  const box = $("scanBox");
  box.textContent = "";
  box.append(
    labeled("Швидкість, мс (скільки пункт підсвічений)", el("input", { type: "number", inputmode: "numeric", min: 300, max: 10000, step: 100, "data-k": "speedMs", "data-type": "number", value: num(s.speedMs, "") }), "Від 300 до 10000. У покроковому режимі не використовується."),
    labeled("Режим", selectInput("mode", s.mode, Object.keys(MODE_LABELS).map((k) => [k, MODE_LABELS[k]])))
  );
}

function renderAll(cfg) {
  const c = JSON.parse(JSON.stringify(cfg));
  const have = {};
  c.blocks.forEach((b) => { have[b.id] = true; });
  AppConfig.BLOCKS.forEach((b) => { if (!have[b.id]) c.blocks.push({ id: b.id, enabled: false }); });
  renderProfile(c.profile);
  Object.keys(LIST_IDS).forEach((k) => renderList(k, c[k]));
  renderBlocks(c.blocks);
  renderRemote(c.remote);
  renderScan(c.scanning);
}

// ---------- Додати, видалити, перемістити ----------
function nextId(prefix, items) {
  const used = {};
  items.forEach((x) => { used[x.id] = true; });
  let n = 1;
  while (used[prefix + "-" + n]) n++;
  return prefix + "-" + n;
}
const NEW_ITEMS = {
  phrases: (list) => ({ id: nextId("phrase", list), label: "", text: "" }),
  schedule: () => ({ time: "08:00", title: "", repeatDays: [1, 2, 3, 4, 5, 6, 7] }),
  contacts: () => ({ label: "", phone: "" }),
  places: (list) => ({ id: nextId("place", list), name: "", description: "", nextSteps: "" })
};
const MAX_ITEMS = { phrases: AppConfig.LIMITS.phrases, schedule: AppConfig.LIMITS.schedule, contacts: AppConfig.LIMITS.contacts, places: AppConfig.LIMITS.places };

function addItem(key) {
  const list = readList($(LIST_IDS[key]));
  if (list.length >= MAX_ITEMS[key]) { setMsg("Досягнуто максимум пунктів: " + MAX_ITEMS[key] + "."); return; }
  list.push(NEW_ITEMS[key](list));
  renderList(key, list);
  const last = $(LIST_IDS[key]).lastElementChild;
  const first = last && last.querySelector("input, textarea, select");
  if (first) first.focus();
}
function removeItem(key, index) {
  const list = readList($(LIST_IDS[key]));
  list.splice(index, 1);
  renderList(key, list);
  const add = document.querySelector('[data-add="' + key + '"]');
  if (add) add.focus();
}
function moveBlock(index, delta) {
  const blocks = readForm().blocks;
  const to = index + delta;
  if (to < 0 || to >= blocks.length) return;
  const tmp = blocks[index]; blocks[index] = blocks[to]; blocks[to] = tmp;
  renderBlocks(blocks);
  const btn = $("blocksList").children[to].querySelector('[data-act="' + (delta < 0 ? "up" : "down") + '"]');
  if (btn) btn.focus();
}
document.querySelectorAll("[data-add]").forEach((b) => b.addEventListener("click", () => addItem(b.dataset.add)));

// ---------- Повідомлення ----------
function setMsg(text) { $("msg").textContent = text; }
function showErrors(list, title) {
  const box = $("errors");
  box.textContent = "";
  if (!list || !list.length) { box.hidden = true; return; }
  box.append(el("strong", { text: title || "Знайдено помилки:" }));
  const ul = el("ul");
  list.forEach((e) => ul.append(el("li", { text: e })));
  box.append(ul);
  box.hidden = false;
  if (box.scrollIntoView) box.scrollIntoView({ block: "center" });
}
function sayCurrent(text) {
  // Озвучення працює, лише якщо викликане одразу після дотику; інакше браузер може заблокувати
  const p = active.profile;
  AppConfig.speak(text, { language: meta.language, rate: p.speechRate, pitch: p.speechPitch });
}
function showSource(res) {
  $("sourceInfo").textContent = "Джерело поточних налаштувань: " + SOURCE_LABELS[res.source] + ".";
  const ul = $("loadWarnings");
  ul.textContent = "";
  res.warnings.forEach((w) => ul.append(el("li", { text: w })));
}

// ---------- Кнопки ----------
$("voiceTestBtn").addEventListener("click", () => {
  const p = readGroup($("profileBox"));
  const ok = AppConfig.speak("Це перевірка голосу. Швидкість і висота такі, як у цій формі.", { language: meta.language, rate: p.speechRate, pitch: p.speechPitch },
    () => setMsg("Не вдалося озвучити, спробуйте ще раз."));
  if (!ok) setMsg("Озвучення не підтримується в цьому браузері.");
});

$("saveBtn").addEventListener("click", () => {
  const r = AppConfig.save(readForm());
  if (!r.ok) {
    showErrors(r.errors, "Не збережено. Виправте помилки:");
    setMsg("Не збережено: помилок " + r.errors.length + ".");
    sayCurrent("Не збережено. Знайдено помилок: " + r.errors.length + ".");
    return;
  }
  active = r.value;
  meta = { version: r.value.version, language: r.value.language, system: r.value.system };
  AppConfig.applyProfile(active);
  renderAll(active);
  showErrors([]);
  setMsg("Збережено на цьому пристрої.");
  sayCurrent("Налаштування збережено.");
});

$("cancelBtn").addEventListener("click", () => {
  meta = { version: active.version, language: active.language, system: active.system };
  renderAll(active);
  showErrors([]);
  setMsg("Незбережені зміни скасовано.");
});

$("exportBtn").addEventListener("click", () => {
  const r = AppConfig.validate(readForm());
  if (!r.ok) {
    showErrors(r.errors, "Експорт неможливий. Виправте помилки:");
    setMsg("Експорт неможливий: помилок " + r.errors.length + ".");
    return;
  }
  showErrors([]);
  const text = AppConfig.exportText(r.value);
  $("exportText").value = text;
  $("exportDetails").open = true;
  try {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: "config.json" });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    setMsg("Експортовано поточний вміст форми. Якщо файл не з'явився, скопіюйте текст нижче (перевірити на iPhone).");
  } catch (e) {
    setMsg("Не вдалося створити файл. Скопіюйте текст нижче.");
  }
});

$("copyBtn").addEventListener("click", async () => {
  const ta = $("exportText");
  try {
    await navigator.clipboard.writeText(ta.value);
    setMsg("Текст скопійовано.");
  } catch (e) {
    ta.select();
    setMsg("Виділіть текст і скопіюйте його вручну.");
  }
});

$("importBtn").addEventListener("click", () => $("importInput").click());
$("importInput").addEventListener("change", () => {
  const input = $("importInput");
  const f = input.files && input.files[0];
  if (!f) return;
  if (f.size > 500 * 1024) {
    showErrors(["Файл завеликий (понад 500 КБ)."], "Імпорт скасовано:");
    input.value = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try {
      data = JSON.parse(String(reader.result));
    } catch (e) {
      showErrors(["Файл не є правильним JSON (" + e.message + "). Перевірте коми, лапки й дужки."], "Імпорт скасовано. Поточні налаштування не змінено.");
      return;
    }
    const r = AppConfig.validate(data);
    if (!r.ok) {
      showErrors(r.errors, "Імпорт скасовано: у файлі є помилки. Поточні налаштування не змінено.");
      setMsg("Імпорт скасовано.");
      return;
    }
    meta = { version: r.value.version, language: r.value.language, system: r.value.system };
    renderAll(r.value);
    showErrors(r.warnings, "Файл прийнято, але є зауваження:");
    setMsg("Файл завантажено у форму. Перевірте його й натисніть «Зберегти».");
  };
  reader.onerror = () => showErrors(["Не вдалося прочитати файл."], "Імпорт скасовано:");
  reader.readAsText(f);
  input.value = "";
});

// Скидання: потрібне друге натискання протягом 5 секунд
let resetArmed = false, resetTimer = null;
function disarmReset() {
  resetArmed = false;
  clearTimeout(resetTimer);
  $("resetBtn").textContent = "Скинути до файлу config.json";
}
$("resetBtn").addEventListener("click", async () => {
  if (!resetArmed) {
    resetArmed = true;
    $("resetBtn").textContent = "Натисніть ще раз, щоб підтвердити";
    resetTimer = setTimeout(disarmReset, 5000);
    return;
  }
  disarmReset();
  AppConfig.clearUser();
  await init("Збережені на цьому пристрої налаштування видалено.");
});

// ---------- Старт ----------
async function init(note) {
  const res = await AppConfig.load();
  active = res.config;
  meta = { version: active.version, language: active.language, system: active.system };
  AppConfig.applyProfile(active);
  renderAll(active);
  showSource(res);
  showErrors([]);
  setMsg(note || "");
}
init();
