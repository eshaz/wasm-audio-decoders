type OpusDecodedAudio = {
  channelData: Float32Array[];
  samplesDecoded: number;
  sampleRate: 48000;
};

declare module 'opus-decoder' {
  export class OpusDecoder {
    ready: Promise<void>;
    reset: () => Promise<void>;
    free: () => void;
    decode: (data: Uint8Array) => OpusDecodedAudio;
    decodeFrame: (data: Uint8Array) => OpusDecodedAudio;
    decodeFrames: (data: Uint8Array) => OpusDecodedAudio;
  }

  export class OpusDecoderWebWorker {
    ready: Promise<void>;
    reset: () => Promise<void>;
    free: () => Promise<void>;
    decode: (data: Uint8Array) => Promise<OpusDecodedAudio>;
    decodeFrame: (data: Uint8Array) => Promise<OpusDecodedAudio>;
    decodeFrames: (data: Uint8Array) => Promise<OpusDecodedAudio>;
  }
}
