# opus-decoder

`opus-decoder` is a Web Assembly Opus audio decoder.

See the [homepage](https://github.com/eshaz/wasm-audio-decoders) of this repository for more Web Assembly audio decoders like this one.

## Installing
Install via [NPM](https://www.npmjs.com/package/opus-decoder).

## Usage

1. Create a new instance and wait for the WASM to finish compiling. 

   ```javascript
   import {OpusDecoder} from 'opus-decoder';
   
   const decoder = new OpusDecoder();
   
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

1. When done decoding, free up the memory being used by the WASM module. You will need to create a new instance to start decoding again.

   ```javascript
   decoder.free();
   ```

## API

### Getters
* `decoder.ready`
  * Returns a promise that is resolved when the WASM is compiled and ready to use.

### Methods

Each method returns an object containing the decoded audio, number of samples decoded, and sample rate of the decoded audio.

The `channelData` contains the raw decoded PCM for each channel (left, and right). Each Float32Array can be used directly in the WebAudio api. 

```javascript
// decoded audio return value
{
    channelData: [leftAudio, rightAudio],
    samplesDecoded: 1234,
    sampleRate: 48000
}
```

* `decoder.decodeFrame(opusFrame)`
  * `opusFrame` Uint8Array containing a single Opus frame.
* `decoder.decodeFrames(opusFrames)`
  * `opusFrames` Array of Uint8Arrays containing Opus frames.
