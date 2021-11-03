type OpusDecodedAudio = {
  channelData: Float32Array[];
  samplesDecoded: number;
  sampleRate: 48000;
};

declare module 'ogg-opus-decoder' {
  export class OggOpusDecoder {
    ready: Promise<void>;
    reset: () => Promise<void>;
    free: () => void;
    decode: (data: Uint8Array) => OpusDecodedAudio;
  }

  export class OggOpusDecoderWebWorker {
    ready: Promise<void>;
    reset: () => Promise<void>;
    free: () => Promise<void>;
    decode: (data: Uint8Array) => Promise<OpusDecodedAudio>;
  }
}
