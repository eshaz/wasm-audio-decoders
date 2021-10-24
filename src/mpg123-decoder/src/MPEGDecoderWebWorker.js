import EmscriptenWASM from "./emscripten-wasm.js";
import MPEGDecodedAudio from "./MPEGDecodedAudio.js";
import MPEGDecoder from "./MPEGDecoder.js";

export default class MPEGDecoderWebWorker extends Worker {
  constructor() {
    const webworkerSourceCode =
      "'use strict';" +
      EmscriptenWASM.toString() +
      MPEGDecodedAudio.toString() +
      MPEGDecoder.toString() +
      `(${(() => {
        // We're in a Web Worker
        const decoder = new MPEGDecoder();

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
            case "decode":
            case "decodeFrame":
            case "decodeFrames":
              const { channelData, samplesDecoded, sampleRate } = decoder[
                data.command
              ](detachBuffers(data.mpegData));

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

  static _getMPEGDecodedAudio(decodedData) {
    return new MPEGDecodedAudio(
      decodedData.channelData,
      decodedData.samplesDecoded,
      decodedData.sampleRate
    );
  }

  async _postToDecoder(command, mpegData) {
    return new Promise((resolve) => {
      this.postMessage({
        command,
        mpegData,
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
    await this.terminate();
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
