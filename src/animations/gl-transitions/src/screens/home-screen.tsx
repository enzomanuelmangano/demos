import { StyleSheet, Text, View } from 'react-native';

import { useMemo } from 'react';

import { AntDesign } from '@expo/vector-icons';
import MasonryList from '@react-native-seoul/masonry-list';
import { useNavigation } from '@react-navigation/native';
import { PressableScale } from 'pressto';
import Animated, {
  FadeInDown,
  FadeOutDown,
  LinearTransition,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNotes } from '../atoms/notes';
import { Palette } from '../constants/theme';
import { useGLTransition } from '../providers/gl-transitions';

import type { NoteType } from '../atoms/notes';

export const HomeScreen = () => {
  const navigation = useNavigation<any>();
  const [notes] = useNotes();

  const { prepareTransition } = useGLTransition();

  const { top: safeTop, bottom: safeBottom } = useSafeAreaInsets();

  const gap = 35 / 3;

  const ListHeaderComponent = useMemo(() => {
    return (
      <View style={styles.listHeaderContainer}>
        <View style={styles.fillStart}>
          <Text
            style={[
              {
                color: Palette.primary,
              },
              styles.headerTitle,
            ]}>
            Add Note
          </Text>
        </View>
        <PressableScale
          onPress={async () => {
            await prepareTransition();
            navigation.navigate('AddNote');
          }}
          style={[
            styles.button,
            {
              backgroundColor: Palette.primary,
            },
          ]}>
          <AntDesign name="plus" size={24} color="white" />
        </PressableScale>
      </View>
    );
  }, [navigation, prepareTransition]);

  return (
    <View style={{ flex: 1, backgroundColor: Palette.background }}>
      {/* 
        I used the MasonryList from '@react-native-seoul/masonry-list'
        because the one from @shopify/flash-list was a bit bugged with two columns
        And the layout animations were not working properly. 
        https://github.com/Shopify/flash-list/issues/876
       */}
      <MasonryList
        data={notes}
        numColumns={2}
        ListHeaderComponent={ListHeaderComponent}
        contentContainerStyle={{
          paddingTop: safeTop + 8,
          paddingBottom: safeBottom,
          backgroundColor: Palette.background,
        }}
        showsVerticalScrollIndicator={false}
        keyExtractor={item => item.id}
        // MasonryList is not retrieving the correct type for renderItem
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        renderItem={({ item, i: index }: { item: NoteType; i: number }) => {
          return (
            <Animated.View
              layout={LinearTransition}
              key={item.id}
              exiting={FadeOutDown}
              entering={FadeInDown.delay(index * 100)}
              style={[
                {
                  marginLeft: gap,
                  marginRight: index % 2 !== 0 ? gap : 0,
                  marginBottom: gap,
                  backgroundColor: Palette.surface,
                },
                styles.listItem,
              ]}>
              <Text
                style={[
                  {
                    color: Palette.text,
                  },
                  styles.listItemText,
                ]}>
                {item.title}
              </Text>
            </Animated.View>
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    aspectRatio: 1,
    borderCurve: 'continuous',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
  },
  fillStart: {
    flex: 1,
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  listHeaderContainer: {
    flexDirection: 'row',
    height: 50,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  listItem: {
    borderCurve: 'continuous',
    borderRadius: 10,
    shadowColor: 'black',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  listItemText: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 24,
    padding: 15,
  },
});
