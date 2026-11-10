/** Minimal executable repair examples. Tests validate every entry against the executor contract. */
export const INTELLIGENT_UI_EXAMPLES: Record<string, Record<string, unknown>> = {
  'learning.quiz': {id:'quiz',type:'learning',kind:'quiz',q:'Which number is even?',options:[{letter:'A',text:'2'},{letter:'B',text:'3'}],correct:'A'},
  'learning.practice': {id:'practice',type:'learning',kind:'practice',problem:'Explain your reasoning.'},
  'visualization.bar': {id:'chart',type:'visualization',template:'bar',title:'Values',accessibilitySummary:'A: 1; B: 2',payload:{categories:['A','B'],series:[{name:'Value',data:[1,2]}]}},
  'visualization.line': {id:'chart',type:'visualization',template:'line',title:'Values',accessibilitySummary:'A: 1; B: 2',payload:{categories:['A','B'],series:[{name:'Value',data:[1,2]}]}},
  demonstration: {id:'demo',type:'demonstration',program:{version:1,views:[{kind:'plot',x:[0,1],y:[0,1],curves:[{expression:'x',label:'x'}]}]}},
  'interactive.slider': {id:'speed',type:'slider',label:'Speed',bind:'speed',min:0,max:100,step:1},
  'interactive.button': {id:'reset',type:'button',label:'Reset',action:{type:'set',key:'speed',value:0}},
  'interactive.choice': {id:'mode',type:'choice',bind:'mode',options:[{label:'A',value:'a'},{label:'B',value:'b'}]},
  'interactive.toggle': {id:'enabled',type:'toggle',label:'Enabled',bind:'enabled'},
  'interactive.tabs': {id:'views',type:'tabs',tabs:[{id:'first',label:'First'},{id:'second',label:'Second'}]},
  table: {id:'data',type:'table',columns:['value'],rows:[{value:1}]},
  chart: {id:'chart',type:'chart',kind:'bar',points:[{label:'A',value:1}]},
  'layout.panel': {id:'panel',type:'panel',title:'Summary'},
  openui: {id:'app',type:'openui',source:'root = Col([Text("Summary")])'},
};
export function intelligentUiExample(componentType: string, kind?: string): Record<string, unknown> | null {
  const node = INTELLIGENT_UI_EXAMPLES[`${componentType}.${kind}`] ?? INTELLIGENT_UI_EXAMPLES[`interactive.${componentType}`] ?? INTELLIGENT_UI_EXAMPLES[componentType];
  return node ? {version:1,nodes:[node]} : null;
}
