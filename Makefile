WASM_MODULE=dist/opus-decoder.js
WASM_MODULE_ESM=dist/opus-decoder.mjs
WASM_LIB=tmp/lib.bc
CONFIGURE_LIBOPUS=src/opus/configure

default: dist

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
	@ echo "+-------------------------------------------------------------------------------"


$(WASM_LIB): configures
	@ mkdir -p tmp
	@ echo "Building Opus Emscripten Library $(WASM_LIB)..."
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