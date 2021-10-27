# `opus-decoder`

`opus-decoder` is a Web Assembly Opus audio decoder based on [`libopus`](https://github.com/xiph/opus).

See the [homepage](https://github.com/eshaz/wasm-audio-decoders) of this repository for more Web Assembly audio decoders like this one.

## Installing
* Install from [NPM](https://www.npmjs.com/package/opus-decoder).
  ```
  npm i opus-decoder
  ```

  ```javascript
  import { OpusDecoder } from 'opus-decoder';

  const decoder = new OpusDecoder();
  ```
 
* Or download the [build](https://github.com/eshaz/wasm-audio-decoders/tree/master/src/opus-decoder/dist) and include it as a script.
  ```html
  <script src="opus-decoder.min.js"></script>
  <script>
    const decoder = new OpusDecoder();
  </script>
  ```

## Usage

1. Create a new instance and wait for the WASM to finish compiling. Decoding can be done on the main thread synchronously, or in a webworker asynchronously.

   **Main thread synchronous decoding**
   ```javascript
   import { OpusDecoder } from 'opus-decoder';

   const decoder = new OpusDecoder();

   // wait for the WASM to be compiled
   await decoder.ready;
   ```

   **Web Worker asynchronous decoding**
   ```javascript
   import { OpusDecoderWebWorker } from 'opus-decoder';

   const decoder = new OpusDecoderWebWorker();

   // wait for the WASM to be compiled
   await decoder.ready;
   ```

1. Begin decoding Opus frames.

   ```javascript  
   // Decode an individual Opus frame
   const {channelData, samplesDecoded, sampleRate} = decoder.decodeFrame(opusFrame);
   
   // Decode an array of individual Opus frames
   const {channelData, samplesDecoded, sampleRate} = decoder.decodeFrames(opusFrameArray);
   ```

1. When done decoding, reset the decoder to decode a new stream, or free up the memory being used by the WASM module if you have no more audio to decode. 

   ```javascript
   // `reset()` clears the decoder state and allows you do decode a new stream of Opus frames.
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

## `OpusDecoder`

Class that decodes Opus frames synchronously on the main thread.

### Getters
* `decoder.ready` *async*
  * Returns a promise that is resolved when the WASM is compiled and ready to use.

### Methods

* `decoder.decodeFrame(opusFrame)`
  * `opusFrame` Uint8Array containing a single Opus frame.
  * Returns decoded audio.
* `decoder.decodeFrames(opusFrames)`
  * `opusFrames` Array of Uint8Arrays containing Opus frames.
  * Returns decoded audio.
* `decoder.reset()` *async*
  * Resets the decoder so that a new stream of Opus frames can be decoded.
* `decoder.free()`
  * De-allocates the memory used by the decoder.
  * After calling `free()`, the current instance is made unusable, and a new instance will need to be created to decode additional Opus frames.

## `OpusDecoderWebWorker`

Class that decodes Opus frames asynchronously within a WebWorker. Decoding is performed in a separate, non-blocking thread. Each new instance spawns a new worker allowing you to run multiple workers for concurrent decoding of multiple streams.

### Getters
* `decoder.ready` *async*
  * Returns a promise that is resolved when the WASM is compiled and ready to use.

### Methods

* `decoder.decodeFrame(opusFrame)` *async*
  * `opusFrame` Uint8Array containing a single Opus frame.
  * Returns a promise that resolves with the decoded audio.
* `decoder.decodeFrames(opusFrames)` *async*
  * `opusFrames` Array of Uint8Arrays containing Opus frames.
  * Returns a promise that resolves with the decoded audio.
* `decoder.reset()` *async*
  * Resets the decoder so that a new stream of Opus frames can be decoded.
* `decoder.free()` *async*
  * De-allocates the memory used by the decoder and terminates the WebWorker.
  * After calling `free()`, the current instance is made unusable, and a new instance will need to be created to decode additional Opus frames.

### Properly using the asynchronous Web Worker interface

`OpusDecoderWebWorker` uses async functions to send operations to the web worker without blocking the main thread. To fully take advantage of the concurrency provided by web workers, you code should avoid using `await` on decode operations where it will block synchronous code.

**Only one operation at a time can happen on `OpusDecoderWebWorker`.**
When needing to run multiple operations on a single instance, each method call must wait for the previous operation to complete. This can be accomplished by using a `Promise` chain or by using `await` (within an async function) before calling another method on the instance. If you call multiple methods on the instance without waiting for the previous call to finish, you may loose the results of some of the calls.

  * **Good** Main thread is not blocked during each decode operation. Each decode operation waits for the previous decode to complete.
    ```javascript
    const playAudio = ({ channelData, samplesDecoded, sampleRate }) => {
      // does something to play the audio data.
    }

    // In practice you would do this with a loop, or by appending additional `.then` calls to an existing promise.
    const allDataDecodedPromise = 
      decoder.decodeFrame(frameData1)
        .then(playAudio)
        .then(() => decoder.decodeFrame(frameData2))
        .then(playAudio)
        .then(() => decoder.decodeFrame(frameData3))
        .then(playAudio);
    ```
  * **Good** Main thread is not blocked since `await` is being used inside of an `async` function.
    ```javascript
    const decodeAudio = async ([frameData1, frameData2, frameData3]) => {
      const decoded1 = await decoder.decodeFrame(frameData1);
      playAudio(decoded1);
  
      const decoded2 = await decoder.decodeFrame(frameData2);
      playAudio(decoded2);
  
      const decoded3 = await decoder.decodeFrame(frameData3);
      playAudio(decoded3);
    }

    decodeAudio(frames); // does not block the main thread
    ```
  * **Bad** Main thread is being blocked by `await` during each decode operation. Synchronous code is halted while decoding completes, negating the benefits of using a webworker.
    ```javascript
    const decoded1 = await decoder.decodeFrame(frameData1); // blocks the main thread
    playAudio(decoded1);

    const decoded2 = await decoder.decodeFrame(frameData2); // blocks the main thread
    playAudio(decoded2);

    const decoded3 = await decoder.decodeFrame(frameData3); // blocks the main thread
    playAudio(decoded3);
    ```
  * **Bad** The calls to decode are not waiting for the previous call to completed. Only the last decode operation will complete correctly in this example.
    ```javascript
    decoder.decodeFrame(frameData1).then(playAudio); // decode operation will be skipped
    decoder.decodeFrame(frameData2).then(playAudio); // decode operation will be skipped
    decoder.decodeFrame(frameData3).then(playAudio);
    ```
    