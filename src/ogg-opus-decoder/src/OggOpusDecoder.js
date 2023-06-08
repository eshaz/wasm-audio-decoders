import { WASMAudioDecoderCommon } from "@wasm-audio-decoders/common";
import { OpusDecoder } from "opus-decoder";
import CodecParser, {
  codecFrames,
  header,
  channels,
  streamCount,
  coupledStreamCount,
  channelMappingTable,
  preSkip,
  isLastPage,
  absoluteGranulePosition,
  samples,
} from "codec-parser";

class DecoderState {
  constructor(instance) {
    this._instance = instance;

    this._sampleRate = this._instance._sampleRate;
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
        this._sampleRate,
      ]);
  }

  async _instantiateDecoder(header) {
    this._preSkip = header[preSkip];

    this._instance._decoder = new this._instance._decoderClass({
      channels: header[channels],
      streamCount: header[streamCount],
      coupledStreamCount: header[coupledStreamCount],
      channelMappingTable: header[channelMappingTable],
      preSkip: Math.round((this._preSkip / 48000) * this._sampleRate),
      sampleRate: this._sampleRate,
      forceStereo: this._instance._forceStereo,
    });
    this._instance._ready = this._instance._decoder.ready;
  }

  async _sendToDecoder(oggPage) {
    const dataFrames = oggPage[codecFrames].map((f) => f.data);

    const { channelData, samplesDecoded, errors } =
      await this._instance._decoder.decodeFrames(dataFrames);

    this._totalSamples += samplesDecoded;

    if (
      this._beginningSampleOffset === undefined &&
      Number(oggPage[absoluteGranulePosition]) > -1
    ) {
      this._beginningSampleOffset =
        oggPage[absoluteGranulePosition] -
        BigInt(oggPage[samples]) +
        BigInt(this._preSkip);
    }

    // in cases where BigInt isn't supported, don't do any absoluteGranulePosition logic (i.e. old iOS versions)
    if (oggPage[isLastPage] && oggPage[absoluteGranulePosition] !== undefined) {
      const totalDecodedSamples =
        (this._totalSamples / this._sampleRate) * 48000;
      const totalOggSamples = Number(
        oggPage[absoluteGranulePosition] - this._beginningSampleOffset
      );

      // trim any extra samples that are decoded beyond the absoluteGranulePosition, relative to where we started in the stream
      const samplesToTrim = Math.round(
        ((totalDecodedSamples - totalOggSamples) / 48000) * this._sampleRate
      );

      for (let i = 0; i < channelData.length; i++)
        channelData[i] = channelData[i].subarray(
          0,
          samplesDecoded - samplesToTrim
        );

      this._totalSamples -= samplesToTrim;
    }

    this._decoded.push(channelData);
    this._errors = this._errors.concat(errors);
    this._channelsDecoded = channelData.length;
  }

  async _decode(oggPage) {
    const frames = oggPage[codecFrames];

    if (frames.length) {
      if (!this._instance._decoder && frames[0][header])
        this._instantiateDecoder(frames[0][header]);

      await this._instance.ready;

      this._decoderOperations.push(this._sendToDecoder(oggPage));
    }
  }
}

export default class OggOpusDecoder {
  constructor(options = {}) {
    this._sampleRate = options.sampleRate || 48000;
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
    for (const oggPage of this._codecParser.flush()) {
      decoderState._decode(oggPage);
    }

    const decoded = await decoderState.decoded;
    this._init();

    return decoded;
  }

  async _decode(oggOpusData, decoderState) {
    for (const oggPage of this._codecParser.parseChunk(oggOpusData)) {
      decoderState._decode(oggPage);
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
