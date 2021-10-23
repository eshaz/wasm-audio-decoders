import getMPEGDecoderWASM from "./MPEGDecoderWASM.js";

export default class MPEGDecoderWebWorker extends Worker {
  constructor() {
    const decoder = "(" + getMPEGDecoderWASM.toString() + ")()";
    super(
      URL.createObjectURL(
        new Blob([decoder], { type: "application/javascript" })
      )
    );
  }

  async _sendToDecoder(command, mpegData) {
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
    return this._sendToDecoder("ready");
  }

  async free() {
    await this._sendToDecoder("free");
  }

  async reset() {
    await this._sendToDecoder("reset");
  }

  async decode(data) {
    return this._sendToDecoder("decode", data);
  }

  async decodeFrame(data) {
    return this._sendToDecoder("decodeFrame", data);
  }

  async decodeFrames(data) {
    return this._sendToDecoder("decodeFrames", data);
  }
}
