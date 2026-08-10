import fs from "fs/promises";
import path from "path";
import { gunzip } from "zlib";
import CodecParser from "codec-parser";

import {
  getInterleaved,
  getWaveFileHeader,
  testDecoder_decode,
  testDecoder_decodeAndFlush,
  testDecoder_decodeFrame,
  testDecoder_decodeFrames,
} from "./utilities";

import { nestedWorker } from "./nested-worker";

import { MPEGDecoder, MPEGDecoderWebWorker } from "mpg123-decoder";
import { OpusDecoder, OpusDecoderWebWorker } from "opus-decoder";
import {
  OpusMLDecoder,
  OpusMLDecoderWebWorker,
} from "@wasm-audio-decoders/opus-ml";
import { OggOpusDecoder, OggOpusDecoderWebWorker } from "ogg-opus-decoder";
import { FLACDecoder, FLACDecoderWebWorker } from "@wasm-audio-decoders/flac";
import {
  OggVorbisDecoder,
  OggVorbisDecoderWebWorker,
} from "@wasm-audio-decoders/ogg-vorbis";
import { AACDecoder, AACDecoderWebWorker } from "@wasm-audio-decoders/aac";

const EXPECTED_PATH = new URL("expected", import.meta.url).pathname;
const ACTUAL_PATH = new URL("actual", import.meta.url).pathname;
const TEST_DATA_PATH = new URL("data", import.meta.url).pathname;

const getTestPaths = (
  fileName,
  outputFileName,
  expectedPathModifiers = [],
  actualPathModifiers = [],
) => ({
  fileName,
  inputPath: path.join(TEST_DATA_PATH, fileName),
  actualPath: path.join(
    ACTUAL_PATH,
    (outputFileName || fileName) +
      ["", ...actualPathModifiers].join(".") +
      ".wav",
  ),
  expectedPath: path.join(
    EXPECTED_PATH,
    (outputFileName || fileName) +
      ["", ...expectedPathModifiers].join(".") +
      ".wav",
  ),
});

const test_decode = async (
  decoder,
  method,
  testName,
  fileName,
  outputFileName,
  expectedPathModifiers = [],
  actualPathModifiers = [],
  shouldFree = true,
) => {
  try {
    if (decoder.constructor.name.match(/WebWorker/))
      actualPathModifiers.push("worker");

    const paths = getTestPaths(
      fileName,
      outputFileName,
      expectedPathModifiers,
      actualPathModifiers,
    );

    const result = await decoder.ready.then(() =>
      testDecoder_decode(
        decoder,
        method,
        testName,
        paths.inputPath,
        paths.actualPath,
      ),
    );

    return { paths, result };
  } finally {
    if (shouldFree) {
      await decoder.free();
    }
  }
};

const test_decodeChunks = async (
  decoder,
  method,
  testName,
  fileName,
  outputFileName,
  expectedPathModifiers = [],
  actualPathModifiers = [],
  chunkSize,
) => {
  if (decoder.constructor.name.match(/WebWorker/))
    actualPathModifiers.push("worker");

  const paths = getTestPaths(
    fileName,
    outputFileName,
    expectedPathModifiers,
    actualPathModifiers,
  );

  const result = await decoder.ready
    .then(() =>
      testDecoder_decodeAndFlush(
        decoder,
        method,
        testName,
        paths.inputPath,
        paths.actualPath,
        chunkSize,
      ),
    )
    .finally(() => decoder.free());

  return { paths, result };
};

const test_decode_multipleFiles = async (DecoderClass, testParams) => {
  const pathsArray = testParams.map(({ fileName }) => getTestPaths(fileName));

  const inputFiles = await Promise.all(
    pathsArray.map(({ inputPath }) => fs.readFile(inputPath)),
  );

  const decoder = new DecoderClass();

  const decodedFiles = [];

  await decoder.ready;

  for (const file of inputFiles)
    await decoder
      .decode(file)
      .then((result) => decodedFiles.push(result))
      .then(() => decoder.reset());

  await decoder.free();

  let idx = 0;

  return Promise.all(
    decodedFiles.map(async ({ samplesDecoded, sampleRate, channelData }) => {
      const paths = pathsArray[idx++];

      const actual = Buffer.concat([
        getWaveFileHeader({
          bitDepth: 16,
          sampleRate,
          length:
            samplesDecoded * Int16Array.BYTES_PER_ELEMENT * channelData.length,
          channels: channelData.length,
        }),
        getInterleaved(channelData, samplesDecoded),
      ]);

      await fs.writeFile(paths.actualPath, actual);

      return {
        paths,
        result: { samplesDecoded, sampleRate },
      };
    }),
  );
};

const test_decodeFrame = async (
  decoder,
  testName,
  fileName,
  outputFileName,
  frames,
  framesLength,
  expectedPathModifiers = [],
  actualPathModifiers = [],
) => {
  if (decoder.constructor.name.match(/WebWorker/))
    actualPathModifiers.push("worker");
  const paths = getTestPaths(
    fileName,
    outputFileName,
    expectedPathModifiers,
    actualPathModifiers,
  );

  const result = await decoder.ready
    .then(() =>
      testDecoder_decodeFrame(
        decoder,
        testName,
        frames,
        framesLength,
        paths.actualPath,
      ),
    )
    .finally(() => decoder.free());

  return { paths, result };
};

const test_decodeFrames = async (
  decoder,
  testName,
  fileName,
  outputFileName,
  frames,
  framesLength,
  expectedPathModifiers = [],
  actualPathModifiers = [],
) => {
  if (decoder.constructor.name.match(/WebWorker/))
    actualPathModifiers.push("worker");
  const paths = getTestPaths(
    fileName,
    outputFileName,
    expectedPathModifiers,
    actualPathModifiers,
  );

  const result = await decoder.ready
    .then(() =>
      testDecoder_decodeFrames(
        decoder,
        testName,
        frames,
        framesLength,
        paths.actualPath,
      ),
    )
    .finally(() => decoder.free());

  return { paths, result };
};

const decompressExpectedFiles = async () => {
  const files = await fs.readdir(EXPECTED_PATH);
  const decompressPromises = [];

  const compressed = new Set();
  const decompressed = new Set();

  for (const file of files) {
    if (file.match(/.*gz$/)) compressed.add(file);
    else if (file.match(/.*wav$/)) decompressed.add(file);
  }

  for (const file of compressed) {
    //if (!decompressed.has(file))
    decompressPromises.push(
      new Promise((res, rej) => {
        return fs.readFile(path.join(EXPECTED_PATH, file)).then((data) => {
          gunzip(data, async (err, uncompressed) => {
            if (err) {
              rej(err);
            } else {
              fs.writeFile(
                path.join(EXPECTED_PATH, file.slice(0, -3)),
                uncompressed,
              ).then(() => {
                res();
              });
            }
          });
        });
      }).catch((e) => {
        console.warn("failed to decompress", file);
        throw e;
      }),
    );
  }

  await Promise.all(decompressPromises).catch((e) => {
    console.error(e);
    throw new Error(
      "Failed to decompress one or more expected test files. Check that the test files are valid gzip.",
    );
  });
};

describe("wasm-audio-decoders", () => {
  const flacStereoTestFile = "flac.flac";
  const flacMultichannelTestFile = "flac.8.flac";
  const flac96000kTestFile = "flac.96000.flac";
  const oggFlacStereoTestFile = "flac.ogg";
  const oggFlacMultichannelTestFile = "flac.8.ogg";
  const oggFlac96000kTestFile = "flac.96000.ogg";
  const oggVorbisStereoTestFile = "ogg.vorbis";
  const oggVorbis96000kTestFile = "ogg.vorbis.96000.ogg";
  const oggVorbisLargeCommentTestFile = "ogg.vorbis.large.comment.ogg";
  const oggVorbisMultichannelTestFile = "ogg.vorbis.8.ogg";
  const oggVorbis32TestFile = "ogg.vorbis.32.ogg";
  const oggVorbis64TestFile = "ogg.vorbis.64.ogg";
  const oggVorbis255TestFile = "ogg.vorbis.255.ogg";
  const oggVorbisChained2TestFile = "ogg.vorbis.chained2.ogg";
  const oggVorbisPacketsTestFile = "ogg.vorbis.packets.ogg";
  const oggVorbisFisheadTestFile = "ogg.vorbis.fishead.ogg";
  const oggVorbisInvalidModeCountTestFile = "ogg.vorbis.invalid.mode.count.ogg";

  const opusStereoTestFile = "ogg.opus";
  const opusStereoErrorsTestFile = "ogg.errors.opus";
  const opusSurroundTestFile = "ogg.opus.surround";
  const opus32TestFile = "ogg.opus.32.ogg";
  const opus64TestFile = "ogg.opus.64.ogg";
  const opus255TestFile = "ogg.opus.255.ogg";

  // OSCE test files from https://opus-codec.org/demo/opus-1.5/
  // opusenc --bitrate 5 --vbr --set-ctl-int 4008=1103 female_ref.wav opus_osce_female_ref_5kbs.ogg
  const opusOsceFemale5kbsTestFile = "opus_osce_female_ref_5kbs.ogg";
  const opusOsceFemale6kbsTestFile = "opus_osce_female_ref_6kbs.ogg";
  const opusOsceFemale9kbsTestFile = "opus_osce_female_ref_9kbs.ogg";
  const opusOsceFemale12kbsTestFile = "opus_osce_female_ref_12kbs.ogg";
  const opusOsceMale5kbsTestFile = "opus_osce_male_ref_5kbs.ogg";
  const opusOsceMale6kbsTestFile = "opus_osce_male_ref_6kbs.ogg";
  const opusOsceMale9kbsTestFile = "opus_osce_male_ref_9kbs.ogg";
  const opusOsceMale12kbsTestFile = "opus_osce_male_ref_12kbs.ogg";

  // ffmpeg -i flac.flac -c:a libfdk_aac -b:a 128k -f adts aac.lc.adts
  const aacStereoTestFile = "aac.lc.adts";
  // ffmpeg -i flac.flac -ac 1 -c:a libfdk_aac -b:a 64k -f adts aac.lc.mono.adts
  const aacMonoTestFile = "aac.lc.mono.adts";
  // ffmpeg -i flac.flac -c:a libfdk_aac -profile:a aac_he -b:a 48k -f adts aac.he_v1.adts
  const aacHeV1TestFile = "aac.he_v1.adts";
  // ffmpeg -i flac.flac -c:a libfdk_aac -profile:a aac_he_v2 -b:a 32k -f adts aac.he_v2.adts
  const aacHeV2TestFile = "aac.he_v2.adts";
  // ffmpeg -i flac.flac -t 30 -af "pan=5.1|FL=FL|FR=FR|FC=0.6*FL+0.6*FR|LFE=0.1*FL|BL=0.8*FL|BR=0.8*FR" -c:a libfdk_aac -b:a 320k -f adts aac.lc.5_1.adts
  const aacSurround51TestFile = "aac.lc.5_1.adts";
  // ffmpeg -i flac.flac -t 30 -af "pan=7.1|FL=FL|FR=FR|FC=0.6*FL+0.6*FR|LFE=0.1*FL|BL=0.8*FL|BR=0.8*FR|SL=0.4*FL|SR=0.4*FR" -c:a libfdk_aac -b:a 448k -f adts aac.lc.7_1.adts
  const aacSurround71TestFile = "aac.lc.7_1.adts";
  // ADIF header (VBR, PCE: AAC-LC 44100 Hz stereo CPE) followed by the raw
  // frame payloads of a 30 second 128k CBR ADTS encode of flac.flac
  const aacAdifTestFile = "aac.adif";

  beforeAll(async () => {
    await decompressExpectedFiles();
  });

  describe("common", () => {
    const mpegTestFile = path.join(TEST_DATA_PATH, "mpeg.cbr.mp3");

    it("should decode within a worker thread", async () => {
      await nestedWorker(mpegTestFile, "mpg123-decoder", "MPEGDecoder");
    });

    it("should decode within a worker thread nested worker", async () => {
      await nestedWorker(
        mpegTestFile,
        "mpg123-decoder",
        "MPEGDecoderWebWorker",
      );
    });
  });

  describe("mpg123-decoder", () => {
    it("should have name as an instance and static property for MPEGDecoder", async () => {
      const decoder = new MPEGDecoder();
      const name = decoder.constructor.name;
      await decoder.ready;
      decoder.free();

      expect(name).toEqual("MPEGDecoder");
      expect(MPEGDecoder.name).toEqual("MPEGDecoder");
    });

    it("should have name as an instance and static property for MPEGDecoderWebWorker", async () => {
      const decoder = new MPEGDecoderWebWorker();
      const name = decoder.constructor.name;
      await decoder.ready;
      await decoder.free();

      expect(name).toEqual("MPEGDecoderWebWorker");
      expect(MPEGDecoderWebWorker.name).toEqual("MPEGDecoderWebWorker");
    });

    it("should decode mpeg", async () => {
      const { paths, result } = await test_decode(
        new MPEGDecoder(),
        "decode",
        "should decode mpeg",
        "mpeg.cbr.mp3",
      );

      const [actual, expected] = await Promise.all([
        fs.readFile(paths.actualPath),
        fs.readFile(paths.expectedPath),
      ]);

      expect(result.samplesDecoded).toEqual(3497536);
      expect(result.sampleRate).toEqual(44100);
      expect(actual.length).toEqual(expected.length);
      expect(Buffer.compare(actual, expected)).toEqual(0);
    });

    describe("Gapless decoding", () => {
      it("should decode mpeg with gaps when enableGapless is false", async () => {
        const { paths, result } = await test_decode(
          new MPEGDecoder({
            enableGapless: false,
          }),
          "decode",
          "should decode mpeg with gaps when enableGapless is false",
          "44100.mono.cbr.mp3",
          "44100.gaps.mono.cbr.mp3",
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(46080);
        expect(result.sampleRate).toEqual(44100);
        expect(actual.length).toEqual(expected.length);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode stereo mpeg with gaps when enableGapless is true", async () => {
        const { paths, result } = await test_decode(
          new MPEGDecoder({
            enableGapless: false,
          }),
          "decode",
          "should decode mpeg without gaps when enableGapless is true",
          "44100.stereo.cbr.mp3",
          "44100.gaps.stereo.cbr.mp3",
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(46080);
        expect(result.sampleRate).toEqual(44100);
        expect(actual.length).toEqual(expected.length);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode mono mpeg without gaps when enableGapless is true (default)", async () => {
        const { paths, result } = await test_decode(
          new MPEGDecoder(),
          "decode",
          "should decode mpeg without gaps when enableGapless is true (default)",
          "44100.mono.cbr.mp3",
          "44100.nogaps.mono.cbr.mp3",
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(44100);
        expect(result.sampleRate).toEqual(44100);
        expect(actual.length).toEqual(expected.length);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode stereo mpeg without gaps when enableGapless is true (default)", async () => {
        const { paths, result } = await test_decode(
          new MPEGDecoder(),
          "decode",
          "should decode mpeg without gaps when enableGapless is true (default)",
          "44100.stereo.cbr.mp3",
          "44100.nogaps.stereo.cbr.mp3",
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(44100);
        expect(result.sampleRate).toEqual(44100);
        expect(actual.length).toEqual(expected.length);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });
    });

    it("should decode mpeg with errors", async () => {
      const { paths, result } = await test_decode(
        new MPEGDecoder(),
        "decode",
        "should decode mpeg with errors",
        "mpeg.cbr.errors.mp3",
      );

      const [actual, expected] = await Promise.all([
        fs.readFile(paths.actualPath),
        fs.readFile(paths.expectedPath),
      ]);

      expect(result.samplesDecoded).toEqual(3488879);
      expect(result.sampleRate).toEqual(44100);
      expect(actual.length).toEqual(expected.length);
      expect(Buffer.compare(actual, expected)).toEqual(0);
      expect(result.errors).toEqual([
        {
          frameLength: 0,
          frameNumber: 0,
          inputBytes: 65536,
          message: "-1 MPG123_ERR",
          outputSamples: 623,
        },
        {
          frameLength: 0,
          frameNumber: 0,
          inputBytes: 65536,
          message: "-1 MPG123_ERR",
          outputSamples: 623,
        },
      ]);
    });

    it("should decode mpeg in a web worker", async () => {
      const { paths, result } = await test_decode(
        new MPEGDecoderWebWorker(),
        "decode",
        "should decode mpeg in a web worker",
        "mpeg.cbr.mp3",
      );

      const [actual, expected] = await Promise.all([
        fs.readFile(paths.actualPath),
        fs.readFile(paths.expectedPath),
      ]);

      expect(result.samplesDecoded).toEqual(3497536);
      expect(result.sampleRate).toEqual(44100);
      expect(actual.length).toEqual(expected.length);
      expect(Buffer.compare(actual, expected)).toEqual(0);
    });

    //it("should decode a large mpeg", async () => {
    //  const decoder = new MPEGDecoder();
    //  await decoder.ready;
    //
    //  const fileName = "waug-edm-fest-spr-2015.mp3";
    //  const paths = getTestPaths(fileName);
    //
    //  const { sampleRate, samplesDecoded } = await testDecoder_decode(
    //    decoder,
    //    fileName,
    //    paths.inputPath,
    //    paths.actualPath
    //  );
    //
    //  decoder.free()
    //
    //  expect(samplesDecoded).toEqual(751564800);
    //  expect(sampleRate).toEqual(44100);
    //}, 100000);

    it("should decode mpeg while reading small chunks", async () => {
      const { paths, result } = await test_decodeChunks(
        new MPEGDecoder(),
        "decode",
        "should decode mpeg while reading small chunks",
        "mpeg.cbr.mp3",
        "mpeg.cbr.mp3",
        [],
        [],
        123,
      );

      const [actual, expected] = await Promise.all([
        fs.readFile(paths.actualPath),
        fs.readFile(paths.expectedPath),
      ]);

      expect(result.samplesDecoded).toEqual(3497536);
      expect(result.sampleRate).toEqual(44100);
      expect(actual.length).toEqual(expected.length);
      expect(Buffer.compare(actual, expected)).toEqual(0);
    });

    describe("frame decoding", () => {
      let mpegCbrFrames,
        mpegCbrFramesLength,
        oneSecondMonoFrames,
        oneSecondMonoFramesLength,
        oneSecondStereoFrames,
        oneSecondStereoFramesLength;

      beforeAll(async () => {
        const [mpegCbrFramesInputData, oneSecondMono, oneSecondStereo] =
          await Promise.all([
            fs.readFile(getTestPaths("mpeg.cbr.mp3").inputPath),
            fs.readFile(getTestPaths("44100.mono.cbr.mp3").inputPath),
            fs.readFile(getTestPaths("44100.stereo.cbr.mp3").inputPath),
          ]);

        const parser = new CodecParser("audio/mpeg");

        mpegCbrFrames = parser
          .parseAll(mpegCbrFramesInputData)
          .map((frame) => frame.data);
        mpegCbrFramesLength = mpegCbrFrames.reduce(
          (acc, data) => acc + data.length,
          0,
        );

        oneSecondMonoFrames = parser
          .parseAll(oneSecondMono)
          .map((frame) => frame.data);
        oneSecondMonoFramesLength = oneSecondMonoFrames.reduce(
          (acc, data) => acc + data.length,
          0,
        );

        oneSecondStereoFrames = parser
          .parseAll(oneSecondStereo)
          .map((frame) => frame.data);
        oneSecondStereoFramesLength = oneSecondStereoFrames.reduce(
          (acc, data) => acc + data.length,
          0,
        );
      });

      it("should decode mpeg frames", async () => {
        const { paths, result } = await test_decodeFrames(
          new MPEGDecoder(),
          "should decode mpeg frames in a web worker",
          "mpeg.cbr.mp3",
          null,
          mpegCbrFrames,
          mpegCbrFramesLength,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(3497536);
        expect(result.sampleRate).toEqual(44100);
        expect(actual.length).toEqual(expected.length);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode mpeg frames in a web worker", async () => {
        const { paths, result } = await test_decodeFrames(
          new MPEGDecoderWebWorker(),
          "should decode mpeg frames in a web worker",
          "mpeg.cbr.mp3",
          null,
          mpegCbrFrames,
          mpegCbrFramesLength,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(3497536);
        expect(result.sampleRate).toEqual(44100);
        expect(actual.length).toEqual(expected.length);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      describe("Gapless frame decoding", () => {
        it("should decode mono mpeg frames with gaps when enableGapless is false", async () => {
          const { paths, result } = await test_decodeFrames(
            new MPEGDecoder({
              enableGapless: false,
            }),
            "should decode mono mpeg frames with gaps when enableGapless is false",
            "44100.mono.cbr.mp3",
            "44100.gaps.mono.cbr.mp3",
            oneSecondMonoFrames,
            oneSecondMonoFramesLength,
          );

          const [actual, expected] = await Promise.all([
            fs.readFile(paths.actualPath),
            fs.readFile(paths.expectedPath),
          ]);

          expect(result.samplesDecoded).toEqual(46080);
          expect(result.sampleRate).toEqual(44100);
          expect(actual.length).toEqual(expected.length);
          expect(Buffer.compare(actual, expected)).toEqual(0);
        });

        it("should decode stereo mpeg frames with gaps when enableGapless is false", async () => {
          const { paths, result } = await test_decodeFrames(
            new MPEGDecoder({
              enableGapless: false,
            }),
            "should decode stereo mpeg frames with gaps when enableGapless is false",
            "44100.stereo.cbr.mp3",
            "44100.gaps.stereo.cbr.mp3",
            oneSecondStereoFrames,
            oneSecondStereoFramesLength,
          );

          const [actual, expected] = await Promise.all([
            fs.readFile(paths.actualPath),
            fs.readFile(paths.expectedPath),
          ]);

          expect(result.samplesDecoded).toEqual(46080);
          expect(result.sampleRate).toEqual(44100);
          expect(actual.length).toEqual(expected.length);
          expect(Buffer.compare(actual, expected)).toEqual(0);
        });

        it("should decode mono mpeg frames without gaps when enableGapless is true (default)", async () => {
          const { paths, result } = await test_decodeFrames(
            new MPEGDecoder(),
            "should decode mono mpeg frames without gaps when enableGapless is true (default)",
            "44100.mono.cbr.mp3",
            "44100.nogaps.mono.cbr.mp3",
            oneSecondMonoFrames,
            oneSecondMonoFramesLength,
          );

          const [actual, expected] = await Promise.all([
            fs.readFile(paths.actualPath),
            fs.readFile(paths.expectedPath),
          ]);

          expect(result.samplesDecoded).toEqual(44100);
          expect(result.sampleRate).toEqual(44100);
          expect(actual.length).toEqual(expected.length);
          expect(Buffer.compare(actual, expected)).toEqual(0);
        });

        it("should decode stereo mpeg frames without gaps when enableGapless is true (default)", async () => {
          const { paths, result } = await test_decodeFrames(
            new MPEGDecoder(),
            "should decode stereo mpeg frames without gaps when enableGapless is true (default)",
            "44100.stereo.cbr.mp3",
            "44100.nogaps.stereo.cbr.mp3",
            oneSecondStereoFrames,
            oneSecondStereoFramesLength,
          );

          const [actual, expected] = await Promise.all([
            fs.readFile(paths.actualPath),
            fs.readFile(paths.expectedPath),
          ]);

          expect(result.samplesDecoded).toEqual(44100);
          expect(result.sampleRate).toEqual(44100);
          expect(actual.length).toEqual(expected.length);
          expect(Buffer.compare(actual, expected)).toEqual(0);
        });
      });
    });

    describe("decoding in sequence", () => {
      it("should decode each file one at a time when decoding from the same instance", async () => {
        const results = await test_decode_multipleFiles(MPEGDecoderWebWorker, [
          {
            testName: "should decode sequential.1.mp3 in sequence",
            fileName: "sequential.1.mp3",
          },
          {
            testName: "should decode sequential.2.mp3 in sequence",
            fileName: "sequential.2.mp3",
          },
          {
            testName: "should decode sequential.3.mp3 in sequence",
            fileName: "sequential.3.mp3",
          },
          {
            testName: "should decode sequential.4.mp3 in sequence",
            fileName: "sequential.4.mp3",
          },
        ]);

        const [
          actual1,
          expected1,
          actual2,
          expected2,
          actual3,
          expected3,
          actual4,
          expected4,
        ] = await Promise.all([
          fs.readFile(results[0].paths.actualPath),
          fs.readFile(results[0].paths.expectedPath),
          fs.readFile(results[1].paths.actualPath),
          fs.readFile(results[1].paths.expectedPath),
          fs.readFile(results[2].paths.actualPath),
          fs.readFile(results[2].paths.expectedPath),
          fs.readFile(results[3].paths.actualPath),
          fs.readFile(results[3].paths.expectedPath),
        ]);

        expect(results[0].result.sampleRate).toEqual(44100);
        expect(results[0].result.samplesDecoded).toEqual(19764);
        expect(results[1].result.sampleRate).toEqual(44100);
        expect(results[1].result.samplesDecoded).toEqual(19764);
        expect(results[2].result.sampleRate).toEqual(44100);
        expect(results[2].result.samplesDecoded).toEqual(19764);
        expect(results[3].result.sampleRate).toEqual(44100);
        expect(results[3].result.samplesDecoded).toEqual(19764);

        expect(actual1.length).toEqual(expected1.length);
        expect(actual2.length).toEqual(expected2.length);
        expect(actual3.length).toEqual(expected3.length);
        expect(actual4.length).toEqual(expected4.length);
        expect(Buffer.compare(actual1, expected1)).toEqual(0);
        expect(Buffer.compare(actual2, expected2)).toEqual(0);
        expect(Buffer.compare(actual3, expected3)).toEqual(0);
        expect(Buffer.compare(actual4, expected4)).toEqual(0);
      });
    });

    describe("decoding in parallel", () => {
      it("should decode each file in it's own thread", async () => {
        const [
          { paths: paths1, result: result1 },
          { paths: paths2, result: result2 },
          { paths: paths3, result: result3 },
          { paths: paths4, result: result4 },
        ] = await Promise.all([
          test_decode(
            new MPEGDecoderWebWorker(),
            "decode",
            "should decode parallel.1.mp3 in it's own thread",
            "parallel.1.mp3",
          ),
          test_decode(
            new MPEGDecoderWebWorker(),
            "decode",
            "should decode parallel.2.mp3 in it's own thread",
            "parallel.2.mp3",
          ),
          test_decode(
            new MPEGDecoderWebWorker(),
            "decode",
            "should decode parallel.3.mp3 in it's own thread",
            "parallel.3.mp3",
          ),
          test_decode(
            new MPEGDecoderWebWorker(),
            "decode",
            "should decode parallel.4.mp3 in it's own thread",
            "parallel.4.mp3",
          ),
        ]);

        const [
          actual1,
          expected1,
          actual2,
          expected2,
          actual3,
          expected3,
          actual4,
          expected4,
        ] = await Promise.all([
          fs.readFile(paths1.actualPath),
          fs.readFile(paths1.expectedPath),
          fs.readFile(paths2.actualPath),
          fs.readFile(paths2.expectedPath),
          fs.readFile(paths3.actualPath),
          fs.readFile(paths3.expectedPath),
          fs.readFile(paths4.actualPath),
          fs.readFile(paths4.expectedPath),
        ]);

        expect(result1.sampleRate).toEqual(44100);
        expect(result1.samplesDecoded).toEqual(19764);
        expect(result2.sampleRate).toEqual(44100);
        expect(result2.samplesDecoded).toEqual(19764);
        expect(result3.sampleRate).toEqual(44100);
        expect(result3.samplesDecoded).toEqual(19764);
        expect(result4.sampleRate).toEqual(44100);
        expect(result4.samplesDecoded).toEqual(19764);

        expect(actual1.length).toEqual(expected1.length);
        expect(actual2.length).toEqual(expected2.length);
        expect(actual3.length).toEqual(expected3.length);
        expect(actual4.length).toEqual(expected4.length);
        expect(Buffer.compare(actual1, expected1)).toEqual(0);
        expect(Buffer.compare(actual2, expected2)).toEqual(0);
        expect(Buffer.compare(actual3, expected3)).toEqual(0);
        expect(Buffer.compare(actual4, expected4)).toEqual(0);
      });
    });
  });

  describe("opus-decoder", () => {
    let opusStereoFrames,
      opusStereoHeader,
      opusStereoSampleCount,
      opusStereoFramesLength,
      opusSurroundFrames,
      opusSurroundHeader,
      opusSurroundSampleCount,
      opusSurroundFramesLength,
      opus32Frames,
      opus32Header,
      opus32SampleCount,
      opus32FramesLength,
      opus64Frames,
      opus64Header,
      opus64SampleCount,
      opus64FramesLength,
      opus255Frames,
      opus255Header,
      opus255SampleCount,
      opus255FramesLength;

    const getFrames = (codecFrames) => {
      let length = 0,
        header,
        frames,
        absoluteGranulePosition;

      frames = codecFrames
        .flatMap((frame) => {
          absoluteGranulePosition = frame.absoluteGranulePosition;
          return frame.codecFrames;
        })
        .map((codecFrame) => {
          length += codecFrame.data.length;
          header = codecFrame.header;
          return codecFrame.data;
        });

      return [frames, header, length, Number(absoluteGranulePosition)];
    };

    beforeAll(async () => {
      const parser = new CodecParser("application/ogg");

      [
        opusStereoFrames,
        opusStereoHeader,
        opusStereoFramesLength,
        opusStereoSampleCount,
      ] = getFrames(
        parser.parseAll(
          await fs.readFile(getTestPaths(opusStereoTestFile).inputPath),
        ),
      );

      [
        opusSurroundFrames,
        opusSurroundHeader,
        opusSurroundFramesLength,
        opusSurroundSampleCount,
      ] = getFrames(
        parser.parseAll(
          await fs.readFile(getTestPaths(opusSurroundTestFile).inputPath),
        ),
      );

      [opus32Frames, opus32Header, opus32FramesLength, opus32SampleCount] =
        getFrames(
          parser.parseAll(
            await fs.readFile(getTestPaths(opus32TestFile).inputPath),
          ),
        );

      [opus64Frames, opus64Header, opus64FramesLength, opus64SampleCount] =
        getFrames(
          parser.parseAll(
            await fs.readFile(getTestPaths(opus64TestFile).inputPath),
          ),
        );

      [opus255Frames, opus255Header, opus255FramesLength, opus255SampleCount] =
        getFrames(
          parser.parseAll(
            await fs.readFile(getTestPaths(opus255TestFile).inputPath),
          ),
        );
    });

    it("should have name as an instance and static property for OpusDecoder", async () => {
      const decoder = new OpusDecoder();
      const name = decoder.constructor.name;
      await decoder.ready;
      decoder.free();

      expect(name).toEqual("OpusDecoder");
      expect(OpusDecoder.name).toEqual("OpusDecoder");
    });

    it("should have name as an instance and static property for OpusDecoderWebWorker", async () => {
      const decoder = new OpusDecoderWebWorker();
      const name = decoder.constructor.name;
      await decoder.ready;
      await decoder.free();

      expect(name).toEqual("OpusDecoderWebWorker");
      expect(OpusDecoderWebWorker.name).toEqual("OpusDecoderWebWorker");
    });

    describe("decodeFrame", () => {
      it("should decode opus frames", async () => {
        const { preSkip } = opusStereoHeader;

        const { paths, result } = await test_decodeFrame(
          new OpusDecoder({
            preSkip,
          }),
          "should decode opus frames",
          opusStereoTestFile,
          opusStereoTestFile.replace("ogg.", "").replace(".ogg", ""),
          opusStereoFrames,
          opusStereoFramesLength,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(3807048); //3807154, 204
        expect(result.sampleRate).toEqual(48000);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode opus frames in a web worker", async () => {
        const { preSkip } = opusStereoHeader;
        const { paths, result } = await test_decodeFrame(
          new OpusDecoderWebWorker({
            preSkip,
          }),
          "should decode opus frames in a web worker",
          opusStereoTestFile,
          opusStereoTestFile.replace("ogg.", "").replace(".ogg", ""),
          opusStereoFrames,
          opusStereoFramesLength,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(3807048); //3807154
        expect(result.sampleRate).toEqual(48000);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });
    });

    describe("decodeFrame with errors", () => {
      let opusStereoFramesWithErrors,
        opusStereoFramesLengthWithErrors,
        expectedErrors;

      beforeAll(() => {
        const frameWithErrors = Uint8Array.from({ length: 400 }, () => 1);

        opusStereoFramesWithErrors = [
          ...opusStereoFrames.slice(0, 10),
          frameWithErrors,
          ...opusStereoFrames.slice(10, 20),
          frameWithErrors,
          ...opusStereoFrames.slice(20),
        ];
        opusStereoFramesLengthWithErrors = opusStereoFramesLength + 800;

        expectedErrors = [
          {
            message:
              "libopus -4 OPUS_INVALID_PACKET: The compressed data passed is corrupted",
            frameLength: 400,
            frameNumber: 10,
            inputBytes: 2395,
            outputSamples: 9288,
          },
          {
            message:
              "libopus -4 OPUS_INVALID_PACKET: The compressed data passed is corrupted",
            frameLength: 400,
            frameNumber: 21,
            inputBytes: 4905,
            outputSamples: 18888,
          },
        ];
      });

      it("should decode opus frames and discard any errors", async () => {
        const { preSkip } = opusStereoHeader;

        const { paths, result } = await test_decodeFrame(
          new OpusDecoder({
            preSkip,
          }),
          "should decode opus frames",
          opusStereoTestFile,
          opusStereoTestFile.replace("ogg.", "").replace(".ogg", ""),
          opusStereoFramesWithErrors,
          opusStereoFramesLengthWithErrors,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(3807048); //3807154, 204
        expect(result.sampleRate).toEqual(48000);
        expect(Buffer.compare(actual, expected)).toEqual(0);
        expect(result.errors).toEqual(expectedErrors);
      });

      it("should decode opus frames in a web worker and discard any errors", async () => {
        const { preSkip } = opusStereoHeader;
        const { paths, result } = await test_decodeFrame(
          new OpusDecoderWebWorker({
            preSkip,
          }),
          "should decode opus frames in a web worker and discard any errors",
          opusStereoTestFile,
          opusStereoTestFile.replace("ogg.", "").replace(".ogg", ""),
          opusStereoFramesWithErrors,
          opusStereoFramesLengthWithErrors,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(3807048); //3807154
        expect(result.sampleRate).toEqual(48000);
        expect(Buffer.compare(actual, expected)).toEqual(0);
        expect(result.errors).toEqual(expectedErrors);
      });
    });

    describe("decodeFrames", () => {
      it("should decode opus frames", async () => {
        const { preSkip } = opusStereoHeader;

        const { paths, result } = await test_decodeFrames(
          new OpusDecoder({
            preSkip,
          }),
          "should decode opus frames",
          opusStereoTestFile,
          opusStereoTestFile.replace("ogg.", "").replace(".ogg", ""),
          opusStereoFrames,
          opusStereoFramesLength,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(3807048); //3807154, 204
        expect(result.sampleRate).toEqual(48000);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode opus frames in a web worker", async () => {
        const { preSkip } = opusStereoHeader;
        const { paths, result } = await test_decodeFrames(
          new OpusDecoderWebWorker({
            preSkip,
          }),
          "should decode opus frames in a web worker",
          opusStereoTestFile,
          opusStereoTestFile.replace("ogg.", "").replace(".ogg", ""),
          opusStereoFrames,
          opusStereoFramesLength,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(3807048); //3807154
        expect(result.sampleRate).toEqual(48000);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });
    });

    describe("sampleRates", () => {
      it("should decode 8000Hz opus frames", async () => {
        const sampleRate = 8000;
        const { preSkip } = opusStereoHeader;

        const { paths, result } = await test_decodeFrames(
          new OpusDecoder({
            sampleRate,
            preSkip,
          }),
          "should decode 8000Hz opus frames",
          opusStereoTestFile,
          opusStereoTestFile.replace("ogg.", "").replace(".ogg", ""),
          opusStereoFrames,
          opusStereoFramesLength,
          [sampleRate],
          [sampleRate],
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(634248); //3807154, 204
        expect(result.sampleRate).toEqual(sampleRate);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode 12000Hz opus frames", async () => {
        const sampleRate = 12000;
        const { preSkip } = opusStereoHeader;

        const { paths, result } = await test_decodeFrames(
          new OpusDecoder({
            sampleRate,
            preSkip,
          }),
          "should decode 12000Hz opus frames",
          opusStereoTestFile,
          opusStereoTestFile.replace("ogg.", "").replace(".ogg", ""),
          opusStereoFrames,
          opusStereoFramesLength,
          [sampleRate],
          [sampleRate],
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(951528); //3807154, 204
        expect(result.sampleRate).toEqual(sampleRate);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode 16000Hz opus frames", async () => {
        const sampleRate = 16000;
        const { preSkip } = opusStereoHeader;

        const { paths, result } = await test_decodeFrames(
          new OpusDecoder({
            sampleRate,
            preSkip,
          }),
          "should decode 16000Hz opus frames",
          opusStereoTestFile,
          opusStereoTestFile.replace("ogg.", "").replace(".ogg", ""),
          opusStereoFrames,
          opusStereoFramesLength,
          [sampleRate],
          [sampleRate],
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(1268808); //3807154, 204
        expect(result.sampleRate).toEqual(sampleRate);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode 24000Hz opus frames", async () => {
        const sampleRate = 24000;
        const { preSkip } = opusStereoHeader;

        const { paths, result } = await test_decodeFrames(
          new OpusDecoder({
            sampleRate,
            preSkip,
          }),
          "should decode 24000Hz opus frames",
          opusStereoTestFile,
          opusStereoTestFile.replace("ogg.", "").replace(".ogg", ""),
          opusStereoFrames,
          opusStereoFramesLength,
          [sampleRate],
          [sampleRate],
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(1903368); //3807154, 204
        expect(result.sampleRate).toEqual(sampleRate);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode 48000Hz opus frames", async () => {
        const sampleRate = 48000;
        const { preSkip } = opusStereoHeader;

        const { paths, result } = await test_decodeFrames(
          new OpusDecoder({
            sampleRate,
            preSkip,
          }),
          "should decode 48000Hz opus frames",
          opusStereoTestFile,
          opusStereoTestFile.replace("ogg.", "").replace(".ogg", ""),
          opusStereoFrames,
          opusStereoFramesLength,
          [],
          [sampleRate],
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(3807048); //3807154, 204
        expect(result.sampleRate).toEqual(sampleRate);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });
    });

    describe("decodeFrames with errors", () => {
      let opusStereoFramesWithErrors,
        opusStereoFramesLengthWithErrors,
        expectedErrors;

      beforeAll(() => {
        const frameWithErrors = Uint8Array.from({ length: 400 }, () => 1);

        opusStereoFramesWithErrors = [
          ...opusStereoFrames.slice(0, 10),
          frameWithErrors,
          ...opusStereoFrames.slice(10, 20),
          frameWithErrors,
          ...opusStereoFrames.slice(20),
        ];
        opusStereoFramesLengthWithErrors = opusStereoFramesLength + 800;

        expectedErrors = [
          {
            message:
              "libopus -4 OPUS_INVALID_PACKET: The compressed data passed is corrupted",
            frameLength: 400,
            frameNumber: 10,
            inputBytes: 2395,
            outputSamples: 9288,
          },
          {
            message:
              "libopus -4 OPUS_INVALID_PACKET: The compressed data passed is corrupted",
            frameLength: 400,
            frameNumber: 21,
            inputBytes: 4905,
            outputSamples: 18888,
          },
        ];
      });

      it("should decode opus frames and discard any errors and discard any errors", async () => {
        const { preSkip } = opusStereoHeader;

        const { paths, result } = await test_decodeFrames(
          new OpusDecoder({
            preSkip,
          }),
          "should decode opus frames",
          opusStereoTestFile,
          opusStereoTestFile.replace("ogg.", "").replace(".ogg", ""),
          opusStereoFramesWithErrors,
          opusStereoFramesLengthWithErrors,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(3807048); //3807154, 204
        expect(result.sampleRate).toEqual(48000);
        expect(Buffer.compare(actual, expected)).toEqual(0);
        expect(result.errors).toEqual(expectedErrors);
      });

      it("should decode opus frames in a web worker and discard any errors", async () => {
        const { preSkip } = opusStereoHeader;
        const { paths, result } = await test_decodeFrames(
          new OpusDecoderWebWorker({
            preSkip,
          }),
          "should decode opus frames in a web worker",
          opusStereoTestFile,
          opusStereoTestFile.replace("ogg.", "").replace(".ogg", ""),
          opusStereoFramesWithErrors,
          opusStereoFramesLengthWithErrors,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(3807048); //3807154
        expect(result.sampleRate).toEqual(48000);
        expect(Buffer.compare(actual, expected)).toEqual(0);
        expect(result.errors).toEqual(expectedErrors);
      });
    });

    describe("5.1 Channels", () => {
      it("should decode 5.1 channel opus frames", async () => {
        const {
          channels,
          channelMappingTable,
          coupledStreamCount,
          streamCount,
          preSkip,
        } = opusSurroundHeader;

        const { paths, result } = await test_decodeFrames(
          new OpusDecoder({
            channels,
            channelMappingTable,
            coupledStreamCount,
            streamCount,
            preSkip,
          }),
          "should decode 5.1 channel opus frames",
          opusSurroundTestFile,
          opusSurroundTestFile.replace("ogg.", "").replace(".ogg", ""),
          opusSurroundFrames,
          opusSurroundFramesLength,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(1042248); //1042489
        expect(result.sampleRate).toEqual(48000);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode 5.1 channel opus frames in a web worker", async () => {
        const {
          channels,
          channelMappingTable,
          coupledStreamCount,
          streamCount,
          preSkip,
        } = opusSurroundHeader;
        const { paths, result } = await test_decodeFrames(
          new OpusDecoderWebWorker({
            channels,
            channelMappingTable,
            coupledStreamCount,
            streamCount,
            preSkip,
          }),
          "should decode 5.1 channel opus frames in a web worker",
          opusSurroundTestFile,
          opusSurroundTestFile.replace("ogg.", "").replace(".ogg", ""),
          opusSurroundFrames,
          opusSurroundFramesLength,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(1042248); //1042489
        expect(result.sampleRate).toEqual(48000);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });
    });

    describe("32 Channels", () => {
      it("should decode 32 channel opus frames", async () => {
        const {
          channels,
          channelMappingTable,
          coupledStreamCount,
          streamCount,
          preSkip,
        } = opus32Header;
        const { paths, result } = await test_decodeFrames(
          new OpusDecoder({
            channels,
            channelMappingTable,
            coupledStreamCount,
            streamCount,
            preSkip,
          }),
          "should decode 32 channel opus frames",
          opus32TestFile,
          opus32TestFile.replace("ogg.", "").replace(".ogg", ""),
          opus32Frames,
          opus32FramesLength,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(287688); //287063
        expect(result.sampleRate).toEqual(48000);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode 32 channel opus frames in a web worker", async () => {
        const {
          channels,
          channelMappingTable,
          coupledStreamCount,
          streamCount,
          preSkip,
        } = opus32Header;
        const { paths, result } = await test_decodeFrames(
          new OpusDecoderWebWorker({
            channels,
            channelMappingTable,
            coupledStreamCount,
            streamCount,
            preSkip,
          }),
          "should decode 32 channel opus frames in a web worker",
          opus32TestFile,
          opus32TestFile.replace("ogg.", "").replace(".ogg", ""),
          opus32Frames,
          opus32FramesLength,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(287688); //287063
        expect(result.sampleRate).toEqual(48000);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });
    });

    describe("64 Channels", () => {
      it("should decode 64 channel opus frames", async () => {
        const {
          channels,
          channelMappingTable,
          coupledStreamCount,
          streamCount,
          preSkip,
        } = opus64Header;
        const { paths, result } = await test_decodeFrames(
          new OpusDecoder({
            channels,
            channelMappingTable,
            coupledStreamCount,
            streamCount,
            preSkip,
          }),
          "should decode 64 channel opus frames",
          opus64TestFile,
          opus64TestFile.replace("ogg.", "").replace(".ogg", ""),
          opus64Frames,
          opus64FramesLength,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(287688); //287063
        expect(result.sampleRate).toEqual(48000);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode 64 channel opus frames in a web worker", async () => {
        const {
          channels,
          channelMappingTable,
          coupledStreamCount,
          streamCount,
          preSkip,
        } = opus64Header;
        const { paths, result } = await test_decodeFrames(
          new OpusDecoderWebWorker({
            channels,
            channelMappingTable,
            coupledStreamCount,
            streamCount,
            preSkip,
          }),
          "should decode 64 channel opus frames in a web worker",
          opus64TestFile,
          opus64TestFile.replace("ogg.", "").replace(".ogg", ""),
          opus64Frames,
          opus64FramesLength,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(287688); //287063
        expect(result.sampleRate).toEqual(48000);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });
    });

    describe("255 Channels", () => {
      it("should decode 255 channel opus frames", async () => {
        const {
          channels,
          channelMappingTable,
          coupledStreamCount,
          streamCount,
          preSkip,
        } = opus255Header;
        const { paths, result } = await test_decodeFrames(
          new OpusDecoder({
            channels,
            channelMappingTable,
            coupledStreamCount,
            streamCount,
            preSkip,
          }),
          "should decode 255 channel opus frames",
          opus255TestFile,
          opus255TestFile.replace("ogg.", "").replace(".ogg", ""),
          opus255Frames,
          opus255FramesLength,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(287688); //287063
        expect(result.sampleRate).toEqual(48000);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      }, 10000);

      it("should decode 255 channel opus frames in a web worker", async () => {
        const {
          channels,
          channelMappingTable,
          coupledStreamCount,
          streamCount,
          preSkip,
        } = opus255Header;
        const { paths, result } = await test_decodeFrames(
          new OpusDecoderWebWorker({
            channels,
            channelMappingTable,
            coupledStreamCount,
            streamCount,
            preSkip,
          }),
          "should decode 255 channel opus frames in a web worker",
          opus255TestFile,
          opus255TestFile.replace("ogg.", "").replace(".ogg", ""),
          opus255Frames,
          opus255FramesLength,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(287688); //287063
        expect(result.sampleRate).toEqual(48000);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });
    }, 10000);
  });

  describe("opus-ml-decoder", () => {
    const getFrames = (codecFrames) => {
      let length = 0,
        header,
        frames,
        absoluteGranulePosition;

      frames = codecFrames
        .flatMap((frame) => {
          absoluteGranulePosition = frame.absoluteGranulePosition;
          return frame.codecFrames;
        })
        .map((codecFrame) => {
          length += codecFrame.data.length;
          header = codecFrame.header;
          return codecFrame.data;
        });

      return [frames, header, length, Number(absoluteGranulePosition)];
    };

    it("should have name as an instance and static property for OpusMLDecoder", async () => {
      const decoder = new OpusMLDecoder();
      const name = decoder.constructor.name;
      await decoder.ready;
      decoder.free();

      expect(name).toEqual("OpusMLDecoder");
      expect(OpusMLDecoder.name).toEqual("OpusMLDecoder");
    });

    it("should have name as an instance and static property for OpusMLDecoderWebWorker", async () => {
      const decoder = new OpusMLDecoderWebWorker();
      const name = decoder.constructor.name;
      await decoder.ready;
      await decoder.free();

      expect(name).toEqual("OpusMLDecoderWebWorker");
      expect(OpusMLDecoderWebWorker.name).toEqual("OpusMLDecoderWebWorker");
    });

    describe.each([
      opusOsceFemale5kbsTestFile,
      opusOsceFemale6kbsTestFile,
      opusOsceFemale9kbsTestFile,
      opusOsceFemale12kbsTestFile,
      opusOsceMale5kbsTestFile,
      opusOsceMale6kbsTestFile,
      opusOsceMale9kbsTestFile,
      opusOsceMale12kbsTestFile,
    ])("Quality Enhancements %s", (testFile) => {
      const parser = new CodecParser("application/ogg");
      const speechQualityEnhancements = ["none", "lace", "nolace"];

      let frames, header, framesLength, sampleCount;

      beforeAll(async () => {
        [frames, header, framesLength, sampleCount] = getFrames(
          parser.parseAll(
            await fs.readFile(getTestPaths(opusOsceMale5kbsTestFile).inputPath),
          ),
        );
      });

      it.each(speechQualityEnhancements)(
        `should decode ${testFile}, %s`,
        async (speechQualityEnhancement) => {
          const {
            channels,
            channelMappingTable,
            coupledStreamCount,
            streamCount,
            preSkip,
          } = header;
          const { paths, result } = await test_decodeFrames(
            new OpusMLDecoder({
              channels,
              channelMappingTable,
              coupledStreamCount,
              streamCount,
              preSkip,
              speechQualityEnhancement,
            }),
            `should decode ${testFile}, ${speechQualityEnhancement}`,
            testFile,
            testFile.replace("ogg.", "").replace(".ogg", ""),
            frames,
            framesLength,
            [speechQualityEnhancement],
            [speechQualityEnhancement],
          );

          const [actual, expected] = await Promise.all([
            fs.readFile(paths.actualPath),
            fs.readFile(paths.expectedPath),
          ]);

          expect(result.samplesDecoded).toEqual(960648);
          expect(result.sampleRate).toEqual(48000);
          expect(Buffer.compare(actual, expected)).toEqual(0);
        },
      );

      it.each(speechQualityEnhancements)(
        `should decode ${testFile}, %s in a web worker`,
        async (speechQualityEnhancement) => {
          const {
            channels,
            channelMappingTable,
            coupledStreamCount,
            streamCount,
            preSkip,
          } = header;
          const { paths, result } = await test_decodeFrames(
            new OpusMLDecoderWebWorker({
              channels,
              channelMappingTable,
              coupledStreamCount,
              streamCount,
              preSkip,
              speechQualityEnhancement,
            }),
            `should decode ${testFile}, ${speechQualityEnhancement} in a web worker`,
            testFile,
            testFile.replace("ogg.", "").replace(".ogg", ""),
            frames,
            framesLength,
            [speechQualityEnhancement],
            [speechQualityEnhancement],
          );

          const [actual, expected] = await Promise.all([
            fs.readFile(paths.actualPath),
            fs.readFile(paths.expectedPath),
          ]);

          expect(result.samplesDecoded).toEqual(960648);
          expect(result.sampleRate).toEqual(48000);
          expect(Buffer.compare(actual, expected)).toEqual(0);
        },
      );
    });
  });

  describe("ogg-opus-decoder", () => {
    it("should have name as an instance and static property for OggOpusDecoder", async () => {
      const decoder = new OggOpusDecoder();
      const name = decoder.constructor.name;
      await decoder.ready;
      decoder.free();

      expect(name).toEqual("OggOpusDecoder");
      expect(OggOpusDecoder.name).toEqual("OggOpusDecoder");
    });

    it("should have name as an instance and static property for OggOpusDecoderWebWorker", async () => {
      const decoder = new OggOpusDecoderWebWorker();
      const name = decoder.constructor.name;
      await decoder.ready;
      await decoder.free();

      expect(name).toEqual("OggOpusDecoderWebWorker");
      expect(OggOpusDecoderWebWorker.name).toEqual("OggOpusDecoderWebWorker");
    });

    it("should decode ogg opus", async () => {
      const { paths, result } = await test_decode(
        new OggOpusDecoder(),
        "decodeFile",
        "should decode ogg opus",
        opusStereoTestFile,
      );

      const [actual, expected] = await Promise.all([
        fs.readFile(paths.actualPath),
        fs.readFile(paths.expectedPath),
      ]);

      expect(result.samplesDecoded).toEqual(3806842);
      expect(result.sampleRate).toEqual(48000);
      expect(actual.length).toEqual(expected.length);
      expect(Buffer.compare(actual, expected)).toEqual(0);
    });

    it("should decode ogg opus web worker", async () => {
      const { paths, result } = await test_decode(
        new OggOpusDecoderWebWorker(),
        "decodeFile",
        "should decode ogg opus web worker",
        opusStereoTestFile,
      );

      const [actual, expected] = await Promise.all([
        fs.readFile(paths.actualPath),
        fs.readFile(paths.expectedPath),
      ]);

      expect(result.samplesDecoded).toEqual(3806842);
      expect(result.sampleRate).toEqual(48000);
      expect(actual.length).toEqual(expected.length);
      expect(Buffer.compare(actual, expected)).toEqual(0);
    });

    it("should decode ogg opus with two invocations", async () => {
      const decoder = new OggOpusDecoder();

      const firstInvocation = await test_decode(
        decoder,
        "decodeFile",
        "should decode ogg opus with two invocations 1",
        opusStereoTestFile,
        opusStereoTestFile,
        [],
        ["two_invocations", "1"],
        false,
      );

      await decoder.reset();

      const secondInvocation = await test_decode(
        decoder,
        "decodeFile",
        "should decode ogg opus with two invocations 2",
        opusStereoTestFile,
        opusStereoTestFile,
        [],
        ["two_invocations", "2"],
      );

      const [actual_1, expected_1] = await Promise.all([
        fs.readFile(firstInvocation.paths.actualPath),
        fs.readFile(firstInvocation.paths.expectedPath),
      ]);

      const [actual_2, expected_2] = await Promise.all([
        fs.readFile(secondInvocation.paths.actualPath),
        fs.readFile(secondInvocation.paths.expectedPath),
      ]);

      expect(firstInvocation.result.samplesDecoded).toEqual(3806842);
      expect(firstInvocation.result.sampleRate).toEqual(48000);
      expect(actual_1.length).toEqual(expected_1.length);
      expect(Buffer.compare(actual_1, expected_1)).toEqual(0);

      expect(secondInvocation.result.samplesDecoded).toEqual(3806842);
      expect(secondInvocation.result.sampleRate).toEqual(48000);
      expect(actual_2.length).toEqual(expected_2.length);
      expect(Buffer.compare(actual_2, expected_2)).toEqual(0);
    });

    it("should decode ogg opus with two invocations web worker", async () => {
      const decoder = new OggOpusDecoderWebWorker();

      const firstInvocation = await test_decode(
        decoder,
        "decodeFile",
        "should decode ogg opus with two invocations 1",
        opusStereoTestFile,
        opusStereoTestFile,
        [],
        ["two_invocations_worker", "1"],
        false,
      );

      await decoder.reset();

      const secondInvocation = await test_decode(
        decoder,
        "decodeFile",
        "should decode ogg opus with two invocations 2",
        opusStereoTestFile,
        opusStereoTestFile,
        [],
        ["two_invocations_worker", "2"],
      );

      const [actual_1, expected_1] = await Promise.all([
        fs.readFile(firstInvocation.paths.actualPath),
        fs.readFile(firstInvocation.paths.expectedPath),
      ]);

      const [actual_2, expected_2] = await Promise.all([
        fs.readFile(secondInvocation.paths.actualPath),
        fs.readFile(secondInvocation.paths.expectedPath),
      ]);

      expect(firstInvocation.result.samplesDecoded).toEqual(3806842);
      expect(firstInvocation.result.sampleRate).toEqual(48000);
      expect(actual_1.length).toEqual(expected_1.length);
      expect(Buffer.compare(actual_1, expected_1)).toEqual(0);

      expect(secondInvocation.result.samplesDecoded).toEqual(3806842);
      expect(secondInvocation.result.sampleRate).toEqual(48000);
      expect(actual_2.length).toEqual(expected_2.length);
      expect(Buffer.compare(actual_2, expected_2)).toEqual(0);
    });

    it("should decode ogg opus with parallel invocations web worker", async () => {
      const decoder1 = new OggOpusDecoderWebWorker();
      const decoder2 = new OggOpusDecoderWebWorker();

      const firstInvocationPromise = test_decode(
        decoder1,
        "decodeFile",
        "should decode ogg opus with parallel invocations 1",
        opusStereoTestFile,
        opusStereoTestFile,
        [],
        ["parallel_invocations_worker", "1"],
      );

      const secondInvocationPromise = test_decode(
        decoder2,
        "decodeFile",
        "should decode ogg opus with parallel invocations 2",
        opusStereoTestFile,
        opusStereoTestFile,
        [],
        ["parallel_invocations_worker", "2"],
      );

      const [firstInvocation, secondInvocation] = await Promise.all([
        firstInvocationPromise,
        secondInvocationPromise,
      ]);

      const [actual_1, expected_1] = await Promise.all([
        fs.readFile(firstInvocation.paths.actualPath),
        fs.readFile(firstInvocation.paths.expectedPath),
      ]);

      const [actual_2, expected_2] = await Promise.all([
        fs.readFile(secondInvocation.paths.actualPath),
        fs.readFile(secondInvocation.paths.expectedPath),
      ]);

      expect(firstInvocation.result.samplesDecoded).toEqual(3806842);
      expect(firstInvocation.result.sampleRate).toEqual(48000);
      expect(actual_1.length).toEqual(expected_1.length);
      expect(Buffer.compare(actual_1, expected_1)).toEqual(0);

      expect(secondInvocation.result.samplesDecoded).toEqual(3806842);
      expect(secondInvocation.result.sampleRate).toEqual(48000);
      expect(actual_2.length).toEqual(expected_2.length);
      expect(Buffer.compare(actual_2, expected_2)).toEqual(0);
    });

    it("should decode ogg opus while reading small chunks", async () => {
      const { paths, result } = await test_decodeChunks(
        new OggOpusDecoder(),
        "decode",
        "should decode ogg opus while reading small chunks",
        opusStereoTestFile,
        opusStereoTestFile,
        [],
        [],
        1024,
      );

      const [actual, expected] = await Promise.all([
        fs.readFile(paths.actualPath),
        fs.readFile(paths.expectedPath),
      ]);

      expect(result.samplesDecoded).toEqual(3806842);
      expect(result.sampleRate).toEqual(48000);
      expect(actual.length).toEqual(expected.length);
      expect(Buffer.compare(actual, expected)).toEqual(0);
    });

    it("should decode ogg opus with errors", async () => {
      const { paths, result } = await test_decode(
        new OggOpusDecoder(),
        "decodeFile",
        "should decode ogg opus with errors",
        opusStereoErrorsTestFile,
      );

      const [actual, expected] = await Promise.all([
        fs.readFile(paths.actualPath),
        fs.readFile(paths.expectedPath),
      ]);

      expect(result.samplesDecoded).toEqual(3806842);
      expect(result.sampleRate).toEqual(48000);
      expect(actual.length).toEqual(expected.length);
      expect(Buffer.compare(actual, expected)).toEqual(0);
      expect(result.errors).toEqual([
        {
          message:
            "libopus -4 OPUS_INVALID_PACKET: The compressed data passed is corrupted",
          frameLength: 234,
          frameNumber: 100,
          inputBytes: 23856,
          outputSamples: 95688,
        },
      ]);
    });

    describe("sampleRates", () => {
      it("should decode 8000Hz ogg opus", async () => {
        const sampleRate = 8000;

        const { paths, result } = await test_decode(
          new OggOpusDecoder({
            sampleRate,
          }),
          "decodeFile",
          "should decode 8000Hz ogg opus",
          opusStereoTestFile,
          opusStereoTestFile,
          [sampleRate],
          [sampleRate],
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(634474); //3807154, 204
        expect(result.sampleRate).toEqual(sampleRate);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode 12000Hz ogg opus", async () => {
        const sampleRate = 12000;

        const { paths, result } = await test_decode(
          new OggOpusDecoder({
            sampleRate,
          }),
          "decodeFile",
          "should decode 12000Hz ogg opus",
          opusStereoTestFile,
          opusStereoTestFile,
          [sampleRate],
          [sampleRate],
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(951710); //3807154, 204
        expect(result.sampleRate).toEqual(sampleRate);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode 16000Hz ogg opus", async () => {
        const sampleRate = 16000;

        const { paths, result } = await test_decode(
          new OggOpusDecoder({
            sampleRate,
          }),
          "decodeFile",
          "should decode 16000Hz ogg opus",
          opusStereoTestFile,
          opusStereoTestFile,
          [sampleRate],
          [sampleRate],
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(1268947); //3807154, 204
        expect(result.sampleRate).toEqual(sampleRate);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode 24000Hz ogg opus", async () => {
        const sampleRate = 24000;

        const { paths, result } = await test_decode(
          new OggOpusDecoder({
            sampleRate,
          }),
          "decodeFile",
          "should decode 24000Hz ogg opus",
          opusStereoTestFile,
          opusStereoTestFile,
          [sampleRate],
          [sampleRate],
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(1903421); //3807154, 204
        expect(result.sampleRate).toEqual(sampleRate);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode 48000Hz ogg opus", async () => {
        const sampleRate = 48000;

        const { paths, result } = await test_decode(
          new OggOpusDecoder({
            sampleRate,
          }),
          "decodeFile",
          "should decode 48000Hz ogg opus",
          opusStereoTestFile,
          opusStereoTestFile,
          [sampleRate],
          [sampleRate],
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(3806842); //3807154, 204
        expect(result.sampleRate).toEqual(sampleRate);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });
    });

    describe("multichannel", () => {
      it("should decode multi channel ogg opus", async () => {
        const { paths, result } = await test_decode(
          new OggOpusDecoder(),
          "decodeFile",
          "should decode multi channel ogg opus",
          opusSurroundTestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.channelsDecoded).toEqual(6);
        expect(result.samplesDecoded).toEqual(1042177);
        expect(result.sampleRate).toEqual(48000);
        expect(actual.length).toEqual(expected.length);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode multi channel ogg opus as stereo when force stereo is enabled", async () => {
        const { paths, result } = await test_decode(
          new OggOpusDecoder({
            forceStereo: true,
          }),
          "decodeFile",
          "should decode multi channel ogg opus",
          opusSurroundTestFile,
          opusSurroundTestFile + ".downmix",
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.channelsDecoded).toEqual(2);
        expect(result.samplesDecoded).toEqual(1042177);
        expect(result.sampleRate).toEqual(48000);
        expect(actual.length).toEqual(expected.length);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode ogg opus in a web worker", async () => {
        const { paths, result } = await test_decode(
          new OggOpusDecoderWebWorker(),
          "decodeFile",
          "should decode ogg opus in a web worker",
          opusStereoTestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(3806842);
        expect(result.sampleRate).toEqual(48000);
        expect(actual.length).toEqual(expected.length);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode multi channel ogg opus in a web worker", async () => {
        const { paths, result } = await test_decode(
          new OggOpusDecoderWebWorker(),
          "decodeFile",
          "should decode multi channel ogg opus in a web worker",
          opusSurroundTestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.channelsDecoded).toEqual(6);
        expect(result.samplesDecoded).toEqual(1042177);
        expect(result.sampleRate).toEqual(48000);
        expect(actual.length).toEqual(expected.length);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode multi channel ogg opus as stereo when force stereo is enabled in a web worker", async () => {
        const { paths, result } = await test_decode(
          new OggOpusDecoderWebWorker({
            forceStereo: true,
          }),
          "decodeFile",
          "should decode multi channel ogg opus as stereo when force stereo is enabled in a web worker",
          opusSurroundTestFile,
          opusSurroundTestFile + ".downmix",
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.channelsDecoded).toEqual(2);
        expect(result.samplesDecoded).toEqual(1042177);
        expect(result.sampleRate).toEqual(48000);
        expect(actual.length).toEqual(expected.length);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });
    });

    describe("32 Channels", () => {
      it("should decode 32 channel ogg opus frames", async () => {
        const { paths, result } = await test_decode(
          new OggOpusDecoder(),
          "decodeFile",
          "should decode 32 channel ogg opus frames",
          opus32TestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(286751); //287063
        expect(result.sampleRate).toEqual(48000);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode 32 channel ogg opus frames in a web worker", async () => {
        const { paths, result } = await test_decode(
          new OggOpusDecoderWebWorker(),
          "decodeFile",
          "should decode 32 channel ogg opus frames",
          opus32TestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(286751); //287063
        expect(result.sampleRate).toEqual(48000);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });
    });

    describe("64 Channels", () => {
      it("should decode 64 channel ogg opus frames", async () => {
        const { paths, result } = await test_decode(
          new OggOpusDecoder(),
          "decodeFile",
          "should decode 64 channel ogg opus frames",
          opus64TestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(286751); //287063
        expect(result.sampleRate).toEqual(48000);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode 64 channel ogg opus frames in a web worker", async () => {
        const { paths, result } = await test_decode(
          new OggOpusDecoderWebWorker(),
          "decodeFile",
          "should decode 64 channel ogg opus frames",
          opus64TestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(286751); //287063
        expect(result.sampleRate).toEqual(48000);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });
    });

    describe("255 Channels", () => {
      it("should decode 255 channel ogg opus frames", async () => {
        const { paths, result } = await test_decode(
          new OggOpusDecoder(),
          "decodeFile",
          "should decode 255 channel ogg opus frames",
          opus255TestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(286751); //287063
        expect(result.sampleRate).toEqual(48000);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      }, 10000);

      it("should decode 255 channel ogg opus frames in a web worker", async () => {
        const { paths, result } = await test_decode(
          new OggOpusDecoderWebWorker(),
          "decodeFile",
          "should decode 255 channel ogg opus frames",
          opus255TestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(286751); //287063
        expect(result.sampleRate).toEqual(48000);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      }, 10000);
    });

    describe("File decoding", () => {
      it("should decode opus frames if they are only returned on flush() 1", async () => {
        const { paths, result } = await test_decode(
          new OggOpusDecoder(),
          "decodeFile",
          "should decode opus frames if they are only returned on flush() 1",
          "ogg.opus.flush.1.opus",
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(11208); // 11520 without preskip
        expect(result.sampleRate).toEqual(48000);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode opus frames if they are only returned on flush() 2", async () => {
        const { paths, result } = await test_decode(
          new OggOpusDecoder(),
          "decodeFile",
          "should decode opus frames if they are only returned on flush() 2",
          "ogg.opus.flush.2.opus",
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(3528); // 3840 without preskip
        expect(result.sampleRate).toEqual(48000);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode opus frames if they are only returned on flush() 3", async () => {
        const { paths, result } = await test_decode(
          new OggOpusDecoder(),
          "decodeFile",
          "should decode opus frames if they are only returned on flush() 3",
          "ogg.opus.flush.3.opus",
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(3528); // 3840 without preskip
        expect(result.sampleRate).toEqual(48000);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });
    });

    describe.each([
      opusOsceFemale5kbsTestFile,
      opusOsceFemale6kbsTestFile,
      opusOsceFemale9kbsTestFile,
      opusOsceFemale12kbsTestFile,
      opusOsceMale5kbsTestFile,
      opusOsceMale6kbsTestFile,
      opusOsceMale9kbsTestFile,
      opusOsceMale12kbsTestFile,
    ])("Quality Enhancements %s", (testFile) => {
      const speechQualityEnhancements = ["none", "lace", "nolace"];

      it.each(speechQualityEnhancements)(
        `should decode ${testFile}, %s`,
        async (speechQualityEnhancement) => {
          const { paths, result } = await test_decode(
            new OggOpusDecoder({ speechQualityEnhancement }),
            "decodeFile",
            `should decode ${testFile}, ${speechQualityEnhancement}`,
            testFile,
            testFile,
            [speechQualityEnhancement],
            [speechQualityEnhancement],
          );

          const [actual, expected] = await Promise.all([
            fs.readFile(paths.actualPath),
            fs.readFile(paths.expectedPath),
          ]);

          expect(result.samplesDecoded).toEqual(960000);
          expect(result.sampleRate).toEqual(48000);
          expect(Buffer.compare(actual, expected)).toEqual(0);
        },
      );

      it.each(speechQualityEnhancements)(
        `should decode ${testFile}, %s in a web worker`,
        async (speechQualityEnhancement) => {
          const { paths, result } = await test_decode(
            new OggOpusDecoderWebWorker({ speechQualityEnhancement }),
            "decodeFile",
            `should decode ${testFile}, ${speechQualityEnhancement} in a web worker`,
            testFile,
            testFile,
            [speechQualityEnhancement],
            [speechQualityEnhancement],
          );

          const [actual, expected] = await Promise.all([
            fs.readFile(paths.actualPath),
            fs.readFile(paths.expectedPath),
          ]);

          expect(result.samplesDecoded).toEqual(960000);
          expect(result.sampleRate).toEqual(48000);
          expect(Buffer.compare(actual, expected)).toEqual(0);
        },
      );
    });
  });

  describe("flac-decoder", () => {
    let flacStereoFrames, flacStereoFramesLength;

    const getFrames = (codecFrames) => {
      let length = 0,
        frames;

      frames = codecFrames.map((codecFrame) => {
        length += codecFrame.data.length;
        return codecFrame.data;
      });

      return [frames, length];
    };

    beforeAll(async () => {
      const parser = new CodecParser("audio/flac");

      [flacStereoFrames, flacStereoFramesLength] = getFrames(
        parser.parseAll(
          await fs.readFile(getTestPaths(flacStereoTestFile).inputPath),
        ),
      );
    });

    it("should have name as an instance and static property for FLACDecoder", async () => {
      const decoder = new FLACDecoder();
      const name = decoder.constructor.name;
      await decoder.ready;
      decoder.free();

      expect(name).toEqual("FLACDecoder");
      expect(FLACDecoder.name).toEqual("FLACDecoder");
    });

    it("should have name as an instance and static property for FLACDecoderWebWorker", async () => {
      const decoder = new FLACDecoderWebWorker();
      const name = decoder.constructor.name;
      await decoder.ready;
      await decoder.free();

      expect(name).toEqual("FLACDecoderWebWorker");
      expect(FLACDecoderWebWorker.name).toEqual("FLACDecoderWebWorker");
    });

    describe("main thread", () => {
      it("should decode flac", async () => {
        const { paths, result } = await test_decode(
          new FLACDecoder(),
          "decodeFile",
          "should decode flac",
          flacStereoTestFile,
          flacStereoTestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(3497536); //3807154, 204
        expect(result.sampleRate).toEqual(44100);
        expect(result.bitDepth).toEqual(16);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode flac while reading small chunks", async () => {
        const { paths, result } = await test_decodeChunks(
          new FLACDecoder(),
          "decode",
          "should decode flac while reading small chunks",
          flacStereoTestFile,
          flacStereoTestFile,
          [],
          [],
          123,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(3497536); //3807154, 204
        expect(result.sampleRate).toEqual(44100);
        expect(result.bitDepth).toEqual(16);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode ogg flac", async () => {
        // flac flac.flac -8 --ogg -o flac.flac.ogg
        const { paths, result } = await test_decode(
          new FLACDecoder(),
          "decodeFile",
          "should decode flac",
          oggFlacStereoTestFile,
          oggFlacStereoTestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(3487621); //3807154, 204
        expect(result.sampleRate).toEqual(44100);
        expect(result.bitDepth).toEqual(24);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode ogg flac while reading small chunks", async () => {
        const { paths, result } = await test_decodeChunks(
          new FLACDecoder(),
          "decode",
          "should decode ogg flac while reading small chunks",
          oggFlacStereoTestFile,
          oggFlacStereoTestFile,
          [],
          [],
          123,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(3487621); //3807154, 204
        expect(result.sampleRate).toEqual(44100);
        expect(result.bitDepth).toEqual(24);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode flac frames", async () => {
        const { paths, result } = await test_decodeFrames(
          new FLACDecoder(),
          "should decode flac frames",
          flacStereoTestFile,
          null,
          flacStereoFrames,
          flacStereoFramesLength,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(3497536); //3807154, 204
        expect(result.sampleRate).toEqual(44100);
        expect(result.bitDepth).toEqual(16);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode flac frames with errors", async () => {
        const frameWithErrors = Uint8Array.from({ length: 400 }, () => 1);
        const flacStereoFramesWithErrors = [
          ...flacStereoFrames.slice(0, 5),
          frameWithErrors,
          ...flacStereoFrames.slice(5),
        ];
        const flacStereoFramesLengthWithErrors = flacStereoFramesLength + 800;

        const { paths, result } = await test_decodeFrames(
          new FLACDecoder(),
          "should decode flac frames",
          flacStereoTestFile,
          null,
          flacStereoFramesWithErrors,
          flacStereoFramesLengthWithErrors,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(3497536); //3807154, 204
        expect(result.sampleRate).toEqual(44100);
        expect(result.bitDepth).toEqual(16);
        expect(result.errors).toEqual([
          {
            message:
              "Error: FLAC__STREAM_DECODER_ERROR_STATUS_LOST_SYNC; State: FLAC__STREAM_DECODER_SEARCH_FOR_FRAME_SYNC",
            frameLength: 400,
            frameNumber: 5,
            inputBytes: 11606,
            outputSamples: 20480,
          },
        ]);
      });

      it("should decode multichannel flac", async () => {
        // ffmpeg -i flac.short.wav -filter_complex "[0:a][0:a][0:a][0:a][0:a][0:a][0:a][0:a]join=inputs=8:channel_layout=7.1[a]" -map "[a]" flac.8.flac
        const { paths, result } = await test_decode(
          new FLACDecoder(),
          "decodeFile",
          "should decode multichannel flac",
          flacMultichannelTestFile,
          flacMultichannelTestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.channelsDecoded).toEqual(8);
        expect(result.samplesDecoded).toEqual(106380); //3807154, 204
        expect(result.sampleRate).toEqual(44100);
        expect(result.bitDepth).toEqual(24);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode multichannel ogg flac", async () => {
        const { paths, result } = await test_decode(
          new FLACDecoder(),
          "decodeFile",
          "should decode multichannel flac",
          oggFlacMultichannelTestFile,
          oggFlacMultichannelTestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.channelsDecoded).toEqual(8);
        expect(result.samplesDecoded).toEqual(89181);
        expect(result.sampleRate).toEqual(44100);
        expect(result.bitDepth).toEqual(16);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode high sample rate flac", async () => {
        const { paths, result } = await test_decode(
          new FLACDecoder(),
          "decodeFile",
          "should decode high sample rate flac",
          flac96000kTestFile,
          flac96000kTestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.channelsDecoded).toEqual(2);
        expect(result.samplesDecoded).toEqual(5760449);
        expect(result.sampleRate).toEqual(96000);
        expect(result.bitDepth).toEqual(24);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode high sample rate ogg flac", async () => {
        const { paths, result } = await test_decode(
          new FLACDecoder(),
          "decodeFile",
          "should decode high sample rate flac",
          oggFlac96000kTestFile,
          oggFlac96000kTestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.channelsDecoded).toEqual(2);
        expect(result.samplesDecoded).toEqual(5759987);
        expect(result.sampleRate).toEqual(96000);
        expect(result.bitDepth).toEqual(16);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });
    });

    describe("web worker", () => {
      it("should decode flac in a web worker", async () => {
        const { paths, result } = await test_decode(
          new FLACDecoderWebWorker(),
          "decodeFile",
          "should decode flac in a web worker",
          flacStereoTestFile,
          flacStereoTestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(3497536); //3807154, 204
        expect(result.sampleRate).toEqual(44100);
        expect(result.bitDepth).toEqual(16);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode ogg flac in a web worker", async () => {
        // flac flac.flac -8 --ogg -o flac.flac.ogg
        const { paths, result } = await test_decode(
          new FLACDecoderWebWorker(),
          "decodeFile",
          "should decode flac in a web worker",
          oggFlacStereoTestFile,
          oggFlacStereoTestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(3487621); //3807154, 204
        expect(result.sampleRate).toEqual(44100);
        expect(result.bitDepth).toEqual(24);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode flac frames in a web worker", async () => {
        const { paths, result } = await test_decodeFrames(
          new FLACDecoderWebWorker(),
          "should decode flac frames in a web worker",
          flacStereoTestFile,
          null,
          flacStereoFrames,
          flacStereoFramesLength,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(3497536); //3807154, 204
        expect(result.sampleRate).toEqual(44100);
        expect(result.bitDepth).toEqual(16);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode multichannel flac in a web worker", async () => {
        const { paths, result } = await test_decode(
          new FLACDecoderWebWorker(),
          "decodeFile",
          "should decode multichannel flac in a web worker",
          flacMultichannelTestFile,
          flacMultichannelTestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.channelsDecoded).toEqual(8);
        expect(result.samplesDecoded).toEqual(106380); //3807154, 204
        expect(result.sampleRate).toEqual(44100);
        expect(result.bitDepth).toEqual(24);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode multichannel ogg flac in a web worker", async () => {
        const { paths, result } = await test_decode(
          new FLACDecoderWebWorker(),
          "decodeFile",
          "should decode multichannel flac in a web worker",
          oggFlacMultichannelTestFile,
          oggFlacMultichannelTestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.channelsDecoded).toEqual(8);
        expect(result.samplesDecoded).toEqual(89181);
        expect(result.sampleRate).toEqual(44100);
        expect(result.bitDepth).toEqual(16);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode high sample rate flac in a web worker", async () => {
        const { paths, result } = await test_decode(
          new FLACDecoderWebWorker(),
          "decodeFile",
          "should decode high sample rate flac in a web worker",
          flac96000kTestFile,
          flac96000kTestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.channelsDecoded).toEqual(2);
        expect(result.samplesDecoded).toEqual(5760449);
        expect(result.sampleRate).toEqual(96000);
        expect(result.bitDepth).toEqual(24);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode high sample rate ogg flac in a web worker", async () => {
        const { paths, result } = await test_decode(
          new FLACDecoderWebWorker(),
          "decodeFile",
          "should decode high sample rate flac in a web worker",
          oggFlac96000kTestFile,
          oggFlac96000kTestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.channelsDecoded).toEqual(2);
        expect(result.samplesDecoded).toEqual(5759987);
        expect(result.sampleRate).toEqual(96000);
        expect(result.bitDepth).toEqual(16);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });
    });
  });

  describe("ogg-vorbis-decoder", () => {
    it("should have name as an instance and static property for OggVorbisDecoder", async () => {
      const decoder = new OggVorbisDecoder();
      const name = decoder.constructor.name;
      await decoder.ready;
      decoder.free();

      expect(name).toEqual("OggVorbisDecoder");
      expect(OggVorbisDecoder.name).toEqual("OggVorbisDecoder");
    });

    it("should have name as an instance and static property for OggVorbisDecoderWebWorker", async () => {
      const decoder = new OggVorbisDecoderWebWorker();
      const name = decoder.constructor.name;
      await decoder.ready;
      await decoder.free();

      expect(name).toEqual("OggVorbisDecoderWebWorker");
      expect(OggVorbisDecoderWebWorker.name).toEqual(
        "OggVorbisDecoderWebWorker",
      );
    });

    describe("main thread", () => {
      it("should decode vorbis", async () => {
        const { paths, result } = await test_decode(
          new OggVorbisDecoder(),
          "decodeFile",
          "should decode vorbis",
          oggVorbisStereoTestFile,
          oggVorbisStereoTestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.samplesDecoded).toEqual(3496512);
        expect(result.sampleRate).toEqual(44100);
        expect(result.bitDepth).toEqual(16);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode vorbis while reading small chunks", async () => {
        const { paths, result } = await test_decodeChunks(
          new OggVorbisDecoder(),
          "decode",
          "should decode vorbis while reading small chunks",
          oggVorbisStereoTestFile,
          oggVorbisStereoTestFile,
          [],
          [],
          123,
        );
        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.samplesDecoded).toEqual(3496512);
        expect(result.sampleRate).toEqual(44100);
        expect(result.bitDepth).toEqual(16);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode high sample rate vorbis", async () => {
        const { paths, result } = await test_decode(
          new OggVorbisDecoder(),
          "decodeFile",
          "should decode high sample rate vorbis",
          oggVorbis96000kTestFile,
          oggVorbis96000kTestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.samplesDecoded).toEqual(5760449);
        expect(result.sampleRate).toEqual(96000);
        expect(result.bitDepth).toEqual(16);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode vorbis with a large comment", async () => {
        const { paths, result } = await test_decode(
          new OggVorbisDecoder(),
          "decodeFile",
          "should decode vorbis with a large comment",
          oggVorbisLargeCommentTestFile,
          oggVorbisLargeCommentTestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.samplesDecoded).toEqual(1476998);
        expect(result.sampleRate).toEqual(22050);
        expect(result.bitDepth).toEqual(16);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode multichannel vorbis", async () => {
        const { paths, result } = await test_decode(
          new OggVorbisDecoder(),
          "decodeFile",
          "should decode multichannel vorbis",
          oggVorbisMultichannelTestFile,
          oggVorbisMultichannelTestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.samplesDecoded).toEqual(106380);
        expect(result.sampleRate).toEqual(44100);
        expect(result.bitDepth).toEqual(16);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode 32 channel vorbis", async () => {
        const { paths, result } = await test_decode(
          new OggVorbisDecoder(),
          "decodeFile",
          "should decode 32 channel vorbis",
          oggVorbis32TestFile,
          oggVorbis32TestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.samplesDecoded).toEqual(287688);
        expect(result.sampleRate).toEqual(48000);
        expect(result.bitDepth).toEqual(16);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode 64 channel vorbis", async () => {
        const { paths, result } = await test_decode(
          new OggVorbisDecoder(),
          "decodeFile",
          "should decode 64 channel vorbis",
          oggVorbis64TestFile,
          oggVorbis64TestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.samplesDecoded).toEqual(287688); // 287103 from codec parser
        expect(result.sampleRate).toEqual(48000);
        expect(result.bitDepth).toEqual(16);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode 255 channel vorbis", async () => {
        const { paths, result } = await test_decode(
          new OggVorbisDecoder(),
          "decodeFile",
          "should decode 255 channel vorbis",
          oggVorbis255TestFile,
          oggVorbis255TestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.samplesDecoded).toEqual(50496); // 50560 from codec parser
        expect(result.sampleRate).toEqual(48000);
        expect(result.bitDepth).toEqual(16);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      }, 10000);

      it("should decode chained vorbis", async () => {
        const { paths, result } = await test_decode(
          new OggVorbisDecoder(),
          "decodeFile",
          "should decode chained vorbis",
          oggVorbisChained2TestFile,
          oggVorbisChained2TestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.samplesDecoded).toEqual(8785152);
        expect(result.sampleRate).toEqual(44100);
        expect(result.bitDepth).toEqual(16);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode vorbis with unusual packet structures", async () => {
        const { paths, result } = await test_decode(
          new OggVorbisDecoder(),
          "decodeFile",
          "should decode vorbis with unusual packet structures",
          oggVorbisPacketsTestFile,
          oggVorbisPacketsTestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.samplesDecoded).toEqual(229689);
        expect(result.sampleRate).toEqual(44100);
        expect(result.bitDepth).toEqual(16);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode vorbis with fishead metadata", async () => {
        const { paths, result } = await test_decode(
          new OggVorbisDecoder(),
          "decodeFile",
          "should decode vorbis with fishead metadata",
          oggVorbisFisheadTestFile,
          oggVorbisFisheadTestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.samplesDecoded).toEqual(3497472);
        expect(result.sampleRate).toEqual(44100);
        expect(result.bitDepth).toEqual(16);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode vorbis with invalid mode count", async () => {
        const { paths, result } = await test_decode(
          new OggVorbisDecoder(),
          "decodeFile",
          "should decode vorbis with invalid mode count",
          oggVorbisInvalidModeCountTestFile,
          oggVorbisInvalidModeCountTestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.samplesDecoded).toEqual(343);
        expect(result.sampleRate).toEqual(8000);
        expect(result.bitDepth).toEqual(16);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });
    });

    describe("web worker", () => {
      it("should decode vorbis web worker", async () => {
        const { paths, result } = await test_decode(
          new OggVorbisDecoderWebWorker(),
          "decodeFile",
          "should decode vorbis web worker",
          oggVorbisStereoTestFile,
          oggVorbisStereoTestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.samplesDecoded).toEqual(3496512);
        expect(result.sampleRate).toEqual(44100);
        expect(result.bitDepth).toEqual(16);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode high sample rate vorbis web worker", async () => {
        const { paths, result } = await test_decode(
          new OggVorbisDecoderWebWorker(),
          "decodeFile",
          "should decode high sample rate vorbis web worker",
          oggVorbis96000kTestFile,
          oggVorbis96000kTestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.samplesDecoded).toEqual(5760449);
        expect(result.sampleRate).toEqual(96000);
        expect(result.bitDepth).toEqual(16);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode multichannel vorbis web worker", async () => {
        const { paths, result } = await test_decode(
          new OggVorbisDecoderWebWorker(),
          "decodeFile",
          "should decode multichannel vorbis web worker",
          oggVorbisMultichannelTestFile,
          oggVorbisMultichannelTestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.samplesDecoded).toEqual(106380);
        expect(result.sampleRate).toEqual(44100);
        expect(result.bitDepth).toEqual(16);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode 32 channel vorbis web worker", async () => {
        const { paths, result } = await test_decode(
          new OggVorbisDecoderWebWorker(),
          "decodeFile",
          "should decode 32 channel vorbis web worker",
          oggVorbis32TestFile,
          oggVorbis32TestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.samplesDecoded).toEqual(287688);
        expect(result.sampleRate).toEqual(48000);
        expect(result.bitDepth).toEqual(16);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode 64 channel vorbis web worker", async () => {
        const { paths, result } = await test_decode(
          new OggVorbisDecoderWebWorker(),
          "decodeFile",
          "should decode 64 channel vorbis web worker",
          oggVorbis64TestFile,
          oggVorbis64TestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.samplesDecoded).toEqual(287688); // 287103 from codec parser
        expect(result.sampleRate).toEqual(48000);
        expect(result.bitDepth).toEqual(16);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode 255 channel vorbis web worker", async () => {
        const { paths, result } = await test_decode(
          new OggVorbisDecoderWebWorker(),
          "decodeFile",
          "should decode 255 channel vorbis web worker",
          oggVorbis255TestFile,
          oggVorbis255TestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.samplesDecoded).toEqual(50496); // 50560 from codec parser
        expect(result.sampleRate).toEqual(48000);
        expect(result.bitDepth).toEqual(16);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      }, 10000);

      it("should decode chained vorbis", async () => {
        const { paths, result } = await test_decode(
          new OggVorbisDecoderWebWorker(),
          "decodeFile",
          "should decode chained vorbis",
          oggVorbisChained2TestFile,
          oggVorbisChained2TestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.samplesDecoded).toEqual(8785152); // 50560 from codec parser
        expect(result.sampleRate).toEqual(44100);
        expect(result.bitDepth).toEqual(16);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode vorbis with unusual packet structures", async () => {
        const { paths, result } = await test_decode(
          new OggVorbisDecoderWebWorker(),
          "decodeFile",
          "should decode vorbis with unusual packet structures",
          oggVorbisPacketsTestFile,
          oggVorbisPacketsTestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.samplesDecoded).toEqual(229689);
        expect(result.sampleRate).toEqual(44100);
        expect(result.bitDepth).toEqual(16);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode vorbis with fishead metadata", async () => {
        const { paths, result } = await test_decode(
          new OggVorbisDecoderWebWorker(),
          "decodeFile",
          "should decode vorbis with fishead metadata",
          oggVorbisFisheadTestFile,
          oggVorbisFisheadTestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.samplesDecoded).toEqual(3497472);
        expect(result.sampleRate).toEqual(44100);
        expect(result.bitDepth).toEqual(16);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode vorbis with invalid mode count", async () => {
        const { paths, result } = await test_decode(
          new OggVorbisDecoderWebWorker(),
          "decodeFile",
          "should decode vorbis with invalid mode count",
          oggVorbisInvalidModeCountTestFile,
          oggVorbisInvalidModeCountTestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.samplesDecoded).toEqual(343);
        expect(result.sampleRate).toEqual(8000);
        expect(result.bitDepth).toEqual(16);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });
    });
  });

  describe("aac-decoder", () => {
    let aacStereoFrames,
      aacStereoFramesLength,
      aacRawFrames,
      aacRawFramesLength;

    // AAC-LC, 44100 Hz, stereo
    const aacRawAudioSpecificConfig = new Uint8Array([0x12, 0x10]);

    const getFrames = (codecFrames) => {
      let length = 0,
        frames;

      frames = codecFrames.map((codecFrame) => {
        length += codecFrame.data.length;
        return codecFrame.data;
      });

      return [frames, length];
    };

    beforeAll(async () => {
      const parser = new CodecParser("audio/aac");

      [aacStereoFrames, aacStereoFramesLength] = getFrames(
        parser.parseAll(
          await fs.readFile(getTestPaths(aacStereoTestFile).inputPath),
        ),
      );

      // strip the 7 byte ADTS headers to produce raw AAC frames
      aacRawFrames = aacStereoFrames.map((frame) => frame.subarray(7));
      aacRawFramesLength = aacRawFrames.reduce(
        (total, frame) => total + frame.length,
        0,
      );
    });

    it("should have name as an instance and static property for AACDecoder", async () => {
      const decoder = new AACDecoder();
      const name = decoder.constructor.name;
      await decoder.ready;
      decoder.free();

      expect(name).toEqual("AACDecoder");
      expect(AACDecoder.name).toEqual("AACDecoder");
    });

    it("should have name as an instance and static property for AACDecoderWebWorker", async () => {
      const decoder = new AACDecoderWebWorker();
      const name = decoder.constructor.name;
      await decoder.ready;
      await decoder.free();

      expect(name).toEqual("AACDecoderWebWorker");
      expect(AACDecoderWebWorker.name).toEqual("AACDecoderWebWorker");
    });

    describe("main thread", () => {
      it("should decode aac", async () => {
        const { paths, result } = await test_decode(
          new AACDecoder(),
          "decodeFile",
          "should decode aac",
          aacStereoTestFile,
          aacStereoTestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.samplesDecoded).toEqual(3499008);
        expect(result.sampleRate).toEqual(44100);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode aac while reading small chunks", async () => {
        const { paths, result } = await test_decodeChunks(
          new AACDecoder(),
          "decode",
          "should decode aac while reading small chunks",
          aacStereoTestFile,
          aacStereoTestFile,
          [],
          [],
          123,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.samplesDecoded).toEqual(3499008);
        expect(result.sampleRate).toEqual(44100);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode aac frames", async () => {
        const { paths, result } = await test_decodeFrames(
          new AACDecoder(),
          "should decode aac frames",
          aacStereoTestFile,
          null,
          aacStereoFrames,
          aacStereoFramesLength,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.samplesDecoded).toEqual(3499008);
        expect(result.sampleRate).toEqual(44100);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode aac frames with errors", async () => {
        const frameWithErrors = Uint8Array.from({ length: 400 }, () => 1);
        const aacStereoFramesWithErrors = [
          ...aacStereoFrames.slice(0, 5),
          frameWithErrors,
          ...aacStereoFrames.slice(5),
        ];
        const aacStereoFramesLengthWithErrors = aacStereoFramesLength + 400;

        // a corrupt frame perturbs the faad2 decoder state deterministically,
        // so the frames decoded after the error differ from the clean decode
        const { paths, result } = await test_decodeFrames(
          new AACDecoder(),
          "should decode aac frames",
          aacStereoTestFile,
          null,
          aacStereoFramesWithErrors,
          aacStereoFramesLengthWithErrors,
          ["errors"],
          ["errors"],
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors).toEqual([
          {
            message: "Unable to find ADTS syncword",
            frameLength: 400,
            frameNumber: 5,
            inputBytes: 1956,
            outputSamples: 4096,
          },
        ]);
        expect(result.samplesDecoded).toEqual(3499008);
        expect(result.sampleRate).toEqual(44100);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode raw aac frames using an audioSpecificConfig", async () => {
        const { paths, result } = await test_decodeFrames(
          new AACDecoder({
            audioSpecificConfig: aacRawAudioSpecificConfig,
          }),
          "should decode raw aac frames using an audioSpecificConfig",
          aacStereoTestFile,
          null,
          aacRawFrames,
          aacRawFramesLength,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.samplesDecoded).toEqual(3499008);
        expect(result.sampleRate).toEqual(44100);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode mono aac into stereo", async () => {
        const { paths, result } = await test_decode(
          new AACDecoder(),
          "decodeFile",
          "should decode mono aac into stereo",
          aacMonoTestFile,
          aacMonoTestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.channelsDecoded).toEqual(2);
        expect(result.samplesDecoded).toEqual(3499008);
        expect(result.sampleRate).toEqual(44100);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode HE-AAC v1 aac", async () => {
        const { paths, result } = await test_decode(
          new AACDecoder(),
          "decodeFile",
          "should decode HE-AAC v1 aac",
          aacHeV1TestFile,
          aacHeV1TestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.samplesDecoded).toEqual(3502080);
        expect(result.sampleRate).toEqual(44100);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode HE-AAC v2 aac", async () => {
        const { paths, result } = await test_decode(
          new AACDecoder(),
          "decodeFile",
          "should decode HE-AAC v2 aac",
          aacHeV2TestFile,
          aacHeV2TestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.channelsDecoded).toEqual(2);
        expect(result.samplesDecoded).toEqual(3504128);
        expect(result.sampleRate).toEqual(44100);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode 5.1 surround aac", async () => {
        const { paths, result } = await test_decode(
          new AACDecoder(),
          "decodeFile",
          "should decode 5.1 surround aac",
          aacSurround51TestFile,
          aacSurround51TestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.channelsDecoded).toEqual(6);
        expect(result.samplesDecoded).toEqual(1324032);
        expect(result.sampleRate).toEqual(44100);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode 7.1 surround aac", async () => {
        const { paths, result } = await test_decode(
          new AACDecoder(),
          "decodeFile",
          "should decode 7.1 surround aac",
          aacSurround71TestFile,
          aacSurround71TestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.channelsDecoded).toEqual(8);
        expect(result.samplesDecoded).toEqual(1324032);
        expect(result.sampleRate).toEqual(44100);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode adif aac", async () => {
        const { paths, result } = await test_decode(
          new AACDecoder(),
          "decodeFile",
          "should decode adif aac",
          aacAdifTestFile,
          aacAdifTestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.samplesDecoded).toEqual(1324032);
        expect(result.sampleRate).toEqual(44100);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode adif aac while reading small chunks", async () => {
        // decoding a frame that is truncated at a chunk boundary perturbs the
        // faad2 decoder state deterministically, so chunked ADIF output is
        // byte exact only for a matching chunk size
        const { paths, result } = await test_decodeChunks(
          new AACDecoder(),
          "decode",
          "should decode adif aac while reading small chunks",
          aacAdifTestFile,
          aacAdifTestFile,
          ["chunked"],
          ["chunked"],
          123,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.samplesDecoded).toEqual(1324032);
        expect(result.sampleRate).toEqual(44100);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });
    });

    describe("web worker", () => {
      it("should decode aac", async () => {
        const { paths, result } = await test_decode(
          new AACDecoderWebWorker(),
          "decodeFile",
          "should decode aac",
          aacStereoTestFile,
          aacStereoTestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.samplesDecoded).toEqual(3499008);
        expect(result.sampleRate).toEqual(44100);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode aac while reading small chunks", async () => {
        const { paths, result } = await test_decodeChunks(
          new AACDecoderWebWorker(),
          "decode",
          "should decode aac while reading small chunks",
          aacStereoTestFile,
          aacStereoTestFile,
          [],
          [],
          123,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.samplesDecoded).toEqual(3499008);
        expect(result.sampleRate).toEqual(44100);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode aac frames", async () => {
        const { paths, result } = await test_decodeFrames(
          new AACDecoderWebWorker(),
          "should decode aac frames",
          aacStereoTestFile,
          null,
          aacStereoFrames,
          aacStereoFramesLength,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.samplesDecoded).toEqual(3499008);
        expect(result.sampleRate).toEqual(44100);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode aac frames with errors", async () => {
        const frameWithErrors = Uint8Array.from({ length: 400 }, () => 1);
        const aacStereoFramesWithErrors = [
          ...aacStereoFrames.slice(0, 5),
          frameWithErrors,
          ...aacStereoFrames.slice(5),
        ];
        const aacStereoFramesLengthWithErrors = aacStereoFramesLength + 400;

        // a corrupt frame perturbs the faad2 decoder state deterministically,
        // so the frames decoded after the error differ from the clean decode
        const { paths, result } = await test_decodeFrames(
          new AACDecoderWebWorker(),
          "should decode aac frames",
          aacStereoTestFile,
          null,
          aacStereoFramesWithErrors,
          aacStereoFramesLengthWithErrors,
          ["errors"],
          ["errors"],
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors).toEqual([
          {
            message: "Unable to find ADTS syncword",
            frameLength: 400,
            frameNumber: 5,
            inputBytes: 1956,
            outputSamples: 4096,
          },
        ]);
        expect(result.samplesDecoded).toEqual(3499008);
        expect(result.sampleRate).toEqual(44100);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode raw aac frames using an audioSpecificConfig", async () => {
        const { paths, result } = await test_decodeFrames(
          new AACDecoderWebWorker({
            audioSpecificConfig: aacRawAudioSpecificConfig,
          }),
          "should decode raw aac frames using an audioSpecificConfig",
          aacStereoTestFile,
          null,
          aacRawFrames,
          aacRawFramesLength,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.samplesDecoded).toEqual(3499008);
        expect(result.sampleRate).toEqual(44100);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode 5.1 surround aac", async () => {
        const { paths, result } = await test_decode(
          new AACDecoderWebWorker(),
          "decodeFile",
          "should decode 5.1 surround aac",
          aacSurround51TestFile,
          aacSurround51TestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.channelsDecoded).toEqual(6);
        expect(result.samplesDecoded).toEqual(1324032);
        expect(result.sampleRate).toEqual(44100);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode HE-AAC v1 aac", async () => {
        const { paths, result } = await test_decode(
          new AACDecoderWebWorker(),
          "decodeFile",
          "should decode HE-AAC v1 aac",
          aacHeV1TestFile,
          aacHeV1TestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.samplesDecoded).toEqual(3502080);
        expect(result.sampleRate).toEqual(44100);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode adif aac", async () => {
        const { paths, result } = await test_decode(
          new AACDecoderWebWorker(),
          "decodeFile",
          "should decode adif aac",
          aacAdifTestFile,
          aacAdifTestFile,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.errors.length).toEqual(0);
        expect(result.samplesDecoded).toEqual(1324032);
        expect(result.sampleRate).toEqual(44100);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });
    });
  });
});
