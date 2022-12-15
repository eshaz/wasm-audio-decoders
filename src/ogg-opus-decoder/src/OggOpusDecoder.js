import { WASMAudioDecoderCommon } from "@wasm-audio-decoders/common";
import { OpusDecoder } from "opus-decoder";
import CodecParser from "codec-parser";

class DecoderState {
  constructor(instance) {
    this._instance = instance;

    this._decoderOperations = [];
    this._errors = [];
    this._decoded = [];
    this._channelsDecoded = 0;
    this._totalSamples = 0;
  }

  get decoded() {
    return this._instance.ready
      .then(() => Promise.all(this._decoderOperations))
      .then(() => [
        this._errors,
        this._decoded,
        this._channelsDecoded,
        this._totalSamples,
        48000,
      ]);
  }

  async _instantiateDecoder(header) {
    this._instance._decoder = new this._instance._decoderClass({
      ...header,
      forceStereo: this._instance._forceStereo,
    });
    this._instance._ready = this._instance._decoder.ready;
  }

  async _sendToDecoder(frames) {
    const { channelData, samplesDecoded, errors } =
      await this._instance._decoder.decodeFrames(frames);

    this._decoded.push(channelData);
    this._errors = this._errors.concat(errors);
    this._totalSamples += samplesDecoded;
    this._channelsDecoded = channelData.length;
  }

  async _decode(codecFrames) {
    if (codecFrames.length) {
      if (!this._instance._decoder && codecFrames[0].header)
        this._instantiateDecoder(codecFrames[0].header);

      await this._instance.ready;

      this._decoderOperations.push(
        this._sendToDecoder(codecFrames.map((f) => f.data))
      );
    }
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

    // instantiate to create static properties
    new WASMAudioDecoderCommon();
    this._decoderClass = OpusDecoder;

    this._init();
  }

  _init() {
    if (this._decoder) this._decoder.free();
    this._decoder = null;
    this._ready = Promise.resolve();

    this._codecParser = new CodecParser("application/ogg", {
      onCodec: this._onCodec,
      enableFrameCRC32: false,
    });
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
      ...(await this._decode(oggOpusData, new DecoderState(this)))
    );
  }

  async decodeFile(oggOpusData) {
    const decoderState = new DecoderState(this);

    return WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
      ...(await this._decode(oggOpusData, decoderState).then(() =>
        this._flush(decoderState)
      ))
    );
  }

  async flush() {
    return WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
      ...(await this._flush(new DecoderState(this)))
    );
  }
}
