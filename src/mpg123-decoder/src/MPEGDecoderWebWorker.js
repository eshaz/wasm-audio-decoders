import getMPEGDecoderWASM from "./emscripten-build.js";

export default class MPEGDecoderWebWorker extends Worker {
  constructor() {
    const decoder = "(" + getMPEGDecoderWASM.toString() + ")()";
    super(
      URL.createObjectURL(
        new Blob([decoder], { type: "text/javascript" })
      )
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
    this.free().finally(() => {
      super.terminate();
    });
  }

  get ready() {
    return this._postToDecoder("ready");
  }

  async free() {
    await this._postToDecoder("free");
  }

  async reset() {
    await this._postToDecoder("reset");
  }

  async decode(data) {
    return this._postToDecoder("decode", data);
  }

  async decodeFrame(data) {
    return this._postToDecoder("decodeFrame", data);
  }

  async decodeFrames(data) {
    return this._postToDecoder("decodeFrames", data);
  }
}
