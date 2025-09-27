import { Feather } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { MeasuredDimensions } from 'react-native-reanimated';
import Animated, {
  cancelAnimation,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Backdrop } from './components/backdrop';
import { BottomSheet } from './components/bottom-sheet';
import { ConfirmButton } from './components/confirm-button';
import { ListItem } from './components/list-item';

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
      animationProgress.value = 0;
      layoutData.value = { ...layout };
      selectedIndex.value = index;
      animationProgress.value = withTiming(1, {
        duration: 350,
      });
    },
    [animationProgress, layoutData, selectedIndex],
  );

  const onDismiss = useCallback(() => {
    animationProgress.value = withTiming(
      0,
      {
        duration: 350,
      },
      hasCompleted => {
        if (hasCompleted) {
          layoutData.value = null;
          selectedIndex.value = null;
        }
      },
    );
  }, [animationProgress, layoutData, selectedIndex]);

  const onConfirm = useCallback(() => {
    const index = selectedIndex.value;
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
  }, [onDismiss, selectedIndex.value]);

  const rConfirmTextStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(
        animationProgress.value,
        [0.5, 1],
        [0, 1],
        Extrapolation.CLAMP,
      ),
      flex: interpolate(
        animationProgress.value,
        [0, 1],
        [0, 4],
        Extrapolation.CLAMP,
      ),
    };
  }, []);

  const confirmButtonChildren = useMemo(() => {
    return <Feather name="shopping-cart" size={18} color="white" />;
  }, []);

  return (
    <View style={[styles.container, { flex: 1 }]}>
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
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  buyButton: {
    height: 40,
    width: 40,
    borderRadius: 10,
    backgroundColor: '#000',
  },
  listItem: {
    width: '90%',
    height: 85,
    alignSelf: 'center',
    margin: 10,
    paddingLeft: 15,
    paddingRight: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
    backgroundColor: 'white',
    borderRadius: 10,
  },
});

export { AddToCart };
