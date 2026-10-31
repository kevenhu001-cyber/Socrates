#!/usr/bin/env node
// Public marketing pages remain plain HTML: no runtime fetch, JS-only navigation,
// or build required by the static vhost. Run `npm run site:sync` after edits here.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../site/', import.meta.url));
// Bump whenever chrome.css / public.css / fonts.css / chrome.js / motion.js /
// locale.js change: the site serves them with `cache-control: immutable,
// max-age=604800`, so a returning browser keeps the old bytes for a week
// unless the query string changes.
const version = '20261031e1';
const appPages = new Set(['account', 'profile', 'api-keys', 'checkout']);
const appURL = 'https://app.topodrive.top';
const arrow = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 12 12 4M4 4h8v8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const globe = '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M3.2 10h13.6M10 3c2.2 2.3 3.2 4.6 3.2 7s-1 4.7-3.2 7c-2.2-2.3-3.2-4.6-3.2-7S7.8 5.3 10 3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
const socialIcons = {
  x: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/></svg>',
  github: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>',
};

const copy = {
  en: {
    nav: ['Product', 'Research', 'Principles', 'Learn', 'Developers', 'Pricing', 'Company'],
    home: 'Socrates home', primary: 'Primary navigation', mobile: 'Mobile navigation',
    menu: 'Open menu', close: 'Close menu', try: 'Try Socrates', login: 'Log in',
    language: '中文', languageTag: 'zh-CN', account: 'My account', contact: 'Contact',
    summaries: ['Learn &amp; practice', 'Research', 'Product &amp; resources', 'Company &amp; support', 'More'],
    groups: [
      [['Learn', [['/guide', 'Guide'], ['/documents', 'Documents'], ['/principles', 'Principles'], ['/announcements', 'Announcements']]],
        ['Practice', [['/product#recall', 'Recall'], ['/product#exam', 'Exam mode'], ['/product#mistake-book', 'Mistake book']]]],
      [['Research', [['/research', 'Research index'], ['/research/memory-recall/', 'Memory &amp; recall'], ['/research/explanation-evidence/', 'Explanation &amp; evidence'], ['/research/maps-preserve-path/', 'Maps preserve path']]],
        ['Open questions', [['/research/tutor-curiosity/', 'Tutor curiosity'], ['/research/honest-pause/', 'The honest pause'], ['/research/what-learners-keep/', 'What learners keep']]]],
      [['Product', [['/product', 'Socrates'], ['/pricing', 'Pricing'], ['/developers', 'Developers'], ['/api-keys', 'API keys']]],
        ['Resources', [['/openapi.json', 'OpenAPI'], ['https://status.topodrive.top', 'Status'], ['/llms.txt', 'llms.txt'], ['https://github.com/topodrive', 'GitHub']]]],
      [['Company', [['/about', 'About'], ['/contact', 'Contact'], ['/privacy', 'Privacy'], ['/terms', 'Terms']]],
        ['Support', [['/contact', 'Help center'], ['/account', 'Account'], ['/checkout', 'Billing']]]],
      [['More', [['/announcements', 'Stories'], ['/research', 'Field notes'], ['/guide', 'Academy'], ['/principles', 'Our principles']]],
        ['Get started', [[appURL, 'Try Socrates'], [appURL, 'Log in'], ['/pricing', 'Plans']]]],
    ],
    social: 'Social links', legal: 'Built for people who want to understand.',
    policies: 'Legal', policyLinks: [['/privacy', 'Privacy policy'], ['/terms', 'Terms of service']],
  },
  zh: {
    nav: ['产品', '研究', '原则', '学习', '开发者', '定价', '公司'],
    home: 'Socrates 首页', primary: '主导航', mobile: '移动导航',
    menu: '打开菜单', close: '关闭菜单', try: '试用 Socrates', login: '登录',
    language: 'English', languageTag: 'en', account: '我的账户', contact: '联系',
    summaries: ['学习与练习', '研究', '产品与资源', '公司与支持', '更多'],
    groups: [
      [['学习', [['/guide', '指南'], ['/documents', '文档'], ['/principles', '原则'], ['/announcements', '动态']]],
        ['练习', [['/product#recall', '回忆'], ['/product#exam', '考试模式'], ['/product#mistake-book', '错题本']]]],
      [['研究', [['/research', '研究索引'], ['/research/memory-recall/', '记忆与回忆'], ['/research/explanation-evidence/', '解释与证据'], ['/research/maps-preserve-path/', '地图保留路径']]],
        ['开放问题', [['/research/tutor-curiosity/', '导师的好奇心'], ['/research/honest-pause/', '诚实的停顿'], ['/research/what-learners-keep/', '学习者保留了什么']]]],
      [['产品', [['/product', 'Socrates'], ['/pricing', '定价'], ['/developers', '开发者'], ['/api-keys', 'API 密钥']]],
        ['资源', [['/openapi.json', 'OpenAPI'], ['https://status.topodrive.top', '服务状态'], ['/llms.txt', 'llms.txt'], ['https://github.com/topodrive', 'GitHub']]]],
      [['公司', [['/about', '关于'], ['/contact', '联系'], ['/privacy', '隐私'], ['/terms', '条款']]],
        ['支持', [['/contact', '帮助中心'], ['/account', '账户'], ['/checkout', '账单']]]],
      [['更多', [['/announcements', '故事'], ['/research', '现场笔记'], ['/guide', '学院'], ['/principles', '我们的原则']]],
        ['开始使用', [[appURL, '试用 Socrates'], [appURL, '登录'], ['/pricing', '套餐']]]],
    ],
    social: '社交链接', legal: '为真正想理解的人打造。',
    policies: '法律信息', policyLinks: [['/privacy', '隐私政策'], ['/terms', '服务条款']],
  },
};

function localHref(href, locale) {
  if (!href.startsWith('/') || /\.(?:json|txt)$/.test(href)) return href;
  return locale === 'zh' ? `/zh${href}` : href;
}

function brand(locale) {
  return `<a class="site-brand" href="${locale === 'zh' ? '/zh/' : '/'}" aria-label="${copy[locale].home}"><img src="/logo.png" width="24" height="24" alt=""><span class="site-brand-label">Socrates</span></a>`;
}

export function renderChrome(pathname, locale) {
  const text = copy[locale];
  const page = pathname.split('/').filter(Boolean)[0];
  const keys = ['product', 'research', 'principles', 'learn', 'developers', 'pricing', 'about'];
  const nav = keys.map((key, i) => `<a href="${localHref(`/${key}`, locale)}"${key === page ? ' aria-current="page"' : ''}>${text.nav[i]}</a>`).join('');
  const otherPath = locale === 'zh' ? pathname : `/zh${pathname}`;
  const language = `<a class="site-locale" href="${otherPath}" data-locale-switcher hreflang="${text.languageTag}" lang="${text.languageTag}">${text.language}</a>`;
  const questionShortcut = !page ? `\n      <a class="site-search" href="#askInputHero" aria-label="${locale === 'zh' ? '开始提问' : 'Ask a question'}"><svg class="home-icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-search"/></svg></a>` : '';
  const header = `<header class="site-header">
    <div class="site-chrome-shell site-header-inner">
      ${brand(locale)}
      <nav class="site-nav" aria-label="${text.primary}">${nav}</nav>${questionShortcut}
      <div class="site-header-actions">
        ${language}
        <a class="site-login" href="${appURL}">${text.login}</a>
        <a class="site-try" href="${appURL}">${text.try}${arrow}</a>
        <button class="site-menu-toggle" type="button" data-site-menu-toggle aria-controls="site-mobile-menu" aria-expanded="false" aria-label="${text.menu}" data-open-label="${text.menu}" data-close-label="${text.close}"><span></span><span></span></button>
      </div>
    </div>
    <div class="site-mobile-menu" id="site-mobile-menu" hidden>
      <nav aria-label="${text.mobile}">${nav}</nav>
      <div class="site-mobile-utilities"><a href="${appURL}">${text.try}</a><a href="${localHref('/account', locale)}">${text.account}</a><a href="${localHref('/contact', locale)}">${text.contact}</a>${language}</div>
    </div>
  </header>`;
  const columns = text.groups.map((groups, i) => `<details class="site-footer-col" open>
          <summary class="site-footer-summary">${text.summaries[i]}</summary>
${groups.map(([title, links]) => `          <div class="site-footer-group">
            <h2>${title}</h2>
${links.map(([href, label]) => `            <a href="${localHref(href, locale)}"${/\.(?:json|txt)$/.test(href) ? ' data-site-static' : ''}>${label}</a>`).join('\n')}
          </div>`).join('\n')}
        </details>`).join('\n        ');
  const policies = text.policyLinks.map(([href, label]) => `<a href="${localHref(href, locale)}">${label}</a>`).join('');
  const footerLanguage = `<a class="site-locale site-footer-locale" href="${otherPath}" data-locale-switcher hreflang="${text.languageTag}" lang="${text.languageTag}">${globe}<span class="locale-label">${text.language}</span></a>`;
  const footer = `<footer class="site-footer">
    <div class="site-chrome-shell site-footer-inner">
      <div class="site-footer-lead">
        ${brand(locale)}
        <p class="site-footer-tagline">${text.legal}</p>
      </div>
      <div class="site-footer-grid">
        ${columns}
      </div>
      <div class="site-footer-bottom">
        <p class="site-footer-legal">© 2026 Socrates</p>
        <nav class="site-footer-policies" aria-label="${text.policies}">${policies}</nav>
        <nav class="site-footer-social" aria-label="${text.social}"><a href="https://x.com/topodrive" target="_blank" rel="me noopener" aria-label="X">${socialIcons.x}</a><a href="https://github.com/topodrive" target="_blank" rel="me noopener" aria-label="GitHub">${socialIcons.github}</a><a href="https://www.youtube.com/@topodrive" target="_blank" rel="me noopener" aria-label="YouTube">${socialIcons.youtube}</a><a href="https://www.linkedin.com/company/topodrive" target="_blank" rel="me noopener" aria-label="LinkedIn">${socialIcons.linkedin}</a></nav>
        ${footerLanguage}
      </div>
    </div>
  </footer>`;
  return { header, footer };
}

async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? htmlFiles(path) : entry.name.endsWith('.html') ? [path] : [];
  }));
  return paths.flat().sort();
}

export async function syncChrome({ check = false } = {}) {
  let count = 0;
  const changed = [];
  for (const file of await htmlFiles(root)) {
    const relativePath = relative(root, file).replaceAll('\\', '/');
    const locale = relativePath.startsWith('zh/') ? 'zh' : 'en';
    const plainPath = relativePath.replace(/^zh\//, '');
    // Account/billing screens have their own app navigation and auth scripts.
    if (appPages.has(plainPath.replace(/\.html$/, ''))) continue;
    const pathname = `/${plainPath.replace(/index\.html$/, '').replace(/\.html$/, '')}`;
    const { header, footer } = renderChrome(pathname, locale);
    const source = await readFile(file, 'utf8');
    // Replace only the site-level elements, never article/app card headers.
    if (!/<header class="(?:home-site-header|hdr|ed-header|site-header)"/.test(source) ||
        !/<footer class="(?:home-footer|ftr|ed-footer|site-footer)"/.test(source)) {
      throw new Error(`Missing public chrome in ${relativePath}`);
    }
    const next = source
      .replace(/<header class="(?:home-site-header|hdr|ed-header|site-header)"[\s\S]*?<\/header>/, header)
      .replace(/<footer class="(?:home-footer|ftr|ed-footer|site-footer)"[\s\S]*?<\/footer>/, footer)
      .replace(/[ \t]*<link rel="stylesheet" href="\/chrome\.css[^\"]*">\r?\n?/g, '')
      .replace(/[ \t]*<link rel="stylesheet" href="\/public\.css[^\"]*">\r?\n?/g, '')
      .replace(/[ \t]*<link rel="stylesheet" href="[^\"]*fonts\.css[^\"]*">\r?\n?/g, (tag) => locale === 'zh' ? '' : tag)
      .replace(/[ \t]*<script src="\/chrome\.js[^\"]*"><\/script>\r?\n?/g, '')
      .replace(/[ \t]*<script src="\/motion\.js[^\"]*"><\/script>\r?\n?/g, '')
      .replace(/<body\b(?![^>]*\bdata-site-public)([^>]*)>/, '<body$1 data-site-public>')
      .replace(/(<script src="[^\"]*\/locale\.js)\?[^\"]*("><\/script>)/g, `$1?cb=${version}$2`)
      .replace(/\s*<\/head>/, `\n${locale === 'zh' ? `  <link rel="stylesheet" href="/fonts.css?cb=${version}">\n` : ''}  <link rel="stylesheet" href="/public.css?cb=${version}">\n  <link rel="stylesheet" href="/chrome.css?cb=${version}">\n</head>`)
      .replace(/\s*<\/body>/, `\n  <script src="/chrome.js?cb=${version}"></script>\n  <script src="/motion.js?cb=${version}"></script>\n</body>`);
    // Preserve existing whitespace around all non-generated content.
    if (source !== next) {
      changed.push(relativePath);
      if (!check) await writeFile(file, next);
    }
    count += 1;
  }
  if (check && changed.length) {
    throw new Error(`Public chrome is out of sync. Run npm run site:sync:\n${changed.join('\n')}`);
  }
  console.log(`Site chrome: ${count} public pages, ${changed.length} ${check ? 'out of sync' : 'updated'}.`);
  return changed;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await syncChrome({ check: process.argv.includes('--check') });
}
