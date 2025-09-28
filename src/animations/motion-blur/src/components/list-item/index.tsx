import { StyleSheet, Text, View } from 'react-native';

import type { Item } from '../../utils/generate-random-item';

const EmojiCircle: React.FC<{ emoji: string }> = ({ emoji }) => (
  <View style={styles.emojiCircle}>
    <Text style={styles.emoji}>{emoji}</Text>
  </View>
);

const ItemDetails: React.FC<{ amount: string; address: string }> = ({
  amount,
  address,
}) => (
  <View style={styles.detailsContainer}>
    <Text style={styles.amount}>{amount}</Text>
    <Text style={styles.address}>{address}</Text>
  </View>
);

export const ListItem: React.FC<{ item: Item }> = ({ item }) => (
  <View style={styles.listItem}>
    <EmojiCircle emoji={item.emoji} />
    <ItemDetails amount={item.amount} address={item.address} />
  </View>
);

const styles = StyleSheet.create({
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
  },
  emojiCircle: {
    height: 60,
    aspectRatio: 1,
    borderRadius: 30,
    backgroundColor: '#F4F4F4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emoji: {
    fontSize: 25,
  },
  detailsContainer: {
    flex: 1,
    marginLeft: 10,
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: 22,
    color: 'black',
    fontWeight: 'bold',
    letterSpacing: 1,
    fontFamily: 'Honk-Bold',
  },
  address: {
    fontSize: 14,
    color: 'black',
    opacity: 0.3,
    fontFamily: 'Honk-Regular',
    marginTop: 5,
  },
});
