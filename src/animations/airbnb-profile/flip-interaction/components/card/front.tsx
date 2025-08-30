import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { ProfileAvatar } from './profile-avatar';
import type { ProfileType } from './types';
import { spacing } from '../../constants';

type CardFrontProps = {
  /** Profile information */
  profile: ProfileType;
};

export const CardFront: React.FC<CardFrontProps> = React.memo(({ profile }) => {
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#FF6B6B', '#FF8E53', '#FF6B6B']}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.background}
      />
      <View style={styles.paddingContainer}>
        <Text style={styles.nameText}>{profile.name}</Text>
        <Text style={styles.verifiedText}>Verified</Text>

        <View style={styles.spacer} />

        {/* Profile Avatar */}
        <View style={styles.avatarSection}>
          <ProfileAvatar
            name={profile.name}
            size={80}
            isVerified={profile.isIdentityVerified}
          />
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flex: 1,
    borderRadius: spacing.l + 4,
    overflow: 'hidden',
  },
  paddingContainer: {
    padding: spacing.l,
    flex: 1,
  },
  background: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: spacing.l + 4,
  },
  nameText: {
    fontSize: 32,
    fontWeight: '700',
    color: 'white',
    fontFamily: 'SF-Pro-Rounded-Heavy',
    marginBottom: spacing.xs,
    letterSpacing: -0.5,
  },
  verifiedText: {
    fontSize: 17,
    color: 'rgba(255, 255, 255, 0.95)',
    fontFamily: 'SF-Pro-Rounded-Bold',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0, 0, 0, 0.1)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  avatarSection: {
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    flex: 1,
  },
  spacer: {
    flex: 1,
  },
});
