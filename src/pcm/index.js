import PCMDecoder from "./src/PCMDecoder.js";
import PCMDecoderWebWorker from "./src/PCMDecoderWebWorker.js";
import { assignNames } from "@wasm-audio-decoders/common";

assignNames(PCMDecoder, "PCMDecoder");
assignNames(PCMDecoderWebWorker, "PCMDecoderWebWorker");

export { PCMDecoder, PCMDecoderWebWorker };
