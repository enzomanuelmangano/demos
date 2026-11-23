/* eslint-disable react-native/no-unused-styles */
import { View, Text, StyleSheet } from 'react-native';

import React, { use } from 'react';

import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from 'pressto';
import Animated, { Keyframe } from 'react-native-reanimated';

import { RetrayContext } from '../../context';
import { useRetrayTheme, type RetrayTheme } from '../../providers/theme';
import { formatTitle } from '../../utils';

const KEYFRAME_DURATION = 150;

const TimingKeyframeFadeIn = new Keyframe({
  0: { opacity: 0 },
  50: { opacity: 0.3 },
  100: { opacity: 1 },
}).duration(KEYFRAME_DURATION);

const TimingKeyframeFadeOut = new Keyframe({
  0: { opacity: 1 },
  50: { opacity: 0.2 },
  100: { opacity: 0 },
}).duration(KEYFRAME_DURATION);

export const Header: React.FC = () => {
  const { state, actions } = use(RetrayContext);
  const theme = useRetrayTheme();

  const title = state.currentScreen
    ? formatTitle(String(state.currentScreen))
    : '';
  const hasLeftButton = state.screenHistory.length > 1;
  const hasRightButton = true;

  const styles = createStyles(theme);

  return (
    <View
      style={[
        styles.header,
        {
          backgroundColor: theme.colors.surface,
          borderBottomColor: theme.colors.border,
        },
      ]}>
      {/* Left side - Back button or spacer */}
      <Animated.View
        entering={TimingKeyframeFadeIn}
        exiting={TimingKeyframeFadeOut}
        key={hasLeftButton ? 'left-button' : 'left-spacer'}
        style={styles.leftContainer}>
        {hasLeftButton ? (
          <PressableScale style={styles.iconButton} onPress={actions.goBack}>
            <Text style={[styles.backIcon, { color: theme.colors.primary }]}>
              <Ionicons
                name="chevron-back"
                size={24}
                color={theme.colors.primary}
              />
            </Text>
          </PressableScale>
        ) : (
          <View style={styles.iconButton} />
        )}
      </Animated.View>

      {/* Center - Title */}
      <View style={styles.titleContainer}>
        <Animated.Text
          entering={TimingKeyframeFadeIn}
          exiting={TimingKeyframeFadeOut}
          key={title}
          style={[styles.title, { color: theme.colors.text }]}
          numberOfLines={1}>
          {title}
        </Animated.Text>
      </View>

      <View style={styles.rightContainer}>
        {hasRightButton ? (
          <PressableScale style={styles.iconButton} onPress={actions.dismiss}>
            <Text style={[styles.closeIcon, { color: theme.colors.muted }]}>
              <Ionicons name="close" size={24} color={theme.colors.muted} />
            </Text>
          </PressableScale>
        ) : (
          <View style={styles.iconButton} />
        )}
      </View>
    </View>
  );
};

const createStyles = (theme: RetrayTheme) =>
  StyleSheet.create({
    backIcon: {
      fontSize: 24,
      fontWeight: '300',
    },
    closeIcon: {
      fontSize: 18,
      fontWeight: '300',
    },
    header: {
      alignItems: 'center',
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: theme.spacing.md,
      // backgroundColor and borderBottomColor are set dynamically via theme
    },
    iconButton: {
      alignItems: 'center',
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    leftContainer: {
      alignItems: 'flex-start',
      width: 40,
    },
    rightContainer: {
      alignItems: 'flex-end',
      width: 40,
    },
    title: {
      fontSize: 18,
      fontWeight: '600',
      textAlign: 'center',
    },
    titleContainer: {
      alignItems: 'center',
      flex: 1,
      marginHorizontal: theme.spacing.sm,
    },
  });
