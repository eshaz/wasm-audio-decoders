import { WASMAudioDecoderCommon } from "@wasm-audio-decoders/common";
import { OpusDecoder } from "opus-decoder";
import CodecParser from "codec-parser";

export default class OggOpusDecoder {
  constructor(options = {}) {
    this._forceStereo =
      options.forceStereo !== undefined ? options.forceStereo : false;

    this._onCodec = (codec) => {
      if (codec !== "opus")
        throw new Error(
          "ogg-opus-decoder does not support this codec " + codec
        );
    };

    // instantiate to create static properties
    new WASMAudioDecoderCommon();
    this._init();
  }

  _init() {
    if (this._decoder) {
      this._decoder.free();
    }

    this._codecParser = new CodecParser("application/ogg", {
      onCodec: this._onCodec,
    });

    this._header = {};
    this._decoder = null;
    this._ready = Promise.resolve();
  }

  get ready() {
    return this._ready;
  }

  async reset() {
    this._init();
  }

  free() {
    this._init();
  }

  async _decode(oggOpusData, DecoderClass) {
    let decoded = [],
      channelsDecoded,
      totalSamples = 0;

    for await (const { codecFrames } of this._codecParser.parseAll(
      oggOpusData
    )) {
      if (codecFrames.length) {
        if (!this._decoder && codecFrames[0].header) {
          this._header = codecFrames[0].header;
          this._decoder = new DecoderClass({
            ...this._header,
            forceStereo: this._forceStereo,
          });
          this._ready = this._decoder.ready;

          await this._decoder.ready;
        }

        const { channelData, samplesDecoded } =
          await this._decoder.decodeFrames(codecFrames.map((f) => f.data));

        decoded.push(channelData);
        totalSamples += samplesDecoded;
        channelsDecoded = channelData.length;
      }
    }

    return WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
      decoded,
      channelsDecoded,
      totalSamples,
      48000
    );
  }

  async decode(oggOpusData) {
    return this._decode(oggOpusData, OpusDecoder);
  }
}
