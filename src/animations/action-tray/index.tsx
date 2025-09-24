import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PressableScale } from 'pressto';
import { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  FadeIn,
  FadeOut,
  Layout,
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

  // Is it really necessary to use a shared value here?
  // I don't know :)
  const isActionTrayOpened = useSharedValue(false);

  // Close the action tray and reset the step
  const close = useCallback(() => {
    ref.current?.close();
    isActionTrayOpened.value = false;
    setStep(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Toggle the action tray state (open/close)
  const toggleActionTray = useCallback(() => {
    const isActive = ref.current?.isActive() ?? false;
    isActionTrayOpened.value = !isActive;
    isActive ? close() : ref.current?.open();
  }, [close, isActionTrayOpened]);

  const rContentHeight = useDerivedValue(() => {
    // Just a simple interpolation to make the content height dynamic based on the step
    return interpolate(step, [0, 1, 2], [80, 200, 250], Extrapolation.CLAMP);
  }, [step]);

  const rContentStyle = useAnimatedStyle(() => {
    return {
      // Spring animations. Spring animations everywhere! 😅
      height: withSpring(rContentHeight.value),
    };
  }, []);

  // Get the title, action button title and the rotation animation for the action button
  // based on the current step
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
          // Rotate the button when the action tray is opened + -> x
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

      {/* Reuse this ActionTray whenever you want, you just need to update the children :) */}
      <ActionTray
        ref={ref}
        maxHeight={screenHeight * 0.6}
        style={styles.actionTray}
        onClose={close}>
        {/* All this content is fully customizable, you can use whatever you want here */}
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
              layout={Layout.easing(Easing.linear).duration(250)}
              exiting={FadeOut.delay(100)}
              style={styles.contentText}>
              Content here
            </Animated.Text>
          )}
          {step === 1 && (
            <Animated.View
              layout={Layout.easing(Easing.linear).duration(250)}
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
              layout={Layout.easing(Easing.linear).duration(250)}
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
  container: {
    flex: 1,
    backgroundColor: Palette.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fill: { flex: 1 },
  button: {
    marginTop: 200,
    height: 50,
    backgroundColor: Palette.primary,
    borderRadius: 25,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionTray: {
    backgroundColor: '#FFF',
    flex: 1,
    padding: 25,
  },
  headingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headingText: {
    fontSize: 20,
    fontWeight: '600',
  },
  closeButton: {
    height: 24,
    aspectRatio: 1,
    borderRadius: 20,
    backgroundColor: Palette.surface,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentText: {
    fontSize: 16,
    marginTop: 15,
    marginBottom: 25,
    fontWeight: '600',
    color: Palette.text,
  },
  continueButton: {
    backgroundColor: Palette.primary,
    justifyContent: 'center',
    alignItems: 'center',
    height: 55,
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    borderRadius: 25,
  },
  buttonText: {
    color: Palette.background,
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export { App as ActionTray };
