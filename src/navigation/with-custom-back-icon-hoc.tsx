import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Alert, StyleSheet, View } from 'react-native';
import { useEffect } from 'react';

import { PressableScale } from '../animations/action-tray/components/TouchableScale';

// I'm not a fan of HOCs, but this one is useful :)
export const withCustomBackIcon = ({
  Component,
  alert = false,
  backIconDark = true,
  iconMarginTop = 0,
}: {
  Component:
    | (() => React.JSX.Element)
    | React.MemoExoticComponent<() => React.JSX.Element>;
  backIconDark?: boolean;
  iconMarginTop?: number;
  alert?: boolean;
}) => {
  return () => {
    const { goBack } = useNavigation();
    const { top: safeTop } = useSafeAreaInsets();
    const backgroundColor = backIconDark
      ? 'rgba(0,0,0,0.1)'
      : 'rgba(255,255,255,0.2)';
    const color = backIconDark ? 'black' : 'white';

    useEffect(() => {
      if (!alert) return;
      setTimeout(() => {
        Alert.alert(
          'Info',
          "This animation became unstable with the latest update. I'm currently working on a fix 🙈",
          [
            {
              text: 'Ok',
              style: 'cancel',
            },
          ],
        );
      }, 500);
    }, []);

    return (
      <View style={styles.container}>
        <PressableScale
          onPress={goBack}
          style={[
            {
              top: 24 + safeTop + iconMarginTop,
              backgroundColor,
              borderColor: color,
            },
            styles.button,
          ]}>
          <MaterialIcons name="chevron-left" size={32} color={color} />
        </PressableScale>
        <Component />
      </View>
    );
  };
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  button: {
    height: 48,
    aspectRatio: 1,
    position: 'absolute',
    left: 20,
    zIndex: 1000,
    borderWidth: 2,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
