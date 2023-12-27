import type { Complex } from './types';

// Define the Epicycle type which represents a circle with a certain frequency,
// amplitude, and phase in the Fourier series.
type Epicycle = {
  frequency: number; // The rate of oscillation or rotation of the circle.
  amplitude: number; // The radius or size of the circle.
  phase: number; // The initial angle offset of the circle.
};

/**
 * Extract epicycles from a set of complex numbers obtained from FFT.
 *
 * Epicycles are the set of rotating circles that can be used to approximate
 * any periodic curve using Fourier series. In this context, they are used to
 * visualize the result of a Fourier transform in terms of circles with different
 * frequencies, amplitudes, and phases.
 *
 * @param {Complex[]} complex - An array of complex numbers representing frequency-domain data.
 * @returns {Epicycle[]} - An array of epicycles representing the complex numbers.
 */
const extractEpicycles = (complex: Complex[]): Epicycle[] => {
  const numPoints = complex.length;
  const epicycles: Epicycle[] = [];

  for (let i = 0; i < numPoints; i++) {
    // Indexing logic to retrieve complex numbers in a specific order.
    // The reason for this is to sort the frequencies from lowest to highest.
    const j = i % 2 === 0 ? i / 2 : numPoints - (i + 1) / 2;

    // Extract real and imaginary parts of the current complex number.
    const x = complex[j].real;
    const y = complex[j].imag;

    // Calculate the frequency associated with the current complex number.
    // It essentially shifts the zero frequency to the center of the array.
    const freq = ((j + numPoints / 2) % numPoints) - numPoints / 2;

    // Push the epicycle (circle) data obtained from the complex number
    // into the epicycles array.
    epicycles.push({
      frequency: freq,
      // Calculate amplitude as the distance from the origin to the point (x, y).
      amplitude: Math.sqrt(x * x + y * y) / numPoints,
      // Calculate the phase angle using the inverse tangent of the ratio of the imaginary to real part.
      phase: Math.atan2(y, x),
    });
  }

  return epicycles;
};

export { extractEpicycles };
