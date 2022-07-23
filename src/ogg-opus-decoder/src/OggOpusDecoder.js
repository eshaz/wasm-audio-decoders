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
    this._decoderClass = OpusDecoder;
    this._init();
  }

  _init() {
    if (this._decoder) {
      this._decoder.free();
    }

    this._codecParser = new CodecParser("application/ogg", {
      onCodec: this._onCodec,
      enableFrameCRC32: false,
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

  async _flush() {
    let decoded = [],
      channelsDecoded = 0,
      totalSamples = 0;

    for await (const { codecFrames } of this._codecParser.flush()) {
      if (codecFrames.length) {
        const { channelData, samplesDecoded } =
          await this._decoder.decodeFrames(codecFrames.map((f) => f.data));

        decoded.push(channelData);
        totalSamples += samplesDecoded;
        channelsDecoded = channelData.length;
      }
    }

    this._init();

    return [decoded, channelsDecoded, totalSamples];
  }

  async _decode(oggOpusData) {
    let decodeOperations = [],
      decoded = [],
      channelsDecoded = 0,
      totalSamples = 0;

    const decode = async (codecFrames) => {
      const { channelData, samplesDecoded } = await this._decoder.decodeFrames(
        codecFrames.map((f) => f.data)
      );

      decoded.push(channelData);
      totalSamples += samplesDecoded;
      channelsDecoded = channelData.length;
    };

    for await (const { codecFrames } of this._codecParser.parseChunk(
      oggOpusData
    )) {
      if (codecFrames.length) {
        if (!this._decoder && codecFrames[0].header) {
          this._header = codecFrames[0].header;
          this._decoder = new this._decoderClass({
            ...this._header,
            forceStereo: this._forceStereo,
          });
          this._ready = this._decoder.ready;

          await this._decoder.ready;
        }

        decodeOperations.push(decode(codecFrames));
      }
    }

    await Promise.all(decodeOperations);

    return [decoded, channelsDecoded, totalSamples];
  }

  async decode(oggOpusData) {
    const decoded = await this._decode(oggOpusData);

    return WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
      decoded[0],
      decoded[1],
      decoded[2],
      48000
    );
  }

  async decodeFile(oggOpusData) {
    const decoded = await this._decode(oggOpusData);
    const flushed = await this._flush();

    return WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
      decoded[0].concat(flushed[0]),
      decoded[1],
      decoded[2] + flushed[2],
      48000
    );
  }

  async flush() {
    const decoded = await this._flush();

    return WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
      decoded[0],
      decoded[1],
      decoded[2],
      48000
    );
  }
}
