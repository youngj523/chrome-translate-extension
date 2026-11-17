import { MODELS, STYLES, getSettings, saveSettings } from "../src/settings.js";

const $ = (id) => document.getElementById(id);
const apiKeyEl = $("apiKey");
const modelEl = $("model");
const styleEl = $("style");
const statusEl = $("status");

function fillSelect(select, items) {
  for (const item of items) {
    const opt = document.createElement("option");
    opt.value = item.id;
    opt.textContent = item.label;
    select.append(opt);
  }
}
fillSelect(modelEl, MODELS);
fillSelect(styleEl, STYLES);

const settings = await getSettings();
apiKeyEl.value = settings.apiKey;
modelEl.value = settings.model;
styleEl.value = settings.translationStyle;

async function showCacheInfo() {
  const res = await chrome.runtime.sendMessage({ type: "cacheStats" });
  $("cacheInfo").textContent = res ? `目前記住 ${res.count} 段。` : "";
}
showCacheInfo();

$("clearCache").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "clearCache" });
  await showCacheInfo();
  showStatus("快取已清除", "ok");
});

function showStatus(text, kind = "") {
  statusEl.textContent = text;
  statusEl.className = kind;
}

$("toggle").addEventListener("click", () => {
  const hidden = apiKeyEl.type === "password";
  apiKeyEl.type = hidden ? "text" : "password";
  $("toggle").textContent = hidden ? "隱藏" : "顯示";
});

$("save").addEventListener("click", async () => {
  await saveSettings({ apiKey: apiKeyEl.value.trim(), model: modelEl.value, translationStyle: styleEl.value });
  showStatus("已儲存", "ok");
});

$("test").addEventListener("click", async () => {
  const apiKey = apiKeyEl.value.trim();
  if (!apiKey) return showStatus("請先貼上金鑰", "err");
  $("test").disabled = true;
  showStatus("測試中…");
  const res = await chrome.runtime.sendMessage({ type: "testKey", apiKey, model: modelEl.value });
  $("test").disabled = false;
  if (res?.ok) showStatus(`金鑰可以用。測試翻譯：${res.sample}`, "ok");
  else showStatus(res?.error || "測試失敗", "err");
});
