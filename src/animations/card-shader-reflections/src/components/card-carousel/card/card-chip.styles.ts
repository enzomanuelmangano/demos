import { StyleSheet } from 'react-native';

import { CARD_WIDTH, SPACING } from '../utils/constants';

export const styles = StyleSheet.create({
  chipContainer: {
    width: CARD_WIDTH * 0.15,
    height: CARD_WIDTH * 0.12,
    marginBottom: SPACING * 2,
  },
  chip: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
    padding: 2,
    borderWidth: 0.5,
    borderColor: '#A8A8A8',
    overflow: 'hidden',
  },
  chipGrid: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  chipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    height: '28%',
  },
  chipContact: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderColor: 'rgba(255, 255, 255, 0.4)',
    borderWidth: 0.5,
  },
  chipContactLarge: {
    width: '65%',
    height: '100%',
  },
  chipContactSmall: {
    width: '25%',
    height: '100%',
  },
});
