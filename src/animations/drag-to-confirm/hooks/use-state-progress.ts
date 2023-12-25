import {
  runTiming,
  SkiaMutableValue,
  useComputedValue,
  useValue,
} from '@shopify/react-native-skia';
import { ConfirmButtonState } from '../typings';

const animationConfig = {
  duration: 300,
};

const useStateProgress = (state: SkiaMutableValue<ConfirmButtonState>) => {
  const idleProgress = useValue(
    state.current === ConfirmButtonState.Idle ? 1 : 0
  );
  const confirmingProgress = useValue(
    state.current === ConfirmButtonState.Confirming ? 1 : 0
  );
  const confirmedProgress = useValue(
    state.current === ConfirmButtonState.Confirmed ? 1 : 0
  );

  useComputedValue(() => {
    runTiming(
      idleProgress,
      state.current === ConfirmButtonState.Idle ? 1 : 0,
      animationConfig
    );
    runTiming(
      confirmingProgress,
      state.current === ConfirmButtonState.Confirming ? 1 : 0,
      animationConfig
    );
    runTiming(
      confirmedProgress,
      state.current === ConfirmButtonState.Confirmed ? 1 : 0,
      animationConfig
    );
  }, [state]);

  useComputedValue(() => {
    if (state.current === ConfirmButtonState.Confirmed) {
      setTimeout(() => {
        state.current = ConfirmButtonState.Idle;
      }, 1000);
    }
  }, [state]);

  return {
    idleProgress,
    confirmingProgress,
    confirmedProgress,
  };
};

export { useStateProgress };
