console.log('CLI test starting...');

const fs = require('fs');
const path = require('path');

console.log('Current directory:', process.cwd());
console.log('Script directory:', __dirname);

// Test if we can access the demos path
const demosPath = path.dirname(__dirname);
console.log('Demos path:', demosPath);

const animationsPath = path.join(demosPath, 'src', 'animations');
console.log('Animations path:', animationsPath);

if (fs.existsSync(animationsPath)) {
  console.log('Animations directory exists');
  const animations = fs
    .readdirSync(animationsPath, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)
    .sort();
  console.log('Found animations:', animations.slice(0, 5));
} else {
  console.log('Animations directory does not exist');
}

console.log('Test completed');
