'use strict';
const status = document.getElementById('privacy-status'), choice = document.getElementById('allow-cache');
try {choice.checked=localStorage.getItem('mono_privacy_cache')==='yes';} catch {}
const owned = key => /^mono(?:\d|_|-weather)/.test(key) || key === 'mono_allergens';
const alertsOn = () => { try { return JSON.parse(localStorage.getItem('mono_rain_alerts') || 'null')?.on === true; } catch { return false; } };
async function clearCaches(everything = false) {
  if ('caches' in window) for (const key of await caches.keys()) if (key.startsWith('mono-weather-') || (everything && key === 'mono-alerts')) await caches.delete(key);
  // Rain alerts need the service worker; keep it unless everything is being removed.
  if (!everything && alertsOn()) return;
  if ('serviceWorker' in navigator) for (const r of await navigator.serviceWorker.getRegistrations()) if (r.active?.scriptURL === new URL('sw.js',location.href).href) { try { await r.periodicSync?.unregister('mono-rain'); } catch {} await r.unregister(); }
}
document.getElementById('save-cache').addEventListener('click',async()=>{
  try {
    localStorage.setItem('mono_privacy_cache',choice.checked?'yes':'no');
    if(!choice.checked){for(const key of ['mono31_train','mono31_snapshot','mono31_climate','mono31_monthly_rain','mono31_forecast_history','mono31_event_history','mono31_yday'])localStorage.removeItem(key);await clearCaches();}
    status.textContent=choice.checked?'Η προαιρετική cache ενεργοποιήθηκε.':'Η προαιρετική cache απενεργοποιήθηκε και καθαρίστηκε.';
  } catch {status.textContent='Η αποθήκευση δεν ήταν διαθέσιμη. Έλεγξε τις ρυθμίσεις browser.';}
});
document.getElementById('clear-data').addEventListener('click',async()=>{
  try {await clearCaches(true);for(const key of Object.keys(localStorage))if(owned(key))localStorage.removeItem(key);choice.checked=false;status.textContent='Τα τοπικά δεδομένα MONO διαγράφηκαν. Κλείσε άλλες ανοικτές καρτέλες MONO και άνοιξε ξανά την εφαρμογή.';}
  catch {status.textContent='Δεν ολοκληρώθηκε η διαγραφή. Χρησιμοποίησε τις ρυθμίσεις ιστοτόπου του browser.';}
});
