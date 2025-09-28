import { StyleSheet, View } from 'react-native';

import { useCallback } from 'react';

import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PressableScale } from 'pressto';
import Animated, { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InteractiveList } from './components/interactive-list';
import { ListItem } from './components/list-item';
import { INITIAL_ITEMS } from './constants';
import { useAnimatedShake } from './hooks/use-animated-shake';

const ITEM_HEIGHT = 100;
const ITEM_MARGIN = 10;

const EmailDemo = () => {
  const { bottom: safeBottom, top: safeTop } = useSafeAreaInsets();

  // Define shared value for erased items count
  // At the beginning I was thinking to use a state, but the
  // shared value is a better option to handle the animation
  // since we're going to avoid useless re-renders
  const erasedItems = useSharedValue(0);

  // Custom hook to handle animation logic for restore and delete buttons
  // This hook is EXTREMELY useful (and reusable) to handle shake animations
  // I've used it also in the Verification Code Input component animation
  const { shake: shakeRestore, rShakeStyle: rShakeRestoreStyle } =
    useAnimatedShake();
  const { shake: shakeDelete, rShakeStyle: rShakeDeleteStyle } =
    useAnimatedShake();

  const onDelete = useCallback(() => {
    if (erasedItems.value >= INITIAL_ITEMS.length) {
      shakeDelete();
      return;
    }
    erasedItems.value = erasedItems.value + 1;
  }, [erasedItems, shakeDelete]);

  const onRestore = useCallback(() => {
    if (erasedItems.value <= 0) {
      shakeRestore();
      return;
    }
    erasedItems.value = erasedItems.value - 1;
  }, [erasedItems, shakeRestore]);

  return (
    <>
      <View style={styles.container}>
        <LinearGradient
          colors={['rgba(248,250,252,1)', 'rgba(248,250,252,0)']}
          start={[0, 0]}
          end={[0, 1]}
          pointerEvents="none"
          style={[
            styles.topGradient,
            {
              height: safeTop * 1.5,
            },
          ]}
        />

        <InteractiveList
          data={INITIAL_ITEMS}
          itemHeight={ITEM_HEIGHT + ITEM_MARGIN}
          amountToShift={erasedItems}
          itemContainerStyle={styles.listContainerItem}
          contentContainerStyle={{
            paddingBottom: ITEM_HEIGHT + ITEM_MARGIN,
            paddingTop: safeTop,
          }}
          renderItem={({ item }) => {
            return <ListItem item={item} itemHeight={ITEM_HEIGHT} />;
          }}
        />
      </View>

      <LinearGradient
        colors={['rgba(248,250,252,0)', 'rgba(248,250,252,1)']}
        start={[0, 0]}
        end={[0, 1]}
        pointerEvents="none"
        style={styles.bottomGradient}
      />

      <View
        style={[
          styles.buttonsContainer,
          {
            bottom: safeBottom + 10,
            zIndex: 2,
          },
        ]}>
        <Animated.View style={rShakeRestoreStyle}>
          <PressableScale
            onPress={onRestore}
            style={[
              styles.floatingButton,
              {
                backgroundColor: '#10b981',
              },
            ]}>
            <MaterialIcons name="restore" size={24} color="white" />
          </PressableScale>
        </Animated.View>

        <Animated.View style={rShakeDeleteStyle}>
          <PressableScale
            onPress={onDelete}
            style={[
              styles.floatingButton,
              {
                backgroundColor: '#ef4444',
              },
            ]}>
            <MaterialIcons name="delete" size={24} color="white" />
          </PressableScale>
        </Animated.View>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  bottomGradient: {
    bottom: 0,
    height: 150,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 1,
  },
  buttonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    left: 0,
    marginHorizontal: '20%',
    position: 'absolute',
    right: 0,
  },
  container: {
    backgroundColor: '#f8fafc',
    flex: 1,
  },
  floatingButton: {
    alignItems: 'center',
    aspectRatio: 1,
    borderRadius: 32,
    elevation: 8,
    height: 64,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  listContainerItem: {
    backgroundColor: 'white',
    borderColor: 'rgba(229, 231, 235, 0.3)',
    borderRadius: 20,
    borderWidth: 0.5,
    elevation: 2,
    height: ITEM_HEIGHT,
    marginBottom: ITEM_MARGIN - 2,
    marginHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  topGradient: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 1,
  },
});

export { EmailDemo };
