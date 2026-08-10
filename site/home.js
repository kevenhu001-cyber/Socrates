(function () {
  'use strict';

  var isChinese = document.documentElement.lang.toLowerCase().indexOf('zh') === 0;
  var copy = isChinese ? {
    dialogue: {
      prompt: '为什么极限会存在？',
      label: '对话',
      context: 'Socrates 正在追问下一个有用的问题。',
      status: '让你的推理一直留在对话里。',
      captured: '已记下。继续把答案说清楚。'
    },
    exam: {
      prompt: '用几个问题测试我对极限的理解。',
      label: '考试模式',
      context: '一组简短问题会暴露仍然需要练习的地方。',
      status: '在缺口变成习惯之前找到它。',
      captured: '已记下。下一道问题马上开始。'
    },
    map: {
      prompt: '展示极限如何连接到导数。',
      label: '知识图谱',
      context: '一个概念会变成一条可以返回的路径。',
      status: '让真正有用的连接留下来。',
      captured: '已记下。继续沿着连接探索。'
    }
  } : {
    dialogue: {
      prompt: 'Why does the limit exist?',
      label: 'Dialogue',
      context: 'Socrates is asking the next useful question.',
      status: 'Keep your reasoning in the loop.',
      captured: 'Noted. Keep making the answer clear.'
    },
    exam: {
      prompt: 'Test me on limits.',
      label: 'Exam mode',
      context: 'A short question set reveals what still needs work.',
      status: 'Find the gaps before they harden.',
      captured: 'Noted. The next question is ready.'
    },
    map: {
      prompt: 'Show how limits connect to derivatives.',
      label: 'Knowledge map',
      context: 'One idea becomes a path you can return to.',
      status: 'Keep the useful connections in view.',
      captured: 'Noted. Keep following the connection.'
    }
  };

  function initReveal() {
    var items = document.querySelectorAll('.xa-reveal');
    document.body.classList.add('xa-js-ready');
    if (!items.length) return;
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      items.forEach(function (item) { item.classList.add('is-visible'); });
      return;
    }
    var observer = new IntersectionObserver(function (entries, current) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        current.unobserve(entry.target);
      });
    }, { threshold: .08, rootMargin: '0px 0px -32px' });
    items.forEach(function (item) { observer.observe(item); });
  }

  function setDemoMode(shell, mode) {
    var details = copy[mode] || copy.dialogue;
    shell.dataset.mode = mode;
    shell.querySelectorAll('[data-demo-tab]').forEach(function (button) {
      var active = button.dataset.demoTab === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    var prompt = shell.querySelector('[data-demo-prompt]');
    var label = shell.querySelector('[data-demo-mode-label]');
    var status = shell.querySelector('[data-answer-status]');
    if (prompt) prompt.value = details.prompt;
    if (label) label.textContent = details.label;
    if (status) status.innerHTML = '<span data-demo-mode-label>' + details.label + '</span> ' + details.status;
  }

  function initDemo() {
    document.querySelectorAll('[data-demo-shell]').forEach(function (shell) {
      shell.querySelectorAll('[data-demo-tab]').forEach(function (button) {
        button.addEventListener('click', function () {
          setDemoMode(shell, button.dataset.demoTab);
        });
      });

      var promptForm = shell.querySelector('[data-prompt-form]');
      var status = shell.querySelector('[data-answer-status]');
      var prompt = shell.querySelector('[data-demo-prompt]');

      if (promptForm) {
        promptForm.addEventListener('submit', function (event) {
          event.preventDefault();
          if (!prompt || !prompt.value.trim()) return;
          if (status) status.textContent = isChinese ? '问题已收到。Socrates 正在寻找下一个有用的转折。' : 'Question received. Socrates is finding the next useful turn.';
        });
      }
    });
  }

  function initCodeTabs() {
    document.querySelectorAll('[data-code-group]').forEach(function (group) {
      var buttons = group.querySelectorAll('[data-code-tab]');
      var panels = group.querySelectorAll('[data-code-panel]');
      buttons.forEach(function (button) {
        button.addEventListener('click', function () {
          var target = button.dataset.codeTab;
          buttons.forEach(function (item) {
            var active = item === button;
            item.classList.toggle('is-active', active);
            item.setAttribute('aria-selected', String(active));
          });
          panels.forEach(function (panel) { panel.hidden = panel.dataset.codePanel !== target; });
        });
      });
    });
  }

  function initCopy() {
    document.querySelectorAll('[data-copy-code]').forEach(function (button) {
      button.addEventListener('click', function () {
        var group = button.closest('[data-code-group]');
        var panel = group && group.querySelector('[data-code-panel]:not([hidden])');
        if (!panel) return;
        var original = button.textContent;
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(panel.textContent).catch(function () {});
        button.textContent = isChinese ? '已复制' : 'Copied';
        window.setTimeout(function () { button.textContent = original; }, 1400);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initReveal();
    initDemo();
    initCodeTabs();
    initCopy();
  });
}());
