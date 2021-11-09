import Worker from "web-worker";

import EmscriptenWASM from "./EmscriptenWasm.js";
import MPEGDecodedAudio from "./MPEGDecodedAudio.js";
import MPEGDecoder from "./MPEGDecoder.js";

export default class MPEGDecoderWebWorker extends Worker {
  constructor() {
    const webworkerSourceCode =
      "'use strict';" +
      // dependencies need to be manually resolved when stringifying this function
      `(${((_MPEGDecoder, _MPEGDecodedAudio, _EmscriptenWASM) => {
        // We're in a Web Worker
        const decoder = new _MPEGDecoder(_MPEGDecodedAudio, _EmscriptenWASM);

        const detachBuffers = (buffer) =>
          Array.isArray(buffer)
            ? buffer.map((buffer) => new Uint8Array(buffer))
            : new Uint8Array(buffer);

        self.onmessage = ({ data: { id, command, mpegData } }) => {
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
              ](detachBuffers(mpegData));

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
      }).toString()})(${MPEGDecoder}, ${MPEGDecodedAudio}, ${EmscriptenWASM})`;

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

  static _getMPEGDecodedAudio({ channelData, samplesDecoded, sampleRate }) {
    return new MPEGDecodedAudio(channelData, samplesDecoded, sampleRate);
  }

  async _postToDecoder(command, mpegData) {
    return new Promise((resolve) => {
      this.postMessage({
        command,
        id: this._id,
        mpegData,
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
      MPEGDecoderWebWorker._getMPEGDecodedAudio
    );
  }

  async decodeFrame(data) {
    return this._postToDecoder("decodeFrame", data).then(
      MPEGDecoderWebWorker._getMPEGDecodedAudio
    );
  }

  async decodeFrames(data) {
    return this._postToDecoder("decodeFrames", data).then(
      MPEGDecoderWebWorker._getMPEGDecodedAudio
    );
  }
}
