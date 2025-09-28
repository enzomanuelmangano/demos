import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { useSharedValue } from 'react-native-reanimated';
import { useCallback } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { PressableScale } from 'pressto';

import { InteractiveList } from './components/interactive-list';
import { INITIAL_ITEMS } from './constants';
import { useAnimatedShake } from './hooks/use-animated-shake';
import { ListItem } from './components/list-item';

const ITEM_HEIGHT = 100;
const ITEM_MARGIN = 10;

const EmailDemo = () => {
  const { bottom: safeBottom, top: safeTop } = useSafeAreaInsets();

  const erasedItems = useSharedValue(0);

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
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  floatingButton: {
    height: 64,
    aspectRatio: 1,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  buttonsContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    justifyContent: 'space-evenly',
    marginHorizontal: '20%',
    flexDirection: 'row',
  },
  topGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 1,
  },
  bottomGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 150,
    zIndex: 1,
  },
  listContainerItem: {
    height: ITEM_HEIGHT,
    backgroundColor: 'white',
    marginBottom: ITEM_MARGIN - 2,
    marginHorizontal: 12,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 0.5,
    borderColor: 'rgba(229, 231, 235, 0.3)',
  },
});

export { EmailDemo };
