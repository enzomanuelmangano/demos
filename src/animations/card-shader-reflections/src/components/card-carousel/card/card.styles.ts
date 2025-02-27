import { StyleSheet, Platform } from 'react-native';

import { CARD_WIDTH, CARD_HEIGHT, SPACING } from '../utils/constants';

export const styles = StyleSheet.create({
  cardContainer: {
    width: CARD_WIDTH,
    paddingTop: SPACING,
    height: CARD_HEIGHT + SPACING,
  },
  card: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 20,
    padding: SPACING * 1.5,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: {
          width: 0,
          height: 10,
        },
        shadowOpacity: 0.3,
        shadowRadius: 20,
      },
      android: {
        elevation: 15,
      },
    }),
  },
  cardContent: {
    flex: 1,
  },
  titleWrapper: {
    position: 'absolute',
    bottom: SPACING,
    left: SPACING,
    height: 40,
    justifyContent: 'flex-start',
    transform: [{ rotate: '-90deg' }, { translateY: 10 }, { translateX: -20 }],
    transformOrigin: 'left bottom',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    opacity: 0.9,
    letterSpacing: -1,
    textTransform: 'uppercase',
  },
});
