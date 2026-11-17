import { MODELS, getSettings, saveSettings } from "../src/settings.js";

const $ = (id) => document.getElementById(id);
const apiKeyEl = $("apiKey");
const modelEl = $("model");
const statusEl = $("status");

for (const m of MODELS) {
  const opt = document.createElement("option");
  opt.value = m.id;
  opt.textContent = m.label;
  modelEl.append(opt);
}

const settings = await getSettings();
apiKeyEl.value = settings.apiKey;
modelEl.value = settings.model;

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
  await saveSettings({ apiKey: apiKeyEl.value.trim(), model: modelEl.value });
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
