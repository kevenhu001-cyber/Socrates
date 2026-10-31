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

    /* Example questions type themselves into the empty box, one character
       at a time, hold, fade and make way for the next. Focus, typing, a
       hidden page or reduced motion stop it with the hint left complete. */
    var placeholder = form.querySelector('[data-ask-prompts]');
    if (placeholder && placeholder.animate) {
      var prompts = JSON.parse(placeholder.getAttribute('data-ask-prompts'));
      var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
      var timer = null;
      var animation = null;
      var index = -1;
      var target = null;
      function eligible() {
        return prompts.length && !reduced.matches && !document.hidden && !input.value && document.activeElement !== input;
      }
      function pause() {
        window.clearTimeout(timer);
        timer = null;
        if (animation) { animation.cancel(); animation = null; }
        // Never leave a half-typed hint behind.
        if (target !== null) { placeholder.textContent = target; target = null; }
        placeholder.classList.remove('is-typing');
      }
      function schedule(delay) {
        window.clearTimeout(timer);
        timer = eligible() ? window.setTimeout(next, typeof delay === 'number' ? delay : 2600) : null;
      }
      function type(chars, count) {
        if (!eligible()) { pause(); return; }
        placeholder.textContent = chars.slice(0, count).join('');
        if (count >= chars.length) {
          target = null;
          schedule(2600);
          return;
        }
        // Han characters carry more per glyph, so they arrive a little slower.
        var wide = /[\u3400-\u9fff]/.test(chars[count]);
        timer = window.setTimeout(function () { type(chars, count + 1); }, wide ? 72 : 32);
      }
      function next() {
        if (!eligible()) { pause(); return; }
        animation = placeholder.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'cubic-bezier(.22,1,.36,1)' });
        animation.onfinish = function () {
          animation = null;
          if (!eligible()) { pause(); return; }
          index = (index + 1) % prompts.length;
          target = prompts[index];
          placeholder.classList.add('is-typing');
          type(Array.from(target), 1);
        };
      }
      input.addEventListener('focus', pause);
      input.addEventListener('blur', function () { schedule(); });
      input.addEventListener('input', function () { if (input.value) pause(); else schedule(); });
      document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); else schedule(); });
      reduced.addEventListener('change', function () { if (reduced.matches) pause(); else schedule(); });
      window.addEventListener('pagehide', pause);
      window.addEventListener('pageshow', function () { schedule(); });
      schedule(2400);
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
