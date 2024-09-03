import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Octicons } from '@expo/vector-icons';
import type { Icon } from '@expo/vector-icons/build/createIconSet';

import { useStackedToast } from '../stacked-toast-manager/hooks';

type IconName<T, H extends string> = T extends Icon<infer U, H> ? U : never;
// Is there a better way to do this?
type OcticonsIconName = IconName<typeof Octicons, 'octicons'>;

export type ShowToastParams = {
  title: string;
  iconName?: OcticonsIconName;
  trailing?: React.ReactNode;
};

// This custom hook, useToast, provides a way to create and display toast notifications
// in a React Native application. It leverages the useStackedToast hook to manage
// multiple toasts in a stack-like manner. The toast messages can include a title,
// an optional icon, and optional trailing content. The toasts are styled using
// a linear gradient background and can be easily customized.
export const useToast = () => {
  const { showStackedToast } = useStackedToast();

  const showToast = useCallback(
    ({ title, iconName, trailing }: ShowToastParams) => {
      return showStackedToast({
        key: `key-${Math.random() * 1000}`,
        children: () => {
          return (
            <LinearGradient
              colors={['#2C2E35', '#26252D']}
              locations={[0, 0.9]}
              style={styles.container}>
              {iconName && <Octicons name={iconName} size={16} color="#fff" />}
              <Text style={styles.internalText}>{title}</Text>
              <View style={{ flex: 1 }} />
              {trailing}
            </LinearGradient>
          );
        },
      });
    },
    [showStackedToast],
  );

  return {
    showToast,
  };
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#2A292F',
    flexDirection: 'row',
    paddingHorizontal: 20,
  },
  internalText: {
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 14,
    color: 'white',
    marginLeft: 10,
  },
});
