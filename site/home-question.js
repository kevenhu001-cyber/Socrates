/* Progressive enhancement only. The native GET form owns the app handoff. */
(function () {
  'use strict';

  var form = document.querySelector('[data-ask-form]');
  var input = document.getElementById('askInput');
  if (!form || !input) return;

  var syncValue = function () {
    form.classList.toggle('has-value', input.value.trim().length > 0);
  };

  input.addEventListener('input', syncValue);
  input.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    form.requestSubmit();
  });

  document.querySelectorAll('[data-ask-chip]').forEach(function (chip) {
    chip.addEventListener('click', function () {
      input.value = chip.getAttribute('data-question') || '';
      syncValue();
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
  });

  syncValue();
}());
