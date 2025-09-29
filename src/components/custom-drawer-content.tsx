import {
  StyleSheet,
  Text,
  TextInput,
  TextInputChangeEvent,
  View,
} from 'react-native';

import { useCallback, useMemo, type JSX } from 'react';
import React from 'react';

import { LegendList, LegendListRenderItemProps } from '@legendapp/list';
import { DrawerContentComponentProps } from '@react-navigation/drawer';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAtom } from 'jotai';
import { PressableScale } from 'pressto';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DrawerListItem } from './drawer-list-item';
import { createIcon } from '../animations/icon-factory';
import {
  getAllAnimations,
  type AnimationComponent,
  type AnimationMetadataType,
} from '../animations/registry';
import { SearchFilterAtom } from '../navigation/states/filters';

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
  const selectedItemId = useSharedValue(0);
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

  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<AnimationItem>) => {
      return (
        <DrawerListItem
          item={item}
          selectedItemId={selectedItemId}
          style={styles.listItem}
          onPress={() => {
            selectedItemId.value = item.id;
            router.push(`/animations/${item.slug}`);
          }}
        />
      );
    },
    [router, selectedItemId],
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
        <LegendList
          recycleItems
          waitForInitialLayout
          renderItem={renderItem}
          scrollEventThrottle={16}
          data={filteredAnimations}
          keyExtractor={keyExtractor}
          estimatedItemSize={LIST_ITEM_HEIGHT}
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
    backgroundColor: '#030303',
    flex: 1,
    marginEnd: 12,
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
