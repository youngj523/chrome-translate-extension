// 設定的讀寫，集中在這裡，背景程式和設定頁共用。
export const MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5（品質最好，較貴）" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5（品質與價格折衷）" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5（最便宜、最快）" },
];

export const STYLES = [
  { id: "faded", label: "淡色（沿用原文顏色，稍微變淡）" },
  { id: "small", label: "灰色小一號字" },
  { id: "bar", label: "左側加藍色色條" },
];

export const DEFAULTS = {
  apiKey: "",
  model: "claude-opus-5-5",
  translationStyle: "faded",
};

export async function getSettings() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  return { ...DEFAULTS, ...stored };
}

export async function saveSettings(partial) {
  await chrome.storage.local.set(partial);
}
