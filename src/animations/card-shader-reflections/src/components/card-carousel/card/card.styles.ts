import { StyleSheet, Platform } from 'react-native';

import { CARD_WIDTH, CARD_HEIGHT, SPACING } from '../utils/constants';

export const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    flex: 1,
    overflow: 'hidden',
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
  cardContainer: {
    height: CARD_HEIGHT + SPACING,
    paddingTop: SPACING,
    width: CARD_WIDTH,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -1,
    opacity: 0.9,
    textTransform: 'uppercase',
  },
  titleWrapper: {
    bottom: SPACING,
    height: 40,
    justifyContent: 'flex-start',
    left: SPACING,
    position: 'absolute',
    transform: [{ rotate: '-90deg' }, { translateY: 10 }, { translateX: -20 }],
    transformOrigin: 'left bottom',
  },
});
