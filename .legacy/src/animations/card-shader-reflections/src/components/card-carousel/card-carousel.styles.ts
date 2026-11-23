import { StyleSheet } from 'react-native';

import { CARD_WIDTH, SCREEN_WIDTH } from './utils/constants';

export const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#111',
    flex: 1,
    justifyContent: 'center',
  },
  flatListContent: {
    paddingHorizontal: (SCREEN_WIDTH - CARD_WIDTH) / 2,
  },
});
