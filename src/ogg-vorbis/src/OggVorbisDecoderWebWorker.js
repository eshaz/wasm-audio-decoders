import { WASMAudioDecoderWorker } from "@wasm-audio-decoders/common";
import EmscriptenWASM from "./EmscriptenWasm.js";
import OggVorbisDecoder, {
  Decoder,
  setDecoderClass,
} from "./OggVorbisDecoder.js";

class DecoderWorker extends WASMAudioDecoderWorker {
  constructor(options) {
    super(options, "vorbis-decoder", Decoder, EmscriptenWASM);
  }

  async sendSetupHeader(data) {
    return this._postToDecoder("sendSetupHeader", data);
  }

  async initDsp() {
    return this._postToDecoder("initDsp");
  }

  async decodePackets(packets) {
    return this._postToDecoder("decodePackets", packets);
  }
}

export default class OggVorbisDecoderWebWorker extends OggVorbisDecoder {
  constructor() {
    super();

    super[setDecoderClass](DecoderWorker);
  }

  async free() {
    super.free();
  }
}
