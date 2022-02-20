import Worker from "web-worker";
import WASMAudioDecoderCommon from "./WASMAudioDecoderCommon.js";

// statically store web worker source code
const sources = new WeakMap();

export default class WASMAudioDecoderWorker extends Worker {
  constructor(Decoder, DecodedAudio, EmscriptenWASM) {
    let source = sources.get(Decoder);

    if (!source) {
      const webworkerSourceCode =
        "'use strict';" +
        // dependencies need to be manually resolved when stringifying this function
        `(${((
          _WASMAudioDecoderCommon,
          _Decoder,
          _DecodedAudio,
          _EmscriptenWASM
        ) => {
          // We're in a Web Worker
          const decoder = new _Decoder(
            _WASMAudioDecoderCommon,
            _DecodedAudio,
            _EmscriptenWASM
          );

          const detachBuffers = (buffer) =>
            Array.isArray(buffer)
              ? buffer.map((buffer) => new Uint8Array(buffer))
              : new Uint8Array(buffer);

          self.onmessage = ({ data: { id, command, data } }) => {
            switch (command) {
              case "ready":
                decoder.ready.then(() => {
                  self.postMessage({
                    id,
                  });
                });
                break;
              case "free":
                decoder.free();
                self.postMessage({
                  id,
                });
                break;
              case "reset":
                decoder.reset().then(() => {
                  self.postMessage({
                    id,
                  });
                });
                break;
              case "decode":
              case "decodeFrame":
              case "decodeFrames":
                const { channelData, samplesDecoded, sampleRate } = decoder[
                  command
                ](detachBuffers(data));

                self.postMessage(
                  {
                    id,
                    channelData,
                    samplesDecoded,
                    sampleRate,
                  },
                  // The "transferList" parameter transfers ownership of channel data to main thread,
                  // which avoids copying memory.
                  channelData.map((channel) => channel.buffer)
                );
                break;
              default:
                this.console.error(
                  "Unknown command sent to worker: " + command
                );
            }
          };
        }).toString()})(${WASMAudioDecoderCommon}, ${Decoder}, ${DecodedAudio}, ${EmscriptenWASM})`;

      const type = "text/javascript";

      try {
        // browser
        source = URL.createObjectURL(new Blob([webworkerSourceCode], { type }));
      } catch {
        // nodejs
        source = `data:${type};base64,${Buffer.from(
          webworkerSourceCode
        ).toString("base64")}`;
      }

      sources.set(Decoder, source);
    }

    super(source);

    this._DecodedAudio = DecodedAudio;

    this._id = Number.MIN_SAFE_INTEGER;
    this._enqueuedOperations = new Map();

    this.onmessage = ({ data }) => {
      this._enqueuedOperations.get(data.id)(data);
      this._enqueuedOperations.delete(data.id);
    };
  }

  _getDecodedAudio({ channelData, samplesDecoded, sampleRate }) {
    return new this._DecodedAudio(channelData, samplesDecoded, sampleRate);
  }

  async _postToDecoder(command, data) {
    return new Promise((resolve) => {
      this.postMessage({
        command,
        id: this._id,
        data,
      });

      this._enqueuedOperations.set(this._id++, resolve);
    });
  }

  get ready() {
    return this._postToDecoder("ready");
  }

  async free() {
    await this._postToDecoder("free").finally(() => {
      this.terminate();
    });
  }

  async reset() {
    await this._postToDecoder("reset");
  }
}
