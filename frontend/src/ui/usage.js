// src/ui/usage.js — Phase C-3.5 extraction
// Usage modal: opens a heatmap of the last 365 days of
// token consumption. Supports month view (last 31 days) and
// shows tier-key-limits. Window exposures are routed
// through src/windowExports.js.

import { apiFetch } from '../util/api.js';
// i18n translator (window.t). Lazy read so the module
// does not require a circular import with i18n.js.
const t = (typeof window !== "undefined" ? window.t : null);

export function openUsageModal(){
  document.getElementById("usageOverlay").classList.remove("hidden");
  loadUsageData();
}
export function closeUsageModal(){
  document.getElementById("usageOverlay").classList.add("hidden");
}
export function loadUsageData(){
  var body=document.getElementById("usageBody");
  body.innerHTML='<div class="usage-loading"><span class="loading"><span></span><span></span><span></span></span> '+t("usage.loading")+'</div>';
  Promise.all([
    apiFetch("/api/usage/daily?days=365"),
    apiFetch("/api/usage/limits"),
  ]).then(function(results){
    renderUsageHeatmap(results[0],body,results[1]);
  }).catch(function(){
    body.innerHTML='<div class="usage-loading" style="color:hsl(0 60% 55%)">'+t("usage.failed")+'</div>';
  });
}
export function renderUsageHeatmap(data,body,limits){
  var entries=data.entries||[];
  var lookup={};
  var totalTokens=0,totalMsgs=0;
  entries.forEach(function(e){
    lookup[e.day]=e;
    totalTokens+=parseInt(e.tokens,10)||0;
    totalMsgs+=parseInt(e.messages,10)||0;
  });
  /* Compute max daily tokens for color scaling */
  var maxDay=entries.reduce(function(m,e){return Math.max(m,parseInt(e.tokens,10)||0)},1);
  function level(t){var v=parseInt(t,10)||0;if(v===0)return 0;var r=v/maxDay;return r>0.8?5:r>0.6?4:r>0.4?3:r>0.2?2:1;}

  /* Build date grid for last 365 days (or up to today) */
  var now=new Date();
  var end=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  var start=new Date(end);start.setDate(start.getDate()-364);
  /* Align start to Sunday */
  var startDow=start.getDay();
  start.setDate(start.getDate()-startDow);

  var days=[];
  var cursor=new Date(start);
  while(cursor<=end){
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate()+1);
  }

  /* Build weeks array: array of 7-element arrays */
  var weeks=[];
  var curWeek=[];
  days.forEach(function(d,y){
    var key=d.toISOString().slice(0,10);
    var e=lookup[key];
    curWeek.push({date:key,tokens:e?parseInt(e.tokens,10):0,msgs:e?parseInt(e.messages,10):0,day:d.getDay()});
    if(curWeek.length===7){weeks.push(curWeek);curWeek=[];}
  });
  if(curWeek.length){weeks.push(curWeek);}

  /* Month labels */
  var monthLabels=[];
  var lastMth="";
  weeks.forEach(function(w,i){
    if(!w.length)return;
    var d=new Date(w[0].date);
    var mth=d.toLocaleDateString("en-US",{month:"short"});
    if(mth!==lastMth){monthLabels.push({col:i,label:mth});lastMth=mth;}
  });

  /* Build HTML */
  var html='';

  /* Beagle monthly usage bar (only shown when usage > 0 or user is free tier) */
  if(limits&&limits.beagleLimit){
    var beagleUsed=parseInt(limits.beagleUsed,10)||0;
    var beagleLimit=limits.beagleLimit;
    var beaglePct=Math.min(100,Math.round(beagleUsed/beagleLimit*100));
    var barColor=beaglePct>=90?'hsl(0 65% 55%)':beaglePct>=70?'hsl(35 80% 55%)':'hsl(var(--accent-000))';
    html+='<div class="usage-beagle-section" style="margin-bottom:20px;padding:14px 16px;background:hsl(var(--bg-100));border-radius:10px">';
    html+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
    html+='<div style="font-size:calc(13px * var(--app-font-scale, 1));font-weight:600;color:hsl(var(--text-000))">Beagle Monthly Usage</div>';
    html+='<div style="font-size:calc(11px * var(--app-font-scale, 1));color:hsl(var(--text-500))">'+beagleUsed.toLocaleString()+' / '+beagleLimit.toLocaleString()+' tokens</div>';
    html+='</div>';
    html+='<div style="height:8px;background:hsl(var(--bg-300));border-radius:4px;overflow:hidden">';
    html+='<div style="height:100%;width:'+beaglePct+'%;background:'+barColor+';border-radius:4px;transition:width .3s ease"></div>';
    html+='</div>';
    if(beaglePct>=100){
      html+='<div style="margin-top:6px;font-size:calc(11px * var(--app-font-scale, 1));color:hsl(0 65% 55%);font-weight:500">Limit reached. Add your own API key in Account → API Keys to continue using Beagle.</div>';
    }else if(beaglePct>=80){
      html+='<div style="margin-top:6px;font-size:calc(11px * var(--app-font-scale, 1));color:hsl(35 80% 55%)">Approaching monthly limit ('+beaglePct+'% used).</div>';
    }
    html+='</div>';
  }

  /* Summary stats */
  html+='<div class="usage-summary">';
  html+='<div class="usage-stat"><div class="usage-stat-val">'+totalTokens.toLocaleString()+'</div><div class="usage-stat-lbl">Total tokens</div></div>';
  html+='<div class="usage-stat"><div class="usage-stat-val">'+totalMsgs.toLocaleString()+'</div><div class="usage-stat-lbl">Messages</div></div>';
  var dayCount=entries.length;
  html+='<div class="usage-stat"><div class="usage-stat-val">'+(dayCount>0?Math.round(totalTokens/dayCount).toLocaleString():0)+'</div><div class="usage-stat-lbl">Avg tokens / active day</div></div>';
  html+='<div class="usage-stat"><div class="usage-stat-val">'+(dayCount>0?Math.round(totalMsgs/dayCount).toLocaleString():0)+'</div><div class="usage-stat-lbl">Avg msgs / active day</div></div>';
  html+='</div>';

  /* Period tabs */
  html+='<div class="usage-section-title">Daily Activity</div>';
  html+='<div class="usage-period-tabs">';
  html+='<button class="usage-period-tab active" onclick="loadUsageData()">Last 12 months</button>';
  html+='<button class="usage-period-tab" onclick="loadUsageMonth()">This month</button>';
  html+='</div>';

  /* Heatmap grid */
  html+='<div class="usage-calendar-wrap"><div class="usage-calendar">';

  /* Day-of-week labels */
  var dowLbl=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  weeks.forEach(function(w,wi){
    /* Month label row for first week only */
    if(wi===0){
      html+='<div class="usage-cal-day-lbl"></div>';
      var mthIdx=0;
      for(var c=0;c<weeks.length;c++){
        var lbl="";
        if(mthIdx<monthLabels.length&&monthLabels[mthIdx].col===c){
          lbl=monthLabels[mthIdx].label;mthIdx++;
        }
        html+='<div style="font-size:calc(8px * var(--app-font-scale, 1));color:hsl(var(--text-500));text-align:center">'+lbl+'</div>';
      }
    }
  });
  /* Day rows */
  for(var row=0;row<7;row++){
    html+='<div class="usage-cal-day-lbl">'+dowLbl[row]+'</div>';
    weeks.forEach(function(w){
      if(row<w.length){
        var d=w[row];
        var lv=d.tokens>0?level(d.tokens):0;
        html+='<div class="usage-cal-day lv'+lv+'" data-date="'+d.date+'" data-tokens="'+d.tokens+'" data-msgs="'+d.msgs+'" onmouseenter="showUsageTip(event)" onmouseleave="hideUsageTip()"></div>';
      }else{
        html+='<div></div>';
      }
    });
  }

  html+='</div></div>';

  /* Legend */
  html+='<div class="usage-legend">Less<div class="usage-legend-cell usage-cal-day lv0"></div><div class="usage-legend-cell usage-cal-day lv1"></div><div class="usage-legend-cell usage-cal-day lv2"></div><div class="usage-legend-cell usage-cal-day lv3"></div><div class="usage-legend-cell usage-cal-day lv4"></div><div class="usage-legend-cell usage-cal-day lv5"></div>More</div>';
  html+='<div class="usage-tooltip" id="usageTooltip"></div>';

  /* Monthly breakdown */
  html+='<div class="usage-breakdown"><div class="usage-section-title">Monthly Summary</div><table><thead><tr><th>Month</th><th>Days active</th><th>Tokens</th><th>Messages</th></tr></thead><tbody>';
  var monthMap={};
  entries.forEach(function(e){
    var m=e.day.slice(0,7);
    if(!monthMap[m])monthMap[m]={days:{},tokens:0,msgs:0};
    monthMap[m].days[e.day]=true;
    monthMap[m].tokens+=parseInt(e.tokens,10)||0;
    monthMap[m].msgs+=parseInt(e.messages,10)||0;
  });
  var mKeys=Object.keys(monthMap).sort().reverse();
  mKeys.forEach(function(m){
    var d=new Date(m+"-01");
    var lbl=d.toLocaleDateString("en-US",{year:"numeric",month:"long"});
    var mm=monthMap[m];
    html+='<tr><td>'+lbl+'</td><td>'+Object.keys(mm.days).length+'</td><td>'+mm.tokens.toLocaleString()+'</td><td>'+mm.msgs.toLocaleString()+'</td></tr>';
  });
  html+='</tbody></table></div>';

  body.innerHTML=html;
}
export function showUsageTip(ev){
  var el=ev.currentTarget;
  var tip=document.getElementById("usageTooltip");
  if(!tip){tip=document.createElement("div");tip.id="usageTooltip";tip.className="usage-tooltip";document.body.appendChild(tip);}
  var date=el.dataset.date;
  var tokens=parseInt(el.dataset.tokens,10)||0;
  var msgs=parseInt(el.dataset.msgs,10)||0;
  tip.innerHTML='<strong>'+date+'</strong> — '+tokens.toLocaleString()+' tokens, '+msgs+' messages';
  tip.style.display="block";
  var rect=el.getBoundingClientRect();
  tip.style.left=Math.min(rect.left+rect.width/2-tip.offsetWidth/2,window.innerWidth-tip.offsetWidth-10)+"px";
  tip.style.top=(rect.top-tip.offsetHeight-6)+"px";
}
export function hideUsageTip(){var tip=document.getElementById("usageTooltip");if(tip)tip.style.display="none";}
export function loadUsageMonth(){
  var body=document.getElementById("usageBody");
  body.innerHTML='<div class="usage-loading"><span class="loading"><span></span><span></span><span></span></span> '+t("usage.loading")+'</div>';
  Promise.all([
    apiFetch("/api/usage/daily?days=31"),
    apiFetch("/api/usage/limits"),
  ]).then(function(results){
    renderUsageHeatmap(results[0],body,results[1]);
  }).catch(function(){
    body.innerHTML='<div class="usage-loading" style="color:hsl(0 60% 55%)">'+t("usage.failedGeneric")+'</div>';
  });
}