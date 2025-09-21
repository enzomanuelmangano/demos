/* eslint-disable react/no-unstable-nested-components */
import { AntDesign } from '@expo/vector-icons';
import { PressableScale } from 'pressto';
import { useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import type { ToastType } from './toast-manager';
import { ToastProvider, useToast } from './toast-manager';

const App = () => {
  const { showToast } = useToast();

  const value = useRef(0);

  const toasts: Omit<ToastType, 'id'>[] = useMemo(() => {
    return [
      {
        title: 'I am a simple toast',
        leading: () => (
          <AntDesign name="check-circle" size={20} color="black" />
        ),
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
        leading: () => <AntDesign name="smile" size={20} color="black" />,
      },
      {
        title: "And if you're lazy",
        subtitle: 'I can dismiss myself',
        autodismiss: true,
        leading: () => <AntDesign name="user" size={20} color="black" />,
      },
    ];
  }, []);

  return (
    <View style={styles.container}>
      <PressableScale
        style={styles.button}
        onPress={() => {
          const toast = toasts[value.current++];

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
    borderCurve: 'continuous',
    borderWidth: 1,
  },
  textButton: {
    color: 'white',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
});

export { AppContainer as Toast };
