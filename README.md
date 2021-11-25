# WASM Audio Decoders

WASM Audio Decoders is a collection of Web Assembly audio decoder libraries that are highly optimized for browser use. Each module supports synchronous decoding on the main thread as well as asynchronous (threaded) decoding through a built in [Web Worker](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API) implementation.

Web Assembly is a binary instruction format for a stack-based virtual machine that allows for near native code execution speed inside of a web browser. In practice, these decoders are just as fast, and in some cases faster, than the browser implementation.

### [Checkout the demo here](https://eshaz.github.io/wasm-audio-decoders/)

## Decoders

Each decoder is built with inline WASM to reduce bundling complexity with transpilers like Webpack. The inlined WASM is encoded using yEnc for efficient binary encoding and is gzip compressed for reduced file size.

Pre-built minified JS files are available from NPM and in each decoder's `dist` folder.

### [`mpg123-decoder`](https://github.com/eshaz/wasm-audio-decoders/tree/master/src/mpg123-decoder)
Decodes MPEG Layer I/II/III into PCM
  * 85.5 KiB minified bundle size
  * Browser and NodeJS support
  * Built in Web Worker support
  * Based on [`mpg123`](https://www.mpg123.de/)
  * Install using [NPM](https://www.npmjs.com/package/mpg123-decoder)

### [`ogg-opus-decoder`](https://github.com/eshaz/wasm-audio-decoders/tree/master/src/ogg-opus-decoder)
Decodes Ogg Opus data into PCM
  * 115.1 KiB minified bundle size
  * Browser and NodeJS support
  * Built in Web Worker support
  * Based on [`libopusfile`](https://github.com/xiph/opusfile)
  * Install using [NPM](https://www.npmjs.com/package/ogg-opus-decoder)

### [`opus-decoder`](https://github.com/eshaz/wasm-audio-decoders/tree/master/src/opus-decoder)
Decodes raw Opus audio frames into PCM
  * 87.2 KiB minified bundle size
  * Browser and NodeJS support
  * Built in Web Worker support
  * Based on [`libopus`](https://github.com/xiph/opus)
  * Install using [NPM](https://www.npmjs.com/package/opus-decoder)


## Developing

### Prerequisites
1. Install Emscripten by following these [instructions](https://kripken.github.io/emscripten-site/docs/getting_started/downloads.html#installation-instructions).
   * This repository has been tested with Emscripten 2.0.32.

### Building
1. Make sure to `source` the Emscripten path in the terminal you want build in.
1. Run `git submodule update --init` to clone down the git sub-modules.
1. Run `npm i` to install the build tool dependencies.
1. Run `make clean` and `make` to build the libraries.
   * You can run `make -j8` where `8` is the number of CPU cores on your system to speed up the build.
5. The builds will be located in each library's `dist` folder:
   * opus-decoder: `src/opus-decoder/dist/` 
   * ogg-opus-decoder: `src/ogg-opus-decoder/dist/` 
   * mpg123-decoder: `src/mpg123-decoder/dist/` 

### Testing
1. Run `npm i` to install the build tool and test dependencies.
1. Run `npm run test` to run the test suite.

## Attributions

* `OggOpusDecoder` was originally based on [AnthumChris/opus-stream-decoder](https://github.com/AnthumChris/opus-stream-decoder).
  * This version has been optimized for size and for simple bundling in web applications:
    * Everything is bundled in a single minified Javascript file for ease of use.
    * WASM binary is encoded inline using yEnc binary encoding and compressed using DEFLATE to significantly reduce bundle size.
    * WASM compiler, minifier, and bundler options are tuned for best possible size and performance.
* `tiny-inflate` is included from [foliojs/tiny-inflate](https://github.com/foliojs/tiny-inflate) and is used to decompress the WASM binary.

## Licensing

The source code that originates in this project is licensed under the MIT license. Please note that any external source code included by repository, such as the decoding libraries included as git submodules and compiled into the dist files, may have different licensing terms.
