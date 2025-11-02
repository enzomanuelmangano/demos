import { Dimensions, StyleSheet, View } from 'react-native';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import type { SharedValue } from 'react-native-reanimated';

interface Position {
  x: number;
  y: number;
}

interface MagnetProps {
  position: Position;
  radius: number;
  color: string;
  objectPosition: SharedValue<Position>;
}

const { width, height } = Dimensions.get('window');

// This is just to be fancy
const createFibonacciPositions = (count: number): Position[] => {
  const positions: Position[] = [];
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  const scaleFactor = Math.min(width, height) * 0.0035;

  // Golden ratio constant
  const goldenRatio = 1.618033988749895;

  for (let i = 0; i < count; i++) {
    // Calculate the angle using the golden ratio
    const theta = i * goldenRatio * Math.PI * 2;

    // Calculate the radius using a Fibonacci-like growth
    const radius = scaleFactor * Math.sqrt(i);

    // Convert polar coordinates to Cartesian coordinates
    const x = centerX + radius * Math.cos(theta) * 100;
    const y = centerY + radius * Math.sin(theta) * 100;

    // Ensure points stay within screen bounds
    const boundedX = Math.max(50, Math.min(width - 50, x));
    const boundedY = Math.max(50, Math.min(height - 50, y));

    positions.push({ x: boundedX, y: boundedY });
  }

  // Add a central point
  positions.push({ x: centerX, y: centerY });

  return positions;
};

const DEFAULT_MAGNETS: Position[] = createFibonacciPositions(8);

const MAGNET_RADIUS = 10;
const MAGNET_COLOR = '#c1c1c1'; // Aluminum
const MAGNET_ACTIVE_COLOR = {
  spring: MAGNET_COLOR,
};
const MAIN_MAGNET_COLOR = '#3b3b3b'; // Graphite steel
const CHEESE_RADIUS = 25;
const SPRING_CONFIG = {
  mass: 0.4,
  damping: 15, // Added damping for more metallic "bounce" feel
  stiffness: 120, // Added stiffness for metallic rigidity
};

const getDistance = (position: Position, position2: Position) => {
  'worklet';
  return Math.sqrt(
    (position.x - position2.x) ** 2 + (position.y - position2.y) ** 2,
  );
};

const useMagnetDrag = (initialPosition: Position, magnets: Position[]) => {
  const positionX = useSharedValue(initialPosition.x);
  const positionY = useSharedValue(initialPosition.y);
  const isActive = useSharedValue(false);
  const context = useSharedValue<Position>({ x: 0, y: 0 });
  const position = useDerivedValue(() => ({
    x: positionX.value,
    y: positionY.value,
  }));

  const getNearestMagnet = (currentPosition: Position): Position => {
    'worklet';

    if (magnets.length === 0) {
      return currentPosition;
    }

    const [firstMagnet] = magnets;
    let nearestMagnet = firstMagnet;
    let shortestDistance = getDistance(currentPosition, firstMagnet);

    for (let i = 1; i < magnets.length; i++) {
      const distance = getDistance(currentPosition, magnets[i]);
      if (distance < shortestDistance) {
        shortestDistance = distance;
        nearestMagnet = magnets[i];
      }
    }

    return nearestMagnet;
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: positionX.value },
      { translateY: positionY.value },
      {
        scale: withSpring(isActive.value ? 1.2 : 1, {
          mass: 0.5,
          damping: 10,
          stiffness: 100,
        }),
      },
    ],
  }));

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      isActive.value = true;
      context.value = {
        x: positionX.value,
        y: positionY.value,
      };
    })
    .onUpdate(event => {
      positionX.value = context.value.x + event.translationX;
      positionY.value = context.value.y + event.translationY;
    })
    .onEnd(({ velocityX, velocityY }) => {
      const nearestMagnetPosition = getNearestMagnet({
        x: positionX.value,
        y: positionY.value,
      });
      positionX.value = withSpring(nearestMagnetPosition.x, {
        velocity: velocityX,
        ...SPRING_CONFIG,
      });
      positionY.value = withSpring(nearestMagnetPosition.y, {
        velocity: velocityY,
        ...SPRING_CONFIG,
      });
    })
    .onFinalize(() => {
      isActive.value = false;
    });

  return {
    animatedStyle,
    panGesture,
    position,
  };
};

const Magnet: React.FC<MagnetProps> = ({
  position,
  radius,
  color,
  objectPosition,
}) => {
  const rAnimatedStyle = useAnimatedStyle(() => {
    const distance = getDistance(objectPosition.value, position);
    const scale = interpolate(
      distance,
      [0, CHEESE_RADIUS * 2],
      [3, 1],
      Extrapolation.CLAMP,
    );
    const bgColor = interpolateColor(
      scale,
      [1, 3],
      [color, MAGNET_ACTIVE_COLOR.spring],
    );

    return {
      backgroundColor: bgColor,
      transform: [{ scale }],
    };
  }, [objectPosition, position]);

  return (
    <Animated.View
      style={[
        styles.magnet,
        {
          width: radius * 2,
          height: radius * 2,
          backgroundColor: color,
          borderRadius: radius,
          left: position.x - radius,
          top: position.y - radius,
          boxShadow: '0px 0px 20px rgba(0, 0, 0, 0.1)',
          borderCurve: 'continuous',
        },
        rAnimatedStyle,
      ]}
    />
  );
};

type MagnetsProps = {
  magnets?: Position[];
  initialPosition?: Position;
  magnetRadius?: number;
  magnetColor?: string;
  objectRadius?: number;
  objectColor?: string;
};

export const Magnets: React.FC<MagnetsProps> = ({
  magnets = DEFAULT_MAGNETS,
  initialPosition = magnets[0] || { x: width / 2, y: height / 2 },
  magnetRadius = MAGNET_RADIUS,
  magnetColor = MAGNET_COLOR,
  objectRadius = CHEESE_RADIUS,
  objectColor = MAIN_MAGNET_COLOR,
}) => {
  const { animatedStyle, panGesture, position } = useMagnetDrag(
    initialPosition,
    magnets,
  );

  return (
    <View style={styles.container}>
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            styles.cheese,
            {
              width: objectRadius * 2,
              height: objectRadius * 2,
              borderRadius: objectRadius,
              backgroundColor: objectColor,
              left: -objectRadius,
              top: -objectRadius,
              borderCurve: 'continuous',
            },
            animatedStyle,
          ]}
        />
      </GestureDetector>
      {magnets.map((magnetPosition, index) => (
        <Magnet
          key={`magnet-${index}`}
          position={magnetPosition}
          radius={magnetRadius}
          color={magnetColor}
          objectPosition={position}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  cheese: {
    borderColor: '#888',
    boxShadow: '0px 2px 10px rgba(0, 0, 0, 0.2)',
    position: 'absolute',
    zIndex: 1000,
  },
  container: {
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    flex: 1,
    justifyContent: 'center',
  },
  magnet: {
    position: 'absolute',
  },
});
