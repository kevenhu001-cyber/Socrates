/* ui/toast.js — minimal toast for action confirmations. Distinct
   from the chatStatus pill and the share link toast. Extracted
   from main.js so every module consumes it via a direct import;
   the window.showToast binding (main.js) stays only for the
   React legacy gateway and e2e mocks. */
export function showToast(msg){
  try{
    var el=document.createElement("div");
    el.className="msg-toast";
    el.textContent=msg;
    document.body.appendChild(el);
    requestAnimationFrame(function(){el.classList.add("visible")});
    setTimeout(function(){
      el.classList.remove("visible");
      setTimeout(function(){if(el&&el.parentNode)el.parentNode.removeChild(el)},300);
    },1800);
  }catch(_){}
}
