const path = require('path');
const fs = require('fs');

const getAnimationsAmount = () => {
  const registryFile = path.join(__dirname, '../../src/animations/registry.ts');
  const file = fs.readFileSync(registryFile, 'utf8');

  // Extract the AnimationRegistry object and count its keys
  const registryPattern = /export const AnimationRegistry = \{([\s\S]*?)\} as const;/;
  const match = registryPattern.exec(file);

  if (!match) {
    throw new Error('Could not find AnimationRegistry in registry.ts');
  }

  // Count the number of animation entries by splitting on commas and filtering out empty lines
  const registryContent = match[1];
  const entries = registryContent
    .split('\n')
    .filter(line => line.trim() && line.includes(':') && !line.trim().startsWith('//'))
    .length;

  return entries;
};

console.log(getAnimationsAmount());
