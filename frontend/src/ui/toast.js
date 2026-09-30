/* ui/toast.js — minimal toast for action confirmations. Distinct
   from the chatStatus pill and the share link toast. Extracted
   from main.js so every module consumes it via a direct import;
   the window.showToast binding (main.js) stays only for the
   React legacy gateway and e2e mocks.

   opts.variant  "error" adds .msg-toast-error (session save failures).
   opts.duration visible time in ms (default 1800). */
export function showToast(msg, opts){
  try{
    var o=opts||{};
    var el=document.createElement("div");
    el.className=o.variant==="error"?"msg-toast msg-toast-error":"msg-toast";
    el.textContent=msg;
    document.body.appendChild(el);
    /* Commit the hidden starting style before adding .visible. A class added
       in the next rAF lands before the element's first style recalc, so the
       browser has no "before" state and the fade/slide never played — the
       toast just popped in. Reading layout forces that first recalc. */
    el.getBoundingClientRect();
    el.classList.add("visible");
    setTimeout(function(){
      el.classList.remove("visible");
      setTimeout(function(){if(el&&el.parentNode)el.parentNode.removeChild(el)},300);
    },typeof o.duration==="number"?o.duration:1800);
  }catch(_){}
}
