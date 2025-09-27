import { PressableScale } from 'pressto';
import { useRef } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { AnimatedCount } from './components/animated-count/animated-count';
import type { SnakeBoardRef } from './snake-game';
import { SnakeBoard } from './snake-game';

const App = () => {
  const snakeGameRef = useRef<SnakeBoardRef>(null);
  const { width: windowWidth } = useWindowDimensions();

  const boardSize = Math.floor((windowWidth * 0.7) / 10) * 10;

  const score = useSharedValue(20);

  const isGameOver = useSharedValue(false);

  const rRestartButtonViewStyle = useAnimatedStyle(() => {
    return {
      opacity: withTiming(isGameOver.value ? 1 : 0, {
        duration: 250,
      }),
      pointerEvents: isGameOver.value ? 'auto' : 'none',
    };
  }, [isGameOver]);

  return (
    <View style={styles.container}>
      <View style={styles.boardContainer}>
        <View style={styles.statsContainer}>
          <Text style={styles.scoreText}>Score</Text>
          <AnimatedCount
            count={score}
            maxDigits={3}
            fontSize={24}
            textDigitHeight={30}
            textDigitWidth={19}
          />
        </View>

        <View
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
              score.value = newScore;
            }}
            onGameOver={() => {
              isGameOver.value = true;
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
                isGameOver.value = false;
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
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardContainer: {
    padding: 10,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#5c5c5c',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
    backgroundColor: 'white',
    borderRadius: 18,
  },
  statsContainer: { marginBottom: 8, alignItems: 'center' },
  scoreText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'gray',
    marginBottom: 4,
  },
});

export { App };
