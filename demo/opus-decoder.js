(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('web-worker')) :
  typeof define === 'function' && define.amd ? define(['exports', 'web-worker'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["opus-decoder"] = {}, global.Worker));
})(this, (function (exports, Worker) { 'use strict';

  function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

  var Worker__default = /*#__PURE__*/_interopDefaultLegacy(Worker);

  const compiledWasm = new WeakMap();

  class WASMAudioDecoderCommon {
    constructor(wasm) {
      this._wasm = wasm;

      this._pointers = new Set();
    }

    get wasm() {
      return this._wasm;
    }

    static async initWASMAudioDecoder() {
      // instantiate wasm code as singleton
      if (!this._wasm) {
        // new decoder instance
        if (this._isWebWorker) {
          // web worker
          this._wasm = new this._EmscriptenWASM(WASMAudioDecoderCommon);
        } else {
          // main thread
          if (compiledWasm.has(this._EmscriptenWASM)) {
            // reuse existing compilation
            this._wasm = compiledWasm.get(this._EmscriptenWASM);
          } else {
            // first compilation
            this._wasm = new this._EmscriptenWASM(WASMAudioDecoderCommon);
            compiledWasm.set(this._EmscriptenWASM, this._wasm);
          }
        }
      }

      await this._wasm.ready;

      const common = new WASMAudioDecoderCommon(this._wasm);

      [this._inputPtr, this._input] = common.allocateTypedArray(
        this._inputPtrSize,
        Uint8Array
      );

      // output buffer
      [this._leftPtr, this._leftArr] = common.allocateTypedArray(
        this._outputPtrSize,
        Float32Array
      );
      [this._rightPtr, this._rightArr] = common.allocateTypedArray(
        this._outputPtrSize,
        Float32Array
      );

      [this._outputPtr, this._output] = common.allocateTypedArray(
        this._outputChannels * this._outputPtrSize,
        Float32Array
      );

      return common;
    }

    static concatFloat32(buffers, length) {
      const ret = new Float32Array(length);

      let offset = 0;
      for (const buf of buffers) {
        ret.set(buf, offset);
        offset += buf.length;
      }

      return ret;
    }

    static getDecodedAudio(channelData, samplesDecoded, sampleRate) {
      return {
        channelData,
        samplesDecoded,
        sampleRate,
      };
    }

    static getDecodedAudioConcat(channelData, samplesDecoded, sampleRate) {
      return WASMAudioDecoderCommon.getDecodedAudio(
        channelData.map((data) =>
          WASMAudioDecoderCommon.concatFloat32(data, samplesDecoded)
        ),
        samplesDecoded,
        sampleRate
      );
    }

    static getDecodedAudioMultiChannel(
      input,
      channelsDecoded,
      samplesDecoded,
      sampleRate
    ) {
      const channelData = [];

      for (let i = 0; i < channelsDecoded; i++) {
        const channel = [];
        for (let j = 0; j < input.length; j++) {
          channel.push(input[j][i]);
        }
        channelData.push(
          WASMAudioDecoderCommon.concatFloat32(channel, samplesDecoded)
        );
      }

      return WASMAudioDecoderCommon.getDecodedAudio(
        channelData,
        samplesDecoded,
        sampleRate
      );
    }

    getOutputChannels(outputData, channelsDecoded, samplesDecoded) {
      const output = [];

      for (let i = 0; i < channelsDecoded; i++)
        output.push(
          outputData.slice(
            i * samplesDecoded,
            i * samplesDecoded + samplesDecoded
          )
        );

      return output;
    }

    allocateTypedArray(length, TypedArray) {
      const pointer = this._wasm._malloc(TypedArray.BYTES_PER_ELEMENT * length);
      const array = new TypedArray(this._wasm.HEAP, pointer, length);

      this._pointers.add(pointer);
      return [pointer, array];
    }

    free() {
      for (const pointer of this._pointers) this._wasm._free(pointer);
      this._pointers.clear();
    }

    /*
     ******************
     * Compression Code
     ******************
     */

    static inflateYencString(source, dest) {
      const output = new Uint8Array(source.length);

      let continued = false,
        byteIndex = 0,
        byte;

      for (let i = 0; i < source.length; i++) {
        byte = source.charCodeAt(i);

        if (byte === 13 || byte === 10) continue;

        if (byte === 61 && !continued) {
          continued = true;
          continue;
        }

        if (continued) {
          continued = false;
          byte -= 64;
        }

        output[byteIndex++] = byte < 42 && byte > 0 ? byte + 214 : byte - 42;
      }

      return WASMAudioDecoderCommon.inflate(output.subarray(0, byteIndex), dest);
    }

    static inflate(source, dest) {
      const TINF_OK = 0;
      const TINF_DATA_ERROR = -3;

      const uint8Array = Uint8Array;
      const uint16Array = Uint16Array;

      class Tree {
        constructor() {
          this.t = new uint16Array(16); /* table of code length counts */
          this.trans = new uint16Array(
            288
          ); /* code -> symbol translation table */
        }
      }

      class Data {
        constructor(source, dest) {
          this.s = source;
          this.i = 0;
          this.t = 0;
          this.bitcount = 0;

          this.dest = dest;
          this.destLen = 0;

          this.ltree = new Tree(); /* dynamic length/symbol tree */
          this.dtree = new Tree(); /* dynamic distance tree */
        }
      }

      /* --------------------------------------------------- *
       * -- uninitialized global data (static structures) -- *
       * --------------------------------------------------- */

      const sltree = new Tree();
      const sdtree = new Tree();

      /* extra bits and base tables for length codes */
      const length_bits = new uint8Array(30);
      const length_base = new uint16Array(30);

      /* extra bits and base tables for distance codes */
      const dist_bits = new uint8Array(30);
      const dist_base = new uint16Array(30);

      /* special ordering of code length codes */
      const clcidx = new uint8Array([
        16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
      ]);

      /* used by tinf_decode_trees, avoids allocations every call */
      const code_tree = new Tree();
      const lengths = new uint8Array(288 + 32);

      /* ----------------------- *
       * -- utility functions -- *
       * ----------------------- */

      /* build extra bits and base tables */
      const tinf_build_bits_base = (bits, base, delta, first) => {
        let i, sum;

        /* build bits table */
        for (i = 0; i < delta; ++i) bits[i] = 0;
        for (i = 0; i < 30 - delta; ++i) bits[i + delta] = (i / delta) | 0;

        /* build base table */
        for (sum = first, i = 0; i < 30; ++i) {
          base[i] = sum;
          sum += 1 << bits[i];
        }
      };

      /* build the fixed huffman trees */
      const tinf_build_fixed_trees = (lt, dt) => {
        let i;

        /* build fixed length tree */
        for (i = 0; i < 7; ++i) lt.t[i] = 0;

        lt.t[7] = 24;
        lt.t[8] = 152;
        lt.t[9] = 112;

        for (i = 0; i < 24; ++i) lt.trans[i] = 256 + i;
        for (i = 0; i < 144; ++i) lt.trans[24 + i] = i;
        for (i = 0; i < 8; ++i) lt.trans[24 + 144 + i] = 280 + i;
        for (i = 0; i < 112; ++i) lt.trans[24 + 144 + 8 + i] = 144 + i;

        /* build fixed distance tree */
        for (i = 0; i < 5; ++i) dt.t[i] = 0;

        dt.t[5] = 32;

        for (i = 0; i < 32; ++i) dt.trans[i] = i;
      };

      /* given an array of code lengths, build a tree */
      const offs = new uint16Array(16);

      const tinf_build_tree = (t, lengths, off, num) => {
        let i, sum;

        /* clear code length count table */
        for (i = 0; i < 16; ++i) t.t[i] = 0;

        /* scan symbol lengths, and sum code length counts */
        for (i = 0; i < num; ++i) t.t[lengths[off + i]]++;

        t.t[0] = 0;

        /* compute offset table for distribution sort */
        for (sum = 0, i = 0; i < 16; ++i) {
          offs[i] = sum;
          sum += t.t[i];
        }

        /* create code->symbol translation table (symbols sorted by code) */
        for (i = 0; i < num; ++i) {
          if (lengths[off + i]) t.trans[offs[lengths[off + i]]++] = i;
        }
      };

      /* ---------------------- *
       * -- decode functions -- *
       * ---------------------- */

      /* get one bit from source stream */
      const tinf_getbit = (d) => {
        /* check if tag is empty */
        if (!d.bitcount--) {
          /* load next tag */
          d.t = d.s[d.i++];
          d.bitcount = 7;
        }

        /* shift bit out of tag */
        const bit = d.t & 1;
        d.t >>>= 1;

        return bit;
      };

      /* read a num bit value from a stream and add base */
      const tinf_read_bits = (d, num, base) => {
        if (!num) return base;

        while (d.bitcount < 24) {
          d.t |= d.s[d.i++] << d.bitcount;
          d.bitcount += 8;
        }

        const val = d.t & (0xffff >>> (16 - num));
        d.t >>>= num;
        d.bitcount -= num;
        return val + base;
      };

      /* given a data stream and a tree, decode a symbol */
      const tinf_decode_symbol = (d, t) => {
        while (d.bitcount < 24) {
          d.t |= d.s[d.i++] << d.bitcount;
          d.bitcount += 8;
        }

        let sum = 0,
          cur = 0,
          len = 0,
          tag = d.t;

        /* get more bits while code value is above sum */
        do {
          cur = 2 * cur + (tag & 1);
          tag >>>= 1;
          ++len;

          sum += t.t[len];
          cur -= t.t[len];
        } while (cur >= 0);

        d.t = tag;
        d.bitcount -= len;

        return t.trans[sum + cur];
      };

      /* given a data stream, decode dynamic trees from it */
      const tinf_decode_trees = (d, lt, dt) => {
        let i, length;

        /* get 5 bits HLIT (257-286) */
        const hlit = tinf_read_bits(d, 5, 257);

        /* get 5 bits HDIST (1-32) */
        const hdist = tinf_read_bits(d, 5, 1);

        /* get 4 bits HCLEN (4-19) */
        const hclen = tinf_read_bits(d, 4, 4);

        for (i = 0; i < 19; ++i) lengths[i] = 0;

        /* read code lengths for code length alphabet */
        for (i = 0; i < hclen; ++i) {
          /* get 3 bits code length (0-7) */
          const clen = tinf_read_bits(d, 3, 0);
          lengths[clcidx[i]] = clen;
        }

        /* build code length tree */
        tinf_build_tree(code_tree, lengths, 0, 19);

        /* decode code lengths for the dynamic trees */
        for (let num = 0; num < hlit + hdist; ) {
          const sym = tinf_decode_symbol(d, code_tree);

          switch (sym) {
            case 16:
              /* copy previous code length 3-6 times (read 2 bits) */
              const prev = lengths[num - 1];
              for (length = tinf_read_bits(d, 2, 3); length; --length) {
                lengths[num++] = prev;
              }
              break;
            case 17:
              /* repeat code length 0 for 3-10 times (read 3 bits) */
              for (length = tinf_read_bits(d, 3, 3); length; --length) {
                lengths[num++] = 0;
              }
              break;
            case 18:
              /* repeat code length 0 for 11-138 times (read 7 bits) */
              for (length = tinf_read_bits(d, 7, 11); length; --length) {
                lengths[num++] = 0;
              }
              break;
            default:
              /* values 0-15 represent the actual code lengths */
              lengths[num++] = sym;
              break;
          }
        }

        /* build dynamic trees */
        tinf_build_tree(lt, lengths, 0, hlit);
        tinf_build_tree(dt, lengths, hlit, hdist);
      };

      /* ----------------------------- *
       * -- block inflate functions -- *
       * ----------------------------- */

      /* given a stream and two trees, inflate a block of data */
      const tinf_inflate_block_data = (d, lt, dt) => {
        while (1) {
          let sym = tinf_decode_symbol(d, lt);

          /* check for end of block */
          if (sym === 256) {
            return TINF_OK;
          }

          if (sym < 256) {
            d.dest[d.destLen++] = sym;
          } else {
            let length, dist, offs;

            sym -= 257;

            /* possibly get more bits from length code */
            length = tinf_read_bits(d, length_bits[sym], length_base[sym]);

            dist = tinf_decode_symbol(d, dt);

            /* possibly get more bits from distance code */
            offs =
              d.destLen - tinf_read_bits(d, dist_bits[dist], dist_base[dist]);

            /* copy match */
            for (let i = offs; i < offs + length; ++i) {
              d.dest[d.destLen++] = d.dest[i];
            }
          }
        }
      };

      /* inflate an uncompressed block of data */
      const tinf_inflate_uncompressed_block = (d) => {
        let length, invlength;

        /* unread from bitbuffer */
        while (d.bitcount > 8) {
          d.i--;
          d.bitcount -= 8;
        }

        /* get length */
        length = d.s[d.i + 1];
        length = 256 * length + d.s[d.i];

        /* get one's complement of length */
        invlength = d.s[d.i + 3];
        invlength = 256 * invlength + d.s[d.i + 2];

        /* check length */
        if (length !== (~invlength & 0x0000ffff)) return TINF_DATA_ERROR;

        d.i += 4;

        /* copy block */
        for (let i = length; i; --i) d.dest[d.destLen++] = d.s[d.i++];

        /* make sure we start next block on a byte boundary */
        d.bitcount = 0;

        return TINF_OK;
      };

      /* -------------------- *
       * -- initialization -- *
       * -------------------- */

      /* build fixed huffman trees */
      tinf_build_fixed_trees(sltree, sdtree);

      /* build extra bits and base tables */
      tinf_build_bits_base(length_bits, length_base, 4, 3);
      tinf_build_bits_base(dist_bits, dist_base, 2, 1);

      /* fix a special case */
      length_bits[28] = 0;
      length_base[28] = 258;

      const d = new Data(source, dest);
      let bfinal, btype, res;

      do {
        /* read final block flag */
        bfinal = tinf_getbit(d);

        /* read block type (2 bits) */
        btype = tinf_read_bits(d, 2, 0);

        /* decompress block */
        switch (btype) {
          case 0:
            /* decompress uncompressed block */
            res = tinf_inflate_uncompressed_block(d);
            break;
          case 1:
            /* decompress block with fixed huffman trees */
            res = tinf_inflate_block_data(d, sltree, sdtree);
            break;
          case 2:
            /* decompress block with dynamic huffman trees */
            tinf_decode_trees(d, d.ltree, d.dtree);
            res = tinf_inflate_block_data(d, d.ltree, d.dtree);
            break;
          default:
            res = TINF_DATA_ERROR;
        }

        if (res !== TINF_OK) throw new Error("Data error");
      } while (!bfinal);

      if (d.destLen < d.dest.length) {
        if (typeof d.dest.slice === "function") return d.dest.slice(0, d.destLen);
        else return d.dest.subarray(0, d.destLen);
      }

      return d.dest;
    }
  }

  class WASMAudioDecoderWorker extends Worker__default["default"] {
    constructor(options, Decoder, EmscriptenWASM) {
      const webworkerSourceCode =
        "'use strict';" +
        // dependencies need to be manually resolved when stringifying this function
        `(${((_options, _Decoder, _WASMAudioDecoderCommon, _EmscriptenWASM) => {
        // We're in a Web Worker
        _Decoder.WASMAudioDecoderCommon = _WASMAudioDecoderCommon;
        _Decoder.EmscriptenWASM = _EmscriptenWASM;
        _Decoder.isWebWorker = true;

        const decoder = new _Decoder(_options);

        const detachBuffers = (buffer) =>
          Array.isArray(buffer)
            ? buffer.map((buffer) => new Uint8Array(buffer))
            : new Uint8Array(buffer);

        self.onmessage = ({ data: { id, command, data } }) => {
          switch (command) {
            case "ready":
              decoder.ready.then(() => {
                self.postMessage({
                  id,
                });
              });
              break;
            case "free":
              decoder.free();
              self.postMessage({
                id,
              });
              break;
            case "reset":
              decoder.reset().then(() => {
                self.postMessage({
                  id,
                });
              });
              break;
            case "decode":
            case "decodeFrame":
            case "decodeFrames":
              const { channelData, samplesDecoded, sampleRate } = decoder[
                command
              ](detachBuffers(data));

              self.postMessage(
                {
                  id,
                  channelData,
                  samplesDecoded,
                  sampleRate,
                },
                // The "transferList" parameter transfers ownership of channel data to main thread,
                // which avoids copying memory.
                channelData.map((channel) => channel.buffer)
              );
              break;
            default:
              this.console.error("Unknown command sent to worker: " + command);
          }
        };
      }).toString()})(${JSON.stringify(
        options
      )}, ${Decoder}, ${WASMAudioDecoderCommon}, ${EmscriptenWASM})`;

      const type = "text/javascript";
      let source;

      try {
        // browser
        source = URL.createObjectURL(new Blob([webworkerSourceCode], { type }));
      } catch {
        // nodejs
        source = `data:${type};base64,${Buffer.from(webworkerSourceCode).toString(
        "base64"
      )}`;
      }

      super(source);

      this._id = Number.MIN_SAFE_INTEGER;
      this._enqueuedOperations = new Map();

      this.onmessage = ({ data }) => {
        const { id, ...rest } = data;
        this._enqueuedOperations.get(id)(rest);
        this._enqueuedOperations.delete(id);
      };
    }

    async _postToDecoder(command, data) {
      return new Promise((resolve) => {
        this.postMessage({
          command,
          id: this._id,
          data,
        });

        this._enqueuedOperations.set(this._id++, resolve);
      });
    }

    get ready() {
      return this._postToDecoder("ready");
    }

    async free() {
      await this._postToDecoder("free").finally(() => {
        this.terminate();
      });
    }

    async reset() {
      await this._postToDecoder("reset");
    }
  }

  /* **************************************************
   * This file is auto-generated during the build process.
   * Any edits to this file will be overwritten.
   ****************************************************/

  class EmscriptenWASM {
  constructor(WASMAudioDecoderCommon) {
  var Module = Module;

  function ready() {}

  Module = {};

  function abort(what) {
   throw what;
  }

  for (var base64ReverseLookup = new Uint8Array(123), i = 25; i >= 0; --i) {
   base64ReverseLookup[48 + i] = 52 + i;
   base64ReverseLookup[65 + i] = i;
   base64ReverseLookup[97 + i] = 26 + i;
  }

  base64ReverseLookup[43] = 62;

  base64ReverseLookup[47] = 63;

  Module["wasm"] = WASMAudioDecoderCommon.inflateYencString(`Æç7¶¿ÿ¡¡Ýé	!rsNïYs~µÌR»¹¼R´¾R©7Sô×æVÏÔÓ6ÓP[êL1;\`tpeÕ»¶Û®¯«_,1Z>¹¶GZr¶ê 6Q6;\`ó:-åsæÍ&(wtÈë´¤!¥çÈ#¤¿ùé[Ó~Tó%ó5ß&£Kç Wã lÿøõoyâv¹Ewå;uuóÁË$ÿUY^æ6¡ÖÿATîTØçoíUXðô¤ñêD§ËÖ³P&Õ~Ë¥¿ô5»lSfuhÉ¦èü!©~Ó%¯tÍ¤(ßÄNßYsÔ}OCÕd¿pdÓaåsÍ»Ð=MüÃ³ã$&wüpwmðL×eÎÈ¸aâÏß¯×÷t×=@Ï¤§Üy¨cs¼¤MsØÑýpÅëU%µ©Æ ÄU#¹µ¿å½AUA¼ÁTK#yTùP'ô#z¼ÖO¿Û©ÙÕ¨×À~Ù¯Þâ¥Ð fzRÎç[~PeÎ'ÖÄ´ÏññË¼ÏÎ=}ü»8ÿ=MK7óètr¯á´ÎÉ{K±fÿ=M®½=M¿x±ÄÔïÁXß¯EËFºtUÕSJÖàÄ=@&ÖßÄà&ÖåÄ 'ÖáÄ &_ÇÝ¯ÿëùÀýi5ÕÝÇÕxißÄÝçÕieâÄHÝmÕKieæÄH ÝÍÕ{¤ ¦jùªÁ½f§pgÃ=}s{ý2*fQ£¤°DÒ{¥âDßzCãrÎÌ=MVg|s'Ö¤Î|çß¿<ÄT?¨þ¦~=M¶fTÇyQßËìrfãÄÿHÜ÷ªÒ7yxr$~àÀN¬B·zGªÃje5Ëü4Ñ¼¸½ñÃ@,N­ìêÒ"KS~3ÐÍ!¯XÿûE^^çèä¨ë*,"´1BAG69Y ÿÊPØjMG~ý´¹½ÌeVâ:fü+îü+výËußÃìãÖtªT@Xÿ+Ê.Õa~%híQT9~j1=@+âz=M«lþ>´qÝÚ=@ÕrG=@Îû­Õ£U» <÷­PqR»6lä]:¡ýÙt­Ýæ)ªßÞ¤æzÌtT-íílÁoÏíÉÿ½$ßG?$Ç¡ñB±Ý^¯X¦&i¤iÔ6Pðÿ³LÇÂàT(sç¿ënÍh[ûÈªvsMØý buL~Äãè*=}sÍÆÛù#éÀ5¤îñ¨y{×ý5 Y¤5®wø¶¹£áÀ73Ö¢ÉÒ³TWÕ%w?ØûfuÚ|1øoäæ©Ýüý>'zé³¯ÜÈaªÌDYRÙÖ%ïI$·ãêæXê¤SúÚ2¼HÎ£Ýé¨'¨s5Í7Í7£<slk©9)¬(|*m4U$ñÀÌÞtÿUïÊÝ*Á-näüw©vÇËÖw}Z´$ûÿ[VàÒØÍSËÒT;/ëÞ±÷ÎÕKÅ^]Àõ®	sºzÆ~»êLQÃËÖ@ÏÕíã_{NÁHï=}Á¶íÏÑð+Øî^ÿ@/g-wR=}äuâç~åÑ³Ñø?ÝÝÍÛ\`áÅ·?½Á´G=@æ OÈ}%V¶±¸ß=MÝ5=MÜäëd;ðXú+@WÈÿKÅDà7· ïÞ¢ñ=JÏU6pGfõhþíÂÄ@Ï^v?xbz¢Têò³ÖEànàÿÅÃ¢iZ´V7þB´¢íê/ô_èHäçQdúÓàý^=}E¢m²4ç3ÿ=@¦ÍByÛ8º/hhÈÒ¿ÖwKç®ÊË#¾=Jé"u­æÛ}½ÏwÚm=}0ªóòä6¸H?ØgÈã-!cì¡o´Ý ycöÔÔ­¶©ßF©=@iÙt°@ï!9!ÝØ_×^?·Ì$jn_åÅ^ÚëB¯ ø´û"ñbfÈàûÒýVM\\KÖä¼¡¤½ö©Ôù)Þz,+ø{#7vËG¾/uD´D¤¸æ=}¼&ÅrZ7x$	) ¡Ü@Ò2¶±_×õz©Góm¾ð4@¤¿uCVÖÊ"GödNY=JWä·,OZª¼NÂ­Å)æÌ«h]ª@)XC(h<å;­½=JµÎs³Ô;9\\ÜÞçÀÉ~RRsê:+ûIÒívV®gþXmØÕïþSðÒÞRÄmØ_Â¡ùîÓÔ½sÃkª¼.¬v@<o+µeójûK³d<.ê$=JË^]{N¢s(¸÷ÔóÅû	7ËèTlÀhh8ÎIK÷9Jæ¸æVºã¤ó¯x»©?ÿ=Jzzº>~{¦µCUÔyåâY3/×S#AÁ£ÒõÏÜàûä|_9îíÔÝ·÷XP\`[|Vf®³ø3;°§öß.Øé]É Ù_ok:E±w¶1 K5FÔP3-Pî=@ËXì¿=J/ÅíAJ¼<üJ°ÄprÍ[¿ó;#>îPJÌzfWTeÕ ¸çÇøùnÈªá@ä§Pâéi¥ËQëwNéiWà$<NµÔôÛT»5ÙÔM¶-°8\\ÆÎ.kÂ¼pºä1CíjCEªÕ¶@^O]ß:Q6Éð£P@^Vu,sª.t\\N9µ¯¨xëõ2ëÝ¨mß#ïl,ôð5>³HZ²Ýd=@÷Æ^cÝÀk+-?É%í4¥sÇ'÷´ÂrµÐË[â\\òÜ§çi>Ul=M|°f]%RÅíaXÈ]õê1ceõ:£IRuÚWÔ<F>ïæÏÝ}uþ5i¬ôpåäSÆÆ\`B£=@¡Â5÷EKyJÕFr£ï\`7seÃ|£¥¬á\`æ(tlÍ§/ØÀRÞpuEU4â8n2nÐ.»Y£ÍÏ°DìÐÃ»°Ê5p°o®­ÖB\`ÐüöqúV*!ùJcßÃþ <vÌRBPæTÁcÙ|õ¤gÞeVês·Ê32\`9£ÕH+D¨4ìÀ¸ºZ£ÿÖx#®\`=}zë£¯c8	¹3=}U_\\äÛsñöiíê¸@µö»Ïcû¼ Â'ÛD8RËeÙ¾<Ý¿=MWè<Ñ¶Ô½ÕÇ[é÷û¡l'q©"­Ñ¸ç70ÔËQhñÿ#æ{°®É]ÒìÛÍõ¥sÖÔ\`¥ÊÁ¸ÝGmñìÞ¸=J*j%m¯Ê¬N	¤=MaãÓhqu	ºFv©Ï½MkýñZ0»§aÉ5Õ5Âå àÊ·î*V#7Ó×Xß·!Üp¡§E¬ZÐ»ÆïL¬©¢Ù(hEæw/&ÝP+q :[ÝËÁkýÖ×Þ(çÇYÇKVçWè:V.Öíç=J]cívÔhIa¶¡í¶	¤=M£êÅ1à×~¿²Vv¹xvuJQÓ^¯<0M¿bpïÞDSHYÕ¥µ=@ËÅý#ê®Ër^n^*_\\ÀÛdXÔ¬[Dæÿl½HÂõå¸çÊ©>1dn7ÌÍ'b=Mðÿögê]òÖv;ðúhb²³»½äað$Ö|sãÛ¸T/²£}a=J¾´Ìuþ|O}ÅÕÿ¸ËÑzÓMyí?²ß´DÌÊµòF*Ý=M7â ÒPÐ!ÂÚ×m­%:ì[ÇëgMZ@çqª<£ajQÎôº$·\`j]ÑlÄa*ÖÔ'Î»öòÐðOõaÒV©á>Ü¥M:xûasÐXÔ²Ô¢h<×´gOû9$wæï¤ËÎÿzõQm%Ït¥öZCÐ*£\\ìÞ´ã°9Tp3pùT»àµXNÓÌ;±qZ1±Î<<Ä«¤4OîJvç|=@µ?Ñ.Ö¹âëËKÚÂòªÇ´"&è_Ôi½=JO>};ër²Sx{{$Øu=Jü*ÄÉðÒ"À£§çZSSøªmúüm%Ù¬åaZ;?0ÊM¥Ë§ÑÒÜy40x´Üê§dVÓ¾÷*Úöe=M%?ô÷­Üg·®]òBæ ³@^XyXë©î½{jÕÛNw*s3ur7£ÏBLYuÚîÃâýØö"uV¿ÿ¨*O|ÀÖÏWÝÈEï:Á½Àëî(dò%T½6 KÛ5Êñ^³aºÊýzdû±åV=@é­©U(ái'©{¿ê©'¤¤óIvèÉÝÊõ'ÖÔ=@°HúÞ¯B+DÿÅã×Ó,×7	Xç÷HQ=MmÒøivü$ß_QÂ\`eØ"äl§¼UuïÁx÷ÔÛà¿à^Í_ ¹,RÙÓá)¡(aÊÄÅKD®M4ã4àéÖÝ÷¤]	=}ï·R´nk=}ì"ó:ªkåu]6=@vè¶üä=}ßÇÁzÄ¼¾OêÒÑÇûpK~.ßºÄ*×áòÀrexÎQßr¤@éVmª ãzßwÊÈ8r¤gP×ðïÞëãsbaýajÍdÿQ´¥Y1µ¿&z½õ\`\\NÖßìëLç¼ª¤ÒxÙx>Y@ÿ_¾/ßZôÒA¤Û<$pâ"ÂLÑ®³:üa½ôhKv×kCêî$]?84UÐÜÄä:o<8þ|^òpÑäý³Ó~ëBõ[ss¥³ÿÇG8ÜeË'}¤ÛÈWÅÇÚç"w\`ìVøÜÞâú// 4O;×Ñ"áµHVE0&ËöJiv:+ËæÏµ(Cbg^×:0E½ïÉakPniÁy³ñvSÍ1Q{£ë=}=M77|æßìØßxTçÁðã9¡Ô|Do§éa¥J3úY*áNüÊy¯¯}#Ã4ß ÑåMæø;Ø¾=MÎý5&ÍÝçï÷¶¯ ·ýÛðõñwuY=@ISë}iP¼Tá*R¥1ÒM÷£ùS©²øÆ iIûÆ@sÕä	ÍDz¦Ü¡xáAÂÖ¯µvüBmi Dít2±¦ÄÐâ(UÐW<¬¸Ai)«O@YUh¬ð=@À¾þÓIl 4­ BºÑìmí»V±RYôëd§5a­Ýeqpw	Ö±O¶ØíWñ0yûF~ú¡|å§MÝ×õyÐuË'Â¿è©L^®½¾! î¤v=Mô©æÜòÃ?Un@æÕExx ÜQ7ã½ØöÍ"ÇÜ3È¹ëìtYüÖS§ãnùÛ½JB¼¤~¤°¤Ûõ9]y¶µ=@ =J?ËäÇÀnH%/ùØÐazl°ð$ýå=@ÆaWðØ÷Ì]ÂÒQß7m@róÚ~¢Lû.áCÁÃòÖñµ$$_ÉzbÆ·1Ç]ËØ+Z÷Ø×úÌEóµÒéÃÜénÝ½cGZûÅ¹Gò#!?i£)ÉÌÃ_'Õ"ðktEHê#0Q)\`½ÅéõöúJ%d~Lÿu^$¸¾9·Æ«#Ä_µ[$ÐiÏ¡æ=@ç_ÍÞ$øA¹!j¾Ùý,CýÞlNWR+¥ª+Ð¥>e	Zå_ïù+â!ERöî¥ÿ_©Õa*îa9hºBü<áê=@Z­ûÌÞR·6uç-íÞ|Ï~ÓØAã@#$o«ý=@ñ@?·_¢æ­MtCsüR²×Ç>§WñMÏ´s[îp®{È@=}ÁmLdòóD1B´±D. ×ù¿Ðº í@^ÄWÔIþºwû>(çcGX*½çÒeÇ¸""ù9@)ùkã[þxÏë)f²Uö>×½zÛ!Ðwh¼ÎÂ+wÃßU¨à¹<é´Ìp×Ð	Æ Bä¦§ä"=Jj=@F\\CÖ=}4RSz&c¹^^)¶Í[v³×Ðiªl¿ý	9Ôr7_ Q¢QÊ=@!¦§6%5àØ@7qFfxR$n4íÒ½]Aýöç 9Ó{»vÂ3¼´FmÊ("®]ovLs®ë,ì¹"·m§¨=Mðnû  |î0ì3?×Ldp|é­¡o8åvN¸ÆcPvbGÍ4°2X»Y½ïyÑ%<ëC=}ÉµiÃ±ær¤6z,¶m¢AÉ§Z¸6ÍùQ^\\°OM&ÊCÅ­Îi½ýØüÄ	o?÷>Zc¿¿þµÉ{nåU7x2-	dÊGÃ&0öR2êD£RÔ>d"Ùà*IÒ®£Fk´ÔP±5ú;ÍíwÅz7DZâH¼ó"Ë¨ÐøZÐ¥?øu±à_iÇ¨\`ØøOÔI_6\`;;AÄ&Óâ!hW/O¢½EÉÜ+Zr~6RÑpäÊÜóLª¤ÉþU'±ÝLÅÆ&RÈ+ h{üSâÖ@Ütb]>ð¦47Ú^F°"*\`²wé£rwÏ8¾Ä\`t+»BE\`Y¯ó'ó¥Q}®,e)[ÙMöWkTÜ-%ýO·/0R×G_QàJ^	æeXk=})që»$×%bç¨}Qî1!£YñNv¶CùÝÕ¨:	9´v@Ç5©*s=M}Î'Z\`T±wåí.¼·?ËkkÏZKîéYqÑgÑ÷0Ð¯R.ñ=@"ÉÆú®Qe}´+¼w1Eã] ¢b[å¾L]Y#>5Ñ{:VÐü5±[9OÌ¢p-ok>Ó¡sPêXgÞÿÙvý zO¢]É$"ë±I¨²E-H~Â£/h/lÏªp.~ôÉ<8ßuÜt¥ÉÊCæÐ£;S/nÑêá:F	ª²¯ÎýÏ9ÿUaÐvð¯×]_X5À8´WºâVõpþ¼Exdyà\\©¸»-ëÖ=@Ã×õZeÚ3Ô	«+¡ÛÚV[mrÝbPð¿T¸g³nÀ_¬B|Eô°H{à_x)ZÖ7£=Méón g?íL¹Ë±¸X<Í·ÔÙ÷ÁÇäa#^åÇ7(×"Á\\;YÙA÷UDºÈßxIÀ3ýVjâ½À	^d°¦±°AÖø.mÃB !T­¦ÃÐ2ib'sEXèõ~_BÑ­Æõ °=@(ÎP©¼ì¬LOAUaÄ.&0ìx·\\HB#tÑÒ¥CÝ	ô?è7=J :hìÖã¡£×K8µé¾ú[*.Qî.cûðCî¸dõÐ'\\~Õ£>2n{Ç~Ìæçç_»n (À»ÛÂqLÌýµ¼önW\\^©ë<ÅæÙ"zÝí½u,î÷%Û£Ñ^à½Ëí·®j8øêjåSY¼}¦T¦GÑgÇÿ5_{+½Ý¹}bÜ°¼#GÞHµ±e@à0fÇÌ:±Ú³_ûn=Jnp{QñØÅqÑ?~ëàÚ}KiY¬g<¤KØ*BL|<DáËH=@laVR8·Ltæ½¤50Tñ(o~¶+k1$WüÁy²d®±Ñ\`+>ÃÐ*=@G/Ò =}9ÉG­¥jÅÁúòÅ»½îr÷(òzØí9'¦EHÁgÅ0H]MýOßS¼xâí±ªhÛldç<8¹Ø'Ë%=J>%Ç9Ýé·*ÿõ¡ZÒûëfÍ2rà[Ûë5LßîÃÐS©õÈòAñ­qþ¤ÌdX*kÌË<¼çaÀ!"PÎ\`l}ÐjU2WxÃPÐãE.}L××KñÌ{×<·èPçZÖ¨ý^Vúuæ]U<Ï¶T*«jÌÛ[º^F<FKúx+²ü	aïãvl=@\\îuÔýC{×K ø7FvK¶	ñíuÚþ¸~(ê6çÆjbÎN!áNcAÂ*0>A	Âà#í6å.-Wt4Óú·9Þ±sÙ47j>{ó_9êöÈãÁ%ðÛWzOÌàbD¤gõ na­@Em=M9Ôç"ÐìvXþæ})Ý÷Ç"-=MÓx	Ædå.³þç!ïá÷üÐ*½òhÒÛ¾÷@B8nB,ô³?§S=@wÐºs7|K>¯ä|vÙCE»%xaVÙÛ.ÿ¨IA#]RtMöÄ<=J¼ÛÒÛq-ö-bKvûcàÛZ×P°Þm²¦Ñæ¿Î(¸3×xm÷Á4©\\0­sTè¯âKók=}eàqÖ*mIt²=}ÂýzííÚ&Ë¯f!ý-DÉ-ôÞ"Ö¦càPëüj^Ùóuv#+äÂþ¬ ÙÅPt4qÅÐ¡ÐÃE<=M@+3Í´~ Íe¢±H§w×mv'µt(+Här<µ,æzË"-i?#Ú«>cêÇ¦R¹Ã.$ÈÚÒ×ÅF ©o¡aÐìHMS35hT<[°ù1éÁw}c¯Ý±Ò×ÈJ1&øEi$ÑÂr()"Yé¯³nì:¥¥¯~UOußxì0NûÈâ×g(^+?çà÷_-eQßï{e¿Ç¯-!J¾/&ï5Á$P#¶Öj¤b°~FjyÇõ>üº(@ó^Ì¨rH&éÌjÏRùX9Ã^J\\¶ÿíF¸uØüÒÅþ¬­8àZù´iÌßºsÚ«Öÿ{©µ©á{ÀTP÷·ívv{\\n×\\òãè5ËoÝ0öFÍ4±¾M÷äMA¾Dí½uG&$VÕ¢ë\\¶Å8gÃþd0o$\\§k±yY¢«ö4ÑêïÒZnËPÄÎXdúbRÚ²èC ©ß=}"±ïÙªÔüdO±GîiMýý¼½í@ÙÒ	ÍÁ0æÎÁ×æÙ¸ø?1RÃþcYwþ¿VµÌGéä©þ{÷¯'êÄ×]$Ð%°ý<¿=JÂ|9îÿ~Ê=MN4-x¨iî÷ß,v}£ÁÝ6DÊIkK/YâHHtèJaßR¨ÎÐ^;	½b58àÙ_O5ýÁ=Mës_\`\`'°ÛGs®<©IqÀÇm4:1ä»éUÖÑi²d=@ß½éÅ¢[²-RTäGF2¶=}æp=}áûÂÙ7"8ûöI÷Ú=M34zïýÍAÍ­m,ñÍï(ªgÐÇKï=@_>ü¡«pÆ×¥eN;6ìÁ^!QN=JÓ¼ZüAÇYc^¸7[ý¤Ú+ÎÕS×¥ê¾¾R´££hRÇ8d¡úkMÞÛ>À¶ÌÿGÅeR=@Û@}=Mý8¯'BLÓÝßÎvÉæ.ÿo/áÜGdæº«[FÚö³²ºtRü²mØ®Ú0;Ûß>¦Þ[C6°y¡Úþ=MG=M=@ð=Mðð=Mp#âåÂTI¥AïÿaHaaHa§®_ëÌÅ?_Å²ªS\`~º¾íæÆ¼}¸û\\ãÂ'­7þQíùñÃË1Ý;§Üì(eø\\G@Ý'dV!ZÁgÒív n±ª8çKGPÜÍdÝ±BõHûË¿×úòHÿËÀgÐmÄgØmOeC=}&½Å%tó5Í=J²3þl^<¨ìóßs·Â7úsIiÅî+\\ñ6H°Áz°ugÏv?(°@&Ûb"B=Mf¥=MÍ(áãgá±ÙôMEùHpµIÊï993xÑ¹feùDä':áO%ËU5ÈG¢ êseíoÙgZ*ü³Ìp1ç]½©tFÇy#eq°æè1a¥"Öù¢ 	õÉ	¢à©"6ÔÈËTÉíºÈðÆ?r¡ø²ûQbÅD(ñÖ±ñ©ÔóÓW®Ð'ïµB$¢VV2Orº·æÅ¡m=MÜäuÛV.=@8Ö=@à{0õ8ûÙ\`*/vIÄûÈL²h&®1·ò}eÞB ë÷:<\\aÅÎÞR(þù³Çh¸u\\ëDß.±ÝA³®Ñ{X"¥!nÁ>ÎMöÍçí2Ò&t­ñ;MperµQm±ñÕÒüeF¦¾K°ëü@_q¬/Í HhÀFU@ai±ÁËVO=MWPöP°DèA^-ðe¥é&÷ÿ¥PF(nÄì;¨Vþb WååRì,.m'½¿¨Ø]=MbØ÷jkí¯uµi(ÚLÈÃEX¿<;|4ÎHÚgÎyÌ±ÞzÐ¦'=@b÷>2=MüY¥ò³ppLq¾Ó1Ë­~pB*¬¦ûæ<C»?íÃÍZ:K" Z,P>Ï¯Øöâe\`@vb)uF&¥ekòZÙz"kÐÂÈeSçi©wä^î|âU·tpZ?Áä°b4|ÐÃ{iôG41où\`Ù÷¦»oË½Çy¤=@q÷ÌÕgø´'WOãD4HLÅlZ1« í@%_È}pxiÖfñ­ Æï$d¸­Ô÷DNrQ¡Z½RHÅèT\`ÓT\`4ÙFmH=J[ïýlH¾=M´Ù@p©A?ï@nì7uÓ,¾ÛRôd>àrRrÿt3?¼[u~=@çþ,ÚJÄ¬~15(2\`»gyem=@ôt~eÊPûÖ¬±¦ïðò#h.0ùÃhD\\ÍüZqQêCw*±o"d±/£¥µsÙZ­¼í Á8ç8GPì!c¶s¾:½øêcþF|ç~Ú¤è9ÕÂä]8eKF ÜbF,«bF_-Ã°t"6ñ3¹¾2gi¼ùÐ"ûRÈÇ7[9MòBÎbzº»-ôkÈjjðãï¦L¸ö± cA³ùh.wÁõFE\\FÙ.¾_få=MgMV$¸7@¡ñ¿òÌ¢ óÌk¨ * &óÈ?§¼ÙÔ&\`ôÙ¤#íäL¥Ò5ùÈ"VÜã·í»g±·{þµi=}«³ùn&ÃW#UÒ¹°ùÀiÀgÕ*9øÈk±ê²Ôlê£«òÍWf$ªc¹°>Ù°¡¡ðjÔ¹¼EHÏr´ÒÞòÖõ¨EÝ=@ý;ÇSýjÅÍd»¸ö5\\}ªîê=J÷@ã=@R{ö·Ô65nÖ\`xË5Vß²BøºýïÅ&ì¥]Æ)f6pQãÀûÿ2÷­:õä×æ5÷á4ö¤aT¿wE?¢=@=JtããOnrÿÂÆPxÙQL¤ì5{¡}Ww=Mq>èR2´0ðÞ¯ñÈçUëwØj¬NC=Müïg\`=M­Z{=MwûÞh90·ÓáÎ­¯Ûå"É=MôÂ¦°!vB!{Ýæ³biÁkîmÑ·õÄ¼yà)\\©8fvªåz&±£½·a®|\`yM(63{ïbÖÃëäYÁûX²|Ç~îÅ½»Ù²ßQ«IÑ´Úq§¿ò®DaÁ_½×æ?Y%IZ«^ O_çÞ±udÍ%ü=}ì?NüëÿíHéZ+Ml¨Ív§ÙÝCGÙu×¶vMv²xjöW[S10E¾æ¼#órÝJ@¸V¢}f°>d÷±C_.8fCøhäïÆ¸ëE,iRQl¤q¥ª-ËÓ´ð(í¨	ªñÂ"Ì=@5Àc=@µI6AÙAnÃ×"B(Own28´'ÆÂßðñ°fÞ/éÐ2ÿEtÒ$ua9Þð<®ÌÑÇNõ¢P­±¯ÀEÃ[å>4o;)¸Úù+ßÌJþkndßÚê®ÀÀJÉ@±§GdÂ§§¡7	)ä+3î¸±<£ý·E¿D?k\`ñ	o]û]NñDôÖÊ#oMAÊ£qPZ¿Üt'éPÕ 2ù/öL½±%¾®$< E\\Ã¡¾f/=@ü²LçX\`ò| ¸hEKïP/cbdêu7ô´À=M=}Z;9ÇHuüßÞÿ¼/ÊåiÞÚ6TÖÅ+=J9 >§Éy\\ð·ôÇ}ÞIÅ¨ý¥Ð=M,zd|g@<ïæ	ÚÐkaòb÷TÛEU;Å=@=Mïëúxy=JeSìsvåeëtos¹ÐRàz_/ÓD®Ð_k½pö§6;%=}ªZ¢!ÿµéåêÍ¨F/D	ÔºNø8uRÁX?	Ã\\¶ÙyÙSìFA£ÆòÕoØE*9ª\`Y?ñ@ÆÜ3#>ç±U®ZëËáæ*×ßáã]^ÙqHN,ëVBDß¦á=}j8dOuyQVò	Ó@ ¤×®gpfyhsàe¤;H+@}Ë¥òÓ)¤Ì	PY 5ÂÄcýA©=@fsNsJï>i"vKºàËJASäçhÐä)6É#vfãÃ}î,K@g<M2Ü÷w¯k\`ïu¬O;H(<á>OÇ.ÔîKì 88y.íA¿\\n»HH¬èxNkíuF²gë|PÙø4ûl(,¿¸X÷w=}5¹£ªß¥QõîìÝ3g¸=MçÁóRåW=M¼£\`¥=M\`WÙQºCaoÂµ$n7ù÷ÞSðÃ{8}Fªµo>ÝbÎIá·Yv}Àf%»¬oØQ'IäE&YññßñI:.q&ÉFº¦£LåÁ;qBå½§×3/ÓâWîª±¢CdÏVXoPòé?v~å´ìKM*ìòÇA´ÂµD 739ÉÊ×¯7g.ËÍ8!¼úGI2pðrð=M3c¥à]µó2=}Üî®G4ìZ$×ú¨0*ëN1â9ì\\6w¤F±¼§âUÄ,}ÌªDE,÷öAùHÝ;¹98ËfÒx²´kmß£áoØÙGl1&Ír,7@D@¿dÙæwË)Øqìý 5ùxa_´^ÍJ±p0jÚÓ>|éØ.Ýª£~\`F9=@­QôT«'¿ÝÎûþVc¹óK,K·=MÀox<¸³¹ì>wáq&nFXçÅìÉF|$l»ÔÈ| E7nÂ!Kìñì6®VaìÇE}pñ*ÐÓÕ¿++³M«ÁÇ¬@²µúgÛ(ÞûüÕûZInk6O×aË®Iä\`E·æ èÕJ	ûJR*ys¹LFn\`ç%ègq&)ë)!Yy)ý)Êóhw¯Ê´ÏòÔ®y©Q%öW"¬RX¦#¶Ïp-»­Ñ©nyÕ¢¿=M¿f«±Loô´Ì;ô(6>8Yå \`Ït²dý8Ô=M¾&+A«|¼ì³¦ô=JCß}Qê¼òvðsxÏSõ}[zÕv8+<lÛNzºAøÌÀ§uJ<þ=}uËÇî¦Wn+xb7ãD½,[(Ñ¤{+£ÎÞªmPt;² ï×¢X-yÆàW~N*{¥ïì1ï)Ï^ï±Unë¼ÛxÖÿLÿ}kµ)³wr/!s(çOóda)vmæÍ|¦É±ëÔ&2øï!)Lû	.ú)á©%òdÎs}1AUn8ÜñZ¿Ún\`_uZ2ÓvgPà@	gJSý®åZÂâT^I1ºíþw´+Õeù!ÌyÈ¾²¤qÆÖ{:ôÌÄL¬ÌÒV}ê=JJÔ/U+ë02RªÒså;r{nÏt5JGïÔ¾X«J»Ú4ö/ÐXkÄ=@úkNÍ(Zð½¬k<àzSÅðÏ£ùÚæ:@Õ64ÕEÊÿ³Ð¼såkËûÜQ#°Ô|¿]*É8y>ìíÜ·?°d(²Þt¡}anÇhO©õ52¢ÃÃ<	o|UM{7á1üwE¹Ñø¬Q N0ËÈ¦lÍ®,¿T"ÔWã"·}@;ÎØUï)Óö«%$)	:¶P²©¨ÃCÃ°s¹d)àÀàÙ_6ÀYqd2Ñ´ÐU°OÈSÍÔñ½¿rz®Oí]óÇâ¤µÇÔT4ûè!Îu·±r/Ø¯ê¬ôjßõ=M~tßëhkûBPÏ³ë/â´5s¨Rï	¥Ä=}MRQ.Û@EÐ	ôÑ¦Vj)0DS÷G4EsÀü yÒw$þ¤¶ôV±Ü3ö»V¨*¨Àì\\³hx4Ï3zÌ=}ÇõiÝã1´PÊ°*yúwOg6S;¬Þ/ÎÝa=J;FÚ¶(tF|ÀÓ]t%ª ÛªÃ¡£}/ü³ÿÁÒÄ¸¦û\\ÔïÆÀ­K{¾d¾@Jµ^9bú"X»õìqåd\\òjÛÄar\`\\gSÛëéÇÐ_<-Ù/c\`m=@D*²I:y@G8óÌ3J[uÒAVk1ÑµKÌ¬¼w=}Ì>t¼4uÓ¸²3cNC4ÀúRêÆNSw¶ÙívWµ|æ)éPÀÅn¼³)=}­(8Å2>N,­],ª;/nÿ]VnAzÀJ9zaRa9~¹%xx2Y;Þ$r(\\&ÆÎYqì+Àdé÷xK<CSªÙ¶#S=JúÒmWfG¾>sÙê1XÝ5üJCýv,÷üm9³ßý{Ä®»{{'Y?\\6®¿±ú¨;+ufÝÐJ»Cõü(5lú¯Ë:TCDAC)|g¾ÊÐ§âN²¹rr½.CXïÃtÍ8l_þ7¨¾¬õEÈÑ#OÖÚE°¢{é:=}ãõCÓE'QØwè>­2ÞÓ[«ÑQ¼ßmµrû×XßÇ¼ø?N\\ø®¡8dÂIÀLÍÊ1fÕB ¾MX¿4øb[QOVìyì6¥lHcàî¿(iõ÷{^çyRëRíªM®ú=Mu[Ô6Í#nÇ2|¹rÄ¤~ÌÿN=}Ý6ËÄñc.½(Êy«d¡BS¿ðu^lIËÞ²çr?Èº=@þ®æ{ÙI3y·RR2´¨<aïFô¾ò¢è¹ñè·;ÇÝ^¦¤QAÉÊm_vô}ÂX,t8Wô¿ÖÆ+´ÉjÑ¦oøD6d=}(à?FêÀµöÈn2GsÖòµoÆ£PMê FìÿïPN&§ ý"M¯ñªmNÁ)ãL/ñ"ã£VVYô,ûkêßB#ÚÃ³7D6ÀÙ*1WÏ¾TDÅ6nDÛ?m&¬4éÆÉ5ì¯ùW3Óóz[¼a{p¿®v©jZPâ [ÖÈ·MdAvw=}pÚP4=JÂHÀ¼Àìu¥ÚkÿÚ³b4øï}÷§÷DÅÝ±^ôKr-MºTqÓta×  sÿ4:Íøô<) sÐââÔ£ßWÍpôMw¸à¡âÔx/ÅÐHxIn¦m]ìêzCC\`ìçÑÎ·¤_V5}máú=}ßöFO¬jü{WPS*2.ã«aÎYÔ½O|]ÎN° ®õEÝb MHFvLùýs°Ö#}=}Qó&ÆOÙé¢±ûP¯îYËGÃG¯ªÄhQSÓìór¡¤b²©^)ç][½H¦³­>L0·´¾*sä£@n¢\`^	§iÇØHÏAÞ7A.¸Æ7¯6'ßù» X0®ÍÜ¹H'AéÒÚ¸8Ê{±TfuÅQ¥ø&åí5bÒïX¨øçwa¡wãiäSø#?©m± cGdþÜéÓú²#íêÚ·;#VMaìaììãE£°M&÷p¢KÆé;h%à(=}ÜìÝCÄ°øAìËPX>¾ÿ²;LWìt? Ã\`¾>qÂ´³úXØ¯FD¨T;dlþî¤©SôV¢ï%ü¬)àü)å[øÕ¿¤ÓÎ"%sÏt§¡qé¡®ÿ_åU'8ÅOdå¨Pæ¸£=@Ú7=}ìÐoF¿ù|¼åyp~ÿkNVI7I:äå©¼NE¦ßÝ¦ré!°é;¢èL,+Sê3É¯dDvÀÈ¼)ÇlëAs=@ÎF«(#£ÏÓT/·5ò>d\\y¨è%e =M£Ó3Xj¿ëgÏ~ÀJÑÎÑþ¨úù1ò5Ìãgà®zITú@9¼ZÕED ê2=}p01<àÞûWý+\`qÂ5Ë@TæbêOY7=JjÚ¼S¤J4²´s$ý¤IêKÅ.@Âº6-màí\\1Ñ¼{ê!ºv\`sÓÒV°Mx®¿öv^ðYtÀÇ>ïÜâ\\Ç¿<ÑÆZA_öÔÁï²´¯ßö>ò½êe9¶5ºÇÅ<eoÜÍ^p"Ç%¸,ß2AH'q9&zðX/Ñ¢ÛÇ×°,¹=}ÈÆ9â@¤ÑùUòî»ßºhdòØÎÖXc~´£OErF[KXI<c:¦o9bÊêÛaoéúõ1-ÞÁ=JHör!îgå/åýäöBïeYÇ=@æÝðGo=M6ÌD'R}çþ9çg5¬M·AWËæ9'÷¡zõËy*úì W¤kS¬7ü hØöïw]¿æLºZ*¢ÿºcW6-öÎ*üQ!,æhÆôiUý5ET¯¿GY=Jû;£²=Mzì5 iEÄã©+9¾{Ìõi%=}çH3ñ"ÑìêÇ:|Û°TÉ4ù¨aaÜ=M«>Ãùg^!º5\\ú;ïIó|X:oðòpøbò²pJ¸³w°® P·NXÒ®¥ºkíPÒ¡¶l´Z¸ªâÓ¨ÒØûIoÞ²èhø!rëø¸+Ò.eLø¦ë+U°õ£>~@êYÅ²þÄÊ;Æ¾mWæ7ÀÎT?ë@SPìË÷39ac=J·=MóZ×èêÇ§6´¶µk¡6HXA­ÚBzé¾µK1æ§tÑÆñÿêCuK©8*Jþè¨¢xÊY®ì¬Põ#Ýf65ã=}ÉGh©³3 :§¨È¬YÛÖR2/ê­úÊÊéû´c²EáØßG]góø,õ§ÎßêB§KLýÁÅ1eßéÚû¸óepÁ2T»ÆwÔ*kh0½Ã{ØÛç¹CGMÉG.Í>¥ßÀîÊH«)S»g27ôpö/Õ £bßùÔ¥°Ge¨a·úâ@SøXªôXAýFHÍgblà=J\`ÑöÙ{GÏùëÐtJDWå=J.ë@r1& ÒÏÜÕ¯ãgç}äS#ááeîtàÀh¸geö64@¹\\ÇW0N#Ý^Z°ÎÎÈÍ%ß÷¥Ç}ßFçÉ³Àå´¬=JÑ:Öø=}º)V¡àþ7l|tW×f B [N5­é}­$ø1cIQ5ÂïîXmàaätBqòB\`/µn^ºR©aÇ¡¹ähRVyxÂ2R¢èø t§È#su×gBÄîîI'_È¾×HÅÛü[|¯æ:b<²_ïþht;¨v%&N Ñ¸¢þÌÒ|ÍaÉ=}foo^Þ­OàpüÁ3íaJî"+U©%jÓØïq´ÞÁõv#9TJ·»b~]Àæ®Ê´Í«±´¾ï3"Ñ"x&³5F%ÈÜPR=MU°A¼CÛ,;Ü(ËÎ Í¿Ù§n8£t$æqÐ£;=@´#ãNíxbÊGfSÍòé¸9\\¸$mRy#y´g¢¬á¬NS»A|&iÛ¹¯S\\Çö¤H$\`ÙD=MGÁ?|¨=@½tòy7³µ?ù&17z£Ö3|@vÃ²PµÁVeý]uRÅ$ØkýLhÜmR%%ÊìÀ£â~"Xâñ¬ãòòê=Jèó½ÂsóQyMµäç èvÓ<>(_+ÏÁoøIí$Np7d75æS/ì*Ñhà­vh°ütÜJ!mg®ÙAæMÎá®Ì.|ä#qèù.úÁö6£?üLAöTx|ôQþíìñÕ¥mºÚçdIC|àò§cëgÑSÁ7ß=}ìi(Wyo%ö¤hf!\`c	{BÐ#pnDÏWâ±mzrHÞIM'mJQb¡+bÐº¬FWW·¬tæ¼^{Úøè®÷Ò»=}Z¿É{&F°Ú-£%hU¼-/>_<(	ÕëN-¹¶³eq HÈÙ'}EÅÕ÷rÓ§Ý×à[^EÒ£Ù\`R\\»øOtmæn	Ü~Véã¶4~6Û{ÁX~ÉBécC*ÝÖX%XðUÛ¾¦ã³WfòÜ¹¶èwZYmm¾ii|þsÝßDXðsªä[O´PSÜND»8ë,ÓÊyÝ¤¼TWY1})¶·\\ÑR¯B£j8õ¼ÉÝÅ RWÅà-~Ôäã\\2÷Æ ûaôËc\`uü=M£7Dtß8ªñÚqG-r¯3~¯q5Íé\\_6«ËöÈ8rÚN¹VãpJu\\=}ïQa?8R­ök'S{8¶ ÓØn¤ïPÌCK{Oþ¾cZE>àU±ÎI£wK¤Í^0zH~ëhÛC¤hºRWCë=@\\Â»4¬i<¨NkæÃÞ¿KGá¶V4ÚÄq+µdaû<p	"¹>wÄ°ÒÏ$½ña×u:Zi[ â8u^u½Ö¥ÀìgÞhÜ(Jr9Z&9²\\G¨t+µ¶=}ç#NlrvÓ³Æïo@ü!$Êÿ8mÌzä31òú¡?áô»÷èüí.Îo¶:Étf^ê=Mp²»[Yô$¢3T,b6ÀyôÜÛìåÑâè7ìå87ó´â9%¬¨A=JÏðkhùóæx¸¼Í²Øá÷hÅú4Æ@i,_Ð1/ûD"ªRÉÓ Âït6ä§LF±ÍöÄ§ðkJìï,jm|5ýDÉDÐiTÑ@§åÜ¡é¬03ÑßÚîAr²KÆ@tó0Z¨Õ2ª8t\\ò24ø1¾¿éã§pV×Q"¢¹*9G =JÁºuEñ|ÍØc"DBÝ×æ¦B#ìg-Ì¨ÚÄò}2=J yóFñím­þÖ$âNíýJùh#O¾£*<{óÊHl=MÏÕûÑ-tï#àý@,Æ~¢¾±6Ctì[Ä"¨¨OY¾¨!fô!Eï¯#4Õ?WOª3!ÙûÍ%¦°ämÝ·?ÀD#û.U{»wÔ¯|V²së&E8º0°ÛÂà%oÐP{>Tã^Vó*ôc=}a	U¦à«OéÉ[7Ôö­pÑqtµCð²­Ö$z[È@·­$tâ6¬H"ÊÏìÅñëÉ1W9p!yÐ\\zh$¨:Jò¦¯Y2«lxìcðÏm¾ö:ÄÀMlAÈ£t×¾£KÞp£wËÚ©Ú}+/»°òW?¡ÌÀÚóó´Ò»võ7L¿Ð6Uú7¾ÛÕ#KäR! \\\`Å§99!´ñ¿»þG"uØÜ	âË«öSlC&èLq?o=J£xßÖ8sè7BsøGÞ¹4R0jZ´3fÊyEÓ:ûtºQ.À-¦ ìh_,bnú6Ãb' Y¬réÊîGhéI7O6½m®c4C<UL¸Z¹fUrüRçe\`QLJ³	ÜÞkïü=J1Î­:j§Ci*ü2(?¤Ü2ïË3÷X£ÿ³ëTù1LösH=MMcÎ"eçN">ÄL	X=JÕ>ßíSO=MUÅÀKúfÔpòéº¯Ú¥Ò½+ Ëø\\9êBÑL¯¦kÝn«C3ùàeº'½»¶_1®ØN·to1È¼ýÝ¦áöhëOÓÞ?í$=MÇòr088äbSÅ7Õj\`]¡^¸$r¬Áp>ÔhÐp?=JÊªMÌø	ÓºcRD]O#	ì-côóJK{m8í³Âõ7ÕËK­­×m>O@PNÒ¢ßv=J_SØ-¥¡¥@RVà®¢ÄâËÐJsçð,båE(´à©o°¯Iì-Ê´ÿL½+nNÌk^ëfÌeÓuyäÈ< ¡XëBp}W«6ô j:Ï4l!¼ßóèÃL+¦º:b¦p<a=Js¡L¸òQ}CË2Gï<Gü"¼õEh~=J!°Gíý.Ï®>Ú,Â×íí±mÎÑ°fapeó"ÓÌZÍR½jÌé1ìµ¾º>áeÚvtÔ¸ª±mY=M[Ô·Ã&	3#?^ï¹shÏ;»¯ð|¨4ñ%é	ßâ ¾y°L·­÷á§@ê0¹ÌõÙ¿·ÅBLâ\`ÐV=J;¨ªX+ ?Àïàkº¡7Ty<døL$GÅ¨­FF=JøH76ÅP¬wYã·¶õ95õ°âê*44¬§¬	$îÞ&ú@·Rõ[õõïÑ{áô/®è*}eêXÛ×­ s©ÎMTóúÙª§|Ùu ÈC_ÏÛµujäß°ãïI¥Å¹ÿÛIÚ1Ä-ú'¨ù×ÕÄÂ·×«ûùx½FWz+cë6=MIq4DUIôfðiF4¤ÊÄM£eâ3ëzfe2¸q!\\õ¥@CÇÏóGèÑì"ofbè< ùNÕÙCôRiam;J	Ï£-rÞSiå¾i¸r4#dë7ÞE«]ÍzGà¹N£ÐPPQÉnªCIÁû;&ÜFéò(ì·mt[ËÙ¿êÏÅï9Z¡ÚdØJ¬n>ôá\\ÿL=J±¿kntÕ«ùQ®Ýur©ùrÚ7%µT&%\\¶<«êj9(;ÖÛ»u=M´:=M>3âIø²F¿í ¨|ÔÐ9ñ Ôð=M¶ª¼b²Á|måno+©xàÉbæb	Ï»Æõ·§®&H\\#´ßy UªD¯<Îö±ê°KÍ_3d\\ÄcöU=}Ûè«2gjËRoûMWÔüÉä;òÎ?¢Ð¿na<+n4îÝ¼ëûqÂÍÞZÒ{âËf±Þæ^b2Ub\\ÒB7lC<¢ÓÅ o0'(ß¦ü×½¶MÃË{æP»òf[¦õ¢Î¨¢U1±@bÓ&À#úFl®_}ÎQmN	\\²dÆ	sZf²f*êü|ÉôA¿²hFc³àLxacIÞy>.CvFyl²Ív;½°'6L2ékVoÝßõQ\\°ó§nl&TOr¥LE÷Z4+;K½Åñà&"rÒ=JbÒÊPàîüU=}æLºuðbç9ÃãÎ¤pÅ¾l½èá°@Þ"ßÄ¦l%b½2þx5uÊ~bFBD&Ø¶\`hîmÂQ­ZIh·>»ì×0ëM_ulwOÀÈpî´Ó;CÞjúKðpmÑ=M40¼í[3=@4	d¿å(=}ÈK¢É¾Qßc2'bR7ôÆÚl,Ôn?ÚÂµÑS}Ùÿe	ë¼ä.¤K¬Zõ5¤â¯ù;»×U)²NlE71¿û"ùäÔ¿Éÿÿ65ºm¹DFc½Vïßh´RVùþË9ÜÚå®|AæiZ±¤_&'Þ\\¯4Ã³^öio8RDo?HþªÁyÑ_Ç±yyÊs8AQ§BÆoÛàÜ·JÎåû8·[£%×4>"Õ¸ =JÅH¥*þ?¾þé6É7½Ï/UþÖî\\Ô	gó÷ BY'C#~í{=M° Öð]¿\`¡ãpÓM\`²Gî§§VCåÆyR.úÁ=}É2ðoÍrÍ´î'n	þ=@Ú¯'õq¶pÅ±ì+PvwkM/¶hó ÊèªôceE¶=JI©b³mÁ¤VØõXù¿?î!Ðõ³WI¨ß\`Ö3íPlãç¿zåávSHôç­Êz­VÆUæ=}OÃàÞêêwµy«ÃèDBÙÉ/ÏÉõ¦ÇxówEÜ&¯§\`2AÞÙ¥Eñ®ùØ¥×áõùi$ÓQáG#ÆrTø¡¢µð¤®Í&ÔgúkeÌ'aéÊ¤¸}CÓíZ¦ê-.Ißà8ºäéÃÉÅhf1^ Ûc%¾ÃH2 [¶ë¸LÂõ{M¨Ó\\Zÿz^eCkVø=@±y÷Ò=}k´âzÌËO%;%øÁûfïÜíùÄ#OÐ?ëË²Ç÷¡ý¬{É$Ïa=}æwn5§ËÉ=J÷ÛÜåaµæeÏÚ¾)r4eÖ-ÔpºÕ²XÁS%5+=@<äâ9óýVC[u®ÒvXôt1øHÞ&í+=}¿ô1^ÏR±½¯QU$ràþXP°Ç¼ü:äQ¬<R\`­¼ÝUÿ¥D½ó¯½=}£@ÅúáE;#Vv{g³>f}ÖÆöÜ^%Åµ¨EÇ!w®³o¼ËwßÝ¦(U=J-mÇÆ»Y±ÃÕðE(ûÂób­Îr=ME#Ç8k¿tÆ¶U§þÇ\\BÛqòÄ¨sJµÁÆaÂUõÖ/á_Aó¿¥ùôGÙ&en»ÁÆo&=@:Ü	%1GìciYÇeÕcÀé=Mõ"FIY&G{ù¯Ú¨ #O2%ÅÚéñ	ø(Pþ£áCm@þ(¼[r(PóMÀÅçSG8,»ÌÑ'uX£wlnã*[¬w¦íqÉA?ç Ysø¹Ëu}§zÔr§t\`¤uâ&fÚè;ÓYÒÁÓÚÛÕBt ­é0=@£Ì¯yód#Â©ìh$WRê¨s2'Ów÷öµY¿)<Åß±äJöo>y ²ªÚ§«ãv=J-l((V2)òXEF7Óýz{4ºS'=J~âµÂ ¨Èü­Í3frV|&½Ìó¢1À;©¬éúçø'ÐmTb~FêãÚD6b¶ýbY6ümÕþ¬óvÛ¿ÞäM*«<Ï=J¢Ñî ÃÏªÙ0U»®yU!§}õS¬®iSÖCàC°wSÇ¯£½Iuê­>Èaþ²ÀèTÊ³¨^f«T¯X$Ì®yô£&ie<Í¢öÁ¯nJþ¨e*At:h=MJÂÌ×7Bø	8­¼Ù«åñð]ôÌ_èAx(ERÐX÷·=@¶ö«¦iÎÄå+p-Áöº2¬#cõgAÂ¨k¿Aî½x±×áÖKcËXÖç@/×Y¸<&_=Jo.¡p9×Ç)äÔùÈ4Æ<¨¼±ÒûÇíjÛÒù,Z¶ô¥®ìToºÛ§­µ¬R RH>º×úÌ±gZØ?&·mTëR\\Ï,75&Ô.µÙªTÔüMÖ³/·µ¡?ãjûT}µÛ	hõDÛ	ßA[áÀÎñ¨}þéî¨SÛ	pH%Ç<%÷Éé3?ÙUé?üÛ	È¯âb*ÍFÂ÷Û	¹' bæBí+\`ê@ú;ijút#A¬µÉ'»¦>>Ö±C¿¡_Õ$rU«nhæ6sg~s};i°í8¬6+,,ßsÂß­è³ ×â#A=@lïåÏà­û4£ðö÷ù?VÇzÕ"Ï¾Ûq@_§¼-m3:2Õ!*ÅQP-Ú+=@¥> ³-1)áÒÐp=}ú¾4Ý!CRñhÍ_dÆ;Q>W²VDa.=@<Q<L#2ÆÊÒ=Mn{b»ª=}&7+NmÆúBEx>±ÚñþI=@µ¹ô1êÁSáÄ)© eV´ÎEÈK7m0/nN²+M{ZÆ:]Ê<0þ_Ù»__Þäî÷c×ØcÆM	~aòùçù§é(ö¡ïÔxÇÂlçÏà²|qåãÈg¸äÌ÷eâê;~Õ(ÙãbòÿOí$ë w^Uv¸2àE±¬SN)s­8EoQ_z^´øí.w*³*~1V]_A8"<=}x	XFª^Xpõ+¤¹:íP7MH'LÏ?vJì²¼ñ;Èú¾=Mq;Xyºos÷²pûH5ÃÄ¹H7sáÂ¶):U¼	ªXämxç9­@1òjÎ ò´8VM+ìÉ³Á·ÎöO»Á*ô¶3RòLKTôèy[ºð§ÜÀ>Ô­2JT­3Ú gZzõ«R²ªL/;ÑoæW\`3!68Ä[äè@FÅ>hÛê¬zþ?~LÉJ©"×M=Mû»ÛólÅAÛ()eëtpzªÍµì~BÞúFã«n,U;½<K^CM?Ån&QðP\`>MîL5Fà²±M®I­­-61K­=@|Û¼8·l@}fT´4¦anº@TêíëJTì2±¯ÁF]§ê{mA.æeª»DV.´Kblâª:Q {½0ÿZlbFà·@ÌD¤GOÄÏ.]´å«4Fé÷ý; µ:w¼ÇÝbú5C2>¾Æsi® äâ)næ?Ì±ÊSð¤l;8öiÄ©K®Æã:×¢Ãï®+izÝ=JðÍùJ$¥@gYLéklIÊK³?|²<sV\`ð×ÎJdµy:Èì6é±RêÄ»ÔªÜ×÷Óo-ÝIW,è(¢+Å4¯Ù{Ò<ALµ;¡T(\\µ}-ü@àûIuÕü2IïD¾5_D³°=}pÖÞlýã^¶óÄ0L/$ê®QûÌJyÜ-÷5j÷È%©ð	k¸>ô.§%6îÿZN­{Ånn4üd¾LF2lÈXÎÒúð·5ô®4· ÿÙâH¥ÊîÐ»å ]¨<8ªï,lFt´ðºÑ³]^_fÚÆ×jó¶t½í=MÏ(ÁqÍÔÇà1wLyÌ­Q»Ö3,¢gil4»äIÃ*.2<uFz®lf*öW9W4$W41ÃÆ2fÏ	ÎÏu\`ãk£¹¤¸E1¤¹¯ÍëéãfÛ=}Ñ°LA¯0(û m²ãpÛfòûçÜcnör{r.UóV[]ÀJÌÊÎëBF­@Ø¬ªÅì	¾J{§Ì50¦^±êBöç².DN7?ä&J»kX¾Ê_²Fíi¡gª6\\V¤jjÍ:À¼Æ,ã=}[/Áþ*=MgâË:@)KnáØ0qÕ·Ð<,/g­*óÉ¼¼,@þK/Å'õN^b®½©;K2áo©!ð2¾B[úÀ01Hª¯Ý>õju|J´rÌL=Jz<¹+ÏMF;®Ë°/¨m38VLâÏâ@dº4·¹;ÂÀ\\2o{ÊS0ÄI»¡6ÒM=@¨#¹ f=}{¤¶køÎg4í¸)Ó¯ËínXÜÙ[Í¨Oø3úC­bÝoÑîYÉCúJ¯->roËF]Gù</=}Ã§ÊÎçüð×²R½È½Hö¹*Èë#À¸,æÑ³l­çÑ©[§pzq|ßñi®"2®5IARBÍ!'újÉ¤ =MO§ä esB3µÉgwÅL%ÁCà)IÔwJ§$×éyiÝ	ÉÈÁú]öi/ü¶½­vÎ·e¼d(TÌ®®H]ê=}Y$-OÂM:P®ñéníï=@«¾º²ìÐõ"0®ÃA»¥Zª¦kf|1iºÏ;è:^iÿ´À'k4/paòsIna=JEØÀHøðW4ºqËFnÊTc½ð<ûlâ²ëóë³fHÞ.îµQKc×xí>lDéj].Ïª~âWL/L>­(«,Aß¨N»LVªpl]d@#¶°nxÀû6ÊçÑïXQÉn8¬w¨ÊkáËoµyFe:4´LÄ%1CÓ{) roj0nÇÌ:ß4(O4±?1Ô²õ1M·H¹ÿv|È³[í²@3LúbLðÐCwM ú¹Ðc2]-ËOaê7Òsÿ±~Í^µQÞlËB$õl«0á¦ì3E2W"¨´MoB¿®Íºw¶Hû-Þæ¼5W|Ö½=M¯ ¶¢Ç \\p\`w$E¾Iï;ã²=}D>T®§JR0cX0å]£þ³ðà5÷§;¶~6KvZ|º¾=}Ã­ãvM²ü½jMÚÎ×{Á1º9©zzàfj½0^O:|mªaKJ¢7Û0ãT¦Ð*á"Ïï-àâµ"Þä±D;²svQd²A¾Yaü³âæ®1e[À¾O:1AúÃIä{«8Söe2û/¬ÑpÊ^]øêQÂ=}}'1N{åjåEkü)1ÒÄx¼zQxòxÊm½3n.ÖlKzF<6Õ{³3ÕâÂ³C:{zÁ"GkÆí	ªnæÑûô7ýztïeÜñõà-3BPõ½a\`?êsÑä2òq{®g´âEÆ!Y¯º3lü"aÝæ)ß>zSzf¿:u6ºBvò­²:Ý0»1oJÑ*Ø^-}4óÏH'gI(OÜ³b(îé@=@5=JÀªpÛCëXòèwû$(íoÖkª]q±¡Âû=@9 n C=@ÎÇî¿ö=J²Æ9¹ÒÒ;ÿrÄaS¢5ûÎ§ªyÜ³vÍã[ÿf2}nÆ¨ÂsEé.DüqxjþÚ2²wRtþ²Ý5a²xó6ÛÙJáÆÒ°°E3Êh:8@Ñ¨ú¥BXÄÁ8ç8Ýø?¼öã¬c¯E*Ã@f«¸nDéUOÌmî]:}ó@kÆD«¶ßÑÔÝÕÜwAkÔ/­Ômé²µkF¢µ-Ëøà}ðDw9Û»îâyóÆê,^Ù\`¼äíM÷ã8ÆÆÐ1åùJ$¶^ó<á¨bÅXæîÏ½Q$ì7dºb¹"Pù>¾ì¡âÒtÊ1³-ýï89AwâuMPßJEÞÅöïkéÓe,/ës4	XÇE¤ò÷(azböz®äZ²}5z<(ìîf4s¤P³ÿHüY'Â,Ö\\ið¾H]z±©E}´²Ã¥ö¾¼=Möm6Hç»õjZp68=JÊ9¸»M¥¤bÜM¤ß=@e~l¨÷Ç{ãUä'a°®­õÜJ´oT±ó;:~Zý²½·bx<¬SsÀÊp-¥!s¿îýïâ]¼Ø7ÄÀnÜñS¢ÊãcSçõ^ëµü¡6fánçyÖÀZáª¦Àí9õÔq¬9£=J+¶W3õªü^.NM£â2:GÙ²qÓ/ºWÑ=JªjF(W±j\`ÅÕ½=@Ç'=MâQ8á>±è)wI¢Üß´;îi[¨®t"ÿJÚPÌD%q7êé´Û®lÁ»\\/ºr¡ïvðnàÀÙ\\ÇÿëÑ¬A·tÀvÂä°/;¹6Î,[Y8	· 0ÝÿP¯Æ²hÂòu ´tæ*È=M1ÙóðÎ]1®k'X$QÊÜ,ÊT8ã ¦idØ²ä³áZ7­ëÜp@v!Ô=JN*JYA²±ðÖíãïOOTFbµ0.:Wª*ÌîeÈInBmh­æ²t4-í°ÒÎ\`ú"IPKî6;h];h®°C«Tî´fBuL	=JÅE£zckó(qzÌç\\¬5ú¬Ü£{®{,wÎÝIVfÅ4ø{1På¤¢CâîsÇîÛ9E=}2­2´Ð½=@ßk.Q=@z­J!ê®ZQÐNeÐúô¿ûR?BAOQ««å\\B]F,D³>6uÕ©2ãöKîpMÉh¨L÷äj>ö{4²ë*Ë~@O¹Ìi½¬Çï6dNo{©.*çSo½?&u¿îÚÎTë#mé©~sö4.³P	³~¹T{¢ gÄÄ»{=@){U?#©Õ=@Æö)ÍDÖ_nøI©{ÌíG@x6^ÂÆÄDg,é+ÜÊµß	hd´ûì¼5Ì(uÔD¿F?b\`1ÜkM ý6öÀ;+ÍÓ]Ù[êÖÆL¬!<KÂÝn5è²0\\Wx**_ËßÓÝ®yëOÄ=J¤3f10e=JÁ ò4Ôèè³sdrHwq?o®,Ç(G®Låt|>÷|kï»òr5Xt[(3í¼ÏEZn¹Y8.â:l´1l'NÐÃB½Ü<§»ãÕ{.ÛZyQ)Æh:%.:}R-«È­ê°à6­/8NÊ Û»ÞBóBÞ;a,Í=M1½îwHðA,lsÊ©³Þ_ðfì{kbK®ò7Ö;b3iþ¢¨.{Ï®èü.ú9¸ÒGêê+5Ó§G=}+3Ü­=@O¸Z/ç9^jÑb_PC+yÑÉ©rÇBøBî=}sG¨¼YñIÁÊ4[=J<þã9ÑÉì²ª^ú6D5-ÕénîÅcW6ÓjÆE*?j¤ÚÎ~ÍkóYË:­êT[1¹Ë}.[Åo¶@;U½âc+×Ùðäázk|5QaÁ·Ü5ã=@øÎ³T"¶N%N0ÏÑÄvæl÷£ÜHw*»×v¶ªbÄ1îKf+%á@­:ioÚlQ'5,g§nP«²òjéo8îÖ+wshÏk£4J ÿe«aàækéïÀw¸VÐ+Êoiob]Êc2O5d¯\`Ëíç:ÄÍÊÝøcwíy{[îÿúZÉy¢±]ú»mB«KvÍnßÅ;{ùuéßjNó>GËD/{ºRlUÆ3ÕYÄ;Ì²kÄþñT¶¨¿G~pÅdL_éàêrü¼CCã¹ýæÝmaÇèîSå,KëO}qvd6¥¼KâóàÆZ³zÐ=}wTlÇ¼@	Ì°2GÏ£ïï~mºÕJ=@RÎ{6*¥ÚÙÊCqÐÐD2ûÔ=Jn«,­.8YFKH:ÑËðÒðC\\/rAÑtq;>vÙB¯¬j«*8ÈoAd,ºÅ²ÍN4Kqi¦T:6EJ^·V×Ê$bfrÌ5É²ßsXÙk=Mûc>\\ö]ÃBºQ;oZÅRjòCo´¥#árøä,\\¶=}úi»WQÈ¹¦2nc:Í-©+¯)¾ùxõ±Mh(,»(SIÌ&{¸N$-¹ä)¾÷{õ\`¶(¢'\`î=}ÎFÂK¼a&\`AWE^Nê7#Nj8vMÂ{)Æ·ºMqI$=}ùæÞg9ö£(SWA$}ÉÝKlMj©ì(chWE>OëV%#ßW9¶A(S+W=}$=}ù=Jl­^ÊiÚÇ$ÑëJ»Í8'ÓkÀiLÅà\`¢­Åà) ÝjàEÔMÀOÆDòof,Ý½ÈÞ%Ïýþú¸ð)²D6)M²K&ù²K°i=M¯Bì)¶@2)]²K&ù{=Mém5ÖW)7n&¡{#émµ);W.ÚjãjÊï);fx=@Í/1ã'*Ãàâ{OgR\`Zë;ÇqîpÉÌLø«¨rz.AªJ20³mïÆÙi\\C:I\\CÆ([­­ÀëI]bCæ([­½ÀëI]âC)04vJYC¬zÎA6I-2ËcªÜ»<ß=}CÔ'0´zqª"¹CÞ6¿)[-£K=J%ñ6¸0Wzéõ=JÎR¹CÞ6o)[­hK),ýÚ°éo^&!Z7ÇH¯"/=MZo¶V<ðì0|l5J±vJ¶nª=JÎÀÌj½( À(8vöÅ¶ÜM»àJÝ.û7v"é¯5;K»,¼/tË°êtÊîYI&³=JëL^HR]wM¯ª½LS<oUQîr2q@dÅsínêÒ0§µ2=MúàÝÆü~À®©<Ë]-êË:×ÑßQâÎý4ìÝ½À°ÇøßGf!-ÁÞ<©A[¦çRØDwÎ¤=Jd*­=J¼g©5}S_Q^ø¦;ß¶râ$¦K|æ¨Ò«îPùjÒkzÛ$¯DF^|~Å]ö?7æ«;«"¯a:I]@WÌ26<TÐôzAH¿ÊÏF^>»éëÓP$­º²ï­J<L¹ÏVg»W¡OW±¢«.æl1ÿ<û9K=Jn¸j3´\`|Ös²]ôÃ	%D,ê·:Oñµo;|)ºyÖ|¾(#b;EÓÂçD¬@GF@¥×ÝgÉA®ËÂz©ô?*ªÊ:ï¸,6µE¤=J¢4øÑ·9¥²@é8¶°¥jöÊ£&=MIi)ü©¼)0â=JjVu.&$3aºÓBw"jËV1.Ãj[n/¸+8´M:isïY.Õ0të­*wÝ0ðëþ91Id&|´Wö½~ÙÜ­=M¼ðED{f=}¤ÀGºD<O¾V®\\¸Gëf« iâöJ2ò°É­¢ðN«[sùÝËÃ I{bSMî×,nëÜ>_­ýpjYr=J1ËÍKÌlµØç:ÝÉÍ8t>+(~pZQlrù/ýÂJ¢ÃÈ}ÚÿÙrCÖªa@=}Ì»I´sÍ¯(±4må9'§Jzr+Z=JÂDÚ§\`ìõ9Ò*d³l:yHâ9l~xØEÛ&VÚV?x-mÚÞ§«ÄµkT&T -L¹ØªcGr×Ë¸Æ_¹&²¢:ÎÅ»®õ3c9È«_I¶Â,<v*.¸¿@X|ï_ñé;jxE2(¼UãÊ>·7G=}ËÞö-ÆJ&Usú°:Ôô,±.nH9&;á*îºb»e;6*¦=JÌXõ+q;sn¿·k¥ô$Ý­ê°N×D­Ç¡7û=Jç½?iãþn1·ÎÞ+xe_>²k5|\`ö4àe,>)iþ¬ë¸È)=JÞ¹KçMà3sgbDÚÚðÍL·íîâ4½KëÑQúRbâqß¬Õ18e£=}üKJª6¯Þ{K±Fl:ª\`©ün-»pr6ZÞ=@úøsègÕkaz(4¸*Kø¹ºmÌØ¹YjÄòº¬.½Sõ;8%ÌÕ¸*;Üb_ÎÉÚ§Adm\\J3Jæò"CËÒOl³ìß8ó­Êè¾¦SºN×Ïµ4	óe2èù0ì!n©kó£onºVëi@<<±Òµmµ®¨Êg<LH¥i=@Bì[À½ñX¹_Ù¢#=MÛ áI¹khi úHÅÖ!áQÙ«=Jçwú$«¢5,,Næ'=MW7¼Úà|æOW>ÚSúBcé2øÅÍþ$mÀúÀi.ù½Üßçfa,rMê\\/6J²W3+jà=Jtrn·.Ê+¥CåÄÆ­l,Ñ7~XÀS'§üxj11YôFÍ­;ö*{&ëì<EÊ0_Ú¸íX½yÉ%JÂåóXF£Fã-«>@ñ£j1èòôF#òãNB5ª4¦/z=Jõ5Z«Y9B\\õ·FÈ»Î²Elöi4ÊN,+Á16´Â.\\Ä0ýÄæ=}47Í9I©£Ýq,A=@ò+0f»¼ÖÝ\\o¹5?ÛðoH	+Ñ8XlÊ#-²LqR7Æ)0UÞÖ2Bû7Gpt{Ûªø£Ð=}²í\`Ä^æ<rl7¢@êÍWiiôg?.Ìë¢Ð!aÄò?ÒYµM#ÿâ:þûôÃÝn:a¿¶øëøÃ\\ÊÇ{jã[æÑ/K?2óÔPêx×p,WylEò´êî>e0³H-G®6¶\`CÎZ=}(¼_­:BÚ)·°:'¯õ{´BÁýJ",+×ØôwóôtîµKõË®SS3Æ³)42¬2ÀÕ0 ²h/SÞ8<ÞmJú1«­¹úô®¹Úýy5ä,,Gò^ìÚíô§í,	ArÎÔ²¤QxKéÜ®²1,Gú/Ó1±_ÙxÃ÷±Yz§«Ð¸TA¶j=J!ÏevýF£z¥ê.Ñ3.ªlÕeiWø¤ÊSBBí&ä AÌ¹'({LFQ<(W*=@ãÞÑT.\`Â¸zãµÊ]o8Òr;Ú¸zÚW2MÂÆê;ÍgËû@¹h«d?¾ O.¤:+=JÜ²iÜà¾Gév%X}7\\UÀWQisd­÷3#ZQhKa¦î$R¬|³»¾ ÝL=@ñgÎì(Ë?i ]·=@ùgbªÚõ¿Eo¢É^(Þ ff¸-}©§ÿ%	E"iDoO­..ìÃæp/.ÉÊðrax¶¸hb}ë]¼Êb-¯èbk.@öcê ¬C\\C3»ªXe²_4¬5FG,mV{UÄhñ,lýüj=JhR±Å$³cËÒñ¢?ÄRµ>FÐcpú°8²Á;ñkµÛ·ù£=}hùîÅúýù£ÁVU0õ£BY2í5«lHZKXÊ·:lå{²ºq:<A}¾/ÃµZ(úÍõ °Öû³bjÄoæ }mjØP¬_b;Ê*Æ®ñ!xTÈX45ào~Òj±¤®7ü>äàñßzK±ÞÓ´4YÉÎGyK|óÙb½+×x°Ò¯G¥aAánV2[­fÎÜiäÊæ¯4©Ùe2¯Ãºé½KD4;¯2N»îÁ-|ÒTö1+É5±2ä3ºÜ:[ÑÉ?Òú@ý-Ð1º5<òYSâ×4ÁJ}N6÷eLm¬my9àÌý=JÊm¨ncjÐ¾Ì/ó÷S/(3îÏ4î|ò¸-Ïb.ÅÁlToU^Ñ>×úÏbÏªÀå>×àÆ|Þltû4?ÏªzÊ{OW|¶Üâ?D²Dp]ðÂÖ33¥=MB;Ò=@Yèª\`äuL×^ËäGwBÐ&=Jüæt½,$ÁÐòmn±M¯mg.3o²v01p®D¬2Bµì¦,Ñ1¥|Yóäë?XÐ1å}YË¾²u¹ëHþuûÏW¬[ÒYWjWôÛË:ÞÏâmÓû7Á¤SHRÀX|óÏ@XÁÊ¿:Çå>×ãuû4÷SoU^¡SxE¶|Æ¬(;¿´aþ4¿¼q¾MXÒ>4@K5õê\\ò|®m6bª­¯Ë=M©{Êa¶Mýq{ÙéEoçxY×x¦kF59¦3Ë4×4;_A}Ïï"÷¯ù	Õ:_(ÒlþÂ/Ö£Ò44bmêj©¾wO´ðãµR¡¤OHL8È¯Å@9äñÂ[âªCÏâ0Ø8ßm ß½ nì;-Õ£-±o¹@Ç×tXBz9_ä'ÉÄ'îÆ/ÑÒ?k Å2uå5S¬ºý§ùÌÚléeeþ\\?WÌí4ueëLÚ¡XÅr{ìåJ61)E§¤>Q!±ýD@rûDT=@\`¬¨LàúÚï|x Õû=}xån¾a:ÅÌÞó\\ÛdÛu¼°Z­MI_úºªÑ=@@NñV¬]Ï1;»R¸¬úôúöòø}®KÊ=J3ìÖÉ=Jf3/~éw}F5nêLìë.ËwÅ&±ðê©oë£OM;=@Ú¿Fb xv¹Æ0èQ22Ü~õGbbº0lR£=}mMu.0Ñ\`ÈøîëKý_üë÷¼sQ²Ó:Ç¯PBëûÀ^©ü²:üô¬§²ÚÝýö60&P^@^gnéô9\\¾©Aôb>kqI+²E=}yÖ~ËipÕä9»+BB+4\\_êóÇ¾ =JÛì×ºzÙ@þÔZáZ¹ìÚOk÷wì}Ò5=J;H¯@yÉÐÅÓ;»µ2ô·YkqÊX=M®µ0ËU4'²S.¿÷Iñ16Km~7½GÚÅ°4"?D^õ¬¸ÒyvE;öö2¿5Z.k«2Å¬ 56®°Ñ=J;¼y/Ylt½¨ÄëH-¼aqsB=}¶ã;û5W]^ÿV:ýOe>'r;³éÎ=}éh¯ ½¨CÈº_·FüQ	"üóÖr5¼j&YDL(ÅpN«r:²c¥JWúÀbðªOÀ]AI$ì%Ã:p°Ä¾À@,õÚü°î_ú>Þ²LüoÎÇcÐÕ%$iÕ=}×zÁvªÞÏ\\pn"§¯¡ïDÒSÃúòEAq2­\\*lPª=J¤{òK£$<X5ö®õYËâÒË5^L¯=}×DÎMòsÞOyd®J¼&ÚtJ£2Ùñ¨àQT²,îqü0ÍpâYðx.;0¬.®ÎJ KÇ$dÔïMwR¯2De¯ÒqÎ-Fr^ow2ðnX[O÷bÔ(½4=}IQÖîøöøvøÑ°¼I=}gðÍBAEóJEkÙÚ¼^0Òz+÷@-këkÊ¢ÝèZlò"ß=}RRÈ°y¬§ïøTÈL² þk¥>;Lb	ªTiJ°J=@¡F<yÒÀ<>ðJZéâÓn©ÛÉMB3Ê±Å#=J¦ò8¹1ò¸uÙ¤±¬§A×êº{ûâ±«Ð6h¥LÞáU=MÓÖó¹ "0W¥L»iÑ²_lË²òøß<³ý%	q½t5ÖJÉhÂ *a«ßÿ~Æò9WíA$_GÈõKbi§#.%y9Xª\`âKIF·µ»A#æ¬5v98ÌxëgÒ'+ý­­oïE]ºY©Ê)6[\`R½ ÷jK«+]nÚ MI·*Ã¸ÓB¡M&z1µc_lÀVÀ#{ÿºr]Êê×ìÞè+RrU°d>f{¼,dHëíî7´.d~.Ý<²j¡<;Ôøw«5n2=JêpuB;%ú­Né¿øn%¼óa7;<\`_5(.&kLÒ+'6Ä¸=}?±â+Ø®Vð¯ñù=J÷UÊÊ¬5¿L2X®¶£Ëørá5­\`Î¥2åwÁËò¤RþÃÐfZdë*ìI´C466rÑò½âø9Ó¯ümf>AÂ×*<1K¤þn~ú§º0È9{bãè?{NÚB¿×/öm@Ø±¢ÔoAÅRF¯´:ïµÒ¶Y°ºX¢É·8 þzsÃ$Å¢cã=JûR=J{ÉaL]¼5}è[·îÌ?º2ÿôPÊY9\`KüÚl1í»=@oÛ-x~bï;=}«üw]/%[]ZllvÏªSbnöÖ7yê Z/x9XÒc·úµ3ÎËûdÚBjÆxª´µ¦ý­PDéÊ@Í@µÁïÂü,ë*áïÛkª°D?1A«¢lõ4£:p.J°ÖòÍÇJ\`µmnQÙýJÌjÖ/øg/êÁ}=Jv}JN¬¬=@ð#VÅ¨,ýD[=JìÿRw,£FïÂ<omv=J3Ó*+Zft5ÞúP´òòp¢5NÎJDgÙùEÜÌÓb®º|úpS¬ÕæéL{>8yDXj8³£qÝ28ÊÖÂjP=JÀjãjîÄ·N +E.¸O8oß¶d¤ß»ý@Ñè.ÁrA§p~»á>À@CóTg3ýJÓvä0ß]¥cV¹ªnÉr´²+iºÞJº>@µÑí5SA¬©îÚâcW±µìg_=}gnÛl;/dèzæ³d4+p¦-­ü+}KÚî5~É3ëÅX/^xqy¾XlYÁ8VimßªO1^Îº*[1âVWÔíÒI´æ«Ìã/z:*²}Þ=}v5n²¬V>=JdiÕr=}We.êÜ=MIBÎÿPþHÜ:GwopQ"Ì§e¡Ö*|öûºPgmk.bæúÛ]bÀmþR,Ñú¬<=}û¿)tSëö³ñÏ!ïÀ9M;d8¨­ë·ü·IÞxdõyºýcKÂó/zØà%D¼ Öþ½,G©3\`³Ç|tqaþ×9,|i_30<°*ðÓ¤ikøÍQêkûO:6yåúFáanÁ<?/:·)úl=}ÍJd ðZNÑúºónNÐ¬tÞÀíû«F²2¿Èâë~¸dÜÓZ</5Y7oö¤d·ýBÃo¦2¸_á¶ò~eÔ o-pWóOÞMÆ×ÌLßúP¬âKlÃ\`õH3~XÒC;1)]¼p¹=@Y¸ä]-TuUrÎtQ<2kÑxêú8w×÷ÃNÎþ±[Ð:[½µKú&ñëþÞ=MÜyl>LlÆµ3}GÎ­éBæxÈó÷^~ÞòÁhrA$LI¯½úÃ~=J²7´R«Ê0³*+ÖªR×H²¥ó[«b2¡ä.ÂWÑÞXt¥;ù;ò÷±ý¢¦÷£9{,Ü	Míà)È¨Óogß0ût¸UtL@º½Áxn6À6Óþo"=@X!9oÌzÜûJÇ-G×õ	´ò6·NÖ/Q0^§kxìôu6µ l%!ÍWHú5ÎÎ/CóC¦Kd¬=@	EWL¤=@ML^:GïºRàY"Yc,å?ÝÊ÷Q3¸h)x(åM×#Þv\`>¸nDyÆ/Í2RJ\`´ò18:²å¬K2#2þä®óK@|k¤«ª=}1¼é0bÂ¼hÁ8M5v3+G¯ýxË*ÍÂ=}"oºÌW=MÞKÜ5[/ý;÷Lj®=@Búsú©jl¡B¼w®¶®mÍ\`»¯Ê°dä=@5c4èæwË[+3ÄOñ!­Ð«qÖÎ«krøm´lÀ}çuþ| º-ÝRÄ §È=}tqG ¼Xl¸Q7K¿à;©¥K -ö42ÍjÅöä@QY!ìKdºw:64±Ùn¾Ëþa³­Ê@¬M^rí³b6Dùo®Oe+Y ÊÜó)û[ZÓ-$Æ÷KÁüit>*Ê× ?®AÛQÍ¸IO3þãuÍÈÆ§nÓÄ´'	3õV'Ñ¸S%êWA¯oKÌPãè+5êV:öû#ÄÀH^êÍ×¼¿¯P8OÁ~\`²¿o=@b\`äBOJf±»­Rò×¼âLgY;¡vÚÊi	:=Ms2ÙÙéÙJn=@ãÜÁ)ÝÁAð"Ã¯*$Éüì§pHx~RI=JzfeY ["vþ6.Íc8õèÜz*m=J~*m08¬,Æ²ÞO.AzøáÎÀ+£PâÞÊ4z^{2@W*Y#QPi+ë1t8ÀWL2¨¼H4÷ÛÀÓ»¢r9Nl<µÃÿ'bçÐ Þ½ªÐ³Ì´®tÝÐ0m7þ"låF+uR+.ÌK%Tä»sU¶=Jwå3µý&Àï?h«@¦¿ñW­ëßkä/ó3(jXlAÄlhÂVÙ}ªe5~Iï"ÍþtªðøÌ	¯w\`OC;(Áj=}b­ÕÁ½Xþ«Vlá<¡GÜõÌåzË<¡GÝnOâOêÍ,£ÇÜuj¦Ae5LÙ´åXO²8*gew«¦#:üA¦+³Ñé'ê/ÒM÷\\-H¼:=}r8sò=J"ðí\\läáî+@¬Lõèü.EäHe3³©e r¥üú~VÈ05XÏ£\\ÌÝA#<ÐÐ¸ÐMË>«Ð-oVQhÖCv¼Jwç0ÍÓM=}=}ÌUÅ¢ëgú@gz¶²RÝl¦K¸iw©¬Ì:4åuW|Ú»sic}ïX,1rFäAp¶+Sz{Äá¹À=J»ªS!¼qj@Ø >te÷xgv¼cÃ1fð¥à=}rõ9Þ Y(:6B¦F;ÁO69Ë_lôylê:êß{^÷Q´\\»\`hPÓ©hmsÁS×uðË~¨ÓwP²ô=}w¡×GWFKâ¹Ä¬uÞ/¹¿ÇíAÃmõxômá=@KQ=J½¼ÜÏ~ld»±¦4_ñ>WÕ=@fÉbá3§¯Gë'JZßáÜ§¿ÏF®:·8ªÎRWä-xÔ\`OÇtó}ÉûxcniÄ¹}¢Ø·¬wWc=JÂR1µ³¶¨Ús³¸²BÇæ;7=J%T°¸¨ôÀïÌ¯ìÉÊ=}WqÓ=JjüwÂaÂJM-n{uï=}<||ïu~:Ó¢Ë5N\`LÐ¤}/r.*4îX|?'=M»Þòo÷ÞßÆ@àï_ó©¿Á]xòñÚIà³³JÏÕÐÈ áó@<±(Éø­k@.ä×6àûYòÀ'DÖ´@úöýK;×=@´Ø²ë5oí³ÆDb®;Ìâ³w=@ÜÑ?ØPèÌmZfLåÔd/Ì³N5LÏ@ÙûßÙÌ¥$Äu³ìiî¹Ñ®©^î	<FÎQR¸^=MË~,@¾¶Èþá¾zP©Ä)|0¦W¼§ö£Æc¢&ûþ±½þ±+P¼1X¯RôFÇ»ó5,èûÆ·<¨Ë9ÏC1kJQîJÀ¯!6"ºËëtë¢8rÊ=J/KÞ"gØnp$Îq=@#:4IÄÕ9t\\TÔX+ ¸2þú=J<=@C´»*¶L»ÜÒÈÂ­Êkêõ:Laiu"þ:°ÄÀg³tÆ5;ÌW-ò}õ÷ºVÊwR$ZKÃÂÃµË¿ï²86´@	Á -_ÁþÓý{Ä%Ôå{¶Bç°=MèÅÑ£¹s A~Oû£[ò/ª<H}jm33Qñ¹Ú.ðrs\\tLíÓ+¬$ðhmûÕX ký|PBa9öPôbÀ¼Ù:«ÑÎ~j~[:àÎ2û6­´0;Î7?k9¾ë?¼»Jh®÷ÀÃ^&®+=@sQZql!¶­Þ205M5Ñ»éogiì÷2Ã%zÕTLHÊÊ°]²£´×Â®¾Põ=}Ì"¨´´þ8¨E+_8ÑÄÙt:¾_iBz:lº²îeòïrÞß¼N¢,J·¼Í0sôÄÚ2LüÂõ4v6ôQÜÓQ¡UÂ¥a6Ì^ï<Æ¸¿ê°AÕ2DLm-ÁKh0ã¦ñ?E¤s´¡6Ü^nh>jëÞËlV@¸ìÍjyV»{ÊW<ôGSîvMÑjÀþ¾ëÎPÖúõý=M©²\`<9|Å7Úþ8ËlÆ5ZHïcâLþ×¬Çúw²=Jêd#P/>ít/Á/4!ÉÎ!mÇ÷½ÖUV¾:Ñ6D1 \\,±wÔÿjæ6Ä){û03û;u¶bÇF^¾#jÏ~ &¦KKËªXø úªÏaov^WAb'üWú-V³=}³ÿLUÑu´u4%LD§öVæPúfú¿ì/¤|ò|eõ¥õMbCNº8Ë.ÖBsnÑL.Ì£k[ÍÓYD+64sCºw\`·Vcåóðb^BQ;ð«2>äþRkÆ=Jânê;%Ò&þ@#¼ÖMm-LM¼YO;kù²:=}xØÈÚ~³º\\úö¯ámëq"ËÙo8µ^WAt9Rj3OkzâF#¾Ù=}¸¼rÂmARÙkùÕÿ<51÷éûpì7DlDÎú*âQFº8:K+ÈÒ³Ìð´Y\\åNìhk$ªEûÍ|i¶v¯/ÙÚrî}ªºÐ¹É×:p6fÛÛCêé÷¸e|Glb·tÎ:NÀýÚ®hºÚî­ýþq&nìqÿG«à7ÚrPâðÜß6±E|¼<£ÛÝ¼û.Ë_ÍÇïQÛ{LYß½(ã,µvÞj7ZJDÄ^R62¤14ø\\8µ§J×X?»ñÚÃqHÁû=J^11¥Erö7ø¸à PA\\CG­'ø¾ãí8ÿtãK¼1X¯7¼»bþÜÈîicuø\\¦a¦a¨íg&î¯e³ZI¾7ñu¼j©ñÀ+y½ÜÏû)VC/¨a¦]Bé§_¨ßÛ#%#µQe±9iTøì9»ÅÑP=J?-òøJn=Mjç{ÕÒ°V=M!EgúÄÄjé©áÛ#%ÕeY8Éé¦\\kY-OÂNâàÁVÅF÷ý´æ~_óÈÿ %(Õ~Î¢pÕõ |¥Ó=@ót'äù|íÝ¤sUÝHÿ»¨VÎWD¥Rr_SD½?L¾Ï6l=@ìG9Êf[ûiáîôMñ=J¦"§;Fãø×õDP¾("¨Å·×wHÚ.èêE¶ÅÁ¾yÜ¿ò$Ä»s Ém=@#ÖÐ°ü G9cÁ¡áßIp=@ýÖ0óT®\\=@YÅÝôtK*íoÍ­x&[ç9âux¼-p§=@=MÖa²s9¿p´®áËFròº§Ç:Q÷d%ï£ÄÞ'ú(Ý7¹	dçüõGa·aðçÚèJâµß©ódÆ"ÜrÿcÓðØÙa¾Èfà}ØÖ°OIgÅß£Å4&Hh=JêÏª'+Õ,ð/5Ò<=JBÓê,4.Aâiÿiô)£(Ã#Õéaùû¨è#à#=}Ýå¾!æ£}fßóý÷Ýéñ!,m8äÜë#Í}_Ñûí¸¸¸v=}F8E?åàHE­·6ýÍïÖ(	¦å(_pð§)%ñTI=Mi©)(¡s!ç¢ý&¹£cï¿Éy© ½ÑÈ"fC#"ÍX¹øhÖ!ê­D98)çH!	Ç¦á­¡Ì¢{9æG%$×¯áäT¤'÷­aAF Ý÷wûÅ£d^¾XÿØæjHQlqúÓsÛþ¸VVúÿk¤ËgEÁ÷Ãfd	XÄþÓ@ànJ©IYaQ½×k$÷¼ KÇpÌ©\` h Âªä}(zÙIµ#äò	¿ú95ë¶Ýw¾'qaÁì	¬Üc;ÑÖº¨ÉicT8åVçÕít7d¦] %ÄÙr=Mq­þú$Âáî%ÌÐ¦pýQÙÈÉ¶Iµ½/ÿZ¢©Ù~åÕ[U¹éòLà´ßÛ»éqè§Ó(=Jó)­þøðÙ|ÚXC7ÐQWf©Ôù1¹ìüõ÷ÉÂ	ï'"e×û"Û¨Å!Ø7MNCèD5á£XFº|/Eé&ßÁwý\\¡æÎ$ðAàIt"R©õ]=JúáàoÔå§¿ÏùíT§}®÷íÐàÍçk\\cà+=JurÓrùÓn¨ÍAe£_Ú|íÈóÝ\`HãVÔ=Ju¡Èãàx]=@Gè»Ùn÷ ­ñX À4wÌqø	 ØÕ³°v=JäÑ¹üÖñÚÕþµ£-ô\`g=@Ä¡"ÁÞnQ÷¥=J«\\å8Éæ¦!Ã¥ÈèFdïèU#¬¿$=MÑ×©aÒ× ­ÐViMyãd=MÐ×gõé }'Wj~âÒíQÒíË@e¦]y(×Í½¨Ý)èÊ4ÿÄñ÷©&ÀÚÏéÞ£EøôÑ%Ê{aGè<fÜ{ñë\`ÉâÛü®áÈãÊà5áF¨ºñé6cÙÃ'ìD (=@-©hYÙ¥üÖw1Ùh5T@Ê=M£ExÙú¤=Jâã Èè=M}Ê¦µ{]h Ùzß@§héÓûnÉA8YFFwGæÕ¸õÛÇ³1]±S.IWY'ÐÜÐÓxQGßåáG=@eVâª¦wÖÇ(Ð¢dõ#Ïã[È{gAFødÿÌ8³aÑ=M=}JãäØ¡²¶Îá¦8ûxÆÂçíQýr{},edY bG÷qUÂ»m/±ÜÐËP{zÃ¹	éå¾Cä«~þMc¡Ä=M^ñÛª£4©ïç8·GâýÑvñ!¸}úØ58±Ñ¬mâ£ããØMßéÖdGl%bOeÿæ=}Ø=Mý;¥Þ7÷EÍÐýÑ#PGjeúÉFàdÉ^wÒ·y²ÓÛm}ø÷Y÷G@ÙqÑ«L8ñ]àíDý}ýPÁïø5¥b\`_	:Í\\Ifh¶¤ÂácpÍçYF Ío-äfÜ	¶Æ½úô-fðdßXµÖØ8k8cN&4eAZ\`oµ\`qcbéÌ3rö~Ay&®è¹îò:g7kt=MdÑ!Ò¡7ôî\`´ûªfE8ÂHchì£dâÎã R)½mÐ=M4ñk¸Zu¹Fb×jã/öZLy8áÎÑüÜ=M°»íUÁU=}ÜûìKë+zG·Ü¾ýqáXI}aõâëça×G{è¢ë&ÈHx®sÝ¨Ã]ËÿÅzÑq8Zõ¨JåûúgTNNbNB)Ä6SIfÞ×D_\`Ô{MüÜpµºËiùÈâÈÇÁð¹(Þîhç¤þÒÛÙå=@æçÞùÄá¥ Ãú¥ø=M±Âa¥õe¡Ø £æ³ßÏE©wâbÕ(fÄ=}ØÃâôûu=M¨éú wûv¹ë_ÒÛßé×ÆeØy×¸Éb¨P§) ï2tU%é4ihÉØM¨æ	»¨¦§äÍÃ­"e¡$Ø/RùýÇ5=MBåYé#ã]rä{ ýò~\`qXñ(èßÙû¹Ï­ÍÀ%t=MrÚTMo)ätÉÝ<W¿Õ=}¦¼CnÏG<§j³ù3:?«¼ÍÔ±F¼Î«¸¼<®vÂÝN_k¤³~÷o¼ÐL¥AØÝ¹ËÍV¼£$ð5	út_Å¡EÇæÈÉä×¶þKd¿åx¤ÂQÎVã©ôù5=@Æâ öÕzãÔ·ðN¸Ãã³ÅYG-õ¯]¸§ºÑzcu=M­|Pöß	ÃéÆ­UÛp×%ï¹tã¿Ñ=JÍ®~è&âã¡Ié$öÆé¢¿¤%8Ee#à-éÜ5T?{émv"#Õ¡Gä¢õÊnb\\6Ie¥Í©g Y?åw¹ÍýÁi»å¡ë|¿E ²xF­ Hé(öïç/éöºûÝ=@g£Ïó÷é¤Q¶Éå\`=MîÈK7!·IgØÍ©g!ÙåÑhS=M¨à'òßØ#uU·å8sÅfÿà'Ñf¡Sz|þªôÌ·%x¢Ê¶üâmvìµaÒñÙh6SCÊ§é=}Øm#ùÇf,tp^I½bgñÙg 9RË­q'¬(§ÈáÛT·d yÈb÷½adâ0Á×æ%º{ý[Iè 5·ÔÔªþ]©=@U¡	l'8ç<pyæ»É©=JCzðüæqy]À"ìÇH+ÞGÁ\\Áa}%&uq\`AÇª6Åzuf/õp=@ÿß©lùE9(ÖØuÖ#	§=J=}XÈ^Iu	u¨Ë%%÷Ûr?ê¯=}7Øõ÷ÇðdïMy+-.À¹Õ¸Ûçøóx%÷+xñp ÞîÉvqÿ}¶aé8ñ=@=Mn5yEþq5ù}}PÀÙ0?Pcdøq×~ÛÖ6c°=@z%ì÷GÌç9º´ý?ÑxE÷[]gÉÄFÇ9Ì°Ñæxøõ÷ÞâÛ*@Z9æûõÍ«%¦}}-ÍÕ½ÿ»À,¤hóÛÖ}G[<ipoEÃ	û{}*$r'³oì÷gúpÜ}â£½õPÁx+òmy=J¨ftÐÜS©9qA¶	QDß¢þyOde{ñõû=@ÏÕéæn =MÜÂ9D#=@m+ùÕªFQkøÇÄÄdQdýÀ\\2§ÊÑÃ¸øQØvß{¹oózXOë¥¦èæø³ði?g´×´hþ´2ñ5AteEµ»5\`dCwDßÖj#YûànÅp"vïR<æöjh!Ø~aÿp=@Çèßåõ¨9&¸CVµaE³aµyVt'ó×¬QyDdLIßµqÉq¸Y[¨^$:k©ÝÉÿë=@íçÕýJÄÏÐÒ­tID­s¸?=@®äÖæ´&n~,Ê<<e´ÞÀ)Òo{oÙù58§Æyâö î'ÀM¶¦Ãª)nÈXk¸"e=}{U2ÍÕ=M}õ{M÷Þ\`M.óB\`,ö:èÏ,ÈÖBÕÂ'høÁÇ'ïvû=M¡6cÄ4öÆ¹	+¢py³=@üPØ¬n©Óê³UZÁkJô¨,s=@Me¡b¡ø®K­$ñ =@ã·ít@96^tÈi©ê ¿U¨Ç_KÓ©É ·DþÔC\\Q¹ø=@ðRvæõ$7õ\`bÚ'=Jè_¾Ò²dWï¹Å_££¼q[h­ÍA º=JXõ@àÙ{OcîÉ#$oÙçpµýÚÅÅþNà{öØ³ç¥Èh)î<¥±³ZeÚðî®®_åÿgVhèðWã§øî[Ñ§ÖÉ[¢vCz<¼å½³³åð!GýÉg ÖGýÍ·{{ëÍÔ×M.åB¦11q·h)¨îÂÂ=@ç¤sH[hè!ëñ!E\`¢ïÉÑÄ_æ!è×(ýÛ ¶#Þ¦Ù(=M!v³=Mrr~·¬À+úô3E¤Z²CÀ:±9\`)ëH<Þí÷ì¹Yì__ï¹Y9¡àÚA¡L¨æüèªW;;¡\`!îGR÷eêÖóÄ]º6¡¤ã :iX^!Ó¾¨ö:îXGÚ¢Ï"¦QüÍ{{Í ­²BÊ|¯».p®{TÔý6à¼5h¸º×C]«7¾5dìw¢×¦DÞìºÑçZk£juzôµ=MGüN$¡3=M!%pà+[¥ÎC,ç§ÏöùHIÕà¬k+(#'#$¢÷-ú÷ÿï3±E1¥,RæØ)~çÞ'ð9¥dÙ·ö=Mf¥" ÙAB¯yIé¥%"ûM±)úÖt?uÏÏüÛÃüÉéÙr	¶ôWsEº°sÓÿÎ±5GÏ%üÅ%¨mÌ¡gÎ=};|Â>âàÏÞ9ùyöxäÚ\`ßèïÓêç{þ÷H×qáùF_Ö©áÀLô>7\`) ýQ¹GôÛÉ¤5#£ãbzíöEq ÖÆgKjá\`·S¿õÀR|ZêùQ¹±Åµ½Í­Ç¢£Ð£=}<äYÈù{ÈúNÜk>*pJP°Lãh9é·ûëèO('ø¯ÏmÅWH­¶P]DÎA¥°o=JÐ£h	eàã,ÈøÒåó¯}¥a¹ÔzVRH¡q%ÑQQÁïaVÙó$ ïhiË¢KûÕÖiåÎU?ù=Mtª(üï¥bÃÒu£Ý%Uõ=@lÎEÃ5Po±AJçCVcäv¤¼Äq¤åÝ¸$¢[ßÂç=@ÄPèàüÁÑ1}T¤BÏùùùWúÿ$&=JÔþ\`?¦ÎÙùYtåÒ±·÷×mU|¯1bEÏIÇ	[Mà3q^õE1Î4Ìø:ç§ á'ÁL¦$ #ß-õ|en>Ê]õáyÙÇ\`ç©­ZiAÄíÊüÓÜüý^YØd¸üÑ5ïÎùáá Ý»èfi|Ü»higßâ¥¡Ö¹YYIÿ^þv%òÌÂrYDÛy¹xØs=@E©=@Á¡Ñ!Õî­÷í,ø^"$ëCÔçÞÙÃXé§¦ )ÙÓG¿lÈÌ	iéä§Þ+·õ?ßÍ/ûä?ÏñüåÇGÏù©Ð¯tIØ¾èçfÆÿJ§¥¥£Ñì¸=J¼èåÇ[äàIÄ'­µ$ Ðp¦¦yWu¥ü²¦©)Ìâ¯Æîäê¨¾#(#ÿ¶Ô±â{âc¬à¡àÿÞ!¹YúâAùrBÓúä»üTü­»#ZÝ7ÆÎyAq@ñæg	Ä!ÒôX0öß¿Ç4dÇ"ZÎïÅÄïãÏuäüR¦£!RnÊ;"$(û¯§í§n¥è§¢@Ofßï<=}§ûêÄK*©Bõw=Md]õáÙYØBÊÂ±*õt­×óïõÙ³´À°$N¶ï\`)K©Y}çÝ¸9Äg¦,lt¿´þä}ÉýX£,µ¿µôþQ =Jº"¹?\`ýã\`ýHKJ¶p ,Á_Ö.!%}Y	¦OÐã"Qâ'"qäÑ]8N+î°Î%î\\ÐfØ$Â{g}hÝ(8»IQdXxgÆz°vâãpßÍ_'D_EáÏ[N«LÎr%>SC¨¹â%Dc;SQuè0SOSKàÒÑ³=@ÖOöJpúi	³Y§ÁèC²*Ü|'®6¾ÎÙBá?,áçÒN#>ÁÎ-:·ÀRWs9»dá¯½ \\¢¸>¬ÎóAV1 si55]($©)¹³:¾:Â:À:½º¿:½ºGó=}3Î<î<.p¼±.»,ò/³{êIÓ2|R<²,sêIìCÓF|/Îtrr»2³ZÚJ»,wÎr»M_ÎzÝrw»ÄMßn·þÀù»Gc|ÎØî¢m³þEÓY|6|Vü*ÎkrºtqÎ.Îr³n¸J»üºpK'ncÎr=}»¨pÄ¬^70üYrÝºJ÷mªÞ23üÙrõ»L×P7güpÎ÷r»¨m«Þ5¹:¿ë¬*S=}¡ÎirÆ­.Bü3Î}rºøKj$=}\\ü?ÎraºKkä±*;ü=}ÎrYºKçk¤±.Ó35üa<Ê´§*¹®7vì@UÃºj2JYIóGó=}S9¼a¼Y¼I¼i|*|:<Wª¯º´J¯L?qT³.§eÓ6|cÎ4rzß¿ì»Ê+ûKIó¬~GÓP|Îär»DL_p´þFÓO|Îàrný¡nvþ¼=J¸´=J®Æ·ðÆð³$nðLWqäoðØý=}güQÎäj¬/rºÄÑ¶¾1r»¶2ÓW Õ=}r_«NÃr@©J_.ìpµGEüYjÈ\\øJïË(¸J71\\¿î=MHü<J9¶C:CüXÆqð-ëd6|+r­£mäª¸-v+1v,¨T*Â/Ï=M$3ò!]\`Ùcjêÿb*3Y>ðåjn¡6r¯R=}òbH( +KÉ¿lÇòä,SÁ¾oªÂO«ÂíUÌ·jx©JFÞø*kõZ©ëp%7rAr¤c4§×«h-{WjþödBµ¤B=}JJÍpBÕPB]Æ\`-ÅLßìÂàëàíB--¥,­ªÞáäX¤xjº®!ëFoØªâé+Ñ+1<,M«âËjJØ]:@²U-kltàjJØY:a>²E3î3îG.îÇ0*"7²¥7²Ä·dÌØ#ÒK¶\`*¥,-i+ØmaÊ÷Åú J*yÈÇýY$2g+×£*§i²[*Ì(+n¢<D.N'0N'<ð82¤0ªA¡=}4f,F(:7îæ1î|%KÆGxâ*BÞ* ð,vºÜ2ð*y9*qÉ*eê3óH=Jµ£Â|º¥ªcF¸#LiCÃ7hðA=M±¢¸#®ò´&Ág¥;ËríLêmÀ°-C:ûüxÀð8/W_?îdI½Ï1¹êì#ôJÏ_]r íÊbÚòJmJÏEÎ1(p¢§ÍîqBÏößpÍMrÃ\`ü­g\`üÑ9bqÚ¿¢óH/èO@QÏwÚ½HÆá½°1uJ¾VªçFN	1SUýkÜas9°ÃÎy©ÄNâÍ¾àê{¬Ø´EÀ"OÝN ¼H¼°A¡À"<S]Éµ^ ÐµµíÆÐUØÎ1uÎyïÏÖÇ¼mÜéK#8 ¾ÂutOgÒ¿qD(R¹îÐ¿V¿çÏÛ¡çO	g#tÀèü­#Îym&N#&|ñ&¼'h©ó¡+³á7ºâ7¤*ý¬Nè]ô.L¸w3»¦¥A¼Ö÷5uÃÿµr9T?¿h¿8¿Ü´Am(¼§3óás³ÿROÏßRWg=}P7yUMÛ¯O5Y±$õuèX?ÏÖÔ¿Nu)ôü­üÑENj®¾=@g|ÜÑrèÉÂîN£s¾=Ju¢%Ä<ßÎöÌú)ä¼ÙÓèwJ¨RgrV§\\\`¿ÜPa½ª@¼'àÀ¼Í=@<¥=@ptÅ=@x¤zÏ-$	{5duÀ[(O	ugÎÖïçNõªhü­Ò½ió$cÖÿÕ+ÑPÖ±ÂH.ðÖÕÛ@«@¼>4¦a+ýªvlõ­&x¼Ïö}ÜÞd6¼ïJú-*YE·¼Óã·Þ;Î)OSWíx4YÃXl.ñ¢ãå\\'N¯8»üôãsÀ¦Hü¼Ó¡S¶¹³½v;/Îÿÿ¬Îö:s¨n4\\'tåxt~\\¯ptËÿÌN£SÝumêRÝWøËªñçO}ý+üÒ.óÜòTÏo¹½lw½vGs®¼½Ûq4cNÏßdQ4¾¹¦PÃ°©»\\GG;.ê\`£®ôÕÑ°õÃ¥óæ8*¾\`|xÅh}xå\`Ã]úÎi£)cÀÇ÷*­jâë\\×¯KÝj­S¼Ä_0uÕM°^%q°ú-PÍ¤ÍÆúòR9I^WÆ6§Äv¥ùóÝÛÜ·Ó¡Åö×}V³C\`Ðyå#hU±·Þ7çå=@$ö\`q²¸ Ð/ÝlIÈá½y¢\`éd°çÓýo¥õ¦8Ã_ädÂdØ Gðëw[ÏÏy\\¯ä_Ã°¿¾ùÑdôOXdÄð¿^±èFx¡ETßÿÆYeHS Üæõ§µêÏ¡¿©u7g&ÿþÚå­éüx_¡abHdä»±¦"¾q=@ÈÕÅ&ÿõ%5ÙößS£v[£eXùs¹x)ýeüzI½uH£óxã¦PîJ97Á=@ã¨õ)ÿx%ÅxwRºÜxªÏX¶æáÇ2ç"ÁÊv	ØëÛÚ¬Ë7KÐÔÁmüÄW^­ êÒU=@v¡Ö½kjdy0G²ßcF.p!%Üõ­>º®Í/É ü_-"°÷ü»X|ãV9SÓ>©ÓvÑ:uÁ<ü¤ß¬^s_ÓÏ°¼¥Ól¨<U¿V]ýÏ$=@sók±ÏLqu¹ÄuõigUaXf]mÈkbÛÌqNí¶í°eaº$´ÛvÅQÙ!"¡²Ú×'Ê×Ó¨¥åK#é?ç¨ê×8­¾Z¦ »=MÉAÄ¢~'ßëO§ÿ«9äyÖ=@]õ\`Ùk·°ø]"¢x%(;Ûõôhÿ©Ä'ªUWm¬©(bPmw»5à®½|Lyè«ÏA¿F sÛ4ïA4î]ÕÿßÉ~»W¤ ¡â!ãwaYTo± OÎ¡Èú±[Í¨ia	e3fâ´iºkÊ-Ð¹'À¤dCÎq3pø|Ó,ãj=@yS!&üÝGoÏâ¿ÏàDtËÉ¥u¯h¸ÁL9½Ä@¨V VKeÅN)$ä¦ÎuíØ¡6£æPCEdÞÚóFîWÏÄÇÂ¿)õN½SfÑ=@ÕÆ¹CÐrmÙ]¢>Ø=Má¦ê´°ÈIE$ÝüÛ±ÜLfÜÕÏm÷µä^$£\`è½eÅiêç{A¼ÜjºõÕt¶{¤ßúx/ÇÎöòfü¾/ÏíÏÖÐO#nó_¶^²Á¿Çÿ­Óøðk½AOpóÅevÃ)ÿ\`XN¹öl©¢yèêÕ^ÙìÀÀÓWâÊ[%Ü3M]CWí/þÞJ½ì=}ûw5sÀðßÏÿ}O!9Nã=@:Èø=JX^xÕÚ=@\\OxdãÃ[÷hc¦Kã«§#5 ÚØµïÞÞ¬wt©Y?M÷£©s´Cé h:JaÛ7äTYöìühU¥e>3'ÀF»"­ (3(=MaXX£'n&§c¦Qmu\`éyZT¤úgòhZØøòôó×¡aDüX?Û%Zä½Í'Ö=}É~vÙ¹á¨Ð}Àu¢yëèùÑÿyE¦ãÐ@éªPÕ®çJ5ÞÀ7ÔbþîkPÛÐÃ´í:ò>èÎN÷ÕµµüuúÔhO°<ÍÝJa=J_Î~úsf:_F(0¬¸V4dÜ5Øñétï+Ü5üÁ²þ\`0Ë50¾gô.½ô/<,YóqôY/mÄ:Por·êá& \\É¿_Ó½X}^	õ­"~)H^ÔÓ|Ø»ê¦ä°¦)G_Óõ|ßlÌ+Øî¼|<0 à£Íd{;?uA3¡lÝð±7ß§uk©aq£"»s­¤ ýÖk×RcRÉÕf¥®û³-$ úÔsç»¿ô>9¼ÁøuÉ&½"º¨çäÞûÚ\`Ujá¦S=MqOñ9¶ûÓ}sÙí$é­Ã¥¡é¯üý$!åYÃAjos¦îQ9hhb}(ÉUa}Ê´m	Õph¦!W·ïMìØ°q}<L)äZöiLè¹£?[×Î$»Í!´¨éqÎ%"»»A÷²fà£C?¨fÜïð»=}hnä>ÜXézdÁ3z$&ÃÑÜ<=@ÖÀ¼HúlßåS½98~\`÷ÜT÷¹äâx{	ÅÓ6éÜzC"¦¯óÍÏõ8ï§9?cÖ¤CÜ¼èÀþ&Û'ï&Ao]Úª  V»M¯?ùóV_çËi\`~*ecÏJå);\`^Óbt]	ì­?Æ{cy¯'[óì<þ=@T»$ÂpÂÐé@=@ÖÍàÖÐß-%&Ó=}EüàUâÊeõf½Çd	ÅãIõøX¸'eñÜP\`-S-§íÀû25\\¾=}Ö¢à,Å BåÝ bE\\¢.U|N»gbÄò@t?NÛ#½ð(\`PJ¯IÂì=@rÑÐÚìË\`ÐÏ¿ÓMÖFUeèïôæ8(i×GUå þôàéÛÜ3I×AUå"÷ôÝÖcümÎr®a+³ñc~O+Å×þ/;2î*¬=J­-êñ¼5ÊzErgÎ@Ç¶>'ô¦oãÉ{ñ¥þôìÈ=M%KØ=M(fi[ñ×ôÒá¿ÞÜmõÖöIaóô\`×JUµ)D çÆ¿÷7àÜÖá>à=J4%#4eÀÃì×uÏÐÚ=@> Ú¡4Eýb¯ÏvYÑÚ°>\`k\\e¡VÃÂöwym±PÝW½´ól@h³çhÉîsÑPÛQ'¼¿dsöYN³×(Èòðt\`QÜÚ3³nGÈòpäPÜò¥MÇMüóMí".uáIëìX9(°Ý M°Ýq±ÝíhíÑ%íàÖ{Z\`ÎZ BQ«ÇÉêÔNNÚyV«cdNÚ(ÑËÃÖ±¢\`SRÈo¹ÿ=@îÛÛVTV¸9±ÜÔm±Üt±ÜÛ°Ú<°Úì-±Ú"¼mèñ­Ã´ëÖqëö[)¥:g/ìàd­=@j=@ñjiº¯6X9£P9«{-¡'CÿÉ_É]! ðÜ'Ã©( iaæI|âIugAí ½[Öï\`S_Ä¿W@÷TÆõN 75 g¸ Á0 Õ A ä¤ÝSU¥Û¤Û´y¥Üi!×u3Q¥Ú¡Ûg£ÑHö¡àãx¡ê©a\`ÜEe=M	·ç¿O^ôdfìÀ·ìD/¡ñD5A<eÛ«Ç)?GTG½GëØGáý[0 Ô k ÖþàÖràç\`Öº\`öTßiáhè×ò×Õü×¶W¿W'=MWË@W°Õ÷ÃÍc=M¹ÅÛq-Å[%Ð} dÕ3e_Ô3õ	®ÇG	Â§\`a}©îüD[ý¾°ÃumÃªdaQ=@áFÝyiÿÍ6Â_ÏX¥(Ó8e_Þ85£{Åg}Å¯Øï(µsÜ£ÜÃ_ô_7ÿü¬ÿùÝÍ5ÑR bÿìç×ðÔð´gð& T¢3¯§ÂIó@bo\\_[¬¢¿ïßÓôF9(ÔÚµìHbÕÇzÃ_ç³'ÿÊ<åÝçLµ3Öò°¸ÙêèçTù¿]\\õÛïoõÛÚSþå\\|å\\?9½mìðÏõÑÏ=M|ÖÀ¼ÖÙsNè.µ#ÝbÕ~ãbÅbåB'[¾GGô YôôSôô7Sì"ìóì"®l':=@_T®×zºO©6aÄ/Ý}¬måJ=@èJ%âMª?5á¥AÉã'Ýû%'hIig\`I½ %ÜÐ£§ïIàcíÅä£ÝÜ©õíÚæÿÈö$­×ë|äÝ1¹íôà¬5Åú¯§IöFQàÿû³§aÀdÜùwvâ³ÿGê=@ÇÞE§µ \`×7·Þ»iCÃ3-E=MuõÖ|3øSUe¨H§ 9#ÌF& sE%{ó'ÊÈxÛ5¢ÕÖ(&¿ý5¯ôþy¿±;y¾ã&»Üzó%§p¥´í«eôÞá¿Î'a¿íÿRíþôÎÔ?åÇ©S!õt&}ã;¤{#£O)Æü©Câõ=@Â½ôñ¿Ëñ¾c¹¹RoäF´bÒVÔ%±\\K=M¡¨=JÙ%>	æãi\`mS#¹ÔÏe¿¡RÏ¡'ÐfYÜwSgµâ3IÞ{ÛãèÇ|¤%DúîÎ¿ôµ!õ¿AÀSsqÁTÝôW{Ô÷Î¶ÚÒþaØ\\×ôFO¼tÂ'véOïÄ\\ >=@ùtý½¾Ï1QRýlñU«½ðTwÈ)Î.aC×öf|»ÐéÉÌÖÃÒ&¥Â|ärÆ&Jï©rBOÌjIÏg¾±éx_Î]á¸I×yËî~Ô¦zõSýeþ(ÒËödwcÃFÓÎÀ×Ìâ{báÆíZOtTÓN3Ì¤>ÐSÒiBÊ³ùÙ&³çÂqÃ'½±üèæÕÜ%à[ÿkËTyárå3M1¨;ØôÍòðýqÈ¤Oáò5»ðCQM!gb>#ä&SåM©éç_Ü¯»ðØ²££{ÌL}<Ñqèi\`[üÆ)ÑòÛ©Po=@´I:ûÕï÷WL¡_ÔG NfÂ<»ÿ¬-Luâq=}#Ç;æùoîCx:{ =Mò²ùÃ·Mè±µR¤ÎÆ¿ÕÀtèâ×k¥=@éÝïÎL¥ýleçÿ&ïõ h'Ð¤Å]	WÝhpfC½<­]fÀøRzM\\#ô¤C5F¦]mgcb=MÛ¡°	[Cù<¨øzNgÍ%ïãC	pYóRðÅE\\Q)ÀÞô¶!!ÖÃ¨N=M¶@9YþÅ¨WÿåCGhøBfðßI](gÍh­$ÿíx×ýÎÀÎ }Ùß~ÙóÕh(ÕÈØÙ=@ÈEÒ\`¤~zçÓ²T·SÐØb|gApG?'OßÑp=}o×\\ùÌàåm§Ô¸$SËèdMßÍm]=MÀºÃþ#Õï¬eÕ¨çåÓÛ¥Ô+Y$ÒOô }ý±8zIÖp©²}ùDØ(ÆºÎø=MpÎÓ_§qÓå ¶yáFÍ¸¥]ç_æ$ó³êÍ½þçPÕm7}ÿE5ÐÓ¡UùzýøÏÕÔ ÝÿµÒ©°ù}eÉÇÙ8¹Ò@^Ve÷Ì@8%whâvü¯¤ÿt=JÂÿéß½·þÅ{Eþ¡A\`Ô}$©Ì\`ÆÞwéÚm7} ÓÑxI¡Õ¸¦¼ËÐ9ª§ÐZ§éäRªdIñt±þ%9Õë7¹ÔáYH}gåÆz©¥¢|'=J_=MCßÎÆdô ¬§o_=@¼Ä¿¨'oe)ÔI×ß°¤X"ÀÄ#ÿWØÔ(¤ygH&j×æËT/fmi{Á$f}qÎiäè~õw¢Ï¤æ{Oéyç¥ÑØ³'Êè%{ý(ÝöAß ×åéÕ=J»gÑO¨¡æöánC¢ËY0Õ»é¹à÷­£õà&>eãÀg!)ùÁ =J±¤Ã"Niq(¾M©]ôö~He5Æ£r=}A=JôI¥äÉæ¦=@k¡èS­¡Yóaýp¥£¢ê×f&æKìÅ¥÷&í¦#ÿÑè hèYô¹åh=MYÕ#h¹&#!/¢ËT+&×*¦J)d²¡èBîÅO/k/#Ç­/ã_P®ÙWîeWîAÞTö%¦Tö#æL¦{è{¾m£[h[ÏbY¼ÆIz¬iÖ¼yé¼)H´9!V÷áV÷±þ9=Me±C¨öÙVÉ(â{cÈÊF!rWùI¤=J/Èáo)oOh	è\\I^é\\)MVÆùf:øáØìáfØìéP%Lâ.ù6µÉ!ow>¨°ìq¦#ðÕwÒðÅ¥"÷W&Ry>Õdy5ÿ=Jþ=J%%ÿàçsß"mh¨lèê×8Y^Ý89ÕõQYÔõ1>Öñ]þ=MlçOE;EDm°&°°æÓpf¦§MÈ|æ[Yáä[â3ééÞ3éÊS\\áSYÄÑC¹Çü¶AZ_q\`é©ø¡6ëhëóg(óa_ï¡àoTàüÄ=@fôé7©dÏ7)Xáí°ÞàuÞ=Mw9Þ=MçôßáÁÞéå =J¸óG"¸qG"ÀGã¼»%¾îùîi§dhd¢áï"EåØ&éØæôØ&ïaÈ$çEßeÉ(¥¡Ìz9v9Èé1Ù~ÕQÞæQ)íµùµÉz¥x¨ç£í®¦æpóhæ(h¦í÷h¦j¢hÒYéöÌã^y©<÷=}Õïç[æíBâiè"¨æ(·¨æVÉDõ¥È¸+'#·(¦óÈ(¦¹í*Ô*(*!*)ÏjeJÉ¤J¡BîáGîgÁ6ÝH6­t8µ19¯¡6ÁëæÖ\\®vGìý!91¶m£Dm£Ëæóm#c¸Ù&|FÜU¸1çµ=M_í£pfIáVÈÙâ@ùw=JÁEPAÍ=}¢g3',!Yf¶¹a¶AÅf¶AùFð½	6=Mk¯°æ×°8°é7©GøgfqãÿpKÛM"¬cM¢ipEYp¹è³ænÈÙL9xyM Nê³K³¡RÃî\`w¼âÆNhy<£W³9#Èî>r¿(ñ(c[ÃYÄ½öÑyøPù½c]Ïè/}"×²>èÜ4	GÅì'¨tqÏ-Å}âË>èt4)o4)÷#ìô=M£»\`Hüô%ñãRU©bïô§#YU×æ@UIäô)&íô©dA×&_U¢ôMI£5Uéðô©ÚgÉaUiGéÝÖ&]øèb%Ø(®]Uøæ/W¢ïôHÝÜöÇ=@(UUdûô´6ÞÜ ÷Ö¶ÁÛÜ\`XKøf¯Â»ì8!r§õÏZu\\¦bÃ÷ÆÆöæÄOÝHbÕÈx9PPÛ°_¼µy³îän ÒmLÕÂòØEëà¡BëøòMÓíóíÀÅíÿ;í-¹ö,Ý3yjÃµ¢ ¤F¥	]¸ïgHôEô¤hCì(g®'¤Z	Z5i[²ÃJ¨íjàQ	jà¢* !s©\`Ës©\`uV½g¯('Â%»BàMZ°G³µë2!õí0÷ ©ï¼¾y\`©9àvëoýäÛ0äÜóaåÚàH0u\`×©QÆý»c µáÑvÁdáHÌ¾=@Y×_W!¶@ó³ü¿Öò­ÐV=}\`&m(Mà ¥m =M¥- (§\`g"äX Ò8£ç\`Õ§Ð@%¼½·~­ÅÇ/¸·0#ÀÿÂbÁS2"|à?àÛq@Ï<Å»Rù¼\`¾É<õÜ»ßõZ!Zà)|S¼ß¬ÿ3Sø7}Á@yd?­¦5ÝlmÂ¦kz3Ù,Ã÷Ù+Ý,ØùL%Û×Û¼Y÷à_öõ=@æ	¢ÜWgÖóJ@ìÀ×sÿöîÉP\`a=@«g¼päW¢}\`öâê|òV)Ùt)¿ùQiSqèè¢Í^'$|ó!Ó&nã(z££ysæ×¶åË®ÂÙT¶Á¿ÉXRõÈÈxeÏf¨à²ì©gÒ¦É"å]¢É¼á°L×ËæÔVcÝs#¤Ò_ôÓàU¿LÏÀSÎOô]5¾É@ùîø|Ð®ÑUµ·ý¾¦ñ©vz¶I×ÆâÈÔ³´EIÔÓcÏóØtÏ¾VÙ@týÉDT	þ|ØÐbI3¸°¿}ÐøVË6(rCKjcåq³!zÖíö´¦p_ÚµòúçáL¥cIò=MzÎí»eeÙµF>c§#Þr%ÍMg¸ðp¸ÚHcwÓFãVøiDmû¶};×4ø·|a¹¿¥Ôp¸ß~ÿH¹!\`ÃÚÙOeGwC/µ°ö¦Óæ\`=M²ËC#@¸÷²$ÀÈâü¶[aÞ õòòðæ¶i]¨¡åÁûá¶ÈEÝ\\OÓ§¬Æÿùé¥Ôù¤}u.ÓÀ>{ÅqÀ|(VÙÈG=}Ï$øØÍ89ÖÐÓàÔkÔÅdèÿ+¢·Nßï°^_óß»=JØ=}ÿºã½ÿÄÐÓQ¨{áÃ×hayGäËD£¦³ý\\ròT~íßâ7aÕíþÔ	÷GÖ§©g~c}WþªèKßô{_3¼ýÔÞÆ$ùoIÁBÖÓjUÈå×Øh¡y'¦$ËÄ³$"!ÚÙþXÔ©zy"ÖB$w·WO=M<ÃÁZ%\`æîu(ã­g«ARò%÷_mfö%q£ó<¦N9h³QézQ9¹ÀÁ9$÷!ß=@=Mw7##®À(ÞÜ*i hªIÙ;îwý¬£ü¿¬fNÎ:)@ÂE\`?´ûµùm´SÅu ÖNáY|Ä	>ðyÑÁq9ÁQiÁ=M©?ÕêIàÓòi¶Øî7EU%iíã?(TZ¬É´´åSæT=M¹=M§¨Ý­ñÍâ¦åd!¨­E-ß£ÕÊd¦¥ä&ã¤&¦¢§(-7£7Ï;¹ÖÂéÖú®áUÿ¾99ð#^qwW"±¹W"ó¥W£íý×"êÇ×£Ï¯"&Þà¦á ÛÞ(Gâm1èqÈ(Q?	Ã1ì¡¥ ÁÙ¡=@¿"æoCúPÙ¥ìÅ¥äÛç"çìç#ñç£hfÛp(w(%~i°¥GíÙùñ¥~³w(´µ=}$H-¢Ù_-jÍ6Õù8Aä78<1kðK&âK&ä£R¡É^¾ù^ïÂû¦ôbX70×aÈI»ê§ QWO°Cí"Èyí¢û8í#gí#3É;Z.I¨.YGºòm0O\`%<#;ÑNH	T³¡ºîqta­½£l¥k\\¦[Ãy t\`ÿ|"Ð«S¦$ì>è$r4©!T¯ñ££?U¡ï=}Ö¦^U)âôô#¾}è&ä¿ií¨×¿å©ëë¹Û)-¥ï§UU£îô¼@Y'Ö¢sUUQ¯(c¯ÃuÐZÀÃöÄÿu8QÛÌ½±Ï³VM.u4(Öê#öe¶£@yßïÝ×Í8m=@=JÙ=@Höfu8#G0Ü¯Á$Ý5ß '´c°ïõ¦E!]Ù% ôí±ëXVàrbÏMU¤Ög%óÏGÑ7%U\`{5@Âû¶ïÉì¨ç²êØ&¹£HØí¼\`=@ÏPÀH{Ã%ru~ÉàÕ<Hæ(ÜVÀQËN#ßBÕZÌRÜ:eãJ¡Rº×Uª×Hñø¬Ü§f¶¿wÀÿFáàë-UUui½\\EO]ÏÀ1tî=@t­_êéäÊFsfÏÒ×¸Ra´(Ø6¦çÛåÏ	PO×êD$¿K[5¾¨ Ý¾iy8?ÉÊ\`tc^®<>=}Õâ¡Ì®Ø¦5ÖÏ.èÙÖ>(çâÜ+Ï¡ÏÀ{	'(¶Ý»©ã¶æ¤kÁcMM!ØF]©èòc¸qL´×ÖD»c¼_0'Çç7ü´Îå öò}¦peåCÛ¥þ¶=JhÁ]DÃ	ÙÀÈÏ¨"]r³z¥nExÏÈÜ¨ÊÜ&Q³ÔÔñ¼Y=ML¿¡ØÜÅßWÑ¤Sµ' jçÒä¢p×)ÑDÄ$ÔG_h»äY"¯$Ý=Me­ùã8<Ù÷òÙ"£F¢åm(ä5ûðÇa Qxü¦#<#£è]/¢)Jè=@P®Â{Â95±?]ætgi¯ìYôGwTÀTeì£çÄ;æ)B¯ÿ"îAbñ£?éDþ[áø7#=@ ·ãüÚSÉÛc	ÄáOI&Ö?)¡E(ute¨ä1{q£×¥ahé9¨y(NÜaéÝÔ9´oäî@$ªÛ¦nË+æwÝ«¦úkæ!Îëd2©ZR)pFys·]åO7Fðu7597SM¢¤L¡h4é<éR³%wôß×4ùéV¯I©ÉìETh©®¿ø£Ñè7bæ,"Å8Cÿ&ãº¯»SÀð NÛ}<ÅTM#íÂå,¥S¸ÒZ®cÂ0ÛÅ%Ýy'þ[§×çGCº=}þòõ¶tUfßCãÊ;^ÝHeH}µoA²É\`nÜ/ìÃ£ ¨\` [ Kð°0Ü¼¨ÖÛföãÛEÝõ»ïÂÓs	¿UÙ	Ö9)|bÓ¶àaÏµÿtýo¿QÑRÛ!pTQ¹îR@_ìÄ~|øöÙæzäc?ÃN÷·6#|QüÈ²a3× ²¦ß¡ùèCçeØöôâÄ&Ê8Û@~õi²~Á¿Í@^2HÍ¸áÇËÀißrçºÞxWÞu÷Á"±(úCî½A¹þm1	Ó}¡k!âG93iç4¥##öJÈsBié,IÝ4) lõ¥±óûDªK÷#¼L×£!"ë,Ç¢ÁØn9¨SÐaáÙ:÷-X=MÕ9=J¿9 9q\`ñæS3&§«fR§.ø³æN(#\\¡Âì±=@Ü÷¨ã¿5µè)Ü/Ëý6ÉnÃäX )TÅõ­zÐù\\¦t¸ÜÉNó	Nc§Fqã¶ÖòP ½é¢3$R"ÞÀeõç¨ ½éR­¶ù£ÂÆL¹L!òõxÅÌ )éÌØ#-¬m4A3Wænó|ÏuÁSØ¦¯´¿T¯ÓD;ÓZ³ÔÍ×ßµ¤/¯°2¹Ö@Ý $7D_=@Ü Gd=@Ý¡	Â¨'18¸uBÈÂ¾¼þårã²Eaè}Hç$ð6B<ifSOþ³½ÑÏùÆ]ûÙUÙÚ£ë&V· ¹CfVâÉÑ'\\ûßÅàô¡îãu¥"ÁfkD¡GÂfh§ë´7]¨iÇQèâA×Ì=}Qøè£ùIQYé)ÝjÏ$%ðÏxÂh¡óÔ7 Ó±y)£'½ÁÜlV%ÑxÞ¨«}Ái¨'FÙ¡Ö&ö×Ð·%y"!ÓeÇ´þÈb ­Aè$Tûú%XhóÜYýøäÂ'ØÂ_ñHÁÇb# å¸	$Ï¢Ö§9Õ8¢·Ï] Þ·BÞqEõ²·aÔámnáúþ)Wðéå ÜvËÅYþÓ}19ÂD¾ã Ûlßì¾mù"=MÃÃÐn?ÏF¤X$qcWoR±È"»Mq ~{g±"á©)(ÇeyÞ>ËF¤ØM19HÝ=MÎÒÌ¼æUÞµÞ9|uXäS½AõÿNRJõ§Ü­þ1Òz~HQA¿ðs9ÏdzkÔ-8I#Zæ´6¾xu~6y/Ö\`»aówÎw¼ÅfzhW%jI¼~ÈWÀuIÏ\`xã7®#*¨Yó\`úc*ÁÍ:ÞÔKY½*áH+sQGÁtò½<üNÓþjQaº=@ëi#âO7¿øuãæ¾Xç¿ò@ü\`óuHTÉÁusüSlÈYqrÏÙ|1£ÙkU±´Â=}¯wmºÆ0ç^QOz5,e­ØÐ¬§ð;2¶1¹±×l£ßA\`=}PãÙ¦n ±(C^ã6!k!©Ý>@>J#¶5·õú=MÉM±í4=M=}V+ óyU9ÁYõàÚ*#-2ió¯õ9 .õÄÚôÚ¿¥ô©òøÚ1c+Å®ÉË\\']MDìmbõÛ3c9ÖmXêlAã,fë=@=JaãOÖ1ò/IàLÙÚj¸®ÿñaHòGé9­þw9)ÚMxÎEø)Àô{ü|ÂÎ½!õ¸|Þ~TPyºµs=}Îñ|g£·y­ßUhTíÅTUyÁõtýÏ|]£µvL£7dU½pr©sã²¸dAh|óå üSÉfl(uà½¤s1ÏìBãÚ^0êß?W¯±ÊLÁxLÞ&ã¾^¤X_¼aò·Î7¼µhS¿Ïµja}ØR÷¾u×Uå¾¸ÁYô/Î>Vø´æzÎ¯Ú¿NÕQs¿4æXEeVhpó/a1àEéôÿ+¾åõéõF­'ñnãbÖÈê¼×I ZcphP¥ì<FÖkò}0 GÚ¸¾±òiÖE\\yØ45ÅYÚMá±×¶ÉÆR»2@PLÚý£*»¿õçªø?àhÑ\\oX7ÕÇAÚFRa°'·ÕfjhO¥íyÉö¼Uë°-r ò×·=MWQò©ô+Ú-ä+¾o\\­oy@ÖtâCàc+ÜèkDÎ¹ÀGXfØÿ³¹Ööúïçíy­½«CÏ¿x×\\\`8Û\\ùi¦Ôï\`Xø¢Àìô½ 4ÝæÂÛaf¯7\\ÍÓà¿×¤6Ôg¥¢Ò¯XQÛ8«°s	¼J«{Ùnà)¹M³%W~ýÐ!ØîÝÖËý*êZ\`	_s§U«gI_wHù¾ù=}þ´!oy}í¼°Ü0Ó­°7MTW~·û­¸Cõþáw0Ûç9Ò·u8À´ÅÿÊÖ(vxËðI¶ZþxÍ$ÛfY¨I~²'¸Ô/Ø!qÿMÓ9ÅÌ¤ßa¥=}GdÑQ]àT% ­0g~©È·!¦Ø@'¯?ç	è]ÅÝ$=@¸^¨ÿú«#_ïßÛ®'à¦E ¨Ø-!	´OîÄ£ÃUWX&ïÑòø%ã\`qãQùö¦°I5^Q´%èûi'"bñä|+"Ð@55ø=@ßà>I­AÂùB·c¾R4Uþ*V­ÙÇit=JWvØFðÑ Øî¤XWõSN¯Âî°¥FùB¢±=M°\\bôR½Í°dbÒ½Í°\`Þ¯ËwFMqCöû °h¯ËyÚL1áCqC$öû¡°[=JB5°[BE°[BU°[M=}[°[Bu/ô[à4ðÂÖ?¶cñUÂ-¸ãzZQFÍ¸btëÆöÇ¬cÂu/ô[á4ÂØ?öcñUª+8z*=}FÚË*pÐ*bq+6ê¼,ÂªW/Zð+4¸- >êJ1VTªs8~*ÍFÚÔ*c+6êÜ,Âª/Zø+4È- ?=J*1XRê38zªMFâ<3ÆêÇr=J:1Xo,ÑbU<bð«»êc8µ.8=JN¼-aMªÍFâD+Æ|ùúvÏçwâuù3¡SiXçyâu;|#®å~IXÿyâuKÏ ;|¥3¡Ó'®åþIìIXÁÁ$yâu=Mkâu=Mmâu=Moâu=Mqâu=Msâu=Muâu=Mwâu=MyâukâumâuoâuqâusâuuâuwâuyâujâukâulâumâunâuoâupâuqâurâusâU=J?âuuâuvâuwâuxâuyâu"jâu"kâu"lâu"mâu"nâu"oâu"pâU9âu"râu"sâu"tâu³¨ýg¤p£RYçm|C~@¿s}G~Aÿs}EÒWþPEß»tÐà}IÒYþQE»$t§ÐèýBúúÂúúBûûÂûûBüüÂüüBýýÂýýFúúÆúúFûûÆûûFüüÆüüFýýÆý=}6:V:v::¶:Ö:ö::6;V;v;;¶;Ö;ö;;6<V<v<<¶<Ö<ö<<6=}V=}v=}=}¶=}Ö=}ö=}=}8:X:x::¸:Ø:ø::8;X;x;;¸;Ø;ø;;8<X<x<<¸<Ø<ø<ì'=J\`âÈ=Jh×+¤£Ê_lÙyÖGÞ°³þQ=@D µß²=@Nç©×Ì_uéõwýñqÖÞ=MQ=@l=}?O×Ã$"µß¾=@~§¨îuØh©WÐ_ÉÛýÄ×ùéõwmÖÞM ,=}"<¥/Cd&³ç® >Ghïm¥¸8éYÌgs±ÛûÈÏíéõyýmÞ"M l=}&<¥OÃd(³ç¾ ~Giïu¥Ø¸éYÐgñÛýÈ×=Méõy1ÛýÈÙÙI¬@JÄj.×j^­è(2¬4§§<Þ0ûF$$O;ÌswúTnÝÉÊ²Ðûqk:÷ÍÙÉ¬@LÄr/×n^½è(4´T§§@Þ@û$$W[ÌóúnÝéÊ²Ðý!1k;÷ÑI¬@NÄz	.×r^Íè)2¼t§©<ÞPûÆ$(O{Ìs'wúÔnÝ%ÉÊ³Ðÿ!qk<÷ÕÉ¬@PÄ	/×v^ÝâcViJû ¤xbv#éÐ!3±ÓfìTÉÂMFÐ$3±Óg®íþhÌ9Òç®íþ¨ì9Z¹Â$ubv'QFÐJFÐKFÐLFÐMFÐNFÐOFÐPFÐQFÐ#JFÐ#KFÐ#LFÐ#MFÐ#NFÐ#OFÐ#PFÐ#QFP¢JFP"JFP¢KFP"KFP¢LFP"LFP¢MFP"M$¹=J»Â=J½Â=J¿Â=JÁÂ=JÃÂ=JÅÂ=JÇÂ=JÉÂ«Â­Â¯Â±Â³ÂµÂ)UÉÌXÍb(í5XåRK¾/Azñõäµ1¯;NÁO+?nò:Îöª»OîÂì>ÿ.ÐÞÄÅ°VÐÃÄ£ÿ1cyù^÷îö©&¢Èg"Çù#ØþÚþÉþÚþÍþÚþÑþÚþÕþÚþÙ$£çQå9'fØW©miÙÕéW¥úùÜq'æÙ Xú'ªdÅÆ{!5<-yÒr¶éËQ[þ'²´×î!UT Ì«¾\`Ì»¡¾ ÌË±¾àÌÛÁ¾ ¼-äÉ|ãKcÌ%W¿e¼mäI}ãOcÐ%_¿¥¼­äÉ}ãScÔ%g¿å¼íäI~ãWcØ%o¿%|-äÉ~ßK_Ì%we|mäIßO_Ð%¥|­äÉ÷þ'×ÔÓFüB6ã.í4ï¾Ö5ßìºrCV+ÄßðêÃXmÄì·­zÍÁ=JpspOîÂ½ór­÷jâÌ7aÞ?¢¿Ò¯Wíä¬ÃÜ®J§óþÿÂüzÏ°AH+nT*ºRúñbºì¯Øm°Öâ«6ë­¨ Iæc²y.øKhbùFrÔJiê¨¬C±;§°]n;þâ{\\øKÍúÌ¶ò®0­1ï\\H4-O·ËºËðH²ø>vM	Åý7óãíj~c3ä=}bXýºÁrÍ*´=}¸]ÔKZìöBÉ¬ÿ¦¸Gé1¤]9ésë¸©6E]zÃâöÐõH±ð&^H®ù°úÖðOB~=}NYlt<h£<h5X"ñ:ºR|øìgà|-3£9@ë{Ï-/øVïz¾=JRÓâÎ¶my¨ñïOEd\\1I¬Íô*~QÆ¸ìsh®¾o¶¸¶²O1{ïhlÿ¹D)#=MxªOÚ3?C)£Å*õÔØ½;PÜJ·fbó \\ÍÀ­¼8Þf¸àsÒ³è¤:¥ã	P^WlÿJ¾¹ÀÅ¶äå@_ Ëñ3´l>«X±zð±T[kC]Fj¹}½¬l>rnÇîÞ¿B²_¸Nà/ná¹=}ï<ÌKÌîÞ­BÑ<0æ¸Òâ²uEpÎ²?=}én#RÀ³í»;}°~×Oµï	ÒÕ¡³øJ]±<ÇOf/·å¢i¾³°³2òAãÏEKUA Ñ7Æ\`Ã0pUÑùpEÑ6ÅcÅ½ÝpÇÆ¡_åµ©¥Bexù@ Ãòxý³ÞüZ=MIIÉ_Ò "¡+ÀØ/PLË(#TñZhWÝaÁ=}ÖÕÖ=@>'$\\iòC'¨)ôç*õÉÕ-ãm£­ã­c­ÖÆkÓ!²áÞ(r¹ç¹ñvâHæÞnéßö£û	aÆ ë¡#]å5Äfßïß_Èäæ°&=MÇ¥$¹xW}{#jßÑÐÚèÒûý£òÇuOfÝ=M~·=JÁ÷u/\`W0oWc¥Ü8Gþ?\`>_¾=@Á£Dý\\x"Fà¹OüU»	ÂûÈü»¦¤qÙ¶×õ ¶i NL&¯ËÝEm@÷Åh4¦]øFÛ¾¨äÚäâÔÜÌKÙàÒðWáI bäm¥' nustôMw£ÇÓ9§ùï!QÇß8±=}ðMÈ·Ä3ÉOîEËõKõº%LÁÜåg¿?àÖP¡}(³Ì8!CÉ=MæÍùgä&Ýß.Ü(½³Ãw'q]°eÜÛñø\`ä"=J=@ôV[²%$¥èaò><D@;?G=}¥©W=@®®nhrÝÆÞ÷à¤Ïé`, new Uint8Array(89469));

  var HEAPU8;

  var wasmMemory, buffer;

  function updateGlobalBufferAndViews(b) {
   buffer = b;
   HEAPU8 = new Uint8Array(b);
  }

  function JS_cos(x) {
   return Math.cos(x);
  }

  function JS_exp(x) {
   return Math.exp(x);
  }

  function _emscripten_memcpy_big(dest, src, num) {
   HEAPU8.copyWithin(dest, src, src + num);
  }

  function abortOnCannotGrowMemory(requestedSize) {
   abort("OOM");
  }

  function _emscripten_resize_heap(requestedSize) {
   HEAPU8.length;
   abortOnCannotGrowMemory();
  }

  var asmLibraryArg = {
   "b": JS_cos,
   "a": JS_exp,
   "c": _emscripten_memcpy_big,
   "d": _emscripten_resize_heap
  };

  function initRuntime(asm) {
   asm["f"]();
  }

  var imports = {
   "a": asmLibraryArg
  };

  var _opus_frame_decoder_create, _malloc, _opus_frame_decode_float_deinterleaved, _opus_frame_decoder_destroy, _free;

  WebAssembly.instantiate(Module["wasm"], imports).then(function(output) {
   var asm = output.instance.exports;
   _opus_frame_decoder_create = asm["g"];
   _malloc = asm["h"];
   _opus_frame_decode_float_deinterleaved = asm["i"];
   _opus_frame_decoder_destroy = asm["j"];
   _free = asm["k"];
   wasmMemory = asm["e"];
   updateGlobalBufferAndViews(wasmMemory.buffer);
   initRuntime(asm);
   ready();
  });

  this.ready = new Promise(resolve => {
   ready = resolve;
  }).then(() => {
   this.HEAP = buffer;
   this._malloc = _malloc;
   this._free = _free;
   this._opus_frame_decoder_create = _opus_frame_decoder_create;
   this._opus_frame_decode_float_deinterleaved = _opus_frame_decode_float_deinterleaved;
   this._opus_frame_decoder_destroy = _opus_frame_decoder_destroy;
  });
  }}

  class OpusDecoder {
    constructor(options = {}) {
      // injects dependencies when running as a web worker
      this._isWebWorker = this.constructor.isWebWorker;
      this._WASMAudioDecoderCommon =
        this.constructor.WASMAudioDecoderCommon || WASMAudioDecoderCommon;
      this._EmscriptenWASM = this.constructor.EmscriptenWASM || EmscriptenWASM;

      this._inputPtrSize = (0.12 * 510000) / 8;
      this._outputPtrSize = 120 * 48;
      this._channelsOut = 2;

      this._ready = this._init();
    }

    // injects dependencies when running as a web worker
    async _init() {
      this._common = await this._WASMAudioDecoderCommon.initWASMAudioDecoder.bind(
        this
      )();

      this._decoder = this._common.wasm._opus_frame_decoder_create();
    }

    get ready() {
      return this._ready;
    }

    async reset() {
      this.free();
      await this._init();
    }

    free() {
      this._common.wasm._opus_frame_decoder_destroy(this._decoder);

      this._common.free();
    }

    decodeFrame(opusFrame) {
      if (!(opusFrame instanceof Uint8Array))
        throw Error(
          `Data to decode must be Uint8Array. Instead got ${typeof opusFrame}`
        );

      this._input.set(opusFrame);

      const samplesDecoded =
        this._common.wasm._opus_frame_decode_float_deinterleaved(
          this._decoder,
          this._inputPtr,
          opusFrame.length,
          this._leftPtr,
          this._rightPtr
        );

      return this._WASMAudioDecoderCommon.getDecodedAudio(
        [
          this._leftArr.slice(0, samplesDecoded),
          this._rightArr.slice(0, samplesDecoded),
        ],
        samplesDecoded,
        48000
      );
    }

    decodeFrames(opusFrames) {
      let left = [],
        right = [],
        samples = 0;

      opusFrames.forEach((frame) => {
        const { channelData, samplesDecoded } = this.decodeFrame(frame);

        left.push(channelData[0]);
        right.push(channelData[1]);
        samples += samplesDecoded;
      });

      return this._WASMAudioDecoderCommon.getDecodedAudioConcat(
        [left, right],
        samples,
        48000
      );
    }
  }

  class OpusDecoderWebWorker extends WASMAudioDecoderWorker {
    constructor(options) {
      super(options, OpusDecoder, EmscriptenWASM);
    }

    async decodeFrame(data) {
      return this._postToDecoder("decodeFrame", data);
    }

    async decodeFrames(data) {
      return this._postToDecoder("decodeFrames", data);
    }
  }

  exports.OpusDecoder = OpusDecoder;
  exports.OpusDecoderWebWorker = OpusDecoderWebWorker;

  Object.defineProperty(exports, '__esModule', { value: true });

}));
