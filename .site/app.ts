import type { Answer, Sources } from './app.contract.d.ts';
export const grants = '';
const sources: Sources = { articleSlugs: () => ['a', 'b'] };
export const answer: Answer = (source, args, store, storage, native) => sources[source](args, store, storage, native);
