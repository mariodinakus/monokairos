const st=['LGIO','LGKV','LGLR','LGSA','LGKR','LGIR'];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const now=new Date(),a=new Date(now-10*864e5);
 for(const s of st){
  const q=new URLSearchParams({station:s,data:'tmpc',tz:'Etc/UTC',format:'onlycomma',latlon:'no',missing:'M',report_type:'3',year1:a.getUTCFullYear(),month1:a.getUTCMonth()+1,day1:a.getUTCDate(),year2:now.getUTCFullYear(),month2:now.getUTCMonth()+1,day2:now.getUTCDate()});
  const t=await (await fetch('https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?'+q)).text();
  const rows=t.trim().split('\n').slice(1).filter(l=>!/,M$/.test(l));
  const byDay={};for(const l of rows){const v=l.split(',')[1];const d=v.slice(0,10),h=v.slice(11,13);(byDay[d]??=new Set()).add(h);}
  const hours=Object.entries(byDay).map(([d,s])=>s.size);
  const allH=new Set(rows.map(l=>l.split(',')[1].slice(11,13)));
  console.log(s,'rows',rows.length,'hours/day',hours.join(','),'UTC hours seen',[...allH].sort().join(' '));
  await sleep(15000);
 }
})();
