import test from 'node:test';
import assert from 'node:assert/strict';
import { PHYSICS_MODELS, createPhysicsRuntime, oscillatorState, electricField, pendulumTrajectory, validateIntelligentUi } from '@socrates/core';

test('every native model has bounded defaults, finite outputs and matching tool validation', () => {
  for (const model of PHYSICS_MODELS) {
    assert.equal(validateIntelligentUi({ version: 1, nodes: [{ id: 'model', type: 'physics', scene: model.id, parameters: {} }] }).ok, true);
    assert.equal(validateIntelligentUi({ version: 1, nodes: [{ id: 'model', type: 'physics', scene: model.id, parameters: { invented: 1 } }] }).ok, false);
    if (model.id === 'rayleigh') continue;
    for (const edge of ['initial','min','max']) {
      const p = Object.fromEntries(model.parameters.map(p => [p.key,p[edge]]));
      const runtime = createPhysicsRuntime(model.id, p);
      for (const t of [0, runtime.duration / 2, runtime.duration]) {
        const frame = runtime.frame(t);
        assert.ok(frame.bodies.length > 0);
        assert.ok(frame.metrics.every(metric => Number.isFinite(metric.value)));
        assert.ok(Number.isFinite(runtime.profile(t)));
        assert.ok(frame.bodies.every(body => Number.isFinite(body.x) && Number.isFinite(body.y)));
        if (runtime.field) assert.ok(Number.isFinite(runtime.field(0, 0, t)));
      }
    }
  }
});
test('undamped spring conserves energy and all damping regimes start at rest and decay', () => {
  for (const t of [0,.1,1,5,20]) assert.ok(Math.abs(oscillatorState(t,1,4,0,2).energy - 8) < 1e-10);
  for (const damping of [.5,4,8]) {
    const initial = oscillatorState(0,1,4,damping,2);
    assert.equal(initial.x,2); assert.ok(Math.abs(initial.v)<1e-12);
    let previous = initial.energy;
    for (let i=1;i<=200;i++) {
      const s = oscillatorState(i/10,1,4,damping,2);
      assert.ok(s.energy <= previous + 1e-9); previous = s.energy;
      const dt=1e-5, derivative=(oscillatorState(i/10+dt,1,4,damping,2).x-oscillatorState(i/10-dt,1,4,damping,2).x)/(2*dt);
      assert.ok(Math.abs(derivative-s.v)<1e-7);
    }
  }
});
test('RK4 pendulum conserves energy at large angles and approaches the small-angle period', () => {
  const trajectory = pendulumTrajectory(2,9.81,120*Math.PI/180,0);
  const energy = s => .5 * (2*s.velocity)**2 + 9.81*2*(1-Math.cos(s.angle));
  const initial = energy(trajectory(0));
  for (let i=0;i<=2400;i+=12) assert.ok(Math.abs(energy(trajectory(i/120))-initial)/initial<1e-6);
  const small = pendulumTrajectory(2,9.81,.01,0), period=2*Math.PI*Math.sqrt(2/9.81);
  assert.ok(Math.abs(small(period).angle-.01)<1e-5);
  const damped=pendulumTrajectory(2,9.81,1,.3);
  assert.ok(energy(damped(20))<energy(damped(0))*.01);
});
test('Coulomb fields follow inverse-square law and dipole symmetry', () => {
  assert.ok(Math.abs(electricField(1,0,1,0,0).x-8.9875517923)<1e-10);
  assert.equal(electricField(2,0,1,0,0).x,electricField(1,0,1,0,0).x/4);
  const dipole=electricField(0,1,3,-3,2);
  assert.equal(dipole.y,0); assert.equal(dipole.potential,0); assert.ok(dipole.x>0);
});
test('wave phase inversion cancels equidistant sources and projectile returns to ground', () => {
  const inPhase=createPhysicsRuntime('wave-interference',{phase:0}), opposite=createPhysicsRuntime('wave-interference',{phase:180});
  for (const t of [0,.2,1]) { assert.ok(Math.abs(opposite.field(0,1,t))<1e-12); }
  assert.ok(Math.abs(inPhase.field(0,1,.2))>.1);
  const flight=createPhysicsRuntime('projectile',{speed:20,angle:45,gravity:10});
  assert.ok(Math.abs(flight.duration-2*Math.SQRT2)<1e-12);
  assert.ok(Math.abs(flight.frame(flight.duration).bodies[0].y)<1e-12);
  assert.ok(Math.abs(flight.frame(flight.duration).bodies[0].x-40)<1e-10);
});

test('legacy scene IDs adapt to the shared mathematical program across parameter extremes', async () => {
 const {physicsDemonstrationProgram,createDemonstrationRuntime,validateDemonstration}=await import('@socrates/core');
 for(const model of PHYSICS_MODELS) for(const edge of ['initial','min','max']) {
  const values=Object.fromEntries(model.parameters.map(p=>[p.key,p[edge]]));
  const program=physicsDemonstrationProgram(model.id,values);
  assert.deepEqual(validateDemonstration(program),{ok:true},`${model.id}/${edge}`);
  const runtime=createDemonstrationRuntime(program);
  assert.deepEqual(runtime.warnings,[],`${model.id}/${edge}`);
  for(const view of program.views) if(view.kind==='metrics') for(const value of view.values) {
   assert.ok(Number.isFinite(runtime.evaluate(value.expression,runtime.duration/2)),`${model.id}/${value.label}`);
  }
 }
 assert.equal(physicsDemonstrationProgram('unknown'),null);
});

test('adapted programs agree with reviewed oscillator and optical kernels', async()=>{
 const {physicsDemonstrationProgram,createDemonstrationRuntime}=await import('@socrates/core');
 const spring=createDemonstrationRuntime(physicsDemonstrationProgram('harmonic-oscillator'));
 for(const t of [0,.5,2,8]){
  const expected=oscillatorState(t,1,8,.3,1.5);
  assert.ok(Math.abs(spring.evaluate('q',t)-expected.x)<1e-5);
  assert.ok(Math.abs(spring.evaluate('v',t)-expected.v)<1e-5);
 }
 const airy=createDemonstrationRuntime(physicsDemonstrationProgram('rayleigh',{separation:1}));
 assert.ok(Math.abs(airy.evaluate('intensity')-.735)<.001);
 const revised=createDemonstrationRuntime(physicsDemonstrationProgram('rayleigh',{wavelength:650}));
 assert.ok(Math.abs(revised.evaluate('clamp(radius,0.2,3)')-650/550)<1e-12);
});
