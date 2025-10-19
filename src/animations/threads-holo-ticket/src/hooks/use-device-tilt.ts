import {
  SensorType,
  useAnimatedSensor,
  useDerivedValue,
} from 'react-native-reanimated';

export const useDeviceTilt = () => {
  // Get device orientation from gyroscope sensor
  const animatedSensor = useAnimatedSensor(SensorType.ROTATION, {
    interval: 16, // ~60fps
  });

  // Raw pitch value (tilting forward/backward)
  const pitch = useDerivedValue(() => {
    return animatedSensor.sensor.value.pitch || 0;
  });

  // Raw roll value (tilting left/right)
  const roll = useDerivedValue(() => {
    return animatedSensor.sensor.value.roll || 0;
  });

  return {
    pitch,
    roll,
  };
};
