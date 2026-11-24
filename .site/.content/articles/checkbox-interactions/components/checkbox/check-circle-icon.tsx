import localFont from 'next/font/local';

/**
 * `<AntDesign name="check-circle" />` di @expo/vector-icons: un carattere
 * dell'icon-font AntDesign, reso come testo (18px, line-height normal).
 * Il woff2 contiene solo quel glifo (608 byte), estratto dal font originale:
 * forma, dimensione e posizione sono quelle di reactiive.io.
 */
const antDesign = localFont({
  src: './antdesign-check-circle.woff2',
  display: 'block',
  preload: false,
});

export const CheckCircleIcon = ({
  size = 18,
  color,
}: {
  size?: number;
  color: string;
}) => (
  <div
    aria-hidden="true"
    className={antDesign.className}
    style={{
      fontSize: size,
      lineHeight: 'normal',
      color,
      fontStyle: 'normal',
      fontWeight: 'normal',
      userSelect: 'none',
    }}
  >
    {''}
  </div>
);
