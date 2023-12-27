import { Image } from 'expo-image';
import { ScrollView, View, useWindowDimensions } from 'react-native';

const images = [
  require('../../../../../assets/animations/blurred-bottom-bar/01.jpg'),
  require('../../../../../assets/animations/blurred-bottom-bar/02.jpg'),
  require('../../../../../assets/animations/blurred-bottom-bar/03.jpg'),
];

export const ScrollableImages = () => {
  const { width, height } = useWindowDimensions();

  return (
    <ScrollView
      pagingEnabled
      decelerationRate={'fast'}
      style={{ backgroundColor: 'black', width, height }}>
      {images.map((item, i) => {
        return (
          <View
            key={i}
            style={{
              backgroundColor: `rgba(0, 0, 255, 0.${i + 2})`,
              height,
              width,
            }}>
            <Image
              contentFit="cover"
              source={item}
              style={{
                width,
                height,
              }}
            />
          </View>
        );
      })}
    </ScrollView>
  );
};
