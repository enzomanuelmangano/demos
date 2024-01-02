import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet } from 'react-native';

import { PressableScale } from '../animations/action-tray/components/TouchableScale';

// I'm not a fan of HOCs, but this one is useful :)
export const withCustomBackIcon = ({
  Component,
  backIconDark = true,
  iconMarginTop = 0,
}: {
  Component:
    | (() => React.JSX.Element)
    | React.MemoExoticComponent<() => React.JSX.Element>;
  backIconDark?: boolean;
  iconMarginTop?: number;
}) => {
  return () => {
    const { goBack } = useNavigation();
    const { top: safeTop } = useSafeAreaInsets();
    const backgroundColor = backIconDark
      ? 'rgba(0,0,0,0.1)'
      : 'rgba(255,255,255,0.2)';
    const color = backIconDark ? 'black' : 'white';

    return (
      <>
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
      </>
    );
  };
};

const styles = StyleSheet.create({
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
