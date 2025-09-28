import { Path, Svg } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';

export function Menu(props: SvgProps) {
  return (
    <Svg {...props} width="24" height="24" viewBox="0 0 24 24" fill="none">
      <Path
        d="M3.5 10.5C2.67157 10.5 2 11.1716 2 12C2 12.8284 2.67157 13.5 3.5 13.5C4.32843 13.5 5 12.8284 5 12C5 11.1716 4.32843 10.5 3.5 10.5Z"
        fill="currentColor"
      />
      <Path
        d="M12 10.5C11.1716 10.5 10.5 11.1716 10.5 12C10.5 12.8284 11.1716 13.5 12 13.5C12.8284 13.5 13.5 12.8284 13.5 12C13.5 11.1716 12.8284 10.5 12 10.5Z"
        fill="currentColor"
      />
      <Path
        d="M20.5 10.5C19.6716 10.5 19 11.1716 19 12C19 12.8284 19.6716 13.5 20.5 13.5C21.3284 13.5 22 12.8284 22 12C22 11.1716 21.3284 10.5 20.5 10.5Z"
        fill="currentColor"
      />
    </Svg>
  );
}
