import type { DrawerContentComponentProps } from '@react-navigation/drawer';
import { FlashList } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAtom } from 'jotai';
import { useCallback, useMemo, type JSX } from 'react';
import type {
  NativeSyntheticEvent,
  TextInputChangeEventData,
} from 'react-native';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createIcon } from '../animations/icon-factory';
import {
  getAllAnimations,
  type AnimationMetadataType,
} from '../animations/registry';
import { SearchFilterAtom } from '../navigation/states/filters';

import { PressableScale } from 'pressto';
import { DrawerListItem } from './drawer-list-item';

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
    (event: NativeSyntheticEvent<TextInputChangeEventData>) => {
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
    flex: 1,
    backgroundColor: '#030303',
  },
  header: {
    paddingHorizontal: 20,
    marginBottom: 8,
    marginTop: 6,
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.5,
    fontFamily: 'honk-regular',
  },
  searchContainer: {
    position: 'relative',
    marginBottom: 8,
    marginTop: 6,
  },
  searchInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
    borderWidth: 0,
  },
  listContainer: {
    flex: 1,
    position: 'relative',
  },
  content: {
    paddingBottom: 24,
  },
  listItem: {
    height: LIST_ITEM_HEIGHT,
    paddingHorizontal: 20,
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 25,
    zIndex: 1,
  },
});
