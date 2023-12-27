// Function to generate a waveform array
const generateWaveform = (
  sampleRate: number,
  frequency: number,
  duration: number,
) => {
  const numSamples = sampleRate * duration;
  const waveform = [];

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * frequency * t);
    waveform.push(sample);
  }

  return waveform;
};

export { generateWaveform };
