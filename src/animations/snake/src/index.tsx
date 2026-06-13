import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useRef, useState } from 'react';

import * as Haptics from 'expo-haptics';
import { PressableScale } from 'pressto';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { AnimatedCount } from './components/animated-count/animated-count';
import { SnakeBoard } from './snake-game';

import type { SnakeBoardRef } from './snake-game';

const App = () => {
  const snakeGameRef = useRef<SnakeBoardRef>(null);
  const { width: windowWidth } = useWindowDimensions();

  const boardSize = Math.floor((windowWidth * 0.7) / 10) * 10;

  const score = useSharedValue(20);

  const isGameOver = useSharedValue(false);

  // e2e outcome probe: flips to "moved" once the snake heading actually changes
  // in response to a fling, so a test can verify the gesture steered the snake
  // (the board renders in Skia and is otherwise un-inspectable).
  const [status, setStatus] = useState<'idle' | 'moved'>('idle');

  const rRestartButtonViewStyle = useAnimatedStyle(() => {
    return {
      opacity: withTiming(isGameOver.get() ? 1 : 0, {
        duration: 250,
      }),
      pointerEvents: isGameOver.get() ? 'auto' : 'none',
    };
  }, [isGameOver]);

  return (
    <View style={styles.container}>
      <Text testID="snake-status" style={styles.statusProbe}>
        {status}
      </Text>
      <View style={styles.boardContainer}>
        <View style={styles.statsContainer}>
          <Text style={styles.scoreText}>Score</Text>
          <AnimatedCount
            count={score}
            maxDigits={3}
            fontSize={24}
            textDigitHeight={30}
            textDigitWidth={21}
          />
        </View>

        <View
          testID="snake-board"
          style={{
            position: 'relative',
            width: boardSize,
            height: boardSize,
          }}>
          <SnakeBoard
            n={10}
            boardSize={boardSize}
            ref={snakeGameRef}
            onScoreChange={newScore => {
              score.set(newScore);
            }}
            onGameOver={() => {
              isGameOver.set(true);
            }}
            onDirectionChange={() => {
              setStatus('moved');
              Haptics.selectionAsync();
            }}
          />
          <Animated.View
            style={[
              {
                position: 'absolute',
                zIndex: 100,
                width: '100%',
                height: '100%',
                justifyContent: 'center',
                alignItems: 'center',
              },
              rRestartButtonViewStyle,
            ]}>
            <PressableScale
              style={{
                backgroundColor: 'black',
                padding: 10,
                borderRadius: 10,
                paddingHorizontal: 20,
                borderCurve: 'continuous',
              }}
              onPress={() => {
                isGameOver.set(false);
                snakeGameRef.current?.restart();
              }}>
              <Text style={{ color: 'white', fontSize: 16, fontWeight: '500' }}>
                Life goes on...
              </Text>
            </PressableScale>
          </Animated.View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  boardContainer: {
    alignItems: 'center',
    backgroundColor: 'white',
    borderCurve: 'continuous',
    borderRadius: 18,
    boxShadow: '0px 2px 10px rgba(92, 92, 92, 0.2)',
    justifyContent: 'center',
    padding: 10,
  },
  container: {
    alignItems: 'center',
    backgroundColor: '#fff',
    flex: 1,
    justifyContent: 'center',
  },
  scoreText: {
    color: 'gray',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statsContainer: { alignItems: 'center', marginBottom: 8 },
  statusProbe: {
    position: 'absolute',
    top: 0,
    left: 0,
    fontSize: 1,
    opacity: 0.012,
  },
});

export { App };
