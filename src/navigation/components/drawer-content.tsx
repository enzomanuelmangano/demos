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
import { PressableScale, PressablesGroup } from 'pressto';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DrawerListItem } from './drawer-list-item';
import { createIcon } from '../../animations/icon-factory';
import {
  getAllAnimations,
  type AnimationComponent,
  type AnimationMetadataType,
} from '../../animations/registry';
import {
  SearchFilterAtom,
  ShowUnstableAnimationsAtom,
} from '../../navigation/states/filters';

const keyExtractor = (item: AnimationItem) => item.slug;

const LIST_ITEM_HEIGHT = 50;

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

export function DrawerContent(_props: DrawerContentComponentProps) {
  const router = useRouter();
  const { top, bottom } = useSafeAreaInsets();
  const [searchFilter, setSearchFilter] = useAtom(SearchFilterAtom);
  const [showUnstable] = useAtom(ShowUnstableAnimationsAtom);

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
      .reverse();
  }, []);

  const filteredAnimations: AnimationItem[] = useMemo(() => {
    let animations = allAnimations;

    // Filter out unstable animations if the toggle is off
    if (!showUnstable) {
      animations = animations.filter(animation => !animation.alert);
    }

    // Apply search filter
    if (searchFilter.trim()) {
      animations = animations.filter(animation =>
        animation.name.toLowerCase().includes(searchFilter.toLowerCase()),
      );
    }

    return animations;
  }, [allAnimations, searchFilter, showUnstable]);

  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<AnimationItem>) => {
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

  const contentContainerStyle = useMemo(() => {
    return { paddingBottom: bottom, marginTop: 12 };
  }, [bottom]);

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
        <PressablesGroup>
          <LegendList
            recycleItems={false}
            waitForInitialLayout
            renderItem={renderItem}
            scrollEventThrottle={16}
            data={filteredAnimations}
            keyExtractor={keyExtractor}
            keyboardDismissMode="on-drag"
            estimatedItemSize={LIST_ITEM_HEIGHT}
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={contentContainerStyle}
            // @@TODO: unstable
            // renderScrollComponent={props => <ScrollView {...props} />}
          />
        </PressablesGroup>
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
    marginBottom: 0,
    marginTop: 6,
    position: 'relative',
  },
  searchInput: {
    backgroundColor: '#1a1a1a',
    borderCurve: 'continuous',
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
    height: 20,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 1,
  },
});
