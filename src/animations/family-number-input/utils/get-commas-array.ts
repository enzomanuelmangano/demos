/**
 * Returns an array indicating the position of commas in a formatted number string.
 * @param number - The number to be formatted.
 * @returns An array with ',' or '' to indicate comma positions.
 */
export function getCommasArray(number: number): (',' | '')[] {
  const numberString = number.toString().split('').reverse();
  const result: string[] = [];

  for (let i = 0; i < numberString.length; i++) {
    if (i > 0 && i % 3 === 0) {
      result.push(',');
      continue;
    }
    result.push('');
  }

  return result.reverse() as (',' | '')[];
}
