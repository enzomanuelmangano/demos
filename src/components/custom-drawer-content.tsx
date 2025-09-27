import type { DrawerContentComponentProps } from '@react-navigation/drawer';
import { FlashList, ListRenderItem } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAtom } from 'jotai';
import { useCallback, useMemo, type JSX } from 'react';
import type { TextInputChangeEvent } from 'react-native';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createIcon } from '../animations/icon-factory';
import {
  getAllAnimations,
  type AnimationComponent,
  type AnimationMetadataType,
} from '../animations/registry';
import { SearchFilterAtom } from '../navigation/states/filters';

import { PressableScale } from 'pressto';
import { DrawerListItem } from './drawer-list-item';

const keyExtractor = (item: AnimationItem) => item.slug;

const LIST_ITEM_HEIGHT = 60;

type AnimationItem = {
  id: number;
  name: string;
  slug: string;
  route: string;
  alert?: boolean;
  icon: () => JSX.Element;
  component: AnimationComponent;
  metadata: AnimationMetadataType;
};

export function CustomDrawerContent(_props: DrawerContentComponentProps) {
  const router = useRouter();
  const { top, bottom } = useSafeAreaInsets();
  const [searchFilter, setSearchFilter] = useAtom(SearchFilterAtom);

  // Convert registry to the format expected by your existing components
  const allAnimations = useMemo(() => {
    return getAllAnimations()
      .map((animation, index) => ({
        id: index,
        ...animation,
        route: animation.slug,
        name: animation.metadata.name,
        alert: animation.metadata.alert,
        icon: () => createIcon(animation.metadata),
      }))
      .reverse(); // Maintain your existing order
  }, []);

  // Filter animations based on search
  const filteredAnimations: AnimationItem[] = useMemo(() => {
    if (!searchFilter.trim()) {
      return allAnimations;
    }
    return allAnimations.filter(animation =>
      animation.name.toLowerCase().includes(searchFilter.toLowerCase()),
    );
  }, [allAnimations, searchFilter]);

  const renderItem: ListRenderItem<AnimationItem> = useCallback(
    ({ item }) => {
      return (
        <DrawerListItem
          item={item}
          style={styles.listItem}
          onPress={() => {
            router.push(`/animations/${item.slug}`);
          }}
        />
      );
    },
    [router],
  );

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
            autoComplete="off"
            autoCorrect={false}
            value={searchFilter}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="always"
            style={styles.searchInput}
            placeholderTextColor="#666"
            onChange={handleSearchChange}
            placeholder="Search animations..."
          />
        </View>
      </View>

      <View style={styles.listContainer}>
        <FlashList
          renderItem={renderItem}
          scrollEventThrottle={16}
          data={filteredAnimations}
          keyExtractor={keyExtractor}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingBottom: bottom }}
        />
        <LinearGradient
          pointerEvents="none"
          style={styles.topGradient}
          colors={['#030303', '#03030300']}
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
    gap: 8,
    marginTop: 6,
    marginBottom: 8,
    paddingHorizontal: 20,
  },
  titleRow: {
    gap: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    color: '#fff',
    fontWeight: '700',
    letterSpacing: -0.5,
    fontFamily: 'honk-regular',
  },
  searchContainer: {
    marginTop: 6,
    marginBottom: 8,
    position: 'relative',
  },
  searchInput: {
    fontSize: 14,
    color: '#fff',
    borderWidth: 0,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#1a1a1a',
  },
  listContainer: {
    flex: 1,
    position: 'relative',
  },
  listItem: {
    paddingHorizontal: 20,
    height: LIST_ITEM_HEIGHT,
  },
  topGradient: {
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
    height: 25,
    position: 'absolute',
  },
});
