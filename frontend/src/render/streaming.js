/* Streaming-render helpers shared by the regular chat and agent paths.
 *
 * The renderer intentionally updates at a perceptual cadence instead of once
 * per network chunk. Fast models can deliver dozens of tiny deltas in a frame;
 * coalescing them keeps input, scrolling, and code-block painting responsive.
 */

export function getStreamRenderInterval(textLength){
  var len=Math.max(0,Number(textLength)||0);
  if(len<2000)return 50;   /* first screen: responsive, ~20 fps */
  if(len<8000)return 80;   /* normal long answer: ~12 fps */
  return 120;              /* very long answer: protect the main thread */
}

export function isStableMarkdownPrefix(text){
  var s=String(text||"");
  if((s.split("```").length-1)%2!==0)return false;
  if((s.split("$$").length-1)%2!==0)return false;
  if((s.split("\\[").length-1)!==(s.split("\\]").length-1))return false;
  if((s.split("<think>").length-1)!==(s.split("</think>").length-1))return false;
  return true;
}

/* Keep completed Markdown blocks in a stable DOM region and return only the
 * unfinished tail for frequent updates. The final renderer still reparses the
 * complete response once, so a conservative fallback here is always safe. */
export function splitStreamingMarkdown(text){
  var full=String(text||"");
  var cut=full.lastIndexOf("\n\n");
  if(cut<=0)return{prefix:"",tail:full};
  var prefix=full.slice(0,cut);
  if(!isStableMarkdownPrefix(prefix))return{prefix:"",tail:full};
  return{prefix:prefix,tail:full.slice(cut+2)};
}
