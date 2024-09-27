const path = require('path');
const fs = require('fs');

const getAnimationsAmount = () => {
  const screensDir = path.join(__dirname, '../../src/navigation/');
  const file = fs.readFileSync(path.join(screensDir, 'screens.tsx'), 'utf8');
  // Just import Total

  // Function to extract Screens array from the file
  const extractScreens = fileContent => {
    const screenPattern =
      /name:\s*['"](.+?)['"],\s*route:\s*['"](.+?)['"],\s*component:\s*(\w+),/g;
    const screens = [];
    let match;

    while ((match = screenPattern.exec(fileContent)) !== null) {
      screens.push({
        name: match[1],
        route: match[2],
        component: match[3],
      });
    }

    return screens;
  };

  return extractScreens(file).length;
};

console.log(getAnimationsAmount());
