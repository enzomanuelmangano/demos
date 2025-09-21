import type { DrawerContentComponentProps } from '@react-navigation/drawer';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
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

type AnimationItem = {
  slug: string;
  component: () => React.JSX.Element;
  metadata: Record<string, unknown>;
  id: number;
  route: string;
  name: string;
  icon: () => React.JSX.Element;
  backIconDark: boolean;
  iconMarginTop?: number;
  alert?: boolean;
};

export function CustomDrawerContent(_props: DrawerContentComponentProps) {
  const router = useRouter();
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
        backIconDark:
          ((animation.metadata as Record<string, unknown>)
            .backIconDark as boolean) || false,
        iconMarginTop: (animation.metadata as Record<string, unknown>)
          .iconMarginTop as number,
        alert: (animation.metadata as Record<string, unknown>).alert as boolean,
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
    ({ item }: { item: AnimationItem }) => {
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
    <View style={[styles.container, { paddingTop: top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Demos</Text>
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search animations..."
            placeholderTextColor="#666"
            value={searchFilter}
            onChange={handleSearchChange}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      <FlashList
        keyExtractor={keyExtractor}
        data={filteredAnimations as AnimationItem[]}
        scrollEventThrottle={16}
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
    backgroundColor: '#131313',
  },
  header: {
    paddingHorizontal: 20,
    marginTop: 24,
    marginBottom: 12,
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.5,
  },
  searchContainer: {
    position: 'relative',
  },
  searchInput: {
    backgroundColor: '#1c1c1c',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  content: {
    paddingBottom: 24,
  },
  listItem: {
    height: LIST_ITEM_HEIGHT,
    paddingHorizontal: 20,
  },
});
