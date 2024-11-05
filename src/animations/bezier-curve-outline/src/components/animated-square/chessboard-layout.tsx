import { StyleSheet, View } from 'react-native';

type ChessboardLayoutProps = {
  blackColor: string;
  whiteColor: string;
};

export const ChessboardLayout = ({
  blackColor,
  whiteColor,
}: ChessboardLayoutProps) => {
  const rows = Array(8).fill(null);
  const squares = Array(8).fill(null);

  return (
    <View style={styles.chessboardContainer}>
      {rows.map((_, rowIndex) => (
        <View key={rowIndex} style={styles.chessboardRow}>
          {squares.map((__, colIndex) => (
            <View
              key={colIndex}
              style={[
                styles.chessboardSquare,
                {
                  backgroundColor:
                    (rowIndex + colIndex) % 2 === 0 ? whiteColor : blackColor,
                },
              ]}
            />
          ))}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  chessboardContainer: {
    flex: 1,
  },
  chessboardRow: {
    flex: 1,
    flexDirection: 'row',
  },
  chessboardSquare: {
    flex: 1,
  },
});
