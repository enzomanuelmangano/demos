import { StyleSheet, View } from 'react-native';

import { useCallback, useState } from 'react';

import { OnlineToOffline } from './components/online-to-offline';

const InitialItems = [
  {
    uri: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop',
    isOffline: false,
  },
  {
    uri: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop',
    isOffline: false,
  },
  {
    uri: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&h=400&fit=crop',
    isOffline: false,
  },
  {
    uri: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=400&fit=crop',
    isOffline: false,
  },
  {
    uri: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop',
    isOffline: true,
  },
  {
    uri: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop',
    isOffline: true,
  },
  {
    uri: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=400&fit=crop',
    isOffline: true,
  },
];

export const OnlineOffline = () => {
  const [items, setItems] = useState(InitialItems);

  const onlineItems = items.filter(item => !item.isOffline);
  const offlineItems = items.filter(item => item.isOffline);

  const handleTouchEnd = useCallback(() => {
    setItems(prevItems => {
      const onlineCount = prevItems.filter(item => !item.isOffline).length;
      const offlineCount = prevItems.filter(item => item.isOffline).length;

      if (onlineCount === 0 || offlineCount === 0) return prevItems;

      const moveOnlineToOffline = Math.random() > 0.5;

      if (moveOnlineToOffline && onlineCount > 0) {
        const onlineIndices = prevItems
          .map((item, index) => ({ item, index }))
          .filter(({ item }) => !item.isOffline)
          .map(({ index }) => index);

        const randomIndex =
          onlineIndices[Math.floor(Math.random() * onlineIndices.length)];
        const itemToMove = { ...prevItems[randomIndex], isOffline: true };

        const newItems = [
          ...prevItems.slice(0, randomIndex),
          ...prevItems.slice(randomIndex + 1),
          itemToMove,
        ];

        return newItems;
      } else if (!moveOnlineToOffline && offlineCount > 0) {
        const offlineIndices = prevItems
          .map((item, index) => ({ item, index }))
          .filter(({ item }) => item.isOffline)
          .map(({ index }) => index);

        const randomIndex =
          offlineIndices[Math.floor(Math.random() * offlineIndices.length)];
        const itemToMove = { ...prevItems[randomIndex], isOffline: false };

        const itemsWithoutMoved = [
          ...prevItems.slice(0, randomIndex),
          ...prevItems.slice(randomIndex + 1),
        ];

        let insertPosition = 0;
        for (let i = itemsWithoutMoved.length - 1; i >= 0; i--) {
          if (!itemsWithoutMoved[i].isOffline) {
            insertPosition = i + 1;
            break;
          }
        }

        const newItems = [
          ...itemsWithoutMoved.slice(0, insertPosition),
          itemToMove,
          ...itemsWithoutMoved.slice(insertPosition),
        ];

        return newItems;
      }

      return prevItems;
    });
  }, []);

  return (
    <View style={styles.container} onTouchEnd={handleTouchEnd}>
      <OnlineToOffline
        offline={offlineItems.map(item => item.uri)}
        online={onlineItems.map(item => item.uri)}
        itemSize={40}
        gap={3.5}
        listPadding={2}
        listColor="#EAEAEA"
        sectionGap={12}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#fff',
    flex: 1,
    justifyContent: 'center',
  },
});
