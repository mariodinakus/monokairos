import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

const BLUE = '#82baff';

export default function MonoSplash({progress = 0}) {
  const orbit = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(.5)).current;
  useEffect(() => {
    const spin = Animated.loop(Animated.timing(orbit, {toValue:1,duration:11000,easing:Easing.linear,useNativeDriver:true}));
    const breathe = Animated.loop(Animated.sequence([
      Animated.timing(pulse,{toValue:1,duration:1400,easing:Easing.inOut(Easing.quad),useNativeDriver:true}),
      Animated.timing(pulse,{toValue:.5,duration:1400,easing:Easing.inOut(Easing.quad),useNativeDriver:true})
    ]));
    spin.start(); breathe.start();
    return () => {spin.stop();breathe.stop();};
  },[orbit,pulse]);
  const rotation=orbit.interpolate({inputRange:[0,1],outputRange:['0deg','360deg']});
  return <View style={s.outer}>
    <View style={s.backdropCircle}/>
    <View style={s.brand}>
      <Animated.View style={[s.orbit,{transform:[{rotate:rotation}],opacity:pulse}]}>
        <View style={s.satellite} />
      </Animated.View>
      <View style={s.monogram}>
        <Text style={s.letter}>M<Text style={s.dot}>.</Text></Text>
        <View style={s.glint}/>
      </View>
    </View>
    <Text style={s.wordmark}>MONO</Text>
    <Text style={s.submark}>W E A T H E R</Text>
    <Text style={s.message}>Ο καιρός, με περισσότερη ακρίβεια.</Text>
    <View style={s.track}><View style={[s.fill,{width:Math.max(9,Math.round(Math.min(progress,1)*100))+'%'}]}/></View>
    <Text style={s.status}>ΣΥΝΔΕΣΗ ΜΕ ΖΩΝΤΑΝΑ ΔΕΔΟΜΕΝΑ</Text>
    <Text style={s.bottom}>ATMOSPHERE · FORECAST · INTELLIGENCE</Text>
  </View>;
}
const s=StyleSheet.create({
 outer:{position:'absolute',top:0,right:0,bottom:0,left:0,alignItems:'center',justifyContent:'center',backgroundColor:'#101b2b',overflow:'hidden'},
 backdropCircle:{position:'absolute',width:340,height:340,borderRadius:170,borderColor:'#243b59',borderWidth:1,backgroundColor:'#14243a',top:'24%'},
 brand:{width:168,height:168,alignItems:'center',justifyContent:'center'},
 orbit:{position:'absolute',width:157,height:157,borderRadius:90,borderWidth:1.5,borderColor:'#3d70a9',borderStyle:'dashed'},
 satellite:{width:10,height:10,backgroundColor:'#9dccff',borderRadius:5,position:'absolute',top:-5,left:'48%',shadowColor:'#9dccff',shadowOpacity:.9,shadowRadius:12,elevation:4},
 monogram:{width:112,height:112,borderRadius:28,alignItems:'center',justifyContent:'center',backgroundColor:'#eaf3ff',borderColor:'#b2d3fa',borderWidth:1,transform:[{rotate:'-8deg'}],elevation:12},
 letter:{fontSize:73,fontWeight:'900',letterSpacing:-8,color:'#10213a',transform:[{rotate:'8deg'}]},
 dot:{color:'#448ee6'},
 glint:{position:'absolute',width:14,height:3,borderRadius:3,backgroundColor:'#83b9fa',top:15,right:18},
 wordmark:{color:'#eef5ff',fontSize:41,letterSpacing:8,fontWeight:'900',marginTop:25,marginLeft:9},
 submark:{color:BLUE,fontSize:10,fontWeight:'800',letterSpacing:4,marginTop:7,marginLeft:6},
 message:{color:'#98afc7',fontSize:12,marginTop:28},
 track:{width:172,height:3,backgroundColor:'#2a405f',borderRadius:5,overflow:'hidden',marginTop:31},
 fill:{height:3,backgroundColor:BLUE,borderRadius:4},
 status:{color:'#7191b6',fontWeight:'700',letterSpacing:1.1,fontSize:9,marginTop:15},
 bottom:{position:'absolute',bottom:36,fontSize:9,letterSpacing:1.4,color:'#637c9b',fontWeight:'600'}
});
