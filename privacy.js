'use strict';
const status = document.getElementById('privacy-status'), choice = document.getElementById('allow-cache');
try {choice.checked=localStorage.getItem('mono_privacy_cache')==='yes';} catch {}
const owned = key => /^mono(?:\d|_|-weather)/.test(key) || key === 'mono_allergens';
async function clearCaches() {
  if ('caches' in window) for (const key of await caches.keys()) if(key.startsWith('mono-weather-')) await caches.delete(key);
  if ('serviceWorker' in navigator) for (const r of await navigator.serviceWorker.getRegistrations()) if (r.active?.scriptURL === new URL('sw.js',location.href).href) await r.unregister();
}
document.getElementById('save-cache').addEventListener('click',async()=>{
  try {
    localStorage.setItem('mono_privacy_cache',choice.checked?'yes':'no');
    if(!choice.checked){for(const key of ['mono31_train','mono31_snapshot','mono31_climate'])localStorage.removeItem(key);await clearCaches();}
    status.textContent=choice.checked?'Η προαιρετική cache ενεργοποιήθηκε.':'Η προαιρετική cache απενεργοποιήθηκε και καθαρίστηκε.';
  } catch {status.textContent='Η αποθήκευση δεν ήταν διαθέσιμη. Έλεγξε τις ρυθμίσεις browser.';}
});
document.getElementById('clear-data').addEventListener('click',async()=>{
  try {for(const key of Object.keys(localStorage))if(owned(key))localStorage.removeItem(key);await clearCaches();choice.checked=false;status.textContent='Τα τοπικά δεδομένα MONO διαγράφηκαν. Κλείσε άλλες ανοικτές καρτέλες MONO και άνοιξε ξανά την εφαρμογή.';}
  catch {status.textContent='Δεν ολοκληρώθηκε η διαγραφή. Χρησιμοποίησε τις ρυθμίσεις ιστοτόπου του browser.';}
});
