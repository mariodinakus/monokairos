import React, { useCallback, useEffect, useRef, useState } from 'react';
import MonoSplash from './MonoSplash';
import NotificationSettings from './NotificationSettings';
import { ActivityIndicator, BackHandler, Linking, Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { refreshForecastAlertsOnLaunch } from './LocalAlertService';

// Keep the current Vercel website and its APIs. This is a separate Expo client.
const APP_URL = 'https://monokairos.vercel.app/';
const APP_ORIGIN = new URL(APP_URL).origin;
const C = {
  background: '#f7f7f5', surface: '#ffffff', text: '#181a1c',
  muted: '#697078', border: '#e3e5e5', accent: '#276bcb', danger: '#af3445',
};

function internalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin === APP_ORIGIN;
  } catch { return false; }
}
function externalUrl(value) {
  try {
    const url = new URL(value);
    if (['https:', 'http:'].includes(url.protocol)) Linking.openURL(value).catch(() => {});
  } catch { /* Never open unsafe or malformed URLs. */ }
}

function MonoScreen() {
  const web = useRef(null);
  const backAvailable = useRef(false);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [gpsBusy, setGpsBusy] = useState(false);
  const [hint, setHint] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [showLaunch, setShowLaunch] = useState(true);
  useEffect(()=>{refreshForecastAlertsOnLaunch().catch(()=>{});},[]);

  const reload = useCallback(() => {
    setError(''); setLoading(true); setProgress(0); setShowLaunch(true); backAvailable.current = false;
    setReloadKey(k => k + 1);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (error) { reload(); return true; }
      if (backAvailable.current && web.current) {
        web.current.goBack(); return true;
      }
      return false;
    });
    return () => listener.remove();
  }, [error, reload]);

  const locate = useCallback(async () => {
    if (gpsBusy) return;
    setGpsBusy(true);
    setHint('');
    try {
      if (!(await Location.hasServicesEnabledAsync())) {
        setHint('Ενεργοποίησε την τοποθεσία στις ρυθμίσεις του κινητού.');
        return;
      }
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setHint('Δεν δόθηκε άδεια GPS · αναζήτησε πόλη χειροκίνητα.');
        return;
      }
      // Use the original MONO locality resolver and forecast request.
      // WebView may request a second geolocation permission on some devices.
      web.current?.injectJavaScript("(function(){var b=document.getElementById('geoBtn');if(b)b.click();})();true;");
      setHint('GPS ενεργό · επίτρεψε την πρόσβαση αν σου ζητηθεί ξανά.');
    } catch {
      setHint('Το GPS δεν είναι διαθέσιμο αυτή τη στιγμή.');
    } finally {
      setGpsBusy(false);
    }
  }, [gpsBusy]);

  const navigate = useCallback(request => {
    const target = request.url || '';
    if (internalUrl(target) || target === 'about:blank' || target.startsWith('blob:')) return true;
    externalUrl(target);
    return false;
  }, []);

  return (
    <SafeAreaView style={s.root} edges={['top','bottom','left','right']}>
      <StatusBar barStyle="dark-content" backgroundColor={C.background} />
      <View style={s.header}>
        <View style={s.identity}>
          <View style={s.logo}><Text style={s.logoText}>M.</Text></View>
          <View>
            <Text style={s.title}>MONO <Text style={s.titleLight}>WEATHER</Text></Text>
            <Text style={s.subtitle}>LIVE</Text>
          </View>
        </View>
        <View style={s.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Ρυθμίσεις ειδοποιήσεων" onPress={() => setSettingsVisible(true)}
            style={({pressed}) => [s.iconButton, pressed && s.pressed]}>
            <Text style={[s.icon,{fontSize:21}]}>♧</Text>
          </Pressable>
          <Pressable accessibilityLabel="Εντοπισμός θέσης GPS" accessibilityRole="button" disabled={gpsBusy || !!error} onPress={locate}
            style={({pressed}) => [s.iconButton, pressed && s.pressed]}>
            {gpsBusy ? <ActivityIndicator size="small" color={C.accent}/> : <Text style={s.icon}>◎</Text>}
          </Pressable>
          <Pressable accessibilityLabel="Ανανέωση καιρού" accessibilityRole="button" onPress={reload}
            style={({pressed}) => [s.iconButton, pressed && s.pressed]}>
            <Text style={s.icon}>↻</Text>
          </Pressable>
        </View>
      </View>
      {!!hint && <Pressable style={s.hint} accessibilityRole="button" onPress={() => setHint('')}>
        <Text style={s.hintText}>{hint}  ×</Text>
      </Pressable>}
      <View style={s.body}>
        {!error && <WebView
          key={reloadKey}
          ref={web}
          source={{uri: APP_URL}}
          style={s.web}
          originWhitelist={['https://*']}
          onShouldStartLoadWithRequest={navigate}
          onOpenWindow={event => externalUrl(event.nativeEvent.targetUrl)}
          onNavigationStateChange={state => { backAvailable.current = !!state.canGoBack; }}
          onLoadStart={() => { setLoading(true); setProgress(0); }}
          onLoadProgress={({nativeEvent}) => setProgress(nativeEvent.progress || 0)}
          onLoadEnd={() => { setLoading(false); setShowLaunch(false); }}
          onError={({nativeEvent}) => { setError(nativeEvent.description || 'Η σύνδεση απέτυχε.'); setLoading(false); }}
          onHttpError={({nativeEvent}) => {
            if (nativeEvent.statusCode >= 400 && nativeEvent.url === APP_URL) {
              setError('Ο διακομιστής επέστρεψε HTTP ' + nativeEvent.statusCode);
              setLoading(false);
            }
          }}
          javaScriptEnabled domStorageEnabled geolocationEnabled sharedCookiesEnabled
          thirdPartyCookiesEnabled={false} allowsBackForwardNavigationGestures
          allowsInlineMediaPlayback mediaPlaybackRequiresUserAction
          setSupportMultipleWindows={false} mixedContentMode="never"
          javaScriptCanOpenWindowsAutomatically={false} cacheEnabled
          pullToRefreshEnabled={Platform.OS === 'ios'} overScrollMode="never"
          startInLoadingState={false} contentMode="mobile"
          onContentProcessDidTerminate={reload} onRenderProcessGone={reload}
        />}
        {!error && loading && progress < 1 && <View pointerEvents="none" style={s.progressTrack}>
          <View style={[s.progressFill, {width: String(Math.max(8, Math.round(progress * 100))) + '%'}]}/>
        </View>}

        {!!error && <View style={s.errorScreen}>
          <Text style={s.errorSymbol}>◌</Text>
          <Text style={s.errorTitle}>Δεν ήταν δυνατή η σύνδεση</Text>
          <Text style={s.errorInfo}>Το MONO χρειάζεται διαδίκτυο για ζωντανά δεδομένα καιρού.</Text>
          <Text style={s.errorTech}>{error}</Text>
          <Pressable accessibilityRole="button" style={s.retry} onPress={reload}>
            <Text style={s.retryText}>Δοκίμασε ξανά  ↻</Text>
          </Pressable>
        </View>}
      </View>
      <NotificationSettings visible={settingsVisible} onClose={() => setSettingsVisible(false)} />
      {!error && showLaunch && loading && <MonoSplash progress={progress} />}
    </SafeAreaView>
  );
}

export default function App() {
  return <SafeAreaProvider><MonoScreen/></SafeAreaProvider>;
}

const s = StyleSheet.create({
  root:{flex:1,backgroundColor:C.background},
  header:{height:57,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:C.border,paddingHorizontal:14,backgroundColor:C.background},
  identity:{flexDirection:'row',alignItems:'center',gap:10},
  logo:{width:32,height:32,borderRadius:9,backgroundColor:C.text,alignItems:'center',justifyContent:'center'},
  logoText:{color:C.surface,fontSize:20,fontWeight:'900',letterSpacing:-2},
  title:{fontSize:14,fontWeight:'900',letterSpacing:-.2,color:C.text},
  titleLight:{fontWeight:'500',color:C.muted},
  subtitle:{fontSize:8,letterSpacing:1.3,fontWeight:'800',color:C.muted,marginTop:2},
  actions:{flexDirection:'row',gap:7},
  iconButton:{width:37,height:37,borderRadius:11,borderColor:C.border,borderWidth:1,alignItems:'center',justifyContent:'center',backgroundColor:C.surface},
  pressed:{backgroundColor:'#eef2f8'},
  icon:{fontSize:24,lineHeight:29,color:C.text,fontWeight:'400'},
  body:{flex:1,backgroundColor:C.surface},
  web:{flex:1,backgroundColor:C.surface},
  progressTrack:{position:'absolute',top:0,left:0,right:0,height:2,backgroundColor:'transparent'},
  progressFill:{height:2,backgroundColor:C.accent},
  loading:{position:'absolute',top:2,right:0,bottom:0,left:0,alignItems:'center',justifyContent:'center',backgroundColor:C.surface},
  loadingTitle:{fontSize:17,letterSpacing:1,marginTop:22,fontWeight:'900',color:C.text},
  loadingText:{fontSize:12,color:C.muted,marginTop:8},
  hint:{backgroundColor:'#e8f1fc',paddingHorizontal:16,paddingVertical:9},
  hintText:{color:'#1a4d8d',fontSize:11,textAlign:'center',lineHeight:17},
  errorScreen:{flex:1,alignItems:'center',justifyContent:'center',paddingHorizontal:28,backgroundColor:C.background},
  errorSymbol:{color:C.danger,fontSize:70,marginBottom:10},
  errorTitle:{color:C.text,fontSize:22,fontWeight:'800',textAlign:'center'},
  errorInfo:{color:C.muted,fontSize:14,textAlign:'center',lineHeight:23,marginTop:14},
  errorTech:{color:C.muted,fontSize:11,textAlign:'center',marginTop:16},
  retry:{backgroundColor:C.text,paddingHorizontal:25,paddingVertical:15,borderRadius:12,marginTop:26},
  retryText:{color:C.surface,fontWeight:'700',fontSize:14},
});