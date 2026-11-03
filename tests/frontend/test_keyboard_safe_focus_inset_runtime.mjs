import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import sucrase from 'sucrase';

// Реальный общий контейнер, native-измерения и прокрутка в логических пикселях.
function harness() {
 const refs=[],listeners=new Map(),cleanups=[],scrolls=[];let context,offset=0;
 const react={...React,forwardRef:fn=>fn,useRef:value=>{const r={current:value};refs.push(r);return r;},useCallback:fn=>fn,useImperativeHandle:()=>{},useContext:()=>context,useEffect:fn=>{cleanups.push(fn());}};
 const native={KeyboardAvoidingView:'KeyboardAvoidingView',ScrollView:'ScrollView',Platform:{OS:'android',Version:36},StyleSheet:{create:x=>x},Keyboard:{addListener:(name,fn)=>{listeners.set(name,fn);return {remove:()=>listeners.delete(name)};}},UIManager:{measure:(target,fn)=>fn(0,0,300,56,0,(target===42?300:400)-offset)}};
 const exports={};vm.runInNewContext(sucrase.transform(fs.readFileSync('src/components/ui/v1/KeyboardSafeLayout.js','utf8'),{transforms:['imports','jsx']}).code,{exports,require:n=>n==='react'?react:native,requestAnimationFrame:fn=>{fn();return 0;}});
 const tree=exports.KeyboardSafeScrollView({},null);context=tree.props.value;
 refs[0].current={measure:fn=>fn(0,0,300,350,0,0),scrollTo:value=>{offset=value.y;scrolls.push(value);}};
 listeners.get('keyboardDidShow')({endCoordinates:{screenY:400}});
 return {scrolls,focus:(target,inset)=>inset===undefined?context({nativeEvent:{target}}):exports.useKeyboardSafeFocus(undefined,inset)({nativeEvent:{target}}),move:value=>{offset=value;tree.props.children.props.onScroll({nativeEvent:{contentOffset:{y:value}}});},dispose:()=>cleanups.forEach(fn=>fn?.())};
}

test('поле и подсказки целиком поднимаются над sticky CTA, а не только над IME',()=>{
 const h=harness();try{h.focus(42,164);assert.equal(h.scrolls.at(-1).y,186);assert.equal(300-186+56+164,334);}finally{h.dispose();}
});
test('обычное поле сохраняет прежний отступ без подсказок',()=>{
 const h=harness();try{h.focus(42);assert.equal(h.scrolls.at(-1).y,22);}finally{h.dispose();}
});
test('следующее поле не наследует дополнительную высоту подсказок',()=>{
 const h=harness();try{h.focus(42,164);h.move(150);const count=h.scrolls.length;h.focus(43);assert.equal(h.scrolls.length,count);}finally{h.dispose();}
});
