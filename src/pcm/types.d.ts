import { DecodeError } from "@wasm-audio-decoders/common";

export interface PCMDecodedAudio {
  channelData: Float32Array[];
  samplesDecoded: number;
  sampleRate: 48000;
  errors: DecodeError[];
}

export class PCMDecoder {
  constructor();
  ready: Promise<void>;
  reset: () => Promise<void>;
  free: () => void;
  decode: (PCMData: Uint8Array) => PCMDecodedAudio;
}

export class PCMDecoderWebWorker {
  constructor();
  ready: Promise<void>;
  reset: () => Promise<void>;
  free: () => Promise<void>;
  decode: (PCMData: Uint8Array) => PCMDecodedAudio;
}

export { DecodeError };
