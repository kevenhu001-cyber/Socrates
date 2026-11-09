import { physicsModelDefinition, physicsParameters } from './physicsModelRegistry.js';

const plot=(label,x,y,expression,unit)=>({kind:'plot',label,x,y,xLabel:'t (s)',yLabel:unit,curves:[{expression,color:'blue'}]});
const metric=(label,expression,unit)=>({label,expression,unit});
const body=(center,color='blue',label='m',radius=.12)=>({kind:'body',center,radius,color,label});
const rod=(from,to)=>({kind:'rod',from,to,color:'muted'});
const field=(expression,extra={})=>({kind:'field',x:[-5,5],y:[-2.5,2.5],expression,palette:'signed',height:160,...extra});
const scene=(objects,x=[-3,3],y=[-1.5,1.5])=>({kind:'scene',x,y,xLabel:'x (m)',yLabel:'y (m)',objects});

/** Historical scene IDs are data adapters into the single mathematical UI runtime. */
export function physicsDemonstrationProgram(id,input={}) {
 const model=physicsModelDefinition(id);
 if(!model)return null;
 const values=physicsParameters(id,input);
 const program={version:1,parameters:model.parameters.map(p=>({id:p.key,label:p.label,unit:p.unit,value:values[p.key],min:p.min,max:p.max,step:p.step})),views:[]};
 if(id==='rayleigh'){
  program.definitions={radius:'wavelength/550*100/aperture',left:'airy(3.8317059702075125*hypot(x-separation/2,y)/radius)',right:'airy(3.8317059702075125*hypot(x+separation/2,y)/radius)',intensity:'left+right',ratio:'separation/radius'};
  program.parameters.push({id:'exposure',label:'Display exposure',value:.8,min:.2,max:4,step:.1,advanced:true});
  program.views=[field('intensity',{palette:'light',x:[-3,3],y:[-1.5,1.5],gamma:.5,exposure:'exposure'}),{kind:'controls'},
   {kind:'plot',label:'Linear intensity profile',x:[-3,3],y:[0,2.1],curves:[{expression:'intensity',color:'blue'}]},
   {kind:'metrics',values:[metric('Separation / Rayleigh limit','ratio','θR'),metric('Rayleigh angle','3.8317059702075125/pi*wavelength*1e-6/aperture*206264.806','arcsec')]}];
  // Presets use the same live expressions as every other view.
  program.presets=[{label:'Show Rayleigh limit',values:{separation:'clamp(radius,0.2,3)'}}];
 }else if(id==='wave-interference'){
  program.duration=20;
  program.definitions={r1:'max(0.15,hypot(x+separation/2,y))',r2:'max(0.15,hypot(x-separation/2,y))',wave:'sin(2*pi/wavelength*(r1-speed*t))/sqrt(r1)+sin(2*pi/wavelength*(r2-speed*t)+phase*pi/180)/sqrt(r2)',probe:'sin(2*pi/wavelength*(hypot(separation/2,1)-speed*t)) / sqrt(hypot(separation/2,1))+sin(2*pi/wavelength*(hypot(separation/2,1)-speed*t)+phase*pi/180)/sqrt(hypot(separation/2,1))'};
  program.views=[field('wave'),{kind:'controls'},plot('Probe displacement',[0,20],[-4,4],'sin(2*pi/wavelength*(hypot(separation/2,1)-speed*x))/sqrt(hypot(separation/2,1))+sin(2*pi/wavelength*(hypot(separation/2,1)-speed*x)+phase*pi/180)/sqrt(hypot(separation/2,1))','relative'),{kind:'metrics',values:[metric('Frequency','speed/wavelength','Hz'),metric('Probe displacement','probe','relative')]}];
 }else if(id==='electric-field'){
  program.definitions={r1:'hypot(x+separation/2,y)',r2:'hypot(x-separation/2,y)',potential:'if(min(r1,r2)<0.15,0,8.9875517923*(charge1/r1+charge2/r2))',ex:'if(min(r1,r2)<0.15,0,8.9875517923*(charge1*(x+separation/2)/r1^3+charge2*(x-separation/2)/r2^3))',ey:'if(min(r1,r2)<0.15,0,8.9875517923*y*(charge1/r1^3+charge2/r2^3))',probeE:'8.9875517923*hypot((charge1-charge2)*separation/2,charge1+charge2)/(1+(separation/2)^2)^1.5'};
  program.views=[field('potential/30',{vector:['ex','ey']}),{kind:'controls'},{kind:'plot',label:'Potential at y = 1 m',x:[-5,5],y:[-100,100],curves:[{expression:'8.9875517923*(charge1/hypot(x+separation/2,1)+charge2/hypot(x-separation/2,1))',color:'blue'}]},
   {kind:'metrics',values:[metric('Field at (0,1)','probeE','N/C'),metric('Potential at (0,1)','8.9875517923*(charge1+charge2)/hypot(separation/2,1)','V')]}];
 }else if(id==='harmonic-oscillator'){
  program.definitions={force:'-stiffness*q-damping*v',energy:'mass*v^2/2+stiffness*q^2/2'};
  program.dynamics={initial:{q:'amplitude',v:0},derivatives:{q:'v',v:'force/mass'},duration:20,step:.01};
  program.views=[scene([rod([-2.8,-.5],[-2.8,.5]),{kind:'spring',from:[-2.8,0],to:['q-.2',0],color:'blue'},{kind:'block',center:['q',0],width:.4,height:.4,color:'blue'}, {kind:'vector',from:['q',.5],to:['q+force/30',.5],color:'red',label:'F × (1 m / 30 N)'}]),{kind:'controls'},
   {kind:'trajectory',label:'Phase portrait',x:['-amplitude*1.2','amplitude*1.2'],y:['-amplitude*sqrt(stiffness/mass)*1.2','amplitude*sqrt(stiffness/mass)*1.2'],horizontal:'q',vertical:'v',xLabel:'q (m)',yLabel:'v (m/s)'},
   {kind:'metrics',values:[metric('Displacement','q','m'),metric('Velocity','v','m/s'),metric('Energy','energy','J')]}];
 }else if(id==='pendulum'){
  program.definitions={bobX:'length*sin(theta)',bobY:'-length*cos(theta)',energy:'length^2*omega^2/2+gravity*length*(1-cos(theta))'};
  program.dynamics={initial:{theta:'angle*pi/180',omega:0},derivatives:{theta:'omega',omega:'-gravity/length*sin(theta)-damping*omega'},duration:20,step:.01};
  program.views=[scene([rod([0,0],['bobX','bobY']),body([0,0],'muted','',.04),body(['bobX','bobY'],'orange')],['-length*1.2','length*1.2'],['-length*1.2','length*1.2']),{kind:'controls'},
   {kind:'trajectory',label:'Phase portrait',x:[-180,180],y:[-20,20],horizontal:'theta*180/pi',vertical:'omega',xLabel:'θ (°)',yLabel:'ω (rad/s)'},
   {kind:'metrics',values:[metric('Angle','theta*180/pi','°'),metric('Angular velocity','omega','rad/s'),metric('Energy per mass','energy','J/kg')]}];
 }else if(id==='projectile'){
  program.duration=30;
  program.definitions={vx:'speed*cos(angle*pi/180)',vy:'speed*sin(angle*pi/180)',flight:'2*vy/gravity',elapsed:'min(t,flight)',posX:'vx*elapsed',posY:'max(0,vy*elapsed-gravity*elapsed^2/2)',range:'vx*flight',peak:'vy^2/(2*gravity)'};
  program.views=[scene([rod([0,0],['range',0]),body(['posX','posY'],'blue','m','max(range,peak)/60')],[0,'max(1,range*1.1)'],['-max(1,peak)*.1','max(1,peak)*1.2']),{kind:'controls'},
   {kind:'plot',label:'Ballistic path',x:[0,'max(1,range)'],y:[0,'max(1,peak*1.2)'],xLabel:'x (m)',yLabel:'y (m)',curves:[{expression:'max(0,vy*x/vx-gravity*(x/vx)^2/2)',color:'blue'}],markers:[{x:'posX',y:'posY',color:'red'}]},
   {kind:'metrics',values:[metric('Height','posY','m'),metric('Range','range','m'),metric('Flight time','flight','s')]}];
 }
 return program;
}
