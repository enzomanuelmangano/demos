import React from 'react';

import { data } from './constants/data';
import { DynamicTabIndicator } from './components/dynamic-tab-indicator';

const DynamicTabIndicatorContainer = () => {
  return <DynamicTabIndicator data={data} />;
};

export { DynamicTabIndicatorContainer };
