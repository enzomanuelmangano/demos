'use strict';

/**
 * no-shared-value-dot-value
 *
 * Forbids `.value` access on reanimated shared values — use `.get()` / `.set()`
 * instead. Type-aware: only fires when the object's TypeScript type resolves
 * to a reanimated SharedValue/DerivedValue, so `.value` on TextInputs, events,
 * atoms or plain objects is untouched.
 *
 * Auto-fix: plain reads become `.get()`, plain assignments become `.set(expr)`.
 * Compound assignments (`+=`, `-=`, …) are reported without a fix.
 */
const noSharedValueDotValue = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Use .get()/.set() instead of .value on reanimated shared values',
    },
    fixable: 'code',
    schema: [],
    messages: {
      read: 'Read shared values with .get() instead of .value.',
      write: 'Write shared values with .set(...) instead of assigning .value.',
    },
  },
  create(context) {
    const services = context.parserServices;
    if (!services || !services.program || !services.esTreeNodeToTSNodeMap) {
      // No type information available (non-TS file) — skip.
      return {};
    }
    const checker = services.program.getTypeChecker();

    const isSharedValueType = node => {
      const tsNode = services.esTreeNodeToTSNodeMap.get(node);
      if (!tsNode) return false;
      const type = checker.getTypeAtLocation(tsNode);
      const name = checker.typeToString(type);
      return /\b(SharedValue|DerivedValue|Mutable)\b/.test(name);
    };

    return {
      MemberExpression(node) {
        if (node.computed) return;
        if (!node.property || node.property.name !== 'value') return;
        if (!isSharedValueType(node.object)) return;

        const sourceCode = context.getSourceCode();
        const parent = node.parent;

        // Write: x.value = expr
        if (
          parent.type === 'AssignmentExpression' &&
          parent.left === node &&
          parent.operator === '='
        ) {
          context.report({
            node,
            messageId: 'write',
            fix(fixer) {
              const objectText = sourceCode.getText(node.object);
              const rightText = sourceCode.getText(parent.right);
              return fixer.replaceText(
                parent,
                `${objectText}.set(${rightText})`,
              );
            },
          });
          return;
        }

        // Compound write (+=, -=, …) or update (++/--): report, no auto-fix.
        if (
          (parent.type === 'AssignmentExpression' && parent.left === node) ||
          parent.type === 'UpdateExpression'
        ) {
          context.report({ node, messageId: 'write' });
          return;
        }

        // Read.
        context.report({
          node,
          messageId: 'read',
          fix(fixer) {
            return fixer.replaceText(node.property, 'get()');
          },
        });
      },
    };
  },
};

module.exports = {
  'no-shared-value-dot-value': noSharedValueDotValue,
};
