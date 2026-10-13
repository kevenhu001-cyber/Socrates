function resolveDocument(doc) {
  return doc || (typeof document !== 'undefined' ? document : null);
}

function closeMobileConversationMenu(doc, restoreFocus) {
  var menu = doc && doc.getElementById('mobileConversationMoreMenu');
  var button = doc && doc.getElementById('mobileConversationMoreBtn');
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  if (button) button.setAttribute('aria-expanded', 'false');
  if (restoreFocus && button && typeof button.focus === 'function') button.focus();
}

function labelFromTarget(target, fallback) {
  if (!target) return fallback;
  return target.getAttribute('aria-label') || target.getAttribute('title') || fallback;
}

function ensureMobileConversationActions(doc) {
  var right = doc.querySelector('.top-bar-right');
  var compose = doc.getElementById('mobileNewChatBtn');
  if (!right || !compose) return null;

  var button = doc.getElementById('mobileConversationMoreBtn');
  if (!button) {
    button = doc.createElement('button');
    button.type = 'button';
    button.id = 'mobileConversationMoreBtn';
    button.className = 'mobile-conversation-more-btn';
    button.setAttribute('aria-label', 'Conversation actions');
    button.setAttribute('title', 'Conversation actions');
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>';
    compose.insertAdjacentElement('afterend', button);
  }

  var menu = doc.getElementById('mobileConversationMoreMenu');
  if (!menu) {
    menu = doc.createElement('div');
    menu.id = 'mobileConversationMoreMenu';
    menu.className = 'mobile-conversation-more-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Conversation actions');
    menu.hidden = true;
    menu.innerHTML = [
      '<button type="button" role="menuitem" data-mobile-conversation-action="find">',
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
      '<span>Find in conversation</span></button>',
      '<button type="button" role="menuitem" data-mobile-conversation-action="share">',
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="m16 6-4-4-4 4"/><path d="M12 2v13"/></svg>',
      '<span>Share</span></button>',
    ].join('');
    doc.body.appendChild(menu);
  }

  if (button.dataset.bound !== 'true') {
    button.dataset.bound = 'true';
    button.addEventListener('click', function (event) {
      event.stopPropagation();
      if (!menu.hidden) {
        closeMobileConversationMenu(doc, false);
        return;
      }
      var findTarget = doc.getElementById('findBtn');
      var shareTarget = doc.getElementById('shareBtn');
      var findLabel = menu.querySelector('[data-mobile-conversation-action="find"] span');
      var shareLabel = menu.querySelector('[data-mobile-conversation-action="share"] span');
      if (findLabel) findLabel.textContent = labelFromTarget(findTarget, 'Find in conversation');
      if (shareLabel) shareLabel.textContent = labelFromTarget(shareTarget, 'Share');
      menu.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      var rect = button.getBoundingClientRect();
      var view = doc.defaultView;
      var viewportWidth = view ? view.innerWidth : 390;
      var menuWidth = Math.min(224, Math.max(176, viewportWidth - 24));
      var left = Math.max(12, Math.min(viewportWidth - menuWidth - 12, rect.right - menuWidth));
      menu.style.width = menuWidth + 'px';
      menu.style.left = left + 'px';
      menu.style.top = Math.round(rect.bottom + 8) + 'px';
      var first = menu.querySelector('[role="menuitem"]');
      if (first && typeof first.focus === 'function') first.focus();
    });

    menu.addEventListener('click', function (event) {
      var action = event.target.closest('[data-mobile-conversation-action]');
      if (!action) return;
      var targetId = action.dataset.mobileConversationAction === 'find' ? 'findBtn' : 'shareBtn';
      closeMobileConversationMenu(doc, false);
      var target = doc.getElementById(targetId);
      if (target && typeof target.click === 'function') target.click();
    });

    doc.addEventListener('click', function (event) {
      if (menu.hidden || menu.contains(event.target) || button.contains(event.target)) return;
      closeMobileConversationMenu(doc, false);
    });
    doc.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || menu.hidden) return;
      event.stopPropagation();
      closeMobileConversationMenu(doc, true);
    });
  }

  return { button: button, menu: menu };
}

export function setConversationChrome(active, doc) {
  /* P_mobile-topbar — the mobile mode switcher (#mobileMode) and the
     incognito toggle (#mobileIncognitoBtn) live in the new top-bar, not
     in the legacy .chat-top-bar selectors below. They are only useful
     while the user is composing the first message (topic-setup screen);
     once a conversation starts they should be hidden so the chat-view
     header reads cleanly. */
  var d = resolveDocument(doc);
  if (!d) return;

  var desktopActions = d.querySelectorAll('.chat-top-bar .btn-group .icon-btn, .chat-top-bar .btn-group .start-btn');
  desktopActions.forEach(function (element) {
    element.style.display = active ? '' : 'none';
  });

  var landingControls = d.querySelectorAll('#mobileMode, #mobileIncognitoBtn');
  landingControls.forEach(function (element) {
    element.style.display = active ? 'none' : '';
  });

  var mobileActions = ensureMobileConversationActions(d);
  if (mobileActions) {
    mobileActions.button.hidden = !active;
    if (!active) closeMobileConversationMenu(d, false);
  }

  var view = d.defaultView || (typeof window !== 'undefined' ? window : null);
  if (view && typeof view.syncConversationActive === 'function') {
    try { view.syncConversationActive(); } catch (_) {}
  }
}

export function toggleChatTopBarEls(show, doc) {
  setConversationChrome(show, doc);
}
