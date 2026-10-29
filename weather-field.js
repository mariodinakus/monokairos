/* MONO / WEATHER FIELD — real forecast grids -> top-down moving rainfall, snow and
 * thunderstorm areas. This is an interpolated model forecast, never radar imagery.
 * No cloud-cover field is requested or rendered.
 */
(function(root){
'use strict';
const finite=Number.isFinite;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

function makeGrid(city){
 const greek=city?.cc==='GR'||(city?.lat>=34.4&&city?.lat<=41.8&&city?.lon>=19&&city?.lon<=29.7);
 const step=.85,latMin=greek?34.0:clamp(+city.lat-4.6,-79,79),
  lonMin=greek?18.1:clamp(+city.lon-5.8,-174,169);
 const rows=greek?11:12,cols=greek?16:15;
 const pts=[];
 for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
  pts.push({lat:+(latMin+r*step).toFixed(4),lon:+(lonMin+c*step).toFixed(4),row:r,col:c,name:'',nameEn:'',rank:99});
 }
 return {points:pts,latMin,lonMin,latStep:step,lonStep:step,rows,cols,
  bound:{south:latMin,north:latMin+(rows-1)*step,west:lonMin,east:lonMin+(cols-1)*step},
  key:(greek?'GR':city?.lat?.toFixed(1)+','+city?.lon?.toFixed(1))+':'+rows+'x'+cols};
}
function samples(grid,data,t,at){
 const len=grid.rows*grid.cols,precip=new Float32Array(len),snow=new Float32Array(len),storm=new Float32Array(len),valid=new Uint8Array(len);
 for(let i=0;i<len;i++){
  const row=at(data?.[i],t);
  if(!row||(!finite(row.precip)&&!finite(row.snow)))continue;
  valid[i]=1;
  precip[i]=Math.max(0,finite(row.precip)?row.precip:0);
  snow[i]=Math.max(0,finite(row.snow)?row.snow:0);
  storm[i]=(row.weatherCode>=95&&row.weatherCode<=99)?1:0;
 }
 return {precip,snow,storm,valid};
}
function interpolate(grid,frame,lat,lon){
 if(!grid||!frame||!finite(lat)||!finite(lon))return null;
 const fy=(lat-grid.latMin)/grid.latStep,fx=(lon-grid.lonMin)/grid.lonStep;
 if(fy<0||fx<0||fy>grid.rows-1||fx>grid.cols-1)return null;
 const y=Math.min(Math.floor(fy),grid.rows-2),x=Math.min(Math.floor(fx),grid.cols-2),
  u=clamp(fx-x,0,1),v=clamp(fy-y,0,1);
 const idx=[y*grid.cols+x,y*grid.cols+x+1,(y+1)*grid.cols+x,(y+1)*grid.cols+x+1];
 const weights=[(1-u)*(1-v),u*(1-v),(1-u)*v,u*v];
 let seen=0,w=0,p=0,s=0,th=0;
 for(let k=0;k<4;k++){
  if(!frame.valid[idx[k]])continue;
  seen++;const ww=weights[k];w+=ww;
  p+=frame.precip[idx[k]]*ww;s+=frame.snow[idx[k]]*ww;th+=frame.storm[idx[k]]*ww;
 }
 // No extrapolation through sparsely observed/unavailable model cells.
 if(seen<3||w<.01)return null;
 return {precip:p/w,snow:s/w,storm:th/w};
}
/* Meteorological visual language: blue light, green moderate, yellow/orange strong,
 * red extreme, violet lightning, icy blue snow. Strong enough to read on light maps. */
const ramps=[
 [0.12,[30,137,247,0]],[.24,[27,134,252,118]],
 [.65,[17,142,247,176]],[1.5,[18,176,164,188]],
 [3.0,[68,196,78,204]],[5.0,[238,199,27,214]],
 [8.0,[250,134,28,225]],[13.0,[238,67,62,237]],
 [21.0,[175,47,144,245]]
];
function rgba(sample){
 if(!sample)return [0,0,0,0];
 const rain=sample.precip,snow=sample.snow,storm=sample.storm;
 if(snow>=.15&&snow*2>=rain){
  const a=clamp(Math.round(155+55*Math.log2(1+snow)),0,241);
  return snow>=1.4?[194,230,250,a]:[73,159,245,a];
 }
 if(rain<.1)return [0,0,0,0];
 let k=0;while(k+1<ramps.length&&ramps[k+1][0]<=rain)k++;
 let a=ramps[k],b=ramps[Math.min(k+1,ramps.length-1)];
 let q=b[0]===a[0]?0:clamp((rain-a[0])/(b[0]-a[0]),0,1);
 const col=a[1].map((v,i)=>Math.round(v+(b[1][i]-v)*q));
 if(storm>=.48&&rain>=.5)return [154,55,215,clamp(Math.round(col[3]+13),0,246)];
 return col;
}
function typeAt(s){
 if(!s)return 'unknown';
 if(s.storm>=.48&&s.precip>=.4)return 'storm';
 if(s.snow>=.3&&s.snow*2>=s.precip)return 'snow';
 if(s.precip>=6)return 'heavy';
 if(s.precip>=1.4)return 'rain';
 if(s.precip>=.2)return 'light';
 return 'dry';
}
/* Contiguous model-grid systems; labels are placed near the highest-intensity node,
 * not falsely anchored to a nearby city. Never invent a trajectory. */
function systems(grid,frame,limit=4){
 if(!grid||!frame)return [];
 const count=grid.rows*grid.cols,seen=new Uint8Array(count),out=[];
 const classify=i=>{
  if(!frame.valid[i])return null;
  const p=frame.precip[i],s=frame.snow[i],th=frame.storm[i];
  if(th>.5&&p>=.5)return 'storm';
  if(s>=.2&&s*2>=p)return 'snow';
  if(p>=1.0)return 'rain';
  return null;
 };
 for(let i=0;i<count;i++){
  if(seen[i])continue;
  const type=classify(i);
  if(!type)continue;
  const stack=[i];seen[i]=1;let size=0,peak=-1,best=i,sum=0,latSum=0,lonSum=0;
  while(stack.length){
   const j=stack.pop();size++;
   const score=type==='snow'?frame.snow[j]*3:frame.precip[j];
   sum+=score;
   latSum+=grid.points[j].lat*score;lonSum+=grid.points[j].lon*score;
   if(score>peak){peak=score;best=j;}
   const x=j%grid.cols,y=Math.floor(j/grid.cols);
   for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){
    if(nx<0||nx>=grid.cols||ny<0||ny>=grid.rows)continue;
    const k=ny*grid.cols+nx;
    if(!seen[k]&&classify(k)===type){seen[k]=1;stack.push(k);}
   }
  }
  if(size<2&&peak<(type==='snow'?1.5:5))continue;
  const pt=grid.points[best];
  const value=type==='snow'?frame.snow[best]:frame.precip[best];
  out.push({type,lat:pt.lat,lon:pt.lon,centerLat:sum>0?latSum/sum:pt.lat,centerLon:sum>0?lonSum/sum:pt.lon,peak:value,size,weight:sum,score:peak+Math.min(5,size*.35)});
 }
 return out.sort((a,b)=>b.score-a.score).slice(0,Math.max(0,limit));
}
function blend(a,b,t){
 if(!a)return b;if(!b)return a;
 const s=clamp(t,0,1);
 return {precip:a.precip*(1-s)+b.precip*s,
  snow:a.snow*(1-s)+b.snow*s,storm:a.storm*(1-s)+b.storm*s};
}
function createLayer(L){
 return L.Layer.extend({
  initialize:function(){this._frame=null;this._next=null;this._fraction=0;this._grid=null;this._frameCache=null;this._anim=0;this._visible=true;},
  onAdd:function(map){
   this._map=map;this._canvas=L.DomUtil.create('canvas','mono-precip-overlay');
   this._canvas.setAttribute('aria-hidden','true');
   this._canvas.style.pointerEvents='none';
   map.getPanes().overlayPane.appendChild(this._canvas);
   map.on('moveend zoomend resize',this._resize,this);
   this._resize();
  },
  onRemove:function(map){
   if(this._anim)cancelAnimationFrame(this._anim);this._anim=0;
   map.off('moveend zoomend resize',this._resize,this);
   this._canvas?.remove();this._map=null;this._canvas=null;
  },
  setForecast:function(grid,data,at,times){
   this._grid=grid;this._at=at;this._data=data;this._times=times;
   this._frameCache=new Map();
   this.setHour(0,0);
  },
  getFrame:function(index){return this._getFrame(index);},
  getSample:function(lat,lon,index){return interpolate(this._grid,this._getFrame(index),lat,lon);},
  getSystems:function(index,limit=4){return systems(this._grid,this._getFrame(index),limit);},
  _getFrame:function(index){
   if(!this._grid||!this._times?.length)return null;
   const i=clamp(Math.round(index),0,this._times.length-1);
   if(this._frameCache.has(i))return this._frameCache.get(i);
   const res=samples(this._grid,this._data,this._times[i],this._at);
   this._frameCache.set(i,res);
   if(this._frameCache.size>7)this._frameCache.delete(this._frameCache.keys().next().value);
   return res;
  },
  setHour:function(index,fade=0){
   if(this._anim){cancelAnimationFrame(this._anim);this._anim=0;}
   if(!fade||!this._times?.length){this._frame=this._getFrame(index);this._next=null;this._fraction=0;this._paint();return;}
   const last=this._frame;
   this._next=this._getFrame(index);
   if(!last||!this._next){this._frame=this._next;this._next=null;this._paint();return;}
   const start=performance.now();
   const tick=(now)=>{
    if(!this._map)return;
    this._fraction=clamp((now-start)/fade,0,1);
    this._paint();
    if(this._fraction<1)this._anim=requestAnimationFrame(tick);
    else{this._frame=this._next;this._next=null;this._fraction=0;this._anim=0;}
   };
   this._anim=requestAnimationFrame(tick);
  },
  _resize:function(){
   if(!this._map||!this._canvas)return;
   const sz=this._map.getSize(),c=this._canvas;
   L.DomUtil.setPosition(c,this._map.containerPointToLayerPoint([0,0]));
   c.width=Math.max(1,Math.round(sz.x));
   c.height=Math.max(1,Math.round(sz.y));
   this._paint();
  },
  _paint:function(){
   if(!this._canvas||!this._map||!this._grid)return;
   const c=this._canvas,ctx=c.getContext('2d');
   if(!ctx)return;
   ctx.clearRect(0,0,c.width,c.height);
   if(!this._frame)return;
   // Small offscreen field produces an efficient semi-transparent smooth overlay
   // with no colour in dry or unsupported places.
   const step=c.width<=500?4:5,w=Math.ceil(c.width/step),h=Math.ceil(c.height/step);
   if(!this._buffer||this._buffer.width!==w||this._buffer.height!==h){
    this._buffer=document.createElement('canvas');this._buffer.width=w;this._buffer.height=h;
   }
   const sub=this._buffer,bctx=sub.getContext('2d',{willReadFrequently:true});
   if(!bctx)return;
   const pixels=bctx.createImageData(w,h),arr=pixels.data;
   // Convert viewport points to lat/lon at the projected geographic grid.
   for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
     const pos=this._map.containerPointToLatLng([x*step+step/2,y*step+step/2]);
     const a=interpolate(this._grid,this._frame,pos.lat,pos.lng);
     if(!a)continue;
     const z=this._next?blend(a,interpolate(this._grid,this._next,pos.lat,pos.lng),this._fraction):a;
     const col=rgba(z),k=(y*w+x)*4;
     arr[k]=col[0];arr[k+1]=col[1];arr[k+2]=col[2];arr[k+3]=col[3];
    }
   }
   bctx.putImageData(pixels,0,0);
   ctx.imageSmoothingEnabled=true;
   // Deliberately avoid broad blur: geography must stay legible and wet areas crisp.
   ctx.drawImage(sub,0,0,c.width,c.height);
  }
 });
}
root.MONOWeatherField={makeGrid,samples,interpolate,rgba,blend,typeAt,systems,createLayer};
if(typeof module!=='undefined'&&module.exports)module.exports={makeGrid,samples,interpolate,rgba,blend,typeAt,systems};
})(typeof window!=='undefined'?window:globalThis);
