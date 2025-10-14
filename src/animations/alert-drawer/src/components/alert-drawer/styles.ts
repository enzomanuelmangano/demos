import { Dimensions, StyleSheet } from 'react-native';

const { width: windowWidth } = Dimensions.get('window');
export const BUTTON_HEIGHT = 50;
export const BUTTON_WIDTH = windowWidth * 0.82;
export const MIN_BUTTON_WIDTH = windowWidth * 0.4;
export const EXPANDED_CARD_WIDTH = windowWidth * 0.9;
export const EXPANDED_CARD_HEIGHT = 300;
export const ALERT_COLOR = '#f0212b';

export const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: ALERT_COLOR,
    borderCurve: 'continuous',
    borderRadius: 50,
    height: BUTTON_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: 20,
    position: 'absolute',
    width: BUTTON_WIDTH,
  },
  buttonLabel: {
    color: 'white',
    fontFamily: 'Honk-Regular',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelButton: {
    backgroundColor: '#dfdfdf',
    bottom: 0,
    width: MIN_BUTTON_WIDTH,
  },
  cancelButtonLabel: {
    color: '#111',
  },
  card: {
    borderCurve: 'continuous',
    borderRadius: 50,
    bottom: 0,
    elevation: 4,
    position: 'absolute',
    shadowColor: 'black',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 30,
    zIndex: -1,
  },
  cardContent: {
    flex: 1,
  },
  cardContentWrapper: {
    flex: 1,
    overflow: 'hidden',
  },
  closeButton: {
    alignItems: 'center',
    aspectRatio: 1,
    backgroundColor: '#F8F8FA',
    borderCurve: 'continuous',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
  },
  closeIconContainer: {
    alignItems: 'center',
    aspectRatio: 1,
    height: 50,
    justifyContent: 'center',
  },
  container: {
    flexDirection: 'column',
    height: EXPANDED_CARD_HEIGHT,
    width: EXPANDED_CARD_WIDTH,
  },
  description: {
    color: '#999999',
    fontFamily: 'Honk-Regular',
    fontSize: 15,
    letterSpacing: 0.5,
    marginTop: 8,
  },
  iconContainer: {
    flexDirection: 'row',
  },
  textContainer: {
    marginTop: 8,
    padding: 8,
  },
  title: {
    fontFamily: 'Honk-Regular',
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
});
