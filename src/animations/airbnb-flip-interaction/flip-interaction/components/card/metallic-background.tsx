import { StyleSheet } from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';

import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';

type MetallicBackgroundProps = {
  style?: ViewStyle;
  children?: ReactNode;
};

export const MetallicBackground = ({
  style,
  children,
}: MetallicBackgroundProps) => {
  return (
    <LinearGradient
      colors={[
        '#4B6DC2', // Rich steel blue
        '#3959AA', // Deep royal blue
        '#587AD0', // Vibrant steel blue
        '#2C4A94', // Deep navy blue
        '#4265B7', // Rich base blue
      ]}
      locations={[0, 0.3, 0.5, 0.7, 1]}
      start={{ x: 0, y: 0.2 }}
      end={{ x: 1, y: 0.8 }}
      style={[styles.background, style]}>
      {/* Main Shine Effect */}
      <LinearGradient
        colors={[
          'rgba(255,255,255,0.5)',
          'rgba(255,255,255,0.2)',
          'transparent',
          'rgba(255,255,255,0.2)',
          'rgba(255,255,255,0.5)',
        ]}
        locations={[0, 0.25, 0.5, 0.75, 1]}
        start={{ x: 0, y: 0.3 }}
        end={{ x: 1, y: 0.7 }}
        style={styles.shine}
      />

      {/* Horizontal Highlight */}
      <LinearGradient
        colors={[
          'transparent',
          'rgba(255,255,255,0.4)',
          'rgba(255,255,255,0.6)',
          'rgba(255,255,255,0.4)',
          'transparent',
        ]}
        locations={[0, 0.3, 0.5, 0.7, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.horizontalHighlight}
      />

      {/* Subtle Edge Lighting */}
      <LinearGradient
        colors={[
          'rgba(255,255,255,0.25)',
          'transparent',
          'transparent',
          'rgba(255,255,255,0.25)',
        ]}
        locations={[0, 0.2, 0.8, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.edgeLighting}
      />

      {/* Enhanced Texture */}
      <LinearGradient
        colors={[
          'rgba(0,0,0,0.1)',
          'rgba(255,255,255,0.05)',
          'rgba(0,0,0,0.1)',
          'rgba(255,255,255,0.05)',
          'rgba(0,0,0,0.1)',
        ]}
        locations={[0, 0.25, 0.5, 0.75, 1]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={styles.texture}
      />

      {/* Subtle Dark Vignette */}
      <LinearGradient
        colors={[
          'rgba(0,0,0,0.2)',
          'transparent',
          'transparent',
          'rgba(0,0,0,0.2)',
        ]}
        locations={[0, 0.2, 0.8, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.vignette}
      />

      {children}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  background: {
    borderColor: 'rgba(255,255,255,0.3)',
    borderWidth: 1,
    overflow: 'hidden',
  },
  edgeLighting: {
    ...StyleSheet.absoluteFill,
    opacity: 0.25,
  },
  horizontalHighlight: {
    ...StyleSheet.absoluteFill,
    opacity: 0.35,
  },
  shine: {
    ...StyleSheet.absoluteFill,
    opacity: 0.5,
  },
  texture: {
    ...StyleSheet.absoluteFill,
    opacity: 0.4,
  },
  vignette: {
    ...StyleSheet.absoluteFill,
    opacity: 0.3,
  },
});
