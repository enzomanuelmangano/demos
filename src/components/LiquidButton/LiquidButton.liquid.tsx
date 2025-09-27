import { BlurView } from 'expo-blur';
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
      <BlurView intensity={80} style={styles.blur}>
        <Text style={styles.text}>{title}</Text>
      </BlurView>
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
  blur: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
