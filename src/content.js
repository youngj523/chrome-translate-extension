// 注入到網頁裡執行。
// 第一次點按鈕：開始翻譯，段落捲到畫面附近才翻，之後新載入的內容也會自動翻。
// 再點一次：隱藏譯文並暫停翻譯；再點又顯示並繼續。
(() => {
  const root = document.documentElement;
  if (window.__btState) {
    window.__btState.toggle();
    return;
  }

  const BLOCK_SELECTOR = "p, h1, h2, h3, h4, h5, h6, li, blockquote, dd, dt, figcaption, td, th, summary";
  const SKIP_ANCESTORS = "script, style, noscript, code, pre, textarea, input, select, button, nav, svg, math, [contenteditable=''], [contenteditable='true'], .bt-translation";
  // 只用 div/span 排版、沒有 <p> 的網站（例如 X 的推文），找「裡面沒有其他區塊的 div」當段落。
  const INNER_BLOCKS = "div, p, ul, ol, li, table, section, article, header, footer, aside, h1, h2, h3, h4, h5, h6, blockquote, pre, form";
  // 按鈕、連結文字這類短字串不翻；div 段落至少要 3 個英文單字。
  const MIN_DIV_WORDS = 3;
  const MARK = "data-bt"; // 已經排進翻譯流程的段落會加上這個屬性
  const BATCH_MAX_ITEMS = 20;
  const BATCH_MAX_CHARS = 4000;
  const CONCURRENCY = 3;
  // 段落進入畫面上下 600px 範圍內就開始翻，捲動時譯文通常已經準備好。
  const PRELOAD_MARGIN = "600px 0px";

  let paused = false;
  const queue = []; // 已進入畫面、等著送出的段落
  let running = 0;
  let flushTimer = null;
  let scanTimer = null;

  // 用實際的顯示方式判斷是不是「獨立一行」的區塊；句子中間的連結就算用 div 寫，通常也是 inline。
  function isBlockLevel(el) {
    const d = getComputedStyle(el).display;
    return d !== "none" && d !== "contents" && !d.startsWith("inline");
  }

  function isTextLeafDiv(el) {
    if (!isBlockLevel(el)) return false;
    for (const inner of el.querySelectorAll(INNER_BLOCKS)) {
      if (isBlockLevel(inner)) return false;
    }
    if (el.closest("a, [role='button'], [role='link'], [role='menuitem'], [role='tab'], label")) return false;
    const words = el.innerText.trim().match(/[A-Za-z]+/g) || [];
    return words.length >= MIN_DIV_WORDS;
  }

  function isEnglishText(text) {
    if (text.length < 2) return false;
    const latin = (text.match(/[A-Za-z]/g) || []).length;
    const cjk = (text.match(/[㐀-鿿]/g) || []).length;
    return latin >= 3 && latin > cjk;
  }

  function isVisible(el) {
    return !!(el.offsetParent || getComputedStyle(el).position === "fixed");
  }

  // 找出還沒處理過的段落：可見、含英文、不在程式碼或導覽列裡，且不是其他候選段落的外層。
  function collectNewBlocks() {
    const tagged = [...document.body.querySelectorAll(BLOCK_SELECTOR)];
    const divs = [...document.body.querySelectorAll("div")].filter(
      (el) => !el.closest(BLOCK_SELECTOR) && isTextLeafDiv(el)
    );
    const all = [...tagged, ...divs];
    const set = new Set(all);
    return all.filter((el) => {
      if (el.closest(`[${MARK}]`) || el.querySelector(`[${MARK}]`)) return false;
      if (el.closest(SKIP_ANCESTORS)) return false;
      // 例如 <li><p>…</p></li>：只翻裡面的 <p>，避免重複。
      for (const inner of el.querySelectorAll(BLOCK_SELECTOR)) {
        if (set.has(inner) && inner.innerText.trim()) return false;
      }
      if (!isVisible(el)) return false;
      return isEnglishText(el.innerText.trim());
    });
  }

  const viewportObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        viewportObserver.unobserve(entry.target);
        enqueue(entry.target);
      }
    },
    { rootMargin: PRELOAD_MARGIN }
  );

  function scan() {
    for (const el of collectNewBlocks()) {
      el.setAttribute(MARK, "");
      viewportObserver.observe(el);
    }
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 400);
  }

  // 網頁有新內容（捲動載入、展開留言、單頁網站換頁）時重新掃描；忽略自己插入的譯文。
  const mutationObserver = new MutationObserver((records) => {
    for (const r of records) {
      for (const node of r.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains("bt-translation")) continue;
        if (node.nodeType === Node.TEXT_NODE && node.parentElement?.closest(".bt-translation")) continue;
        scheduleScan();
        return;
      }
    }
  });

  function enqueue(el) {
    const text = el.innerText.trim();
    if (!text) return;
    const span = document.createElement("span");
    span.className = "bt-translation bt-loading";
    span.setAttribute("lang", "zh-Hant-TW");
    span.textContent = "翻譯中…";
    el.append(span);
    queue.push({ text, span });
    clearTimeout(flushTimer);
    flushTimer = setTimeout(pump, 150); // 稍等一下，把同時進入畫面的段落湊成一批
  }

  function takeBatch() {
    const batch = [];
    let chars = 0;
    while (queue.length && batch.length < BATCH_MAX_ITEMS) {
      const next = queue[0];
      if (batch.length && chars + next.text.length > BATCH_MAX_CHARS) break;
      batch.push(queue.shift());
      chars += next.text.length;
    }
    return batch;
  }

  function pump() {
    while (!paused && running < CONCURRENCY && queue.length) {
      const batch = takeBatch();
      running++;
      runBatch(batch).finally(() => {
        running--;
        pump();
      });
    }
  }

  async function runBatch(batch) {
    let res;
    try {
      res = await chrome.runtime.sendMessage({ type: "translate", texts: batch.map((b) => b.text) });
    } catch (e) {
      res = { ok: false, error: e.message };
    }
    batch.forEach(({ span }, i) => {
      span.classList.remove("bt-loading");
      if (res?.ok) {
        span.textContent = res.translations[i];
      } else {
        span.classList.add("bt-error");
        span.textContent = `翻譯失敗：${res?.error || "未知錯誤"}`;
      }
    });
  }

  function applyStyle(style) {
    for (const c of [...root.classList]) if (c.startsWith("bt-style-")) root.classList.remove(c);
    root.classList.add(`bt-style-${style || "faded"}`);
  }

  function toggle() {
    paused = !paused;
    root.classList.toggle("bt-hidden", paused);
    if (!paused) {
      scan();
      pump();
    }
  }

  window.__btState = { toggle };

  chrome.storage.local.get("translationStyle").then(({ translationStyle }) => applyStyle(translationStyle));
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.translationStyle) applyStyle(changes.translationStyle.newValue);
  });

  scan();
  mutationObserver.observe(document.body, { childList: true, subtree: true });
})();
