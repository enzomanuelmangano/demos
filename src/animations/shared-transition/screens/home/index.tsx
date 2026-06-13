import { Dimensions, StyleSheet, Text, View } from 'react-native';

import { memo, useEffect, useState } from 'react';

import MasonryList from '@react-native-seoul/masonry-list';
import { useNavigation } from '@react-navigation/native';
import { PressableOpacity } from 'pressto';

import { AnimatedImage } from '../../components/animated-image';
import { dataSources } from '../../constants/images';
import { ScreenNames } from '../../constants/screen-names';

import type { MainStackNavigationProp } from '../../typings';

const HomeScreen = memo(() => {
  const navigation = useNavigation<MainStackNavigationProp>();

  // e2e outcome probe: counts how many times the Home screen has gained focus.
  // It starts at 1 on mount and becomes 2 after navigating to Details and back,
  // so a test can verify the shared-element navigation round-trip actually
  // happened. Visually negligible (alpha ~0.01).
  const [focusCount, setFocusCount] = useState(0);
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      setFocusCount(count => count + 1);
    });
    return unsubscribe;
  }, [navigation]);

  return (
    <>
      <Text testID="shared-transitions-status" style={styles.statusProbe}>
        {`home-visits:${focusCount}`}
      </Text>
      <MasonryList
        numColumns={2}
        data={dataSources}
        contentContainerStyle={styles.listContainer}
        renderItem={({ item: source, i }) => {
          const heroTag = 'heroTag' + i;
          return (
            <PressableOpacity
              testID={`shared-transitions-card-${i}`}
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
  statusProbe: {
    color: '#ffffff',
    fontSize: 1,
    left: 0,
    opacity: 0.012,
    position: 'absolute',
    top: 0,
    zIndex: 1000,
  },
});

export { HomeScreen };
