import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDemonstrationExpression, evaluateDemonstrationExpression, demonstrationDomain, validateDemonstration, createDemonstrationRuntime, validateIntelligentUi } from '@socrates/core';
const examples=JSON.parse(readFileSync(new URL('../../docs/examples/algorithmic-demonstrations.json',import.meta.url),'utf8'));
const calc=(expression,scope={})=>evaluateDemonstrationExpression(parseDemonstrationExpression(expression),scope);

test('mathematical language supports precedence, lazy branches, sums and recurrences',()=>{
 assert.equal(calc('-2^2 + 3*4'),8);
 assert.equal(calc('2^3^2'),512);
 assert.equal(calc('sum(k,1,N,k^2)',{N:4}),30);
 assert.equal(calc('iterate(v,1,8,v*2)'),256);
 assert.equal(calc('if(x==0,1,sin(x)/x)',{x:0}),1);
 assert.equal(calc('0 && missing'),0);
 assert.ok(Math.abs(calc('sinc(0)')-1)<1e-15);
 assert.equal(calc('sinratio(6,pi)'),-1);
 assert.ok(calc('airy(0)')===1);
 assert.ok(calc('airy(3.8317059702)')<1e-7);
});
test('expressions cannot execute code, access objects, perform unbounded loops or exceed budget',()=>{
 for(const expression of ['window.location','Math.sin(x)','fetch("/api")','x=>x','[1,2]','constructor(1)','1e999','sin(1,2)','a;alert(1)','x=1'])assert.throws(()=>parseDemonstrationExpression(expression));
 for(const expression of ['sum(k,0,1e30,k)','sum(k,0,200,k)','iterate(v,1,200,v+1)'])assert.throws(()=>calc(expression));
 assert.throws(()=>evaluateDemonstrationExpression(parseDemonstrationExpression('sum(k,1,100,k^2)'),{},{remaining:20}));
});
test('new composed programs validate without registering physics model IDs',()=>{
 for(const program of Object.values(examples)){
  assert.deepEqual(validateDemonstration(program),{ok:true});
  assert.equal(validateIntelligentUi({version:1,nodes:[{id:'new-algorithm',type:'demonstration',program}]}).ok,true);
 }
 const invalid=[{...examples.grating,definitions:{a:'b+1',b:2}},{...examples.grating,parameters:[{id:'x',min:0,max:1,value:.5}]},{...examples.lorenz,dynamics:{...examples.lorenz.dynamics,step:.00001}},{...examples.grating,views:[{kind:'script',x:[0,1],y:[0,1]}]}];
 for(const program of invalid)assert.equal(validateDemonstration(program).ok,false);
});
test('grating curves and raster field share physical definitions and removable singularities',()=>{
 const runtime=createDemonstrationRuntime(examples.grating);
 assert.equal(runtime.evaluate('intensity',0,0),1);
 assert.ok(Math.abs(runtime.evaluate('intensity',0,1)-runtime.evaluate('envelope',0,1))<1e-12);
 assert.ok(runtime.evaluate('intensity',0,1/6)<1e-20);
 const shifted=createDemonstrationRuntime(examples.grating,{wavelength:650});
 assert.ok(Math.abs(shifted.evaluate('intensity',0,650/550)-shifted.evaluate('envelope',0,650/550))<1e-12);
});
test('algorithmic Airy composition reproduces Rayleigh saddle and independently labeled sources',()=>{
 const runtime=createDemonstrationRuntime(examples.airy);
 assert.ok(Math.abs(runtime.evaluate('total')-.735)<.001);
 assert.ok(Math.abs(runtime.evaluate('left',0,-.5)-1)<1e-12);
 assert.ok(Math.abs(runtime.evaluate('left',0,.2)-runtime.evaluate('right',0,-.2))<1e-12);
});
test('generic RK4 integrates an unregistered oscillator and Lorenz system with bounded state',()=>{
 const oscillator={version:1,dynamics:{initial:{q:1,v:0},derivatives:{q:'v',v:'-q'},duration:10,step:.01},views:[{kind:'trajectory',x:[-2,2],y:[-2,2],horizontal:'q',vertical:'v'}]};
 const runtime=createDemonstrationRuntime(oscillator);
 for(const t of [0,1,2,5,10]){const s=runtime.stateAt(t);assert.ok(Math.abs(s.q-Math.cos(t))<1e-8);assert.ok(Math.abs(s.q*s.q+s.v*s.v-1)<1e-8);}
 const lorenz=createDemonstrationRuntime(examples.lorenz);
 assert.ok(Math.abs(lorenz.stateAt(1).X-(-9.37857))<.001);
 assert.ok(Object.values(lorenz.stateAt(20)).every(Number.isFinite));
 const divergent={...oscillator,dynamics:{...oscillator.dynamics,derivatives:{q:'1e100*q',v:'v'}}};
 assert.throws(()=>createDemonstrationRuntime(divergent),/diverged/);
});

test('parameter-dependent axes keep linked intensity curves visible with calibrated bounds',()=>{
 const normal=createDemonstrationRuntime(examples.airy),close=createDemonstrationRuntime(examples.airy,{s:.2});
 const bounds=examples.airy.views[1].y;
 assert.deepEqual(demonstrationDomain(bounds,normal),[0,1.12]);
 assert.ok(demonstrationDomain(bounds,close)[1]>close.evaluate('total'));
 assert.throws(()=>demonstrationDomain([1,0],normal),/increasing/);
 assert.throws(()=>demonstrationDomain([0,'1/0'],normal),/finite/);
});


test('sampling only evaluates referenced definitions and retains a finite resettable budget',()=>{
 const runtime=createDemonstrationRuntime({version:1,definitions:{costly:'sum(k,1,128,sum(j,1,128,k*j))',signal:'sin(x)'},views:[{kind:'metrics',values:[{label:'signal',expression:'signal'}]}]});
 for(let i=0;i<2000;i++)assert.equal(runtime.evaluate('signal',0,0),0);
 assert.equal(runtime.evaluate('costly'),(128*129/2)**2);
 assert.throws(()=>{for(let i=0;i<100;i++)runtime.evaluate('costly');},/budget exceeded/);
 runtime.resetBudget();
 assert.equal(runtime.evaluate('signal',0,0),0);
});
