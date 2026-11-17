import { getSettings } from "./settings.js";
import { callClaude, textOf } from "./claude.js";

// 點工具列按鈕：還沒設定金鑰就打開設定頁；翻譯功能在第 2 步加上。
chrome.action.onClicked.addListener(async (tab) => {
  const { apiKey } = await getSettings();
  if (!apiKey) {
    chrome.runtime.openOptionsPage();
    return;
  }
  // TODO（第 2 步）：在 tab 上注入翻譯腳本。
  console.log("已設定金鑰，翻譯功能尚未實作", tab.id);
});

// 設定頁的「測試金鑰」按鈕會送訊息過來。
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "testKey") {
    testKey(msg.apiKey, msg.model).then(sendResponse);
    return true; // 非同步回覆
  }
});

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
