import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useRef } from 'react';

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
            onDirectionChange={() => {
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
  boardContainer: {
    alignItems: 'center',
    backgroundColor: 'white',
    borderCurve: 'continuous',
    borderRadius: 18,
    elevation: 5,
    justifyContent: 'center',
    padding: 10,
    shadowColor: '#5c5c5c',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
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
});

export { App };
