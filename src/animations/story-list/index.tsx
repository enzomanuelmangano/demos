import { Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import React, { useMemo } from 'react';

import { StoryList } from './components/story-list';

const stories = [
  {
    image: require('../../../assets/animations/story-list/image_01.png'),
  },
  {
    image: require('../../../assets/animations/story-list/image_02.jpg'),
  },
  {
    image: require('../../../assets/animations/story-list/image_03.jpg'),
  },
  {
    image: require('../../../assets/animations/story-list/image_04.jpg'),
  },
  {
    image: require('../../../assets/animations/story-list/image_01.png'),
  },
  {
    image: require('../../../assets/animations/story-list/image_02.jpg'),
  },
  {
    image: require('../../../assets/animations/story-list/image_03.jpg'),
  },
  {
    image: require('../../../assets/animations/story-list/image_04.jpg'),
  },
];

const StoryListContainer = React.memo(() => {
  const { width } = useWindowDimensions();

  const storyItemDimensions = useMemo(() => {
    return {
      width: width * 0.7,
      height: width,
    };
  }, [width]);

  return (
    <>
      <StatusBar style="light" />
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
                  resizeMode="cover"
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
    </>
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
  fill: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#2D3045',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export { StoryListGestureContainer as StoryList };
