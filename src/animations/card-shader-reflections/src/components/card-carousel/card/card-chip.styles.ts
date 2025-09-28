import { StyleSheet } from 'react-native';

import { CARD_WIDTH, SPACING } from '../utils/constants';

export const styles = StyleSheet.create({
  chip: {
    borderColor: '#A8A8A8',
    borderRadius: 4,
    borderWidth: 0.5,
    height: '100%',
    overflow: 'hidden',
    padding: 2,
    width: '100%',
  },
  chipContact: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderColor: 'rgba(255, 255, 255, 0.4)',
    borderWidth: 0.5,
  },
  chipContactLarge: {
    height: '100%',
    width: '65%',
  },
  chipContactSmall: {
    height: '100%',
    width: '25%',
  },
  chipContainer: {
    height: CARD_WIDTH * 0.12,
    marginBottom: SPACING * 2,
    width: CARD_WIDTH * 0.15,
  },
  chipGrid: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    flex: 1,
    justifyContent: 'space-between',
    padding: 2,
  },
  chipRow: {
    flexDirection: 'row',
    height: '28%',
    justifyContent: 'space-between',
  },
});
