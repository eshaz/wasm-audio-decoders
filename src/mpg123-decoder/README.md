# mpg123-decoder

`mpg123-decoder` is a Web Assembly MPEG Layer (I/II/II) audio decoder based on [`mpg123`](https://www.mpg123.de/).

See the [homepage](https://github.com/eshaz/wasm-audio-decoders) of this repository for more Web Assembly audio decoders like this one.

## Installing
Install via [NPM](https://www.npmjs.com/package/mpg123-decoder).

## Usage

1. Create a new instance and wait for the WASM to finish compiling. 

   ```javascript
   import {MPEGDecoder} from 'mpg123-decoder';
   
   const decoder = new MPEGDecoder();
   
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
    sampleRate: 44100
}
```

* `decoder.decode(mpegData)`
  * `mpegData` Uint8Array of MPEG audio data.
* `decoder.decodeFrame(mpegFrame)`
  * `mpegFrame` Uint8Array containing a single MPEG frame.
* `decoder.decodeFrames(mpegFrames)`
  * `mpegFrames` Array of Uint8Arrays containing MPEG frames.
