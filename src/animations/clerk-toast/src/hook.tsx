import { useCallback, useMemo, useRef } from 'react';
import { Octicons } from '@expo/vector-icons';
import { PressableScale } from 'pressto';

import type { ShowToastParams } from './hooks/use-toast';
import { useToast } from './hooks/use-toast';
import { useStackedToast } from './stacked-toast-manager/hooks';

export const useDemoStackedToast = () => {
  const { showToast } = useToast();
  const toastIndex = useRef(0);

  const { clearAllStackedToasts } = useStackedToast();
  const toasts: ShowToastParams[] = useMemo(
    () => [
      {
        title: 'This is a Custom Toast message',
        iconName: 'archive',
      },
      {
        title: 'Strongly inspired by Emil Kowalski',
        iconName: 'star',
      },
      {
        title: 'It works with React Native and Expo!',
        iconName: 'rocket',
      },
      {
        title: 'Can you guess the main library used here?',
        iconName: 'question',
      },
      {
        title: 'Reanimated - of course!',
        iconName: 'heart',
      },
      {
        title: 'Wait! Too many Toasts here!',
        iconName: 'alert',
      },
      {
        title: "Let's swipe them away!",
        iconName: 'arrow-left',
      },
      {
        title: "Actually, let's clear quickly everything",
        iconName: 'trash',
        trailing: (
          <PressableScale
            onPress={clearAllStackedToasts}
            style={{
              marginRight: 6,
            }}>
            <Octicons name="x" size={16} color="#fff" />
          </PressableScale>
        ),
      },
      {
        title: 'What about the source code?',
        iconName: 'code',
      },
      {
        title: 'You can find it at patreon.com/reactiive',
        iconName: 'package',
      },
      {
        title: "You're still here?",
        iconName: 'smiley',
      },
      {
        title: 'Ok, last one!',
        iconName: 'check',
      },
      {
        title: 'Thanks for watching!',
        iconName: 'thumbsup',
      },
    ],
    [clearAllStackedToasts],
  );

  const onPress = useCallback(() => {
    // This is how you can show a toast easily
    // showToast({
    //   title: 'This is a Custom Toast message',
    //   iconName: 'archive',
    //   // optional - trailing: <></>
    // })
    showToast(toasts[toastIndex.current++ % toasts.length]);
  }, [showToast, toasts]);

  return {
    onPress,
  };
};
