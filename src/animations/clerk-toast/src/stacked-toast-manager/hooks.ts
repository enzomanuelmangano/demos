import { useContext, useMemo } from 'react';

import { MAX_VISIBLE_TOASTS, TOAST_HEIGHT } from './constants';
import { InternalStackedToastContext, StackedToastContext } from './context';

export const useStackedToast = () => {
  return useContext(StackedToastContext);
};

export const useInternalStackedToast = (key: string) => {
  const { stackedToasts } = useContext(InternalStackedToastContext);

  const id = useMemo(() => {
    return stackedToasts.find(item => item.key === key)?.id;
  }, [key, stackedToasts]);

  const bottomHeight = useMemo(() => {
    const offset = 15;

    return Math.min(id ?? 0, MAX_VISIBLE_TOASTS - 1) * (TOAST_HEIGHT + offset);
  }, [id]);

  return { id: id ?? 0, bottomHeight };
};
