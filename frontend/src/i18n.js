var I18N={
  en:{
    "chat.placeholder":"Type your thinking...",
    "chat.hint":"Shift+Enter for new line",
    "chat.send":"Send",
    /* P_attachments — UI strings for the chat-input attachment chip
     * strip, paperclip button, and toast feedback. Kept short so
     * the chips don't wrap. */
    "chat.attach":"Attach files",
    "chat.attach.aria":"Attach files",
    "chat.attach.remove.aria":"Remove attachment",
    "chat.attach.maxReached":"You can attach up to 6 files per turn.",
    "chat.attach.imageTooLarge":"Image exceeds the {size} MB limit.",
    "chat.attach.pdfTooLarge":"PDF exceeds the 25 MB limit.",
    "chat.attach.unsupported":"Only images, text files, and PDFs are supported.",
    "chat.attach.truncated":"(truncated)",
    /* P_attachments-multimodal — UI strings for the user-controlled
     * multimodal checkbox on the API key editor row (provider.*) and
     * the rejected-image toast in the chat composer (attach.*). The
     * checkbox label is consumed by data-i18n-key="provider.multimodal"
     * and switched by applyI18n on language toggle. */
    "provider.multimodal":"Multimodal (vision-capable)",
    "provider.multimodalHint":"Allow image attachments to be sent to this model",
    "attach.notMultimodal":"The active model can't view images. Add a multimodal provider or remove image attachments.",
    /* P_lang-slogans — the topic-setup hero slogan ("What would
       you like to explore?" / "What can I help you with?") is
       intentionally hardcoded English in BOTH i18n blocks so the
       language toggle never affects it. The slogan is mode-
       dependent (tutor vs chat) and managed by syncAppModeUI()
       in main.js, which writes the right hardcoded English
       slogan after applyI18n runs. Other topic-setup lines
       (subtitle / disclaimer) are likewise mode-dependent and
       pinned English so the hero stays consistent across the
       two modes. */
    "topic.title":"What would you like to explore?",
    "topic.subtitle":"Describe what you want to learn. Socrates will ask you questions to help you think deeper about it.",
    "topic.inputPlaceholder":"e.g. I want to understand how machine learning works...",
    "topic.start":"Begin",
    "topic.hint":"Be specific for better results",
    "topic.model":"Model",
    "topic.extensions":"Extensions",
    "profile.usage":"Token usage",
    "profile.usage.desc":"View daily token usage heatmap and monthly breakdown.",
    "profile.view":"View",
    "profile.account":"Account",
    "profile.joined":"Joined",
    "profile.emailVerified":"Email verified",
    "profile.userId":"User ID",
    "profile.subscription":"Subscription",
    "profile.currentPlan":"Current plan",
    "profile.renewal":"Renewal",
    "profile.comparePlans":"Compare plans",
    "profile.preferences":"Preferences",
    "profile.language":"Language",
    "profile.webSearch":"Web search",
    "profile.webSearchDesc":"Enable web search to include real-time results in questions.",
    "profile.howShouldIRespond":"How should I respond?",
    "profile.whatDoYouKnow":"What do you know about me?",
    "profile.notYetSaved":"Not yet saved",
    "profile.data":"Data",
    "profile.deleteAccount":"Delete",
    "profile.archivedSessions":"Archived sessions",
    "profile.archivedSessionsDesc":"Sessions you deleted are kept here for 30 days before being permanently erased.",
    "profile.manage":"Manage",
    "profile.promptTemplates":"Prompt templates",
    "profile.promptTemplatesDesc":"Reusable prompts you can fire from the chat with <code>/shortcut</code>.",
    "profile.clearConversations":"Clear conversations",
    "profile.clearConversationsDesc":"Remove all local chat history.",
    "profile.clear":"Clear",
    "profile.clearApiSettings":"Clear API settings",
    "profile.clearApiSettingsDesc":"Remove all configured API providers and keys.",
    "profile.dangerZone":"Danger zone",
    "profile.signOut":"Sign out",
    "profile.signOutDesc":"End your session on this device.",
    "profile.deleteAccountDesc":"Permanently delete your account and all data.",
    "sidebar.knowledge":"Knowledge",
    "sidebar.recents":"Recents",
    "sidebar.mistakes":"Mistakes",
    "sidebar.recentSessions":"Recent Sessions",
    "sidebar.new":"New",
    "sidebar.mistakeBook":"Mistake Book",
    "sidebar.inbox":"Inbox",
    "sidebar.inboxDesc":"All sessions without a project",
    "sidebar.newProject":"New project",
    "sidebar.editProject":"Edit project",
    "sidebar.all":"All",
    "sidebar.pinned":"Pinned",
    "sidebar.recent":"Recent",
    "sidebar.share":"Share",
    "sidebar.shareConversation":"Share conversation",
    "sidebar.copy":"Copy",
    "sidebar.revokeShare":"× Revoke share link",
    "sidebar.createShareLink":"Create share link",
    "sidebar.textSize":"Text size",
    "sidebar.contentWidth":"Content width",
    "sidebar.narrow":"Narrow",
    "sidebar.medium":"Medium",
    "sidebar.wide":"Wide",
    "sidebar.fullWidth":"Full width",
    "sidebar.newChat":"New chat",
    "sidebar.shareCurrentChat":"Share current chat",
    "sidebar.newLine":"New line",
    "sidebar.ok":"OK",
    "sidebar.public":"Public",
    "sidebar.private":"Private",
    "sidebar.publicDesc":"Anyone with the link can view",
    "sidebar.privateDesc":"Only you can view",
    "sidebar.shareLink":"Share link",
    "sidebar.startNewChat":"Start a new chat",
    "share.title":"Share conversation",
    "share.publicTitle":"Anyone with the link",
    "share.publicDesc":"No sign-in required. Anyone who has the link can view this conversation.",
    "share.privateTitle":"Only you",
    "share.privateDesc":"Must be logged into your account to view. Still shared via link.",
    "share.copy":"Copy",
    "share.copied":"Copied!",
    "share.revoke":"× Revoke share link",
    "share.create":"Create share link",
    "share.copySource":"Copy source",
    "share.startChatFirst":"Start a chat first to share it",
    "share.projectChips":"Project chips ↑ — click to switch",
    "share.projectPrefix":"Project: ",
    "search.noMatches":"No matches",
    "search.failed":"Search failed",
    "tags.maxTags":"Maximum 12 tags per session",
    "session.deleted":"Session deleted",
    "session.deleteFailed":"Delete failed",
    "session.archiveFirst":"Archive the session first (long-press → Delete).",
    "session.inboxPermanent":"The Inbox project is permanent",
    "project.nameRequired":"Project name is required",
    "project.deleteConfirm":"Delete project?",
    "project.deleteDesc":"Sessions in this project will move back to Inbox. This cannot be undone.",
    "feedback.thanks":"Thanks for the feedback",
    "feedback.improve":"Got it — we'll improve",
    "feedback.notFound":"Message not found",
    "feedback.saved":"Saved locally — will sync when back online",
    "clipboard.copied":"Copied to clipboard",
    "clipboard.failed":"Copy failed",
    "share.linkLabel":"Share link",
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
    /* Math-textbook scaffold blocks (proof / theorem / key-point / derivation) */
    "tutor.proofLabel":"Proof",
    "tutor.theoremLabel":"Theorem",
    "tutor.keyPointLabel":"Key Point",
    "tutor.derivationLabel":"Derivation",
    "tutor.theoremStatementLabel":"Statement",
    "tutor.theoremProofLabel":"Proof",
    "tutor.showProof":"Show proof",
    "tutor.hideProof":"Hide proof",
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
    /* P_attachments — see matching en block. */
    "chat.attach":"附加文件",
    "chat.attach.aria":"附加文件",
    "chat.attach.remove.aria":"移除附件",
    "chat.attach.maxReached":"每次最多附加 6 个文件。",
    "chat.attach.imageTooLarge":"图片超过 {size} MB 上限。",
    "chat.attach.pdfTooLarge":"PDF 超过 25 MB 上限。",
    "chat.attach.unsupported":"仅支持图片、文本文件和 PDF。",
    "chat.attach.truncated":"（已截断）",
    /* P_attachments-multimodal — see matching en block. */
    "provider.multimodal":"多模态（支持图像理解）",
    "provider.multimodalHint":"允许将图片附件发送给此模型",
    "attach.notMultimodal":"当前模型无法理解图像。请添加多模态提供方或移除图片附件。",
    /* P_lang-slogans — see the matching en block: the hero
       slogan/subtitle are intentionally pinned English so they
       stay consistent regardless of language toggle or saved
       preference. Only the topic input placeholder translates. */
    "topic.title":"What would you like to explore?",
    "topic.subtitle":"Describe what you want to learn. Socrates will ask you questions to help you think deeper about it.",
    "topic.inputPlaceholder":"例如：我想了解机器学习是怎么工作的...",
    "topic.start":"开始",
    "topic.hint":"描述越具体效果越好",
    "topic.model":"模型",
    "topic.extensions":"扩展",
    "profile.usage":"Token 用量",
    "profile.usage.desc":"查看每日 token 用量热力图和月度统计。",
    "profile.view":"查看",
    "profile.account":"账户",
    "profile.joined":"加入时间",
    "profile.emailVerified":"邮箱已验证",
    "profile.userId":"用户 ID",
    "profile.subscription":"订阅",
    "profile.currentPlan":"当前套餐",
    "profile.renewal":"续费日期",
    "profile.comparePlans":"对比套餐",
    "profile.preferences":"偏好设置",
    "profile.language":"语言",
    "profile.webSearch":"网页搜索",
    "profile.webSearchDesc":"开启后，出题时会包含实时搜索结果。",
    "profile.howShouldIRespond":"你希望我如何回答？",
    "profile.whatDoYouKnow":"你了解我什么？",
    "profile.notYetSaved":"尚未保存",
    "profile.data":"数据",
    "profile.deleteAccount":"删除",
    "profile.archivedSessions":"已归档会话",
    "profile.archivedSessionsDesc":"你删除的会话会在这里保留 30 天后永久清除。",
    "profile.manage":"管理",
    "profile.promptTemplates":"提示词模板",
    "profile.promptTemplatesDesc":"可重复使用的提示词，可在对话中通过 <code>/shortcut</code> 调用。",
    "profile.clearConversations":"清除对话",
    "profile.clearConversationsDesc":"删除所有本地对话历史。",
    "profile.clear":"清除",
    "profile.clearApiSettings":"清除 API 设置",
    "profile.clearApiSettingsDesc":"删除所有已配置的 API 提供商和密钥。",
    "profile.dangerZone":"危险区域",
    "profile.signOut":"退出登录",
    "profile.signOutDesc":"在此设备上结束你的会话。",
    "profile.deleteAccountDesc":"永久删除你的账户和所有数据。",
    "sidebar.knowledge":"知识",
    "sidebar.recents":"最近",
    "sidebar.mistakes":"错题",
    "sidebar.recentSessions":"最近会话",
    "sidebar.new":"新建",
    "sidebar.mistakeBook":"错题本",
    "sidebar.inbox":"收件箱",
    "sidebar.inboxDesc":"所有未归类项目的会话",
    "sidebar.newProject":"新建项目",
    "sidebar.editProject":"编辑项目",
    "sidebar.all":"全部",
    "sidebar.pinned":"已固定",
    "sidebar.recent":"最近",
    "sidebar.share":"分享",
    "sidebar.shareConversation":"分享对话",
    "sidebar.copy":"复制",
    "sidebar.revokeShare":"× 撤销分享链接",
    "sidebar.createShareLink":"创建分享链接",
    "sidebar.textSize":"文字大小",
    "sidebar.contentWidth":"内容宽度",
    "sidebar.narrow":"窄",
    "sidebar.medium":"中",
    "sidebar.wide":"宽",
    "sidebar.fullWidth":"全宽",
    "sidebar.newChat":"新建对话",
    "sidebar.shareCurrentChat":"分享当前对话",
    "sidebar.newLine":"换行",
    "sidebar.ok":"确定",
    "sidebar.public":"公开",
    "sidebar.private":"私密",
    "sidebar.publicDesc":"任何有链接的人都可以查看",
    "sidebar.privateDesc":"只有你可以查看",
    "sidebar.shareLink":"分享链接",
    "sidebar.startNewChat":"开始新对话",
    "share.title":"分享对话",
    "share.publicTitle":"任何有链接的人",
    "share.publicDesc":"无需登录。任何有链接的人都可以查看这个对话。",
    "share.privateTitle":"仅限你",
    "share.privateDesc":"必须登录你的账户才能查看。仍通过链接分享。",
    "share.copy":"复制",
    "share.copied":"已复制！",
    "share.revoke":"× 撤销分享链接",
    "share.create":"创建分享链接",
    "share.copySource":"复制源代码",
    "share.startChatFirst":"请先开始一个对话再分享",
    "share.projectChips":"项目标签 ↑ — 点击切换",
    "share.projectPrefix":"项目: ",
    "search.noMatches":"无匹配结果",
    "search.failed":"搜索失败",
    "tags.maxTags":"每个会话最多 12 个标签",
    "session.deleted":"会话已删除",
    "session.deleteFailed":"删除失败",
    "session.archiveFirst":"请先归档会话(长按 → 删除)。",
    "session.inboxPermanent":"收件箱项目是永久的",
    "project.nameRequired":"项目名称不能为空",
    "project.deleteConfirm":"删除项目?",
    "project.deleteDesc":"此项目中的会话将移回收件箱。此操作无法撤销。",
    "feedback.thanks":"感谢反馈",
    "feedback.improve":"收到 — 我们会改进",
    "feedback.notFound":"未找到消息",
    "feedback.saved":"已本地保存 — 恢复网络后将同步",
    "clipboard.copied":"已复制到剪贴板",
    "clipboard.failed":"复制失败",
    "share.linkLabel":"分享链接",
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
    /* Math-textbook scaffold blocks (zh) */
    "tutor.proofLabel":"证明",
    "tutor.theoremLabel":"定理",
    "tutor.keyPointLabel":"要点",
    "tutor.derivationLabel":"推导",
    "tutor.theoremStatementLabel":"陈述",
    "tutor.theoremProofLabel":"证明",
    "tutor.showProof":"展开证明",
    "tutor.hideProof":"收起证明",
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
  window._currentLang=lang;
  try{localStorage.setItem("socrates-lang-app",lang)}catch(_){}
  applyI18n();
  /* Update language toggle active state */
  var en=document.getElementById("profileLangEn");
  var zh=document.getElementById("profileLangZh");
  if(en)en.classList.toggle("active",lang==="en");
  if(zh)zh.classList.toggle("active",lang==="zh");
}
function applyI18n(){
  /* Translate all elements with data-i18n-key attribute */
  var els=document.querySelectorAll("[data-i18n-key]");
  for(var i=0;i<els.length;i++){
    var key=els[i].getAttribute("data-i18n-key");
    var val=t(key);
    if(val&&val!==key)els[i].textContent=val;
  }
  /* Translate all elements with data-i18n-placeholder attribute
     (used on <input>/<textarea> where textContent doesn't apply). */
  var phs=document.querySelectorAll("[data-i18n-placeholder]");
  for(var j=0;j<phs.length;j++){
    var ph=phs[j].getAttribute("data-i18n-placeholder");
    var phv=t(ph);
    if(phv&&phv!==ph)phs[j].setAttribute("placeholder",phv);
  }
  /* Translate elements with data-i18n-title / data-i18n-aria — used
   * by the attachment paperclip button. Same pattern as the
   * placeholder block above. */
  var titles=document.querySelectorAll("[data-i18n-title]");
  for(var ti=0;ti<titles.length;ti++){
    var tk=titles[ti].getAttribute("data-i18n-title");
    var tv=t(tk);
    if(tv&&tv!==tk)titles[ti].setAttribute("title",tv);
  }
  var arias=document.querySelectorAll("[data-i18n-aria]");
  for(var ai=0;ai<arias.length;ai++){
    var ak=arias[ai].getAttribute("data-i18n-aria");
    var av=t(ak);
    if(av&&av!==ak)arias[ai].setAttribute("aria-label",av);
  }
  /* Placeholder / value updates — done selectively for now. */
  var ci=document.getElementById("chatInputArea");
  if(ci)ci.placeholder=t("chat.placeholder");
  var ch=document.getElementById("chatInputHint");
  if(ch)ch.textContent=t("chat.hint");
  var tt=document.getElementById("topicTitle");
  if(tt)tt.textContent=t("topic.title");
  var ts=document.getElementById("topicSub");
  if(ts)ts.textContent=t("topic.subtitle");
  /* P_lang-slogans — the hero slogan is mode-dependent English
     written by syncAppModeUI() (tutor: "What would you like to
     explore?", chat: "What can I help you with?"). Pinning
     topic.title to English in both i18n blocks above means
     applyI18n() can't change the slogan — even if a future
     caller invokes it before syncAppModeUI runs. */
  var tp=document.getElementById("topicInput");
  if(tp)tp.placeholder=t("topic.inputPlaceholder");
  var sb=document.getElementById("startBtn");
  if(sb)sb.textContent=t("topic.start");
  var el=document.getElementById("extensionsLabel");
  if(el)el.textContent=t("topic.extensions");
  var ev=document.getElementById("examViewTitle");
  if(ev&&window.state&&window.state._examInView)ev.textContent=ev.textContent; /* already localized by render */
}
/* Load saved language preference. _currentLang is the single source
   of truth at runtime; setLang() persists changes and applyI18n()
   pushes them onto the DOM.
   P_lang-persist — defensive dual-write on read: when the saved
   value resolves to a known language, we write it back to
   localStorage as well. Some browser flows (Safari private mode,
   cookie-expiry redirects, third-party-script-injected storage
   clears) can leave the entry null between sessions. Re-writing
   it here makes the preference resilient to a transient missing
   entry and gives a single load() call a self-healing behavior. */
try{
  var s=localStorage.getItem("socrates-lang-app");
  if(s&&I18N[s]){
    _currentLang=s;
  }else if(!s){
    /* No preference recorded yet — persist the default so the
       next load picks up the same value instead of leaving the
       slot empty. */
    try{localStorage.setItem("socrates-lang-app",_currentLang)}catch(_){}
  }else{
    /* Stale value (e.g. user downgraded and we removed a locale) —
     * overwrite with the default so the entry stays canonical. */
    try{localStorage.removeItem("socrates-lang-app");localStorage.setItem("socrates-lang-app",_currentLang)}catch(_){}
  }
}catch(_){}
/* P_lang-init — run applyI18n SYNCHRONOUSLY at module load so every
   data-i18n-key element is in the saved language BEFORE main.js
   finishes initializing (syncAppModeUI, renderRecents, etc.). The
   previous setTimeout(0) deferred translation to the next event-loop
   tick, which meant main.js rendered a flash of English first —
   and the partial re-render that followed left the page in a
   mixed-language state. */
try{
  var lbl=document.getElementById("langToggleLabel");
  if(lbl)lbl.textContent=_currentLang==="en"?"EN":"中";
  applyI18n();
}catch(_){}

/* Expose i18n functions as globals for main.js and other modules. */
window._currentLang = _currentLang;
window.t = t;
window.setLang = setLang;
window.applyI18n = applyI18n;
