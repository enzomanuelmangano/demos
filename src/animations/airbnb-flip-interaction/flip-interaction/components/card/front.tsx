import { StyleSheet, Text, View } from 'react-native';

import { type FC, memo } from 'react';

import { LinearGradient } from 'expo-linear-gradient';

import { ProfileAvatar } from './profile-avatar';
import { spacing } from '../../constants';

import type { ProfileType } from './types';

type CardFrontProps = {
  /** Profile information */
  profile: ProfileType;
};

export const CardFront: FC<CardFrontProps> = memo(({ profile }) => {
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
  avatarSection: {
    alignItems: 'flex-end',
    flex: 1,
    justifyContent: 'flex-end',
  },
  background: {
    borderCurve: 'continuous',
    borderRadius: spacing.l + 4,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  container: {
    borderCurve: 'continuous',
    borderRadius: spacing.l + 4,
    flex: 1,
    overflow: 'hidden',
    width: '100%',
  },
  nameText: {
    color: 'white',
    fontFamily: 'SF-Pro-Rounded-Heavy',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: spacing.xs,
  },
  paddingContainer: {
    flex: 1,
    padding: spacing.l,
  },
  spacer: {
    flex: 1,
  },
  verifiedText: {
    color: 'rgba(255, 255, 255, 0.95)',
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 17,
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0, 0, 0, 0.1)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
});
