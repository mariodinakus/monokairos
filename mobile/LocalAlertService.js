import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { Platform } from 'react-native';

const { planForecastAlerts }=require('./alertPlanner.cjs');
export const PREF_KEY='mono_mobile_alert_options_v1';
const COORD_KEY='mono_alert_coords_v1';
const SYNC_KEY='mono_alert_last_sync_v1';
const ID_FLAG='monoScheduledForecastV1';
const TYPES=['rain','storm','wind','daily','air'];
export const DEFAULT_ALERTS=Object.fromEntries(TYPES.map(t=>[t,false]));

async function jsonFetch(url) {
 const ctrl=new AbortController();
 const timeout=setTimeout(()=>ctrl.abort(),16000);
 try{
   const res=await fetch(url,{signal:ctrl.signal,headers:{Accept:'application/json'}});
   if(!res.ok)throw new Error('API '+res.status);
   return await res.json();
 }finally{clearTimeout(timeout)}
}
export async function ensureWeatherChannel(){
 if(Platform.OS==='android')await Notifications.setNotificationChannelAsync(
    'weather-alerts',{name:'MONO · Καιρικές ειδοποιήσεις',
      importance:Notifications.AndroidImportance.HIGH,vibrationPattern:[0,200,120,200]});
}
export async function permissionForAlerts({request=false}={}){
 await ensureWeatherChannel();
 let state=await Notifications.getPermissionsAsync();
 if(!state.granted&&request)state=await Notifications.requestPermissionsAsync();
 return Boolean(state.granted);
}
export async function loadAlertPrefs(){
 try {
  const value=JSON.parse(await AsyncStorage.getItem(PREF_KEY)||'null');
  if(!value||typeof value!=='object')return DEFAULT_ALERTS;
  return {...DEFAULT_ALERTS,...Object.fromEntries(TYPES.map(type=>[type,value[type]===true]))};
 }catch{return DEFAULT_ALERTS}
}
export async function saveAlertPrefs(data){
 const clean=Object.fromEntries(TYPES.map(t=>[t,data[t]===true]));
 await AsyncStorage.setItem(PREF_KEY,JSON.stringify(clean));
 return clean;
}
// Store a coarse (~1 km) fix for forecasts, never raw GPS coordinates.
export async function rememberAlertCoordinates(latitude,longitude){
 if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)throw Error('Invalid GPS fix');
 const next={lat:Number(latitude.toFixed(2)),lon:Number(longitude.toFixed(2)),at:Date.now()};
 const raw=await AsyncStorage.getItem(COORD_KEY);
 let previous=null;
 try {previous=raw?JSON.parse(raw):null;}catch{}
 await AsyncStorage.setItem(COORD_KEY,JSON.stringify(next));
 return !previous||Math.abs(previous.lat-next.lat)>=.02||Math.abs(previous.lon-next.lon)>=.02;
}
export async function getAlertCoordinates({request=false}={}){
 let stored=await AsyncStorage.getItem(COORD_KEY);
 if(!request&&stored){
  try{const c=JSON.parse(stored);if(Number.isFinite(c.lat)&&Number.isFinite(c.lon))return c;}catch{}
 }
 let allowed=await Location.getForegroundPermissionsAsync();
 if(!allowed.granted&&request)allowed=await Location.requestForegroundPermissionsAsync();
 if(!allowed.granted){if(request)throw Error('Χρειάζεται άδεια τοποθεσίας για ειδοποιήσεις της περιοχής σου.');return null;}
 if(!request&&stored){try{return JSON.parse(stored)}catch{}}
 const coords=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});
 const c={lat:Number(coords.coords.latitude.toFixed(2)),lon:Number(coords.coords.longitude.toFixed(2))};
 await AsyncStorage.setItem(COORD_KEY,JSON.stringify(c));
 return c;
}
export async function cancelMonoForecastAlerts(){
 const existing=await Notifications.getAllScheduledNotificationsAsync();
 const ours=existing.filter(a=>a.content?.data?.[ID_FLAG]===true);
 await Promise.all(ours.map(a=>Notifications.cancelScheduledNotificationAsync(a.identifier)));
 return ours.length;
}
export async function scheduledMonoAlerts(){
 const list=await Notifications.getAllScheduledNotificationsAsync();
 return list.filter(a=>a.content?.data?.[ID_FLAG]===true)
     .sort((a,b)=>(Number(a.content?.data?.when)||0)-(Number(b.content?.data?.when)||0));
}
export async function syncForecastAlerts({requestPermissions=false,refreshLocation=false}={}){
 const prefs=await loadAlertPrefs();
 if(!Object.values(prefs).some(Boolean)){
   await cancelMonoForecastAlerts();
   return {count:0,mode:'off'};
 }
 const granted=await permissionForAlerts({request:requestPermissions});
 if(!granted)throw Error('Χρειάζεται άδεια ειδοποιήσεων στις ρυθμίσεις Android.');
 const point=await getAlertCoordinates({request:refreshLocation||requestPermissions});
 if(!point)throw Error('Επίλεξε ενεργοποίηση και επίτρεψε το GPS για τοπική πρόγνωση.');
 const args='latitude='+point.lat+'&longitude='+point.lon+'&timeformat=unixtime&timezone=auto';
 const wUrl='https://api.open-meteo.com/v1/forecast?'+args+
 '&forecast_days=3&hourly=precipitation_probability,precipitation,weather_code,wind_gusts_10m,temperature_2m';
 const aUrl='https://air-quality-api.open-meteo.com/v1/air-quality?'+args+'&forecast_days=3&hourly=us_aqi';
 const [weather,air]=await Promise.all([jsonFetch(wUrl),
   prefs.air?jsonFetch(aUrl).catch(()=>null):Promise.resolve(null)]);
 const now=Date.now();
 const events=planForecastAlerts({weather,air,prefs,now});
 // Never delete old alerts before a successful fetch and validation.
 if(!Array.isArray(weather?.hourly?.time)||!weather.hourly.time.length)throw Error('Η υπηρεσία καιρού δεν επέστρεψε πρόγνωση.');
 await cancelMonoForecastAlerts();
 const errors=[];
 for(const event of events){
  try{
   await Notifications.scheduleNotificationAsync({
    content:{title:event.title,body:event.body,sound:'default',
      data:{[ID_FLAG]:true,type:event.type,when:event.at,forecastAt:now}},
    trigger:{type:Notifications.SchedulableTriggerInputTypes.DATE,
      date:new Date(event.at),channelId:'weather-alerts'}
   });
  }catch(e){errors.push(String(e?.message||e))}
 }
 if(events.length&&errors.length===events.length)throw Error('Δεν έγινε προγραμματισμός ειδοποιήσεων: '+errors[0]);
 await AsyncStorage.setItem(SYNC_KEY,String(now));
 return {count:events.length-errors.length,mode:'local',at:now,
   warning:errors.length?String(errors.length)+' ειδοποιήσεις δεν προγραμματίστηκαν.':null};
}
export async function refreshForecastAlertsOnLaunch({force=false}={}){
 const prefs=await loadAlertPrefs();
 if(!Object.values(prefs).some(Boolean))return;
 const last=Number(await AsyncStorage.getItem(SYNC_KEY)||0);
 if(!force&&Date.now()-last<2*3600e3)return;
 try{await syncForecastAlerts()}catch{ /* No alert permissions or offline: manual button shows error. */ }
}
