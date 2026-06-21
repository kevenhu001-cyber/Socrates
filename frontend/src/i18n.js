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
    "common.close":"Close"
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
    "common.close":"关闭"
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
