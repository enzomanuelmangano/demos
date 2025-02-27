import { StyleSheet } from 'react-native';

import { CARD_WIDTH, SCREEN_WIDTH } from './utils/constants';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
  },
  flatListContent: {
    paddingHorizontal: (SCREEN_WIDTH - CARD_WIDTH) / 2,
  },
});
