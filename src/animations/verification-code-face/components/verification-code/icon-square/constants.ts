const MOUTH_HEIGHT = 20;
const MOUTH_WIDTH = 25;
const EYEBROW_HEIGHT = 5;
const EYEBROW_WIDTH = 15;

type PathParams = {
  height: number;
  width: number;
};

const createPath = (
  type: 'Happy' | 'Sad' | 'Normal',
  { height, width }: PathParams,
) => {
  switch (type) {
    case 'Happy':
      return `M0 ${height / 2} Q${width / 2} ${height} ${width} ${height / 2}`;
    case 'Sad':
      return `M0 ${height / 2} Q${width / 2} 0 ${width} ${height / 2}`;
    case 'Normal':
      return `M0 ${height / 2} Q${width / 2} ${height / 2} ${width} ${
        height / 2
      }`;
  }
};

export const DefaultMouthPaths = {
  Happy: createPath('Happy', { height: MOUTH_HEIGHT, width: MOUTH_WIDTH }),
  Sad: createPath('Sad', { height: MOUTH_HEIGHT, width: MOUTH_WIDTH }),
  Normal: createPath('Normal', { height: MOUTH_HEIGHT, width: MOUTH_WIDTH }),
};

export const DefaultEyebrowPaths = {
  // Switching the order of the paths to make the animation look smoother
  Happy: createPath('Sad', { height: EYEBROW_HEIGHT, width: EYEBROW_WIDTH }),
  Sad: createPath('Happy', { height: EYEBROW_HEIGHT, width: EYEBROW_WIDTH }),
  Normal: createPath('Normal', {
    height: EYEBROW_HEIGHT,
    width: EYEBROW_WIDTH,
  }),
};
