import { StyleSheet, Text, View } from 'react-native';

import Animated, {
  SharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import type { FC } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

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

export const ListItem: FC<ListItemProps> = ({
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
  icon: {
    alignItems: 'center',
    aspectRatio: 1,
    borderRadius: 100,
    height: '55%',
    justifyContent: 'center',
  },
  iconContainer: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
  },
  iconText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  statusContainer: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statusItem: {
    borderRadius: 10,
    height: 25,
    width: 25,
  },
  subtitle: {
    color: 'gray',
    fontSize: 14,
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
});
