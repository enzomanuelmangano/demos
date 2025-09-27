const fs = require('fs');
const path = require('path');

function hasLiquidVariants(importPath, currentFile) {
  const basePath = path.resolve(path.dirname(currentFile), importPath);

  const possiblePaths = [basePath, `${basePath}.tsx`, `${basePath}/index.tsx`];

  for (const resolvedPath of possiblePaths) {
    if (fs.existsSync(resolvedPath)) {
      const dir = path.dirname(resolvedPath);
      const name = path.basename(resolvedPath, '.tsx');
      const componentName = name === 'index' ? path.basename(dir) : name;

      const liquidPath = path.join(dir, `${componentName}.liquid.tsx`);
      const regularPath =
        name === 'index'
          ? path.join(dir, 'index.tsx')
          : path.join(dir, `${componentName}.tsx`);

      if (fs.existsSync(liquidPath) && fs.existsSync(regularPath)) {
        // Calculate the relative import path from currentFile to the liquid component
        const liquidRelativePath = path.relative(
          path.dirname(currentFile),
          liquidPath,
        );
        const liquidImportPath = liquidRelativePath
          .replace(/\.tsx$/, '')
          .replace(/\\/g, '/');

        // Debug logging
        console.log('DEBUG: liquidPath =', liquidPath);
        console.log('DEBUG: currentFile =', currentFile);
        console.log('DEBUG: liquidRelativePath =', liquidRelativePath);
        console.log('DEBUG: liquidImportPath =', liquidImportPath);

        return {
          componentName,
          dir,
          importPath,
          liquidImportPath: liquidImportPath.startsWith('.')
            ? liquidImportPath
            : `./${liquidImportPath}`,
        };
      }
    }
  }

  return null;
}

module.exports = function ({ types: t }) {
  return {
    name: 'liquid-glass-resolver',
    visitor: {
      ImportDeclaration(path, state) {
        const importPath = path.node.source.value;
        const currentFile = state.filename;

        console.log(
          'DEBUG: Processing import:',
          importPath,
          'from',
          currentFile,
        );

        if (!importPath.startsWith('./') && !importPath.startsWith('../')) {
          return;
        }

        // Skip if this is already a liquid import (to prevent infinite loops)
        if (importPath.includes('.liquid')) {
          return;
        }

        // Skip if we've already processed this import in this file
        state.processedImports = state.processedImports || new Set();
        const importKey = `${currentFile}:${importPath}`;
        if (state.processedImports.has(importKey)) {
          return;
        }
        state.processedImports.add(importKey);

        const liquidInfo = hasLiquidVariants(importPath, currentFile);
        if (!liquidInfo) return;

        const defaultSpecifier = path.node.specifiers.find(
          spec => spec.type === 'ImportDefaultSpecifier',
        );
        if (!defaultSpecifier) return;

        const localName = defaultSpecifier.local.name;

        // Generate both imports and conditional selection
        const liquidImportPath = `${importPath}.liquid`;
        const regularImportPath = importPath;

        const liquidImportName = `${localName}Liquid`;
        const regularImportName = `${localName}Regular`;

        // Add import for the isLiquidGlassAvailable function
        const requireNativeModuleImport = t.importDeclaration(
          [
            t.importSpecifier(
              t.identifier('requireNativeModule'),
              t.identifier('requireNativeModule'),
            ),
          ],
          t.stringLiteral('expo-modules-core'),
        );

        // Add the liquid glass availability check
        const isLiquidGlassAvailableDeclaration = t.variableDeclaration('let', [
          t.variableDeclarator(
            t.identifier('IS_LIQUID_GLASS_AVAILABLE'),
            t.identifier('undefined'),
          ),
        ]);

        const isLiquidGlassAvailableFunction = t.functionDeclaration(
          t.identifier('isLiquidGlassAvailable'),
          [],
          t.blockStatement([
            t.ifStatement(
              t.binaryExpression(
                '===',
                t.identifier('IS_LIQUID_GLASS_AVAILABLE'),
                t.identifier('undefined'),
              ),
              t.blockStatement([
                t.expressionStatement(
                  t.assignmentExpression(
                    '=',
                    t.identifier('IS_LIQUID_GLASS_AVAILABLE'),
                    t.memberExpression(
                      t.callExpression(t.identifier('requireNativeModule'), [
                        t.stringLiteral('ExpoGlassEffect'),
                      ]),
                      t.identifier('isLiquidGlassAvailable'),
                    ),
                  ),
                ),
              ]),
            ),
            t.returnStatement(
              t.unaryExpression(
                '!',
                t.unaryExpression(
                  '!',
                  t.identifier('IS_LIQUID_GLASS_AVAILABLE'),
                ),
              ),
            ),
          ]),
        );

        // Add import for liquid variant
        const liquidImport = t.importDeclaration(
          [t.importDefaultSpecifier(t.identifier(liquidImportName))],
          t.stringLiteral(liquidImportPath),
        );

        // Add import for regular variant
        const regularImport = t.importDeclaration(
          [t.importDefaultSpecifier(t.identifier(regularImportName))],
          t.stringLiteral(regularImportPath),
        );

        // Replace original import with conditional selection
        const conditionalComponent = t.variableDeclaration('const', [
          t.variableDeclarator(
            t.identifier(localName),
            t.conditionalExpression(
              t.callExpression(t.identifier('isLiquidGlassAvailable'), []),
              t.identifier(liquidImportName),
              t.identifier(regularImportName),
            ),
          ),
        ]);

        path.replaceWithMultiple([
          requireNativeModuleImport,
          isLiquidGlassAvailableDeclaration,
          isLiquidGlassAvailableFunction,
          liquidImport,
          regularImport,
          conditionalComponent,
        ]);
      },
    },
  };
};
