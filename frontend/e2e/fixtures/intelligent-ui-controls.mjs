export const nodes=[
 {id:'root',type:'panel',state:{speed:2,mode:'a',enabled:false}},
 {id:'speed',type:'slider',parent:'root',label:'Speed',bind:'speed',min:0,max:10},
 {id:'value',type:'metric',parent:'root',value:{state:'speed'}},
 {id:'choice',type:'choice',parent:'root',bind:'mode',options:[{label:'Mode A',value:'a'},{label:'Mode B',value:'b'}]},
 {id:'toggle',type:'toggle',parent:'root',bind:'enabled',label:'Enabled'},
 {id:'enabled',type:'text',parent:'root',when:{state:'enabled'},text:'Enabled content'},
 {id:'reset',type:'button',parent:'root',label:'Reset',action:{type:'set',key:'speed',value:0}},
 {id:'tabs',type:'tabs',parent:'root',tabs:[{id:'first',label:'First'},{id:'second',label:'Second'}]},
 {id:'one',type:'text',parent:'tabs',tab:'first',text:'First content'},
 {id:'two',type:'text',parent:'tabs',tab:'second',text:'Second content'},
 {id:'empty',type:'table',parent:'root',columns:['value'],rows:[]},
 {id:'chart',type:'chart',parent:'root',points:[{label:'A',value:1}]},
];
