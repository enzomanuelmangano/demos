import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { useSharedValue } from 'react-native-reanimated';
import { useCallback } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { PressableScale } from 'pressto';

// Import custom components and constants
import { InteractiveList } from './components/interactive-list';
import { INITIAL_ITEMS } from './constants';
import { useAnimatedShake } from './hooks/use-animated-shake';
import { ListItem } from './components/list-item';

// Constants to define item height and margin
const ITEM_HEIGHT = 100;
const ITEM_MARGIN = 10;

// Main App component
const EmailDemo = () => {
  // Fetch safe area insets using useSafeAreaInsets hook
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

  // Callback function for delete button press
  const onDelete = useCallback(() => {
    // Check if all items are already erased, trigger shake animation if so
    if (erasedItems.value >= INITIAL_ITEMS.length) {
      shakeDelete();
      return;
    }
    // Increment erased items count
    erasedItems.value = erasedItems.value + 1;
  }, [erasedItems, shakeDelete]);

  // Callback function for restore button press
  const onRestore = useCallback(() => {
    // Check if no item is erased, trigger shake animation if so
    if (erasedItems.value <= 0) {
      shakeRestore();
      return;
    }
    // Decrement erased items count
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
        {/* Restore button */}
        <Animated.View style={rShakeRestoreStyle}>
          <PressableScale
            onPress={onRestore} // Callback function for button press
            style={[
              styles.floatingButton, // Basic button style
              {
                backgroundColor: '#10b981', // Background color for restore button
              },
            ]}>
            {/* Icon for restore button */}
            <MaterialIcons name="restore" size={24} color="white" />
          </PressableScale>
        </Animated.View>

        {/* Delete button */}
        <Animated.View style={rShakeDeleteStyle}>
          <PressableScale
            onPress={onDelete} // Callback function for button press
            style={[
              styles.floatingButton, // Basic button style
              {
                backgroundColor: '#ef4444', // Background color for delete button
              },
            ]}>
            {/* Icon for delete button */}
            <MaterialIcons name="delete" size={24} color="white" />
          </PressableScale>
        </Animated.View>
      </View>
    </>
  );
};

// Stylesheet for the components
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
    position: 'absolute', // Position relative to container
    left: 0, // Align to left edge
    right: 0, // Align to right edge
    justifyContent: 'space-evenly', // Distribute space between buttons
    marginHorizontal: '20%', // Apply horizontal margin
    flexDirection: 'row', // Arrange buttons horizontally
  },
  topGradient: {
    position: 'absolute', // Position relative to container
    left: 0, // Align to left edge
    right: 0, // Align to right edge
    top: 0, // Align to top edge
    zIndex: 1, // Ensure overlay over other components
  },
  bottomGradient: {
    position: 'absolute', // Position relative to container
    left: 0, // Align to left edge
    right: 0, // Align to right edge
    bottom: 0, // Align to bottom edge
    height: 150, // Fixed height
    zIndex: 1, // Ensure overlay over other components
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

// Export
export { EmailDemo };
