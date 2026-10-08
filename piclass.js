// piclass 模块
// student_detail 页：两个标签页
//   AI：复制题目给 AI → 粘贴 JSON → 批量提交
//   题库：本地题库匹配题目 → 命中直接批量提交
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

  // 页面自己的题目接口，返回 [{stem, options, type, id1, id2}]
  async function fetchChoices(zyId) {
    const res = await fetch("/api/zy_choice.html?zy_id=" + zyId, { credentials: "include" });
    const data = await res.json();
    return data.info.map(item => ({
      ...parseQuestion(item.question), id1: item.id1, id2: item.id2,
    }));
  }

  // 题干归一化（与 build_bank.py 一致）：剥题号前缀和（AI考点）尾缀、去空白、统一标点、小写
  function normKey(s) {
    return s.replace(/^\d+[\.、．]\s*/, "")
      .replace(/[（(]\s*AI考点\s*[)）]$/, "")
      .replace(/\s+/g, "")
      .replaceAll("（", "(").replaceAll("）", ")")
      .replaceAll("：", ":").replaceAll("，", ",")
      .replaceAll("？", "?")
      .toLowerCase();
  }

  // 批量 POST 提交，map: {题号: 字母}，返回 {done, failures[]}
  async function submitAll(zyId, qs, map, setStatus) {
    const token = document.querySelector("input[name='csrfmiddlewaretoken']").value;
    const total = qs.length;
    let done = 0;
    const failures = [];
    for (let i = 0; i < total; i++) {
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
      setStatus(`提交中 ${done + failures.length}/${total}…`, true);
    }
    return { done, failures };
  }

  // ---------- 标签页容器 ----------

  function tabBody(el, names) {
    el(`<div class="qh-tabs">${names.map((n, i) =>
      `<button class="qh-tabbtn${i === 0 ? " on" : ""}" data-tab="${i}">${n}</button>`).join("")}
    </div>`);
    return el(`<div></div>`);
  }

  // ---------- AI 标签 ----------

  function aiTab(el, qs, zyId, setStatus) {
    const view = el(`<div></div>`);

    const mk = () => {
      const v = el(`<div></div>`);
      view.appendChild(v);
      return v;
    };

    const row = mk();
    row.innerHTML = `
      <div class="qh-row">
        <span class="qh-label">① 复制给 AI</span>
        <button class="qh-btn" id="qhCopy">复制</button>
      </div>`;
    const promptBox = document.createElement("textarea");
    promptBox.className = "qh-prompt";
    promptBox.readOnly = true;
    promptBox.value = buildPrompt(qs);
    view.appendChild(promptBox);

    const row2 = mk();
    row2.innerHTML = `
      <div class="qh-row">
        <span class="qh-label">② 粘贴 AI 的回答</span>
        <button class="qh-btn qh-green" id="qhFill">填入</button>
      </div>`;
    const answerText = document.createElement("textarea");
    answerText.className = "qh-answer";
    view.appendChild(answerText);

    row.querySelector("#qhCopy").addEventListener("click", () => {
      if (copyText(promptBox.value)) {
        setStatus(`已复制 ${qs.length} 道题，去 AI 聊天框粘贴`, true);
      } else {
        promptBox.focus();
        promptBox.select();
        setStatus("自动复制失败，已全选文本，按 ⌘C / Ctrl+C", false);
      }
    });

    row2.querySelector("#qhFill").addEventListener("click", async () => {
      let answers;
      try {
        answers = parseJsonAnswers(answerText.value);
      } catch {
        setStatus("解析失败，请粘贴完整的 JSON", false);
        return;
      }
      if (!answers.length) {
        setStatus("没解析出答案，请检查 JSON 内容", false);
        return;
      }
      const map = {};
      answers.forEach(a => map[a.index] = a.letters[0]);
      const { done, failures } = await submitAll(zyId, qs, map, setStatus);
      let msg = `完成：提交成功 ${done} 题`;
      if (failures.length) { msg += "\n失败：\n" + failures.join("\n"); setStatus(msg, false); }
      else setStatus(msg, true);
      setTimeout(() => location.reload(), failures.length ? 3000 : 1000);
    });

    return view;
  }

  // ---------- 题库标签 ----------

  function bankTab(el, qs, zyId, setStatus) {
    const view = el(`<div></div>`);

    // 逐题匹配
    const results = qs.map((q, i) => {
      const ans = BANK[normKey(q.stem)] || null;
      return { i, ans };
    });
    const hits = results.filter(r => r.ans).length;

    const list = document.createElement("div");
    list.className = "qh-list";
    list.innerHTML = results.map(r => `
      <div class="qh-item ${r.ans ? "hit" : "miss"}">
        <span class="no">${r.i + 1}</span>
        <span class="ans">${r.ans || "✗"}</span>
        <span class="txt" title="${qs[r.i].stem.replace(/"/g, "&quot;")}">${qs[r.i].stem}</span>
      </div>`).join("");
    view.appendChild(list);

    const row = document.createElement("div");
    row.className = "qh-row";
    row.innerHTML = `
      <span class="qh-label">题库命中 ${hits}/${qs.length}</span>
      <button class="qh-btn qh-green" id="qhBankFill">提交命中的题</button>`;
    view.appendChild(row);

    row.querySelector("#qhBankFill").addEventListener("click", async () => {
      if (!hits) { setStatus("题库一题都没命中，换 AI 标签页吧", false); return; }
      const map = {};
      results.forEach(r => { if (r.ans) map[r.i + 1] = r.ans; });
      const { done, failures } = await submitAll(zyId, qs, map, setStatus);
      let msg = `完成：提交成功 ${done} 题`;
      if (failures.length) { msg += "\n失败：\n" + failures.join("\n"); setStatus(msg, false); }
      else setStatus(msg, true);
      setTimeout(() => location.reload(), failures.length ? 3000 : 1000);
    });

    return view;
  }

  // ---------- 主面板 ----------

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

    // 标签栏 + 两个视图
    el(`<div class="qh-tabs">
          <button class="qh-tabbtn on" data-tab="0">AI</button>
          <button class="qh-tabbtn" data-tab="1">题库</button>
        </div>`);
    const views = [
      aiTab(el, qs, zyId, setStatus),
      bankTab(el, qs, zyId, setStatus),
    ];
    el(`<div class="qh-status"></div>`);

    wrap.querySelectorAll(".qh-tabbtn").forEach(btn => {
      btn.addEventListener("click", () => {
        wrap.querySelectorAll(".qh-tabbtn").forEach(b => b.classList.remove("on"));
        btn.classList.add("on");
        views.forEach((v, i) => v.style.display = i === +btn.dataset.tab ? "" : "none");
      });
    });
  }

  // ---------- 启动 ----------

  if (location.pathname.endsWith("student_detail.html")) initDetail();
})();
