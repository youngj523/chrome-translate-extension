import { getSettings } from "./settings.js";
import { callClaude, textOf } from "./claude.js";
import { translateBatch } from "./translate.js";
import { getCached, putCached, clearCache, cacheStats } from "./cache.js";

// 點工具列按鈕：還沒設定金鑰就打開設定頁；否則在目前分頁開關雙語翻譯。
chrome.action.onClicked.addListener(async (tab) => {
  const { apiKey } = await getSettings();
  if (!apiKey) {
    chrome.runtime.openOptionsPage();
    return;
  }
  try {
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["src/content.css"] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["src/content.js"] });
  } catch (e) {
    // chrome:// 頁面、Chrome 線上應用程式商店等頁面不允許擴充功能注入。
    console.warn("無法在這個頁面翻譯：", e.message);
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "testKey") {
    testKey(msg.apiKey, msg.model).then(sendResponse);
    return true; // 非同步回覆
  }
  if (msg?.type === "translate") {
    handleTranslate(msg.texts).then(sendResponse);
    return true;
  }
  if (msg?.type === "cacheStats") {
    cacheStats().then(sendResponse);
    return true;
  }
  if (msg?.type === "clearCache") {
    clearCache().then(() => sendResponse({ ok: true }));
    return true;
  }
});

async function handleTranslate(texts) {
  try {
    const { apiKey, model } = await getSettings();
    const translations = await getCached(model, texts);
    // 只把沒快取到的段落送給 Claude。
    const missing = texts.map((t, i) => (translations[i] === undefined ? i : -1)).filter((i) => i >= 0);
    if (missing.length) {
      const missingTexts = missing.map((i) => texts[i]);
      const fresh = await translateBatch({ apiKey, model, texts: missingTexts });
      missing.forEach((idx, j) => (translations[idx] = fresh[j]));
      await putCached(model, missingTexts, fresh);
    }
    return { ok: true, translations };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function testKey(apiKey, model) {
  try {
    const res = await callClaude({
      apiKey,
      model,
      maxTokens: 1024,
      messages: [{ role: "user", content: "把 Hello, world! 翻成繁體中文，只回譯文。" }],
    });
    return { ok: true, sample: textOf(res).trim() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
