import { prefersReducedMotion } from '../ui/motion.js';

function _examBody() { return document.getElementById('examViewBody'); }
function _examUiL(en, zh) { return window._currentLang === 'zh' ? zh : en; }

export function renderExamNav() {
  if (!window.stateStore.read("_examInView")) return;
  var body = _examBody();
  if (!body) return;
  var existing = document.getElementById("examNavBar");
  if (existing) existing.parentNode.removeChild(existing);
  var total = window.stateStore.read("examQuestions").length;
  if (total === 0) return;
  var isSubmitted = !!window.stateStore.read("examSubmitted");
  var answeredKeys = Object.keys(window.stateStore.read("examAnswers") || {}).filter(function (k) {
    var v = window.stateStore.read("examAnswers")[k];
    if (v === undefined || v === null) return false;
    if (typeof v === "string") return v.trim().length > 0;
    return true;
  });
  var answered = answeredKeys.length;
  var L = _examUiL;
  var html = '<div class="exam-nav-bar" id="examNavBar" style="display:flex;">';
  html += '<button class="exam-nav-btn" id="examNavPrev" data-exam-command="nav-step" data-delta="-1" aria-label="' + L("Previous question", "上一题") + '">‹</button>';
  html += '<div class="exam-nav-counter" id="examNavCounter">';
  html += '<span class="exam-nav-current" id="examNavCurrent">1</span>';
  html += '<span class="exam-nav-sep">/</span>';
  html += '<span class="exam-nav-total">' + total + '</span>';
  if (!isSubmitted) {
    html += '<span class="exam-nav-progress" id="examNavProgress">· ' + answered + ' ' + L("answered", "已答") + '</span>';
  }
  html += '</div>';
  html += '<button class="exam-nav-btn" id="examNavNext" data-exam-command="nav-step" data-delta="1" aria-label="' + L("Next question", "下一题") + '">›</button>';
  html += '</div>';
  html += '<div class="exam-nav-pills" id="examNavPills">';
  for (var j = 0; j < total; j++) {
    var isAns = answeredKeys.indexOf(String(j)) >= 0;
    var isCur = (j === examNavCurrentIdx());
    var cls = "exam-nav-pill" + (isCur ? " current" : "") + (isAns ? " answered" : "");
    var lbl = (j + 1) + (isAns ? " \u00B7" : "");
    html += '<button class="' + cls + '" data-nav-idx="' + j + '" data-exam-command="nav-jump">' + lbl + '</button>';
  }
  html += '</div>';
  var first = body.firstChild;
  var navWrap = document.createElement("div");
  navWrap.innerHTML = html;
  while (navWrap.firstChild) body.insertBefore(navWrap.firstChild, first);
  syncExamNav();
}

export function examNavCurrentIdx() {
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
  el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  setTimeout(syncExamNav, 300);
}

export function examNavStep(dir) {
  var i = examNavCurrentIdx();
  var total = window.stateStore.read("examQuestions").length;
  if (total === 0) return;
  var next = Math.max(0, Math.min(total - 1, i + dir));
  examNavJump(next);
}

export function syncExamNav() {
  var i = examNavCurrentIdx();
  var total = window.stateStore.read("examQuestions").length;
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
  var total = window.stateStore.read("examQuestions").length;
  if (total === 0) return;
  var answered = Object.keys(window.stateStore.read("examAnswers") || {}).filter(function (k) {
    var v = window.stateStore.read("examAnswers")[k];
    if (v === undefined || v === null) return false;
    if (typeof v === "string") return v.trim().length > 0;
    return true;
  });
  var prog = document.getElementById("examNavProgress");
  if (prog) {
    prog.textContent = "· " + answered.length + " " + _examUiL("answered", "已答");
  }
  var pills = document.querySelectorAll("#examNavPills .exam-nav-pill");
  pills.forEach(function (p) {
    var j = parseInt(p.getAttribute("data-nav-idx"), 10);
    var isAns = answered.indexOf(String(j)) >= 0;
    p.classList.toggle("answered", isAns);
    if (isAns && p.textContent.indexOf("\u00B7") < 0) p.textContent = (j + 1) + " \u00B7";
  });
}
