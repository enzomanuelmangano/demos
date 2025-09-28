import type { ScreenNames } from '../constants/screen-names';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

type RootStackParamsList = {
  [ScreenNames.Home]: undefined;
  [ScreenNames.Details]: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    source: any; // :)
    heroTag: string;
  };
};

type RootStackNavigationProp<T extends keyof RootStackParamsList> =
  NativeStackScreenProps<RootStackParamsList, T>['navigation'];
type RootStackRouteProp<T extends keyof RootStackParamsList> =
  NativeStackScreenProps<RootStackParamsList, T>['route'];

type DetailsRouteProp = RootStackRouteProp<ScreenNames.Details>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MainStackNavigationProp = RootStackNavigationProp<any>;

export type { MainStackNavigationProp, DetailsRouteProp, RootStackParamsList };
