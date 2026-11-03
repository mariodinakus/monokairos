'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '../App.js'),'utf8');
const start = app.indexOf('const INSTALL_NATIVE_HEADER = ');
const tick = String.fromCharCode(96);
const open = app.indexOf(tick,start);
const close = app.indexOf(tick,open+1);
assert.ok(start>0 && open>start && close>open, 'native header bridge must exist');
const setup = app.slice(open+1,close);

test('Android app keeps exactly one website-owned header', () => {
  assert.doesNotMatch(app, /<View style=\{s\.header\}>/);
  assert.match(app, /onMessage=\{onWebMessage\}/);
  assert.match(app, /injectJavaScript\(INSTALL_NATIVE_HEADER\)/);
  assert.match(app, /NotificationSettings visible=\{settingsVisible\}/);
  assert.match(app, /WEBVIEW_BUILD = '1\.5\.0'/);
});

test('native bell is injected once and opens the notifications modal', () => {
  const requests = [];
  const listeners = {};
  const controls = [];
  const nodes = {};
  const geo = {dataset:{}, addEventListener:(type,fn,capture)=>{listeners.gps=fn; assert.equal(capture,true)}};
  const actions = {firstChild:null, insertBefore:node=>{controls.push(node);nodes[node.id]=node}};
  const document = {
    documentElement:{classList:{add:token=>{assert.equal(token,'mono-native-shell')}}},
    querySelector:selector=>selector==='.topActions'?actions:null,
    getElementById:id=>id==='geoBtn'?geo:nodes[id]||null,
    createElement:tag=>{
      assert.equal(tag,'button');
      return {
        type:'',id:'',className:'',dataset:{},
        setAttribute:()=>{},
        addEventListener:(event,fn)=>{listeners.bell=fn},
      };
    }
  };
  const window = {ReactNativeWebView:{postMessage:data=>requests.push(JSON.parse(data))}};
  vm.runInNewContext(setup,{document,window},{timeout:2000});
  assert.equal(controls.length,1);
  assert.equal(controls[0].id,'monoAndroidAlerts');
  listeners.bell({preventDefault:()=>{}});
  listeners.gps({preventDefault:()=>{},stopImmediatePropagation:()=>{}});
  assert.deepEqual(requests.map(x=>x.type),['mono-open-native-alerts','mono-native-gps']);
  vm.runInNewContext(setup,{document,window},{timeout:2000});
  assert.equal(controls.length,1,'duplicate bell should not appear on repeated injection');
});

test('Android notifications and GPS actions remain available', () => {
  assert.match(app, /message\?\.type === 'mono-open-native-alerts'/);
  assert.match(app, /setSettingsVisible\(true\)/);
  assert.match(app, /message\?\.type === 'mono-native-gps'/);
  assert.match(app, /nativeLocateRef\.current\?\.\(\)/);
  assert.match(app, /Location\.getCurrentPositionAsync/);
});
