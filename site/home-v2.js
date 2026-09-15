(function () {
  'use strict';

  var zh = (document.documentElement.lang || '').toLowerCase().indexOf('zh') === 0;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasIO = 'IntersectionObserver' in window;
  var bootTime = Date.now();

  /* --------------------------------------------------------------
   * Localized copy
   * ------------------------------------------------------------ */
  var L = zh ? {
    statusIdle: '交互示例',
    statusLive: '实时演示',
    statusThinking: '思考中…',
    statusStreaming: '正在输出',
    statusRecall: '已加入回忆队列 · 3 天后到期',
    statusPaused: '已暂停',
    ready: '就绪',
    live: '实时',
    play: '播放学习循环',
    pause: '暂停演示',
    resume: '继续播放',
    toastRecall: '已加入回忆队列 · 3 天后回来',
    you: '你',
    tutor: 'Socrates',
    scenes: [
      {
        id: 'derivative',
        question: '为什么导数能描述某一个瞬间的变化？',
        script: [
          ['t', '先看两个时刻。它们之间的斜率衡量了什么？'],
          ['u', '一段时间内的平均变化率。'],
          ['t', '很好。现在让两个时刻不断靠近，这段间隔会怎样？']
        ],
        map: ['变化率', '极限', '导数'],
        note: '一句有用的话，会成为以后还能回来的连接。'
      },
      {
        id: 'limit',
        question: '极限到底意味着什么？',
        script: [
          ['t', '想象你正走向一扇门。要描述这条路通向哪里，你必须碰到它吗？'],
          ['u', '不必——不抵达，也能描述它通向哪里。'],
          ['t', '正是如此。极限关乎“趋近”，而不是“到达”。在图像上，这个区别会在哪里变得重要？']
        ],
        map: ['极限', '趋近', '连续'],
        note: '每个想法都和它的来处保持连接。'
      },
      {
        id: 'memory',
        question: '怎样才能让这周学到的东西下周还记得？',
        script: [
          ['t', '在安排复习之前——用一句话告诉我，什么是“瞬时变化”。'],
          ['u', '它是平均变化率在时间间隔趋于零时逼近的值。'],
          ['t', '说得很好。我已经把这个问题安排在三天后回来——届时请用你自己的话回答它。']
        ],
        map: ['回忆', '间隔', '复习'],
        note: '这次对话会变成一条定时的提示。'
      }
    ],
    replies: [
      [/导数|斜率|切线|变化率/, '这个问题值得停一下。先不谈公式——你会怎样测量曲线上两点之间的斜率？'],
      [/极限|趋近|逼近/, '让我反过来问你：一个值可以被无限接近，却永远不被到达吗？在图像上会是什么样？'],
      [/积分|面积|求和/, '先试试这个——如果把面积切成细条，每一条的面积近似于什么？'],
      [/记|忘|复习|回忆|持久/, '在我给出计划之前——用一句话说出你担心忘掉的那个想法。']
    ],
    replyDefault: '先别急着要答案——关于它，你现在已经猜到了什么？',
    mapSources: {
      limits: '极限描述的是一个值去向哪里——而不是它是否抵达。',
      rate: '当时间间隔趋近于零，平均变化率就趋近于瞬时变化率。',
      derivatives: '某一点的导数，是差商的极限。',
      continuity: '函数可以无限接近一个值，却永远不到达它。'
    },
    mapSourceTitle: '来自这次对话',
    stream: {
      user: '简短一点——导数在几何上到底是什么？',
      tool: '知识图谱 · 读取已有节点',
      tutorA: '某一点的导数，是割线斜率的极限：',
      math: 'f′(x) = lim<sub>h→0</sub> [ f(x+h) − f(x) ] / h',
      tutorB: '用你自己的话说——h 对那条割线做了什么？',
      vizTitle: '可视化',
      vizSub: '割线 → 切线 · y = x²',
      vizFoot: '在应用内可交互 — 可平移、缩放、导出',
      stateReady: '就绪', stateThinking: '思考中…', stateTool: '读取图谱', stateStreaming: '正在输出', stateDone: '已完成'
    },
    exam: {
      pos: '第 3 题 / 共 6 题',
      q: '对于 f(x) = x²，x = 1 处切线的斜率是多少？',
      tally: ['已答 2 / 6', '已答 3 / 6'],
      submit: '提交', again: '再试一次',
      good: '答对了——关于区间的想法成立了。',
      bad: '还不太对——这个失分已存入错题本。'
    },
    mistakes: {
      newTitle: 'f(x)=x² 在 x=1 处的切线斜率',
      newMeta: '导数 · 来自考试 · 刚刚',
      newNote: '正确答案：2。你选了 x——斜率是一个数值，不是变量本身。'
    },
    logRecall: '回忆 +1 · 3 天后到期',
    logExamGood: '考试 · 已答 3/6 — 正确',
    logExamBad: '考试 · 失分已记录 → 错题本',
    logViz: '可视化卡片 · 割线 → 切线'
  } : {
    statusIdle: 'Interactive example',
    statusLive: 'Live example',
    statusThinking: 'Thinking…',
    statusStreaming: 'Streaming',
    statusRecall: 'Recall scheduled · in 3 days',
    statusPaused: 'Paused',
    ready: 'Ready',
    live: 'Live',
    play: 'Play the learning loop',
    pause: 'Pause the demo',
    resume: 'Resume the loop',
    toastRecall: 'Recall scheduled · returns in 3 days',
    you: 'You',
    tutor: 'Socrates',
    scenes: [
      {
        id: 'derivative',
        question: 'Why does a derivative describe change at one exact moment?',
        script: [
          ['t', 'Start with two moments. What does the slope between them measure?'],
          ['u', 'An average rate of change.'],
          ['t', 'Good. Now move those moments closer together. What happens to the interval?']
        ],
        map: ['rate of change', 'limits', 'derivatives'],
        note: 'A useful phrase becomes a connection you can revisit.'
      },
      {
        id: 'limit',
        question: 'What does a limit really mean?',
        script: [
          ['t', 'Picture walking toward a doorway. Must you touch it to say where the path leads?'],
          ['u', 'No — I can describe where it leads without arriving.'],
          ['t', 'Exactly. A limit is about the approach, not the arrival. Where would that distinction matter on a graph?']
        ],
        map: ['limits', 'approach', 'continuity'],
        note: 'Each idea stays linked to where it came from.'
      },
      {
        id: 'memory',
        question: 'How do I keep this from fading by next week?',
        script: [
          ['t', 'Before we schedule anything — tell me in one sentence what instantaneous change means.'],
          ['u', 'It is the value the average rate approaches as the interval shrinks to zero.'],
          ['t', 'Well put. I have queued that question to return in three days — answer it in your own words then.']
        ],
        map: ['recall', 'spacing', 'review'],
        note: 'This conversation becomes a scheduled prompt.'
      }
    ],
    replies: [
      [/deriv|slope|tangent|rate of change/i, 'Good question to sit with. Before the formula — how would you measure the slope between two points on a curve?'],
      [/limit|approach|tend/i, 'Let me ask it back: can a value be approached without ever being reached? What would that look like on a graph?'],
      [/integral|area|sum/i, 'Try this first — if you slice an area into thin strips, what does each strip approximate?'],
      [/remember|forget|recall|review|fade/i, 'Before I suggest a schedule — can you state the idea you are afraid of losing, in one sentence?']
    ],
    replyDefault: 'Stay with that question for a second — what do you already suspect is true about it?',
    mapSources: {
      limits: 'A limit describes where a value is heading — not whether it ever arrives.',
      rate: 'As the interval approaches zero, average change approaches instantaneous change.',
      derivatives: 'The derivative at a point is the limit of the difference quotient.',
      continuity: 'A function can approach a value without ever reaching it.'
    },
    mapSourceTitle: 'From this dialogue',
    stream: {
      user: 'Give me the short version — what is a derivative, geometrically?',
      tool: 'knowledge map · reading earlier nodes',
      tutorA: 'The derivative at a point is the limit of the secant slope:',
      math: 'f′(x) = lim<sub>h→0</sub> [ f(x+h) − f(x) ] / h',
      tutorB: 'In your own words — what does h do to that secant line?',
      vizTitle: 'Visualization',
      vizSub: 'secant → tangent · y = x²',
      vizFoot: 'Interactive in the app — pans, zooms, exports',
      stateReady: 'Ready', stateThinking: 'Thinking…', stateTool: 'Reading map', stateStreaming: 'Streaming', stateDone: 'Done'
    },
    exam: {
      pos: 'Question 3 of 6',
      q: 'For f(x) = x², what is the slope of the tangent line at x = 1?',
      tally: ['2 of 6 answered', '3 of 6 answered'],
      submit: 'Submit', again: 'Try again',
      good: 'Correct — the interval idea held.',
      bad: 'Not quite — this miss is saved to your mistake book.'
    },
    mistakes: {
      newTitle: 'For f(x)=x², slope of the tangent at x=1',
      newMeta: 'derivatives · from an exam · just now',
      newNote: 'Correct answer: 2. You picked x — the slope is a number, not the variable itself.'
    },
    logRecall: 'recall +1 · due in 3 days',
    logExamGood: 'exam · 3/6 answered — correct',
    logExamBad: 'exam · miss recorded → mistake book',
    logViz: 'viz card mounted · secant → tangent'
  };

  /* --------------------------------------------------------------
   * Cancellable job runner — every timed step registers its timer so
   * a scene switch / pause / visibility change kills the whole chain.
   * ------------------------------------------------------------ */
  function makeJob() {
    var timers = [];
    var job = {
      dead: false,
      timers: timers,
      cancel: function () {
        job.dead = true;
        timers.forEach(clearTimeout);
      },
      wait: function (ms) {
        return new Promise(function (resolve) {
          timers.push(setTimeout(resolve, ms));
        });
      },
      /* Poll until cond() is false (or the job dies). Used to hold at
         the end of a loop while the pointer is over the demo. */
      waitWhile: function (cond) {
        return new Promise(function (resolve) {
          (function poll() {
            if (job.dead || !cond()) { resolve(); return; }
            timers.push(setTimeout(poll, 140));
          })();
        });
      }
    };
    return job;
  }

  function typeInto(input, text, job, speed) {
    speed = speed || 34;
    return new Promise(function (resolve) {
      var i = 0;
      (function step() {
        if (job.dead) { resolve(); return; }
        input.value = text.slice(0, ++i);
        if (i < text.length) {
          job.timers.push(setTimeout(step, speed + Math.random() * 26));
        } else resolve();
      })();
    });
  }

  function streamInto(el, html, job) {
    /* Streams text content; html may contain tags — we append the full
       string progressively via a scratch element so markup lands once. */
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    var plain = tmp.textContent;
    var isMarkup = html.indexOf('<') !== -1;
    if (isMarkup) { el.innerHTML = html; return Promise.resolve(); }
    return new Promise(function (resolve) {
      var i = 0;
      (function step() {
        if (job.dead) { resolve(); return; }
        i += 1 + (Math.random() < .22 ? 1 : 0);
        el.textContent = plain.slice(0, i);
        if (i < plain.length) job.timers.push(setTimeout(step, 16 + Math.random() * 20));
        else resolve();
      })();
    });
  }

  function clock() {
    var s = Math.floor((Date.now() - bootTime) / 1000);
    var m = Math.floor(s / 60);
    return 't+' + (m < 10 ? '0' : '') + m + ':' + ('0' + (s % 60)).slice(-2);
  }

  /* Session-log strip — every demo appends real events here. */
  var logLines = document.querySelector('[data-sv-log-lines]');
  function appendLog(text) {
    if (!logLines) return;
    var p = document.createElement('p');
    var time = document.createElement('time');
    time.textContent = clock();
    p.appendChild(time);
    p.appendChild(document.createTextNode(text));
    logLines.appendChild(p);
    while (logLines.children.length > 5) logLines.removeChild(logLines.firstChild);
  }

  function setStatus(demo, key) {
    var el = demo.querySelector('[data-sv-demo-status]');
    if (el) el.textContent = L[key] || key;
    var state = demo.querySelector('.sv-demo-state');
    if (state) state.classList.toggle('is-live', key !== 'statusPaused' && key !== 'statusIdle');
  }

  /* --------------------------------------------------------------
   * Hero product demo — a playable learning loop.
   * ------------------------------------------------------------ */
  function initProductDemo() {
    document.querySelectorAll('[data-sv-demo]').forEach(function (demo) {
      /* tab switching (unchanged behavior) */
      demo.querySelectorAll('[data-sv-tab]').forEach(function (tab) {
        tab.addEventListener('click', function () {
          var mode = tab.getAttribute('data-sv-tab');
          demo.setAttribute('data-mode', mode);
          activateGroup(demo, '[data-sv-tab]', '[data-sv-panel]', mode, 'data-sv-panel');
        });
      });

      var thread = demo.querySelector('[data-sv-thread]');
      if (!thread) return;
      var input = demo.querySelector('[data-sv-prompt-input]');
      var form = demo.querySelector('[data-sv-prompt-form]');
      var playBtn = demo.querySelector('[data-sv-play]');
      var playLabel = demo.querySelector('[data-sv-play-label]');
      var playIcon = demo.querySelector('.sv-play-icon');
      var liveLabel = demo.querySelector('[data-sv-live-label]');
      var chips = Array.prototype.slice.call(demo.querySelectorAll('[data-sv-prompt-choice]'));
      var mmNodes = {
        main: demo.querySelector('[data-mm="main"]'),
        a: demo.querySelector('[data-mm="a"]'),
        b: demo.querySelector('[data-mm="b"]')
      };
      var mmPaths = demo.querySelectorAll('.sv-mini-map path');
      var conceptNote = demo.querySelector('.sv-concept-note');
      var sessionBox = demo.querySelector('.sv-session');

      var toast = document.createElement('div');
      toast.className = 'sv-toast';
      toast.setAttribute('role', 'status');
      if (sessionBox) sessionBox.appendChild(toast);

      var st = { playing: false, hover: false, inView: false, scene: 0, job: null, started: false };

      function cancelJob() { if (st.job) { st.job.cancel(); st.job = null; } }

      function syncPlayBtn() {
        if (!playBtn) return;
        playBtn.setAttribute('aria-pressed', String(st.playing));
        if (playIcon) playIcon.textContent = st.playing ? '❚❚' : '▶';
        if (playLabel) playLabel.textContent = st.playing ? L.pause : (st.started ? L.resume : L.play);
      }

      function syncChips(idx) {
        chips.forEach(function (chip, i) {
          var on = i === idx;
          chip.classList.toggle('is-active', on);
          chip.setAttribute('aria-pressed', String(on));
        });
      }

      function scrollThread() { thread.scrollTop = thread.scrollHeight; }

      function addMsg(who, text) {
        var div = document.createElement('div');
        div.className = 'sv-message ' + (who === 'u' ? 'sv-message-user' : 'sv-message-tutor');
        var small = document.createElement('small');
        small.textContent = who === 'u' ? L.you : L.tutor;
        var p = document.createElement('p');
        if (text) p.textContent = text;
        div.appendChild(small);
        div.appendChild(p);
        thread.appendChild(div);
        scrollThread();
        return div;
      }

      function addThinking(bubble) {
        var th = document.createElement('p');
        th.className = 'sv-thinking';
        th.innerHTML = '<i></i><i></i><i></i><span>' + L.statusThinking + '</span>';
        bubble.appendChild(th);
        scrollThread();
        return th;
      }

      function resetMap(scene) {
        Object.keys(mmNodes).forEach(function (k) {
          var n = mmNodes[k];
          if (!n) return;
          n.classList.remove('is-on');
          n.textContent = scene.map[k === 'main' ? 0 : k === 'a' ? 1 : 2];
        });
        mmPaths.forEach(function (p) { p.classList.remove('is-on'); });
        if (conceptNote) conceptNote.textContent = scene.note;
      }

      function connectMap(job) {
        /* main node → edges draw → satellite nodes (mirrors kb-graph states) */
        if (mmNodes.main) mmNodes.main.classList.add('is-on');
        mmPaths.forEach(function (p, i) {
          job.timers.push(setTimeout(function () {
            if (job.dead) return;
            p.classList.add('is-on');
          }, 260 + i * 240));
        });
        [mmNodes.a, mmNodes.b].forEach(function (n, i) {
          if (!n) return;
          job.timers.push(setTimeout(function () {
            if (job.dead) return;
            n.classList.add('is-on');
          }, 620 + i * 240));
        });
      }

      function showToast(text) { toast.textContent = text; toast.classList.add('is-on'); }
      function hideToast() { toast.classList.remove('is-on'); }

      function renderInstant(scene) {
        thread.innerHTML = '';
        addMsg('u', scene.question);
        scene.script.forEach(function (turn) { addMsg(turn[0], turn[1]); });
        demo.classList.add('sv-armed');
        resetMap(scene);
        if (mmNodes.main) mmNodes.main.classList.add('is-on');
        mmPaths.forEach(function (p) { p.classList.add('is-on'); });
        [mmNodes.a, mmNodes.b].forEach(function (n) { if (n) n.classList.add('is-on'); });
        setStatus(demo, 'statusRecall');
      }

      async function runScene(idx) {
        var scene = L.scenes[idx];
        cancelJob();
        var job = st.job = makeJob();
        syncChips(idx);
        thread.innerHTML = '';
        demo.classList.add('sv-armed');
        resetMap(scene);
        setStatus(demo, 'statusLive');
        if (liveLabel) liveLabel.textContent = L.live;

        if (reduced) { renderInstant(scene); return; }

        await job.wait(520); if (job.dead) return;
        if (input) {
          await typeInto(input, scene.question, job);
          if (job.dead) return;
          await job.wait(260); if (job.dead) return;
        }
        addMsg('u', scene.question);
        if (input) input.value = '';

        for (var k = 0; k < scene.script.length; k++) {
          var who = scene.script[k][0], text = scene.script[k][1];
          if (who === 'u') {
            await job.wait(540); if (job.dead) return;
            if (input) {
              await typeInto(input, text, job, 24);
              if (job.dead) return;
              await job.wait(220); if (job.dead) return;
            }
            addMsg('u', text);
            if (input) input.value = '';
          } else {
            var bubble = addMsg('t', '');
            var thinking = addThinking(bubble);
            setStatus(demo, 'statusThinking');
            await job.wait(760); if (job.dead) return;
            thinking.remove();
            setStatus(demo, 'statusStreaming');
            var p = bubble.querySelector('p');
            p.classList.add('is-streaming');
            await streamInto(p, text, job);
            p.classList.remove('is-streaming');
            if (job.dead) return;
          }
          scrollThread();
        }

        connectMap(job);
        await job.wait(1100); if (job.dead) return;
        showToast(L.toastRecall);
        setStatus(demo, 'statusRecall');
        appendLog(L.logRecall);
        await job.wait(1500); if (job.dead) return;
        hideToast();
        setStatus(demo, 'statusLive');

        /* hold the finished frame; advancing waits for pointer-out */
        await job.waitWhile(function () { return st.hover || document.hidden; });
        if (job.dead) return;
        await job.wait(1900); if (job.dead) return;
        if (st.playing) runScene((idx + 1) % L.scenes.length);
      }

      function pauseAll() {
        st.playing = false;
        cancelJob();
        setStatus(demo, 'statusPaused');
        if (liveLabel) liveLabel.textContent = L.ready;
        syncPlayBtn();
      }

      function startPlayback() {
        st.playing = true;
        st.started = true;
        syncPlayBtn();
        runScene(st.scene);
      }

      if (playBtn) {
        playBtn.addEventListener('click', function () {
          if (reduced) {
            st.scene = (st.scene + 1) % L.scenes.length;
            renderInstant(L.scenes[st.scene]);
            syncChips(st.scene);
            return;
          }
          if (st.playing) pauseAll();
          else startPlayback();
        });
      }

      chips.forEach(function (chip, i) {
        chip.setAttribute('aria-pressed', 'false');
        chip.addEventListener('click', function () {
          st.scene = i;
          if (reduced) { renderInstant(L.scenes[i]); syncChips(i); return; }
          startPlayback();
        });
      });

      /* real user input takes over: stop the script, answer Socratically */
      if (input) {
        input.addEventListener('input', function () {
          if (st.playing || st.job) pauseAll();
          setStatus(demo, 'statusIdle');
        });
      }
      if (form) {
        form.addEventListener('submit', function (ev) {
          ev.preventDefault();
          var q = input ? input.value.trim() : '';
          if (!q) return;
          pauseAll();
          setStatus(demo, 'statusIdle');
          var job = st.job = makeJob();
          (async function () {
            addMsg('u', q);
            if (input) input.value = '';
            var bubble = addMsg('t', '');
            var thinking = addThinking(bubble);
            setStatus(demo, 'statusThinking');
            await job.wait(reduced ? 0 : 700);
            if (job.dead) return;
            thinking.remove();
            var reply = L.replyDefault;
            for (var i = 0; i < L.replies.length; i++) {
              if (L.replies[i][0].test(q)) { reply = L.replies[i][1]; break; }
            }
            setStatus(demo, 'statusStreaming');
            var p = bubble.querySelector('p');
            if (reduced) p.textContent = reply;
            else { p.classList.add('is-streaming'); await streamInto(p, reply, job); p.classList.remove('is-streaming'); }
            setStatus(demo, 'statusIdle');
          })();
        });
      }

      demo.addEventListener('pointerenter', function () { st.hover = true; });
      demo.addEventListener('pointerleave', function () { st.hover = false; });
      demo.addEventListener('focusin', function () { st.hover = true; });
      demo.addEventListener('focusout', function () { st.hover = false; });

      function armWhenVisible() {
        if (st.inView && st.playing && !st.job) runScene(st.scene);
      }

      if (hasIO) {
        new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            st.inView = entry.isIntersecting;
            if (!st.inView) cancelJob();
            else armWhenVisible();
          });
        }, { threshold: .22 }).observe(demo);
      } else st.inView = true;

      document.addEventListener('visibilitychange', function () {
        if (document.hidden) cancelJob();
        else armWhenVisible();
      });

      /* knowledge-map panel: nodes swap the source note */
      demo.querySelectorAll('[data-sv-map-node]').forEach(function (node) {
        node.addEventListener('click', function () {
          demo.querySelectorAll('[data-sv-map-node]').forEach(function (n) {
            n.classList.remove('is-current');
            n.setAttribute('aria-pressed', 'false');
          });
          node.classList.add('is-current');
          node.setAttribute('aria-pressed', 'true');
          var id = node.getAttribute('data-sv-map-node');
          var text = demo.querySelector('[data-sv-source-text]');
          var title = demo.querySelector('[data-sv-source-title]');
          if (text && L.mapSources[id]) {
            text.textContent = L.mapSources[id];
            var note = text.closest('.sv-source-note');
            if (note) { note.classList.remove('is-swap'); void note.offsetWidth; note.classList.add('is-swap'); }
          }
          if (title) title.textContent = L.mapSourceTitle;
        });
      });

      /* recall hint toggle */
      demo.querySelectorAll('[data-sv-answer]').forEach(function (button) {
        button.addEventListener('click', function () {
          var hint = button.parentElement.querySelector('[data-sv-hint]');
          var shown = hint && !hint.hidden;
          if (hint) hint.hidden = shown;
          button.textContent = shown ? (zh ? '显示提示' : 'Reveal a hint') : (zh ? '收起提示' : 'Hide the hint');
        });
      });

      /* boot: autoplay once visible (or immediately for reduced motion) */
      if (reduced) {
        renderInstant(L.scenes[0]);
        syncChips(0);
        setStatus(demo, 'statusIdle');
      } else {
        st.playing = true;
        st.started = true;
        syncPlayBtn();
        if (!hasIO || st.inView) runScene(0);
      }
      syncPlayBtn();
    });
  }

  function activateGroup(root, triggerSelector, panelSelector, value, panelAttribute) {
    root.querySelectorAll(triggerSelector).forEach(function (trigger) {
      var attr = triggerSelector.indexOf('step') !== -1 ? 'data-sv-step' : 'data-sv-tab';
      trigger.setAttribute('aria-selected', String(trigger.getAttribute(attr) === value));
    });
    root.querySelectorAll(panelSelector).forEach(function (panel) {
      var active = panel.getAttribute(panelAttribute) === value;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
    });
  }

  /* --------------------------------------------------------------
   * Learning path — scroll-linked step progression on desktop,
   * manual clicks always win for a few seconds.
   * ------------------------------------------------------------ */
  function initWorkflow() {
    var workflow = document.querySelector('[data-sv-workflow]');
    var steps = document.querySelectorAll('[data-sv-step]');
    if (!workflow || !steps.length) return;
    var order = ['dialogue', 'connect', 'recall'];
    var manualAt = 0;

    function activate(value) {
      workflow.setAttribute('data-state', value);
      steps.forEach(function (step) {
        step.setAttribute('aria-selected', String(step.getAttribute('data-sv-step') === value));
      });
      workflow.querySelectorAll('[data-sv-stage]').forEach(function (panel) {
        var active = panel.getAttribute('data-sv-stage') === value;
        panel.hidden = !active;
        panel.classList.toggle('is-active', active);
      });
      var label = workflow.querySelector('[data-sv-stage-label]');
      if (label) {
        if (zh) label.textContent = value === 'connect' ? '知识地图' : value === 'recall' ? '回忆' : '对话';
        else label.textContent = value === 'connect' ? 'Knowledge map' : value.charAt(0).toUpperCase() + value.slice(1);
      }
    }

    steps.forEach(function (step) {
      step.addEventListener('click', function () {
        manualAt = Date.now();
        activate(step.getAttribute('data-sv-step'));
      });
    });

    var section = workflow.closest('.sv-path');
    if (!section) return;
    var mq = window.matchMedia('(min-width: 821px)');
    var ticking = false;

    function spy() {
      ticking = false;
      if (!mq.matches || reduced) return;
      if (Date.now() - manualAt < 5000) return;
      var r = section.getBoundingClientRect();
      var vh = window.innerHeight || 800;
      if (r.bottom < 0 || r.top > vh) return;
      var span = r.height - vh;
      var p = span > 40 ? -r.top / span : (vh * .5 - r.top) / r.height;
      p = Math.max(0, Math.min(.999, p));
      var value = order[Math.floor(p * order.length)];
      if (workflow.getAttribute('data-state') !== value) activate(value);
    }
    function onScroll() {
      if (!ticking) { ticking = true; requestAnimationFrame(spy); }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
  }

  /* --------------------------------------------------------------
   * Streaming-answer panel: thinking → tool card → answer → viz card.
   * ------------------------------------------------------------ */
  function initStreamDemo() {
    document.querySelectorAll('[data-sv-stream]').forEach(function (panel) {
      var body = panel.querySelector('[data-sv-stream-body]');
      var stateEl = panel.querySelector('[data-sv-stream-state]');
      if (!body) return;
      var st = { inView: false, hover: false, job: null };

      function state(t) { if (stateEl) stateEl.textContent = t; }

      function el(cls, html) {
        var d = document.createElement('div');
        d.className = cls;
        if (html != null) d.innerHTML = html;
        return d;
      }

      function vizCard() {
        var card = el('sv-vizcard');
        card.innerHTML =
          '<div class="sv-viz-head"><span>' + L.stream.vizTitle + '</span><span>' + L.stream.vizSub + '</span></div>' +
          '<svg class="sv-viz-svg" viewBox="0 0 560 230" aria-hidden="true">' +
          '<line class="ax" x1="24" y1="200" x2="544" y2="200"/>' +
          '<line class="ax" x1="224" y1="14" x2="224" y2="216"/>' +
          '<path class="curve" pathLength="1" d="M40 148 Q280 282 540 44"/>' +
          '<path class="secant" d="M288 189 L424 133"/>' +
          '<circle class="secp" cx="288" cy="189" r="3.4"/>' +
          '<circle class="secp" cx="424" cy="133" r="3.4"/>' +
          '<line class="tangent" x1="212" y1="221" x2="504" y2="104"/>' +
          '<circle class="tanp" cx="352" cy="165" r="5"/>' +
          '</svg>' +
          '<div class="sv-viz-foot">' + L.stream.vizFoot + '</div>';
        return card;
      }

      function buildFrame() {
        body.innerHTML =
          '<div class="sv-sm sv-sm-user"><small>' + L.you + '</small><p>' + L.stream.user + '</p></div>' +
          '<div class="sv-sm sv-sm-tutor"><small>' + L.tutor + '</small>' +
          '<p data-sv-s1></p>' +
          '<p class="sv-math">' + L.stream.math + '</p>' +
          '<p data-sv-s2></p></div>';
        body.appendChild(vizCard());
      }

      async function run() {
        if (st.job) st.job.cancel();
        var job = st.job = makeJob();
        body.classList.remove('is-fading');
        body.innerHTML =
          '<div class="sv-sm sv-sm-user"><small>' + L.you + '</small><p>' + L.stream.user + '</p></div>';
        if (reduced) { buildFrame(); state(L.stream.stateDone); return; }

        await job.wait(500); if (job.dead) return;
        var th = el('sv-sm sv-sm-tutor', '<small>' + L.tutor + '</small>');
        var pill = document.createElement('p');
        pill.className = 'sv-thinking';
        pill.innerHTML = '<i></i><i></i><i></i><span>' + L.statusThinking + '</span>';
        th.appendChild(pill);
        body.appendChild(th);
        state(L.stream.stateThinking);
        await job.wait(850); if (job.dead) return;
        th.remove();

        /* tool card with a live elapsed timer — mirrors toolCards.js */
        var tool = el('sv-sm-tool',
          '<span class="sv-tool-ic" aria-hidden="true">▸</span>' +
          '<span class="sv-tool-name">' + L.stream.tool + '</span>' +
          '<span class="sv-tool-time">0.0s</span>');
        body.appendChild(tool);
        state(L.stream.stateTool);
        var timeEl = tool.querySelector('.sv-tool-time');
        var start = performance.now();
        var ticking = true;
        (function tick() {
          if (job.dead || !ticking) return;
          var s = (performance.now() - start) / 1000;
          timeEl.textContent = s.toFixed(1) + 's';
          if (s < 0.9) requestAnimationFrame(tick);
        })();
        await job.wait(950); if (job.dead) return;
        ticking = false;
        timeEl.textContent = '0.9s';
        var done = document.createElement('span');
        done.className = 'sv-tool-done';
        done.textContent = '✓';
        tool.appendChild(done);

        /* tutor answer streams; formula lands as one rendered block */
        var tutor = el('sv-sm sv-sm-tutor', '<small>' + L.tutor + '</small>');
        var p1 = document.createElement('p');
        var math = document.createElement('p');
        math.className = 'sv-math';
        math.hidden = true;
        math.innerHTML = L.stream.math;
        var p2 = document.createElement('p');
        tutor.appendChild(p1); tutor.appendChild(math); tutor.appendChild(p2);
        body.appendChild(tutor);
        state(L.stream.stateStreaming);
        p1.classList.add('is-streaming');
        await streamInto(p1, L.stream.tutorA, job);
        p1.classList.remove('is-streaming'); if (job.dead) return;
        math.hidden = false;
        await job.wait(360); if (job.dead) return;
        p2.classList.add('is-streaming');
        await streamInto(p2, L.stream.tutorB, job);
        p2.classList.remove('is-streaming'); if (job.dead) return;

        body.appendChild(vizCard());
        appendLog(L.logViz);
        state(L.stream.stateDone);

        await job.wait(3400); if (job.dead) return;
        await job.waitWhile(function () { return st.hover || !st.inView || document.hidden; });
        if (job.dead) return;
        body.classList.add('is-fading');
        await job.wait(460); if (job.dead) return;
        run();
      }

      panel.addEventListener('pointerenter', function () { st.hover = true; });
      panel.addEventListener('pointerleave', function () { st.hover = false; });

      if (hasIO && !reduced) {
        new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            st.inView = entry.isIntersecting;
            if (!st.inView && st.job) st.job.cancel();
            else if (st.inView) run();
          });
        }, { threshold: .25 }).observe(panel);
      } else if (reduced) { st.inView = true; run(); }
      else { st.inView = true; run(); }
    });
  }

  /* --------------------------------------------------------------
   * Exam panel — pick an option, submit, a miss lands in the
   * mistake book (same flow as exam.js → /api/mistakes).
   * ------------------------------------------------------------ */
  function initExamDemo() {
    document.querySelectorAll('[data-sv-exam]').forEach(function (panel) {
      var opts = panel.querySelectorAll('[data-sv-opt]');
      var submit = panel.querySelector('[data-sv-exam-submit]');
      var tally = panel.querySelector('[data-sv-exam-tally]');
      var result = panel.querySelector('[data-sv-exam-result]');
      var pos = panel.querySelector('[data-sv-exam-pos]');
      if (!opts.length || !submit) return;
      var picked = null;
      var answered = false;
      if (pos) pos.textContent = L.exam.pos;
      if (tally) tally.textContent = L.exam.tally[0];
      submit.textContent = L.exam.submit;

      opts.forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (answered) return;
          picked = btn;
          opts.forEach(function (b) { b.classList.remove('is-selected'); });
          btn.classList.add('is-selected');
          submit.disabled = false;
        });
      });

      submit.addEventListener('click', function () {
        if (!picked) return;
        if (answered) { /* reset for another try */
          answered = false; picked = null;
          opts.forEach(function (b) { b.classList.remove('is-selected', 'is-correct', 'is-wrong'); });
          if (result) { result.hidden = true; result.className = 'sv-exam-result'; }
          if (tally) tally.textContent = L.exam.tally[0];
          submit.textContent = L.exam.submit;
          submit.disabled = true;
          return;
        }
        answered = true;
        var good = picked.hasAttribute('data-correct');
        opts.forEach(function (b) {
          if (b.hasAttribute('data-correct')) b.classList.add('is-correct');
        });
        if (!good) picked.classList.add('is-wrong');
        if (tally) tally.textContent = L.exam.tally[1];
        if (result) {
          result.hidden = false;
          result.textContent = good ? L.exam.good : L.exam.bad;
          result.classList.add(good ? 'is-good' : 'is-bad');
        }
        submit.textContent = L.exam.again;
        if (good) appendLog(L.logExamGood);
        else { appendLog(L.logExamBad); addMistake(); }
      });
    });
  }

  function addMistake() {
    var list = document.querySelector('[data-sv-mistake-list]');
    var count = document.querySelector('[data-sv-mistake-count]');
    if (!list) return;
    var li = document.createElement('li');
    li.className = 'sv-mistake is-new';
    li.innerHTML =
      '<button type="button" data-sv-mistake-toggle>' +
      '<strong>' + L.mistakes.newTitle + '</strong>' +
      '<span>' + L.mistakes.newMeta + '</span></button>' +
      '<p class="sv-mistake-note" hidden>' + L.mistakes.newNote + '</p>';
    list.insertBefore(li, list.firstChild);
    if (count) count.textContent = String(list.children.length);
  }

  function initMistakeDemo() {
    document.querySelectorAll('[data-sv-mistake-list]').forEach(function (list) {
      list.addEventListener('click', function (ev) {
        var btn = ev.target.closest && ev.target.closest('[data-sv-mistake-toggle]');
        if (!btn) return;
        var note = btn.parentElement.querySelector('.sv-mistake-note');
        if (note) note.hidden = !note.hidden;
      });
    });
  }

  /* --------------------------------------------------------------
   * Reveal on scroll (unchanged)
   * ------------------------------------------------------------ */
  function initReveal() {
    var items = document.querySelectorAll('[data-sv-reveal]');
    if (!items.length) return;
    if (!hasIO || reduced) {
      items.forEach(function (item) { item.classList.add('is-visible'); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: .12, rootMargin: '0px 0px -8%' });
    items.forEach(function (item) { observer.observe(item); });
  }

  function boot() {
    initProductDemo();
    initWorkflow();
    initStreamDemo();
    initExamDemo();
    initMistakeDemo();
    initReveal();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}());
