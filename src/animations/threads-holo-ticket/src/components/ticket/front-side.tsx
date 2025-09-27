/**
 * Front side of the ticket component displaying event details.
 * Shows date, time, username, and ticket information in a structured layout.
 * Uses platform-specific fonts for iOS and Android.
 */

import { Platform, StyleSheet, Text, View } from 'react-native';

export const FrontSide = () => {
  return (
    <View style={styles.container}>
      {/* Date section */}
      <View style={styles.section}>
        <Text style={styles.label}>DATE</Text>
        <Text style={styles.value}>TUE 14 JAN</Text>
      </View>

      {/* Time section */}
      <View style={styles.section}>
        <Text style={styles.label}>TIME</Text>
        <Text style={styles.value}>11:00 AM CET</Text>
      </View>

      {/* Username section */}
      <View style={styles.section}>
        <Text style={styles.label}>USERNAME</Text>
        <Text style={styles.value}>Enzo</Text>
      </View>

      <View style={styles.spacer} />

      {/* Footer with user info and ticket number */}
      <View style={styles.footer}>
        <View style={styles.userInfo}>
          <Text style={styles.username}>reactiive</Text>
        </View>
        <Text style={styles.ticketNumber}>00001992</Text>
      </View>
    </View>
  );
};

/**
 * Styles for the FrontSide component
 */
const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  container: {
    flex: 1,
    paddingHorizontal: 28,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: 42,
    paddingBottom: 60,
  },
  // Label style with platform-specific font family
  label: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 6,
    fontFamily: Platform.select({
      ios: 'SF Pro Text',
      default: 'System',
    }),
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  // Value style with platform-specific font family
  value: {
    fontSize: 21,
    color: '#1C1C1E',
    fontWeight: '600',
    fontFamily: Platform.select({
      ios: 'SF Pro Display',
      default: 'System',
    }),
    letterSpacing: -0.3,
  },
  spacer: {
    flex: 1,
  },
  // Footer section with border and spacing
  footer: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 'auto',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(60, 60, 67, 0.15)',
    paddingTop: 16,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Username text style with platform-specific font
  username: {
    fontSize: 15,
    color: '#1C1C1E',
    fontFamily: Platform.select({
      ios: 'SF Pro Text',
      default: 'System',
    }),
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  // Ticket number style with platform-specific font
  ticketNumber: {
    fontSize: 15,
    color: '#8E8E93',
    fontFamily: Platform.select({
      ios: 'SF Pro Text',
      default: 'System',
    }),
    fontWeight: '400',
    letterSpacing: -0.1,
  },
});
