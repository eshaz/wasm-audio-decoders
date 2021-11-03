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
    decodeFrame: (opusFrame: Uint8Array) => OpusDecodedAudio;
    decodeFrames: (opusFrames: Uint8Array[]) => OpusDecodedAudio;
  }

  export class OpusDecoderWebWorker {
    ready: Promise<void>;
    reset: () => Promise<void>;
    free: () => Promise<void>;
    decodeFrame: (opusFrame: Uint8Array) => Promise<OpusDecodedAudio>;
    decodeFrames: (opusFrames: Uint8Array[]) => Promise<OpusDecodedAudio>;
  }
}
