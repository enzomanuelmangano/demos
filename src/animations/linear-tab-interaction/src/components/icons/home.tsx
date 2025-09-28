import { Path, Svg } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';

export function Home(props: SvgProps) {
  return (
    <Svg {...props} width="24" height="24" viewBox="0 0 24 24" fill="none">
      <Path
        d="M12.8214 3.18994C12.3225 2.86344 11.6775 2.86345 11.1786 3.18994L3.67863 8.09803C3.25518 8.37514 3 8.84709 3 9.35316V19.5C3 20.3284 3.67157 21 4.5 21H9C9.27614 21 9.5 20.7761 9.5 20.5V17C9.5 15.6193 10.6193 14.5 12 14.5C13.3807 14.5 14.5 15.6193 14.5 17V20.5C14.5 20.7761 14.7239 21 15 21H19.5C20.3284 21 21 20.3284 21 19.5V9.35316C21 8.84709 20.7448 8.37514 20.3214 8.09803L12.8214 3.18994Z"
        fill="currentColor"
      />
    </Svg>
  );
}
