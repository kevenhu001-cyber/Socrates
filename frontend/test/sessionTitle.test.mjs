import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.localStorage = {
  getItem() { return null; },
  setItem() {},
};

const { stateStore } = await import('../src/state/store.ts');
const { getCurrentLanguage, setCurrentLanguage } = await import('../src/i18n/languageState.ts');
const { fallbackTitle, generateSessionTitle, normalizeSessionTitle } = await import('../src/chat/sessionTitle.ts');

test('session titles strip prefixes and stay short in both languages', () => {
  assert.equal(fallbackTitle('理解机器学习基本概念以及应用'), '理解机器学习基本');
  assert.equal(fallbackTitle('Explain the main idea behind evolution by natural selection'), 'Explain the main idea behind evolution');
  assert.equal(normalizeSessionTitle('标题：「理解机器学习基础知识以及方法。」'), '理解机器学习基础');
  assert.equal(normalizeSessionTitle('Title: "A useful session title with many extra words"'), 'A useful session title with many');
});

test('a first prompt gets a compact fallback before provider availability is checked', () => {
  const previousFetch = globalThis.fetch;
  const previousLanguage = getCurrentLanguage();
  setCurrentLanguage('zh');
  globalThis.fetch = () => Promise.reject(new Error('offline'));
  stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: 'title-session' });
  stateStore.dispatch({ type: 'state/set', key: 'topic', value: '理解机器学习基本概念以及应用' });
  stateStore.dispatch({ type: 'state/set', key: 'sessionTitle', value: null });

  try {
    generateSessionTitle();
    assert.equal(stateStore.read('sessionTitle'), '理解机器学习基本');
  } finally {
    if (previousFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = previousFetch;
    setCurrentLanguage(previousLanguage);
  }
});


test('a single long English token cannot overflow the title limit', () => {
  assert.equal(normalizeSessionTitle('a'.repeat(200)).length, 48);
});


test('restored fallback titles retry independently across sessions and accept short Chinese titles',async()=>{
 const {installTestProvider}=await import('./providerFixture.mjs');
 const {resetProviderConfig}=await import('../src/config/providerConfig.store.ts');
 const previousFetch=globalThis.fetch,previousWindow=globalThis.window;
 const pending=[];let saves=0;
 installTestProvider();globalThis.window={saveCurrentSession(){saves++;}};
 globalThis.fetch=(_url,options)=>new Promise(resolve=>pending.push({resolve,body:JSON.parse(options.body)}));
 const select=(id,topic)=>{
  stateStore.dispatch({type:'state/set',key:'currentSessionId',value:id});
  stateStore.dispatch({type:'state/set',key:'topic',value:topic});
  stateStore.dispatch({type:'state/set',key:'sessionTitle',value:fallbackTitle(topic)});
 };
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 try{
  select('title-restored-a','请解释单缝衍射现象');generateSessionTitle();generateSessionTitle();
  assert.equal(pending.length,1);assert.ok(pending[0].body.max_tokens>=256);
  select('title-restored-b','学习量子力学');generateSessionTitle();assert.equal(pending.length,2);
  pending[0].resolve(Response.json({content:'单缝衍射'}));await settle();
  assert.equal(stateStore.read('sessionTitle'),fallbackTitle('学习量子力学'));
  pending[1].resolve(Response.json({content:'量子'}));await settle();
  assert.equal(stateStore.read('sessionTitle'),'量子');assert.equal(saves,1);
  select('title-manual','请解释单缝衍射现象');generateSessionTitle();
  stateStore.dispatch({type:'state/set',key:'sessionTitle',value:'我的标题'});
  pending[2].resolve(Response.json({content:'单缝衍射'}));await settle();
  assert.equal(stateStore.read('sessionTitle'),'我的标题');
 }finally{globalThis.fetch=previousFetch;globalThis.window=previousWindow;resetProviderConfig();}
});

test('an empty completion schedules a bounded retry without another save',async()=>{
 const {installTestProvider}=await import('./providerFixture.mjs');
 const {resetProviderConfig}=await import('../src/config/providerConfig.store.ts');
 const previousFetch=globalThis.fetch,previousWindow=globalThis.window,previousTimer=globalThis.setTimeout,previousNow=Date.now;
 let now=Date.now(),requests=0;const timers=[];
 installTestProvider();globalThis.window={saveCurrentSession(){}};
 globalThis.setTimeout=(callback,delay)=>{timers.push({callback,delay});return timers.length;};
 Date.now=()=>now;
 globalThis.fetch=async()=>{requests++;return Response.json({content:requests===1?'':'衍射原理'});};
 stateStore.dispatch({type:'state/set',key:'currentSessionId',value:'title-empty-retry'});
 stateStore.dispatch({type:'state/set',key:'topic',value:'解释衍射现象'});
 stateStore.dispatch({type:'state/set',key:'sessionTitle',value:null});
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 try{
  generateSessionTitle();await settle();assert.equal(requests,1);assert.equal(timers.length,1);
  now+=timers[0].delay;timers[0].callback();await settle();
  assert.equal(requests,2);assert.equal(stateStore.read('sessionTitle'),'衍射原理');
 }finally{globalThis.fetch=previousFetch;globalThis.window=previousWindow;globalThis.setTimeout=previousTimer;Date.now=previousNow;resetProviderConfig();}
});
