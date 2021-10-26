import EmscriptenWASM from "./emscripten-wasm.js";
import OpusDecodedAudio from "./OpusDecodedAudio.js";
import OggOpusDecoder from "./OggOpusDecoder.js";

export default class OpusDecoderWebWorker extends Worker {
  constructor() {
    const webworkerSourceCode =
      "'use strict';" +
      EmscriptenWASM.toString() +
      OpusDecodedAudio.toString() +
      OggOpusDecoder.toString() +
      `(${(() => {
        // We're in a Web Worker
        const decoder = new OggOpusDecoder();

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
              const { channelData, samplesDecoded, sampleRate } =
                decoder.decode(new Uint8Array(data.oggOpusData));

              self.postMessage(
                {
                  command: "decode",
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

  async _postToDecoder(command, oggOpusData) {
    return new Promise((resolve) => {
      this.postMessage({
        command,
        oggOpusData,
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

  async decode(data) {
    return this._postToDecoder("decode", data).then(
      (decodedData) =>
        new OpusDecodedAudio(
          decodedData.channelData,
          decodedData.samplesDecoded
        )
    );
  }
}
