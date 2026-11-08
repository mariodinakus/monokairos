'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('mobile bottom bar uses four category groups covering every existing route',()=>{
  const app=read('app.js'),matched=app.match(/const NAV_GROUPS = (\[[\s\S]*?\]);\s*const NAV_OPEN_KEY/);
  assert.ok(matched,'NAV_GROUPS should exist');
  const groups=vm.runInNewContext(matched[1]);
  assert.deepEqual(Array.from(groups,x=>x.id),['weather','earth','data','space']);
  assert.deepEqual(Array.from(new Set(groups.flatMap(x=>x.pages))).sort(),
    ['now','guide','hourly','rain','radar','maps','globe','earth','phen','climate','environment','history','models','lab','stations','news','cities','space'].sort());
  assert.match(app,/data-action="mobileGroup"/);
  assert.match(app,/data-action="mobileNavClose"/);
  assert.match(app,/aria-expanded="\$\{open\}"/);
  assert.match(app,/aria-current="page"/);
});
test('mobile category drawer does not erase desktop sidebar',()=>{
  const html=read('index.html'), css=read('mobile-nav.css');
  assert.match(html,/id="nav" class="nav"/);
  assert.match(html,/id="mobileNavSheet"/);
  assert.match(html,/id="mobileNavScrim"/);
  assert.match(html,/mobile-nav\.css\?v=[0-9a-f]{10}/);
  assert.match(css,/@media\(max-width:930px\)/);
  assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css,/safe-area-inset-bottom/);
  assert.match(css,/prefers-reduced-motion/);
});
test('PWA updates with mobile navigation stylesheet',()=>{
  const sw=read('sw.js');
  assert.match(sw,/rain-intelligence\.js/);
  assert.match(sw,/rain-intelligence\.css/);
  assert.match(sw,/mobile-nav\.css/);
  assert.match(sw,/quick-screens\.js/);
  assert.match(sw,/quick-screens\.css/);
  assert.match(sw,/mono-weather-\d+\.\d+\.\d+-[0-9a-f]{8}/, 'the PWA cache name carries the release and a content hash');
  assert.match(sw,/next-hour\.js/);
});
test('mobile navigation code stays syntactically valid',()=>{
  try{require('node:child_process').execFileSync(process.execPath,['--check',path.join(__dirname,'..','app.js')]);}
  catch(e){throw new Error(e.stderr?.toString()||e.message);}
});
