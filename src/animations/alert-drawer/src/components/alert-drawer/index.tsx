import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { PressableScale } from 'pressto';
import type React from 'react';
import { useCallback } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import {
  ALERT_COLOR,
  BUTTON_HEIGHT,
  BUTTON_WIDTH,
  EXPANDED_CARD_HEIGHT,
  EXPANDED_CARD_WIDTH,
  MIN_BUTTON_WIDTH,
  styles,
} from './styles';

type AlertDrawerProps = {
  title: string;
  description: string;
  buttonLabel: string;
  onConfirm?: () => void;
};

type CardContentProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClose: () => void;
};

// Renders the content of the expanded card, including:
// - Icon
// - Title and description
// - Close button
// - Cancel button
const CardContent: React.FC<CardContentProps> = ({
  icon,
  title,
  description,
  onClose,
}) => (
  <View style={styles.cardContent}>
    <View style={styles.iconContainer}>
      {icon}
      <View style={{ flex: 1 }} />
      <View style={styles.closeIconContainer}>
        <PressableScale onPress={onClose} style={styles.closeButton}>
          <FontAwesome name="close" size={14} color="#A1A0A2" />
        </PressableScale>
      </View>
    </View>
    <View style={styles.textContainer}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
    <PressableScale
      onPress={onClose}
      style={[styles.button, styles.cancelButton]}>
      <Text style={[styles.buttonLabel, styles.cancelButtonLabel]}>Cancel</Text>
    </PressableScale>
  </View>
);

// Main component that handles the expandable drawer animation
// It uses Reanimated 3 for smooth animations and interpolations
// The component can be in two states: collapsed (button only) or expanded (full card)
export const AlertDrawer: React.FC<AlertDrawerProps> = ({
  title,
  description,
  buttonLabel,
  onConfirm,
}) => {
  const isExpanded = useSharedValue(false);

  const progress = useDerivedValue(() =>
    withTiming(isExpanded.value ? 1 : 0, { duration: 300 }),
  );

  const delayedProgress = useDerivedValue(() => progress.value ** 2);

  const padding = useDerivedValue(() =>
    interpolate(
      progress.value,
      [0, 1],
      [0, (EXPANDED_CARD_WIDTH - BUTTON_WIDTH) / 2],
    ),
  );

  const rCardContainerStyle = useAnimatedStyle(() => ({
    left: interpolate(
      progress.value,
      [0, 1],
      [(EXPANDED_CARD_WIDTH - BUTTON_WIDTH) / 2, 0],
    ),
    width: interpolate(
      progress.value,
      [0, 1],
      [BUTTON_WIDTH, EXPANDED_CARD_WIDTH],
    ),
    height: interpolate(
      progress.value,
      [0, 1],
      [BUTTON_HEIGHT, EXPANDED_CARD_HEIGHT],
    ),
    borderRadius: interpolate(progress.value, [0, 1], [50, 50 - padding.value]),
    padding: padding.value,
    paddingTop: padding.value + delayedProgress.value * 10,
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      ['#FFFFFF00', '#FFFFFF'],
    ),
  }));

  const rButtonStyle = useAnimatedStyle(() => ({
    bottom: padding.value,
    width: interpolate(
      progress.value,
      [0, 1],
      [BUTTON_WIDTH, MIN_BUTTON_WIDTH],
    ),
    right: (EXPANDED_CARD_WIDTH - BUTTON_WIDTH) / 2,
  }));

  const rCardContentStyle = useAnimatedStyle(() => ({
    opacity: delayedProgress.value,
  }));

  const toggleExpansion = useCallback(() => {
    isExpanded.value = !isExpanded.value;
  }, [isExpanded]);

  return (
    <Animated.View style={styles.container}>
      <PressableScale
        onPress={() => {
          if (isExpanded.value && onConfirm) {
            return scheduleOnRN(onConfirm);
          }
          toggleExpansion();
        }}
        style={[styles.button, rButtonStyle]}>
        <Text style={styles.buttonLabel}>{buttonLabel}</Text>
      </PressableScale>
      <Animated.View style={[styles.card, rCardContainerStyle]}>
        <Animated.View style={[styles.cardContentWrapper, rCardContentStyle]}>
          <CardContent
            icon={
              <Ionicons
                name="alert-circle-outline"
                size={48}
                color={ALERT_COLOR}
              />
            }
            title={title}
            description={description}
            onClose={toggleExpansion}
          />
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
};
