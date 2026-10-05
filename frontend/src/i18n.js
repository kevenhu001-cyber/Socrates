import {renderGreeting} from './ui/greeting.js';
import {syncThemeUI} from './displayPrefs.js';
import { reportSwallow } from './util/reportSwallow.ts';

var I18N={
  en:{
    "a11y.skipToContent":"Skip to content",
    /* chrome.* — static shell tooltips / aria labels (sidebar chrome, display
       popover, topbar model capsule, composer toolbar, overlay containers).
       Kept apart from feature-surface keys so a wording change here does not
       ripple into feature copy. Applied via data-i18n-title / -aria / -placeholder. */
    "chrome.accountAccess":"Account access",
    "chrome.passwordHint":"At least 8 characters",
    "chrome.repeatPassword":"Repeat your password",
    "chrome.closeSidebar":"Close sidebar",
    "chrome.openSidebar":"Open sidebar",
    "chrome.collapseSidebar":"Collapse sidebar",
    "chrome.expandSidebar":"Expand sidebar",
    "chrome.closeSidebarKbd":"Close sidebar (⌘B)",
    "chrome.openSidebarKbd":"Open sidebar (⌘B)",
    "chrome.collapseSidebarKbd":"Collapse sidebar (⌘B)",
    "chrome.expandSidebarKbd":"Expand sidebar (⌘B)",
    "chrome.toggleSidebar":"Toggle sidebar (⌘B)",
    "chrome.primaryNav":"Primary navigation",
    "chrome.displaySettings":"Display settings",
    "chrome.apiSettings":"API Settings",
    "chrome.backgroundGrid":"Background grid",
    "chrome.toggleBackgroundGrid":"Toggle background grid",
    "chrome.darkModeBg":"Dark mode BG",
    "chrome.lightModeBg":"Light mode BG",
    "chrome.darkModePageBg":"Dark mode page background",
    "chrome.lightModePageBg":"Light mode page background",
    "chrome.resetDarkBg":"Reset dark mode to theme default",
    "chrome.resetLightBg":"Reset light mode to theme default",
    "chrome.resizeSidebar":"Drag to resize sidebar",
    "chrome.sessionMode":"Session mode",
    "chrome.pluginWorkspace":"Plugin workspace",
    "chrome.pickModel":"Pick or configure the model for this conversation",
    "chrome.availableModels":"Available models",
    "chrome.shareConversation":"Share this conversation",
    "chrome.addToolsFiles":"Add tools and files",
    "chrome.voiceInput":"Voice input",
    "chrome.startVoiceInput":"Start voice input",
    "chrome.quickActions":"Quick actions",
    "chrome.previousMatch":"Previous match",
    "chrome.nextMatch":"Next match",
    "chrome.closeFind":"Close find",
    "chrome.jumpToNewReply":"Jump to new reply",
    "chrome.commandPalette":"Command palette",
    "chrome.shareChat":"Share chat",
    /* chrome.* — second batch: artifact/tool toolbars, library view, cmdk search. */
    "chrome.fullscreen":"Fullscreen",
    "chrome.download":"Download",
    "chrome.gridView":"Grid view",
    "chrome.listView":"List view",
    "chrome.attachments":"Attachments",
    "chrome.cmdkSearch":"Search sessions and messages…",
    "chrome.cmdkSearchAria":"Search sessions and messages",
    /* auth.* — static auth-gate copy (sign-in / register default views).
       Runtime button states already route through auth.* in src/auth/index.js;
       these cover the hard-coded static labels so the first screen a zh user
       sees is fully localized. */
    "auth.createAccount":"Create account",
    "auth.email":"Email",
    "auth.password":"Password",
    "auth.forgotPassword":"Forgot password?",
    "auth.guestMode":"Guest mode",
    "auth.or":"or",
    "auth.continueGithub":"Continue with GitHub",
    "auth.codeLoginLink":"Login with verification code",
    "auth.noAccount":"No account?",
    "auth.createOne":"Create one",
    "auth.registerLede":"Sign up with your email. We'll send a verification link — no codes to memorize.",
    "auth.alreadyVerified":"Already verified?",
    /* auth.* — remaining gate views (verify / reset / code-login). */
    "auth.verifySentPre":"We sent a verification link to ",
    "auth.verifySentPost":". Click the button in the email to start learning with Socrates. The link expires in 24 hours.",
    "auth.resendLink":"Resend the link",
    "auth.useDifferentEmail":"Use a different email",
    "auth.sendNewLink":"Send a new link",
    "auth.backToSignIn":"Back to sign in",
    "auth.verifyFailedTitle":"This link is invalid or expired",
    "auth.verifyFailedExpiredTitle":"This link has expired",
    "auth.verifyFailedMsg":"Verification links expire after 24 hours. Enter your email and we'll send a fresh one.",
    "auth.resetTitle":"Reset your password",
    "auth.resetLede":"Enter your email and we'll send a reset link.",
    "auth.forgotSentPre":"If an account exists for ",
    "auth.forgotSentPost":", we sent a password reset link. The link expires in 1 hour.",
    "auth.setNewPassword":"Set new password",
    "auth.setNewPasswordLede":"Choose a new password for your account.",
    "auth.newPassword":"New password",
    "auth.confirmPassword":"Confirm password",
    "auth.passwordUpdated":"Password updated",
    "auth.passwordUpdatedLede":"Your password has been reset successfully. Sign in with your new password.",
    "auth.codeLoginTitle":"Email code login",
    "auth.codeLoginLede":"Enter your email to receive an 8-character login code.",
    "auth.codeLabel":"8-character code",
    "auth.codeSentPre":"We sent a code to ",
    "auth.codeSentPost":". It expires in 10 minutes.",
    "auth.resendCode":"Resend code",
    "auth.signingIn":"Signing in…",
    "auth.loggingIn":"Logging in…",
    "auth.footnote":"Socrates asks questions to help you think. It does not judge your answers.",
    "chat.placeholder":"Type your thinking...",
    "chat.inputPlaceholder":"Ask Socrates",
    "chat.hint":"Shift+Enter for new line",
    "chat.send":"Send",
    /* P_composer-primary-split — the composer primary button is submit-only
     * and announces the live-turn action while a turn streams. */
    "chat.stop":"Stop generating",
    /* P_attachments — UI strings for the chat-input attachment chip
     * strip, paperclip button, and toast feedback. Kept short so
     * the chips don't wrap. */
    "chat.attach":"Attach files",
    "chat.attach.aria":"Attach files",
    "chat.attach.remove.aria":"Remove attachment",
    "chat.attach.maxReached":"You can attach up to 6 files per turn.",
    "chat.attach.imageTooLarge":"Image exceeds the {size} MB limit.",
    "chat.attach.pdfTooLarge":"PDF exceeds the 25 MB limit.",
    "chat.attach.unsupported":"This file type isn't supported. Images, text/code files, PDF, Office documents, EPUB, audio, and video are accepted.",
    "chat.attach.fileTooLarge":"File exceeds the 25 MB limit.",
    "chat.attach.duplicate":"This file is already attached.",
    "chat.attach.retry.aria":"Retry upload",
    "chat.attach.uploading":"Uploading",
    "chat.attach.failed":"Upload failed",
    "chat.attach.networkError":"Network error during upload.",
    "chat.attach.uploadTimeout":"Upload timed out.",
    "chat.attach.cancelled":"Upload cancelled.",
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
    /* P_cowork-landing — the landing composer opens the conversation, so it
       asks a question. The "/" affordance is discoverable from the slash
       menu itself and no longer has to carry the empty state. */
    "topic.inputPlaceholder":"Ask Socrates",
    "topic.start":"Begin",
    "topic.hint":"Be specific for better results",
    "topic.model":"Model",
    "topic.extensions":"Extensions",
    /* P_chatgpt-landing — ChatGPT-style main page (2026-07-20) */
    "greeting.chat":"What's the plan for today?",
    "greeting.tutor":"Let's explore.",
    /* Rotating landing greeting — renderGreeting picks one entry per open. */
    "greeting.chat.0":"What's the plan for today?",
    "greeting.chat.1":"What are we working on?",
    "greeting.chat.2":"What's on your mind?",
    "greeting.chat.3":"Where should we start?",
    "greeting.chat.4":"Ready when you are.",
    "greeting.chat.5":"What would you like to explore?",
    "greeting.chat.6":"How can I help?",
    "greeting.chat.7":"Let's get to it.",
    "greeting.tutor.0":"Let's explore.",
    "greeting.tutor.1":"What shall we figure out today?",
    "greeting.tutor.2":"What are you curious about?",
    "greeting.tutor.3":"Let's think it through.",
    "greeting.tutor.4":"What do you want to understand?",
    "greeting.tutor.5":"Ready for a good question?",
    /* Composer "+" menu. The five mobile rows were briefly hardcoded to
       Chinese inside ComposerToolsMenu.tsx; the copy belongs here so both
       locales stay in sync. */
    "composer.tools.heading":"Add to chat",
    "composer.tools.headingHint":"More tools",
    "composer.tools.more":"More tools",
    "composer.tools.less":"Show fewer",
    "composer.tools.mobile":"Tools",
    "composer.tools.mobileLess":"Hide tools",
    "composer.tools.webSearch":"Web search",
    "composer.webSearch.remove":"Web search, click to remove",
    "composer.webSearch.placeholder":"Search the web",
    "topbar.modelSwitcher":"Model and reasoning",
    "composer.tools.camera":"Camera",
    "composer.tools.photos":"Photos",
    "composer.tools.files":"Files",
    "composer.tools.createImage":"Create image",
    "composer.createImage.hint":"Describe an image to generate",
    "composer.createImage.connectRequired":"Connect Jimeng AI in Plugins to create an image.",
    "composer.tools.createSite":"Create site",
    "composer.createSite.hint":"Describe a page to build and publish",
    "composer.tools.plugins":"Plugins",
    "composer.tools.thinkDeeper":"Think deeper",
    "composer.tools.group.context":"Add context",
    "composer.tools.group.research":"Search & research",
    "composer.tools.group.create":"Create & analyze",
    "composer.tools.connectedApps":"Connected apps",
    "composer.tools.searchFooter":"Search tools and connected apps",
    "composer.tools.noMatch":"No matching actions.",
    "composer.tools.plugins.loading":"Loading connected apps…",
    "composer.tools.plugins.error":"Connected apps could not be loaded.",
    "composer.tools.plugins.retry":"Try again",
    "composer.tools.plugins.empty":"No connected apps yet.",
    "composer.tools.plugins.emptyHint":"Connect an app to add its context to a chat.",
    "composer.tools.plugins.noMatch":"No connected apps match this search.",
    "composer.tools.plugins.manage":"Manage apps",
    "composer.tools.webSearchHint":"Find current information on the web",
    "home.chip.projects":"Choose project",
    "home.chip.plugins":"Plugins",
    "home.explore.label":"Explore ideas",
    "home.explore.hint":"Swipe to explore",
    "sidebar.nav.kbd":"⌘K",
    "sidebar.nav.new":"New chat",
    "sidebar.nav.library":"Library",
    "sidebar.nav.projects":"Projects",
    "sidebar.nav.scheduled":"Scheduled",
    "sidebar.nav.plugins":"Plugins",
    "sidebar.nav.images":"Images",
    "sidebar.nav.assistants":"Assistants",
    "sidebar.nav.sites":"Sites",
    "sidebar.nav.skills":"Skills",
    "sidebar.nav.newBadge":"New",
    "sidebar.nav.exam":"Exam",
    "sidebar.nav.incognito":"Incognito chat",
    "sidebar.nav.more":"More",
    "sidebar.upgrade":"Upgrade",
    /* PR-A — More popover items */
    "sidebar.more.settings":"API settings",
    "sidebar.more.skills":"Skills & shortcuts",
    "plugins.skillsTab":"Skills",
    "plugins.pluginsTab":"Plugins",
    "sidebar.more.display":"Display & theme",
    "display.theme":"Theme",
    "display.themeLight":"Light",
    "display.themeDark":"Dark",
    "display.themeSystem":"System",
    "display.themeToggle":"Toggle theme",
    "sidebar.more.shortcuts":"Keyboard shortcuts",
    "sidebar.more.signOut":"Sign out",
    "sidebar.account.menu":"Account menu",
    "sidebar.account.profile":"Profile",
    "sidebar.account.settings":"Settings",
    "library.filter.images":"Images",
    "library.filter.all":"All",
    "library.filter.docs":"Documents",
    "library.filter.tables":"Tables",
    "library.filter.code":"Code",
    "library.filter.audio":"Audio",
    "library.filter.video":"Video",
    "library.filterByType":"Filter by file type",
    "library.emptyImages":"No images yet",
    "library.emptyImagesDesc":"Images you add will appear here.",
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
    /* P_composer-primary-split — voice.input retired with the primary's
       empty-state dictation. Dictation is announced by chrome.voiceInput on
       #composerMicBtn; the primary speaks chat.send / chat.stop. */
    "voice.listening":"Listening…",
    "voice.processing":"Processing voice input…",
    "voice.stop":"Stop voice input",
    "voice.cancel":"Cancel voice input",
    "voice.unsupported":"Voice input is not supported in this browser.",
    "voice.permission":"Please allow microphone access to use voice input.",
    "voice.error":"Voice input could not start. Please check microphone access.",
    "voice.noSpeech":"No speech detected.",
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
    "profile.archivedSessionsDesc":"Archived chats stay here for 30 days. Archive from a Recents row, then Restore or Delete forever.",
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
    /* P_cowork-landing — the session list heading. Keep the visible label
       aligned with the panel's actual contents instead of calling chat
       history "Tasks". */
    "sidebar.recentSessions":"Recents",
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
    "share.revoke":"× Revoke share link",
    "share.create":"Create share link",
    "share.copySource":"Copy source",
    "share.startChatFirst":"Start a chat first to share it",
    "share.projectChips":"Project chips ↑ — click to switch",
    "share.readOnlyBanner":"Read-only view — this is a shared conversation.",
    "share.projectPrefix":"Project: ",
    "search.noMatches":"No matches",
    "search.failed":"Search failed",
    "tags.maxTags":"Maximum 12 tags per session",
    "session.deleted":"Session deleted",
    "session.ctxShare":"Share",
    "session.ctxRename":"Rename",
    "session.ctxPin":"Pin chat",
    "session.ctxUnpin":"Unpin",
    "session.ctxCustomLabel":"Custom label",
    "session.ctxLabelSet":"Set",
    "session.ctxMoveToProject":"Move to project",
    "session.ctxDelete":"Delete",
    "session.ctxArchive":"Archive",
    "session.archived":"Session archived",
    "session.archiveFailed":"Archive failed: {msg}",
    "session.badgeExam":"Exam",
    "session.pinned":"Pinned",
    "session.editTags":"Edit tags",
    "session.moreActions":"Session actions",
    "session.filterByTag":"Filter by tag: {tag}",
    "session.empty":"No recent sessions yet.",
    "session.emptyHint":"Start a topic to begin.",
    "session.noSearchMatch":"No sessions match {query}.",
    "session.clearSearch":"Clear search",
    "session.loadListFailed":"Couldn't load sessions. Check your connection and try again.",
    "session.retry":"Retry",
    "session.noFilterMatch":"No sessions match the {filter} filter.",
    "session.clearFilter":"Clear filter",
    "session.showAllHint":"to see all sessions.",
    "scheduled.noNextRun":"No next run",
    "scheduled.today":"Today",
    "scheduled.tomorrow":"Tomorrow",
    "scheduled.loading":"Loading tasks…",
    "scheduled.workspaceEyebrow":"Workspace",
    "scheduled.title":"Scheduled",
    "scheduled.subtitle":"Let Socrates plan follow-ups, reminders, and recurring updates for you.",
    "scheduled.inputPlaceholder":"What should Socrates do, and when?",
    "scheduled.recommendations":"Suggestions",
    "scheduled.pickOne":"Start with a template",
    "scheduled.template.daily":"Daily briefing",
    "scheduled.template.dailyDesc":"Summarize the updates I care about each morning.",
    "scheduled.template.inbox":"Inbox check",
    "scheduled.template.inboxDesc":"Surface messages that need my attention.",
    "scheduled.template.research":"Weekly research pulse",
    "scheduled.template.researchDesc":"Compare the latest work in a topic I follow.",
    "scheduled.template.digest":"AI research digest",
    "scheduled.template.digestDesc":"Send the best new work every Friday.",
    "scheduled.template.project":"Project status",
    "scheduled.template.projectDesc":"Keep me posted on progress and blockers.",
    "scheduled.allTasks":"All tasks",
    "scheduled.activeOnly":"Active",
    "scheduled.yourTasks":"Your tasks",
    "scheduled.noActive":"No active tasks",
    "scheduled.noActiveDesc":"Paused and completed tasks are hidden.",
    "scheduled.empty":"Let Socrates follow up",
    "scheduled.emptyDesc":"Create a reminder, recurring briefing, or monitoring task.",
    "scheduled.createTask":"Create task",
    "scheduled.active":"Active",
    "scheduled.paused":"Paused",
    "scheduled.completed":"Complete",
    "scheduled.pause":"Pause",
    "scheduled.resume":"Resume",
    "scheduled.freq.once":"Once",
    "scheduled.freq.daily":"Daily",
    "scheduled.freq.weekly":"Weekly",
    "scheduled.freq.monthly":"Monthly",
    "scheduled.failed":"Failed",
    "scheduled.runNow":"Run now",
    "scheduled.runNowAria":"Run task now",
    "scheduled.delete":"Delete",
    "scheduled.deleteAria":"Delete task",
    "scheduled.lastRun":"Last run",
    "scheduled.signIn":"Sign in to schedule tasks.",
    "scheduled.loadFailed":"Tasks could not be loaded. Try again.",
    "scheduled.search":"Search tasks",
    "scheduled.new":"New",
    "scheduled.filter":"Filter tasks",
    "scheduled.all":"All",
    "scheduled.noMatch":"No matching tasks",
    "scheduled.noMatchDesc":"Try a different search.",
    "library.tabUploaded":"Uploaded",
    "library.tabCreated":"Created",
    "library.filterPlaceholder":"Search library",
    "library.tabRecommend":"Featured",
    "library.tabFavorite":"Favorites",
    "library.tabFolder":"Folders",
    "library.tabAll":"All",
    "library.new":"New",
    "library.untitled":"Untitled",
    "library.metaCreated":"Created",
    "library.clickToRename":"Click to rename",
    "library.rename":"Rename",
    "library.selectAll":"Select all",
    "library.selectedCount":"{n} selected",
    "library.deleteSelected":"Delete selected",
    "library.noMatch":"No matching items",
    "library.noMatchDesc":"Try a different search.",
    "library.directoryDesc":"Files and items you have added or created.",
    "library.upload":"Upload",
    "library.columnName":"Name",
    "library.columnModified":"Modified",
    "library.columnSize":"Size",
    "library.emptyFiles":"Your library is ready",
    "library.emptyFilesDesc":"Upload a file or attach one in a chat.",
    "library.emptyArtifacts":"No created items yet",
    "library.emptyArtifactsDesc":"Generated documents and artifacts will appear here.",
    "library.preview.file":"File",
    "library.preview.loading":"Loading file content…",
    "library.preview.failed":"Could not load this file.",
    "library.preview.truncated":"Only the first part of this file is shown.",
    "library.preview.artifactSource":"Created item source",
    "projects.empty":"Make space for ongoing work",
    "projects.emptyDesc":"Projects keep related chats, files, and instructions together.",
    "projects.directoryDesc":"Keep related chats, files, and instructions together.",
    "projects.noMatch":"No matching projects",
    "projects.noMatchDesc":"Try a different search.",
    "projects.filter":"Project filter",
    "projects.search":"Search projects",
    "projects.all":"All",
    "projects.owned":"Created by you",
    "projects.shared":"Shared with you",
    "projects.name":"Name",
    "projects.create":"Create project",
    "projects.new":"New",
    "projects.edit":"Edit",
    "plugins.title":"Connectors",
    "plugins.unavailable":"Apps are unavailable",
    "plugins.unavailableDesc":"Refresh and try again.",
    "plugins.connected":"Connected",
    "plugins.add":"Add plugin",
    "plugins.waitingAuth":"Waiting for authorization to finish",
    "plugins.refreshStatus":"Refresh status",
    "plugins.serverSetupNeeded":"Server setup needed",
    "plugins.connect":"Connect",
    "plugins.back":"Back",
    "plugins.installed":"Installed",
    "plugins.allPlugins":"All plugins",
    "plugins.search":"Search plugins",
    "plugins.noMatch":"No matching plugins",
    "plugins.tryDifferent":"Try a different search.",
    "plugins.installedEmpty":"No installed plugins yet",
    "plugins.installedEmptyDesc":"Apps you connect will appear here.",
    "plugins.browseAll":"Browse all plugins",
    "plugins.oauthNote":"OAuth tokens stay in the OOMOL gateway. Neither the browser nor the model receives a provider token.",
    "plugins.directoryDesc":"Connect apps so Socrates can use them in chat.",
    "plugins.public":"Public",
    "plugins.personal":"Personal",
    "plugins.popular":"Popular",
    "plugins.detail.back":"Back to plugins",
    "plugins.detail.backLabel":"Plugins",
    "plugins.detail.connected":"Connected",
    "plugins.detail.notConnected":"Not connected",
    "plugins.detail.unavailable":"Unavailable",
    "plugins.detail.useInChat":"Use in chat",
    "plugins.detail.manage":"Manage",
    "plugins.detail.connect":"Install & connect",
    "plugins.detail.about":"About",
    "plugins.detail.capabilities":"Capabilities",
    "plugins.detail.noCaps":"No published capabilities.",
    "plugins.detail.auth":"Authorization",
    "plugins.detail.authType":"Auth type",
    "plugins.detail.authApiKey":"API key",
    "plugins.detail.authCustom":"Custom credentials",
    "plugins.detail.authPublic":"Public — no sign-in needed",
    "plugins.detail.authOauth":"OAuth 2.0",
    "connectors.arxivTitle":"Search arXiv",
    "connectors.arxivSubtitle":"Explore public research preprints. No account connection is needed.",
    "connectors.researchTopic":"Research topic",
    "connectors.search":"Search",
    "connectors.tryAgain":"Try again shortly.",
    "connectors.arxivEmptyTitle":"Find a paper",
    "connectors.arxivEmptyHint":"Search by topic, method, author, or year.",
    "connectors.arxivSearching":"Searching arXiv…",
    "connectors.arxivNone":"No matching papers",
    "connectors.arxivNoneHint":"Try another research topic or author.",
    "connectors.arxivError":"arXiv could not be searched",
    "connectors.zoteroTitle":"Zotero library",
    "connectors.zoteroSubtitle":"Search the references connected to this account.",
    "connectors.zoteroSearchPh":"Title, author, or year",
    "connectors.zoteroLoading":"Loading references…",
    "connectors.zoteroNone":"No matching references",
    "connectors.zoteroNoneHint":"Try a title, author, or year.",
    "connectors.zoteroError":"References could not be loaded",
    "connectors.zoteroRetryHint":"Try reconnecting Zotero.",
    "plugins.new":"New and notable",
    "plugins.manage":"Manage",
    "plugins.manageDialog.status":"Status",
    "plugins.manageDialog.account":"Account",
    "plugins.manageDialog.updated":"Updated",
    "plugins.manageDialog.error":"Last error",
    "plugins.manageDialog.refresh":"Refresh",
    "plugins.manageDialog.disconnect":"Disconnect",
    "home.reviewProject":"Review a learning project",
    "home.browseMaterials":"Browse notes and materials",
    "home.connectApp":"Connect an app to this conversation",
    "plugins.setupTitle":"Connector service needs setup",
    "plugins.setupDesc":"Add OOMOL_PROJECT_API_KEY to the server environment. Authorization remains disabled until then.",
    "dialog.close":"Close",
    "dialog.optional":"Optional",
    "dialog.project.editTitle":"Edit project",
    "dialog.project.newTitle":"New project",
    "dialog.project.subtitle":"Give this work a home and a clear instruction.",
    "dialog.field.name":"Name",
    "dialog.field.description":"Description",
    "dialog.field.instructions":"Instructions",
    "dialog.field.color":"Color",
    "dialog.project.namePh":"Research, writing, a course…",
    "dialog.project.descPh":"What are you working toward?",
    "dialog.project.instrPh":"How should Socrates approach work in this project?",
    "dialog.project.save":"Save changes",
    "dialog.project.defaultDesc":"A focused place for related work.",
    "dialog.project.newChat":"New chat in project",
    "dialog.project.moveCurrent":"Move current chat here",
    "dialog.project.note":"Project instructions are saved with the project. Files and chats remain available as shared context for future work.",
    "dialog.project.runsTitle":"Workspace agent runs",
    "dialog.project.runsLoading":"Loading agent runs…",
    "dialog.project.runsEmpty":"Runs, approvals, and generated artifacts will appear here.",
    "dialog.project.runsFailed":"Run history is unavailable right now.",
    "dialog.project.untitledRun":"Untitled agent task",
    "dialog.project.viewRun":"View run",
    "dialog.project.runDetails":"Agent run",
    "dialog.project.runDetailsLoading":"Loading the execution record…",
    "dialog.project.noRunSummary":"No summary was saved.",
    "dialog.project.artifacts":"Created artifacts",
    "dialog.project.activity":"Activity",
    "dialog.task.editTitle":"Edit task",
    "dialog.task.newTitle":"Schedule a task",
    "dialog.task.subtitle":"Choose what should run and when to check back.",
    "dialog.task.field":"Task",
    "dialog.task.titlePh":"Send me a weekly study plan",
    "dialog.task.prompt":"Prompt",
    "dialog.task.promptPh":"What should Socrates do when this task runs?",
    "dialog.task.repeat":"Repeat",
    "dialog.task.agent":"Agent",
    "dialog.task.nativeAgent":"Socrates · native tools",
    "dialog.task.codexAgent":"Pi Agent · project workspace",
    "dialog.task.project":"Project",
    "dialog.task.noProject":"No project",
    "dialog.task.codexNote":"Pi Agent scheduled runs work inside the selected project workspace with server-enforced disk limits.",
    "dialog.task.firstRun":"First run",
    "dialog.task.note":"Tasks run in the background. Each result is saved as a chat in Recents.",
    "dialog.task.save":"Save task",
    "session.deleteFailed":"Delete failed",
    "session.archiveFirst":"Archive the session first (use Archive on the Recents row).",
    "session.inboxPermanent":"The Inbox project is permanent",
    "feedback.thanks":"Thanks for the feedback",
    "feedback.improve":"Got it — we'll improve",
    "feedback.notFound":"Message not found",
    "feedback.saved":"Saved locally — will sync when back online",
    "clipboard.copied":"Copied to clipboard",
    "clipboard.failed":"Copy failed",
    "share.linkLabel":"Share link",
    "exam.title":"Generate Exam",
    "exam.generate":"Generate Exam",
    "exam.topic":"Topic",
    "exam.difficulty":"Difficulty",
    "exam.count":"Number of questions",
    "exam.types":"Question types",
    "exam.instructions":"Detailed instructions (optional)",
    "exam.submit":"Submit for Grading",
    "exam.new":"New Exam",
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
    /* v3.0 design — mode banner (§11). Keys tutor.modeChat /
       tutor.modeTutor live further down; the duplicates that used to
       sit here were shadowed and have been removed. */
    "tutor.modeChatDesc":"Plain conversation, no scaffolding",
    "tutor.modeTutorDesc":"AI asks, follows up, and tracks what you know",
    "tutor.modeSwitchToTutor":"Switch to Tutor",
    "tutor.modeSwitchToChat":"Switch to Chat",
    /* Composer quick actions + reasoning effort + read-aloud */
    "composer.write":"Write or edit",
    "composer.research":"Find resources",
    "home.quick.upload":"Add images or files",
    "home.quick.write":"Write or edit",
    "home.quick.research":"Search the web",
    "home.quick.dismiss":"Dismiss quick action",
    "composer.menu.upload":"Upload files",
    "composer.menu.skills":"Skills & shortcuts",
    "composer.menu.skillsHint":"Create your own",
    "composer.write.hint":"Describe what you'd like to write or edit",
    "composer.write.scaffold":"Help me write or edit: ",
    "composer.research.hint":"Web search is on — ask your research question",
    "composer.deepThinking":"Deep thinking",
    "composer.explore":"Explore",
    "composer.exploreHint":"Scope → batch search → report",
    "composer.explore.planning":"Scoping the question…",
    "composer.deepResearch":"Deep Research",
    "composer.deepResearch.hint":"Enter a research topic above, then press send.",
    "composer.exam":"Generate exam",
    "composer.analyze":"Analyze data",
    "composer.menu.heading":"Add to this message",
    "composer.menu.headingHint":"Choose a workflow",
    "composer.menu.create":"Create",
    "composer.menu.investigate":"Investigate",
    "composer.menu.learn":"Learn",
    "composer.menu.uploadHint":"Images, PDFs, notes and data",
    "composer.canvas.edit":"Edit",
    "composer.canvas.done":"Done",
    "composer.canvas.copy":"Copy",
    "composer.canvas.iterate":"Iterate",
    "composer.canvas.fullscreen":"Fullscreen",
    "composer.canvas.original":"Original",
    "composer.canvas.editedView":"Edited",
    "composer.canvas.edited":"Edited",
    "composer.writeHint":"Draft, rewrite and polish",
    "composer.researchHint":"Search and compare evidence",
    "composer.deepResearchHint":"Plan → search → read → report",
    "composer.analyzeHint":"Calculate, chart and export",
    "composer.analyze.planning":"Preparing the analysis…",
    "composer.examHint":"Blueprint, questions and grading",
    "picker.modelSection":"Model",
    "picker.effortSection":"Reasoning",
    "picker.manageModels":"Manage models…",
    "picker.addModel":"Add a model…",
    "picker.noModels":"No models yet.",
    "effort.label":"Thinking",
    "effort.high":"High",
    "effort.high.note":"Deeper, more thorough thinking",
    "effort.medium":"Medium",
    "effort.low":"Low",
    "chatconfig.title":"Chat settings",
    "chatconfig.models":"Models",
    "chatconfig.model":"Model",
    "chatconfig.noModels":"No models yet.",
    "chatconfig.effort":"Reasoning effort",
    "chatconfig.speed":"Speed",
    "chatconfig.speed.standard":"Standard",
    "chatconfig.speed.fast":"Fast",
    "chatconfig.speed.standardHint":"Works with every configured model",
    "chatconfig.speed.fastHint":"Prefers low-latency service; falls back automatically",
    "chatconfig.manageModels":"Manage models",
    "toast.speedFallback":"This model doesn't support fast mode — used standard speed",
    "toast.mockFallback":"No model is configured — showing sample prompts instead of AI replies. Add a model in Settings.",
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
    "settings.title":"API Configuration",
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
    "think.reviewingContext":"Reviewing the context…",
    "think.organizingAnswer":"Organizing the response…",
    "think.stillWorking":"Still working — this response is taking a little longer…",
    "think.wordCount":"{n} words",
    "think.wordCountOne":"1 word",
    "think.toggle":"Toggle thinking",
    "think.panelTitle":"Thought process",
    "think.openPanel":"View thinking process",
    "think.panelEmpty":"The model has not started thinking yet.",
    "think.closePanel":"Close thinking panel",
    "think.inlineThinkDivider":"— inline thinking —",
    "artifact.title":"Artifact",
    "artifact.close":"Close artifact preview",
    "artifact.openPreview":"Open in Artifacts",
    "artifact.htmlMeta":"Sandboxed HTML preview",
    "artifact.imageMeta":"Image preview",
    "artifact.imageAlt":"Generated image",
    "artifact.htmlAlt":"Generated HTML preview",
    "artifact.noInlinePreview":"This file opens in a separate tab.",
    "artifact.openFile":"Open file",
    "profile.disclaimerTutor":"Socrates asks questions to help you think. It does not judge your answers.",
    "tag.placeholder":"Add a tag and press Enter",
    "kb.placeholderNote":"Write anything you want to remember about this sub-topic...",
    /* P_kb-i18n — the knowledge-boundary detail panel (ui/knowledgeDetail.js)
     * was the last surface still hardcoding English. zh is the default
     * locale, so every label below was showing up untranslated in the
     * product's flagship knowledge feature. The status badge reuses the
     * existing tutor.status* keys rather than adding a second vocabulary:
     * the same "internalized" node must not read 已内化 in the plan
     * sidebar and 已掌握 in its own detail panel. */
    "kb.questions":"{n} Qs",
    "kb.go":"→ Go",
    "kb.goTitle":"Jump the chat to this knowledge point",
    "kb.confidence":"Confidence",
    "kb.confidenceSet":"Set confidence to {n}",
    "kb.systemNote":"System note",
    "kb.noSystemNote":"No system note yet.",
    "kb.yourNote":"Your note",
    "kb.history":"Snapshot history",
    "kb.noHistory":"No snapshots yet.",
    /* P_mistakes-i18n — mistakeBook.js (ui/) had the same gap as the
     * knowledge detail panel: raw English literals plus the internal
     * mistake.type enum echoed straight into the card meta. The mistake
     * book is one of the four structural moat features, so it ships in
     * the default locale like everything else. */
    "mistakes.empty":"No mistakes yet.",
    "mistakes.emptyHint":"Wrong quiz picks and incorrect practice attempts will land here for review.",
    "mistakes.filterEmptyResolved":"No resolved mistakes yet. Redo a mistake and mark it conquered once you get it right.",
    "mistakes.filterEmptyOther":"Nothing in this filter. Switch to “all” to see every mistake.",
    "mistakes.conquered":"conquered",
    "mistakes.redo":"Redo",
    "mistakes.redoneOne":"Redone once",
    "mistakes.redoneMany":"Redone {n} times",
    "mistakes.type.quiz":"Quiz",
    "mistakes.type.practice":"Practice",
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
    "usage.title":"Token Usage",
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
    "confirm.newSession.title":"Start a new session?",
    "confirm.newSession.msg":"You have an active session. Starting a new one will save your progress to Recents.",
    "confirm.switchMode.title":"Switch to {mode} mode?",
    "confirm.switchMode.msg":"Switching will end this session and save it to Recents. You can pick it back up there any time.",
    "confirm.deleteForever.title":"Delete this session forever?",
    "confirm.deleteForever.msg":"This permanently erases \"{title}\". Messages, knowledge graph, and mistake book entries are gone. This cannot be undone.",
    "confirm.clearConversations.title":"Clear conversations?",
    "confirm.clearConversations.msg":"This removes all local chat history from this browser. Your account data stays on the server.",
    "confirm.clearApiSettings.title":"Clear API settings?",
    "confirm.clearApiSettings.msg":"This removes all configured API providers and keys. You'll need to reconfigure them.",
    "confirm.deleteAccount.title":"Delete your account?",
    "confirm.deleteAccount.msg":"This permanently deletes your account, all chat sessions, and all saved settings. This cannot be undone.",
    "confirm.deleteTemplate.title":"Delete template?",
    "confirm.deleteTemplate.msg":"This removes your custom template. Built-ins stay.",
    "confirm.deleteItems.title":"Delete {n} {label}?",
    "confirm.label.files":"files",
    "confirm.label.artifacts":"artifacts",
    "confirm.cannotUndo":"This cannot be undone.",
    "confirm.deleteProject.title":"Delete this project?",
    "confirm.deleteProject.msg":"This permanently deletes the project's chats, files, artifacts, and memories. This cannot be undone.",
    "confirm.deleteScheduled.title":"Delete this scheduled task?",
    "confirm.deleteFile.title":"Delete this file?",
    "confirm.deleteFile.msg":"It will be removed from your library.",
    "confirm.disconnectApp.title":"Disconnect this app?",
    "confirm.disconnectApp.msg":"Socrates will remove the stored connection.",
    "toast.deleteSomeFailed":"Could not delete some items",
    "toast.renamed":"Renamed",
    "toast.renameFailed":"Could not rename",
    "toast.connectorNoForm":"This connector is missing a credential form.",
    "toast.projectUpdated":"Project updated",
    "toast.projectCreated":"Project created",
    "toast.projectSaveFailed":"Could not save project",
    "toast.projectDeleted":"Project deleted",
    "toast.projectDeleteFailed":"Could not delete project",
    "toast.fileOpenFailed":"Could not open this file.",
    "toast.chatMoved":"Current chat moved to project",
    "toast.chatMoveFailed":"Could not move the current chat",
    "toast.taskUpdated":"Task updated",
    "toast.taskScheduled":"Task scheduled",
    "toast.taskSaveFailed":"Could not save task",
    "toast.taskPaused":"Task paused",
    "toast.taskResumed":"Task resumed",
    "toast.taskUpdateFailed":"Could not update task",
    "toast.taskDeleted":"Task deleted",
    "toast.taskDeleteFailed":"Could not delete task",
    "toast.taskRunStarted":"Running task…",
    "toast.taskRunDone":"Task ran — see Recents for the result",
    "toast.taskRunFailed":"Could not run task",
    "toast.artifactsOpenHint":"Artifacts can be opened from the chat where they were created.",
    "toast.fileDeleted":"File deleted",
    "toast.fileDeleteFailed":"Could not delete file",
    "toast.fileAdded":"File added to Library",
    "toast.filesAdded":"{n} files added to Library",
    "toast.uploadFailed":"Some files could not be uploaded",
    "toast.zoteroConnected":"Zotero connected",
    "toast.appConnected":"App connected",
    "toast.appDisconnected":"App disconnected",
    "toast.appDisconnectFailed":"Could not disconnect app",
    "toast.shareStartFirst":"Start a chat first to share it",
    "toast.loadingSessions":"Loading sessions…",
    "toast.noRetryTarget":"No previous user message to retry.",
    "chat.stopped":"Response stopped",
    "chat.resend":"Resend",
    "toast.movedToProject":"Moved to {name}",
    "toast.moveSessionFailed":"Could not move session",
    "toast.typeTextFirst":"Type or paste the text to process, then send.",
    "toast.messageNotFound":"Message not found",
    "toast.savedOffline":"Saved locally — will sync when back online",
    "toast.projectSwitched":"Project: {name}",
    "session.loadFailed":"Failed to load session: {msg}. Please try again.",
    "session.notFound":"Session not found or could not be loaded.",
    "session.deleteFailedRefresh":"Delete failed: {msg} - refreshing.",
    "session.deleteFailedMsg":"Delete failed: {msg}",
    "incognito.on":"Incognito on · this chat won't be saved",
    "incognito.off":"Incognito off",
    "tool.noOutput":"(no output)",
    "tool.running":"Tool running…",
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
    "agent.stepCommand":"Ran a command",
    "agent.stepCommandDone":"Ran",
    "agent.stepRead":"Read files",
    "agent.stepFileChange":"Edited files",
    "agent.stepSearch":"Searched the web",
    "agent.stepMcp":"Called an MCP tool",
    "agent.stepPlan":"Updated the plan",
    "agent.stepOutput":"Output",
    "agent.stepFailed":"Failed",
    "agent.elapsed":"Elapsed",
    "tool.groupWorking":"Working",
    "tool.groupComplete":"Used tools",
    "tool.groupNeedsAttention":"Tool needs attention",
    "tool.groupStopped":"Tool run stopped",
    "tool.groupExploring":"Exploring",
    "tool.groupExplored":"Explored",
    "tool.metaActiveOfTotal":"{active} of {total} tools",
    "tool.metaFailedOfTotal":"{failed} of {total} failed",
    "tool.metaToolCount":"{n} tools",
    "tool.metaToolCountOne":"1 tool",
    "tool.actionSearch":"Searching the web…",
    "tool.actionCode":"Executing code…",
    "tool.actionAnalyze":"Analyzing data…",
    "tool.actionVisual":"Visualizing data…",
    "tool.actionFetch":"Reading the page…",
    "tool.actionPlan":"Drafting a plan…",
    "tool.actionSpec":"Drafting a spec…",
    "tool.actionSite":"Building and publishing the site…",
    "tool.actionRead":"Reading files",
    "tool.actionWrite":"Updating files",
    "tool.actionDefault":"Using a tool",
    /* P_search-status — inline completion labels shown in the thinking
       pill after a search tool_result lands (ChatGPT-style feedback). */
    "tool.searchDone":"Found {n} web results",
    "tool.searchEmpty":"No web results found",
    "tool.searchFailed":"Web search failed",
    "tool.doneAnalyze":"Analyzed data",
    "tool.doneVisual":"Created a visual",
    "tool.doneFetch":"Read the page",
    "tool.donePlan":"Drafted a plan",
    "tool.doneSpec":"Drafted a spec",
    "tool.doneSite":"Site published",
    "tool.siteFailed":"Site creation failed",
    "tool.doneRead":"Read files",
    "tool.doneWrite":"Edited files",
    "tool.doneWriteFiles":"Edited {n} files",
    "tool.fileSummaryReview":"Review changes",
    "tool.doneDefault":"Finished using tool",
    "tool.actionCodex":"Working in the workspace…",
    "tool.doneCodex":"Finished the workspace task",
    "tool.actionInitWorkspace":"Initializing the workspace…",
    "tool.doneInitWorkspace":"Workspace ready",
    "tool.codexFailed":"The workspace task failed",
    "tool.codexApproval":"The workspace agent needs your approval",
    "tool.codexCommandApproval":"The agent wants to run a command",
    "tool.codexFileApproval":"The agent wants to change files",
    "tool.codexApprovalCopy":"Review the action before it continues.",
    "tool.awaitingApproval":"Waiting for your decision",
    "tool.sendingApproval":"Saving your decision…",
    "tool.approvalAccepted":"Approved",
    "tool.approvalDeclined":"Declined",
    "tool.approvalFailed":"Could not save the decision. Try again.",
    "tool.approveOnce":"Allow once",
    "tool.approveRun":"Allow this run",
    "tool.decline":"Decline",
    "tool.stopRun":"Stop run",
    "tool.runStopped":"Stop requested",
    "tool.action":"Action",
    "tool.reason":"Reason",
    "tool.path":"Workspace",
    "tool.actionFailed":"Tool call failed",
    "tool.details":"Details",
    "tool.arguments":"Arguments",
    "tool.result":"Result",
    "tool.sources":"Sources",
    "tool.errorDetails":"Error details",
    "tool.noDetails":"No additional details.",
    "tool.copyCode":"Copy code",
    "tool.copyOutput":"Copy output",
    "tool.copySources":"Copy sources",
    "tool.copyCitation":"Copy citation",
    "tool.copied":"Copied",
    "tool.copyFailed":"Copy failed",
    "tool.groupSearchDone":"Found {n} sources · {m} searches",
    "tool.groupSearchEmpty":"No results · {m} searches",
    "tool.groupCodeDone":"Executed {m} runs",
    "tool.groupVisualDone":"Created {m} visuals",
    "tool.groupDone":"Used {m} tools",
    "tool.failedCount":"{n} failed",
    /* P_declarative-tool-run — copy for react/tool-run. Every label carries an
       object taken from the call's own arguments ("Read moe.py", "Searched
       \"…\""), because a bare verb ("Read files") made two different calls
       render identically and forced the reader to expand the row. `{}`
       placeholders are filled by tf() in react/tool-run/labels.ts — the
       legacy t() takes no arguments. */
    "tool.searchingFor":"Searching \"{query}\"…",
    "tool.searchedFor":"Searched \"{query}\"",
    "tool.searchFailedFor":"Search failed: {query}",
    "tool.nSources":"{n} sources",
    "tool.nSourceOne":"1 source",
    "tool.readingHost":"Reading {host}…",
    "tool.fetchedHost":"Read {host}",
    "tool.readingFile":"Reading {file}…",
    "tool.readFile":"Read {file}",
    "tool.creatingFile":"Creating {file}…",
    "tool.createdFile":"Created {file}",
    "tool.editingFile":"Editing {file}…",
    "tool.editedFile":"Edited {file}",
    "tool.ranCode":"Ran Python",
    "tool.ranCommand":"Ran a command",
    "tool.usedToolOn":"{tool} · {target}",
    "tool.actionFailedOn":"Failed: {target}",
    "tool.nActions":"{n} actions",
    "tool.readFiles":"Read {files}",
    "tool.readNFiles":"Read {n} files",
    "tool.exploredFiles":"Edited {files}",
    "tool.editedNFiles":"Edited {n} files",
    /* P_cowork-landing — clause set for a mixed tool run ("Ran 2 commands,
       read 4 files, edited a file"). A run that touches more than one kind of
       work used to collapse to a bare "Explored", which named nothing the
       reader could act on. Each bucket owns its verb so the clause list also
       reads correctly in languages that do not share English's word order;
       `tool.clauseJoin` is the separator between clauses. */
    "tool.clauseJoin":", ",
    "tool.clauseRanCommands":"ran {n} commands",
    "tool.clauseRanCommandOne":"ran a command",
    "tool.clauseReadFiles":"read {n} files",
    "tool.clauseReadFileOne":"read a file",
    "tool.clauseEditedFiles":"edited {n} files",
    "tool.clauseEditedFileOne":"edited a file",
    "tool.clauseCreatedFiles":"created {n} files",
    "tool.clauseCreatedFileOne":"created a file",
    "tool.clauseSearched":"searched {n} times",
    "tool.clauseSearchedOne":"searched the web",
    "tool.clauseRanCode":"ran {n} code blocks",
    "tool.clauseRanCodeOne":"ran code",
    "tool.files":"Files",
    "tool.errorCode":"Error code",
    "tool.retryable":"Retryable",
    "tool.retryableYes":"Retryable — safe to run again",
    "tool.retryableNo":"Not retryable — change the arguments first",
    "tool.retry":"Retry search",
    "tool.techDetails":"Technical details",
    "tool.hideTechDetails":"Hide technical details",
    "tool.showAll":"Show all ({n} chars)",
    "tool.showLess":"Show less",
    "tool.copy":"Copy",
    /* P_viz-actions — native visualization card action buttons.
       Previously hardcoded Chinese in render/visualization.js —
       these keys localize the four actions plus the fallback
       retry button. */
    "viz.action.table":"Data",
    "viz.table.item":"Item",
    "viz.table.value":"Value",
    "viz.table.detail":"Detail",
    "viz.table.function":"Function",
    "viz.table.expression":"Expression",
    "viz.table.domain":"Domain",
    "viz.table.autoDomain":"Automatic domain",
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
    "topic.disclaimerChat":"Socrates can make mistakes. Check important information.",
    "profile.savedAt":"Saved at {hh}:{mm}",
    "profile.instructionsSavedPlaceholder":"Reply in concise bullet points. Cite sources inline as [1], [2]. Avoid hedging language.",
    "profile.instructionsAboutPlaceholder":"e.g. I'm a backend engineer working on a payments product. I'm allergic to puns.",
    /* Cookie consent banner */
    "consent.title":"We respect your privacy",
    "consent.message":"We use strictly necessary cookies to make Socrates work. Non-essential cookies (for example analytics) are only placed after you choose to allow them.",
    "consent.accept":"Accept all",
    "consent.essential":"Essential only",
    "consent.learnMore":"Privacy policy"
  },
};
var _currentLang="zh";
/* P_perf-i18n-split — the zh table (~39 KB) ships as its own async chunk
   (src/i18n/zh.js). It is fetched in parallel with the boot auth fetches
   for zh users (the default locale), or on first setLang("zh") for en
   users. Until it lands, t() falls back to the en table; the boot-loading
   mask hides the brief English flash, and auth/boot.js gives the chunk a
   bounded grace before revealing any UI. */
var _zhReady=null;
function ensureZh(){
  if(I18N.zh)return Promise.resolve();
  if(!_zhReady){
    _zhReady=import("./i18n/zh.js").then(function(m){I18N.zh=m.zh||m.default||m;}).catch(function(err){_zhReady=null;try{console.error("[i18n] zh locale failed to load",err)}catch(e){reportSwallow(e, 'i18n.ensureZh.logError'); /* ignore */}});
  }
  return _zhReady;
}
function t(key){var v=I18N[_currentLang]&&I18N[_currentLang][key];if(typeof v!=="undefined")return v;v=I18N.en[key];if(typeof v!=="undefined")return v;return key;}
function setLang(lang){
  if(!I18N[lang]){
    /* zh may still be in flight — apply as soon as it lands. */
    if(lang==="zh"){ensureZh().then(function(){if(I18N.zh)setLang("zh")});}
    return;
  }
  _currentLang=lang;
  window._currentLang=lang;
  try{document.documentElement.lang=lang==="zh"?"zh":"en";}catch(e){reportSwallow(e, 'i18n.setLang.documentLang'); }
  try{localStorage.setItem("socrates-lang-app",lang)}catch(e){reportSwallow(e, 'i18n.setLang.persist'); }
  applyI18n();
  /* P_tutor-leak — applyI18n() rewrites #topicTitle / #topicSub /
     #topicDisclaimer using the current appMode. Without this call
     the topic-setup copy could drift if anything else touched those
     elements between mode-sync ticks. Cheap and idempotent. */
  try{if(typeof syncAppModeUI==="function")syncAppModeUI()}catch(e){reportSwallow(e, 'i18n.setLang.syncAppModeUI'); }
  /* Update language toggle active state. Only en + zh are supported;
     removing ja/ko from this iteration avoids keeping dead UI states
     if the toggle HTML reverts. */
  var optionIds=["profileLangEn","profileLangZh"];
  for(var i=0;i<optionIds.length;i++){
    var el=document.getElementById(optionIds[i]);
    if(!el)continue;
    var optLang=optionIds[i].replace("profileLang","").toLowerCase();
    var active=optLang===lang;
    el.classList.toggle("active",active);
    el.setAttribute("aria-pressed",active?"true":"false");
  }
  /* Update the small "EN/中" label in the sidebar header so the
     quick-toggle button reflects the active language. */
  try{
    var lbl=document.getElementById("langToggleLabel");
    if(lbl){
      if(lang==="zh")lbl.textContent="中";
      else lbl.textContent="EN";
    }
  }catch(e){reportSwallow(e, 'i18n.setLang.toggleLabel'); }
  /* Notify React-owned surfaces (Tiptap composer placeholders) that the
     active language changed, so they can re-localize without a reload. */
  try{
    if(typeof CustomEvent!=="undefined"){
      document.dispatchEvent(new CustomEvent("socrates:langchange",{detail:{lang:lang}}));
    }
  }catch(e){reportSwallow(e, 'i18n.setLang.langChangeEvent'); }
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
      var langActive=langOpt===_currentLang;
      langEl.classList.toggle("active",langActive);
      langEl.setAttribute("aria-pressed",langActive?"true":"false");
    }
  }catch(e){reportSwallow(e, 'i18n.applyI18n.profileLangChips'); }
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
  /* The selected theme label is generated from the active preference, so
     refresh it after a language switch alongside the static selector copy. */
  if(typeof syncThemeUI === "function"){
    try{syncThemeUI()}catch(e){reportSwallow(e, 'i18n.applyI18n.syncThemeUI'); /* theme UI may not be mounted yet */ }
  }
  /* Placeholder / value updates — done selectively for now. */
  var ci=document.getElementById("composerRoot");
  if(ci){
    var _cv=document.getElementById("chatView");
    var _inChat=!!_cv&&!_cv.classList.contains("hidden");
    ci.setAttribute("aria-label",t(_inChat?"chat.placeholder":"topic.inputPlaceholder"));
  }
  var ch=document.getElementById("chatInputHint");
  if(ch)ch.textContent=t("chat.hint");
  /* Topic-setup title/sub/disclaimer. syncAppModeUI() rewrote these
     as either the tutor-mode or chat-mode versions; re-route through
     t() but keep the mode-aware mapping so toggling the language
     doesn't revert them to the wrong mode's text.
     P_tutor-leak — appMode is a top-level `var` in main.js and is
     mirrored onto `window.appMode` at boot (see main.js:13243). It is
     NOT a field on `window.state` (state/store.js has no `appMode`), so
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
    if(typeof renderGreeting==="function")renderGreeting();
    else tt.textContent=t(appMode==="chat"?"topic.titleChat":"topic.title");
  }
  var ts=document.getElementById("topicSub");
  if(ts)ts.textContent=t(appMode==="chat"?"topic.subChat":"topic.subtitle");
  var tdisc=document.getElementById("topicDisclaimer");
  if(tdisc)tdisc.textContent=t(appMode==="chat"?"topic.disclaimerChat":"profile.disclaimerTutor");
  var cpb=document.getElementById("composerPrimaryBtn");
  if(cpb&&!cpb.classList.contains("chat-stop")&&!cpb.classList.contains("agent-stop")){
    var composerLabel=t(cpb.classList.contains("active")?"chat.send":"chrome.startVoiceInput");
    cpb.setAttribute("aria-label",composerLabel);
    cpb.setAttribute("title",composerLabel);
    if(typeof window.updateComposerBtn==="function"){
      try{window.updateComposerBtn();}catch(e){reportSwallow(e, 'i18n.applyI18n.updateComposerBtn'); }
    }else{
      cpb.disabled=false;
    }
  }
  var el=document.getElementById("extensionsLabel");
  if(el)el.textContent=t("topic.extensions");
  /* Exam content is generated dynamically, so static data-i18n scanning
     cannot update it. Repaint its UI chrome while preserving form values,
     generated questions and answers. */
  if(window.stateStore.read("_examInView")&&typeof window.refreshExamI18n==="function"){
    try{window.refreshExamI18n()}catch(e){reportSwallow(e, 'i18n.applyI18n.refreshExam'); }
  }
  /* P_chatgpt-landing — the reasoning-effort trigger label (高/中/低) is
     driven by JS, not a data-i18n-key element, so refresh it here too. */
  if(typeof window.syncEffortUI==="function"){try{window.syncEffortUI();}catch(e){reportSwallow(e, 'i18n.applyI18n.syncEffortUI'); }}
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
  /* The zh table may still be in flight (async chunk) — validate the
     stored value against the locale NAMES, not I18N membership, or a
     stored "zh" would be wiped as "stale" before the chunk lands. */
  if(s==="en"||s==="zh"){
    _currentLang=s;
  }else if(!s){
    /* No preference recorded yet — persist the default so the
       next load picks up the same value instead of leaving the
       slot empty. */
    try{localStorage.setItem("socrates-lang-app",_currentLang)}catch(e){reportSwallow(e, 'i18n.bootstrap.persistDefault'); }
  }else{
    /* Stale value (e.g. user downgraded and we removed a locale) —
     * overwrite with the default so the entry stays canonical. */
    try{localStorage.removeItem("socrates-lang-app");localStorage.setItem("socrates-lang-app",_currentLang)}catch(e){reportSwallow(e, 'i18n.bootstrap.resetStale', 'expected'); }
  }
}catch(e){reportSwallow(e, 'i18n.bootstrap.readPref', 'expected'); }
/* Fetch the zh chunk in parallel with boot for zh users; en users never
   pay for it until they toggle. When it lands, run the full setLang path
   so JS-rendered strings (greeting, topic copy, toggles) repaint too. */
if(_currentLang==="zh"){
  ensureZh().then(function(){if(_currentLang==="zh"){try{setLang("zh")}catch(e){reportSwallow(e, 'i18n.bootstrap.zhRetry'); /* applyI18n retry covers stragglers */ }}});
}
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
  document.documentElement.lang=_currentLang==="zh"?"zh":"en";
  applyI18n();
}catch(e){reportSwallow(e, 'i18n.bootstrap.initialApply'); }

/* Expose i18n functions as globals for main.js and other modules. */
window._currentLang = _currentLang;
window.t = t;
window.setLang = setLang;
window.applyI18n = applyI18n;
/* auth/boot.js awaits this (bounded) before revealing UI so zh users
   never see an English first paint. Always a Promise. */
window.__i18nReady = _zhReady || Promise.resolve();
