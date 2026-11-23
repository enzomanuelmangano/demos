import { StyleSheet, View } from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';

import { spacing } from '../../constants';

/**
 * NetworkLogo component renders a credit card network logo (e.g., Visa, Mastercard style)
 * using overlapping gradient circles. The logo can be positioned at the top or bottom right
 * of the card.
 */
type NetworkLogoProps = {
  /** Position of the network logo on the card. Defaults to 'bottomRight' */
  position?: 'topRight' | 'bottomRight';
};

/**
 * Renders a stylized network logo using overlapping gradient circles
 * @param position - The position of the logo on the card ('topRight' or 'bottomRight')
 */
export const NetworkLogo = ({ position = 'bottomRight' }: NetworkLogoProps) => {
  return (
    <View
      style={[
        styles.networkLogo,
        position === 'topRight' ? styles.topRight : styles.bottomRight,
      ]}>
      <LinearGradient
        colors={['#1A1A1A', '#4A4A4A', '#1A1A1A']}
        locations={[0, 0.5, 1]}
        style={styles.networkCircle1}
      />
      <LinearGradient
        colors={['#4A4A4A', '#1A1A1A', '#4A4A4A']}
        locations={[0, 0.5, 1]}
        style={styles.networkCircle2}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  bottomRight: {
    bottom: spacing.xl,
  },
  networkCircle1: {
    borderColor: 'rgba(0,0,0,0.3)',
    borderRadius: 15,
    borderWidth: 0.5,
    height: 30,
    width: 30,
  },
  networkCircle2: {
    borderColor: 'rgba(0,0,0,0.3)',
    borderRadius: 15,
    borderWidth: 0.5,
    height: 30,
    marginLeft: -15,
    width: 30,
  },
  networkLogo: {
    alignItems: 'center',
    flexDirection: 'row',
    position: 'absolute',
    right: spacing.xl,
  },
  topRight: {
    top: spacing.xl,
  },
});
