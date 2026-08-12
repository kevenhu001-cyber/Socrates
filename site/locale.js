(function () {
  "use strict";

  /*
   * Socrates marketing-site locale layer.
   *
   * Two responsibilities:
   *   1. Persist the visitor's chosen language (en/zh) in localStorage so
   *      every subsequent page resolves to the same locale. Visiting a page
   *      whose URL does not match the stored preference is treated as a
   *      stale URL and silently rewritten via replace().
   *   2. Rewrite every internal navigation link on the page so that a
   *      visitor on /product who clicks "中文" goes to /zh/product (the
   *      Chinese version of the SAME page), not to /zh/ (the home page).
   *
   * The Chinese link text is "中文" (target = zh), the English link text is
   * "English" (target = en). Links that already target a specific locale
   * (href starts with /zh/ and label is "中文") are recognised via the
   * isLocaleLink helper.
   */

  var STORAGE_KEY = "socrates-lang";
  var LOCALES = { en: "en", zh: "zh" };

  function isLocale(value) {
    return value === LOCALES.en || value === LOCALES.zh;
  }

  function localeForPath(pathname) {
    return /^\/zh(?:\/|$)/.test(pathname || "") ? LOCALES.zh : LOCALES.en;
  }

  function readPreference() {
    try {
      var value = window.localStorage.getItem(STORAGE_KEY);
      return isLocale(value) ? value : null;
    } catch (error) {
      return null;
    }
  }

  function writePreference(locale) {
    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
    } catch (error) {
      /* Private browsing and blocked storage should not break navigation. */
    }
  }

  function currentLocale() {
    return readPreference() || localeForPath(window.location.pathname);
  }

  function isExternalHref(href) {
    return /^(?:mailto:|tel:|javascript:|data:|#|\?)/i.test(href || "");
  }

  function isCrossOriginHref(href) {
    if (!href) return true;
    return /^\/\//.test(href);
  }

  function withLocale(pathname, locale) {
    var path = pathname || "/";
    var isChinese = locale === LOCALES.zh;

    if (isChinese) {
      if (/^\/zh(?:\/|$)/.test(path)) return path;
      return path === "/" ? "/zh/" : "/zh" + path;
    }

    if (path === "/zh" || path === "/zh/") return "/";
    var stripped = path.replace(/^\/zh(?=\/|$)/, "");
    return stripped || "/";
  }

  function hrefFor(href, locale) {
    var targetLocale = isLocale(locale) ? locale : currentLocale();
    var rawHref = href == null ? window.location.href : String(href);

    if (isExternalHref(rawHref)) return rawHref;

    var url;
    try {
      url = new URL(rawHref, window.location.href);
    } catch (error) {
      return rawHref;
    }

    if (isCrossOriginHref(rawHref) && url.origin !== window.location.origin) {
      return rawHref;
    }
    if (url.origin !== window.location.origin) return rawHref;
    if (/^\/(?:api|assets)(?:\/|$)/.test(url.pathname)) return rawHref;

    url.pathname = withLocale(url.pathname, targetLocale);
    return url.pathname + url.search + url.hash;
  }

  function currentHref() {
    return window.location.pathname + window.location.search + window.location.hash;
  }

  function setLocale(locale, options) {
    if (!isLocale(locale)) return;
    writePreference(locale);

    /* Keep <html lang="..."> in sync so CSS hooks (html:lang(zh)) work
       immediately after the click, even before the new page loads. */
    try {
      document.documentElement.lang = locale === LOCALES.zh ? "zh-CN" : "en";
      document.documentElement.setAttribute("data-socrates-locale", locale);
      document.body && document.body.setAttribute("data-socrates-locale", locale);
    } catch (error) {
      /* DOM not ready yet — bootLocale() will sync it on the next pass. */
    }

    var target = hrefFor(currentHref(), locale);
    if (!options || options.navigate !== false) {
      if (target !== currentHref()) window.location.assign(target);
    }
  }

  function applyStoredPreference() {
    var stored = readPreference();
    var pageLocale = localeForPath(window.location.pathname);

    if (!stored) {
      writePreference(pageLocale);
      try {
        document.documentElement.setAttribute("data-socrates-locale", pageLocale);
        document.body && document.body.setAttribute("data-socrates-locale", pageLocale);
      } catch (error) { /* noop */ }
      return;
    }

    if (stored !== pageLocale) {
      var target = hrefFor(window.location.href, stored);
      if (target !== currentHref()) window.location.replace(target);
    } else {
      try {
        document.documentElement.setAttribute("data-socrates-locale", stored);
        document.body && document.body.setAttribute("data-socrates-locale", stored);
      } catch (error) { /* noop */ }
    }
  }

  function isLocaleLink(link, rawHref) {
    if (link.hasAttribute("data-socrates-locale") || link.hasAttribute("data-locale-switcher")) {
      return true;
    }

    var label = (link.textContent || "").trim();
    /* Match the language-switch anchor by either: its href pointing at the
       other locale's home, or its visible label being one of the canonical
       language labels. This is what makes the 中文 link in the marketing
       nav reliably behave as a language switcher. */
    var hrefPointsAtOtherHome =
      /\/zh\/(?:index)?(?:\/|$|\.html?$)/i.test(rawHref || "") ||
      /\/index(?:\.html?$|\/|$)/i.test(rawHref || "") && label === "English";
    var labelMatches =
      label === "中文" || label === "简体中文" ||
      label === "EN" || label === "English" || label === "英文";

    return hrefPointsAtOtherHome || labelMatches;
  }

  function setSwitchLabel(link, targetLocale) {
    var label = targetLocale === LOCALES.zh ? "中文" : "English";

    /* Only rewrite label text on actual anchor elements. The
       [data-socrates-locale] selector also matches the root <html> when
       applyStoredPreference() tags it for CSS hooks, and writing
       textContent on that would wipe out the entire page. */
    if (!link || link.tagName !== "A") {
      if (link && typeof link.setAttribute === "function") {
        link.setAttribute(
          "aria-label",
          targetLocale === LOCALES.zh ? "切换到中文" : "Switch to English"
        );
      }
      return;
    }

    var word = link.querySelector(".locale-label");
    if (word) {
      if (word.textContent !== label) word.textContent = label;
    } else {
      if (link.textContent !== label) link.textContent = label;
    }
    link.setAttribute(
      "aria-label",
      targetLocale === LOCALES.zh ? "切换到中文" : "Switch to English"
    );
  }

  function bindLocaleSwitch(link, targetLocale) {
    if (!link || link.tagName !== "A") return;
    if (link.getAttribute("data-locale-bound") === "true") return;
    link.addEventListener("click", function (event) {
      /* Left-click with a modifier opens in a new tab/window — let the
         browser handle that. Middle-click and cmd/ctrl-click bypass the
         preventDefault below naturally. */
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (event.button !== undefined && event.button !== 0) return;
      event.preventDefault();
      setLocale(targetLocale);
    });
    link.setAttribute("data-locale-bound", "true");
  }

  function normaliseBrand(brand) {
    if (!brand) return;

    var image = brand.querySelector("img");
    if (!image) {
      image = document.createElement("img");
      image.src = "/logo.png";
      image.width = 26;
      image.height = 26;
      image.alt = "Socrates logo";
      image.className = "ed-brand-mark";
      brand.insertBefore(image, brand.firstChild);
    } else {
      image.setAttribute("width", "26");
      image.setAttribute("height", "26");
      image.setAttribute("alt", "Socrates logo");
      image.classList.add("ed-brand-mark");
    }

    if (!brand.querySelector(".ed-brand-word")) {
      var word = document.createElement("span");
      word.className = "ed-brand-word";
      word.textContent = "Socrates";
      var textNodes = [];
      brand.childNodes.forEach(function (node) {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) textNodes.push(node);
      });
      textNodes.forEach(function (node) { node.remove(); });
      brand.appendChild(word);
    }

    brand.classList.add("socrates-brand-ready");
  }

  /*
   * Account shortcut — shown in the header on every app page so visitors
   * can jump from /product, /research, etc. directly into their account.
   * Footer link is added on pages that don't already include an
   * "Account" column.
   */
  function addAccountShortcuts() {
    var path = window.location.pathname.replace(/^\/zh/, "") || "/";
    var isAppPage = /^\/(?:account|api-keys|profile|checkout)(?:\.html)?(?:\/|$)/.test(path);
    var locale = currentLocale();
    var accountHref = hrefFor("/account", locale);
    var accountLabel = locale === LOCALES.zh ? "我的账户" : "My account";

    /* Header quick-entry — visible whenever the header actions row is
       rendered (desktop + tablet). Mobile uses the menu instead. */
    var actions = document.querySelector(".ed-header-actions");
    if (actions && !actions.querySelector(".ed-account-shortcut")) {
      var desktopLink = document.createElement("a");
      desktopLink.className = "ed-button-quiet ed-account-shortcut";
      desktopLink.href = accountHref;
      desktopLink.textContent = accountLabel;
      actions.insertBefore(desktopLink, actions.firstChild);
    }

    /* Mobile menu entry — kept off-screen on desktop via CSS, shown
       inside the open menu on mobile. */
    var menu = document.querySelector("[data-menu-panel]");
    if (menu && !menu.querySelector(".ed-account-menu-link")) {
      var menuLink = document.createElement("a");
      menuLink.className = "ed-account-menu-link";
      menuLink.href = accountHref;
      menuLink.textContent = accountLabel;
      menuLink.setAttribute("data-account-shortcut", "true");
      menu.appendChild(menuLink);
    }

    /* Footer link — only add to pages that don't already expose an
       Account column, so we don't duplicate the entry on app pages. */
    if (!isAppPage) {
      var footerTop = document.querySelector(".ed-footer-top");
      if (footerTop && !footerTop.querySelector(".ed-footer-account")) {
        var column = document.createElement("div");
        column.className = "ed-footer-column ed-footer-account";
        var heading = document.createElement("h2");
        heading.textContent = locale === LOCALES.zh ? "账户" : "Account";
        column.appendChild(heading);
        var accountAnchor = document.createElement("a");
        accountAnchor.href = accountHref;
        accountAnchor.textContent = accountLabel;
        column.appendChild(accountAnchor);
        footerTop.appendChild(column);
      }
    }
  }

  function enhanceLegacyLegalLayout() {
    var body = document.body;
    if (!body || !body.classList.contains("legal-page") || body.classList.contains("ed-site")) return;
    if (document.querySelector(".site-legal-layout")) return;

    var section = document.querySelector(".page > section .section-inner");
    if (!section) return;
    var legalSections = Array.prototype.slice.call(section.children).filter(function (node) {
      return node.classList && node.classList.contains("legal-section");
    });
    if (!legalSections.length) return;

    var toc = document.createElement("aside");
    toc.className = "site-legal-toc";
    var tocTitle = document.createElement("h2");
    tocTitle.textContent = "目录";
    var tocNav = document.createElement("nav");
    toc.append(tocTitle, tocNav);

    var content = document.createElement("div");
    content.className = "site-legal-body";
    Array.prototype.slice.call(section.children).forEach(function (node, index) {
      if (node.classList && node.classList.contains("legal-section")) {
        var heading = node.querySelector("h3");
        if (heading) {
          var id = node.id || "legal-section-" + (index + 1);
          node.id = id;
          var link = document.createElement("a");
          link.href = "#" + id;
          link.textContent = heading.textContent;
          tocNav.appendChild(link);
        }
      }
      content.appendChild(node);
    });

    section.classList.add("site-legal-layout");
    section.append(toc, content);
  }

  function localiseLinks() {
    var locale = currentLocale();
    var path = currentHref();

    /* 1) Switcher-style anchors (data-locale-switcher / .lang-switch / etc.)
       get their target locale, href, and click handler refreshed. */
    document.querySelectorAll(
      "[data-locale-switcher], .ed-header-language, .mk-nav-locale, .lang-switch, .nav-lang"
    ).forEach(function (link) {
      if (link.tagName !== "A") return;
      var targetLocale = locale === LOCALES.zh ? LOCALES.en : LOCALES.zh;
      link.setAttribute("data-socrates-locale", targetLocale);
      link.setAttribute("href", hrefFor(path, targetLocale));
      setSwitchLabel(link, targetLocale);
      bindLocaleSwitch(link, targetLocale);
    });

    /* 2) Locale anchors in the main nav (中文 / English) — recognised by
       their visible label or href. We rewrite their href to point at the
       CURRENT page in the other locale so the visitor lands on the
       Chinese translation of the same article, not the Chinese home. */
    document.querySelectorAll("a").forEach(function (link) {
      var rawHref = link.getAttribute("href");
      if (!rawHref || isExternalHref(rawHref)) return;

      if (isLocaleLink(link, rawHref)) {
        var targetLocale = locale === LOCALES.zh ? LOCALES.en : LOCALES.zh;
        link.setAttribute("data-socrates-locale", targetLocale);
        return;
      }

      if (!/^\s*(?:javascript:|mailto:|tel:)/i.test(rawHref) && rawHref.charAt(0) !== "#") {
        link.setAttribute("href", hrefFor(rawHref, locale));
      }
    });

    /* 3) Any element already tagged data-socrates-locale (locale-switch
       buttons, the nav 中文 link, footer language pills) gets its href
       recomputed against the current URL. We skip the root <html> and
       <body> tags — they only carry the attribute as a CSS hook, not as
       a clickable switcher. */
    document.querySelectorAll("[data-socrates-locale]").forEach(function (link) {
      if (link === document.documentElement || link === document.body) return;
      if (link.tagName !== "A") return;
      var targetLocale = link.getAttribute("data-socrates-locale");
      if (!isLocale(targetLocale)) return;
      link.setAttribute("href", hrefFor(path, targetLocale));
      setSwitchLabel(link, targetLocale);
      bindLocaleSwitch(link, targetLocale);
    });

    document.querySelectorAll(".ed-brand").forEach(normaliseBrand);
    addAccountShortcuts();
  }

  applyStoredPreference();

  window.SocratesLocale = {
    getLocale: currentLocale,
    setLocale: setLocale,
    hrefFor: hrefFor,
    currentHref: currentHref,
    localizeLinks: localiseLinks
  };

  function bootLocale() {
    enhanceLegacyLegalLayout();
    localiseLinks();

    if (!window.MutationObserver || !document.body) return;

    var pending = false;
    var observer = new MutationObserver(function () {
      /* Coalesce bursts of DOM changes into a single re-pass so a
         script that appends 30 nodes doesn't trigger 30 localiseLinks()
         runs. */
      if (pending) return;
      pending = true;
      window.requestAnimationFrame(function () {
        pending = false;
        localiseLinks();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootLocale);
  } else {
    bootLocale();
  }
})();