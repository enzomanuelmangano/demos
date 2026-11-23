import { StyleSheet, View } from 'react-native';

import { useCallback } from 'react';

import { StackedCarousel } from './components/stacked-carousel';

// If you want to, you can use images, for visual purposes I preferred just white cards
// const sampleImages = [
//   {
//     uri: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop&crop=entropy&auto=format&q=80',
//   },
//   {
//     uri: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800&h=600&fit=crop&crop=entropy&auto=format&q=80',
//   },
//   {
//     uri: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&h=600&fit=crop&crop=entropy&auto=format&q=80',
//   },
// ];

const items = Array.from({ length: 20 }, () => ({
  uri: 'nothing, just white images but you can use whatever you want',
}));

const App = () => {
  const renderCard = useCallback(
    (_: { uri: string }) => <View style={styles.fill} />,
    [],
  );

  return (
    <View style={styles.container}>
      <StackedCarousel
        data={items}
        renderCard={renderCard}
        cardWidth={320}
        cardHeight={200}
        stackOffset={12}
        style={styles.carousel}
        showPaginator
        paginatorVisibleDots={3}
        paginatorDotSize={10}
        paginatorSpacing={10}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  carousel: {
    backgroundColor: 'transparent',
  },
  container: {
    alignItems: 'center',
    backgroundColor: '#eeeeee',
    flex: 1,
    justifyContent: 'center',
  },
  fill: {
    flex: 1,
  },
});

export { App as StackedCarousel };
