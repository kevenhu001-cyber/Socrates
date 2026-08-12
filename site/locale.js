(function () {
  "use strict";

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
    return /^(?:mailto:|tel:|javascript:|data:|\/\/|#|\?)/i.test(href || "");
  }

  function withLocale(pathname, locale) {
    var path = pathname || "/";
    var isChinese = locale === LOCALES.zh;

    if (isChinese) {
      if (/^\/zh(?:\/|$)/.test(path)) return path;
      return path === "/" ? "/zh/" : "/zh" + path;
    }

    if (path === "/zh" || path === "/zh/") return "/";
    return path.replace(/^\/zh(?=\/|$)/, "") || "/";
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
      return;
    }

    if (stored !== pageLocale) {
      var target = hrefFor(window.location.href, stored);
      if (target !== currentHref()) window.location.replace(target);
    }
  }

  function isLocaleLink(link, rawHref) {
    if (link.hasAttribute("data-socrates-locale") || link.hasAttribute("data-locale-switcher")) {
      return true;
    }

    var label = (link.textContent || "").trim();
    return /(?:^|\/)zh(?:\/|$)/.test(rawHref || "") &&
      (label === "中文" || label === "简体中文" || label === "EN" || label === "English");
  }

  function setSwitchLabel(link, targetLocale) {
    var label = targetLocale === LOCALES.zh ? "中文" : "English";
    var word = link.querySelector(".locale-label");
    if (word) {
      if (word.textContent !== label) word.textContent = label;
    } else {
      if (link.textContent !== label) link.textContent = label;
    }
    link.setAttribute("aria-label", targetLocale === LOCALES.zh ? "切换到中文" : "Switch to English");
  }

  function normaliseBrand(brand) {
    if (!brand) return;

    var image = brand.querySelector("img");
    if (!image) {
      image = document.createElement("img");
      image.src = "/logo.png";
      image.width = 24;
      image.height = 24;
      image.alt = "";
      brand.insertBefore(image, brand.firstChild);
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

  function addAccountShortcuts() {
    var path = window.location.pathname.replace(/^\/zh/, "") || "/";
    var isAppPage = /^\/(?:account|api-keys|profile|checkout)(?:\.html)?(?:\/|$)/.test(path);
    if (!isAppPage) return;

    var locale = currentLocale();
    var accountHref = hrefFor("/account", locale);
    var accountLabel = locale === LOCALES.zh ? "我的账户" : "My account";
    var actions = document.querySelector(".ed-header-actions");

    if (actions && !actions.querySelector(".ed-account-shortcut")) {
      var desktopLink = document.createElement("a");
      desktopLink.className = "ed-button-quiet ed-account-shortcut";
      desktopLink.href = accountHref;
      desktopLink.textContent = accountLabel;
      actions.insertBefore(desktopLink, actions.firstChild);
    }

    var menu = document.querySelector("[data-menu-panel]");
    if (menu && !menu.querySelector(".ed-account-menu-link")) {
      var menuLink = document.createElement("a");
      menuLink.className = "ed-account-menu-link";
      menuLink.href = accountHref;
      menuLink.textContent = accountLabel;
      menuLink.setAttribute("data-account-shortcut", "true");
      menu.appendChild(menuLink);
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

    document.querySelectorAll(
      "[data-locale-switcher], .ed-header-language, .mk-nav-locale, .lang-switch, .nav-lang"
    ).forEach(function (link) {
      var targetLocale = locale === LOCALES.zh ? LOCALES.en : LOCALES.zh;
      link.setAttribute("data-socrates-locale", targetLocale);
      link.setAttribute("href", hrefFor(currentHref(), targetLocale));
      setSwitchLabel(link, targetLocale);
      if (link.getAttribute("data-locale-bound") !== "true") {
        link.addEventListener("click", function (event) {
          event.preventDefault();
          setLocale(targetLocale);
        });
        link.setAttribute("data-locale-bound", "true");
      }
    });

    document.querySelectorAll("a").forEach(function (link) {
      var rawHref = link.getAttribute("href");
      if (!rawHref || isExternalHref(rawHref)) return;

      if (isLocaleLink(link, rawHref)) {
        link.setAttribute("data-socrates-locale", locale === LOCALES.zh ? LOCALES.en : LOCALES.zh);
        return;
      }

      if (!/^\s*(?:javascript:|mailto:|tel:)/i.test(rawHref) && rawHref.charAt(0) !== "#") {
        link.setAttribute("href", hrefFor(rawHref, locale));
      }
    });

    document.querySelectorAll("[data-socrates-locale]").forEach(function (link) {
      var targetLocale = link.getAttribute("data-socrates-locale");
      if (!isLocale(targetLocale)) return;
      link.setAttribute("href", hrefFor(currentHref(), targetLocale));
      setSwitchLabel(link, targetLocale);
      if (link.getAttribute("data-locale-bound") !== "true") {
        link.addEventListener("click", function (event) {
          event.preventDefault();
          setLocale(targetLocale);
        });
        link.setAttribute("data-locale-bound", "true");
      }
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
    var observer = new MutationObserver(function (mutations) {
      var hasNewNodes = mutations.some(function (mutation) { return mutation.addedNodes && mutation.addedNodes.length; });
      if (hasNewNodes) localiseLinks();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootLocale);
  } else {
    bootLocale();
  }
})();
