import { StyleSheet, Text, View } from 'react-native';

import { useCallback, useState } from 'react';

import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PressableScale } from 'pressto';
import Animated, {
  useAnimatedReaction,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

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

  // e2e outcome probe: bridges the erased-items count (a shared value driving
  // worklet list animations, with no inspectable RN state) to an assertable
  // string so a test can verify delete/restore actually changed the count.
  // Near-invisible (alpha ~0.01).
  const [erasedCount, setErasedCount] = useState(0);
  useAnimatedReaction(
    () => erasedItems.get(),
    current => {
      scheduleOnRN(setErasedCount, current);
    },
    [],
  );

  // Custom hook to handle animation logic for restore and delete buttons
  // This hook is EXTREMELY useful (and reusable) to handle shake animations
  // I've used it also in the Verification Code Input component animation
  const { shake: shakeRestore, rShakeStyle: rShakeRestoreStyle } =
    useAnimatedShake();
  const { shake: shakeDelete, rShakeStyle: rShakeDeleteStyle } =
    useAnimatedShake();

  const onDelete = useCallback(() => {
    if (erasedItems.get() >= INITIAL_ITEMS.length) {
      shakeDelete();
      return;
    }
    erasedItems.set(erasedItems.get() + 1);
  }, [erasedItems, shakeDelete]);

  const onRestore = useCallback(() => {
    if (erasedItems.get() <= 0) {
      shakeRestore();
      return;
    }
    erasedItems.set(erasedItems.get() - 1);
  }, [erasedItems, shakeRestore]);

  return (
    <>
      <Text testID="email-demo-status" style={styles.statusProbe}>
        {`erased:${erasedCount}`}
      </Text>
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
            testID="email-demo-restore"
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
            testID="email-demo-delete"
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
    boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.15)',
    height: 64,
    justifyContent: 'center',
  },
  statusProbe: {
    color: '#000',
    fontSize: 1,
    left: 0,
    opacity: 0.012,
    position: 'absolute',
    top: 0,
    zIndex: 3,
  },
  listContainerItem: {
    backgroundColor: 'white',
    borderColor: 'rgba(229, 231, 235, 0.3)',
    borderCurve: 'continuous',
    borderRadius: 20,
    borderWidth: 0.5,
    boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.05)',
    height: ITEM_HEIGHT,
    marginBottom: ITEM_MARGIN - 2,
    marginHorizontal: 12,
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
