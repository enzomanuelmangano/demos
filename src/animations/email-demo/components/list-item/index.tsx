import { Text, View, StyleSheet } from 'react-native';

import { Image } from 'expo-image';

import type { INITIAL_ITEMS } from '../../constants';

type ListItemProps = {
  itemHeight: number;
  item: (typeof INITIAL_ITEMS)[number];
};

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
              // @@TODO: the image should support borderCurve
              // @ts-ignore
              borderCurve: 'continuous',
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
  avatarContainer: {
    marginRight: 12,
  },
  avatarWrapper: {
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  container: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  labelsContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  subtitleText: {
    color: '#6b7280',
    fontSize: 15,
    letterSpacing: -0.1,
    lineHeight: 20,
  },
  titleText: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.2,
    marginBottom: 4,
  },
});
