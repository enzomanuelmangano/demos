/* eslint-disable react/no-unstable-nested-components */
// Import necessary modules and components from React Native and other libraries
import { StyleSheet, Text, View } from 'react-native';
import { useMemo, useRef } from 'react';
import { AntDesign } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PressableScale } from 'pressto';

import type { ToastType } from './toast-manager';
import { ToastProvider, useToast } from './toast-manager';

// Define the main component of the application
const App = () => {
  // Access the showToast function from the custom useToast hook
  const { showToast } = useToast();

  // Use useRef to persistently store and update a numerical value
  const value = useRef(0);

  // Define an array of toast configurations using useMemo to memoize the array
  const toasts: Omit<ToastType, 'id'>[] = useMemo(() => {
    return [
      {
        title: 'I am a simple toast',
        leading: () => <AntDesign name="checkcircle" size={20} color="black" />,
      },
      {
        title: 'Well, not so simple',
        leading: () => <AntDesign name="shake" size={20} color="black" />,
      },
      {
        title: 'You can swipe me',
        leading: () => <AntDesign name="swap" size={20} color="black" />,
      },
      {
        title: 'You can add a subtitle',
        subtitle: 'Here I am',
        leading: () => <AntDesign name="smileo" size={20} color="black" />,
      },
      {
        title: "And if you're lazy",
        subtitle: 'I can dismiss myself',
        autodismiss: true,
        leading: () => <AntDesign name="user" size={20} color="black" />,
      },
    ];
  }, []);

  // Render the main view of the application
  return (
    <View style={styles.container}>
      {/* Create a button using the PressableScale component */}
      <PressableScale
        style={styles.button}
        onPress={() => {
          // Get the next toast configuration from the array
          const toast = toasts[value.current++];

          // If a toast is available, show it; otherwise, create a spam toast
          if (toast) {
            showToast(toast);
            return;
          }

          // Create a spam toast with a random key to prevent duplicates
          showToast({
            title: 'You can spam me!',
            // key is used to prevent duplicate toasts
            // Usually the title is used as key, but in this case
            // we want to spam the same toast, so we use a random key
            key: `spam-${Math.random() * 100}`,
            leading: () => (
              <AntDesign
                key={value.current}
                name="twitter"
                size={20}
                color="black"
              />
            ),
          });
        }}>
        {/* Text displayed on the button */}
        <Text style={styles.textButton}>Toast!</Text>
      </PressableScale>
    </View>
  );
};

const AppContainer = () => {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </GestureHandlerRootView>
  );
};

// Define the styles for the components using StyleSheet.create
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    paddingVertical: 18,
    paddingHorizontal: 25,
    backgroundColor: '#111',
    borderRadius: 25,
    marginBottom: 20,
    borderCurve: 'continuous', // Note: 'borderCurve' is not a valid property, perhaps 'borderRadius' is intended
    borderWidth: 1,
  },
  textButton: {
    color: 'white',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
});

// Export the main App component for use in other files
export { AppContainer as Toast };
