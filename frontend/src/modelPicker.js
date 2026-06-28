/* modelPicker.js — shared logic for the topic-setup model picker
 * (`#modelPicker`) and the chat-header model picker (`#chatModelWrap`).
 *
 * Both pickers have an identical trigger + dropdown UX, just rendered
 * at different sizes / positions. Instead of duplicating the
 * open/close, click-outside, and Esc handling in main.js for each
 * one, this module exposes `bindModelPicker(opts)` which wires up
 * the entire interaction (including ↑/↓/Home/End/Enter keyboard
 * navigation) and returns `{ open, close, refresh, destroy }`.
 *
 * Usage:
 *   bindModelPicker({
 *     picker:    document.getElementById('modelPicker'),     // root .model-picker
 *     trigger:   document.getElementById('modelPickerTrigger'),
 *     menu:      document.getElementById('modelPickerMenu'),
 *     getItems:  () => providers,                            // [{id,label,model,...}]
 *     activeId:  () => apiConfig.activeId,
 *     onPick:    (id) => setActiveProvider(id),
 *     onManage:  () => openSettings(),                      // closes picker first
 *     allowFilter: false,                                   // show search box if many items
 *   });
 */

/* Single global click + keydown dispatcher shared by every bound
 * picker. Bound once on first use (see `installGlobalListeners`). */
var _pickerRegistry = [];
var _globalInstalled = false;

function installGlobalListeners(){
  if (_globalInstalled) return;
  _globalInstalled = true;

  document.addEventListener('click', function(e){
    for (var i = _pickerRegistry.length - 1; i >= 0; i--) {
      var p = _pickerRegistry[i];
      if (p.destroyed) { _pickerRegistry.splice(i, 1); continue; }
      if (!p.isOpen()) continue;
      if (!p.root.contains(e.target)) p.close();
    }
  });

  document.addEventListener('keydown', function(e){
    for (var i = 0; i < _pickerRegistry.length; i++) {
      var p = _pickerRegistry[i];
      if (p.destroyed) continue;
      if (!p.isOpen()) continue;
      var handled = p.handleKey(e);
      if (handled) { e.preventDefault(); return; }
    }
  });
}

function esc(s){
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function bindModelPicker(opts){
  var root      = opts.picker;
  var trigger   = opts.trigger;
  var menu      = opts.menu;
  var getItems  = opts.getItems;
  var getActive = opts.activeId;
  var onPick    = opts.onPick;
  var onManage  = opts.onManage;
  var allowFilter = !!opts.allowFilter;
  var emptyText = opts.emptyText || 'No options yet.';
  var manageText = opts.manageText || 'Manage…';

  if (!root || !trigger || !menu) return null;

  installGlobalListeners();

  var filterInput = null;
  var currentFilter = '';

  function isOpen(){
    return root.getAttribute('data-open') === 'true';
  }
  function open(){
    if (isOpen()) return;
    root.setAttribute('data-open', 'true');
    trigger.setAttribute('aria-expanded', 'true');
    // Reset filter and rebuild so the list reflects current state.
    currentFilter = '';
    if (filterInput) filterInput.value = '';
    render();
    // Focus the search box (if filter enabled) or the active item.
    requestAnimationFrame(function(){
      if (filterInput) filterInput.focus();
      else focusItemByOffset(0);
    });
  }
  function close(){
    if (!isOpen()) return;
    root.setAttribute('data-open', 'false');
    trigger.setAttribute('aria-expanded', 'false');
    // Move focus back to trigger so keyboard users keep context.
    trigger.focus();
  }
  function refresh(){ render(); }

  function sortedItems(){
    var list = (getItems() || []).slice();
    list.sort(function(a, b){
      if (a.isBuiltIn && !b.isBuiltIn) return -1;
      if (!a.isBuiltIn && b.isBuiltIn) return 1;
      return 0;
    });
    return list;
  }

  function visibleItems(){
    var q = currentFilter.trim().toLowerCase();
    var list = sortedItems();
    if (!q) return list;
    return list.filter(function(it){
      var hay = ((it.label || '') + ' ' + (it.model || '') + ' ' + (it.url || '')).toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  function render(){
    var items = visibleItems();
    var html = '';
    if (!items.length) {
      var hint = currentFilter ? 'No matches.' : emptyText;
      html = '<div class="model-picker-empty">' + esc(hint) + '</div>';
    } else {
      var activeId = getActive();
      items.forEach(function(it){
        var isActive = it.id === activeId;
        var name = esc(it.label || it.model || 'Item');
        var sub = it.isBuiltIn ? '' : esc(it.model || '');
        var url = esc(it.url || '');
        var subLine = sub && sub !== name ? sub : (it.isBuiltIn ? '' : url);
        html += '<button type="button" class="model-picker-item' + (isActive ? ' active' : '') +
                '" data-id="' + esc(it.id || '') + '" role="option" aria-selected="' + (isActive ? 'true' : 'false') + '">';
        html += '<span class="model-picker-item-main"><span class="model-picker-item-name">' + name + '</span>';
        if (subLine) html += '<span class="model-picker-item-sub">' + subLine + '</span>';
        html += '</span>';
        html += '<svg class="model-picker-item-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
        html += '</button>';
      });
      html += '<div class="model-picker-divider"></div>';
    }
    // Filter box — only rendered when allowFilter is true AND there are
    // enough items to warrant it (>=4).
    var rawItems = sortedItems();
    if (allowFilter && rawItems.length >= 4) {
      html = '<div class="model-picker-filter">' +
               '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
               '<input type="text" class="model-picker-filter-input" placeholder="Filter…" autocomplete="off" spellcheck="false" />' +
             '</div>' + html;
    }
    html += '<button type="button" class="model-picker-add">' + manageText + '</button>';
    menu.innerHTML = html;

    // Wire up the new buttons.
    var itemEls = menu.querySelectorAll('.model-picker-item');
    itemEls.forEach(function(el){
      el.addEventListener('click', function(){
        var id = el.getAttribute('data-id');
        onPick && onPick(id);
        close();
      });
    });
    var addBtn = menu.querySelector('.model-picker-add');
    if (addBtn) {
      addBtn.addEventListener('click', function(){
        close();
        onManage && onManage();
      });
    }
    if (allowFilter && rawItems.length >= 4) {
      filterInput = menu.querySelector('.model-picker-filter-input');
      if (filterInput) {
        filterInput.addEventListener('input', function(){
          currentFilter = filterInput.value;
          render();
          // Re-focus the (newly rebuilt) filter input so the user
          // can keep typing without re-clicking.
          var ni = menu.querySelector('.model-picker-filter-input');
          if (ni) {
            ni.focus();
            // Move caret to the end.
            var v = ni.value;
            ni.setSelectionRange(v.length, v.length);
          }
        });
      }
    }
  }

  function itemEls(){ return menu.querySelectorAll('.model-picker-item'); }
  function focusItemByOffset(offset){
    var els = itemEls();
    if (!els.length) return;
    var activeId = getActive();
    var idx = 0;
    for (var i = 0; i < els.length; i++) {
      if (els[i].getAttribute('data-id') === activeId) { idx = i; break; }
    }
    idx = (idx + offset + els.length) % els.length;
    els[idx].focus();
  }
  function moveFocus(delta){
    var els = itemEls();
    if (!els.length) return;
    var cur = document.activeElement;
    var idx = -1;
    for (var i = 0; i < els.length; i++) {
      if (els[i] === cur) { idx = i; break; }
    }
    if (idx < 0) idx = 0;
    var next = (idx + delta + els.length) % els.length;
    els[next].focus();
  }

  function handleKey(e){
    if (e.key === 'Escape') {
      close();
      return true;
    }
    if (e.key === 'ArrowDown') {
      if (filterInput && document.activeElement === filterInput) {
        focusItemByOffset(0);
      } else {
        moveFocus(1);
      }
      return true;
    }
    if (e.key === 'ArrowUp') {
      if (filterInput && document.activeElement === filterInput) {
        focusItemByOffset(-1);
      } else {
        moveFocus(-1);
      }
      return true;
    }
    if (e.key === 'Home') {
      var els = itemEls();
      if (els.length) { els[0].focus(); return true; }
    }
    if (e.key === 'End') {
      var els2 = itemEls();
      if (els2.length) { els2[els2.length - 1].focus(); return true; }
    }
    if (e.key === 'Enter') {
      var cur = document.activeElement;
      if (cur && cur.classList && cur.classList.contains('model-picker-item')) {
        cur.click();
        return true;
      }
      if (filterInput && document.activeElement === filterInput) {
        var els3 = itemEls();
        if (els3.length) { els3[0].click(); return true; }
      }
    }
    return false;
  }

  // Trigger toggle is handled by the inline onclick in the HTML
  // (toggleModelPicker / toggleChatModelMenu).  We do NOT add a
  // duplicate click listener here — that would cancel out with the
  // inline handler and make the picker unresponsive.
  var api = {
    isOpen: isOpen,
    open: open,
    close: close,
    refresh: refresh,
    handleKey: handleKey,
    root: root,
    get destroyed(){ return false; },
  };
  _pickerRegistry.push(api);
  // Wrap destroy to mark and unregister.
  var origDestroy = api.destroy;
  api.destroy = function(){
    api.destroyed = true;
    _pickerRegistry = _pickerRegistry.filter(function(p){ return p !== api; });
    if (origDestroy) origDestroy();
  };

  // First render so the menu has content if opened immediately.
  render();
  return api;
}

// Expose on window so the non-module main.js can call bindModelPicker.
window.__bindModelPicker = bindModelPicker;