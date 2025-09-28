import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { useCallback, useMemo, useRef, useState } from 'react';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PressableScale } from 'pressto';
import Animated, {
  Easing,
  Extrapolation,
  FadeIn,
  FadeOut,
  LinearTransition,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { ActionTray, type ActionTrayRef } from './components/ActionTray';
import { Palette } from './constants/palette';

function App() {
  const ref = useRef<ActionTrayRef>(null);
  const { height: screenHeight } = useWindowDimensions();

  const [step, setStep] = useState(0);

  const isActionTrayOpened = useSharedValue(false);

  const close = useCallback(() => {
    ref.current?.close();
    isActionTrayOpened.value = false;
    setStep(0);
  }, [isActionTrayOpened]);

  const toggleActionTray = useCallback(() => {
    const isActive = ref.current?.isActive() ?? false;
    isActionTrayOpened.value = !isActive;
    isActive ? close() : ref.current?.open();
  }, [close, isActionTrayOpened]);

  const rContentHeight = useDerivedValue(() => {
    return interpolate(step, [0, 1, 2], [80, 200, 250], Extrapolation.CLAMP);
  }, [step]);

  const rContentStyle = useAnimatedStyle(() => {
    return {
      height: withSpring(rContentHeight.value),
    };
  }, []);
  const title = useMemo(() => {
    switch (step) {
      case 0:
        return 'Heading 1';
      case 1:
        return 'Heading 2';
      case 2:
        return 'Heading 3';
      default:
        return '';
    }
  }, [step]);

  const actionTitle = useMemo(() => {
    switch (step) {
      case 0:
        return 'Continue';
      case 1:
        return 'Accept 1';
      case 2:
        return 'Accept 2';
      default:
        return '';
    }
  }, [step]);

  const rToggleButtonStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          rotate: withTiming(isActionTrayOpened.value ? '45deg' : '0deg'),
        },
      ],
    };
  }, []);

  return (
    <View style={styles.container}>
      <PressableScale
        style={[styles.button, rToggleButtonStyle]}
        onPress={toggleActionTray}>
        <MaterialCommunityIcons
          name="plus"
          size={25}
          color={Palette.background}
        />
      </PressableScale>

      <ActionTray
        ref={ref}
        maxHeight={screenHeight * 0.6}
        style={styles.actionTray}
        onClose={close}>
        <View style={styles.headingContainer}>
          <Text style={styles.headingText}>{title}</Text>
          <View style={styles.fill} />
          <PressableScale onPress={close} style={styles.closeButton}>
            <MaterialCommunityIcons
              name="close-thick"
              size={15}
              color={Palette.text}
            />
          </PressableScale>
        </View>

        <Animated.View style={rContentStyle}>
          {step === 0 && (
            <Animated.Text
              layout={LinearTransition.easing(Easing.linear).duration(250)}
              exiting={FadeOut.delay(100)}
              style={styles.contentText}>
              Content here
            </Animated.Text>
          )}
          {step === 1 && (
            <Animated.View
              layout={LinearTransition.easing(Easing.linear).duration(250)}
              entering={FadeIn.delay(100)}
              exiting={FadeOut.delay(100)}
              style={{ flex: 1 }}>
              <Text style={styles.contentText}>
                You know what? I really don't know what to write here.{'\n\n'}I
                just want to make this text long enough to test the animation.
                So I am just typing some random words here.{'\n'}I hope this is
                enough.
              </Text>
            </Animated.View>
          )}
          {step === 2 && (
            <Animated.View
              layout={LinearTransition.easing(Easing.linear).duration(250)}
              entering={FadeIn.delay(100)}
              exiting={FadeOut.delay(100)}
              style={{ flex: 1 }}>
              <Text style={styles.contentText}>
                Waaait a second! Actually I have something to say.{'\n\n'}
                If you are reading this, you're probably searching for the
                source code!{'\n\n'}
                If I'm right, you can find it here:{'\n'}
                <Text
                  style={{
                    fontWeight: 'bold',
                    color: 'rgba(0,0,0,0.5)',
                  }}>
                  reactiive.io/demos
                </Text>
              </Text>
            </Animated.View>
          )}
        </Animated.View>

        <PressableScale
          style={styles.continueButton}
          onPress={() => {
            if (step === 2) {
              close();
              return;
            }
            setStep(currentStep => currentStep + 1);
          }}>
          <Text style={styles.buttonText}>{actionTitle}</Text>
        </PressableScale>
      </ActionTray>
    </View>
  );
}

const styles = StyleSheet.create({
  actionTray: {
    backgroundColor: '#FFF',
    flex: 1,
    padding: 25,
  },
  button: {
    alignItems: 'center',
    aspectRatio: 1,
    backgroundColor: Palette.primary,
    borderRadius: 25,
    height: 50,
    justifyContent: 'center',
    marginTop: 200,
  },
  buttonText: {
    color: Palette.background,
    fontSize: 16,
    fontWeight: 'bold',
  },
  closeButton: {
    alignItems: 'center',
    alignSelf: 'center',
    aspectRatio: 1,
    backgroundColor: Palette.surface,
    borderRadius: 20,
    height: 24,
    justifyContent: 'center',
  },
  container: {
    alignItems: 'center',
    backgroundColor: Palette.background,
    flex: 1,
    justifyContent: 'center',
  },
  contentText: {
    color: Palette.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 25,
    marginTop: 15,
  },
  continueButton: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: Palette.primary,
    borderRadius: 25,
    flex: 1,
    height: 55,
    justifyContent: 'center',
    width: '100%',
  },
  fill: { flex: 1 },
  headingContainer: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  headingText: {
    fontSize: 20,
    fontWeight: '600',
  },
});

export { App as ActionTray };
