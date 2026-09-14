import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useTheme } from '../theme/ThemeProvider';
import { native } from '../native/native';
import { escapeHtml, safeHref } from './markdown';

// react-native-webview's exported ref type is narrower than the RN 0.86 JSX
// definitions under strict mode; the alias keeps this boundary typed.
const NativeWebView = WebView as unknown as React.ComponentType<any>;

/** Which browser libraries a block needs. Each one is a real network fetch. */
export type RichLib = 'katex' | 'mermaid' | 'echarts';

const CDN: Record<RichLib, string[]> = {
  // Pinned to the same versions the web client loads, so a formula that renders
  // in the browser renders identically here.
  katex: [
    '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css"/>',
    '<script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>',
    '<script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/mhchem.min.js"></script>',
  ],
  mermaid: ['<script src="https://cdn.jsdelivr.net/npm/mermaid@11.16.0/dist/mermaid.min.js"></script>'],
  echarts: ['<script src="https://cdn.jsdelivr.net/npm/echarts@6.1.0/dist/echarts.min.js"></script>'],
};

/** Kept in sync with `frontend/src/render/helpers.ts` KATEX_MACROS. */
export const KATEX_MACROS: Record<string, string> = {
  '\\div': '\\operatorname{div}',
  '\\curl': '\\operatorname{curl}',
  '\\grad': '\\operatorname{grad}',
  '\\laplacian': '\\nabla^2',
  '\\R': '\\mathbb{R}',
  '\\N': '\\mathbb{N}',
  '\\Z': '\\mathbb{Z}',
  '\\Q': '\\mathbb{Q}',
  '\\C': '\\mathbb{C}',
  '\\eps': '\\varepsilon',
  '\\ve': '\\varepsilon',
  '\\dd': '\\operatorname{d}',
  '\\d': '\\operatorname{d}',
  '\\e': '\\mathrm{e}',
  '\\i': '\\mathrm{i}',
  '\\pd': '\\partial',
  '\\T': '\\top',
  '\\tr': '\\operatorname{tr}',
  '\\Tr': '\\operatorname{Tr}',
  '\\rank': '\\operatorname{rank}',
  '\\im': '\\operatorname{im}',
  '\\re': '\\operatorname{Re}',
  '\\Var': '\\operatorname{Var}',
  '\\Cov': '\\operatorname{Cov}',
  '\\sd': '\\operatorname{sd}',
  '\\Pr': '\\operatorname{Pr}',
  '\\E': '\\operatorname{\\mathbb{E}}',
  '\\argmin': '\\operatorname{argmin}',
  '\\argmax': '\\operatorname{argmax}',
  '\\sgn': '\\operatorname{sgn}',
  '\\supp': '\\operatorname{supp}',
  '\\Span': '\\operatorname{span}',
  '\\diag': '\\operatorname{diag}',
  '\\proj': '\\operatorname{proj}',
  '\\per': '\\perp',
  '\\U': '\\cup',
  '\\union': '\\cup',
  '\\intersection': '\\cap',
  '\\norm': '\\lVert #1 \\rVert',
  '\\inner': '\\langle #1, #2 \\rangle',
  '\\abs': '\\lvert #1 \\rvert',
  '\\set': '\\{ #1 \\}',
  '\\seq': '(#1)_{#2}',
  '\\st': '\\text{ s.t. }',
  '\\suchthat': '\\text{ s.t. }',
  '\\iff': '\\Leftrightarrow',
  '\\exp': '\\operatorname{exp}',
  '\\ln': '\\operatorname{ln}',
  '\\log': '\\operatorname{log}',
  '\\Log': '\\operatorname{Log}',
};

export interface RichBlockProps {
  /** HTML fragment for the body. Callers must escape untrusted text already. */
  body: string;
  libs: RichLib[];
  /** Fallback shown while loading, and permanently if the libraries never arrive. */
  fallbackText: string;
  /** Height used before the page reports its own. */
  initialHeight?: number;
  /** Center the content — right for standalone formulas and diagrams. */
  center?: boolean;
}

interface BridgeMessage {
  type: 'resize' | 'openLink' | 'error' | 'ready';
  height?: number;
  url?: string;
}

/**
 * A single WebView island.
 *
 * Prose renders natively; this component exists only for the things a native
 * `<Text>` genuinely cannot draw — KaTeX formulas, mermaid diagrams, ECharts
 * plots, and model-authored HTML/SVG. It reports its own document height back
 * so the surrounding `FlatList` can lay it out without a fixed height, and it
 * keeps the fallback text visible until the page confirms it rendered, so a
 * failed CDN fetch degrades to readable LaTeX rather than a blank box.
 */
export function RichBlock({ body, libs, fallbackText, initialHeight = 44, center = true }: RichBlockProps) {
  const { colors, typography } = useTheme();
  const [height, setHeight] = useState(initialHeight);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const ref = useRef<any>(null);

  const source = useMemo(() => {
    const head = libs.flatMap((lib) => CDN[lib]).join('');
    const macros = JSON.stringify(KATEX_MACROS);
    const isDark = colors.statusBarStyle === 'light';
    return `<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
${head}
<style>
html,body{margin:0;padding:0;background:transparent;color:${colors.text};
  font-family:-apple-system,system-ui,'Segoe UI',Roboto,sans-serif;font-size:16px;line-height:1.5;
  -webkit-text-size-adjust:100%}
body{padding:2px 0;${center ? 'text-align:center;' : ''}overflow-x:auto}
img,svg,canvas{max-width:100%;height:auto}
code{font-family:ui-monospace,Menlo,monospace;font-size:0.92em;background:${colors.codeBg};
  color:${colors.codeFg};padding:1px 5px;border-radius:5px}
a{color:${colors.accent}}
.katex{font-size:1.05em}
.katex-display{margin:0;overflow-x:auto;overflow-y:hidden;padding:2px 0}
#err{color:${colors.danger};font-size:13px;text-align:left;white-space:pre-wrap;word-break:break-word}
</style></head><body>
<div id="root">${body}</div><div id="err"></div>
<script>(function(){
  var bridge=window.ReactNativeWebView;
  var send=function(v){ if(bridge) bridge.postMessage(JSON.stringify(v)); };
  var macros=${macros};
  var lastHeight=0;
  function resize(){
    var h=Math.ceil(document.body.scrollHeight||document.documentElement.scrollHeight||0);
    if(h && Math.abs(h-lastHeight)>1){ lastHeight=h; send({type:'resize',height:h}); }
  }
  function fail(message){
    document.getElementById('err').textContent=String(message||'');
    send({type:'error'});
    resize();
  }
  function renderMath(){
    if(!window.katex) return false;
    var nodes=document.querySelectorAll('[data-math]');
    for(var i=0;i<nodes.length;i++){
      var node=nodes[i];
      try{
        window.katex.render(node.getAttribute('data-math')||'',node,{
          displayMode:node.getAttribute('data-display')==='1',
          throwOnError:false,macros:macros,trust:false
        });
      }catch(e){ node.textContent=node.getAttribute('data-math')||''; }
    }
    return true;
  }
  function renderMermaid(){
    var host=document.querySelector('[data-mermaid]');
    if(!host) return true;
    if(!window.mermaid) return false;
    try{
      window.mermaid.initialize({startOnLoad:false,theme:${isDark ? "'dark'" : "'default'"},securityLevel:'strict'});
      var src=host.getAttribute('data-mermaid')||'';
      var out=window.mermaid.render('m'+Date.now().toString(36),src);
      Promise.resolve(out).then(function(r){
        host.innerHTML=(r&&r.svg)||'';resize();
      },function(e){ fail(e&&e.message||'diagram error'); });
    }catch(e){ fail(e&&e.message||'diagram error'); }
    return true;
  }
  function renderChart(){
    var host=document.querySelector('[data-chart]');
    if(!host) return true;
    if(!window.echarts) return false;
    try{
      var spec=JSON.parse(host.getAttribute('data-chart')||'{}');
      host.style.height=(spec.height||260)+'px';
      var chart=window.echarts.init(host,${isDark ? "'dark'" : 'null'},{renderer:'svg'});
      chart.setOption(spec);
      resize();
    }catch(e){ fail(e&&e.message||'chart error'); }
    return true;
  }
  var attempts=0;
  function run(){
    attempts++;
    var done=renderMath()&&renderMermaid()&&renderChart();
    if(!done && attempts<60){ setTimeout(run,100); return; }
    // 6s without the libraries means the network is gone; the native fallback
    // text stays visible because we never report ready.
    if(!done){ fail(''); return; }
    send({type:'ready'});
    resize();
  }
  if(window.ResizeObserver) new ResizeObserver(resize).observe(document.body);
  window.addEventListener('load',run);
  document.addEventListener('click',function(event){
    var node=event.target&&event.target.closest?event.target.closest('a'):null;
    if(node&&node.href){ event.preventDefault(); send({type:'openLink',url:node.href}); }
  });
  run();
})();</script></body></html>`;
  }, [body, libs, colors, center]);

  const handleMessage = (event: WebViewMessageEvent) => {
    let message: BridgeMessage & { type: string };
    try { message = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (message.type === 'resize' && typeof message.height === 'number' && message.height > 0) {
      setHeight(Math.min(2000, Math.max(24, message.height)));
    } else if (message.type === 'ready') {
      setReady(true);
    } else if (message.type === 'error') {
      setFailed(true);
    } else if (message.type === 'openLink' && message.url) {
      const href = safeHref(message.url);
      if (href) void native.openBrowser(href);
    }
  };

  if (failed && !ready) {
    // Readable source beats an empty rectangle when the typesetter never loaded.
    return (
      <View style={[styles.fallback, { backgroundColor: colors.codeBg, borderColor: colors.codeBorder }]}>
        <Text selectable style={[styles.fallbackText, { color: colors.codeFg, fontFamily: typography.mono }]}>{fallbackText}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.host, { height }]}>
      <NativeWebView
        ref={ref}
        originWhitelist={['https://localhost/']}
        source={{ html: source, baseUrl: 'https://localhost/' }}
        onMessage={handleMessage}
        onError={() => setFailed(true)}
        onHttpError={() => undefined}
        javaScriptEnabled
        domStorageEnabled={false}
        scrollEnabled={false}
        nestedScrollEnabled
        bounces={false}
        overScrollMode="never"
        androidLayerType="hardware"
        setSupportMultipleWindows={false}
        // The page never navigates; anything trying to is a link the user tapped.
        onShouldStartLoadWithRequest={(request: { url: string }) => {
          if (request.url === 'about:blank' || request.url.startsWith('https://localhost/')) return true;
          const href = safeHref(request.url);
          if (href) void native.openBrowser(href);
          return false;
        }}
        style={styles.webview}
      />
      {!ready ? (
        <View pointerEvents="none" style={[styles.spinner, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="small" color={colors.textSubtle} />
        </View>
      ) : null}
    </View>
  );
}

/** Wraps LaTeX for the math path. */
export function mathBody(latex: string, display: boolean): string {
  return `<span data-math="${escapeHtml(latex)}" data-display="${display ? '1' : '0'}"></span>`;
}

/** Wraps a mermaid source for the diagram path. */
export function mermaidBody(source: string): string {
  return `<div data-mermaid="${escapeHtml(source)}"></div>`;
}

/** Wraps an ECharts option object (as JSON text) for the chart path. */
export function chartBody(spec: string): string {
  return `<div data-chart="${escapeHtml(spec)}" style="width:100%"></div>`;
}

const styles = StyleSheet.create({
  host: { width: '100%', overflow: 'hidden' },
  webview: { flex: 1, backgroundColor: 'transparent' },
  spinner: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  fallback: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  fallbackText: { fontSize: 13, lineHeight: 19 },
});
