import { useCallback, useEffect, useRef } from 'react';

import * as QuickActions from 'expo-quick-actions';

import { useRetray } from '../../packages/retray';

import type { Trays } from '../../trays';

export const useQuickActions = () => {
  const { show } = useRetray<Trays>();
  const hasHandledInitialAction = useRef(false);

  const handleQuickAction = useCallback(
    (action: { id?: string }) => {
      if (action.id === '1') {
        show('help');
      }
    },
    [show],
  );

  useEffect(() => {
    const initialAction = QuickActions.initial;
    if (initialAction && !hasHandledInitialAction.current) {
      hasHandledInitialAction.current = true;
      handleQuickAction(initialAction);
    }

    const subscription = QuickActions.addListener(handleQuickAction);

    return () => {
      subscription.remove();
    };
  }, [handleQuickAction]);
};
