import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { spacing } from '../../constants';

import { ProfileAvatar } from './profile-avatar';
import type { ProfileType } from './types';

type CardBackProps = {
  /** Profile information */
  profile: ProfileType;
  /** Whether the card is flipped to show this side */
  isFlipped?: boolean;
};

export const CardBack: React.FC<CardBackProps> = React.memo(({ profile }) => {
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
  container: {
    width: '100%',
    height: '100%',
    borderRadius: spacing.l + 4,
    overflow: 'hidden',
  },
  background: {
    width: '100%',
    height: '100%',
    backgroundColor: 'white',
    borderRadius: spacing.l + 4,
    padding: spacing.l,
    justifyContent: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: spacing.s,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1D29',
    fontFamily: 'SF-Pro-Rounded-Heavy',
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontFamily: 'SF-Pro-Rounded-Bold',
    marginTop: 4,
    letterSpacing: 0.2,
  },
  headerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileInfo: {
    flex: 1,
    marginLeft: spacing.l,
  },
  nameText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1D29',
    fontFamily: 'SF-Pro-Rounded-Heavy',
    marginBottom: spacing.xs,
    letterSpacing: -0.3,
  },
  locationText: {
    fontSize: 15,
    color: '#6B7280',
    fontFamily: 'SF-Pro-Rounded-Bold',
    letterSpacing: 0.1,
  },
});
