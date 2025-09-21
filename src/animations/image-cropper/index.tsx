import React, { useState, useCallback, useRef } from 'react';
import { View, Alert, useWindowDimensions } from 'react-native';
import { useImage } from '@shopify/react-native-skia';

import type { ImageCropperRef } from './components/image-cropper';
import { ImageCropper as ImageCropperComponent } from './components/image-cropper';
import { FancyBorderButton } from './components/border-button';

const ImageCropperScreen = ({
  onNavigateToDetail,
}: {
  onNavigateToDetail: () => void;
}) => {
  const image = useImage(
    'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2706&q=80',
  );
  const dimensions = useWindowDimensions();
  const cropperRef = useRef<ImageCropperRef>(null);

  const handleSave = useCallback(async () => {
    try {
      // Get the grid rect for cropping information
      const gridRect = cropperRef.current?.getGridRect();
      if (gridRect) {
        // In a real implementation, this would crop the image and return a URI
        onNavigateToDetail();
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to crop image');
    }
  }, [onNavigateToDetail]);

  if (!image) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#000',
        }}>
        {/* Loading indicator would go here */}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <ImageCropperComponent
        ref={cropperRef}
        image={image}
        width={dimensions.width}
      />
      <View style={{ position: 'absolute', bottom: 100, right: 20 }}>
        <FancyBorderButton onPress={handleSave} title="Save" />
      </View>
    </View>
  );
};

const DetailScreen = ({ onGoBack }: { onGoBack: () => void }) => {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
      }}>
      {/* Detail view would show the cropped image here */}
      <FancyBorderButton onPress={onGoBack} title="Back" />
    </View>
  );
};

const ImageCropper = () => {
  const [currentScreen, setCurrentScreen] = useState<'cropper' | 'detail'>(
    'cropper',
  );

  const navigateToDetail = () => {
    setCurrentScreen('detail');
  };

  const navigateBack = () => {
    setCurrentScreen('cropper');
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {currentScreen === 'cropper' ? (
        <ImageCropperScreen onNavigateToDetail={navigateToDetail} />
      ) : (
        <DetailScreen onGoBack={navigateBack} />
      )}
    </View>
  );
};

export { ImageCropper };
