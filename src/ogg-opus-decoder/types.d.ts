import { DecodeError } from "@wasm-audio-decoders/common/types";

declare module "ogg-opus-decoder" {
  export interface OpusDecodedAudio {
    channelData: Float32Array[];
    samplesDecoded: number;
    sampleRate: 48000;
    errors: DecodeError[];
  }

  export class OggOpusDecoder {
    public constructor(options?: { forceStereo?: boolean });
    ready: Promise<void>;
    reset: () => Promise<void>;
    free: () => void;
    decode: (data: Uint8Array) => OpusDecodedAudio;
    decodeFile: (data: Uint8Array) => Promise<OpusDecodedAudio>;
    flush: () => Promise<OpusDecodedAudio>;
  }

  export class OggOpusDecoderWebWorker {
    public constructor(options?: { forceStereo?: boolean });
    ready: Promise<void>;
    reset: () => Promise<void>;
    free: () => Promise<void>;
    decode: (data: Uint8Array) => Promise<OpusDecodedAudio>;
    decodeFile: (data: Uint8Array) => Promise<OpusDecodedAudio>;
    flush: () => Promise<OpusDecodedAudio>;
  }
}
