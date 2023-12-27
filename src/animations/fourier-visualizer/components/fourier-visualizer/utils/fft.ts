import FFT from 'fft.js';

import type { Complex, Point } from './types';

/**
 * Compute the Fast Fourier Transform (FFT) of a given set of 2D points.
 *
 * FFT is an algorithm to compute the discrete Fourier transform (DFT)
 * and its inverse. It's used to convert a signal from its original domain
 * (often time or space) to a representation in the frequency domain and vice versa.
 *
 * @param {Point[]} points - An array of 2D points representing the signal.
 * @returns {Complex[]} - An array of complex numbers representing the frequency domain.
 */
const computeFFT = (points: Point[]): Complex[] => {
  // Determine the number of points in the given data.
  const N = points.length;

  // Initialize the FFT object for the given number of points.
  const fft = new FFT(N);

  // Create input and output arrays for the FFT operation.
  // Since FFT works on complex numbers, each point is represented
  // by two values (real and imaginary). Thus, the length is N*2.
  const input = new Array(N * 2).fill(0);
  const output = new Array(N * 2).fill(0);

  // Map the 2D points to the input array.
  // Every even index represents the x (real) value, and
  // every odd index represents the y (imaginary) value.
  for (let i = 0; i < N; i++) {
    input[2 * i] = points[i].x;
    input[2 * i + 1] = points[i].y;
  }

  // Apply the FFT transform. This converts the input (time-domain signal)
  // into the output (frequency-domain representation).
  // The output array is modified in-place.
  fft.transform(output, input);

  // Convert the output array to an array of complex numbers for easier handling.
  const result: Complex[] = [];
  for (let i = 0; i < N; i++) {
    result.push({
      real: output[2 * i],
      imag: output[2 * i + 1],
    });
  }

  return result;
};

export { computeFFT };
