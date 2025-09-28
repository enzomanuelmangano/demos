import { StyleSheet, Text, TextInput, View } from 'react-native';

import { useCallback, useMemo, type JSX } from 'react';

import { FlashList } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAtom } from 'jotai';
import { PressableScale } from 'pressto';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DrawerListItem } from './drawer-list-item';
import { createIcon } from '../animations/icon-factory';
import {
  getAllAnimations,
  type AnimationMetadataType,
} from '../animations/registry';
import { SearchFilterAtom } from '../navigation/states/filters';

import type { DrawerContentComponentProps } from '@react-navigation/drawer';
import type { TextInputChangeEvent } from 'react-native';

const LIST_ITEM_HEIGHT = 60;

type AnimationItem = {
  slug: string;
  component: () => JSX.Element;
  metadata: AnimationMetadataType;
  id: number;
  route: string;
  name: string;
  icon: () => JSX.Element;
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
        alert: animation.metadata.alert,
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
        <DrawerListItem
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
    (event: TextInputChangeEvent) => {
      setSearchFilter(event.nativeEvent.text);
    },
    [setSearchFilter],
  );

  return (
    <View style={[styles.container, { paddingTop: top }]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <PressableScale onPress={() => router.push('/')}>
            <Text style={styles.title}>Demos</Text>
          </PressableScale>
        </View>
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search animations..."
            placeholderTextColor="#666"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            value={searchFilter}
            onChange={handleSearchChange}
            returnKeyType="search"
            clearButtonMode="always"
          />
        </View>
      </View>

      <View style={styles.listContainer}>
        <FlashList
          keyExtractor={keyExtractor}
          data={filteredAnimations as AnimationItem[]}
          scrollEventThrottle={16}
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
          renderItem={renderItem}
        />
        <LinearGradient
          colors={['#030303', '#03030300']}
          style={styles.topGradient}
          pointerEvents="none"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#030303',
    flex: 1,
  },
  content: {
    paddingBottom: 24,
  },
  header: {
    gap: 8,
    marginBottom: 8,
    marginTop: 6,
    paddingHorizontal: 20,
  },
  listContainer: {
    flex: 1,
    position: 'relative',
  },
  listItem: {
    height: LIST_ITEM_HEIGHT,
    paddingHorizontal: 20,
  },
  searchContainer: {
    marginBottom: 8,
    marginTop: 6,
    position: 'relative',
  },
  searchInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    borderWidth: 0,
    color: '#fff',
    fontSize: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  title: {
    color: '#fff',
    fontFamily: 'honk-regular',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
  },
  topGradient: {
    height: 25,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 1,
  },
});
