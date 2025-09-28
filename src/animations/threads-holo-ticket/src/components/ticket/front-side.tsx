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
    alignItems: 'flex-start',
    flex: 1,
    justifyContent: 'space-between',
    paddingBottom: 60,
    paddingHorizontal: 28,
    paddingTop: 42,
  },
  // Label style with platform-specific font family
  label: {
    color: '#8E8E93',
    fontFamily: Platform.select({
      ios: 'SF Pro Text',
      default: 'System',
    }),
    fontSize: 13,
    letterSpacing: 0.5,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  // Value style with platform-specific font family
  value: {
    color: '#1C1C1E',
    fontFamily: Platform.select({
      ios: 'SF Pro Display',
      default: 'System',
    }),
    fontSize: 21,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  spacer: {
    flex: 1,
  },
  // Footer section with border and spacing
  footer: {
    alignItems: 'center',
    borderTopColor: 'rgba(60, 60, 67, 0.15)',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 'auto',
    paddingTop: 16,
    width: '100%',
  },
  userInfo: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  // Username text style with platform-specific font
  username: {
    color: '#1C1C1E',
    fontFamily: Platform.select({
      ios: 'SF Pro Text',
      default: 'System',
    }),
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  // Ticket number style with platform-specific font
  ticketNumber: {
    color: '#8E8E93',
    fontFamily: Platform.select({
      ios: 'SF Pro Text',
      default: 'System',
    }),
    fontSize: 15,
    fontWeight: '400',
    letterSpacing: -0.1,
  },
});
