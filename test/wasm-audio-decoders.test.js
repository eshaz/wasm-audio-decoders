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

describe("mpg123-decoder", () => {
  it("should decode mpeg", async () => {
    const decoder = new MPEGDecoder();
    await decoder.ready;

    const fileName = "mpeg.cbr.mp3";
    const paths = getTestPaths(fileName);

    const { sampleRate, samplesDecoded } = await testDecoder_decode(
      decoder,
      fileName,
      paths.inputPath,
      paths.actualPath
    );

    decoder.free();

    const [actual, expected] = await Promise.all([
      fs.readFile(paths.actualPath),
      fs.readFile(paths.expectedPath),
    ]);

    expect(samplesDecoded).toEqual(3499776);
    expect(sampleRate).toEqual(44100);
    expect(actual.length).toEqual(expected.length);
    expect(Buffer.compare(actual, expected)).toEqual(0);
  });

  it("should decode mpeg in a web worker", async () => {
    const decoder = new MPEGDecoderWebWorker();
    await decoder.ready;

    const paths = getTestPaths("mpeg.cbr.mp3");

    const { sampleRate, samplesDecoded } = await testDecoder_decode(
      decoder,
      paths.fileName,
      paths.inputPath,
      paths.actualPath
    );

    decoder.free();

    const [actual, expected] = await Promise.all([
      fs.readFile(paths.actualPath),
      fs.readFile(paths.expectedPath),
    ]);

    expect(samplesDecoded).toEqual(3499776);
    expect(sampleRate).toEqual(44100);
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
      paths,
      frames = [],
      framesLength = 0;

    beforeAll(async () => {
      fileName = "mpeg.cbr.mp3";
      paths = getTestPaths("frames.mpeg.cbr.mp3");

      const parser = new CodecParser("audio/mpeg");
      const inputData = await fs.readFile(getTestPaths(fileName).inputPath);

      for (const { data } of parser.iterator(inputData)) {
        frames.push(data);
        framesLength += data.length;
      }
    });

    it("should decode mpeg frames", async () => {
      const decoder = new MPEGDecoder();
      await decoder.ready;

      const { sampleRate, samplesDecoded } = await testDecoder_decodeFrames(
        decoder,
        fileName,
        frames,
        framesLength,
        paths.actualPath
      );

      const [actual, expected] = await Promise.all([
        fs.readFile(paths.actualPath),
        fs.readFile(paths.expectedPath),
      ]);

      decoder.free();

      expect(samplesDecoded).toEqual(3497472);
      expect(sampleRate).toEqual(44100);
      expect(actual.length).toEqual(expected.length);
      expect(Buffer.compare(actual, expected)).toEqual(0);
    });

    it("should decode mpeg frames in a web worker", async () => {
      const decoder = new MPEGDecoderWebWorker();
      await decoder.ready;

      const { sampleRate, samplesDecoded } = await testDecoder_decodeFrames(
        decoder,
        fileName,
        frames,
        framesLength,
        paths.actualPath
      );

      const [actual, expected] = await Promise.all([
        fs.readFile(paths.actualPath),
        fs.readFile(paths.expectedPath),
      ]);

      decoder.free();

      expect(samplesDecoded).toEqual(3497472);
      expect(sampleRate).toEqual(44100);
      expect(actual.length).toEqual(expected.length);
      expect(Buffer.compare(actual, expected)).toEqual(0);
    });
  });

  describe("sample rates", () => {
    it("should return 44100 as the sample rate", async () => {
      const decoder1 = new MPEGDecoderWebWorker();
      const decoder2 = new MPEGDecoderWebWorker();
      const decoder3 = new MPEGDecoderWebWorker();
      const decoder4 = new MPEGDecoderWebWorker();

      await Promise.all([
        decoder1.ready,
        decoder2.ready,
        decoder3.ready,
        decoder4.ready,
      ]);

      const paths1 = getTestPaths("samplerate.1.mp3"); // 44100 
      const paths2 = getTestPaths("samplerate.2.mp3"); // 44100
      const paths3 = getTestPaths("samplerate.3.mp3"); // 848656542
      const paths4 = getTestPaths("samplerate.4.mp3"); // -1321404159

      const [
        decoder1Results,
        decoder2Results,
        decoder3Results,
        decoder4Results,
      ] = await Promise.all([
        testDecoder_decode(
          decoder1,
          paths1.fileName,
          paths1.inputPath,
          paths1.actualPath
        ),
        testDecoder_decode(
          decoder2,
          paths2.fileName,
          paths2.inputPath,
          paths2.actualPath
        ),
        testDecoder_decode(
          decoder3,
          paths3.fileName,
          paths3.inputPath,
          paths3.actualPath
        ),
        testDecoder_decode(
          decoder4,
          paths4.fileName,
          paths4.inputPath,
          paths4.actualPath
        ),
      ]);

      decoder1.free();
      decoder2.free();
      decoder3.free();
      decoder4.free();

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

      expect(decoder1Results.sampleRate).toEqual(44100);
      expect(decoder1Results.samplesDecoded).toEqual(21888);
      expect(decoder2Results.sampleRate).toEqual(44100);
      expect(decoder2Results.samplesDecoded).toEqual(21888);
      expect(decoder3Results.sampleRate).toEqual(44100);
      expect(decoder3Results.samplesDecoded).toEqual(21888);
      expect(decoder4Results.sampleRate).toEqual(44100);
      expect(decoder4Results.samplesDecoded).toEqual(21888);

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
    paths,
    frames = [],
    framesLength = 0;

  beforeAll(async () => {
    fileName = "ogg.opus";
    paths = getTestPaths("frames.opus");

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
    const decoder = new OpusDecoder();
    await decoder.ready;

    const { sampleRate, samplesDecoded } = await testDecoder_decodeFrames(
      decoder,
      fileName,
      frames,
      framesLength,
      paths.actualPath
    );

    const [actual, expected] = await Promise.all([
      fs.readFile(paths.actualPath),
      fs.readFile(paths.expectedPath),
    ]);

    decoder.free();

    expect(samplesDecoded).toEqual(3791040);
    expect(sampleRate).toEqual(48000);
    expect(actual.length).toEqual(expected.length);
    expect(Buffer.compare(actual, expected)).toEqual(0);
  });

  it("should decode opus frames in a web worker", async () => {
    const decoder = new OpusDecoderWebWorker();
    await decoder.ready;

    const { sampleRate, samplesDecoded } = await testDecoder_decodeFrames(
      decoder,
      fileName,
      frames,
      framesLength,
      paths.actualPath
    );

    const [actual, expected] = await Promise.all([
      fs.readFile(paths.actualPath),
      fs.readFile(paths.expectedPath),
    ]);

    decoder.free();

    expect(samplesDecoded).toEqual(3791040);
    expect(sampleRate).toEqual(48000);
    expect(actual.length).toEqual(expected.length);
    expect(Buffer.compare(actual, expected)).toEqual(0);
  });
});

describe("ogg-opus-decoder", () => {
  it("should decode ogg opus", async () => {
    const decoder = new OggOpusDecoder();
    await decoder.ready;

    const fileName = "ogg.opus";
    const paths = getTestPaths(fileName);

    const { sampleRate, samplesDecoded } = await testDecoder_decode(
      decoder,
      fileName,
      paths.inputPath,
      paths.actualPath
    );

    decoder.free();

    const [actual, expected] = await Promise.all([
      fs.readFile(paths.actualPath),
      fs.readFile(paths.expectedPath),
    ]);

    expect(samplesDecoded).toEqual(3806842);
    expect(sampleRate).toEqual(48000);
    expect(actual.length).toEqual(expected.length);
    expect(Buffer.compare(actual, expected)).toEqual(0);
  });

  it("should decode ogg opus in a web worker", async () => {
    const decoder = new OggOpusDecoderWebWorker();
    await decoder.ready;

    const paths = getTestPaths("ogg.opus");

    const { sampleRate, samplesDecoded } = await testDecoder_decode(
      decoder,
      paths.fileName,
      paths.inputPath,
      paths.actualPath
    );

    decoder.free();

    const [actual, expected] = await Promise.all([
      fs.readFile(paths.actualPath),
      fs.readFile(paths.expectedPath),
    ]);

    expect(samplesDecoded).toEqual(3806842);
    expect(sampleRate).toEqual(48000);
    expect(actual.length).toEqual(expected.length);
    expect(Buffer.compare(actual, expected)).toEqual(0);
  });
});
