import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { memo, useMemo } from 'react';

import { Image } from 'expo-image';

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
          height: storyItemDimensions.height,
          width: '100%',
        }}>
        <StoryList
          stories={stories}
          storyItemDimensions={storyItemDimensions}
          renderItem={({ image }) => {
            return (
              <Image
                contentFit="cover"
                cachePolicy={'memory-disk'}
                style={[
                  {
                    borderRadius: 25,
                    // @@TODO: the image should support borderCurve
                    // @ts-ignore
                    borderCurve: 'continuous',
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

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#2D3045',
    flex: 1,
    justifyContent: 'center',
  },
});

export { StoryListContainer as StoryList };
