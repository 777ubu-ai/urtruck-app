import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { getExpenseCopy } from '../../src/utils/expenseCopy.js';
const require = createRequire(import.meta.url);
const babel = require('@babel/core');
const source = readFileSync('src/screens/DealWorkspaceScreenV2.js','utf8');
const ast = babel.parseSync(source,{babelrc:false,configFile:false,parserOpts:{sourceType:'module',plugins:['jsx']}});
const copyNode = ast.program.body.flatMap(n=>n.declarations||[]).find(n=>n.id?.name==='COPY').init;
const copy=vm.runInNewContext('('+source.slice(copyNode.start,copyNode.end)+')');
const block=source.match(/const PLUS_MENU = \[([\s\S]*?)\];/)[1];
const jsx=source.match(/\{attachOpen \? \(\s*([\s\S]*?)\s*\) : null\}/)[1];
const styleNames=['attachMenu','attachMenuContent','attachHandleHit','attachHandle','attachItem','attachItemLarge','attachIcon','attachLabel'];
const s=Object.fromEntries(styleNames.map(name=>[name,vm.runInNewContext('('+source.match(new RegExp(name+': (\\{[^}]+\\})'))[1]+')',{StyleSheet:{hairlineWidth:0.5}})]));
const code=babel.transformSync('globalThis.render = ({s,colors,window,insets,PLUS_MENU,collapseComposer}) => ('+jsx+');',{babelrc:false,configFile:false,plugins:[require('@babel/plugin-transform-react-jsx')]}).code;
const ids=['photo','camera','share','status','location','document','contact','expenses'];
test('меню плюс: полные подписи, прокрутка, крупный шрифт,8 действий и их обработчики —48 комбинаций',()=>{
 for(const lang of ['RU','KK','ZH','EN'])for(const fontScale of [1,1.3,2])for(const dark of [false,true])for(const role of ['driver','client']){
  const calls=[];const spy=name=>()=>calls.push(name);
  const env={session:{user:{role}},dealId:'own-test-deal',lang,ui:copy[lang],locationSending:false,getExpenseCopy,
   navigation:{navigate:(name,params)=>calls.push([name,params.dealId])},setAttachOpen:spy('close'),sendGalleryPhoto:spy('photo'),sendCameraPhoto:spy('camera'),sendDealShare:spy('share'),openStatusModal:spy('status'),sendLocation:spy('location'),pickAndSendDocument:spy('document'),sendContactCard:spy('contact')};
  const items=vm.runInNewContext('['+block+']',env);
  const scope={React:{createElement:(type,props,...children)=>({type,props:{...props,children}})},ScrollView:'ScrollView',View:'View',TouchableOpacity:'TouchableOpacity',Text:'Text',ActivityIndicator:'ActivityIndicator',FontAwesome5:'Icon',Math};
  vm.runInNewContext(code,scope);
  const tree=scope.render({s,colors:{bg:dark?'#111':'#fff',border:'#ccc',surface:'#eee',textMuted:'#555'},window:{height:800,fontScale},insets:{bottom:24},PLUS_MENU:items,collapseComposer:spy('collapse')});
  assert.equal(tree.type,'ScrollView');assert.equal(tree.props.style[1].maxHeight,480);
  assert.equal(tree.props.keyboardShouldPersistTaps,'handled');
  const buttons=tree.props.children.flat().filter(n=>n?.props?.testID?.startsWith('deal-chat-attach-')&&n.props.testID!=='deal-chat-attach-collapse');
  assert.equal(buttons.length,role==='driver'?8:7);
  buttons.forEach((button,i)=>{
   assert.equal(button.props.testID,'deal-chat-attach-'+ids[i]);assert.equal(button.props.accessibilityRole,'button');
   const text=button.props.children.find(n=>n.type==='Text');assert.equal(text.props.numberOfLines,undefined);assert.equal(text.props.allowFontScaling,undefined);
   assert.equal(text.props.children[0],items[i].label);assert.equal(button.props.accessibilityLabel,items[i].label);
   assert.equal(button.props.style[1]?.width,fontScale>1.2?'50%':undefined);
   button.props.onPress();
  });
  for(const name of ids.slice(0,7))assert.ok(calls.includes(name),name);
  if(role==='driver'){assert.equal(buttons[7].props.accessibilityLabel,getExpenseCopy(lang).tripTitle);assert.ok(calls.some(v=>Array.isArray(v)&&v[0]==='DriverExpenses'&&v[1]==='own-test-deal'));}
  assert.equal(s.attachIcon.width,64);assert.equal(s.attachLabel.maxWidth,'100%');assert.equal(s.attachLabel.height,undefined);
 }
});
