import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

// Brand-matched monochrome screen: same off-white, charcoal and warm greys as MONO Web.
// Everything is native React Native (including the actual loading progress).
const COLOR = {
  paper: '#f7f7f5',
  charcoal: '#171717',
  secondary: '#858585',
  contour: '#e6e6e2',
  track: '#d6d6d2',
};

export default function MonoSplash({ progress = 0 }) {
  const { width } = useWindowDimensions();
  const appearance = useRef(new Animated.Value(0)).current;
  const veil = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(appearance, {
        toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
      Animated.timing(veil, {
        toValue: 1, duration: 950, easing: Easing.out(Easing.quad), useNativeDriver: true,
      }),
    ]).start();
  }, [appearance, veil]);

  const barWidth = Math.max(160, Math.min(width - 100, 210));
  const percent = Math.min(100, Math.max(5, Math.round((Number(progress) || 0) * 100)));

  return (
    <View pointerEvents="none" style={styles.full}>
      {/* Discreet, low-contrast isobars. No blue, gradients, gold or fake status bar. */}
      <View style={styles.contourTopOuter}/>
      <View style={styles.contourTopInner}/>
      <View style={styles.contourSideOuter}/>
      <View style={styles.contourSideInner}/>
      <View style={styles.contourBottomOuter}/>
      <View style={styles.contourBottomInner}/>
      <Animated.View style={[styles.ambientLeft, {opacity: veil}]}/>
      <Animated.View style={[styles.ambientRight, {opacity: veil}]}/>

      <Animated.View
        accessibilityLabel="MONO Weather. LIVE. Φόρτωση εφαρμογής"
        style={[styles.center, {
          opacity: appearance,
          transform: [{ translateY: appearance.interpolate({
            inputRange: [0, 1], outputRange: [12, 0],
          }) }],
        }]}>
        <View style={styles.mark}>
          <Text allowFontScaling={false} style={styles.markText}>M.</Text>
        </View>
        <View style={styles.wordmark}>
          <Text allowFontScaling={false} style={styles.wordStrong}>MONO</Text>
          <Text allowFontScaling={false} style={styles.wordLight}> WEATHER</Text>
        </View>
        <Text allowFontScaling={false} style={styles.live}>LIVE</Text>
      </Animated.View>

      <View style={styles.progressArea}>
        <View style={[styles.progressTrack, {width: barWidth}]}>
          <View style={[styles.progressFill, {width: percent + '%'}]}/>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  full: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    backgroundColor: COLOR.paper, overflow: 'hidden', zIndex: 100,
  },
  center: {
    position: 'absolute', top: '31%', left: 0, right: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  mark: {
    height: 106, width: 106, borderRadius: 25,
    backgroundColor: COLOR.charcoal,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#171717', shadowOpacity: 0.10,
    shadowRadius: 14, shadowOffset: {width: 0, height: 7}, elevation: 3,
  },
  markText: {
    color: '#ffffff', fontSize: 64, fontWeight: '800',
    letterSpacing: -5.5, marginLeft: -5, marginTop: -4,
  },
  wordmark: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center',
    marginTop: 29,
  },
  wordStrong: {fontSize: 29, fontWeight: '750', letterSpacing: -1.5, color: COLOR.charcoal},
  wordLight: {fontSize: 27, fontWeight: '400', letterSpacing: -1.5, color: COLOR.secondary},
  live: {
    color: COLOR.secondary, letterSpacing: 7, fontSize: 12, marginTop: 15,
    paddingLeft: 7, fontWeight: '500',
  },
  progressArea: {
    position: 'absolute', left: 0, right: 0, bottom: '15%',
    alignItems: 'center',
  },
  progressTrack: {
    height: 4, borderRadius: 6, backgroundColor: COLOR.track, overflow: 'hidden',
  },
  progressFill: {
    height: 4, borderRadius: 6, backgroundColor: COLOR.charcoal,
  },
  contourTopOuter: {
    position: 'absolute', width: 520, height: 650, borderWidth: 1,
    borderColor: COLOR.contour, borderRadius: 280,
    left: -330, top: -340, transform: [{rotate: '25deg'}],
  },
  contourTopInner: {
    position: 'absolute', width: 430, height: 580, borderWidth: 1,
    borderColor: COLOR.contour, borderRadius: 240,
    left: -310, top: -335, transform: [{rotate: '25deg'}],
  },
  contourSideOuter: {
    position: 'absolute', width: 550, height: 660, borderWidth: 1,
    borderColor: COLOR.contour, borderRadius: 310,
    right: -425, top: '43%', transform: [{rotate: '-24deg'}],
  },
  contourSideInner: {
    position: 'absolute', width: 460, height: 560, borderWidth: 1,
    borderColor: COLOR.contour, borderRadius: 280,
    right: -380, top: '48%', transform: [{rotate: '-24deg'}],
  },
  contourBottomOuter: {
    position: 'absolute', width: 760, height: 650, borderWidth: 1,
    borderColor: COLOR.contour, borderRadius: 380,
    left: -400, bottom: -535, transform: [{rotate: '10deg'}],
  },
  contourBottomInner: {
    position: 'absolute', width: 690, height: 590, borderWidth: 1,
    borderColor: COLOR.contour, borderRadius: 380,
    left: -380, bottom: -510, transform: [{rotate: '10deg'}],
  },
  ambientLeft: {
    position: 'absolute', left: -55, bottom: '17%', width: 180, height: 110,
    borderRadius: 100, backgroundColor: '#eaeae7', opacity: 0.55,
    transform: [{rotate: '-16deg'}],
  },
  ambientRight: {
    position: 'absolute', right: -78, top: '22%', width: 140, height: 145,
    borderRadius: 100, backgroundColor: '#efefec', opacity: 0.40,
  },
});
