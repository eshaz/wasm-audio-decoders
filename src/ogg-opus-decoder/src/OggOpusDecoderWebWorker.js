import { OpusDecoderWebWorker } from "opus-decoder";
import OggOpusDecoder from "./OggOpusDecoder.js";

export default class OggOpusDecoderWebWorker extends OggOpusDecoder {
  constructor(options) {
    super(options);
  }

  async decode(oggOpusData) {
    return super._decode(oggOpusData, OpusDecoderWebWorker);
  }
}
