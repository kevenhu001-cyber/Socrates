/* ─── Exam View Module (standalone page) ───
   Extracted from main.js section "Exam view".
   Cross-module dependencies accessed via window.*
   ============================================================ */

import { esc } from './render/helpers.js';
import { formatMsg } from './render/markdown.js';
import { callAPI } from './chat/api.js';

/* ── module-level state ── */
var _examSelectedTypes = { mc: true, fb: true, sa: false };
var _examDifficulty = "intermediate";
var _examAnswerSaveTimer = null;
var _examSaveInFlight = null;
var _examSaveDirty = false;

/* ── helpers ── */
function _examBody() { return document.getElementById("examViewBody"); }
function _examFooter() { return document.getElementById("examViewFooter"); }
function _examTitle() { return document.getElementById("examViewTitle"); }

/* ── open / close ── */
export function openExamModal() {
  var ev = document.getElementById("examView");
  var others = ["topicSetup", "diagnosticView", "chatView"];
  others.forEach(function (id) { var el = document.getElementById(id); if (el) el.classList.add("hidden"); });
  ev.classList.remove("hidden");
  var tb = document.querySelector(".main > .top-bar"); if (tb) tb.style.display = "none";
  /* Hide the disclaimer that lives in .main-inner so its text
     doesn't peek through under the exam overlay. */
  var disc = document.getElementById("topicDisclaimer");
  if (disc) disc.style.display = "none";
  window.toggleChatTopBarEls(false);
  window.state._examInView = true;
  if (!window.state._examScrollBound) {
    var cont = document.getElementById("examViewBody");
    if (cont) {
      cont.addEventListener("scroll", function () {
        if (window.state._examInView) syncExamNav();
      });
    }
    var sc = document.getElementById("scrollContainer") || document.getElementById("msgScroll");
    if (sc) {
      sc.addEventListener("scroll", function () {
        if (window.state._examInView) syncExamNav();
      });
    }
    window.state._examScrollBound = true;
  }
  renderExamForm();
}

export function closeExamView() {
  var ev = document.getElementById("examView");
  ev.classList.add("hidden");
  var tb = document.querySelector(".main > .top-bar"); if (tb) tb.style.display = "";
  /* Restore disclaimer visibility. */
  var disc = document.getElementById("topicDisclaimer");
  if (disc) disc.style.display = "";
  window.state.examCancel = true;
  window.state._examInView = false;
  window.state.examReadOnly = false;
  try { restoreExamActiveProvider() } catch (_) { }
  if (window.state.currentSessionId) {
    document.getElementById("chatView").classList.remove("hidden");
    window.toggleChatTopBarEls(true);
  } else {
    document.getElementById("topicSetup").classList.remove("hidden");
    window.toggleChatTopBarEls(false);
  }
}

export function closeExamModal() {
  closeExamView();
}

/* ── render form ── */
/* P_exam-ui — redesigned as a clean, ChatGPT-style setup card:
   an intro line, a required Topic field, a Settings card with the model
   dropdown + segmented Difficulty control + a stepper for the question
   count, question-type pills, and an optional instructions box. */
export function renderExamForm() {
  var body = _examBody();
  var footer = _examFooter();
  _examTitle().textContent = (window._currentLang === "zh" ? "生成考卷" : "Generate Exam");
  var meta = document.getElementById("examViewMeta");
  if (meta) meta.textContent = "";
  window.state.examCancel = false;
  window.state.examQuestions = [];
  window.state.examAnswers = {};
  window.state.examSubmitted = false;
  _examSelectedTypes = { mc: true, fb: true, sa: false };
  _examDifficulty = "intermediate";
  var L = function (en, zh) { return window._currentLang === "zh" ? zh : en };

  /* Build provider options for the custom dropdown */
  var provItems = [];
  var activeId = "";
  if (Array.isArray(window.apiConfig.providers)) {
    window.apiConfig.providers.forEach(function (p) {
      if (!p || !p.id) return;
      provItems.push({ id: p.id, label: p.label || p.model || p.id });
      if (p.id === window.apiConfig.activeId) activeId = p.id;
    });
  }
  var activeLabel = activeId
    ? (provItems.find(function (p) { return p.id === activeId }) || {}).label || activeId
    : L("Select a model", "选择模型");

  function togglePill(type, label, isActive) {
    var activeClass = isActive ? ' active' : '';
    return '<button class="exam-form-toggle-card' + activeClass + '" data-type="' + type + '" onclick="toggleExamType(\'' + type + '\')"><span class="tog-dot"></span>' + esc(label) + '</button>';
  }

  /* Difficulty segmented control. Canonical values stay English (models
     understand them); labels localize. */
  var DIFFS = [
    { v: "beginner", label: L("Beginner", "入门") },
    { v: "intermediate", label: L("Intermediate", "中级") },
    { v: "hard", label: L("Hard", "困难") },
    { v: "expert", label: L("Expert", "专家") }
  ];
  var diffHtml = DIFFS.map(function (d) {
    return '<button type="button" class="exam-seg-btn' + (d.v === _examDifficulty ? ' active' : '') +
      '" data-diff="' + d.v + '" onclick="selectExamDifficulty(\'' + d.v + '\')">' + esc(d.label) + '</button>';
  }).join("");

  /* Build custom model dropdown HTML */
  var modelOptsHtml = "";
  provItems.forEach(function (p) {
    modelOptsHtml += '<button class="exam-model-opt' + (p.id === activeId ? ' active' : '') + '" data-mid="' + esc(p.id) + '" onclick="selectExamModel(\'' + esc(p.id) + '\')">' + esc(p.label) + '</button>';
  });
  if (!modelOptsHtml) {
    modelOptsHtml = '<button class="exam-model-opt" disabled style="color:hsl(var(--text-500));cursor:default">' + L("No models available", "无可用模型") + '</button>';
  }

  var html = '<div class="exam-form-container">';

  /* Intro */
  html += '<p class="exam-form-intro">' + L("Set up a practice exam. Adjust the options below, then generate.", "配置一份练习考卷，调整下列选项后开始出题。") + '</p>';

  /* Topic */
  html += '<div class="exam-form-section">'
    + '<div class="exam-form-section-header"><span class="exam-form-section-title">' + window.t("exam.topic") + '</span></div>'
    + '<input class="exam-form-input" id="examTopic" name="examTopic" autocomplete="off" placeholder="' + L("e.g. Linear Algebra, World War II...", "如：线性代数、量子力学、二战…") + '">'
    + '</div>';

  /* Settings: model + difficulty + count */
  html += '<div class="exam-form-section">'
    + '<div class="exam-form-section-header"><span class="exam-form-section-title">' + L("Settings", "出题设置") + '</span></div>'
    /* Model */
    + '<div class="exam-form-field"><label class="exam-form-label" for="examModelTrigger">' + L("Model", "生成模型") + '</label>'
    + '<div class="exam-model-wrap">'
    + '<button class="exam-model-trigger" id="examModelTrigger" type="button" onclick="toggleExamModelMenu()">'
    + '<span class="exam-model-label" id="examModelLabel">' + esc(activeLabel) + '</span>'
    + '<svg class="exam-model-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>'
    + '</button>'
    + '<div class="exam-model-menu" id="examModelMenu">' + modelOptsHtml + '</div>'
    + '<input type="hidden" id="examModel" value="' + esc(activeId) + '">'
    + '</div></div>'
    /* Difficulty + Count share a row on desktop, stack on narrow screens */
    + '<div class="exam-form-row">'
    /* Difficulty */
    + '<div class="exam-form-field"><label class="exam-form-label">' + window.t("exam.difficulty") + '</label>'
    + '<div class="exam-seg" id="examDifficultySeg">' + diffHtml + '</div></div>'
    /* Count */
    + '<div class="exam-form-field"><label class="exam-form-label">' + window.t("exam.count") + '</label>'
    + '<div class="exam-stepper">'
    + '<button type="button" class="exam-stepper-btn" aria-label="' + L("Fewer", "减少") + '" onclick="adjustExamCount(-1)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"/></svg></button>'
    + '<span class="exam-stepper-val" id="examCountDisplay">5</span>'
    + '<button type="button" class="exam-stepper-btn" aria-label="' + L("More", "增加") + '" onclick="adjustExamCount(1)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>'
    + '<input type="hidden" id="examCount" value="5">'
    + '</div></div>'
    + '</div>'
    + '</div>';

  /* Question types */
  html += '<div class="exam-form-section">'
    + '<div class="exam-form-section-header"><span class="exam-form-section-title">' + window.t("exam.types") + '</span></div>'
    + '<div class="exam-form-card-toggles" id="examTypePicker">'
    + togglePill("mc", L("Multiple choice", "选择题"), true)
    + togglePill("fb", L("Fill blank", "填空题"), true)
    + togglePill("sa", L("Short answer", "简答题"), false)
    + '</div></div>';

  /* Instructions */
  html += '<div class="exam-form-section">'
    + '<div class="exam-form-section-header"><span class="exam-form-section-title">' + window.t("exam.instructions") + '</span></div>'
    + '<textarea class="exam-form-textarea" id="examInstructions" name="examInstructions" placeholder="' + L("Specific topics to cover, or leave blank...", "具体说明要覆盖的知识点，留空则由 AI 决定…") + '" rows="3"></textarea>'
    + '</div>';

  html += '</div>';
  body.innerHTML = html;
  footer.innerHTML = '<button class="exam-btn secondary" onclick="closeExamView()">' + window.t("common.cancel") + '</button><button class="exam-btn primary" onclick="startExamGeneration()">' + window.t("exam.generate") + '</button>';
}

/* ── Custom model dropdown ── */
export function toggleExamModelMenu() {
  var menu = document.getElementById("examModelMenu");
  var trigger = document.getElementById("examModelTrigger");
  if (!menu) return;
  var isOpen = menu.classList.contains("open");
  /* Close all exam-model-menus first */
  document.querySelectorAll(".exam-model-menu").forEach(function (m) { m.classList.remove("open"); });
  document.querySelectorAll(".exam-model-trigger").forEach(function (t) { t.classList.remove("open"); });
  if (!isOpen) {
    menu.classList.add("open");
    if (trigger) trigger.classList.add("open");
    /* Click outside to close */
    setTimeout(function () {
      function onDoc(e) {
        if (!e.target.closest(".exam-model-wrap")) {
          menu.classList.remove("open");
          if (trigger) trigger.classList.remove("open");
          document.removeEventListener("click", onDoc, true);
        }
      }
      document.addEventListener("click", onDoc, true);
    }, 0);
  }
}

export function selectExamModel(id) {
  var input = document.getElementById("examModel");
  var label = document.getElementById("examModelLabel");
  var opts = document.querySelectorAll(".exam-model-opt");
  if (input) input.value = id;
  opts.forEach(function (o) {
    o.classList.toggle("active", o.dataset.mid === id);
    if (o.dataset.mid === id && label) label.textContent = o.textContent;
  });
  /* Close menu */
  var menu = document.getElementById("examModelMenu");
  var trigger = document.getElementById("examModelTrigger");
  if (menu) menu.classList.remove("open");
  if (trigger) trigger.classList.remove("open");
}

export function toggleExamType(type) {
  var btn = document.querySelector('.exam-form-toggle-card[data-type="' + type + '"]');
  if (!btn) return;
  var countActive = document.querySelectorAll('.exam-form-toggle-card.active').length;
  if (btn.classList.contains("active") && countActive <= 1) return;
  btn.classList.toggle("active");
  _examSelectedTypes[type] = btn.classList.contains("active");
}

/* Difficulty segmented control — pick one value and highlight it. */
export function selectExamDifficulty(val) {
  _examDifficulty = val;
  document.querySelectorAll("#examDifficultySeg .exam-seg-btn").forEach(function (b) {
    b.classList.toggle("active", b.getAttribute("data-diff") === val);
  });
}

/* Question-count stepper — clamp to 1..50 and mirror to the hidden input
   that startExamGeneration reads. */
export function adjustExamCount(delta) {
  var input = document.getElementById("examCount");
  var display = document.getElementById("examCountDisplay");
  var cur = parseInt(input && input.value, 10);
  if (!(cur >= 1)) cur = 5;
  var next = Math.max(1, Math.min(50, cur + delta));
  if (input) input.value = String(next);
  if (display) display.textContent = String(next);
}

function detectExamLang(topic) {
  if (!topic) return "English";
  if (/[一-鿿]/.test(topic)) return "Chinese";
  if (/[぀-ゟ゠-ヿ]/.test(topic)) return "Japanese";
  if (/[가-힯]/.test(topic)) return "Korean";
  if (/[Ѐ-ӿ]/.test(topic)) return "Russian";
  if (/[؀-ۿ]/.test(topic)) return "Arabic";
  if (/[ऀ-ॿ]/.test(topic)) return "Hindi";
  if (/[Ͱ-Ͽ]/.test(topic)) return "Greek";
  if (/[֐-׿]/.test(topic)) return "Hebrew";
  if (/[฀-๿]/.test(topic)) return "Thai";
  return "English";
}

export function startExamGeneration() {
  var topic = document.getElementById("examTopic").value.trim();
  if (!topic) { document.getElementById("examTopic").focus(); return; }
  /* P_exam-noprovider — 생성 전에 활성 모델이 있는지 확인. 없으면 로딩만 보여주고 실패하는 것보다 여기서 바로 알림. */
  var _activeProvider = typeof window.getActiveProvider === "function" ? window.getActiveProvider() : null;
  if (!_activeProvider) {
    var _lang = detectExamLang(topic);
    var _msg = _lang === "Chinese" ? "请先在设置中添加并选择一个模型" : "Add and select a model in Settings first";
    var body = _examBody();
    if (body) body.innerHTML = '<div class="exam-empty" style="padding:40px;text-align:center;color:hsl(var(--text-500))">' + window.esc(_msg) + '</div>';
    var footer = _examFooter();
    if (footer) footer.innerHTML = '<button class="exam-btn primary" onclick="renderExamForm()">' + (_lang === "Chinese" ? "返回" : "Back") + '</button>';
    return;
  }
  var count = Math.max(1, Math.min(50, parseInt(document.getElementById("examCount").value, 10) || 5));
  var difficulty = _examDifficulty || "intermediate";
  var instructions = document.getElementById("examInstructions").value.trim() || "";
  var modelSel = document.getElementById("examModel");
  var chosenModel = modelSel ? modelSel.value : "";
  var types = [];
  if (_examSelectedTypes.mc) types.push("multiple-choice");
  if (_examSelectedTypes.fb) types.push("fill-blank");
  if (_examSelectedTypes.sa) types.push("short-answer");
  if (!types.length) { types = ["multiple-choice", "fill-blank", "short-answer"]; }
  var typeStr = types.join(", ");
  var lang = detectExamLang(topic);
  window.state.examCancel = false;
  window.state.examQuestions = [];
  window.state.examAnswers = {};
  window.state.examSubmitted = false;
  window.state.examTopic = topic;
  window.state.examCount = count;
  window.state.examLang = lang;
  window.state.examDifficulty = difficulty;
  window.state.examInstructions = instructions;
  window.state.examTypes = types.slice();
  window.state._examPrevActiveId = window.apiConfig.activeId;
  if (chosenModel && Array.isArray(window.apiConfig.providers)) {
    var chosenProv = window.apiConfig.providers.find(function (p) { return p && p.id === chosenModel; });
    if (chosenProv) {
      window.apiConfig.activeId = chosenModel;
      /* The built-in Beagle provider (id "beagle-built-in") is a client-only
         pseudo-provider — it has no DB row, so its id is not a UUID. Sending a
         PATCH /api/api-key/beagle-built-in hits the server's UUID guard and
         404s (harmless but noisy). Activation for the built-in is purely a
         client-side apiConfig.activeId change; only persist for real DB rows. */
      if (!chosenProv.isBuiltIn && chosenModel !== "beagle-built-in") {
        try { window.apiFetch("/api/api-key/" + encodeURIComponent(chosenModel), { method: "PATCH", body: { isActive: true } }).catch(function () { }) } catch (_) { }
      }
    }
  }
  _examTitle().textContent = topic;
  var meta = document.getElementById("examViewMeta");
  var provLabel = (Array.isArray(window.apiConfig.providers) ? window.apiConfig.providers.find(function (p) { return p && p.id === window.apiConfig.activeId }) : null) || {};
  if (meta) meta.textContent = count + " " + (lang === "Chinese" ? "题 · " : "questions · ") + (provLabel.label || provLabel.model || "") + " · " + difficulty;
  var body = _examBody();
  body.innerHTML = '<div class="exam-loading" id="examGenStatus">' +
    '<span class="loading"><span></span><span></span><span></span></span>' +
    '<div class="exam-loading-msg" id="examGenMsg">' + (lang === "Chinese" ? "正在生成考卷…" : "Generating your exam…") + '</div>' +
    '<div class="exam-progress"><div class="exam-progress-bar"><div class="exam-progress-fill" id="examGenProgressFill"></div></div>' +
    '<div class="exam-progress-step" id="examGenProgressStep"><span class="exam-progress-spin"></span>' + (lang === "Chinese" ? "准备出题…" : "Preparing…") + '</div></div>' +
    '<div class="exam-loading-sub" id="examGenSubMsg">' + (lang === "Chinese" ? "AI 正在为您出题，请稍候片刻" : "The AI is preparing your questions — this usually takes a few seconds.") + '</div>' +
    '</div>';
  _examFooter().innerHTML = '<button class="exam-btn secondary" onclick="cancelExamGeneration()">' + (lang === "Chinese" ? "取消" : "Cancel") + '</button>';
  generateAllQuestions(topic, count, difficulty, typeStr, instructions, lang);
}

function restoreExamActiveProvider() {
  var prev = window.state._examPrevActiveId;
  if (!prev) return;
  if (window.apiConfig.activeId === prev) return;
  var prevProv = Array.isArray(window.apiConfig.providers) ? window.apiConfig.providers.find(function (p) { return p && p.id === prev }) : null;
  if (prevProv) {
    window.apiConfig.activeId = prev;
    /* Skip the PATCH for the built-in provider — its id isn't a UUID and the
       server would 404. See startExamGeneration for the full rationale. */
    if (!prevProv.isBuiltIn && prev !== "beagle-built-in") {
      try { window.apiFetch("/api/api-key/" + encodeURIComponent(prev), { method: "PATCH", body: { isActive: true } }).catch(function () { }) } catch (_) { }
    }
  }
  window.state._examPrevActiveId = null;
}

export function cancelExamGeneration() {
  window.state.examCancel = true;
  restoreExamActiveProvider();
  var body = _examBody();
  var lang = window.state.examLang || "English";
  var L = function (en, zh) { return lang === "Chinese" ? zh : en };
  body.innerHTML = '<div class="exam-empty">' + (L("已取消出题", "Generation cancelled") + '.</div>');
  _examFooter().innerHTML = '<button class="exam-btn primary" onclick="renderExamForm()">' + L("重新出题", "Try again") + '</button><button class="exam-btn secondary" onclick="closeExamView()">' + L("关闭", "Close") + '</button>';
  _examTitle().textContent = L("已取消", "Cancelled");
}

async function generateAllQuestions(topic, count, difficulty, typeStr, instructions, lang) {
  var allowedTypes = typeStr.split(", ");
  var questions = [];
  var previousTexts = [];

  function updateProgress(i, msg) {
    var fill = document.getElementById("examGenProgressFill");
    var stepEl = document.getElementById("examGenProgressStep");
    var subEl = document.getElementById("examGenSubMsg");
    var pct = count > 0 ? Math.round(92 * i / count) : 0;
    if (fill) fill.style.width = pct + "%";
    if (stepEl) stepEl.innerHTML = '<span class="exam-progress-spin"></span>' + msg;
    if (subEl && i < count) {
      subEl.textContent = lang === "Chinese"
        ? "正在生成第 " + (i + 1) + " / " + count + " 题…"
        : "Generating question " + (i + 1) + " of " + count + "…";
    }
  }

  function failExam(errMsg, detail) {
    restoreExamActiveProvider();
    var bodyE = _examBody();
    bodyE.innerHTML = '<div class="exam-empty"><strong>' + esc(errMsg) + '</strong>' + (detail ? '<div style="margin-top:10px;font-size:13px;color:hsl(var(--text-500));line-height:1.5">' + esc(detail) + '</div>' : '') + '</div>';
    _examFooter().innerHTML = '<button class="exam-btn primary" onclick="renderExamForm()">' + (lang === "Chinese" ? "重新出题" : "Try again") + '</button><button class="exam-btn secondary" onclick="closeExamView()">' + (lang === "Chinese" ? "关闭" : "Close") + '</button>';
  }

  for (var i = 0; i < count; i++) {
    if (window.state.examCancel) { restoreExamActiveProvider(); return; }
    var qType = allowedTypes[i % allowedTypes.length] || "multiple-choice";
    updateProgress(i, lang === "Chinese"
      ? "正在生成第 " + (i + 1) + " 题…"
      : "Generating question " + (i + 1) + "…");

    var prevBlock = previousTexts.length
      ? "Already generated:\n" + previousTexts.map(function (t, idx) { return (idx + 1) + ". " + t }).join("\n")
      : "This is the first question.";

    var prompt = "Generate ONE exam question as a JSON object.\n" +
      "Topic: " + topic + ".\n" +
      "Difficulty: " + difficulty + ".\n" +
      "Question type: " + qType + ".\n" +
      "Language: " + lang + ".\n" +
      "This is question " + (i + 1) + " of " + count + ".\n" +
      "CRITICAL: EVERY field (q, opts[*].text, answer, answers[*], explanation) MUST be written in " + lang + ".\n" +
      "Return ONLY the JSON — no markdown, no preamble, no commentary.\n" +
      "The question object must have: q (string), type (\"" + qType + "\").\n" +
      "For multiple-choice add opts:[{letter,text}] (4 options A-D) and answer (correct letter).\n" +
      "For fill-blank add answers:[string] (acceptable fills).\n" +
      "For short-answer add answer (key facts).\n" +
      "Always add explanation (string). Use Markdown + $LaTeX$ in q text.\n\n" +
      (instructions ? "Specifics: " + instructions + "\n" : "") +
      "Previously generated questions (DO NOT repeat the same topic angle):\n" + prevBlock;
    var msgs = [{ role: "system", content: prompt }, { role: "user", content: "Generate question " + (i + 1) + " now." }];
    /* Use the same token policy as the main chat (window.MAX_TOKENS_CHAT,
       normally undefined) so we honour the system-configured model default
       instead of hardcoding a cap. A hardcoded small cap (600) let reasoning
       models spend the whole budget on hidden chain-of-thought and return
       empty content ("模型无响应"); a hardcoded large cap (8000) forced long
       non-streaming generations that tripped the CDN's 524 origin timeout.
       Omitting max_tokens lets the model emit its short answer JSON and stop
       naturally (finish_reason=stop). */
    var tokens = window.MAX_TOKENS_CHAT;
    var result = await callAPI(msgs, tokens);
    if (window.state.examCancel) return;
    var text = typeof result === "string" ? result : (result && (result.text || result.content)) || "";
    if (!text || !text.trim()) {
      var errReason = window.state.lastCallError || (lang === "Chinese" ? "模型无响应" : "no response");
      if (i === 0) {
        failExam(lang === "Chinese" ? "生成失败：模型无响应" : "Generation failed — no response", errReason);
        return;
      }
      updateProgress(i, lang === "Chinese" ? "生成失败" : "Failed");
      await new Promise(function (r) { setTimeout(r, 300) });
      continue;
    }
    var q = parseSingleExamQuestion(text);
    if (!q) {
      if (i === 0) {
        failExam(lang === "Chinese" ? "解析失败：模型返回格式异常" : "Parse failed — unexpected format", lang === "Chinese" ? "请重试或更换模型" : "Try again or switch model");
        return;
      }
      updateProgress(i, lang === "Chinese" ? "解析失败" : "Parse failed");
      await new Promise(function (r) { setTimeout(r, 300) });
      continue;
    }
    q._idx = questions.length;
    questions.push(q);
    previousTexts.push(q.q);
  }
  restoreExamActiveProvider();
  if (window.state.examCancel) return;
  questions.forEach(function (q) {
    window.state.examQuestions.push(q);
  });
  if (window.state.examQuestions.length === 0) {
    failExam(lang === "Chinese" ? "生成失败：没有成功生成任何题目" : "Generation failed — no questions");
    return;
  }
  renderAllQuestions();
  finishExamGeneration();
}

export function parseSingleExamQuestion(text) {
  try {
    var raw = String(text || "").replace(/```(?:json|JSON)?\s*/g, "").replace(/\s*```/g, "").replace(/<(?:thinking|think)>[\s\S]*?(<\/(?:thinking|think)>|$)/gi, "").replace(/\[(?:thinking|think)\][\s\S]*?(\[\/(?:thinking|think)\]|$)/gi, "").trim();
    var idx = 0, end = raw.lastIndexOf("}");
    if (end < 0) return null;
    while (idx <= end) {
      var start = raw.indexOf("{", idx);
      if (start < 0 || start >= end) return null;
      var jsonStr = raw.slice(start, end + 1);
      try {
        var parsed = JSON.parse(jsonStr);
        if (parsed && typeof parsed.q === "string" && parsed.type) {
          if (parsed.type !== "multiple-choice" && parsed.type !== "fill-blank" && parsed.type !== "short-answer") parsed.type = "fill-blank";
          if (!parsed.explanation) parsed.explanation = "";
          return parsed;
        }
      } catch (_) { }
      idx = start + 1;
    }
    return null;
  } catch (_) { return null }
}

export function parseExamArrayJSON(text) {
  if (!text || typeof text !== "string") return null;
  var clean = text.replace(/```(?:json|JSON)?\s*/g, "").replace(/\s*```/g, "").replace(/<(?:thinking|think)>[\s\S]*?(<\/(?:thinking|think)>|$)/gi, "").replace(/\[(?:thinking|think)\][\s\S]*?(\[\/(?:thinking|think)\]|$)/gi, "").trim();
  try {
    var direct = JSON.parse(clean);
    if (direct && Array.isArray(direct.questions)) return direct;
    if (Array.isArray(direct)) return { questions: direct };
  } catch (_) { }
  function findBalanced(s, openCh, closeCh) {
    var start = -1, depth = 0, inStr = false, escape = false, quote = null;
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (inStr) {
        if (escape) { escape = false; continue }
        if (ch === "\\") { escape = true; continue }
        if (ch === quote) { inStr = false; quote = null }
        continue;
      }
      if (ch === '"' || ch === "'") { inStr = true; quote = ch; continue }
      if (ch === openCh) {
        if (depth === 0) start = i;
        depth++;
      } else if (ch === closeCh) {
        depth--;
        if (depth === 0 && start >= 0) return s.slice(start, i + 1);
      }
    }
    return null;
  }
  var objSlice = findBalanced(clean, "{", "}");
  if (objSlice) {
    try {
      var parsed = JSON.parse(objSlice);
      if (parsed && Array.isArray(parsed.questions)) return parsed;
      if (Array.isArray(parsed)) return { questions: parsed };
    } catch (_) { }
  }
  var arrSlice = findBalanced(clean, "[", "]");
  if (arrSlice) {
    try {
      var arr = JSON.parse(arrSlice);
      if (Array.isArray(arr)) return { questions: arr };
    } catch (_) { }
  }
  console.warn("[exam] parseExamArrayJSON failed. Raw response (first 800 chars):", text.slice(0, 800));
  return null;
}

export function renderAllQuestions() {
  var body = _examBody();
  if (!body) return;
  body.innerHTML = '<div id="examQuestionsContainer"></div>';
  var cont = document.getElementById("examQuestionsContainer");
  if (!cont) return;
  window.state.examQuestions.forEach(function (q, idx) {
    var ph = document.createElement("div");
    ph.className = "exam-q-card";
    ph.id = "examQ" + idx;
    cont.appendChild(ph);
    paintQuestionCard(idx, q, ph);
  });
}

export function paintQuestionCard(idx, q, container) {
  var html = '<div class="exam-q-num">Question ' + (idx + 1) + ' of ' + window.state.examQuestions.length + ' <span class="exam-q-type">' + q.type + '</span></div>';
  html += '<div class="exam-q-text">' + formatMsg(q.q) + '</div>';
  if (q.type === "multiple-choice" && q.opts) {
    html += '<div class="exam-q-opts">';
    q.opts.forEach(function (o, oi) {
      html += '<button class="exam-q-opt" data-eidx="' + idx + '" data-oidx="' + oi + '" onclick="selectExamOpt(' + idx + ',' + oi + ')">';
      html += '<span class="exam-q-opt-letter">' + o.letter + '</span>';
      html += '<span class="exam-q-opt-text">' + formatMsg(o.text) + '</span>';
      html += '</button>';
    });
    html += '</div>';
  } else if (q.type === "fill-blank") {
    html += '<input class="exam-q-fill-input" data-eidx="' + idx + '" name="examAnswer' + idx + '" aria-label="Answer for question ' + (idx + 1) + '" placeholder="' + (window.state.examLang === "Chinese" ? "输入你的答案…" : "Type your answer…") + '" oninput="window.state.examAnswers[' + idx + ']=this.value;refreshExamNavTally();scheduleExamAnswerSave()">';
  } else if (q.type === "short-answer") {
    html += '<textarea class="exam-q-fill-input" data-eidx="' + idx + '" name="examAnswer' + idx + '" aria-label="Answer for question ' + (idx + 1) + '" placeholder="' + (window.state.examLang === "Chinese" ? "输入你的答案…" : "Type your answer…") + '" rows="3" oninput="window.state.examAnswers[' + idx + ']=this.value;refreshExamNavTally();scheduleExamAnswerSave()" style="min-height:80px;resize:vertical"></textarea>';
  }
  container.innerHTML = html;
}

export function replaceStreamingCardWithQuestion(i, q) {
  var ph = document.getElementById("examQ" + i);
  if (!ph) return;
  paintQuestionCard(q._idx, q, ph);
  renderExamNav();
}

export function appendExamErrorCard(i, msg) {
  var ph = document.createElement("div");
  ph.className = "exam-q-card";
  ph.id = "examQ" + i;
  ph.innerHTML = '<div class="exam-q-num">Question ' + (i + 1) + ' — <span class="exam-result-wrong">Failed</span></div><div class="exam-q-text" style="color:hsl(0 60% 55%)">' + esc(msg) + '</div>';
  window.state.examQuestions.push({ q: "[failed]", type: "error", explanation: "", _idx: i });
  var cont = document.getElementById("examQuestionsContainer");
  if (cont) cont.appendChild(ph);
  renderExamNav();
}

export function selectExamOpt(qidx, oidx) {
  if (window.state.examSubmitted) return;
  window.state.examAnswers[qidx] = oidx;
  var btns = document.querySelectorAll('.exam-q-opt[data-eidx="' + qidx + '"]');
  btns.forEach(function (b, i) { b.classList.toggle("selected", i === oidx); });
  renderExamNav();
  saveExamSession();
}

export function finishExamGeneration() {
  var st = document.getElementById("examGenStatus");
  if (st) st.style.display = "none";
  var valid = window.state.examQuestions.filter(function (q) { return q.type !== "error"; });
  var footer = _examFooter();
  if (window.state.examCancel) {
    footer.innerHTML = '<button class="exam-btn primary" onclick="renderExamForm()">Start New Exam</button><button class="exam-btn secondary" onclick="closeExamView()">Close</button>';
    renderExamNav();
    return;
  }
  if (valid.length > 0) {
    footer.innerHTML = '<button class="exam-btn primary" onclick="submitExam()">Submit for Grading</button><button class="exam-btn secondary" onclick="closeExamView()">Close</button>';
  } else {
    footer.innerHTML = '<button class="exam-btn primary" onclick="renderExamForm()">Try Again</button><button class="exam-btn secondary" onclick="closeExamView()">Close</button>';
  }
  renderExamNav();
  saveExamSession({ submitted: false });
}

function renderExamNav() {
  if (!window.state._examInView) return;
  var body = _examBody();
  if (!body) return;
  var existing = document.getElementById("examNavBar");
  if (existing) existing.parentNode.removeChild(existing);
  var total = window.state.examQuestions.length;
  if (total === 0) return;
  var isSubmitted = !!window.state.examSubmitted;
  var answeredKeys = Object.keys(window.state.examAnswers || {}).filter(function (k) {
    var v = window.state.examAnswers[k];
    if (v === undefined || v === null) return false;
    if (typeof v === "string") return v.trim().length > 0;
    return true;
  });
  var answered = answeredKeys.length;
  var lang = window.state.examLang || "English";
  var L = function (en, zh) { if (lang === "Chinese") return zh; return en; };
  var html = '<div class="exam-nav-bar" id="examNavBar" style="display:flex;">';
  html += '<button class="exam-nav-btn" id="examNavPrev" onclick="examNavStep(-1)" aria-label="Previous question">‹</button>';
  html += '<div class="exam-nav-counter" id="examNavCounter">';
  html += '<span class="exam-nav-current" id="examNavCurrent">1</span>';
  html += '<span class="exam-nav-sep">/</span>';
  html += '<span class="exam-nav-total">' + total + '</span>';
  if (!isSubmitted) {
    html += '<span class="exam-nav-progress" id="examNavProgress">· ' + answered + ' ' + L("answered", "已答") + '</span>';
  }
  html += '</div>';
  html += '<button class="exam-nav-btn" id="examNavNext" onclick="examNavStep(1)" aria-label="Next question">›</button>';
  html += '</div>';
  html += '<div class="exam-nav-pills" id="examNavPills">';
  for (var j = 0; j < total; j++) {
    var isAns = answeredKeys.indexOf(String(j)) >= 0;
    var isCur = (j === examNavCurrentIdx());
    var cls = "exam-nav-pill" + (isCur ? " current" : "") + (isAns ? " answered" : "");
    var lbl = (j + 1) + (isAns ? " \u00B7" : "");
    html += '<button class="' + cls + '" data-nav-idx="' + j + '" onclick="examNavJump(' + j + ')">' + lbl + '</button>';
  }
  html += '</div>';
  var first = body.firstChild;
  var navWrap = document.createElement("div");
  navWrap.innerHTML = html;
  while (navWrap.firstChild) body.insertBefore(navWrap.firstChild, first);
  syncExamNav();
}

function examNavCurrentIdx() {
  var cont = document.getElementById("examQuestionsContainer");
  if (!cont) return 0;
  var cards = cont.querySelectorAll(".exam-q-card[id^='examQ']");
  if (!cards.length) return 0;
  var closest = 0, bestDist = Infinity;
  var top0 = cont.getBoundingClientRect().top;
  cards.forEach(function (c, i) {
    var d = Math.abs(c.getBoundingClientRect().top - top0);
    if (d < bestDist) { bestDist = d; closest = i; }
  });
  return closest;
}

export function examNavJump(idx) {
  var el = document.getElementById("examQ" + idx);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  setTimeout(syncExamNav, 300);
}

export function examNavStep(dir) {
  var i = examNavCurrentIdx();
  var total = window.state.examQuestions.length;
  if (total === 0) return;
  var next = Math.max(0, Math.min(total - 1, i + dir));
  examNavJump(next);
}

function syncExamNav() {
  var i = examNavCurrentIdx();
  var total = window.state.examQuestions.length;
  var cur = document.getElementById("examNavCurrent");
  if (cur) cur.textContent = (i + 1);
  var prev = document.getElementById("examNavPrev");
  var next = document.getElementById("examNavNext");
  if (prev) prev.disabled = (i <= 0);
  if (next) next.disabled = (i >= total - 1);
  var pills = document.querySelectorAll("#examNavPills .exam-nav-pill");
  pills.forEach(function (p, j) {
    p.classList.toggle("current", j === i);
  });
}

export function refreshExamNavTally() {
  var total = window.state.examQuestions.length;
  if (total === 0) return;
  var answered = Object.keys(window.state.examAnswers || {}).filter(function (k) {
    var v = window.state.examAnswers[k];
    if (v === undefined || v === null) return false;
    if (typeof v === "string") return v.trim().length > 0;
    return true;
  });
  var prog = document.getElementById("examNavProgress");
  if (prog) {
    var lang = window.state.examLang || "English";
    prog.textContent = "· " + answered.length + " " + (lang === "Chinese" ? "已答" : "answered");
  }
  var pills = document.querySelectorAll("#examNavPills .exam-nav-pill");
  pills.forEach(function (p) {
    var j = parseInt(p.getAttribute("data-nav-idx"), 10);
    var isAns = answered.indexOf(String(j)) >= 0;
    p.classList.toggle("answered", isAns);
    if (isAns && p.textContent.indexOf("\u00B7") < 0) p.textContent = (j + 1) + " \u00B7";
  });
}

export function scheduleExamAnswerSave() {
  if (_examAnswerSaveTimer) clearTimeout(_examAnswerSaveTimer);
  _examAnswerSaveTimer = setTimeout(function () {
    _examAnswerSaveTimer = null;
    saveExamSession();
  }, 800);
}

export function submitExam() {
  var qs = window.state.examQuestions;
  var ans = window.state.examAnswers;
  var validQs = qs.filter(function (q) { return q.type !== "error"; });
  if (!validQs.length) return;
  var missing = [];
  validQs.forEach(function (q, i) {
    if (q.type === "multiple-choice" && ans[i] === undefined) missing.push(i + 1);
    if ((q.type === "fill-blank" || q.type === "short-answer") && (!ans[i] || String(ans[i]).trim() === "")) missing.push(i + 1);
  });
  if (missing.length) {
    var el = document.querySelector('.exam-q-card#examQ' + (missing[0] - 1));
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  window.state.examSubmitted = true;
  saveExamSession({ submitted: true });
  renderExamResults();
}

function saveExamSession(opts) {
  if (!window.CURRENT_USER) return;
  if (!window.state.examTopic) return;
  if (!window.state._examInView) return;
  if (window.state.examReadOnly) return;
  opts = opts || {};
  if (_examSaveInFlight) {
    _examSaveDirty = true;
    return;
  }
  _examSaveDirty = false;
  doSaveExamSession(opts);
}

function doSaveExamSession(opts) {
  var body = {
    kind: "exam",
    topic: window.state.examTopic,
    title: window.state.examTopic,
    domain: window.state.examTopic,
    mode: "chat",
    phase: "chat",
    examData: {
      topic: window.state.examTopic,
      difficulty: window.state.examDifficulty || "intermediate",
      count: window.state.examCount,
      lang: window.state.examLang || "English",
      types: Array.isArray(window.state.examTypes) ? window.state.examTypes : [],
      questions: window.state.examQuestions.map(function (q) {
        var c = { q: q.q, type: q.type, explanation: q.explanation || "" };
        if (q.opts) c.opts = q.opts;
        if (q.answer !== undefined) c.answer = q.answer;
        if (q.answers) c.answers = q.answers;
        return c;
      }),
      answers: window.state.examAnswers || {},
      submitted: !!window.state.examSubmitted,
      generatedAt: Date.now(),
    },
  };
  if (window.state.currentSessionId) {
    body.id = window.state.currentSessionId;
  }
  _examSaveInFlight = window.apiFetch("/api/sessions", { method: "POST", body: body })
    .then(function (r) {
      if (r && r.id) {
        window.state.currentSessionId = r.id;
        try { window.pushChatIdToURL(r.id) } catch (_) { }
      }
      return window.refreshServerSessions().then(function () {
        try { window.renderRecents() } catch (_) { }
        try { window.toggleShareBtn() } catch (_) { }
      });
    })
    .catch(function (e) {
      console.warn("[exam] save failed:", e && e.message);
    })
    .then(function () {
      _examSaveInFlight = null;
      if (_examSaveDirty) {
        _examSaveDirty = false;
        doSaveExamSession({});
      }
    });
}

export function renderExamResults() {
  var qs = window.state.examQuestions;
  var ans = window.state.examAnswers;
  var body = _examBody();
  var footer = _examFooter();
  _examTitle().textContent = "Exam Results: " + window.state.examTopic;
  var correct = 0, total = 0;
  var resultDetails = [];
  qs.forEach(function (q, i) {
    if (q.type === "error") return;
    total++;
    var isCorrect = false;
    if (q.type === "multiple-choice") {
      var sel = ans[i];
      if (sel !== undefined && q.opts && q.opts[sel]) isCorrect = q.opts[sel].letter === q.answer;
    } else if (q.type === "fill-blank") {
      var ua = String(ans[i] || "").trim().toLowerCase();
      isCorrect = (q.answers || []).some(function (a) { return ua === String(a).trim().toLowerCase(); });
    } else if (q.type === "short-answer") {
      var ua = String(ans[i] || "").trim().toLowerCase();
      var expected = String(q.answer || "").trim().toLowerCase();
      var keywords = expected.split(/[,\s]+/).filter(function (k) { return k.length > 3 });
      isCorrect = keywords.length === 0 || keywords.some(function (k) { return ua.indexOf(k) >= 0; });
    }
    if (isCorrect) correct++;
    resultDetails.push({ q: q, ans: ans[i], isCorrect: isCorrect });
  });
  var pct = total > 0 ? Math.round(correct / total * 100) : 0;
  var html = '<div class="exam-score"><div class="exam-score-val"><span class="score-correct">' + correct + '</span><span class="score-total">/ ' + total + '</span></div><div class="exam-score-lbl">' + pct + '% correct</div></div>';
  resultDetails.forEach(function (rd, i) {
    var q = rd.q;
    var isCorrect = rd.isCorrect;
    var cls = isCorrect ? "correct" : "wrong";
    html += '<div class="exam-q-card">';
    html += '<div class="exam-q-num">Question ' + (i + 1) + ' — <span class="exam-result-' + (isCorrect ? "correct" : "wrong") + '">' + (isCorrect ? "Correct" : "Incorrect") + '</span><span class="exam-q-type">' + q.type + '</span></div>';
    html += '<div class="exam-q-text">' + formatMsg(q.q) + '</div>';
    if (q.type === "multiple-choice" && q.opts) {
      html += '<div class="exam-q-opts">';
      q.opts.forEach(function (o, oi) {
        var selected = rd.ans === oi;
        var isAns = o.letter === q.answer;
        var oc = "exam-q-opt";
        if (isAns) oc += " correct";
        if (selected && !isAns) oc += " wrong";
        if (selected) oc += " selected";
        html += '<div class="' + oc + '"><span class="exam-q-opt-letter">' + o.letter + '</span><span class="exam-q-opt-text">' + formatMsg(o.text) + '</span></div>';
      });
      html += '</div>';
    } else if (q.type === "fill-blank") {
      var ic = "exam-q-fill-input" + (isCorrect ? " correct" : " wrong");
      html += '<input class="' + ic + '" value="' + esc(rd.ans || "") + '" readonly>';
      if (!isCorrect) html += '<div style="font-size:calc(12px * var(--app-font-scale, 1));color:hsl(145 40% 45%);margin-top:4px">Correct answer: <strong>' + (q.answers || []).join(", ") + '</strong></div>';
    } else if (q.type === "short-answer") {
      var ic = "exam-q-fill-input" + (isCorrect ? " correct" : " wrong");
      html += '<textarea class="' + ic + '" readonly rows="2">' + esc(rd.ans || "") + '</textarea>';
      if (!isCorrect) html += '<div style="font-size:calc(12px * var(--app-font-scale, 1));color:hsl(145 40% 45%);margin-top:4px">Expected: <strong>' + esc(q.answer || "") + '</strong></div>';
    }
    if (q.explanation) {
      html += '<div class="exam-q-result ' + cls + '"><span class="label">Explanation:</span><div class="explain">' + formatMsg(q.explanation) + '</div></div>';
    }
    html += '</div>';
  });
  body.innerHTML = html;
  footer.innerHTML = '<button class="exam-btn success" onclick="renderExamForm()">New Exam</button><button class="exam-btn secondary" onclick="closeExamView()">Close</button>';
}


export {
  renderExamNav,
  examNavCurrentIdx,
  syncExamNav,
  saveExamSession,
  doSaveExamSession,
};
