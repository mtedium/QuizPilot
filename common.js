// 共用模块：面板 UI、提示词生成、JSON 解析、复制
// 挂到 window.QH，供各站点模块使用
window.QH = (() => {
  const LETTERS = "ABCDEFGH";
  const PANEL_ID = "__quiz-helper-panel";
  let stylesAdded = false;

  function addStyles() {
    if (stylesAdded) return;
    stylesAdded = true;
    const style = document.createElement("style");
    style.textContent = `
      #${PANEL_ID} { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
        width: 320px; background: #fff; border-radius: 12px;
        box-shadow: 0 8px 30px rgba(0,0,0,.15);
        font-family: system-ui, sans-serif; font-size: 13px; color: #111827;
        overflow: hidden; }
      #${PANEL_ID} .qh-head { display: flex; align-items: center;
        padding: 12px 14px; border-bottom: 1px solid #f3f4f6;
        font-weight: 600; font-size: 14px; }
      #${PANEL_ID} .qh-by { color: #9ca3af; font-weight: 400; font-size: 11px;
        margin-left: 6px; }
      #${PANEL_ID} .qh-by a { color: inherit; text-decoration: none; }
      #${PANEL_ID} .qh-by a:hover { text-decoration: underline; }
      #${PANEL_ID} .qh-count { margin-left: auto; color: #9ca3af;
        font-weight: 400; font-size: 12px; margin-right: 10px; }
      #${PANEL_ID} .qh-toggle { background: none; border: none; cursor: pointer;
        color: #2563eb; font-size: 12px; padding: 2px 4px; }
      #${PANEL_ID} .qh-body { padding: 14px; display: flex;
        flex-direction: column; gap: 8px; }
      #${PANEL_ID} .qh-body.hide { display: none; }
      #${PANEL_ID} .qh-row { display: flex; align-items: center;
        justify-content: space-between; gap: 8px; }
      #${PANEL_ID} .qh-label { color: #6b7280; font-size: 12px; font-weight: 600; }
      #${PANEL_ID} .qh-btns { display: flex; gap: 6px; flex: none; }
      #${PANEL_ID} button.qh-btn { padding: 5px 14px; font-size: 12px;
        cursor: pointer; background: #2563eb; color: #fff;
        border: none; border-radius: 6px; flex: none; }
      #${PANEL_ID} button.qh-btn:hover { background: #1d4ed8; }
      #${PANEL_ID} button.qh-btn.qh-green { background: #16a34a; }
      #${PANEL_ID} button.qh-btn.qh-green:hover { background: #15803d; }
      #${PANEL_ID} textarea { width: 100%; box-sizing: border-box; font-size: 12px;
        border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px;
        resize: vertical; outline: none; }
      #${PANEL_ID} textarea:focus { border-color: #2563eb; }
      #${PANEL_ID} textarea.qh-prompt { height: 130px; background: #f9fafb; color: #374151; }
      #${PANEL_ID} textarea.qh-answer { height: 70px; }
      #${PANEL_ID} .qh-status { font-size: 12px; white-space: pre-line; }
      #${PANEL_ID} .qh-status.ok { color: #16a34a; }
      #${PANEL_ID} .qh-status.err { color: #dc2626; }
      #${PANEL_ID} .qh-status:empty { display: none; }
      #${PANEL_ID} .qh-tabbtn { flex: 1; padding: 4px 0; font-size: 12px; cursor: pointer;
        border: none; background: #f3f4f6; color: #6b7280; }
      #${PANEL_ID} .qh-tabbtn.on { background: #fff; color: #2563eb; font-weight: 600; }
      #${PANEL_ID} .qh-tabs { display: flex; border: 1px solid #e5e7eb;
        border-radius: 6px; overflow: hidden; }
      #${PANEL_ID} .qh-list { max-height: 160px; overflow-y: auto;
        border: 1px solid #e5e7eb; border-radius: 8px; }
      #${PANEL_ID} .qh-item { padding: 6px 8px; font-size: 12px;
        border-bottom: 1px solid #f3f4f6; display: flex; gap: 6px; }
      #${PANEL_ID} .qh-item:last-child { border-bottom: none; }
      #${PANEL_ID} .qh-item .no { color: #9ca3af; flex: none; }
      #${PANEL_ID} .qh-item .ans { font-weight: 600; flex: none; }
      #${PANEL_ID} .qh-item.hit .ans { color: #16a34a; }
      #${PANEL_ID} .qh-item.miss .ans { color: #dc2626; }
      #${PANEL_ID} .qh-item .txt { color: #374151; overflow: hidden;
        text-overflow: ellipsis; white-space: nowrap; }
    `;
    document.head.appendChild(style);
  }

  // 面板外壳，返回往 body 里加元素的 helper
  function createShell(countText) {
    addStyles();
    const wrap = document.createElement("div");
    wrap.id = PANEL_ID;
    wrap.innerHTML = `
      <div class="qh-head">
        QuizPilot <span class="qh-by"><a href="https://github.com/mtedium/QuizPilot" target="_blank" rel="noopener">by mtedium v${chrome.runtime.getManifest().version}</a></span>
        <span class="qh-count">${countText}</span>
        <button class="qh-toggle">收起</button>
      </div>
      <div class="qh-body"></div>`;
    document.body.appendChild(wrap);

    const body = wrap.querySelector(".qh-body");
    wrap.querySelector(".qh-toggle").addEventListener("click", () => {
      const hidden = body.classList.toggle("hide");
      wrap.querySelector(".qh-toggle").textContent = hidden ? "展开" : "收起";
    });

    const el = html => {
      const div = document.createElement("div");
      div.innerHTML = html;
      return body.appendChild(div.firstElementChild);
    };
    const setStatus = (text, ok) => {
      const s = body.querySelector(".qh-status");
      s.textContent = text;
      s.className = "qh-status " + (ok ? "ok" : "err");
    };

    return { wrap, body, el, setStatus };
  }

  function buildPrompt(qs) {
    const body = qs.map((q, i) => {
      const opts = q.options.map((o, j) => `   ${LETTERS[j]}. ${o}`).join("\n");
      return `${i + 1}. ${q.stem}【${q.type}】\n${opts}`;
    }).join("\n\n");
    return `请回答以下全部 ${qs.length} 道题目。

【输出要求】
1. 只输出一个 JSON 数组，不要解释或 markdown 代码块
2. 每道题一个对象，字段为 "题号" 和 "答案"
3. "答案" 为选项字母，单选/判断一个字母，多选连写如 "ACD"

【输出示例】
[{"题号":1,"答案":"A"},{"题号":2,"答案":"B"},{"题号":3,"答案":"ACD"}]

【题目】
${body}`;
  }

  // 解析 AI 输出 → [{index: 题号, letters: ["A",...]}]
  function parseJsonAnswers(raw) {
    const data = JSON.parse(raw.replace(/```(?:json)?/gi, "").trim());
    return data.map(e => {
      const letters = String(e["答案"]).toUpperCase().match(/[A-H]/g) || [];
      return { index: parseInt(e["题号"]), letters };
    }).filter(a => Number.isInteger(a.index) && a.letters.length);
  }

  function copyText(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }

  return { LETTERS, buildPrompt, parseJsonAnswers, copyText, createShell };
})();
