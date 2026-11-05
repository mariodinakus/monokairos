/* Historical MONO holdout viewer. Uses only predictions made from train/validation,
 * never refits to the observations shown in the test period. */
(function (root) {
  'use strict';
  const finite = Number.isFinite;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;'}[c]));
  const fmt = (n, d=1) => finite(n) ? Number(n).toLocaleString('el-GR', {minimumFractionDigits:d,maximumFractionDigits:d}) : '—';
  const date = (ts, lang, short=false) => new Date(ts).toLocaleString(lang === 'en' ? 'en-GB' : 'el-GR',
    short ? {day:'2-digit',month:'short'} : {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const choose = (el, gr, en) => el ? gr : en;
  const round = n => Math.round(n * 10) / 10;

  function chart(rows, variable, lang) {
    const rain = variable === 'rain', predIndex = 1, truthIndex = rain ? 2 : 3;
    const pts = rows.filter(r => finite(r[0]) && finite(r[predIndex]) && finite(r[truthIndex]));
    if (pts.length < 2) return '';
    const w = 960, h = 265, left = 52, right = 22, top = 19, bottom = 34;
    const loT = pts[0][0], hiT = pts[pts.length-1][0];
    const values = pts.flatMap(r => [r[predIndex],r[truthIndex]]);
    let low = rain ? 0 : Math.min(...values), high = rain ? 1 : Math.max(...values);
    if (!rain) { const pad = Math.max((high-low)*0.12, variable === 'temp' ? 1.2 : 2); low -= pad; high += pad; }
    const x = t => left + (t-loT)/(hiT-loT || 1)*(w-left-right);
    const y = v => h-bottom-(v-low)/(high-low || 1)*(h-top-bottom);
    const path = index => pts.map((r,i) => (i?'L':'M')+x(r[0]).toFixed(1)+','+y(r[index]).toFixed(1)).join(' ');
    const lines = [0,1,2,3,4].map(i => {
      const yy = top + (h-top-bottom)*i/4, value = high - (high-low)*i/4;
      return '<line x1="'+left+'" y1="'+yy+'" x2="'+(w-right)+'" y2="'+yy+'" stroke="currentColor" opacity=".10"/>'+
        '<text x="'+(left-8)+'" y="'+(yy+4)+'" text-anchor="end" class="hb-axis">'+fmt(rain?value*100:value,0)+'</text>';
    }).join('');
    const labels = [pts[0],pts[Math.floor(pts.length/2)],pts[pts.length-1]].map((r,i) =>
      '<text x="'+x(r[0]).toFixed(1)+'" y="'+(h-8)+'" text-anchor="'+(i===0?'start':i===2?'end':'middle')+'" class="hb-axis">'+esc(date(r[0],lang,true))+'</text>').join('');
    const actual = choose(lang !== 'en','Αναφορά ERA5','ERA5 reference');
    const predict = choose(lang !== 'en','Πρόβλεψη MONO','MONO forecast');
    return '<div class="hb-chart" role="img" aria-label="'+esc(predict+' / '+actual)+'"><svg viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="xMidYMid meet">'+
      lines+'<path d="'+path(truthIndex)+'" class="hb-actual"/><path d="'+path(predIndex)+'" class="hb-forecast"/>'+labels+'</svg></div>'+
      '<div class="hb-legend"><span><i class="hb-key forecast"></i>'+predict+'</span><span><i class="hb-key actual"></i>'+actual+'</span></div>';
  }

  function viewRows(L, variable) {
    if (!Array.isArray(L?.holdout)) return [];
    return L.holdout.filter(r => Array.isArray(r) && r.length >= (variable === 'rain' ? 5 : 4)
      && finite(r[0]) && finite(r[1]));
  }

  function render(o={}) {
    const el = o.lang !== 'en', tr = o.train, lead = o.lead || 0, variable = o.variable || 'temp', days = o.days || 62;
    const active = tr?.days || 62;
    const labels = {temp:choose(el,'Θερμοκρασία','Temperature'),wind:choose(el,'Άνεμος','Wind'),rain:choose(el,'Βροχή','Rain')};
    const t = variable === 'rain' ? tr?.precip?.leads?.[lead] : tr?.[variable]?.leads?.[lead];
    const loading = o.status === 'loading', hasData = !!(t?.holdout?.length);
    const opts = [62,180,365].map(n =>
      '<button class="chip '+(days===n?'active':'')+'" data-action="historyPeriod" data-days="'+n+'" '+(loading?'disabled':'')+'>'+
      choose(el,n===62?'2 μήνες':n===180?'6 μήνες':'12 μήνες',n===62?'2 months':n===180?'6 months':'12 months')+'</button>').join('');
    let out = '<section class="section card hb-panel"><div class="panelhead"><div><b>'+choose(el,'Ιστορική επαλήθευση · Backtest','Historical verification · Backtest')+'</b>'+
      '<div class="section-sub">'+choose(el,'Πραγματικές παλιές προγνώσεις → μεταγενέστερη αναφορά ERA5','Archived forecasts → later ERA5 reference')+'</div></div></div>'+
      '<p class="hb-lede">'+choose(el,'Διάλεξε πόσο πίσω θα εκπαιδευτεί το MONO. Η επιλογή αλγορίθμου γίνεται στην επικύρωση· οι συγκρίσεις παρακάτω προέρχονται αποκλειστικά από το τελευταίο, ανέγγιχτο χρονικό 20%.',
      'Choose how far back MONO should train. Algorithm selection uses validation data; the comparisons below come exclusively from the untouched final 20% of the timeline.')+'</p>'+
      '<div class="hb-controls"><span class="hb-caption">'+choose(el,'Ιστορικό εκπαίδευσης','Training history')+'</span><div class="chips">'+opts+'</div></div>';
    if (loading) {
      const p=o.progress, phase=p?.phase||'start';
      const detail=phase==='download' && p?.total
        ? choose(el,'Ιστορικά μοντέλα: ','Archived models: ')+Math.min(p.complete,p.total)+' / '+p.total
        : phase==='train' ? choose(el,'Υπολογίζονται σφάλματα και αποτελέσματα τεστ…','Calculating test errors and scores…')
        : choose(el,'Προετοιμασία ιστορικών δεδομένων…','Preparing historical data…');
      const percentage=p?.total ? Math.max(0,Math.min(100,Math.round(100*p.complete/p.total))) : 0;
      out += '<div class="hb-training-status" role="status" aria-live="polite"><span class="hb-spinner" aria-hidden="true"></span>'+
        '<div><b>'+choose(el,'Η εκπαίδευση εκτελείται','Training in progress')+'</b><p>'+detail+'</p></div>'+
        '<div class="hb-loading-track"><span style="width:'+percentage+'%"></span></div></div>';
    }
    if (active !== days) out += '<p class="notice">'+choose(el,'Οι μετρήσεις που φαίνονται αφορούν ακόμη το προηγούμενο ιστορικό ('+active+' ημέρες).','The displayed results still use the earlier window ('+active+' days).')+'</p>';
    out += '<div class="chips hb-variable">'+Object.entries(labels).map(([id,name]) => '<button class="chip '+(variable===id?'active':'')+'" data-action="historyVariable" data-v="'+id+'">'+name+'</button>').join('')+'</div>';
    if (!hasData) return out+'<div class="hb-no-data"><b>'+choose(el,'Αναμονή πραγματικών αποτελεσμάτων','Waiting for verified results')+'</b><p>'+
      (o.modelsLoading ? choose(el,'Φορτώνονται τα προγνωστικά μοντέλα.','Loading forecast models.')
        : o.status==='error' ? choose(el,'Απέτυχε η λήψη ιστορικού. Δοκίμασε μικρότερο διάστημα ή επανεκπαίδευση.','Historical downloads failed. Try a shorter period or retrain.')
        : loading ? choose(el,'Τα αποτελέσματα θα εμφανιστούν εδώ όταν ολοκληρωθεί η εκπαίδευση.','Results will appear here after training finishes.')
        : choose(el,'Δεν υπάρχουν ακόμη επαληθευμένα δεδομένα για αυτόν τον ορίζοντα.','No verified history for this lead yet.'))+
      '</p></div></section>';
    const rows = viewRows(t,variable), rain = variable==='rain', tt = t.test?.[t.choice];
    const mae = rain ? null : tt?.mae, rmse = rain ? null : tt?.rmse;
    const baseline = rain ? t.test?.clim : t.test?.mean?.mae;
    const score = rain ? t.test?.[t.choice] : mae;
    const gain = finite(score) && finite(baseline) && baseline>0 ? 100*(1-score/baseline) : null;
    const ok2 = !rain && variable === 'temp' ? rows.filter(r=>finite(r[1])&&finite(r[3])&&Math.abs(r[1]-r[3])<=2).length / Math.max(1,rows.length)*100 : null;
    const metrics = [
      [rain?'Brier score':'MAE',fmt(score, rain?3:2)+(rain?'':variable==='temp'?'°C':' km/h')],
      [rain?choose(el,'Brier κλιματολογίας','Climatology Brier'):'RMSE',fmt(rain?baseline:rmse,rain?3:2)+(rain?'':variable==='temp'?'°C':' km/h')],
      [choose(el,'Βελτίωση από τη βάση','Improvement vs baseline'),finite(gain)?fmt(gain,1)+'%':'—'],
      [finite(ok2)?choose(el,'Μέσα σε ±2°C','Within ±2°C'):choose(el,'Ώρες στο τεστ','Test hours'),finite(ok2)?fmt(ok2,0)+'%':fmt(t.n?.test,0)]
    ].map(([k,v])=>'<div class="hb-stat"><span>'+k+'</span><b>'+v+'</b></div>').join('');
    out += '<div class="hb-stats">'+metrics+'</div>'+
      '<div class="hb-period">'+choose(el,'Εκπαίδευση / επικύρωση / τεστ','Train / validation / test')+': '+esc(t.n?.train)+' / '+esc(t.n?.val)+' / '+esc(t.n?.test)+
      ' h · '+choose(el,'Περίοδος δεδομένων','Data period')+': '+esc(tr?.start)+' – '+esc(tr?.end)+
      ' · '+choose(el,'Επιλεγμένος αλγόριθμος','Selected algorithm')+': '+esc(t.choice)+'</div>';
    out += chart(rows,variable,o.lang);
    const sortWorst = o.order==='worst';
    const sample = rows.slice().sort((a,b) => sortWorst ? (rain ? Math.abs(b[1]-b[2])-Math.abs(a[1]-a[2]) : Math.abs(b[1]-b[3])-Math.abs(a[1]-a[3])) : b[0]-a[0]).slice(0,12);
    out += '<div class="hb-controls hb-table-controls"><b>'+choose(el,'Πρόβλεψη vs πραγματικότητα','Forecast vs reality')+'</b>'+
      '<div class="chips"><button class="chip '+(!sortWorst?'active':'')+'" data-action="historyOrder" data-v="latest">'+choose(el,'Πρόσφατα','Latest')+'</button>'+
      '<button class="chip '+(sortWorst?'active':'')+'" data-action="historyOrder" data-v="worst">'+choose(el,'Μεγαλύτερα σφάλματα','Largest misses')+'</button>'+
      '<button class="chip" data-action="historyCsv">'+choose(el,'Λήψη CSV','Download CSV')+'</button></div></div>'+
      '<div class="tablewrap"><table class="metric-table hb-table"><thead><tr><th>'+choose(el,'Ημερομηνία','Date')+'</th><th>'+choose(el,'Πρόβλεψη','Forecast')+'</th>'+
      '<th>'+choose(el,'Αναφορά ERA5','ERA5 reference')+'</th><th>'+choose(el,'Απόκλιση','Difference')+'</th></tr></thead><tbody>'+
      sample.map(r=>{
        const unit = variable==='temp'?'°C':variable==='wind'?' km/h':'';
        const pred = rain ? fmt(r[1]*100,0)+'%' : fmt(r[1],1)+unit;
        const truth = rain ? (r[2]?choose(el,'Έβρεξε','Rain'):choose(el,'Χωρίς βροχή','Dry')) : fmt(r[3],1)+unit;
        const diff = rain ? (fmt(r[1]*100-r[2]*100,0)+' π.μ.') : (fmt(r[1]-r[3],1)+unit);
        return '<tr><td>'+esc(date(r[0],o.lang))+'</td><td><b>'+pred+'</b></td><td>'+truth+'</td><td>'+diff+'</td></tr>';
      }).join('')+'</tbody></table></div>';
    out += '<p class="notice">'+choose(el,'Το γράφημα δείχνει ένα δείγμα ανά 6 ώρες, ενώ τα MAE/RMSE/Brier υπολογίζονται από όλες τις διαθέσιμες ώρες του τεστ. Η ERA5 είναι επανάλυση, όχι μέτρηση επιτόπιου σταθμού. Για βροχή, η «διαφορά» αφορά ποσοστιαίες μονάδες πιθανότητας και ένδειξης βροχής, όχι απόκλιση mm.',
      'The chart samples every 6 hours; MAE/RMSE/Brier use every available holdout hour. ERA5 is reanalysis, not a local station measurement. Rain differences are probability percentage points, not millimetres.')+'</p></section>';
    return out;
  }

  function download(o={}) {
    const variable=o.variable||'temp', lead=o.lead||0, data=o.train;
    const fit=variable==='rain' ? data?.precip?.leads?.[lead] : data?.[variable]?.leads?.[lead];
    const rows=viewRows(fit,variable);
    if (!rows.length) return false;
    const header=variable==='rain'
      ? ['utc','rain_probability','observed_wet_0_or_1','forecast_precip_mm','reference_precip_mm']
      : ['utc','mono_forecast','model_mean','era5_reference','signed_error'];
    const body=rows.map(r=>[new Date(r[0]).toISOString(),...r.slice(1),...(variable==='rain'?[]:[round(r[1]-r[3])])].join(','));
    const blob=new Blob(['\uFEFF'+[header.join(','),...body].join('\n')],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);
    a.download='MONO_backtest_'+variable+'_D'+lead+'_'+(data?.days||62)+'days.csv';a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),2000);
    return true;
  }
  root.MONOHistoryBacktest={render,download};
})(typeof window === 'undefined' ? globalThis : window);
