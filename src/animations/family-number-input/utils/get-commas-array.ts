/**
 * Returns an array indicating the position of commas in a formatted number string.
 * @param number - The number to be formatted.
 * @returns An array with ',' or '' to indicate comma positions.
 */
export function getCommasArray(number: number): (',' | '')[] {
  // Convert the number to a reversed string array
  const numberString = number.toString().split('').reverse();
  const result: string[] = [];

  // Iterate through the reversed number string to insert commas
  for (let i = 0; i < numberString.length; i++) {
    if (i > 0 && i % 3 === 0) {
      // Insert a comma every three digits
      result.push(',');
      continue;
    }
    result.push('');
  }

  // Reverse the result array to match the original order
  return result.reverse() as (',' | '')[];
}
