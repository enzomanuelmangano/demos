import {
  ActivityIndicator,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import { useCallback, useRef } from 'react';

import { useNavigation } from '@react-navigation/native';
import { useImage } from '@shopify/react-native-skia';

import { FancyBorderButton } from '../components/border-button';
import { ImageCropper } from '../components/image-cropper';

import type { ImageCropperRef } from '../components/image-cropper';
import type { RootStackNavigationProp } from '../navigation';

const ImageCropperScreen = () => {
  // I'm using the useImage hook to load the image.
  // I've used a random image from unsplash (well, not so random 🙄).
  const image = useImage(
    'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2706&q=80',
  );

  const { width } = useWindowDimensions();
  const imageCropperRef = useRef<ImageCropperRef>(null);

  const { navigate } = useNavigation<RootStackNavigationProp>();

  const onCrop = useCallback(() => {
    // The getGridRect method is used to get the grid's rect when the user
    const rect = imageCropperRef.current?.getGridRect();
    if (!rect || !image) {
      return;
    }
    // I'm using the navigation to navigate to the DetailCroppedImage screen.
    // I'm passing the rect and the image as params.
    // The image component will use the rect to crop the image.
    navigate('DetailCroppedImage', { rect, image });
  }, [image, navigate]);

  return (
    <View style={styles.container}>
      {image ? (
        <>
          <ImageCropper ref={imageCropperRef} image={image} width={width} />
          <View style={styles.buttonsContainer}>
            <FancyBorderButton
              onPress={() => {
                imageCropperRef.current?.expand();
              }}
              title="Expand"
            />
            <FancyBorderButton
              onPress={() => {
                imageCropperRef.current?.collapse();
              }}
              title="Collapse"
            />
            <FancyBorderButton onPress={onCrop} title="Crop" />
          </View>
        </>
      ) : (
        // I'm using the ActivityIndicator component to show a loading indicator
        // while the image is being loaded, since it's done asynchronously.
        <ActivityIndicator />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  buttonsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-evenly',
    marginHorizontal: 10,
    marginTop: 20,
    width: '100%',
  },
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
});

export { ImageCropperScreen };
