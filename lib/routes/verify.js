/* MONO vs airport station: day-ahead temperature verification, accumulated daily.
 * GET ?lat&lon            → last-30-day summary for the nearest curated city (≤25 km)
 * GET ?lat&lon&mode=update → bring the record up to yesterday (called daily by GitHub Actions)
 * Vercel Blob keeps only public scientific statistics, never visitor data. */
'use strict';
const {guard,coordinates}=require('../server.cjs');
const V=require('../station-verify.cjs');
const send=(res,status,body,cache='no-store')=>{res.setHeader('Cache-Control',cache);res.status(status).json(body);};
module.exports=async(req,res)=>{
  if(!guard(req,res))return;
  const c=coordinates(req);
  if(!c){send(res,400,{error:'Invalid coordinates'});return;}
  const city=V.nearestCity(c.lat,c.lon);
  if(!city){send(res,200,{available:false,reason:'city_not_supported'},'s-maxage=86400');return;}
  if(!process.env.BLOB_READ_WRITE_TOKEN){send(res,503,{available:false,reason:'shared_storage_not_configured'});return;}
  let blob;try{blob=require('@vercel/blob');}catch{send(res,503,{available:false,reason:'storage_unavailable'});return;}
  const path='mono-verify/'+city.id+'.json';
  let state=null;
  try{const b=await blob.get(path,{access:'private'});if(b?.stream)state=await new Response(b.stream).json();}catch{}
  if(c.params.get('mode')==='update'){
    // Idempotent and bounded: at most one recomputation per city per hour.
    if(state?.version===2&&state?.checkedAt&&Date.now()-state.checkedAt<3600e3){send(res,200,{...V.summary(state),skipped:true});return;}
    try{
      const next=await V.update(city,state);
      await blob.put(path,JSON.stringify(next),{access:'private',allowOverwrite:true,addRandomSuffix:false,contentType:'application/json'});
      send(res,200,{...V.summary(next),added:(next.records?.length||0)-(state?.records?.length||0)});
    }catch(e){send(res,503,{...V.summary(state),stale:true,reason:'update_failed',detail:String(e?.message||e).slice(0,120)});}
    return;
  }
  const s=V.summary(state);
  send(res,200,{...s,cityDistance:Math.round(city.dist*10)/10},s.available?'s-maxage=1800, stale-while-revalidate=3600':'s-maxage=600');
};
