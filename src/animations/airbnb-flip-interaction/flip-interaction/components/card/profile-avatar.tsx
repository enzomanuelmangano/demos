import { LinearGradient } from 'expo-linear-gradient';
import { type FC, memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type ProfileAvatarProps = {
  name: string;
  size?: number;
  isVerified?: boolean;
};

export const ProfileAvatar: FC<ProfileAvatarProps> = memo(
  ({ name, size = 80, isVerified = false }) => {
    const computedValues = useMemo(() => {
      const initial = name.charAt(0).toUpperCase();
      const fontSize = size * 0.4;
      const badgeSize = size * 0.32;
      const badgeRadius = size * 0.16;
      const checkmarkSize = size * 0.14;

      return {
        initial,
        fontSize,
        badgeSize,
        badgeRadius,
        checkmarkSize,
      };
    }, [name, size]);

    const containerStyle = useMemo(
      () => [styles.container, { width: size, height: size }],
      [size],
    );

    const avatarStyle = useMemo(
      () => [
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ],
      [size],
    );

    const initialTextStyle = useMemo(
      () => [styles.initial, { fontSize: computedValues.fontSize }],
      [computedValues.fontSize],
    );

    const badgeStyle = useMemo(
      () => [
        styles.verificationBadge,
        {
          width: computedValues.badgeSize,
          height: computedValues.badgeSize,
          borderRadius: computedValues.badgeRadius,
          bottom: -2,
          right: -2,
        },
      ],
      [computedValues.badgeSize, computedValues.badgeRadius],
    );

    const checkmarkStyle = useMemo(
      () => [styles.checkmark, { fontSize: computedValues.checkmarkSize }],
      [computedValues.checkmarkSize],
    );

    return (
      <View style={containerStyle}>
        <LinearGradient colors={['#4A5568', '#2D3748']} style={avatarStyle}>
          <Text style={initialTextStyle}>{computedValues.initial}</Text>
        </LinearGradient>
        {isVerified && (
          <LinearGradient colors={['#FF6B6B', '#FF5252']} style={badgeStyle}>
            <Text style={checkmarkStyle}>✓</Text>
          </LinearGradient>
        )}
      </View>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.name === nextProps.name &&
      prevProps.size === nextProps.size &&
      prevProps.isVerified === nextProps.isVerified
    );
  },
);

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
