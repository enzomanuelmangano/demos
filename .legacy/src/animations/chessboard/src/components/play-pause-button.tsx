import { StyleSheet } from 'react-native';

import React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { useAtomValue } from 'jotai';
import { PressableScale } from 'pressto';

import { pausedAtom, runningAtom } from '../state';
import { theme } from '../theme';

// Play/pause control for the replay — isolated so the icon toggle only
// re-renders this leaf. Shows pause while the replay is actively running,
// play when idle or held.
export const PlayPauseButton: React.FC<{ onPress: () => void }> = ({
  onPress,
}) => {
  const running = useAtomValue(runningAtom);
  const paused = useAtomValue(pausedAtom);
  const showPause = running && !paused;
  return (
    <PressableScale onPress={onPress} style={styles.button}>
      <Ionicons
        name={showPause ? 'pause' : 'play'}
        size={22}
        color={theme.text}
      />
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderCurve: 'continuous',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    height: 52,
    justifyContent: 'center',
    width: 54,
  },
});
