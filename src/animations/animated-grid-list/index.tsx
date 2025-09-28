import { Image, StyleSheet, Text, View } from 'react-native';

import { useCallback, useState } from 'react';

import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedLayoutList } from './components/animated-layout-list';
import { FloatingButton } from './components/floating-button';
import { data } from './constants';

import type { AnimatedLayoutListProps } from './components/animated-layout-list';

const AnimatedImage = Animated.createAnimatedComponent(Image);

export function AnimatedGridList() {
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const insets = useSafeAreaInsets();

  const renderItem: AnimatedLayoutListProps<(typeof data)[0]>['renderItem'] =
    useCallback((item, _, isExpanded) => {
      return (
        <Animated.View
          style={{
            flex: 1,
            alignItems: 'center',
            flexDirection: isExpanded ? 'row' : 'column',
          }}>
          <AnimatedImage
            layout={LinearTransition}
            source={{ uri: item.img }}
            style={{
              width: isExpanded ? 64 : 200,
              aspectRatio: 1,
              borderRadius: isExpanded ? 32 : 0,
              marginHorizontal: isExpanded ? 16 : 0,
            }}
          />
          {isExpanded && (
            <Animated.View
              layout={LinearTransition.duration(600)}
              entering={FadeIn}
              exiting={FadeOut}>
              <Text
                style={{
                  marginBottom: 2,
                  maxWidth: '80%',
                }}
                numberOfLines={1}>
                {item.title}
              </Text>
              <Text
                style={{
                  color: '#383838',
                  fontSize: 12,
                  maxWidth: 200,
                }}
                numberOfLines={1}>
                {item.subtitle}
              </Text>
            </Animated.View>
          )}
        </Animated.View>
      );
    }, []);

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}>
      <AnimatedLayoutList data={data} layout={layout} renderItem={renderItem} />
      <FloatingButton
        style={{
          position: 'absolute',
          bottom: 50,
          right: 16,
        }}
        onPress={() => {
          setLayout(currentLayout =>
            currentLayout === 'grid' ? 'list' : 'grid',
          );
        }}
        layout={layout}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#EEEEEE',
    flex: 1,
  },
});
