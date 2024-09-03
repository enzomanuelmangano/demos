import React from 'react';

import { Spiral } from '../../../spiral';

// You can find all the explanation about this component in this article:
// https://www.reactiive.io/patreon/animated-spiral?accessCode=log-spiral

const MagicScreen: React.FC<{
  height: number;
  width: number;
}> = ({ height, width }) => {
  return <Spiral height={height} width={width} />;
};

export { MagicScreen };
