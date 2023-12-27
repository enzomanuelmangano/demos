// Pick N values from an array using a normal distribution
// https://stackoverflow.com/a/36481059

// Why do we need this?
// The point is that by generating a waveform,
// the amount of numbers in the array is equal
// to the sample rate multiplied by the duration.
// (Basically a loooot of values).

// Graphically speaking, we're not interested to
// display all the values of the waveform,
// but we want to display just a small portion of it.
// [Around 40~60 values (N_SAMPLES in constants)].

// So we need to pick N_SAMPLES values from the waveform array!
// But how do we pick them? Of course, we can't just pick them randomly,
// We need to pick them in a way that the 40~60 values
// are representative of the whole waveform.
// In other words, by plotting the 40~60 values, we should be able to
// almost the same waveform as the original one (given by a looot of values).

// That said, this function is basically the solution to this problem.
// Don't be scared by the math, fortunately, we don't need to understand it.
// In my case, I've just explained the problem to ChatGPT
// and it gave me the algorithm :)

const pickNValuesFromArray = (arr: number[], N: number): number[] => {
  const selectedValues: number[] = [];

  // Calculate the mean and standard deviation of the array
  const sum = arr.reduce((acc, val) => acc + val, 0);
  const mean = sum / arr.length;
  const variance =
    arr.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / arr.length;
  const stdDev = Math.sqrt(variance);

  // Pick N values from the array
  for (let i = 0; i < N; i++) {
    let value: number;
    do {
      // Generate a normally distributed value using the Box-Muller transform
      const u = 1 - Math.random(); // Exclusive random [0,1)
      const v = 1 - Math.random();
      const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);

      // Scale the value to match the mean and standard deviation of the array
      value = z * stdDev + mean;
    } while (isNaN(value) || !isFinite(value)); // Check for NaN or Infinity

    selectedValues.push(value);
  }

  return selectedValues;
};

export { pickNValuesFromArray };
