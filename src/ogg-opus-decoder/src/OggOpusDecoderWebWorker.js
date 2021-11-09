import Worker from "web-worker";

import EmscriptenWASM from "./EmscriptenWasm.js";
import OpusDecodedAudio from "./OpusDecodedAudio.js";
import OggOpusDecoder from "./OggOpusDecoder.js";

export default class OggOpusDecoderWebWorker extends Worker {
  constructor() {
    const webworkerSourceCode =
      "'use strict';" +
      // dependencies need to be manually resolved when stringifying this function
      `(${((_OggOpusDecoder, _OpusDecodedAudio, _EmscriptenWASM) => {
        // We're in a Web Worker
        const decoder = new _OggOpusDecoder(_OpusDecodedAudio, _EmscriptenWASM);

        self.onmessage = ({ data: { id, command, oggOpusData } }) => {
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
              const { channelData, samplesDecoded, sampleRate } =
                decoder.decode(new Uint8Array(oggOpusData));

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
              this.console.error("Unknown command sent to worker: " + command);
          }
        };
      }).toString()})(${OggOpusDecoder}, ${OpusDecodedAudio}, ${EmscriptenWASM})`;

    const type = "text/javascript";
    let sourceURL;

    try {
      // browser
      sourceURL = URL.createObjectURL(
        new Blob([webworkerSourceCode], { type })
      );
    } catch {
      // nodejs
      sourceURL = `data:${type};base64,${Buffer.from(
        webworkerSourceCode
      ).toString("base64")}`;
    }

    super(sourceURL);

    this._id = Number.MIN_SAFE_INTEGER;
    this._enqueuedOperations = new Map();

    this.onmessage = ({ data }) => {
      this._enqueuedOperations.get(data.id)(data);
      this._enqueuedOperations.delete(data.id);
    };
  }

  async _postToDecoder(command, oggOpusData) {
    return new Promise((resolve) => {
      this.postMessage({
        command,
        id: this._id,
        oggOpusData,
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

  async decode(data) {
    return this._postToDecoder("decode", data).then(
      ({ channelData, samplesDecoded }) =>
        new OpusDecodedAudio(channelData, samplesDecoded)
    );
  }
}
