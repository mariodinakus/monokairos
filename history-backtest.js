/* Historical MONO holdout viewer. Uses only predictions made from train/validation,
 * never refits to the observations shown in the test period. */
(function (root) {
  'use strict';
  const finite = Number.isFinite;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = (n, d=1) => finite(n) ? Number(n).toLocaleString('el-GR', {minimumFractionDigits:d,maximumFractionDigits:d}) : '—';
  const date = (ts, lang, short=false) => new Date(ts).toLocaleString(lang === 'en' ? 'en-GB' : 'el-GR',
    short ? {day:'2-digit',month:'short'} : {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const choose = (el, gr, en) => el ? gr : en;
  const round = n => Math.round(n * 10) / 10;

  function chart(rows, variable, lang) {
    const rain = variable === 'rain', predIndex = 1, truthIndex = rain ? 2 : 3;
    const pts = rows.filter(r => finite(r[0]) && finite(r[predIndex]) && finite(r[truthIndex]));
    if (pts.length < 2) return '';
    const w = 960, h = 294, left = 57, right = 26, top = 26, bottom = 43;
    const loT = pts[0][0], hiT = pts[pts.length-1][0];
    const values = pts.flatMap(r => [r[predIndex],r[truthIndex]]);
    let low = rain ? 0 : Math.min(...values), high = rain ? 1 : Math.max(...values);
    if (!rain) { const pad = Math.max((high-low)*0.12, variable === 'temp' ? 1.2 : 2); low -= pad; high += pad; }
    const x = t => left + (t-loT)/(hiT-loT || 1)*(w-left-right);
    const y = v => h-bottom-(v-low)/(high-low || 1)*(h-top-bottom);
    const path = index => pts.map((r,i) => (i?'L':'M')+x(r[0]).toFixed(1)+','+y(r[index]).toFixed(1)).join(' ');
    const forecast = path(predIndex), actual = path(truthIndex);
    const firstX = x(pts[0][0]).toFixed(1), lastX = x(pts[pts.length-1][0]).toFixed(1), bottomY = h-bottom;
    const shaded = forecast + ' L'+lastX+','+bottomY+' L'+firstX+','+bottomY+' Z';
    const grid = [0,1,2,3,4].map(i => {
      const yy = top + (h-top-bottom)*i/4, value = high - (high-low)*i/4;
      return '<line x1="'+left+'" y1="'+yy+'" x2="'+(w-right)+'" y2="'+yy+'" class="hb-chart-grid"/>'+
        '<text x="'+(left-13)+'" y="'+(yy+4)+'" text-anchor="end" class="hb-axis">'+fmt(rain?value*100:value,0)+'</text>';
    }).join('');
    const axis = [pts[0],pts[Math.floor(pts.length/2)],pts[pts.length-1]].map((r,i) =>
      '<text x="'+x(r[0]).toFixed(1)+'" y="'+(h-12)+'" text-anchor="'+(i===0?'start':i===2?'end':'middle')+'" class="hb-axis">'+esc(date(r[0],lang,true))+'</text>').join('');
    const truthName = choose(lang !== 'en','Αναφορά ERA5','ERA5 reference');
    const predictName = choose(lang !== 'en','Πρόβλεψη MONO','MONO forecast');
    const last=pts[pts.length-1], latestX=x(last[0]).toFixed(1);
    return '<div class="hb-chart" role="img" aria-label="'+esc(predictName+' / '+truthName)+'">'+
      '<svg viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="xMidYMid meet">'+
      '<defs><linearGradient id="hbForecastFill" x1="0" x2="0" y1="0" y2="1">'+
      '<stop offset="0%" stop-color="#608be9" stop-opacity=".19"/>'+
      '<stop offset="100%" stop-color="#608be9" stop-opacity="0"/></linearGradient></defs>'+
      grid+
      '<path d="'+shaded+'" class="hb-forecast-fill"/>'+
      '<path d="'+actual+'" class="hb-actual"/>'+
      '<path d="'+forecast+'" class="hb-forecast"/>'+
      '<circle class="hb-chart-last-actual" cx="'+latestX+'" cy="'+y(last[truthIndex]).toFixed(1)+'" r="4.8"/>'+
      '<circle class="hb-chart-last-forecast" cx="'+latestX+'" cy="'+y(last[predIndex]).toFixed(1)+'" r="5.3"/>'+
      axis+'</svg></div>'+
      '<div class="hb-legend"><span><i class="hb-key forecast"></i>'+predictName+
      '</span><span><i class="hb-key actual"></i>'+truthName+'</span><small>'+
      choose(lang !== 'en','Δειγματοληψία ανά 6 ώρες','Sampled every 6 hours')+'</small></div>';
  }

  function viewRows(L, variable) {
    if (!Array.isArray(L?.holdout)) return [];
    return L.holdout.filter(r => Array.isArray(r) && r.length >= (variable === 'rain' ? 5 : 4)
      && finite(r[0]) && finite(r[1]));
  }

  function progressInfo(o={}) {
    const el=o.lang!=='en',p=o.progress||{}, phase=p.phase||'start';
    const detail=phase==='download'&&p.total
      ? choose(el,'Λήψη ιστορικών μοντέλων: ','Historical models downloaded: ')+Math.min(p.complete||0,p.total)+' / '+p.total
      : phase==='train' ? choose(el,'Υπολογίζονται μετρικές και ανεξάρτητο τεστ…','Calculating metrics and holdout scores…')
      : choose(el,'Προετοιμασία ιστορικών δεδομένων…','Preparing archived forecasts…');
    const percent=p.total?Math.max(0,Math.min(100,Math.round(100*(p.complete||0)/p.total))):0;
    return {detail,percent};
  }
  // Update just three small nodes while requests finish; never repaint the SVG,
  // metrics, page navigation or the entire dashboard for progress ticks.
  function updateProgress(o={}) {
    if (typeof document === 'undefined' || o.status!=='loading') return;
    const box=document.getElementById('hb-training-status');
    if (!box) return;
    const p=progressInfo(o);
    const label=box.querySelector('[data-hb-progress-label]');
    const meter=box.querySelector('[data-hb-progress-meter]');
    const count=box.querySelector('[data-hb-progress-percent]');
    if (label) label.textContent=p.detail;
    if (meter) meter.style.width=p.percent+'%';
    if (count) count.textContent=p.percent+'%';
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
    let out = '<section class="hb-panel"><div class="hb-panel-heading"><div><span class="mh-section-label">02 / '+
      choose(el,'ΕΠΙΛΟΓΗ ΙΣΤΟΡΙΚΟΥ','HISTORICAL WINDOW')+'</span><h3>'+
      choose(el,'Δεδομένα που αποκαλύπτουν την ακρίβεια','The data behind the accuracy')+'</h3>'+
      '<p>'+choose(el,'Η επιλογή αλγορίθμου βασίζεται στην επικύρωση. Το τελικό 20% των χρονολογικών δεδομένων χρησιμοποιείται μόνο για τον έλεγχο.',
      'Algorithm selection uses validation data. Only the final 20% of the time-ordered history is used for verification.')+'</p></div>'+
      '<span class="hb-confidence-label">60% TRAIN <span>/</span> 20% VALIDATE <span>/</span> 20% TEST</span></div>'+
      '<div class="hb-period-controls"><span class="hb-control-label">'+choose(el,'Χρονικό εύρος εκπαίδευσης','Training window')+'</span>'+
      '<div class="hb-period-buttons" role="group" aria-label="'+choose(el,'Ιστορικό εκπαίδευσης','Training history')+'">'+opts+'</div></div>';
    if (loading) {
      const p=progressInfo(o);
      out += '<div class="hb-training-status" id="hb-training-status" role="status" aria-live="polite">'+
        '<div class="hb-training-icon"><span class="hb-spinner" aria-hidden="true"></span></div>'+
        '<div class="hb-training-text"><b>'+choose(el,'Ανάλυση ιστορικών προγνώσεων','Analysing archived forecasts')+
        '</b><p data-hb-progress-label>'+esc(p.detail)+'</p></div>'+
        '<strong class="hb-training-percent" data-hb-progress-percent>'+p.percent+'%</strong>'+
        '<div class="hb-loading-track"><span data-hb-progress-meter style="width:'+p.percent+'%"></span></div></div>';
    }
    if (tr && active !== days) out += '<p class="notice">'+choose(el,'Οι μετρήσεις που φαίνονται αφορούν ακόμη το προηγούμενο ιστορικό ('+active+' ημέρες).','The displayed results still use the earlier window ('+active+' days).')+'</p>';
    out += '<div class="hb-variable-header"><span class="mh-section-label">03 / '+
      choose(el,'ΤΙ ΜΕΤΡΑΜΕ','VARIABLE')+'</span><h3>'+choose(el,'Πρόβλεψη εναντίον πραγματικότητας','Forecast versus reference')+'</h3></div>'+
      '<div class="hb-variable" role="group" aria-label="'+choose(el,'Μεταβλητή επαλήθευσης','Verification variable')+'">'+
      Object.entries(labels).map(([id,name]) => '<button class="hb-variable-btn '+(variable===id?'active':'')+
      '" aria-pressed="'+(variable===id)+'" data-action="historyVariable" data-v="'+id+'"><span class="hb-variable-symbol">'+
      ({temp:'°',wind:'↝',rain:'◒'}[id])+'</span>'+name+'</button>').join('')+'</div>';
    if (!hasData) return out+'<div class="hb-no-data"><span class="hb-no-data-icon" aria-hidden="true">◷</span><b>'+choose(el,'Αναμονή πραγματικών αποτελεσμάτων','Waiting for verified results')+'</b><p>'+
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
      {k:rain?'Brier score':'MAE',v:fmt(score,rain?3:2)+(rain?'':variable==='temp'?'°C':' km/h'),note:choose(el,'Μικρότερο = καλύτερο','Lower is better'),theme:'primary'},
      {k:rain?choose(el,'Brier κλιματολογίας','Climatology Brier'):'RMSE',v:fmt(rain?baseline:rmse,rain?3:2)+(rain?'':variable==='temp'?'°C':' km/h'),note:rain?choose(el,'Βάση σύγκρισης','Baseline'):choose(el,'Δίνει βάρος σε μεγάλα λάθη','Penalises larger errors')},
      {k:choose(el,'Διαφορά από τη βάση','Difference vs baseline'),v:finite(gain)?(gain>=0?'+':'')+fmt(gain,1)+'%':'—',note:choose(el,'Θετικό = βελτίωση','Positive = improvement'),theme:finite(gain)?(gain>=0?'positive':'negative'):''},
      {k:finite(ok2)?choose(el,'Μέσα σε ±2°C','Within ±2°C'):choose(el,'Ώρες στο τεστ','Test hours'),v:finite(ok2)?fmt(ok2,0)+'%':fmt(t.n?.test,0),note:finite(ok2)?choose(el,'Ποσοστό διαστήματος τεστ','Holdout share'):choose(el,'Ανεξάρτητες παρατηρήσεις','Unseen observations')}
    ].map(m=>'<div class="hb-stat '+(m.theme?'hb-stat-'+m.theme:'')+'"><span>'+m.k+'</span><b>'+m.v+'</b><small>'+m.note+'</small></div>').join('');
    out += '<div class="hb-stats">'+metrics+'</div>'+
      '<div class="hb-insight-bar"><span><i aria-hidden="true">◷</i> '+choose(el,'Περίοδος','Period')+
      ' <b>'+esc(tr?.start)+' — '+esc(tr?.end)+'</b></span>'+
      '<span><i aria-hidden="true">⊞</i> '+choose(el,'Αλγόριθμος','Algorithm')+
      ' <b>'+esc(t.choice)+'</b></span>'+
      '<span><i aria-hidden="true">◈</i> TRAIN / VALIDATE / TEST <b>'+esc(t.n?.train)+' / '+esc(t.n?.val)+' / '+esc(t.n?.test)+' h</b></span></div>'+
      '<div class="hb-chart-header"><div><span class="mh-section-label">'+choose(el,'ΧΡΟΝΟΣΕΙΡΑ / ΤΕΣΤ','TIME SERIES / HOLDOUT')+
      '</span><h4>'+choose(el,'Τι είχε προβλεφθεί και τι συνέβη','Forecast and reference over time')+'</h4></div>'+
      '<span class="hb-chart-type">'+(rain?choose(el,'Πιθανότητα βροχής','Rain probability'):variable==='temp'?'°C':'km/h')+'</span></div>';
    out += chart(rows,variable,o.lang);
    if (rain) {
      const valid = rows.filter(r => finite(r[1]) && r[1] >= 0 && r[1] <= 1 && (r[2] === 0 || r[2] === 1));
      const buckets = [0, 20, 40, 60, 80].map(lo => {
        const group = valid.filter(r => r[1] * 100 >= lo && (lo === 80 ? r[1] <= 1 : r[1] * 100 < lo + 20));
        return {lo, n:group.length, observed:group.length ? 100 * group.reduce((sum,r) => sum+r[2],0)/group.length : null};
      });
      const modelScores = Object.entries(t.perModel || {}).filter(([,v])=>finite(v?.brier) && v.n>=24).sort((a,b)=>a[1].brier-b[1].brier);
      out += '<div class="hb-insight-bar"><b>'+choose(el,'Σύγκριση μοντέλων βροχής','Rain model comparison')+'</b></div>'+(modelScores.length ? '<div class="tablewrap"><table class="metric-table"><thead><tr><th>'+choose(el,'Μοντέλο','Model')+'</th><th>'+choose(el,'Σφάλμα συμβάντος','Event error')+'</th><th>'+choose(el,'Ώρες','Hours')+'</th></tr></thead><tbody>'+modelScores.map(([id,v])=>'<tr><td>'+esc(id)+'</td><td>'+fmt(v.brier,2)+'</td><td>'+v.n+'</td></tr>').join('')+'</tbody></table></div><p class="hb-method-note">'+choose(el,'Ποσοστό λανθασμένων ωριαίων ενδείξεων υετού ≥0,2 mm στο τεστ, έναντι ERA5. Χαμηλότερο είναι καλύτερο. Τα δείγματα μπορεί να διαφέρουν μεταξύ μοντέλων.','Fraction of wrong hourly precipitation signals ≥0.2 mm in the test against ERA5. Lower is better. Samples may differ between models.')+'</p>' : '<p class="hb-method-note">'+choose(el,'Δεν υπάρχουν ακόμη αρκετά δεδομένα ανά μοντέλο. Μπορεί να απαιτείται επανεκπαίδευση.','Not enough model-level data yet. Retraining may be required.')+'</p>');
      out += '<div class="hb-insight-bar"><b>'+choose(el,'Έλεγχος βαθμονόμησης βροχής','Rain probability calibration')+'</b></div><div class="tablewrap"><table class="metric-table"><thead><tr><th>'+choose(el,'Πρόγνωση','Forecast')+'</th><th>'+choose(el,'Δείγμα','Sample')+'</th><th>'+choose(el,'Βροχή στην αναφορά','Rain in reference')+'</th></tr></thead><tbody>'+buckets.map(b => '<tr><td>'+b.lo+'–'+(b.lo+20)+'%</td><td>'+b.n+'</td><td>'+(b.n>=20?fmt(b.observed,0)+'%':choose(el,'Ανεπαρκές δείγμα','Insufficient sample'))+'</td></tr>').join('')+'</tbody></table></div><p class="hb-method-note">'+choose(el,'Δειγματοληψία ανά 6 ώρες από το ανεξάρτητο τεστ. Ελάχιστο 20 περιπτώσεις ανά κατηγορία. Η αναφορά είναι ERA5 και οι ώρες δεν είναι απαραίτητα ανεξάρτητες.','Six-hourly samples from the holdout test. Minimum 20 cases per bin. ERA5 is the reference and hours are not necessarily independent.')+'</p>';
    }

    const sortWorst = o.order==='worst';
    const sample = rows.slice().sort((a,b) => sortWorst ? (rain ? Math.abs(b[1]-b[2])-Math.abs(a[1]-a[2]) : Math.abs(b[1]-b[3])-Math.abs(a[1]-a[3])) : b[0]-a[0]).slice(0,12);
    out += '<div class="hb-table-controls"><div><span class="mh-section-label">04 / '+
      choose(el,'ΕΛΕΓΧΟΣ ΠΡΟΒΛΕΨΕΩΝ','FORECAST AUDIT')+'</span><h3>'+
      choose(el,'Οι ώρες πίσω από τα νούμερα','The observations behind the numbers')+'</h3></div>'+
      '<div class="hb-table-actions"><button class="hb-table-button '+(!sortWorst?'active':'')+'" data-action="historyOrder" data-v="latest">'+
      choose(el,'Πιο πρόσφατα','Recent first')+'</button>'+
      '<button class="hb-table-button '+(sortWorst?'active':'')+'" data-action="historyOrder" data-v="worst">'+
      choose(el,'Μεγαλύτερα λάθη','Biggest misses')+'</button>'+
      '<button class="hb-csv-button" data-action="historyCsv">'+choose(el,'↓ Εξαγωγή CSV','↓ Export CSV')+'</button></div></div>'+
      '<div class="tablewrap"><table class="metric-table hb-table"><thead><tr><th>'+choose(el,'Ημερομηνία','Date')+'</th><th>'+choose(el,'Πρόβλεψη','Forecast')+'</th>'+
      '<th>'+choose(el,'Αναφορά ERA5','ERA5 reference')+'</th><th>'+choose(el,'Απόκλιση','Difference')+'</th></tr></thead><tbody>'+
      sample.map(r=>{
        const unit = variable==='temp'?'°C':variable==='wind'?' km/h':'';
        const pred = rain ? fmt(r[1]*100,0)+'%' : fmt(r[1],1)+unit;
        const truth = rain ? (r[2]?choose(el,'Έβρεξε','Rain'):choose(el,'Χωρίς βροχή','Dry')) : fmt(r[3],1)+unit;
        const diff = rain ? (fmt(r[1]*100-r[2]*100,0)+' π.μ.') : (fmt(r[1]-r[3],1)+unit);
        const miss=rain?Math.abs(r[1]-r[2]):Math.abs(r[1]-r[3]);
        const large=rain?miss>=0.5:variable==='temp'?miss>=2:miss>=6;
        return '<tr><td>'+esc(date(r[0],o.lang))+'</td><td><b>'+pred+'</b></td><td>'+truth+
          '</td><td><span class="hb-error '+(large?'hb-error-large':'')+'">'+diff+'</span></td></tr>';
      }).join('')+'</tbody></table></div>';
    out += '<p class="hb-method-note">'+choose(el,'Το γράφημα δειγματοληπτεί ανά 6 ώρες· οι μετρικές χρησιμοποιούν όλες τις διαθέσιμες ώρες του τεστ. Αναφορά: ERA5, όχι επιτόπιος σταθμός. Στη βροχή η διαφορά είναι σε ποσοστιαίες μονάδες, όχι mm.',
      'The chart samples every six hours; metrics use every holdout hour. Reference: ERA5, not a local station. Rain differences are probability points, not millimetres.')+'</p></section>';
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
  root.MONOHistoryBacktest={render,download,updateProgress};
})(typeof window === 'undefined' ? globalThis : window);
