import { normalizeArray, pickNValuesFromDistribution } from './helpers';

const Palette = {
  primary: '#474069',
  body: '#D4D4D4',
  background: '#1D1B2B',
};

// In order to fully understand what is going on here,
// Read the comments in the following files:
// - src/helpers/generate-waveform.ts
// - src/helpers/pick-n-values-from-array.ts (!!!)
// - src/helpers/normalize-array.ts
// - src/helpers/convert-array-to-string.ts

const DURATION = 22.0;

// generateWaveform(44100, 440, DURATION) is a pure sine: 970k samples whose
// mean is 0 and standard deviation is 1/√2. Only those two numbers were used,
// so pass them directly instead of building (and reducing twice) the array at
// app launch (every demo module is evaluated at startup).
const SINE_MEAN = 0;
const SINE_STD_DEV = Math.SQRT1_2;

const N_SAMPLES = 50;

const waveformSamples = normalizeArray(
  pickNValuesFromDistribution(SINE_MEAN, SINE_STD_DEV, N_SAMPLES),
);

export { Palette, waveformSamples, DURATION };
