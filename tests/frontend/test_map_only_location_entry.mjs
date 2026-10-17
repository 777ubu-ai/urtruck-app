import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from '@babel/parser';
function callsIn(path,name) {
 const source=readFileSync(path,'utf8');const ast=parse(source,{sourceType:'module',plugins:['jsx']});const calls=[];
 const walk=node=>{if(!node||typeof node!=='object')return;if(node.type==='CallExpression'&&node.callee?.name===name)calls.push(node);for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}};walk(ast);return {source,calls};
}
function enabled(path,scope) {
 const {source,calls}=callsIn(path,'useDealLocationBroadcast');assert.equal(calls.length,1);
 const arg=calls[0].arguments[1];return new Function(...Object.keys(scope),'return ('+source.slice(arg.start,arg.end)+').enabled;')(...Object.values(scope));
}
test('реальный map entry разрешает GPS только водителю на видимой карте активного рейса',()=>{
 const path='src/screens/DealWorkspaceScreenV2.js';const base={isFocused:true,viewMode:'map',VIEW_MAP:'map',role:'driver',trackingActive:true};
 assert.equal(enabled(path,base),true);
 for(const change of [{isFocused:false},{viewMode:'chat'},{role:'client'},{trackingActive:false}])assert.equal(enabled(path,{...base,...change}),false);
});
test('preview карты в карточке не включает GPS до открытия; blur закрывает доступ',()=>{
 const path='src/components/RouteMap.js';const base={isFocused:true,routeOpen:true,trackingActive:true};assert.equal(enabled(path,base),true);
 for(const change of [{routeOpen:false},{isFocused:false},{trackingActive:false}])assert.equal(enabled(path,{...base,...change}),false);
});
test('root navigator не владеет автоматической геолокацией; погода не запускает датчик',()=>{
 assert.equal(callsIn('src/navigation/AppNavigator.js','useDealLocationBroadcast').calls.length,0);
 const weather=readFileSync('src/components/TripRoutePanel.js','utf8');assert.doesNotMatch(weather,/captureForegroundPosition|getCurrentPositionAsync|watchPositionAsync/);
});
test('проверка возможностей перед стартом не запрашивает fix, сохраняет отказы permission/provider',async()=>{
 const source=readFileSync('src/utils/backgroundLocation.js','utf8');const ast=parse(source,{sourceType:'module'});
 const node=ast.program.body.find(n=>n.type==='ExportNamedDeclaration'&&n.declaration?.id?.name==='getLocationHealth').declaration;
 let captures=0;const native={getForegroundPermissionsAsync:async()=>({status:'granted'}),getProviderStatusAsync:async()=>({locationServicesEnabled:true})};
 const health=new Function('resolveLocationModule','captureForegroundPosition','AppState','return ('+source.slice(node.start,node.end)+');')(async()=>native,async()=>{captures++;throw Error('must not capture');},{currentState:'active'});
 assert.deepEqual(await health({requestPosition:false}),{state:'ready',point:null});assert.equal(captures,0);
 native.getProviderStatusAsync=async()=>({locationServicesEnabled:false});assert.equal((await health({requestPosition:false})).state,'system_disabled');assert.equal(captures,0);
 native.getForegroundPermissionsAsync=async()=>({status:'denied'});assert.equal((await health({requestPosition:false})).state,'permission_denied');assert.equal(captures,0);
});
