import { StyleSheet, Text } from 'react-native';

import React from 'react';

import { useAtomValue } from 'jotai';

import { statusAtom } from '../state';
import { theme } from '../theme';

// Live status caption — a plain atom-driven Text. A ReText (TextInput-based)
// would avoid the re-render, but on the new architecture its native text
// updates occasionally flash unstyled (black) and clip to the previous width;
// an isolated leaf re-rendering once per move is the better trade.
export const StatusCaption: React.FC = () => {
  const caption = useAtomValue(statusAtom);
  return (
    <Text style={styles.caption} numberOfLines={1}>
      {caption}
    </Text>
  );
};

const styles = StyleSheet.create({
  caption: {
    color: theme.textMuted,
    fontFamily: 'SF-Compact-Rounded-Medium',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.1,
    marginTop: 2,
  },
});
