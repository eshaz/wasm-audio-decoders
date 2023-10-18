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
        channelData[channel][offset],
      );
    }
  }

  return new Uint8Array(interleaved.buffer);
};

export const concatFloat32 = (buffers, length) => {
  let ret = new Float32Array(length),
    i = 0,
    offset = 0;

  while (i < buffers.length) {
    ret.set(buffers[i], offset);
    offset += buffers[i++].length;
  }

  return ret;
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
      "\n",
  );
};

export const testDecoder_decodeFrame = async (
  decoder,
  fileName,
  frames,
  framesLength,
  outputPath,
) => {
  const output = await fs.open(outputPath, "w+");
  try {
    // allocate space for the wave header
    await output.writeFile(Buffer.alloc(44));

    // print the initial stats header
    process.stderr.write(
      "\n" + decoder.constructor.name + " " + fileName + "\n",
    );

    const decodeStart = performance.now();
    const decodeResults = [];

    let channelData = [],
      samplesDecoded = 0,
      sampleRate = 0,
      bitDepth,
      errors = [];

    for await (const frame of frames) {
      const decodeResult = await decoder.decodeFrame(frame);

      decodeResults.push(decodeResult.channelData);
      samplesDecoded += decodeResult.samplesDecoded;
      sampleRate = decodeResult.sampleRate;
      bitDepth = decodeResult.bitDepth;
      errors.push(...decodeResult.errors);
    }
    const decodeEnd = performance.now();

    const channelsDecoded = decodeResults[0].length;

    for (let i = 0; i < channelsDecoded; i++) {
      const channel = [];
      for (let j = 0; j < decodeResults.length; )
        channel.push(decodeResults[j++][i]);
      channelData.push(concatFloat32(channel, samplesDecoded));
    }

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
      channels: channelData.length,
    });

    await output.write(header, 0, header.length, 0);
    await output.close();

    return {
      samplesDecoded,
      sampleRate,
      bitDepth,
      errors,
    };
  } finally {
    await output.close();
  }
};

export const testDecoder_decodeFrames = async (
  decoder,
  fileName,
  frames,
  framesLength,
  outputPath,
) => {
  const output = await fs.open(outputPath, "w+");
  try {
    // allocate space for the wave header
    await output.writeFile(Buffer.alloc(44));

    // print the initial stats header
    process.stderr.write(
      "\n" + decoder.constructor.name + " " + fileName + "\n",
    );

    const decodeStart = performance.now();
    const decoded = await decoder.decodeFrames(frames);
    const decodeEnd = performance.now();

    const interleaved = getInterleaved(
      decoded.channelData,
      decoded.samplesDecoded,
    );

    await output.writeFile(interleaved);

    const decodeTime = (decodeEnd - decodeStart) / 1000;

    printStats({
      decodeTime,
      samplesDecoded: decoded.samplesDecoded,
      sampleRate: decoded.sampleRate,
      totalSamplesDecoded: decoded.samplesDecoded,
      bytesRead: framesLength,
      totalBytesRead: framesLength,
      bytesWritten: interleaved.length,
      totalBytesWritten: interleaved.length,
    });

    const header = getWaveFileHeader({
      bitDepth: 16,
      sampleRate: decoded.sampleRate,
      length: interleaved.length,
      channels: decoded.channelData.length,
    });

    await output.write(header, 0, header.length, 0);
    await output.close();

    return decoded;
  } finally {
    await output.close();
  }
};

export const testDecoder_decode = async (
  decoder,
  method,
  fileName,
  inputPath,
  outputPath,
) => {
  const [input, output] = await Promise.all([
    fs.open(inputPath, "r+"),
    fs.open(outputPath, "w+"),
  ]);

  try {
    const maxReadSize = 2 ** 24 * 2;

    let decodeStart, decodeEnd, inStart, inEnd, outStart, outEnd;

    let bytesWritten = 0,
      totalBytesWritten = 0,
      totalBytesRead = 0,
      sampleRate,
      channelsDecoded,
      bitDepth,
      totalSamplesDecoded = 0,
      allErrors = [];

    // allocate space for the wave header
    await output.writeFile(Buffer.alloc(44));

    // print the initial stats header
    process.stderr.write(
      "\n" + decoder.constructor.name + " " + fileName + "\n",
    );

    while (true) {
      inStart = performance.now();
      const { bytesRead, buffer } = await input.read(
        Buffer.allocUnsafe(maxReadSize),
        0,
        maxReadSize,
      );
      inEnd = performance.now();

      if (bytesRead === 0) break;

      decodeStart = performance.now();
      const {
        channelData,
        samplesDecoded,
        sampleRate: rate,
        bitDepth: depth,
        errors,
      } = await decoder[method](buffer.subarray(0, bytesRead));
      decodeEnd = performance.now();

      allErrors.push(...errors);

      const interleaved = getInterleaved(channelData, samplesDecoded);

      outStart = performance.now();
      await output.writeFile(interleaved);
      outEnd = performance.now();

      sampleRate = rate;
      bitDepth = depth;
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
      bitDepth,
      errors: allErrors,
    };
  } finally {
    await input.close();
    await output.close();
  }
};

export const testDecoder_decodeAndFlush = async (
  decoder,
  method = "decode",
  fileName,
  inputPath,
  outputPath,
  chunkSize,
) => {
  const [input, output] = await Promise.all([
    fs.open(inputPath, "r+"),
    fs.open(outputPath, "w+"),
  ]);

  try {
    let decodeStart, decodeEnd;

    let totalBytesWritten = 0,
      totalBytesRead = 0,
      sampleRate,
      channelsDecoded,
      bitDepth,
      totalSamplesDecoded = 0,
      allErrors = [];

    // allocate space for the wave header
    await output.writeFile(Buffer.alloc(44));

    // print the initial stats header
    process.stderr.write(
      "\n" + decoder.constructor.name + " " + fileName + "\n",
    );

    const decodeOrFlushChunk = async (decodeOrFlush) => {
      const { bytesRead, buffer } = await input.read(
        Buffer.allocUnsafe(chunkSize),
        0,
        chunkSize,
      );

      if (bytesRead === 0 && decodeOrFlush !== "flush") return false;

      const {
        channelData,
        samplesDecoded,
        sampleRate: rate,
        bitDepth: depth,
        errors,
      } = await decoder[decodeOrFlush](buffer.subarray(0, bytesRead));

      allErrors.push(...errors);

      const interleaved = getInterleaved(channelData, samplesDecoded);
      await output.write(interleaved);

      sampleRate = rate;
      bitDepth = depth;
      channelsDecoded = channelData.length;
      totalBytesWritten += interleaved.length;
      totalSamplesDecoded += samplesDecoded;
      totalBytesRead += bytesRead;

      return true;
    };

    decodeStart = performance.now();
    // read chunks and then flush any remaining results
    while (true) {
      const continueDecoding = await decodeOrFlushChunk(method);

      if (!continueDecoding) {
        if (decoder["flush"]) {
          // only flush if decoder implements this
          await decodeOrFlushChunk("flush");
        }
        break;
      }
    }
    decodeEnd = performance.now();

    const decodeTime = (decodeEnd - decodeStart) / 1000;

    printStats({
      decodeTime,
      samplesDecoded: totalSamplesDecoded,
      sampleRate,
      totalSamplesDecoded,
      bytesRead: totalBytesRead,
      totalBytesRead,
      bytesWritten: totalBytesWritten,
      totalBytesWritten,
    });

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
      bitDepth,
      errors: allErrors,
    };
  } finally {
    await input.close();
    await output.close();
  }
};
