// Evaluated first (parity.ts imports it before the demo's modules): the window constants.ts
// reads through Dimensions.get('window') at module load (an iPhone Air: 420 x 912).
(globalThis as any).__WINDOW = { width: 420, height: 912 };
export {};
