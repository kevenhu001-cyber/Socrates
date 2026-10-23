#!/usr/bin/env node
// Public marketing pages remain plain HTML: no runtime fetch, JS-only navigation,
// or build required by the static vhost. Run `npm run site:sync` after edits here.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../site/', import.meta.url));
const version = '20261023u2';
const appPages = new Set(['account', 'profile', 'api-keys', 'checkout']);
const appURL = 'https://app.topodrive.top';
const arrow = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 12 12 4M4 4h8v8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

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
  const footer = `<footer class="site-footer">
    <div class="site-chrome-shell">
      <div class="site-footer-grid">
        ${columns}
      </div>
      <div class="site-footer-bottom">
        ${brand(locale)}
        <nav class="site-footer-social" aria-label="${text.social}"><a href="https://x.com/topodrive" target="_blank" rel="me noopener">X</a><a href="https://github.com/topodrive" target="_blank" rel="me noopener">GitHub</a><a href="https://www.youtube.com/@topodrive" target="_blank" rel="me noopener">YouTube</a><a href="https://www.linkedin.com/company/topodrive" target="_blank" rel="me noopener">LinkedIn</a></nav>
        <p class="site-footer-legal">© 2026 Socrates · ${text.legal}</p>
        ${language}
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
