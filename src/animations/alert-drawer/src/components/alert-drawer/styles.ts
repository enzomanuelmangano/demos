import { Dimensions, StyleSheet } from 'react-native';

// Constants
const { width: windowWidth } = Dimensions.get('window');
export const BUTTON_HEIGHT = 50;
export const BUTTON_WIDTH = windowWidth * 0.82;
export const MIN_BUTTON_WIDTH = windowWidth * 0.4;
export const EXPANDED_CARD_WIDTH = windowWidth * 0.9;
export const EXPANDED_CARD_HEIGHT = 300;
export const ALERT_COLOR = '#f0212b';

export const styles = StyleSheet.create({
  container: {
    width: EXPANDED_CARD_WIDTH,
    flexDirection: 'column',
    height: EXPANDED_CARD_HEIGHT,
  },
  card: {
    shadowColor: 'black',
    elevation: 4,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 30,
    zIndex: -1,
    borderRadius: 50,
    borderCurve: 'continuous',
    bottom: 0,
    position: 'absolute',
  },
  button: {
    height: BUTTON_HEIGHT,
    backgroundColor: ALERT_COLOR,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    paddingHorizontal: 20,
    width: BUTTON_WIDTH,
    borderRadius: 50,
    borderCurve: 'continuous',
  },
  buttonLabel: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'Honk-Regular',
  },
  cardContentWrapper: {
    flex: 1,
    overflow: 'hidden',
  },
  cardContent: {
    flex: 1,
  },
  iconContainer: {
    flexDirection: 'row',
  },
  closeIconContainer: {
    height: 50,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    height: 32,
    aspectRatio: 1,
    borderRadius: 16,
    backgroundColor: '#F8F8FA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    padding: 8,
    marginTop: 8,
  },
  title: {
    fontSize: 20,
    letterSpacing: 0.5,
    fontWeight: 'bold',
    fontFamily: 'Honk-Regular',
  },
  description: {
    marginTop: 8,
    fontSize: 15,
    letterSpacing: 0.5,
    color: '#999999',
    fontFamily: 'Honk-Regular',
  },
  cancelButton: {
    backgroundColor: '#dfdfdf',
    width: MIN_BUTTON_WIDTH,
    bottom: 0,
  },
  cancelButtonLabel: {
    color: '#111',
  },
});
