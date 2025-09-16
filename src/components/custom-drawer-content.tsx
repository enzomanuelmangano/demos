import { LegendList, type LegendListRenderItemProps } from '@legendapp/list';
import type { DrawerContentComponentProps } from '@react-navigation/drawer';
import { useAtom } from 'jotai';
import React, { useCallback, useMemo } from 'react';
import type {
  NativeSyntheticEvent,
  TextInputChangeEventData,
} from 'react-native';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createIcon } from '../animations/icon-factory';
import { getAllAnimations } from '../animations/registry';
import { SearchFilterAtom } from '../navigation/states/filters';

import { ExpoRouterListItem } from './expo-router-list-item';

const LIST_ITEM_HEIGHT = 60;
const LIST_ITEM_MARGIN_TOP = 8;

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

export function CustomDrawerContent(props: DrawerContentComponentProps) {
  const { navigation } = props;
  const [searchFilter, setSearchFilter] = useAtom(SearchFilterAtom);
  const { top } = useSafeAreaInsets();

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
            navigation.navigate('Animation', { slug: item.slug });
          }}
        />
      );
    },
    [navigation],
  );

  const keyExtractor = useCallback((item: AnimationItem) => item.slug, []);

  const handleSearchChange = useCallback(
    (event: NativeSyntheticEvent<TextInputChangeEventData>) => {
      setSearchFilter(event.nativeEvent.text);
    },
    [setSearchFilter],
  );

  return (
    <View style={[styles.container, { paddingTop: top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Demos</Text>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search animations..."
          placeholderTextColor="#666"
          value={searchFilter}
          onChange={handleSearchChange}
        />
      </View>

      <LegendList
        keyExtractor={keyExtractor}
        data={filteredAnimations}
        scrollEventThrottle={16}
        style={styles.list}
        keyboardDismissMode={'on-drag'}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        renderItem={renderItem}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  searchInput: {
    backgroundColor: '#222',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#fff',
    fontSize: 16,
  },
  list: {
    flex: 1,
  },
  content: {
    paddingTop: 8,
    paddingBottom: 20,
  },
  listItem: {
    height: LIST_ITEM_HEIGHT,
    marginTop: LIST_ITEM_MARGIN_TOP,
    paddingHorizontal: 20,
  },
});
