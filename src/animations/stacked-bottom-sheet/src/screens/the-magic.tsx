import React from 'react';

import { Spiral } from '../../../spiral';

const MagicScreen: React.FC<{
  height: number;
  width: number;
}> = ({ height, width }) => {
  return <Spiral height={height} width={width} />;
};

export { MagicScreen };
