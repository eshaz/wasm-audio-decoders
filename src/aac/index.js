import AACDecoder from "./src/AACDecoder.js";
import AACDecoderWebWorker from "./src/AACDecoderWebWorker.js";
import { assignNames } from "@wasm-audio-decoders/common";

assignNames(AACDecoder, "AACDecoder");
assignNames(AACDecoderWebWorker, "AACDecoderWebWorker");

export { AACDecoder, AACDecoderWebWorker };
