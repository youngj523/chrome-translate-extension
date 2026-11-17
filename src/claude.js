// 呼叫 Claude Messages API。擴充功能沒有打包工具，所以直接用 fetch，不用 npm SDK。
const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2026-10-21";
// Opus 5.5 / Sonnet 5.5 被安全機制拒答時，伺服器自動改用其他模型重試。
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5"]);

export class ClaudeError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function callClaude({ apiKey, model, system, messages, maxTokens = 16000, effort = "low", format }) {
  if (!apiKey) throw new ClaudeError("尚未設定 Claude API 金鑰", 0);

  const headers = {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": API_VERSION,
    "anthropic-dangerous-direct-browser-access": "true",
  };
  const body = {
    model,
    max_tokens: maxTokens,
    output_config: format ? { effort, format } : { effort },
    messages,
  };
  if (system) body.system = system;
  if (FALLBACK_MODELS.has(model)) {
    headers["anthropic-beta"] = "server-side-fallback-2026-07-01";
    body.fallbacks = "default";
  }

  let res;
  try {
    res = await fetch(API_URL, { method: "POST", headers, body: JSON.stringify(body) });
  } catch (e) {
    throw new ClaudeError(`連不上 Claude API：${e.message}`, 0);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ClaudeError(describeError(res.status, data), res.status);
  }
  if (data.stop_reason === "refusal") {
    throw new ClaudeError("Claude 拒絕翻譯這段內容", res.status);
  }
  return data;
}

// 把回應裡所有文字區塊接起來（略過 thinking 區塊）。
export function textOf(response) {
  return (response.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function describeError(status, data) {
  const detail = data?.error?.message || "";
  switch (status) {
    case 401:
      return "金鑰無效，請確認貼上的是完整的 API 金鑰";
    case 402:
    case 403:
      return `帳戶沒有權限或餘額不足（${detail}）`;
    case 404:
      return `找不到這個模型（${detail}）`;
    case 429:
      return "請求太頻繁或超過額度，請稍後再試";
    default:
      if (status >= 500) return "Claude 服務暫時有問題，請稍後再試";
      return `請求失敗（${status}）：${detail}`;
  }
}
