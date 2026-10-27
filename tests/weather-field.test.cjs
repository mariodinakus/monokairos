const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Field=require('../weather-field.js');
const app=()=>fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const html=()=>fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const c={lat:40.6401,lon:22.9444,cc:'GR'};
function hourly(points,t,values){
 return points.map((p,i)=>({...p,times:[t],hourly:{precip:[values[i]],snow:[0],code:[61],prob:[50]}}));
}
function at(p,t){const k=p?.times?.indexOf(t)??-1;return k<0?null:{precip:p.hourly.precip[k],snow:p.hourly.snow[k],weatherCode:p.hourly.code[k],prob:p.hourly.prob[k]};}
test('geographic grid covers Greece with an actual multi-point 2D field',()=>{
 const g=Field.makeGrid(c);
 assert.ok(g.rows>=10);assert.ok(g.cols>=14);assert.ok(g.points.length>100);
 assert.ok(g.bound.south<35);assert.ok(g.bound.north>41);
 assert.ok(g.bound.west<19);assert.ok(g.bound.east>28);
 assert.equal(g.points.length,g.rows*g.cols);
 const a=g.points[0],b=g.points[g.cols],east=g.points[1];
 assert.ok(b.lat>a.lat);assert.ok(east.lon>a.lon);
});
test('interpolation displays broad rain fields rather than only city-point icons',()=>{
 const g=Field.makeGrid(c),t=Date.parse('2026-10-27T16:00:00Z');
 const data=hourly(g.points,t,g.points.map(p=>(p.lon>22&&p.lon<25?6:0)));
 const frame=Field.samples(g,data,t,at);
 const center=Field.interpolate(g,frame,40.5,23.5);
 const dry=Field.interpolate(g,frame,40.5,20);
 assert.ok(center&&center.precip>3);
 assert.ok(dry&&dry.precip<.1);
 assert.equal(Field.rgba(dry)[3],0);
 assert.ok(Field.rgba(center)[3]>150);
});
test('snow and storms produce distinct overlay tints without ever using clouds',()=>{
 const snow=Field.rgba({precip:1,snow:2,storm:0});
 const thunder=Field.rgba({precip:3,snow:0,storm:1});
 const dry=Field.rgba({precip:0,snow:0,storm:0});
 assert.ok(snow[2]>snow[0]);assert.equal(thunder[0],154);
 assert.equal(dry[3],0);
 const g=Field.makeGrid(c);
 assert.equal(Field.interpolate(g,Field.samples(g,[],Date.now(),()=>null),40,23),null);
 const mixed=Field.blend({precip:0,snow:0,storm:0},{precip:8,snow:0,storm:1},.5);
 assert.equal(mixed.precip,4);
});
test('browser uses actual forecast grid, satellite base, and keeps radar readings separate',()=>{
 const s=app(),h=html();
 assert.match(s,/function loadWeatherField/);
 assert.match(s,/function attachWeatherField/);
 assert.match(s,/forecast_hours:54/);
 assert.match(s,/setHour\(idx,animate\?800:0\)/);
 assert.match(s,/radarForecastBase/);
 assert.match(s,/syncRadarMode/);
 assert.match(h,/weather-field\.js/);
 assert.match(h,/weather-field\.css/);
 const f=fs.readFileSync(path.join(__dirname,'..','weather-field.js'),'utf8');
 assert.doesNotMatch(f,/cloud_cover/);
 assert.match(s,/pm-highlights/);
 assert.match(s,/pm-weather-event/);
 assert.match(s,/getSystems\(idx\)/);
});

test('only significant connected weather areas get badges, not every forecast city',()=>{
 const grid=Field.makeGrid(c),t=Date.parse('2026-10-27T16:00:00Z');
 const values=grid.points.map(p=>p.lon>22&&p.lon<24&&p.lat>37&&p.lat<40?9:0);
 const data=hourly(grid.points,t,values);
 const frame=Field.samples(grid,data,t,at);
 const events=Field.systems(grid,frame,4);
 assert.ok(events.length>=1);
 assert.equal(events[0].type,'rain');
 assert.ok(events[0].peak>=8);
 assert.ok(events[0].size>=2);
 const dryFrame=Field.samples(grid,hourly(grid.points,t,values.map(()=>0)),t,at);
 assert.deepEqual(Field.systems(grid,dryFrame),[]);
});
