import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { DEFAULT_ALERTS, saveAlertPrefs, syncForecastAlerts, scheduledMonoAlerts, cancelMonoForecastAlerts } from './LocalAlertService';

const KEY = 'mono_mobile_alert_options_v1';
const OPTIONS = [
  {id:'rain', icon:'☂', name:'Βροχή που πλησιάζει',desc:'Προειδοποίηση περίπου 30 λεπτά πριν'},
  {id:'storm',icon:'ϟ',name:'Επικίνδυνα καιρικά φαινόμενα',desc:'Εκτίμηση για καταιγίδες και πολύ δυνατή βροχή'},
  {id:'wind',icon:'≋',name:'Ισχυροί άνεμοι',desc:'Ριπές και μποφόρ'},
  {id:'daily',icon:'☀',name:'Πρωινή πρόγνωση',desc:'Μια ημερήσια σύνοψη'},
  {id:'air',icon:'◌',name:'Ατμοσφαιρική ποιότητα',desc:'Σκόνη, ρύπανση, γύρη'},
];
const DEFAULTS = DEFAULT_ALERTS;
const BG='#f7f9fc',INK='#0f2038',BLUE='#3177d4';
Notifications.setNotificationHandler({
  handleNotification: async()=>({
    shouldShowBanner:true,shouldShowList:true,shouldPlaySound:true,shouldSetBadge:false,
  })
});
export default function NotificationSettings({visible,onClose}) {
 const [prefs,setPrefs]=useState(DEFAULTS), [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [queued,setQueued]=useState([]),[forecastBusy,setForecastBusy]=useState(false);
 const refreshList=useCallback(()=>scheduledMonoAlerts().then(setQueued).catch(()=>{}),[]);
 useEffect(()=>{if(visible)refreshList()},[visible,refreshList]);
 useEffect(()=>{ let alive=true;
  AsyncStorage.getItem(KEY).then(raw=>{
   if(raw && alive){ const data=JSON.parse(raw);
    if(data && typeof data==='object')setPrefs({...DEFAULTS,...Object.fromEntries(OPTIONS.map(o=>[o.id,data[o.id]===true]))});
   }
  }).catch(()=>{}).finally(()=>{if(alive)setReady(true)});
  return()=>{alive=false}
 },[]);
 const setOption=useCallback(async(id,value)=>{
   if(busy)return;
   const next={...prefs,[id]:value};
   setPrefs(next);setMessage('');setBusy(true);
   try {
     await saveAlertPrefs(next);
     if(!Object.values(next).some(Boolean)){
       await cancelMonoForecastAlerts();
       setMessage('Οι ειδοποιήσεις απενεργοποιήθηκαν.');
     }else{
       // The toggle is a direct user gesture: request OS permission only once,
       // then immediately schedule weather warnings for this device.
       const result=await syncForecastAlerts({requestPermissions:true,refreshLocation:true});
       setMessage(result.count+' ειδοποιήσεις προγραμματίστηκαν για τις επόμενες 48 ώρες.'+
         (result.warning?' '+result.warning:''));
     }
     await refreshList();
   }catch(e){
     setMessage('Οι ειδοποιήσεις δεν ενεργοποιήθηκαν: '+String(e?.message||e).slice(0,170));
   }finally{setBusy(false);}
 },[prefs,busy,refreshList]);
 const refreshForecast=async()=>{
   setForecastBusy(true);setMessage('');
   try{
     const result=await syncForecastAlerts({requestPermissions:true,refreshLocation:true});
     await refreshList();
     setMessage(result.count+' ειδοποιήσεις προγραμματίστηκαν από την τρέχουσα πρόγνωση για έως 48 ώρες.'+
       (result.warning?' '+result.warning:''));
   }catch(e){setMessage('Δεν ενεργοποιήθηκαν οι προγνωστικές ειδοποιήσεις: '+String(e?.message||e).slice(0,150))}
   finally{setForecastBusy(false)}
 };
 const testLocal=async()=>{
  setBusy(true);setMessage('');
  try {
   if(Platform.OS==='android')await Notifications.setNotificationChannelAsync('weather-alerts',{name:'MONO Weather',importance:Notifications.AndroidImportance.HIGH,vibrationPattern:[0,250,150,250]});
   let p=await Notifications.getPermissionsAsync();
   if(!p.granted)p=await Notifications.requestPermissionsAsync();
   if(!p.granted){setMessage('Δεν δόθηκε άδεια ειδοποιήσεων. Ενεργοποίησέ τες στις ρυθμίσεις Android.');return;}
   await Notifications.scheduleNotificationAsync({content:{title:'MONO WEATHER · ΔΟΚΙΜΗ',body:'Οι τοπικές ειδοποιήσεις λειτουργούν. Οι ζωντανές push χρειάζονται ενεργοποίηση FCM v1.',sound:'default',data:{route:'now'}},trigger:null});
   setMessage('Η δοκιμαστική τοπική ειδοποίηση στάλθηκε. Αυτό ΔΕΝ επιβεβαιώνει ότι λειτουργούν οι απομακρυσμένες push.');
  } catch(e){setMessage('Η δοκιμή απέτυχε: '+String(e?.message||e).slice(0,130))}
  finally {setBusy(false);}
 };
 return <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
  <View style={s.root}>
   <View style={s.top}><View><Text style={s.eyebrow}>MONO / ALERT CENTER</Text><Text style={s.title}>Ειδοποιήσεις</Text></View>
    <Pressable accessibilityRole="button" accessibilityLabel="Κλείσιμο" onPress={onClose} style={s.close}><Text style={s.closeText}>×</Text></Pressable></View>
   <ScrollView contentContainerStyle={s.content}>
    <View style={s.info}><Text style={s.infoTitle}>Ρυθμίσεις σε αυτή τη συσκευή</Text>
     <Text style={s.infoText}>Διάλεξε τις ειδοποιήσεις που σε ενδιαφέρουν. Οι επιλογές αποθηκεύονται στο κινητό σου.</Text></View>
    <Text style={s.section}>ΕΙΔΗ ΕΙΔΟΠΟΙΗΣΕΩΝ</Text>
    <View style={s.card}>{OPTIONS.map((o,i)=><View key={o.id} style={[s.option,i>0&&s.border]}>
     <View style={s.icon}><Text style={s.iconText}>{o.icon}</Text></View><View style={s.words}><Text style={s.name}>{o.name}</Text><Text style={s.desc}>{o.desc}</Text></View>
     <Switch accessibilityLabel={o.name} value={!!prefs[o.id]} disabled={!ready||busy} onValueChange={v=>setOption(o.id,v)} trackColor={{false:'#d4d9e0',true:'#8bb8ed'}} thumbColor={prefs[o.id]?BLUE:'#f7f7f7'}/></View>)}</View>
    <View style={s.info}><Text style={s.infoTitle}>Ειδοποιήσεις βροχής και κακοκαιρίας</Text>
      <Text style={s.infoText}>Με την άδειά σου, το MONO διαβάζει την πρόγνωση Open-Meteo για την περιοχή σου και προγραμματίζει ειδοποιήσεις έως 48 ώρες μπροστά. Θα εμφανίζονται και αν κλείσεις την εφαρμογή, αλλά δεν ενημερώνονται όσο παραμένει κλειστή.</Text></View>
    <Pressable accessibilityRole="button" disabled={forecastBusy||!ready} style={s.test} onPress={refreshForecast}>
      {forecastBusy?<ActivityIndicator color="#fff"/>:<Text style={s.testLabel}>ΕΝΕΡΓΟΠΟΙΗΣΗ / ΑΝΑΝΕΩΣΗ ΠΡΟΓΝΩΣΗΣ  ↗</Text>}
    </Pressable>
    <Text style={[s.section,{marginTop:18}]}>ΕΠΟΜΕΝΕΣ ΠΡΟΓΡΑΜΜΑΤΙΣΜΕΝΕΣ ({queued.length})</Text>
    <View style={s.card}>{queued.length===0?
      <Text style={[s.desc,{padding:15}]}>Δεν υπάρχουν ακόμη προγραμματισμένες ειδοποιήσεις. Ενεργοποίησε τουλάχιστον μία κατηγορία και πάτησε το κουμπί παραπάνω.</Text>:
      queued.slice(0,6).map((q,i)=><View key={q.identifier} style={[s.option,i>0&&s.border]}>
        <View style={s.words}><Text style={s.name}>{q.content.title}</Text>
        <Text style={s.desc}>{new Date(Number(q.content?.data?.when)).toLocaleString('el-GR')}</Text></View>
      </View>)}</View>
    <View style={s.warning}><Text style={s.warningTitle}>Συνεχώς ενημερωμένα push: εκκρεμούν</Text>
      <Text style={s.warningText}>Για νέες προειδοποιήσεις ενώ η εφαρμογή παραμένει κλειστή, χρειάζονται Firebase FCM v1, EAS credentials, αποθήκευση συνδρομών και περιοδικός server ελέγχου. Αυτό δεν είναι ακόμη ενεργό.</Text></View>
    <Pressable disabled={busy} accessibilityRole="button" style={s.test} onPress={testLocal}>{busy?<ActivityIndicator color="#fff"/>:<Text style={s.testLabel}>ΔΟΚΙΜΗ ΤΟΠΙΚΗΣ ΕΙΔΟΠΟΙΗΣΗΣ  ↗</Text>}</Pressable>
    {!!message&&<Text style={s.result}>{message}</Text>}
    <Text style={s.foot}>Οι ειδοποιήσεις βασίζονται σε δεδομένα πρόγνωσης, όχι σε επίσημα δελτία της ΕΜΥ. Σε σοβαρή κακοκαιρία ακολούθησε τις αρμόδιες αρχές. Οι προγραμματισμένες ειδοποιήσεις δεν αλλάζουν όσο η εφαρμογή παραμένει κλειστή. Η δοκιμαστική ειδοποίηση δεν χρησιμοποιεί δεδομένα καιρού.</Text>
   </ScrollView>
  </View>
 </Modal>;
}
const s=StyleSheet.create({
 root:{flex:1,backgroundColor:BG}, top:{paddingTop:25,paddingHorizontal:22,paddingBottom:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomColor:'#e2e8f0',borderBottomWidth:1},
 eyebrow:{color:BLUE,fontSize:10,fontWeight:'900',letterSpacing:1.9},
 title:{color:INK,fontSize:28,fontWeight:'900',marginTop:5},
 close:{width:43,height:43,borderRadius:14,backgroundColor:'#e8edf5',alignItems:'center',justifyContent:'center'},
 closeText:{color:INK,fontSize:28,lineHeight:37},
 content:{paddingHorizontal:18,paddingVertical:22,paddingBottom:55},
 info:{backgroundColor:'#e9f2ff',padding:19,borderRadius:18}, infoTitle:{fontWeight:'800',fontSize:16,color:'#184b85'},
 infoText:{fontSize:13,lineHeight:21,color:'#426184',marginTop:7},
 section:{color:'#758399',fontSize:10,fontWeight:'900',letterSpacing:1.6,marginTop:25,marginBottom:12,marginLeft:4},
 card:{borderRadius:18,backgroundColor:'#fff',paddingHorizontal:15,borderColor:'#e5ebf1',borderWidth:1},
 option:{flexDirection:'row',alignItems:'center',paddingVertical:16,gap:12},border:{borderTopWidth:1,borderTopColor:'#eef1f4'},
 icon:{width:40,height:40,borderRadius:12,backgroundColor:'#eef5ff',alignItems:'center',justifyContent:'center'},
 iconText:{color:BLUE,fontSize:25,fontWeight:'800'},
 words:{flex:1},name:{fontWeight:'800',fontSize:14,color:INK},desc:{fontSize:11,color:'#7d8b9b',marginTop:5,lineHeight:16},
 warning:{borderColor:'#f0dbc0',borderWidth:1,backgroundColor:'#fff7ed',borderRadius:16,padding:17,marginTop:23},
 warningTitle:{color:'#854b12',fontWeight:'800',fontSize:14},warningText:{color:'#80592c',lineHeight:20,fontSize:12,marginTop:8},
 test:{marginTop:19,backgroundColor:INK,borderRadius:14,padding:17,alignItems:'center',minHeight:54},
 testLabel:{color:'#fff',fontSize:12,letterSpacing:.7,fontWeight:'800'},
 result:{color:'#33608c',fontSize:12,lineHeight:20,marginTop:15},
 foot:{marginTop:22,textAlign:'center',fontSize:11,lineHeight:18,color:'#84909e'}
});
