const st=['LGIR','LGLR','LGSA','LGKR','LGKV','LGTS'];
(async()=>{
 const g=await (await fetch('https://mesonet.agron.iastate.edu/geojson/network/GR__ASOS.geojson')).json();
 for(const s of st){const f=g.features.find(x=>(x.properties?.sid||x.id)===s);console.log(s,'in network:',!!f,f?.properties?.sname,JSON.stringify(f?.geometry?.coordinates));}
 const now=new Date(),a=new Date(now-10*864e5);
 for(const s of st){
  const q=new URLSearchParams({station:s,data:'tmpc',tz:'Etc/UTC',format:'onlycomma',latlon:'no',missing:'M',report_type:'3',year1:a.getUTCFullYear(),month1:a.getUTCMonth()+1,day1:a.getUTCDate(),year2:now.getUTCFullYear(),month2:now.getUTCMonth()+1,day2:now.getUTCDate()});
  const t=await (await fetch('https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?'+q)).text();
  const lines=t.trim().split('\n');const ok=lines.slice(1).filter(l=>!l.endsWith(',M'));
  console.log(s,'rows',lines.length-1,'with temp',ok.length,'sample',lines.slice(1,3).join(' | '));
  const q2=new URLSearchParams({...Object.fromEntries(q),report_type:'1'});
  const t2=await (await fetch('https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?'+q2)).text();
  console.log(s,'report_type=1 rows',t2.trim().split('\n').length-1);
  const q4=new URLSearchParams({...Object.fromEntries(q)});q4.delete('report_type');q4.append('report_type','3');q4.append('report_type','4');
  const t4=await (await fetch('https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?'+q4)).text();
  console.log(s,'report_type=3+4 rows',t4.trim().split('\n').length-1);
 }
})();
