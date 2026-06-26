var I18N={
  en:{
    "chat.placeholder":"Type your thinking...",
    "chat.hint":"Shift+Enter for new line",
    "chat.send":"Send",
    "topic.title":"What would you like to explore?",
    "topic.subtitle":"Describe what you want to learn. Socrates will ask you questions to help you think deeper about it.",
    "topic.start":"Begin",
    "topic.hint":"Be specific for better results",
    "topic.model":"Model",
    "topic.extensions":"Extensions",
    "profile.usage":"Token usage",
    "profile.usage.desc":"View daily token usage heatmap and monthly breakdown.",
    "profile.view":"View",
    "exam.title":"Generate Exam",
    "exam.back":"Back to chat",
    "exam.cancel":"Cancel",
    "exam.generate":"Generate Exam",
    "exam.topic":"Topic",
    "exam.difficulty":"Difficulty",
    "exam.count":"Number of questions",
    "exam.types":"Question types",
    "exam.instructions":"Detailed instructions (optional)",
    "exam.submit":"Submit for Grading",
    "exam.new":"New Exam",
    "exam.close":"Close",
    "common.cancel":"Cancel",
    "common.save":"Save",
    "common.delete":"Delete",
    "common.close":"Close",
    "tutor.loading":"Generating questions...",
    "tutor.loadingWeb":"Searching the web and generating questions...",
    "tutor.questionOf":"Question {n} of {total}",
    "tutor.begin":"Begin",
    "tutor.back":"Back",
    "tutor.next":"Next",
    "tutor.quickCheck":"Quick check",
    "tutor.problem":"Problem",
    "tutor.solution":"Solution",
    "tutor.hint":"Hint",
    "tutor.explain":"Explain this concept to me",
    "tutor.skip":"Ask me a different question",
    "tutor.thinkMore":"I need to think more",
    "tutor.takeTime":"Take your time. There is no rush.",
    "tutor.fallbackWarn":"This content has a formatting issue; shown as-is.",
    /* v3.0 design — §8.2 "want to walk through" prompt and §8.6
       four-option dialog. Keys are read via t() in tutorSocratic.js
       (which falls back to inline copy if the key is missing, so
       adding the keys here is forward-compatible). */
    "tutor.explainPrompt":"Want to walk through this concept?",
    "tutor.explainKeepTrying":"Keep trying",
    "tutor.fourOptionTitle":"Stuck on the practice? Pick a next step.",
    "tutor.fourOptionHint":"Hint",
    "tutor.fourOptionFull":"Full explanation",
    "tutor.fourOptionMistake":"Add to mistakes",
    "tutor.fourOptionSkip":"Skip",
    /* v3.0 design — §6 knowledge boundary file. */
    "tutor.kbFileTitle":"Knowledge Boundary",
    "tutor.kbLastUpdated":"Last updated",
    "tutor.kbSnapshot":"Save snapshot",
    "tutor.kbHistory":"Snapshot history",
    "tutor.kbSectionInternalized":"Internalized",
    "tutor.kbSectionFuzzy":"Fuzzy",
    "tutor.kbSectionBlank":"Not yet explored",
    "tutor.kbVerifiedTag":"verified x",
    "tutor.kbTopicFirst":"Set a topic to build your knowledge map.",
    /* v3.0 design — §10 long-term plan. */
    "tutor.planTitle":"Teaching plan",
    "tutor.scheduleTitle":"Daily schedule",
    "tutor.scheduleTarget":"Target",
    "tutor.scheduleDay":"day",
    "tutor.scheduleEmpty":"Set a target date and a daily time budget to see a day-by-day plan with review buffer and deadline warnings.",
    "tutor.scheduleEmptyCta":"Set up now",
    "tutor.scheduleRest":"Rest day",
    "tutor.scheduleReview":"Review buffer",
    "tutor.scheduleMore":"more days",
    "tutor.planWarningOverdue":"Plan is {n} day(s) past the target date. Adjust the deadline or scope.",
    "tutor.planWarningBlank":"Progress note: {days} day(s) left and {pct}% of nodes are unexplored.",
    "tutor.planWarningOverrun":"Progress note: at the current pace, you will finish {n} day(s) after the target date.",
    "tutor.planActionScope":"Trim scope",
    "tutor.planActionTime":"Add daily time",
    "tutor.planActionDeadline":"Extend deadline",
    /* v3.0 design — mode banner (§11). */
    "tutor.modeChat":"Chat",
    "tutor.modeTutor":"Tutor",
    "tutor.modeChatDesc":"Plain conversation, no scaffolding",
    "tutor.modeTutorDesc":"AI asks, follows up, and tracks what you know",
    "tutor.modeSwitchToTutor":"Switch to Tutor",
    "tutor.modeSwitchToChat":"Switch to Chat",
    /* v3.0 design — mistake book filter (§9.4). */
    "tutor.mistakeFilterAll":"All",
    "tutor.mistakeFilterUnresolved":"Unresolved",
    "tutor.mistakeFilterResolved":"Resolved",
    "tutor.mistakeResolvedTag":"conquered",
    "tutor.mistakeEmpty":"No mistakes yet. Wrong quiz picks and incorrect practice attempts will land here for review.",
    "tutor.mistakeEmptyResolved":"No resolved mistakes yet. Mark a mistake as conquered after redoing it successfully.",
    "tutor.mistakeEmptyOther":"Nothing in this filter. Switch to \"All\" to see every mistake.",
    /* v3.0 design — practice progress chip (§8.5). */
    "tutor.practiceFoundation":"Foundation",
    "tutor.practiceTransfer":"Transfer",
    "tutor.practiceAttempts":"{n} attempt(s)",
    "tutor.practiceCurrentNode":"current topic",
    /* v3.0 design — plan-setup form (§10.1). */
    "tutor.planSetupToggle":"Optional: set a target date and daily time",
    "tutor.planSetupTargetDate":"Target date",
    "tutor.planSetupDailyMinutes":"Daily minutes",
    "tutor.planSetupRestDays":"Rest days",
    /* v3.0 design — stage labels. */
    "tutor.stageMotivate":"Intuition",
    "tutor.stageDefine":"Definition",
    "tutor.stageDevelop":"Development",
    "tutor.stageIllustrate":"Worked example",
    "tutor.stageExercise":"Practice",
    "tutor.stageCheck":"Check",
    "tutor.done":"[done]",
    /* Scaffold widget strings — buttons, placeholders, feedback. */
    "tutor.flashcardAria":"Flashcard — click to flip",
    "tutor.hideHint":"Hide hint",
    "tutor.hideSolution":"Hide solution",
    "tutor.practiceEmpty":"Please type an answer first.",
    "tutor.practicePlaceholder":"Type your answer…",
    "tutor.practicePrefix":"[Practice attempt]\n",
    "tutor.practiceSelfCorrect":"Correct!",
    "tutor.practiceSelfWrong":"Not quite. The correct answer is:",
    "tutor.practiceSent":"Sent for review.",
    "tutor.quizCorrect":"Correct ({answer}).",
    "tutor.quizRecorded":"Recorded: {letter}.",
    "tutor.quizWrong":"Not quite. The correct answer is {answer}.",
    "tutor.revealAnswer":"Reveal answer",
    "tutor.showHint":"Show hint",
    "tutor.showSolution":"Show solution",
    "tutor.submitAnswer":"Submit"
  },
  zh:{
    "chat.placeholder":"输入你的想法...",
    "chat.hint":"Shift+Enter 换行",
    "chat.send":"发送",
    "topic.title":"想学什么？",
    "topic.subtitle":"描述你想学的内容。苏格拉底会通过提问帮你深入理解。",
    "topic.start":"开始",
    "topic.hint":"描述越具体效果越好",
    "topic.model":"模型",
    "topic.extensions":"扩展",
    "profile.usage":"Token 用量",
    "profile.usage.desc":"查看每日 token 用量热力图和月度统计。",
    "profile.view":"查看",
    "exam.title":"生成考试",
    "exam.back":"返回对话",
    "exam.cancel":"取消",
    "exam.generate":"生成考试",
    "exam.topic":"主题",
    "exam.difficulty":"难度",
    "exam.count":"题目数量",
    "exam.types":"题型",
    "exam.instructions":"详细说明（可选）",
    "exam.submit":"提交批改",
    "exam.new":"新考试",
    "exam.close":"关闭",
    "common.cancel":"取消",
    "common.save":"保存",
    "common.delete":"删除",
    "common.close":"关闭",
    "tutor.loading":"正在生成问题...",
    "tutor.loadingWeb":"正在搜索网络并生成问题...",
    "tutor.questionOf":"第 {n} / {total} 题",
    "tutor.begin":"开始",
    "tutor.back":"上一题",
    "tutor.next":"下一题",
    "tutor.quickCheck":"小测",
    "tutor.problem":"题目",
    "tutor.solution":"解答",
    "tutor.hint":"提示",
    "tutor.explain":"给我讲解一下这个概念",
    "tutor.skip":"换一道题",
    "tutor.thinkMore":"我再想想",
    "tutor.takeTime":"慢慢来，不着急。",
    "tutor.fallbackWarn":"该内容格式异常，已原样展示",
    /* v3.0 design — §8.2 prompt + §8.6 four-option dialog (zh) */
    "tutor.explainPrompt":"这里需要梳理一下吗？",
    "tutor.explainKeepTrying":"再想想",
    "tutor.fourOptionTitle":"练习题卡住了，下一步？",
    "tutor.fourOptionHint":"提示",
    "tutor.fourOptionFull":"完整讲解",
    "tutor.fourOptionMistake":"加入错题本",
    "tutor.fourOptionSkip":"跳过",
    /* v3.0 design — §6 knowledge boundary file (zh) */
    "tutor.kbFileTitle":"知识边界",
    "tutor.kbLastUpdated":"最后更新",
    "tutor.kbSnapshot":"存档当前版本",
    "tutor.kbHistory":"存档历史",
    "tutor.kbSectionInternalized":"已内化",
    "tutor.kbSectionFuzzy":"模糊",
    "tutor.kbSectionBlank":"未探测",
    "tutor.kbVerifiedTag":"验证 x",
    "tutor.kbTopicFirst":"设置学习主题后，这里会显示知识地图。",
    /* v3.0 design — §10 long-term plan (zh) */
    "tutor.planTitle":"教学计划",
    "tutor.scheduleTitle":"学习日程",
    "tutor.scheduleTarget":"截止时间",
    "tutor.scheduleDay":"天",
    "tutor.scheduleEmpty":"设置截止时间和每日学习时间后，会按节奏把今天要做的主题和剩余天数排在这里。",
    "tutor.scheduleEmptyCta":"现在设置",
    "tutor.scheduleRest":"休息",
    "tutor.scheduleReview":"复习缓冲",
    "tutor.scheduleMore":"天",
    "tutor.planWarningOverdue":"计划已过截止日期 {n} 天。可以调整截止时间或学习范围。",
    "tutor.planWarningBlank":"当前进度提示：距截止时间还有 {days} 天，仍有 {pct}% 的节点未探测。",
    "tutor.planWarningOverrun":"当前进度提示：按当前节奏，预计需要比截止时间多 {n} 天。",
    "tutor.planActionScope":"调整学习范围",
    "tutor.planActionTime":"增加每日时间",
    "tutor.planActionDeadline":"延长截止日期",
    /* v3.0 design — mode banner (zh) */
    "tutor.modeChat":"对话模式",
    "tutor.modeTutor":"引导模式",
    "tutor.modeChatDesc":"普通对话，无教学引导",
    "tutor.modeTutorDesc":"AI 主动提问并跟踪你的学习",
    "tutor.modeSwitchToTutor":"切换到引导模式",
    "tutor.modeSwitchToChat":"切换到对话模式",
    /* v3.0 design — mistake book filter (zh) */
    "tutor.mistakeFilterAll":"全部",
    "tutor.mistakeFilterUnresolved":"未攻克",
    "tutor.mistakeFilterResolved":"已攻克",
    "tutor.mistakeResolvedTag":"已攻克",
    "tutor.mistakeEmpty":"还没有错题。答错的测验题和练习题会收集在这里。",
    "tutor.mistakeEmptyResolved":"还没有攻克的错题。重新答对一道题后会标记为已攻克。",
    "tutor.mistakeEmptyOther":"当前筛选下没有内容。切换到「全部」查看所有错题。",
    /* v3.0 design — practice progress chip (zh) */
    "tutor.practiceFoundation":"基础题",
    "tutor.practiceTransfer":"变式题",
    "tutor.practiceAttempts":"已尝试 {n} 次",
    "tutor.practiceCurrentNode":"当前主题",
    /* v3.0 design — plan-setup form (zh) */
    "tutor.planSetupToggle":"可选：设置截止时间与每日学习时长",
    "tutor.planSetupTargetDate":"截止时间",
    "tutor.planSetupDailyMinutes":"每日时长（分钟）",
    "tutor.planSetupRestDays":"休息日",
    /* v3.0 design — stage labels (zh) */
    "tutor.stageMotivate":"建立直觉",
    "tutor.stageDefine":"精确定义",
    "tutor.stageDevelop":"深入推导",
    "tutor.stageIllustrate":"应用示例",
    "tutor.stageExercise":"动手练习",
    "tutor.stageCheck":"阶段检查",
    "tutor.done":"[已完成]",
    /* Scaffold widget strings — buttons, placeholders, feedback. */
    "tutor.flashcardAria":"闪卡 — 点击翻转",
    "tutor.hideHint":"隐藏提示",
    "tutor.hideSolution":"隐藏答案",
    "tutor.practiceEmpty":"请先输入答案。",
    "tutor.practicePlaceholder":"输入你的答案…",
    "tutor.practicePrefix":"[练习作答]\n",
    "tutor.practiceSelfCorrect":"答对了！",
    "tutor.practiceSelfWrong":"不太对，正确答案是：",
    "tutor.practiceSent":"已发送，等待 AI 点评。",
    "tutor.quizCorrect":"答对了（{answer}）。",
    "tutor.quizRecorded":"已记录：{letter}。",
    "tutor.quizWrong":"不太对，正确答案是 {answer}。",
    "tutor.revealAnswer":"查看答案",
    "tutor.showHint":"显示提示",
    "tutor.showSolution":"显示答案",
    "tutor.submitAnswer":"提交"
  }
};
var _currentLang="en";
function t(key){return (I18N[_currentLang]&&I18N[_currentLang][key])||I18N.en[key]||key;}
function setLang(lang){
  if(!I18N[lang])return;
  _currentLang=lang;
  try{localStorage.setItem("socrates-lang-app",lang)}catch(_){}
  applyI18n();
}
function applyI18n(){
  /* Placeholder / value updates — done selectively for now. */
  var ci=document.getElementById("chatInputArea");
  if(ci)ci.placeholder=t("chat.placeholder");
  var ch=document.getElementById("chatInputHint");
  if(ch)ch.textContent=t("chat.hint");
  var tt=document.getElementById("topicTitle");
  if(tt)tt.textContent=t("topic.title");
  var ts=document.getElementById("topicSub");
  if(ts)ts.textContent=t("topic.subtitle");
  var sb=document.getElementById("startBtn");
  if(sb)sb.textContent=t("topic.start");
  var el=document.getElementById("extensionsLabel");
  if(el)el.textContent=t("topic.extensions");
  var ev=document.getElementById("examViewTitle");
  if(ev&&window.state&&window.state._examInView)ev.textContent=ev.textContent; /* already localized by render */
}
/* Load saved language preference */
try{var s=localStorage.getItem("socrates-lang-app");if(s&&I18N[s])_currentLang=s;}catch(_){}
/* Update the language toggle label on load */
try{
  setTimeout(function(){
    var lbl=document.getElementById("langToggleLabel");
    if(lbl)lbl.textContent=_currentLang==="en"?"EN":"中";
    applyI18n();
  },0);
}catch(_){}

/* Expose i18n functions as globals for main.js and other modules. */
window._currentLang = _currentLang;
window.t = t;
window.setLang = setLang;
window.applyI18n = applyI18n;
