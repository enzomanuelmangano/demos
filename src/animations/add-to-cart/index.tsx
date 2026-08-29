import { FlatList, StyleSheet, Text, View } from 'react-native';

import { useCallback, useMemo, useState } from 'react';

import { Feather } from '@expo/vector-icons';
import Animated, {
  cancelAnimation,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Backdrop } from './components/backdrop';
import { BottomSheet } from './components/bottom-sheet';
import { ConfirmButton } from './components/confirm-button';
import { ListItem } from './components/list-item';

import type { MeasuredDimensions } from 'react-native-reanimated';

const items = new Array(20).fill(0).map((_, index) => ({
  id: index,
  title: `Item ${index}`,
  imageUri:
    'https://images.unsplash.com/photo-1662880195918-63fecf8a8b71?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=987&q=80',
  description:
    'Lorem, ipsum dolor sit amet consectetur adipisicing elit. Vitae itaque quae, deleniti distinctio laudantium, doloremque debitis, fugiat ea alias sint dolor qui? Quo tempore, ab aliquam repellendus veritatis aspernatur cupiditate.',
  count: 0,
}));

const AddToCart = () => {
  const [listItems, setListItems] = useState(items);
  const { top } = useSafeAreaInsets();
  const animationProgress = useSharedValue(0);
  const layoutData = useSharedValue<null | MeasuredDimensions>(null);
  const selectedIndex = useSharedValue<number | null>(null);
  const onTap = useCallback(
    ({ index, layout }: { index: number; layout: MeasuredDimensions }) => {
      cancelAnimation(animationProgress);
      animationProgress.set(0);
      layoutData.set({ ...layout });
      selectedIndex.set(index);
      animationProgress.set(
        withSpring(1, {
          dampingRatio: 1,
          duration: 500,
        }),
      );
    },
    [animationProgress, layoutData, selectedIndex],
  );

  const onDismiss = useCallback(() => {
    animationProgress.set(
      withSpring(
        0,
        {
          dampingRatio: 1,
          duration: 500,
        },
        hasCompleted => {
          if (hasCompleted) {
            layoutData.set(null);
            selectedIndex.set(null);
          }
        },
      ),
    );
  }, [animationProgress, layoutData, selectedIndex]);

  const onConfirm = useCallback(() => {
    const index = selectedIndex.get();
    if (index === null) {
      return;
    }
    setListItems(prevListItems => {
      return prevListItems.map(item => {
        if (item.id === index) {
          return {
            ...item,
            count: item.count + 1,
          };
        }
        return item;
      });
    });
    onDismiss();
  }, [onDismiss, selectedIndex.get()]);

  const rConfirmTextStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(
        animationProgress.get(),
        [0.5, 1],
        [0, 1],
        Extrapolation.CLAMP,
      ),
      flex: interpolate(
        animationProgress.get(),
        [0, 1],
        [0, 4],
        Extrapolation.CLAMP,
      ),
    };
  }, []);

  const confirmButtonChildren = useMemo(() => {
    return <Feather name="shopping-cart" size={18} color="white" />;
  }, []);

  // e2e outcome probe: total items added to the cart, exposed as an assertable
  // token so a test can verify the confirm button actually added an item.
  // Visually negligible (alpha ~0.01).
  const cartCount = useMemo(
    () => listItems.reduce((acc, item) => acc + item.count, 0),
    [listItems],
  );

  return (
    <View style={[styles.container, { flex: 1 }]}>
      <Text testID="add-to-cart-status" style={styles.statusProbe}>
        {`cart:${cartCount}`}
      </Text>
      <FlatList
        data={listItems}
        contentContainerStyle={{
          paddingBottom: 100,
          paddingTop: top + 24,
        }}
        renderItem={({ item }) => {
          return (
            <ListItem
              item={item}
              selectedIndex={selectedIndex}
              onTap={onTap}
              key={item.id}
              index={item.id}
              style={styles.listItem}
              animationProgress={animationProgress}
              buttonStyle={[
                styles.buyButton,
                {
                  justifyContent: 'center',
                  alignItems: 'center',
                },
              ]}
              confirmButtonChildren={confirmButtonChildren}
            />
          );
        }}
      />
      <Backdrop animationProgress={animationProgress} onPress={onDismiss} />
      <ConfirmButton
        layoutData={layoutData}
        animationProgress={animationProgress}
        onConfirm={onConfirm}
        style={[
          styles.buyButton,
          {
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
          },
        ]}>
        <Animated.View style={rConfirmTextStyle}>
          <Text
            style={{
              color: 'white',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              paddingHorizontal: 15,
            }}>
            Add to cart
          </Text>
        </Animated.View>
        <Animated.View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
          }}>
          {confirmButtonChildren}
        </Animated.View>
      </ConfirmButton>
      <BottomSheet animationProgress={animationProgress} />
    </View>
  );
};

const styles = StyleSheet.create({
  buyButton: {
    backgroundColor: '#000',
    borderCurve: 'continuous',
    borderRadius: 10,
    height: 40,
    width: 40,
  },
  container: {
    backgroundColor: '#fff',
    flex: 1,
  },
  listItem: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'white',
    borderCurve: 'continuous',
    borderRadius: 10,
    boxShadow: '0px 5px 10px rgba(0, 0, 0, 0.2)',
    flexDirection: 'row',
    height: 85,
    justifyContent: 'space-between',
    margin: 10,
    paddingLeft: 15,
    paddingRight: 20,
    width: '90%',
  },
  statusProbe: {
    color: '#fff',
    fontSize: 1,
    left: 0,
    opacity: 0.012,
    position: 'absolute',
    top: 0,
    zIndex: 1000,
  },
});

export { AddToCart };
