/* MONO Earth Signals — NOAA/USGS observations + clearly labeled climate teleconnections. */
(function (root) {
  'use strict';
  const safe = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const $ = id => document.getElementById(id);
  const LABELS = {
    el: { title:'Παλμός του πλανήτη', intro:'Παρατηρήσεις NOAA και USGS, κλιματικές συνδέσεις και πραγματικές επιπτώσεις ανά περιοχή. Οι συσχετίσεις δεν είναι πρόγνωση για μία συγκεκριμένη ημέρα.',
      observations:'Τελευταίες παρατηρήσεις', trends:'Εξέλιξη RONI', quake:'Σεισμική δραστηριότητα', quakeSub:'Σεισμοί ≥ 4,5 R των τελευταίων 24 ωρών, παγκοσμίως',
      checked:'Έλεγχος πηγών', season:'Τρίμηνο αναφοράς', month:'Μηνιαίος δείκτης', sea:'Σχετική απόκλιση SST',
      phase:'Θερμοκρασιακή ένδειξη', warm:'El Niño — θερμή φάση', cool:'La Niña — ψυχρή φάση', neutral:'Ουδέτερο εύρος',
      indicator:'Ο δείκτης RONI είναι μέσος όρος τριών μηνών και δεν αποτελεί μόνος του επίσημη διάγνωση ENSO. Η επιβεβαίωση απαιτεί και ατμοσφαιρικά στοιχεία.',
      late:'Οι κλιματικές παρατηρήσεις δημοσιεύονται με καθυστέρηση. «Έλεγχος τώρα» δεν σημαίνει μέτρηση τώρα.',
      mapping:'Ποιες περιοχές επηρεάζονται;', choose:'Επίλεξε φαινόμενο και περιοχή για να δεις τις κυριότερες στατιστικές επιδράσεις.', el:'El Niño', la:'La Niña',
      confidence:'Τεκμηρίωση', high:'Ισχυρή κλιματολογική σχέση', medium:'Σχέση που εξαρτάται από εποχή/περιοχή', low:'Ασθενής ή αβέβαιη σχέση',
      refresh:'Επαναφόρτωση', noData:'Η ζωντανή πηγή δεν απαντά. Δεν εμφανίζουμε εικονικούς αριθμούς.', source:'Αρχική πηγή',
      seasons:'Πιο έντονο', effects:'Επηρεαζόμενοι τομείς', risks:'Πώς αλλάζουν οι πιθανότητες', location:'Επιλεγμένη περιοχή',
      labels:'Οι παρακάτω τάσεις ισχύουν υπό συγκεκριμένες συνθήκες και δεν είναι τρέχουσες προειδοποιήσεις.',
      dataState:'Ενημέρωση κατά την έκδοση νέων στοιχείων', none:'Δεν καταγράφηκαν σεισμοί άνω του ορίου στο συγκεκριμένο feed.',
      na:'Δείκτης δεν συνδέθηκε — επιστημονική ερμηνεία, όχι ζωντανή μέτρηση',
      forecast:'Πιθανότητες και επίσημες προγνώσεις', note:'Για την Ελλάδα, το ENSO δεν δίνει αξιόπιστη μονοσήμαντη πρόβλεψη. Εξετάζουμε πρώτα NAO, ατμοσφαιρική κυκλοφορία και εποχικά ensembles.' },
    en: { title:'Earth system signals', intro:'NOAA and USGS observations, climate teleconnections and region-specific impacts. Statistical relationships are not forecasts for a particular day.',
      observations:'Latest observations', trends:'RONI history', quake:'Seismic activity', quakeSub:'M≥4.5 global earthquakes over the last 24 hours',
      checked:'Sources checked', season:'Three-month season', month:'Monthly index', sea:'Relative SST anomaly', phase:'Oceanic indicator',
      warm:'El Niño — warm phase', cool:'La Niña — cool phase', neutral:'Neutral range',
      indicator:'RONI is a three-month index, not by itself a formal ENSO diagnosis. Atmospheric evidence is also required.',
      late:'Climate observations have publication delays. “Checked now” does not mean “measured now”.',
      mapping:'Which regions are affected?', choose:'Select a phenomenon and region to explore typical statistical effects.', el:'El Niño', la:'La Niña',
      confidence:'Evidence', high:'Strong climate association', medium:'Seasonal or regional dependence', low:'Weak or uncertain link', refresh:'Refresh',
      noData:'Live source unavailable. We do not display fabricated measurements.', source:'Original data', seasons:'Most relevant', effects:'Sectors', risks:'How probabilities can shift', location:'Selected region', labels:'Patterns below are conditional climatological relationships, not current weather warnings.',
      dataState:'Updated when source reports new data', none:'No earthquakes above the feed threshold.', na:'Index not connected — scientific context, not live measurement',
      forecast:'Probabilities and official forecasts', note:'ENSO does not yield a robust one-directional forecast for Greece. NAO, regional circulation and seasonal ensembles matter more.' }
  };
  const factors = [
    { id:'enso', name:'ENSO', second:'El Niño / La Niña', detailEl:'Θερμοκρασίες και ατμοσφαιρική κυκλοφορία τροπικού Ειρηνικού', detailEn:'Tropical Pacific sea temperatures and atmospheric circulation' },
    { id:'nao', name:'NAO', second:'North Atlantic Oscillation', detailEl:'Διαφορά πίεσης Βόρειου Ατλαντικού και χειμερινή κυκλοφορία', detailEn:'North Atlantic pressure dipole and winter circulation' },
    { id:'iod', name:'IOD', second:'Indian Ocean Dipole', detailEl:'Θερμοκρασιακή αντίθεση δυτικού–ανατολικού Ινδικού', detailEn:'West-to-east Indian Ocean sea temperature gradient' },
    { id:'mjo', name:'MJO', second:'Madden–Julian Oscillation', detailEl:'Κινούμενες τροπικές ζώνες νέφωσης/καταιγίδων σε εβδομάδες', detailEn:'Moving tropical convective zones over multi-week periods' },
    { id:'polar', name:'Polar vortex', second:'Stratosphere / jet stream', detailEl:'Στρατοσφαιρική κυκλοφορία και πιθανές επιδράσεις στον αεροχείμαρρο', detailEn:'Stratospheric circulation and possible jet-stream impacts' }
  ];
  /* Each impact is a documented CLIMATOLOGICAL tendency, not an event alert. */
  const zones = {
    enso: [
      {id:'pacific-east', name:['Περού & Εκουαδόρ','Peru & Ecuador'], season:['Ανάλογα με εποχή και θέση','Season and location dependent'], conf:'high', sector:['Βροχή · αλιεία · πλημμύρες','Rain · fisheries · flooding'],
        el:['Συχνά ενισχύονται οι παράκτιες βροχοπτώσεις και ο κίνδυνος πλημμυρών. Η θερμότερη θάλασσα μειώνει την ανάβλυση θρεπτικών υδάτων και μεταβάλλει την αλιεία.','Coastal rain and flood risk often rise. Warmer waters suppress nutrient upwelling and disrupt fisheries.'],
        la:['Συχνά ενισχύεται η ανάβλυση ψυχρών, πλούσιων σε θρεπτικά υδάτων· οι βροχές στην παράκτια ζώνη τείνουν να είναι λιγότερες από ό,τι σε El Niño.','Cold, nutrient-rich upwelling often increases; coastal rainfall tends to be lower than in El Niño.']},
      {id:'indonesia', name:['Ινδονησία & Αυστραλία','Indonesia & Australia'], season:['Συχνά χειμώνας/άνοιξη Ν. ημισφαιρίου','Often Southern Hemisphere winter–spring'], conf:'high', sector:['Ξηρασία · πυρκαγιές · νερό · γεωργία','Drought · wildfire · water · agriculture'],
        el:['Σε πολλές περιοχές αυξάνονται οι πιθανότητες ξηρότερων συνθηκών, πίεσης στις καλλιέργειες και επικίνδυνων περιόδων πυρκαγιών. Δεν επηρεάζονται παντού το ίδιο.','Many areas see increased odds of dry weather, agricultural water stress and fire danger; impacts vary substantially.'],
        la:['Σε τμήματα της ανατολικής/βόρειας Αυστραλίας και της Ινδονησίας συχνά αυξάνονται οι βροχές και οι κίνδυνοι πλημμύρας.','In parts of eastern/northern Australia and Indonesia, heavier rainfall and flooding become more likely.']},
      {id:'eastafrica', name:['Ανατολική Αφρική','East Africa'], season:['Κυρίως μικρή περίοδος βροχών Οκτ.–Δεκ.','Especially October–December short rains'], conf:'medium', sector:['Βροχές · πλημμύρες · γεωργία','Rainfall · floods · farming'],
        el:['Στην ισημερινή Ανατολική Αφρική οι σύντομες βροχές Οκτωβρίου–Δεκεμβρίου συχνά ενισχύονται· το IOD μπορεί να τροποποιήσει έντονα το αποτέλεσμα.','October–December short rains in equatorial East Africa often intensify; IOD can substantially change the outcome.'],
        la:['Οι σύντομες βροχές μπορεί να είναι ασθενέστερες, αυξάνοντας την πιθανότητα ξηρασίας σε ορισμένες περιοχές.','Short rains can weaken, raising drought risk in some locations.']},
      {id:'america-south', name:['Νότια Βραζιλία, Ουρουγουάη & Αργεντινή','Southern Brazil, Uruguay & Argentina'], season:['Ανά περιοχή, άνοιξη και καλοκαίρι','Region-dependent, spring and summer'], conf:'medium', sector:['Βροχές · ποτάμια · καλλιέργειες','Rain · river levels · crops'],
        el:['Σε τμήματα της νοτιοανατολικής Νότιας Αμερικής οι έντονες βροχές και οι πλημμύρες γίνονται συχνότερες.','Heavy rainfall and flood odds often rise across portions of southeastern South America.'],
        la:['Σε ορισμένες περιοχές αυξάνεται η πιθανότητα ελλείμματος βροχών και γεωργικής ξηρασίας.','Some regions experience higher odds of below-average rain and agricultural drought.']},
      {id:'usa', name:['ΗΠΑ: Νότος / Βορράς','United States: South / North'], season:['Κυρίως Δεκέμβριος–Φεβρουάριος','Mostly December–February'], conf:'high', sector:['Βροχές · θερμοκρασία · πλημμύρες','Rainfall · temperature · flooding'],
        el:['Ο νότος των ΗΠΑ έχει συχνότερα πιο υγρό χειμώνα, ενώ ο βορράς/βορειοδυτικά συχνότερα ηπιότερο καιρό. Υπάρχουν μεγάλες τοπικές αποκλίσεις.','The southern US is often wetter in winter; the northern tier and Northwest tend to be milder. Regional exceptions are large.'],
        la:['Στον νότο των ΗΠΑ οι χειμώνες είναι συχνότερα ξηρότεροι, με διαφορετική τροχιά καταιγίδων· στον Βορειοδυτικό Ειρηνικό συχνότερα πιο υγροί.','Southern US winters more often trend dry, with shifted storm tracks; the Pacific Northwest is often wetter.']},
      {id:'cyclones', name:['Ατλαντικός & Ειρηνικός','Atlantic & Pacific basins'], season:['Τροπική περίοδος κυκλώνων','Tropical cyclone seasons'], conf:'high', sector:['Τυφώνες · θαλάσσιες μεταφορές · ασφάλιση','Hurricanes · shipping · insurance'],
        el:['Το El Niño συχνά καταστέλλει τη δραστηριότητα τυφώνων στον Ατλαντικό λόγω διάτμησης ανέμου και ευνοεί ορισμένους τομείς του Ειρηνικού.','El Niño often suppresses Atlantic hurricane activity through wind shear while favoring activity in parts of the Pacific.'],
        la:['Η La Niña συχνά συνδέεται με πιο ευνοϊκές ατμοσφαιρικές συνθήκες για κυκλώνες στον Ατλαντικό, όχι κατ’ ανάγκη με περισσότερες προσγειώσεις.','La Niña often favors Atlantic hurricane formation, not necessarily more landfalls.']},
      {id:'greece', name:['Ελλάδα & Ανατολική Μεσόγειος','Greece & Eastern Mediterranean'], season:['Ανά εποχή και ατμοσφαιρική κυκλοφορία','Depends on season and circulation'], conf:'low', sector:['Βροχές · θερμοκρασία · ενεργειακή ζήτηση','Rain · temperature · energy demand'],
        el:['Δεν υπάρχει σταθερή, ισχυρή και μονοσήμαντη επίδραση του El Niño στην Ελλάδα. Για τοπική πρόγνωση χρειάζονται NAO, αεροχείμαρρος και εποχικά προγνωστικά μοντέλα.','No strong, consistent one-way El Niño effect is established for Greece. Use NAO, jet-stream patterns and seasonal models for regional outlooks.'],
        la:['Ούτε η La Niña συνεπάγεται συγκεκριμένο χειμώνα ή συγκεκριμένο ύψος βροχής στην Ελλάδα.','La Niña does not imply a particular Greek winter or rainfall amount either.']}
    ],
    nao: [
      {id:'north-europe',name:['Βόρεια Ευρώπη','Northern Europe'],season:['Κυρίως χειμώνας','Primarily winter'],conf:'high',sector:['Καταιγίδες · βροχή · άνεμος','Storms · rain · wind'],el:['Θετική NAO: ισχυρότερη δυτική ροή, συχνά υγρότερος/ανεμώδης βορράς και ηπιότερες θερμοκρασίες.','Positive NAO: stronger westerlies, often wetter/windier and milder conditions.'],la:['Αρνητική NAO: μεγαλύτερη πιθανότητα εμποδισμών και ψυχρών εισβολών σε τμήματα της Ευρώπης.','Negative NAO: increased blocking and cold-air outbreak odds in parts of Europe.']},
      {id:'med',name:['Μεσόγειος & Ελλάδα','Mediterranean & Greece'],season:['Κυρίως χειμώνας','Primarily winter'],conf:'medium',sector:['Βροχή · υδάτινα αποθέματα · ξηρασία','Rain · reservoirs · drought'],el:['Θετική NAO συχνά σχετίζεται με ξηρότερες συνθήκες σε τμήματα της Μεσογείου, αλλά όχι ομοιόμορφα σε Ελλάδα και Ανατολική Μεσόγειο.','Positive NAO often correlates with drier weather in parts of the Mediterranean, less consistently in Greece and the eastern basin.'],la:['Αρνητική NAO μπορεί να ευνοήσει περισσότερες μεσογειακές διαταραχές· η γεωγραφία και το μοτίβο κυκλοφορίας έχουν μεγάλη σημασία.','Negative NAO can favor Mediterranean disturbances; location and circulation configuration matter greatly.']}
    ],
    iod: [
      {id:'iod-west',name:['Ισημερινή Ανατολική Αφρική','Equatorial East Africa'],season:['Αύγουστος–Δεκέμβριος','August–December'],conf:'high',sector:['Έντονες βροχές · πλημμύρες','Heavy rain · flooding'],el:['Θετικό IOD συχνά αυξάνει τις πιθανότητες βροχών στην Ανατολική Αφρική.','Positive IOD often raises rainfall odds in East Africa.'],la:['Αρνητικό IOD συχνά ευνοεί ξηρότερες συνθήκες σε τμήματα της Ανατολικής Αφρικής.','Negative IOD can favor drier East African conditions.']},
      {id:'iod-east',name:['Ινδονησία & Αυστραλία','Indonesia & Australia'],season:['Αυστραλιανή άνοιξη','Austral spring'],conf:'medium',sector:['Ξηρασία · αγροτική παραγωγή','Drought · crop yields'],el:['Θετικό IOD: συχνότερα λιγότερη βροχή σε Ινδονησία και τμήματα της Αυστραλίας.','Positive IOD more often brings reduced rainfall over Indonesia and parts of Australia.'],la:['Αρνητικό IOD: σε αρκετές περιοχές αυξάνει την πιθανότητα βροχών.','Negative IOD can increase rainfall odds across parts of the region.']}
    ],
    mjo: [
      {id:'tropics',name:['Ινδικός & δυτικός Ειρηνικός','Indian and western Pacific'],season:['Κλίμακα ~30–60 ημερών','~30–60-day timescale'],conf:'medium',sector:['Καταιγίδες · μουσώνες · τροπικά συστήματα','Convection · monsoons · tropical systems'],el:['Ενεργές φάσεις MJO αυξάνουν προσωρινά την τροπική νεφοποίηση και τις καταιγίδες σε συγκεκριμένες ζώνες που μετακινούνται ανατολικά.','Active MJO phases temporarily increase tropical convection in shifting eastward zones.'],la:['Κατασταλτικές φάσεις μειώνουν προσωρινά τη νεφοποίηση στην αντίστοιχη περιοχή.','Suppressed phases temporarily reduce convection in the affected zone.']},
      {id:'midlat',name:['Μεσαία γεωγραφικά πλάτη','Midlatitudes'],season:['Μεταβαλλόμενο χρονικό υστέρημα','Variable lag'],conf:'low',sector:['Αεροχείμαρρος · προγνωσιμότητα','Jet stream · forecast skill'],el:['Ορισμένες φάσεις μπορεί να επηρεάσουν έμμεσα τον αεροχείμαρρο έπειτα από ημέρες/εβδομάδες. Δεν υπάρχει σταθερή επίδραση για κάθε τοποθεσία.','Some phases can indirectly affect jet streams weeks later. Effects are not fixed for each location.'],la:['Η σημασία εξαρτάται από θέση, εποχή και συνδυασμό με άλλες ταλαντώσεις.','Relevance depends on location, season and other oscillations.']}
    ],
    polar: [
      {id:'arctic',name:['Αρκτική & Βόρεια Ευρώπη','Arctic & Northern Europe'],season:['Κυρίως χειμώνας','Mainly winter'],conf:'medium',sector:['Ψυχρές εισβολές · άνεμοι · ενέργεια','Cold outbreaks · wind · energy'],el:['Ασθενής/διαταραγμένος πολικός στρόβιλος μπορεί σε ορισμένες περιπτώσεις να αυξήσει την πιθανότητα παρατεταμένων ψυχρών εισβολών, όχι όμως πάντα.','A disrupted polar vortex can in some circumstances raise the likelihood of persistent cold outbreaks, but not consistently.'],la:['Ισχυρός στρόβιλος συχνά διατηρεί καλύτερα εγκλωβισμένο το πολύ ψυχρό αέρα κοντά στην Αρκτική.','A strong vortex more often keeps very cold air confined toward the Arctic.']},
      {id:'europe',name:['Ελλάδα & Βαλκάνια','Greece & the Balkans'],season:['Χειμερινές εβδομάδες','Winter weeks'],conf:'low',sector:['Χιόνι · παγετός · μεταβολές θερμοκρασίας','Snow · frost · temperature swings'],el:['Η στρατοσφαιρική θέρμανση ΔΕΝ συνεπάγεται αυτόματα χιονιά στην Ελλάδα· απαιτείται συγκεκριμένη τροχιά αερίων μαζών.','Sudden stratospheric warming does NOT automatically mean snow in Greece; specific circulation patterns are required.'],la:['Χωρίς τοπικά δεδομένα προγνωστικών μοντέλων δεν μπορεί να εξαχθεί ασφαλές συμπέρασμα για την Ελλάδα.','Local forecast guidance is essential before drawing conclusions for Greece.']}
    ]
  };
  const links = {
    enso:'https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/probabilities/',
    nao:'https://www.cpc.ncep.noaa.gov/products/precip/CWlink/pna/nao.shtml',
    iod:'https://www.bom.gov.au/climate/enso/',
    mjo:'https://www.cpc.ncep.noaa.gov/products/precip/CWlink/MJO/mjo.shtml',
    polar:'https://www.cpc.ncep.noaa.gov/products/stratosphere/strat-trop/'
  };
  let factor='enso', polarity='el', area='pacific-east', reading=null, readAt=0, pending=null, error=false, locale='el';
  const loc = (obj,l) => obj[l === 'en' ? 1 : 0];
  const font = l => LABELS[l] || LABELS.el;
  const fmt = n => (n >= 0 ? '+' : '') + n.toFixed(2) + ' °C';
  const link = (href,text) => '<a href="'+safe(href)+'" target="_blank" rel="noopener noreferrer">'+safe(text)+' ↗</a>';
  function page(lang) {
    locale = lang === 'en' ? 'en' : 'el';
    const t=font(locale);
    return '<div class="earth-system">' +
      '<div class="earth-head"><div><span class="earth-eyebrow">MONO / EARTH SYSTEM · NOAA × USGS</span><h1>'+t.title+'</h1><p>'+t.intro+'</p></div>' +
      '<button class="earth-button" id="earth-reload" type="button">↻ '+t.refresh+'</button></div>' +
      '<div class="earth-top">' +
      '<section class="earth-pane earth-main"><div class="earth-kicker">'+t.observations+' / NOAA CPC</div><div class="earth-bigline"><strong id="earth-roni">—</strong><span id="earth-phase">'+t.noData+'</span></div><div class="earth-small" id="earth-season">RONI · '+t.dataState+'</div><div id="earth-spark" class="earth-spark"></div><div class="earth-credit" id="earth-noaa-credit">'+link('https://www.cpc.ncep.noaa.gov/data/indices/RONI.ascii.txt','NOAA RONI')+'</div></section>' +
      '<section class="earth-pane"><div class="earth-kicker">'+t.quake+'</div><h2 class="earth-side-title">USGS / M≥4.5</h2><p class="earth-muted">'+t.quakeSub+'</p><div id="earth-quakes" class="earth-quakes">'+t.noData+'</div><div class="earth-credit">'+link('https://earthquake.usgs.gov/earthquakes/map/','USGS')+'</div></section></div>' +
      '<div class="earth-source-meta" id="earth-meta">'+t.late+'</div>' +
      '<section class="earth-health" id="earth-health" aria-label="Earth data source status"></section>' +
      '<section class="earth-globe-workspace"><div class="earth-globe-heading"><div><span class="earth-kicker">EARTH / 3D VISUALIZATION</span><h2>'+(locale==='el'?'Η Γη και οι παγκόσμιες συνδέσεις':'Earth and global connections')+'</h2><p>'+(locale==='el'?'Επίλεξε επίπεδα, γύρισε την υδρόγειο και πάτησε ζώνες ή σημεία για ανάλυση.':'Select layers, rotate the globe and select zones or markers for detail.')+'</p></div><button data-action="goto" data-page="globe" class="earth-button">'+(locale==='el'?'Πλήρης υδρόγειος ↗':'Full globe ↗')+'</button></div><div id="earthGlobeCtl"></div><div class="earth-globe-split"><div class="card globecard earth-globecard"><div id="globe" class="globe"></div><div id="globeProbe" class="gprobe-wrap"></div><div id="globeLegend"></div></div><aside class="earth-globe-side" id="earthGlobeSide"></aside></div><div class="earth-timeline" id="earthGlobeTime"></div><details class="earth-globe-details"><summary>'+(locale==='el'?'Αναλυτικά στοιχεία δορυφόρου & ενημερώσεων':'Satellite source and update details')+'</summary><div class="card" id="globeFresh"></div></details></section>' +
      '<div class="earth-explain"><div class="earth-kicker">TELECONNECTIONS / CLIMATE DRIVERS</div><h2>'+t.mapping+'</h2><p>'+t.choose+'</p><div class="earth-factor-chooser" id="earth-factors"></div><div id="earth-explorer"></div></div>' +
      '<div class="earth-bottom"><strong>'+t.phase+'</strong><p>'+t.indicator+'</p><p>'+t.labels+'</p><p>'+t.note+'</p><div>'+link(t===LABELS.el ? 'https://www.noaa.gov/understanding-el-nino' : 'https://www.noaa.gov/understanding-el-nino','NOAA · ENSO')+' · '+link('https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/probabilities/',t.forecast)+'</div></div>' +
      '</div>';
  }
  function renderExplorer() {
    const t=font(locale), f=factors.find(x=>x.id===factor), entries=zones[factor], active=entries.find(x=>x.id===area) || entries[0];
    area=active.id;
    const bar=$('earth-factors'), box=$('earth-explorer'); if(!bar||!box) return;
    bar.innerHTML=factors.map(x=>'<button class="earth-factor '+(factor===x.id?'active':'')+'" data-earth-factor="'+x.id+'" type="button"><b>'+safe(x.name)+'</b><small>'+safe(x.second)+'</small></button>').join('');
    const b1 = factor==='enso' ? t.el : factor==='nao' ? (locale==='el'?'NAO θετική':'Positive NAO') : factor==='iod' ? (locale==='el'?'IOD θετικό':'Positive IOD') : factor==='mjo' ? (locale==='el'?'Ενεργή MJO':'Active MJO') : (locale==='el'?'Ασθενής στρόβιλος':'Weak vortex');
    const b2 = factor==='enso' ? t.la : factor==='nao' ? (locale==='el'?'NAO αρνητική':'Negative NAO') : factor==='iod' ? (locale==='el'?'IOD αρνητικό':'Negative IOD') : factor==='mjo' ? (locale==='el'?'Κατασταλτική MJO':'Suppressed MJO') : (locale==='el'?'Ισχυρός στρόβιλος':'Strong vortex');
    const explain = locale==='el'?f.detailEl:f.detailEn;
    box.innerHTML='<div class="earth-feature"><div><h3>'+safe(f.name)+' <span>'+safe(f.second)+'</span></h3><p>'+safe(explain)+'</p></div><span class="earth-data-note">'+(factor==='enso'?(locale==='el'?'Παρατήρηση RONI επάνω · εδώ εμφανίζονται κλιματολογικές τάσεις':'Observed RONI above · regional climate tendencies below'):t.na)+'</span></div>' +
      '<div class="earth-phase-tabs"><button data-earth-polarity="el" class="'+(polarity==='el'?'active':'')+'">'+safe(b1)+'</button><button data-earth-polarity="la" class="'+(polarity==='la'?'active':'')+'">'+safe(b2)+'</button></div>' +
      '<div class="earth-map-keys">'+entries.map(x=>'<button data-earth-area="'+x.id+'" class="'+(area===x.id?'active':'')+'">'+safe(loc(x.name,locale))+'</button>').join('')+'</div>' +
      '<section class="earth-region-detail"><div class="earth-region-heading"><div><small>'+t.location+'</small><h3>'+safe(loc(active.name,locale))+'</h3></div><span class="earth-evidence '+active.conf+'">'+safe(t[active.conf])+'</span></div><p class="earth-region-impact">'+safe(loc(active[polarity],locale))+'</p>' +
      '<div class="earth-facts"><div><small>'+t.seasons+'</small><strong>'+safe(loc(active.season,locale))+'</strong></div><div><small>'+t.effects+'</small><strong>'+safe(loc(active.sector,locale))+'</strong></div></div></section>' +
      '<div class="earth-links">'+link(links[factor],t.source)+'</div>';
  }
  function spark(data) {
    const xs=data.slice(-48); if(xs.length<2) return '';
    const W=650,H=150,lo=-2.6,hi=2.6, mx=Math.max(2.6,...xs.map(x=>Math.abs(x.value)+.2));
    const y=v => (H/2)-(v/mx)*(H*.46);
    const pts=xs.map((x,i)=>((i/(xs.length-1))*W).toFixed(1)+','+y(x.value).toFixed(1)).join(' ');
    const lbl=xs[0].season+' '+xs[0].year+' – '+xs.at(-1).season+' '+xs.at(-1).year;
    return '<svg viewBox="0 0 650 150" class="earth-chart" role="img" aria-label="RONI: '+safe(lbl)+'">' +
       '<line x1="0" x2="650" y1="'+y(0)+'" y2="'+y(0)+'" class="earth-axis"/>' +
       '<line x1="0" x2="650" y1="'+y(.5)+'" y2="'+y(.5)+'" class="earth-threshold"/>' +
       '<line x1="0" x2="650" y1="'+y(-.5)+'" y2="'+y(-.5)+'" class="earth-threshold"/>' +
       '<polyline fill="none" stroke="currentColor" stroke-width="3.3" stroke-linecap="round" stroke-linejoin="round" points="'+pts+'"/>' +
       '<circle cx="650" cy="'+y(xs.at(-1).value)+'" r="5" fill="currentColor"/></svg><div class="earth-chart-label">'+safe(lbl)+' · RONI (°C), NOAA CPC</div>';
  }
  function renderLive() {
    const t=font(locale), d=reading; if(!$('earth-roni'))return;
    const series=d?.roni; const r=series?.length ? series.at(-1):null;
    $('earth-roni').textContent=r ? fmt(r.value): '—';
    $('earth-phase').textContent=r ? (r.value >= .5 ? t.warm : r.value <= -.5 ? t.cool : t.neutral) : t.noData;
    $('earth-season').textContent=r ? t.season+': '+r.season+' '+r.year+' · RONI (1991–2020)' : t.noData;
    $('earth-spark').innerHTML=r ? spark(series) : '';
    const n=d?.nino34?.at(-1);
    const sourceDate=n ? n.year+'-'+String(n.month).padStart(2,'0') : null;
    $('earth-noaa-credit').innerHTML=(n ? '<span>'+t.month+' ('+sourceDate+'): '+fmt(n.value)+' · </span>' : '')+link('https://www.cpc.ncep.noaa.gov/data/indices/RONI.ascii.txt','NOAA CPC RONI');
    const quakes=d?.earthquakes;
    $('earth-quakes').innerHTML=Array.isArray(quakes) ? (quakes.length ? quakes.slice(0,6).map(q => {
       const dt=Number.isFinite(q.time) ? new Date(q.time).toLocaleString(locale==='en'?'en-GB':'el-GR',{dateStyle:'short',timeStyle:'short'}) : '—';
       return '<div class="earth-quake"><strong>M '+Number(q.mag).toFixed(1)+'</strong><div>'+safe(q.place)+'<small>'+safe(dt)+' · '+(Number.isFinite(q.depth)?q.depth.toFixed(0)+' km':'')+'</small></div>'+(q.url ? link(q.url,'↗'):'')+'</div>';
    }).join('') : t.none) : t.noData;
    const checked=d?.checkedAt ? new Date(d.checkedAt).toLocaleString(locale==='en'?'en-GB':'el-GR',{dateStyle:'medium',timeStyle:'short'}):null;
    $('earth-meta').textContent=(checked ? t.checked+': '+checked+'. ' : '')+t.late+(d?.unavailable?.length ? ' · '+t.noData+' ('+d.unavailable.join(', ')+')':'');
    const metrics=d?.health?.sources||null, status=$('earth-health');
    if(status){
      if(!metrics){
        status.innerHTML='<p class="earth-health-empty">'+(locale==='el'?'Πηγές: αναμονή ελέγχου.':'Sources: awaiting verification.')+'</p>';
      }else{
        const names={roni:'NOAA RONI',nino34:'NOAA Niño 3.4',earthquakes:'USGS',storms:'NHC · '+(locale==='el'?'Κυκλώνες':'Cyclones'),forecasts:'NHC · '+(locale==='el'?'Τροχιές':'Forecast tracks')};
        const friendly={upstream_403:locale==='el'?'Ο πάροχος αρνήθηκε τη λήψη':'Provider denied request',upstream_rate_limit:locale==='el'?'Όριο παρόχου':'Provider rate limit',
          upstream_timeout:locale==='el'?'Λήξη χρόνου απόκρισης':'Provider timeout',upstream_error:locale==='el'?'Σφάλμα παρόχου':'Provider error',
          invalid_or_empty_data:locale==='el'?'Μη διαθέσιμο δείγμα':'No usable samples'};
        status.innerHTML='<div class="earth-health-heading">'+(locale==='el'?'Κατάσταση δεδομένων':'Data source status')+' <span>'+safe(d.health.status.toUpperCase())+'</span></div>'+
          Object.entries(names).map(([key,name])=>{
            const h=metrics[key]||{},good=h.status==='ok',amount=good?(h.items===0?(locale==='el'?'Καμία τρέχουσα καταγραφή':'No current observations'):
              (h.items+' '+(locale==='el'?'εγγραφές':'records'))):(friendly[h.reason]||t.noData);
            return '<div class="earth-health-row"><i class="'+(good?'ok':'warn')+'" aria-hidden="true"></i><b>'+name+'</b><span>'+safe(amount)+'</span>'+(h.asOf?'<small>'+safe(h.asOf)+'</small>':'')+'</div>';
          }).join('');
      }
    }
  }
  async function load(force) {
    if (!force && reading && Date.now()-readAt < 600000) { renderLive(); return; }
    if (pending) return pending;
    pending=(async()=>{
      try {
        const controller = new AbortController(), timer=setTimeout(()=>controller.abort(),16000);
        let r; try { r=await fetch('/api/earth-signals',{signal:controller.signal,cache:force?'reload':'default'}); } finally { clearTimeout(timer); }
        const body=await r.json();
        if(!body || typeof body!=='object' || !body.health?.sources)throw new Error('Signals API invalid response');
        reading=body;readAt=Date.now();error=!r.ok;
      } catch(e){ error=true; if(!reading)reading=null; } finally {pending=null;}
      renderLive();
      if (root.MONOEarthGlobe && typeof root.MONOEarthGlobe.onRefresh === 'function') root.MONOEarthGlobe.onRefresh();
    })();
    return pending;
  }
  function mount(lang) {
    locale=lang==='en'?'en':'el';
    renderExplorer(); renderLive();
    const root=$('content'); if(!root || !root.querySelector('.earth-system'))return;
    root.querySelector('.earth-system').addEventListener('click',e=>{
      const f=e.target.closest('[data-earth-factor]'), p=e.target.closest('[data-earth-polarity]'), a=e.target.closest('[data-earth-area]'), reload=e.target.closest('#earth-reload');
      if(f){factor=f.dataset.earthFactor;polarity='el';area=(zones[factor]||[])[0]?.id;renderExplorer();}
      else if(p){polarity=p.dataset.earthPolarity;renderExplorer();}
      else if(a){area=a.dataset.earthArea;renderExplorer();}
      else if(reload){load(true);}
    });
    load(false);
  }
  function regionData(f,id,lang) {
    const z=(zones[f]||[]).find(x=>x.id===id);
    if(!z)return null;
    const l=lang==='en'?'en':'el',t=font(l);
    return { id:z.id,name:loc(z.name,l),season:loc(z.season,l),sector:loc(z.sector,l),
      el:loc(z.el,l),la:loc(z.la,l),conf:t[z.conf],level:z.conf,source:links[f] };
  }
  function openRegion(f,id) {
    if (!regionData(f,id,'el'))return;
    factor=f;area=id;polarity=f==='enso' && (reading?.roni?.at(-1)?.value ?? 0)<-.5?'la':'el';
    renderExplorer();
    $('earth-explorer')?.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  root.MONOEarth={page,mount,load,latest:()=>reading,regionData,openRegion};
})(typeof window!=='undefined'?window:globalThis);