import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type {
  SkImage,
  SkRect,
} from '@shopify/react-native-skia/lib/typescript/src/skia/types';

type RootStackParamList = {
  ImageCropper: undefined;
  DetailCroppedImage: {
    image: SkImage;
    rect: SkRect;
  };
};

type DetailCroppedImageRouteProp = RouteProp<
  RootStackParamList,
  'DetailCroppedImage'
>;

type RootStackNavigationProp = NativeStackNavigationProp<RootStackParamList>;

export {
  DetailCroppedImageRouteProp,
  RootStackParamList,
  RootStackNavigationProp,
};
