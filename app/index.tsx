import { LegendList, type LegendListRenderItemProps } from '@legendapp/list';
import { Stack, useRouter } from 'expo-router';
import { useAtom } from 'jotai';
import React, { useCallback, useMemo } from 'react';
import type {
  NativeSyntheticEvent,
  TextInputChangeEventData,
} from 'react-native';
import { StyleSheet } from 'react-native';

import { createIcon } from '../src/animations/icon-factory';
import { getAllAnimations } from '../src/animations/registry';
import { ExpoRouterListItem } from '../src/components/expo-router-list-item';
import { SearchFilterAtom } from '../src/navigation/states/filters';

const LIST_ITEM_HEIGHT = 80;
const LIST_ITEM_MARGIN_TOP = 10;

type AnimationItem = {
  slug: string;
  component: any;
  metadata: any;
  id: number;
  route: string;
  name: string;
  icon: () => React.JSX.Element;
  backIconDark: boolean;
  iconMarginTop?: number;
  alert?: boolean;
};

export default function HomeScreen() {
  const router = useRouter();
  const [searchFilter, setSearchFilter] = useAtom(SearchFilterAtom);

  // Convert registry to the format expected by your existing components
  const allAnimations = useMemo(() => {
    return getAllAnimations()
      .map((animation, index) => ({
        ...animation,
        id: index,
        route: animation.slug,
        name: animation.metadata.name,
        icon: () => createIcon(animation.metadata),
        backIconDark: (animation.metadata as any).backIconDark || false,
        iconMarginTop: (animation.metadata as any).iconMarginTop,
        alert: (animation.metadata as any).alert,
      }))
      .reverse(); // Maintain your existing order
  }, []);

  // Filter animations based on search
  const filteredAnimations = useMemo(() => {
    if (!searchFilter.trim()) {
      return allAnimations;
    }
    return allAnimations.filter(animation =>
      animation.name.toLowerCase().includes(searchFilter.toLowerCase()),
    );
  }, [allAnimations, searchFilter]);

  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<AnimationItem>) => {
      return (
        <ExpoRouterListItem
          style={styles.listItem}
          item={item}
          onPress={() => {
            router.push(`/animations/${item.slug}`);
          }}
        />
      );
    },
    [router],
  );

  const keyExtractor = useCallback((item: AnimationItem) => item.slug, []);

  const handleSearchChange = useCallback(
    (event: NativeSyntheticEvent<TextInputChangeEventData>) => {
      setSearchFilter(event.nativeEvent.text);
    },
    [setSearchFilter],
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          headerLargeTitle: true,
          headerSearchBarOptions: {
            placeholder: 'Search',
            tintColor: 'white',
            textColor: 'white',
            hintTextColor: 'rgba(255,255,255,0.8)',
            inputType: 'text',
            obscureBackground: false,
            onChangeText: handleSearchChange,
          },
          headerBlurEffect: 'systemThinMaterialDark',
          headerStyle: {
            backgroundColor: 'transparent',
          },
          title: 'Demos',
          headerTitleStyle: {
            color: 'white',
          },
        }}
      />
      <LegendList
        keyExtractor={keyExtractor}
        data={filteredAnimations}
        scrollEventThrottle={16}
        style={styles.container}
        keyboardDismissMode={'on-drag'}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        renderItem={renderItem}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 3,
    paddingBottom: 150,
  },
  container: { backgroundColor: 'black' },
  listItem: { height: LIST_ITEM_HEIGHT, marginTop: LIST_ITEM_MARGIN_TOP },
});
