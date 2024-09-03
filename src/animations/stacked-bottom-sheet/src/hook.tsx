import { useCallback, useRef } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { PressableScale } from './components/pressable-scale';
import { useStackedSheet } from './stacked-sheet-manager/hooks';
import { MagicScreen } from './screens/the-magic';
import { StackedSheetHandle } from './stacked-sheet-manager/stacked-sheet-handle';

// THIS HOOK IS A MESS, JUST TO BUILD THE FANCY DEMO

// Using the StackedSheet is far more simple than that
// Here's an example of how to use it in a component:
// const { showStackedSheet } = useStackedSheet();
//
// showStackedSheet({
//   key: 'specify-a-key',
//   componentHeight: 300, // Specify the height of the StackedSheet
//   children: () => {
//     return (
//       <View style={{ flex: 1 }}>
//         {/* Your internal component */}
//       </View>
//     );
//   },
// });

export const useDemoStackedSheet = () => {
  const { showStackedSheet } = useStackedSheet();

  const { width: windowWidth } = useWindowDimensions();

  const bottomSheetConfigs = useRef([
    {
      height: 140,
      content: (
        <View style={styles.fillCenter}>
          <Text style={styles.internalText}>You can put here</Text>
        </View>
      ),
    },
    {
      height: 160,
      content: (
        <View style={styles.fillCenter}>
          <Text style={styles.internalText}>Whatever you want</Text>
        </View>
      ),
    },
    {
      height: 180,
      content: (
        <View
          style={[
            styles.fillCenter,
            {
              flexDirection: 'row',
              gap: 10,
            },
          ]}>
          <Text
            style={[
              styles.internalText,
              {
                justifyContent: 'center',
                alignItems: 'center',
                gap: 10,
              },
            ]}>
            Let's add a bit of magic
          </Text>
          <PressableScale
            style={{
              borderColor: 'rgba(0,0,0,0.1)',
              borderWidth: 1,
              padding: 10,
              borderRadius: 10,
            }}
            onPress={() => {
              // Create a spam StackedSheet with a random key to prevent duplicates
              showStackedSheet({
                // key is used to prevent duplicate StackedSheets
                // Usually the title is used as key, but in this case
                // we want to spam the same StackedSheet, so we use a random key
                key: 'the-magic',
                componentHeight: 300,

                children: () => {
                  return (
                    <View style={{ flex: 1 }}>
                      <StackedSheetHandle
                        style={{
                          backgroundColor: 'rgba(255,255,255, 0.5)',
                          zIndex: 2,
                        }}
                      />
                      <MagicScreen height={300} width={windowWidth * 0.9} />
                    </View>
                  );
                },
              });
            }}>
            {/* Text displayed on the button */}
            <Text>🪄</Text>
          </PressableScale>
        </View>
      ),
    },
    {
      height: 200,
      content: <View />,
    },
    {
      height: 250,
      content: <View />,
    },
    {
      height: 275,
      content: <View />,
    },
    {
      height: 350,
      content: <View />,
    },
  ]);

  const increment = useRef(0);

  const onPress = useCallback(() => {
    const componentConfig =
      bottomSheetConfigs.current[
        Math.min(increment.current++, bottomSheetConfigs.current.length - 1)
      ];

    // Create a spam StackedSheet with a random key to prevent duplicates
    showStackedSheet({
      // key is used to prevent duplicate StackedSheets
      // Usually the title is used as key, but in this case
      // we want to spam the same StackedSheet, so we use a random key
      key: `key-${Math.random() * 1000}`,
      componentHeight: componentConfig.height,
      children: () => {
        return <>{componentConfig.content}</>;
      },
    });
  }, [showStackedSheet]);

  return {
    onPress,
  };
};

// Define the styles for the components using StyleSheet.create
const styles = StyleSheet.create({
  fillCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  internalText: {
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 20,
  },
});
