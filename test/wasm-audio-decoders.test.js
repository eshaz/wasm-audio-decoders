import fs from "fs/promises";
import path from "path";
import CodecParser from "codec-parser";

import { testDecoder_decode, testDecoder_decodeFrames } from "./utilities";

import { MPEGDecoder, MPEGDecoderWebWorker } from "../src/mpg123-decoder/index";
import { OpusDecoder, OpusDecoderWebWorker } from "../src/opus-decoder/index";
import {
  OggOpusDecoder,
  OggOpusDecoderWebWorker,
} from "../src/ogg-opus-decoder/index";

const EXPECTED_PATH = new URL("expected", import.meta.url).pathname;
const ACTUAL_PATH = new URL("actual", import.meta.url).pathname;
const TEST_DATA_PATH = new URL("data", import.meta.url).pathname;

const getTestPaths = (fileName) => ({
  fileName,
  inputPath: path.join(TEST_DATA_PATH, fileName),
  actualPath: path.join(ACTUAL_PATH, fileName + ".wav"),
  expectedPath: path.join(EXPECTED_PATH, fileName + ".wav"),
});

const test_decode = async (DecoderClass, testName, fileName) => {
  const decoder = new DecoderClass();

  const paths = getTestPaths(fileName);

  const result = await decoder.ready.then(() =>
    testDecoder_decode(decoder, testName, paths.inputPath, paths.actualPath)
  );

  decoder.free();

  return { paths, result };
};

const test_decodeFrames = async (
  DecoderClass,
  testName,
  fileName,
  frames,
  framesLength
) => {
  const decoder = new DecoderClass();

  const paths = getTestPaths(fileName);

  const result = await decoder.ready.then(() =>
    testDecoder_decodeFrames(
      decoder,
      testName,
      frames,
      framesLength,
      paths.actualPath
    )
  );

  decoder.free();

  return { paths, result };
};

describe("mpg123-decoder", () => {
  it("should decode mpeg", async () => {
    const { paths, result } = await test_decode(
      MPEGDecoder,
      "should decode mpeg",
      "mpeg.cbr.mp3"
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

  it("should decode mpeg in a web worker", async () => {
    const { paths, result } = await test_decode(
      MPEGDecoderWebWorker,
      "should decode mpeg in a web worker",
      "mpeg.cbr.mp3"
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

  /*it("should decode a large mpeg", async () => {
    const decoder = new MPEGDecoder();
    await decoder.ready;

    const fileName = "waug-edm-fest-spr-2015.mp3";
    const paths = getTestPaths(fileName);

    const { sampleRate, samplesDecoded } = await testDecoder_decode(
      decoder,
      fileName,
      paths.inputPath,
      paths.actualPath
    );

    decoder.free()

    expect(samplesDecoded).toEqual(751564800);
    expect(sampleRate).toEqual(44100);
  }, 100000);*/

  describe("frame decoding", () => {
    let fileName,
      frames = [],
      framesLength = 0;

    beforeAll(async () => {
      fileName = "mpeg.cbr.mp3";

      const parser = new CodecParser("audio/mpeg");
      const inputData = await fs.readFile(getTestPaths(fileName).inputPath);

      for (const { data } of parser.iterator(inputData)) {
        frames.push(data);
        framesLength += data.length;
      }
    });

    it("should decode mpeg frames", async () => {
      const { paths, result } = await test_decodeFrames(
        MPEGDecoder,
        "should decode mpeg frames in a web worker",
        "frames.mpeg.cbr.mp3",
        frames,
        framesLength
      );

      const [actual, expected] = await Promise.all([
        fs.readFile(paths.actualPath),
        fs.readFile(paths.expectedPath),
      ]);

      expect(result.samplesDecoded).toEqual(3497472);
      expect(result.sampleRate).toEqual(44100);
      expect(actual.length).toEqual(expected.length);
      expect(Buffer.compare(actual, expected)).toEqual(0);
    });

    it("should decode mpeg frames in a web worker", async () => {
      const { paths, result } = await test_decodeFrames(
        MPEGDecoderWebWorker,
        "should decode mpeg frames in a web worker",
        "frames.mpeg.cbr.mp3",
        frames,
        framesLength
      );

      const [actual, expected] = await Promise.all([
        fs.readFile(paths.actualPath),
        fs.readFile(paths.expectedPath),
      ]);

      expect(result.samplesDecoded).toEqual(3497472);
      expect(result.sampleRate).toEqual(44100);
      expect(actual.length).toEqual(expected.length);
      expect(Buffer.compare(actual, expected)).toEqual(0);
    });
  });

  describe("sample rates", () => {
    it("should return 44100 as the sample rate", async () => {
      const [
        { paths: paths1, result: result1 },
        { paths: paths2, result: result2 },
        { paths: paths3, result: result3 },
        { paths: paths4, result: result4 },
      ] = await Promise.all([
        test_decode(
          MPEGDecoderWebWorker,
          "should return 44100 as the sample rate",
          "samplerate.1.mp3"
        ),
        test_decode(
          MPEGDecoderWebWorker,
          "should return 44100 as the sample rate",
          "samplerate.2.mp3"
        ),
        test_decode(
          MPEGDecoderWebWorker,
          "should return 44100 as the sample rate",
          "samplerate.3.mp3"
        ),
        test_decode(
          MPEGDecoderWebWorker,
          "should return 44100 as the sample rate",
          "samplerate.4.mp3"
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
  let fileName,
    frames = [],
    framesLength = 0;

  beforeAll(async () => {
    fileName = "ogg.opus";

    const parser = new CodecParser("application/ogg");
    const inputData = await fs.readFile(getTestPaths(fileName).inputPath);

    for (const { codecFrames } of parser.iterator(inputData)) {
      for (const { data } of codecFrames) {
        frames.push(data);
        framesLength += data.length;
      }
    }
  });

  it("should decode opus frames", async () => {
    const { paths, result } = await test_decodeFrames(
      OpusDecoder,
      "should decode opus frames",
      "frames.opus",
      frames,
      framesLength
    );

    const [actual, expected] = await Promise.all([
      fs.readFile(paths.actualPath),
      fs.readFile(paths.expectedPath),
    ]);

    expect(result.samplesDecoded).toEqual(3791040);
    expect(result.sampleRate).toEqual(48000);
    expect(actual.length).toEqual(expected.length);
    expect(Buffer.compare(actual, expected)).toEqual(0);
  });

  it("should decode opus frames in a web worker", async () => {
    const { paths, result } = await test_decodeFrames(
      OpusDecoderWebWorker,
      "should decode opus frames in a web worker",
      "frames.opus",
      frames,
      framesLength
    );

    const [actual, expected] = await Promise.all([
      fs.readFile(paths.actualPath),
      fs.readFile(paths.expectedPath),
    ]);

    expect(result.samplesDecoded).toEqual(3791040);
    expect(result.sampleRate).toEqual(48000);
    expect(actual.length).toEqual(expected.length);
    expect(Buffer.compare(actual, expected)).toEqual(0);
  });
});

describe("ogg-opus-decoder", () => {
  it("should decode ogg opus", async () => {
    const { paths, result } = await test_decode(
      OggOpusDecoder,
      "should decode ogg opus",
      "ogg.opus"
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

  it("should decode ogg opus in a web worker", async () => {
    const { paths, result } = await test_decode(
      OggOpusDecoderWebWorker,
      "should decode ogg opus in a web worker",
      "ogg.opus"
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
});
