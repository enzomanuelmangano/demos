// zeroPad function from https://stackoverflow.com/a/2998822/10247962
// I've added the worklet tag to make it work with Reanimated
const zeroPad = (num: number, places: number): string => {
  'worklet';
  return String(num).padStart(places, '0');
};

export { zeroPad };
