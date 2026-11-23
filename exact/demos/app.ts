// Demos asks no data source yet: the launcher's list is demos.contract, generated from the
// RN registry (tools/gen-demos.ts), and each demo keeps its state in Contract.
import type { Answer, Sources } from './app.contract.d.ts';
// The GPU module's images, served on the web only (packages/gpu-images, gpu/src/bytes.rs): importing the package
// is what makes the web build serve its exact.json `web.assets`; the iPhone embeds gpu/images instead.
import 'demos-gpu-images';

// Linear Sensors tilts its card with the gravity sensor (its feed goes straight to the GPU surface).
export const grants = 'device.motion motionPurpose';

const sources: Sources = {};
export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args, store, storage, native);
