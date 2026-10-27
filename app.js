/* MONO Weather v3.1 — live multi-model weather, MONO-ML forecast zoo, stations, phenomena, radar, climate.
 * Browser-only, no keys, no build step.
 * Sources: Open-Meteo (forecast · ensemble · previous runs · ERA5 · air quality · marine · geocoding),
 * NOAA Aviation Weather Center METAR (fallback Iowa Environmental Mesonet), WMO SYNOP via OGIMET, Netatmo (optional),
 * Meteostat / NOAA GHCN-Daily, weather news from publishers' RSS (ERTnews, Newsbeast, Severe Weather Europe, NASA, BBC),
 * RainViewer radar, Meteoalarm official warnings, BigDataCloud reverse geocoding. */
(() => {
'use strict';
const M = window.MONOModel, C = window.MONOClimate;
const fin = Number.isFinite;
const VERSION = '4.1';
const K = { prefs: 'mono31_prefs', train: 'mono31_train', snap: 'mono31_snapshot', clim: 'mono31_climate' };
const TRAIN_TTL = 12 * 3600e3, REFRESH_LIVE = 10 * 60e3, REFRESH_MODELS = 60 * 60e3;

/* ------------------------------------------------------------------ catalogue */
const MODELS = [
  { id: 'ecmwf_ifs', alt: [], name: 'ECMWF IFS HRES 9 km', org: 'ECMWF · Ευρώπη', kind: 'phys' },
  { id: 'ecmwf_ifs025', alt: [], name: 'ECMWF IFS 0.25°', org: 'ECMWF · Ευρώπη', kind: 'phys' },
  { id: 'ecmwf_aifs025_single', alt: [], name: 'ECMWF AIFS', org: 'ECMWF · Ευρώπη', kind: 'ai' },
  { id: 'ncep_gfs_seamless', alt: ['gfs_seamless'], name: 'GFS', org: 'NOAA NCEP · ΗΠΑ', kind: 'phys' },
  { id: 'ncep_aigfs025', alt: [], name: 'AIGFS', org: 'NOAA NCEP · ΗΠΑ', kind: 'ai' },
  { id: 'ncep_hgefs025_ensemble_mean', alt: [], name: 'HGEFS (μέσος)', org: 'NOAA NCEP · ΗΠΑ', kind: 'ai' },
  { id: 'dwd_icon_seamless', alt: ['icon_seamless'], name: 'ICON', org: 'DWD · Γερμανία', kind: 'phys' },
  { id: 'icon_global', alt: [], name: 'ICON Global 13 km', org: 'DWD · Γερμανία', kind: 'phys' },
  { id: 'icon_eu', alt: [], name: 'ICON-EU 7 km', org: 'DWD · Ευρώπη', kind: 'phys', box: [29.5, 70.5, -23.5, 62.5] },
  { id: 'icon_d2', alt: [], name: 'ICON-D2 2 km', org: 'DWD · Κεντρική Ευρώπη', kind: 'phys', box: [43.2, 58.1, -3.9, 20.3] },
  { id: 'meteofrance_seamless', alt: [], name: 'ARPEGE / AROME', org: 'Météo-France', kind: 'phys' },
  { id: 'meteofrance_arpege_world', alt: [], name: 'ARPEGE World 25 km', org: 'Météo-France', kind: 'phys' },
  { id: 'meteofrance_arpege_europe', alt: [], name: 'ARPEGE Europe 10 km', org: 'Météo-France · Ευρώπη', kind: 'phys', box: [20, 72, -32, 42] },
  { id: 'meteofrance_arome_france', alt: [], name: 'AROME France 2.5 km', org: 'Météo-France · Γαλλία', kind: 'phys', box: [37.5, 55.4, -12, 16] },
  { id: 'meteofrance_arome_france_hd', alt: [], name: 'AROME France HD 1.5 km', org: 'Météo-France · Γαλλία', kind: 'phys', box: [37.5, 55.4, -12, 16] },
  { id: 'ukmo_seamless', alt: [], name: 'UKMO Unified', org: 'Met Office · Ην. Βασίλειο', kind: 'phys' },
  { id: 'ukmo_global_deterministic_10km', alt: [], name: 'UKMO Global 10 km', org: 'Met Office · Ην. Βασίλειο', kind: 'phys' },
  { id: 'ukmo_uk_deterministic_2km', alt: [], name: 'UKV 2 km', org: 'Met Office · Ην. Βασίλειο', kind: 'phys', box: [47, 63, -13, 6] },
  { id: 'cmc_gem_seamless', alt: ['gem_seamless'], name: 'GEM', org: 'ECCC · Καναδάς', kind: 'phys' },
  { id: 'gem_global', alt: [], name: 'GEM Global 15 km', org: 'ECCC · Καναδάς', kind: 'phys' },
  { id: 'gem_regional', alt: [], name: 'GEM Regional 10 km', org: 'ECCC · Β. Αμερική', kind: 'phys', box: [10, 80, -170, -40] },
  { id: 'jma_seamless', alt: [], name: 'JMA GSM/MSM', org: 'JMA · Ιαπωνία', kind: 'phys' },
  { id: 'jma_gsm', alt: [], name: 'JMA GSM 20 km', org: 'JMA · Ιαπωνία', kind: 'phys' },
  { id: 'jma_msm', alt: [], name: 'JMA MSM 5 km', org: 'JMA · Ιαπωνία', kind: 'phys', box: [22, 48, 120, 150] },
  { id: 'kma_seamless', alt: [], name: 'KMA', org: 'KMA · Κορέα', kind: 'phys' },
  { id: 'kma_ldps', alt: [], name: 'KMA LDPS 1.5 km', org: 'KMA · Κορέα', kind: 'phys', box: [32, 44, 120, 136] },
  { id: 'cma_grapes_global', alt: [], name: 'CMA GRAPES', org: 'CMA · Κίνα', kind: 'phys' },
  { id: 'bom_access_global', alt: [], name: 'ACCESS-G', org: 'BOM · Αυστραλία', kind: 'phys' },
  { id: 'italia_meteo_arpae_icon_2i', alt: [], name: 'ICON-2I', org: 'ItaliaMeteo · Ιταλία', kind: 'phys' },
  { id: 'meteoswiss_icon_seamless', alt: [], name: 'ICON-CH', org: 'MeteoSwiss · Ελβετία', kind: 'phys' },
  { id: 'geosphere_seamless', alt: [], name: 'AROME Austria', org: 'GeoSphere · Αυστρία', kind: 'phys' },
  { id: 'chmi_aladin_seamless', alt: [], name: 'ALADIN', org: 'CHMI · Τσεχία', kind: 'phys' },
  { id: 'knmi_seamless', alt: [], name: 'HARMONIE (KNMI)', org: 'KNMI · Ολλανδία', kind: 'phys' },
  { id: 'knmi_harmonie_arome_europe', alt: [], name: 'HARMONIE Europe 5.5 km', org: 'KNMI · Ευρώπη', kind: 'phys', box: [42, 66, -26, 36] },
  { id: 'knmi_harmonie_arome_netherlands', alt: [], name: 'HARMONIE NL 2 km', org: 'KNMI · Ολλανδία', kind: 'phys', box: [49, 56, 0, 11] },
  { id: 'dmi_seamless', alt: [], name: 'HARMONIE (DMI)', org: 'DMI · Δανία', kind: 'phys' },
  { id: 'dmi_harmonie_arome_europe', alt: [], name: 'HARMONIE DINI 2 km', org: 'DMI · Β. Ευρώπη', kind: 'phys', box: [44, 72, -30, 40] },
  { id: 'metno_seamless', alt: [], name: 'MEPS Nordic', org: 'MET Norway', kind: 'phys' },
  { id: 'metno_nordic', alt: [], name: 'MEPS 2.5 km', org: 'MET Norway · Σκανδιναβία', kind: 'phys', box: [52, 73, -2, 35] },
  { id: 'ncep_hrrr_conus', alt: [], name: 'HRRR 3 km', org: 'NOAA · ΗΠΑ', kind: 'phys', box: [21, 53, -135, -60] },
  { id: 'ncep_nbm_conus', alt: [], name: 'NBM', org: 'NOAA · ΗΠΑ', kind: 'phys', box: [19, 55, -138, -58] },
  { id: 'ncep_nam_conus', alt: [], name: 'NAM 3 km', org: 'NOAA · ΗΠΑ', kind: 'phys', box: [21, 53, -135, -60] },
  { id: 'cmc_gem_hrdps', alt: [], name: 'HRDPS 2.5 km', org: 'ECCC · Καναδάς', kind: 'phys', box: [27, 70, -152, -42] }
];
const ENSEMBLES = [
  { id: 'ecmwf_ifs025_ensemble', alt: ['ecmwf_ifs025'], name: 'ECMWF ENS', n: 51 },
  { id: 'ecmwf_aifs025_ensemble', alt: ['ecmwf_aifs025'], name: 'ECMWF AIFS ENS', n: 51 },
  { id: 'ncep_gefs_seamless', alt: ['ncep_gefs025', 'gfs_seamless'], name: 'NOAA GEFS', n: 31 },
  { id: 'dwd_icon_seamless_eps', alt: ['icon_seamless_eps', 'icon_seamless'], name: 'DWD ICON-EPS', n: 40 },
  { id: 'gem_global_ensemble', alt: ['gem_global'], name: 'ECCC GEPS', n: 21 },
  { id: 'ukmo_global_ensemble_20km', alt: [], name: 'Met Office MOGREPS-G', n: 18 },
  { id: 'google_weathernext2_ensemble', alt: [], name: 'Google WeatherNext 2', n: 64 },
  { id: 'bom_access_global_ensemble', alt: [], name: 'BOM ACCESS-GE', n: 18 }
];
const HV = 'temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,precipitation,precipitation_probability,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m,wind_direction_10m,pressure_msl,cape,snowfall,visibility';
const EV_FULL = 'temperature_2m,precipitation,wind_speed_10m,wind_gusts_10m,snowfall,cape', EV_BASE = 'temperature_2m,precipitation,wind_speed_10m';
const ALG_NAMES = { el: { mean: 'Μέσος όρος', best: 'Καλύτερο μοντέλο', mos: 'MOS (διόρθωση + βάρη)', ridge: 'Ridge stacking', kalman: 'Φίλτρο Kalman', analog: 'Ανάλογα (AnEn)', combo: 'Συνδυασμός', clim: 'Κλιματολογία', persist: 'Επιμονή', vote: 'Ψήφος μοντέλων', logistic: 'Λογιστική παλινδρόμηση', untrained: 'Χωρίς εκπαίδευση', none: '—' },
  en: { mean: 'Plain average', best: 'Best single model', mos: 'MOS (bias + weights)', ridge: 'Ridge stacking', kalman: 'Kalman filter', analog: 'Analog ensemble', combo: 'Combination', clim: 'Climatology', persist: 'Persistence', vote: 'Model vote', logistic: 'Logistic regression', untrained: 'Untrained', none: '—' } };

const CITIES = [
  ['Θεσσαλονίκη','Thessaloniki','GR',40.6401,22.9444,'Europe','Κεντρική Μακεδονία'],['Αθήνα','Athens','GR',37.9838,23.7275,'Europe','Αττική'],['Πάτρα','Patras','GR',38.2466,21.7346,'Europe','Δυτική Ελλάδα'],
  ['Ηράκλειο','Heraklion','GR',35.3387,25.1442,'Europe','Κρήτη'],['Λάρισα','Larissa','GR',39.639,22.4191,'Europe','Θεσσαλία'],['Βόλος','Volos','GR',39.3667,22.9458,'Europe','Θεσσαλία'],
  ['Ιωάννινα','Ioannina','GR',39.665,20.8537,'Europe','Ήπειρος'],['Χανιά','Chania','GR',35.5138,24.018,'Europe','Κρήτη'],['Καβάλα','Kavala','GR',40.936,24.4129,'Europe','Ανατολική Μακεδονία και Θράκη'],
  ['Ρόδος','Rhodes','GR',36.434,28.2176,'Europe','Νότιο Αιγαίο'],['Αλεξανδρούπολη','Alexandroupoli','GR',40.8457,25.8739,'Europe','Ανατολική Μακεδονία και Θράκη'],['Κέρκυρα','Corfu','GR',39.6243,19.9217,'Europe','Ιόνια Νησιά'],
  ['Βέροια','Veria','GR',40.5236,22.2028,'Europe','Κεντρική Μακεδονία'],['Λονδίνο','London','GB',51.5072,-0.1276,'Europe'],['Παρίσι','Paris','FR',48.8566,2.3522,'Europe'],
  ['Βερολίνο','Berlin','DE',52.52,13.405,'Europe'],['Ρώμη','Rome','IT',41.9028,12.4964,'Europe'],['Μαδρίτη','Madrid','ES',40.4168,-3.7038,'Europe'],
  ['Λισαβόνα','Lisbon','PT',38.7223,-9.1393,'Europe'],['Άμστερνταμ','Amsterdam','NL',52.3676,4.9041,'Europe'],['Βιέννη','Vienna','AT',48.2082,16.3738,'Europe'],
  ['Ζυρίχη','Zurich','CH',47.3769,8.5417,'Europe'],['Πράγα','Prague','CZ',50.0755,14.4378,'Europe'],['Στοκχόλμη','Stockholm','SE',59.3293,18.0686,'Europe'],
  ['Όσλο','Oslo','NO',59.9139,10.7522,'Europe'],['Κωνσταντινούπολη','Istanbul','TR',41.0082,28.9784,'Europe'],['Λευκωσία','Nicosia','CY',35.1856,33.3823,'Europe'],
  ['Σόφια','Sofia','BG',42.6977,23.3219,'Europe'],['Νέα Υόρκη','New York','US',40.7128,-74.006,'North America'],['Λος Άντζελες','Los Angeles','US',34.0522,-118.2437,'North America'],
  ['Σικάγο','Chicago','US',41.8781,-87.6298,'North America'],['Τορόντο','Toronto','CA',43.6532,-79.3832,'North America'],['Πόλη του Μεξικού','Mexico City','MX',19.4326,-99.1332,'North America'],
  ['Σάο Πάολο','São Paulo','BR',-23.5505,-46.6333,'South America'],['Μπουένος Άιρες','Buenos Aires','AR',-34.6037,-58.3816,'South America'],
  ['Τόκιο','Tokyo','JP',35.6762,139.6503,'Asia'],['Σεούλ','Seoul','KR',37.5665,126.978,'Asia'],['Πεκίνο','Beijing','CN',39.9042,116.4074,'Asia'],
  ['Σιγκαπούρη','Singapore','SG',1.3521,103.8198,'Asia'],['Ντουμπάι','Dubai','AE',25.2048,55.2708,'Asia'],['Μουμπάι','Mumbai','IN',19.076,72.8777,'Asia'],
  ['Κάιρο','Cairo','EG',30.0444,31.2357,'Africa'],['Κέιπ Τάουν','Cape Town','ZA',-33.9249,18.4241,'Africa'],['Ναϊρόμπι','Nairobi','KE',-1.2921,36.8219,'Africa'],
  ['Σίδνεϊ','Sydney','AU',-33.8688,151.2093,'Oceania'],['Μελβούρνη','Melbourne','AU',-37.8136,144.9631,'Oceania'],['Όκλαντ','Auckland','NZ',-36.8509,174.7645,'Oceania']
].map(([el, en, cc, lat, lon, region, admin1]) => ({ name: en, nameEl: el, cc, lat, lon, region, admin1 }));
const COUNTRY = { GR:['Ελλάδα','Greece'],GB:['Ην. Βασίλειο','United Kingdom'],FR:['Γαλλία','France'],DE:['Γερμανία','Germany'],IT:['Ιταλία','Italy'],ES:['Ισπανία','Spain'],PT:['Πορτογαλία','Portugal'],NL:['Ολλανδία','Netherlands'],AT:['Αυστρία','Austria'],CH:['Ελβετία','Switzerland'],CZ:['Τσεχία','Czechia'],SE:['Σουηδία','Sweden'],NO:['Νορβηγία','Norway'],TR:['Τουρκία','Türkiye'],CY:['Κύπρος','Cyprus'],BG:['Βουλγαρία','Bulgaria'],US:['ΗΠΑ','United States'],CA:['Καναδάς','Canada'],MX:['Μεξικό','Mexico'],BR:['Βραζιλία','Brazil'],AR:['Αργεντινή','Argentina'],JP:['Ιαπωνία','Japan'],KR:['Ν. Κορέα','South Korea'],CN:['Κίνα','China'],SG:['Σιγκαπούρη','Singapore'],AE:['ΗΑΕ','UAE'],IN:['Ινδία','India'],EG:['Αίγυπτος','Egypt'],ZA:['Ν. Αφρική','South Africa'],KE:['Κένυα','Kenya'],AU:['Αυστραλία','Australia'],NZ:['Ν. Ζηλανδία','New Zealand'] };
const METEOALARM = { GR:'greece',CY:'cyprus',DE:'germany',IT:'italy',ES:'spain',FR:'france',GB:'united-kingdom',NL:'netherlands',AT:'austria',CH:'switzerland',CZ:'czechia',SE:'sweden',NO:'norway',PT:'portugal',BG:'bulgaria',RO:'romania',PL:'poland',HU:'hungary',HR:'croatia',SI:'slovenia',SK:'slovakia',BE:'belgium',DK:'denmark',FI:'finland',IE:'ireland',RS:'serbia',MK:'republic-of-north-macedonia',ME:'montenegro',BA:'bosnia-herzegovina',EE:'estonia',LV:'latvia',LT:'lithuania',LU:'luxembourg',MT:'malta',IS:'iceland',MD:'moldova',IL:'israel',UA:'ukraine' };

/* ------------------------------------------------------------------ i18n */
const MONTHS = { el: ['Ιαν','Φεβ','Μαρ','Απρ','Μάι','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'], en: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] };
const MONTHS_LONG = { el: ['Ιανουάριος','Φεβρουάριος','Μάρτιος','Απρίλιος','Μάιος','Ιούνιος','Ιούλιος','Αύγουστος','Σεπτέμβριος','Οκτώβριος','Νοέμβριος','Δεκέμβριος'], en: ['January','February','March','April','May','June','July','August','September','October','November','December'] };
const L = {
el: {
  now:'Τώρα', hourly:'Ωριαία', phen:'Φαινόμενα', radar:'Ραντάρ', models:'Μοντέλα', lab:'Μοντέλο MONO', labShort:'MONO', stations:'Σταθμοί', climate:'Κλίμα', earth:'Παλμός Γης', cities:'Πόλεις', more:'Περισσότερα',
  workspace:'ΕΦΑΡΜΟΓΗ', saved:'ΑΓΑΠΗΜΕΝΑ', search:'Αναζήτηση πόλης, περιοχής ή Τ.Κ.…',
  observed:'ΜΕΤΡΗΣΗ ΣΤΑΘΜΟΥ', modelNow:'ΕΚΤΙΜΗΣΗ ΜΟΝΤΕΛΟΥ', feels:'Αίσθηση', high:'Μέγ.', low:'Ελάχ.', rainChance:'Πιθανότητα βροχής', next6:'επόμενες 6 ώρες',
  wind:'Άνεμος', gust:'ριπές', humidity:'Υγρασία', dew:'σημείο δρόσου', pressure:'Πίεση', visibility:'ορατότητα', clouds:'Νέφωση',
  next24:'Επόμενες 24 ώρες', next48:'48 ώρες', next72:'72 ώρες', next168:'7 ημέρες', h24:'24 ώρες',
  chartNow:'Μετρήσεις και πρόβλεψη MONO', chartNowSub:'Τελευταίες 24 ώρες από τον σταθμό, επόμενες 48 από το μοντέλο', chartNowSubNoObs:'Τελευταίες 24 ώρες (ανάλυση μοντέλου) και επόμενες 48',
  week:'Επόμενες 7 ημέρες', today:'Σήμερα', tomorrow:'Αύριο',
  legendMono:'MONO', legendObs:'Μέτρηση', legendBand:'Εύρος 80%', legendRain:'Βροχή (mm)', legendModels:'Μεμονωμένα μοντέλα', legendHind:'MONO (παρελθόν)',
  engine:'Πώς βγήκε η πρόγνωση', modelsUsed:'μοντέλα σε χρήση', members:'μέλη ensemble', systems:'συστήματα', trainedOn:'Αλγόριθμος', station2:'Διόρθωση σταθμού',
  trainingNow:'Εκπαίδευση σε ιστορικά δεδομένα…', untrained:'Χωρίς εκπαίδευση ακόμα', trainFail:'Τα ιστορικά δεδομένα δεν φορτώθηκαν· χρησιμοποιείται απλός μέσος όρος', waitModels:'Περιμένει τα μοντέλα…',
  hourlyTitle:'Ωριαία πρόγνωση', hourlySub:'Τιμές του MONO στην τοπική ώρα. Το εύρος είναι το διάστημα 80%.',
  time:'Ώρα', temp:'Θερμ.', range:'Εύρος', rain:'Βροχή', amount:'Ύψος', windCol:'Άνεμος', rh:'Υγρ.', exportCsv:'Εξαγωγή CSV', exported:'Το αρχείο κατέβηκε',
  modelsTitle:'Όλα τα μοντέλα', modelsSub:'Ζωντανές προγνώσεις από εθνικές μετεωρολογικές υπηρεσίες και μοντέλα AI, μαζί με τα ensembles.',
  varTemp:'Θερμοκρασία', varRain:'Βροχή', varWind:'Άνεμος',
  model:'Μοντέλο', type:'Τύπος', phys:'Φυσικό', ai:'AI', valueAt:'Τιμή', weight:'Βάρος MOS', skill:'Σφάλμα (τεστ)', live72:'Σφάλμα 72h vs σταθμός', status:'Κατάσταση',
  ok:'Ενεργό', noCover:'Δεν καλύπτει την περιοχή', dupOf:'Ίδιο με', failed:'Απέτυχε', loading:'Φόρτωση…',
  ensTitle:'Ensembles', ensSub:'Σύνολα προγνώσεων με διαταραγμένες αρχικές συνθήκες. Δίνουν την αβεβαιότητα και τις πιθανότητες φαινομένων.',
  system:'Σύστημα', spread:'Διασπορά', pRain:'P(βροχή)', membersCol:'Μέλη',
  labTitle:'Το μοντέλο MONO', labSub:'Έξι αλγόριθμοι εκπαιδεύονται στα λάθη κάθε μοντέλου στην περιοχή σου. Ο καλύτερος επιλέγεται σε δεδομένα επικύρωσης και βαθμολογείται σε δεδομένα που δεν έχει δει.',
  leadDay:'Ορίζοντας', d:'Η', zooTitle:'Οι αλγόριθμοι', zooSub:'Σφάλμα θερμοκρασίας (MAE) στο σύνολο τεστ· μικρότερο είναι καλύτερο',
  chosen:'σε χρήση', algo:'Αλγόριθμος', maeTest:'MAE τεστ', skillClim:'Βελτίωση vs κλιματολογία', maeVal:'MAE επικύρωσης', baseline:'αναφορά', clim:'Κλιματολογία',
  zooChart:'Οι αλγόριθμοι για τις επόμενες 72 ώρες', holdTemp:'Σφάλμα θερμοκρασίας', vsMean:'έναντι μέσου όρου', vsBest:'Καλύτερο μεμονωμένο',
  brier:'Brier βροχής', brierNote:'0 = τέλεια, μικρότερο καλύτερο', windMae:'Σφάλμα ανέμου',
  modelTable:'Μοντέλα στο MOS', bias:'Μεροληψία', diurnal:'Ημερήσιο εύρος', rawMae:'Σφάλμα πριν', corMae:'Σφάλμα μετά', samples:'Δείγματα',
  rainBlock:'Βροχή: αλγόριθμοι πιθανότητας', pod:'Ποσοστό εντοπισμού', far:'Ψευδείς συναγερμοί', wetHours:'Βροχερές ώρες τεστ',
  stationBlock:'Ζωντανή διόρθωση από σταθμό', offset:'Μέση απόκλιση σταθμού', tau:'Χρόνος απόσβεσης', maeBefore:'Σφάλμα 72h πριν', maeAfter:'μετά',
  noStation:'Δεν βρέθηκε σταθμός METAR σε απόσταση έως 30 km. Η πρόγνωση στηρίζεται μόνο στα μοντέλα.',
  steps:'Πώς δουλεύει', retrain:'Επανεκπαίδευση', period:'Περίοδος', split:'Εκπαίδευση / επικύρωση / τεστ', truth:'Αλήθεια αναφοράς',
  liveCheck:'Ζωντανός έλεγχος: τελευταίες 72 ώρες έναντι σταθμού', stationOos:'MONO + σταθμός (εκτός δείγματος, 24h)',
  citiesTitle:'Ο καιρός στον κόσμο', citiesSub:'Ζωντανές τιμές για προεπιλεγμένες πόλεις· αναζήτησε οποιαδήποτε άλλη.', all:'Όλες', favorites:'Αγαπημένα', open:'Άνοιγμα',
  save:'Αποθήκευση', remove:'Αφαίρεση', added:'Προστέθηκε στα αγαπημένα', removed:'Αφαιρέθηκε', refresh:'Ανανέωση',
  noData:'Δεν υπάρχουν δεδομένα', loadFail:'Ο καιρός δεν φορτώθηκε. Έλεγξε τη σύνδεση και πάτα Ανανέωση.', retry:'Ξανά',
  cached:'Αποθηκευμένη εικόνα', live:'Ζωντανά', updated:'Ενημέρωση', geoError:'Δεν βρέθηκε η τοποθεσία σου', myLoc:'Η τοποθεσία μου', locating:'Εντοπισμός θέσης…',
  clear:'Αίθριος', mainly:'Λίγα σύννεφα', partly:'Μερικώς νεφελώδης', overcast:'Συννεφιά', fog:'Ομίχλη', drizzle:'Ψιχάλα', rainL:'Ασθενής βροχή', rainM:'Βροχή', rainH:'Ισχυρή βροχή',
  freezing:'Παγωμένη βροχή', snow:'Χιόνι', showers:'Μπόρες', storm:'Καταιγίδα', unknown:'—',
  attribution:'Δεδομένα: Open-Meteo (CC BY 4.0) · NOAA · NASA GIBS · IEM · Meteostat · RainViewer · Meteoalarm · Esri',
  minutes:'λεπτά', hrs:'ώρες', ago:'πριν',
  phenTitle:'Φαινόμενα', phenSub:'Πιθανότητες από τα μέλη των ensembles και τα μοντέλα, για την περιοχή σου.',
  ph_rain:'Βροχή', ph_heavy:'Ισχυρή βροχή', ph_storm:'Καταιγίδα', ph_snow:'Χιόνι', ph_fog:'Ομίχλη', ph_wind:'Θυελλώδεις άνεμοι', ph_frost:'Παγετός', ph_heat:'Καύσωνας',
  phd_rain:'≥ 1 mm την ημέρα', phd_heavy:'≥ 20 mm την ημέρα', phd_storm:'CAPE και βροχή ή κωδικός καταιγίδας', phd_snow:'Υετός με θερμοκρασία ≤ 0,5°C', phd_fog:'Ορατότητα < 1 km', phd_wind:'Ριπές ≥ 62 km/h (8 Μποφόρ)', phd_frost:'Θερμοκρασία ≤ 0°C', phd_heat:'Θερμοκρασία ≥ 35°C',
  rainTimeline:'Πότε θα βρέξει', noRain:'Δεν αναμένεται βροχή τις επόμενες 72 ώρες.', from:'από', to:'έως', upTo:'έως', alerts:'Προσοχή',
  warnTitle:'Επίσημες προειδοποιήσεις', warnNone:'Δεν υπάρχουν ενεργές επίσημες προειδοποιήσεις για τη χώρα.', warnFail:'Οι επίσημες προειδοποιήσεις δεν φορτώθηκαν.', warnRegion:'για την περιοχή σου', warnCountry:'στη χώρα',
  hourlyProb:'Ωριαίες πιθανότητες (72 ώρες)',
  space:'Διάστημα', spaceTitle:'Διαστημικός καιρός', spaceSub:'Ηλιακή δραστηριότητα, γεωμαγνητικές καταιγίδες, ραδιοεπικοινωνίες και όσα δεν βλέπουμε στον ουρανό.',
  environment:'Περιβάλλον', envTitle:'Περιβάλλον', envSub:'Αέρας, αλλεργίες, ρύποι, σύννεφα, πίεση και ανώτερη ατμόσφαιρα για την περιοχή σου.', envOpen:'Πλήρης ανάλυση', aqi:'Ποιότητα αέρα', pollen:'Γύρη · επόμενο 24ωρο', sun:'Ήλιος & Σελήνη', sea:'Θάλασσα', daylight:'Διάρκεια ημέρας', uvMax:'Μέγ. UV',
  seaTemp:'νερό', waves:'Κύμα', illum:'φωτισμένη', aq: ['Καλή','Σχετικά καλή','Μέτρια','Κακή','Πολύ κακή','Εξαιρετικά κακή'], dust:'Σκόνη',
  pol_birch:'Σημύδα', pol_grass:'Αγρωστώδη', pol_olive:'Ελιά', pol_ragweed:'Αμβροσία', pol_alder:'Σκλήθρα', pol_mugwort:'Αρτεμισία', lvl:['Χαμηλή','Μέτρια','Υψηλή'],
  moonNames:['Νέα σελήνη','Αύξων μηνίσκος','Πρώτο τέταρτο','Αύξουσα αμφίκυρτη','Πανσέληνος','Φθίνουσα αμφίκυρτη','Τελευταίο τέταρτο','Φθίνων μηνίσκος'],
  news:'Ειδήσεις', newsTitle:'Ειδήσεις καιρού', newsSub:'Τίτλοι από ελληνικά και διεθνή μέσα, με σύνδεσμο στο πλήρες άρθρο.', newsCity:'Η πόλη μου', newsGreece:'Ελλάδα', newsWorld:'Κόσμος (EN)',
  newsLocal:'Για', newsLatest:'Τα πιο πρόσφατα', newsEmpty:'Καμία είδηση', newsEmptyCity:'Δεν υπάρχει πρόσφατο άρθρο που να αναφέρει την πόλη. Δες τις καρτέλες Ελλάδα και Κόσμος.', newsFail:'Οι πηγές ειδήσεων δεν απάντησαν. Δοκίμασε ξανά σε λίγο.', newsSources:'Πηγές',
  rawSynop:'Πρόσφατα μηνύματα SYNOP', pwsTitle:'Ερασιτεχνικοί σταθμοί (Netatmo)', pwsSub:'Σταθμοί σε σπίτια και μπαλκόνια, σε ακτίνα ~12 km', pwsNone:'Δεν βρέθηκαν ενεργοί σταθμοί κοντά.', pwsMedian:'Διάμεση θερμοκρασία', pwsRain:'Σταθμοί με βροχή την τελευταία ώρα', pwsNearest:'Οι πιο κοντινοί',
  pwsNote:'Δεν μπαίνουν στη διόρθωση του MONO: είναι πυκνοί αλλά συχνά στον ήλιο ή κοντά σε τοίχους. Η διάμεση τιμή όμως δείχνει καλά τη θερμοκρασία της γειτονιάς.',
  stTitle:'Σταθμοί', stSub:'Ζωντανές μετρήσεις METAR (αεροδρόμια) και SYNOP (ΕΜΥ και εθνικές υπηρεσίες) από όλους τους σταθμούς της περιοχής.', stUse:'Χρήση για διόρθωση', stInUse:'Σε χρήση',
  stNone:'Δεν βρέθηκαν σταθμοί METAR ή SYNOP κοντά ή οι υπηρεσίες δεν απάντησαν.', stChart:'72 ώρες: σταθμός και MONO', rawMetar:'Πρόσφατα μηνύματα METAR',
  climTitle:'Κλίμα', climSub:'Ιστορικά δεδομένα πολλών ετών: μέσοι όροι, ρεκόρ, τάσεις και φαινόμενα ανά μήνα.',
  srcStation:'Σταθμός', srcEra:'ERA5 (αναανάλυση)', loadOlder:'Φόρτωση από το 1940', loadingYears:'Φόρτωση ετών', stFail:'Τα δεδομένα σταθμού δεν φορτώθηκαν· εμφανίζεται ERA5.', years:'έτη',
  climograph:'Κλιματικό διάγραμμα', normalTx:'Μέση μέγιστη', normalTn:'Μέση ελάχιστη', normalP:'Βροχή (mm)', recordRange:'Εύρος ρεκόρ',
  overYears:'ανά έτος', meanTemp:'Μέση θερμοκρασία', trendTxt:'Τάση', perDecade:'ανά δεκαετία', total:'Βροχή μήνα', normal:'Κανονικό',
  records:'Ρεκόρ', warmest:'Θερμότερος', coldest:'Ψυχρότερος', wettest:'Βροχερότερος', driest:'Ξηρότερος', hottestDay:'Υψηλότερη θερμοκρασία', coldestDay:'Χαμηλότερη θερμοκρασία', wettestDay:'Περισσότερη βροχή σε μία ημέρα',
  phenDays:'Ημέρες με φαινόμενα', avgDays:'Μέσος όρος', lastYear:'Πέρυσι', thisYear:'Φέτος', dShort:'ημ',
  cd_rain:'Βροχερές (≥ 1 mm)', cd_heavy:'Ισχυρή βροχή (≥ 10 mm)', cd_snow:'Χιόνι', cd_frost:'Παγετός (ελάχ. < 0°C)', cd_summer:'Θερινές (μέγ. ≥ 25°C)', cd_hot:'Καύσωνας (μέγ. ≥ 35°C)', cd_tropical:'Τροπικές νύχτες (ελάχ. ≥ 20°C)', cd_gale:'Θυελλώδεις ριπές (≥ 62 km/h)', cd_storm:'Καταιγίδα',
  heatmap:'Απόκλιση θερμοκρασίας ανά μήνα και έτος', monthToDate:'Ο μήνας μέχρι τώρα', vsNormal:'έναντι κανονικού',
  radarTitle:'Ραντάρ βροχής', radarSub:'Πραγματικές εικόνες ραντάρ των τελευταίων 2 ωρών, με τους σταθμούς της περιοχής.', play:'Αναπαραγωγή', pause:'Παύση', radarFail:'Ο χάρτης ή το ραντάρ δεν φορτώθηκε.',
  others:'Οι άλλοι αλγόριθμοι', finalP:'τελική',
  globe:'Υδρόγειος', globeTitle:'Η Γη τώρα', globeSub:'Πραγματικές δορυφορικές εικόνες της NASA και ζωντανές θερμοκρασίες πόλεων. Γύρνα τη σφαίρα· πάτα μια πόλη για να ανοίξει η πρόγνωσή της.',
  gSat:'Δορυφόρος (χθες)', gMarble:'Χωρίς σύννεφα', gSst:'Θερμοκρασία θάλασσας', gClouds:'Σύννεφα τώρα', gRain:'Βροχή (NASA IMERG)', gTemps:'Θερμοκρασίες πόλεων', gSpin:'Περιστροφή',
  gSatNote:'NASA VIIRS NOAA-20, τελευταία πλήρης μέρα', gSstNote:'NASA GHRSST MUR, θερμοκρασία επιφάνειας θάλασσας', gRainNote:'NASA IMERG, βροχή τελευταίου μισάωρου (καθυστέρηση ~5 ώρες)',
  gCloudsNA:'Τα «σύννεφα τώρα» χρειάζονται το proxy του Netlify (_redirects)', gFail:'Η εικόνα δεν φορτώθηκε', globeNote:'Πηγές: NASA GIBS · RainViewer · Open-Meteo. Η υδρόγειος χρειάζεται WebGL.',
  satIR:'Σύννεφα (υπέρυθρο)', radarNote:'Χάρτης χωρίς κλειδί (Esri)',
  wkTitle:'Το Σαββατοκύριακο', wkNext:'Το ερχόμενο ΣΚ', wkThis:'Αυτό το ΣΚ', wkLong:'μεγάλος ορίζοντας', wkClimTag:'κλιματολογία',
  wkGood:'Καλό Σαββατοκύριακο για έξω: χωρίς βροχή και με ευχάριστη θερμοκρασία.', wkWet:'Βροχερό Σαββατοκύριακο· κανόνισε κάτι για μέσα.', wkBest:d => `Καλύτερη μέρα για έξω: ${d}.`,
  wkTypical:(h, l, p) => `Συνήθως ${h} / ${l}, βροχή ${p} των ημερών`,
  holLabel:'Αργίες', holTitle:'Ο καιρός στις αργίες', localHol:'τοπική', usually:'Συνήθως', inDays:n => `σε ${n} μέρες`, holClimBtn:'Δες τι καιρό κάνει συνήθως',
  holNote:'Έως 7 μέρες: πρόγνωση MONO. Έως 16 μέρες: πρόγνωση μεγάλου ορίζοντα (λιγότερο ακριβής). Πιο μακριά: τι καιρό κάνει συνήθως εκείνες τις μέρες, από ERA5 1991 και μετά.',
  plainTitle:'Με απλά λόγια', tdLabel:'Πρακτικά', tdTitle:'Τι να κάνω σήμερα', tdWear:'Τι να φορέσω', tdMove:'Μετακίνηση & αυτοκίνητο', tdHome:'Σπίτι & μπαλκόνι', tdHealth:'Υγεία', tdOut:'Έξοδος', todayL:'σήμερα', tomorrowL:'αύριο',
  probWords:['απίθανη','λίγο πιθανή','πιθανή','σχεδόν σίγουρη'], feelWords:['παγωνιά','κρύο','δροσιά','ευχάριστη θερμοκρασία','ζέστη','πολλή ζέστη','καύσωνας'],
  skyWords:{ storm:'Καταιγίδες', snow:'Χιονόπτωση', rain:'Βροχερή μέρα', mixed:'Άστατος καιρός με πιθανές μπόρες', fog:'Ομίχλη', cloudy:'Συννεφιά', partly:'Ήλιος και σύννεφα', mostly:'Κυρίως ηλιόλουστα', clear:'Λιακάδα' },
  bftWords:['άπνοια','σχεδόν άπνοια','ασθενής','ασθενής','μέτριος','λαμπρός','ισχυρός','σφοδρός','θυελλώδης','πολύ θυελλώδης','θύελλα','σφοδρή θύελλα','τυφώνας'],
  sNow:(t, f, c) => `Τώρα: ${t}${f ? ` (αισθάνεσαι ${f})` : ''}, ${c}.`,
  sRise:(mx, mn) => `Μέχρι το απόγευμα ανεβαίνει ως τους ${mx}${mn ? `, ενώ τη νύχτα πέφτει στους ${mn}` : ''}.`,
  sFall:mn => `Η θερμοκρασία από εδώ και πέρα πέφτει· τη νύχτα θα φτάσει τους ${mn}.`,
  sRain:(a, b, w, p, mm) => `Βροχή ${w} ${a}–${b} (έως ${p})${mm ? `, περίπου ${mm} mm` : ''}.`,
  sRainLater:d => `Ως αύριο αυτή την ώρα δεν θα βρέξει· η επόμενη βροχή φαίνεται ${d}.`,
  sDry:'Δεν φαίνεται βροχή τις επόμενες 24 ώρες.',
  sWind:(g, b, w) => `Θα φυσάει: ${w} άνεμος (${b} Μποφόρ) με ριπές έως ${g} km/h.`,
  sTomDiff:(d, up, hi) => `Αύριο θα είναι ${d} βαθμούς πιο ${up ? 'ζεστά' : 'κρύα'} (μέγιστη ${hi}).`,
  sTomSame:hi => `Αύριο παρόμοια θερμοκρασία, με μέγιστη ${hi}.`,
  sEvents:l => `Προσοχή: ${l}.`, sWarn:e => `Υπάρχει επίσημη προειδοποίηση για την περιοχή σου: ${e}.`,
  sWeek:(wet, d, hi) => `Την εβδομάδα: ${wet ? `βροχή ${wet}` : 'χωρίς σημαντική βροχή'}· πιο ζεστή μέρα: ${d} (${hi}).`, and:' και ', sDryToday:'Σήμερα δεν θα βρέξει.',
  aUmbrella:'Πάρε ομπρέλα', aCoatHeavy:'Βαρύ μπουφάν, σκουφί, γάντια', aCoat:'Μπουφάν', aJacket:'Ζακέτα ή ελαφρύ μπουφάν', aLight:'Ελαφριά ρούχα', aHot:'Ελαφριά ρούχα και νερό',
  aUV:u => `Αντηλιακό (UV ${u})`, aFog:'Ομίχλη: οδήγησε προσεκτικά', aWind:'Δυνατός αέρας: μάζεψε ό,τι μπορεί να πετάξει', aLaundryYes:'Καλή μέρα για άπλωμα', aLaundryNo:'Μην απλώσεις ρούχα έξω',
  aFrost:'Παγετός: προστάτευσε φυτά και σωλήνες', aHeat:'Καύσωνας: απόφυγε τον ήλιο 12:00–17:00', aAir:'Κακή ποιότητα αέρα: λιγότερη άσκηση έξω', aWalk:w => `Καλύτερη ώρα για βόλτα: ${w}`,
  glossTitle:'Τι σημαίνουν αυτά;', glossSub:'Οι όροι της εφαρμογής, απλά',
  glossList:[
    ['Πιθανότητα βροχής','Πόσο πιθανό είναι να πέσει βροχή εκείνη την ώρα. 40% σημαίνει ότι σε 10 παρόμοιες μέρες θα έβρεχε περίπου στις 4.'],
    ['Εύρος 80%','Η θερμοκρασία θα είναι μέσα σε αυτό το εύρος 8 φορές στις 10. Όσο πιο φαρδύ, τόσο πιο αβέβαιη η πρόγνωση.'],
    ['Αίσθηση','Πόσο κρύο ή ζέστη νιώθει το σώμα, αφού υπολογιστούν ο αέρας, η υγρασία και ο ήλιος.'],
    ['Ριπή','Το πιο δυνατό φύσημα του αέρα για λίγα δευτερόλεπτα· πάντα πιο δυνατό από τον μέσο άνεμο.'],
    ['Μποφόρ','Κλίμακα 0–12 για την ένταση του ανέμου. Από 6 νιώθεις δυνατό αέρα, από 8 είναι θυελλώδης.'],
    ['Σημείο δρόσου','Πάνω από 18° ο καιρός νιώθει πνιγηρός. Όταν πλησιάζει τη θερμοκρασία, έρχεται ομίχλη ή δροσιά.'],
    ['UV','Δείκτης ηλιακής ακτινοβολίας. Από 6 χρειάζεται αντηλιακό, από 8 προστασία ακόμη και για λίγη ώρα.'],
    ['Ποιότητα αέρα (EAQI)','Ευρωπαϊκός δείκτης: 0–20 καλή, 20–40 μέτρια, 40–60 μέση, πάνω από 60 κακή.'],
    ['Μοντέλο καιρού','Πρόγραμμα σε υπερυπολογιστή που λύνει τις εξισώσεις της ατμόσφαιρας. Κάθε χώρα έχει το δικό της, γι’ αυτό συχνά διαφωνούν.'],
    ['Ensemble','Το ίδιο μοντέλο τρέχει δεκάδες φορές με λίγο διαφορετική αφετηρία. Αν οι εκδοχές συμφωνούν, η πρόγνωση είναι σίγουρη.'],
    ['MONO','Ο συνδυασμός της εφαρμογής: μαθαίνει από τα λάθη κάθε μοντέλου στην περιοχή σου και διορθώνεται ζωντανά από τον κοντινότερο σταθμό.'],
    ['Σταθμός METAR','Μετεωρολογικός σταθμός αεροδρομίου που στέλνει μετρήσεις κάθε μισή ώρα. Είναι πραγματική μέτρηση, όχι πρόγνωση.']
  ],
  stepsList:[
    ['Ζωντανές προγνώσεις','Έως 35 μοντέλα (παγκόσμια και περιοχικά υψηλής ανάλυσης) και 8 ensembles (έως 345 μέλη) φορτώνονται για το σημείο. Μοντέλα εκτός περιοχής ή που αντιγράφουν άλλο εντοπίζονται και αφαιρούνται.'],
    ['Ιστορικό σφαλμάτων','Για τις τελευταίες 8 εβδομάδες κατεβαίνουν οι παλιές προγνώσεις κάθε μοντέλου (ορίζοντας 0–5 ημέρες) και συγκρίνονται με την αναανάλυση ERA5.'],
    ['Έξι αλγόριθμοι','Μέσος όρος, καλύτερο μοντέλο, MOS με διόρθωση ημερήσιας μεροληψίας, ridge stacking, φίλτρο Kalman και ανάλογα (analog ensemble) εκπαιδεύονται χωριστά για κάθε ορίζοντα.'],
    ['Τίμιος έλεγχος','Τα δεδομένα χωρίζονται χρονολογικά 60/20/20. Ο αλγόριθμος ή ο συνδυασμός των τριών καλύτερων επιλέγεται στην επικύρωση. Τα νούμερα που βλέπεις είναι από το τεστ, που δεν χρησιμοποιήθηκε πουθενά.'],
    ['Βροχή','Ψήφος μοντέλων, λογιστική παλινδρόμηση και ανάλογα συγκρίνονται με το Brier score. Το αποτέλεσμα συνδυάζεται με το ποσοστό μελών ensemble που δίνουν βροχή.'],
    ['Σταθμός','Οι μετρήσεις METAR 72 ωρών δίνουν τη σταθερή απόκλιση του σημείου και το τρέχον σφάλμα, που σβήνει εκθετικά με χρόνο από την αυτοσυσχέτιση. Ελέγχεται κι αυτό εκτός δείγματος.'],
    ['Φαινόμενα','Καταιγίδα, χιόνι, ομίχλη, θυελλώδεις άνεμοι, παγετός και καύσωνας υπολογίζονται από τα μέλη των ensembles, τα μοντέλα και το εύρος αβεβαιότητας του MONO.'],
    ['Αβεβαιότητα','Το εύρος 80% συνδυάζει τη διασπορά των ensembles με το σφάλμα τεστ του MONO στον ίδιο ορίζοντα.']
  ]
},
en: {
  now:'Now', hourly:'Hourly', phen:'Weather events', radar:'Radar', models:'Models', lab:'MONO model', labShort:'MONO', stations:'Stations', climate:'Climate', earth:'Earth System', cities:'Cities', more:'More',
  workspace:'WORKSPACE', saved:'FAVOURITES', search:'Search a city, region or postcode…',
  observed:'STATION MEASUREMENT', modelNow:'MODEL ESTIMATE', feels:'Feels like', high:'High', low:'Low', rainChance:'Chance of rain', next6:'next 6 hours',
  wind:'Wind', gust:'gusts', humidity:'Humidity', dew:'dew point', pressure:'Pressure', visibility:'visibility', clouds:'Cloud',
  next24:'Next 24 hours', next48:'48 hours', next72:'72 hours', next168:'7 days', h24:'24 hours',
  chartNow:'Measurements and MONO forecast', chartNowSub:'Last 24 hours from the station, next 48 from the model', chartNowSubNoObs:'Last 24 hours (model analysis) and next 48',
  week:'Next 7 days', today:'Today', tomorrow:'Tomorrow',
  legendMono:'MONO', legendObs:'Measured', legendBand:'80% range', legendRain:'Rain (mm)', legendModels:'Individual models', legendHind:'MONO (past)',
  engine:'How this forecast was made', modelsUsed:'models in use', members:'ensemble members', systems:'systems', trainedOn:'Algorithm', station2:'Station correction',
  trainingNow:'Training on historical data…', untrained:'Not trained yet', trainFail:'Historical data did not load; using a plain average', waitModels:'Waiting for the models…',
  hourlyTitle:'Hourly forecast', hourlySub:'MONO values in local time. The range is the 80% interval.',
  time:'Time', temp:'Temp', range:'Range', rain:'Rain', amount:'Amount', windCol:'Wind', rh:'RH', exportCsv:'Export CSV', exported:'File downloaded',
  modelsTitle:'Every model', modelsSub:'Live forecasts from national weather services and AI models, plus the ensembles.',
  varTemp:'Temperature', varRain:'Rain', varWind:'Wind',
  model:'Model', type:'Type', phys:'Physics', ai:'AI', valueAt:'Value', weight:'MOS weight', skill:'Error (test)', live72:'72h error vs station', status:'Status',
  ok:'Active', noCover:'Does not cover this area', dupOf:'Same as', failed:'Failed', loading:'Loading…',
  ensTitle:'Ensembles', ensSub:'Forecast sets with perturbed starting conditions. They give the uncertainty and the event probabilities.',
  system:'System', spread:'Spread', pRain:'P(rain)', membersCol:'Members',
  labTitle:'The MONO model', labSub:'Six algorithms learn each model’s errors at your location. The best is chosen on validation data and scored on data it has never seen.',
  leadDay:'Lead', d:'D', zooTitle:'The algorithms', zooSub:'Temperature error (MAE) on the test set; lower is better',
  chosen:'in use', algo:'Algorithm', maeTest:'Test MAE', skillClim:'Skill vs climatology', maeVal:'Validation MAE', baseline:'baseline', clim:'Climatology',
  zooChart:'The algorithms for the next 72 hours', holdTemp:'Temperature error', vsMean:'vs plain average', vsBest:'Best single model',
  brier:'Rain Brier score', brierNote:'0 = perfect, lower is better', windMae:'Wind error',
  modelTable:'Models inside MOS', bias:'Bias', diurnal:'Diurnal swing', rawMae:'Error before', corMae:'Error after', samples:'Samples',
  rainBlock:'Rain: probability algorithms', pod:'Detection rate', far:'False alarms', wetHours:'Wet hours in test',
  stationBlock:'Live station correction', offset:'Mean station offset', tau:'Decay time', maeBefore:'72h error before', maeAfter:'after',
  noStation:'No METAR station found within 30 km. The forecast relies on the models alone.',
  steps:'How it works', retrain:'Retrain', period:'Period', split:'Train / validation / test', truth:'Reference truth',
  liveCheck:'Live check: last 72 hours against the station', stationOos:'MONO + station (out of sample, 24h)',
  citiesTitle:'Weather around the world', citiesSub:'Live values for preset cities; search for any other place.', all:'All', favorites:'Favourites', open:'Open',
  save:'Save', remove:'Remove', added:'Added to favourites', removed:'Removed', refresh:'Refresh',
  noData:'No data', loadFail:'Weather did not load. Check the connection and press Refresh.', retry:'Retry',
  cached:'Saved snapshot', live:'Live', updated:'Updated', geoError:'Could not get your location', myLoc:'My location', locating:'Finding your location…',
  clear:'Clear', mainly:'Mainly clear', partly:'Partly cloudy', overcast:'Overcast', fog:'Fog', drizzle:'Drizzle', rainL:'Light rain', rainM:'Rain', rainH:'Heavy rain',
  freezing:'Freezing rain', snow:'Snow', showers:'Showers', storm:'Thunderstorm', unknown:'—',
  attribution:'Data: Open-Meteo (CC BY 4.0) · NOAA · NASA GIBS · IEM · Meteostat · RainViewer · Meteoalarm · Esri',
  minutes:'min', hrs:'h', ago:'ago',
  phenTitle:'Weather events', phenSub:'Probabilities from ensemble members and models, for your area.',
  ph_rain:'Rain', ph_heavy:'Heavy rain', ph_storm:'Thunderstorm', ph_snow:'Snow', ph_fog:'Fog', ph_wind:'Gale-force gusts', ph_frost:'Frost', ph_heat:'Heatwave',
  phd_rain:'≥ 1 mm in the day', phd_heavy:'≥ 20 mm in the day', phd_storm:'CAPE with rain, or a thunderstorm code', phd_snow:'Precipitation at ≤ 0.5°C', phd_fog:'Visibility < 1 km', phd_wind:'Gusts ≥ 62 km/h (Beaufort 8)', phd_frost:'Temperature ≤ 0°C', phd_heat:'Temperature ≥ 35°C',
  rainTimeline:'When it will rain', noRain:'No rain expected in the next 72 hours.', from:'from', to:'to', upTo:'up to', alerts:'Heads-up',
  warnTitle:'Official warnings', warnNone:'No active official warnings for the country.', warnFail:'Official warnings did not load.', warnRegion:'for your region', warnCountry:'in the country',
  hourlyProb:'Hourly probabilities (72 hours)',
  space:'Space', spaceTitle:'Space weather', spaceSub:'Solar activity, geomagnetic storms, radio communications and the invisible sky.',
  environment:'Environment', envTitle:'Environment', envSub:'Air quality, allergies, pollutants, clouds, pressure and the upper atmosphere at your location.', envOpen:'Full analysis', aqi:'Air quality', pollen:'Pollen · next 24 h', sun:'Sun & Moon', sea:'Sea', daylight:'Daylight', uvMax:'Max UV',
  seaTemp:'water', waves:'Waves', illum:'illuminated', aq: ['Good','Fair','Moderate','Poor','Very poor','Extremely poor'], dust:'Dust',
  pol_birch:'Birch', pol_grass:'Grass', pol_olive:'Olive', pol_ragweed:'Ragweed', pol_alder:'Alder', pol_mugwort:'Mugwort', lvl:['Low','Moderate','High'],
  moonNames:['New moon','Waxing crescent','First quarter','Waxing gibbous','Full moon','Waning gibbous','Last quarter','Waning crescent'],
  news:'News', newsTitle:'Weather news', newsSub:'Headlines from Greek and international outlets, linking to the full article.', newsCity:'My city', newsGreece:'Greece (EL)', newsWorld:'World',
  newsLocal:'About', newsLatest:'Latest', newsEmpty:'No news', newsEmptyCity:'No recent article mentions this city. Try the Greece and World tabs.', newsFail:'The news sources did not respond. Try again shortly.', newsSources:'Sources',
  rawSynop:'Recent SYNOP reports', pwsTitle:'Personal stations (Netatmo)', pwsSub:'Home and balcony stations within ~12 km', pwsNone:'No active stations nearby.', pwsMedian:'Median temperature', pwsRain:'Stations with rain in the last hour', pwsNearest:'Nearest',
  pwsNote:'Not used for the MONO correction: they are dense but often sit in the sun or near walls. Their median is still a good read of the neighbourhood temperature.',
  stTitle:'Stations', stSub:'Live METAR (airports) and SYNOP (national weather services) observations from every station in the area.', stUse:'Use for correction', stInUse:'In use',
  stNone:'No METAR or SYNOP stations nearby, or the services did not respond.', stChart:'72 hours: station and MONO', rawMetar:'Recent METAR reports',
  climTitle:'Climate', climSub:'Many years of history: averages, records, trends and weather events by month.',
  srcStation:'Station', srcEra:'ERA5 (reanalysis)', loadOlder:'Load from 1940', loadingYears:'Loading years', stFail:'Station data did not load; showing ERA5.', years:'years',
  climograph:'Climate chart', normalTx:'Mean high', normalTn:'Mean low', normalP:'Rain (mm)', recordRange:'Record range',
  overYears:'by year', meanTemp:'Mean temperature', trendTxt:'Trend', perDecade:'per decade', total:'Monthly rain', normal:'Normal',
  records:'Records', warmest:'Warmest', coldest:'Coldest', wettest:'Wettest', driest:'Driest', hottestDay:'Highest temperature', coldestDay:'Lowest temperature', wettestDay:'Most rain in one day',
  phenDays:'Days with weather events', avgDays:'Average', lastYear:'Last year', thisYear:'This year', dShort:'d',
  cd_rain:'Rain days (≥ 1 mm)', cd_heavy:'Heavy rain (≥ 10 mm)', cd_snow:'Snow', cd_frost:'Frost (low < 0°C)', cd_summer:'Summer days (high ≥ 25°C)', cd_hot:'Heat (high ≥ 35°C)', cd_tropical:'Tropical nights (low ≥ 20°C)', cd_gale:'Gale gusts (≥ 62 km/h)', cd_storm:'Thunderstorm',
  heatmap:'Temperature anomaly by month and year', monthToDate:'This month so far', vsNormal:'vs normal',
  radarTitle:'Rain radar', radarSub:'Real radar images from the last 2 hours, with the area’s stations.', play:'Play', pause:'Pause', radarFail:'The map or the radar did not load.',
  others:'Other algorithms', finalP:'final',
  globe:'Globe', globeTitle:'Earth now', globeSub:'Real NASA satellite imagery and live city temperatures. Spin the globe; tap a city to open its forecast.',
  gSat:'Satellite (yesterday)', gMarble:'Cloud-free', gSst:'Sea temperature', gClouds:'Clouds now', gRain:'Rain (NASA IMERG)', gTemps:'City temperatures', gSpin:'Rotate',
  gSatNote:'NASA VIIRS NOAA-20, latest full day', gSstNote:'NASA GHRSST MUR sea-surface temperature', gRainNote:'NASA IMERG, last half-hour of rain (~5 h delay)',
  gCloudsNA:'“Clouds now” needs the Netlify proxy (_redirects)', gFail:'The image did not load', globeNote:'Sources: NASA GIBS · RainViewer · Open-Meteo. The globe needs WebGL.',
  satIR:'Clouds (infrared)', radarNote:'Keyless map (Esri)',
  wkTitle:'The weekend', wkNext:'Next weekend', wkThis:'This weekend', wkLong:'long range', wkClimTag:'climatology',
  wkGood:'A good weekend to be outside: dry and pleasant.', wkWet:'A wet weekend; plan something indoors.', wkBest:d => `Best day to be outside: ${d}.`,
  wkTypical:(h, l, p) => `Usually ${h} / ${l}, rain on ${p} of days`,
  holLabel:'Holidays', holTitle:'Weather on the holidays', localHol:'local', usually:'Usually', inDays:n => `in ${n} days`, holClimBtn:'See the usual weather',
  holNote:'Up to 7 days: MONO forecast. Up to 16 days: long-range forecast (less accurate). Further out: the usual weather on those days, from ERA5 since 1991.',
  plainTitle:'In plain words', tdLabel:'Practical', tdTitle:'What to do today', tdWear:'What to wear', tdMove:'Getting around', tdHome:'Home & balcony', tdHealth:'Health', tdOut:'Going out', todayL:'today', tomorrowL:'tomorrow',
  probWords:['unlikely','possible','likely','almost certain'], feelWords:['freezing','cold','cool','pleasant','warm','hot','very hot'],
  skyWords:{ storm:'Thunderstorms', snow:'Snow', rain:'A rainy day', mixed:'Changeable with possible showers', fog:'Fog', cloudy:'Cloudy', partly:'Sun and clouds', mostly:'Mostly sunny', clear:'Sunny' },
  bftWords:['calm','light air','light','light','gentle','fresh','strong','near-gale','gale','strong gale','storm','violent storm','hurricane'],
  sNow:(t, f, c) => `Now: ${t}${f ? ` (feels like ${f})` : ''}, ${c}.`,
  sRise:(mx, mn) => `It climbs to ${mx} by the afternoon${mn ? `, then drops to ${mn} overnight` : ''}.`,
  sFall:mn => `From here it cools down, reaching ${mn} overnight.`,
  sRain:(a, b, w, p, mm) => `Rain ${w} ${a}–${b} (up to ${p})${mm ? `, about ${mm} mm` : ''}.`,
  sRainLater:d => `No rain in the next 24 hours; the next rain shows up ${d}.`,
  sDry:'No rain expected in the next 24 hours.',
  sWind:(g, b, w) => `It will be windy: ${w} wind (Beaufort ${b}) with gusts up to ${g} km/h.`,
  sTomDiff:(d, up, hi) => `Tomorrow will be ${d} degrees ${up ? 'warmer' : 'colder'} (high ${hi}).`,
  sTomSame:hi => `Tomorrow is similar, with a high of ${hi}.`,
  sEvents:l => `Heads-up: ${l}.`, sWarn:e => `There is an official warning for your area: ${e}.`,
  sWeek:(wet, d, hi) => `This week: ${wet ? `rain on ${wet}` : 'no significant rain'}; warmest day: ${d} (${hi}).`, and:' and ', sDryToday:'No rain today.',
  aUmbrella:'Take an umbrella', aCoatHeavy:'Heavy coat, hat, gloves', aCoat:'Coat', aJacket:'Light jacket', aLight:'Light clothes', aHot:'Light clothes and water',
  aUV:u => `Sunscreen (UV ${u})`, aFog:'Fog: drive carefully', aWind:'Strong wind: secure loose items', aLaundryYes:'Good day to hang laundry', aLaundryNo:'Don’t hang laundry outside',
  aFrost:'Frost: protect plants and pipes', aHeat:'Heat: avoid the sun 12:00–17:00', aAir:'Poor air quality: less exercise outdoors', aWalk:w => `Best time for a walk: ${w}`,
  glossTitle:'What does this mean?', glossSub:'The app’s terms, simply',
  glossList:[
    ['Chance of rain','How likely rain is in that hour. 40% means that on 10 similar days it would rain on about 4.'],
    ['80% range','The temperature will fall inside this range 8 times out of 10. The wider it is, the less certain the forecast.'],
    ['Feels like','How warm or cold your body feels once wind, humidity and sun are counted.'],
    ['Gust','The strongest burst of wind for a few seconds; always stronger than the average wind.'],
    ['Beaufort','A 0–12 scale of mean wind speed at 10 metres above ground. Gusts are separate, brief peaks.'],
    ['Dew point','Above 18° the air feels muggy. When it nears the temperature, fog or dew forms.'],
    ['UV','Sun radiation index. From 6 use sunscreen; from 8 protect yourself even for short periods.'],
    ['Air quality (EAQI)','European index: 0–20 good, 20–40 fair, 40–60 moderate, above 60 poor.'],
    ['Weather model','A supercomputer program that solves the equations of the atmosphere. Each country has its own, so they often disagree.'],
    ['Ensemble','The same model run dozens of times from slightly different starts. If the runs agree, the forecast is confident.'],
    ['MONO','The app’s own blend: it learns each model’s mistakes at your location and corrects itself live from the nearest station.'],
    ['METAR station','An airport weather station that reports every half hour. It is a real measurement, not a forecast.']
  ],
  stepsList:[
    ['Live forecasts','Up to 35 models (global and high-resolution regional) and 8 ensembles (up to 345 members) are loaded for the point. Models outside their domain or copying another are detected and removed.'],
    ['Error history','Each model’s past forecasts for the last 8 weeks (lead 0–5 days) are downloaded and compared with the ERA5 reanalysis.'],
    ['Six algorithms','Plain average, best model, MOS with diurnal bias correction, ridge stacking, a Kalman filter and an analog ensemble are trained separately for every lead.'],
    ['Honest testing','The data are split in time 60/20/20. The algorithm, or the blend of the best three, is chosen on validation. The numbers you see come from the test set, which is used nowhere else.'],
    ['Rain','Model vote, logistic regression and analogs are compared with the Brier score. The result is blended with the share of ensemble members that give rain.'],
    ['Station','72 hours of METAR observations give the point’s steady offset and the current error, which decays exponentially with a time fitted from the autocorrelation. This is also tested out of sample.'],
    ['Weather events','Thunderstorm, snow, fog, gales, frost and heat are computed from ensemble members, the models and MONO’s uncertainty range.'],
    ['Uncertainty','The 80% range combines ensemble spread with MONO’s test error at the same lead.']
  ]
}};
/* v3.5 — detailed rain forecast + live interactive globe */
Object.assign(L.el, {
  rain:'Βροχή', rainTitle:'Πρόγνωση βροχής', rainSub:'Πότε αρχίζει, πότε σταματά, πόση θα ρίξει και πόσο σίγουρο είναι — ώρα με την ώρα.',
  rNowLabel:'Αυτή τη στιγμή', rEpisodes:'Επεισόδια βροχής · 7 ημέρες', rEpisodesSub:'Κάθε συνεχόμενο διάστημα με βροχή, με αρχή, τέλος, σύνολο και κορύφωση.',
  r15:'Επόμενες 6 ώρες ανά 15 λεπτά', r15Sub:'Λεπτομέρεια από μοντέλο υψηλής ανάλυσης (Open-Meteo, 15′). Κάθε στήλη = βροχή στο τέταρτο που τελειώνει εκείνη την ώρα.',
  r15None:'Η λεπτομέρεια ανά 15 λεπτά δεν είναι διαθέσιμη για αυτό το σημείο.', r15Dry:'Καμία βροχή τις επόμενες 6 ώρες', rHourly:'Ώρα με την ώρα · 48 ώρες', rHourlySub:'Τα ξηρά διαστήματα συμπτύσσονται. mm/ώρα = λίτρα νερό ανά τετραγωνικό μέτρο σε μία ώρα.',
  rChart:'72 ώρες με μια ματιά', rChartSub:'Στήλες: αναμενόμενα mm ανά ώρα (ανοιχτό: το υγρό σενάριο 90%). Γραμμή: πιθανότητα βροχής.',
  rDaily:'Ανά ημέρα', rDailySub:'Σύνολο ημέρας, εύρος από τα μέλη των ensembles (10%–90%) και οι πιο βροχερές ώρες.',
  rDry:'ξηρά', rProb:'πιθανότητα', rTotal:'σύνολο', rPeak:'κορύφωση', rDur:'διάρκεια', rRange:'εύρος', rStorm:'καταιγίδα', rMmH:'mm/ώρα', rOpen:'Αναλυτικά για τη βροχή',
  rWetHours:'βροχερές ώρες', rMm:'mm',
  rIntensity:['ξηρά','ψιχάλα','ασθενής βροχή','μέτρια βροχή','ισχυρή βροχή','νεροποντή','καταρρακτώδης βροχή'],
  rIntensitySnow:['ξηρά','λίγες νιφάδες','ελαφριά χιονόπτωση','χιονόπτωση','πυκνή χιονόπτωση','πολύ πυκνή χιονόπτωση','χιονοθύελλα'],
  rPlain:['','λίγες σταγόνες, μόλις βρέχει το έδαφος','ελαφριά βροχή — μια ομπρέλα αρκεί','κανονική βροχή — χωρίς ομπρέλα βρέχεσαι γρήγορα','δυνατή βροχή — λιμνούλες και νερά στους δρόμους','πολύ δυνατή βροχή — νερά στους δρόμους, οδήγησε αργά','εξαιρετικά έντονη — μακριά από ρέματα και υπόγεια'],
  rTotalWords:[[1,'ελάχιστη — ίσα που βρέχει το έδαφος'],[5,'λίγη βροχή'],[15,'αξιόλογη βροχή — μουσκεύει καλά το έδαφος'],[40,'πολλή βροχή — πιθανά νερά στους δρόμους'],[1e9,'πάρα πολλή βροχή — κίνδυνος πλημμύρας']],
  rNowRaining:(w, end) => `Βρέχει τώρα (${w}).${end ? ` Αναμένεται να σταματήσει ${end}.` : ''}`,
  rNowSoon:(inTxt, at, until) => `Δεν βρέχει τώρα. Η βροχή αρχίζει σε ${inTxt} (${at}) και κρατά μέχρι ${until}.`,
  rNowLater:(at) => `Δεν βρέχει τώρα και δεν αναμένεται βροχή τις επόμενες 24 ώρες. Η επόμενη βροχή φαίνεται ${at}.`, rAtFmt:(d, h, k) => (k === 0 ? `σήμερα στις ${h}` : k === 1 ? `αύριο στις ${h}` : `την ${d} στις ${h}`),
  rNowNone:'Δεν βρέχει και δεν φαίνεται βροχή τις επόμενες 7 ημέρες.',
  rNowObs:(st, wx) => `Ο σταθμός ${st} μετρά: ${wx}.`,
  rIn:(h, m) => (h ? `${h} ${h === 1 ? 'ώρα' : 'ώρες'}${m ? ` και ${m}′` : ''}` : `${m}′`),
  rEpisodeText:(o) => `Βροχή ${o.prob} (${o.pct}). ${o.shape} Συνολικά περίπου ${o.mm} mm${o.range ? ` (εύρος ${o.range} mm)` : ''} — ${o.totalWord}.${o.storm ? ` Πιθανότητα καταιγίδας ${o.storm}.` : ''}${o.snow ? ' Μπορεί να πέσει και χιόνι.' : ''}`,
  rShapeSteady:(w, r) => `Θα είναι κυρίως ${w} (~${r} mm/ώρα).`,
  rShapePeak:(a, w, r) => `Η πιο έντονη ώρα είναι γύρω στις ${a}: ${w}, ~${r} mm/ώρα.`,
  rMmExplain:'1 mm βροχής = 1 λίτρο νερό σε κάθε τετραγωνικό μέτρο. Σε μπαλκόνι 2 m², 5 mm είναι 10 λίτρα νερό. Πάνω από 20 mm σε μια μέρα θεωρούνται πολλά.',
  rUntil:(t) => t, rToday:'σήμερα', rTomorrow:'αύριο', rRefined:'ακριβής ώρα από 15λεπτα δεδομένα', rHourlyOnly:'ακρίβεια ώρας',
  rNoEpisodes:'Καμία βροχή στις επόμενες 7 ημέρες.', rWhatMm:'Τι σημαίνουν τα mm;', rUpdated:'Ενημέρωση',
  globeTitle:'Ζωντανή υδρόγειος', globeSub:'Πραγματικά δεδομένα: δορυφόρος NASA, ραντάρ RainViewer, βροχή IMERG και ζωντανό πλέγμα καιρού Open-Meteo. Γύρισέ τη, κάνε κλικ οπουδήποτε.',
  gRadar:'Ραντάρ βροχής', gGridL:'Πλέγμα καιρού', gTemps:'Πόλεις', gRain:'Βροχή IMERG', gVar:'Χρώμα πλέγματος', gV_temp:'Θερμοκρασία', gV_wind:'Άνεμος', gV_cloud:'Νέφωση', gV_precip:'Βροχή τώρα',
  gFresh:'Τελευταία ενημέρωση δεδομένων', gRefresh:'↻ Ανανέωση', gAuto:'αυτόματη ανανέωση κάθε 10′', gNA:'μη διαθέσιμο', gOff:'κλειστό', gDaily:'ημερήσια σύνθεση',
  gSrcSat:'Δορυφόρος VIIRS (NASA)', gSrcSst:'Θερμοκρασία θάλασσας (GHRSST)', gSrcMarble:'Blue Marble (NASA)', gSrcRadar:'Ραντάρ (RainViewer)', gSrcImerg:'Βροχή δορυφόρου (NASA IMERG)', gSrcGrid:'Πλέγμα καιρού (Open-Meteo)', gSrcCities:'Πόλεις (Open-Meteo)', gStatic:'στατική εικόνα',
  gClick:'Κάνε κλικ σε οποιοδήποτε σημείο της Γης για ζωντανό καιρό εκεί.', gProbeLoading:'Φόρτωση καιρού για το σημείο…', gOpenHere:'↗ Πρόγνωση εδώ', gNext6:'Βροχή επόμενες 6 ώρες', gWindL:'Άνεμος', gCloudL:'Νέφωση', gHumL:'Υγρασία',
  gPointAt:'Σημείο', gNoRain6:'χωρίς βροχή', gNoteFoot:'Οι χρόνοι είναι στην ώρα της συσκευής σου. Ραντάρ: μόνο όπου υπάρχει κάλυψη ραντάρ. IMERG: εκτίμηση δορυφόρου με καθυστέρηση ~4–6 ωρών. Πλέγμα: τρέχουσα ανάλυση ανά 15°.'
});
Object.assign(L.en, {
  rain:'Rain', rainTitle:'Rain forecast', rainSub:'When it starts, when it stops, how much will fall and how sure that is — hour by hour.',
  rNowLabel:'Right now', rEpisodes:'Rain episodes · 7 days', rEpisodesSub:'Each continuous spell of rain, with start, end, total and peak.',
  r15:'Next 6 hours in 15-minute steps', r15Sub:'Detail from a high-resolution model (Open-Meteo, 15′). Each column = rain in the quarter-hour ending at that time.',
  r15None:'15-minute detail is not available for this location.', r15Dry:'No rain in the next 6 hours', rHourly:'Hour by hour · 48 hours', rHourlySub:'Dry stretches are collapsed. mm/h = litres of water per square metre in one hour.',
  rChart:'72 hours at a glance', rChartSub:'Bars: expected mm per hour (light: the wet 90% scenario). Line: chance of rain.',
  rDaily:'By day', rDailySub:'Daily total, range from the ensemble members (10%–90%) and the wettest hours.',
  rDry:'dry', rProb:'chance', rTotal:'total', rPeak:'peak', rDur:'duration', rRange:'range', rStorm:'thunder', rMmH:'mm/h', rOpen:'Rain in detail',
  rWetHours:'wet hours', rMm:'mm',
  rIntensity:['dry','drizzle','light rain','moderate rain','heavy rain','downpour','torrential rain'],
  rIntensitySnow:['dry','a few flakes','light snow','snow','heavy snow','very heavy snow','blizzard'],
  rPlain:['','a few drops, barely wets the ground','light rain — an umbrella is enough','proper rain — you get wet quickly without an umbrella','heavy rain — puddles and water on the roads','very heavy rain — water on roads, drive slowly','extreme — keep away from streams and basements'],
  rTotalWords:[[1,'very little — barely wets the ground'],[5,'a little rain'],[15,'a decent amount — soaks the ground'],[40,'a lot of rain — water on roads likely'],[1e9,'a huge amount — flood risk']],
  rNowRaining:(w, end) => `It is raining now (${w}).${end ? ` Expected to stop ${end}.` : ''}`, rAtFmt:(d, h, k) => (k === 0 ? `today at ${h}` : k === 1 ? `tomorrow at ${h}` : `on ${d} at ${h}`),
  rNowSoon:(inTxt, at, until) => `Not raining now. Rain starts in ${inTxt} (${at}) and lasts until ${until}.`,
  rNowLater:(at) => `Not raining now and no rain expected in the next 24 hours. The next rain looks like ${at}.`,
  rNowNone:'Not raining, and no rain in sight for the next 7 days.',
  rNowObs:(st, wx) => `Station ${st} reports: ${wx}.`,
  rIn:(h, m) => (h ? `${h} ${h === 1 ? 'hour' : 'hours'}${m ? ` ${m}′` : ''}` : `${m}′`),
  rEpisodeText:(o) => `Rain is ${o.prob} (${o.pct}). ${o.shape} About ${o.mm} mm in total${o.range ? ` (range ${o.range} mm)` : ''} — ${o.totalWord}.${o.storm ? ` Thunderstorm chance ${o.storm}.` : ''}${o.snow ? ' Some snow is possible.' : ''}`,
  rShapeSteady:(w, r) => `Mostly ${w} (~${r} mm/h).`,
  rShapePeak:(a, w, r) => `The most intense hour is around ${a}: ${w}, ~${r} mm/h.`,
  rMmExplain:'1 mm of rain = 1 litre of water on every square metre. 20 mm in a day counts as a lot.',
  rUntil:(t) => t, rToday:'today', rTomorrow:'tomorrow', rRefined:'exact time from 15-minute data', rHourlyOnly:'hourly precision',
  rNoEpisodes:'No rain in the next 7 days.', rWhatMm:'What do the mm mean?', rUpdated:'Updated',
  globeTitle:'Live globe', globeSub:'Real data: NASA satellite, RainViewer radar, IMERG rainfall and a live Open-Meteo weather grid. Spin it, click anywhere.',
  gRadar:'Rain radar', gGridL:'Weather grid', gTemps:'Cities', gRain:'IMERG rain', gVar:'Grid colour', gV_temp:'Temperature', gV_wind:'Wind', gV_cloud:'Cloud', gV_precip:'Rain now',
  gFresh:'Data last updated', gRefresh:'↻ Refresh', gAuto:'auto-refresh every 10′', gNA:'not available', gOff:'off', gDaily:'daily composite',
  gSrcSat:'VIIRS satellite (NASA)', gSrcSst:'Sea temperature (GHRSST)', gSrcMarble:'Blue Marble (NASA)', gSrcRadar:'Radar (RainViewer)', gSrcImerg:'Satellite rainfall (NASA IMERG)', gSrcGrid:'Weather grid (Open-Meteo)', gSrcCities:'Cities (Open-Meteo)', gStatic:'static image',
  gClick:'Click anywhere on Earth for the live weather there.', gProbeLoading:'Loading weather for this point…', gOpenHere:'↗ Forecast here', gNext6:'Rain next 6 hours', gWindL:'Wind', gCloudL:'Cloud', gHumL:'Humidity',
  gPointAt:'Point', gNoRain6:'no rain', gNoteFoot:'Times are in your device’s time zone. Radar: only where radar coverage exists. IMERG: satellite estimate with ~4–6 h latency. Grid: current analysis every 15°.'
});

Object.assign(L.el,{guide:'Μια ματιά'});
Object.assign(L.en,{guide:'At a glance'});
Object.assign(L.el,{maps:'Χάρτες & τάσεις',mapsTitle:'Χάρτες & ό,τι έρχεται',mapsSub:'Δες την εξέλιξη των συστημάτων, τα σήματα κακοκαιρίας και τις τάσεις του μήνα.'});
Object.assign(L.en,{maps:'Maps & outlook',mapsTitle:'Maps & what comes next',mapsSub:'Follow weather systems, severe-weather signals and monthly trends.'});
Object.assign(L.el,{checkingStations:'Έλεγχος κοντινών σταθμών… Επιβεβαιώνεται η πηγή της θερμοκρασίας.'});
Object.assign(L.en,{checkingStations:'Checking nearby stations… Confirming the temperature source.'});

/* ------------------------------------------------------------------ state */
const $ = s => document.querySelector(s);
const optionalCache = k => ['mono31_train','mono31_snapshot','mono31_climate'].includes(k);
const cacheAllowed = () => { try {return localStorage.getItem('mono_privacy_cache') === 'yes';} catch {return false;} };
const read = (k, d) => { if (optionalCache(k) && !cacheAllowed()) return d; try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const write = (k, v) => { if (optionalCache(k) && !cacheAllowed()) return false; try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const ckey = c => `${(+c.lat).toFixed(3)},${(+c.lon).toFixed(3)}`;
const P = read(K.prefs, {}), UI = read('mono32_ui', {});
const sysDark = () => { try { return matchMedia('(prefers-color-scheme: dark)').matches; } catch { return false; } };
const state = {
  lang: P.lang === 'en' ? 'en' : 'el',
  theme: P.theme === 'dark' || P.theme === 'light' ? P.theme : (sysDark() ? 'dark' : 'light'),
  city: P.city || CITIES[0], firstRun: !P.city,
  favorites: Array.isArray(P.favorites) ? P.favorites : CITIES.slice(0, 6),
  page: (location.hash || '').slice(1) || 'now', quickScreen: 0, hours: 48, region: 'All', sel: 0, mvar: 'temp', lead: 0, stationPick: null, climMonth: new Date().getMonth() + 1, climSrc: 'station',
  gen: 0, main: null, mainErr: false, models: {}, ens: {}, obs: null, obsReady: false, train: null, trainStatus: 'idle',
  aq: null, atmosphere: null, space: null, cosmic: null, cosmicAt: 0, spaceAt: 0, spaceBusy: false, marine: null, warn: null, clim: null, view: null, fetchedAt: 0, modelsAt: 0, snapshot: false, cityLive: {}, locating: false,
  gBase: UI.gBase || 'sat', gLayers: { radar: true, rain: true, grid: true, temps: true, ...(UI.gLayers || {}) }, gSpin: true, gStatus: 'idle', gNotes: [], radarSat: !!UI.radarSat, radarBasemap: UI.radarBasemap === 'satellite' ? 'satellite' : 'street', radarForecastBase:UI.radarForecastBase==='satellite'?'satellite':'street',
  gGrid: UI.gGrid || 'temp', gSrc: {}, grid: null, gridBusy: false, probe: null, rain15: null
};
const T = k => L[state.lang][k] ?? L.el[k] ?? k;
const AN = k => ALG_NAMES[state.lang][k] || k;
const persist = () => write(K.prefs, { lang: state.lang, theme: state.theme, city: state.city, favorites: state.favorites });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const locOf = c => (c && c.i18n && c.i18n[state.lang]) || null;
const cityName = c => {
  const raw = (locOf(c) && locOf(c).name) || (state.lang === 'el' && c.nameEl ? c.nameEl : c.name);
  // Repair previously saved GPS names too; do not alter the forecast coordinates.
  return window.MONOGeo.normalizeName(raw, state.lang) || (c.gps ? T('myLoc') : (c.nameEl || c.name || T('myLoc')));
};
const adminName = c => (locOf(c) && locOf(c).admin1) || c.admin1;
const countryName = c => (locOf(c) && locOf(c).country) || (COUNTRY[c.cc] ? COUNTRY[c.cc][state.lang === 'el' ? 0 : 1] : c.country || c.cc || '');

/* ------------------------------------------------------------------ formatting */
const loc = () => (state.lang === 'el' ? 'el-GR' : 'en-GB');
const nf = {};
function num(v, d = 0) { if (!fin(v)) return '—'; const k = loc() + d; nf[k] ||= new Intl.NumberFormat(loc(), { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false }); const s = nf[k].format(v); return /^-0([.,]0+)?$/.test(s) ? s.slice(1) : s; }
const deg = v => (fin(v) ? `${num(Math.round(v))} °C` : '—');
const pct = v => (fin(v) ? `${Math.round(v * 100)}%` : '—');
const sgn = (v, d = 1) => (fin(v) ? (v > 0.0001 ? '+' : '') + num(v, d) : '—');
const tz = () => state.main?.timezone || 'UTC';
const dfc = {};
function dt(t, opts, zone = tz()) { const k = loc() + zone + JSON.stringify(opts); try { dfc[k] ||= new Intl.DateTimeFormat(loc(), { timeZone: zone, ...opts }); return dfc[k].format(new Date(t)); } catch { return '—'; } }
const hhmm = t => dt(t, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const hh = t => dt(t, { hour: '2-digit', hourCycle: 'h23' });
const pc = {};
function parts(t, zone = tz()) { pc[zone] ||= new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }); const o = {}; for (const p of pc[zone].formatToParts(new Date(t))) o[p.type] = p.value; return o; }
const localHour = (t, z) => +parts(t, z).hour;
const dayKey = (t, z) => { const o = parts(t, z); return `${o.year}-${o.month}-${o.day}`; };
const isoDate = d => new Date(Date.now() + d * 86400e3).toISOString().slice(0, 10);
const dirArrow = d => (fin(d) ? `<span class="arrow" style="transform:rotate(${Math.round(d)}deg)" aria-label="${Math.round(d)}°">↓</span>` : '');
function km(a, b) { const R = 6371, r = x => x * Math.PI / 180, dLa = r(b.lat - a.lat), dLo = r(b.lon - a.lon); const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
const ageText = t => { const m = Math.round((Date.now() - t) / 60e3); return m < 90 ? `${m} ${T('minutes')} ${T('ago')}` : `${Math.round(m / 60)} ${T('hrs')} ${T('ago')}`; };
const dayLabel = (t, i) => (i === 0 ? T('today') : i === 1 ? T('tomorrow') : dt(t, { weekday: 'short', day: 'numeric' }));

function ico(code, day = 1) {
  if (code === 0) return day ? 'sun' : 'moon'; if (code === 1 || code === 2) return day ? 'partly-day' : 'partly-night'; if (code === 3) return 'overcast';
  if (code === 45 || code === 48) return 'fog'; if ([51, 53, 55, 56, 57].includes(code)) return 'drizzle'; if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow'; if ([95, 96, 99].includes(code)) return 'storm'; return 'cloud';
}
function desc(code) {
  const m = { 0: 'clear', 1: 'mainly', 2: 'partly', 3: 'overcast', 45: 'fog', 48: 'fog', 51: 'drizzle', 53: 'drizzle', 55: 'drizzle', 56: 'freezing', 57: 'freezing', 61: 'rainL', 63: 'rainM', 65: 'rainH', 66: 'freezing', 67: 'freezing', 71: 'snow', 73: 'snow', 75: 'snow', 77: 'snow', 80: 'showers', 81: 'showers', 82: 'showers', 85: 'snow', 86: 'snow', 95: 'storm', 96: 'storm', 99: 'storm' };
  return T(m[code] || 'unknown');
}
const iconSrc = name => (window.ICONS ? window.ICONS[name] : `icons/${name}.svg`);
const icon = (code, day = 1, cls = '') => `<img class="${cls}" src="${iconSrc(ico(code, day))}" alt="${esc(desc(code))}">`;
const PH_ICON = { rain: 'rain', heavy: 'umbrella', storm: 'storm', snow: 'snow', fog: 'fog', wind: 'wind', frost: 'thermometer', heat: 'sun' };

/* ------------------------------------------------------------------ network */
const q = (base, p) => base + '?' + new URLSearchParams(p).toString();
async function getJSON(u, ms = 20000) {
  const ac = new AbortController(), timer = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(u, { signal: ac.signal });
    const body = await r.json().catch(() => null);
    if (!r.ok || body?.error) throw Object.assign(new Error(body?.reason || `HTTP ${r.status}`), { status: r.status });
    return body;
  } finally { clearTimeout(timer); }
}
async function getText(u, ms = 20000) { const ac = new AbortController(), timer = setTimeout(() => ac.abort(), ms); try { const r = await fetch(u, { signal: ac.signal }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.text(); } finally { clearTimeout(timer); } }
/* Same-origin proxy (Netlify _redirects) first, then the direct URL. */
async function viaProxy(proxyPath, direct, ms = 20000) {
  if (location.protocol.startsWith('http')) { try { const d = await getJSON(proxyPath, ms); if (d != null) return d; } catch {} }
  return getJSON(direct, ms);
}
/* Open-Meteo rejects too many simultaneous requests from one browser: run model downloads a few at a time */
function limiter(n) { let active = 0; const queue = []; const next = () => { if (active >= n || !queue.length) return; active++; const [fn, res, rej] = queue.shift(); fn().then(res, rej).finally(() => { active--; next(); }); }; return fn => new Promise((res, rej) => { queue.push([fn, res, rej]); next(); }); }
const omSlot = limiter(6);
async function chain(ids, make) {
  let last;
  for (const id of ids) { try { return { id, data: await getJSON(make(id)) }; } catch (e) { last = e; if (e.status && e.status >= 500) break; } }
  throw last || new Error('no id');
}
const OM = 'https://api.open-meteo.com/v1/forecast', ENS = 'https://ensemble-api.open-meteo.com/v1/ensemble', PREV = 'https://previous-runs-api.open-meteo.com/v1/forecast', ARCH = 'https://archive-api.open-meteo.com/v1/archive';
const ll = c => ({ latitude: (+c.lat).toFixed(4), longitude: (+c.lon).toFixed(4) });
const mainURL = c => q(OM, { ...ll(c), timezone: 'auto', timeformat: 'unixtime', past_days: 3, forecast_days: 7,
  current: 'temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl,visibility,is_day',
  hourly: 'temperature_2m,precipitation_probability,weather_code,is_day,uv_index,visibility', daily: 'sunrise,sunset,uv_index_max,daylight_duration' });
const modelURL = (c, id) => q(OM, { ...ll(c), models: id, hourly: HV, timeformat: 'unixtime', timezone: 'UTC', past_days: 3, forecast_days: 7 });
const rain15URL = c => q(OM, { ...ll(c), minutely_15: 'precipitation,rain,snowfall,weather_code', forecast_minutely_15: 96, past_minutely_15: 4, timezone: 'auto', timeformat: 'unixtime' });
const ensURL = (c, id, vars) => q(ENS, { ...ll(c), models: id, hourly: vars, timeformat: 'unixtime', timezone: 'UTC', past_days: 1, forecast_days: 7 });

/* ------------------------------------------------------------------ METAR */
function parseMetar(raw) {
  const o = { wx: [] }; if (!raw) return o;
  for (const t of raw.trim().split(/\s+/)) {
    if (/^(RMK|TEMPO|BECMG|NOSIG)$/.test(t)) break;
    let m;
    if ((m = t.match(/^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS|KMH)$/))) { const f = m[4] === 'KT' ? 1.852 : m[4] === 'MPS' ? 3.6 : 1; o.wdir = m[1] === 'VRB' ? null : +m[1]; o.wspd = +m[2] * f; o.wgst = m[3] ? +m[3] * f : null; }
    else if ((m = t.match(/^(M?\d{2})\/(M?\d{2})?$/))) { const v = s => (s ? (s[0] === 'M' ? -(+s.slice(1)) : +s) : null); o.temp = v(m[1]); o.dewp = v(m[2]); }
    else if ((m = t.match(/^Q(\d{4})$/))) o.pres = +m[1];
    else if ((m = t.match(/^A(\d{4})$/))) o.pres = +m[1] / 100 * 33.8639;
    else if (t === 'CAVOK') { o.vis = 10; o.cloud = 0; }
    else if ((m = t.match(/^(\d{4})$/)) && o.wspd !== undefined && o.vis === undefined) o.vis = Math.min(10, +m[1] / 1000);
    else if ((m = t.match(/^(FEW|SCT|BKN|OVC|VV)(\d{3})/))) o.cloud = Math.max(o.cloud || 0, { FEW: 20, SCT: 45, BKN: 75, OVC: 100, VV: 100 }[m[1]]);
    else if (/^(NSC|SKC|CLR|NCD)$/.test(t)) o.cloud = o.cloud || 0;
    else if (/^(\+|-|VC)?(MI|PR|BC|DR|BL|SH|TS|FZ)?(DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|HZ|FU|DU|SA|SQ)+$/.test(t) || t === 'TS' || t === 'VCTS') o.wx.push(t);
  }
  return o;
}
function metarCode(o) {
  const w = (o.wx || []).join(' ');
  if (/TS/.test(w)) return 95;
  if (/SN|SG|PL/.test(w)) return /SH/.test(w) ? 85 : /\+/.test(w) ? 75 : 71;
  if (/FZ(RA|DZ)/.test(w)) return 66;
  if (/RA/.test(w)) return /SH/.test(w) ? (/\+/.test(w) ? 82 : 80) : /\+/.test(w) ? 65 : /-/.test(w) ? 61 : 63;
  if (/DZ/.test(w)) return 53;
  if (/FG/.test(w)) return 45;
  if (!fin(o.cloud)) return null;
  return o.cloud < 15 ? 0 : o.cloud < 45 ? 1 : o.cloud < 80 ? 2 : 3;
}
function wxText(o) {
  const el = state.lang === 'el';
  const map = el ? { TS: 'καταιγίδα', RA: 'βροχή', DZ: 'ψιχάλα', SN: 'χιόνι', SG: 'χιονόκοκκοι', PL: 'χαλαζόνερο', GR: 'χαλάζι', GS: 'χιονόνερο', BR: 'αχλή', FG: 'ομίχλη', HZ: 'καταχνιά', FU: 'καπνός', DU: 'σκόνη', SA: 'άμμος', SQ: 'μπουρίνι', SH: 'μπόρες', FZ: 'παγωμένη', VC: 'κοντά', BC: 'θύλακες', MI: 'αβαθής', BL: 'σαρωτικό', DR: 'χαμηλό', PR: 'μερική', IC: 'παγοκρύσταλλοι', UP: 'άγνωστος υετός' }
    : { TS: 'thunderstorm', RA: 'rain', DZ: 'drizzle', SN: 'snow', SG: 'snow grains', PL: 'ice pellets', GR: 'hail', GS: 'small hail', BR: 'mist', FG: 'fog', HZ: 'haze', FU: 'smoke', DU: 'dust', SA: 'sand', SQ: 'squall', SH: 'showers', FZ: 'freezing', VC: 'nearby', BC: 'patches', MI: 'shallow', BL: 'blowing', DR: 'low drifting', PR: 'partial', IC: 'ice crystals', UP: 'unknown precipitation' };
  return (o.wx || []).map(w => { const int = w[0] === '+' ? (el ? 'ισχυρή ' : 'heavy ') : w[0] === '-' ? (el ? 'ασθενής ' : 'light ') : ''; return int + (w.replace(/^[+-]/, '').match(/VC|MI|PR|BC|DR|BL|SH|TS|FZ|DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|HZ|FU|DU|SA|SQ/g) || []).map(x => map[x] || x).join(' '); }).join(', ');
}
function group(list, c) {
  const by = {};
  for (const o of list) if (o && o.id && fin(o.t)) (by[o.id] ||= { id: o.id, name: o.name, lat: o.lat, lon: o.lon, elev: o.elev, list: [] }).list.push(o);
  return Object.values(by).filter(s => fin(s.lat) && s.list.some(x => fin(x.temp)))
    .map(s => { s.list.sort((a, b) => a.t - b.t); return { ...s, dist: km(c, s), last: s.list.filter(x => fin(x.temp)).at(-1) }; }).sort((a, b) => a.dist - b.dist);
}
async function fetchObs(c) {
  const nn = v => (v === null || v === undefined || v === '' || !fin(+v) ? null : +v);
  try {
    const box = [c.lat - 0.9, c.lon - 1.2, c.lat + 0.9, c.lon + 1.2].map(v => v.toFixed(3)).join(',');
    const qs = new URLSearchParams({ bbox: box, format: 'json', hours: 72 }).toString();
    const d = await viaProxy('/proxy/awc/api/data/metar?' + qs, 'https://aviationweather.gov/api/data/metar?' + qs, 15000);
    const list = (Array.isArray(d) ? d : []).map(r => {
      const p = parseMetar(r.rawOb);
      return { id: r.icaoId, name: r.name, lat: +r.lat, lon: +r.lon, elev: nn(r.elev), t: r.obsTime ? r.obsTime * 1000 : Date.parse(r.reportTime),
        temp: nn(r.temp) ?? p.temp, dewp: nn(r.dewp) ?? p.dewp, wspd: nn(r.wspd) != null ? r.wspd * 1.852 : p.wspd, wgst: nn(r.wgst) != null ? r.wgst * 1.852 : p.wgst ?? null,
        wdir: nn(r.wdir) ?? p.wdir, pres: nn(r.altim) ?? p.pres, vis: p.vis, cloud: p.cloud, wx: p.wx, raw: r.rawOb };
    });
    const st = group(list, c);
    if (st.length) return { stations: st, source: 'NOAA Aviation Weather Center' };
  } catch {}
  // Fallback: Iowa Environmental Mesonet global METAR archive (nearest 4 stations)
  if (!c.cc || c.cc === 'US') throw new Error('no obs');
  const g = await getJSON(`https://mesonet.agron.iastate.edu/geojson/network/${c.cc}__ASOS.geojson`, 15000);
  const near = (g.features || []).map(f => ({ id: f.properties?.sid || f.id, name: f.properties?.sname, lon: f.geometry?.coordinates?.[0], lat: f.geometry?.coordinates?.[1], elev: f.properties?.elevation }))
    .filter(s => fin(s.lat)).map(s => ({ ...s, dist: km(c, s) })).filter(s => s.dist <= 120).sort((a, b) => a.dist - b.dist).slice(0, 4);
  if (!near.length) throw new Error('no station');
  const a = new Date(Date.now() - 73 * 3600e3), b = new Date(Date.now() + 3600e3);
  const params = new URLSearchParams({ data: 'metar', tz: 'Etc/UTC', format: 'onlycomma', latlon: 'no',
    year1: a.getUTCFullYear(), month1: a.getUTCMonth() + 1, day1: a.getUTCDate(), hour1: a.getUTCHours(), minute1: 0,
    year2: b.getUTCFullYear(), month2: b.getUTCMonth() + 1, day2: b.getUTCDate(), hour2: b.getUTCHours(), minute2: 0 });
  near.forEach(s => params.append('station', s.id));
  const csv = await getText('https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?' + params.toString(), 20000);
  const byId = Object.fromEntries(near.map(s => [s.id, s]));
  const list = csv.split('\n').slice(1).map(line => {
    const i1 = line.indexOf(','), i2 = line.indexOf(',', i1 + 1); if (i2 < 0) return null;
    const s = byId[line.slice(0, i1)] || near[0];
    const t = Date.parse(line.slice(i1 + 1, i2).replace(' ', 'T') + 'Z'), raw = line.slice(i2 + 1), p = parseMetar(raw);
    return { id: s.id, name: s.name, lat: s.lat, lon: s.lon, elev: s.elev, t, raw, ...p };
  }).filter(Boolean);
  const st = group(list, c);
  if (!st.length) throw new Error('no obs');
  return { stations: st, source: 'Iowa Environmental Mesonet' };
}

/* ------------------------------------------------------------------ SYNOP (WMO / national services) + personal stations */
async function fetchSynop(c) {
  const d = await getJSON(q('/api/synop', { lat: (+c.lat).toFixed(2), lon: (+c.lon).toFixed(2) }), 25000);
  const here = { lat: c.lat, lon: c.lon };
  return (d.stations || []).map(s => ({ ...s, list: s.list.map(o => ({ ...o, id: s.id })), dist: km(here, s), src: 'synop', srcName: 'WMO SYNOP · OGIMET' }))
    .map(s => ({ ...s, last: s.list.filter(x => fin(x.temp)).at(-1) })).filter(s => s.last);
}
async function fetchAllObs(c) {
  const [m, y] = await Promise.allSettled([fetchObs(c), location.protocol.startsWith('http') ? fetchSynop(c) : Promise.reject(new Error('file'))]);
  const metar = m.status === 'fulfilled' ? m.value.stations.map(s => ({ ...s, src: 'metar', srcName: m.value.source })) : [];
  // Keep METAR's frequent weather reports, BUT attach SYNOP gauge totals from the
  // same physical airport. Previously duplicate removal silently erased real rain.
  const synop = [];
  if(y.status === 'fulfilled')for(const s of y.value){
    const same=metar.find(x=>km(x,s)<3||(s.icao&&x.id===s.icao));
    if(same){
      same.rainReports=(s.list||[]).filter(o=>fin(o.prcp)&&fin(o.prcpH)&&o.prcpH>0);
      same.rainSource='WMO SYNOP · OGIMET';
      same.synopId=s.id;
    }else synop.push(s);
  }
  const stations = [...metar, ...synop].sort((a, b) => a.dist - b.dist);
  if (!stations.length) throw new Error('no obs');
  const source = [metar.length ? m.value.source : '', synop.length ? 'WMO SYNOP (OGIMET)' : ''].filter(Boolean).join(' + ');
  return { stations, source, counts: { metar: metar.length, synop: synop.length } };
}
async function fetchNetatmo(c) {
  const d = await getJSON(q('/api/netatmo', { lat: (+c.lat).toFixed(3), lon: (+c.lon).toFixed(3) }), 20000);
  const st = (d.stations || []).filter(s => fin(s.temp));
  const near = st.filter(s => s.dist <= 5), pool = near.length >= 5 ? near : st;
  const med = a => { const v = a.filter(fin).sort((x, y) => x - y); return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null; };
  return { stations: st, n: st.length, nNear: near.length, temp: med(pool.map(s => s.temp)), rh: med(pool.map(s => s.rh)), rain1h: med(st.filter(s => fin(s.rain1h)).map(s => s.rain1h)),
    nRain: st.filter(s => fin(s.rain1h)).length, wet: st.filter(s => s.rain1h > 0.1).length, at: Date.now() };
}

/* ------------------------------------------------------------------ extras: air, sea, warnings, place names */
const fetchAir = c => getJSON(q('https://air-quality-api.open-meteo.com/v1/air-quality', { ...ll(c), timezone: 'auto', timeformat: 'unixtime', forecast_days: 4,
  current: MonoEnvironment.CURRENT, hourly: MonoEnvironment.HOURLY }));
const fetchAtmosphere = c => viaProxy(q('/api/atmosphere', { lat: (+c.lat).toFixed(4), lon: (+c.lon).toFixed(4) }), q(OM, { ...ll(c), models: 'gfs_global', timezone: 'auto', timeformat: 'unixtime', past_days: 1, forecast_days: 3, hourly: MonoAtmosphere.HOURLY }), 12000);
async function loadSpace(force = false) {
  if (state.spaceBusy || (!force && Date.now() - state.spaceAt < REFRESH_LIVE)) return;
  state.spaceBusy = true;
  try { state.space = await getJSON('/api/space-weather', 12000).catch(() => MonoSpaceWeather.fetchDirect()); }
  catch { state.space = { error: true }; }
  finally { state.spaceAt = Date.now(); state.spaceBusy = false; schedule(); }
}
async function loadCosmic(force = false) {
  if (state.cosmicBusy || (!force && Date.now()-state.cosmicAt < 600000)) return;
  state.cosmicBusy = true;
  try { state.cosmic = await getJSON('/api/cosmic-events', 12000); } catch { state.cosmic = {error:true}; }
  finally { state.cosmicAt = Date.now(); state.cosmicBusy = false; schedule(); }
}
function skyOptions() { return {lang:state.lang, zone:state.view?.zone || state.main?.timezone || 'UTC', lat:+state.city.lat, lon:+state.city.lon, city:cityName(state.city), rows:state.view?.rows || []}; }
async function fetchMarine(c) {
  const d = await getJSON(q('https://marine-api.open-meteo.com/v1/marine', { ...ll(c), timezone: 'auto', timeformat: 'unixtime', current: 'wave_height,wave_direction,wave_period,sea_surface_temperature' }));
  if (!fin(d?.current?.sea_surface_temperature) && !fin(d?.current?.wave_height)) throw new Error('inland');
  return d;
}
async function fetchWarnings(c) {
  const slug = METEOALARM[c.cc]; if (!slug) throw new Error('no feed');
  const d = await viaProxy(`/proxy/meteoalarm/api/v1/warnings/feeds-${slug}`, `https://feeds.meteoalarm.org/api/v1/warnings/feeds-${slug}`, 20000);
  const now = Date.now(), out = [];
  for (const w of d.warnings || []) {
    const infos = w.alert?.info || []; if (!infos.length) continue;
    const info = infos.find(i => (i.language || '').toLowerCase().startsWith(state.lang)) || infos.find(i => (i.language || '').startsWith('en')) || infos[0];
    const exp = Date.parse(info.expires), on = Date.parse(info.onset || info.effective);
    if (fin(exp) && exp < now) continue;
    const level = (info.parameter || []).find(p => p.valueName === 'awareness_level')?.value || '';
    const kind = (info.parameter || []).find(p => p.valueName === 'awareness_type')?.value || '';
    const color = /red/i.test(level) ? 'red' : /orange/i.test(level) ? 'orange' : /yellow/i.test(level) ? 'yellow' : 'green';
    if (color === 'green') continue;
    out.push({ event: info.event || info.headline, headline: info.headline, onset: on, expires: exp, color, kind: kind.split(';')[1]?.trim() || '', areas: (info.area || []).map(a => a.areaDesc).filter(Boolean) });
  }
  const rank = { red: 3, orange: 2, yellow: 1 }, region = (c.admin1 || '').toLowerCase();
  out.forEach(w => { w.local = !!region && w.areas.some(a => a.toLowerCase().includes(region) || region.includes(a.toLowerCase())); });
  return out.sort((a, b) => (b.local - a.local) || (rank[b.color] - rank[a.color]) || (a.onset - b.onset));
}
async function reverseName(lat, lon, lang = state.lang) {
  try {
    const d = await getJSON(q('https://api.bigdatacloud.net/data/reverse-geocode-client', {
      latitude: lat, longitude: lon, localityLanguage: lang
    }), 8000);
    // Prefer the suburb/neighbourhood, not the broader city or neighbouring municipality.
    return window.MONOGeo.reverseName(d, lang);
  } catch { return null; }
}

/* ------------------------------------------------------------------ localized place names
   Every place keeps a small cache c.i18n = { el: {name, admin1, country}, en: {...} }.
   When the language changes, missing entries are fetched once and stored with the place. */
const BUILTIN_KEYS = new Set(CITIES.map(c => ckey(c)));
async function placeIn(c, lang) {
  try {
    if (c.gpsApprox) return { name: lang === 'el' ? 'Προσεγγιστική θέση' : 'Approximate location' };
    if (c.geoId) {
      const d = await getJSON(q('https://geocoding-api.open-meteo.com/v1/get', { id: c.geoId, language: lang, format: 'json' }), 8000);
      if (d && d.name) return { name: d.name, admin1: d.admin1, country: d.country };
    }
    if (!c.gps) {
      const names = [...new Set([c.name, c.nameEl].filter(Boolean))];
      for (const nm of names) {
        const d = await getJSON(q('https://geocoding-api.open-meteo.com/v1/search', { name: nm, count: 10, language: lang, format: 'json' }), 8000);
        const k = Math.cos(c.lat * Math.PI / 180);
        const best = (d.results || []).map(r => [r, Math.hypot(r.latitude - c.lat, (r.longitude - c.lon) * k)]).sort((a, b) => a[1] - b[1])[0];
        if (best && best[1] < 0.3) { const r = best[0]; return { name: r.name, admin1: r.admin1, country: r.country, geoId: r.id }; }
      }
    }
    const n = await reverseName(c.lat, c.lon, lang);
    if (n && n.name) return { name: n.name, admin1: n.admin1, country: n.country };
  } catch {}
  return null;
}
let localizing = null;
async function localizePlaces() {
  const lang = state.lang;
  const groups = new Map();
  [state.city, ...(state.favorites || [])].filter(Boolean).forEach(c => {
    if (c.i18n && c.i18n[lang]) return;
    const k = ckey(c); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c);
  });
  if (!groups.size) return;
  const job = localizing = Promise.all([...groups.values()].map(async list => {
    const p = await placeIn(list[0], lang);
    if (!p) return false;
    const geoId = p.geoId; delete p.geoId;
    if (BUILTIN_KEYS.has(ckey(list[0]))) delete p.name;          // keep the curated city names
    list.forEach(c => { if (geoId && !c.geoId) c.geoId = geoId; c.i18n = Object.assign({}, c.i18n, { [lang]: p }); });
    return true;
  }));
  const done = await job;
  if (done.some(Boolean)) { persist(); if (lang === state.lang) render(); }
}

/* ------------------------------------------------------------------ loading */
function align(srcTimes, arr, idx) { const out = new Array(idx.size).fill(null); if (!arr) return out; srcTimes.forEach((t, i) => { const j = idx.get(t * 1000); if (j !== undefined && arr[i] != null) out[j] = arr[i]; }); return out; }

async function loadAll(force = false) {
  loadSpace(force);
  loadCosmic(force);
  const c = state.city, gen = ++state.gen;
  if(state.sharedRainCity !== ckey(c)) state.sharedRain = null;
  state.sharedRainCity = ckey(c);
  state.mainErr = false; render();
  try {
    const d = await getJSON(mainURL(c));
    if (gen !== state.gen) return;
    state.main = d; state.fetchedAt = Date.now(); state.snapshot = false;
  } catch {
    if (gen !== state.gen) return;
    if (!state.main) { const snap = read(K.snap, {})[ckey(c)]; if (snap) { state.view = snap.view; state.main = snap.main; state.snapshot = true; } else state.mainErr = true; }
    state.obsReady = true; // A saved snapshot may be shown only with its saved-source label.
    render(); toast(T('loadFail')); return;
  }
  recompute(); render();
  const jobs = [], modelJobs = [];
  if (force || Date.now() - state.modelsAt > REFRESH_MODELS || !Object.keys(state.models).length) {
    state.modelsAt = Date.now();
    const inBox = m => !m.box || (c.lat >= m.box[0] && c.lat <= m.box[1] && c.lon >= m.box[2] && c.lon <= m.box[3]);
    MODELS.filter(m => !inBox(m)).forEach(m => { state.models[m.id] = { outside: true }; });
    modelJobs.push(...MODELS.filter(inBox).map(m => omSlot(() => chain([m.id, ...m.alt], id => modelURL(c, id)))
      .then(r => { if (gen === state.gen) { state.models[m.id] = { data: r.data, used: r.id }; schedule(); } })
      .catch(e => { if (gen === state.gen) { state.models[m.id] = /no data/i.test(e?.message || '') ? { outside: true } : { error: true }; schedule(); } })));
    jobs.push(...ENSEMBLES.map(e => chain([e.id, ...e.alt], id => ensURL(c, id, EV_FULL)).catch(() => chain([e.id, ...e.alt], id => ensURL(c, id, EV_BASE)))
      .then(r => { if (gen === state.gen) { state.ens[e.id] = { data: r.data, used: r.id }; schedule(); } })
      .catch(() => { if (gen === state.gen) { state.ens[e.id] = { error: true }; schedule(); } })));
  }
  jobs.push(getJSON(rain15URL(c)).then(d => { if (gen === state.gen) { state.rain15 = d?.minutely_15?.time ? { t: d.minutely_15.time.map(x => x * 1000), p: d.minutely_15.precipitation, s: d.minutely_15.snowfall, code: d.minutely_15.weather_code, at: Date.now() } : null; schedule(); } }).catch(() => { if (gen === state.gen) state.rain15 = null; }));
  jobs.push(fetchAllObs(c).then(o => { if (gen === state.gen) { state.obs = o; state.obsReady = true; schedule(); } }).catch(() => { if (gen === state.gen) { state.obs = { error: true }; state.obsReady = true; schedule(); } }));
  if (location.protocol.startsWith('http')) jobs.push(fetchNetatmo(c).then(d => { if (gen === state.gen) { state.pws = d; schedule(); } }).catch(() => { if (gen === state.gen) state.pws = { off: true }; }));
  jobs.push(getJSON(longURL(c)).then(d => { if (gen === state.gen) { state.long = d; schedule(); } }).catch(() => {}));
  jobs.push(fetchHolidays(c).then(h => { if (gen === state.gen) { state.hol = h; schedule(); } }).catch(() => {}));
  if (!state.clim) { const cc = read(K.clim, {})[ckey(c)]; if (cc?.dayNormals) state.clim = { ...cc, loading: false }; }
  jobs.push(fetchAir(c).then(d => { if (gen === state.gen) { state.aq = d; schedule(); } }).catch(() => { if (gen === state.gen) { state.aq = { error: true }; schedule(); } }));
  jobs.push(fetchAtmosphere(c).then(d => { if (gen === state.gen) { state.atmosphere = d; schedule(); } }).catch(() => { if (gen === state.gen) { state.atmosphere = { error: true }; schedule(); } }));
  jobs.push(fetchMarine(c).then(d => { if (gen === state.gen) { state.marine = d; schedule(); } }).catch(() => { if (gen === state.gen) state.marine = { error: true }; }));
  jobs.push(fetchWarnings(c).then(d => { if (gen === state.gen) { state.warn = d; schedule(); } }).catch(() => { if (gen === state.gen) { state.warn = { error: true }; schedule(); } }));
  // Optional city-level calibration in shared Vercel Blob, independent of this device.
  jobs.push(getJSON(q('/api/rain-memory', {lat:(+c.lat).toFixed(3),lon:(+c.lon).toFixed(3)}), 30000)
    .then(d => { if(gen===state.gen) {state.sharedRain=d?.available?d:null; recompute(); schedule();} })
    .catch(() => { if(gen===state.gen) state.sharedRain=null; }));
  if (modelJobs.length) Promise.allSettled(modelJobs).then(() => { if (gen === state.gen) { recompute(); ensureTraining(c, gen); } });
  await Promise.allSettled([...jobs, ...modelJobs]);
  if (gen !== state.gen) return;
  recompute(); render(); saveSnapshot();
}
let pending = 0;
function schedule() { clearTimeout(pending); pending = setTimeout(() => { recompute(); render(); }, 250); }

let worker = null, workerOk = true, jobId = 0;
function runTraining(payload) {
  return new Promise((resolve, reject) => {
    const inline = () => setTimeout(() => { try { resolve({ temp: M.fitVariable(payload.temp), wind: M.fitVariable(payload.wind, { nonNegative: true }), precip: M.fitRain(payload.precip), cloud: M.fitVariable(payload.cloud) }); } catch (e) { reject(e); } }, 30);
    if (!workerOk || typeof Worker === 'undefined' || location.protocol === 'file:' || window.ICONS) return inline();
    try {
      worker ||= new Worker('trainer.js');
      const id = ++jobId;
      const on = e => { if (e.data.id !== id) return; worker.removeEventListener('message', on); e.data.ok ? resolve(e.data) : reject(new Error(e.data.error)); };
      worker.addEventListener('message', on);
      worker.onerror = () => { workerOk = false; worker = null; inline(); };
      worker.postMessage({ id, ...payload });
    } catch { workerOk = false; inline(); }
  });
}
async function ensureTraining(c, gen, force = false) {
  const all = read(K.train, {}), hit = all[ckey(c)];
  if (!force && hit && Date.now() - hit.at < TRAIN_TTL && hit.v === VERSION) { state.train = hit; state.trainStatus = 'done'; schedule(); return; }
  const active = state.view?.active || [];
  if (!active.length) { state.trainStatus = 'error'; schedule(); return; }
  state.trainStatus = 'loading'; state.train = hit && hit.v === VERSION ? hit : null; schedule();
  try {
    const start = isoDate(-62), end = isoDate(-6), zone = state.main?.timezone || 'UTC';
    const vars = k => (k === 0 ? ['temperature_2m', 'precipitation', 'wind_speed_10m', 'cloud_cover'] : [`temperature_2m_previous_day${k}`, `precipitation_previous_day${k}`, `wind_speed_10m_previous_day${k}`, `cloud_cover_previous_day${k}`]);
    const full = M.LEADS.flatMap(vars).join(','), noCloud = M.LEADS.flatMap(k => vars(k).slice(0,3)).join(','), tOnly = M.LEADS.map(k => vars(k)[0]).join(',');
    const base = { ...ll(c), start_date: start, end_date: end, timeformat: 'unixtime', timezone: 'UTC' };
    const truthP = getJSON(q(ARCH, { ...base, hourly: 'temperature_2m,precipitation,wind_speed_10m,cloud_cover' }), 40000);
    const ms = MODELS.filter(m => active.includes(m.id));
    const runs = await Promise.allSettled(ms.map(m => { const used = state.models[m.id]?.used || m.id; return chain([used], id => q(PREV, { ...base, models: id, hourly: full })).catch(() => chain([used], id => q(PREV, { ...base, models: id, hourly: noCloud }))).catch(() => chain([used], id => q(PREV, { ...base, models: id, hourly: tOnly }))); }));
    const truth = await truthP;
    if (gen !== state.gen) return;
    const times = truth.hourly.time.map(s => s * 1000), idx = new Map(times.map((t, i) => [t, i]));
    const hours = times.map(t => localHour(t, zone));
    const sets = { temp: {}, precip: {}, wind: {}, cloud: {} }; let used = 0;
    runs.forEach((r, j) => {
      if (r.status !== 'fulfilled') return;
      const h = r.value.data.hourly, id = ms[j].id; let any = false;
      for (const [key, v] of [['temp', 'temperature_2m'], ['precip', 'precipitation'], ['wind', 'wind_speed_10m'], ['cloud', 'cloud_cover']]) {
        const byK = {};
        for (const k of M.LEADS) { const name = k === 0 ? v : `${v}_previous_day${k}`; if (!h[name]) continue; const a = align(h.time, h[name], idx); if (a.filter(fin).length >= 120) { byK[k] = a; any = true; } }
        if (Object.keys(byK).length) sets[key][id] = byK;
      }
      if (any) used++;
    });
    const data = (key, tv) => ({ times, hours, truth: tv, models: sets[key] });
    const res = await runTraining({ temp: data('temp', truth.hourly.temperature_2m), wind: data('wind', truth.hourly.wind_speed_10m), precip: data('precip', truth.hourly.precipitation), cloud: data('cloud', truth.hourly.cloud_cover) });
    if (gen !== state.gen) return;
    if (!Object.keys(res.temp.leads).length) throw new Error('nothing to train');
    const rec = { v: VERSION, at: Date.now(), start, end, hours: times.length, models: used, temp: res.temp, wind: res.wind, precip: res.precip, cloud: res.cloud };
    state.train = rec; state.trainStatus = 'done';
    const keep = Object.entries({ ...all, [ckey(c)]: rec }).sort((a, b) => b[1].at - a[1].at).slice(0, 3);
    if (!write(K.train, Object.fromEntries(keep))) write(K.train, { [ckey(c)]: rec });
  } catch (e) {
    if (gen !== state.gen) return;
    state.trainStatus = state.train ? 'done' : 'error';
  }
  schedule();
}

/* ------------------------------------------------------------------ the forecast */
function recompute() {
  const W = state.main; if (!W?.hourly?.time) return;
  const zone = W.timezone || 'UTC', now = Date.now();
  const times = W.hourly.time.map(s => s * 1000), N = times.length, idx = new Map(times.map((t, i) => [t, i]));
  const hours = times.map(t => localHour(t, zone));
  let iNow = 0; for (let i = 0; i < N; i++) if (times[i] <= now) iNow = i;

  const md = {};
  for (const m of MODELS) {
    const r = state.models[m.id]; if (r?.outside) { md[m.id] = { nocover: true }; continue; } if (!r?.data?.hourly) continue;
    const h = r.data.hourly, a = {};
    for (const v of HV.split(',')) a[v] = align(h.time, h[v], idx);
    if (a.temperature_2m.slice(iNow).filter(fin).length < 24) { md[m.id] = { nocover: true }; continue; }
    md[m.id] = a;
  }
  const order = MODELS.map(m => m.id).filter(id => md[id] && !md[id].nocover);
  const dup = M.findDuplicates(Object.fromEntries(order.map(id => [id, md[id].temperature_2m.slice(iNow)])), order);
  const active = order.filter(id => !dup[id]);

  // ensembles: members of one system share index j across variables
  const fams = [], famInfo = {};
  for (const e of ENSEMBLES) {
    const r = state.ens[e.id]; if (!r?.data?.hourly) continue;
    const h = r.data.hourly;
    const grab = v => Object.keys(h).filter(k => k === v || k.startsWith(v + '_member')).sort().map(k => align(h.time, h[k], idx));
    const t = grab('temperature_2m'), ok = a => (a.filter(x => x.some(fin)).length >= 3 ? a : null);
    if (!ok(t)) { famInfo[e.id] = { nocover: true }; continue; }
    const f = { id: e.id, members: t, P: ok(grab('precipitation')), G: ok(grab('wind_gusts_10m')), S: ok(grab('snowfall')), CAPE: ok(grab('cape')) };
    fams.push(f);
    famInfo[e.id] = { members: t.length, vars: [f.G && 'gusts', f.CAPE && 'CAPE', f.S && 'snow'].filter(Boolean) };
  }
  const famT = fams.map(f => ({ id: f.id, members: f.members }));
  const famP = fams.filter(f => f.P).map(f => ({ id: f.id, members: f.P, T: f.members, S: f.S, CAPE: f.CAPE }));
  const famG = fams.filter(f => f.G).map(f => ({ id: f.id, members: f.G }));

  const tr = state.train;
  const leadOf = t => (t <= now ? 0 : Math.min(5, Math.floor((t - now) / 86400e3)));
  const vals = (v, i) => { const o = {}; if (i < 0 || i >= N) return o; for (const id of active) { const x = md[id][v][i]; if (fin(x)) o[id] = x; } return o; };
  const meanAt = (v, i) => M.mean(Object.values(vals(v, i)));
  const out = [];
  for (let i = 0; i < N; i++) {
    const t = times[i], k = leadOf(t), H = hours[i];
    const vt = vals('temperature_2m', i), n = Object.keys(vt).length;
    const rowT = { H, vals: vt, mean: M.mean(Object.values(vt)) }; rowT.prev = meanAt('temperature_2m', i - 1) ?? rowT.mean; rowT.next = meanAt('temperature_2m', i + 1) ?? rowT.mean;
    const vw = vals('wind_speed_10m', i), rowW = { H, vals: vw, mean: M.mean(Object.values(vw)) }; rowW.prev = meanAt('wind_speed_10m', i - 1) ?? rowW.mean; rowW.next = meanAt('wind_speed_10m', i + 1) ?? rowW.mean;
    const vc = vals('cloud_cover', i), rowC = { H, vals: vc, mean: M.mean(Object.values(vc)) };
    rowC.prev = meanAt('cloud_cover', i - 1) ?? rowC.mean;
    rowC.next = meanAt('cloud_cover', i + 1) ?? rowC.mean;
    const pc = Object.keys(vc).length ? M.predictVariable(tr?.cloud, k, rowC) : { value: null, choice: 'none' };
    const pt = n ? M.predictVariable(tr?.temp, k, rowT) : { value: W.hourly.temperature_2m?.[i] ?? null, choice: 'none', methods: {} };
    const pw = Object.keys(vw).length ? M.predictVariable(tr?.wind, k, rowW, { nonNegative: true }) : { value: null };
    const pr = n ? M.predictRain(tr?.precip, k, vals('precipitation', i), H) : { prob: fin(W.hourly.precipitation_probability?.[i]) ? W.hourly.precipitation_probability[i] / 100 : null, amount: null };
    const app = M.mean(Object.values(vals('apparent_temperature', i)));
    const gustRaw = M.mean(Object.values(vals('wind_gusts_10m', i))), windRaw = rowW.mean;
    let u = 0, v = 0, nd = 0;
    for (const [id, d] of Object.entries(vals('wind_direction_10m', i))) { const s = md[id].wind_speed_10m[i] || 1; u += s * Math.sin(d * Math.PI / 180); v += s * Math.cos(d * Math.PI / 180); nd++; }
    const temp = pt.value;
    out.push({ t, i, H, k, temp, choice: pt.choice, methods: pt.methods, rawMean: rowT.mean, nModels: n,
      feels: fin(app) && fin(rowT.mean) && fin(temp) ? app + (temp - rowT.mean) : app,
      wind: pw.value, gust: fin(gustRaw) && fin(windRaw) && windRaw > 0.5 && fin(pw.value) ? gustRaw * pw.value / windRaw : gustRaw,
      dir: nd ? (Math.atan2(u, v) * 180 / Math.PI + 360) % 360 : null,
      rh: M.mean(Object.values(vals('relative_humidity_2m', i))), cloud: fin(pc.value) ? M.clamp(pc.value + (!tr?.cloud?.leads?.[k] && fin(state.sharedRain?.cloud?.bias) ? state.sharedRain.cloud.bias : 0), 0, 100) : rowC.mean, cloudChoice: pc.choice, pres: M.mean(Object.values(vals('pressure_msl', i))),
      pMono: pr.prob, rainChoice: pr.choice, amount: fin(pr.amount) && !tr?.precip?.leads?.[k] && fin(state.sharedRain?.rain?.scale) ? Math.max(0,pr.amount*state.sharedRain.rain.scale) : pr.amount, codes: Object.values(vals('weather_code', i)),
      isDay: W.hourly.is_day?.[i] ?? 1, uv: W.hourly.uv_index?.[i], visMain: W.hourly.visibility?.[i],
      vi: { cape: vals('cape', i), prec: vals('precipitation', i), snowf: vals('snowfall', i), vis: vals('visibility', i), gust: vals('wind_gusts_10m', i), code: vals('weather_code', i) },
      models: Object.fromEntries(order.map(id => [id, { T: md[id].temperature_2m[i], P: md[id].precipitation[i], W: md[id].wind_speed_10m[i] }]))
    });
  }

  // ---- station layer
  const ob = state.obs && !state.obs.error ? state.obs : null;
  const stations = ob?.stations || [];
  const pick = stations.find(s => s.id === state.stationPick) || stations.find(s => s.list.length >= 6) || stations[0];
  const station = pick ? { ...pick, source: pick.srcName || ob.source } : null;
  const obsAt = new Array(N).fill(null), obsRow = new Array(N).fill(null);
  if (station) for (const o of station.list) {
    if (!fin(o.temp)) continue;
    const j = Math.round(o.t / 3600e3) * 3600e3, i = idx.get(j);
    if (i === undefined || Math.abs(o.t - j) > 35 * 60e3) continue;
    if (!obsRow[i] || Math.abs(o.t - j) < Math.abs(obsRow[i].t - j)) { obsRow[i] = o; obsAt[i] = o.temp; }
  }
  const useStation = !!station && station.dist <= 30;
  const S = useStation ? M.fitStation({ times, hours, model: out.map(r => r.temp), obs: obsAt }, now) : null;
  for (const r of out) { r.tempModel = r.temp; if (S && fin(r.temp)) r.temp += M.stationCorrection(S, r.t, r.H); r.obs = obsAt[r.i]; }

  // ---- ensembles → band, probabilities, weather events
  const share = (o, f) => { const v = Object.values(o).filter(fin); return v.length ? v.filter(f).length / v.length : null; };
  for (const r of out) {
    const i = r.i;
    const et = M.ensembleStats(famT, i), ep = M.ensembleStats(famP, i);
    const Lt = M.leadFit(tr?.temp, r.k), sHist = Lt ? Lt.sigma : 1.3 + 0.35 * r.k, sEns = et ? et.sd : null;
    const sigma = Math.max(0.5, fin(sEns) ? Math.sqrt(0.5 * sEns ** 2 + 0.5 * sHist ** 2) : sHist);
    r.lo = fin(r.temp) ? r.temp - 1.2816 * sigma : null; r.hi = fin(r.temp) ? r.temp + 1.2816 * sigma : null;
    r.ens = et; r.pEns = ep ? ep.pWet : null; r.mmLo = ep ? ep.q10 : null; r.mmHi = ep ? ep.q90 : null;
    r.pop = fin(r.pMono) && fin(r.pEns) ? 0.5 * r.pMono + 0.5 * r.pEns : fin(r.pMono) ? r.pMono : r.pEns;
    if (fin(r.amount) && fin(r.pop) && r.pop < 0.15) r.amount = Math.min(r.amount, 0.1);
    const eStorm = M.ensembleProb(famP.filter(f => f.CAPE), (m, j, f) => { const p = m[i], c = f.CAPE[j]?.[i]; return fin(p) && fin(c) ? c >= 400 && p >= 0.5 : null; });
    const capeIds = Object.keys(r.vi.cape).filter(id => fin(r.vi.prec[id]));
    const dCape = capeIds.length ? capeIds.filter(id => r.vi.cape[id] >= 500 && r.vi.prec[id] >= 0.5).length / capeIds.length : null;
    r.pStorm = M.mean([eStorm, dCape, share(r.vi.code, x => x >= 95)].filter(fin)) ?? 0;
    const eSnow = M.ensembleProb(famP, (m, j, f) => { const s = f.S?.[j]?.[i]; if (fin(s)) return s >= 0.1; const p = m[i], tt = f.T?.[j]?.[i]; return fin(p) && fin(tt) ? p >= 0.2 && tt <= 0.5 : null; });
    r.pSnow = M.mean([eSnow, share(r.vi.snowf, x => x >= 0.1)].filter(fin)) ?? 0;
    r.pFog = M.mean([share(r.vi.vis, x => x < 1000), share(r.vi.code, x => x === 45 || x === 48), fin(r.visMain) ? (r.visMain < 1000 ? 1 : 0) : null].filter(fin)) ?? 0;
    const eGust = M.ensembleProb(famG, m => (fin(m[i]) ? m[i] >= 62 : null)), dGust = share(r.vi.gust, x => x >= 62);
    r.pWind = fin(eGust) ? 0.6 * eGust + 0.4 * (dGust ?? eGust) : dGust ?? 0;
    r.pHeavy = M.ensembleProb(famP, m => (fin(m[i]) ? m[i] >= 4 : null)) ?? share(r.vi.prec, x => x >= 4) ?? 0;
    r.pFrost = fin(r.temp) ? M.ncdf((0 - r.temp) / sigma) : 0;
    r.pHeat = fin(r.temp) ? 1 - M.ncdf((35 - r.temp) / sigma) : 0;
    r.code = M.synthCode({ temp: r.temp, prob: r.pop ?? 0, amount: r.amount ?? 0, cloud: r.cloud, codes: r.codes, pStorm: r.pStorm, pSnow: r.pSnow, pFog: r.pFog });
    if (!r.nModels && fin(W.hourly.weather_code?.[i])) r.code = W.hourly.weather_code[i];
    delete r.vi;
  }

  // ---- days
  const days = [], byDay = new Map();
  out.forEach(r => { const d = dayKey(r.t, zone); if (!byDay.has(d)) { byDay.set(d, []); days.push(d); } byDay.get(d).push(r); });
  const todayKey = dayKey(now, zone);
  const daily = days.filter(d => d >= todayKey).slice(0, 7).map(d => {
    const rows = byDay.get(d), fut = rows.filter(r => r.t >= now - 3600e3);
    const temps = rows.map(r => (r.t < now - 3600e3 ? (fin(r.obs) ? r.obs : r.tempModel) : r.temp)).filter(fin);
    const idxs = rows.map(r => r.i), ensDay = M.ensembleDailyWet(famP, idxs);
    const ps = fut.map(r => r.pMono).filter(fin);
    const det = ps.length ? 1 - ps.reduce((a, p) => a * (1 - p), 1) ** (1 / 3) : null;
    const pop = fin(ensDay) && fin(det) ? 0.6 * ensDay + 0.4 * det : fin(ensDay) ? ensDay : det;
    const wettest = fut.reduce((a, r) => (!a || (r.amount ?? 0) > (a.amount ?? 0) ? r : a), null);
    const noon = rows.find(r => r.H === 13) || rows[Math.floor(rows.length / 2)];
    const mx = f => (fut.length ? Math.max(0, ...fut.map(f).filter(fin)) : 0);
    const heavy = M.ensembleDailyWet(famP, idxs, 20);
    return { key: d, t: noon.t, cloud: (() => { const all = rows.filter(r => fin(r.cloud)), day = all.filter(r => r.isDay); const s = day.length ? day : all; return s.length ? s.reduce((a, r) => a + r.cloud, 0) / s.length : null; })(), hi: temps.length ? Math.max(...temps) : null, lo: temps.length ? Math.min(...temps) : null, pop,
      mm: fut.reduce((a, r) => a + (fin(r.amount) ? r.amount : 0), 0), code: pop >= 0.5 && wettest ? wettest.code : noon.code,
      ev: { rain: pop, heavy: fin(heavy) ? heavy : mx(r => r.pHeavy), storm: mx(r => r.pStorm), snow: mx(r => r.pSnow), fog: mx(r => r.pFog), wind: mx(r => r.pWind), frost: mx(r => r.pFrost), heat: mx(r => r.pHeat) } };
  });

  // ---- rain periods in the next 72 h
  const periods = []; let cp = null;
  for (const r of out.slice(iNow, iNow + 72)) {
    if ((r.pop ?? 0) < 0.4) continue;
    if (cp && r.t - cp.end <= 3 * 3600e3) { cp.end = r.t; cp.max = Math.max(cp.max, r.pop); cp.mm += r.amount || 0; }
    else { cp = { start: r.t, end: r.t, max: r.pop, mm: r.amount || 0 }; periods.push(cp); }
  }

  // ---- live check against the station
  const live = {};
  if (station) {
    const pastRows = out.filter(r => r.t <= now && fin(r.obs));
    for (const id of order) { const e = pastRows.map(r => md[id].temperature_2m[r.i] - r.obs).filter(fin); if (e.length >= 12) live[id] = { mae: M.mean(e.map(Math.abs)), bias: M.mean(e), n: e.length }; }
    const em = pastRows.map(r => r.tempModel - r.obs).filter(fin), ea = pastRows.map(r => r.rawMean - r.obs).filter(fin);
    if (em.length >= 12) live.__mono = { mae: M.mean(em.map(Math.abs)), bias: M.mean(em), n: em.length };
    if (ea.length >= 12) live.__mean = { mae: M.mean(ea.map(Math.abs)), bias: M.mean(ea), n: ea.length };
    if (useStation && pastRows.length >= 36) {
      const cutT = now - 24 * 3600e3;
      const S2 = M.fitStation({ times, hours, model: out.map(r => r.tempModel), obs: obsAt.map((v, i) => (times[i] <= cutT ? v : null)) }, cutT);
      const e2 = S2 ? pastRows.filter(r => r.t > cutT).map(r => r.tempModel + M.stationCorrection(S2, r.t, r.H) - r.obs).filter(fin) : [];
      if (e2.length >= 12) live.__station = { mae: M.mean(e2.map(Math.abs)), bias: M.mean(e2), n: e2.length };
    }
  }

  // ---- current conditions
  const lastObs = station?.last, fresh = lastObs && now - lastObs.t < 80 * 60e3 && useStation;
  const cur = W.current || {}, nowRow = out[iNow];
  const current = fresh ? {
    source: 'obs', t: lastObs.t, temp: lastObs.temp, rh: M.rhFromDew(lastObs.temp, lastObs.dewp), dew: lastObs.dewp, wind: lastObs.wspd, gust: lastObs.wgst, dir: lastObs.wdir,
    pres: lastObs.pres, vis: lastObs.vis, code: metarCode(lastObs) ?? nowRow?.code ?? cur.weather_code, raw: lastObs.raw, wx: wxText(lastObs),
    feels: fin(cur.apparent_temperature) && fin(cur.temperature_2m) ? cur.apparent_temperature + (lastObs.temp - cur.temperature_2m) : null
  } : {
    source: 'model', t: cur.time * 1000, temp: cur.temperature_2m, rh: cur.relative_humidity_2m, dew: cur.dew_point_2m, wind: cur.wind_speed_10m, gust: cur.wind_gusts_10m,
    dir: cur.wind_direction_10m, pres: cur.pressure_msl, vis: fin(cur.visibility) ? cur.visibility / 1000 : null, code: cur.weather_code, feels: cur.apparent_temperature
  };
  current.isDay = cur.is_day ?? nowRow?.isDay ?? 1;

  state.view = { times, rows: out, iNow, daily, periods, current, md, order, active, dup, famInfo, famCount: fams.length, famP,
    members: famT.reduce((a, f) => a + f.members.length, 0), S, station, stations, useStation, live, zone, at: now };
}

function saveSnapshot() {
  if (!state.view || !state.main || !state.obsReady) return;
  const V = state.view;
  const v = { ...V, md: {}, live: {}, famP: [], stations: [], station: V.station ? { ...V.station, list: V.station.list.slice(-6) } : null,
    rows: V.rows.map(r => ({ ...r, models: {}, codes: [], ens: null, methods: {} })) };
  const all = read(K.snap, {});
  all[ckey(state.city)] = { at: Date.now(), view: v, main: { timezone: state.main.timezone, hourly: { time: state.main.hourly.time }, current: state.main.current, daily: state.main.daily } };
  write(K.snap, Object.fromEntries(Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, 3)));
}

/* ------------------------------------------------------------------ charts */
function chart({ rows, series = [], band, points, bars, nowT, unit = '°', h = 240, xLabel }) {
  const narrow = window.innerWidth < 640, W = narrow ? 400 : 720, H = narrow ? Math.round(h * 0.8) : h, l = narrow ? 30 : 40, r = 10, top = 14, bot = 28;
  if (!rows?.length) return `<div class="placeholder">${T('noData')}</div>`;
  const vals = [];
  series.forEach(s => s.vals.forEach(v => fin(v) && vals.push(v)));
  if (band) { band.lo.forEach(v => fin(v) && vals.push(v)); band.hi.forEach(v => fin(v) && vals.push(v)); }
  if (points) points.forEach(v => fin(v) && vals.push(v));
  if (bars && unit === 'mm') { bars.forEach(v => fin(v) && vals.push(v)); vals.push(0); }
  if (!vals.length && !bars) return `<div class="placeholder">${T('noData')}</div>`;
  if (!vals.length) vals.push(0, 1);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const span = Math.max(hi - lo, unit === '°' ? 4 : 1), st = niceStep(span / 4);
  lo = Math.floor((lo - span * 0.06) / st) * st; hi = Math.ceil((hi + span * 0.06) / st) * st;
  if (unit !== '°') lo = Math.max(0, lo);
  if (unit === '%') { lo = 0; hi = 100; }
  const stp = unit === '%' ? 25 : st;
  const n = rows.length, x = i => l + (W - l - r) * i / Math.max(1, n - 1), y = v => top + (H - top - bot) * (hi - v) / (hi - lo || 1);
  const path = a => { let d = '', pen = false; a.forEach((v, i) => { if (fin(v)) { d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; } else pen = false; }); return d; };
  let g = '';
  for (let v = lo; v <= hi + 1e-9; v += stp) g += `<line class="chart-grid" x1="${l}" x2="${W - r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="chart-axis" x="${l - 6}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end">${num(v, stp < 1 ? 1 : 0)}${unit === '°' ? ' °C' : unit === '%' ? '%' : ''}</text>`;
  if (bars) {
    const bm = Math.max(2, ...bars.filter(fin)), bh = (H - top - bot) * (unit === 'mm' ? 0.9 : 0.32), bw = Math.max(1.5, (W - l - r) / n * 0.62);
    const yb = unit === 'mm' ? (v => y(v)) : null;
    bars.forEach((v, i) => { if (fin(v) && v >= 0.05) { const top2 = Math.min(H - bot, Math.max(top, yb ? yb(v) : H - bot - bh * Math.min(1, v / bm))); g += `<rect class="chart-bar" x="${(x(i) - bw / 2).toFixed(1)}" y="${top2.toFixed(1)}" width="${bw.toFixed(1)}" height="${(H - bot - top2).toFixed(1)}" rx="1"/>`; } });
  }
  if (band) {
    let d = ''; const segs = []; let cur = [];
    rows.forEach((_, i) => { if (fin(band.lo[i]) && fin(band.hi[i])) cur.push(i); else if (cur.length) { segs.push(cur); cur = []; } }); if (cur.length) segs.push(cur);
    for (const s of segs) d += 'M' + s.map(i => `${x(i).toFixed(1)},${y(band.hi[i]).toFixed(1)}`).join('L') + 'L' + s.slice().reverse().map(i => `${x(i).toFixed(1)},${y(band.lo[i]).toFixed(1)}`).join('L') + 'Z';
    g += `<path class="chart-band" d="${d}"/>`;
  }
  if (fin(nowT)) { const i = rows.findIndex(rw => rw.t > nowT); if (i > 0) { const xi = x(i - 1 + (nowT - rows[i - 1].t) / (rows[i].t - rows[i - 1].t)); g += `<line class="chart-now" x1="${xi.toFixed(1)}" x2="${xi.toFixed(1)}" y1="${top}" y2="${H - bot}"/><text class="chart-axis strong" x="${(xi + 4).toFixed(1)}" y="${top + 9}">${state.lang === 'el' ? 'ΤΩΡΑ' : 'NOW'}</text>`; } }
  for (const s of series) g += `<path class="chart-line ${s.cls || ''}" d="${path(s.vals)}"/>`;
  if (points) points.forEach((v, i) => { if (fin(v)) g += `<circle class="chart-obs" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${n > 60 ? 2.4 : 3}"/>`; });
  const every = Math.max(1, Math.round(n / (narrow ? 4 : 6))), multi = rows.at(-1).t - rows[0].t > 80 * 3600e3;
  for (let i = 0; i < n; i += every) g += `<text class="chart-axis" x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${xLabel ? esc(xLabel(rows[i], i)) : multi ? esc(dt(rows[i].t, { weekday: 'short', day: 'numeric' })) : hh(rows[i].t) + ':00'}</text>`;
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" style="aspect-ratio:${W}/${H}" role="img">${g}</svg>`;
}
function niceStep(s) { const p = 10 ** Math.floor(Math.log10(s)), f = s / p; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p; }
const legend = items => `<div class="legend">${items.map(([cls, label]) => `<span><i class="lg ${cls}"></i>${label}</span>`).join('')}</div>`;

/* ------------------------------------------------------------------ shared UI */
const btn = (action, label, extra = '') => `<button class="outline-btn" data-action="${action}" ${extra}>${label}</button>`;
const favBtn = (c, short) => { const f = state.favorites.some(x => ckey(x) === ckey(c)); return `<button class="${short ? 'starbtn' : 'pill-btn'}" data-action="fav" data-id="${ckey(c)}" aria-label="${T(f ? 'remove' : 'save')}">${f ? '★' : '☆'}${short ? '' : ' ' + T(f ? 'remove' : 'save')}</button>`; };
const header = (title, sub, actions = '') => `<div class="topline"><div><p class="eyebrow">MONO / ${esc(cityName(state.city))}</p><h1 class="display-title">${title}</h1><p class="subtitle">${sub}</p></div><div class="actions">${actions}</div></div>`;
const mini = (label, value, note, asset) => `<div class="card mini"><div class="minihead"><span class="label">${label}</span>${asset ? `<img src="${iconSrc(asset)}" alt="">` : ''}</div><div><div class="minivalue">${value}</div><div class="mininote">${note}</div></div></div>`;
const loadingCard = txt => `<div class="card placeholder"><b><span class="spin">◌</span> ${txt || T('loading')}</b></div>`;
const errorCard = () => `<div class="card placeholder"><b>${T('noData')}</b>${T('loadFail')}<div class="spacer10"></div>${btn('reload', T('retry'))}</div>`;
const probCls = p => (p >= 0.6 ? 'p-hi' : p >= 0.3 ? 'p-mid' : p >= 0.1 ? 'p-lo' : 'p-0');

/* ------------------------------------------------------------------ page: now */
function nowPage() {
  const c = state.city, V = state.view;
  const head = header(esc(cityName(c)), esc([adminName(c), countryName(c)].filter(Boolean).join(' · ')), `${favBtn(c)}${btn('reload', '↻ ' + T('refresh'))}`);
  if (!V) return head + (state.mainErr ? errorCard() : loadingCard(state.locating ? T('locating') : ''));
  // Do not flash the raw model temperature and then silently replace it with a station observation.
  if (!state.obsReady && !state.snapshot) return head + loadingCard(T('checkingStations'));
  const cur = V.current, rows = V.rows, iN = V.iNow, today = V.daily[0];
  const pop6 = Math.max(0, ...rows.slice(iN + 1, iN + 7).map(r => r.pop ?? 0));
  const src = cur.source === 'obs' ? `${T('observed')} · ${esc(V.station.id)} · ${num(V.station.dist)} km · ${hhmm(cur.t)}` : `${T('modelNow')} · ${hhmm(cur.t)}`;
  const nearbyReport=window.MONORainIntelligence?.present(V.stations,state.pws);
  const conditionBase=cur.wx ? esc(cur.wx[0].toUpperCase() + cur.wx.slice(1)) : desc(cur.code ?? rows[iN]?.code);
  // Observed precipitation in the hero is always attributed to a fresh nearby station.
  // An unverified model weather code is identified as a model estimate instead.
  const condition=nearbyReport?.kind==='rain'
    ? (state.lang==='el'?'Βρέχει στον σταθμό ':'Raining at station ')+esc(nearbyReport.name)
    :nearbyReport?.kind==='snow'
      ? (state.lang==='el'?'Χιονίζει στον σταθμό ':'Snowing at station ')+esc(nearbyReport.name)
      :conditionBase+(cur.source==='model'?' · '+T('modelNow'):'');
  const weatherSource=nearbyReport?.kind==='rain'||nearbyReport?.kind==='snow'
    ? '<div class="hero-station-report">📍 '+num(nearbyReport.dist,1)+' km · '+hhmm(nearbyReport.t)+' · '+esc(nearbyReport.src||'')+'</div>' : '';
  const hero = `<article class="card hero"><div class="hero-header"><div><div class="hero-place">${esc(cityName(c))}</div><div class="hero-country">${esc(dt(Date.now(), { weekday: 'long', day: 'numeric', month: 'long' }))} · ${hhmm(Date.now())}</div></div>${icon(cur.code ?? rows[iN]?.code ?? 3, cur.isDay, 'hero-icon')}</div>
    <div class="temperature" aria-label="${fin(cur.temp) ? num(Math.round(cur.temp)) + ' °C' : '—'}">${fin(cur.temp) ? num(Math.round(cur.temp)) : '—'}<span class="temp-unit">°C</span></div>
    <div class="hero-bottom"><div><div class="condition">${condition}</div>${weatherSource}<div class="mininote">${T('feels')} ${deg(cur.feels)} · ${T('high')} ${deg(today?.hi)} · ${T('low')} ${deg(today?.lo)}</div></div><span class="sourcemark ${cur.source === 'obs' ? 'live' : ''}">${src}</span></div></article>`;
  const minis = `<div class="mini-grid">
    ${mini(T('rainChance'), pct(pop6), T('next6') + (today?.mm >= 0.1 ? ` · ${num(today.mm, 1)} mm ${T('today').toLowerCase()}` : ''), 'umbrella')}
    ${mini(T('wind'), `${num(cur.wind)} <small>km/h</small> ${dirArrow(cur.dir)}${fin(cur.wind) ? `<span class="wind-beaufort" title="${state.lang === 'el' ? 'Κλίμακα Μποφόρ για μέση ταχύτητα ανέμου' : 'Beaufort scale for mean wind speed'}">${windBft(cur.wind)}</span>` : ''}`, fin(cur.gust) ? `${T('gust')} ${num(cur.gust)} km/h` : '&nbsp;', 'wind')}
    ${mini(T('humidity'), `${num(cur.rh)}%`, `${T('dew')} ${deg(cur.dew)} · ☁ ${ccTxt(rows[iN]?.cloud)}`, 'humidity')}
    ${mini(T('pressure'), `${num(cur.pres)} <small>hPa</small>`, fin(cur.vis) ? `${T('visibility')} ${num(cur.vis, cur.vis < 10 ? 1 : 0)} km` : '&nbsp;', 'pressure')}</div>`;
  const win = rows.slice(Math.max(0, iN - 24), iN + 49), past = r => r.t <= Date.now();
  const ch = chart({ rows: win, band: { lo: win.map(r => (past(r) ? null : r.lo)), hi: win.map(r => (past(r) ? null : r.hi)) },
    series: [{ vals: win.map(r => (past(r) ? r.tempModel : null)), cls: 'hind' }, { vals: win.map((r, j) => (!past(r) || (win[j + 1] && !past(win[j + 1])) ? r.temp : null)), cls: 'mono' }],
    points: win.map(r => r.obs), bars: win.map(r => (past(r) ? null : r.amount)), nowT: Date.now() });
  return head + warningsBanner() + `<div class="hero-grid">${hero}${minis}</div>${rainNowCard(true)}${alertsStrip()}${summaryCard()}${MonoForecast.compact(forecastOptions())}${MonoSky.render({...skyOptions(),compact:true})}${todoCard()}${weekendCard()}
    <section class="section"><div class="sectionhead"><div><h2 class="h2">${T('next24')}</h2><div class="section-sub">${esc(rainSentence())}</div></div>${btn('goto', '↗ ' + T('hourly'), 'data-page="hourly"')}</div>${hoursStrip(rows.slice(iN, iN + 25), cur)}</section>
    <section class="section card"><div class="panelhead"><div><b>${T('chartNow')}</b><div class="section-sub">${V.useStation ? T('chartNowSub') : T('chartNowSubNoObs')}</div></div></div>${ch}
      ${legend([['mono', T('legendMono')], ['band', T('legendBand')], ...(V.useStation ? [['obs', T('legendObs')]] : []), ['hind', T('legendHind')], ['bar', T('legendRain')]])}</section>
    <section class="section dual"><div class="card"><div class="panelhead"><b>${T('week')}</b>${btn('goto', '↗ ' + T('phen'), 'data-page="phen"')}</div>${dailyRows(V.daily)}</div>
      <div class="card">${engineSummary()}</div></section>${newsCard()}${holidaysCard()}${environment()}${glossary()}`;
}
function ccTxt(c) { return Number.isFinite(c) ? Math.round(c) + '%' : '—'; } function hoursStrip(rows, cur) {
  return `<div class="scroll-hours">${rows.map((r, j) => `<div class="hourcard ${j === 0 ? 'active' : ''}"><span class="hourtime">${j === 0 ? T('now') : hh(r.t) + ':00'}</span>${icon(j === 0 && cur && fin(cur.code) ? cur.code : r.code, j === 0 && cur ? cur.isDay : r.isDay)}<span class="hourtemp">${deg(j === 0 && cur && fin(cur.temp) ? cur.temp : r.temp)}</span><span class="hoursub">☂ ${pct(r.pop)}</span><span class="hoursub cc" title="${T('clouds')}">☁ ${ccTxt(r.cloud)}</span>${(r.amount ?? 0) >= 0.1 ? `<span class="hoursub rn-hmm">${mm1(r.amount)} mm</span>` : ''}</div>`).join('')}</div>`;
}
function dailyRows(d) {
  if (!d?.length) return `<p class="muted">—</p>`;
  const lo = Math.min(...d.map(x => x.lo)), hi = Math.max(...d.map(x => x.hi)), sp = Math.max(1, hi - lo);
  return d.map((x, i) => `<div class="dailyrow"><strong>${esc(dayLabel(x.t, i))}</strong>${icon(x.code, 1)}<div class="dailybar"><span style="left:${(100 * (x.lo - lo) / sp).toFixed(1)}%;width:${Math.max(4, 100 * (x.hi - x.lo) / sp).toFixed(1)}%"></span></div><div class="dailytemps"><span class="min">${deg(x.lo)}</span><span>${deg(x.hi)}</span></div><div class="dailycc" title="${T('clouds')}">☁ ${ccTxt(x.cloud)}</div><div class="dailywet">☂ ${pct(x.pop)}${x.mm >= 0.1 ? ` · ${num(x.mm, 1)}mm` : ''}</div></div>`).join('');
}
function periodText(p) {
  const V = state.view, lab = t => { const i = V.daily.findIndex(d => d.key === dayKey(t, V.zone)); return i >= 0 ? dayLabel(t, i) : dt(t, { weekday: 'short' }); };
  const e = p.end + 3600e3;
  return `${lab(p.start)} ${hhmm(p.start)} → ${lab(e) === lab(p.start) ? '' : lab(e) + ' '}${hhmm(e)}`;
}
function rainSentence() {
  const e = rainEpisodes(72)[0];
  return e ? `${T('ph_rain')}: ${rWhen(e.start)} → ${rWhen(e.end)} · ${T('upTo')} ${pct(e.pmax)} · ~${mm1(e.mm)} mm · ${rWord(e.peakRate, rIsSnow(e.peak))}` : T('noRain');
}
function alertsStrip() {
  const V = state.view, items = [];
  V.daily.slice(0, 2).forEach((d, i) => { for (const [k, p] of Object.entries(d.ev)) if (k !== 'rain' && p >= 0.3) items.push({ k, p, i, t: d.t }); });
  if (!items.length) return '';
  items.sort((a, b) => b.p - a.p);
  return `<section class="section alerts"><span class="label">${T('alerts')}</span>${items.slice(0, 5).map(a => `<button class="alertchip ${probCls(a.p)}" data-action="goto" data-page="phen"><img src="${iconSrc(PH_ICON[a.k])}" alt=""><b>${T('ph_' + a.k)}</b><span>${esc(dayLabel(a.t, a.i))} · ${pct(a.p)}</span></button>`).join('')}</section>`;
}
const wdt = t => dt(t, { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function warningsBanner() {
  const w = state.warn; if (!Array.isArray(w) || !w.length) return '';
  const local = w.filter(x => x.local), show = (local.length ? local : w).slice(0, 2);
  return `<div class="warnbanner">${show.map(x => `<button class="warn ${x.color}" data-action="goto" data-page="phen"><span class="wdot"></span><b>${esc(x.event)}</b><span>${esc(x.areas.slice(0, 2).join(', '))} · ${esc(wdt(x.onset))} → ${esc(wdt(x.expires))}</span></button>`).join('')}</div>`;
}
function engineSummary() {
  const V = state.view, L0 = state.train?.temp?.leads?.[0];
  const trainTxt = state.trainStatus === 'loading' ? `<span class="spin">◌</span> ${T('trainingNow')}` : state.trainStatus === 'error' ? T('trainFail') : state.trainStatus === 'idle' ? T('waitModels')
    : L0 ? `${esc(AN(L0.choice))} · MAE <b>${num(L0.test[L0.choice]?.mae, 2)}°</b> (${T('vsMean')} ${num(L0.test.mean?.mae, 2)}°)` : T('untrained');
  const st = V.useStation && V.S ? `${esc(V.station.id)} · ${num(V.station.dist)} km · ${T('offset')} ${sgn(V.S.coef[0] * V.S.shrink)}° · τ ${num(V.S.tau, 1)} h` : V.station ? `${esc(V.station.id)} · ${num(V.station.dist)} km` : T('noStation');
  return `<div class="panelhead"><b>${T('engine')}</b>${btn('goto', '↗ ' + T('labShort'), 'data-page="lab"')}</div>
   <div class="engine"><div><span class="label">${T('models')}</span><b>${V.active.length}</b><small>${T('modelsUsed')} / ${MODELS.length}</small></div>
   <div><span class="label">Ensembles</span><b>${num(V.members)}</b><small>${T('members')} · ${V.famCount} ${T('systems')}</small></div>
   <div class="wide"><span class="label">${T('trainedOn')}</span><p>${trainTxt}</p></div>
   <div class="wide"><span class="label">${T('station2')}</span><p>${st}</p></div></div>`;
}
function environment(full = false) {
  const V = state.view, W = state.main, cards = [];
  if (!full) {
    const A = MonoEnvironment.snapshot(state.aq), B = MonoAtmosphere.snapshot(state.atmosphere), band = MonoEnvironment.band(A.value('european_aqi'));
    const pollen = A.pollen.filter(p => p.max !== null).sort((a, b) => b.level - a.level || b.max - a.max).slice(0, 3);
    cards.push(`<div class="card env"><span class="label">${T('aqi')}</span><div class="minivalue">${num(A.value('european_aqi'))} <small>EAQI</small></div><div class="mininote">${band === null ? T('noData') : T('aq')[band]}</div><div class="kvs"><span>CO₂ <b>${num(A.value('carbon_dioxide'))} ppm</b></span><span>PM2.5 <b>${num(A.value('pm2_5'), 1)} μg/m³</b></span></div><small class="env-meta">CAMS · ${T('modelNow')}</small></div>`);
    cards.push(`<div class="card env"><span class="label">${T('pollen')}</span><div class="env-summary-pollen">${pollen.map(p => `<span>${T('pol_' + p.key)} <b class="lv${p.level}">${T('lvl')[p.level]} · ${num(p.max, 1)}</b></span>`).join('') || T('noData')}</div><small class="env-meta">${state.lang === 'el' ? 'Μέγιστη συγκέντρωση · κόκκοι/m³. Όλα τα είδη στην πλήρη ανάλυση.' : 'Peak concentration · grains/m³. All species in the full analysis.'}</small></div>`);
    cards.push(`<div class="card env"><span class="label">${state.lang === 'el' ? 'Σύννεφα & πίεση' : 'Clouds & pressure'}</span><div class="minivalue">${num(B.value('cloud_cover'))}<small>%</small></div><div class="kvs"><span>${T('pressure')} <b>${num(B.value('pressure_msl'), 1)} hPa</b></span><span>Δ 3h <b>${num(B.delta, 1)} hPa</b></span></div><small class="env-meta">NOAA GFS · ${T('modelNow')}</small></div>`);
    cards.push(MonoSpaceWeather.miniCard(state.space, { lang: state.lang }));
  }
  const D = W?.daily;
  if (D?.time?.length) {
    const i = D.time.findIndex(t => dayKey(t * 1000 + 12 * 3600e3, V.zone) === dayKey(Date.now(), V.zone)), j = i >= 0 ? i : 0;
    const sr = D.sunrise?.[j] * 1000, ss = D.sunset?.[j] * 1000, dl = D.daylight_duration?.[j];
    const ph = M.moonPhase(Date.now()), illum = (1 - Math.cos(2 * Math.PI * ph)) / 2, name = T('moonNames')[Math.round(ph * 8) % 8];
    cards.push(`<div class="card env"><div class="minihead"><span class="label">${T('sun')}</span><img src="${iconSrc('sunrise')}" alt=""></div><div class="minivalue">${fin(sr) ? hhmm(sr) : '—'} <small>→ ${fin(ss) ? hhmm(ss) : '—'}</small></div><div class="mininote">${T('daylight')} ${fin(dl) ? `${Math.floor(dl / 3600)}h ${Math.round(dl % 3600 / 60)}′` : '—'} · ${T('uvMax')} ${num(D.uv_index_max?.[j], 1)}</div>
      <div class="moonrow"><span class="moon" style="--lit:${(ph < 0.5 ? 1 : -1) * Math.round(illum * 100)}"></span><div><b>${esc(name)}</b><small>${pct(illum)} ${T('illum')}</small></div></div></div>`);
  }
  const mr = state.marine && !state.marine.error ? state.marine.current : null;
  if (mr) cards.push(`<div class="card env"><div class="minihead"><span class="label">${T('sea')}</span><img src="${iconSrc('humidity')}" alt=""></div><div class="minivalue">${deg(mr.sea_surface_temperature)} <small>${T('seaTemp')}</small></div><div class="mininote">${T('waves')} ${num(mr.wave_height, 1)} m ${dirArrow(mr.wave_direction)} · ${num(mr.wave_period)} s</div></div>`);
  const sectionTitle = full ? (state.lang === 'el' ? 'Αέρας & αλλεργίες' : 'Air & allergies') : T('envTitle');
  return `<section class="section environment-section" id="environment"><div class="sectionhead"><h2 class="h2">${sectionTitle}</h2>${full ? `<span class="env-meta">${esc(cityName(state.city))}</span>` : btn('goto', '↗ ' + T('envOpen'), 'data-page="environment"')}</div>${full ? MonoEnvironment.render(state.aq, { lang: state.lang, zone: V.zone }) + MonoAtmosphere.render(state.atmosphere, { lang: state.lang, zone: V.zone }) : ''}<div class="env-grid env-astronomy" id="sun-sea">${cards.join('')}</div></section>`;
}
function environmentPage() {
  const jumps = [['environment', state.lang === 'el' ? 'Αέρας & γύρη' : 'Air & pollen'], ['cloud-pressure', state.lang === 'el' ? 'Σύννεφα & πίεση' : 'Clouds & pressure'], ['cloud-timeline', state.lang === 'el' ? 'Νέφωση κάθε ώρα' : 'Clouds hourly'], ['synoptic', state.lang === 'el' ? 'Χάρτης Υ/Χ' : 'H/L map'], ['vertical-profile', state.lang === 'el' ? 'Ανώτερα στρώματα' : 'Upper levels'], ['sun-sea', T('sun') + ' · ' + T('sea')]];
  return header(T('envTitle'), T('envSub'), btn('reload', '↻ ' + T('refresh'))) + (state.view ? `<div class="chips">${jumps.map(([target, label]) => `<button class="chip" data-action="envJump" data-target="${target}">${label}</button>`).join('')}${btn('goto', '☄ ' + T('space'), 'data-page="space"')}</div>` + environment(true) : state.mainErr ? errorCard() : loadingCard());
}
function forecastOptions() { return {...skyOptions(),theme:state.theme,warnings:state.warn,country:countryName(state.city),news:state.news?.items||[]}; }
function forecastPage() { return header(T('mapsTitle'),T('mapsSub'),btn('reload','↻ '+T('refresh'))) + MonoForecast.render(forecastOptions()); }
function spacePage() {
  const jumps = [['space-weather',state.lang === 'el' ? 'Ήλιος & πρόγνωση' : 'Sun & forecast'],['invisible-sky',state.lang === 'el' ? 'Ακτίνες γάμμα & σωματίδια' : 'Gamma rays & particles'],['local-sky',state.lang === 'el' ? 'Ο ουρανός εδώ & επόμενα φαινόμενα' : 'Local sky & upcoming events']];
  return header(T('spaceTitle'), T('spaceSub'), btn('reload', '↻ ' + T('refresh'))) + `<div class="chips">${jumps.map(([target,label])=>`<button class="chip" data-action="envJump" data-target="${target}">${label}</button>`).join('')}</div>` + MonoSpaceWeather.render(state.space, { lang: state.lang, zone: state.view?.zone || 'UTC', lat: +state.city.lat, lon: +state.city.lon }) + MonoCosmic.render(state.space, state.cosmic, skyOptions()) + MonoSky.render(skyOptions());
}

/* ------------------------------------------------------------------ page: hourly */
function hourlyPage() {
  const V = state.view;
  const head = header(T('hourlyTitle'), T('hourlySub'), btn('csv', '↓ ' + T('exportCsv')));
  if (!V) return head + (state.mainErr ? errorCard() : loadingCard());
  const rows = V.rows.slice(V.iNow, V.iNow + state.hours);
  const ch = chart({ rows, band: { lo: rows.map(r => r.lo), hi: rows.map(r => r.hi) }, series: [{ vals: rows.map(r => r.temp), cls: 'mono' }], bars: rows.map(r => r.amount) });
  let last = '';
  const lines = rows.map(r => {
    const d = dayKey(r.t, V.zone); const div = d !== last ? `<div class="daydivider">${esc(dt(r.t, { weekday: 'long', day: 'numeric', month: 'long' }))}</div>` : ''; last = d;
    return `${div}<div class="tableline hl"><strong>${hhmm(r.t)}</strong>${icon(r.code, r.isDay)}<span class="deg">${deg(r.temp)}</span><span class="rng hide-sm">${deg(r.lo)}–${deg(r.hi)}</span><div class="popcell"><div class="bar"><span style="width:${Math.round((r.pop ?? 0) * 100)}%"></span></div><span>${pct(r.pop)}</span></div><span class="cc" title="${T('clouds')}">☁ ${ccTxt(r.cloud)}</span><span class="hide-sm">${fin(r.amount) && r.amount >= 0.05 ? num(r.amount, 1) + ' mm' : '—'}</span><span class="wind-hourly-cell">${num(r.wind)} <small>km/h</small> ${dirArrow(r.dir)}${fin(r.wind) ? `<small class="wind-hourly-bft">${windBft(r.wind)}</small>` : ''}</span><span class="hide-sm">${num(r.rh)}%</span></div>`;
  }).join('');
  return head + `<div class="chips">${[24, 48, 72, 168].map(n => `<button class="chip ${state.hours === n ? 'active' : ''}" data-action="hours" data-n="${n}">${T(n === 24 ? 'h24' : 'next' + n)}</button>`).join('')}</div>
    <div class="card">${ch}${legend([['mono', T('legendMono')], ['band', T('legendBand')], ['bar', T('legendRain')]])}</div>
    <section class="section"><div class="tableline hl head"><span>${T('time')}</span><span></span><span>${T('temp')}</span><span class="hide-sm">${T('range')}</span><span>${T('rain')}</span><span>☁<span class="hide-sm"> ${T('clouds')}</span></span><span class="hide-sm">${T('amount')}</span><span>${T('windCol')}</span><span class="hide-sm">${T('rh')}</span></div>${lines}</section>`;
}

/* ------------------------------------------------------------------ page: rain (v3.5) */
// Open-Meteo hourly precipitation at time t is the sum of the PRECEDING hour, so an hourly row covers [t − 1 h, t].
const RAIN_BINS = [0.1, 0.5, 2, 5, 10, 30];
const rLevel = mm => { if (!fin(mm) || mm < 0.1) return 0; let k = 0; RAIN_BINS.forEach((b, j) => { if (mm >= b) k = j + 1; }); return Math.min(6, k); };
const rIsSnow = r => (r.pSnow ?? 0) >= 0.5 || (fin(r.temp) && r.temp <= 0.5);
const rWord = (mm, snow) => T(snow ? 'rIntensitySnow' : 'rIntensity')[rLevel(mm)];
const mm1 = v => (fin(v) ? (v < 0.05 ? '0' : num(v, v < 10 ? 1 : 0)) : '—');
// Rain rate if it does rain in that hour: expected amount ÷ chance, capped by the ensemble's wet (90%) scenario.
function condRate(r) {
  if (!fin(r.amount) || r.amount <= 0) return 0;
  const c = r.amount / Math.max(r.pop ?? 0, 0.2);
  return fin(r.mmHi) && r.mmHi > r.amount ? Math.min(c, r.mmHi) : c;
}
const wetHour = r => (r.pop ?? 0) >= 0.4 || ((r.pop ?? 0) >= 0.25 && (r.amount ?? 0) >= 0.3);
function rWhen(t) {
  const V = state.view, i = V.daily.findIndex(d => d.key === dayKey(t, V.zone));
  const d = i === 0 ? T('rToday') : i === 1 ? T('rTomorrow') : dt(t, { weekday: 'long' });
  return `${d} ${hhmm(t)}`;
}
function rAt(t) {
  const V = state.view, k = V.daily.findIndex(d => d.key === dayKey(t, V.zone));
  return T('rAtFmt')(dt(t, { weekday: 'long' }), hhmm(t), k);
}
// Ensemble members summed over a set of hours → 10/50/90% totals (equal weight per ensemble system).
function memberTotals(idxs) {
  const fams = (state.view?.famP || []).map(f => f.members.map(m => { let s = 0, n = 0; for (const i of idxs) if (fin(m[i])) { s += m[i]; n++; } return n >= Math.max(1, idxs.length * 0.7) ? s : null; }).filter(fin)).filter(v => v.length >= 3);
  if (!fams.length) return null;
  const pts = []; fams.forEach(v => v.forEach(x => pts.push({ x, w: 1 / (fams.length * v.length) })));
  pts.sort((a, b) => a.x - b.x);
  const qq = p => { let c = 0; for (const o of pts) { c += o.w; if (c >= p) return o.x; } return pts.at(-1).x; };
  return { q10: qq(0.1), q50: qq(0.5), q90: qq(0.9) };
}
function rainEpisodes(hours = 168) {
  const V = state.view, rows = V.rows, now = Date.now(), raw = [];
  let cur = null;
  const stop = Math.min(rows.length, V.iNow + 1 + hours);
  for (let i = V.iNow + 1; i < stop; i++) {
    const r = rows[i]; if (!wetHour(r)) continue;
    if (cur && r.i - cur.i1 <= 3) cur.i1 = r.i; else { cur = { i0: r.i, i1: r.i }; raw.push(cur); }
  }
  const R = state.rain15;
  return raw.map(({ i0, i1 }) => {
    const span = rows.slice(i0, i1 + 1), wet = span.filter(wetHour);
    let start = rows[i0].t - 3600e3, end = rows[i1].t, refined = false;
    if (R && start < R.t.at(-1)) {
      const slots = R.t.map((t, j) => ({ t, p: R.p[j] })).filter(o => o.t > start - 3600e3 && o.t <= end + 3600e3 && (o.p ?? 0) >= 0.05);
      if (slots.length) {
        const s15 = slots[0].t - 15 * 60e3, e15 = slots.at(-1).t;
        if (Math.abs(s15 - start) <= 90 * 60e3) { start = s15; refined = true; }
        if (end <= R.t.at(-1) && Math.abs(e15 - end) <= 90 * 60e3) { end = e15; refined = true; }
      }
    }
    if (start < now && span[0].t > now) start = Math.max(start, now - 3600e3);
    const peak = span.reduce((a, r) => (condRate(r) > condRate(a) ? r : a), span[0]);
    const mm = span.reduce((a, r) => a + (fin(r.amount) ? r.amount : 0), 0);
    const mt = memberTotals(span.map(r => r.i));
    return { start, end, refined, ongoing: start <= now, rows: span, wetHours: wet.length, pmax: Math.max(...span.map(r => r.pop ?? 0)), mm, mt, peak,
      peakRate: condRate(peak), storm: Math.max(0, ...span.map(r => r.pStorm ?? 0)), snow: span.some(r => rIsSnow(r) && (r.amount ?? 0) >= 0.1) };
  }).filter(e => e.end > now);
}
function totalWord(mm) { return T('rTotalWords').find(([lim]) => mm < lim)[1]; }
function episodeText(e) {
  const levels = e.rows.map(r => rLevel(condRate(r))), steady = Math.max(...levels) - Math.min(...levels.filter(Boolean)) <= 1;
  const snow = rIsSnow(e.peak);
  const shape = steady ? T('rShapeSteady')(rWord(e.peakRate, snow), mm1(e.peakRate)) : T('rShapePeak')(hhmm(e.peak.t - 1800e3), rWord(e.peakRate, snow), mm1(e.peakRate));
  const range = e.mt && e.mt.q90 - e.mt.q10 >= 0.5 ? `${mm1(e.mt.q10)}–${mm1(e.mt.q90)}` : null;
  return T('rEpisodeText')({ prob: probWord(e.pmax), pct: pct(e.pmax), shape, mm: mm1(e.mm), range, totalWord: totalWord(e.mm), storm: e.storm >= 0.2 ? pct(e.storm) : null, snow: e.snow });
}
function rainStatus(eps) {
  const V=state.view, now=Date.now(), report=window.MONORainIntelligence?.present(V.stations,state.pws,now);
  const e0=eps[0], lines=[]; let big,kind;
  const nearby=report?.local&&report?.kind==='rain';
  if(nearby){
    big=state.lang==='el'?'Βρέχει στον κοντινό σταθμό':'Rain at the nearby station';kind='wet';
    lines.push((state.lang==='el'?'Ο σταθμός ':'Station ')+esc(report.name)+(state.lang==='el'?' αναφέρει βροχή · ':' reports rain · ')+num(report.dist,1)+' km · '+hhmm(report.t)+'.');
    lines.push(state.lang==='el'?'Η ένδειξη αφορά τη θέση του σταθμού, όχι ακριβώς τη δική σου.':'This is reported at the station, not your exact street.');
  }else{
    if(report?.kind==='recent_report')lines.push((state.lang==='el'?'Ο σταθμός ':'Station ')+esc(report.name)+(state.lang==='el'?' ανέφερε υετό στις ':' reported precipitation at ')+hhmm(report.t)+(state.lang==='el'?' · όχι επιβεβαίωση αυτή τη στιγμή.':'; not confirmed now.'));
    else if(report?.kind==='not_reported')lines.push((state.lang==='el'?'Ο κοντινός σταθμός ':'Nearby station ')+esc(report.name)+(state.lang==='el'?' δεν αναφέρει βροχή · ':' does not report rain · ')+hhmm(report.t)+'.');
    else if(report?.kind==='recent_gauge'&&report.wet)lines.push((state.lang==='el'?'Βροχή την τελευταία ώρα στο ':'Rain within the last hour at ')+esc(report.name)+' · '+num(report.mm1h,1)+' mm · '+num(report.dist,1)+' km.');
    else if(report?.kind==='distant')lines.push(state.lang==='el'?'Δεν υπάρχει πρόσφατη κοντινή επιβεβαίωση· ο διαθέσιμος σταθμός είναι μακριά.':'No fresh close confirmation; the reporting station is distant.');
    else if(report?.kind==='unverified')lines.push(state.lang==='el'?'Δεν υπάρχει πρόσφατη αναφορά κοντινού σταθμού.':'No recent report from a nearby station.');
    if(e0 && e0.start-now<=24*3600e3){
      const mins=Math.max(0,Math.round((e0.start-now)/60e3/15)*15);
      lines.push(T('rNowSoon')(T('rIn')(Math.floor(mins/60),mins%60),rAt(e0.start),rAt(e0.end)));
      big=T('rIn')(Math.floor(mins/60),mins%60);kind='soon';
    }else if(e0){lines.push(T('rNowLater')(rAt(e0.start)));big=T('rDry');kind='dry';}
    else{lines.push(state.lang==='el'?'Δεν αναμένεται αξιόλογη βροχή στο κοντινό διάστημα.':'No significant rainfall forecast shortly.');big=T('rDry');kind='dry';}
  }
  return {raining:!!nearby,big,kind,lines,rate15:null,report};
}
// 15-minute bars: past hour faded, next 6 hours.
function rain15Chart() {
  const R = state.rain15, now = Date.now();
  if (!R) return `<p class="notice">${T('r15None')}</p>`;
  const idx = R.t.map((t, j) => j).filter(j => R.t[j] > now - 60 * 60e3 && R.t[j] <= now + 6 * 3600e3 + 60e3);
  if (!idx.length) return `<p class="notice">${T('r15None')}</p>`;
  const W = 720, H = 150, l = 34, r = 8, top = 12, bot = 26, n = idx.length;
  const rates = idx.map(j => (fin(R.p[j]) ? R.p[j] * 4 : null)), mx = Math.max(1, ...rates.filter(fin));
  const sc = niceStep(mx / 3), hi = Math.ceil(mx / sc) * sc, bw = (W - l - r) / n;
  const y = v => top + (H - top - bot) * (1 - v / hi);
  let g = '';
  for (let v = 0; v <= hi + 1e-9; v += sc) g += `<line class="chart-grid" x1="${l}" x2="${W - r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="chart-axis" x="${l - 5}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end">${num(v, sc < 1 ? 1 : 0)}</text>`;
  idx.forEach((j, k) => {
    const v = rates[k], x0 = l + k * bw, past = R.t[j] <= now, snow = (R.s?.[j] ?? 0) > 0.05;
    if (fin(v) && v >= 0.04) g += `<rect class="rn-bar lv${rLevel(v)}${past ? ' past' : ''}${snow ? ' snow' : ''}" x="${(x0 + 1).toFixed(1)}" y="${y(v).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${(H - bot - y(v)).toFixed(1)}" rx="2"><title>${hhmm(R.t[j] - 15 * 60e3)}–${hhmm(R.t[j])} · ${num(R.p[j], 1)} mm · ${rWord(v, snow)}</title></rect>`;
    if (new Date(R.t[j]).getUTCMinutes() === 0 && k % (n > 20 ? 4 : 2) === 0) g += `<text class="chart-axis" x="${(x0 + bw).toFixed(1)}" y="${H - 8}" text-anchor="middle">${hhmm(R.t[j])}</text>`;
  });
  const k0 = idx.findIndex(j => R.t[j] > now);
  if (k0 > 0) { const xn = l + k0 * bw; g += `<line class="chart-now" x1="${xn}" x2="${xn}" y1="${top}" y2="${H - bot}"/><text class="chart-axis strong" x="${xn + 4}" y="${top + 9}">${state.lang === 'el' ? 'ΤΩΡΑ' : 'NOW'}</text>`; }
  g += `<text class="chart-axis" x="${l}" y="${top - 2}">${T('rMmH')}</text>`;
  if (!rates.some(v => fin(v) && v >= 0.04)) g += `<text class="chart-axis strong" x="${(W + l) / 2}" y="${(H - bot) / 2 + 8}" text-anchor="middle">${esc(T('r15Dry'))}</text>`;
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" style="aspect-ratio:${W}/${H}" role="img">${g}</svg>`;
}
// 72 h: expected mm (bars), wet-scenario mm (light bars), chance (line, right axis).
function rain72Chart(rows) {
  const narrow = window.innerWidth < 640, W = narrow ? 420 : 760, H = narrow ? 190 : 230, l = 34, r = 34, top = 14, bot = 30, n = rows.length;
  if (!n) return '';
  const mx = Math.max(1, ...rows.map(x => Math.max(x.amount ?? 0, Math.min(x.mmHi ?? 0, (x.amount ?? 0) * 4 + 1)))), sc = niceStep(mx / 3), hi = Math.ceil(mx / sc) * sc;
  const bw = (W - l - r) / n, y = v => top + (H - top - bot) * (1 - Math.min(v, hi) / hi), yp = p => top + (H - top - bot) * (1 - p);
  let g = '';
  for (let v = 0; v <= hi + 1e-9; v += sc) g += `<line class="chart-grid" x1="${l}" x2="${W - r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="chart-axis" x="${l - 5}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end">${num(v, sc < 1 ? 1 : 0)}</text>`;
  [0, 0.5, 1].forEach(p => (g += `<text class="chart-axis" x="${W - r + 5}" y="${(yp(p) + 3.5).toFixed(1)}">${Math.round(p * 100)}%</text>`));
  let lastDay = '';
  rows.forEach((x, k) => {
    const x0 = l + k * bw, d = dayKey(x.t - 3600e3, state.view.zone);
    if (d !== lastDay) { if (k) g += `<line class="rn-daysep" x1="${x0.toFixed(1)}" x2="${x0.toFixed(1)}" y1="${top}" y2="${H - bot + 4}"/>`; g += `<text class="chart-axis strong" x="${(x0 + 3).toFixed(1)}" y="${H - 8}">${esc(dt(x.t - 3600e3, { weekday: 'short', day: 'numeric' }))}</text>`; lastDay = d; }
    if (fin(x.mmHi) && x.mmHi >= 0.1) g += `<rect class="rn-hi" x="${(x0 + 0.5).toFixed(1)}" y="${y(x.mmHi).toFixed(1)}" width="${Math.max(1, bw - 1).toFixed(1)}" height="${(H - bot - y(x.mmHi)).toFixed(1)}"/>`;
    if (fin(x.amount) && x.amount >= 0.05) g += `<rect class="rn-bar lv${Math.max(1, rLevel(condRate(x)))}" x="${(x0 + 0.5).toFixed(1)}" y="${y(x.amount).toFixed(1)}" width="${Math.max(1, bw - 1).toFixed(1)}" height="${(H - bot - y(x.amount)).toFixed(1)}"><title>${hhmm(x.t - 3600e3)}–${hhmm(x.t)} · ${mm1(x.amount)} mm · ${pct(x.pop)}</title></rect>`;
  });
  let d = '', pen = false;
  rows.forEach((x, k) => { if (fin(x.pop)) { d += `${pen ? 'L' : 'M'}${(l + (k + 0.5) * bw).toFixed(1)},${yp(x.pop).toFixed(1)}`; pen = true; } else pen = false; });
  g += `<path class="rn-pop" d="${d}"/>`;
  g += `<text class="chart-axis" x="${l}" y="${top - 3}">mm</text>`;
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" style="aspect-ratio:${W}/${H}" role="img">${g}</svg>`;
}
function episodeCard(e) {
  const hrs = Math.max(0.25, (e.end - e.start) / 3600e3), dur = hrs >= 1 ? `${num(hrs, hrs % 1 && hrs < 10 ? 1 : 0)} ${state.lang === 'el' ? 'ώρ.' : 'h'}` : `${Math.round(hrs * 60)}′`;
  const mxr = Math.max(0.5, ...e.rows.map(condRate));
  const bars = e.rows.map(r => { const v = condRate(r); return `<i class="lv${rLevel(v)}" style="height:${Math.max(4, Math.round(100 * Math.min(1, v / mxr)))}%;opacity:${(0.35 + 0.65 * (r.pop ?? 0)).toFixed(2)}" title="${hhmm(r.t - 3600e3)}–${hhmm(r.t)} · ${mm1(r.amount)} mm · ${pct(r.pop)}"></i>`; }).join('');
  return `<article class="card rn-ep ${e.ongoing ? 'on' : ''}"><div class="rn-ephead"><div><span class="label">${e.ongoing ? T('rNowLabel') : esc(rWhen(e.start).split(' ')[0])}</span>
      <h3>${esc(rWhen(e.start))} → ${esc(rWhen(e.end))}</h3><small class="muted">${dur} · ${e.refined ? T('rRefined') : T('rHourlyOnly')}</small></div>
      <span class="rn-pill ${probCls(e.pmax)}">${pct(e.pmax)}</span></div>
    <div class="rn-epbars">${bars}</div>
    <div class="rn-stats"><div><span class="label">${T('rTotal')}</span><b>${mm1(e.mm)} <small>mm</small></b>${e.mt && e.mt.q90 - e.mt.q10 >= 0.5 ? `<small>${T('rRange')} ${mm1(e.mt.q10)}–${mm1(e.mt.q90)}</small>` : ''}</div>
      <div><span class="label">${T('rPeak')}</span><b>${mm1(e.peakRate)} <small>${T('rMmH')}</small></b><small>${hhmm(e.peak.t - 3600e3)}–${hhmm(e.peak.t)}</small></div>
      <div><span class="label">${T('rProb')}</span><b>${pct(e.pmax)}</b><small>${esc(probWord(e.pmax))}</small></div>
      ${e.storm >= 0.15 ? `<div><span class="label">${T('rStorm')}</span><b>${pct(e.storm)}</b><small>⚡</small></div>` : ''}</div>
    <p class="rn-text">${esc(episodeText(e))}</p></article>`;
}
function rainHourly(rows) {
  const V = state.view, out = []; let dry = [], last = '';
  const mxA = Math.max(1, ...rows.map(r => r.amount ?? 0));
  const flush = () => { if (!dry.length) return; const a = dry[0].t - 3600e3, b = dry.at(-1).t, pm = Math.max(0, ...dry.map(r => r.pop ?? 0));
    out.push(`<div class="rn-row dry"><strong>${hhmm(a)}–${hhmm(b)}</strong><span class="muted">${T('rDry')}${pm >= 0.05 ? ` · ≤ ${pct(pm)}` : ''}</span></div>`); dry = []; };
  for (const r of rows) {
    const d = dayKey(r.t - 3600e3, V.zone);
    if (d !== last) { flush(); out.push(`<div class="daydivider">${esc(dt(r.t - 3600e3, { weekday: 'long', day: 'numeric', month: 'long' }))}</div>`); last = d; }
    if ((r.pop ?? 0) < 0.2 && (r.amount ?? 0) < 0.05) { dry.push(r); continue; }
    flush();
    const cr = condRate(r), lv = rLevel(cr), snow = rIsSnow(r);
    out.push(`<div class="rn-row"><strong>${hhmm(r.t - 3600e3)}–${hhmm(r.t)}</strong>
      <div class="rn-mmcell"><div class="rn-mmbar"><span class="lv${Math.max(1, lv)}" style="width:${Math.round(100 * Math.min(1, (r.amount ?? 0) / mxA))}%"></span>${fin(r.mmHi) && r.mmHi > (r.amount ?? 0) ? `<em style="width:${Math.round(100 * Math.min(1, r.mmHi / mxA))}%"></em>` : ''}</div><b>${mm1(r.amount)} <small>mm</small></b></div>
      <span class="rn-pill ${probCls(r.pop ?? 0)}">${pct(r.pop)}</span>
      <span class="rn-word">${icon(r.code, r.isDay)}<span><b>${esc(rWord(cr, snow))}${(r.pStorm ?? 0) >= 0.3 ? ' ⚡' : ''}</b><small>${esc(lv ? T('rPlain')[lv] : '')}</small></span></span></div>`);
  }
  flush();
  return out.join('');
}
function rainDaily() {
  const V = state.view, now = Date.now();
  return V.daily.map((d, i) => {
    const rows = V.rows.filter(r => r.t > now && dayKey(r.t - 3600e3, V.zone) === d.key), mt = memberTotals(rows.map(r => r.i));
    let best = null; for (let k = 0; k + 2 < rows.length; k++) { const s = rows.slice(k, k + 3).reduce((a, r) => a + (r.amount ?? 0), 0); if (!best || s > best.s) best = { s, a: rows[k].t - 3600e3, b: rows[k + 2].t }; }
    const mm = rows.reduce((a, r) => a + (r.amount ?? 0), 0);
    return `<div class="rn-day"><strong>${esc(dayLabel(d.t, i))}</strong><span class="rn-pill ${probCls(d.pop ?? 0)}">${pct(d.pop)}</span>
      <b>${mm1(mm)} <small>mm</small></b><span class="muted hide-sm">${mt && mt.q90 >= 0.2 ? `${mm1(mt.q10)}–${mm1(mt.q90)} mm` : '—'}</span>
      <span class="rn-daynote">${mm >= 0.2 && best && best.s >= 0.1 ? `${hhmm(best.a)}–${hhmm(best.b)} · ${esc(totalWord(mm))}` : esc(T('rDry'))}</span></div>`;
  }).join('');
}
function rainNowCard(compact) {
  const V = state.view; if (!V) return '';
  const eps = rainEpisodes(), S = rainStatus(eps), e0 = eps[0];
  const next24 = V.rows.slice(V.iNow + 1, V.iNow + 25), mx = Math.max(0.5, ...next24.map(r => r.amount ?? 0));
  const strip = `<div class="rn-strip">${next24.map(r => `<i class="lv${Math.max(1, rLevel(condRate(r)))}" style="height:${(r.amount ?? 0) >= 0.05 ? Math.max(8, Math.round(100 * (r.amount ?? 0) / mx)) : 3}%;opacity:${(0.3 + 0.7 * (r.pop ?? 0)).toFixed(2)}" title="${hhmm(r.t - 3600e3)} · ${mm1(r.amount)} mm · ${pct(r.pop)}"></i>`).join('')}</div>
    <div class="rn-striplab"><span>${hhmm(next24[0]?.t - 3600e3)}</span><span>+12h</span><span>+24h</span></div>`;
  return `<section class="section card rn-now ${S.kind}"><div class="rn-nowgrid"><div><span class="label">☂ ${T('rNowLabel')}</span><div class="rn-big">${esc(S.big)}</div></div>
    <div class="rn-nowtext">${S.lines.map(x => `<p>${esc(x)}</p>`).join('')}
      ${e0 ? `<div class="rn-chips"><span>${T('rProb')} <b>${pct(e0.pmax)}</b></span><span>${T('rTotal')} <b>${mm1(e0.mm)} mm</b></span><span>${T('rPeak')} <b>${mm1(e0.peakRate)} ${T('rMmH')}</b></span></div>` : ''}</div></div>
    ${strip}${compact ? `<div class="rn-more">${btn('goto', '↗ ' + T('rOpen'), 'data-page="rain"')}</div>` : ''}</section>`;
}
function rainPage() {
  const V = state.view;
  const head = header(T('rainTitle'), T('rainSub'), btn('reload', '↻ ' + T('refresh')));
  if (!V) return head + (state.mainErr ? errorCard() : loadingCard());
  const eps = rainEpisodes();
  const rows72 = V.rows.slice(V.iNow + 1, V.iNow + 73), rows48 = V.rows.slice(V.iNow + 1, V.iNow + 49);
  return head + (window.MONORainIntelligence?.render({lang:state.lang,view:V,train:state.train,stations:V.stations,pws:state.pws,trainingStatus:state.trainStatus,shared:state.sharedRain}) || '') + rainNowCard(false)
    + `<section class="section card"><div class="panelhead"><div><b>${T('r15')}</b><div class="section-sub">${T('r15Sub')}</div></div></div>${rain15Chart()}
       <div class="rn-legend">${T('rIntensity').slice(1).map((w, k) => `<span><i class="lv${k + 1}"></i>${esc(w)}</span>`).join('')}</div></section>
    <section class="section"><div class="sectionhead"><div><h2 class="h2">${T('rEpisodes')}</h2><div class="section-sub">${T('rEpisodesSub')}</div></div></div>
      ${eps.length ? `<div class="rn-eps">${eps.map(episodeCard).join('')}</div>` : `<div class="card placeholder"><b>☀ ${T('rNoEpisodes')}</b></div>`}</section>
    <section class="section card"><div class="panelhead"><div><b>${T('rChart')}</b><div class="section-sub">${T('rChartSub')}</div></div></div>${rain72Chart(rows72)}</section>
    <section class="section dual"><div class="card"><div class="panelhead"><div><b>${T('rDaily')}</b><div class="section-sub">${T('rDailySub')}</div></div></div>${rainDaily()}</div>
      <div class="card"><div class="panelhead"><b>${T('rWhatMm')}</b></div><p class="rn-text">${T('rMmExplain')}</p>
        ${T('rIntensity').slice(1).map((w, k) => `<div class="kv rn-kv"><span><i class="rn-dot lv${k + 1}"></i> ${esc(w)} — ${esc(T('rPlain')[k + 1])}</span><b>${k === 5 ? '≥ 30' : `${num(RAIN_BINS[k], RAIN_BINS[k] < 1 ? 1 : 0)}–${num(RAIN_BINS[k + 1], RAIN_BINS[k + 1] < 1 ? 1 : 0)}`} ${T('rMmH')}</b></div>`).join('')}</div></section>
    <section class="section"><div class="sectionhead"><div><h2 class="h2">${T('rHourly')}</h2><div class="section-sub">${T('rHourlySub')}</div></div>${btn('goto', '↗ ' + T('hourly'), 'data-page="hourly"')}</div>${rainHourly(rows48)}</section>
    <p class="notice">${T('rUpdated')} ${hhmm(state.fetchedAt || V.at)}${state.rain15 ? ` · 15′ ${hhmm(state.rain15.at)}` : ''} · MONO (${V.active.length} ${T('models')}, ${num(V.members)} ${T('members')})</p>`;
}

/* ------------------------------------------------------------------ page: weather events */
const EVENTS = ['rain', 'heavy', 'storm', 'snow', 'fog', 'wind', 'frost', 'heat'];
function phenPage() {
  const V = state.view;
  const head = header(T('phenTitle'), T('phenSub'));
  if (!V) return head + (state.mainErr ? errorCard() : loadingCard());
  const days = V.daily;
  const grid = `<div class="card tablecard"><div class="tablewrap"><table class="phen-table"><thead><tr><th></th>${days.map((d, i) => `<th>${esc(dayLabel(d.t, i))}<br>${icon(d.code, 1, 'thicon')}</th>`).join('')}</tr></thead><tbody>
    ${EVENTS.map(k => `<tr><td><div class="phname"><img src="${iconSrc(PH_ICON[k])}" alt=""><div><b>${T('ph_' + k)}</b><small>${T('phd_' + k)}</small></div></div></td>${days.map(d => { const p = d.ev[k] ?? 0; return `<td><span class="pcell ${probCls(p)}">${p < 0.05 ? '—' : pct(p)}</span></td>`; }).join('')}</tr>`).join('')}
    </tbody></table></div></div>`;
  const rows = V.rows.slice(V.iNow, V.iNow + 72);
  const hourly = `<section class="section card"><div class="panelhead"><b>${T('hourlyProb')}</b></div>
    ${chart({ rows, unit: '%', series: [{ vals: rows.map(r => 100 * (r.pop ?? 0)), cls: 'mono' }, { vals: rows.map(r => 100 * r.pStorm), cls: 'storm' }, { vals: rows.map(r => 100 * r.pWind), cls: 'windl' }, { vals: rows.map(r => 100 * r.pFog), cls: 'fogl' }, { vals: rows.map(r => 100 * r.pSnow), cls: 'snowl' }] })}
    ${legend([['mono', T('ph_rain')], ['storm', T('ph_storm')], ['windl', T('ph_wind')], ['fogl', T('ph_fog')], ['snowl', T('ph_snow')]])}</section>`;
  const tl = V.periods.length ? V.periods.map(p => `<div class="kv"><span>${esc(periodText(p))}</span><b>${T('upTo')} ${pct(p.max)} · ${num(p.mm, 1)} mm</b></div>`).join('') : `<p class="notice">${T('noRain')}</p>`;
  const w = state.warn;
  const warn = !w ? loadingCard() : w.error ? `<p class="notice">${T('warnFail')}</p>` : !w.length ? `<p class="notice">${T('warnNone')}</p>`
    : w.slice(0, 8).map(x => `<div class="warnrow ${x.color}"><span class="wdot"></span><div><b>${esc(x.event)}</b> <small class="muted">${x.local ? T('warnRegion') : T('warnCountry')}</small><div class="compact">${esc(x.areas.slice(0, 4).join(', '))}${x.areas.length > 4 ? '…' : ''}</div><div class="compact">${esc(wdt(x.onset))} → ${esc(wdt(x.expires))}</div></div></div>`).join('');
  return head + grid + hourly + `<section class="section dual"><div class="card"><div class="panelhead"><b>${T('rainTimeline')}</b></div>${tl}</div><div class="card"><div class="panelhead"><b>${T('warnTitle')}</b><span class="badge">Meteoalarm</span></div>${warn}</div></section>`;
}

/* ------------------------------------------------------------------ page: radar */
let map = null, radar = { frames: [], layers: [], i: 0, timer: 0, host: '', mode: UI.radarMode==='radar'?'radar':'future', futureData:null, futureTimes:[], futureIndex:3, futureTimer:0, futureBusy:false, futureAt:0, futureKey:'', fieldBusy:false, fieldKey:'', fieldData:null, fieldGrid:null };
function radarPage(){
 const el=state.lang==='el',X=(a,b)=>el?a:b;
 const rb=(mode,sym,text)=>'<button type="button" class="'+(radar.mode===mode?'active':'')+'" data-action="radarMode" data-v="'+mode+'" aria-pressed="'+(radar.mode===mode)+'"><span aria-hidden="true">'+sym+'</span>'+text+'</button>';
 return header(T('radarTitle'),X('Χάρτης μεγάλων πόλεων: βροχή, καταιγίδες και χιόνι ανά ώρα. Χωρίς εικονίδια νέφωσης.','Major cities with hourly rain, storm and snow forecast. No cloud symbols.'),btn('goto',X('Αναλυτική πρόγνωση ↗','Full forecast ↗'),'data-page="maps"'))+
 '<div class="radar-modebar" role="group" aria-label="'+X('Πηγή χάρτη','Map mode')+'">'+rb('future','🌧',X('Μελλοντικά φαινόμενα','Future weather'))+rb('radar','📡',X('Πραγματικό ραντάρ','Observed radar'))+'</div>'+
 '<div class="card mapcard radar-suite"><div class="radar-map-shell"><div id="map" class="map"></div>'+
 '<div class="radar-map-overlay"><div class="radar-pill" id="radarStatus" role="status">'+X('Φόρτωση…','Loading…')+'</div></div>'+
 '<div class="pm-map-top" id="pmMapTop"><b>'+X('ΧΑΡΤΗΣ ΦΑΙΝΟΜΕΝΩΝ','WEATHER SYSTEMS')+'</b><strong id="pmMapClock">—</strong><small>'+X('Πρόγνωση ανά ώρα · όχι πραγματικό ραντάρ','Hourly model forecast · not observed radar')+'</small></div>'+
 '<div class="radar-legend" id="realRadarLegend"><strong>'+X('Ένταση επιστροφών ραντάρ','Radar reflectivity')+'</strong><div class="radar-gradient"></div><div class="radar-legend-ends"><span>'+X('Ασθενέστερη','Weaker')+'</span><span>'+X('Ισχυρότερη','Stronger')+'</span></div></div></div>'+
 '<div class="radar-controls" id="realRadarControls"><button class="outline-btn" id="radarPlay" data-action="radarPlay">▶ '+T('play')+'</button>'+
 '<div class="radar-timebar"><input type="range" id="radarSlider" min="0" max="0" value="0" disabled aria-label="'+T('time')+'"><output id="radarTime">—</output></div>'+
 '<button class="chip" data-action="radarHome">'+X('⌖ Κέντρο','⌖ Center')+'</button>'+
 '<button class="chip" id="radarSat" data-action="radarSat" aria-pressed="'+state.radarSat+'">'+T('satIR')+'</button>'+
 '<button class="chip" data-action="radarReload">↻</button></div>'+
 '<div id="futureRadarControls" class="pm-controls">'+
 '<button type="button" class="outline-btn pm-play" id="pmPlay" data-action="pmPlay" aria-label="'+X('Κίνηση πρόγνωσης','Play forecast animation')+'">▶ '+T('play')+'</button>'+
 '<div class="pm-range"><input type="range" id="pmSlider" min="0" max="0" value="0" disabled aria-label="'+X('Μελλοντική ώρα πρόγνωσης','Forecast time')+'"><output class="pm-output" id="pmTime">—</output></div>'+
 '<div class="pm-quick">'+[3,6,12,24,48].map(h=>'<button type="button" data-action="pmJump" data-h="'+h+'" id="pmJump'+h+'">+'+h+'ω</button>').join('')+'</div>'+
 '<button type="button" class="chip" data-action="radarHome">'+X('⌖ Κέντρο','⌖ Center')+'</button>'+
 '<button type="button" class="chip" id="pmStyle" data-action="pmStyle">▧ '+X('Δρόμοι','Streets')+'</button>'+'<button type="button" class="chip" data-action="pmReload">↻</button></div>'+
 '<div class="pm-highlights" id="pmHighlights" aria-live="polite">'+X('Φόρτωση φαινομένων στον χάρτη…','Loading weather across the map…')+'</div>'+ '<div class="pm-overhead-hint" id="pmModelState" role="status">'+X('Πρόγνωση πάνω στον χάρτη · όχι ραντάρ','Forecast mapped over land · not radar')+'</div>'+ '<div class="pm-colors" id="pmColors"><span>0,1</span><i></i><span>20+ mm/h</span></div>'+ '<div class="pm-flegend" id="pmLegend"><span><i class="pm-key pm-k-light"></i>'+X('Ασθενής βροχή','Light rain')+'</span><span><i class="pm-key pm-k-rain"></i>'+X('Βροχή','Rain')+'</span><span><i class="pm-key pm-k-heavy"></i>'+X('Ισχυρή','Heavy')+'</span><span><i class="pm-key pm-k-storm"></i>'+X('Καταιγίδα','Storm')+'</span><span><i class="pm-key pm-k-snow"></i>'+X('Χιόνι','Snow')+'</span></div>'+
 '<p class="pm-map-note" id="pmNote">'+X('Χρωματιστές ζώνες = ωριαία χωρική πρόγνωση βροχής, χιονιού και καταιγίδων σε υπολογιστικό πλέγμα. Η κίνηση προκύπτει από διαδοχικές ωριαίες προβλέψεις. Όχι εικόνα πραγματικού ραντάρ ή ακριβής πορεία κάθε καταιγίδας.','Coloured areas = spatial precipitation model estimates from a forecast grid. Motion interpolates successive hourly model frames; this is not observed radar or a precise tracked storm path.')+'</p>'+
 '</div><div class="radar-info"><div class="card"><div class="radar-info-title">'+X('Πόλεις στον χάρτη','Cities on the map')+'</div><p>'+X('Αθήνα, Θεσσαλονίκη, Πάτρα, Λάρισα, Ηράκλειο και άλλες μεγάλες πόλεις. Με μεγέθυνση εμφανίζονται περισσότερες.','Athens, Thessaloniki, Patras, Larissa, Heraklion and other major cities. Zoom in for more.')+'</p></div>'+
 '<div class="card"><div class="radar-info-title">'+X('Μελλοντικά φαινόμενα','Future phenomena')+'</div><p>'+X('Σύρε την ώρα ή πάτησε +6ω / +24ω. Τα εικονίδια δείχνουν ένταση βροχής, χιόνι και καταιγίδες — χωρίς σύμβολα απλής συννεφιάς.','Drag the timeline or select +6h / +24h. Icons show rain intensity, snow and storms, never plain clouds.')+'</p></div>'+
 '<div class="card"><div class="radar-info-title">'+X('Τι είναι πραγματικό;','What is observed?')+'</div><p>'+X('Η καρτέλα «Πραγματικό ραντάρ» δείχνει λήψεις υετού του παρελθόντος. Η «Πρόγνωση» προέρχεται από αριθμητικά μοντέλα.','Observed radar shows recent past precipitation. The future mode uses numerical weather model forecasts.')+'</p></div></div>'+
 '<p class="notice">'+T('radarNote')+' · Open-Meteo · RainViewer · Esri</p>';
}
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  return new Promise((res, rej) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'vendor/leaflet.css'; document.head.appendChild(css);
    const s = document.createElement('script'); s.src = 'vendor/leaflet.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
}
function killMap() { radar.fieldJob=(radar.fieldJob||0)+1;if(radar.timer)clearInterval(radar.timer);radar.timer=0;if(radar.futureTimer)clearInterval(radar.futureTimer);radar.futureTimer=0;radar.futureBusy=false;radar.futureKey='';if(map){map.remove();map=null;}radar.layers=[];radar.frames=[];radar.sat=null;radar.rainLayer=null;radar.baseLayers=[];radar.futureLayer=null;radar.stationLayer=null;radar.fieldLayer=null;radar.fieldData=null;radar.fieldBusy=false;radar.fieldKey=''; }
async function mountRadar(){
 if(!$('#map')||map)return;
 try{
  await loadLeaflet();
  if(!$('#map')||map)return;
  const c=state.city,Lf=window.L;
  const greekView=c.cc==='GR'||(c.lat>=34.4&&c.lat<=41.8&&c.lon>=19&&c.lon<=29.7);
  const instance=Lf.map('map',{zoomControl:true,scrollWheelZoom:false}).setView(radar.mode==='future'&&greekView?[38.4,23.85]:[c.lat,c.lon],radar.mode==='future'&&greekView?6:8);
  map=instance;radar.baseLayers=baseLayers(Lf);radar.baseLayers.forEach(layer=>layer.addTo(instance));
  radar.stationLayer=Lf.layerGroup();
  Lf.circleMarker([c.lat,c.lon],{radius:7,color:'#fff',weight:2,fillColor:'#216eea',fillOpacity:1}).addTo(radar.stationLayer).bindTooltip(esc(cityName(c)));
  for(const st of (state.view?.stations||[]).filter(st=>st.last).slice(0,18))
   Lf.marker([st.lat,st.lon],{icon:Lf.divIcon({className:'stmark',html:`<span>${deg(st.last.temp)}</span>`,iconSize:[38,20]})}).addTo(radar.stationLayer).bindTooltip(`${esc(st.id)} · ${esc(st.name||'')}`);
  radar.futureLayer=Lf.layerGroup();
  instance.on('click',e=>{
    if(map!==instance||radar.mode!=='future'||!radar.fieldData||!radar.fieldLayer)return;
    const s=radar.fieldLayer.getSample(e.latlng.lat,e.latlng.lng,radar.futureIndex);
    const when=radar.futureTimes?.[radar.futureIndex];
    if(!s||!Number.isFinite(when))return;
    const cat=window.MONOWeatherField.typeAt(s),el=state.lang==='el';
    const names={storm:el?'Καταιγίδα':'Thunderstorm',snow:el?'Χιονόπτωση':'Snowfall',heavy:el?'Έντονη βροχή':'Heavy rain',rain:el?'Βροχή':'Rain',light:el?'Ασθενής βροχή':'Light rain',dry:el?'Χωρίς σημαντική βροχή':'No significant rain'};
    const rainNum=num(s.precip,1),snowNum=num(s.snow,1);
    const html='<div class="pm-popup"><strong>'+(names[cat]||'—')+'</strong>'+
      '<p>'+phenomenaClock(when)+'</p><dl><div><dt>'+(el?'Βροχή':'Precipitation')+'</dt><dd>'+rainNum+' mm/h</dd></div>'+
      '<div><dt>'+(el?'Χιόνι':'Snow')+'</dt><dd>'+snowNum+' cm/h</dd></div></dl>'+
      '<small>'+(el?'Εκτίμηση μοντέλου μεταξύ σημείων πλέγματος · όχι μέτρηση':'Interpolated model estimate · not a measurement')+'</small></div>';
    Lf.popup({maxWidth:230,autoPan:true}).setLatLng(e.latlng).setContent(html).openOn(instance);
  });
  radar.fieldLayer=window.MONOWeatherField?new (window.MONOWeatherField.createLayer(Lf))():null;
  instance.on('zoomend moveend',()=>{if(map===instance&&radar.mode==='future')drawPhenomena();});
  syncRadarMode();
  loadPhenomena(instance);
  loadWeatherField(instance);
  setTimeout(()=>{if(map===instance)instance.invalidateSize();},150);
  const d=await getJSON('https://api.rainviewer.com/public/weather-maps.json',12000);
  if(map!==instance||!$('#map'))return;
  radar.host=d.host;radar.frames=d.radar?.past||[];radar.layers=radar.frames.map(()=>null);
  const ir=d.satellite?.infrared?.at(-1);
  if(ir)radar.sat=Lf.tileLayer(`${d.host}${ir.path}/256/{z}/{x}/{y}/0/0_0.png`,{opacity:state.radarSat&&radar.mode==='radar'?0.45:0,maxNativeZoom:7,maxZoom:12,zIndex:4,attribution:'RainViewer'}).addTo(instance);
  if(!radar.frames.length){if(radar.mode==='radar')throw new Error('No radar frames');return;}
  const slider=$('#radarSlider');if(slider){slider.disabled=false;slider.max=String(radar.frames.length-1);slider.oninput=e=>showFrame(+e.target.value);}
  const play=$('#radarPlay');if(play)play.disabled=radar.frames.length<2;
  showFrame(radar.frames.length-1);syncRadarMode();instance.invalidateSize();
 }catch{
  const st=$('#radarStatus');if(st&&radar.mode==='radar')st.textContent=state.lang==='el'?'Δεν φορτώθηκαν λήψεις · ο χάρτης παραμένει διαθέσιμος':'Radar frames unavailable · basemap still works';
  if(!map){const host=$('#map');if(host)host.innerHTML=`<div class="placeholder">${T('radarFail')}</div>`;}
 }
}
/* ------------------------------------------------------------------ Future city phenomena — separate from historical radar. */
function phenomenaClock(t){
  return dt(t,{weekday:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
}
function syncRadarMode(){
  if(!map)return;
  const future=radar.mode==='future';
  const toggle=(sel,on)=>{const el=$(sel);if(el)el.classList.toggle('hidden',!on);};
  toggle('#futureRadarControls',future);toggle('#pmLegend',future);toggle('#pmNote',future);toggle('#pmColors',future);toggle('#pmModelState',future);toggle('#pmHighlights',future);toggle('#pmMapTop',future);
  toggle('#realRadarControls',!future);toggle('#realRadarLegend',!future);
  document.querySelectorAll('[data-action="radarMode"]').forEach(b=>{
    const on=b.dataset.v===radar.mode;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));
  });
  if(radar.rainLayer)radar.rainLayer.setOpacity(future?0:.88);
  if(radar.sat)radar.sat.setOpacity(!future&&state.radarSat?0.45:0);
  if(radar.fieldLayer){
    if(future&&!map.hasLayer(radar.fieldLayer))radar.fieldLayer.addTo(map);
    if(!future&&map.hasLayer(radar.fieldLayer))map.removeLayer(radar.fieldLayer);
  }
  if(radar.futureLayer){
    if(future&&!map.hasLayer(radar.futureLayer))radar.futureLayer.addTo(map);
    if(!future&&map.hasLayer(radar.futureLayer))map.removeLayer(radar.futureLayer);
  }
  if(radar.stationLayer){
    if(!future&&!map.hasLayer(radar.stationLayer))radar.stationLayer.addTo(map);
    if(future&&map.hasLayer(radar.stationLayer))map.removeLayer(radar.stationLayer);
  }
  if(future)drawPhenomena();
  else if(radar.frames.length)showFrame(radar.i);
  else if($('#radarStatus'))$('#radarStatus').textContent=state.lang==='el'?'Αναμονή πραγματικών λήψεων…':'Loading observed radar…';
}
function radarSelectMode(mode){
  if(!['future','radar'].includes(mode)||radar.mode===mode)return;
  if(radar.timer){clearInterval(radar.timer);radar.timer=0;}
  if(radar.futureTimer){clearInterval(radar.futureTimer);radar.futureTimer=0;}
  radar.mode=mode;persistUI();syncRadarMode();
  const c=state.city,greece=c.cc==='GR'||(c.lat>=34.4&&c.lat<=41.8&&c.lon>=19&&c.lon<=29.7);
  if(map&&greece)map.setView(mode==='future'?[38.4,23.85]:[c.lat,c.lon],mode==='future'?6:8);
  const r=$('#radarPlay'),p=$('#pmPlay');if(r)r.textContent='▶ '+T('play');if(p)p.textContent='▶ '+T('play');
  if(mode==='future'&&!radar.futureData)loadPhenomena(map);
  if(mode==='future'&&!radar.fieldData)loadWeatherField(map);
  setRadarBasemap();
}
function drawPhenomena(animate=false){
  const P=window.MONOPhenomenaMap;
  if(!P||!map||!radar.futureLayer||radar.mode!=='future')return;
  const points=radar.futureData||[],times=radar.futureTimes||[];
  const idx=Math.max(0,Math.min(times.length-1,radar.futureIndex));
  const t=times[idx];
  const layer=radar.futureLayer;
  layer.clearLayers();
  if(radar.fieldData&&radar.fieldLayer){radar.fieldLayer.setHour(idx,animate?800:0);}
  const stat=$('#radarStatus'),out=$('#pmTime'),slider=$('#pmSlider');
  if(!times.length){
    if(stat)stat.textContent=radar.futureBusy?(state.lang==='el'?'Φόρτωση πρόγνωσης πόλεων…':'Loading city forecasts…'):(state.lang==='el'?'Δεν υπάρχουν διαθέσιμες ωριαίες προγνώσεις':'Hourly forecasts unavailable');
    if(out)out.textContent='—';
    if(slider)slider.disabled=true;
    return;
  }
  const zoom=map.getZoom(),bounds=map.getBounds().pad(.2);let shown=0;
  const occupied=[];
  const ordered=[...points].sort((a,b)=>(a.selected?-1:b.selected?1:0)||(a.rank-b.rank));
  for(const point of ordered){
    if(!P.eligible(point,zoom)||!bounds.contains([point.lat,point.lon]))continue;
    const xy=map.latLngToContainerPoint([point.lat,point.lon]);
    if(!point.selected&&occupied.some(p=>Math.abs(xy.x-p.x)<(zoom>=9?69:93)&&Math.abs(xy.y-p.y)<(zoom>=9?28:36)))continue;
    occupied.push(xy);
    const row=P.at(point,t);
    const iconHtml=P.pin(point,{weatherCode:null,precip:0,snow:0,prob:0},state.lang).replace('pm-pin ','pm-pin pm-overhead ');
    const marker=window.L.marker([point.lat,point.lon],{icon:window.L.divIcon({
      className:'phen-map-marker',html:iconHtml,iconSize:[120,42],iconAnchor:[53,21]
    }),riseOnHover:true,keyboard:true});
    marker.bindPopup(P.popup(point,row,t,state.lang,tz()));
    marker.addTo(layer);shown++;
  }
  if(slider){slider.disabled=false;slider.max=String(times.length-1);slider.value=String(idx);}
  if(out)out.textContent=phenomenaClock(t);
  if(stat)stat.textContent=(state.lang==='el'?'ΠΡΟΓΝΩΣΗ · ':'FORECAST · ')+phenomenaClock(t)+' · '+shown+(state.lang==='el'?' πόλεις':' cities');
  for(const h of [3,6,12,24,48]){const b=$('#pmJump'+h);if(b)b.classList.toggle('active',Math.abs(t-(Date.now()+h*3600e3))<35*60e3);}
}
function selectPhenomenaHour(idx,animate=false){
  const times=radar.futureTimes||[];
  if(!times.length)return;
  radar.futureIndex=Math.max(0,Math.min(times.length-1,Math.round(idx)));
  drawPhenomena(animate);
}
function jumpPhenomenaHour(h){
  const ts=radar.futureTimes||[];if(!ts.length)return;
  const target=Date.now()+h*3600e3;
  let best=0;
  for(let i=1;i<ts.length;i++)if(Math.abs(ts[i]-target)<Math.abs(ts[best]-target))best=i;
  selectPhenomenaHour(best);
}
function togglePhenomenaPlay(){
  if(!map||radar.mode!=='future'||!radar.futureTimes?.length)return;
  const btn=$('#pmPlay');
  if(radar.futureTimer){clearInterval(radar.futureTimer);radar.futureTimer=0;if(btn)btn.textContent='▶ '+T('play');return;}
  radar.futureTimer=setInterval(()=>{
    if(!map||!$('#map')||radar.mode!=='future'){clearInterval(radar.futureTimer);radar.futureTimer=0;return;}
    selectPhenomenaHour((radar.futureIndex+1)%radar.futureTimes.length,true);
  },950);
  if(btn)btn.textContent='❚❚ '+T('pause');
}
/* Spatial forecast model grid, rendered as an overhead coloured field.
 * No radar layer or cloud imagery is used for future hours. */
function attachWeatherField(){
 const F=window.MONOWeatherField;
 if(!F||!radar.fieldLayer||!radar.fieldGrid||!radar.fieldData)return;
 if(!radar.futureTimes?.length)radar.futureTimes=window.MONOPhenomenaMap.timeline(radar.fieldData);
 if(!radar.futureTimes.length)return;
 radar.fieldLayer.setForecast(radar.fieldGrid,radar.fieldData,window.MONOPhenomenaMap.at,radar.futureTimes);
 if(map&&radar.mode==='future')drawPhenomena();
}
async function loadWeatherField(instance,force=false){
 const F=window.MONOWeatherField,P=window.MONOPhenomenaMap;
 if(!F||!P||!instance)return;
 const grid=F.makeGrid(state.city);
 const cache=radar.fieldCache;
 if(!force&&cache?.key===grid.key&&Date.now()-cache.at<20*60000){
  radar.fieldGrid=cache.grid;radar.fieldData=cache.data;radar.fieldBusy=false;
  if(map===instance)attachWeatherField();return;
 }
 if(!force&&radar.fieldBusy&&radar.fieldKey===grid.key)return;
 const job=(radar.fieldJob||0)+1;radar.fieldJob=job;radar.fieldBusy=true;
 radar.fieldKey=grid.key;radar.fieldData=null;radar.fieldGrid=grid;
 if(radar.mode==='future'){const status=$('#pmModelState');if(status)status.textContent=state.lang==='el'?'Φόρτωση χωρικής πρόγνωσης…':'Loading forecast field…';}
 // Bounded API calls, sequential waves, so the browser doesn't hammer a public service.
 const blocks=[];
 for(let i=0;i<grid.points.length;i+=22)blocks.push({offset:i,points:grid.points.slice(i,i+22)});
 const data=new Array(grid.points.length).fill(null);
 let loaded=0;
 for(let wave=0;wave<blocks.length;wave+=3){
  if(!map||map!==instance||radar.fieldJob!==job)return;
  const batch=blocks.slice(wave,wave+3);
  const requests=await Promise.allSettled(batch.map(async b=>{
   const resp=await getJSON(q(OM,{
     latitude:b.points.map(p=>p.lat.toFixed(3)).join(','),
     longitude:b.points.map(p=>p.lon.toFixed(3)).join(','),
     hourly:'precipitation,snowfall,weather_code,precipitation_probability',
     forecast_hours:54,timeformat:'unixtime',timezone:'UTC'
   }),25000);
   return P.normalize(resp,b.points);
  }));
  if(map!==instance||radar.fieldJob!==job)return;
  requests.forEach((result,j)=>{
   if(result.status!=='fulfilled')return;
   const block=batch[j];
   for(let k=0;k<block.points.length;k++){
    const value=result.value[k];
    if(value?.hourly?.precip?.length){
     data[block.offset+k]=value;loaded++;
    }
   }
  });
 }
 if(map!==instance||radar.fieldJob!==job)return;
 radar.fieldBusy=false;radar.fieldKey='';
 if(loaded<Math.floor(grid.points.length*.55)){
   radar.fieldData=null;
   const note=$('#pmModelState');
   if(note)note.textContent=state.lang==='el'
    ?'Χωρική πρόγνωση μη διαθέσιμη τώρα · παραμένουν οι προβλέψεις πόλεων.'
    :'Spatial model forecast unavailable · city forecasts remain.';
   return;
 }
 radar.fieldData=data;
 radar.fieldCache={key:grid.key,at:Date.now(),grid,data};
 const note=$('#pmModelState');
 if(note)note.textContent=(state.lang==='el'?'Προγνωστικό πλέγμα':'Forecast grid')+
   ' · '+loaded+'/'+grid.points.length+(state.lang==='el'?' σημεία':' points');
 attachWeatherField();
}
async function loadPhenomena(instance,force=false){
  const P=window.MONOPhenomenaMap;if(!P||!instance)return;
  const c=state.city,points=P.pointsFor(c,CITIES);
  const key=points.map(p=>p.lat.toFixed(2)+','+p.lon.toFixed(2)).join('|');
  const fresh=radar.forecastCache?.key===key&&Date.now()-radar.forecastCache.at<20*60000;
  if(!force&&fresh){
    radar.futureData=radar.forecastCache.points;
    radar.futureTimes=P.timeline(radar.futureData);
    radar.futureBusy=false;
    if(radar.futureIndex>=radar.futureTimes.length)radar.futureIndex=0;
    if(map===instance)drawPhenomena();
    return;
  }
  if(radar.futureBusy&&radar.futureKey===key)return;
  const job=(radar.futureJob||0)+1;radar.futureJob=job;
  radar.futureBusy=true;radar.futureKey=key;radar.futureTimes=[];radar.futureData=[];
  if(map===instance)drawPhenomena();
  const blocks=[];for(let i=0;i<points.length;i+=15)blocks.push(points.slice(i,i+15));
  try{
    const fetched=await Promise.allSettled(blocks.map(async block=>{
      const d=await getJSON(q(OM,{
        latitude:block.map(p=>p.lat.toFixed(4)).join(','),
        longitude:block.map(p=>p.lon.toFixed(4)).join(','),
        hourly:'precipitation,snowfall,weather_code,precipitation_probability',
        forecast_hours:54,timeformat:'unixtime',timezone:'UTC'
      }),23000);
      return P.normalize(d,block);
    }));
    if(map!==instance||radar.futureJob!==job)return;
    const all=fetched.flatMap(x=>x.status==='fulfilled'?x.value:[]);
    radar.futureData=all;radar.futureTimes=P.timeline(all);
    radar.forecastCache={key,at:Date.now(),points:all};
    radar.futureBusy=false;radar.futureKey='';
    if(!radar.futureTimes.length&&radar.fieldData)radar.futureTimes=P.timeline(radar.fieldData);
    if(radar.futureTimes.length){
      const target=Date.now()+3*3600e3;let best=0;
      for(let i=1;i<radar.futureTimes.length;i++)
        if(Math.abs(radar.futureTimes[i]-target)<Math.abs(radar.futureTimes[best]-target))best=i;
      radar.futureIndex=best;
    }
    const slider=$('#pmSlider');if(slider)slider.oninput=e=>selectPhenomenaHour(+e.target.value);
    attachWeatherField();drawPhenomena();
  }catch{
    if(map!==instance||radar.futureJob!==job)return;
    radar.futureBusy=false;radar.futureKey='';drawPhenomena();
  }
}
/* Keyless Esri basemap. Never request blocked OSMF or key-required CARTO tiles. */
function baseLayers(Lf) {
  const satellite = (radar.mode==='future'?state.radarForecastBase:state.radarBasemap)==='satellite';
  const services = satellite
    ? ['World_Imagery', 'World_Topo_Map', 'World_Street_Map']
    : ['World_Topo_Map', 'World_Street_Map', 'World_Imagery'];
  const tag = (name) => name === 'World_Imagery'
    ? 'Tiles © Esri, Maxar, Earthstar Geographics and the GIS User Community'
    : 'Tiles © Esri, HERE, Garmin, USGS and the GIS User Community';
  let stopped = false;
  const make = (step) => {
    const name = services[step];
    const url = `https://server.arcgisonline.com/ArcGIS/rest/services/${name}/MapServer/tile/{z}/{y}/{x}`;
    const layer = Lf.tileLayer(url, {
      maxZoom: 18, maxNativeZoom: 16, updateWhenIdle: true,
      keepBuffer: 1, attribution: tag(name)
    });
    let errors = 0;
    layer.on('load', () => {
      if (radar.baseLayers?.[0] !== layer || stopped) return;
      const pill = $('#radarStatus');
      if (pill && pill.textContent.includes('χάρτης')) pill.textContent = state.lang === 'el' ? 'Χάρτης φορτώθηκε' : 'Map loaded';
    });
    layer.on('tileerror', () => {
      if (!map || !map.hasLayer(layer) || radar.baseLayers?.[0] !== layer || stopped) return;
      if (++errors < 2) return;
      stopped = true;
      map.removeLayer(layer);
      if (step + 1 < services.length) {
        const replacement = make(step + 1);
        radar.baseLayers = [replacement];
        replacement.addTo(map).bringToBack();
        const pill = $('#radarStatus');
        if (pill) pill.textContent = state.lang === 'el'
          ? 'Αλλαγή παρόχου χάρτη…' : 'Switching map source…';
      } else {
        const pill = $('#radarStatus');
        if (pill) pill.textContent = state.lang === 'el'
          ? 'Ο χάρτης δεν είναι διαθέσιμος · δοκίμασε ανανέωση.'
          : 'Basemap unavailable · try refreshing.';
      }
    });
    stopped = false;
    return layer;
  };
  return [make(0)];
}
// Forecast pins and observed radar deliberately occupy different Leaflet layer groups.
function setRadarBasemap(){
 if(!map)return;
 for(const layer of (radar.baseLayers||[]))if(map.hasLayer(layer))map.removeLayer(layer);
 radar.baseLayers=baseLayers(window.L);
 radar.baseLayers.forEach(layer=>layer.addTo(map).bringToBack());
 const base=radar.mode==='future'?state.radarForecastBase:state.radarBasemap;
 const btn=$('#radarStyle');if(btn)btn.textContent=state.lang==='el'?(base==='satellite'?'▧ Δρόμοι':'▧ Δορυφόρος'):(base==='satellite'?'▧ Streets':'▧ Satellite');
 const futureBtn=$('#pmStyle');if(futureBtn)futureBtn.textContent=state.lang==='el'?(base==='satellite'?'▧ Δρόμοι':'▧ Δορυφόρος'):(base==='satellite'?'▧ Streets':'▧ Satellite');
}
function toggleSat() {
  state.radarSat = !state.radarSat; persistUI();
  if (radar.sat) radar.sat.setOpacity(state.radarSat&&radar.mode==='radar'?0.45:0);
  const b = $('#radarSat'); if (b) b.setAttribute('aria-pressed', String(state.radarSat));
}
function showFrame(i) {
  if (!map || !radar.frames.length) return;
  i = (i + radar.frames.length) % radar.frames.length;
  const frame = radar.frames[i];
  const tileURL = `${radar.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
  // Keep a single active radar layer. Invisible past layers still consume tile requests.
  if (!radar.rainLayer) {
    radar.rainLayer = window.L.tileLayer(tileURL, {
      opacity: 0.88, maxNativeZoom: 7, maxZoom: 16,
      zIndex: 5, keepBuffer: 1, updateWhenIdle: true, attribution: 'RainViewer'
    }).addTo(map);
  } else {
    radar.rainLayer.setUrl(tileURL);
  }
  radar.i = i;
  const slider = $('#radarSlider');
  if (slider) slider.value = String(i);
  const time = dt(frame.time * 1000, {
    weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  const output = $('#radarTime');
  if (output) output.textContent = time;
  const status = $('#radarStatus');
  if (status && radar.mode==='radar') status.textContent = (state.lang === 'el' ? 'Πραγματική λήψη · ' : 'Radar observation · ') + time;
  if(radar.rainLayer)radar.rainLayer.setOpacity(radar.mode==='radar'?0.88:0);
}
function toggleRadar() {
  if (!map || radar.frames.length < 2) return;
  const b = $('#radarPlay');
  if (radar.timer) { clearInterval(radar.timer); radar.timer = 0; if (b) b.textContent = `▶ ${T('play')}`; return; }
  radar.timer = setInterval(() => { if (!$('#map')) { clearInterval(radar.timer); radar.timer = 0; return; } showFrame(radar.i + 1); }, 1200);
  if (b) b.textContent = `❚❚ ${T('pause')}`;
}

/* ------------------------------------------------------------------ plain-language summary */
const BFT = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118];
const beaufort = k => { const i = BFT.findIndex(x => k < x); return i < 0 ? 12 : i; };
// Beaufort applies to sustained/mean 10 m wind, not short-lived gusts.
const windBft = kmh => fin(kmh) && kmh >= 0 ? `${beaufort(kmh)} ${state.lang === 'el' ? 'Μποφόρ' : 'Bft'}` : '—';
function probWord(p) { const w = T('probWords'); return p < 0.1 ? w[0] : p < 0.3 ? w[1] : p < 0.6 ? w[2] : w[3]; }
function feelWord(t) { const w = T('feelWords'); return t < 0 ? w[0] : t < 8 ? w[1] : t < 15 ? w[2] : t < 23 ? w[3] : t < 29 ? w[4] : t < 35 ? w[5] : w[6]; }
function skyWord(code, pop) {
  const w = T('skyWords');
  if (code >= 95) return w.storm; if ([71, 73, 75, 77, 85, 86].includes(code)) return w.snow;
  if (pop >= 0.6) return w.rain; if (pop >= 0.3) return w.mixed; if (code === 45 || code === 48) return w.fog;
  return code === 3 ? w.cloudy : code === 2 ? w.partly : code === 1 ? w.mostly : w.clear;
}
function plainSummary() {
  const V = state.view, rows = V.rows, iN = V.iNow, now = Date.now(), cur = V.current, today = V.daily[0], tom = V.daily[1];
  if (!today) return null;
  const el = state.lang === 'el', s = [];
  const dayLab = t => { const i = V.daily.findIndex(d => d.key === dayKey(t, V.zone)); return i === 0 ? T('todayL') : i === 1 ? T('tomorrowL') : (i > 1 ? (el ? 'την ' : 'on ') + dt(t, { weekday: 'long' }) : ''); };
  const rest = rows.filter(r => r.t > now && dayKey(r.t, V.zone) === today.key);
  const night = rows.filter(r => r.t > now && r.t <= now + 20 * 3600e3 && (r.H >= 21 || r.H <= 7));
  const next12 = rows.slice(iN + 1, iN + 13), next24 = rows.slice(iN + 1, iN + 25);
  const headline = `${skyWord(today.code, today.pop)}, ${feelWord(today.hi)}`;
  // now
  if (fin(cur.temp)) s.push(T('sNow')(deg(cur.temp), fin(cur.feels) && Math.abs(cur.feels - cur.temp) >= 2 ? deg(cur.feels) : null, (cur.wx || desc(cur.code)).toLowerCase()));
  // rest of today / tonight
  const restMax = rest.length ? Math.max(...rest.map(r => r.temp).filter(fin)) : null, nightMin = night.length ? Math.min(...night.map(r => r.temp).filter(fin)) : null;
  if (fin(restMax) && restMax > (cur.temp ?? -99) + 1) s.push(T('sRise')(deg(restMax), fin(nightMin) ? deg(nightMin) : null));
  else if (fin(nightMin)) s.push(T('sFall')(deg(nightMin)));
  // rain
  const p0 = V.periods[0];
  if (p0 && dayKey(p0.start, V.zone) !== today.key) s.push(T('sDryToday'));
  if (p0 && p0.start < now + 48 * 3600e3) s.push(T('sRain')(`${dayLab(p0.start)} ${hhmm(p0.start)}`, hhmm(p0.end + 3600e3), probWord(p0.max), pct(p0.max), p0.mm >= 0.5 ? num(p0.mm, 0) : null));
  else if (p0) s.push(T('sRainLater')(dayLab(p0.start)));
  else if (Math.max(0, ...next24.map(r => r.pop ?? 0)) < 0.15) s.push(T('sDry'));
  // wind
  const gmax = Math.max(0, ...next24.map(r => r.gust ?? 0)), wmax = Math.max(0, ...next24.map(r => r.wind ?? 0));
  if (gmax >= 45 || wmax >= 30) s.push(T('sWind')(num(gmax), beaufort(wmax), T('bftWords')[beaufort(wmax)]));
  // tomorrow vs today
  if (tom && fin(tom.hi) && fin(today.hi)) { const d = tom.hi - today.hi; s.push(Math.abs(d) >= 2 ? T('sTomDiff')(num(Math.abs(Math.round(d))), d > 0, deg(tom.hi)) : T('sTomSame')(deg(tom.hi))); }
  // events (next 2 days)
  const ev = [];
  V.daily.slice(0, 3).forEach((d, i) => { for (const k of ['storm', 'snow', 'fog', 'wind', 'frost', 'heat', 'heavy']) if ((d.ev[k] ?? 0) >= 0.3) ev.push(`${T('ph_' + k).toLowerCase()} ${dayLab(d.t)} (${pct(d.ev[k])})`); });
  if (ev.length) s.push(T('sEvents')(ev.slice(0, 3).join(', ')));
  // official warning
  const w = Array.isArray(state.warn) ? state.warn.find(x => x.local) : null;
  if (w) s.push(T('sWarn')(w.event));
  // week outlook
  const wetD = V.daily.slice(1).filter(d => d.pop >= 0.5).map(d => dt(d.t, { weekday: 'long' })).slice(0, 3);
  const wet = wetD.length > 1 ? wetD.slice(0, -1).join(', ') + T('and') + wetD.at(-1) : wetD[0];
  const warmest = V.daily.reduce((a, d) => (!a || d.hi > a.hi ? d : a), null);
  s.push(T('sWeek')(wet || null, dt(warmest.t, { weekday: 'long' }), deg(warmest.hi)));
  // advice
  const adv = [];
  const pop12 = Math.max(0, ...next12.map(r => r.pop ?? 0));
  const dayRows = next12.filter(r => r.isDay), feelsMin = Math.min(...(dayRows.length ? dayRows : next12).map(r => r.feels ?? r.temp).filter(fin));
  if (pop12 >= 0.4) adv.push(['umbrella', T('aUmbrella')]);
  if (fin(feelsMin)) adv.push(['thermometer', feelsMin < 5 ? T('aCoatHeavy') : feelsMin < 12 ? T('aCoat') : feelsMin < 18 ? T('aJacket') : feelsMin < 26 ? T('aLight') : T('aHot')]);
  const uv = state.main?.daily?.uv_index_max?.[0];
  if (fin(uv) && uv >= 6 && rows[iN]?.isDay) adv.push(['uv', T('aUV')(num(uv))]);
  if (Math.max(0, ...next12.map(r => r.pFog ?? 0)) >= 0.3) adv.push(['fog', T('aFog')]);
  if (gmax >= 50) adv.push(['wind', T('aWind')]);
  const dry8 = Math.max(0, ...rows.slice(iN + 1, iN + 9).map(r => r.pop ?? 0)) < 0.2, rh8 = M.mean(rows.slice(iN + 1, iN + 9).map(r => r.rh));
  if (rows[iN]?.isDay) adv.push(dry8 && (rh8 ?? 100) < 80 ? ['sun', T('aLaundryYes')] : !dry8 ? ['humidity', T('aLaundryNo')] : null);
  if ((today.ev.frost ?? 0) >= 0.3 || (tom?.ev.frost ?? 0) >= 0.3) adv.push(['thermometer', T('aFrost')]);
  if ((today.ev.heat ?? 0) >= 0.3) adv.push(['sun', T('aHeat')]);
  const aq = state.aq?.current?.european_aqi; if (fin(aq) && aq > 60) adv.push(['wind', T('aAir')]);
  // best 3-hour window outdoors in the next 18 h (daylight)
  let best = null;
  for (let i = iN + 1; i < Math.min(rows.length - 2, iN + 18); i++) {
    const w3 = rows.slice(i, i + 3); if (!w3.every(r => r.isDay)) continue;
    const sc = M.mean(w3.map(r => (r.pop ?? 0) * 3 + Math.abs((r.feels ?? r.temp) - 21) / 8 + (r.wind ?? 0) / 40));
    if (!best || sc < best.sc) best = { sc, a: w3[0].t, b: w3[2].t + 3600e3 };
  }
  if (best && best.sc < 1.6) adv.push(['partly-day', T('aWalk')(`${dayLab(best.a) === T('todayL') ? '' : dayLab(best.a) + ' '}${hhmm(best.a)}–${hhmm(best.b)}`)]);
  return { headline, sentences: s, advice: adv.filter(Boolean) };
}
/* ------------------------------------------------------------------ "what to do today": practical everyday tips */
function todoGroups() {
  const V = state.view; if (!V?.daily?.length) return [];
  const rows = V.rows, iN = V.iNow, now = Date.now(), el = state.lang === 'el', X = (g, e) => (el ? g : e);
  const next = n => rows.slice(iN + 1, iN + 1 + n);
  const mx = (a, f) => Math.max(-Infinity, ...a.map(f).filter(fin)), mn = (a, f) => Math.min(Infinity, ...a.map(f).filter(fin));
  const today = V.daily[0], tom = V.daily[1];
  // daytime rows still ahead today; in the evening, tomorrow's daytime
  let day = rows.filter(r => r.t > now && r.isDay && dayKey(r.t, V.zone) === today.key), when = '';
  if (day.length < 3 && tom) { day = rows.filter(r => r.isDay && dayKey(r.t, V.zone) === tom.key); when = X('Αύριο: ', 'Tomorrow: '); }
  const night = rows.filter(r => r.t > now && r.t <= now + 22 * 3600e3 && (r.H >= 20 || r.H <= 7));
  const w14 = next(14), w48 = next(48);
  const feels = r => r.feels ?? r.temp;
  const fMin = mn(day, feels), fMax = mx(day, feels), nMin = mn(night, r => r.temp), nFeel = mn(night, feels);
  const pop14 = mx(w14, r => r.pop ?? 0), popDay = mx(day, r => r.pop ?? 0), amt14 = mx(w14, r => r.amount ?? 0);
  const gust14 = mx(w14, r => r.gust ?? 0), wind14 = mx(w14, r => r.wind ?? 0);
  const storm = mx(w14, r => r.pStorm ?? 0), fog = mx(rows.slice(iN + 1, iN + 18), r => r.pFog ?? 0), heavy = mx(w14, r => r.pHeavy ?? 0);
  const cloudDay = M.mean(day.map(r => r.cloud)), rhDay = M.mean(day.map(r => r.rh));
  const uv = state.main?.daily?.uv_index_max?.[when ? 1 : 0];
  const aq = state.aq?.current, dust = aq?.dust, eaqi = aq?.european_aqi;
  const sea = state.marine && !state.marine.error ? state.marine.current?.sea_surface_temperature : null;
  const dry48 = mx(w48, r => r.pop ?? 0) < 0.25, rainSoon = V.daily.slice(0, 2).some(d => d.pop >= 0.5);
  const dryDays = (() => { let n = 0; for (const d of V.daily) { if (d.pop >= 0.35) break; n++; } return n; })();
  const pres = rows.map(r => r.pres), dP = fin(pres[iN + 24]) && fin(pres[iN]) ? pres[iN + 24] - pres[iN] : null;
  const G = { wear: [], move: [], home: [], health: [], out: [] }, add = (g, icon, text, lvl = 0) => G[g].push({ icon, text, lvl });

  // ---- what to wear
  if (fin(fMin)) {
    const w = fMin < 0 ? X('Ισοθερμικά, βαρύ μπουφάν, σκουφί, γάντια, κασκόλ', 'Thermals, heavy coat, hat, gloves, scarf')
      : fMin < 5 ? X('Βαρύ μπουφάν, σκουφί και γάντια', 'Heavy coat, hat and gloves')
      : fMin < 10 ? X('Μπουφάν και κασκόλ', 'Coat and scarf')
      : fMin < 14 ? X('Μπουφάν ή χοντρή ζακέτα', 'Jacket or thick cardigan')
      : fMin < 18 ? X('Ζακέτα ή φούτερ', 'Cardigan or sweatshirt')
      : fMin < 22 ? X('Μακρυμάνικο, χωρίς μπουφάν', 'Long sleeves, no coat needed')
      : fMin < 27 ? X('Κοντομάνικο', 'T-shirt weather')
      : X('Ελαφριά, ανοιχτόχρωμα ρούχα', 'Light, light-coloured clothes');
    add('wear', 'thermometer', when + w + ` (${deg(fMin)}–${deg(fMax)} ${X('αίσθηση', 'feels')})`);
  }
  if (fin(fMin) && fin(fMax) && fMax - fMin >= 9) add('wear', 'thermometer', X(`Ντύσου «κρεμμύδι»: από ${deg(fMin)} πάει στους ${deg(fMax)}`, `Dress in layers: from ${deg(fMin)} up to ${deg(fMax)}`));
  if (fin(nFeel) && nFeel < 16 && (fMax ?? 0) >= 18) add('wear', 'moon', X(`Για το βράδυ πάρε μακριά ρούχα· πέφτει στους ${deg(nMin)}`, `For the evening bring long clothes; it drops to ${deg(nMin)}`));
  if (pop14 >= 0.4) {
    if (wind14 >= 35 || gust14 >= 55) add('wear', 'umbrella', X('Αδιάβροχο με κουκούλα αντί για ομπρέλα· ο αέρας θα την γυρίσει', 'Hooded rain jacket instead of an umbrella; the wind will flip it'), 1);
    else add('wear', 'umbrella', X(`Πάρε ομπρέλα (βροχή ${pct(pop14)})`, `Take an umbrella (rain ${pct(pop14)})`), 1);
    if (amt14 >= 2 || heavy >= 0.3) add('wear', 'rain', X('Κλειστά παπούτσια, όχι πάνινα ή σουέντ', 'Closed shoes; not canvas or suede'));
  } else if (pop14 >= 0.2) add('wear', 'umbrella', X('Μια μικρή ομπρέλα στην τσάντα, για σιγουριά', 'A small umbrella in the bag, just in case'));
  if (fin(cloudDay) && cloudDay < 45 && day.length) add('wear', 'sun', X('Γυαλιά ηλίου', 'Sunglasses'));
  if (fin(uv) && uv >= 6) add('wear', 'uv', X(`Αντηλιακό και καπέλο (UV ${num(uv)})`, `Sunscreen and a hat (UV ${num(uv)})`), uv >= 8 ? 1 : 0);
  if (fin(fMin) && fMin < 8 && wind14 >= 25) add('wear', 'wind', X('Παγωμένος αέρας: κάλυψε αυτιά και λαιμό', 'Biting wind: cover ears and neck'));

  // ---- getting around / car
  if (popDay >= 0.5 || pop14 >= 0.5) {
    add('move', 'rain', X('Πάρκαρε όσο πιο κοντά γίνεται στον προορισμό', 'Park as close to where you’re going as you can'));
    add('move', 'pressure', X('Φύγε 10΄ νωρίτερα· με βροχή η κίνηση χειροτερεύει', 'Leave 10 minutes early; rain slows traffic'));
  }
  if (heavy >= 0.3 || amt14 >= 4) add('move', 'rain', X('Απόφυγε υπόγεια πάρκινγκ και δρόμους που πλημμυρίζουν', 'Avoid underground car parks and roads that flood'), 1);
  if (storm >= 0.35) add('move', 'storm', X('Πιθανό χαλάζι: αν μπορείς, βάλε το αυτοκίνητο σε στεγασμένο χώρο', 'Hail is possible: park under cover if you can'), 1);
  if (gust14 >= 60) add('move', 'wind', X('Μην παρκάρεις κάτω από δέντρα, σκαλωσιές ή πινακίδες', 'Don’t park under trees, scaffolding or signs'), 1);
  if (wind14 >= 35 || gust14 >= 55) add('move', 'wind', X('Δύσκολη μέρα για μηχανή και ποδήλατο', 'A tough day for motorbikes and bikes'));
  if (fog >= 0.3) add('move', 'fog', X('Ομίχλη: χαμηλά φώτα και μεγαλύτερη απόσταση', 'Fog: low beams and longer following distance'), 1);
  if (fin(nMin) && nMin <= 1) add('move', 'thermometer', X('Πρωί με παγετό: ξύσε τα τζάμια, προσοχή σε γέφυρες και σκιές', 'Frosty morning: scrape the windows, watch bridges and shade'), 1);
  if (fin(fMax) && fMax >= 32) add('move', 'sun', X('Πάρκαρε στη σκιά ή βάλε σκίαστρο στο παρμπρίζ', 'Park in the shade or use a windscreen sunshade'));
  if (pop14 < 0.2 && wind14 < 25 && fin(fMin) && fMin >= 10 && (fMax ?? 99) <= 29) add('move', 'partly-day', X('Καλή μέρα για ποδήλατο ή περπάτημα αντί για αυτοκίνητο', 'Good day to bike or walk instead of driving'));
  if (rainSoon) add('move', 'drizzle', X('Μην πλύνεις το αυτοκίνητο, έρχεται βροχή', 'Don’t wash the car; rain is coming'));
  else if (dryDays >= 3 && !(dust > 50)) add('move', 'sun', X('Καλή στιγμή για πλύσιμο αυτοκινήτου', 'Good time to wash the car'));

  // ---- home & balcony
  const dry8 = mx(next(8), r => r.pop ?? 0) < 0.2;
  if (dust > 50) add('home', 'wind', X('Αφρικανική σκόνη: άπλωσε μέσα και κράτα τα παράθυρα κλειστά', 'Saharan dust: dry laundry inside and keep windows shut'), 1);
  else if (!dry8 || pop14 >= 0.4) add('home', 'humidity', X('Μην απλώσεις ρούχα έξω', 'Don’t hang laundry outside'), 1);
  else if (rows[iN]?.isDay || when) add('home', 'sun', (fMax >= 24 || wind14 >= 15) && (rhDay ?? 100) < 70 ? X('Άπλωσε ρούχα· θα στεγνώσουν γρήγορα', 'Hang the laundry; it will dry fast') : X('Καλή μέρα για άπλωμα', 'Good day to hang laundry'));
  if (gust14 >= 50 || storm >= 0.35) add('home', 'wind', X('Μάζεψε γλάστρες, μαξιλάρια και ό,τι πετάει από το μπαλκόνι', 'Bring in pots, cushions and anything loose from the balcony'), 1);
  if (fin(nMin) && nMin < 10) add('home', 'thermometer', X(`Απόψε θα χρειαστεί θέρμανση (${deg(nMin)})`, `You’ll need heating tonight (${deg(nMin)})`));
  else if (fin(nMin) && nMin >= 24) add('home', 'thermometer', X('Ζεστή νύχτα: κλιματιστικό ή ανεμιστήρας για ύπνο', 'Warm night: A/C or a fan for sleeping'));
  if (fin(fMax) && fMax >= 30) add('home', 'sun', X('Κλείσε παντζούρια και κουρτίνες από το πρωί', 'Close shutters and curtains from the morning'));
  if (fin(nMin) && nMin <= 1) add('home', 'snow', X('Βάλε τις ευαίσθητες γλάστρες μέσα', 'Bring sensitive plants indoors'), 1);
  if (rainSoon) add('home', 'drizzle', X('Μην ποτίσεις τον κήπο, θα το κάνει η βροχή', 'Skip watering; the rain will do it'));
  else if (dryDays >= 4 && (fMax ?? 0) >= 25) add('home', 'sun', X('Πότισε τα φυτά· δεν φαίνεται βροχή για μέρες', 'Water the plants; no rain for days'));
  const airSnapshot = MonoEnvironment.snapshot(state.aq), pollenKnown = airSnapshot.pollen.every(p => p.max !== null), pollenElevated = airSnapshot.pollen.some(p => p.level >= 1);
  if (pop14 < 0.2 && fin(fMax) && fMax >= 15 && fMax <= 28 && fin(eaqi) && eaqi <= 40 && fin(dust) && dust <= 20 && pollenKnown && !pollenElevated) add('home', 'partly-day', X('Αέρισε σύντομα, ελέγχοντας τον αέρα και τη γύρη εκείνη την ώρα', 'Air out briefly, checking air quality and pollen at that time'));

  // ---- health
  if (fin(fMax) && fMax >= 35) add('health', 'sun', X('Καύσωνας: νερό συχνά, έξω μόνο πριν τις 11:00 και μετά τις 18:00', 'Heat: drink often; go out only before 11:00 or after 18:00'), 2);
  else if (fin(fMax) && fMax >= 30) add('health', 'sun', X('Ζέστη: νερό στην τσάντα', 'Hot: carry water'));
  if (fin(fMax) && fMax >= 28 && (rhDay ?? 0) >= 60) add('health', 'humidity', X('Αποπνικτική υγρασία: κόψε την έντονη άσκηση', 'Muggy: ease off hard exercise'));
  if (eaqi > 60) add('health', 'wind', X('Κακή ποιότητα αέρα: λιγότερη άσκηση έξω', 'Poor air quality: less outdoor exercise'), 1);
  if (airSnapshot.pollen.some(p => p.level === 2)) add('health', 'partly-day', X('Αυξημένη γύρη: αν έχεις αλλεργία, έλεγξε το είδος που σε επηρεάζει στο Περιβάλλον και περιόρισε την έκθεση', 'Elevated pollen: if you have allergies, check the type affecting you under Environment and limit exposure'));
  if (fin(dP) && dP <= -6) add('health', 'pressure', X(`Πέφτει απότομα η πίεση (${num(dP)} hPa σε 24 ώρες)· όσοι έχουν ημικρανίες ίσως το νιώσουν`, `Pressure drops fast (${num(dP)} hPa in 24 h); migraine-prone people may feel it`));
  if (fin(nMin) && nMin < 3) add('health', 'thermometer', X('Πολύ κρύο βράδυ: έλεγξε τους ηλικιωμένους γείτονες', 'Very cold night: check on elderly neighbours'));

  // ---- going out
  let best = null;
  for (let i = iN + 1; i < Math.min(rows.length - 2, iN + 20); i++) {
    const w3 = rows.slice(i, i + 3); if (!w3.every(r => r.isDay)) continue;
    const sc = M.mean(w3.map(r => (r.pop ?? 0) * 3 + Math.abs(feels(r) - 21) / 8 + (r.wind ?? 0) / 40));
    if (!best || sc < best.sc) best = { sc, a: w3[0].t, b: w3[2].t + 3600e3 };
  }
  if (best && best.sc < 1.6) add('out', 'partly-day', X(`Καλύτερη ώρα για βόλτα: ${dayKey(best.a, V.zone) === today.key ? '' : 'αύριο '}${hhmm(best.a)}–${hhmm(best.b)}`, `Best time for a walk: ${dayKey(best.a, V.zone) === today.key ? '' : 'tomorrow '}${hhmm(best.a)}–${hhmm(best.b)}`));
  if (fin(sea) && sea >= 21 && fin(fMax) && fMax >= 25 && popDay < 0.3 && wind14 < 25) add('out', 'humidity', X(`Κάνει για θάλασσα (νερό ${deg(sea)})`, `Beach weather (water ${deg(sea)})`));
  const ss = state.main?.daily?.sunset?.[0] * 1000, sr = rows.find(r => fin(ss) && Math.abs(r.t - ss) < 3600e3);
  if (sr && fin(sr.cloud) && sr.cloud >= 15 && sr.cloud <= 65 && (sr.pop ?? 0) < 0.3 && ss > now) add('out', 'sunset', X(`Μάλλον ωραίο ηλιοβασίλεμα στις ${hhmm(ss)}`, `Probably a nice sunset at ${hhmm(ss)}`));
  const nightCloud = M.mean(night.slice(0, 6).map(r => r.cloud)), ph = M.moonPhase(now);
  if (fin(nightCloud) && nightCloud < 20 && (ph < 0.2 || ph > 0.8)) add('out', 'moon', X('Καθαρός ουρανός χωρίς φεγγάρι: καλή βραδιά για αστέρια', 'Clear, moonless sky: good night for stargazing'));
  if (pop14 >= 0.6 || storm >= 0.35) add('out', 'storm', X('Μέρα για σινεμά, μουσείο ή καφέ μέσα', 'A day for cinema, museums or coffee indoors'));
  if (storm >= 0.35) add('out', 'storm', X('Με καταιγίδα μακριά από θάλασσα, ανοιχτά γήπεδα και ψηλά δέντρα', 'In a thunderstorm stay away from the sea, open fields and tall trees'), 2);
  return Object.entries(G).filter(([, a]) => a.length).map(([k, items]) => ({ k, items: items.sort((a, b) => b.lvl - a.lvl) }));
}
function todoCard() {
  const G = todoGroups(); if (!G.length) return '';
  const title = { wear: T('tdWear'), move: T('tdMove'), home: T('tdHome'), health: T('tdHealth'), out: T('tdOut') };
  return `<section class="section card todo"><div class="panelhead"><div><span class="label">${T('tdLabel')}</span><h2 class="plainhead">${T('tdTitle')}</h2></div></div>
    <div class="todogrid">${G.map(g => `<div class="tdcol"><span class="label">${title[g.k]}</span>${g.items.map(it => `<div class="td lvl${it.lvl}"><img src="${iconSrc(it.icon)}" alt=""><span>${esc(it.text)}</span></div>`).join('')}</div>`).join('')}</div></section>`;
}

/* ------------------------------------------------------------------ weekend + holidays */
const longURL = c => q(OM, { ...ll(c), timezone: 'auto', forecast_days: 16, daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,weather_code,wind_gusts_10m_max' });
function orthodoxEaster(y) {   // Meeus (Julian calendar) + 13 days → Gregorian, valid 1900–2099
  const a = y % 4, b = y % 7, c = y % 19, d = (19 * c + 15) % 30, e = (2 * a + 4 * b - d + 34) % 7;
  const m = Math.floor((d + e + 114) / 31), day = ((d + e + 114) % 31) + 1;
  return new Date(Date.UTC(y, m - 1, day) + 13 * 86400e3);
}
const isoUTC = d => d.toISOString().slice(0, 10);
function greekHolidays(y) {
  const E = orthodoxEaster(y), off = n => isoUTC(new Date(E.getTime() + n * 86400e3)), el = state.lang === 'el';
  return [[`${y}-01-01`, 'Πρωτοχρονιά', 'New Year’s Day'], [`${y}-01-06`, 'Θεοφάνεια', 'Epiphany'], [off(-48), 'Καθαρά Δευτέρα', 'Clean Monday'], [`${y}-03-25`, '25η Μαρτίου', 'Independence Day'],
    [off(-2), 'Μεγάλη Παρασκευή', 'Good Friday'], [off(0), 'Πάσχα', 'Easter Sunday'], [off(1), 'Δευτέρα του Πάσχα', 'Easter Monday'], [`${y}-05-01`, 'Πρωτομαγιά', 'Labour Day'],
    [off(50), 'Αγίου Πνεύματος', 'Whit Monday'], [`${y}-08-15`, 'Δεκαπενταύγουστος', 'Assumption'], [`${y}-10-28`, 'Επέτειος του «Όχι»', 'Ochi Day'],
    [`${y}-12-25`, 'Χριστούγεννα', 'Christmas Day'], [`${y}-12-26`, 'Σύναξη της Θεοτόκου', 'Boxing Day']].map(([date, g, e]) => ({ date, name: el ? g : e }));
}
async function fetchHolidays(c) {
  const cc = (c.cc || 'GR').toUpperCase(), y = new Date().getFullYear(), el = state.lang === 'el', key = `mono_hol_${cc}_${y}_${state.lang}`;
  let list = read(key, null);
  if (!list) {
    try {
      const yrs = await Promise.all([y, y + 1].map(Y => getJSON(`https://date.nager.at/api/v3/PublicHolidays/${Y}/${cc}`, 10000)));
      list = yrs.flat().filter(h => !h.counties).map(h => ({ date: h.date, name: cc === 'GR' && el ? h.localName : h.name }));
    } catch { list = cc === 'GR' ? [...greekHolidays(y), ...greekHolidays(y + 1)] : []; }
    write(key, list);
  }
  list = list.slice();
  if (cc === 'GR') for (const Y of [y, y + 1]) {
    list.push({ date: `${Y}-12-24`, name: el ? 'Παραμονή Χριστουγέννων' : 'Christmas Eve' }, { date: `${Y}-12-31`, name: el ? 'Παραμονή Πρωτοχρονιάς' : 'New Year’s Eve' });
    if (km(c, { lat: 40.6401, lon: 22.9444 }) < 25) list.push({ date: `${Y}-10-26`, name: el ? 'Αγίου Δημητρίου (Θεσσαλονίκη)' : 'St Demetrius (Thessaloniki)', local: true });
  }
  const seen = new Set();
  return list.filter(h => (seen.has(h.date + h.name) ? false : seen.add(h.date + h.name))).sort((a, b) => (a.date < b.date ? -1 : 1));
}
/* Day-of-year climatology from ERA5 days (±3-day window): mean high/low and chance of a wet day (≥1 mm). */
function dayNormals(days) {
  const acc = Array.from({ length: 366 }, () => ({ tx: 0, tn: 0, n: 0, wet: 0, np: 0 }));
  for (const r of days) {
    const y = +r.d.slice(0, 4); if (y < 1991) continue;
    const d0 = Date.UTC(y, 0, 1), doy = Math.round((Date.parse(r.d + 'T00:00Z') - d0) / 86400e3);
    for (let k = -3; k <= 3; k++) { const j = (doy + k + 366) % 366, a = acc[j]; if (fin(r.tx) && fin(r.tn)) { a.tx += r.tx; a.tn += r.tn; a.n++; } if (fin(r.p)) { a.np++; if (r.p >= 1) a.wet++; } }
  }
  return acc.map(a => (a.n ? [Math.round(a.tx / a.n * 10) / 10, Math.round(a.tn / a.n * 10) / 10, a.np ? Math.round(a.wet / a.np * 100) / 100 : null] : null));
}
function climFor(key) {
  const dn = state.clim?.dayNormals; if (!dn) return null;
  const y = +key.slice(0, 4), doy = Math.round((Date.parse(key + 'T00:00Z') - Date.UTC(y, 0, 1)) / 86400e3), v = dn[doy];
  return v ? { src: 'clim', hi: v[0], lo: v[1], pop: v[2] } : null;
}
function dayInfo(key) {
  const V = state.view, d = V?.daily?.find(x => x.key === key);
  if (d) return { src: 'mono', hi: d.hi, lo: d.lo, pop: d.pop, mm: d.mm, code: d.code, ev: d.ev, gust: d.windMax, t: d.t };
  const L = state.long?.daily, i = L?.time?.indexOf(key) ?? -1;
  if (i >= 0) return { src: 'long', hi: L.temperature_2m_max[i], lo: L.temperature_2m_min[i], pop: fin(L.precipitation_probability_max?.[i]) ? L.precipitation_probability_max[i] / 100 : null, mm: L.precipitation_sum?.[i], code: L.weather_code?.[i], gust: L.wind_gusts_10m_max?.[i], t: Date.parse(key + 'T12:00:00Z') };
  const c = climFor(key); return c ? { ...c, t: Date.parse(key + 'T12:00:00Z') } : null;
}
const todayKeyLocal = () => dayKey(Date.now(), state.view?.zone || tz());
const keyAdd = (key, n) => isoUTC(new Date(Date.parse(key + 'T12:00:00Z') + n * 86400e3));
const weekdayOf = key => new Date(key + 'T12:00:00Z').getUTCDay();
const fmtKey = (key, o) => new Date(key + 'T12:00:00Z').toLocaleDateString(loc(), { timeZone: 'UTC', ...o });
function dayVerdict(x) {
  if (!x) return '';
  if (x.src === 'clim') return T('wkTypical')(deg(x.hi), deg(x.lo), fin(x.pop) ? pct(x.pop) : '—');
  const sky = skyWord(fin(x.code) ? x.code : 2, x.pop ?? 0);
  return `${sky}, ${feelWord(x.hi)}`;
}
function weekendCard() {
  const V = state.view; if (!V) return '';
  const t0 = todayKeyLocal(), wd = weekdayOf(t0);
  const sat = wd === 6 ? t0 : wd === 0 ? null : keyAdd(t0, 6 - wd), sun = wd === 0 ? t0 : keyAdd(sat, 1);
  const keys = [sat, sun].filter(Boolean), info = keys.map(dayInfo);
  if (!info.some(Boolean)) return '';
  const label = wd === 6 || wd === 0 ? T('wkThis') : T('wkNext');
  // which day is better for being outside
  const score = x => (x ? (x.pop ?? 0) * 3 + Math.abs((x.hi ?? 20) - 22) / 6 + (x.gust ?? 0) / 60 : 99);
  const best = keys.length === 2 && info[0] && info[1] && Math.abs(score(info[0]) - score(info[1])) > 0.4 ? (score(info[0]) < score(info[1]) ? 0 : 1) : -1;
  const both = info.every(x => x && (x.pop ?? 0) < 0.25 && x.hi >= 16 && x.hi <= 30);
  const wet = info.every(x => x && (x.pop ?? 0) >= 0.5);
  let line = both ? T('wkGood') : wet ? T('wkWet') : best >= 0 ? T('wkBest')(fmtKey(keys[best], { weekday: 'long' })) : '';
  const cards = keys.map((k, i) => { const x = info[i]; if (!x) return '';
    return `<div class="wkday ${best === i ? 'best' : ''}"><div class="wkhead"><b>${esc(fmtKey(k, { weekday: 'long', day: 'numeric', month: 'short' }))}</b>${x.src === 'long' ? `<span class="tag">${T('wkLong')}</span>` : x.src === 'clim' ? `<span class="tag">${T('wkClimTag')}</span>` : ''}</div>
      <div class="wkmain">${fin(x.code) ? icon(x.code, 1, 'wkicon') : ''}<div><span class="wkt">${deg(x.hi)}</span><span class="wkl">${deg(x.lo)}</span></div></div>
      <div class="wkverdict">${esc(dayVerdict(x))}</div>
      <div class="kvs"><span>☂ <b>${pct(x.pop)}</b></span>${fin(x.mm) && x.mm >= 0.1 ? `<span><b>${num(x.mm, 1)}</b> mm</span>` : ''}${fin(x.gust) && x.src !== 'clim' ? `<span>${T('gust')} <b>${num(x.gust)}</b> km/h</span>` : ''}</div></div>`; }).join('');
  return `<section class="section card"><div class="panelhead"><div><span class="label">${label}</span><h2 class="plainhead">${T('wkTitle')}</h2>${line ? `<p class="wkline">${esc(line)}</p>` : ''}</div></div><div class="wkgrid">${cards}</div></section>`;
}
function holidaysCard() {
  const H = state.hol; if (!Array.isArray(H) || !H.length) return '';
  const t0 = todayKeyLocal(), up = H.filter(h => h.date >= t0).slice(0, 7);
  if (!up.length) return '';
  const needClim = up.some(h => !dayInfo(h.date));
  const rows = up.map(h => {
    const x = dayInfo(h.date), dd = Math.round((Date.parse(h.date + 'T12:00:00Z') - Date.parse(t0 + 'T12:00:00Z')) / 86400e3);
    const when = dd === 0 ? T('today') : dd === 1 ? T('tomorrow') : T('inDays')(dd);
    const wx = !x ? `<span class="muted">—</span>` : x.src === 'clim'
      ? `<span class="hclim">${T('usually')} <b>${deg(x.hi)}</b> / ${deg(x.lo)} · ☂ ${pct(x.pop)}</span>`
      : `<span class="hfc">${fin(x.code) ? icon(x.code, 1, 'hicon') : ''}<b>${deg(x.hi)}</b> / ${deg(x.lo)} · ☂ ${pct(x.pop)}${x.src === 'long' ? ` <span class="tag">${T('wkLong')}</span>` : ''}</span>`;
    return `<div class="hrow"><div><b>${esc(h.name)}</b>${h.local ? ` <span class="tag">${T('localHol')}</span>` : ''}<div class="compact">${esc(fmtKey(h.date, { weekday: 'long', day: 'numeric', month: 'long' }))} · ${when}</div></div><div class="hwx">${wx}</div></div>`;
  }).join('');
  const climBtn = needClim && !state.clim?.dayNormals ? `<button class="outline-btn" data-action="climLoad">${state.clim?.loading ? `<span class="spin">◌</span> ${T('loadingYears')}` : T('holClimBtn')}</button>` : '';
  return `<section class="section card"><div class="panelhead"><div><span class="label">${T('holLabel')}</span><h2 class="plainhead">${T('holTitle')}</h2></div>${climBtn}</div>${rows}
    <p class="notice">${T('holNote')}</p></section>`;
}

function summaryCard() {
  const S = plainSummary(); if (!S) return '';
  return `<section class="section card plain"><div class="panelhead"><div><span class="label">${T('plainTitle')}</span><h2 class="plainhead">${esc(S.headline)}</h2></div></div>
    <div class="plainbody">${S.sentences.map(x => `<p>${esc(x)}</p>`).join('')}</div>
</section>`;
}
function guidePage(){
 const V=state.view, el=state.lang==='el',X=(a,b)=>el?a:b;
 const head=header(X('Ο καιρός με μια ματιά','Weather at a glance'),X('Τέσσερις οθόνες. Μεγάλα στοιχεία. Ένα άγγιγμα για λεπτομέρειες.','Four short screens. Big numbers. Tap to explore.'),btn('reload','↻ '+T('refresh')));
 if(!V||!state.obsReady&&!state.snapshot)return head+(state.mainErr?errorCard():loadingCard());
 const Rain=window.MONORainIntelligence, skill=Rain?.metrics(state.train,state.sharedRain)||{};
 const snapshot=window.MonoSpaceWeather?.snapshot(state.space||{})||null;
 const localWarnings=Array.isArray(state.warn)?state.warn.filter(w=>w.local):null;
 const data={
  zone:V.zone,current:V.current,nowCloud:V.rows[V.iNow]?.cloud,daily:V.daily||[],
  future:V.rows.filter(r=>r.t>Date.now()).slice(0,48),
  live:Rain?.present(V.stations,state.pws),gauge:Rain?.observed(V.stations,state.pws),
  aqi:state.aq?.current?.european_aqi,uv:state.main?.daily?.uv_index_max?.[0],
  seaTemp:state.marine?.current?.sea_surface_temperature,wave:state.marine?.current?.wave_height,
  sunrise:state.main?.daily?.sunrise?.[0]*1000,
  kp:snapshot?.kp,models:V.active?.length,members:V.members,rainSkill:skill.amountMae,cloudSkill:skill.cloudMae,
  warning:localWarnings?.[0]?.event,warnings:localWarnings?.length,
  news:Array.isArray(state.news?.items)?state.news.items.length:null
 };
 return head+(window.MONOQuickScreens?.render(data,state.quickScreen,state.lang)||loadingCard());
}
function glossary() {
  return `<section class="section card"><details class="gloss"><summary><b>${T('glossTitle')}</b><span class="compact">${T('glossSub')}</span></summary><dl>${T('glossList').map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl></details></section>`;
}

/* ------------------------------------------------------------------ page: globe (v3.5 — live & interactive) */
// Texture = real Earth-observation imagery composited in an equirectangular 2048×1024 canvas:
//   NASA GIBS: Blue Marble, VIIRS NOAA-20 true colour (yesterday, full day), GHRSST sea temperature, IMERG 30-min rain (latest available slot)
//   RainViewer radar composite (latest 10-min frame) — through the same-origin /proxy/rv rewrite (its tiles have no CORS).
// On top: a live Open-Meteo grid (every 15°) as clickable points + rings where it rains now, city chips, and a click-anywhere probe.
let globe = null, globeBusy = 0, globeRO = null;
const GW = 2048, GH = 1024;
const GIBS = (layer, fmt = 'image/jpeg', extra = '', w = GW, h = GH) => `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${layer}&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=${w}&HEIGHT=${h}&FORMAT=${encodeURIComponent(fmt)}${extra}`;
const G_BASES = { sat: 'gSat', marble: 'gMarble', sst: 'gSst' };
const LZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } })();
const lhm = t => dt(t, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, LZ);
const ldate = t => dt(t, { day: 'numeric', month: 'short' }, LZ);
const isoDay = ms => new Date(ms).toISOString().slice(0, 10);
const isoMin = ms => new Date(ms).toISOString().slice(0, 19) + 'Z';
function persistUI() { write('mono32_ui', { gBase: state.gBase, gLayers: state.gLayers, gGrid: state.gGrid, radarSat: state.radarSat, radarBasemap: state.radarBasemap, radarMode:radar.mode,radarForecastBase:state.radarForecastBase }); }
function loadImg(src) { return new Promise((res, rej) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = rej; im.src = src; }); }

// Latest IMERG half-hour that already has data (latency is a few hours): probe tiny images backwards in time.
let imergCache = null;
async function imergLatest() {
  if (imergCache && Date.now() - imergCache.at < 20 * 60e3) return imergCache.t;
  const step = 1800e3, base = Math.floor(Date.now() / step) * step;
  const has = async t => { try { const im = await loadImg(GIBS('IMERG_Precipitation_Rate_30min', 'image/png', `&TRANSPARENT=TRUE&TIME=${isoMin(t)}`, 128, 64)); const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d'); x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, 128, 64).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true; return false; } catch { return false; } };
  for (let k = 4; k <= 30; k += 4) {
    const ts = [0, 1, 2, 3].map(j => base - (k + j) * step), ok = await Promise.all(ts.map(has)), j = ok.indexOf(true);
    if (j >= 0) { imergCache = { t: ts[j], at: Date.now() }; return ts[j]; }
  }
  return null;
}
// RainViewer radar mosaic (Web Mercator, zoom 2) → reprojected to equirectangular rows.
async function rvRadar() {
  if (!location.protocol.startsWith('http')) throw new Error('no proxy');
  const d = await getJSON('https://api.rainviewer.com/public/weather-maps.json', 10000);
  const fr = d.radar?.past?.at(-1); if (!fr) throw new Error('no radar');
  const z = 2, n = 4, S = 256, merc = document.createElement('canvas'); merc.width = merc.height = n * S;
  const mc = merc.getContext('2d');
  let ok = 0;
  await Promise.all([...Array(n * n).keys()].map(async k => { const x = k % n, y = Math.floor(k / n); try { const im = await loadImg(`/proxy/rv${fr.path}/256/${z}/${x}/${y}/2/1_1.png`); mc.drawImage(im, x * S, y * S); ok++; } catch {} }));
  if (!ok) throw new Error('radar tiles');
  const out = document.createElement('canvas'); out.width = GW; out.height = GH; const oc = out.getContext('2d');
  for (let row = 0; row < GH; row++) {
    const lat = 90 - (row + 0.5) * 180 / GH; if (Math.abs(lat) > 85) continue;
    const phi = lat * Math.PI / 180, my = (1 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / Math.PI) / 2 * n * S;
    oc.drawImage(merc, 0, Math.floor(my), n * S, 1, 0, row, GW, 1);
  }
  return { canvas: out, time: fr.time * 1000 };
}
async function paintGlobe() {
  if (!globe) return;
  const job = ++globeBusy, base = state.gBase, Lr = state.gLayers, src = {};
  state.gStatus = 'loading'; updateGlobeCtl();
  const cv = document.createElement('canvas'); cv.width = GW; cv.height = GH; const ctx = cv.getContext('2d');
  try {
    const yday = isoDay(Date.now() - 86400e3), sstDay = isoDay(Date.now() - 2 * 86400e3);
    const [bm, top, imT, rad] = await Promise.all([
      loadImg(GIBS('BlueMarble_ShadedRelief_Bathymetry')),
      base === 'sat' ? loadImg(GIBS('VIIRS_NOAA20_CorrectedReflectance_TrueColor', 'image/png', `&TRANSPARENT=TRUE&TIME=${yday}`)).catch(() => null)
        : base === 'sst' ? loadImg(GIBS('GHRSST_L4_MUR_Sea_Surface_Temperature', 'image/png', `&TRANSPARENT=TRUE&TIME=${sstDay}`)).catch(() => null) : null,
      Lr.rain ? imergLatest().catch(() => null) : null,
      Lr.radar ? rvRadar().catch(() => null) : null
    ]);
    ctx.drawImage(bm, 0, 0, GW, GH);
    if (top) { ctx.drawImage(top, 0, 0, GW, GH); src.base = base === 'sat' ? Date.parse(yday + 'T12:00:00Z') : Date.parse(sstDay + 'T12:00:00Z'); }
    else src.base = base === 'marble' ? 'static' : null;
    if (Lr.rain && imT) { try { const im = await loadImg(GIBS('IMERG_Precipitation_Rate_30min', 'image/png', `&TRANSPARENT=TRUE&TIME=${isoMin(imT)}`)); ctx.globalAlpha = 0.9; ctx.drawImage(im, 0, 0, GW, GH); ctx.globalAlpha = 1; src.imerg = imT; } catch { src.imerg = null; } }
    if (Lr.radar && rad) { ctx.globalAlpha = 0.95; ctx.drawImage(rad.canvas, 0, 0); ctx.globalAlpha = 1; src.radar = rad.time; }
    if (job !== globeBusy || !globe) return;
    globe.globeImageUrl(cv.toDataURL('image/jpeg', 0.9));
    state.gSrc = { ...src, painted: Date.now() }; state.gStatus = 'ok';
  } catch { if (job === globeBusy) { state.gStatus = 'error'; state.gNotes = [T('gFail')]; } }
  updateGlobeCtl();
}

/* live weather grid */
const GRID = (() => { const p = []; for (let la = -60; la <= 75; la += 15) for (let lo = -180; lo < 180; lo += 15) p.push({ lat: la, lon: lo + ((la / 15) % 2 ? 7.5 : 0) }); return p; })();
async function fetchGrid(force = false) {
  const fresh = g => g && Date.now() - g.at < 10 * 60e3;
  if (!force && fresh(state.grid)) return state.grid;
  if (!force && !state.grid) { const c = read('mono35_grid', null); if (fresh(c)) { state.grid = c; return c; } }
  if (state.gridBusy) return state.grid;
  state.gridBusy = true; updateGlobeCtl();
  try {
    const B = 80, batches = [];
    for (let i = 0; i < GRID.length; i += B) batches.push(GRID.slice(i, i + B));
    const res = await Promise.all(batches.map(b => getJSON(q(OM, { latitude: b.map(p => p.lat).join(','), longitude: b.map(p => p.lon).join(','), current: 'temperature_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,is_day', timeformat: 'unixtime', timezone: 'UTC' }), 25000)));
    const pts = []; let time = 0;
    res.forEach((d, bi) => (Array.isArray(d) ? d : [d]).forEach((o, j) => { const c = o?.current; if (!c || !fin(c.temperature_2m)) return; const p = batches[bi][j]; time = Math.max(time, c.time * 1000);
      pts.push({ lat: p.lat, lon: p.lon, t: c.temperature_2m, precip: c.precipitation, code: c.weather_code, cloud: c.cloud_cover, wind: c.wind_speed_10m, dir: c.wind_direction_10m, day: c.is_day }); }));
    if (pts.length) { state.grid = { at: Date.now(), time, pts }; write('mono35_grid', state.grid); }
  } catch {}
  state.gridBusy = false;
  return state.grid;
}
function windColor(w) {
  const stops = [[0, [111, 183, 255]], [15, [88, 214, 160]], [30, [231, 210, 90]], [50, [240, 140, 60]], [75, [214, 69, 90]], [110, [155, 45, 134]]];
  if (!fin(w)) return 'rgba(200,200,200,.6)';
  for (let i = 1; i < stops.length; i++) if (w <= stops[i][0]) { const [a, ca] = stops[i - 1], [b, cb] = stops[i], f = Math.max(0, (w - a) / (b - a)); return `rgb(${ca.map((v, j) => Math.round(v + (cb[j] - v) * f)).join(',')})`; }
  return 'rgb(155,45,134)';
}
const RAIN_RGB = ['rgba(150,160,175,.35)', '#9cc3f0', '#5d9be6', '#2f74d0', '#1d4fa8', '#6b2fb3', '#b0207a'];
function gridColor(p) {
  const v = state.gGrid;
  if (v === 'wind') return windColor(p.wind);
  if (v === 'cloud') return fin(p.cloud) ? `rgba(240,244,250,${(0.12 + 0.85 * p.cloud / 100).toFixed(2)})` : 'rgba(200,200,200,.3)';
  if (v === 'precip') return RAIN_RGB[rLevel(p.precip)];
  return tempColor(p.t);
}
function gridTip(p) {
  return `<div class="gtip"><b>${deg(p.t)}</b> · ${esc(desc(p.code))}<br>${T('gWindL')} ${num(p.wind)} km/h ${fin(p.dir) ? `<span style="display:inline-block;transform:rotate(${Math.round(p.dir)}deg)">↓</span>` : ''} · ${T('gCloudL')} ${num(p.cloud)}% · ${T('rain')} ${mm1(p.precip)} mm<br><small>${num(Math.abs(p.lat))}°${p.lat >= 0 ? 'N' : 'S'} ${num(Math.abs(p.lon), 1)}°${p.lon >= 0 ? 'E' : 'W'} · ${T('rUpdated')} ${lhm(state.grid?.time)}</small></div>`;
}
function tempColor(t) {
  if (!fin(t)) return 'var(--muted)';
  const stops = [[-15, [64, 98, 210]], [0, [104, 160, 230]], [10, [126, 196, 190]], [18, [210, 200, 120]], [26, [232, 150, 70]], [34, [214, 70, 60]], [42, [150, 30, 70]]];
  for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const [a, ca] = stops[i - 1], [b, cb] = stops[i], f = Math.max(0, (t - a) / (b - a)); return `rgb(${ca.map((v, j) => Math.round(v + (cb[j] - v) * f)).join(',')})`; }
  return 'rgb(150,30,70)';
}
function globePoints() {
  const list = [...new Map([state.city, ...state.favorites, ...CITIES].map(c => [ckey(c), c])).values()];
  const pts = list.map(c => { const v = ckey(c) === ckey(state.city) && state.view?.current ? { temperature_2m: state.view.current.temp, weather_code: state.view.current.code } : state.cityLive[ckey(c)]?.current; return { c, t: v?.temperature_2m, code: v?.weather_code, me: ckey(c) === ckey(state.city) }; }).filter(p => fin(p.t));
  const kept = [];
  for (const p of pts) if (p.me || !kept.some(k => km(k.c, p.c) < 390)) kept.push(p);
  return kept;
}

/* click anywhere → live weather at that point */
async function probeAt(lat, lng) {
  lat = Math.max(-89.9, Math.min(89.9, +(+lat).toFixed(3))); lng = +(((+lng + 540) % 360) - 180).toFixed(3);
  const id = Date.now(); state.probe = { id, lat, lon: lng, loading: true }; updateGlobeCtl();
  try {
    const [d, nm] = await Promise.all([
      getJSON(q(OM, { latitude: lat, longitude: lng, current: 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m,wind_direction_10m,is_day', hourly: 'precipitation,precipitation_probability', forecast_hours: 7, timeformat: 'unixtime', timezone: 'auto' }), 15000),
      reverseName(lat, lng)
    ]);
    if (state.probe?.id !== id) return;
    const H = d.hourly || {}, now = Date.now();
    const idx = (H.time || []).map((t, i) => [t * 1000, i]).filter(([t]) => t > now && t <= now + 6 * 3600e3 + 60e3).map(([, i]) => i);
    state.probe = { ...state.probe, loading: false, cur: d.current, name: nm, mm: idx.reduce((a, i) => a + (H.precipitation?.[i] || 0), 0), pp: Math.max(0, ...idx.map(i => H.precipitation_probability?.[i] ?? 0)) / 100 };
  } catch { if (state.probe?.id === id) state.probe = { ...state.probe, loading: false, error: true }; }
  updateGlobeCtl();
}
function probeCard() {
  const P = state.probe; if (!P) return `<div class="gprobe hint">${T('gClick')}</div>`;
  const where = P.name?.name ? `${esc(P.name.name)}${P.name.country ? `<small>${esc(P.name.country)}</small>` : ''}` : `${T('gPointAt')}<small>${num(P.lat, 2)}, ${num(P.lon, 2)}</small>`;
  if (P.loading) return `<div class="gprobe"><button class="gx" data-action="gProbeClose" aria-label="×">×</button><b class="gpn">${where}</b><p><span class="spin">◌</span> ${T('gProbeLoading')}</p></div>`;
  if (P.error || !P.cur) return `<div class="gprobe"><button class="gx" data-action="gProbeClose" aria-label="×">×</button><b class="gpn">${where}</b><p>${T('noData')}</p></div>`;
  const c = P.cur, t = c.time * 1000;
  return `<div class="gprobe"><button class="gx" data-action="gProbeClose" aria-label="×">×</button><b class="gpn">${where}</b>
    <div class="gpt">${icon(c.weather_code, c.is_day)}<span>${deg(c.temperature_2m)}</span><em>${esc(desc(c.weather_code))}<br><small>${T('feels')} ${deg(c.apparent_temperature)}</small></em></div>
    <div class="gpk"><span>${T('gWindL')} <b>${num(c.wind_speed_10m)} km/h ${dirArrow(c.wind_direction_10m)}${fin(c.wind_speed_10m) ? ` · ${windBft(c.wind_speed_10m)}` : ''}</b></span><span>${T('gust')} <b>${num(c.wind_gusts_10m)}</b></span><span>${T('gHumL')} <b>${num(c.relative_humidity_2m)}%</b></span><span>${T('gCloudL')} <b>${num(c.cloud_cover)}%</b></span>
    <span class="w">${T('gNext6')} <b>${P.pp >= 0.05 || P.mm >= 0.1 ? `${pct(P.pp)} · ${mm1(P.mm)} mm` : T('gNoRain6')}</b></span></div>
    <small class="muted">${T('rUpdated')} ${lhm(t)} · ${esc(ageText(t))}</small>
    <button class="outline-btn" data-action="gProbeOpen">${T('gOpenHere')}</button></div>`;
}
function globeFresh() {
  const S = state.gSrc || {}, Lr = state.gLayers;
  const ag = t => `${lhm(t)} · ${esc(ageText(t))}`;
  const baseName = { sat: 'gSrcSat', marble: 'gSrcMarble', sst: 'gSrcSst' }[state.gBase];
  const baseVal = S.base === 'static' ? T('gStatic') : fin(S.base) ? `${ldate(S.base)} · ${T('gDaily')}` : state.gStatus === 'loading' ? '…' : T('gNA');
  const cityAt = Math.max(0, ...Object.values(state.cityLive).map(v => (v?.current ? v.at : 0)));
  const row = (k, v, live) => `<div class="kv"><span>${live ? '<i class="gl-live"></i>' : ''}${T(k)}</span><b>${v}</b></div>`;
  return `<div class="panelhead"><div><b>${T('gFresh')}</b><div class="section-sub">${T('gAuto')}</div></div><button class="outline-btn" data-action="gRefresh">${T('gRefresh')}</button></div>
    ${row(baseName, baseVal)}
    ${row('gSrcRadar', !Lr.radar ? T('gOff') : fin(S.radar) ? ag(S.radar) : state.gStatus === 'loading' ? '…' : T('gNA'), fin(S.radar) && Lr.radar)}
    ${row('gSrcImerg', !Lr.rain ? T('gOff') : fin(S.imerg) ? `${lhm(S.imerg)}–${lhm(S.imerg + 1800e3)} · ${esc(ageText(S.imerg + 1800e3))}` : state.gStatus === 'loading' ? '…' : T('gNA'))}
    ${row('gSrcGrid', !Lr.grid ? T('gOff') : state.grid ? `${ag(state.grid.time)} · ${num(state.grid.pts.length)} pts` : state.gridBusy ? '…' : T('gNA'), !!state.grid && Lr.grid)}
    ${row('gSrcCities', !Lr.temps ? T('gOff') : cityAt ? ag(cityAt) : '…', !!cityAt && Lr.temps)}
    <p class="notice">${T('gNoteFoot')}</p>`;
}
function globeLegend() {
  if (!state.gLayers.grid && !state.gLayers.temps) return '';
  const v = state.gLayers.grid ? state.gGrid : 'temp';
  if (v === 'wind') return `<div class="glegend"><span>0</span><i style="background:linear-gradient(90deg,${[0, 15, 30, 50, 75, 110].map(windColor).join(',')})"></i><span>110 km/h</span></div>`;
  if (v === 'cloud') return `<div class="glegend"><span>0%</span><i style="background:linear-gradient(90deg,rgba(240,244,250,.12),rgba(240,244,250,.97))"></i><span>100%</span></div>`;
  if (v === 'precip') return `<div class="glegend"><span>0,1</span><i style="background:linear-gradient(90deg,${RAIN_RGB.slice(1).join(',')})"></i><span>30+ mm/h</span></div>`;
  return `<div class="glegend"><span>−15°</span><i style="background:linear-gradient(90deg,${[-15, 0, 10, 18, 26, 34, 42].map(tempColor).join(',')})"></i><span>42°</span></div>`;
}
function globeCtl() {
  const chip = (act, v, on, label) => `<button class="chip ${on ? 'active' : ''}" data-action="${act}" data-v="${v}">${label}</button>`;
  const Lr = state.gLayers;
  return `<div class="gctl"><div class="chips">${Object.entries(G_BASES).map(([k, l]) => chip('gBase', k, state.gBase === k, T(l))).join('')}</div>
    <div class="chips">${chip('gLayer', 'radar', Lr.radar, T('gRadar'))}${chip('gLayer', 'rain', Lr.rain, T('gRain'))}${chip('gLayer', 'grid', Lr.grid, T('gGridL'))}${chip('gLayer', 'temps', Lr.temps, T('gTemps'))}${chip('gSpin', '1', state.gSpin, T('gSpin'))}</div>
    ${Lr.grid ? `<div class="chips"><span class="label gvl">${T('gVar')}</span>${['temp', 'wind', 'cloud', 'precip'].map(k => chip('gGrid', k, state.gGrid === k, T('gV_' + k))).join('')}</div>` : ''}</div>
    <p class="notice">${state.gStatus === 'loading' || state.gridBusy ? `<span class="spin">◌</span> ${T('loading')}` : state.gStatus === 'error' ? esc(T('gFail')) : ''}</p>`;
}
function applyGlobeData() {
  if (!globe) return;
  const G = state.gLayers.grid && state.grid ? state.grid.pts : [];
  globe.pointColor(gridColor).pointAltitude(p => (state.gGrid === 'precip' ? 0.004 + Math.min(0.08, (p.precip ?? 0) * 0.012) : 0.004)).pointsData(G);
  globe.ringsData(G.filter(p => (p.precip ?? 0) >= 0.1));
  const html = state.gLayers.temps ? globePoints() : [];
  if (state.probe) html.push({ probe: true, c: { lat: state.probe.lat, lon: state.probe.lon } });
  const markers=window.MONOEarthGlobe ? window.MONOEarthGlobe.embellish(state.lang,html) : html;
  globe.htmlElementsData(markers);
  if(window.MONOEarthGlobe)window.MONOEarthGlobe.sync(globe);
}
function updateGlobeCtl() {
  const set = (id, h) => { const el = $(id); if (el) el.innerHTML = h; };
  set('#globeCtl', globeCtl()); set('#globeFresh', globeFresh()); set('#globeLegend', globeLegend()); set('#globeProbe', probeCard());
  if(window.MONOEarthGlobe){set('#earthGlobeCtl',window.MONOEarthGlobe.toolbar(state.lang));set('#earthGlobeSide',window.MONOEarthGlobe.info(state.lang));set('#earthGlobeTime',window.MONOEarthGlobe.timeline(state.lang));}
  applyGlobeData();
}
function globePage() {
  return header(T('globeTitle'), T('globeSub')) + `<div class="earth-globe-cta"><button class="outline-btn" data-action="goto" data-page="earth">◈ ${T('earth')} · ENSO / NAO / MJO ↗</button></div>
    <section id="earthGlobeCtl"></section>
    <details class="earth-globe-details"><summary>${state.lang==='el'?'Δορυφόρος, καιρικά επίπεδα & περιστροφή':'Satellite, weather layers & rotation'}</summary><div id="globeCtl">${globeCtl()}</div></details>
    <div class="earth-globe-split"><div class="card globecard earth-globecard"><div id="globe" class="globe"></div><div id="globeProbe" class="gprobe-wrap">${probeCard()}</div><div id="globeLegend">${globeLegend()}</div></div><aside id="earthGlobeSide" class="earth-globe-side"></aside></div>
    <section class="earth-timeline" id="earthGlobeTime"></section>
    <details class="earth-globe-details"><summary>${state.lang==='el'?'Χρόνοι ενημέρωσης πηγών':'Source update times'}</summary><section class="card" id="globeFresh">${globeFresh()}</section></details>`;
}
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.integrity = 'sha384-UIZDw6UdEIau7arIrg1Ug9IeMaLlfIHHF6awQRUsvId92iYakt5KLbHNEDQJF5QP'; s.crossOrigin = 'anonymous'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
async function mountGlobe() {
  const el = $('#globe'); if (!el || globe) return;
  try {
    if (!window.Globe) await loadScript('https://cdn.jsdelivr.net/npm/globe.gl@2.45.3/dist/globe.gl.min.js');
    if (!$('#globe') || globe) return;
    const box = $('#globe');
    globe = new window.Globe(box, { animateIn: true })
      .width(box.clientWidth).height(box.clientHeight).backgroundColor('rgba(0,0,0,0)')
      .showAtmosphere(true).atmosphereColor(state.theme === 'dark' ? '#9fb7d9' : '#7fa2d6').atmosphereAltitude(0.16)
      .pointLat('lat').pointLng('lon').pointRadius(2.3).pointResolution(8).pointsMerge(false).pointsTransitionDuration(400).pointLabel(gridTip)
      .onPointClick(p => probeAt(p.lat, p.lon))
      .ringLat('lat').ringLng('lon').ringColor(() => t => `rgba(110,170,255,${(0.9 * (1 - t)).toFixed(2)})`).ringMaxRadius(3.2).ringPropagationSpeed(1.4).ringRepeatPeriod(1700)
      .onGlobeClick(({ lat, lng }) => { if(window.MONOStormLens?.state.armed) window.MONOStormLens.pick(lat,lng); else probeAt(lat,lng); })
      .htmlLat(p => p.c.lat).htmlLng(p => p.c.lon).htmlAltitude(p => (p.probe ? 0.02 : 0.01))
      .htmlElement(p => {
        if(p.earth && window.MONOEarthGlobe)return window.MONOEarthGlobe.makeMarker(p.marker,state.lang);
        const d = document.createElement(p.probe ? 'div' : 'button');
        if (p.probe) { d.className = 'gpin'; d.innerHTML = '<i></i>'; return d; }
        d.className = 'gchip' + (p.me ? ' me' : ''); d.style.setProperty('--c', tempColor(p.t)); d.innerHTML = `<b>${deg(p.t)}</b><span>${esc(cityName(p.c))}</span>`;
        d.onclick = e => { e.stopPropagation(); setCity(p.c); goto('now'); }; d.style.pointerEvents = 'auto'; return d;
      });
    globe.controls().autoRotate = state.gSpin; globe.controls().autoRotateSpeed = 0.35; globe.controls().enableDamping = true;
    globe.controls().addEventListener('start', () => { if (state.gSpin) { state.gSpin = false; globe.controls().autoRotate = false; updateGlobeCtl(); } });
    globe.pointOfView({ lat: state.city.lat, lng: state.city.lon, altitude: window.innerWidth < 640 ? 2.9 : 2.1 }, 0);
    globeRO?.disconnect(); globeRO = new ResizeObserver(() => { const b = $('#globe'); if (globe && b) globe.width(b.clientWidth).height(b.clientHeight); }); globeRO.observe(box);
    applyGlobeData();
    paintGlobe();
    fetchGrid().then(() => updateGlobeCtl());
    if(window.MONOEarth)window.MONOEarth.load(false).then(()=>{if(globe && $('#globe'))updateGlobeCtl();});
  } catch { const g = $('#globe'); if (g) g.innerHTML = `<div class="placeholder">${T('gFail')}</div>`; }
}
function refreshGlobe(force) { if (!globe) return; imergCache = force ? null : imergCache; paintGlobe(); fetchGrid(force).then(() => updateGlobeCtl()); loadCityLive(); }
// called every minute while the globe page is open: refresh radar + grid when they are 10 minutes old
function globeTick() {
  if (!globe || document.visibilityState !== 'visible') return;
  if (!state.gSrc?.painted || Date.now() - state.gSrc.painted > 10 * 60e3) paintGlobe();
  if (!state.grid || Date.now() - state.grid.at > 10 * 60e3) fetchGrid(true).then(() => updateGlobeCtl());
  else updateGlobeCtl();
}
function killGlobe() { globeRO?.disconnect(); globeRO = null; if (globe) { try { globe.pauseAnimation(); globe._destructor(); } catch {} globe = null; } }

/* ------------------------------------------------------------------ page: models */
function modelsPage() {
  const V = state.view;
  const head = header(T('modelsTitle'), T('modelsSub'), btn('reloadModels', '↻ ' + T('refresh')));
  if (!V) return head + (state.mainErr ? errorCard() : loadingCard());
  const rows = V.rows.slice(V.iNow, V.iNow + 168), sel = Math.min(state.sel, rows.length - 1), at = rows[sel];
  const key = { temp: 'T', rain: 'P', wind: 'W' }[state.mvar];
  const series = V.order.filter(id => !V.dup[id]).map(id => ({ vals: rows.map(r => r.models[id]?.[key]), cls: 'model' }));
  const mono = state.mvar === 'temp' ? rows.map(r => r.temp) : state.mvar === 'wind' ? rows.map(r => r.wind) : rows.map(r => r.amount);
  series.push({ vals: mono, cls: 'mono' });
  const ch = chart({ rows, series, band: state.mvar === 'temp' ? { lo: rows.map(r => r.ens?.q10 ?? null), hi: rows.map(r => r.ens?.q90 ?? null) } : null, unit: state.mvar === 'temp' ? '°' : '' });
  const k = Math.max(0, Math.min(5, Math.floor((at.t - Date.now()) / 86400e3))), Lk = M.leadFit(state.train?.temp, k);
  const unitTxt = state.mvar === 'temp' ? '°' : state.mvar === 'wind' ? ' km/h' : ' mm';
  const fmtV = v => (fin(v) ? (state.mvar === 'temp' ? deg(v) : num(v, state.mvar === 'rain' ? 1 : 0) + unitTxt) : '—');
  const tbl = MODELS.map(m => {
    const r = state.models[m.id], d = V.md[m.id];
    const status = !r ? `<span class="muted">${T('loading')}</span>` : r.error ? `<span class="muted">${T('failed')}</span>` : d?.nocover ? `<span class="muted">${T('noCover')}</span>`
      : V.dup[m.id] ? `<span class="muted">${T('dupOf')} ${esc(MODELS.find(x => x.id === V.dup[m.id])?.name)}</span>` : `<span class="dot"></span>${T('ok')}`;
    const w = Lk?.prod?.mos?.models?.[m.id]?.weight, hm = Lk?.perModel?.[m.id], lv = V.live[m.id];
    return `<tr class="${V.active.includes(m.id) ? '' : 'off'}"><td><b>${esc(m.name)}</b><div class="compact">${esc(m.org)}</div></td><td><span class="tag ${m.kind}">${T(m.kind)}</span></td><td class="num">${fmtV(at.models[m.id]?.[key])}</td>
      <td><div class="wbar"><span style="width:${fin(w) ? Math.round(w * 100) : 0}%"></span></div><small>${fin(w) ? Math.round(w * 100) + '%' : '—'}</small></td>
      <td class="num hide-sm">${hm ? `${num(hm.rawMae, 2)}° → ${num(hm.corMae, 2)}°` : '—'}</td><td class="num hide-sm">${lv ? `${num(lv.mae, 1)}° <small>(${sgn(lv.bias)})</small>` : '—'}</td><td class="hide-sm">${status}</td></tr>`;
  }).join('');
  const monoRow = `<tr class="monorow"><td><b>MONO</b><div class="compact">${esc(AN(Lk?.choice || 'untrained'))}</div></td><td><span class="tag mono">ML</span></td><td class="num"><b>${fmtV(mono[sel])}</b></td><td></td><td class="num hide-sm">${Lk ? `${num(Lk.test[Lk.choice]?.mae, 2)}°` : '—'}</td><td class="num hide-sm">${V.live.__mono ? `${num(V.live.__mono.mae, 1)}°` : '—'}</td><td class="hide-sm"></td></tr>`;
  const ens = ENSEMBLES.map(e => { const r = state.ens[e.id], info = V.famInfo[e.id]; const st = !r ? T('loading') : r.error ? T('failed') : info?.nocover ? T('noCover') : `${info?.members ?? 0}`;
    return `<tr class="${info?.members ? '' : 'off'}"><td><b>${esc(e.name)}</b><div class="compact">${esc(r?.used || e.id)}${info?.vars?.length ? ' · ' + info.vars.join(', ') : ''}</div></td><td class="num">${st}</td></tr>`; }).join('');
  return head + `<div class="chips">${[['temp', 'varTemp'], ['rain', 'varRain'], ['wind', 'varWind']].map(([v, l]) => `<button class="chip ${state.mvar === v ? 'active' : ''}" data-action="mvar" data-v="${v}">${T(l)}</button>`).join('')}</div>
    <div class="card">${ch}${legend([['mono', 'MONO'], ['model', T('legendModels')], ...(state.mvar === 'temp' ? [['band', 'Ensemble P10–P90']] : [])])}</div>
    <section class="section"><div class="sectionhead"><div><h2 class="h2">${esc(dt(at.t, { weekday: 'long', day: 'numeric', month: 'short' }))} · ${hhmm(at.t)}</h2><div class="section-sub">${T('leadDay')} ${T('d')}+${k}</div></div><input type="range" id="selHour" min="0" max="${rows.length - 1}" value="${sel}" aria-label="${T('time')}"></div>
      <div class="card tablecard"><div class="tablewrap"><table class="metric-table"><thead><tr><th>${T('model')}</th><th>${T('type')}</th><th>${T('valueAt')}</th><th>${T('weight')}</th><th class="hide-sm">${T('skill')}</th><th class="hide-sm">${T('live72')}</th><th class="hide-sm">${T('status')}</th></tr></thead><tbody>${monoRow}${tbl}</tbody></table></div></div></section>
    <section class="section dual"><div class="card"><div class="panelhead"><div><b>${T('ensTitle')}</b><div class="section-sub">${T('ensSub')}</div></div></div><div class="tablewrap"><table class="metric-table"><thead><tr><th>${T('system')}</th><th>${T('membersCol')}</th></tr></thead><tbody>${ens}</tbody></table></div></div>
      <div class="card"><div class="panelhead"><b>${esc(hhmm(at.t))}</b></div>${at.ens ? `<div class="kv"><span>${T('spread')}</span><b>±${num(at.ens.sd, 1)}°</b></div><div class="kv"><span>Ensemble P10–P90</span><b>${deg(at.ens.q10)} – ${deg(at.ens.q90)}</b></div>` : ''}<div class="kv"><span>${T('pRain')} ensemble</span><b>${pct(at.pEns)}</b></div><div class="kv"><span>${T('pRain')} MONO-ML</span><b>${pct(at.pMono)}</b></div><div class="kv"><span>${T('pRain')} ${T('finalP')}</span><b>${pct(at.pop)}</b></div><div class="kv"><span>${T('ph_storm')}</span><b>${pct(at.pStorm)}</b></div><div class="kv"><span>${T('legendBand')}</span><b>${deg(at.lo)} – ${deg(at.hi)}</b></div></div></section>`;
}

/* ------------------------------------------------------------------ page: MONO lab */
function labPage() {
  const V = state.view, tr = state.train;
  const head = header(T('labTitle'), T('labSub'), btn('retrain', '↻ ' + T('retrain')));
  if (!V) return head + loadingCard();
  const k = state.lead, LT = tr?.temp?.leads?.[k], LW = tr?.wind?.leads?.[k], LP = tr?.precip?.leads?.[k];
  const chips = `<div class="chips">${M.LEADS.map(n => `<button class="chip ${k === n ? 'active' : ''}" data-action="lead" data-n="${n}">${T('d')}+${n} · ${n * 24}–${n * 24 + 24}h</button>`).join('')}</div>`;
  let body;
  if ((state.trainStatus === 'loading' || state.trainStatus === 'idle') && !tr) body = loadingCard(T('trainingNow'));
  else if (!LT) body = `<div class="card placeholder"><b>${T('untrained')}</b>${state.trainStatus === 'error' ? T('trainFail') : ''}<div class="spacer10"></div>${btn('retrain', T('retrain'))}</div>`;
  else {
    const t = LT.test, ch = LT.choice, clim = t.clim?.mae, best = LT.prod.best?.id;
    const gain = t.mean?.mae ? (1 - t[ch].mae / t.mean.mae) * 100 : null;
    const stats = `<div class="stat-grid">
      ${mini(T('holdTemp'), `${num(t[ch]?.mae, 2)}°`, `${esc(AN(ch))} · ${T('vsMean')} ${num(t.mean?.mae, 2)}°${fin(gain) ? ` (${gain >= 0 ? '−' : '+'}${num(Math.abs(gain))}%)` : ''}`, 'thermometer')}
      ${mini(T('vsBest'), `${num(t.best?.mae, 2)}°`, esc(MODELS.find(m => m.id === best)?.name || '—'), 'sun')}
      ${mini(T('brier'), LP ? num(LP.test[LP.choice], 3) : '—', LP ? `${esc(AN(LP.choice))} · ${T('clim')} ${num(LP.test.clim, 3)}` : T('brierNote'), 'umbrella')}
      ${mini(T('windMae'), LW ? `${num(LW.test[LW.choice]?.mae, 1)} <small>km/h</small>` : '—', LW ? `${esc(AN(LW.choice))} · ${T('vsMean')} ${num(LW.test.mean?.mae, 1)}` : '', 'wind')}</div>`;
    const names = [...M.LIVE, 'combo', 'clim', 'persist'].filter(m => t[m]);
    const maxMae = Math.max(...names.map(m => t[m].mae));
    const zoo = names.map(m => { const isBase = m === 'clim' || m === 'persist', sk = fin(clim) && clim > 0 && !isBase ? 1 - t[m].mae / clim : null;
      return `<div class="zoorow ${m === ch ? 'me' : ''} ${isBase ? 'base' : ''}"><span><b>${esc(AN(m))}</b>${m === ch ? ` <em>${T('chosen')}</em>` : ''}${isBase ? ` <em class="soft">${T('baseline')}</em>` : ''}${m === 'combo' ? `<small>${Object.entries(LT.combo).map(([a, w]) => `${esc(AN(a))} ${Math.round(w * 100)}%`).join(' · ')}</small>` : ''}</span>
        <div class="wbar"><span style="width:${(100 * t[m].mae / maxMae).toFixed(0)}%"></span></div><b>${num(t[m].mae, 2)}°</b><small class="hide-sm">${num(t[m].rmse, 2)}°</small><small class="hide-sm">${fin(sk) ? `${num(sk * 100)}%` : '—'}</small><small class="hide-sm">${LT.val[m] ? num(LT.val[m].mae, 2) + '°' : '—'}</small></div>`; }).join('');
    const rows = V.rows.slice(V.iNow, V.iNow + 72);
    const zchart = chart({ rows, series: [...M.LIVE.filter(m => m !== ch).map(m => ({ vals: rows.map(r => r.methods?.[m] ?? null), cls: 'model' })), { vals: rows.map(r => r.methods?.[ch] ?? null), cls: 'mono' }] });
    const mos = LT.prod.mos?.models || {}, ids = Object.keys(mos).sort((a, b) => mos[b].weight - mos[a].weight);
    const wt = ids.map(id => { const m = mos[id], pm = LT.perModel[id], amp = Math.hypot(m.bias[1], m.bias[2]);
      return `<tr><td><b>${esc(MODELS.find(x => x.id === id)?.name || id)}</b></td><td><div class="wbar"><span style="width:${Math.round(m.weight * 100)}%"></span></div><small>${Math.round(m.weight * 100)}%</small></td><td class="num">${sgn(m.bias[0], 2)}°</td><td class="num hide-sm">±${num(amp, 2)}°</td><td class="num">${pm ? num(pm.rawMae, 2) + '°' : '—'}</td><td class="num">${pm ? num(pm.corMae, 2) + '°' : '—'}</td><td class="num hide-sm">${m.n}</td></tr>`; }).join('');
    const rain = LP ? `<div class="card"><div class="panelhead"><b>${T('rainBlock')}</b><span class="badge">${esc(AN(LP.choice))}</span></div>
      ${[...M.RAIN_LIVE, 'combo', 'clim'].filter(m => fin(LP.test[m])).map(m => `<div class="kv ${m === LP.choice ? 'strong' : ''}"><span>Brier · ${esc(AN(m))}</span><b>${num(LP.test[m], 3)}</b></div>`).join('')}
      <div class="kv"><span>${T('pod')}</span><b>${pct(LP.pod)}</b></div><div class="kv"><span>${T('far')}</span><b>${pct(LP.far)}</b></div><div class="kv"><span>${T('wetHours')}</span><b>${LP.wetTest} / ${LP.n.test}</b></div><p class="notice">${T('brierNote')}</p></div>` : `<div class="card placeholder"><b>${T('rainBlock')}</b>${T('untrained')}</div>`;
    body = stats + `<section class="section card"><div class="panelhead"><div><b>${T('zooTitle')}</b><div class="section-sub">${T('zooSub')} · ${T('d')}+${k}</div></div></div>
      <div class="zoohead hide-sm"><span>${T('algo')}</span><span></span><span>${T('maeTest')}</span><span>RMSE</span><span>${T('skillClim')}</span><span>${T('maeVal')}</span></div>${zoo}
      <p class="notice">${T('period')}: ${esc(tr.start)} → ${esc(tr.end)} · ${tr.hours} h · ${tr.models} ${T('modelsUsed')} · ${T('split')}: ${LT.n.train} / ${LT.n.val} / ${LT.n.test} h · ${T('truth')}: ERA5</p></section>
      <section class="section card"><div class="panelhead"><b>${T('zooChart')}</b></div>${zchart}${legend([['mono', esc(AN(ch))], ['model', T('others')]])}</section>
      <section class="section card"><div class="panelhead"><b>${T('modelTable')}</b><span class="badge">${T('d')}+${k}</span></div><div class="tablewrap"><table class="metric-table"><thead><tr><th>${T('model')}</th><th>${T('weight')}</th><th>${T('bias')}</th><th class="hide-sm">${T('diurnal')}</th><th>${T('rawMae')}</th><th>${T('corMae')}</th><th class="hide-sm">${T('samples')}</th></tr></thead><tbody>${wt}</tbody></table></div></section>
      <section class="section dual">${rain}${stationCard()}</section>`;
  }
  const steps = `<section class="section card"><div class="panelhead"><b>${T('steps')}</b></div><ol class="steps">${T('stepsList').map(([a, b]) => `<li><b>${a}</b><span>${b}</span></li>`).join('')}</ol></section>`;
  return head + chips + body + liveCard() + steps;
}
function stationCard() {
  const V = state.view, S = V.S;
  if (!S) return `<div class="card"><div class="panelhead"><b>${T('stationBlock')}</b></div><p class="notice">${T('noStation')}</p></div>`;
  return `<div class="card"><div class="panelhead"><b>${T('stationBlock')}</b><span class="badge">${esc(V.station.id)} · ${num(V.station.dist)} km</span></div>
    <div class="kv"><span>${T('offset')}</span><b>${sgn(S.coef[0] * S.shrink, 2)}°</b></div><div class="kv"><span>${T('diurnal')}</span><b>±${num(Math.hypot(S.coef[1], S.coef[2]) * S.shrink, 2)}°</b></div>
    <div class="kv"><span>${T('tau')}</span><b>${num(S.tau, 1)} h</b></div><div class="kv"><span>ρ(1h)</span><b>${num(S.rho, 2)}</b></div>
    <div class="kv"><span>${T('maeBefore')} → ${T('maeAfter')}</span><b>${num(S.mae, 2)}° → ${num(S.maeAfter, 2)}°</b></div><div class="kv"><span>${T('samples')}</span><b>${S.n}</b></div>
    <p class="notice mono-raw">${esc(V.station.last?.raw || '')}</p><p class="notice">${esc(V.station.source)} · ${esc(V.station.name || '')}</p></div>`;
}
function liveCard() {
  const V = state.view; const ids = Object.keys(V.live).filter(id => !id.startsWith('__')).sort((a, b) => V.live[a].mae - V.live[b].mae);
  if (!ids.length) return '';
  const max = Math.max(...ids.map(id => V.live[id].mae), V.live.__mono?.mae || 0, V.live.__mean?.mae || 0);
  const row = (name, d, cls = '') => `<div class="livebar ${cls}"><span>${esc(name)}</span><div class="wbar"><span style="width:${(100 * d.mae / max).toFixed(0)}%"></span></div><b>${num(d.mae, 2)}°</b><small>${sgn(d.bias)}°</small></div>`;
  return `<section class="section card"><div class="panelhead"><div><b>${T('liveCheck')}</b><div class="section-sub">${esc(V.station.id)} · ${V.live.__mono?.n || ''} h · MAE</div></div></div>
    ${V.live.__station ? row(T('stationOos'), V.live.__station, 'me') : ''}${V.live.__mono ? row('MONO', V.live.__mono, 'me') : ''}${V.live.__mean ? row(AN('mean'), V.live.__mean) : ''}${ids.map(id => row(MODELS.find(m => m.id === id)?.name || id, V.live[id])).join('')}</section>`;
}

/* ------------------------------------------------------------------ weather news (publishers' RSS via /api/news) */
const NEWS_TTL = 15 * 60e3;
async function loadNews(force = false) {
  if (!location.protocol.startsWith('http')) return;
  if (!force && state.news?.items && Date.now() - state.news.at < NEWS_TTL) return;
  try { const d = await getJSON('/api/news', 20000); state.news = { items: d.items || [], at: Date.now() }; }
  catch { if (!state.news?.items) state.news = { error: true, at: Date.now() }; }
  if (state.page === 'news' || state.page === 'now' || state.page === 'maps') render();
}
const fold = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ς/g, 'σ');
function placeStems(c) {
  const names = [c.name, c.nameEl, ...Object.values(c.i18n || {}).map(x => x?.name)].filter(Boolean).map(fold);
  // Greek names decline (Θεσσαλονίκη → Θεσσαλονίκης), so match on the stem
  return [...new Set(names.map(n => (n.length > 6 && /[α-ω]$/.test(n) ? n.slice(0, -2) : n.length > 4 && /[α-ω]$/.test(n) ? n.slice(0, -1) : n)))].filter(n => n.length >= 3);
}
function newsFor(tab) {
  const items = state.news?.items || [];
  if (tab === 'city') { const st = placeStems(state.city); return items.filter(x => { const t = fold(x.title + ' ' + x.summary); return st.some(s => t.includes(s)); }); }
  return items.filter(x => x.lang === (tab === 'gr' ? 'el' : 'en'));
}
const newsAge = t => { if (!t) return ''; const m = Math.max(1, Math.round((Date.now() - t) / 60e3)); return m < 60 ? `${m} ${T('minutes')} ${T('ago')}` : m < 48 * 60 ? `${Math.round(m / 60)} ${T('hrs')} ${T('ago')}` : dt(t, { day: 'numeric', month: 'short' }); };
const newsItem = (x, big) => /^https?:\/\//i.test(x.link || '') ? `<a class="newsitem ${big ? 'big' : ''}" href="${esc(x.link)}" target="_blank" rel="noopener noreferrer"><div><b>${esc(x.title)}</b><small>${esc(x.source)} · ${esc(String(x.lang || '').toUpperCase())} · ${esc(newsAge(x.t))}</small></div></a>` : '';
function newsCard() {
  if (!state.news?.items?.length) return '';
  const local = newsFor('city'), pref = newsFor(state.city.cc === 'GR' || state.lang === 'el' ? 'gr' : 'world');
  const pick = [...local, ...pref.filter(x => !local.includes(x))].slice(0, 3);
  if (!pick.length) return '';
  return `<section class="section card"><div class="panelhead"><div><b>${T('newsTitle')}</b><div class="section-sub">${local.length ? T('newsLocal') + ' ' + esc(cityName(state.city)) : T('newsLatest')}</div></div>${btn('goto', '↗ ' + T('news'), 'data-page="news"')}</div><div class="newslist">${pick.map(x => newsItem(x)).join('')}</div></section>`;
}
function newsPage() {
  const head = header(T('newsTitle'), T('newsSub'), btn('reloadNews', '↻ ' + T('refresh')));
  if (!state.news) { loadNews(); return head + loadingCard(); }
  if (state.news.error) return head + `<div class="card placeholder"><b>${T('noData')}</b>${T('newsFail')}</div>`;
  const tab = state.newsTab || (newsFor('city').length ? 'city' : state.lang === 'el' ? 'gr' : 'world');
  const tabs = [['city', T('newsCity') + ' · ' + cityName(state.city)], ['gr', T('newsGreece')], ['world', T('newsWorld')]];
  const list = newsFor(tab);
  const chips = `<div class="chips">${tabs.map(([k, l]) => `<button class="chip ${tab === k ? 'active' : ''}" data-action="newsTab" data-v="${k}">${esc(l)} <small>${newsFor(k).length}</small></button>`).join('')}</div>`;
  const body = list.length ? `<div class="newsgrid">${list.slice(0, 60).map(x => newsItem(x, true)).join('')}</div>` : `<div class="card placeholder"><b>${T('newsEmpty')}</b>${tab === 'city' ? T('newsEmptyCity') : ''}</div>`;
  const srcs = [...new Set((state.news.items || []).map(x => x.source))].join(' · ');
  return head + chips + body + `<p class="notice">${T('newsSources')}: ${esc(srcs)} · ${T('updated')} ${hhmm(state.news.at)}</p>`;
}

/* ------------------------------------------------------------------ page: stations */
function stationsPage() {
  const V = state.view;
  const head = header(T('stTitle'), T('stSub'));
  if (!V || !state.obs) return head + loadingCard();
  if (!V.stations.length) return head + `<div class="card placeholder"><b>${T('noData')}</b>${T('stNone')}</div>`;
  const cards = V.stations.slice(0, 30).map(s => { const o = s.last, inUse = V.station?.id === s.id, gauge = window.MONORainIntelligence?.observed([s],null);
    return `<article class="card stcard ${inUse ? 'inuse' : ''}"><div class="citytop"><div><div class="cityname">${esc(s.id)} <span class="tag ${s.src === 'synop' ? 'synop' : 'metar'}">${s.src === 'synop' ? 'SYNOP' : 'METAR'}</span></div><div class="citycountry">${esc(s.name || '')}</div><div class="citycountry">${num(s.dist)} km${fin(s.elev) ? ` · ${num(s.elev)} m` : ''}</div>${gauge ? `<div class="citycountry">🌧 ${num(gauge.mm,1)} mm · ${num(gauge.covered,0)}/24 h · ${esc(gauge.type)}</div>` : ''}</div>${o ? icon(metarCode(o) ?? 3, 1, 'cityicon') : ''}</div>
      <div class="stvals"><span class="citytemp">${deg(o?.temp)}</span><div class="compact">${T('humidity')} ${num(M.rhFromDew(o?.temp, o?.dewp))}% · ${T('dew')} ${deg(o?.dewp)}<br>${T('wind')} ${num(o?.wspd)} km/h ${dirArrow(o?.wdir)}${fin(o?.wspd) ? ` · ${windBft(o.wspd)}` : ''}${fin(o?.wgst) ? ` · ${T('gust')} ${num(o.wgst)} km/h` : ''}<br>${num(o?.pres)} hPa${fin(o?.vis) ? ` · ${num(o.vis, o.vis < 10 ? 1 : 0)} km` : ''}</div></div>
      <div class="compact">${o?.wx?.length ? esc(wxText(o)) + ' · ' : ''}${o ? esc(ageText(o.t)) : ''}</div>
      <div class="citybottom">${inUse ? `<span class="badge">✓ ${T('stInUse')}</span>` : `<button class="cityopen" data-action="station" data-id="${esc(s.id)}">${T('stUse')}</button>`}</div></article>`; }).join('');
  const s = V.station;
  let detail = '';
  if (s) {
    const rows = V.rows.slice(Math.max(0, V.iNow - 72), V.iNow + 25), past = r => r.t <= Date.now();
    detail = `<section class="section card"><div class="panelhead"><div><b>${esc(s.id)} · ${T('stChart')}</b><div class="section-sub">${esc(s.name || '')} · ${esc(s.source)}</div></div></div>
      ${chart({ rows, series: [{ vals: rows.map(r => (past(r) ? r.tempModel : null)), cls: 'hind' }, { vals: rows.map(r => (!past(r) ? r.temp : null)), cls: 'mono' }], points: rows.map(r => r.obs), nowT: Date.now() })}
      ${legend([['obs', T('legendObs')], ['hind', T('legendHind')], ['mono', T('legendMono')]])}
      <div class="panelhead" style="margin-top:18px"><b>${T(s.src === 'synop' ? 'rawSynop' : 'rawMetar')}</b></div>${s.list.slice(-8).reverse().map(o => `<p class="mono-raw">${esc(o.raw || '')}</p>`).join('')}</section>`;
  }
  const cnt = state.obs?.counts ? `<div class="chips"><span class="badge">METAR · ${state.obs.counts.metar}</span><span class="badge">SYNOP · ${state.obs.counts.synop}</span>${state.pws?.n ? `<span class="badge">Netatmo · ${state.pws.n}</span>` : ''}</div>` : '';
  return head + cnt + pwsCard() + `<div class="cities-grid">${cards}</div>` + detail;
}
function pwsCard() {
  const P = state.pws;
  if (!P || P.off) return '';
  if (!P.n) return `<div class="card"><div class="panelhead"><b>${T('pwsTitle')}</b></div><p class="notice">${T('pwsNone')}</p></div>`;
  const near = P.stations.slice(0, 12).map(s => `<div class="kv"><span>${num(s.dist, 1)} km${fin(s.elev) ? ` · ${num(s.elev)} m` : ''}</span><b>${deg(s.temp)}${fin(s.rh) ? ` · ${num(s.rh)}%` : ''}${fin(s.rain1h) && s.rain1h > 0 ? ` · ${num(s.rain1h, 1)} mm/h` : ''}</b></div>`).join('');
  return `<section class="section dual"><div class="card"><div class="panelhead"><div><b>${T('pwsTitle')}</b><div class="section-sub">${T('pwsSub')}</div></div><span class="badge">${P.n}</span></div>
    <div class="kv"><span>${T('pwsMedian')}${P.nNear >= 5 ? ' (≤5 km)' : ''}</span><b>${deg(P.temp)}</b></div><div class="kv"><span>${T('humidity')}</span><b>${fin(P.rh) ? num(P.rh) + '%' : '—'}</b></div>
    <div class="kv"><span>${T('pwsRain')}</span><b>${P.nRain ? `${P.wet} / ${P.nRain}` : '—'}</b></div><p class="notice">${T('pwsNote')}</p></div>
    <div class="card"><div class="panelhead"><b>${T('pwsNearest')}</b></div>${near}</div></section>`;
}

/* ------------------------------------------------------------------ page: climate */
let climBusy = false;
async function loadClimate(fromYear = 1991) {
  if (climBusy) return; climBusy = true;
  const c = state.city, key = ckey(c), gen = state.gen;
  try {
    const cache = read(K.clim, {})[key];
    if (cache && Date.now() - cache.at < 7 * 86400e3 && cache.from <= fromYear && !state.clim) { state.clim = { ...cache, loading: false }; render(); return; }
    state.clim = { ...(state.clim || {}), loading: true, progress: 0, from: fromYear };
    render();
    const recentP = C.loadRecent(c).catch(() => []);
    const stationP = state.clim.station ? Promise.resolve() : C.loadStation(c)
      .then(r => { if (gen === state.gen) { state.clim.station = { info: r.station, source: r.source, agg: C.aggregate(r.days) }; if (state.page === 'climate') render(); } })
      .catch(() => { if (gen === state.gen) { state.clim.stationErr = true; if (state.page === 'climate') render(); } });
    try {
      const recent = await recentP;
      const prevDays = state.clim.eraDays || [];
      const lastYear = prevDays.length ? +prevDays.reduce((a, d) => (d.d < a ? d.d : a), '9999').slice(0, 4) - 1 : null;
      const r = await C.loadERA5(c, fromYear, (days, n, tot) => { if (gen !== state.gen) return; state.clim.era = C.aggregate([...days, ...prevDays], recent); state.clim.progress = n / tot; if (state.page === 'climate') render(); }, lastYear);
      if (gen !== state.gen) return;
      state.clim.eraDays = [...r.days, ...prevDays];
      state.clim.era = C.aggregate(state.clim.eraDays, recent);
      state.clim.dayNormals = dayNormals(state.clim.eraDays);
    } catch { if (gen === state.gen) state.clim.eraErr = true; }
    await stationP;
    if (gen !== state.gen) return;
    state.clim.loading = false; state.clim.from = fromYear;
    const keep = { at: Date.now(), from: fromYear, era: state.clim.era, station: state.clim.station, stationErr: state.clim.stationErr, dayNormals: state.clim.dayNormals };
    const all = read(K.clim, {}); all[key] = keep;
    if (!write(K.clim, Object.fromEntries(Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, 2)))) write(K.clim, { [key]: keep });
    if (state.page === 'climate' || state.page === 'now') render();
  } finally { climBusy = false; }
}
function climatePage() {
  const head = header(T('climTitle'), T('climSub'));
  const cl = state.clim;
  if (!cl) { setTimeout(() => loadClimate(), 0); return head + loadingCard(T('loadingYears')); }
  const useSt = state.climSrc === 'station' && cl.station;
  const A = useSt ? cl.station.agg : cl.era;
  const srcChips = `<div class="chips">${cl.station ? `<button class="chip ${useSt ? 'active' : ''}" data-action="climSrc" data-v="station">${T('srcStation')} · ${esc(cl.station.info.name)} (${num(cl.station.info.dist)} km)</button>` : cl.stationErr ? '' : `<span class="chip ghost"><span class="spin">◌</span> ${T('srcStation')}</span>`}
    <button class="chip ${!useSt ? 'active' : ''}" data-action="climSrc" data-v="era5">${T('srcEra')}</button>${(cl.from || 1991) > 1940 && !cl.loading ? `<button class="chip" data-action="climOlder">↧ ${T('loadOlder')}</button>` : ''}
    ${cl.loading ? `<span class="chip ghost"><span class="spin">◌</span> ${T('loadingYears')} ${pct(cl.progress || 0)}</span>` : ''}</div>`;
  const note = cl.stationErr && state.climSrc === 'station' ? `<p class="notice">${T('stFail')}</p>` : '';
  if (!A) return head + srcChips + note + loadingCard(T('loadingYears'));
  const m = state.climMonth, ML = MONTHS_LONG[state.lang][m - 1];
  const monthChips = `<div class="chips mchips">${MONTHS[state.lang].map((n, i) => `<button class="chip ${m === i + 1 ? 'active' : ''}" data-action="climMonth" data-n="${i + 1}">${n}</button>`).join('')}</div>`;
  const N = A.normals, nm = N[m];
  const ms = Object.values(A.months).filter(x => x.m === m && x.completeT).sort((a, b) => a.y - b.y);
  const tr = M.trend(ms.map(x => x.y), ms.map(x => x.tm));
  const yrRows = ms.map(x => ({ t: Date.UTC(x.y, m - 1, 15), y: x.y }));
  const yChart = ms.length ? chart({ rows: yrRows, series: [...(tr ? [{ vals: ms.map(x => tr.intercept + tr.slope * x.y), cls: 'trend' }] : []), { vals: ms.map(() => nm.tm), cls: 'hind' }], points: ms.map(x => x.tm), xLabel: r => String(r.y) }) : `<div class="placeholder">${T('noData')}</div>`;
  const msP = Object.values(A.months).filter(x => x.m === m && x.completeP).sort((a, b) => a.y - b.y);
  const pChart = msP.length ? chart({ rows: msP.map(x => ({ t: Date.UTC(x.y, m - 1, 15), y: x.y })), unit: 'mm', series: [{ vals: msP.map(() => nm.p), cls: 'hind' }], bars: msP.map(x => x.p), xLabel: r => String(r.y) }) : `<div class="placeholder">${T('noData')}</div>`;
  const fmtD = d => (d ? new Date(d + 'T12:00:00Z').toLocaleDateString(loc(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');
  const rec = `<div class="kv"><span>${T('warmest')}</span><b>${nm.warmest ? `${nm.warmest.y} · ${num(nm.warmest.tm, 1)}°` : '—'}</b></div><div class="kv"><span>${T('coldest')}</span><b>${nm.coldest ? `${nm.coldest.y} · ${num(nm.coldest.tm, 1)}°` : '—'}</b></div>
    <div class="kv"><span>${T('wettest')}</span><b>${nm.wettest ? `${nm.wettest.y} · ${num(nm.wettest.p)} mm` : '—'}</b></div><div class="kv"><span>${T('driest')}</span><b>${nm.driest ? `${nm.driest.y} · ${num(nm.driest.p)} mm` : '—'}</b></div>
    <div class="kv"><span>${T('hottestDay')}</span><b>${nm.recMax ? `${num(nm.recMax.txMax, 1)}° · ${esc(fmtD(nm.recMax.txMaxD))}` : '—'}</b></div><div class="kv"><span>${T('coldestDay')}</span><b>${nm.recMin ? `${num(nm.recMin.tnMin, 1)}° · ${esc(fmtD(nm.recMin.tnMinD))}` : '—'}</b></div>
    <div class="kv"><span>${T('wettestDay')}</span><b>${nm.recWetDay ? `${num(nm.recWetDay.pMax, 1)} mm · ${esc(fmtD(nm.recWetDay.pMaxD))}` : '—'}</b></div>`;
  const nowY = new Date().getFullYear(), curM = new Date().getMonth() + 1, yy = m <= curM ? nowY : nowY - 1;
  const thisY = A.months[`${yy}-${String(m).padStart(2, '0')}`], lastY = A.months[`${yy - 1}-${String(m).padStart(2, '0')}`];
  const phenKeys = ['rain', 'heavy', 'snow', 'frost', 'summer', 'hot', 'tropical', 'gale', 'storm'].filter(k => fin(nm[k]) && (k !== 'storm' || nm.storm > 0));
  const phen = `<table class="metric-table"><thead><tr><th></th><th>${T('avgDays')}<br><small>${esc(nm.period)}</small></th><th>${yy - 1}</th><th>${yy}</th></tr></thead><tbody>
    ${phenKeys.map(k => `<tr><td>${T('cd_' + k)}</td><td class="num"><b>${num(nm[k], 1)}</b></td><td class="num">${lastY && lastY[k] != null ? lastY[k] : '—'}</td><td class="num">${thisY && thisY[k] != null ? thisY[k] + (thisY.days < thisY.dim ? `<small> / ${thisY.days}${T('dShort')}</small>` : '') : '—'}</td></tr>`).join('')}</tbody></table>`;
  const mtd = thisY && m === curM ? `<div class="stat-grid section">${mini(T('monthToDate'), deg(thisY.tm), `${T('normal')} ${deg(nm.tm)} · ${sgn(thisY.tm - nm.tm)}° ${T('vsNormal')}`, 'thermometer')}${mini(T('total'), `${num(thisY.p)} <small>mm</small>`, `${T('normal')} ${num(nm.p)} mm`, 'umbrella')}${mini(T('normalTx'), deg(thisY.tx), `${T('normal')} ${deg(nm.tx)}`, 'sun')}${mini(T('normalTn'), deg(thisY.tn), `${T('normal')} ${deg(nm.tn)}`, 'moon')}</div>` : '';
  const srcLine = useSt ? `${cl.station.info.name} · ${cl.station.source === 'meteostat' ? 'Meteostat' : 'NOAA GHCN-Daily'}` : 'ERA5 / ERA5-Land · ECMWF · Open-Meteo';
  return head + srcChips + note + `<p class="notice">${esc(srcLine)} · ${esc(A.first)} → ${esc(A.last)} · ${A.years.length} ${T('years')}</p>`
    + `<section class="section card"><div class="panelhead"><div><b>${T('climograph')}</b><div class="section-sub">${esc(N[1].period)}</div></div></div>${climograph(N)}${legend([['mono', T('normalTx')], ['hind', T('normalTn')], ['band', T('recordRange')], ['bar', T('normalP')]])}</section>`
    + `<section class="section">${monthChips}</section>${mtd}`
    + `<section class="section dual"><div class="card"><div class="panelhead"><div><b>${ML} · ${T('meanTemp')} ${T('overYears')}</b><div class="section-sub">${tr ? `${T('trendTxt')} ${sgn(tr.slope * 10, 2)}°C ${T('perDecade')} (± ${num(tr.se * 10 * 1.96, 2)})` : ''} · ${T('normal')} ${num(nm.tm, 1)}°</div></div></div>${yChart}${legend([['obs', T('meanTemp')], ['trend', T('trendTxt')], ['hind', T('normal')]])}</div>
      <div class="card"><div class="panelhead"><b>${T('records')} · ${ML}</b></div>${rec}</div></section>`
    + `<section class="section dual"><div class="card"><div class="panelhead"><div><b>${ML} · ${T('total')}</b><div class="section-sub">${T('normal')} ${num(nm.p)} mm</div></div></div>${pChart}</div>
      <div class="card"><div class="panelhead"><b>${T('phenDays')} · ${ML}</b></div><div class="tablewrap">${phen}</div></div></section>`
    + `<section class="section card"><div class="panelhead"><div><b>${T('heatmap')}</b><div class="section-sub">${T('vsNormal')} ${esc(N[1].period)}</div></div></div>${heatmap(A)}</section>`;
}
function climograph(N) {
  const narrow = window.innerWidth < 640, W = narrow ? 400 : 720, H = narrow ? 220 : 260, l = 36, r = 14, top = 18, bot = 26;
  const ms = [...Array(12).keys()].map(i => N[i + 1]);
  const tv = ms.flatMap(x => [x.tx, x.tn, x.recMax?.txMax, x.recMin?.tnMin]).filter(fin);
  if (!tv.length) return `<div class="placeholder">${T('noData')}</div>`;
  const lo = Math.floor(Math.min(...tv) / 5) * 5, hi = Math.ceil(Math.max(...tv) / 5) * 5, pm = Math.max(10, ...ms.map(x => x.p).filter(fin));
  const x = i => l + (W - l - r) * (i + 0.5) / 12, y = v => top + (H - top - bot) * (hi - v) / (hi - lo), yp = v => H - bot - (H - top - bot) * 0.55 * v / pm;
  let g = '';
  for (let v = lo; v <= hi; v += 5) g += `<line class="chart-grid" x1="${l}" x2="${W - r}" y1="${y(v)}" y2="${y(v)}"/><text class="chart-axis" x="${l - 6}" y="${y(v) + 3.5}" text-anchor="end">${v}°</text>`;
  const bw = (W - l - r) / 12 * 0.46;
  ms.forEach((m, i) => { if (fin(m.p)) g += `<rect class="chart-bar" x="${(x(i) - bw / 2).toFixed(1)}" y="${yp(m.p).toFixed(1)}" width="${bw.toFixed(1)}" height="${(H - bot - yp(m.p)).toFixed(1)}" rx="2"/>${narrow ? '' : `<text class="chart-axis" x="${x(i)}" y="${(H - bot - 4).toFixed(1)}" text-anchor="middle">${num(m.p)}</text>`}`; });
  const band = ms.map((m, i) => [i, m.recMin?.tnMin, m.recMax?.txMax]).filter(a => fin(a[1]) && fin(a[2]));
  if (band.length) g += `<path class="chart-band" d="M${band.map(([i, , b]) => `${x(i).toFixed(1)},${y(b).toFixed(1)}`).join('L')}L${band.slice().reverse().map(([i, a]) => `${x(i).toFixed(1)},${y(a).toFixed(1)}`).join('L')}Z"/>`;
  const line = (f, cls) => `<path class="chart-line ${cls}" d="${ms.map((m, i) => (fin(f(m)) ? `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(f(m)).toFixed(1)}` : '')).join('')}"/>`;
  g += line(m => m.tx, 'mono') + line(m => m.tn, 'hind');
  ms.forEach((m, i) => { g += `<text class="chart-axis" x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${MONTHS[state.lang][i]}</text>`; if (!narrow && fin(m.tx)) g += `<text class="chart-axis strong2" x="${x(i).toFixed(1)}" y="${(y(m.tx) - 7).toFixed(1)}" text-anchor="middle">${num(m.tx)}°</text>`; });
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" style="aspect-ratio:${W}/${H}" role="img">${g}</svg>`;
}
function heatmap(A) {
  const N = A.normals, years = A.years.slice().reverse();
  const cell = (yr, m) => { const x = A.months[`${yr}-${String(m).padStart(2, '0')}`]; if (!x || !x.completeT || !fin(N[m].tm)) return `<i class="hm empty"></i>`;
    const a = x.tm - N[m].tm, s = Math.min(100, Math.round(Math.abs(a) / 3 * 100));
    return `<i class="hm" style="background:color-mix(in oklab, var(${a >= 0 ? '--warm' : '--cold'}) ${s}%, var(--soft))" title="${yr} ${MONTHS[state.lang][m - 1]}: ${sgn(a)}°"></i>`; };
  return `<div class="hmwrap"><div class="hmgrid"><span></span>${MONTHS[state.lang].map(n => `<span class="hml">${n}</span>`).join('')}${years.map(yr => `<span class="hmy">${yr}</span>${[...Array(12).keys()].map(i => cell(yr, i + 1)).join('')}`).join('')}</div>
    <div class="hmlegend"><span>−3°</span><i class="hm" style="background:var(--cold)"></i><i class="hm" style="background:color-mix(in oklab, var(--cold) 40%, var(--soft))"></i><i class="hm" style="background:var(--soft)"></i><i class="hm" style="background:color-mix(in oklab, var(--warm) 40%, var(--soft))"></i><i class="hm" style="background:var(--warm)"></i><span>+3°</span></div></div>`;
}

/* ------------------------------------------------------------------ page: cities */
function citiesPage() {
  const regions = ['All', 'Favorites', 'Europe', 'North America', 'South America', 'Asia', 'Africa', 'Oceania'];
  let list = state.region === 'Favorites' ? state.favorites : CITIES.filter(c => state.region === 'All' || c.region === state.region);
  list = [...new Map(list.map(c => [ckey(c), c])).values()];
  return header(T('citiesTitle'), T('citiesSub')) + `<div class="chips">${regions.map(r => `<button class="chip ${state.region === r ? 'active' : ''}" data-action="region" data-r="${r}">${r === 'All' ? T('all') : r === 'Favorites' ? T('favorites') : r}</button>`).join('')}</div>
    <div class="cities-grid">${list.map(c => { const v = state.cityLive[ckey(c)];
      return `<article class="card citycard"><div class="citytop"><div><div class="cityname">${esc(cityName(c))}</div><div class="citycountry">${esc(countryName(c))}</div></div>${favBtn(c, true)}</div><div class="cityright">${v?.current ? icon(v.current.weather_code, v.current.is_day, 'cityicon') : '<span class="cityicon">◌</span>'}<span class="citytemp">${v?.current ? deg(v.current.temperature_2m) : v?.error ? '—' : '···'}</span></div><div class="citybottom"><span>${v?.current ? desc(v.current.weather_code) : ''}</span><button class="cityopen" data-action="city" data-id="${ckey(c)}">↗ ${T('open')}</button></div></article>`; }).join('')}</div>`;
}
async function loadCityLive() {
  const list = [...new Map([...state.favorites, ...CITIES].map(c => [ckey(c), c])).values()].filter(c => !state.cityLive[ckey(c)] || Date.now() - state.cityLive[ckey(c)].at > REFRESH_LIVE);
  for (let i = 0; i < list.length; i += 20) {
    const b = list.slice(i, i + 20);
    try {
      const d = await getJSON(q(OM, { latitude: b.map(c => c.lat).join(','), longitude: b.map(c => c.lon).join(','), current: 'temperature_2m,weather_code,is_day', timezone: 'UTC' }));
      const arr = Array.isArray(d) ? d : [d]; b.forEach((c, j) => (state.cityLive[ckey(c)] = { current: arr[j]?.current, at: Date.now() }));
    } catch { b.forEach(c => (state.cityLive[ckey(c)] = { error: true, at: Date.now() })); }
    if (state.page === 'cities') render(); else { navRender(); if (state.page === 'globe' || state.page === 'earth') updateGlobeCtl(); }
  }
}

/* ------------------------------------------------------------------ shell */
const NAV_GROUPS = [
  {id:'weather',el:'ΚΑΙΡΟΣ',en:'WEATHER',symbol:'◐',pages:['now','guide','hourly','rain','radar','maps']},
  {id:'earth',el:'ΓΗ & ΚΛΙΜΑ',en:'EARTH & CLIMATE',symbol:'◈',pages:['globe','earth','phen','climate','environment']},
  {id:'data',el:'ΔΕΔΟΜΕΝΑ & ΕΡΓΑΛΕΙΑ',en:'DATA & TOOLS',symbol:'▤',pages:['models','lab','stations','news','cities']},
  {id:'space',el:'ΔΙΑΣΤΗΜΑ',en:'SPACE',symbol:'☄',pages:['space']}
];
const NAV_OPEN_KEY='mono-nav-groups-v1';
let navOpen=read(NAV_OPEN_KEY,{weather:true,earth:true,data:false,space:false});
if(!navOpen || typeof navOpen!=='object') navOpen={weather:true,earth:true,data:false,space:false};
const activeNavGroup=NAV_GROUPS.find(g=>g.pages.includes(state.page));
if(activeNavGroup)navOpen[activeNavGroup.id]=true;
const NAV = [['now', '◐'], ['guide', '☷'], ['maps','▱'], ['rain', '☂'], ['hourly', '◷'], ['phen', '⚡'], ['environment', '♧'], ['space', '☄'], ['radar', '◎'], ['globe', '◍'], ['earth', '◈'], ['models', '≋'], ['lab', '✳'], ['stations', '⌖'], ['news', '¶'], ['climate', '▦'], ['cities', '⊞']];
/* Mobile navigation shows sections, never a crowded row of individual pages. */
const MOBILE_NAV_LABELS={
  el:{weather:'Καιρός',earth:'Γη',data:'Εργαλεία',space:'Διάστημα',choose:'Επίλεξε ενότητα',current:'Τώρα εδώ',close:'Κλείσιμο',open:'Άνοιγμα'},
  en:{weather:'Weather',earth:'Earth',data:'Tools',space:'Space',choose:'Choose a section',current:'Current page',close:'Close',open:'Open'}
};
let mobileCategoryOpen=null;
function mobileNavRender(){
  const language=state.lang==='en'?'en':'el', t=MOBILE_NAV_LABELS[language];
  const selected=NAV_GROUPS.find(group=>group.pages.includes(state.page));
  const bar=$('#tabbar'); if(!bar)return;
  bar.innerHTML=NAV_GROUPS.map(group=>{
    const label=t[group.id],open=mobileCategoryOpen===group.id;
    return `<button type="button" class="mobile-group-tab ${selected?.id===group.id?'active':''} ${open?'sheet-active':''}" data-action="mobileGroup" data-v="${group.id}" aria-expanded="${open}" aria-controls="mobileNavSheet" aria-label="${t[open?'close':'open']} ${esc(label)}"><span class="mobile-tab-icon" aria-hidden="true">${group.symbol}</span><span class="mobile-tab-label">${esc(label)}</span></button>`;
  }).join('');
  const scrim=$('#mobileNavScrim'), sheet=$('#mobileNavSheet');
  if(!scrim||!sheet)return;
  const group=NAV_GROUPS.find(g=>g.id===mobileCategoryOpen);
  const visible=!!group && window.innerWidth<=930;
  scrim.classList.toggle('hidden',!visible);
  sheet.classList.toggle('hidden',!visible);
  sheet.setAttribute('aria-hidden',String(!visible));
  document.body.classList.toggle('mobile-sheet-open',visible);
  if(!visible){sheet.innerHTML='';return;}
  sheet.setAttribute('aria-label',t[group.id]+' – '+t.choose);
  sheet.innerHTML=`<div class="mobile-nav-sheet-head"><div class="mobile-nav-sheet-heading"><span class="mobile-nav-sheet-symbol" aria-hidden="true">${group.symbol}</span><div><h2 class="mobile-nav-sheet-title">${esc(t[group.id])}</h2><p class="mobile-nav-sheet-description">${esc(t.choose)}</p></div></div><button type="button" class="mobile-nav-dismiss" data-action="mobileNavClose" aria-label="${esc(t.close)}">×</button></div><div class="mobile-nav-links">${group.pages.map(p=>{
    const ico=NAV.find(n=>n[0]===p)?.[1]||'•',active=state.page===p;
    return `<button type="button" class="mobile-nav-link ${active?'active':''}" data-action="goto" data-page="${p}" ${active?'aria-current="page"':''}><span class="mobile-nav-link-icon" aria-hidden="true">${ico}</span><span class="mobile-nav-link-text">${esc(T(p))}${active?`<small class="mobile-nav-link-current">${t.current}</small>`:''}</span></button>`;
  }).join('')}</div>`;
}
function closeMobileNavigation(returnFocus=false){
  const previous=mobileCategoryOpen;
  mobileCategoryOpen=null;
  mobileNavRender();
  if(returnFocus && previous && window.innerWidth<=930){
    $('#tabbar [data-v="'+previous+'"]')?.focus();
  }
}
function navRender() {
  document.documentElement.lang = state.lang; document.documentElement.dataset.theme = state.theme;
  $('#search').placeholder = T('search'); $('#theme').textContent = state.theme === 'dark' ? '☀' : '☾'; $('#language').textContent = state.lang === 'el' ? 'ΕΛ / EN' : 'EN / ΕΛ';
  const navQuery=($('#navFilter')?.value||'').toLocaleLowerCase(state.lang==='el'?'el-GR':'en-US').trim();
  $('#nav').innerHTML = NAV_GROUPS.map(group=>{
    const pages=group.pages.map(p=>({p,i:NAV.find(n=>n[0]===p)?.[1]||'•',text:T(p)}))
      .filter(x=>!navQuery || x.text.toLocaleLowerCase(state.lang==='el'?'el-GR':'en-US').includes(navQuery));
    if(!pages.length)return '';
    const expanded=!!navQuery || !!navOpen[group.id];
    return `<section class="nav-group"><button type="button" class="nav-group-toggle" data-action="navGroup" data-v="${group.id}" aria-expanded="${expanded}"><span>${group.symbol}</span><strong>${esc(state.lang==='el'?group.el:group.en)}</strong><small>${pages.length}</small><i>${expanded?'⌄':'›'}</i></button><div class="nav-group-items ${expanded?'':'nav-collapsed'}">${pages.map(({p,i,text})=>`<button class="navbtn ${state.page===p?'active':''}" data-action="goto" data-page="${p}"><span class="navico">${i}</span>${text}</button>`).join('')}</div></section>`;
  }).join('');
  $('#sideCities').innerHTML = state.favorites.map(c => { const v = state.cityLive[ckey(c)]; return `<button data-action="city" data-id="${ckey(c)}" class="citylink ${ckey(c) === ckey(state.city) ? 'active' : ''}"><b>${esc(cityName(c))}</b><small>${v?.current ? deg(v.current.temperature_2m) : ''}</small></button>`; }).join('');
  document.querySelectorAll('[data-i18n]').forEach(n => (n.textContent = T(n.dataset.i18n)));
  const V = state.view;
  $('#status').textContent = state.snapshot ? T('cached') : V ? `${T('live')} · ${T('updated')} ${hhmm(state.fetchedAt || V.at)}` : T('loading');
  mobileNavRender();
}
function render() {
  navRender();
  if (state.page === 'maps' && MonoForecast.isMounted(forecastOptions())) { MonoForecast.update(forecastOptions()); return; }
  if (state.page === 'radar' && map && $('#map')) return;   // keep the live map running
  if ((state.page === 'globe' || state.page === 'earth') && globe && $('#globe')) { updateGlobeCtl(); return; }
  const pages = { maps: forecastPage, guide: guidePage, now: nowPage, rain: rainPage, hourly: hourlyPage, phen: phenPage, environment: environmentPage, space: spacePage, radar: radarPage, globe: globePage, earth: () => window.MONOEarth.page(state.lang), models: modelsPage, lab: labPage, stations: stationsPage, news: newsPage, climate: climatePage, cities: citiesPage };
  const y = window.scrollY;
  const openEnvDetails = [...document.querySelectorAll('.environment-section details[open]')].map(el => el.id);
  const envScroll = [...document.querySelectorAll('.env-hour-scroll,.env-table-scroll,.mx-hours,.mx-pmap')].map(el => [el.id, el.scrollLeft]);
  $('#content').innerHTML = (pages[state.page] || nowPage)();
  if(state.page==='guide'){
    const q=$('#qs-panel');let start=null;
    q?.addEventListener('touchstart',e=>{const t=e.touches[0];if(t)start={x:t.clientX,y:t.clientY};},{passive:true});
    q?.addEventListener('touchend',e=>{const t=e.changedTouches[0];if(!start||!t)return;
      const dx=t.clientX-start.x,dy=t.clientY-start.y;start=null;
      if(Math.abs(dx)>=65&&Math.abs(dx)>Math.abs(dy)*1.4){state.quickScreen=Math.max(0,Math.min(3,state.quickScreen+(dx<0?1:-1)));render();}
    },{passive:true});
  }
  openEnvDetails.forEach(id => { const el = document.getElementById(id); if (el) el.open = true; });
  envScroll.forEach(([id, left]) => { const el = document.getElementById(id); if (el) el.scrollLeft = left; });
  window.scrollTo(0, y);
  const r = $('#selHour'); if (r) r.addEventListener('input', e => { state.sel = +e.target.value; const yy = window.scrollY; render(); window.scrollTo(0, yy); $('#selHour')?.focus(); });
  if (state.page === 'maps') MonoForecast.mount(forecastOptions(),loadLeaflet);
  if (state.page === 'radar') mountRadar();
  if (state.page === 'globe' || state.page === 'earth') mountGlobe();
  if (state.page === 'earth') window.MONOEarth.mount(state.lang);
}
let toastT;
function toast(m) { const n = $('#toast'); n.textContent = m; n.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => n.classList.remove('show'), 3200); }
function goto(p) {
  if(p!=='earth'&&p!=='globe'&&window.MONOStormLens)window.MONOStormLens.pause();
  if (p !== 'maps') MonoForecast.destroy();
  if (p !== 'radar') killMap();
  if (p !== state.page || (p !== 'globe' && p !== 'earth')) killGlobe();
  const grp=NAV_GROUPS.find(g=>g.pages.includes(p)); if(grp)navOpen[grp.id]=true;
  mobileCategoryOpen=null;
  state.page = p; $('.sidebar').classList.remove('open');
  try { history.replaceState(null, '', '#' + p); } catch {}
  render(); window.scrollTo(0, 0);
  if (p === 'cities' || p === 'globe') loadCityLive();
  if (p === 'news') loadNews();
}
function setCity(c) {
  if (!c) return;
  killMap(); killGlobe(); MonoForecast.destroy();
  Object.assign(state, { city: c, main: null, view: null, rain15: null, probe: null, models: {}, ens: {}, obs: null, obsReady: false, train: null, trainStatus: 'idle', modelsAt: 0, sel: 0, aq: null, atmosphere: null, marine: null, warn: null, clim: null, stationPick: null, climSrc: 'station', pws: null });
  if (state.page === 'cities') state.page = 'now';
  persist(); $('#search').value = ''; $('#results').classList.add('hidden'); $('.sidebar').classList.remove('open');
  window.scrollTo(0, 0); loadAll(true); localizePlaces();
}
const findCity = id => [...state.favorites, ...CITIES, state.city, ...(window.__results || [])].find(c => ckey(c) === id);
function locate(silent = false) {
  if (!silent && !window.confirm(state.lang === 'el' ? 'Το MONO θα χρησιμοποιήσει το GPS με στρογγυλοποίηση συντεταγμένων σε ~100 m (η πραγματική ακρίβεια εξαρτάται από τη συσκευή). Θα σταλεί σε Open-Meteo και στις πηγές καιρού/γεωκωδικοποίησης (BigDataCloud, IEM, NCEI) και στα API του MONO στη Vercel, όπως περιγράφεται στο Απόρρητο. Θέλεις να συνεχίσεις;' : 'MONO rounds GPS coordinates to ~100 m; actual accuracy depends on your device. They are sent to Open-Meteo, weather/geocoding sources (BigDataCloud, IEM, NCEI), and MONO APIs on Vercel as explained in Privacy. Continue?')) return Promise.resolve(false);
  if (!navigator.geolocation) { if (!silent) toast(T('geoError')); return Promise.resolve(false); }
  return new Promise(res => navigator.geolocation.getCurrentPosition(async p => {
    try {
      const { lat, lon } = window.MONOGeo.roundCoordinates(p.coords.latitude, p.coords.longitude);
      const approx = window.MONOGeo.isApproximateFix(p.coords.accuracy);
      const nm = await reverseName(lat, lon);
      const name = approx ? (state.lang === 'el' ? 'Προσεγγιστική θέση' : 'Approximate location') : (nm?.name || T('myLoc'));
      setCity({ name, nameEl: name, admin1: nm?.admin1, country: nm?.country, cc: nm?.cc || '', lat, lon, gps: true,
        gpsApprox: approx, i18n: { [state.lang]: { name, admin1: nm?.admin1, country: nm?.country } } });
      if (approx && !silent) toast(state.lang === 'el'
        ? `GPS ±${Math.round(p.coords.accuracy)} m: η περιοχή δεν είναι βέβαιη. Δοκίμασε εκ νέου έξω ή αναζήτησέ την.`
        : `GPS ±${Math.round(p.coords.accuracy)} m: area uncertain. Retry outdoors or search manually.`);
      res(true);
    } catch { if (!silent) toast(T('geoError')); res(false); }
  }, () => { if (!silent) toast(T('geoError')); res(false); },
  { enableHighAccuracy: true, timeout: 15000, maximumAge: 60e3 }));
}
function csv() {
  const V = state.view; if (!V) return;
  const head = ['local_time', 'utc', 'temp_c', 'p10_c', 'p90_c', 'rain_prob', 'rain_mm', 'storm_prob', 'snow_prob', 'fog_prob', 'gale_prob', 'wind_kmh', 'gust_kmh', 'dir_deg', 'rh_pct', 'cloud_pct', 'models_used', 'algorithm'];
  const lines = V.rows.slice(V.iNow).map(r => [dt(r.t, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }), new Date(r.t).toISOString(),
    r.temp?.toFixed(1), r.lo?.toFixed(1), r.hi?.toFixed(1), r.pop?.toFixed(2), r.amount?.toFixed(2), r.pStorm?.toFixed(2), r.pSnow?.toFixed(2), r.pFog?.toFixed(2), r.pWind?.toFixed(2),
    r.wind?.toFixed(1), r.gust?.toFixed(1), r.dir?.toFixed(0), r.rh?.toFixed(0), r.cloud?.toFixed(0), r.nModels, r.choice].map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(','));
  const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `MONO_${state.city.name.replace(/[^a-z0-9]/gi, '_')}_${isoDate(0)}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000); toast(T('exported'));
}
let searchT, searchGen = 0;
async function geocode(text) {
  const box = $('#results'), g = ++searchGen;
  if (text.trim().length < 2) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden'); box.innerHTML = `<div class="searchoption muted">${T('loading')}</div>`;
  try {
    const d = await getJSON(q('https://geocoding-api.open-meteo.com/v1/search', { name: text, count: 10, language: state.lang, format: 'json' }), 12000);
    if (g !== searchGen) return;
    const res = (d.results || []).map(r => ({ name: r.name, nameEl: state.lang === 'el' ? r.name : undefined, admin1: r.admin1, country: r.country, cc: r.country_code, lat: r.latitude, lon: r.longitude, region: '', geoId: r.id, i18n: { [state.lang]: { name: r.name, admin1: r.admin1, country: r.country } } }));
    window.__results = res;
    box.innerHTML = res.length ? res.map(r => `<button class="searchoption" data-action="city" data-id="${ckey(r)}"><span><b>${esc(r.name)}</b><small>${esc([r.admin1, r.country].filter(Boolean).join(' · '))}</small></span><span>↗</span></button>`).join('') : `<div class="searchoption muted">${T('noData')}</div>`;
  } catch { if (g === searchGen) box.innerHTML = `<div class="searchoption muted">${T('noData')}</div>`; }
}
function onClick(e) {
  const b = e.target.closest('[data-action]'); if (!b) return;
  const a = b.dataset.action;
  if (a === 'goto') goto(b.dataset.page);
  else if (a === 'mobileGroup') {
    const key=b.dataset.v;
    if(!NAV_GROUPS.some(g=>g.id===key))return;
    mobileCategoryOpen=mobileCategoryOpen===key?null:key;
    $('.sidebar').classList.remove('open');
    mobileNavRender();
    if(mobileCategoryOpen) $('#mobileNavSheet .mobile-nav-link')?.focus();
  }
  else if (a === 'mobileNavClose') closeMobileNavigation(true);
  else if (a === 'quickScreen') { const k=Number(b.dataset.index); if(Number.isInteger(k)&&k>=0&&k<=3){state.quickScreen=k;render();} }
  else if (a === 'envJump') document.getElementById(b.dataset.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  else if (a === 'menu') { closeMobileNavigation(); $('.sidebar').classList.toggle('open'); }
  else if (a === 'navGroup') { const key=b.dataset.v; if(NAV_GROUPS.some(g=>g.id===key)){navOpen[key]=!navOpen[key];write(NAV_OPEN_KEY,navOpen);navRender();} }
  else if (a === 'reload') { loadAll(true); if(state.page==='maps') MonoForecast.refresh(); }
  else if (a === 'reloadModels') { state.models = {}; state.ens = {}; state.modelsAt = 0; loadAll(true); }
  else if (a === 'retrain') ensureTraining(state.city, state.gen, true);
  else if (a === 'city') setCity(findCity(b.dataset.id));
  else if (a === 'fav') { const c = findCity(b.dataset.id); if (!c) return; const id = ckey(c); if (state.favorites.some(x => ckey(x) === id)) { state.favorites = state.favorites.filter(x => ckey(x) !== id); toast(T('removed')); } else { state.favorites = [...state.favorites, c]; toast(T('added')); } persist(); render(); }
  else if (a === 'hours') { state.hours = +b.dataset.n; render(); }
  else if (a === 'mvar') { state.mvar = b.dataset.v; render(); }
  else if (a === 'lead') { state.lead = +b.dataset.n; render(); }
  else if (a === 'region') { state.region = b.dataset.r; render(); loadCityLive(); }
  else if (a === 'station') { state.stationPick = b.dataset.id; recompute(); render(); }
  else if (a === 'newsTab') { state.newsTab = b.dataset.v; render(); }
  else if (a === 'reloadNews') { state.news = null; render(); loadNews(true); }
  else if (a === 'climMonth') { state.climMonth = +b.dataset.n; render(); }
  else if (a === 'climSrc') { state.climSrc = b.dataset.v; render(); }
  else if (a === 'climOlder') loadClimate(1940);
  else if (a === 'climLoad') { loadClimate(1991); render(); }
  else if (a === 'radarMode') radarSelectMode(b.dataset.v);
  else if (a === 'pmPlay') togglePhenomenaPlay();
  else if (a === 'pmJump') jumpPhenomenaHour(+b.dataset.h);
  else if (a === 'pmReload') loadPhenomena(map,true);
  else if (a === 'radarPlay') toggleRadar();
  else if (a === 'radarSat') toggleSat();
  else if (a === 'radarHome' && map) { map.setView([state.city.lat,state.city.lon],8); map.invalidateSize(); }
  else if (a === 'radarStyle'||a==='pmStyle') { const name=radar.mode==='future'?'radarForecastBase':'radarBasemap';state[name]=state[name]==='street'?'satellite':'street';persistUI();setRadarBasemap(); }
  else if (a === 'radarReload') { killMap(); mountRadar(); }
  else if (a === 'lensPick' && window.MONOStormLens) window.MONOStormLens.togglePick();
  else if (a === 'lensPlay' && window.MONOStormLens) window.MONOStormLens.play();
  else if (a === 'lensMode' && window.MONOStormLens) window.MONOStormLens.setMode(b.dataset.v);
  else if (a === 'lensHours' && window.MONOStormLens) window.MONOStormLens.setHours(b.dataset.v);
  else if (a === 'lensThreshold' && window.MONOStormLens) window.MONOStormLens.setThreshold(b.dataset.v);
  else if (a === 'lensSampling' && window.MONOStormLens) window.MONOStormLens.setRadius(b.dataset.v);
  else if (a === 'lensReload' && window.MONOStormLens) window.MONOStormLens.load(true);
  else if (a === 'eLayer' && window.MONOEarthGlobe) {window.MONOEarthGlobe.toggle(b.dataset.v);updateGlobeCtl();}
  else if (a === 'eOpenImpact' && window.MONOEarthGlobe) {const val=b.dataset.v||'',sep=val.indexOf(':'),factor=sep>=0?val.slice(0,sep):'enso',id=sep>=0?val.slice(sep+1):val;goto('earth');window.MONOEarthGlobe.openImpact(factor,id);}
  else if (a === 'gBase') { state.gBase = b.dataset.v; persistUI(); paintGlobe(); render(); }
  else if (a === 'gLayer') { const k = b.dataset.v; state.gLayers[k] = !state.gLayers[k]; persistUI(); if (k === 'radar' || k === 'rain') paintGlobe(); if (k === 'grid' && state.gLayers.grid) fetchGrid().then(() => updateGlobeCtl()); render(); }
  else if (a === 'gSpin') { state.gSpin = !state.gSpin; if (globe) globe.controls().autoRotate = state.gSpin; render(); }
  else if (a === 'gGrid') { state.gGrid = b.dataset.v; persistUI(); if (!state.gLayers.grid) state.gLayers.grid = true; render(); }
  else if (a === 'gRefresh') refreshGlobe(true);
  else if (a === 'gProbeClose') { state.probe = null; updateGlobeCtl(); }
  else if (a === 'gProbeOpen') { const P = state.probe; if (P) { const n = P.name || {}; const nm = n.name || `${num(P.lat, 2)}, ${num(P.lon, 2)}`; state.probe = null; setCity({ name: nm, nameEl: nm, admin1: n.admin1, country: n.country, cc: n.cc || '', lat: P.lat, lon: P.lon }); goto('now'); } }
  else if (a === 'csv') csv();
}
function init() {
  document.addEventListener('click', onClick);
  window.MONOEarthGlobe.onRefresh=()=>{if((state.page==='earth'||state.page==='globe') && globe && $('#globe'))updateGlobeCtl();};
  if(window.MONOStormLens){
    window.MONOStormLens.onRefresh=()=>{if((state.page==='earth'||state.page==='globe') && $('#globe'))updateGlobeCtl();};
    window.MONOStormLens.onPick=(lat,lon)=>{if(globe)globe.pointOfView({lat,lng:lon,altitude:2.15},850);};
  }
  document.addEventListener('change',e=>{
    if(e.target.id==='lensRadius'&&window.MONOStormLens)window.MONOStormLens.setManualRadius(Number(e.target.value));
  });
  document.addEventListener('change',e=>{if(e.target.id==='eYearRange'){window.MONOEarthGlobe.setYear(e.target.value);updateGlobeCtl();}});
  $('#navFilter')?.addEventListener('input',()=>navRender());
  $('#language').addEventListener('click', () => { state.lang = state.lang === 'el' ? 'en' : 'el'; persist(); killMap(); killGlobe(); render(); localizePlaces(); });
  $('#theme').addEventListener('click', () => { state.theme = state.theme === 'dark' ? 'light' : 'dark'; persist(); killMap(); killGlobe(); render(); });
  $('#refreshBtn').addEventListener('click', () => { loadAll(true); if(state.page==='maps') MonoForecast.refresh(); });
  $('#mobileMenu').addEventListener('click', e => { e.stopPropagation(); closeMobileNavigation(); $('.sidebar').classList.toggle('open'); });
  $('#geoBtn').addEventListener('click', () => locate(false));
  $('#search').addEventListener('input', e => { clearTimeout(searchT); searchT = setTimeout(() => geocode(e.target.value), 300); });
  $('#search').addEventListener('keydown', e => { if (e.key === 'Escape') $('#results').classList.add('hidden'); if (e.key === 'Enter') { e.preventDefault(); $('#results [data-action=city]')?.click(); } });
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-area')) $('#results').classList.add('hidden');
    if (!e.target.closest('.sidebar') && !e.target.closest('[data-action=menu]') && !e.target.closest('#mobileMenu')) $('.sidebar').classList.remove('open');
  });
  document.addEventListener('keydown', e => { if(e.key==='Escape' && mobileCategoryOpen){ e.preventDefault(); closeMobileNavigation(true); return; } if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) { e.preventDefault(); $('#search').focus(); } });
  window.addEventListener('resize',()=>{if(window.innerWidth>930 && mobileCategoryOpen)closeMobileNavigation();});
  let rz, lastW = window.innerWidth;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if ((window.innerWidth < 640) !== (lastW < 640) && state.page !== 'radar' && state.page !== 'globe') render(); lastW = window.innerWidth; }, 200); });
  if (!NAV.some(n => n[0] === state.page)) state.page = 'now';
  render();
  loadAll(true);
  loadCityLive();
  localizePlaces();
  loadNews();
  setInterval(() => { if (document.visibilityState === 'visible') loadNews(); }, NEWS_TTL);
  setInterval(() => { if (document.visibilityState === 'visible') loadAll(false); }, REFRESH_LIVE);
  setInterval(() => { if (state.page === 'globe' || state.page === 'earth') globeTick(); if (document.visibilityState === 'visible' && state.view && state.page !== 'radar' && state.page !== 'globe') { recompute(); render(); } }, 60e3);
}
init();
if (!cacheAllowed()) {
  try { for (const k of ['mono31_train','mono31_snapshot','mono31_climate']) localStorage.removeItem(k); } catch {}
  if ('caches' in window) caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('mono-weather-')).map(k => caches.delete(k)))).catch(() => {});
  if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(rs => Promise.all(rs.filter(r => r.active?.scriptURL === new URL('sw.js',location.href).href).map(r => r.unregister()))).catch(() => {});
}
if (cacheAllowed() && 'serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
