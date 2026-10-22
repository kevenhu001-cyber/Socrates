(function () {
  'use strict';

  var controls = document.querySelector('[data-research-filters]');
  var list = document.querySelector('#research-notes');
  var count = document.querySelector('[data-research-count]');
  if (!controls || !list || !count) return;
  var buttons = Array.from(controls.querySelectorAll('[data-research-filter]'));
  var notes = Array.from(list.querySelectorAll('[data-research-topic]'));

  function applyFilter(topic) {
    var selected = buttons.find(function (button) { return button.getAttribute('data-research-filter') === topic; });
    if (!selected) return;
    buttons.forEach(function (button) { button.setAttribute('aria-pressed', String(button === selected)); });
    var visible = 0;
    notes.forEach(function (note) {
      note.hidden = topic !== 'all' && note.getAttribute('data-research-topic') !== topic;
      if (!note.hidden) visible += 1;
    });
    var label = count.getAttribute(visible === 1 ? 'data-count-one' : 'data-count-many').replace('{count}', String(visible));
    count.textContent = topic === 'all' ? label : label + ' · ' + selected.textContent;
  }

  buttons.forEach(function (button) {
    button.addEventListener('click', function () { applyFilter(button.getAttribute('data-research-filter')); });
  });
  applyFilter('all');
  controls.hidden = false;

  // Existing topic deep links (including language switches) still work when a
  // previous filter has hidden the target. No-JS pages show every note already.
  window.addEventListener('hashchange', function () {
    var target = document.getElementById(window.location.hash.slice(1));
    var note = target && target.closest('[data-research-topic]');
    if (!note || !note.hidden) return;
    applyFilter('all');
    window.requestAnimationFrame(function () { note.scrollIntoView({ block: 'start' }); });
  });
})();
