import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

interface LiquidButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}

export default function LiquidButton({
  title,
  onPress,
  disabled = false,
}: LiquidButtonProps) {
  return (
    <Pressable style={styles.container} onPress={onPress} disabled={disabled}>
      <LinearGradient
        colors={['#4F46E5', '#7C3AED']}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}>
        <Text style={styles.text}>{title}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  gradient: {
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
