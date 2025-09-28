import {
  generateWaveform,
  normalizeArray,
  pickNValuesFromArray,
} from './helpers';

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

const sampleRate = 44100;
const frequency = 440;
const DURATION = 22.0;

const waveform = generateWaveform(sampleRate, frequency, DURATION);

const N_SAMPLES = 50;

const waveformSamples = normalizeArray(
  pickNValuesFromArray(waveform, N_SAMPLES),
);

export { Palette, waveformSamples, DURATION };
