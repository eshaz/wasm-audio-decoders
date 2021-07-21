WASM_MODULE=dist/opus-decoder.js
WASM_MODULE_ESM=dist/opus-decoder.mjs
WASM_LIB=tmp/lib.bc
OGG_CONFIG_TYPES=src/ogg/include/ogg/config_types.h
OPUS_DECODE_TEST_FILE_URL=https://fetch-stream-audio.anthum.com/audio/save/opus-decoder-test.opus
OPUS_DECODE_TEST_FILE=tmp/decode-test-64kbps.opus
NATIVE_DECODER_TEST=tmp/opus_chunkdecoder_test
CONFIGURE_LIBOPUS=src/opus/configure
CONFIGURE_LIBOGG=src/ogg/configure
CONFIGURE_LIBOPUSFILE=src/opusfile/configure

TEST_FILE_JS=dist/test-opus-decoder.js
TEST_FILE_HTML=dist/test-opus-decoder.html
TEST_FILE_HTML_ESM=dist/test-opus-decoder-esm.html

default: dist

# Runs nodejs test with some audio files
test-wasm: dist $(OPUS_DECODE_TEST_FILE)
	@ mkdir -p tmp
	@ echo "Testing 64 kbps Opus file..."
	@ node $(TEST_FILE_JS) $(OPUS_DECODE_TEST_FILE) tmp

.PHONY: native-decode-test

clean: dist-clean wasmlib-clean configures-clean

minify: wasm
	npm run compress
	npm run minify

dist: wasm wasm-esm minify
	@ cp src/test-opus-decoder* dist
dist-clean:
	rm -rf dist/*

wasm-esm: wasmlib $(WASM_MODULE_ESM)
wasm: wasmlib $(WASM_MODULE)

wasmlib: configures $(WASM_LIB)
wasmlib-clean: dist-clean
	rm -rf $(WASM_LIB)

configures: $(CONFIGURE_LIBOPUS)
configures-clean: wasmlib-clean
	rm -rf $(CONFIGURE_LIBOPUS)

native-decode-test: $(OPUS_DECODE_TEST_FILE)

define WASM_EMCC_OPTS
-O3 \
--minify 0 \
-flto \
-s BINARYEN_EXTRA_PASSES="-O4" \
-s MINIMAL_RUNTIME=2 \
-s SINGLE_FILE=1 \
-s SUPPORT_LONGJMP=0 \
-s MALLOC="emmalloc" \
-s JS_MATH \
-s NO_FILESYSTEM=1 \
-s ENVIRONMENT=web,worker \
-s INCOMING_MODULE_JS_API="[]" \
-s EXPORTED_FUNCTIONS="[ \
    '_free', '_malloc' \
  , '_opus_frame_decoder_destroy' \
  , '_opus_frame_decode_float_deinterleaved' \
  , '_opus_frame_decoder_create' \
]" \
-s STRICT=1 \
--pre-js 'src/emscripten-pre.js' \
--post-js 'src/emscripten-post.js' \
-I "src/opus/include" \
src/opus_frame_decoder.c \ 
endef


$(WASM_MODULE_ESM): $(WASM_MODULE)
	@ echo "Building Emscripten WebAssembly ES Module $(WASM_MODULE_ESM)..."
	@ emcc \
		-o "$(WASM_MODULE_ESM)" \
		-s EXPORT_ES6=1 \
		-s MODULARIZE=1 \
	  $(WASM_EMCC_OPTS) \
	  $(WASM_LIB)
	@ echo "+-------------------------------------------------------------------------------"
	@ echo "|"
	@ echo "|  Successfully built ES Module: $(WASM_MODULE_ESM)"
	@ echo "|"
	@ echo "|  open \"$(TEST_FILE_HTML_ESM)\" in browser to test"
	@ echo "|"
	@ echo "+-------------------------------------------------------------------------------"


$(WASM_MODULE): $(WASM_LIB)
	@ mkdir -p dist
	@ echo "Building Emscripten WebAssembly module $(WASM_MODULE)..."
	@ emcc \
		-o "$(WASM_MODULE)" \
	  $(WASM_EMCC_OPTS) \
	  $(WASM_LIB)
	@ echo "+-------------------------------------------------------------------------------"
	@ echo "|"
	@ echo "|  Successfully built JS Module: $(WASM_MODULE)"
	@ echo "|"
	@ echo "|  run \"make test-wasm\" to test"
	@ echo "|"
	@ echo "|  or open \"$(TEST_FILE_HTML)\" in browser to test"
	@ echo "|"
	@ echo "+-------------------------------------------------------------------------------"


$(WASM_LIB): configures
	@ mkdir -p tmp
	@ echo "Building Ogg/Opus Emscripten Library $(WASM_LIB)..."
	@ emcc \
	  -o "$(WASM_LIB)" \
	  -r \
	  -Os \
	  -flto \
	  -D VAR_ARRAYS \
	  -D OPUS_BUILD \
	  -D HAVE_LRINTF \
	  -s JS_MATH \
	  -s NO_DYNAMIC_EXECUTION=1 \
	  -s NO_FILESYSTEM=1 \
	  -s STRICT=1 \
	  -I "src/opus/include" \
	  -I "src/opus/celt" \
	  -I "src/opus/silk" \
	  -I "src/opus/silk/float" \
	  src/opus/src/opus.c \
	  src/opus/src/opus_decoder.c \
	  src/opus/silk/*.c \
	  src/opus/celt/*.c
	@ echo "+-------------------------------------------------------------------------------"
	@ echo "|"
	@ echo "|  Successfully built: $(WASM_LIB)"
	@ echo "|"
	@ echo "+-------------------------------------------------------------------------------"

$(CONFIGURE_LIBOPUS):
	cd src/opus; ./autogen.sh

$(OGG_CONFIG_TYPES): $(CONFIGURE_LIBOGG)
	cd src/ogg; emconfigure ./configure
	# Remove a.out* files created by emconfigure
	cd src/ogg; rm a.out*


$(OPUS_DECODE_TEST_FILE):
	@ mkdir -p tmp
	@ echo "Downloading decode test file $(OPUS_DECODE_TEST_FILE_URL)..."
	@ wget -q --show-progress $(OPUS_DECODE_TEST_FILE_URL) -O $(OPUS_DECODE_TEST_FILE)


native-decode-test: $(OPUS_DECODE_TEST_FILE)
# ** For development only **
#
# This target is used to test the opus decoding functionality independent
# of WebAssembly.  It's a fast workflow to test the decoding/deinterlacing of
# an .opus file and ensure that things work natively before we try integrating
# it into Wasm.  libopus and libopusfile must be installed natively on your
# system. If you're on a Mac, you can install with "brew install opusfile"
#
# The test program outputs 3 files:
#   - *.wav stereo wav file
#   - *left.pcm raw PCM file of left channel
#   - *right.pcm raw PCM file of right channel
#
# Raw left/right PCM files can be played from the command using SoX https://sox.sourceforge.io/
# "brew install sox" if you're on a Mac.  then play decoded *.pcm file:
#
#   $ play --type raw --rate 48000 --endian little --encoding floating-point --bits 32 --channels 1 [PCM_FILENAME]
#
ifndef OPUS_DIR
	$(error OPUS_DIR environment variable is required)
endif
ifndef OPUSFILE_DIR
	$(error OPUSFILE_DIR environment variable is required)
endif
	@ mkdir -p tmp
	@ clang \
		-o "$(NATIVE_DECODER_TEST)" \
		-I "$(OPUSFILE_DIR)/include/opus" \
		-I "$(OPUS_DIR)/include/opus" \
		"$(OPUSFILE_DIR)/lib/libopusfile.dylib" \
		src/*.c

	@ $(NATIVE_DECODER_TEST) tmp/decode-test-64kbps.opus
