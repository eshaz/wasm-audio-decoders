# WASM Audio Decoders

WASM Audio Decoders is a collection of Web Assembly audio decoder libraries that are highly optimized for browser use. Web Assembly is a binary instruction format for a stack-based virtual machine that allows for near native code execution speed inside of a web browser. In practice, these decoders are just as fast, and in some cases faster, than the browser implementation.

## Decoders

Each decoder is built with inline WASM to reduce bundling complexity with transpilers like Webpack. The inlined WASM is encoded using yEnc for efficient binary encoding and is gzip compressed for reduced file size.

Pre-built minified JS files are available from NPM and in each decoder's `dist` folder.

### [`opus-decoder`](https://github.com/eshaz/wasm-audio-decoders/tree/master/src/opus-decoder)
Decodes raw Opus audio frames into PCM
  * 85.2 KiB bundle size
  * Based on `libopus`
  * Install using NPM


### [`ogg-opus-decoder`](https://github.com/eshaz/wasm-audio-decoders/tree/master/src/ogg-opus-decoder)
Decodes Ogg Opus data into PCM
  * 113.3 KiB bundle size
  * Based on `libopusfile`
  * Install using NPM


### [`mpg123-decoder`](https://github.com/eshaz/wasm-audio-decoders/tree/master/src/mpg123-decoder)
Decodes MPEG Layer I/II/III into PCM
  * 129.9 KiB bundle size
  * Based on `libmpg123`
  * Install using NPM

## Developing

### Prerequisites
1. Install Emscripten by following these [instructions](https://kripken.github.io/emscripten-site/docs/getting_started/downloads.html#installation-instructions).
   * This repository has been tested with Emscripten 2.0.25.

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