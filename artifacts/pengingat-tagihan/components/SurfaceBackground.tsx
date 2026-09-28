import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

export function SurfaceBackground() {
  const colors = useColors();

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={[colors.background, colors.backgroundEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[colors.glow, 'transparent']}
        style={styles.upperGlow}
      />
      <LinearGradient
        colors={[colors.glow, 'transparent']}
        style={styles.lowerGlow}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  upperGlow: {
    position: 'absolute',
    width: 350,
    height: 350,
    top: 145,
    right: -150,
    borderRadius: 175,
    opacity: 0.75,
  },
  lowerGlow: {
    position: 'absolute',
    width: 280,
    height: 280,
    top: 450,
    left: -155,
    borderRadius: 140,
    opacity: 0.55,
  },
});