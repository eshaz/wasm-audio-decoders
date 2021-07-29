default: dist

clean: dist-clean opus-wasmlib-clean mpg123-wasmlib-clean configures-clean

dist: opus-frame-decoder ogg-opus-decoder mpg123-wasm
dist-clean:
	rm -rf src/opus-frame-decoder/dist/*
	rm -rf src/ogg-opus-decoder/dist/*
	rm -rf src/mpg123-wasm/dist/*

# opus
OPUS_WASM_LIB=tmp/opus.bc
OGG_OPUS_DECODER_MODULE=src/ogg-opus-decoder/dist/ogg-opus-decoder.js
OGG_OPUS_DECODER_MODULE_MIN=src/ogg-opus-decoder/dist/ogg-opus-decoder.min.js
OGG_OPUS_DECODER_MODULE_ESM=src/ogg-opus-decoder/dist/ogg-opus-decoder.mjs
OPUS_FRAME_DECODER_MODULE=src/opus-frame-decoder/dist/opus-frame-decoder.js
OPUS_FRAME_DECODER_MODULE_MIN=src/opus-frame-decoder/dist/opus-frame-decoder.min.js
OPUS_FRAME_DECODER_MODULE_ESM=src/opus-frame-decoder/dist/opus-frame-decoder.mjs

ogg-opus-decoder: opus-wasmlib ogg-opus-decoder-minify $(OGG_OPUS_DECODER_MODULE) $(OGG_OPUS_DECODER_MODULE_ESM)
ogg-opus-decoder-minify: $(OGG_OPUS_DECODER_MODULE)
	node build/compress.js ${OGG_OPUS_DECODER_MODULE}
	node_modules/.bin/terser --config-file src/ogg-opus-decoder/terser.json ${OGG_OPUS_DECODER_MODULE} -o ${OGG_OPUS_DECODER_MODULE_MIN}
opus-frame-decoder: opus-wasmlib opus-frame-decoder-minify $(OPUS_FRAME_DECODER_MODULE) $(OPUS_FRAME_DECODER_MODULE_ESM)
opus-frame-decoder-minify: $(OPUS_FRAME_DECODER_MODULE)
	node build/compress.js ${OPUS_FRAME_DECODER_MODULE}
	node_modules/.bin/terser --config-file src/opus-frame-decoder/terser.json ${OPUS_FRAME_DECODER_MODULE} -o ${OPUS_FRAME_DECODER_MODULE_MIN}
opus-wasmlib: configures $(OPUS_WASM_LIB)
opus-wasmlib-clean: dist-clean
	rm -rf $(OPUS_WASM_LIB)

# mpg123
MPG123_WASM_LIB=tmp/mpg123.bc
MPG123_MODULE=src/mpg123-wasm/dist/mpg123-wasm.js
MPG123_MODULE_MIN=src/mpg123-wasm/dist/mpg123-wasm.min.js

mpg123-wasm: mpg123-wasmlib mpg123-wasm-minify ${MPG123_MODULE}
mpg123-wasm-minify: $(MPG123_MODULE)
	node build/compress.js ${MPG123_MODULE}
	node_modules/.bin/terser --config-file src/opus-frame-decoder/terser.json ${MPG123_MODULE} -o ${MPG123_MODULE_MIN}
mpg123-wasmlib: $(MPG123_WASM_LIB)
mpg123-wasmlib-clean: dist-clean
	rm -rf $(MPG123_WASM_LIB)

# configures
CONFIGURE_LIBOPUS=modules/opus/configure
CONFIGURE_LIBOGG=modules/ogg/configure
CONFIGURE_LIBOPUSFILE=modules/opusfile/configure
OGG_CONFIG_TYPES=modules/ogg/include/ogg/config_types.h
configures: $(CONFIGURE_LIBOGG) $(CONFIGURE_LIBOPUS) $(CONFIGURE_LIBOPUSFILE) $(OGG_CONFIG_TYPES)
configures-clean: opus-wasmlib-clean
	rm -rf $(CONFIGURE_LIBOPUSFILE)
	rm -rf $(CONFIGURE_LIBOPUS)
	rm -rf $(CONFIGURE_LIBOGG)

# common EMCC options
define EMCC_OPTS
-O3 \
--minify 0 \
-flto \
-s BINARYEN_EXTRA_PASSES="-O4" \
-s MINIMAL_RUNTIME=2 \
-s SINGLE_FILE=1 \
-s SUPPORT_LONGJMP=0 \
-s MALLOC="emmalloc" \
-s NO_FILESYSTEM=1 \
-s ENVIRONMENT=web,worker \
-s STRICT=1 \
-s INCOMING_MODULE_JS_API="[]"
endef

# ------------------
# opus-frame-decoder
# ------------------
define OPUS_FRAME_DECODER_EMCC_OPTS
-s JS_MATH \
-s EXPORTED_FUNCTIONS="[ \
    '_free', '_malloc' \
  , '_opus_frame_decoder_destroy' \
  , '_opus_frame_decode_float_deinterleaved' \
  , '_opus_frame_decoder_create' \
]" \
--pre-js 'src/opus-frame-decoder/src/emscripten-pre.js' \
--post-js 'src/opus-frame-decoder/src/emscripten-post.js' \
-I "modules/opus/include" \
src/opus-frame-decoder/src/opus_frame_decoder.c
endef

$(OPUS_FRAME_DECODER_MODULE): $(OPUS_WASM_LIB)
	@ mkdir -p src/opus-frame-decoder/dist
	@ echo "Building Emscripten WebAssembly module $(OPUS_FRAME_DECODER_MODULE)..."
	@ emcc \
		-o "$(OPUS_FRAME_DECODER_MODULE)" \
	  ${EMCC_OPTS} \
	  $(OPUS_FRAME_DECODER_EMCC_OPTS) \
	  $(OPUS_WASM_LIB)
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
	  ${EMCC_OPTS} \
	  $(OPUS_FRAME_DECODER_EMCC_OPTS) \
	  $(OPUS_WASM_LIB)
	@ echo "+-------------------------------------------------------------------------------"
	@ echo "|"
	@ echo "|  Successfully built ES Module: $(OPUS_FRAME_DECODER_MODULE_ESM)"
	@ echo "|"
	@ echo "+-------------------------------------------------------------------------------"

# ------------
# ogg-opus-decoder
# ------------
define OGG_OPUS_DECODER_EMCC_OPTS
-s JS_MATH \
-s EXPORTED_FUNCTIONS="[ \
    '_free', '_malloc' \
  , '_ogg_opus_decoder_create' \
  , '_ogg_opus_decoder_free' \
  , '_ogg_opus_decoder_enqueue' \
  , '_ogg_opus_decode_float_stereo_deinterleaved' \
]" \
--pre-js 'src/ogg-opus-decoder/src/emscripten-pre.js' \
--post-js 'src/ogg-opus-decoder/src/emscripten-post.js' \
-I modules/opusfile/include \
-I "modules/ogg/include" \
-I "modules/opus/include" \
src/ogg-opus-decoder/src/ogg_opus_decoder.c
endef

$(OGG_OPUS_DECODER_MODULE): $(OPUS_WASM_LIB)
	@ mkdir -p src/ogg-opus-decoder/dist
	@ echo "Building Emscripten WebAssembly module $(OGG_OPUS_DECODER_MODULE)..."
	@ emcc \
		-o "$(OGG_OPUS_DECODER_MODULE)" \
	  ${EMCC_OPTS} \
	  $(OGG_OPUS_DECODER_EMCC_OPTS) \
	  $(OPUS_WASM_LIB)
	@ echo "+-------------------------------------------------------------------------------"
	@ echo "|"
	@ echo "|  Successfully built JS Module: $(OGG_OPUS_DECODER_MODULE)"
	@ echo "|"
	@ echo "+-------------------------------------------------------------------------------"

$(OGG_OPUS_DECODER_MODULE_ESM): $(OGG_OPUS_DECODER_MODULE)
	@ echo "Building Emscripten WebAssembly ES Module $(OGG_OPUS_DECODER_MODULE_ESM)..."
	@ emcc \
		-o "$(OGG_OPUS_DECODER_MODULE_ESM)" \
		-s EXPORT_ES6=1 \
		-s MODULARIZE=1 \
	  ${EMCC_OPTS} \
	  $(OGG_OPUS_DECODER_EMCC_OPTS) \
	  $(OPUS_WASM_LIB)
	@ echo "+-------------------------------------------------------------------------------"
	@ echo "|"
	@ echo "|  Successfully built ES Module: $(OGG_OPUS_DECODER_MODULE_ESM)"
	@ echo "|"
	@ echo "+-------------------------------------------------------------------------------"

# -------------------
# Shared Opus library
# -------------------
$(OPUS_WASM_LIB): configures
	@ mkdir -p tmp
	@ echo "Building Ogg/Opus Emscripten Library $(OPUS_WASM_LIB)..."
	@ emcc \
	  -o "$(OPUS_WASM_LIB)" \
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
	@ echo "|  Successfully built: $(OPUS_WASM_LIB)"
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
	# Remove a.wasm* files created by emconfigure
	cd modules/ogg; rm a.wasm*

# -----------
# mpg123-wasm
# -----------
define MPG123_EMCC_OPTS
-s EXPORTED_FUNCTIONS="[ \
    '_free', '_malloc' \
  ,	'_mpeg_decoder_create' \
  ,	'_mpeg_decoder_destroy' \
  ,	'_mpeg_decode_float_deinterleaved' \
  ,	'_mpeg_get_sample_rate' \
]" \
--pre-js 'src/mpg123-wasm/src/emscripten-pre.js' \
--post-js 'src/mpg123-wasm/src/emscripten-post.js' \
-I "modules/mpg123/src/libmpg123" \
-I "src/mpg123-wasm/src/mpg123" \
src/mpg123-wasm/src/mpeg_decoder.c 
endef

# modules/mpg123/src/libmpg123/.libs/libmpg123.so
${MPG123_MODULE}: $(MPG123_WASM_LIB)
	@ mkdir -p src/mpg123-wasm/dist
	@ echo "Building Emscripten WebAssembly module $(MPG123_MODULE)..."
	@ emcc $(MPG123_WASM_LIB) \
		-o "$(MPG123_MODULE)" \
		$(EMCC_OPTS) \
		$(MPG123_EMCC_OPTS) 
	@ echo "+-------------------------------------------------------------------------------"
	@ echo "|"
	@ echo "|  Successfully built JS Module: $(MPG123_MODULE)"
	@ echo "|"
	@ echo "+-------------------------------------------------------------------------------"

# Uncomment to reconfigure and compile mpg123
#
#configure-mpg123:
#	cd modules/mpg123; autoreconf -iv \
#	cd modules/mpg123; CFLAGS="-Os -flto" emconfigure ./configure \
#	  --with-cpu=generic_dither \
#	  --with-seektable=0 \
#	  --disable-lfs-alias \
#	  --disable-debug \
#	  --disable-xdebug \
#	  --disable-gapless \
#	  --disable-fifo \
#	  --disable-ipv6 \
#	  --disable-network \
#	  --disable-id3v2 \
#	  --disable-string \
#	  --disable-icy \
#	  --disable-ntom \
#	  --disable-downsample \
#	  --enable-feeder \
#	  --disable-moreinfo \
#	  --disable-messages \
#	  --disable-new-huffman \
#	  --enable-int-quality \
#	  --disable-16bit \
#	  --disable-8bit \
#	  --disable-32bit \
#	  --enable-real \
#	  --disable-equalizer \
#	  --disable-yasm \
#	  --disable-cases \
#	  --disable-buffer \
#	  --disable-newoldwritesample \
#	  --enable-layer1 \
#	  --enable-layer2 \
#	  --enable-layer3 \
#	  --disable-largefile \
#	  --disable-feature_report 
#	cd modules/mpg123; rm a.wasm 
#
#build-mpg123: 
#	@ mkdir -p tmp
#	@ echo "Building mpg123 Emscripten Library mpg123..."
#	@ cd modules/mpg123; emmake make src/libmpg123/libmpg123.la \
#	  -r
#	@ echo "+-------------------------------------------------------------------------------"
#	@ echo "|"
#	@ echo "|  Successfully built: mpg123"
#	@ echo "|"
#	@ echo "+-------------------------------------------------------------------------------"

$(MPG123_WASM_LIB):
	@ mkdir -p tmp
	@ echo "Building mpg123 Emscripten Library $(MPG123_WASM_LIB)..."
	@ emcc \
	  -o "$(MPG123_WASM_LIB)" \
	  -r \
	  -Oz \
	  -flto \
	  -s NO_DYNAMIC_EXECUTION=1 \
	  -s NO_FILESYSTEM=1 \
	  -s STRICT=1 \
	  -DOPT_GENERIC -DREAL_IS_FLOAT \
	  -I "modules/mpg123/src" \
	  -I "modules/mpg123/src/libmpg123" \
	  -I "modules/mpg123/src/compat" \
	  -I "src/mpg123-wasm/src/mpg123" \
	  modules/mpg123/src/compat/compat.c \
  	  modules/mpg123/src/libmpg123/parse.c \
  	  modules/mpg123/src/libmpg123/frame.c \
  	  modules/mpg123/src/libmpg123/format.c \
  	  modules/mpg123/src/libmpg123/dct64.c \
  	  modules/mpg123/src/libmpg123/id3.c \
  	  modules/mpg123/src/libmpg123/optimize.c \
  	  modules/mpg123/src/libmpg123/readers.c \
  	  modules/mpg123/src/libmpg123/tabinit.c \
  	  modules/mpg123/src/libmpg123/libmpg123.c \
  	  modules/mpg123/src/libmpg123/layer3.c \
  	  modules/mpg123/src/libmpg123/synth_real.c 
	@ echo "+-------------------------------------------------------------------------------"
	@ echo "|"
	@ echo "|  Successfully built: $(MPG123_WASM_LIB)"
	@ echo "|"
	@ echo "+-------------------------------------------------------------------------------"