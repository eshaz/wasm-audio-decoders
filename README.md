# WASM Audio Decoders

WASM Audio Decoders is a collection of Web Assembly audio decoder libraries that are highly optimized for browser use. Each module supports synchronous decoding on the main thread as well as asynchronous (threaded) decoding through a built in [Web Worker](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API) implementation.

Web Assembly is a binary instruction format for a stack-based virtual machine that allows for near native code execution speed inside of a web browser. In practice, these decoders are just as fast, and in some cases faster, than the browser implementation.

### [Checkout the demo here](https://eshaz.github.io/wasm-audio-decoders/)

## Decoders

Each decoder is built with inline WASM to reduce bundling complexity with transpilers like Webpack. The inlined WASM is encoded using yEnc for efficient binary encoding and is gzip compressed for reduced file size.

Pre-built minified JS files are available from NPM and in each decoder's `dist` folder.

### [`mpg123-decoder`](src/mpg123-decoder)
Decodes MPEG Layer I/II/III into PCM
  * 76.6 KiB minified bundle size
  * Browser and NodeJS support
  * Built in Web Worker support
  * Based on [`mpg123`](https://www.mpg123.de/)
  * Install using [NPM](https://www.npmjs.com/package/mpg123-decoder)

### [`@wasm-audio-decoders/flac`](src/flac)
Decodes FLAC and Ogg FLAC data into PCM
  * 67.2 KiB minified bundle size
  * Browser and NodeJS support
  * Built in Web Worker support
  * Multichannel decoding (up to 8 channels)
  * Supports full FLAC bit depth and sample rate.
  * Based on [`libFLAC`](https://github.com/xiph/flac) and [`codec-parser`](https://github.com/eshaz/codec-parser)
  * Install using [NPM](https://www.npmjs.com/package/@wasm-audio-decoders/flac)

### [`ogg-opus-decoder`](src/ogg-opus-decoder)
Decodes Ogg Opus data into PCM
  * 114.3 KiB minified bundle size
  * Uses the latest Opus 1.5 machine learning enhancements for high quality speech decoding
    * Note: Bundle size increases to 4.0 MiB when machine learning enhancements are enabled
  * Browser and NodeJS support
  * Built in Web Worker support
  * Multichannel decoding (up to 255 channels)
  * Based on [`libopus`](https://github.com/xiph/opus) and [`codec-parser`](https://github.com/eshaz/codec-parser)
  * Install using [NPM](https://www.npmjs.com/package/ogg-opus-decoder)

### [`opus-decoder`](src/opus-decoder)
Decodes raw Opus audio frames into PCM
  * 85.1 KiB minified bundle size
  * Browser and NodeJS support
  * Built in Web Worker support
  * Multichannel decoding (up to 255 channels)
  * Intended for users that already have Opus frames extracted from a container, i.e. (Ogg, Matroska (WEBM), or ISOBMFF (mp4))
  * Based on [`libopus`](https://github.com/xiph/opus)
  * Install using [NPM](https://www.npmjs.com/package/opus-decoder)

### [`@wasm-audio-decoders/opus-ml`](src/opus-ml)
Decodes raw Opus audio frames into PCM with [Machine Learning enhancements](https://opus-codec.org/demo/opus-1.5/)
  * 3.9 MiB minified bundle size
  * Uses the latest [Opus 1.5 machine learning enhancements](https://opus-codec.org/demo/opus-1.5/) for high quality speech decoding
  * Browser and NodeJS support (WASM SIMD support required)
  * Built in Web Worker support
  * Multichannel decoding (up to 255 channels)
  * Intended for users that already have Opus frames extracted from a container, i.e. (Ogg, Matroska (WEBM), or ISOBMFF (mp4))
  * Based on [`libopus`](https://github.com/xiph/opus)
  * Install using [NPM](https://www.npmjs.com/@wasm-audio-decoders/opus-ml)

### [`@wasm-audio-decoders/ogg-vorbis`](src/ogg-vorbis)
Decodes Ogg Vorbis data into PCM
  * 98.6 KiB minified bundle size
  * Browser and NodeJS support
  * Built in Web Worker support
  * Multichannel decoding (up to 255 channels)
  * Supports full Vorbis sample rate.
  * Based on [`libvorbis`](https://github.com/xiph/vorbis) and [`codec-parser`](https://github.com/eshaz/codec-parser)
  * Install using [NPM](https://www.npmjs.com/@wasm-audio-decoders/ogg-vorbis)

## Developing

### Prerequisites
1. Linux, or a Linux-like environment to build (i.e. WSL).
1. NodeJS 18.x or higher.
1. Emscripten 4.0.7
   * Install by following these [instructions](https://kripken.github.io/emscripten-site/docs/getting_started/downloads.html#installation-instructions).

### Initial Setup
1. Clone this repo.
1. Change directory to this repo and run `git submodule update --init` to clone the git sub-modules.

```sh
git clone https://github.com/eshaz/wasm-audio-decoders.git
cd wasm-audio-decoders
git submodule update --init
```

### Installing Dependencies
1. Run `npm install` to install the build dependencies.
1. Run `npm run install-decoders` to install the dependencies for each decoder.

```sh
npm install
npm run install-decoders
```

### Building
1. `source` the Emscripten path in the terminal you want build in.
   * i.e. `$ source path_to_your_emscripten_installation/emsdk_env.sh`
1. Run `npm run configure` to configure the libraries. (only required for first time build, or after updating the `Makefile`)
1. Run `npm run build` to build the libraries.
   * The builds will be located in each library's `dist` folder.

```sh
# only required for first time build, OR after updating the `Makefile`
npm run configure
# builds the project
npm run build
```

### Testing
1. Run `npm run test` to run the test suite.

```sh
npm run test
```

### Rebuilding after changes
1. Make your changes
1. If you updated any dependencies, make sure to [install](#installing-dependencies) them.
1. If you updated any configuration in the `Makefile` or changed any of the submodules, make sure to `configure` the project.
1. [Rebuild](#building) the project.
1. Ensure the tests still pass by running `npm run test`.

## Contributing

All contributions are welcome!

### General recommendations

* Questions / comments should be entered into an issue.
* Changes should be entered into a PR.
* Please read through the existing issues to check if your question / comment has already been addressed, but don't hesitate to reach out if you still have unanswered questions.
* Please make sure to clearly describe your question / comment, or the feature / fix you wish to contribute.
  * Sharing sample data as a demonstration is usually the best way to do this.
* Adding test cases for new features or fixes is highly appreciated.

All contributes / interactions with this repository must follow the [code of conduct](docs/CODE_OF_CONDUCT.md).

## Supporting

* Show your support by 'starring' this repo, contributing, or donating through Github sponsors.

## Attributions

* `OggOpusDecoder` was originally based on [AnthumChris/opus-stream-decoder](https://github.com/AnthumChris/opus-stream-decoder).
  * This version has been optimized for size and for simple bundling in web applications:
    * Everything is bundled in a single minified Javascript file for ease of use.
    * Multichannel decoding (all 255 Opus channels) is supported.
    * WASM binary is encoded inline using yEnc binary encoding and compressed using DEFLATE to significantly reduce bundle size.
    * WASM compiler, minifier, and bundler options are tuned for best possible size and performance.
* `puff` is included as a WASM build from [madler/zlib](https://github.com/madler/zlib/tree/master/contrib/puff) and is used to decompress the WASM binary.

## Licensing

The source code that originates in this project is licensed under the MIT license. Please note that any external source code included by repository, such as the decoding libraries included as git submodules and compiled into the dist files, may have different licensing terms.
