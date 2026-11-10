// The threads-holo-ticket back side's QR code as react-native-qrcode-skia 0.3.1 builds it:
// generateMatrix (qrcode 1.5.4's QRCode.create(value, { errorCorrectionLevel: 'H' }), the
// component's default level) for BackSide's value. It prints the module rows that
// gpu/src/threads_holo_ticket.rs embeds as QR_ROWS ('#' dark, '.' light).
//
//   bun exact/parity-tools/threads-holo-qr.ts
import QRCode from '../../node_modules/qrcode/lib/index.js';

const value = 'https://reactiive.io/demos';
const qr = QRCode.create(value, { errorCorrectionLevel: 'H' });
const n = qr.modules.size;
const rows: string[] = [];
for (let i = 0; i < n; i++) {
  let row = '';
  for (let j = 0; j < n; j++) row += qr.modules.data[i * n + j] ? '#' : '.';
  rows.push(row);
}
console.log(`version ${qr.version}, ${n} modules, mask ${qr.maskPattern}`);
for (const r of rows) console.log(`    "${r}",`);
