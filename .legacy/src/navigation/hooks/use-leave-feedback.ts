import { Alert, Linking } from 'react-native';

import { useCallback } from 'react';

export const useLeaveFeedback = ({ screenName }: { screenName: string }) => {
  const leaveFeedback = useCallback(() => {
    Alert.alert('Leave Feedback', 'Do you want to leave feedback?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'OK',
        onPress: () => {
          const title = screenName
            ? `Feedback on ${screenName} screen`
            : 'Reactiive Demos Feedback';
          Linking.openURL(
            `https://github.com/enzomanuelmangano/demos/issues/new?title=${encodeURIComponent(title)}`,
          );
        },
      },
    ]);
  }, [screenName]);

  return leaveFeedback;
};
