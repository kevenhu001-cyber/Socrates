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

    /* Example questions type themselves into the empty box. An entry may be
       a pair: the first question is typed, held, trimmed back to the words
       it shares with the second, and the follow-up question is typed on top
       of it, so the hint itself shows one question leading to the next.
       Focus, typing, a hidden page or reduced motion stop it with the hint
       left complete. */
    var placeholder = form.querySelector('[data-ask-prompts]');
    if (placeholder && placeholder.animate) {
      var prompts = JSON.parse(placeholder.getAttribute('data-ask-prompts')).map(function (entry) {
        return Array.isArray(entry) ? entry : [entry];
      });
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
      function wait(fn, delay) {
        timer = window.setTimeout(function () { if (eligible()) fn(); else pause(); }, delay);
      }
      // Han characters carry more per glyph, so they arrive a little slower.
      function pace(char) { return /[\u3400-\u9fff]/.test(char) ? 72 : 32; }
      function type(chars, count, done) {
        placeholder.textContent = chars.slice(0, count).join('');
        if (count >= chars.length) { done(); return; }
        wait(function () { type(chars, count + 1, done); }, pace(chars[count]));
      }
      function trim(chars, keep, done) {
        placeholder.textContent = chars.join('');
        if (chars.length <= keep) { done(); return; }
        wait(function () { trim(chars.slice(0, -1), keep, done); }, 22);
      }
      function shared(a, b) {
        var length = 0;
        while (length < a.length && length < b.length && a[length] === b[length]) length += 1;
        return length;
      }
      function step(chain, link, current) {
        var chars = Array.from(chain[link]);
        target = chain[chain.length - 1];
        type(chars, current, function () {
          if (link + 1 >= chain.length) { target = null; schedule(2600); return; }
          var following = Array.from(chain[link + 1]);
          var keep = shared(chars, following);
          wait(function () {
            trim(chars, keep, function () { wait(function () { step(chain, link + 1, keep + 1); }, 180); });
          }, 1500);
        });
      }
      function next() {
        if (!eligible()) { pause(); return; }
        animation = placeholder.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'cubic-bezier(.22,1,.36,1)' });
        animation.onfinish = function () {
          animation = null;
          if (!eligible()) { pause(); return; }
          index = (index + 1) % prompts.length;
          placeholder.classList.add('is-typing');
          step(prompts[index], 0, 1);
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
