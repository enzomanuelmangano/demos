import React from 'react';

import { LockScreen } from './lock-screen';

const MobileInput = () => {
  return (
    <LockScreen
      correctPin="11111"
      onError={wrongPin => {
        console.log({ wrongPin });
      }}
      onClear={() => {
        console.log('onClear');
      }}
      onCompleted={() => {
        console.log('onCompleted');
      }}
    />
  );
};

export { MobileInput };
