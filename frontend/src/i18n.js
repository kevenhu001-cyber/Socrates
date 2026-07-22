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
    /* P_lang-slogans — the topic-setup hero slogan was previously
       pinned English in BOTH i18n blocks (with a comment claiming
       this was intentional). That made the Tutor-mode hero stay
       English even when the user switched the whole app to 中文,
       which read as broken localization rather than a design
       choice. Chat-mode slogans are translated (`topic.titleChat`),
       so for symmetry we now translate these too. The hero is
       still managed by syncAppModeUI() in main.js — only the
       zh-side strings change. */
    "topic.title":"What would you like to explore?",
    "topic.subtitle":"",
    "topic.inputPlaceholder":"e.g. I want to understand how machine learning works...",
    "topic.start":"Begin",
    "topic.hint":"Be specific for better results",
    "topic.model":"Model",
    "topic.extensions":"Extensions",
    /* P_chatgpt-landing — ChatGPT-style main page (2026-07-20) */
    "greeting.chat":"Hello, {name}.",
    "greeting.tutor":"Let's explore, {name}.",
    "greeting.guest":"Guest",
    "sidebar.nav.new":"New chat",
    "sidebar.nav.library":"Library",
    "sidebar.nav.projects":"Projects",
    "sidebar.nav.scheduled":"Scheduled",
    "sidebar.nav.plugins":"Plugins",
    "sidebar.nav.exam":"Exam",
    "sidebar.nav.more":"More",
    "sidebar.nav.soon":"Soon",
    /* PR-A — More popover items */
    "sidebar.more.settings":"API settings",
    "sidebar.more.display":"Display & theme",
    "sidebar.more.shortcuts":"Keyboard shortcuts",
    "sidebar.more.signOut":"Sign out",
    "sidebar.more.soonScheduled":"Scheduled tasks — coming soon",
    /* PR-B — Library panel */
    "sidebar.library.title":"Library",
    "sidebar.library.files":"Files",
    "sidebar.library.artifacts":"Artifacts",
    "sidebar.library.empty":"No files yet. Upload files in a chat to see them here.",
    "sidebar.library.artifact.empty":"No artifacts yet.",
    /* PR-C — Spaces panel */
    "sidebar.spaces.title":"Projects",
    "sidebar.spaces.empty":"No projects yet. Create a project to organize your sessions.",
    "sidebar.spaces.create":"New project",
    "sidebar.spaces.createName":"Project name",
    "sidebar.spaces.createDesc":"Description (optional)",
    "sidebar.spaces.deleteConfirm":"Delete this project?",
    /* PR-D — Scheduled panel */
    "sidebar.scheduled.title":"Scheduled",
    "sidebar.scheduled.empty":"No scheduled tasks. Click + to create one.",
    "sidebar.scheduled.create":"New scheduled task",
    "sidebar.scheduled.createTitle":"Task title",
    "sidebar.scheduled.createPrompt":"Prompt (optional)",
    "sidebar.scheduled.once":"Once",
    "sidebar.scheduled.daily":"Daily",
    "sidebar.scheduled.weekly":"Weekly",
    "sidebar.scheduled.monthly":"Monthly",
    "sidebar.scheduled.custom":"Custom (cron)",
    "sidebar.scheduled.statusPending":"Pending",
    "sidebar.scheduled.statusActive":"Active",
    "sidebar.scheduled.statusPaused":"Paused",
    "sidebar.scheduled.statusCompleted":"Completed",
    "sidebar.scheduled.statusFailed":"Failed",
    /* PR-E — Plugins panel */
    "sidebar.plugins.title":"Plugins",
    "sidebar.plugins.browse":"Browse",
    "sidebar.plugins.empty":"No plugins installed. Browse the marketplace to find extensions.",
    "sidebar.plugins.marketplace":"Plugin marketplace",
    "sidebar.plugins.install":"Install",
    "sidebar.plugins.uninstall":"Uninstall",
    "sidebar.plugins.enabled":"Enabled",
    "sidebar.plugins.disabled":"Disabled",
    "topbar.modeChat":"Chat",
    "topbar.modeTutor":"Work",
    "voice.soon":"Voice input coming soon",
    "voice.toast":"Voice input coming soon",
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
    "sidebar.searchPlaceholder":"Search chats",
    "sidebar.recentSessions":"Recent Sessions",
    "sidebar.new":"New",
    "sidebar.mistakeBook":"Mistake Book",
    "sidebar.all":"All",
    "sidebar.recent":"Recent",
    "sidebar.share":"Share",
    "sidebar.shareConversation":"Share conversation",
    "sidebar.copy":"Copy",
    /* P0.2 — in-session find (Ctrl-F) */
    "find.title":"Find in conversation",
    "find.placeholder":"Find in conversation…",
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
    "exam.back":"Back to chat",
    "exam.backTitle":"Back to chat",
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
    "tutor.diagSkip":"I don't know · Skip",
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
    /* v3.0 design — mode banner (§11). */
    "tutor.modeChat":"Chat",
    "tutor.modeTutor":"Tutor",
    "tutor.modeChatDesc":"Plain conversation, no scaffolding",
    "tutor.modeTutorDesc":"AI asks, follows up, and tracks what you know",
    "tutor.modeSwitchToTutor":"Switch to Tutor",
    "tutor.modeSwitchToChat":"Switch to Chat",
    /* Composer quick actions + reasoning effort + read-aloud */
    "composer.write":"Write or edit",
    "composer.research":"Find resources",
    "composer.write.hint":"Describe what you'd like to write or edit",
    "composer.write.scaffold":"Help me write or edit: ",
    "composer.research.hint":"Web search is on — ask your research question",
    "composer.deepThinking":"Deep thinking",
    "composer.deepResearch":"Deep Research",
    "composer.deepResearch.hint":"Enter a research topic above, then press send.",
    "composer.exam":"Generate exam",
    "picker.modelSection":"Model",
    "picker.effortSection":"Reasoning",
    "picker.manageModels":"Manage models…",
    "picker.addModel":"Add a model…",
    "picker.noModels":"No models yet.",
    "effort.label":"Effort",
    "effort.high":"High",
    "effort.high.note":"Deeper, more thorough thinking",
    "effort.medium":"Medium",
    "effort.low":"Low",
    "msg.readAloud":"Read aloud",
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
    /* v3.0 design — stage labels. */
    "tutor.stageMotivate":"Intuition",
    "tutor.stageDefine":"Definition",
    "tutor.stageDevelop":"Development",
    "tutor.stageIllustrate":"Worked example",
    "tutor.stageExercise":"Practice",
    "tutor.stageCheck":"Check",
    "tutor.done":"[done]",
    /* U-H1 / U-H2 — session mode segmented control + header badge. */
    "tutor.modeTutor":"Tutor",
    "tutor.modeChat":"Chat",
    /* U-H4 — teaching-plan sub-topic mastery status labels. */
    "tutor.statusBlank":"Blank",
    "tutor.statusFuzzy":"Fuzzy",
    "tutor.statusInternalized":"Internalized",
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
    "tutor.submitAnswer":"Submit",
    "chat.thinking":"Thinking…",
    "chat.generating":"Generating…",
    "chat.generatingQuestions":"Generating questions…",
    "chat.generatingQ":"Generating Q {n}/{total}…",
    "chat.generatedQ":"Generated {n}/{total} questions",
    "chat.knowledgeReady":"Knowledge dimensions ready",
    "common.loading":"Loading…",
    "common.saving":"Saving…",
    "common.thinking":"Thinking…",
    "common.generating":"Generating…",
    "common.ok":"OK",
    "chat.webSearchLabel":"Web search:",
    "chat.webSearchSources":"{n} sources",
    "chat.webSearchRefreshTimeout":"Search refresh timed out",
    "chat.webSearchResults":"Latest web search results",
    "chat.webSearchFailed":"Search failed",
    "auth.sessionExpired":"Your session has expired. Please sign in again.",
    "auth.checkInbox":"Check your inbox",
    "auth.verificationLinkSent":"We sent a verification link to <strong>{email}</strong>. Click the button in the email to start learning with Socrates. The link expires in 24 hours.",
    "auth.resetLinkSent":"If an account exists for <strong>{email}</strong>, we sent a password reset link. The link expires in 1 hour.",
    "auth.verifiedTitle":"Email verified",
    "auth.verifiedMsg":"You're signed in. Taking you to your dashboard…",
    "auth.signinError":"Sign-in failed",
    "auth.signupError":"Sign-up failed",
    "auth.codeSentMsg":"We sent a code to <strong>{email}</strong>. It expires in 10 minutes.",
    "auth.signIn":"Sign in",
    "auth.sending":"Sending…",
    "auth.resetting":"Resetting…",
    "auth.resetPassword":"Reset password",
    "auth.passwordTooShort":"Password must be at least 8 characters.",
    "auth.passwordsDontMatch":"Passwords don't match.",
    "auth.pleaseEnterEmail":"Please enter your email.",
    "auth.wrongCredentials":"Wrong email or password.",
    "auth.loginFailedPrefix":"Login failed: ",
    "auth.sendVerificationLink":"Send verification link",
    "auth.sendResetLink":"Send reset link",
    "auth.sendCode":"Send code",
    "auth.logIn":"Log in",
    "exam.generating":"Generating your exam…",
    "exam.generatingQ":"Generating question {n} of {total}…",
    "exam.generatingQSimple":"Generating question {n}…",
    "exam.cancel":"Cancel",
    "exam.preparing":"Preparing…",
    "exam.preparingSubtitle":"The AI is preparing your questions — this usually takes a few seconds.",
    "exam.tryAgain":"Try again",
    "exam.close":"Close",
    "exam.cancelled":"Generation cancelled.",
    "exam.noModelsAvailable":"No models available",
    "exam.modelLabel":"Model",
    "exam.typeMc":"Multiple choice",
    "exam.typeFb":"Fill blank",
    "exam.typeSa":"Short answer",
    "exam.cancelledTitle":"Cancelled",
    "exam.answered":"answered",
    "exam.results":"Exam Results: {topic}",
    "exam.placeholderTopic":"e.g. Linear Algebra, Quantum Mechanics, World War II...",
    "exam.placeholderDifficulty":"beginner / intermediate / hard / expert / custom",
    "exam.placeholderInstructions":"Specific topics to cover, or leave blank for AI to decide...",
    "exam.placeholderAnswer":"Type your answer…",
    "exam.placeholderTopicZh":"如：线性代数、量子力学、二战…",
    "exam.placeholderDifficultyZh":"入门 / 中级 / 困难 / 专家 / 自定义",
    "exam.placeholderInstructionsZh":"具体说明要覆盖的知识点，留空则由 AI 决定…",
    "exam.placeholderAnswerZh":"输入你的答案…",
    "settings.saved":"Saved. Active: {name}.",
    "settings.savedFallback":"Saved. Active provider is missing model — using mock engine as fallback.",
    "settings.noModels":"No models configured — using mock engine.",
    "settings.saveFailed":"Save failed: {msg}",
    "settings.unknownError":"unknown error",
    "settings.cleared":"Cleared. Built-in Beagle is still available — pick a model to start.",
    "settings.signInFirst":"Please sign in to save API keys.",
    "settings.rowMissing":"Row #{n} is missing URL or model. Fix it and try again.",
    "settings.rowMissingKey":"New row #{n} needs an API key.",
    "settings.apiKeyLimit":"API key limit reached for {tier} plan ({max} keys). Upgrade your plan to add more.",
    "settings.refresh":"Refreshing…",
    "settings.action.deleteAccount":"Failed to delete account: {msg}",
    "common.thinkingLabel":"Thinking",
    "common.dayShort.sun":"Sun",
    "common.dayShort.mon":"Mon",
    "common.dayShort.tue":"Tue",
    "common.dayShort.wed":"Wed",
    "common.dayShort.thu":"Thu",
    "common.dayShort.fri":"Fri",
    "common.dayShort.sat":"Sat",
    "think.title":"Thought",
    "think.thinking":"Thinking…",
    "think.connecting":"Connecting to AI…",
    "think.connectingShort":"Connecting…",
    "think.wordCount":"{n} words",
    "think.wordCountOne":"1 word",
    "think.toggle":"Toggle thinking",
    "profile.disclaimerTutor":"Socrates asks questions to help you think. It does not judge your answers.",
    "tag.placeholder":"Add a tag and press Enter",
    "kb.placeholderNote":"Write anything you want to remember about this sub-topic...",
    "prompt.placeholderTitle":"e.g. Code review",
    "prompt.placeholderShortcut":"/my-template",
    "prompt.placeholderDesc":"One-line summary",
    "prompt.placeholderBody":"The text inserted into the chat as a placeholder. The user types or pastes the real content below; this prefix is stripped before the message is sent to the LLM.",
    "prompt.placeholderSystem":"Optional. The invisible instruction injected as a system message whenever this template is active. Tell the model what role to play, what the input contract is, what the output should look like, and any constraints. Leave empty to send the body as a plain user message with no role switch.",
    "provider.placeholderLabel":"Label (e.g. GPT-5.5)",
    "provider.placeholderUrl":"Base URL  (https://api.openai.com/v1)",
    "provider.placeholderKey":"API key",
    "provider.placeholderModel":"Model id  (e.g. gpt-5.5, claude-opus-4-8, sonnet-4-6)",
    "usage.failed":"Failed to load usage data. Make sure you are signed in.",
    "usage.failedGeneric":"Failed to load usage data.",
    "usage.loading":"Loading usage data…",
    "exam.noResponse":"no response",
    "exam.failNoResponse":"Generation failed — no response",
    "exam.failed":"Failed",
    "exam.failParse":"Parse failed — unexpected format",
    "exam.failParseHint":"Try again or switch model",
    "exam.parseFailed":"Parse failed",
    "exam.failNone":"Generation failed — no questions",
    "exam.questionsLabel":"questions ·",
    "exam.answeredLabel":"answered",
    "diag.analyzingTopic":"Analyzing topic…",
    "diag.ready":"Ready",
    /* U-H3 — diagnostic generation cancel / timeout / retry prompt. */
    "diag.cancel":"Cancel",
    "diag.timeoutTitle":"Question generation timed out",
    "diag.retry":"Retry",
    "diag.useBuiltin":"Use built-in questions",
    "common.noResponseTimeout":"No response for {sec}s — check API availability",
    "common.retry":"Retry",
    "common.truncated":"(truncated)",
    "common.downloadFile":"[download {type}]",
    "tool.noOutput":"(no output)",
    "tool.showFullOutput":"Show full output",
    "tool.collapseOutput":"Collapse output",
    "tool.outputChars":"{n} chars",
    "tool.sourceForQuery":"{n} source for \"{query}\"",
    "tool.sourcesForQuery":"{n} sources for \"{query}\"",
    "tool.linkUnavailable":"Link unavailable",
    "tool.unavailableSource":"Unavailable source",
    "tool.statusDone":"Done",
    "tool.statusFailed":"Failed",
    "tool.statusTimeout":"Timeout",
    "tool.statusRunning":"Running",
    "tool.statusStopped":"Stopped",
    "tool.groupWorking":"Working",
    "tool.groupComplete":"Used tools",
    "tool.groupNeedsAttention":"Tool needs attention",
    "tool.groupStopped":"Tool run stopped",
    "tool.actionSearch":"Searching the web",
    "tool.actionAnalyze":"Analyzing data",
    "tool.actionVisual":"Creating a visual",
    "tool.actionRead":"Reading files",
    "tool.actionWrite":"Updating files",
    "tool.actionDefault":"Using a tool",
    "tool.details":"Details",
    "tool.copyCode":"Copy code",
    "tool.copyOutput":"Copy output",
    "tool.copySources":"Copy sources",
    "tool.copyCitation":"Copy citation",
    "tool.copied":"Copied",
    "tool.copyFailed":"Copy failed",
    /* P_viz-actions — native visualization card action buttons.
       Previously hardcoded Chinese in render/visualization.js —
       these keys localize the four actions plus the fallback
       retry button. */
    "viz.action.table":"Data",
    "viz.action.reset":"Reset view",
    "viz.action.download":"Download PNG",
    "viz.action.fullscreen":"Fullscreen",
    "viz.action.retry":"Retry locally",
    "share.linkExpired":"Link expired — start a new topic.",
    "share.creatingLink":"Creating link…",
    "share.failedCreate":"Failed to create link: {msg}",
    "share.failedRevoke":"Failed to revoke: {msg}",
    "share.copied":"Copied!",
    "share.copy":"Copy",
    "share.errorUnknown":"unknown error",
    "share.notFoundTitle":"Shared conversation not found",
    "share.notFoundMsg":"The link may be expired or invalid.",
    "share.readOnly":"Read-only",
    "topic.titleChat":"What can I help you with?",
    "topic.subChat":"",
    "topic.disclaimerChat":"Chat mode is a plain conversation.",
    "profile.savedAt":"Saved at {hh}:{mm}",
    "profile.instructionsSavedPlaceholder":"Reply in concise bullet points. Cite sources inline as [1], [2]. Avoid hedging language.",
    "profile.instructionsAboutPlaceholder":"e.g. I'm a backend engineer working on a payments product. I'm allergic to puns."
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
    /* P_lang-slogans — Tutor-mode hero was pinned English before; now
       translated so the whole app reads consistently in 中文.
       The chat-mode equivalents (`topic.titleChat` / `topic.subChat`)
       above are already localized, so Tutor now mirrors that. */
    "topic.title":"今天想探索什么？",
    "topic.subtitle":"",
    "topic.inputPlaceholder":"例如：我想了解机器学习是怎么工作的...",
    "topic.start":"开始",
    "topic.hint":"描述越具体效果越好",
    "topic.model":"模型",
    "topic.extensions":"扩展",
    /* P_chatgpt-landing — ChatGPT-style main page (2026-07-20) */
    "greeting.chat":"你好，{name}。",
    "greeting.tutor":"一起探索，{name}。",
    "greeting.guest":"访客",
    "sidebar.nav.new":"新聊天",
    "sidebar.nav.library":"文件库",
    "sidebar.nav.projects":"项目",
    "sidebar.nav.scheduled":"已安排",
    "sidebar.nav.plugins":"插件",
    "sidebar.nav.exam":"考试",
    "sidebar.nav.more":"更多",
    "sidebar.nav.soon":"即将",
    /* PR-A — More popover items */
    "sidebar.more.settings":"API 设置",
    "sidebar.more.display":"显示与主题",
    "sidebar.more.shortcuts":"键盘快捷键",
    "sidebar.more.signOut":"退出登录",
    "sidebar.more.soonScheduled":"定时任务 —— 即将上线",
    /* PR-B — Library panel */
    "sidebar.library.title":"资料库",
    "sidebar.library.files":"文件",
    "sidebar.library.artifacts":"作品",
    "sidebar.library.empty":"暂无文件。在聊天中上传文件后会显示在这里。",
    "sidebar.library.artifact.empty":"暂无作品。",
    /* PR-C — Spaces panel */
    "sidebar.spaces.title":"项目",
    "sidebar.spaces.empty":"暂无项目。创建一个项目来组织你的会话。",
    "sidebar.spaces.create":"新建项目",
    "sidebar.spaces.createName":"项目名称",
    "sidebar.spaces.createDesc":"描述（可选）",
    "sidebar.spaces.deleteConfirm":"确定删除此项目？",
    /* PR-D — Scheduled panel */
    "sidebar.scheduled.title":"定时任务",
    "sidebar.scheduled.empty":"暂无定时任务。点击 + 创建一个。",
    "sidebar.scheduled.create":"新建定时任务",
    "sidebar.scheduled.createTitle":"任务标题",
    "sidebar.scheduled.createPrompt":"提示词（可选）",
    "sidebar.scheduled.once":"一次",
    "sidebar.scheduled.daily":"每天",
    "sidebar.scheduled.weekly":"每周",
    "sidebar.scheduled.monthly":"每月",
    "sidebar.scheduled.custom":"自定义 (cron)",
    "sidebar.scheduled.statusPending":"待处理",
    "sidebar.scheduled.statusActive":"进行中",
    "sidebar.scheduled.statusPaused":"已暂停",
    "sidebar.scheduled.statusCompleted":"已完成",
    "sidebar.scheduled.statusFailed":"失败",
    /* PR-E — Plugins panel */
    "sidebar.plugins.title":"插件",
    "sidebar.plugins.browse":"浏览",
    "sidebar.plugins.empty":"暂无插件。浏览市场查找扩展。",
    "sidebar.plugins.marketplace":"插件市场",
    "sidebar.plugins.install":"安装",
    "sidebar.plugins.uninstall":"卸载",
    "sidebar.plugins.enabled":"已启用",
    "sidebar.plugins.disabled":"已禁用",
    "topbar.modeChat":"聊天",
    "topbar.modeTutor":"工作",
    "voice.soon":"语音输入即将上线",
    "voice.toast":"语音输入即将上线",
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
    "sidebar.searchPlaceholder":"搜索对话",
    "sidebar.recentSessions":"最近会话",
    "sidebar.new":"新建",
    "sidebar.mistakeBook":"错题本",
    "sidebar.all":"全部",
    "sidebar.recent":"最近",
    "sidebar.share":"分享",
    "sidebar.shareConversation":"分享对话",
    "sidebar.copy":"复制",
    /* P0.2 — 会话内查找（Ctrl-F） */
    "find.title":"在对话中查找",
    "find.placeholder":"在对话中查找…",
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
    "feedback.thanks":"感谢反馈",
    "feedback.improve":"收到 — 我们会改进",
    "feedback.notFound":"未找到消息",
    "feedback.saved":"已本地保存 — 恢复网络后将同步",
    "clipboard.copied":"已复制到剪贴板",
    "clipboard.failed":"复制失败",
    "share.linkLabel":"分享链接",
    "exam.title":"生成考试",
    "exam.back":"返回对话",
    "exam.backTitle":"返回对话",
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
    "tutor.diagSkip":"跳过",
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
    /* v3.0 design — mode banner (zh) */
    "tutor.modeChat":"对话模式",
    "tutor.modeTutor":"引导模式",
    "tutor.modeChatDesc":"普通对话，无教学引导",
    "tutor.modeTutorDesc":"AI 主动提问并跟踪你的学习",
    "tutor.modeSwitchToTutor":"切换到引导模式",
    "tutor.modeSwitchToChat":"切换到对话模式",
    /* Composer quick actions + reasoning effort + read-aloud (zh) */
    "composer.write":"撰写或编辑",
    "composer.research":"查找资料",
    "composer.write.hint":"描述你想撰写或编辑的内容",
    "composer.write.scaffold":"帮我撰写或编辑：",
    "composer.research.hint":"联网搜索已开启 — 输入你的研究问题",
    "composer.deepThinking":"深度思考",
    "composer.deepResearch":"深度研究",
    "composer.deepResearch.hint":"请在上方输入研究主题，然后点击发送。",
    "composer.exam":"生成测验",
    "picker.modelSection":"模型",
    "picker.effortSection":"思维强度",
    "picker.manageModels":"管理模型…",
    "picker.addModel":"添加模型…",
    "picker.noModels":"暂无模型。",
    "effort.label":"强度",
    "effort.high":"高",
    "effort.high.note":"更深入、更全面的思考",
    "effort.medium":"中",
    "effort.low":"低",
    "msg.readAloud":"朗读",
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
    /* v3.0 design — stage labels (zh) */
    "tutor.stageMotivate":"建立直觉",
    "tutor.stageDefine":"精确定义",
    "tutor.stageDevelop":"深入推导",
    "tutor.stageIllustrate":"应用示例",
    "tutor.stageExercise":"动手练习",
    "tutor.stageCheck":"阶段检查",
    "tutor.done":"[已完成]",
    /* U-H1 / U-H2 — session mode segmented control + header badge (zh). */
    "tutor.modeTutor":"导师",
    "tutor.modeChat":"对话",
    /* U-H4 — teaching-plan sub-topic mastery status labels (zh). */
    "tutor.statusBlank":"空白",
    "tutor.statusFuzzy":"模糊",
    "tutor.statusInternalized":"已内化",
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
    "tutor.submitAnswer":"提交",
    "chat.thinking":"思考中…",
    "chat.generating":"正在生成…",
    "chat.generatingQuestions":"正在生成问题…",
    "chat.generatingQ":"正在出第 {n}/{total} 题…",
    "chat.generatedQ":"已生成 {n}/{total} 题",
    "chat.knowledgeReady":"知识点已就绪",
    "common.loading":"加载中…",
    "common.saving":"保存中…",
    "common.thinking":"思考中…",
    "common.generating":"正在生成…",
    "common.ok":"确定",
    "chat.webSearchLabel":"网络搜索：",
    "chat.webSearchSources":"{n} 个来源",
    "chat.webSearchRefreshTimeout":"搜索刷新超时",
    "chat.webSearchResults":"最新网络搜索结果",
    "chat.webSearchFailed":"搜索失败",
    "auth.sessionExpired":"会话已过期，请重新登录。",
    "auth.checkInbox":"请检查邮箱",
    "auth.verificationLinkSent":"我们已向 <strong>{email}</strong> 发送验证链接。点击邮件中的按钮即可开始。链接 24 小时内有效。",
    "auth.resetLinkSent":"如果该邮箱存在账户，我们已发送重置链接。链接 1 小时内有效。",
    "auth.verifiedTitle":"邮箱已验证",
    "auth.verifiedMsg":"已登录，正在跳转到主页…",
    "auth.signinError":"登录失败",
    "auth.signupError":"注册失败",
    "auth.codeSentMsg":"验证码已发送到 <strong>{email}</strong>。10 分钟内有效。",
    "auth.signIn":"登录",
    "auth.sending":"发送中…",
    "auth.resetting":"重置中…",
    "auth.resetPassword":"重置密码",
    "auth.passwordTooShort":"密码至少需要 8 个字符。",
    "auth.passwordsDontMatch":"两次输入的密码不一致。",
    "auth.pleaseEnterEmail":"请输入您的邮箱。",
    "auth.wrongCredentials":"邮箱或密码错误。",
    "auth.loginFailedPrefix":"登录失败：",
    "auth.sendVerificationLink":"发送验证链接",
    "auth.sendResetLink":"发送重置链接",
    "auth.sendCode":"发送验证码",
    "auth.logIn":"登录",
    "exam.generating":"正在生成考卷…",
    "exam.generatingQ":"正在生成第 {n}/{total} 题…",
    "exam.generatingQSimple":"正在生成第 {n} 题…",
    "exam.cancel":"取消",
    "exam.preparing":"准备出题…",
    "exam.preparingSubtitle":"AI 正在为您出题，请稍候片刻",
    "exam.tryAgain":"重新出题",
    "exam.close":"关闭",
    "exam.cancelled":"已取消出题。",
    "exam.noModelsAvailable":"无可用模型",
    "exam.modelLabel":"生成模型",
    "exam.typeMc":"选择题",
    "exam.typeFb":"填空题",
    "exam.typeSa":"简答题",
    "exam.cancelledTitle":"已取消",
    "exam.answered":"已答",
    "exam.results":"考试成绩：{topic}",
    "exam.placeholderTopic":"e.g. Linear Algebra, Quantum Mechanics, World War II...",
    "exam.placeholderDifficulty":"beginner / intermediate / hard / expert / custom",
    "exam.placeholderInstructions":"Specific topics to cover, or leave blank for AI to decide...",
    "exam.placeholderAnswer":"Type your answer…",
    "exam.placeholderTopicZh":"如：线性代数、量子力学、二战…",
    "exam.placeholderDifficultyZh":"入门 / 中级 / 困难 / 专家 / 自定义",
    "exam.placeholderInstructionsZh":"具体说明要覆盖的知识点，留空则由 AI 决定…",
    "exam.placeholderAnswerZh":"输入你的答案…",
    "settings.saved":"已保存。当前激活：{name}。",
    "settings.savedFallback":"已保存。当前激活的提供商缺少模型——临时使用 mock 引擎。",
    "settings.noModels":"尚未配置任何模型——已使用 mock 引擎。",
    "settings.saveFailed":"保存失败：{msg}",
    "settings.unknownError":"未知错误",
    "settings.cleared":"已清空。内置的 Beagle 仍可用——选择一个模型即可开始。",
    "settings.signInFirst":"请先登录再保存 API 密钥。",
    "settings.rowMissing":"第 {n} 行缺少 URL 或模型。请修改后再试。",
    "settings.rowMissingKey":"新增的第 {n} 行需要 API 密钥。",
    "settings.apiKeyLimit":"您的 {tier} 计划已达 API 密钥上限（{max} 个）。请升级计划后继续添加。",
    "settings.refresh":"刷新中…",
    "settings.action.deleteAccount":"删除账户失败：{msg}",
    "common.thinkingLabel":"思考",
    "common.dayShort.sun":"日",
    "common.dayShort.mon":"一",
    "common.dayShort.tue":"二",
    "common.dayShort.wed":"三",
    "common.dayShort.thu":"四",
    "common.dayShort.fri":"五",
    "common.dayShort.sat":"六",
    "think.title":"思考过程",
    "think.thinking":"正在思考…",
    "think.connecting":"正在连接 AI…",
    "think.connectingShort":"连接中…",
    "think.wordCount":"{n} 字",
    "think.wordCountOne":"1 字",
    "think.toggle":"展开或收起思考过程",
    "profile.disclaimerTutor":"Socrates 通过提问帮助你思考，不会评判你的回答。",
    "tag.placeholder":"输入标签后按回车",
    "kb.placeholderNote":"写下你对本主题想记住的任何内容...",
    "prompt.placeholderTitle":"如：代码审查",
    "prompt.placeholderShortcut":"/my-template",
    "prompt.placeholderDesc":"一行简介",
    "prompt.placeholderBody":"插入到聊天输入框中的提示文本。用户在下方输入或粘贴真实内容，发送时会自动移除此前缀。",
    "prompt.placeholderSystem":"可选。每次启用该模板时作为隐藏的系统消息注入。告诉模型扮演什么角色、输入约定是什么、输出应该长什么样以及任何约束。留空则仅以普通用户消息发送模板正文。",
    "provider.placeholderLabel":"显示名（如：GPT-5.5）",
    "provider.placeholderUrl":"Base URL  (https://api.openai.com/v1)",
    "provider.placeholderKey":"API 密钥",
    "provider.placeholderModel":"模型 ID  (如：gpt-5.5、claude-opus-4-8、sonnet-4-6)",
    "usage.failed":"加载用量数据失败，请确认已登录。",
    "usage.failedGeneric":"加载用量数据失败。",
    "usage.loading":"加载用量数据…",
    "exam.noResponse":"模型无响应",
    "exam.failNoResponse":"生成失败：模型无响应",
    "exam.failed":"生成失败",
    "exam.failParse":"解析失败：模型返回格式异常",
    "exam.failParseHint":"请重试或更换模型",
    "exam.parseFailed":"解析失败",
    "exam.failNone":"生成失败：没有成功生成任何题目",
    "exam.questionsLabel":"题 ·",
    "exam.answeredLabel":"已答",
    "diag.analyzingTopic":"正在分析主题…",
    "diag.ready":"准备就绪",
    /* U-H3 — diagnostic generation cancel / timeout / retry prompt (zh). */
    "diag.cancel":"取消",
    "diag.timeoutTitle":"题目生成超时",
    "diag.retry":"重试",
    "diag.useBuiltin":"使用内置题目",
    "common.noResponseTimeout":"已等待 {sec} 秒未响应 — 请检查 API 可用性",
    "common.retry":"重试",
    "common.truncated":"（已截断）",
    "common.downloadFile":"[下载 {type}]",
    "tool.noOutput":"（无输出）",
    "tool.showFullOutput":"显示全部输出",
    "tool.collapseOutput":"收起输出",
    "tool.outputChars":"{n} 个字符",
    "tool.sourceForQuery":"“{query}”的 {n} 个来源",
    "tool.sourcesForQuery":"“{query}”的 {n} 个来源",
    "tool.linkUnavailable":"链接不可用",
    "tool.unavailableSource":"来源不可用",
    "tool.statusDone":"已完成",
    "tool.statusFailed":"失败",
    "tool.statusTimeout":"超时",
    "tool.statusRunning":"运行中",
    "tool.statusStopped":"已停止",
    "tool.groupWorking":"正在处理",
    "tool.groupComplete":"已使用工具",
    "tool.groupNeedsAttention":"工具需要处理",
    "tool.groupStopped":"工具运行已停止",
    "tool.actionSearch":"正在搜索网络",
    "tool.actionAnalyze":"正在分析数据",
    "tool.actionVisual":"正在生成图表",
    "tool.actionRead":"正在读取文件",
    "tool.actionWrite":"正在更新文件",
    "tool.actionDefault":"正在使用工具",
    "tool.details":"详情",
    "tool.copyCode":"复制代码",
    "tool.copyOutput":"复制输出",
    "tool.copySources":"复制全部来源",
    "tool.copyCitation":"复制引用",
    "tool.copied":"已复制",
    "tool.copyFailed":"复制失败",
    /* P_viz-actions (zh) — see en block for context. */
    "viz.action.table":"数据",
    "viz.action.reset":"重置视图",
    "viz.action.download":"下载 PNG",
    "viz.action.fullscreen":"全屏",
    "viz.action.retry":"本地重试",
    "share.linkExpired":"链接已过期 — 请开启新的会话。",
    "share.creatingLink":"正在创建链接…",
    "share.failedCreate":"创建链接失败：{msg}",
    "share.failedRevoke":"撤销链接失败：{msg}",
    "share.copied":"已复制！",
    "share.copy":"复制",
    "share.errorUnknown":"未知错误",
    "share.notFoundTitle":"未找到该共享会话",
    "share.notFoundMsg":"链接可能已过期或无效。",
    "share.readOnly":"只读",
    "topic.titleChat":"我能帮你什么？",
    "topic.subChat":"",
    "topic.disclaimerChat":"聊天模式为普通对话。",
    "profile.savedAt":"已保存 {hh}:{mm}",
    "profile.instructionsSavedPlaceholder":"例如：用简洁的项目符号回复。引用来源标为 [1]、[2]。避免模棱两可的措辞。",
    "profile.instructionsAboutPlaceholder":"例如：我是一名后端工程师，正在做支付产品。我讨厌双关语。"
  },
};
var _currentLang="en";
function t(key){var v=I18N[_currentLang]&&I18N[_currentLang][key];if(typeof v!=="undefined")return v;v=I18N.en[key];if(typeof v!=="undefined")return v;return key;}
function setLang(lang){
  if(!I18N[lang])return;
  _currentLang=lang;
  window._currentLang=lang;
  try{localStorage.setItem("socrates-lang-app",lang)}catch(_){}
  applyI18n();
  /* P_tutor-leak — applyI18n() rewrites #topicTitle / #topicSub /
     #topicDisclaimer using the current appMode. Without this call
     the topic-setup copy could drift if anything else touched those
     elements between mode-sync ticks. Cheap and idempotent. */
  try{if(typeof syncAppModeUI==="function")syncAppModeUI()}catch(_){}
  /* Update language toggle active state. Only en + zh are supported;
     removing ja/ko from this iteration avoids keeping dead UI states
     if the toggle HTML reverts. */
  var optionIds=["profileLangEn","profileLangZh"];
  for(var i=0;i<optionIds.length;i++){
    var el=document.getElementById(optionIds[i]);
    if(!el)continue;
    var optLang=optionIds[i].replace("profileLang","").toLowerCase();
    el.classList.toggle("active",optLang===lang);
  }
  /* Update the small "EN/中" label in the sidebar header so the
     quick-toggle button reflects the active language. */
  try{
    var lbl=document.getElementById("langToggleLabel");
    if(lbl){
      if(lang==="zh")lbl.textContent="中";
      else lbl.textContent="EN";
    }
  }catch(_){}
}
function applyI18n(){
  /* Translate all elements with data-i18n-key attribute */
  var els=document.querySelectorAll("[data-i18n-key]");
  for(var i=0;i<els.length;i++){
    var key=els[i].getAttribute("data-i18n-key");
    var val=t(key);
    if(val&&val!==key)els[i].textContent=val;
  }
  /* P_profile-lang-active — sync the profile modal language toggle's
     `active` class with the current language. The toggle's static HTML
     hard-codes "English" as `.active` so on first paint with
     `_currentLang === "zh"` the chip stayed on English until the user
     clicked. Sync here so both the sidebar quick-toggle and any consumer
     of applyI18n share one source of truth. setLang() also calls this
     block (kept its loop for redundancy with the sidebar path). */
  try{
    var langIds=["profileLangEn","profileLangZh"];
    for(var li=0;li<langIds.length;li++){
      var langEl=document.getElementById(langIds[li]);
      if(!langEl)continue;
      var langOpt=langIds[li].replace("profileLang","").toLowerCase();
      langEl.classList.toggle("active",langOpt===_currentLang);
    }
  }catch(_){}
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
  /* Topic-setup title/sub/disclaimer. syncAppModeUI() rewrote these
     as either the tutor-mode or chat-mode versions; re-route through
     t() but keep the mode-aware mapping so toggling the language
     doesn't revert them to the wrong mode's text.
     P_tutor-leak — appMode is a top-level `var` in main.js and is
     mirrored onto `window.appMode` at boot (see main.js:13243). It is
     NOT a field on `window.state` (state.js has no `appMode`), so
     reading `window.state.appMode` was always undefined and we fell
     back to "tutor" — silently flipping a chat-mode user into tutor
     copy on every language toggle. Read the real global and default
     to "chat" so a fresh page (window.appMode not yet set) doesn't
     paint tutor text. */
  var appMode=(typeof window!=="undefined"&&window.appMode)||"chat";
  var tt=document.getElementById("topicTitle");
  /* P_chatgpt-landing — #topicTitle is now the personalized greeting
     (renderGreeting from src/ui/greeting.js). When a localized
     greeting renderer is wired up, defer to it so the name survives
     language toggles. Otherwise fall back to the legacy static copy. */
  if(tt){
    if(typeof window.renderGreeting==="function")window.renderGreeting();
    else tt.textContent=t(appMode==="chat"?"topic.titleChat":"topic.title");
  }
  var ts=document.getElementById("topicSub");
  if(ts)ts.textContent=t(appMode==="chat"?"topic.subChat":"topic.subtitle");
  var tdisc=document.getElementById("topicDisclaimer");
  if(tdisc)tdisc.textContent=t(appMode==="chat"?"topic.disclaimerChat":"profile.disclaimerTutor");
  var tp=document.getElementById("topicInput");
  if(tp)tp.placeholder=t("topic.inputPlaceholder");
  var sb=document.getElementById("startBtn");
  if(sb)sb.textContent=t("topic.start");
  var el=document.getElementById("extensionsLabel");
  if(el)el.textContent=t("topic.extensions");
  var ev=document.getElementById("examViewTitle");
  if(ev&&window.state&&window.state._examInView)ev.textContent=ev.textContent; /* already localized by render */
  /* P_chatgpt-landing — the reasoning-effort trigger label (高/中/低) is
     driven by JS, not a data-i18n-key element, so refresh it here too. */
  if(typeof window.syncEffortUI==="function"){try{window.syncEffortUI();}catch(_){}}
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
