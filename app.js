// Головна сторінка: налаштування беремо з AppConfig (config.js)
let config = AppConfig.DEFAULTS();

const statusEl = document.getElementById("status");
const warnEl = document.getElementById("warn");
const btn = document.getElementById("checkBtn");

function showStatus(text) { statusEl.textContent = text; }

AppConfig.load().then((res) => {
  config = res.config;
  AppConfig.applyProfile(config);
  warnEl.textContent = res.warnings.join(" ");
});

// Озвучення викликаємо лише з дотику до кнопки
btn.addEventListener("click", () => {
  const text = config.system.checkPhrase;
  showStatus(text);
  const ok = AppConfig.speak(
    text,
    { language: config.language, rate: config.profile.speechRate, pitch: config.profile.speechPitch },
    () => showStatus("Не вдалося озвучити, спробуйте ще раз")
  );
  if (!ok) showStatus(text + " (озвучення не підтримується в цьому браузері)");
});

// Service worker (потрібен https або localhost)
if ("serviceWorker" in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("sw.js").catch(() => showStatus("Офлайн-режим недоступний"));
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) showStatus("Доступна нова версія. Закрийте й відкрийте застосунок ще раз.");
  });
} else {
  showStatus("Офлайн-режим не підтримується в цьому браузері");
}
