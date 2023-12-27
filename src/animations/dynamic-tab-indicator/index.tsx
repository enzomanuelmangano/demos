import { StatusBar } from 'expo-status-bar';
import React from 'react';

import { data } from './constants/data';
import { DynamicTabIndicator } from './components/dynamic-tab-indicator';

const DynamicTabIndicatorContainer = () => {
  return (
    <>
      <StatusBar style="auto" />
      <DynamicTabIndicator data={data} />
    </>
  );
};

export { DynamicTabIndicatorContainer };
