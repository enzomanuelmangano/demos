import React, { useState, useCallback } from 'react';
import { useDerivedValue } from 'react-native-reanimated';

import { DraggableControlPanel } from '../draggable-panel';

import { PanelContent } from './panel-content';
import { springAnimationConfigs } from './utils/spring-configs';
import { CollapsedButton } from './collapsed-button';

type SpringType = 'elegant' | 'springy' | 'super-springy';

export const SpringAnimationPanel = () => {
  const [springType, setSpringType] = useState<SpringType>('elegant');

  const springConfig = useDerivedValue(() => {
    return springAnimationConfigs[springType];
  }, [springType]);

  const selectSpringType = useCallback((type: SpringType) => {
    setSpringType(type);
  }, []);

  const collapsedChildren = useCallback(
    (toggleCollapse: () => void) => (
      <CollapsedButton onPress={toggleCollapse} />
    ),
    [],
  );

  const expandedChildren = useCallback(
    (toggleCollapse: () => void) => (
      <PanelContent
        springType={springType}
        springConfig={springConfig}
        onToggleCollapse={toggleCollapse}
        onSelectSpringType={selectSpringType}
      />
    ),
    [springType, springConfig, selectSpringType],
  );

  return (
    <DraggableControlPanel
      springConfig={springConfig}
      collapsedChildren={collapsedChildren}
      expandedChildren={expandedChildren}
    />
  );
};
