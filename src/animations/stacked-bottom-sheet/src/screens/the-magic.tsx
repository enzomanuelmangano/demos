import { type FC } from 'react';

import { Spiral } from '../../../spiral';

const MagicScreen: FC<{
  height: number;
  width: number;
}> = ({ height, width }) => {
  return <Spiral height={height} width={width} />;
};

export { MagicScreen };
