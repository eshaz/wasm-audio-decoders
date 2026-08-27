import { DecodeError } from "@wasm-audio-decoders/common";

export interface AACDecodedAudio {
  channelData: Float32Array[];
  samplesDecoded: number;
  sampleRate: number;
  errors: DecodeError[];
}

export interface AACDecoderOptions {
  audioSpecificConfig?: Uint8Array;
}

export class AACDecoder {
  constructor(options?: AACDecoderOptions);
  ready: Promise<void>;
  reset: () => Promise<void>;
  free: () => void;
  decode: (aacData: Uint8Array) => Promise<AACDecodedAudio>;
  flush: () => Promise<AACDecodedAudio>;
  decodeFile: (aacData: Uint8Array) => Promise<AACDecodedAudio>;
  decodeFrames: (aacFrames: Uint8Array[]) => Promise<AACDecodedAudio>;
}

export class AACDecoderWebWorker {
  constructor(options?: AACDecoderOptions);
  ready: Promise<void>;
  reset: () => Promise<void>;
  free: () => Promise<void>;
  terminate: () => void;
  decode: (aacData: Uint8Array) => Promise<AACDecodedAudio>;
  flush: () => Promise<AACDecodedAudio>;
  decodeFile: (aacData: Uint8Array) => Promise<AACDecodedAudio>;
  decodeFrames: (aacFrames: Uint8Array[]) => Promise<AACDecodedAudio>;
}

export { DecodeError };
