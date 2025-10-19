import { StyleSheet, Text, View } from 'react-native';

import { type FC, memo } from 'react';

import { ProfileAvatar } from './profile-avatar';
import { spacing } from '../../constants';

import type { ProfileType } from './types';

type CardBackProps = {
  /** Profile information */
  profile: ProfileType;
  /** Whether the card is flipped to show this side */
  isFlipped?: boolean;
};

export const CardBack: FC<CardBackProps> = memo(({ profile }) => {
  return (
    <View style={styles.container}>
      <View style={styles.background}>
        {/* Header with Avatar and Basic Info */}
        <View style={styles.headerSection}>
          <ProfileAvatar
            name={profile.name}
            size={80}
            isVerified={profile.isIdentityVerified}
          />
          <View style={styles.profileInfo}>
            <Text style={styles.nameText}>{profile.name}</Text>
            <Text style={styles.locationText}>{profile.location}</Text>
          </View>
        </View>

        {/* Stats Row */}
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{profile.trips}</Text>
            <Text style={styles.statLabel}>Trip</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{profile.reviews}</Text>
            <Text style={styles.statLabel}>Review</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{profile.yearsOnAirbnb}</Text>
            <Text style={styles.statLabel}>Years</Text>
          </View>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  background: {
    backgroundColor: 'white',
    borderCurve: 'continuous',
    borderRadius: spacing.l + 4,
    height: '100%',
    justifyContent: 'center',
    padding: spacing.l,
    width: '100%',
  },
  container: {
    borderCurve: 'continuous',
    borderRadius: spacing.l + 4,
    height: '100%',
    overflow: 'hidden',
    width: '100%',
  },
  headerSection: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  locationText: {
    color: '#6B7280',
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 15,
    letterSpacing: 0.1,
  },
  nameText: {
    color: '#1A1D29',
    fontFamily: 'SF-Pro-Rounded-Heavy',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: spacing.xs,
  },
  profileInfo: {
    flex: 1,
    marginLeft: spacing.l,
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    color: '#6B7280',
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 13,
    letterSpacing: 0.2,
    marginTop: 4,
  },
  statNumber: {
    color: '#1A1D29',
    fontFamily: 'SF-Pro-Rounded-Heavy',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  statsContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: spacing.s,
  },
});
