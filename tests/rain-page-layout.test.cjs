'use strict';
const {test}=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs');
test('rain page prioritizes the forecast and keeps detailed sections reachable',()=>{
 const app=fs.readFileSync(require('node:path').join(__dirname,'..','app.js'),'utf8');
 const page=app.slice(app.indexOf('function rainPage() {'),app.indexOf('/* ------------------------------------------------------------------ page: weather events */'));
 assert.match(page,/return head \+ rainNowCard\(false\) \+ firstEpisode \+ shortRange \+ days/);
 for(const section of ['rain-future','rain-observations','rain-monthly','rain-explain','rain-alerts']) assert.ok(page.includes(section));
 assert.doesNotMatch(page,/communityStationsCard\(\)/);
 assert.match(page,/includeLive:false/);
});
