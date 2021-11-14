# `ogg-opus-decoder`

`ogg-opus-decoder` is a Web Assembly Ogg Opus audio decoder.
  * 115.3 KiB minified bundle size
  * Browser and NodeJS support
  * Built in Web Worker support
  * Based on [`libopusfile`](https://github.com/xiph/opusfile)

See the [homepage](https://github.com/eshaz/wasm-audio-decoders) of this repository for more Web Assembly audio decoders like this one.

## Installing
* Install from [NPM](https://www.npmjs.com/package/ogg-opus-decoder).

  Run `npm i ogg-opus-decoder`

  ```javascript
  import { OggOpusDecoder } from 'ogg-opus-decoder';

  const decoder = new OggOpusDecoder();
  ```
 
* Or download the [build](https://github.com/eshaz/wasm-audio-decoders/tree/master/src/ogg-opus-decoder/dist) and include it as a script.
  ```html
  <script src="ogg-opus-decoder.min.js"></script>
  <script>
    const decoder = new window["ogg-opus-decoder"].OggOpusDecoder();
  </script>
  ```

## Usage

1. Create a new instance and wait for the WASM to finish compiling. Decoding can be done on the main thread synchronously, or in a webworker asynchronously.

   **Main thread synchronous decoding**
   ```javascript
   import { OggOpusDecoder } from 'ogg-opus-decoder';

   const decoder = new OggOpusDecoder();

   // wait for the WASM to be compiled
   await decoder.ready;
   ```

   **Web Worker asynchronous decoding**
   ```javascript
   import { OggOpusDecoderWebWorker } from 'ogg-opus-decoder';

   const decoder = new OggOpusDecoderWebWorker();

   // wait for the WASM to be compiled
   await decoder.ready;
   ```

1. Begin decoding Ogg Opus data.

   ```javascript  
   // Decode an individual Opus frame
   const {channelData, samplesDecoded, sampleRate} = decoder.decode(oggOpusData);
   ```

   * **NOTE:** When decoding chained Ogg files (i.e. streaming) the first two Ogg packets of the next chain must be present when decoding. Errors will be returned by libopusfile if these initial Ogg packets are incomplete. 

1. When done decoding, reset the decoder to decode a new stream, or free up the memory being used by the WASM module if you have no more audio to decode. 

   ```javascript
   // `reset()` clears the decoder state and allows you do decode a new stream of Ogg Opus data.
   decoder.reset();

   // `free()` de-allocates the memory used by the decoder. You will need to create a new instance after calling `free()` to start decoding again.
   decoder.free();
   ```

## API

Decoded audio is always returned in the below structure.

```javascript
{
    channelData: [
      leftAudio, // Float32Array of PCM samples for the left channel
      rightAudio // Float32Array of PCM samples for the right channel
    ],
    samplesDecoded: 1234, // number of PCM samples that were decoded
    sampleRate: 48000 // sample rate of the decoded PCM
}
```

Each Float32Array within `channelData` can be used directly in the WebAudio API for playback.

## `OggOpusDecoder`

Class that decodes Ogg Opus data synchronously on the main thread.

### Getters
* `decoder.ready` *async*
  * Returns a promise that is resolved when the WASM is compiled and ready to use.

### Methods

* `decoder.decode(oggOpusData)`
  * `opusFrame` Uint8Array containing Ogg Opus data.
  * Returns decoded audio.
* `decoder.reset()` *async*
  * Resets the decoder so that a new stream of Ogg Opus data can be decoded.
* `decoder.free()`
  * De-allocates the memory used by the decoder.
  * After calling `free()`, the current instance is made unusable, and a new instance will need to be created to decode additional Ogg Opus data.

## `OggOpusDecoderWebWorker`

Class that decodes Ogg Opus data asynchronously within a web worker. Decoding is performed in a separate, non-blocking thread. Each new instance spawns a new worker allowing you to run multiple workers for concurrent decoding of multiple streams.

### Getters
* `decoder.ready` *async*
  * Returns a promise that is resolved when the WASM is compiled and ready to use.

### Methods

* `decoder.decode(oggOpusData)` *Async
  * `opusFrame` Uint8Array containing Ogg Opus data.
  * Returns a promise that resolves with the decoded audio.
* `decoder.reset()` *async*
  * Resets the decoder so that a new stream of Ogg Opus data can be decoded.
* `decoder.free()` *async*
  * De-allocates the memory used by the decoder and terminates the web worker.
  * After calling `free()`, the current instance is made unusable, and a new instance will need to be created to decode additional Ogg Opus data.

### Properly using the Web Worker interface

`OggOpusDecoderWebWorker` uses async functions to send operations to the web worker without blocking the main thread. To fully take advantage of the concurrency provided by web workers, your code should avoid using `await` on decode operations where it will block the main thread.

Each method call on a `OggOpusDecoderWebWorker` instance will queue up an operation to the web worker. Operations will complete within the web worker thread one at a time and in the same order in which the methods were called.

  * **Good** Main thread is not blocked during each decode operation. The example `playAudio` function is called when each decode operation completes. Also, the next decode operation can begin while `playAudio` is doing work on the main thread.
    ```javascript
    const playAudio = ({ channelData, samplesDecoded, sampleRate }) => {
      // does something to play the audio data.
    }

    decoder.decodeFrame(data1).then(playAudio);
    decoder.decodeFrame(data2).then(playAudio);
    decoder.decodeFrame(data3).then(playAudio);

    // do some other operations while the audio is decoded
    ```

  * **Bad** Main thread is being blocked by `await` during each decode operation. Synchronous code is halted while decoding completes, negating the benefits of using a webworker.
    ```javascript
    const decoded1 = await decoder.decodeFrame(data1); // blocks the main thread
    playAudio(decoded1);

    const decoded2 = await decoder.decodeFrame(data2); // blocks the main thread
    playAudio(decoded2);

    const decoded3 = await decoder.decodeFrame(data3); // blocks the main thread
    playAudio(decoded3);
    ```
## Examples

### Decoding multiple files using a **single** instance of `OggOpusDecoderWebWorker`

This example shows how to decode multiple files using a single `OggOpusDecoderWebWorker` instance. This code iterates over an array of input files (Array of Uint8Arrays) and builds a promise chain to decode each file one at a time.

First, the reduce function is seeded by `decoder.ready` which is the first promise in this promise chain.

For each iteration, `decode()` is called, it's result is pushed to the `decodedFiles` array, and `decoder.reset()` is called to prepare the decoder for a new file. These operations are appended to the promise passed into the first parameter of `reduce`, which is the return result of the previous iteration, and then this entire promise is returned.

Finally, this promise chain is completed with a call to `decoder.free()` which cleans up the memory stored by the decoder.

It's important to note that there is only one `await` operation in this example. Decoding can happen asynchronously and you only need to `await` when you need to use the results of the decode operation.

```javascript
  const inputFiles = [file1, file2, file3] // Array of Uint8Array file data

  const decoder = new OggOpusDecoderWebWorker();

  const decodedFiles = [];

  // creates a promise chain by reducing over the array of input files 
  // and asynchronously waits for each operation to complete before moving on
  const decodePromise = inputFiles.reduce(
    (prevPromise, inputFile) =>
      prevPromise
        .then(() => decoder.decode(inputFile)) // sends the data to webworker to decode
        .then((result) => decodedFiles.push(result)) // callback to save decoded results when finished decoding the file
        .then(() => decoder.reset()), // resets the decoder for the next file
    decoder.ready // first promise that will start off the chain (seed for reduce function)
  ).then(() => decoder.free()); // free the decoder when done

  // do sync operations here

  // await when you need to have the all of the audio data decoded
  await decodePromise;
```

Here's what the above reduce operation looks like as a hard coded sequence of `.then()` operations.

```javascript
  const inputFiles = [file1, file2, file3] // Array of Uint8Array file data

  const decoder = new OggOpusDecoderWebWorker();

  const decodedFiles = [];

  const decodePromise = 
    // reduce seed value
    decoder.ready
    // first reduce iteration
    .then(() => decoder.decode(file1))
    .then((result) => decodedFiles.push(result))
    .then(() => decoder.reset())
    // second reduce iteration
    .then(() => decoder.decode(file2))
    .then((result) => decodedFiles.push(result))
    .then(() => decoder.reset())
    // third reduce iteration
    .then(() => decoder.decode(file3))
    .then((result) => decodedFiles.push(result))
    .then(() => decoder.reset())
    // final decoder.free() call after reduce is complete
    .then(() => decoder.free());

  await decodePromise;
```

### Decoding multiple files using **multiple** instances of `OggOpusDecoderWebWorker`

This example shows how to decode multiple files using multiple instances of `OggOpusDecoderWebWorker`. This code iterates over an array of input files (Array of Uint8Arrays) and spawns a new `OggOpusDecoderWebWorker` instance for each file and decodes the file. If you want to take full advantage of multi-core devices, this is the approach you will want to take since it will parallelize the decoding

For each input file, a new decoder is created, and the file is decoded using the `decode()` after  `decoder.ready` is resolved. The result of the `decode()` operation is returned, and a `finally()` function on the promise calls `decoder.free()` to free up the instance after the decode operations are completed.

Finally, `Promise.all()` wraps this array of promises and resolves when all decode operations are complete.

It's important to note that there is only one `await` operation in this example. Decoding can happen asynchronously and you only need to `await` when you need to use the results of the decode operation.

```javascript
  const inputFiles = [file1, file2, file3] // Array of Uint8Array file data

  // loops through each Uint8Array in `inputFiles` and decodes the files in separate threads
  const decodePromise = Promise.all(
    inputFiles.map((file) => {
      const decoder = new OggOpusDecoderWebWorker();

      return decoder.ready
        .then(() => decoder.decode(file)) // decode the input file
        .finally(() => decoder.free()); // free the decoder after resolving the decode result
    })
  );

  // do sync operations here

  // await when you need to have the all of the audio data decoded
  const decodedFiles = await decodePromise;
```