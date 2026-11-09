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
 for(const expression of ['window.location','Math.random()','fetch("/api")','x=>x','[1,2]','constructor(1)','1e999','sin(1,2)','a;alert(1)','x=1'])assert.throws(()=>parseDemonstrationExpression(expression));
 for(const expression of ['sum(k,0,1e30,k)','sum(k,0,2000,k)','iterate(v,1,2000,v+1)'])assert.throws(()=>calc(expression));
 assert.throws(()=>evaluateDemonstrationExpression(parseDemonstrationExpression('sum(k,1,100,k^2)'),{},{remaining:20}));
});
test('new composed programs validate without registering physics model IDs',()=>{
 for(const program of Object.values(examples)){
  assert.deepEqual(validateDemonstration(program),{ok:true});
  assert.equal(validateIntelligentUi({version:1,nodes:[{id:'new-algorithm',type:'demonstration',program}]}).ok,true);
 }
 const invalid=[{...examples.grating,definitions:{a:'b+1',b:'a'}},{...examples.grating,parameters:[{id:'x',min:0,max:1,value:.5}]},{...examples.lorenz,dynamics:{...examples.lorenz.dynamics,step:'not-a-number'}},{...examples.grating,views:[{kind:'script',x:[0,1],y:[0,1]}]}];
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
 // Divergence keeps the valid history and reports where it stopped.
 const stopped=createDemonstrationRuntime(divergent);
 assert.match(stopped.warnings[0].message,/diverged/);
 assert.ok(stopped.duration<divergent.dynamics.duration);
 assert.ok(Object.values(stopped.stateAt(stopped.duration)).every(Number.isFinite));
});

test('parameter-dependent axes keep linked intensity curves visible with calibrated bounds',()=>{
 const normal=createDemonstrationRuntime(examples.airy),close=createDemonstrationRuntime(examples.airy,{s:.2});
 const bounds=examples.airy.views[1].y;
 assert.deepEqual(demonstrationDomain(bounds,normal),[0,1.12]);
 assert.ok(demonstrationDomain(bounds,close)[1]>close.evaluate('total'));
 assert.deepEqual(demonstrationDomain([1,0],normal),[0,1]);
 assert.throws(()=>demonstrationDomain([0,'1/0'],normal),/finite/);
 assert.deepEqual(demonstrationDomain([0,'1/0'],normal,0,[-1,1]),[-1,1]);
});


test('sampling only evaluates referenced definitions and retains a finite resettable budget',()=>{
 const runtime=createDemonstrationRuntime({version:1,definitions:{costly:'sum(k,1,128,sum(j,1,128,k*j))',signal:'sin(x)'},views:[{kind:'metrics',values:[{label:'signal',expression:'signal'}]}]});
 for(let i=0;i<2000;i++)assert.equal(runtime.evaluate('signal',0,0),0);
 assert.equal(runtime.evaluate('costly'),(128*129/2)**2);
 assert.throws(()=>{for(let i=0;i<100;i++)runtime.evaluate('costly');},/budget exceeded/);
 runtime.resetBudget();
 assert.equal(runtime.evaluate('signal',0,0),0);
});

test('model notation and XML-encoded programs are normalized before validation',()=>{
 for(const [expression,expected] of [['x²+2x',8],['2πx',4*Math.PI],['3·x − 1',5],['Math.sin(x)**2',Math.sin(2)**2],['y = x^2',4],['√(4x)',Math.sqrt(8)],['x>0 ? 1 : -1',1],['ln(e)',1],['（1＋2）×3',9]])
  assert.ok(Math.abs(calc(expression,{x:2})-expected)<1e-12,expression);
 const program={version:'1',parameters:{item:[{id:'A',label:'A',value:'5',min:'2',max:'0'}]},definitions:{f:'g+1',g:'A·x'},views:{item:[{type:'plot',x:{item:['1','-1']},y:['-3','3'],curves:'f'}]}};
 assert.deepEqual(validateDemonstration(program),{ok:true});
 const runtime=createDemonstrationRuntime(program);
 assert.equal(runtime.parameters.A,2);
 assert.equal(runtime.evaluate('f',0,1),3);
 const located=validateDemonstration({version:1,parameters:[{id:'a',value:1,min:0,max:2}],views:[{kind:'plot',x:[0,1],y:[0,1],curves:[{expression:'A*x'}]}]});
 assert.equal(located.ok,false);assert.equal(located.path,'views[0].curves[0]');assert.match(located.error,/did you mean a/);
});

test('physical scene composition uses shared ODE state, units and parameter changes', () => {
 const scenes = JSON.parse(readFileSync(new URL('../../docs/examples/intelligent-ui-physics.json', import.meta.url), 'utf8'));
 for (const program of Object.values(scenes)) {
  assert.deepEqual(validateDemonstration(program), {ok:true});
  assert.equal(validateIntelligentUi({version:1,nodes:[{id:'scene',type:'demonstration',program}]}).ok,true);
 }
 const runtime = createDemonstrationRuntime(scenes.oscillator);
 const quarterPeriod = Math.PI / 4;
 assert.ok(Math.abs(runtime.evaluate('q', quarterPeriod)) < .0001);
 assert.ok(Math.abs(runtime.evaluate('v', quarterPeriod) + 2) < .0001);
 assert.ok(Math.abs(runtime.evaluate('energy', quarterPeriod) - 2) < .0003);
 const heavier = createDemonstrationRuntime(scenes.oscillator, {mass:2});
 assert.ok(heavier.evaluate('q', quarterPeriod) > .4);
 const pendulum = createDemonstrationRuntime(scenes.pendulum);
 for (const time of [0, 1, 3]) assert.ok(Math.abs(Math.hypot(pendulum.evaluate('bobX', time), pendulum.evaluate('bobY', time)) - 1.4) < 1e-10);
});

test('scene objects reject missing coordinates, invalid sizes, unsafe expressions and excess geometry', () => {
 const scene = objects => ({version:1,views:[{kind:'scene',x:[-2,2],y:[-1,1],objects}]});
 const body = {kind:'body',center:[0,0],radius:.1};
 for (const object of [
  {...body,center:[0]}, {...body,radius:-1}, {...body,center:['unknown',0]},
  {...body,radius:'fetch(1)'}, {...body,color:'url(https://example.com)'},
  {kind:'block',center:[0,0],width:1}, {kind:'spring',from:[0,0]}, {kind:'script'},
 ]) {
  const result = validateDemonstration(scene([object]));
  assert.equal(result.ok,false,JSON.stringify(object));
  assert.match(result.path,/views\[0\].objects/);
 }
 assert.equal(validateDemonstration(scene([])).ok,false);
 assert.equal(validateDemonstration(scene(Array.from({length:33},()=>body))).ok,false);
 assert.equal(validateDemonstration(scene([{...body,center:{item:['0','1']},radius:'0.1'}])).ok,true);
});

test('editable physics catalog stays portable and is present in the published examples', async () => {
 const { PHYSICS_EXAMPLES, PHYSICS_EXAMPLE_ASSUMPTIONS } = await import('../../packages/core/src/physicsExamples.js');
 const published = JSON.parse(readFileSync(new URL('../../docs/examples/intelligent-ui-physics.json', import.meta.url),'utf8'));
 assert.deepEqual(published, PHYSICS_EXAMPLES);
 assert.equal(Object.keys(PHYSICS_EXAMPLES).length,9);
 for (const [id,program] of Object.entries(PHYSICS_EXAMPLES)) {
  assert.ok(PHYSICS_EXAMPLE_ASSUMPTIONS[id]);
  assert.deepEqual(validateDemonstration(program),{ok:true},id);
  const runtime=createDemonstrationRuntime(program);
  assert.deepEqual(runtime.warnings,[],id);
 }
});

test('coupled springs and magnetic motion preserve their declared invariants', async () => {
 const { PHYSICS_EXAMPLES } = await import('../../packages/core/src/physicsExamples.js');
 const coupled=createDemonstrationRuntime(PHYSICS_EXAMPLES.coupledOscillators);
 const energy=coupled.evaluate('energy');
 for(const t of [1,4,12,20]) assert.ok(Math.abs(coupled.evaluate('energy',t)-energy)<1e-6);
 const particle=createDemonstrationRuntime(PHYSICS_EXAMPLES.chargedParticle);
 for(const t of [0,1,6,12]) {
  assert.ok(Math.abs(particle.evaluate('kinetic',t)-.5)<1e-5);
  assert.ok(Math.abs(particle.evaluate('px^2+(py+1)^2',t)-1)<1e-5);
 }
 const orbit=createDemonstrationRuntime(PHYSICS_EXAMPLES.keplerOrbit);
 const orbitalEnergy=orbit.evaluate('energy'),angular=orbit.evaluate('angular');
 for(const t of [2,8,16]) {
  assert.ok(Math.abs(orbit.evaluate('energy',t)-orbitalEnergy)<1e-5);
  assert.ok(Math.abs(orbit.evaluate('angular',t)-angular)<1e-5);
 }
});

test('RC and thermal examples match initial and one-time-constant limits', async () => {
 const { PHYSICS_EXAMPLES }=await import('../../packages/core/src/physicsExamples.js');
 const rc=createDemonstrationRuntime(PHYSICS_EXAMPLES.rcCharging);
 assert.equal(rc.evaluate('voltage'),0);
 assert.ok(Math.abs(rc.evaluate('voltage',2)-5*(1-Math.exp(-1)))<1e-10);
 const thermal=createDemonstrationRuntime(PHYSICS_EXAMPLES.thermalCooling);
 assert.equal(thermal.evaluate('temperature'),90);
 assert.ok(Math.abs(thermal.evaluate('temperature',5)-(20+70/Math.E))<1e-10);
});

test('path and expression presets validate geometry, dependencies and resource limits',()=>{
 const program={version:1,parameters:[{id:'a',value:1,min:0,max:3}],views:[{kind:'scene',x:[-1,1],y:[-1,1],objects:[{kind:'path',points:[[0,0],['a',1]],dashed:true}]}],presets:[{label:'Double',values:{a:'min(3,2*a)'}}]};
 assert.equal(validateDemonstration(program).ok,true);
 for(const points of [[[0,0]],[[0]],Array.from({length:65},()=>[0,0]),[[0,0],['unknown',1]]]){
  const invalid=structuredClone(program);invalid.views[0].objects[0].points=points;
  assert.equal(validateDemonstration(invalid).ok,false);
 }
 const invalid=structuredClone(program);invalid.presets[0].values.a='unknown';
 assert.equal(validateDemonstration(invalid).ok,false);
});
