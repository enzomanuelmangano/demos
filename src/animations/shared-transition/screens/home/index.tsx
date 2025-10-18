import { Dimensions, StyleSheet, View } from 'react-native';

import { memo } from 'react';

import MasonryList from '@react-native-seoul/masonry-list';
import { useNavigation } from '@react-navigation/native';
import { PressableOpacity } from 'pressto';

import { AnimatedImage } from '../../components/animated-image';
import { dataSources } from '../../constants/images';
import { ScreenNames } from '../../constants/screen-names';

import type { MainStackNavigationProp } from '../../typings';

const HomeScreen = memo(() => {
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
            <PressableOpacity
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
                <AnimatedImage
                  // @@TODO: maybe back in 4.2.0
                  // sharedTransitionTag={heroTag}
                  cachePolicy="memory-disk"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  source={source as any}
                  style={[
                    {
                      height: 150 + 50 * ((i ?? 0) % 3),
                    },
                    styles.image,
                  ]}
                />
              </View>
            </PressableOpacity>
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
    borderCurve: 'continuous',
    borderRadius: 10,
    width: Dimensions.get('window').width / 2 - 10,
  },
  listContainer: {
    paddingBottom: 100,
  },
});

export { HomeScreen };
