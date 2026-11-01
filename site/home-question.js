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
      // Round 10 (performance): only while the box is on screen. Each typed
      // letter is a DOM change, and nobody reads a hint scrolled away.
      var onScreen = true;
      function eligible() {
        return prompts.length && onScreen && !reduced.matches && !document.hidden && !input.value && document.activeElement !== input;
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
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (entries) {
          var seen = entries[entries.length - 1].isIntersecting;
          if (seen === onScreen) return;
          onScreen = seen;
          if (seen) schedule(); else pause();
        }).observe(form);
      }
      window.addEventListener('pageshow', function () { schedule(); });
      schedule(2400);
    }

    syncValue();
  });

  /* Recall card: try first, turn the card, then rate the try. The rating
     moves one black point along a hairline from "today" to "much later",
     to show that an honest try decides when the idea comes back. The card
     is illustrative; nothing is stored. */
  document.querySelectorAll('[data-recall]').forEach(function (root) {
    var card = root.querySelector('[data-rc-card]');
    var flip = root.querySelector('[data-rc-flip]');
    var flipLabel = root.querySelector('[data-rc-flip-label]');
    var rate = root.querySelector('[data-rc-rate]');
    var grades = Array.prototype.slice.call(root.querySelectorAll('[data-rc-grade]'));
    var spacing = root.querySelector('[data-rc-spacing]');
    var note = root.querySelector('[data-rc-note-out]');
    var scale = Array.prototype.slice.call(root.querySelectorAll('.rc-scale span'));
    if (!card || !flip || !rate || !flipLabel) return;
    var front = root.querySelector('.rc-front');
    var back = root.querySelector('.rc-back');
    var turnText = flipLabel.textContent;
    var againText = flip.getAttribute('data-rc-again') || turnText;
    var firstNote = note ? note.textContent : '';
    var state = 'front';
    function at(index) {
      spacing.style.setProperty('--rc-at', String(index));
      scale.forEach(function (label, i) { label.classList.toggle('is-on', i === index); });
    }
    function render(next, focus) {
      state = next;
      var flipped = next !== 'front';
      card.classList.toggle('is-flipped', flipped);
      if (front) front.setAttribute('aria-hidden', flipped ? 'true' : 'false');
      if (back) back.setAttribute('aria-hidden', flipped ? 'false' : 'true');
      flip.setAttribute('aria-expanded', flipped ? 'true' : 'false');
      var rating = next === 'back';
      // The two controls share one place; the one not in use is hidden
      // from the keyboard and from assistive technology as well as the eye.
      rate.setAttribute('aria-hidden', rating ? 'false' : 'true');
      flip.setAttribute('aria-hidden', rating ? 'true' : 'false');
      grades.forEach(function (grade) { grade.tabIndex = rating ? 0 : -1; if (next !== 'rated') grade.setAttribute('aria-pressed', 'false'); });
      flip.tabIndex = rating ? -1 : 0;
      flipLabel.textContent = next === 'rated' ? againText : turnText;
      if (next === 'front') { at(0); if (note) note.textContent = firstNote; }
      if (focus) (rating ? grades[0] : flip).focus({ preventScroll: true });
    }
    flip.addEventListener('click', function () {
      render(state === 'front' ? 'back' : 'front', true);
    });
    grades.forEach(function (grade) {
      grade.addEventListener('click', function () {
        grades.forEach(function (other) { other.setAttribute('aria-pressed', other === grade ? 'true' : 'false'); });
        at(grade.getAttribute('data-rc-grade') === 'good' ? 2 : 1);
        if (note) note.textContent = grade.getAttribute('data-rc-note') || '';
        render('rated', true);
      });
    });
    root.setAttribute('data-recall-ready', '');
    render('front', false);
  });
}());
