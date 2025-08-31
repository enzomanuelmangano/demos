import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type ProfileAvatarProps = {
  name: string;
  size?: number;
  isVerified?: boolean;
};

export const ProfileAvatar: React.FC<ProfileAvatarProps> = ({
  name,
  size = 80,
  isVerified = false,
}) => {
  const initial = name.charAt(0).toUpperCase();
  const fontSize = size * 0.4;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <LinearGradient
        colors={['#4A5568', '#2D3748']}
        style={[
          styles.avatar,
          { width: size, height: size, borderRadius: size / 2 },
        ]}>
        <Text style={[styles.initial, { fontSize }]}>{initial}</Text>
      </LinearGradient>
      {isVerified && (
        <LinearGradient
          colors={['#FF6B6B', '#FF5252']}
          style={[
            styles.verificationBadge,
            {
              width: size * 0.32,
              height: size * 0.32,
              borderRadius: size * 0.16,
              bottom: -2,
              right: -2,
            },
          ]}>
          <Text style={[styles.checkmark, { fontSize: size * 0.14 }]}>✓</Text>
        </LinearGradient>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  avatar: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  initial: {
    color: 'white',
    fontWeight: '700',
    fontFamily: 'SF-Pro-Rounded-Heavy',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  verificationBadge: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'white',
  },
  checkmark: {
    color: 'white',
    fontWeight: '700',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
});
