import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  SharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

export type ItemInfo = {
  title: string;
  subtitle: string;
  activeValues: boolean[];
  color: string;
  squareColor?: string;
  textIcon: string;
};

type ListItemProps = {
  style?: StyleProp<ViewStyle>;
  activeIndex: SharedValue<number | null>;
  index: number;
  maxBorderRadius?: number;
  item: ItemInfo;
};

export const ListItem: React.FC<ListItemProps> = ({
  style,
  activeIndex,
  index,
  maxBorderRadius = 10,
  item,
}) => {
  const rStyle = useAnimatedStyle(() => {
    return {
      borderRadius: withTiming(
        activeIndex.value === index ? maxBorderRadius : 5,
      ),
    };
  }, [maxBorderRadius, index]);

  return (
    <Animated.View style={[styles.container, style, rStyle]}>
      <View style={styles.iconContainer}>
        <View style={[styles.icon, { backgroundColor: item.color }]}>
          <Text style={styles.iconText}>{item.textIcon}</Text>
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.subtitle}>{item.subtitle}</Text>
        </View>
      </View>

      <View style={styles.statusContainer}>
        {new Array(item.activeValues.length).fill(0).map((_, i) => (
          <View
            key={i}
            style={[
              styles.statusItem,
              {
                backgroundColor: item.squareColor ?? item.color,
                opacity: item.activeValues[i] ? 1 : 0.6,
                transform: [
                  {
                    scale: item.activeValues[i] ? 1 : 0.3,
                  },
                ],
              },
            ]}
          />
        ))}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 10,
  },
  iconContainer: {
    flex: 1,
    alignItems: 'center',
    flexDirection: 'row',
  },
  icon: {
    height: '55%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 100,
  },
  iconText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  textContainer: {
    flex: 1,
    marginLeft: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 14,
    color: 'gray',
  },
  statusContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statusItem: {
    height: 25,
    width: 25,
    borderRadius: 10,
  },
});
