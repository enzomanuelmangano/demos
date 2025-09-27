import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from 'pressto';
import type { FC, ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { SharedValue, WithSpringConfig } from 'react-native-reanimated';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';

type SpringType = 'elegant' | 'springy' | 'super-springy';

type PanelContentProps = {
  springType: SpringType;
  springConfig: SharedValue<WithSpringConfig>;
  onToggleCollapse: () => void;
  onSelectSpringType: (type: SpringType) => void;
};

// Color constants for animations
const COLORS = {
  // Default colors
  DEFAULT_BORDER: 'rgba(233, 236, 239, 1)', // #e9ecef
  DEFAULT_BG: 'rgba(255, 255, 255, 1)', // #ffffff
  DEFAULT_TEXT: 'rgba(73, 80, 87, 1)', // #495057

  // Theme colors
  ELEGANT: 'rgba(111, 66, 193, 1)', // #6f42c1
  ELEGANT_BG: 'rgba(248, 244, 255, 1)', // #f8f4ff

  SPRINGY: 'rgba(253, 126, 20, 1)', // #fd7e14
  SPRINGY_BG: 'rgba(255, 248, 240, 1)', // #fff8f0

  SUPER_SPRINGY: 'rgba(220, 53, 69, 1)', // #dc3545
  SUPER_SPRINGY_BG: 'rgba(255, 245, 245, 1)', // #fff5f5
};

const springConfigs = {
  elegant: {
    borderColor: COLORS.ELEGANT,
    backgroundColor: COLORS.ELEGANT_BG,
    textColor: COLORS.ELEGANT,
    dotColor: COLORS.ELEGANT,
  },
  springy: {
    borderColor: COLORS.SPRINGY,
    backgroundColor: COLORS.SPRINGY_BG,
    textColor: COLORS.SPRINGY,
    dotColor: COLORS.SPRINGY,
  },
  'super-springy': {
    borderColor: COLORS.SUPER_SPRINGY,
    backgroundColor: COLORS.SUPER_SPRINGY_BG,
    textColor: COLORS.SUPER_SPRINGY,
    dotColor: COLORS.SUPER_SPRINGY,
  },
};

// Spring option configurations with their indicators
const springOptions: Array<{
  type: SpringType;
  label: string;
  indicators: Array<{
    opacity?: number;
    scale?: number;
  }>;
}> = [
  {
    type: 'elegant',
    label: 'Elegant',
    indicators: [{ opacity: 1 }, { opacity: 0.6 }, { opacity: 0.3 }],
  },
  {
    type: 'springy',
    label: 'Springy',
    indicators: [{ scale: 1 }, { scale: 0.8 }, { scale: 0.6 }],
  },
  {
    type: 'super-springy',
    label: 'Super',
    indicators: [{ scale: 1 }, { scale: 1.2 }, { scale: 0.8 }],
  },
];

const SpringIndicator: FC<{
  type: SpringType;
  indicators: Array<{ opacity?: number; scale?: number }>;
}> = ({ type, indicators }) => {
  const config = springConfigs[type];

  return (
    <View style={styles.springIndicator}>
      {indicators.map((indicator, index) => (
        <View
          key={index}
          style={[
            styles.springDot,
            {
              backgroundColor: config.dotColor,
              opacity: indicator.opacity,
              transform: indicator.scale
                ? [{ scale: indicator.scale }]
                : undefined,
            },
          ]}
        />
      ))}
    </View>
  );
};

const SpringOption: FC<{
  type: SpringType;
  label: string;
  isActive: boolean;
  onPress: () => void;
  children: ReactNode;
}> = ({ type, label, isActive, onPress, children }) => {
  const progress = useDerivedValue(() => {
    return withTiming(isActive ? 1 : 0, {
      duration: 200,
      easing: Easing.linear,
    });
  }, [isActive]);

  const config = springConfigs[type];

  const animatedStyle = useAnimatedStyle(() => {
    return {
      borderColor: interpolateColor(
        progress.get(),
        [0, 1],
        [COLORS.DEFAULT_BORDER, config.borderColor],
      ),
      backgroundColor: interpolateColor(
        progress.get(),
        [0, 1],
        [COLORS.DEFAULT_BG, config.backgroundColor],
      ),
    };
  });

  const animatedTextStyle = useAnimatedStyle(() => {
    return {
      color: interpolateColor(
        progress.get(),
        [0, 1],
        [COLORS.DEFAULT_TEXT, config.textColor],
      ),
    };
  });

  return (
    <PressableScale
      style={[styles.springOption, animatedStyle]}
      onPress={onPress}>
      {children}
      <Animated.Text style={[styles.springOptionText, animatedTextStyle]}>
        {label}
      </Animated.Text>
    </PressableScale>
  );
};

export const PanelContent: FC<PanelContentProps> = ({
  springType,
  onToggleCollapse,
  onSelectSpringType,
}) => {
  return (
    <View
      style={{
        flex: 1,
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 22,
      }}>
      <View style={styles.header}>
        <Text style={styles.panelTitle}>Spring Animations</Text>
        <PressableScale
          style={styles.collapseButton}
          onPress={onToggleCollapse}>
          <Ionicons name="close" size={20} color="#6c757d" />
        </PressableScale>
      </View>

      <View style={styles.springOptionsContainer}>
        {springOptions.map(option => (
          <SpringOption
            key={option.type}
            type={option.type}
            label={option.label}
            isActive={springType === option.type}
            onPress={() => onSelectSpringType(option.type)}>
            <SpringIndicator
              type={option.type}
              indicators={option.indicators}
            />
          </SpringOption>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Honk-Regular',
    color: '#343a40',
    flex: 1,
  },
  collapseButton: {
    padding: 4,
  },
  springOptionsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  springOption: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  springIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginBottom: 8,
    height: 12,
  },
  springDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  springOptionText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Honk-Regular',
    color: '#495057',
    marginBottom: 4,
  },
});
