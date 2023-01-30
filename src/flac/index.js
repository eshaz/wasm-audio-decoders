import FLACDecoder from "./src/FLACDecoder.js";
import FLACDecoderWebWorker from "./src/FLACDecoderWebWorker.js";

const decoder = "FLACDecoder";
const decoderWebWorker = "FLACDecoderWebWorker";
const name = "name"

Object.defineProperty(FLACDecoder, name, { value: decoder });
Object.defineProperty(FLACDecoder.constructor, name, {
  value: decoder,
});
Object.defineProperty(FLACDecoderWebWorker, name, {
  value: decoderWebWorker,
});
Object.defineProperty(FLACDecoderWebWorker.constructor, name, {
  value: decoderWebWorker,
});

export { FLACDecoder, FLACDecoderWebWorker };
