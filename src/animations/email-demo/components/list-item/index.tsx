import { Text, View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';

import type { INITIAL_ITEMS } from '../../constants';

type ListItemProps = {
  itemHeight: number;
  item: (typeof INITIAL_ITEMS)[number];
};

// Nothing too fancy here, just a simple ListItem component

export const ListItem: React.FC<ListItemProps> = ({ item, itemHeight }) => {
  return (
    <View style={styles.container}>
      <View style={styles.fillCenter}>
        <Image
          contentFit="cover"
          source={
            item.image ?? {
              uri: item.imageUrl,
            }
          }
          style={{
            width: itemHeight * 0.6,
            height: itemHeight * 0.6,
            borderRadius: 100,
          }}
        />
      </View>
      <View style={styles.labelsContainer}>
        <Text
          numberOfLines={2}
          style={{
            fontWeight: '500',
          }}>
          {item.title}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: 'rgba(0,0,0,0.7)',
            marginTop: 5,
          }}>
          {item.subtitle}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  fillCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  labelsContainer: {
    flex: 3,
    justifyContent: 'center',
    marginRight: 40,
  },
});
