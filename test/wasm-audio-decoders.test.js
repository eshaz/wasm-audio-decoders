import fs from "fs/promises";
import path from "path";

import { testDecoder } from "./utilities";

import { MPEGDecoder, MPEGDecoderWebWorker } from "../src/mpg123-decoder/index";
//import { OpusDecoder, OpusDecoderWebWorker } from "../src/opus-decoder/index";
//import { OggOpusDecoder, OggOpusDecoderWebWorker } from "../src/ogg-opus-decoder/index";

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

    const { sampleRate, samplesDecoded } = await testDecoder(
      decoder,
      fileName,
      paths.inputPath,
      paths.actualPath
    );

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

    const { sampleRate, samplesDecoded } = await testDecoder(
      decoder,
      paths.fileName,
      paths.inputPath,
      paths.actualPath
    );

    const [actual, expected] = await Promise.all([
      fs.readFile(paths.actualPath),
      fs.readFile(paths.expectedPath),
    ]);

    expect(samplesDecoded).toEqual(3499776);
    expect(sampleRate).toEqual(44100);
    expect(actual.length).toEqual(expected.length);
    expect(Buffer.compare(actual, expected)).toEqual(0);

    decoder.terminate();
  });

  /*it("should decode a large mpeg", async () => {
    const decoder = new MPEGDecoder();
    await decoder.ready;

    const paths = getTestPaths("waug-edm-fest-spr-2015.mp3");

    const out = await testDecoder(
      decoder,
      paths.fileName,
      paths.inputPath,
      paths.actualPath
    );

    expect(decoderOutput.samplesDecoded).toEqual(751564800);
    expect(decoderOutput.sampleRate).toEqual(44100);
  }, 500000);*/
});
