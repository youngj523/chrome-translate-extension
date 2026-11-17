// 譯文快取：同一個模型翻過的同一段文字，直接從 chrome.storage.local 拿，不再呼叫 API。
const PREFIX = "tc:";
// 快取超過這個大小就整個清掉重來，避免無限長大。
const MAX_BYTES = 8 * 1024 * 1024;

async function keyFor(model, text) {
  const data = new TextEncoder().encode(`${model}\n${text}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return PREFIX + hex;
}

// 回傳與 texts 等長的陣列，沒快取到的位置是 undefined。
export async function getCached(model, texts) {
  const keys = await Promise.all(texts.map((t) => keyFor(model, t)));
  const found = await chrome.storage.local.get(keys);
  return keys.map((k) => found[k]);
}

export async function putCached(model, texts, translations) {
  const entries = {};
  for (let i = 0; i < texts.length; i++) {
    entries[await keyFor(model, texts[i])] = translations[i];
  }
  if ((await chrome.storage.local.getBytesInUse(null)) > MAX_BYTES) await clearCache();
  await chrome.storage.local.set(entries);
}

async function cacheKeys() {
  const all = await chrome.storage.local.get(null);
  return Object.keys(all).filter((k) => k.startsWith(PREFIX));
}

export async function clearCache() {
  await chrome.storage.local.remove(await cacheKeys());
}

export async function cacheStats() {
  return { count: (await cacheKeys()).length };
}
