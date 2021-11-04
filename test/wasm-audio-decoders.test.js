import fs from "fs/promises";
import path from "path";
import waveHeader from "@wpdas/wave-header";

import { MPEGDecoder, MPEGDecoderWebWorker } from "../src/mpg123-decoder/index";

const EXPECTED_PATH = new URL("expected", import.meta.url).pathname;
const ACTUAL_PATH = new URL("actual", import.meta.url).pathname;
const TEST_DATA_PATH = new URL("data", import.meta.url).pathname;

const getWaveFile = (channelData, { samples, bitDepth, sampleRate }) => {
  const floatToInt = (val) =>
    val > 0 ? Math.min(val * 32767, 32767) : Math.max(val * 32767, -32768);

  const channels = channelData.length;
  const interleaved = new Int16Array(samples * channels);

  for (let offset = 0; offset - channels < samples; offset++) {
    interleaved[offset * channels] = floatToInt(channelData[0][offset]);
    interleaved[offset * channels + 1] = floatToInt(channelData[1][offset]);
  }

  const header = waveHeader.generateHeader(interleaved.length * 2, {
    channels,
    bitDepth,
    sampleRate,
  });

  return Buffer.concat([header, Buffer.from(interleaved.buffer)]);
};

const testDecoder = async (fileName, decoder) => {
  const inputData = await fs.readFile(path.join(TEST_DATA_PATH, fileName));

  const decoderOutput = decoder.decode(inputData);
  const actualWaveData = getWaveFile(decoderOutput.channelData, {
    samples: decoderOutput.samplesDecoded,
    sampleRate: decoderOutput.sampleRate,
    bitDepth: 16,
  });

  const [expectedWaveData] = await Promise.all([
    fs.readFile(path.join(EXPECTED_PATH, fileName + ".wav")),
    fs.writeFile(path.join(ACTUAL_PATH, fileName + ".wav"), actualWaveData),
  ]);

  return {
    decoderOutput,
    actualWaveData,
    expectedWaveData,
  };
};

describe("mpg123-decoder", () => {
  it("should decode mpeg", async () => {
    const decoder = new MPEGDecoder();

    await decoder.ready;
    const { decoderOutput, actualWaveData, expectedWaveData } =
      await testDecoder("mpeg.cbr.mp3", decoder);

    expect(decoderOutput.samplesDecoded).toEqual(3499776);
    expect(decoderOutput.sampleRate).toEqual(44100);
    expect(actualWaveData.length).toEqual(expectedWaveData.length);
    expect(Buffer.compare(expectedWaveData, actualWaveData)).toEqual(0);
  });
});
