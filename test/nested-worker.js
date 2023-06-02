"use strict";

import { Worker, isMainThread, workerData } from "node:worker_threads";
import { fileURLToPath } from "url";
import fs from "fs/promises";

const __filename = fileURLToPath(import.meta.url);

const mainThread = async (filePath, decoder, decoderClass) => {
  const data = await fs.readFile(filePath);

  const worker = new Worker(__filename, {
    workerData: {
      data,
      decoder,
      decoderClass,
    },
  });

  await new Promise((resolve, reject) => {
    worker.on(`error`, reject).on("exit", resolve);
  });
};

const workerThread = async () => {
  let decoder;
  try {
    const DecoderClass = (await import(workerData.decoder))[
      workerData.decoderClass
    ];
    console.log("imported:       ", workerData.decoderClass);

    decoder = new DecoderClass();
    console.log("instantiated:   ", workerData.decoderClass);

    await decoder.ready;

    console.log("decoding bytes: ", workerData.data.length);
    const start = performance.now();

    const decoded = await decoder.decode(workerData.data);

    const end = performance.now();
    const decodeTime = (end - start) / 1000;
    const rate = (
      decoded.samplesDecoded /
      decoded.sampleRate /
      decodeTime
    ).toFixed(0);

    console.log("decode samples: ", decoded.samplesDecoded);
    console.log("decode time:    ", decodeTime);
    console.log("decode rate:    ", rate);
    console.log("\n");
  } catch (e) {
    console.error(e);
  } finally {
    // allow console logs to complete
    setTimeout(process.exit, 10);
  }
};

export const nestedWorker = isMainThread ? mainThread : workerThread();
