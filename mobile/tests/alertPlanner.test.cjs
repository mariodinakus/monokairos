const test = require('node:test');
const assert = require('node:assert/strict');
const {planForecastAlerts}=require('../alertPlanner.cjs');
const now=new Date('2026-10-16T15:00:00Z').getTime();
const H=3600;
function weatherData({rain=false,storm=false,wind=false}={}){
 const time=Array.from({length:48},(_,i)=>Math.floor(now/1000)+i*H);
 const precipitation_probability=Array(48).fill(10);
 const precipitation=Array(48).fill(0);
 const weather_code=Array(48).fill(1);
 const wind_gusts_10m=Array(48).fill(20);
 if(rain){precipitation_probability[3]=85;precipitation[3]=2.5;}
 if(storm){weather_code[5]=95;}
 if(wind){wind_gusts_10m[8]=78;}
 return {hourly:{time,precipitation_probability,precipitation,weather_code,wind_gusts_10m,temperature_2m:Array(48).fill(19)}};
}
test('rain warning is scheduled before onset',()=>{
 const v=planForecastAlerts({weather:weatherData({rain:true}),prefs:{rain:true},now});
 assert.equal(v.length,1);
 assert.equal(v[0].type,'rain');
 assert.equal(v[0].at,(Math.floor(now/1000)+3*H)*1000-30*60000);
});
test('never alert for disabled category',()=>{
 const v=planForecastAlerts({weather:weatherData({rain:true,storm:true,wind:true}),prefs:{},now});
 assert.deepEqual(v,[]);
});
test('storm gust and air quality are distinct alerts',()=>{
 const air={hourly:{time:[Math.floor(now/1000)+9*H],us_aqi:[145]}};
 const v=planForecastAlerts({weather:weatherData({storm:true,wind:true}),air,prefs:{storm:true,wind:true,air:true},now});
 assert.deepEqual(v.map(x=>x.type).sort(),['air','storm','wind']);
});
test('no false air warning for missing AQI',()=>{
 const air={hourly:{time:[Math.floor(now/1000)+9*H],us_aqi:[null]}};
 const v=planForecastAlerts({weather:weatherData(),air,prefs:{air:true},now});
 assert.equal(v.length,0);
});
test('never schedule alerts beyond 48h horizon',()=>{
 const weather=weatherData({wind:true});
 weather.hourly.time[8]=Math.floor(now/1000)+72*H;
 const v=planForecastAlerts({weather,prefs:{wind:true},now});
 assert.equal(v.length,0);
});
