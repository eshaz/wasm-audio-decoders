import waveHeader from "@wpdas/wave-header";
import fs from "fs/promises";
import { performance } from "perf_hooks";

const max = (a, b) => (a > b ? a : b);
const min = (a, b) => (a < b ? a : b);
const floatToInt = (val) =>
  val > 0 ? min(val * 32767, 32767) : max(val * 32767, -32768);

export const getInterleaved = (channelData, samples) => {
  const interleaved = new Int16Array(samples * channelData.length);

  for (let offset = 0, interleavedOffset = 0; offset < samples; offset++) {
    for (let channel = 0; channel < channelData.length; channel++) {
      interleaved[interleavedOffset++] = floatToInt(
        channelData[channel][offset]
      );
    }
  }

  return new Uint8Array(interleaved.buffer);
};

export const getWaveFileHeader = ({ bitDepth, sampleRate, length, channels }) =>
  waveHeader.generateHeader(length, {
    channels,
    bitDepth,
    sampleRate,
  });

const printStats = ({
  decodeTime,
  samplesDecoded,
  sampleRate,
  totalSamplesDecoded,
  bytesRead,
  totalBytesRead,
  bytesWritten,
  totalBytesWritten,
}) => {
  process.stderr.write(
    "  rate: " +
      (samplesDecoded / sampleRate / decodeTime).toFixed(0) +
      "x" +
      "\tmins: " +
      (totalSamplesDecoded / sampleRate / 60).toFixed(2) +
      "\tin: " +
      (totalBytesRead / 1024 ** 2).toFixed(2) +
      " MiB (" +
      (bytesRead / decodeTime / 1024 ** 2).toFixed(2) +
      " MiB/s)" +
      "\tout: " +
      (totalBytesWritten / 1024 ** 2).toFixed(2) +
      " MiB (" +
      (bytesWritten / decodeTime / 1024 ** 2).toFixed(2) +
      "MiB/s)" +
      "\n"
  );
};

export const testDecoder_decodeFrames = async (
  decoder,
  fileName,
  frames,
  framesLength,
  outputPath
) => {
  const output = await fs.open(outputPath, "w+");

  // allocate space for the wave header
  await output.writeFile(Buffer.alloc(44));

  // print the initial stats header
  process.stderr.write("\n" + decoder.constructor.name + " " + fileName + "\n");

  const decodeStart = performance.now();
  const { channelData, samplesDecoded, sampleRate } =
    await decoder.decodeFrames(frames);
  const decodeEnd = performance.now();

  const interleaved = getInterleaved(channelData, samplesDecoded);

  await output.writeFile(interleaved);

  const decodeTime = (decodeEnd - decodeStart) / 1000;

  printStats({
    decodeTime,
    samplesDecoded,
    sampleRate,
    totalSamplesDecoded: samplesDecoded,
    bytesRead: framesLength,
    totalBytesRead: framesLength,
    bytesWritten: interleaved.length,
    totalBytesWritten: interleaved.length,
  });

  const header = getWaveFileHeader({
    bitDepth: 16,
    sampleRate,
    length: interleaved.length,
    channels: 2,
  });

  await output.write(header, 0, header.length, 0);
  await output.close();

  return {
    samplesDecoded,
    sampleRate,
  };
};

export const testDecoder_decode = async (
  decoder,
  fileName,
  inputPath,
  outputPath
) => {
  const [input, output] = await Promise.all([
    fs.open(inputPath, "r+"),
    fs.open(outputPath, "w+"),
  ]);

  try {
    let decodeStart, decodeEnd, inStart, inEnd, outStart, outEnd;

    let bytesWritten = 0,
      totalBytesWritten = 0,
      totalBytesRead = 0,
      sampleRate,
      channelsDecoded,
      totalSamplesDecoded = 0;

    // allocate space for the wave header
    await output.writeFile(Buffer.alloc(44));

    // print the initial stats header
    process.stderr.write(
      "\n" + decoder.constructor.name + " " + fileName + "\n"
    );

    while (true) {
      inStart = performance.now();
      const { bytesRead, buffer } = await input.read(
        Buffer.allocUnsafe(2 ** 24),
        0,
        2 ** 24
      );
      inEnd = performance.now();

      if (bytesRead === 0) break;

      decodeStart = performance.now();
      const {
        channelData,
        samplesDecoded,
        sampleRate: rate,
      } = await decoder.decode(buffer.subarray(0, bytesRead));
      decodeEnd = performance.now();

      const interleaved = getInterleaved(channelData, samplesDecoded);

      outStart = performance.now();
      await output.writeFile(interleaved);
      outEnd = performance.now();

      sampleRate = rate;
      channelsDecoded = channelData.length;
      bytesWritten = interleaved.length;
      totalBytesWritten += bytesWritten;
      totalSamplesDecoded += samplesDecoded;
      totalBytesRead += bytesRead;

      const decodeTime = (decodeEnd - decodeStart) / 1000;
      const inTime = (inEnd - inStart) / 1000;
      const outTime = (outEnd - outStart) / 1000;

      printStats({
        decodeTime,
        samplesDecoded,
        sampleRate,
        totalSamplesDecoded,
        bytesRead,
        totalBytesRead,
        bytesWritten,
        totalBytesWritten,
      });
    }

    const header = getWaveFileHeader({
      bitDepth: 16,
      sampleRate,
      length: totalBytesWritten,
      channels: channelsDecoded,
    });

    await output.write(header, 0, header.length, 0);

    return {
      channelsDecoded,
      samplesDecoded: totalSamplesDecoded,
      sampleRate,
    };
  } finally {
    await input.close();
    await output.close();
  }
};
