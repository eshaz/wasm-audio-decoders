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
import { OggOpusDecoder, OggOpusDecoderWebWorker } from "ogg-opus-decoder";
import { FLACDecoder, FLACDecoderWebWorker } from "@wasm-audio-decoders/flac";
import {
  OggVorbisDecoder,
  OggVorbisDecoderWebWorker,
} from "@wasm-audio-decoders/ogg-vorbis";

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
    decoder.free();
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
      testDecoder_decodeAndFlush(
        decoder,
        method,
        testName,
        paths.inputPath,
        paths.actualPath,
        chunkSize,
      ),
    );

    return { paths, result };
  } finally {
    decoder.free();
  }
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

  const result = await decoder.ready.then(() =>
    testDecoder_decodeFrame(
      decoder,
      testName,
      frames,
      framesLength,
      paths.actualPath,
    ),
  );

  decoder.free();

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

  const result = await decoder.ready.then(() =>
    testDecoder_decodeFrames(
      decoder,
      testName,
      frames,
      framesLength,
      paths.actualPath,
    ),
  );

  decoder.free();

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
    it("should have name as an instance and static property for MPEGDecoder", () => {
      const decoder = new MPEGDecoder();
      const name = decoder.constructor.name;
      decoder.ready.then(() => decoder.free());

      expect(name).toEqual("MPEGDecoder");
      expect(MPEGDecoder.name).toEqual("MPEGDecoder");
    });

    it("should have name as an instance and static property for MPEGDecoderWebWorker", () => {
      const decoder = new MPEGDecoderWebWorker();
      const name = decoder.constructor.name;
      decoder.ready.then(() => decoder.free());

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

      expect(result.samplesDecoded).toEqual(3499776);
      expect(result.sampleRate).toEqual(44100);
      expect(actual.length).toEqual(expected.length);
      expect(Buffer.compare(actual, expected)).toEqual(0);
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

      expect(result.samplesDecoded).toEqual(3489408);
      expect(result.sampleRate).toEqual(44100);
      expect(actual.length).toEqual(expected.length);
      expect(Buffer.compare(actual, expected)).toEqual(0);
      expect(result.errors).toEqual([
        {
          message: "-1 MPG123_ERR",
          frameLength: 2160,
          frameNumber: 0,
          inputBytes: 0,
          outputSamples: 0,
        },
        {
          message: "-1 MPG123_ERR",
          frameLength: 1008,
          frameNumber: 0,
          inputBytes: 2160,
          outputSamples: 1152,
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

      expect(result.samplesDecoded).toEqual(3499776);
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

    describe("frame decoding", () => {
      let fileName, frames, framesLength;

      beforeAll(async () => {
        fileName = "mpeg.cbr.mp3";

        const parser = new CodecParser("audio/mpeg");
        const inputData = await fs.readFile(getTestPaths(fileName).inputPath);

        frames = parser.parseAll(inputData).map((frame) => frame.data);
        framesLength = frames.reduce((acc, data) => acc + data.length, 0);
      });

      it("should decode mpeg frames", async () => {
        const { paths, result } = await test_decodeFrames(
          new MPEGDecoder(),
          "should decode mpeg frames in a web worker",
          "frames.mpeg.cbr.mp3",
          null,
          frames,
          framesLength,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(3498624);
        expect(result.sampleRate).toEqual(44100);
        expect(actual.length).toEqual(expected.length);
        expect(Buffer.compare(actual, expected)).toEqual(0);
      });

      it("should decode mpeg frames in a web worker", async () => {
        const { paths, result } = await test_decodeFrames(
          new MPEGDecoderWebWorker(),
          "should decode mpeg frames in a web worker",
          "frames.mpeg.cbr.mp3",
          null,
          frames,
          framesLength,
        );

        const [actual, expected] = await Promise.all([
          fs.readFile(paths.actualPath),
          fs.readFile(paths.expectedPath),
        ]);

        expect(result.samplesDecoded).toEqual(3498624);
        expect(result.sampleRate).toEqual(44100);
        expect(actual.length).toEqual(expected.length);
        expect(Buffer.compare(actual, expected)).toEqual(0);
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
        expect(results[0].result.samplesDecoded).toEqual(21888);
        expect(results[1].result.sampleRate).toEqual(44100);
        expect(results[1].result.samplesDecoded).toEqual(21888);
        expect(results[2].result.sampleRate).toEqual(44100);
        expect(results[2].result.samplesDecoded).toEqual(21888);
        expect(results[3].result.sampleRate).toEqual(44100);
        expect(results[3].result.samplesDecoded).toEqual(21888);

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
        expect(result1.samplesDecoded).toEqual(21888);
        expect(result2.sampleRate).toEqual(44100);
        expect(result2.samplesDecoded).toEqual(21888);
        expect(result3.sampleRate).toEqual(44100);
        expect(result3.samplesDecoded).toEqual(21888);
        expect(result4.sampleRate).toEqual(44100);
        expect(result4.samplesDecoded).toEqual(21888);

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

    it("should have name as an instance and static property for OpusDecoder", () => {
      const decoder = new OpusDecoder();
      const name = decoder.constructor.name;
      decoder.ready.then(() => decoder.free());

      expect(name).toEqual("OpusDecoder");
      expect(OpusDecoder.name).toEqual("OpusDecoder");
    });

    it("should have name as an instance and static property for OpusDecoderWebWorker", () => {
      const decoder = new OpusDecoderWebWorker();
      const name = decoder.constructor.name;
      decoder.ready.then(() => decoder.free());

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
      });

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
    });
  });

  describe("ogg-opus-decoder", () => {
    it("should have name as an instance and static property for OggOpusDecoder", () => {
      const decoder = new OggOpusDecoder();
      const name = decoder.constructor.name;
      decoder.ready.then(() => decoder.free());

      expect(name).toEqual("OggOpusDecoder");
      expect(OggOpusDecoder.name).toEqual("OggOpusDecoder");
    });

    it("should have name as an instance and static property for OggOpusDecoderWebWorker", () => {
      const decoder = new OggOpusDecoderWebWorker();
      const name = decoder.constructor.name;
      decoder.ready.then(() => decoder.free());

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

    it("should decode ogg opus with two invocations", async () => {
      const decoder = new OggOpusDecoder();

      const firstInvocation = await test_decode(
        decoder,
        "decodeFile",
        "should decode ogg opus with two invocations 1",
        opusStereoTestFile,
      );

      const [actual_1, expected_1] = await Promise.all([
        fs.readFile(firstInvocation.paths.actualPath),
        fs.readFile(firstInvocation.paths.expectedPath),
      ]);

      await decoder.reset();

      const secondInvocation = await test_decode(
        decoder,
        "decodeFile",
        "should decode ogg opus with two invocations 2",
        opusStereoTestFile,
      );

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
      });

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
      });
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

    it("should have name as an instance and static property for FLACDecoder", () => {
      const decoder = new FLACDecoder();
      const name = decoder.constructor.name;
      decoder.ready.then(() => decoder.free());

      expect(name).toEqual("FLACDecoder");
      expect(FLACDecoder.name).toEqual("FLACDecoder");
    });

    it("should have name as an instance and static property for FLACDecoderWebWorker", () => {
      const decoder = new FLACDecoderWebWorker();
      const name = decoder.constructor.name;
      decoder.ready.then(() => decoder.free());

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
    it("should have name as an instance and static property for OggVorbisDecoder", () => {
      const decoder = new OggVorbisDecoder();
      const name = decoder.constructor.name;
      decoder.ready.then(() => decoder.free());

      expect(name).toEqual("OggVorbisDecoder");
      expect(OggVorbisDecoder.name).toEqual("OggVorbisDecoder");
    });

    it("should have name as an instance and static property for OggOpusDecoderWebWorker", () => {
      const decoder = new OggOpusDecoderWebWorker();
      const name = decoder.constructor.name;
      decoder.ready.then(() => decoder.free());

      expect(name).toEqual("OggOpusDecoderWebWorker");
      expect(OggOpusDecoderWebWorker.name).toEqual("OggOpusDecoderWebWorker");
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
        expect(result.samplesDecoded).toEqual(3496960);
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
      });

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
        expect(result.samplesDecoded).toEqual(3496960);
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
      });

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
});
