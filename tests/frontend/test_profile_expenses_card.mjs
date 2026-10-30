import * as localeHelpers from '../../src/utils/additionalLocales.js';
import { sessionRole } from '../../src/utils/publicationSession.js';
import test from 'node:test';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const fs=require('fs');const vm=require('vm');const assert=require('node:assert/strict');const {pathToFileURL}=require('url');
const root=process.cwd();
const deps=root+'/node_modules';const babel=require(deps+'/@babel/core');
test('карточка расходов: четыре языка, обе темы, роли, соседние пункты и маршрут', async()=>{
 const {LIGHT,DARK}=await import(pathToFileURL(root+'/src/theme/designV1Palette.js'));
 const {getExpenseCopy}=await import(pathToFileURL(root+'/src/utils/expenseCopy.js'));
 const source=babel.transformSync(fs.readFileSync(root+'/src/screens/ProfileScreen.js','utf8'),{babelrc:false,configFile:false,plugins:[require(deps+'/@babel/plugin-transform-react-jsx'),require(deps+'/@babel/plugin-transform-modules-commonjs')]}).code;
 let checked=0;
 for(const lang of ['RU','EN','KK','ZH'])for(const dark of [false,true])for(const role of ['driver','client'])for(const accountRole of ['driver','client',null]){
  const colors=dark?DARK:LIGHT;const navigations=[];
  const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),Fragment:Symbol('Fragment'),useState:v=>[typeof v==='function'?v():v,()=>{}],useEffect:()=>{},useCallback:f=>f};
  const mocks={
    '../utils/additionalLocales.js': localeHelpers, '../../utils/additionalLocales.js': localeHelpers, '../utils/publicationSession':{sessionRole},
   react:React,'react-native':{View:'View',Text:'Text',TouchableOpacity:'TouchableOpacity',StyleSheet:{create:x=>x,hairlineWidth:0.5},ScrollView:'ScrollView',Alert:{alert:()=>{}},Platform:{OS:'android'},Image:'Image'},
   'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},'@react-navigation/native':{useFocusEffect:()=>{}},'@expo/vector-icons/Feather':'Feather',
   '../utils/i18n':{setLanguage:()=>{},getLanguage:()=>lang},'../utils/useI18n':{useI18n:()=>({t:k=>k,lang})},'../utils/ThemeContext':{useTheme:()=>({isDark:dark,toggleTheme:()=>{}})},
   '../theme/designV1':{useV1Colors:()=>colors,useShipperCeramicColors:()=>({...colors,active:colors.driver})},'../utils/AuthContext':{useAuth:()=>({session:{user:{id:'test-driver',phone:'',role:accountRole}},signOut:()=>{},verificationLevel:0})},
   '../utils/store':{getProfile:()=>({}),saveProfile:()=>{}},'../utils/storage':{storage:{}},'../utils/registration':{regAPI:{}},'../utils/security':{driverTier:()=>({color:colors.driver,emoji:'',key:'driver',pct:0}),countCompletedTrips:()=>0,isDocsConfirmed:()=>false},'../utils/marketAPI':{marketAPI:{}},
   '../components/GradientText':'GradientText','../components/HelpButton':'HelpButton','../config/env':{API_BASE:'https://qa2.urtruck.kz/api/v1'},'../config/supabase':{IS_BETA:true},'../components/ui/AppConfirmModal':'AppConfirmModal','../components/ui/v1/Button':'Button','../components/ui/v1/CountryFlag':'CountryFlag','../components/LanguageSwitcher':'LanguageSwitcher','../utils/places':{localizePlace:()=>''},'../utils/appVersionLabel':{appVersionLabel:()=>''},'../utils/vehicleSetupCopy':{getVehicleCopy:()=>({myVehicles:'Мои машины'})},'../utils/expenseCopy':{getExpenseCopy}
  };
  const module={exports:{}};
  vm.runInNewContext(source,{exports:module.exports,module,require:name=>{if(!(name in mocks))throw Error('Неожиданный импорт: '+name);return mocks[name]},process:{env:{}},console});
  const tree=module.exports.default({route:{params:{role}},navigation:{canGoBack:()=>true,goBack:()=>{},navigate:(...args)=>navigations.push(args)}});
  const nodes=[];function walk(n){if(Array.isArray(n)){n.forEach(walk);return;}if(!n||typeof n!=='object')return;if(n.props){nodes.push(n);walk(n.props.children);}}walk(tree);
  const cards=nodes.filter(n=>n.props.testID==='profile-my-expenses');assert.equal(cards.length,accountRole==='driver'?1:0);
  if(accountRole==='driver'){
   const card=cards[0];assert.equal(card.props.accessibilityRole,'button');assert.equal(card.props.accessibilityLabel,getExpenseCopy(lang).title);assert.equal(card.props.accessibilityHint,getExpenseCopy(lang).privacy);
   assert.ok(nodes.indexOf(card)<nodes.findIndex(n=>n.props.testID==='profile-notifications'));
   card.props.onPress();assert.equal(navigations[0][0],'DriverExpenses');assert.equal(navigations[0][1].role,'driver');assert.equal(navigations[0][1].targetId,'test-driver');
   assert.ok(card.props.style[0].minHeight>=100);
   assert.equal(card.props.style[0].height,undefined);
   const children=[];function collect(n){if(Array.isArray(n)){n.forEach(collect);return;}if(n?.props){children.push(n);collect(n.props.children);}}collect(card);
   for(const child of children){assert.notEqual(child.props.allowFontScaling,false);assert.equal(child.props.numberOfLines,undefined);}
   const notifications=nodes.find(n=>n.props.testID==='profile-notifications');
   notifications.props.onPress();assert.ok(navigations.length>1);
   const vehicle=nodes.find(n=>n.props.testID==='profile-my-vehicles');
   if(vehicle){vehicle.props.onPress();assert.ok(navigations.length>2);}
  }
  checked++;
 }
 console.log('PASS: '+checked+' сочетаний языка/темы/роли; карточка отдельная, только водителю, маршрут и параметры сохранены.');
});
