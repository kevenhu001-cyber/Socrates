/* Progressive enhancement only. The native GET form owns the app handoff. */
(function () {
  'use strict';

  var forms = document.querySelectorAll('[data-ask-form]');
  if (!forms.length) return;

  forms.forEach(function (form) {
    var input = form.querySelector('.ask-input');
    if (!input) return;

    var syncValue = function () {
      form.classList.toggle('has-value', input.value.trim().length > 0);
    };

    input.addEventListener('input', syncValue);
    input.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      form.requestSubmit();
    });

    /* Every composer owns the starters beside it, so a chip fills its own box. */
    var scope = form.parentElement || document;
    scope.querySelectorAll('[data-ask-chip]').forEach(function (chip) {
      chip.addEventListener('click', function () {
        input.value = chip.getAttribute('data-question') || '';
        syncValue();
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      });
    });

    var placeholder = form.querySelector('[data-ask-prompts]');
    if (placeholder && placeholder.animate) {
      var prompts = JSON.parse(placeholder.getAttribute('data-ask-prompts'));
      var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
      var timer = null;
      var animation = null;
      var index = -1;
      function eligible() {
        return prompts.length && !reduced.matches && !document.hidden && !input.value && document.activeElement !== input;
      }
      function pause() {
        window.clearTimeout(timer);
        timer = null;
        if (animation) { animation.cancel(); animation = null; }
      }
      function schedule() {
        window.clearTimeout(timer);
        timer = eligible() ? window.setTimeout(rotate, 4800) : null;
      }
      function rotate() {
        if (!eligible()) { pause(); return; }
        animation = placeholder.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140 });
        animation.onfinish = function () {
          if (!eligible()) { pause(); return; }
          index = (index + 1) % prompts.length;
          placeholder.textContent = prompts[index];
          animation = placeholder.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220 });
          animation.onfinish = function () { animation = null; };
          schedule();
        };
      }
      input.addEventListener('focus', pause);
      input.addEventListener('blur', schedule);
      input.addEventListener('input', function () { if (input.value) pause(); else schedule(); });
      document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); else schedule(); });
      reduced.addEventListener('change', function () { if (reduced.matches) pause(); else schedule(); });
      window.addEventListener('pagehide', pause);
      window.addEventListener('pageshow', schedule);
      schedule();
    }

    syncValue();
  });

  /* Interactive connection highlighting between the map and the dialogue */
  var demoFrame = document.querySelector('.demo-frame');
  if (demoFrame) {
    var nodes = demoFrame.querySelectorAll('.demo-node');
    var messages = demoFrame.querySelectorAll('.demo-msg');
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    nodes.forEach(function (node, index) {
      node.style.cursor = 'pointer';
      node.setAttribute('role', 'button');
      node.setAttribute('tabindex', '0');
      var highlight = function () {
        nodes.forEach(function (n) { n.classList.remove('is-active'); });
        node.classList.add('is-active');
        if (reduced.matches) return;
        var targetIndex = index === 0 ? 1 : 3;
        var targetMsg = messages[targetIndex];
        if (targetMsg && targetMsg.animate) {
          targetMsg.animate([
            { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(0,0,0,0)' },
            { transform: 'scale(1.015)', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' },
            { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(0,0,0,0)' }
          ], { duration: 380, easing: 'cubic-bezier(.16, 1, .3, 1)' });
        }
      };
      node.addEventListener('mouseenter', highlight);
      node.addEventListener('click', highlight);
      node.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          highlight();
        }
      });
    });
  }
}());
