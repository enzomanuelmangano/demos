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
      <View style={styles.avatarContainer}>
        <View style={styles.avatarWrapper}>
          <Image
            contentFit="cover"
            source={{
              uri: item.imageUrl,
            }}
            style={{
              width: itemHeight * 0.45,
              height: itemHeight * 0.45,
              borderRadius: itemHeight * 0.225,
            }}
          />
        </View>
      </View>
      <View style={styles.labelsContainer}>
        <Text numberOfLines={1} style={styles.titleText}>
          {item.title}
        </Text>
        <Text numberOfLines={2} style={styles.subtitleText}>
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
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  avatarContainer: {
    marginRight: 12,
  },
  avatarWrapper: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  labelsContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  titleText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  subtitleText: {
    fontSize: 15,
    color: '#6b7280',
    lineHeight: 20,
    letterSpacing: -0.1,
  },
});
