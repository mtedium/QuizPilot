// piclass 模块
// student_detail 页：AI 标签（复制给 AI → 粘贴 JSON → 批量提交）
//                题库标签（本地题库按选项文本对齐匹配 → 批量提交）
(() => {
  const { buildPrompt, parseJsonAnswers, copyText, createShell } = window.QH;
  const BANK = window.QH_BANK || {};

  function parseQuestion(text) {
    const options = [];
    const stemLines = [];
    for (const line of text.split("\n").map(s => s.trim()).filter(Boolean)) {
      const m = line.match(/^\(([A-Ha-h])\)\s*(.*)$/);
      if (m) options["ABCDEFGH".indexOf(m[1].toUpperCase())] = m[2];
      else stemLines.push(line);
    }
    return { stem: stemLines.join("\n"), options, type: "单选题" };
  }

  // 页面题目接口 → [{stem, options, type, id1, id2}]
  async function fetchChoices(zyId) {
    const res = await fetch("/api/zy_choice.html?zy_id=" + zyId, { credentials: "include" });
    const data = await res.json();
    return data.info.map(item => ({
      ...parseQuestion(item.question), id1: item.id1, id2: item.id2,
    }));
  }

  // 归一化（与 build_bank.py 一致）：只留小写字母数字汉字
  function normText(s) {
    return s.toLowerCase().replace(/&[a-z]+;/g, "")
      .replace(/[^0-9a-z\u4e00-\u9fff]/g, "");
  }
  // 题干键：再剥题号前缀和（AI考点）
  function normKey(s) {
    return normText(s.replace(/^\d+[\.、．]\s*/, "").replace(/[（(]\s*AI考点\s*[)）]/, ""));
  }

  // 批量 POST 提交，map: {题号: 字母}，完成后汇报并刷新
  async function submitAll(zyId, qs, map, setStatus) {
    const token = document.querySelector("input[name='csrfmiddlewaretoken']").value;
    let done = 0;
    const failures = [];
    for (let i = 0; i < qs.length; i++) {
      const letter = map[i + 1];
      if (!letter) { failures.push(i + 1 + " 无答案"); continue; }
      const body = new FormData();
      body.append("csrfmiddlewaretoken", token);
      body.append("ans1", letter);
      const res = await fetch(
        `/choice/student_answer.html?zy_id=${zyId}&id1=${qs[i].id1}&id2=${qs[i].id2}`,
        { method: "POST", body, credentials: "include", redirect: "manual" });
      if (res.type === "opaqueredirect") done++;
      else failures.push(i + 1);
      setStatus(`提交中 ${done + failures.length}/${qs.length}…`, true);
    }
    let msg = `完成：提交成功 ${done} 题`;
    if (failures.length) { msg += "\n失败：\n" + failures.join("\n"); setStatus(msg, false); }
    else setStatus(msg, true);
    setTimeout(() => location.reload(), failures.length ? 3000 : 1000);
  }

  // ---------- 题库匹配 ----------

  // 查找：先精确键，miss 则全量扫描做双向包含匹配；
  // 多个命中时答案必须全部一致，否则宁可不答
  function findGroups(stemKey) {
    if (BANK[stemKey]) return BANK[stemKey];
    if (stemKey.length < 10) return null; // 太短易误配
    const found = [];
    for (const k in BANK) {
      if (k.includes(stemKey) || stemKey.includes(k)) found.push(BANK[k]);
    }
    if (!found.length) return null;
    const first = JSON.stringify(found[0]);
    return found.every(g => JSON.stringify(g) === first) ? found[0] : null;
  }

  // 按题库正确选项文本在页面选项里定位字母（选项顺序随机也不怕）
  function matchQuestion(q) {
    const groups = findGroups(normKey(q.stem));
    if (!groups) return null;
    const normOpts = q.options.map(o => normText(o));
    const idxs = [];
    for (const cands of groups) {
      const idx = normOpts.findIndex(no => cands.includes(no));
      if (idx < 0) return null; // 选项文本对不上，宁可不答
      idxs.push(idx);
    }
    return idxs.map(i => "ABCDEFGH"[i]).join("");
  }

  // ---------- 面板 ----------

  async function initDetail() {
    const zyId = new URLSearchParams(location.search).get("zy_id");
    const { el, setStatus, wrap } = createShell("加载中…");

    let qs;
    try {
      qs = await fetchChoices(zyId);
    } catch {
      setStatus("题目加载失败", false);
      return;
    }
    wrap.querySelector(".qh-count").textContent = qs.length + " 题";

    // 顺序创建面板元素，按标签分组收集，供切换显隐
    let group = [];
    const groups = [];
    const add = html => {
      const e = el(html);
      group.push(e);
      return e;
    };
    const nextTab = () => { groups.push(group); group = []; };

    // --- AI 标签 ---
    add(`<div class="qh-row">
           <span class="qh-label">① 复制给 AI</span>
           <button class="qh-btn" id="qhCopy">复制</button>
         </div>`);
    const promptBox = add(`<textarea class="qh-prompt" readonly></textarea>`);
    promptBox.value = buildPrompt(qs);
    add(`<div class="qh-row">
           <span class="qh-label">② 粘贴 AI 的回答</span>
           <button class="qh-btn qh-green" id="qhFill">填入</button>
         </div>`);
    const answerText = add(`<textarea class="qh-answer"></textarea>`);
    nextTab();

    // --- 题库标签 ---
    const bankList = add(`<div class="qh-list"></div>`);
    const bankStat = add(`<div class="qh-label" id="qhBankStat"></div>`);
    const bankRow = add(`<div class="qh-row" style="justify-content: flex-end">
           <span class="qh-btns">
             <button class="qh-btn" id="qhRematch">重新匹配</button>
             <button class="qh-btn qh-green" id="qhBankFill">提交命中的题</button>
           </span>
         </div>`);
    nextTab();

    el(`<div class="qh-status"></div>`);

    // 标签栏插到最前
    wrap.querySelector(".qh-body").insertAdjacentHTML("afterbegin",
      `<div class="qh-tabs">
         <button class="qh-tabbtn on" data-tab="0">AI</button>
         <button class="qh-tabbtn" data-tab="1">题库</button>
       </div>`);

    // --- 标签切换 ---
    const showTab = n => groups.forEach((g, i) =>
      g.forEach(e => e.style.display = i === n ? "" : "none"));
    showTab(0); // 默认只显示 AI 标签
    wrap.querySelectorAll(".qh-tabbtn").forEach(btn => {
      btn.addEventListener("click", () => {
        wrap.querySelectorAll(".qh-tabbtn").forEach(b => b.classList.remove("on"));
        btn.classList.add("on");
        showTab(+btn.dataset.tab);
      });
    });

    // --- AI 标签逻辑 ---
    wrap.querySelector("#qhCopy").addEventListener("click", () => {
      if (copyText(promptBox.value)) {
        setStatus(`已复制 ${qs.length} 道题，去 AI 聊天框粘贴`, true);
      } else {
        promptBox.focus();
        promptBox.select();
        setStatus("自动复制失败，已全选文本，按 ⌘C / Ctrl+C", false);
      }
    });
    wrap.querySelector("#qhFill").addEventListener("click", () => {
      let answers;
      try {
        answers = parseJsonAnswers(answerText.value);
      } catch {
        setStatus("解析失败，请粘贴完整的 JSON", false);
        return;
      }
      const map = {};
      answers.forEach(a => map[a.index] = a.letters[0]);
      if (!Object.keys(map).length) { setStatus("没解析出答案", false); return; }
      submitAll(zyId, qs, map, setStatus);
    });

    // --- 题库标签逻辑 ---
    let results = [];
    const rematchBtn = bankRow.querySelector("#qhRematch");
    const doMatch = () => {
      results = qs.map(matchQuestion);
      const hits = results.filter(Boolean).length;
      bankList.innerHTML = results.map((ans, i) => `
        <div class="qh-item ${ans ? "hit" : "miss"}">
          <span class="no">${i + 1}</span>
          <span class="ans">${ans || "✗"}</span>
          <span class="txt" title="${qs[i].stem.replace(/"/g, "&quot;")}">${qs[i].stem}</span>
        </div>`).join("");
      bankStat.textContent = `命中 ${hits}/${qs.length}（按选项文本对齐）`;
    };
    const runMatch = () => {
      rematchBtn.disabled = true;
      rematchBtn.textContent = "匹配中…";
      bankStat.textContent = "正在匹配题库…";
      setTimeout(() => { // 让「匹配中」先渲染出来
        doMatch();
        rematchBtn.disabled = false;
        rematchBtn.textContent = "重新匹配";
      }, 30);
    };
    doMatch();
    rematchBtn.addEventListener("click", runMatch);
    bankRow.querySelector("#qhBankFill").addEventListener("click", () => {
      const hits = results.filter(Boolean).length;
      if (!hits) { setStatus("题库一题都没命中，用 AI 标签吧", false); return; }
      const map = {};
      results.forEach((ans, i) => { if (ans) map[i + 1] = ans; });
      submitAll(zyId, qs, map, setStatus);
    });
  }

  if (location.pathname.endsWith("student_detail.html")) initDetail();
})();
