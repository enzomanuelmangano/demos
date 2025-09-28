import { Path, Svg } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';

export function Inbox(props: SvgProps) {
  return (
    <Svg {...props} width="24" height="24" viewBox="0 0 24 24" fill="none">
      <Path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M4.97736 4.76709C5.24264 4.29339 5.74319 4 6.28612 4H17.7139C18.2568 4 18.7574 4.29339 19.0226 4.7671L22.8088 11.528C22.9342 11.7519 23 12.0043 23 12.2609V18.5C23 19.3284 22.3284 20 21.5 20H2.5C1.67157 20 1 19.3284 1 18.5V12.2609C1 12.0043 1.06585 11.7519 1.19124 11.528L4.97736 4.76709ZM22 13H16C15.8426 13 15.6944 13.0741 15.6 13.2L14.7 14.4C14.4167 14.7777 13.9721 15 13.5 15H10.5C10.0279 15 9.58328 14.7777 9.3 14.4L8.4 13.2C8.30557 13.0741 8.15738 13 8 13H2V18.5C2 18.7761 2.22386 19 2.5 19H21.5C21.7761 19 22 18.7761 22 18.5V13Z"
        fill="currentColor"
      />
    </Svg>
  );
}
