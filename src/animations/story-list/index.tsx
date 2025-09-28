import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { memo, useMemo } from 'react';

import { Image } from 'expo-image';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { StoryList } from './components/story-list';

const stories = [
  {
    image: require('./assets/image_01.png'),
  },
  {
    image: require('./assets/image_02.jpg'),
  },
  {
    image: require('./assets/image_03.jpg'),
  },
  {
    image: require('./assets/image_04.jpg'),
  },
  {
    image: require('./assets/image_01.png'),
  },
  {
    image: require('./assets/image_02.jpg'),
  },
  {
    image: require('./assets/image_03.jpg'),
  },
  {
    image: require('./assets/image_04.jpg'),
  },
];

const StoryListContainer = memo(() => {
  const { width } = useWindowDimensions();

  const storyItemDimensions = useMemo(() => {
    return {
      width: width * 0.7,
      height: width,
    };
  }, [width]);

  return (
    <View style={styles.container}>
      <View
        style={{
          height: width,
          aspectRatio: 1,
          paddingLeft: 25,
        }}>
        <StoryList
          stories={stories}
          pagingEnabled={false} // set to true to enable paging
          storyItemDimensions={storyItemDimensions}
          visibleItems={3} // number of items visible at a time
          gap={35} // gap between items
          renderItem={({ image }) => {
            return (
              <Image
                contentFit="cover"
                cachePolicy={'memory-disk'}
                style={[
                  {
                    borderRadius: 20,
                  },
                  storyItemDimensions,
                ]}
                source={image}
              />
            );
          }}
        />
      </View>
    </View>
  );
});

const StoryListGestureContainer = () => {
  return (
    // The GestureHandlerRootView is required for gesture handlers to work (rngh)
    // In a real app, you would probably wrap your entire app in this
    <GestureHandlerRootView style={styles.fill}>
      <StoryListContainer />
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#2D3045',
    flex: 1,
    justifyContent: 'center',
  },
  fill: {
    flex: 1,
  },
});

export { StoryListGestureContainer as StoryList };
