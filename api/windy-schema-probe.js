/* Temporary Windy schema check. Responds with structure only; never emits API key or station observations. */
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex');
 if(req.method!=='GET'){res.status(405).end();return;}
 const key=process.env.WINDY_STATIONS_API_KEY;
 if(!key){res.status(200).json({configured:false});return;}
 const p=new URLSearchParams({lat:'40.6401',lon:'22.9444',radius:'45',limit:'30'});
 try{
 const r=await fetch('https://stations.windy.com/api/v2/opendata/station?'+p,{headers:{'windy-api-key':key,'accept':'application/json'},signal:AbortSignal.timeout(12000)});
 const json=await r.json().catch(()=>null);
 const arr=Array.isArray(json)?json:['stations','data','items','results','content'].map(k=>json?.[k]).find(Array.isArray);
 const first=arr?.[0]||null;
 res.status(200).json({configured:true,status:r.status,top:Array.isArray(json)?['array']:(json&&typeof json==='object'?Object.keys(json).slice(0,20):[]),count:arr?.length??null,firstKeys:first&&typeof first==='object'?Object.keys(first).slice(0,35):[],nestedKeys:first&&typeof first==='object'?Object.fromEntries(Object.entries(first).filter(([k,v])=>v&&typeof v==='object'&&!Array.isArray(v)).slice(0,5).map(([k,v])=>[k,Object.keys(v).slice(0,20)])):{} ,pagination:json?.pagination&&typeof json.pagination==='object'?Object.keys(json.pagination):[],shapeOnly:true});
 }catch(e){res.status(200).json({configured:true,error:e.name||'upstream_unreachable'});}
};