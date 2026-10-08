// 赛氪模块：提取题目 → 复制给 AI → 粘贴 JSON 自动填入
(() => {
  const { LETTERS, buildPrompt, parseJsonAnswers, copyText, createShell } = window.QH;
  const TYPE_NAMES = { 0: "单选题", 1: "多选题", 2: "判断题" };

  function extract() {
    return [...document.querySelectorAll("#questionForm li")]
      .filter(li => li.querySelector("p.stem"))
      .map(li => ({
        stem: li.querySelector("p.stem").innerText.trim(),
        options: [...li.querySelectorAll("label")].map(l => l.innerText.trim()),
        type: TYPE_NAMES[li.querySelector(".main").dataset.questionType] || "单选题",
      }));
  }

  function fill(answers, qs) {
    const lis = [...document.querySelectorAll("#questionForm li")]
      .filter(li => li.querySelector("p.stem"));
    let filled = 0;
    answers.forEach(({ index, optionIndexes }) => {
      const inputs = lis[index - 1].querySelectorAll("input");
      if (!inputs.length) return;
      optionIndexes.forEach(oi => inputs[oi].click());
      filled++;
    });
    return filled;
  }

  function init() {
    const qs = extract();
    if (!qs.length) return;

    const { el, setStatus } = createShell(qs.length + " 题");

    el(`
      <div class="qh-row">
        <span class="qh-label">① 复制给 AI</span>
        <button class="qh-btn" id="qhCopy">复制</button>
      </div>`);
    const promptBox = el(`<textarea class="qh-prompt" readonly></textarea>`);
    promptBox.value = buildPrompt(qs);

    el(`
      <div class="qh-row">
        <span class="qh-label">② 粘贴 AI 的回答</span>
        <button class="qh-btn qh-green" id="qhFill">填入</button>
      </div>`);
    const answerText = el(`<textarea class="qh-answer"></textarea>`);
    el(`<div class="qh-status"></div>`);

    document.getElementById("qhCopy").addEventListener("click", () => {
      if (copyText(promptBox.value)) {
        setStatus(`已复制 ${qs.length} 道题，去 AI 聊天框粘贴`, true);
      } else {
        promptBox.focus();
        promptBox.select();
        setStatus("自动复制失败，已全选文本，按 ⌘C / Ctrl+C", false);
      }
    });

    document.getElementById("qhFill").addEventListener("click", () => {
      let answers;
      try {
        answers = parseJsonAnswers(answerText.value)
          .map(a => ({
            index: a.index,
            optionIndexes: a.letters
              .map(c => LETTERS.indexOf(c))
              .filter(oi => qs[a.index - 1] && qs[a.index - 1].options[oi]),
          }))
          .filter(a => a.optionIndexes.length);
      } catch {
        setStatus("解析失败，请粘贴完整的 JSON", false);
        return;
      }
      if (!answers.length) {
        setStatus("没解析出答案，请检查 JSON 内容", false);
        return;
      }
      const filled = fill(answers);
      setStatus(filled === qs.length
        ? `已填入全部 ${filled} 题`
        : `已填入 ${filled}/${qs.length} 题`, filled === qs.length);
    });
  }

  init();
})();
