import {
  DecodeError as MPEGDecodeError,
  MPEGDecodedAudio,
  MPEGDecoder,
  MPEGDecoderWebWorker,
} from "mpg123-decoder";
import {
  DecodeError as OpusDecodeError,
  OpusDecodedAudio,
  OpusDecoder,
  OpusDecoderWebWorker,
} from "opus-decoder";
import {
  DecodeError as OpusMLDecodeError,
  OpusMLDecodedAudio,
  OpusMLDecoder,
  OpusMLDecoderWebWorker,
} from "@wasm-audio-decoders/opus-ml";
import {
  DecodeError as OggOpusDecodeError,
  OggOpusDecodedAudio,
  OggOpusDecoder,
  OggOpusDecoderWebWorker,
} from "ogg-opus-decoder";
import {
  DecodeError as FLACDecodeError,
  FLACDecodedAudio,
  FLACDecoder,
  FLACDecoderWebWorker,
} from "@wasm-audio-decoders/flac";
import {
  DecodeError as OggVorbisDecodeError,
  OggVorbisDecodedAudio,
  OggVorbisDecoder,
  OggVorbisDecoderWebWorker,
} from "@wasm-audio-decoders/ogg-vorbis";

const fakeData: Uint8Array = new Uint8Array(0);

// test imports
const mpegDecoder: MPEGDecoder = new MPEGDecoder();
const mpegDecoderWebWorker: MPEGDecoderWebWorker = new MPEGDecoderWebWorker();

const opusDecoder: OpusDecoder = new OpusDecoder();
const opusDecoderWebWorker: OpusDecoderWebWorker = new OpusDecoderWebWorker();

const opusMlDecoder: OpusMLDecoder = new OpusMLDecoder();
const opusMlDecoderWebWorker: OpusMLDecoderWebWorker =
  new OpusMLDecoderWebWorker();

const oggOpusDecoder: OggOpusDecoder = new OggOpusDecoder();
const oggOpusDecoderWebWorker: OggOpusDecoderWebWorker =
  new OggOpusDecoderWebWorker();

// test opus decoder sample rates
const opusDecoder8000 = new OpusDecoder({
  sampleRate: 8000,
});
const opusDecoderWebWorker8000 = new OpusDecoderWebWorker({
  sampleRate: 8000,
});

const opusDecoderDecode8000 = opusDecoder8000.decodeFrame(fakeData);
const opusDecoderDecodeSampleRate8000: number =
  opusDecoderDecode8000.sampleRate;

let opusDecoder12000: OpusDecoder<12000>;
opusDecoder12000 = new OpusDecoder({
  sampleRate: 12000,
});
let opusDecoderWebWorker12000: OpusDecoderWebWorker<12000>;
opusDecoderWebWorker12000 = new OpusDecoderWebWorker({
  sampleRate: 12000,
});

const opusDecoderDecode12000 = opusDecoder12000.decodeFrame(fakeData);
const opusDecoderDecodeSampleRate12000: number =
  opusDecoderDecode12000.sampleRate;

const flacDecoder: FLACDecoder = new FLACDecoder();
const flacDecoderWebWorker: FLACDecoderWebWorker = new FLACDecoderWebWorker();

const oggVorbisDecoder: OggVorbisDecoder = new OggVorbisDecoder();
const oggVorbisDecoderWebWorker: OggVorbisDecoderWebWorker =
  new OggVorbisDecoderWebWorker();

// test decoded audio types
const mpegDecoderDecode: MPEGDecodedAudio = mpegDecoder.decode(fakeData);
const mpegDecoderDecodeChannelData: Float32Array[] =
  mpegDecoderDecode.channelData;
const mpegDecoderDecodeSamplesDecoded: number =
  mpegDecoderDecode.samplesDecoded;
const mpegDecoderDecodeSampleRate: number = mpegDecoderDecode.sampleRate;
const mpegDecoderDecodeErrors: MPEGDecodeError[] = mpegDecoderDecode.errors;

const opusDecoderDecode: OpusDecodedAudio = opusDecoder.decodeFrame(fakeData);
const opusDecoderDecodeChannelData: Float32Array[] =
  opusDecoderDecode.channelData;
const opusDecoderDecodeSamplesDecoded: number =
  opusDecoderDecode.samplesDecoded;
const opusDecoderDecodeSampleRate: number = opusDecoderDecode.sampleRate;
const opusDecoderDecodeErrors: OpusDecodeError[] = opusDecoderDecode.errors;

const opusMlDecoderDecode: OpusMLDecodedAudio =
  opusMlDecoder.decodeFrame(fakeData);
const opusMlDecoderDecodeChannelData: Float32Array[] =
  opusMlDecoderDecode.channelData;
const opusMlDecoderDecodeSamplesDecoded: number =
  opusMlDecoderDecode.samplesDecoded;
const opusMlDecoderDecodeSampleRate: number = opusMlDecoderDecode.sampleRate;
const opusMlDecoderDecodeErrors: OpusMLDecodeError[] =
  opusMlDecoderDecode.errors;

const oggOpusDecoderDecode: OggOpusDecodedAudio =
  oggOpusDecoder.decode(fakeData);
const oggOpusDecoderDecodeChannelData: Float32Array[] =
  oggOpusDecoderDecode.channelData;
const oggOpusDecoderDecodeSamplesDecoded: number =
  oggOpusDecoderDecode.samplesDecoded;
const oggOpusDecoderDecodeSampleRate: number = oggOpusDecoderDecode.sampleRate;
const oggOpusDecoderDecodeErrors: OggOpusDecodeError[] =
  oggOpusDecoderDecode.errors;

const flacDecoderDecode: FLACDecodedAudio = await flacDecoder.decode(fakeData);
const flacDecoderDecodeChannelData: Float32Array[] =
  flacDecoderDecode.channelData;
const flacDecoderDecodeSamplesDecoded: number =
  flacDecoderDecode.samplesDecoded;
const flacDecoderDecodeSampleRate: number = flacDecoderDecode.sampleRate;
const flacDecoderDecodeErrors: FLACDecodeError[] = flacDecoderDecode.errors;

const oggVorbisDecoderDecode: OggVorbisDecodedAudio =
  await oggVorbisDecoder.decode(fakeData);
const oggVorbisDecoderDecodeChannelData: Float32Array[] =
  oggVorbisDecoderDecode.channelData;
const oggVorbisDecoderDecodeSamplesDecoded: number =
  oggVorbisDecoderDecode.samplesDecoded;
const oggVorbisDecoderDecodeSampleRate: number =
  oggVorbisDecoderDecode.sampleRate;
const oggVorbisDecoderDecodeErrors: OggVorbisDecodeError[] =
  oggVorbisDecoderDecode.errors;
