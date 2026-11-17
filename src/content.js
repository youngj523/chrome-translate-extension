// 注入到網頁裡執行。第一次點按鈕：找出英文段落並翻譯；之後再點：顯示／隱藏譯文。
(() => {
  const root = document.documentElement;
  if (window.__btState) {
    root.classList.toggle("bt-hidden");
    return;
  }
  window.__btState = { started: true };

  const BLOCK_SELECTOR = "p, h1, h2, h3, h4, h5, h6, li, blockquote, dd, dt, figcaption, td, th, summary";
  const SKIP_ANCESTORS = "script, style, noscript, code, pre, textarea, input, select, button, nav, svg, math, [contenteditable=''], [contenteditable='true'], .bt-translation";
  const BATCH_MAX_ITEMS = 20;
  const BATCH_MAX_CHARS = 4000;
  const CONCURRENCY = 3;

  // 找出要翻譯的段落：可見、含英文、不在程式碼或導覽列裡，且不是其他候選段落的外層。
  function collectBlocks() {
    const all = [...document.body.querySelectorAll(BLOCK_SELECTOR)];
    const set = new Set(all);
    return all.filter((el) => {
      if (el.closest(SKIP_ANCESTORS)) return false;
      // 例如 <li><p>…</p></li>：只翻裡面的 <p>，避免重複。
      for (const inner of el.querySelectorAll(BLOCK_SELECTOR)) {
        if (set.has(inner) && inner.innerText.trim()) return false;
      }
      if (!el.offsetParent && getComputedStyle(el).position !== "fixed") return false;
      const text = el.innerText.trim();
      if (text.length < 2) return false;
      const latin = (text.match(/[A-Za-z]/g) || []).length;
      const cjk = (text.match(/[㐀-鿿]/g) || []).length;
      return latin >= 3 && latin > cjk;
    });
  }

  function makeBatches(blocks) {
    const batches = [];
    let cur = [];
    let chars = 0;
    for (const el of blocks) {
      const text = el.innerText.trim();
      if (cur.length && (cur.length >= BATCH_MAX_ITEMS || chars + text.length > BATCH_MAX_CHARS)) {
        batches.push(cur);
        cur = [];
        chars = 0;
      }
      cur.push({ el, text });
      chars += text.length;
    }
    if (cur.length) batches.push(cur);
    return batches;
  }

  function addPlaceholder(el) {
    const span = document.createElement("span");
    span.className = "bt-translation bt-loading";
    span.setAttribute("lang", "zh-Hant-TW");
    span.textContent = "翻譯中…";
    el.append(span);
    return span;
  }

  async function runBatch(batch) {
    const spans = batch.map(({ el }) => addPlaceholder(el));
    let res;
    try {
      res = await chrome.runtime.sendMessage({ type: "translate", texts: batch.map((b) => b.text) });
    } catch (e) {
      res = { ok: false, error: e.message };
    }
    spans.forEach((span, i) => {
      span.classList.remove("bt-loading");
      if (res?.ok) {
        span.textContent = res.translations[i];
      } else {
        span.classList.add("bt-error");
        span.textContent = `翻譯失敗：${res?.error || "未知錯誤"}`;
      }
    });
  }

  async function translatePage() {
    const queue = makeBatches(collectBlocks());
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) await runBatch(queue.shift());
    });
    await Promise.all(workers);
  }

  translatePage();
})();
