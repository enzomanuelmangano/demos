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
  address: {
    color: 'black',
    fontFamily: 'Honk-Regular',
    fontSize: 14,
    marginTop: 5,
    opacity: 0.3,
  },
  amount: {
    color: 'black',
    fontFamily: 'Honk-Bold',
    fontSize: 22,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  detailsContainer: {
    alignItems: 'flex-end',
    flex: 1,
    marginLeft: 10,
  },
  emoji: {
    fontSize: 25,
  },
  emojiCircle: {
    alignItems: 'center',
    aspectRatio: 1,
    backgroundColor: '#F4F4F4',
    borderRadius: 30,
    height: 60,
    justifyContent: 'center',
  },
  listItem: {
    alignItems: 'center',
    flexDirection: 'row',
    padding: 10,
  },
});
