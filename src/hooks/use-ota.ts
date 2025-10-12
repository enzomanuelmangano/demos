import { Alert, AppState } from 'react-native';

import { useCallback, useEffect, useRef } from 'react';

import * as Updates from 'expo-updates';

import type { AppStateStatus } from 'react-native';

/**
 * Hook to automatically check for and prompt users to install OTA updates.
 * Checks when the app mounts and when it returns to the foreground.
 * Only runs in production builds (disabled in development).
 */
export const useOta = () => {
  const appStateRef = useRef(AppState.currentState);
  const isCheckingRef = useRef(false);

  const checkForUpdate = useCallback(async () => {
    if (__DEV__) {
      return;
    }

    if (isCheckingRef.current) {
      return;
    }

    try {
      isCheckingRef.current = true;

      const update = await Updates.checkForUpdateAsync();

      if (!update.isAvailable) {
        return;
      }

      await Updates.fetchUpdateAsync();

      Alert.alert(
        'Update Available',
        'A new version is available. The app will reload to apply the update.',
        [
          {
            text: 'Refresh',
            style: 'default',
            onPress: async () => {
              try {
                await Updates.reloadAsync();
              } catch {
                Alert.alert(
                  'Reload Error',
                  'There was an error reloading the app. Please restart manually.',
                );
              }
            },
          },
        ],
        { cancelable: false },
      );
    } catch (error) {
      console.error('Error checking for updates:', error);
    } finally {
      isCheckingRef.current = false;
    }
  }, []);

  useEffect(() => {
    checkForUpdate();

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      const isReturningToForeground =
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active';

      if (isReturningToForeground) {
        checkForUpdate();
      }

      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );

    return () => {
      subscription.remove();
    };
  }, [checkForUpdate]);
};
