# `mpg123-decoder`

`mpg123-decoder` is a Web Assembly MPEG Layer (I/II/II) audio decoder.
  * 85.2 KiB minified bundle size
  * Built in Web Worker support
  * Based on [`mpg123`](https://www.mpg123.de/)

See the [homepage](https://github.com/eshaz/wasm-audio-decoders) of this repository for more Web Assembly audio decoders like this one.

## Installing
* Install from [NPM](https://www.npmjs.com/package/mpg123-decoder).
  
  Run `npm i mpg123-decoder`

  ```javascript
  import { MPEGDecoder } from 'mpg123-decoder';

  const decoder = new MPEGDecoder();
  ```
 
* Or download the [build](https://github.com/eshaz/wasm-audio-decoders/tree/master/src/mpg123-decoder/dist) and include it as a script.
  ```html
  <script src="mpg123-decoder.min.js"></script>
  <script>
    const decoder = new MPEGDecoder();
  </script>
  ```

## Usage

1. Create a new instance and wait for the WASM to finish compiling. Decoding can be done on the main thread synchronously, or in a webworker asynchronously.
   
    **Main thread synchronous decoding**
    ```javascript
    import { MPEGDecoder } from 'mpg123-decoder';

    const decoder = new MPEGDecoder();

    // wait for the WASM to be compiled
    await decoder.ready;
    ```

    **Web Worker asynchronous decoding**
    ```javascript
    import { MPEGDecoderWebWorker } from 'mpg123-decoder';

    const decoder = new MPEGDecoderWebWorker();

    // wait for the WASM to be compiled
    await decoder.ready;
    ```

1. Begin decoding MPEG data.

   ```javascript
   // Decode Uint8Array of MPEG data
   const {channelData, samplesDecoded, sampleRate} = decoder.decode(mpegData);
   
   // Decode an individual MPEG frame
   const {channelData, samplesDecoded, sampleRate} = decoder.decodeFrame(mpegFrame);
   
   // Decode an array of individual MPEG frames
   const {channelData, samplesDecoded, sampleRate} = decoder.decodeFrames(mpegFrameArray);
   ```

1. When done decoding, reset the decoder to decode a new stream, or free up the memory being used by the WASM module if you have no more audio to decode. 

   ```javascript
   // `reset()` clears the decoder state and allows you do decode a new stream of MPEG data.
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
    sampleRate: 44100 // sample rate of the decoded PCM
}
```

Each Float32Array within `channelData` can be used directly in the WebAudio API for playback.

## `MPEGDecoder`

Class that decodes MPEG data or frames synchronously on the main thread.

### Getters
* `decoder.ready` *async*
  * Returns a promise that is resolved when the WASM is compiled and ready to use.

### Methods

* `decoder.decode(mpegData)`
  * `mpegData` Uint8Array of MPEG audio data.
* `decoder.decodeFrame(mpegFrame)`
  * `mpegFrame` Uint8Array containing a single MPEG frame.
* `decoder.decodeFrames(mpegFrames)`
  * `mpegFrames` Array of Uint8Arrays containing MPEG frames.
* `decoder.reset()` *async*
  * Resets the decoder so that a new stream of MPEG data can be decoded.
* `decoder.free()`
  * De-allocates the memory used by the decoder.
  * After calling `free()`, the current instance is made unusable, and a new instance will need to be created to decode additional MPEG data.

## `MPEGDecoderWebWorker`

Class that decodes MPEG data or frames asynchronously within a WebWorker. Decoding is performed in a separate, non-blocking thread. Each new instance spawns a new worker allowing you to run multiple workers for concurrent decoding of multiple streams.

### Getters
* `decoder.ready` *async*
  * Returns a promise that is resolved when the WASM is compiled and ready to use.

### Methods

* `decoder.decode(mpegData)` *async*
  * `mpegData` Uint8Array of MPEG audio data.
* `decoder.decodeFrame(mpegFrame)` *async*
  * `mpegFrame` Uint8Array containing a single MPEG frame.
* `decoder.decodeFrames(mpegFrames)` *async*
  * `mpegFrames` Array of Uint8Arrays containing MPEG frames.
* `decoder.reset()` *async*
  * Resets the decoder so that a new stream of MPEG data can be decoded.
* `decoder.free()` *async*
  * De-allocates the memory used by the decoder and terminates the web worker.
  * After calling `free()`, the current instance is made unusable, and a new instance will need to be created to decode additional MPEG data.

### Properly using the Web Worker interface

`MPEGDecoderWebWorker` uses async functions to send operations to the web worker without blocking the main thread. To fully take advantage of the concurrency provided by web workers, your code should avoid using `await` on decode operations where it will block the main thread.

Each method call on a `MPEGDecoderWebWorker` instance will queue up an operation to the web worker. Operations will complete within the web worker thread one at a time and in the same order in which the methods were called.

  * **Good** Main thread is not blocked during each decode operation. The example `playAudio` function is called when each decode operation completes. Also, the next decode operation can begin while `playAudio` is doing work on the main thread.
    ```javascript
    const playAudio = ({ channelData, samplesDecoded, sampleRate }) => {
      // does something to play the audio data.
    }

    decoder.decodeFrame(frameData1).then(playAudio);
    decoder.decodeFrame(frameData2).then(playAudio);
    decoder.decodeFrame(frameData3).then(playAudio);

    // do some other operations while the audio is decoded
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
    