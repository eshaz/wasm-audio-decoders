import { WASMAudioDecoderCommon } from "@wasm-audio-decoders/common";
import { OpusDecoder } from "opus-decoder";
import CodecParser from "codec-parser";

class DecodeState {
  constructor(sendToDecoder) {
    this._sendToDecoder = sendToDecoder;

    this._decodePromiseChain = Promise.resolve();
    this._decoded = [];
    this._channelsDecoded = 0;
    this._totalSamples = 0;
  }

  get decoded() {
    return this._decodePromiseChain.then(() => [
      this._decoded,
      this._channelsDecoded,
      this._totalSamples,
      48000,
    ]);
  }

  _decode(codecFrames) {
    this._decodePromiseChain = this._decodePromiseChain.then(() =>
      this._sendToDecoder(this, codecFrames)
    );
  }
}

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

    this._sendToDecoder = async (decoderState, codecFrames) => {
      if (codecFrames.length) {
        if (!this._decoder && codecFrames[0].header) {
          this._decoder = new this._decoderClass({
            ...codecFrames[0].header,
            forceStereo: this._forceStereo,
          });
          this._ready = this._decoder.ready;

          await this.ready;
        }

        const { channelData, samplesDecoded } =
          await this._decoder.decodeFrames(codecFrames.map((f) => f.data));

        decoderState._decoded.push(channelData);
        decoderState._totalSamples += samplesDecoded;
        decoderState._channelsDecoded = channelData.length;
      }
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

  async _flush(decoderState) {
    for (const { codecFrames } of this._codecParser.flush()) {
      decoderState._decode(codecFrames);
    }

    const decoded = await decoderState.decoded;
    this._init();

    return decoded;
  }

  async _decode(oggOpusData, decoderState) {
    for (const { codecFrames } of this._codecParser.parseChunk(oggOpusData)) {
      decoderState._decode(codecFrames);
    }

    return decoderState.decoded;
  }

  async decode(oggOpusData) {
    return WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
      ...(await this._decode(oggOpusData, new DecodeState(this._sendToDecoder)))
    );
  }

  async decodeFile(oggOpusData) {
    const decoderState = new DecodeState(this._sendToDecoder);

    return WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
      ...(await this._decode(oggOpusData, decoderState).then(() =>
        this._flush(decoderState)
      ))
    );
  }

  async flush() {
    return WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
      ...(await this._flush(oggOpusData, new DecodeState(this._sendToDecoder)))
    );
  }
}
