/* eslint-disable react/no-unstable-nested-components */
import { StyleSheet, Text, View } from 'react-native';

import { useMemo, useRef } from 'react';

import { AntDesign } from '@expo/vector-icons';
import { PressableScale } from 'pressto';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ToastProvider, useToast } from './toast-manager';

import type { ToastType } from './toast-manager';

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
  button: {
    backgroundColor: '#111',
    borderCurve: 'continuous',
    borderRadius: 25,
    borderWidth: 1,
    marginBottom: 20,
    paddingHorizontal: 25,
    paddingVertical: 18,
  },
  container: {
    alignItems: 'center',
    backgroundColor: '#fff',
    flex: 1,
    justifyContent: 'center',
  },
  textButton: {
    color: 'white',
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});

export { AppContainer as Toast };
