
default: dist

clean: dist-clean flac-wasmlib-clean opus-wasmlib-clean ogg-wasmlib-clean vorbis-wasmlib-clean mpg123-wasmlib-clean

configure: flac-configure ogg-configure vorbis-configure libopus-configure libopus-ml-configure mpg123-configure

DEMO_PATH=demo/

dist: flac-decoder opus-decoder opus-ml-decoder ogg-opus-decoder ogg-vorbis-decoder mpg123-decoder
dist-clean:
	rm -rf $(DEMO_PATH)*.js
	rm -rf $(FLAC_DECODER_PATH)dist/*
	rm -rf $(OPUS_DECODER_PATH)dist/*
	rm -rf $(OPUS_ML_DECODER_PATH)dist/*
	rm -rf $(OGG_OPUS_DECODER_PATH)dist/*
	rm -rf $(MPG123_DECODER_PATH)dist/*
	rm -rf $(OGG_VORBIS_DECODER_PATH)dist/*
	rm -rf $(PUFF_EMSCRIPTEN_BUILD)
	rm -rf $(FLAC_EMSCRIPTEN_BUILD)
	rm -rf $(OPUS_DECODER_EMSCRIPTEN_BUILD)
	rm -rf $(OPUS_ML_DECODER_EMSCRIPTEN_BUILD)
	rm -rf $(MPG123_EMSCRIPTEN_BUILD)
	rm -rf $(OGG_VORBIS_EMSCRIPTEN_BUILD)

# puff
COMMON_PATH=src/common/
PUFF_SRC=$(COMMON_PATH)src/puff/
PUFF_WASM_LIB=tmp/puff.o
PUFF_EMSCRIPTEN_BUILD=$(COMMON_PATH)src/puff/Puff.wasm

# @wasm-audio-decoders/flac
FLAC_SRC=modules/flac/
FLAC_WASM_LIB=tmp/flac.o
FLAC_DECODER_PATH=src/flac/
FLAC_EMSCRIPTEN_BUILD=$(FLAC_DECODER_PATH)src/EmscriptenWasm.tmp.js
FLAC_DECODER_MODULE=$(FLAC_DECODER_PATH)dist/flac-decoder.js
FLAC_DECODER_MODULE_MIN=$(FLAC_DECODER_PATH)dist/flac-decoder.min.js

flac-decoder: flac-wasmlib flac-decoder-minify $(FLAC_EMSCRIPTEN_BUILD)
flac-decoder-minify: $(FLAC_EMSCRIPTEN_BUILD)
	SOURCE_PATH=$(FLAC_DECODER_PATH) \
	OUTPUT_NAME=EmscriptenWasm \
	MODULE=$(FLAC_DECODER_MODULE) \
	MODULE_MIN=$(FLAC_DECODER_MODULE_MIN) \
	COMPRESSION_ITERATIONS=209 \
	npm run minify
	cp $(FLAC_DECODER_MODULE) $(FLAC_DECODER_MODULE_MIN) $(FLAC_DECODER_MODULE_MIN).map $(DEMO_PATH)

flac-wasmlib: $(FLAC_WASM_LIB)
flac-wasmlib-clean: dist-clean
	rm -rf $(FLAC_WASM_LIB)

# @wasm-audio-decoders/ogg-vorbis
OGG_SRC=modules/ogg/
VORBIS_SRC=modules/vorbis/
OGG_VORBIS_DECODER_PATH=src/ogg-vorbis/
OGG_VORBIS_EMSCRIPTEN_BUILD=$(OGG_VORBIS_DECODER_PATH)src/EmscriptenWasm.tmp.js
OGG_VORBIS_DECODER_MODULE=$(OGG_VORBIS_DECODER_PATH)dist/ogg-vorbis-decoder.js
OGG_VORBIS_DECODER_MODULE_MIN=$(OGG_VORBIS_DECODER_PATH)dist/ogg-vorbis-decoder.min.js

ogg-vorbis-decoder: ogg-vorbis-decoder-minify $(OGG_VORBIS_EMSCRIPTEN_BUILD)
ogg-vorbis-decoder-minify: $(OGG_VORBIS_EMSCRIPTEN_BUILD)
	SOURCE_PATH=$(OGG_VORBIS_DECODER_PATH) \
	OUTPUT_NAME=EmscriptenWasm \
	MODULE=$(OGG_VORBIS_DECODER_MODULE) \
	MODULE_MIN=$(OGG_VORBIS_DECODER_MODULE_MIN) \
	COMPRESSION_ITERATIONS=12 \
	npm run minify
	cp $(OGG_VORBIS_DECODER_MODULE) $(OGG_VORBIS_DECODER_MODULE_MIN) $(OGG_VORBIS_DECODER_MODULE_MIN).map $(DEMO_PATH)

# libvorbis
VORBIS_WASM_LIB=$(VORBIS_SRC)lib/.libs/libvorbis.a
vorbis-wasmlib: $(VORBIS_WASM_LIB)
vorbis-wasmlib-clean: dist-clean
	cd modules/vorbis; emmake make clean

# libogg
OGG_WASM_LIB=$(OGG_SRC)src/.libs/libogg.a
ogg-wasmlib: $(OGG_WASM_LIB)
ogg-wasmlib-clean: dist-clean
	cd modules/ogg; emmake make clean

# ogg-opus-decoder
OGG_OPUS_DECODER_PATH=src/ogg-opus-decoder/
OGG_OPUS_DECODER_MODULE=$(OGG_OPUS_DECODER_PATH)dist/

ogg-opus-decoder: ogg-opus-decoder-minify
ogg-opus-decoder-minify: opus-decoder opus-ml-decoder
	cd $(OGG_OPUS_DECODER_PATH); npm run build
	cp $(OGG_OPUS_DECODER_MODULE)* $(DEMO_PATH)

# opus-decoder
OPUS_DECODER_PATH=src/opus-decoder/
OPUS_DECODER_EMSCRIPTEN_BUILD=$(OPUS_DECODER_PATH)src/EmscriptenWasm.tmp.js
OPUS_DECODER_MODULE=$(OPUS_DECODER_PATH)dist/opus-decoder.js
OPUS_DECODER_MODULE_MIN=$(OPUS_DECODER_PATH)dist/opus-decoder.min.js

opus-decoder: opus-wasmlib opus-decoder-minify $(OPUS_DECODER_EMSCRIPTEN_BUILD)
opus-decoder-minify: $(OPUS_DECODER_EMSCRIPTEN_BUILD)
	SOURCE_PATH=$(OPUS_DECODER_PATH) \
	OUTPUT_NAME=EmscriptenWasm \
	MODULE=$(OPUS_DECODER_MODULE) \
	MODULE_MIN=$(OPUS_DECODER_MODULE_MIN) \
	COMPRESSION_ITERATIONS=44 \
	npm run minify
	cp $(OPUS_DECODER_MODULE) $(OPUS_DECODER_MODULE_MIN) $(OPUS_DECODER_MODULE_MIN).map $(DEMO_PATH)

# libopus
OPUS_SRC=modules/opus/
OPUS_WASM_LIB=tmp/libopus.a
opus-wasmlib: $(OPUS_WASM_LIB)
opus-wasmlib-clean: dist-clean
	rm -rf $(OPUS_WASM_LIB)

# opus-ml-decoder
OPUS_ML_DECODER_PATH=src/opus-ml/
OPUS_ML_DECODER_EMSCRIPTEN_BUILD=$(OPUS_ML_DECODER_PATH)src/EmscriptenWasm.tmp.js
OPUS_ML_DECODER_MODULE=$(OPUS_ML_DECODER_PATH)dist/opus-ml-decoder.js
OPUS_ML_DECODER_MODULE_MIN=$(OPUS_ML_DECODER_PATH)dist/opus-ml-decoder.min.js

opus-ml-decoder: opus-ml-wasmlib opus-ml-decoder-minify $(OPUS_ML_DECODER_EMSCRIPTEN_BUILD)
opus-ml-decoder-minify: $(OPUS_ML_DECODER_EMSCRIPTEN_BUILD)
	SOURCE_PATH=$(OPUS_ML_DECODER_PATH) \
	OUTPUT_NAME=EmscriptenWasm \
	MODULE=$(OPUS_ML_DECODER_MODULE) \
	MODULE_MIN=$(OPUS_ML_DECODER_MODULE_MIN) \
	COMPRESSION_ITERATIONS=3 \
	npm run minify
	cp $(OPUS_ML_DECODER_MODULE) $(OPUS_ML_DECODER_MODULE_MIN) $(OPUS_ML_DECODER_MODULE_MIN).map $(DEMO_PATH)

# libopus-ml
OPUS_ML_SRC=modules/opus-ml/
OPUS_ML_WASM_LIB=tmp/libopus-ml.a
opus-ml-wasmlib: $(OPUS_ML_WASM_LIB)
opus-ml-wasmlib-clean: dist-clean
	rm -rf $(OPUS_ML_WASM_LIB)

# mpg123-decoder
MPG123_SRC=modules/mpg123/
MPG123_WASM_LIB=tmp/mpg123.o
MPG123_DECODER_PATH=src/mpg123-decoder/
MPG123_EMSCRIPTEN_BUILD=$(MPG123_DECODER_PATH)src/EmscriptenWasm.tmp.js
MPG123_MODULE=$(MPG123_DECODER_PATH)dist/mpg123-decoder.js
MPG123_MODULE_MIN=$(MPG123_DECODER_PATH)dist/mpg123-decoder.min.js

mpg123-decoder: mpg123-wasmlib mpg123-decoder-minify ${MPG123_EMSCRIPTEN_BUILD}
mpg123-decoder-minify: $(MPG123_EMSCRIPTEN_BUILD)
	SOURCE_PATH=$(MPG123_DECODER_PATH) \
	OUTPUT_NAME=EmscriptenWasm \
	MODULE=$(MPG123_MODULE) \
	MODULE_MIN=$(MPG123_MODULE_MIN) \
	COMPRESSION_ITERATIONS=240 \
	npm run minify
	cp $(MPG123_MODULE) $(MPG123_MODULE_MIN) $(MPG123_MODULE_MIN).map $(DEMO_PATH)

mpg123-wasmlib: $(MPG123_WASM_LIB)
mpg123-wasmlib-clean: dist-clean
	rm -rf $(MPG123_WASM_LIB)

# -O4,--flexible-inline-max-function-size,--dae-optimizing,-ffm,--coalesce-locals-learning,--optimize-instructions,--rse,--reorder-functions,--reorder-functions,--reorder-locals,--merge-blocks,--merge-locals,--simplify-globals-optimizing,--licm,--vacuum,--converge,
# common EMCC options
define EMCC_OPTS
-O3 \
--minify 0 \
-flto \
-s BINARYEN_EXTRA_PASSES="-O4,--optimize-instructions,--vacuum,--converge" \
-s MINIMAL_RUNTIME=2 \
-s TEXTDECODER=2 \
-s SINGLE_FILE=1 \
-s MALLOC="emmalloc" \
-s NO_FILESYSTEM=1 \
-s ENVIRONMENT=web,worker \
-s STRICT=1 \
-s ASSERTIONS=0 \
-s ABORTING_MALLOC=0 \
-s EXIT_RUNTIME=0 \
-s INCOMING_MODULE_JS_API="[]"
endef

# ----------------------
# puff (inflate library)
# ----------------------
# requires: llvm, clang, llc, binaryen
puff:
	@ clang \
		--target=wasm32 \
		-nostdlib \
		-flto \
		-Wl,--export=puff \
		-Wl,--export=__heap_base \
		-Wl,--no-entry \
		-Wl,--lto-O3 \
		-Wl,--initial-memory=6291456 \
		-Oz \
		-DSLOW=1 \
		-o "$(PUFF_EMSCRIPTEN_BUILD)" \
		$(PUFF_SRC)puff.c
	@ wasm-opt \
		-lmu \
		-O3 \
		--reorder-functions \
		--reorder-locals \
		--strip-producers \
		--vacuum \
		--converge \
		$(PUFF_EMSCRIPTEN_BUILD) \
		-o $(PUFF_EMSCRIPTEN_BUILD)
	@ npm run build-puff


# -------------------------
# @wasm-audio-decoders/flac
# -------------------------
define FLAC_EMCC_OPTS
-s JS_MATH \
--no-entry \
-s EXPORTED_FUNCTIONS="[ \
    '_free', '_malloc' \
  , '_create_decoder' \
  , '_destroy_decoder' \
  , '_decode_frame' \
]" \
--pre-js '$(FLAC_DECODER_PATH)src/emscripten-pre.js' \
--post-js '$(FLAC_DECODER_PATH)src/emscripten-post.js' \
-I "$(FLAC_SRC)include/FLAC" \
$(FLAC_DECODER_PATH)src/flac_decoder.c
endef

$(FLAC_EMSCRIPTEN_BUILD): $(FLAC_WASM_LIB)
	@ mkdir -p $(FLAC_DECODER_PATH)dist
	@ echo "Building Emscripten WebAssembly module $(FLAC_EMSCRIPTEN_BUILD)..."
	@ emcc \
		-o "$(FLAC_EMSCRIPTEN_BUILD)" \
	  ${EMCC_OPTS} \
	  $(FLAC_EMCC_OPTS) \
	  $(FLAC_WASM_LIB)
	@ echo "+-------------------------------------------------------------------------------"
	@ echo "|"
	@ echo "|  Successfully built JS Module: $(FLAC_EMSCRIPTEN_BUILD)"
	@ echo "|"
	@ echo "+-------------------------------------------------------------------------------"

$(FLAC_WASM_LIB):
	@ mkdir -p tmp
	@ echo "Building FLAC Emscripten Library $(FLAC_WASM_LIB)..."
	@ emcc \
	  -o "$(FLAC_WASM_LIB)" \
	  -r \
	  -O3 \
	  -flto \
	  -s JS_MATH \
	  -s NO_FILESYSTEM=1 \
	  -s STRICT=1 \
	  -D HAVE_CONFIG_H=1 \
	  -I "$(FLAC_SRC)" \
	  -I "$(FLAC_SRC)include" \
	  -I "$(FLAC_SRC)src/libFLAC/include" \
	  $(FLAC_SRC)src/libFLAC/stream_decoder.c \
	  $(FLAC_SRC)src/libFLAC/format.c \
	  $(FLAC_SRC)src/libFLAC/crc.c \
	  $(FLAC_SRC)src/libFLAC/bitreader.c \
	  $(FLAC_SRC)src/libFLAC/bitmath.c \
	  $(FLAC_SRC)src/libFLAC/fixed.c \
	  $(FLAC_SRC)src/libFLAC/lpc.c \
	  $(FLAC_SRC)src/libFLAC/memory.c \
	  $(FLAC_SRC)src/libFLAC/md5.c \
	  $(FLAC_SRC)src/libFLAC/cpu.c
	@ echo "+-------------------------------------------------------------------------------"
	@ echo "|"
	@ echo "|  Successfully built: $(FLAC_WASM_LIB)"
	@ echo "|"
	@ echo "+-------------------------------------------------------------------------------"

flac-configure:
	cd $(FLAC_SRC); ./autogen.sh
	cd $(FLAC_SRC); CFLAGS="-Os -flto" emconfigure ./configure \
	  --disable-doxygen-docs \
	  --disable-cpplibs \
	  --disable-ogg \
	  --disable-programs \
	  --disable-examples \
	  --disable-asm-optimizations \
	  --disable-multithreading \
	  --disable-largefile \
	  --enable-debug=no \
	  --host=wasm32-unknown-emscripten
	cd $(FLAC_SRC); rm a.wasm 

# -------------------------
# @wasm-audio-decoders/ogg-vorbis
# -------------------------
define OGG_VORBIS_EMCC_OPTS
-s JS_MATH \
--no-entry \
-s EXPORTED_FUNCTIONS="[ \
    '_free', '_malloc' \
  , '_create_decoder' \
  , '_send_setup' \
  , '_init_dsp' \
  , '_decode_packets' \
  , '_destroy_decoder' \
]" \
--pre-js '$(OGG_VORBIS_DECODER_PATH)src/emscripten-pre.js' \
--post-js '$(OGG_VORBIS_DECODER_PATH)src/emscripten-post.js' \
-I "$(OGG_SRC)include" \
-I "$(VORBIS_SRC)include/vorbis" \
$(OGG_VORBIS_DECODER_PATH)src/vorbis_decoder.c
endef

$(OGG_VORBIS_EMSCRIPTEN_BUILD): $(OGG_WASM_LIB) $(VORBIS_WASM_LIB)
	@ mkdir -p $(OGG_VORBIS_DECODER_PATH)dist
	@ echo "Building Emscripten WebAssembly module $(OGG_VORBIS_EMSCRIPTEN_BUILD)..."
	@ emcc \
		-o "$(OGG_VORBIS_EMSCRIPTEN_BUILD)" \
	  ${EMCC_OPTS} \
	  $(OGG_VORBIS_EMCC_OPTS) \
	  $(VORBIS_WASM_LIB) \
	  $(OGG_WASM_LIB)
	@ echo "+-------------------------------------------------------------------------------"
	@ echo "|"
	@ echo "|  Successfully built JS Module: $(OGG_VORBIS_EMSCRIPTEN_BUILD)"
	@ echo "|"
	@ echo "+-------------------------------------------------------------------------------"

ogg-configure:
	cd $(OGG_SRC); ./autogen.sh
	cd $(OGG_SRC); emconfigure ./configure \
	  --host=wasm32-unknown-emscripten
	cd $(OGG_SRC); rm a.wasm

$(OGG_WASM_LIB):
	@ mkdir -p tmp
	@ echo "Building OGG_VORBIS Emscripten Library $(OGG_WASM_LIB)..."
	cd modules/ogg; emmake make -j8
	@ echo "+-------------------------------------------------------------------------------"
	@ echo "|"
	@ echo "|  Successfully built: $(OGG_WASM_LIB)"
	@ echo "|"
	@ echo "+-------------------------------------------------------------------------------"

vorbis-configure:
	cd $(VORBIS_SRC); ./autogen.sh; sed -i '/Ogg >= 1.0 required !/d' configure
	cd $(VORBIS_SRC); CFLAGS="-Os -flto" emconfigure ./configure \
	  --with-ogg=$(shell pwd)/$(OGG_SRC) \
	  --disable-docs \
	  --disable-examples \
	  --disable-shared \
	  --host=wasm32-unknown-emscripten
	cd $(VORBIS_SRC); rm a.wasm 

$(VORBIS_WASM_LIB):
	@ mkdir -p tmp
	@ echo "Building OGG_VORBIS Emscripten Library $(VORBIS_WASM_LIB)..."
	cd modules/vorbis; emmake make -j8
	@ echo "+-------------------------------------------------------------------------------"
	@ echo "|"
	@ echo "|  Successfully built: $(VORBIS_WASM_LIB)"
	@ echo "|"
	@ echo "+-------------------------------------------------------------------------------"

# ------------------
# opus-decoder
# ------------------
define OPUS_DECODER_EMCC_OPTS
-s JS_MATH \
-s INITIAL_MEMORY=28MB \
-s EXPORTED_FUNCTIONS="[ \
    '_free', '_malloc' \
  , '_opus_frame_decoder_destroy' \
  , '_opus_frame_decode_float_deinterleaved' \
  , '_opus_frame_decoder_create' \
]" \
--pre-js '$(OPUS_DECODER_PATH)src/emscripten-pre.js' \
--post-js '$(OPUS_DECODER_PATH)src/emscripten-post.js' \
-I "modules/opus/include" \
$(OPUS_DECODER_PATH)src/opus_frame_decoder.c
endef

$(OPUS_DECODER_EMSCRIPTEN_BUILD): $(OPUS_WASM_LIB)
	@ mkdir -p $(OPUS_DECODER_PATH)dist
	@ echo "Building Emscripten WebAssembly module $(OPUS_DECODER_EMSCRIPTEN_BUILD)..."
	@ emcc \
		-o "$(OPUS_DECODER_EMSCRIPTEN_BUILD)" \
	  ${EMCC_OPTS} \
	  $(OPUS_DECODER_EMCC_OPTS) \
	  $(OPUS_WASM_LIB)
	@ echo "+-------------------------------------------------------------------------------"
	@ echo "|"
	@ echo "|  Successfully built JS Module: $(OPUS_DECODER_EMSCRIPTEN_BUILD)"
	@ echo "|"
	@ echo "+-------------------------------------------------------------------------------"

#$(OPUS_WASM_LIB):
#	@ mkdir -p tmp
#	@ echo "Building Opus Emscripten Library $(OPUS_WASM_LIB)..."
#	@ emcc \
#	  -o "$(OPUS_WASM_LIB)" \
#	  -r \
#	  -Os \
#	  -flto \
#	  -D VAR_ARRAYS \
#	  -D OPUS_BUILD \
#	  -D HAVE_LRINTF \
#	  -s JS_MATH \
#	  -s NO_DYNAMIC_EXECUTION=1 \
#	  -s NO_FILESYSTEM=1 \
#	  -s STRICT=1 \
#	  -I modules/opus/dnn \
#	  -I modules/opus/include \
#	  -I modules/opus/celt \
#	  -I modules/opus/silk \
#	  -I modules/opus/silk/float \
#	  modules/opus/src/opus.c \
#	  modules/opus/src/opus_multistream.c \
#	  modules/opus/src/opus_multistream_decoder.c \
#	  modules/opus/src/opus_decoder.c \
#	  modules/opus/silk/*.c \
#	  modules/opus/celt/*.c
#	@ echo "+-------------------------------------------------------------------------------"
#	@ echo "|"
#	@ echo "|  Successfully built: $(OPUS_WASM_LIB)"
#	@ echo "|"
#	@ echo "+-------------------------------------------------------------------------------"

$(OPUS_WASM_LIB): 
	@ mkdir -p tmp
	@ echo "Building Opus Emscripten Library $(OPUS_WASM_LIB)..."
	@ cd $(OPUS_SRC); emmake make -j 4 libopus.la \
	  -r
	@ cp ${OPUS_SRC}.libs/libopus.a $(OPUS_WASM_LIB)
	@ echo "+-------------------------------------------------------------------------------"
	@ echo "|"
	@ echo "|  Successfully built: $(OPUS_WASM_LIB)"
	@ echo "|"
	@ echo "+-------------------------------------------------------------------------------"

libopus-configure:
	@ cd $(OPUS_SRC); ./autogen.sh
	@ cd $(OPUS_SRC); CFLAGS="-Os" emconfigure ./configure \
	  --host=wasm32-unknown-emscripten \
	  --enable-float-approx \
	  --disable-rtcd \
	  --disable-hardening
	cd $(OPUS_SRC); rm a.wasm

# ------------------
# opus-ml
# ------------------
define OPUS_ML_DECODER_EMCC_OPTS
-s INITIAL_MEMORY=52MB \
-s STACK_SIZE=128KB \
-s EXPORTED_FUNCTIONS="[ \
    '_free', '_malloc' \
  , '_opus_ml_frame_decoder_destroy' \
  , '_opus_ml_frame_decode_float_deinterleaved' \
  , '_opus_ml_frame_decoder_create' \
]" \
-msimd128 \
--pre-js '$(OPUS_ML_DECODER_PATH)src/emscripten-pre.js' \
--post-js '$(OPUS_ML_DECODER_PATH)src/emscripten-post.js' \
-I "modules/opus/include" \
$(OPUS_ML_DECODER_PATH)src/opus_ml_frame_decoder.c
endef

$(OPUS_ML_DECODER_EMSCRIPTEN_BUILD): $(OPUS_ML_WASM_LIB)
	@ mkdir -p $(OPUS_ML_DECODER_PATH)dist
	@ echo "Building Emscripten WebAssembly module $(OPUS_ML_DECODER_EMSCRIPTEN_BUILD)..."
	@ emcc \
		-o "$(OPUS_ML_DECODER_EMSCRIPTEN_BUILD)" \
	  ${EMCC_OPTS} \
	  $(OPUS_ML_DECODER_EMCC_OPTS) \
	  $(OPUS_ML_WASM_LIB)
	@ echo "+-------------------------------------------------------------------------------"
	@ echo "|"
	@ echo "|  Successfully built JS Module: $(OPUS_ML_DECODER_EMSCRIPTEN_BUILD)"
	@ echo "|"
	@ echo "+-------------------------------------------------------------------------------"

#$(OPUS_WASM_LIB):
#	@ mkdir -p tmp
#	@ echo "Building Opus Emscripten Library $(OPUS_WASM_LIB)..."
#	@ emcc \
#	  -o "$(OPUS_WASM_LIB)" \
#	  -r \
#	  -Os \
#	  -flto \
#	  -D VAR_ARRAYS \
#	  -D OPUS_BUILD \
#	  -D HAVE_LRINTF \
#	  -D ENABLE_OSCE \
#	  -s JS_MATH \
#	  -s NO_DYNAMIC_EXECUTION=1 \
#	  -s NO_FILESYSTEM=1 \
#	  -s STRICT=1 \
#	  -I modules/opus/dnn \
#	  -I modules/opus/include \
#	  -I modules/opus/celt \
#	  -I modules/opus/silk \
#	  -I modules/opus/silk/float \
#	  modules/opus/src/opus.c \
#	  modules/opus/src/opus_multistream.c \
#	  modules/opus/src/opus_multistream_decoder.c \
#	  modules/opus/src/opus_decoder.c \
#	  modules/opus/silk/*.c \
#	  modules/opus/celt/*.c \
#	  modules/opus/dnn/osce.c \
#	  modules/opus/dnn/osce_features.c \
#	  modules/opus/dnn/nndsp.c \
#	  modules/opus/dnn/lace_data.c \
#	  modules/opus/dnn/nolace_data.c \
#	  modules/opus/dnn/nnet.c \
#	  modules/opus/dnn/lossgen.c \
#	  modules/opus/dnn/freq.c \
#	  modules/opus/dnn/lpcnet_tables.c
#	@ echo "+-------------------------------------------------------------------------------"
#	@ echo "|"
#	@ echo "|  Successfully built: $(OPUS_WASM_LIB)"
#	@ echo "|"
#	@ echo "+-------------------------------------------------------------------------------"

$(OPUS_ML_WASM_LIB): 
	@ mkdir -p tmp
	@ echo "Building Opus Emscripten Library $(OPUS_ML_WASM_LIB)..."
	@ cd $(OPUS_ML_SRC); emmake make -j 4 libopus.la \
	  -r
	@ cp ${OPUS_ML_SRC}.libs/libopus.a $(OPUS_ML_WASM_LIB)
	@ echo "+-------------------------------------------------------------------------------"
	@ echo "|"
	@ echo "|  Successfully built: $(OPUS_ML_WASM_LIB)"
	@ echo "|"
	@ echo "+-------------------------------------------------------------------------------"

libopus-ml-configure:
	@ cd $(OPUS_ML_SRC); git checkout src/opus_multistream_decoder.c
	@ cd $(OPUS_ML_SRC); git apply ../../$(OPUS_ML_DECODER_PATH)opus_enable_osce.patch
	@ cd $(OPUS_ML_SRC); ./autogen.sh
	@ cd $(OPUS_ML_SRC); OPUS_X86_PRESUME_AVX2=0 OPUS_X86_MAY_HAVE_AVX2=0 CFLAGS="-O3 -msimd128 -mavx2"  \
	  emconfigure ./configure \
	  --host=x86_64-unknown-emscripten \
	  --enable-float-approx \
	  --disable-rtcd \
	  --disable-hardening \
	  --enable-osce
	cd $(OPUS_ML_SRC); rm a.wasm

# -----------
# mpg123-decoder
# -----------
define MPG123_EMCC_OPTS
-s EXPORTED_FUNCTIONS="[ \
    '_free' \
  , '_malloc' \
  , '_mpeg_decoder_feed' \
  , '_mpeg_decoder_read' \
  ,	'_mpeg_frame_decoder_create' \
  ,	'_mpeg_frame_decoder_destroy' \
]" \
-s ERROR_ON_UNDEFINED_SYMBOLS=0 \
--pre-js '$(MPG123_DECODER_PATH)src/emscripten-pre.js' \
--post-js '$(MPG123_DECODER_PATH)src/emscripten-post.js' \
-I "$(MPG123_SRC)src/libmpg123" \
-I "$(MPG123_DECODER_PATH)src/mpg123" \
$(MPG123_DECODER_PATH)src/mpeg_frame_decoder.c 
endef

# $(MPG123_SRC)src/libmpg123/.libs/libmpg123.so
${MPG123_EMSCRIPTEN_BUILD}: $(MPG123_WASM_LIB)
	@ mkdir -p $(MPG123_DECODER_PATH)dist
	@ echo "Building Emscripten WebAssembly module $(MPG123_EMSCRIPTEN_BUILD)..."
	@ emcc $(MPG123_WASM_LIB) \
		-o "$(MPG123_EMSCRIPTEN_BUILD)" \
		$(EMCC_OPTS) \
		$(MPG123_EMCC_OPTS) 
	@ echo "+-------------------------------------------------------------------------------"
	@ echo "|"
	@ echo "|  Successfully built JS Module: $(MPG123_EMSCRIPTEN_BUILD)"
	@ echo "|"
	@ echo "+-------------------------------------------------------------------------------"

# "#define NOQUIET 0" is manually appended to `config.h` to allow unused debugging code to be stripped from the compilation
mpg123-configure:
	cd $(MPG123_SRC); autoreconf -iv
	cd $(MPG123_SRC); CFLAGS="-Os -flto" emconfigure ./configure \
	  --host=wasm32-unknown-emscripten \
	  --with-cpu=generic_dither \
	  --with-seektable=0 \
	  --disable-lfs-alias \
	  --disable-debug \
	  --disable-xdebug \
	  --enable-gapless \
	  --disable-fifo \
	  --disable-ipv6 \
	  --disable-network \
	  --disable-id3v2 \
	  --disable-string \
	  --disable-icy \
	  --disable-ntom \
	  --disable-downsample \
	  --enable-feeder \
	  --disable-moreinfo \
	  --disable-messages \
	  --disable-new-huffman \
	  --enable-int-quality \
	  --disable-16bit \
	  --disable-8bit \
	  --disable-32bit \
	  --enable-real \
	  --disable-equalizer \
	  --disable-yasm \
	  --disable-cases \
	  --disable-buffer \
	  --disable-newoldwritesample \
	  --enable-layer1 \
	  --enable-layer2 \
	  --enable-layer3 \
	  --disable-largefile \
	  --disable-feature-report \
	  --enable-runtime-tables
	cd $(MPG123_SRC); rm a.wasm
	printf "\n#define NOQUIET 0" >> $(MPG123_SRC)src/config.h

#$(MPG123_WASM_LIB): 
#	@ mkdir -p tmp
#	@ echo "Building mpg123 Emscripten Library mpg123..."
#	@ cd $(MPG123_SRC); emmake make src/libmpg123/libmpg123.la \
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
	  -Wno-macro-redefined \
	  -s NO_FILESYSTEM=1 \
	  -s STRICT=1 \
	  -DOPT_GENERIC -DREAL_IS_FLOAT \
	  -I "$(MPG123_SRC)src" \
	  -I "$(MPG123_SRC)src/libmpg123" \
	  -I "$(MPG123_SRC)src/compat" \
	  $(MPG123_SRC)src/libmpg123/parse.c \
	  $(MPG123_SRC)src/libmpg123/frame.c \
	  $(MPG123_SRC)src/libmpg123/format.c \
	  $(MPG123_SRC)src/libmpg123/dct64.c \
	  $(MPG123_SRC)src/libmpg123/id3.c \
	  $(MPG123_SRC)src/libmpg123/optimize.c \
	  $(MPG123_SRC)src/libmpg123/readers.c \
	  $(MPG123_SRC)src/libmpg123/tabinit.c \
	  $(MPG123_SRC)src/libmpg123/libmpg123.c \
	  $(MPG123_SRC)src/libmpg123/layer1.c \
	  $(MPG123_SRC)src/libmpg123/layer2.c \
	  $(MPG123_SRC)src/libmpg123/layer3.c \
	  $(MPG123_SRC)src/libmpg123/synth_real.c
	@ echo "+-------------------------------------------------------------------------------"
	@ echo "|"
	@ echo "|  Successfully built: $(MPG123_WASM_LIB)"
	@ echo "|"
	@ echo "+-------------------------------------------------------------------------------"
