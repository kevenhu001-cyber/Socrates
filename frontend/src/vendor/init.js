/* P_perf-self-host — replaces the classic CDN <script>/<link> tags that
   used to live in index.html. marked + DOMPurify are bundled eagerly;
   KaTeX, highlight.js and fuse.js load after first paint, and the heavy
   renderers (mermaid, echarts, plotly) stay lazy until used. This module
   must be imported FIRST so every legacy global is populated before any
   consumer module evaluates. */
import { marked } from 'marked';
import DOMPurify from 'dompurify';

import 'highlight.js/styles/atom-one-dark.css';

const w = typeof window !== 'undefined' ? window : null;
if (w) {
  w.marked = marked;
  w.DOMPurify = DOMPurify;
}
