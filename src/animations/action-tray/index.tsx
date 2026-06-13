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
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { ActionTray, type ActionTrayRef } from './components/ActionTray';
import { Palette } from './constants/palette';

function App() {
  const ref = useRef<ActionTrayRef>(null);
  const { height: screenHeight } = useWindowDimensions();

  const [step, setStep] = useState(0);

  const isActionTrayOpened = useSharedValue(false);

  // e2e outcome probe: bridge the tray's open state (a worklet value) to JS so
  // a test can assert the tray is actually open at the end of the flow.
  const [isOpen, setIsOpen] = useState(false);
  useAnimatedReaction(
    () => isActionTrayOpened.get(),
    (next, prev) => {
      if (next !== prev) {
        scheduleOnRN(setIsOpen, next);
      }
    },
  );

  const close = useCallback(() => {
    ref.current?.close();
    isActionTrayOpened.set(false);
    setStep(0);
  }, [isActionTrayOpened]);

  const toggleActionTray = useCallback(() => {
    const isActive = ref.current?.isActive() ?? false;
    isActionTrayOpened.set(!isActive);
    isActive ? close() : ref.current?.open();
  }, [close, isActionTrayOpened]);

  const rContentHeight = useDerivedValue(() => {
    return interpolate(step, [0, 1, 2], [80, 200, 250], Extrapolation.CLAMP);
  }, [step]);

  const rContentStyle = useAnimatedStyle(() => {
    return {
      height: withSpring(rContentHeight.get()),
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

  const rotate = useDerivedValue(() => {
    return withSpring(isActionTrayOpened.get() ? 45 : 0, {
      dampingRatio: 0.8,
      duration: 500,
    });
  }, [isActionTrayOpened]);

  const rToggleButtonStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          rotate: `${rotate.get()}deg`,
        },
      ],
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text testID="action-tray-status" style={styles.statusProbe}>
        {isOpen ? `tray-open-${step}` : 'tray-closed'}
      </Text>
      <PressableScale
        testID="action-tray-fab"
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
          <PressableScale
            onPress={close}
            style={styles.closeButton}
            hitSlop={8}>
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
              exiting={FadeOut}
              style={styles.contentText}>
              Content here
            </Animated.Text>
          )}
          {step === 1 && (
            <Animated.View
              layout={LinearTransition.easing(Easing.linear).duration(250)}
              entering={FadeIn}
              exiting={FadeOut}
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
              entering={FadeIn}
              exiting={FadeOut}
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
          testID="action-tray-continue"
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
    borderCurve: 'continuous',
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
  statusProbe: {
    fontSize: 1,
    left: 0,
    opacity: 0.012,
    position: 'absolute',
    top: 0,
    zIndex: 999,
  },
});

export { App as ActionTray };
