// 把一批英文段落交給 Claude 翻成繁體中文，回傳同樣順序、同樣數量的譯文。
import { callClaude, textOf, ClaudeError } from "./claude.js";

const SYSTEM = `你是專業的英翻中譯者，把網頁段落翻成台灣慣用的繁體中文。
規則：
- 每個輸入段落對應一個譯文，順序與數量必須完全一致。
- 只輸出譯文，不加解釋、不加引號。
- 專有名詞、產品名、程式碼、網址、數字保持原樣；常見專有名詞可用台灣通行譯名。
- 用台灣用語，例如「軟體」「網路」「資訊」，不用「软件」「网络」「信息」這類大陸用語。
- 如果段落本來就是中文或沒有可翻譯的內容，原樣輸出。`;

export async function translateBatch({ apiKey, model, texts }) {
  const res = await callClaude({
    apiKey,
    model,
    system: SYSTEM,
    messages: [{ role: "user", content: JSON.stringify({ paragraphs: texts }) }],
    format: {
      type: "json_schema",
      schema: {
        type: "object",
        properties: { translations: { type: "array", items: { type: "string" } } },
        required: ["translations"],
        additionalProperties: false,
      },
    },
  });
  if (res.stop_reason === "max_tokens") throw new ClaudeError("譯文太長被截斷，請再試一次", 0);

  let parsed;
  try {
    parsed = JSON.parse(textOf(res));
  } catch {
    throw new ClaudeError("Claude 回傳的格式無法解析", 0);
  }
  const out = parsed.translations;
  if (!Array.isArray(out) || out.length !== texts.length) {
    throw new ClaudeError(`譯文段數不符（送出 ${texts.length} 段，收到 ${out?.length ?? 0} 段）`, 0);
  }
  return out;
}
