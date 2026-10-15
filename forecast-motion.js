/* Smooth forecast transitions and wind trails driven by the model's 10 m wind. */
(function(root){
'use strict';
function create(map,{theme='dark'}={}){
 const L=root.L,Core=root.MonoForecastCore,reduced=root.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const canvas=L.DomUtil.create('canvas','fm-flow-canvas',map.getPanes().overlayPane),ctx=canvas.getContext('2d');
 let current=[],previous=[],fadeTimer=0,raf=0,last=0,visible=true,moving=false,enabled=true,data=null,slot=0,activeLayer='',particles=[],field=null,priorField=null,fieldAt=0,uri='',width=0,height=0;
 const remove=layers=>layers.forEach(l=>map.removeLayer(l));
 function clear(){ctx.clearRect(0,0,width,height);}
 function resize(){
  const size=map.getSize(),ratio=Math.min(1.5,root.devicePixelRatio||1);width=size.x;height=size.y;
  canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);canvas.style.width=width+'px';canvas.style.height=height+'px';ctx.setTransform(ratio,0,0,ratio,0,0);
  L.DomUtil.setPosition(canvas,map.containerPointToLayerPoint([0,0]));
  particles=Array.from({length:Math.min(340,Math.max(80,Math.round(width*height/2000)))},()=>({x:Math.random()*width,y:Math.random()*height,age:Math.random()*95}));
  buildField();
 }
 function buildField(){
  if(!data||activeLayer!=='wind')return;const step=24,nx=Math.ceil(width/step)+1,ny=Math.ceil(height/step)+1,values=[];
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
   const ll=map.containerPointToLatLng([x*step,y*step]),wind=Core.windAt(data,ll.lat,ll.lng,slot);
   if(!wind){values.push(null);continue;}
   const scale=.5/Math.max(.25,Math.cos(ll.lat*Math.PI/180)),vx=wind.u*scale,vy=-wind.v*scale,k=Math.min(1,65/Math.max(.01,Math.hypot(vx,vy)));
   values.push([vx*k,vy*k]);
  }
  priorField=field&&field.nx===nx&&field.ny===ny?field:null;field={nx,ny,step,values};fieldAt=performance.now();
 }
 function velocity(x,y,now){
  if(!field)return null;const ix=Math.floor(x/field.step),iy=Math.floor(y/field.step),a=x/field.step-ix,b=y/field.step-iy;
  if(ix<0||iy<0||ix+1>=field.nx||iy+1>=field.ny)return null;const weights=[[ix,iy,(1-a)*(1-b)],[ix+1,iy,a*(1-b)],[ix,iy+1,(1-a)*b],[ix+1,iy+1,a*b]],blend=Math.min(1,(now-fieldAt)/850);let vx=0,vy=0;
  for(const [cx,cy,w] of weights){if(w<1e-9)continue;const i=cy*field.nx+cx,v=field.values[i];if(!v)return null;const old=priorField?.values[i]||v;vx+=(old[0]+(v[0]-old[0])*blend)*w;vy+=(old[1]+(v[1]-old[1])*blend)*w;}
  return [vx,vy];
 }
 function shouldRun(){return visible&&!moving&&enabled&&!reduced&&!document.hidden&&activeLayer==='wind'&&!!field;}
 function run(now){
  raf=0;if(!shouldRun())return;if(now-last<30){raf=requestAnimationFrame(run);return;}
  const dt=Math.min(.07,(now-(last||now-33))/1000);last=now;
  ctx.globalCompositeOperation='destination-in';ctx.fillStyle='rgba(0,0,0,.91)';ctx.fillRect(0,0,width,height);ctx.globalCompositeOperation='source-over';ctx.strokeStyle=theme==='dark'?'rgba(229,251,255,.82)':'rgba(18,53,72,.72)';ctx.lineWidth=1.15;ctx.beginPath();
  for(const p of particles){const v=velocity(p.x,p.y,now);if(!v||p.age>110||p.x<0||p.x>width||p.y<0||p.y>height){p.x=Math.random()*width;p.y=Math.random()*height;p.age=0;continue;}const x=p.x+v[0]*dt,y=p.y+v[1]*dt;if(Math.hypot(...v)>.3){ctx.moveTo(p.x,p.y);ctx.lineTo(x,y);}p.x=x;p.y=y;p.age+=dt*30;}
  ctx.stroke();raf=requestAnimationFrame(run);
 }
 function start(){if(shouldRun()&&!raf){last=0;raf=requestAnimationFrame(run);}}
 function halt(){if(raf)cancelAnimationFrame(raf);raf=0;last=0;}
 function onMove(){moving=true;canvas.style.opacity='0';halt();}
 function onEnd(){moving=false;canvas.style.opacity='1';priorField=null;resize();start();}
 function onVisibility(){if(document.hidden)halt();else start();}
 map.on('movestart zoomstart',onMove);map.on('moveend resize',onEnd);document.addEventListener('visibilitychange',onVisibility);resize();
 return {
  draw(next,nextSlot,layer,nextUri,{animate=false,duration=850}={}){
   const changed=data!==next||slot!==nextSlot||activeLayer!==layer;data=next;slot=nextSlot;activeLayer=layer;
   if(uri!==nextUri){
    uri=nextUri;clearTimeout(fadeTimer);remove(previous);previous=current;const [s,w,n,e]=next.bounds,shifts=next.region==='world'?[-360,0,360]:[0];
    const fade=animate&&!reduced&&previous.length;current=shifts.map(shift=>L.imageOverlay(nextUri,[[s,w+shift],[n,e+shift]],{interactive:false,opacity:fade?0:1,zIndex:2}).addTo(map));
    for(const l of previous)l.setZIndex(1);
    if(fade){for(const l of [...current,...previous])l.getElement().style.transition=`opacity ${duration}ms linear`;requestAnimationFrame(()=>{current.forEach(l=>l.setOpacity(1));previous.forEach(l=>l.setOpacity(0));});fadeTimer=setTimeout(()=>{remove(previous);previous=[];},duration+40);}
    else{remove(previous);previous=[];}
   }
   if(changed){if(layer!=='wind'){halt();clear();field=priorField=null;}else buildField();}
   start();
  },
  flow(value){enabled=value;if(value)start();else{halt();clear();}},
  show(value){visible=value;if(value){resize();start();}else halt();},
  destroy(){halt();clearTimeout(fadeTimer);map.off('movestart zoomstart',onMove);map.off('moveend resize',onEnd);document.removeEventListener('visibilitychange',onVisibility);remove(current);remove(previous);canvas.remove();}
 };
}
root.MonoForecastMotion={create};
})(window);
