import React from 'react';
import MasonryList from '@react-native-seoul/masonry-list';
import { Dimensions, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Animated from 'react-native-reanimated';

import { dataSources } from '../../constants/images';
import { ScreenNames } from '../../constants/screen-names';
import type { MainStackNavigationProp } from '../../typings';

const HomeScreen = React.memo(() => {
  const navigation = useNavigation<MainStackNavigationProp>();

  return (
    <>
      <MasonryList
        numColumns={2}
        data={dataSources}
        contentContainerStyle={styles.listContainer}
        renderItem={({ item: source, i }) => {
          const heroTag = 'heroTag' + i;
          return (
            <TouchableOpacity
              onPress={() => {
                navigation.navigate(ScreenNames.Details, {
                  source,
                  heroTag,
                });
              }}>
              <View
                style={[
                  {
                    marginRight: (i ?? 0) % 2 === 1 ? 20 / 3 : 0,
                  },
                  styles.container,
                ]}>
                <Animated.Image
                  sharedTransitionTag={heroTag}
                  source={source as any}
                  style={[
                    {
                      height: 150 + 50 * ((i ?? 0) % 3),
                    },
                    styles.image,
                  ]}
                />
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </>
  );
});

const styles = StyleSheet.create({
  container: {
    marginLeft: 20 / 3,
    marginTop: 20 / 3,
  },
  image: {
    width: Dimensions.get('window').width / 2 - 10,
    borderRadius: 10,
  },
  listContainer: {
    paddingBottom: 100,
  },
});

export { HomeScreen };
