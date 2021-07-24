OPUS_DECODER_MODULE=src/opus-decoder/dist/opus-decoder.js
OPUS_DECODER_MODULE_MIN=src/opus-decoder/dist/opus-decoder.min.js
OPUS_DECODER_MODULE_ESM=src/opus-decoder/dist/opus-decoder.mjs

OPUS_FRAME_DECODER_MODULE=src/opus-frame-decoder/dist/opus-frame-decoder.js
OPUS_FRAME_DECODER_MODULE_MIN=src/opus-frame-decoder/dist/opus-frame-decoder.min.js
OPUS_FRAME_DECODER_MODULE_ESM=src/opus-frame-decoder/dist/opus-frame-decoder.mjs

WASM_LIB=tmp/lib.bc

# Modules
CONFIGURE_LIBOPUS=modules/opus/configure
CONFIGURE_LIBOGG=modules/ogg/configure
CONFIGURE_LIBOPUSFILE=modules/opusfile/configure
OGG_CONFIG_TYPES=modules/ogg/include/ogg/config_types.h

default: dist

clean: dist-clean wasmlib-clean configures-clean

dist: opus-frame-decoder opus-decoder opus-frame-decoder-minify opus-decoder-minify
dist-clean:
	rm -rf src/opus-frame-decoder/dist/*
	rm -rf src/opus-decoder/dist/*

opus-decoder: wasmlib $(OPUS_DECODER_MODULE) $(OPUS_DECODER_MODULE_ESM)
opus-frame-decoder: wasmlib $(OPUS_FRAME_DECODER_MODULE) $(OPUS_FRAME_DECODER_MODULE_ESM)

opus-decoder-minify: $(OPUS_DECODER_MODULE)
	node src/common/compress.js ${OPUS_DECODER_MODULE}
	node_modules/.bin/terser --config-file src/opus-decoder/terser.json ${OPUS_DECODER_MODULE} -o ${OPUS_DECODER_MODULE_MIN}

opus-frame-decoder-minify: $(OPUS_FRAME_DECODER_MODULE)
	node src/common/compress.js ${OPUS_FRAME_DECODER_MODULE}
	node_modules/.bin/terser --config-file src/opus-frame-decoder/terser.json ${OPUS_FRAME_DECODER_MODULE} -o ${OPUS_FRAME_DECODER_MODULE_MIN}

wasmlib: configures $(WASM_LIB)
wasmlib-clean: dist-clean
	rm -rf $(WASM_LIB)

configures: $(CONFIGURE_LIBOGG) $(CONFIGURE_LIBOPUS) $(CONFIGURE_LIBOPUSFILE) $(OGG_CONFIG_TYPES)
configures-clean: wasmlib-clean
	rm -rf $(CONFIGURE_LIBOPUSFILE)
	rm -rf $(CONFIGURE_LIBOPUS)
	rm -rf $(CONFIGURE_LIBOGG)

define OPUS_FRAME_DECODER_EMCC_OPTS
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
--pre-js 'src/opus-frame-decoder/src/emscripten-pre.js' \
--post-js 'src/opus-frame-decoder/src/emscripten-post.js' \
-I "modules/opus/include" \
src/opus-frame-decoder/src/opus_frame_decoder.c \ 
endef

define OPUS_DECODER_EMCC_OPTS
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
  , '_opus_chunkdecoder_create' \
  , '_opus_chunkdecoder_free' \
  , '_opus_chunkdecoder_enqueue' \
  , '_opus_chunkdecoder_decode_float_stereo_deinterleaved' \
]" \
-s STRICT=1 \
--pre-js 'src/opus-decoder/src/emscripten-pre.js' \
--post-js 'src/opus-decoder/src/emscripten-post.js' \
-I modules/opusfile/include \
-I "modules/ogg/include" \
-I "modules/opus/include" \
src/opus-decoder/src/opus_chunkdecoder.c \ 
endef


$(OPUS_FRAME_DECODER_MODULE): $(WASM_LIB)
	@ mkdir -p src/opus-frame-decoder/dist
	@ echo "Building Emscripten WebAssembly module $(OPUS_FRAME_DECODER_MODULE)..."
	@ emcc \
		-o "$(OPUS_FRAME_DECODER_MODULE)" \
	  $(OPUS_FRAME_DECODER_EMCC_OPTS) \
	  $(WASM_LIB)
	@ echo "+-------------------------------------------------------------------------------"
	@ echo "|"
	@ echo "|  Successfully built JS Module: $(OPUS_FRAME_DECODER_MODULE)"
	@ echo "|"
	@ echo "+-------------------------------------------------------------------------------"

$(OPUS_FRAME_DECODER_MODULE_ESM): $(OPUS_FRAME_DECODER_MODULE)
	@ echo "Building Emscripten WebAssembly ES Module $(OPUS_FRAME_DECODER_MODULE_ESM)..."
	@ emcc \
		-o "$(OPUS_FRAME_DECODER_MODULE_ESM)" \
		-s EXPORT_ES6=1 \
		-s MODULARIZE=1 \
	  $(OPUS_FRAME_DECODER_EMCC_OPTS) \
	  $(WASM_LIB)
	@ echo "+-------------------------------------------------------------------------------"
	@ echo "|"
	@ echo "|  Successfully built ES Module: $(OPUS_FRAME_DECODER_MODULE_ESM)"
	@ echo "|"
	@ echo "+-------------------------------------------------------------------------------"

$(OPUS_DECODER_MODULE): $(WASM_LIB)
	@ mkdir -p src/opus-decoder/dist
	@ echo "Building Emscripten WebAssembly module $(OPUS_DECODER_MODULE)..."
	@ emcc \
		-o "$(OPUS_DECODER_MODULE)" \
	  $(OPUS_DECODER_EMCC_OPTS) \
	  $(WASM_LIB)
	@ echo "+-------------------------------------------------------------------------------"
	@ echo "|"
	@ echo "|  Successfully built JS Module: $(OPUS_DECODER_MODULE)"
	@ echo "|"
	@ echo "+-------------------------------------------------------------------------------"

$(OPUS_DECODER_MODULE_ESM): $(OPUS_DECODER_MODULE)
	@ echo "Building Emscripten WebAssembly ES Module $(OPUS_DECODER_MODULE_ESM)..."
	@ emcc \
		-o "$(OPUS_DECODER_MODULE_ESM)" \
		-s EXPORT_ES6=1 \
		-s MODULARIZE=1 \
	  $(OPUS_DECODER_EMCC_OPTS) \
	  $(WASM_LIB)
	@ echo "+-------------------------------------------------------------------------------"
	@ echo "|"
	@ echo "|  Successfully built ES Module: $(OPUS_DECODER_MODULE_ESM)"
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
	  -s EXPORTED_FUNCTIONS="[ \
	     '_op_read_float_stereo' \
	  ]" \
	  -s STRICT=1 \
	  -I "modules/opusfile/" \
	  -I "modules/opusfile/include" \
	  -I "modules/opusfile/src" \
	  -I "modules/ogg/include" \
	  -I "modules/opus/include" \
	  -I "modules/opus/celt" \
	  -I "modules/opus/silk" \
	  -I "modules/opus/silk/float" \
	  modules/opus/src/opus.c \
	  modules/opus/src/opus_multistream.c \
	  modules/opus/src/opus_multistream_decoder.c \
	  modules/opus/src/opus_decoder.c \
	  modules/opus/silk/*.c \
	  modules/opus/celt/*.c \
	  modules/ogg/src/*.c \
	  modules/opusfile/src/*.c
	@ echo "+-------------------------------------------------------------------------------"
	@ echo "|"
	@ echo "|  Successfully built: $(WASM_LIB)"
	@ echo "|"
	@ echo "+-------------------------------------------------------------------------------"

$(CONFIGURE_LIBOPUSFILE):
	cd modules/opusfile; ./autogen.sh
$(CONFIGURE_LIBOPUS):
	cd modules/opus; ./autogen.sh
$(CONFIGURE_LIBOGG):
	cd modules/ogg; ./autogen.sh
	
$(OGG_CONFIG_TYPES): $(CONFIGURE_LIBOGG)
	cd modules/ogg; emconfigure ./configure
	# Remove a.out* files created by emconfigure
	cd modules/ogg; rm a.wasm*