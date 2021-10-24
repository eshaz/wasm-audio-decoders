import EmscriptenWASM from "./emscripten-wasm.js";
import OpusDecodedAudio from "./OpusDecodedAudio.js";
import OpusDecoder from "./OpusDecoder.js";

export default class OpusDecoderWebWorker extends Worker {
  constructor() {
    const webworkerSourceCode =
      "'use strict';" +
      EmscriptenWASM.toString() +
      OpusDecodedAudio.toString() +
      OpusDecoder.toString() +
      `(${(() => {
        // We're in a Web Worker
        const decoder = new OpusDecoder();

        const detachBuffers = (buffer) =>
          Array.isArray(buffer)
            ? buffer.map((buffer) => new Uint8Array(buffer))
            : new Uint8Array(buffer);

        self.onmessage = ({ data }) => {
          switch (data.command) {
            case "ready":
              decoder.ready.then(() => {
                self.postMessage({
                  command: "ready",
                });
              });
              break;
            case "free":
              decoder.free();
              self.postMessage({
                command: "free",
              });
              break;
            case "reset":
              decoder.reset().then(() => {
                self.postMessage({
                  command: "reset",
                });
              });
              break;
            case "decodeFrame":
            case "decodeFrames":
              const { channelData, samplesDecoded, sampleRate } = decoder[
                data.command
              ](detachBuffers(data.opusData));

              self.postMessage(
                {
                  command: data.command,
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
                "Unknown command sent to worker: " + data.command
              );
          }
        };
      }).toString()})()`;

    super(
      URL.createObjectURL(
        new Blob([webworkerSourceCode], { type: "text/javascript" })
      )
    );
  }

  static _getOpusDecodedAudio(decodedData) {
    return new OpusDecodedAudio(
      decodedData.channelData,
      decodedData.samplesDecoded
    );
  }

  async _postToDecoder(command, opusData) {
    return new Promise((resolve) => {
      this.postMessage({
        command,
        opusData,
      });

      this.onmessage = (message) => {
        if (message.data.command === command) resolve(message.data);
      };
    });
  }

  terminate() {
    this._postToDecoder("free").finally(() => {
      super.terminate();
    });
  }

  get ready() {
    return this._postToDecoder("ready");
  }

  async free() {
    this.terminate();
  }

  async reset() {
    await this._postToDecoder("reset");
  }

  async decodeFrame(data) {
    return this._postToDecoder("decodeFrame", data).then(
      OpusDecoderWebWorker._getOpusDecodedAudio
    );
  }

  async decodeFrames(data) {
    return this._postToDecoder("decodeFrames", data).then(
      OpusDecoderWebWorker._getOpusDecodedAudio
    );
  }
}
