import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import * as attentionModel from '../../src/utils/dealAttention.js';
const require = createRequire(import.meta.url);
const code = require('@babel/core').transformSync(readFileSync('src/screens/DealsScreen.js','utf8'), {
  babelrc: false, configFile: false,
  plugins: [require('@babel/plugin-transform-react-jsx'),require('@babel/plugin-transform-modules-commonjs')],
}).code;
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness(role) {
  const slots = [], effects = []; let cursor = 0, dirty = true, tree, refresh;
  let snapshot = { badge: 2, notifications: [{ id: 1, type: 'bid_rejected', url: 'urtruck://cargos/cargo?bid=closed' }], rooms: [{ room_id: 'room', unread_count: 1 }] };
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) { const i=cursor++; if (!slots[i]) slots[i]={ value:initial }; return [slots[i].value, v=>{ slots[i].value=typeof v==='function'?v(slots[i].value):v; dirty=true; }]; },
    useRef(initial) { return slots[cursor++] ||= { current:initial }; },
    useMemo(fn) { cursor++; return fn(); }, useCallback(fn) { cursor++; return fn; },
  };
  let focused=false;
  const dashboard = { my_deals: [{ id:'live',status:'in_progress',chat_room_id:'room',unread_count:1 }], my_bids: role==='driver'?[{id:'closed',cargo_id:'cargo',status:'rejected'}]:[], incoming_bids: role==='client'?[{id:'closed',cargo_id:'cargo',status:'rejected'}]:[] };
  const native = Object.fromEntries(['ActivityIndicator','FlatList','RefreshControl','Text','TextInput','TouchableOpacity','View'].map(x=>[x,x]));
  native.StyleSheet={create:x=>x};
  const mocks = {
    react:React,'react-native':native,'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},
    '@react-navigation/native':{useFocusEffect(fn){ if(!focused){focused=true;effects.push(fn);} }},
    '@expo/vector-icons/Feather':'Feather',
    '../utils/additionalLocales.js':{withAdditionalLanguageTree:x=>x,localizeUiText:x=>x},
    '../utils/foregroundPolling':{setForegroundInterval:()=>1,clearForegroundInterval(){}},
    '../utils/useI18n':{useI18n:()=>({t:x=>x,lang:'RU',sp:x=>x})},
    '../utils/ThemeContext':{useTheme:()=>({theme:{},isDark:false})},
    '../theme/designV1':{useDriverCeramicColors:()=>({})},
    '../utils/i18n':{formatStatus:x=>x},
    '../components/ui/v1/RootHeader':'RootHeader',
    '../utils/marketAPI':{marketAPI:{myDashboard:async()=>dashboard}},
    '../utils/notificationsAPI':{notificationsAPI:{attention:async()=>snapshot}},
    '../utils/normalizers':{formatPrice:x=>String(x)},
    '../utils/places':{localizeCargoName:x=>x,localizePlace:x=>x},
    '../utils/countryFlags':{countryCode:x=>x},
    '../utils/dealMessagePreview':{dealMessagePreview:()=>''},
    '../components/deal/DealRoom':{accentFor:()=> '#168759'},
    '../hooks/useSafeRefresh':{useSafeRefresh:fn=>{refresh=fn;return {refreshing:false,onRefresh:fn};}},
    '../utils/dealAttention':attentionModel,
    '../utils/dealsUnread':{isBidActionable:()=>false},
    '../utils/dealsBusinessActions':{countOfferBusinessActions:()=>0,countActiveDealBusinessActions:()=>0},
    '../utils/bidExpiry':{formatBidRemaining:()=>'',isBidFresh:()=>true},
    '../components/ui/v1/MarketplaceCard':'MarketplaceCard',
    '../components/ui/v1/DriverRouteBackdrop':'DriverRouteBackdrop',
    '../components/VerificationGate':{useVerificationGate:()=>({requireLevel:()=>true,Gate:'Gate'})},
  };
  const module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports,require:name=>{assert.ok(name in mocks,name);return mocks[name];},URL,Date,Map,Set,console});
  function nodes(){const all=[];const walk=n=>{if(Array.isArray(n))return n.forEach(walk);if(!n?.props)return;all.push(n);walk(n.props.children);walk(n.props.ListHeaderComponent);};walk(tree);return all;}
  return {
    async flush(){for(let i=0;i<8;i++){if(dirty){cursor=0;dirty=false;tree=module.exports.default({navigation:{navigate(){}},route:{params:{role}}});effects.splice(0).forEach(fn=>fn());}await tick();}},
    tab:id=>nodes().find(n=>n.props.testID===`deals-tab-${id}`),
    list:()=>nodes().find(n=>n.type==='FlatList'),
    async readChat(){snapshot={badge:1,notifications:snapshot.notifications,rooms:[]};await refresh();},
  };
}
for(const role of ['driver','client']) test(`${role}: lower snapshot maps to active/archive tabs and concrete cards; reading chat preserves archive`,async()=>{
  const h=harness(role);await h.flush();
  assert.equal(h.tab('active').props.attentionCount,1);
  assert.equal(h.tab('archive').props.attentionCount,1);
  assert.equal(h.tab('offers').props.attentionCount,0);
  h.tab('archive').props.onPress();await h.flush();
  const list=h.list();assert.equal(list.props.data.length,1);
  assert.equal(list.props.renderItem({item:list.props.data[0]}).props.unread,1);
  await h.readChat();await h.flush();
  assert.equal(h.tab('active').props.attentionCount,0);
  assert.equal(h.tab('archive').props.attentionCount,1);
});
