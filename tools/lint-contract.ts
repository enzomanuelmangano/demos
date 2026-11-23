// Lints the app's Contract files. The rule engine lives in tools/contract-lint/ (see its README.md).
//
//   bun tools/lint-contract.ts [paths] [--fix] [--rule id] [--format json] [--baseline file]
import { resolve } from 'node:path';
import { main } from './contract-lint/cli.ts';

process.exit(main(process.argv.slice(2), resolve(import.meta.dir, '..')));
