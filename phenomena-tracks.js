/* MONO Weather / modelled movement corridors.
 * The paths link neighbouring *forecast* precipitation areas between hourly
 * frames. They are indicative displacement only, never observed radar tracks.
 */
(function(root){
'use strict';
const finite=Number.isFinite;
const RAD=Math.PI/180;
function distance(a,b){
 const x=(b.lat-a.lat)*RAD,y=(b.lon-a.lon)*RAD;
 const h=Math.sin(x/2)**2+Math.cos(a.lat*RAD)*Math.cos(b.lat*RAD)*Math.sin(y/2)**2;
 return 12742*Math.asin(Math.min(1,Math.sqrt(h)));
}
function bearing(a,b){
 const dl=(b.lon-a.lon)*RAD,p1=a.lat*RAD,p2=b.lat*RAD;
 const y=Math.sin(dl)*Math.cos(p2),x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);
 return (Math.atan2(y,x)/RAD+360)%360;
}
const direction=(deg,el=true)=>{
 const gr=['Β','ΒΑ','Α','ΝΑ','Ν','ΝΔ','Δ','ΒΔ'];
 const en=['N','NE','E','SE','S','SW','W','NW'];
 return (el?gr:en)[Math.round(deg/45)%8];
};
function computeTracks(getSystems,times,startIndex,{hours=8,limit=4}={}){
 if(typeof getSystems!=='function'||!Array.isArray(times)||times.length<3)return [];
 const start=Math.max(0,Math.min(times.length-1,Math.floor(startIndex)));
 const end=Math.min(times.length-1,start+Math.max(2,Math.round(hours)));
 if(end-start<2)return [];
 const frames=new Map();
 const systemAt=i=>{
   if(!frames.has(i)){
     const s=getSystems(i);
     frames.set(i,Array.isArray(s)?s.filter(p=>['rain','snow','storm'].includes(p.type)&&finite(p.lat)&&finite(p.lon))
       .map(p=>({...p,lat:finite(p.centerLat)?p.centerLat:p.lat,lon:finite(p.centerLon)?p.centerLon:p.lon})) : []);
   }
   return frames.get(i);
 };
 const startSystems=systemAt(start).slice(0,Math.max(1,limit));
 const used=new Map(),result=[];
 for(const seed of startSystems){
   const chain=[{...seed,index:start}],lastType=seed.type;
   for(let i=start+1;i<=end;i++){
     const available=systemAt(i);
     const taken=used.get(i)||new Set();
     const prev=chain[chain.length-1];
     const elapsed=(times[i]-times[prev.index])/3600000;
     if(!finite(elapsed)||elapsed<=0||elapsed>1.6)break;
     const candidates=available.map((p,j)=>({p,j,d:distance(prev,p)}))
       .filter(o=>o.p.type===lastType&&!taken.has(o.j)&&o.d<=115*elapsed)
       .sort((a,b)=>a.d-b.d);
     if(!candidates.length)break;
     const next=candidates[0];
     chain.push({...next.p,index:i});
     taken.add(next.j);
     used.set(i,taken);
   }
   if(chain.length<3)continue;
   const total=chain.slice(1).reduce((acc,p,i)=>acc+distance(chain[i],p),0);
   const straight=distance(chain[0],chain[chain.length-1]);
   const elapsed=(times[chain[chain.length-1].index]-times[start])/3600000;
   if(straight<28||total>straight*3.2||elapsed<=0)continue;
   const avgSpeed=straight/elapsed;
   if(avgSpeed>110)continue;
   result.push({type:lastType,points:chain,from:start,to:chain[chain.length-1].index,
     distanceKm:Math.round(straight),bearing:bearing(chain[0],chain[chain.length-1]),hours:elapsed,
     maxIntensity:Math.max(...chain.map(p=>p.peak||0))});
 }
 return result.slice(0,limit);
}
function arrival(field,lat,lon,times,startIndex,hours=12){
 if(!field||typeof field.getSample!=='function'||!finite(lat)||!finite(lon)||!Array.isArray(times)||!times.length)return {status:'unavailable'};
 const start=Math.max(0,Math.min(times.length-1,Math.floor(startIndex)));
 const end=Math.min(times.length-1,start+hours);
 let valid=0;
 for(let i=start;i<=end;i++){
   const s=field.getSample(lat,lon,i);
   if(!s||!finite(s.precip)||!finite(s.snow))continue;
   valid++;
   if(s.precip>=.25||s.snow>=.15)return {status:i===start?'now':'incoming',
     hours:Math.max(0,Math.round((times[i]-times[start])/3600000)),
     index:i,type:s.snow>=.15&&s.snow*2>=s.precip?'snow':'rain'};
 }
 return {status:valid?'none':'unavailable',hours:Math.round((times[end]-times[start])/3600000)};
}
function render(L,group,field,index,times,bounds,lang='el'){
 if(!L||!group||!field||!group._map)return [];
 group.clearLayers();
 const map=group._map;
 if(!map.getPane('pm-track-pane'))map.createPane('pm-track-pane');
 map.getPane('pm-track-pane').style.zIndex='470';
 map.getPane('pm-track-pane').style.pointerEvents='none';
 const el=lang!=='en';
 const tracks=computeTracks(i=>field.getSystems(i,16),times,index,{limit:12})
   .filter(track=>track.points.some(p=>!bounds||bounds.contains([p.lat,p.lon]))).slice(0,4);
 const colors={rain:'#ffb342',snow:'#58d8ff',storm:'#cf8aff'};
 for(const track of tracks){
   const visible=track.points.some(p=>!bounds||bounds.contains([p.lat,p.lon]));
   if(!visible)continue;
   const positions=track.points.map(p=>[p.lat,p.lon]);
   const color=colors[track.type],last=track.points[track.points.length-1];
   const type=track.type==='rain'?(el?'Ζώνη βροχής':'Rain area'):track.type==='snow'?(el?'Ζώνη χιονιού':'Snow area'):(el?'Ζώνη καταιγίδας':'Storm area');
   const dir=direction(track.bearing,el),h=Number(track.hours.toFixed(1));
   const tip=el?type+' · πιθανή μετατόπιση προς '+dir+' (+'+h+'ω)':
     type+' · possible displacement '+dir+' (+'+h+'h)';
   const line=L.polyline(positions,{pane:'pm-track-pane',color,weight:4,opacity:.96,dashArray:'7 7',lineCap:'round',smoothFactor:.8,interactive:true}).addTo(group);
   line.bindTooltip(tip,{sticky:true,direction:'top'});
   line.bindPopup('<div class="pm-popup"><strong>'+tip+'</strong><p>'+track.distanceKm+
     (el?' km περίπου σε ':' km in about ')+h+(el?' ώρες':' hours')+'</p><small>'+
     (el?'Σύνδεση διαδοχικών περιοχών του προγνωστικού πλέγματος Open-Meteo. Δεν είναι παρακολούθηση συγκεκριμένης καταιγίδας ούτε μέτρηση ραντάρ.':
     'Matching adjacent Open-Meteo forecast areas. Not an observed radar track or an individual storm trajectory.')+'</small></div>');
   L.marker([last.lat,last.lon],{pane:'markerPane',keyboard:false,interactive:false,zIndexOffset:900,
     icon:L.divIcon({className:'pm-track-arrow-marker',html:'<span class="pm-track-arrow" style="--pm-bearing:'+Math.round(track.bearing)+'deg;--pm-color:'+color+'">↑</span>',
       iconSize:[34,34],iconAnchor:[17,17]})}).addTo(group);
 }
 return tracks;
}
const api={distance,bearing,direction,computeTracks,arrival,render};
root.MONOPhenomenaTracks=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
