// Demos asks no data source yet: the launcher's list is demos.contract, generated from the
// RN registry (tools/gen-demos.ts), and each demo keeps its state in Contract.
import type { Answer, Sources } from './app.contract.d.ts';

export const grants = '';

const sources: Sources = {};
export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args, store, storage, native);
