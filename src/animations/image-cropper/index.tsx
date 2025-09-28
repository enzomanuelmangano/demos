import { Modal, StyleSheet, View, useWindowDimensions } from 'react-native';

import { useCallback, useRef, useState } from 'react';

import {
  Canvas,
  FitBox,
  Group,
  Image,
  rect as skRect,
  useImage,
} from '@shopify/react-native-skia';

import { FancyBorderButton } from './components/border-button';
import { ImageCropper as ImageCropperComponent } from './components/image-cropper';

import type { ImageCropperRef } from './components/image-cropper';

const ImageCropper = () => {
  const image = useImage(
    'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2706&q=80',
  );
  const { width } = useWindowDimensions();
  const cropperRef = useRef<ImageCropperRef>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [croppedRect, setCroppedRect] = useState<ReturnType<
    typeof skRect
  > | null>(null);

  const handleCrop = useCallback(() => {
    const rect = cropperRef.current?.getGridRect();
    if (!rect || !image) {
      return;
    }
    setCroppedRect(rect);
    setShowDetail(true);
  }, [image]);

  const handleBack = useCallback(() => {
    setShowDetail(false);
    setCroppedRect(null);
  }, []);

  if (!image) {
    return (
      <View style={styles.loadingContainer}>
        {/* Loading indicator would go here */}
      </View>
    );
  }

  const renderDetailModal = () => {
    if (!croppedRect) return null;

    const imageRatio = image.height() / image.width();
    const fullRect = skRect(0, 0, width, width * imageRatio);

    return (
      <View style={styles.detailContainer}>
        <Canvas
          style={{
            width: width,
            height: width * imageRatio,
          }}>
          <FitBox src={croppedRect} dst={fullRect}>
            <Group clip={croppedRect}>
              <Image image={image} rect={fullRect} fit="fill" />
            </Group>
          </FitBox>
        </Canvas>
        <View style={styles.backButtonContainer}>
          <FancyBorderButton onPress={handleBack} title="Back" />
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ImageCropperComponent
        ref={cropperRef}
        image={image}
        width={width}
        style={{ alignSelf: 'center' }}
      />
      <View style={styles.buttonsContainer}>
        <FancyBorderButton
          onPress={() => {
            cropperRef.current?.expand();
          }}
          title="Expand"
        />
        <FancyBorderButton
          onPress={() => {
            cropperRef.current?.collapse();
          }}
          title="Collapse"
        />
        <FancyBorderButton onPress={handleCrop} title="Crop" />
      </View>

      <Modal
        visible={showDetail}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={handleBack}>
        {renderDetailModal()}
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  backButtonContainer: {
    bottom: 100,
    position: 'absolute',
    right: 20,
  },
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
    backgroundColor: '#000',
    flex: 1,
    justifyContent: 'center',
  },
  detailContainer: {
    alignItems: 'center',
    backgroundColor: '#000',
    flex: 1,
    justifyContent: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    backgroundColor: '#000',
    flex: 1,
    justifyContent: 'center',
  },
});

export { ImageCropper };
