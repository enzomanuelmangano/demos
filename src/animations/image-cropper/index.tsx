import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';

import { ImageCropperScreen } from './screens/image-cropper';
import { DetailImageScreen } from './screens/detail-image';
import type { RootStackParamList } from './navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

const ImageCropper = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          presentation: 'modal',
          contentStyle: {
            backgroundColor: '#000',
          },
        }}
        initialRouteName="ImageCropper">
        <Stack.Screen name="ImageCropper" component={ImageCropperScreen} />
        <Stack.Screen name="DetailCroppedImage" component={DetailImageScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export { ImageCropper };
