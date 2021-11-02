type MPEGDecodedAudio = {
  channelData: Float32Array[];
  samplesDecoded: number;
  sampleRate: number;
};

declare module 'mpg123-decoder' {
  export class MPEGDecoder {
    ready: Promise<void>;
    reset: () => Promise<void>;
    free: () => void;
    decode: (data: Uint8Array) => MPEGDecodedAudio;
    decodeFrame: (data: Uint8Array) => MPEGDecodedAudio;
    decodeFrames: (data: Uint8Array) => MPEGDecodedAudio;
  }

  export class MPEGDecoderWebWorker {
    ready: Promise<void>;
    reset: () => Promise<void>;
    free: () => Promise<void>;
    decode: (data: Uint8Array) => Promise<MPEGDecodedAudio>;
    decodeFrame: (data: Uint8Array) => Promise<MPEGDecodedAudio>;
    decodeFrames: (data: Uint8Array) => Promise<MPEGDecodedAudio>;
  }
}
