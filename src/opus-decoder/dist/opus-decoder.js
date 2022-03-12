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

  Module["wasm"] = WASMAudioDecoderCommon.inflateYencString(`Öç5Ö£	£ hñç¡	!gÁæ¼OïÁn´ÌR»Å<	<õ8StÛT¡fÀÆuwr<Ã³O\\ÒÐÍxþ~»³ûD=}ËZ:=J*°ðB²ûÚ¯[6q[f]p»þ\`w½öÍ4PjeGa)×ßùcÁ¾ÆÊÒÒ¥ ßèß=@áè	Áh%ôÒ~To)\\¦KèMäl0)¿R9¨ãAÑÔ1µ"ÕãØï³çq[ËöAÌY5ÙèdRì]ÕÿAEÙ=Jú4Q×ÌºEæ{joß(ÕþË¥ÏKzæCSùíÌ/ø=Mw¿Ýûu¨)ä'(QÏ\\éÉUôùTÁuÏ£Ì|T¿½bTwpÇÒ|ÉTÿ·¯<^=MÃ´Uÿ#ò(Õ¸ñÿÖ~µE¿|>ßìÐ¤~×à×Ô_Å¿5TµÌ½K÷	%Ý©BáM$y=M|#üèïüùqY¿É¿Èµ¤ÏÍ¨cµt×'ÏØnEXøÈÔF><YäünÅµâÁÀå%tèÌvA(ö¿üâ=}ßføË¦öïX}TGXH|Tºï¤¶5h]áÓÓÆ©tóÁâT#Û[è¸¿âÞD-¬øTÕïÉ_=M°iÖðG©ÀÖð³iÅ·&ìæ=JùÀ=MO©ùà×ð&ôæù Ùðå'(ÿ¢éieâDI±=Mm(ò¦®ÈGý]=JNµÉ|¹¢£V*§¾^,*ùs@ÉÍÆ0ÔÆø6±·Õ¨Ï»¡¸ÎÇo±uDiøíÏÉ¿9Áô¡à|j}Ðì¹Ä¹Â»}Øþ(~~ãt¶~ð½X×a6²Í~âÒqÃwL²{è0Â3Þ]tsïÉî{¦­c¸xZáÞV.²$ã«{±ROþE¹Aä¾qú!/UÍ!ÿP!Ø%JAêÁþ´I¡ª; ûËðÌÁ74^üËl_·bôe­¬Å0/ëMGjVGê^Gd>x0Ù÷6ø@0uo,&tè_U!+ïçØ]¦æÃ0ÊGªu1_RnwxW5¡^¹ç°þwDgâÈo\\é<Yüf®<{	ïÅKÅÁ±ãE	Ê©ÏÝDÆ'1_Õçæ»~Ýüí»TS79Ï\`é©·ÔaàÀ¡GFt=MBä)ëÙ)ÚþIô=Mû¢fh¾Þ&Í&eõ'¦æc-ÃÌ&±ñ÷=@Buì¿ÄãÈ*=}sÍ¤¶Ûù#éÈ5¤îi×QÒ=@X×¯xç/ìpðèÑýâÝR¡Ö°®ZæùYþn¿á¼'w?ØúfuÚ¾ÙF¿fù	éMÕÖ[4ÿ¨ÚÁþ@cáËÖ_ÊÒa=}=MO8#%ÏßY)­|Y×ZµßHUAÂ/âxø ýD7µJkæÈÿ¥#÷Åa)øA®À?a¤]ºo«N!úùYï/ZÎÚþÓ¨SßxÕ~Ø|6Ôg¾ià0_jÎuÇ"øþcô^cÍÒIGíU±Ä<´Ô<{=JÎ1pñ	Ùqw5®ëÈ´Ý~xño)x¤83ïÓQ2@cë6ÏGíÐR¿IøÅÕfälAÑØB±µy¹+ý²æÈ~@/_/wR=Mdö^ÔÇå§·ÙQ3YÕãUÉâ¼©=MºY¿ÆÙÐWaÄÿàÉÿ´EåÀ7=@aàÈª8Úæ8Êÿ¸Õ85A}G}¸ÁØ[BVÏ£¡W_ÿó=MUÛÅöÆxÑcz¢üßëòÞ=MÐ-÷~æIB£¦È0T6Uo¦íê7ô_àdóÃ\`ÔÄ³7æKnâ\\ËÄEµ9µN>-Ã=J³Û¢SUÏw4O.7çð¤õPß,Q¤#YßÄæ8¬GÄZò0vÈmjÕWw¢8¹2	Û?SøÄØâ²/ÛB)[(ÖÕü¿=Já7W=@GÏGþu^?·Ì$jn_e'Û÷x)ÿÄ?7Ö[e°¦Øã×^(E6E¹Ñ^Ô^õ&²æ¶5ÕØN('&y3O:=JÖ?¿IÜÙ4ÕÊV¤zþúGÅº~=Ml¬ó)aè¿\`ÒÙwoödvÙ=MÀ$»/£Ð¿ÝªEÙs3× K"Ç;ufô)"I£ 7«òõg®.=MÛ¨']~áéõ©9³{îoY)¤øe·ÁOÍZ<kÂæ)ÖÎCd±)Pá)>NÔx»î¶²4».Ü{GdÂlOÕÈ{Js\\;;¿Îê2RþäÕ¯øÁóý6cz^WåÔQ<=J$³óûyÓ0óuÌ5ìÆµz©FN]ðNMv±NMsl<*'Q1ª´+v\`êéMKß¬®¥âERµl¥&¶y¶+q-$¶ßñwõj%*/U?	z{78//³pk?¯áÂæ&Î	QrkUCÜAÀÒõ®ÖÌàûä_9î­ÔÍú¸ø Q^[|Rfª³ø3;0§ö~ßNßégI¡þ/#º=JðêÙ[ñ «m.\\êâ+ò¼Ï=Mâ¤«¯ëzs¡z{wM^ÿâûî²íÿEs=MzrÏÍÇ¿½=MU¶znÄ7¢Øý¬¥¥Mð_³Nh´xÖ"ûUúdÔ¬0®Ôn¦kÖýß;(NMkì÷^¬þyC0ô*ÞJp½Ó¯äÉ\\¦D=MÃ¢èNûO,<r²3ÉföA¤óXëõ2ë¿Ý¨mßï¼÷/´ÝÜnrBî¡ýGUÐdøZÄFdíÊª´k¨"³wÒø¨# sÑk}Ñ7ßÙwk£gÙYÕõt´J^%B¶máXÆ]u¸ìê$C|AÂ¥9RÕ"G³Ô "=@úXìòJ¹ÆûØ4@y±¶f÷ã$WßÚºoú=MT!t\`8ËWîçÖå75¾YÆäp¹áñ£¥MNuP^:1Ä¼ë¦G·û|=@pý´,Ø1Ì.L}^¬ÖBÇDà~}u-bÅ^]h2äú\\$WdQFG=@º¹W×½Ü¼·Êý£1Ém\\Ós½WóqP´6=}¢ÈÙ·ÕFõÓçÄ@=J®pzì â¤ÎaÅ±Ö»¡gY³$5i¯dLPÙÆSIû.TÂFº_,Õ=@Üø=JW(ÂZÊÎÀüg=}ÖwÖ0¥=}¨. ^HtÉ;Wä;¹¬«<äÍ·xKcÌØ¤b×ÔÇ_«á£h$¸Õè%9è)îûáëj_"bèä#×¥Èat½~)}0b>£¡ïÔT§ ?¤d\`~è£þ÷¨dyõ÷*8*^§étgÒöæ:~ºÅ'\`!UTþ<ÊYà]n$:¡Ýca!à¤ç=J\`ããÑ5«ëÀ¹zÁÄ|ýÂ\`¾ÝKW·ÆVL"³!ÔÝ =@~êdÌ:<´HLÉ=@\\Ä\`_¶=@éáÝoÕ}×Xâ¬¸5ël¼yE\`5¨PÂs¿ö&×(@·ØÅaa¤H«=}oL5}Í=}ýz?2TwË²ëòD/BxFÝ{[2¥;äñõÌÅú÷Ö&êâ«V_j^*_\\ÀGÛdXEÔ¬[éÿj½.ö¹çÊ©ºMÝTn7ÌÍDçb=MðÞ´L=JÐ2ÍÈ]Æã§ù¶·¹Tb~ïG×*[¹Ug0¦Å|{óÔÎ£¤ßä\`þ7Tß7â?£âÓèv|mºF^¦+Ãm7ª×¥â+ 7÷®¥í¼=} F_m2½ùjG¶Ããt6bP:¾=M\`ldÊ ë-^üï7êô²t³ó¶ÜF©­ð·ô¡qKåa,>w¡Ü°®æ6±RµM4Õ=}¬Gïì7Ð	Nþ½3O×°t\`Äy ýsx®Å.3ÁâS?ÔkÒ«E/B³L_CXs|oON8¹n9ä9úrON-NµèÅ¦Oy=@ÄÑ.Ö¹ÚëËKÚÂpóªÇ6"Æ©DÿÉ³(ÿ,´óª=JwÎX[Wn^Û>y{Õ{ý$ØßÏ9÷¹|c~¦qÙ¦§³Åº>jaË\`Ò¡¤Ø#ÁëÇv.Å¶hòP	øõÇ¬ktÁfäTÉö¿Ü!+À£ÍmãÝÞç»0CÍ¸Øú¬ðvA(MÈE7´,¯¿M,Ò4tjòU/ï*£¬/ø®wÈàðÄPÓÖ -9EÜÐWßR°âÆþ=}P k\`ºÃÚ¬Úñ ·«<JûkÑËÌá9¡Ö©%%)¬×þ)qéùõ<"¶Ù·(ë¥C5ä2Õ,*w²û@ÊËàñçÕàÃ¿Túª×"ÿy ÕÕx¥å%aÍâ¤M¨÷sÕÐ÷¸ÂÍhó¿¯ðöàÑý¤[%{UÄûDEy+¾þ)áêûzc÷÷*7&;¯ÜÐ/Åþp¯Å	=}¯GVDrk=}ì"ð:Ö¹üUÇ Á9ÙÃÜ¨3¡e¢YËI\`Tuª{¹çqE¿/¨;þl,Þ»W» Æ=JóÎçXtð~$:Þù/ åÜ,l¾v\\aXÁù	êLÑ7øD=}ík[ÜDé+\\EÿûØPeÈ	©cÉÁÙ!ä´Þà»c¯ß°Éñü?8¿Ô¢èmõz=MÑ·¤ÛÏqIÕ0PË¹¾¸³ÙäsP|Â?s«Koàï\`Ó=}D¾+xþªáP¨ïûÕR¨'ÇPýÐ¤\`ÌeÃüðôTµvA5ðrû¸Wué Ò&Bº-ÉþµÿË}åW#IÞ3Ýbuáúl1>?tLy¯HV0&ëþJin:+Kó	ü^Úoéj51§9wÇ®äëðu(Ñº3»&y}ýësÏ¤ÖÐk4áÖ×°uËü%Æ%avÍÒz Ñ9äj7$/=J=@µrÔ!sávp½Ø\\0×v»B§®Ù®=@OÁ"=@,)\\çâÛ´ÀÕ(zÑ_Gæ&Â×¯$íU/¢±n|8jo*Îc	ôIÎ¤^QcÀùq^Ñoü£Ï;7R]h»fÍ5ö]ôd=@ìPÓïúáø»ÊÃÆó(å¼µ®JÄä#9©J³/¡À¹Ì¿mÁNOOç=}mòxu9+ÎRb¼:ï1nu#õÑK òòÕÅ¿ÛÿüÖû(N÷k/',4%ß÷àXiÈTò÷5aît&(=}¤yzØÁ7ÂÔÀç)»]UÀµäW£qaÆüÚÆÑ6ã=MSCØoöW)üÈìvÝüb×uûXûÝ<G.m|÷¹rùz÷&þ_ÙÎy1;ÔS vË$¦5ÏÕ×ðiÃôé÷#0e£ù'~Ó~Úª«¾ö7u¯Ñ7ÙÁnfD\`=M\\=}Â·élÇ¥MH­÷ÖW6Õð_*Ðå³	Ä7äëÀfé³H![%u^eÓçDP¤¨%{×Vj)Øy)QÒw©=@òi&Óú°¿üpÀ±DCá{æëóé¸'ó	º§GT»?Ä¢£_¨qô±=Jpðê¦oá£µ(æÉ Øýe!_ÍÞ$øá¤åuJô[2¡«¶K[Ì@¾ªgêª}ýçÿÞÇÂëÅÖ*%7^>ØçÄ©E×ÿ"ª&àÅ%I¶7T²ÎB^ë{a¾p0Ï«ÓY}TÔ=MµX´¦Làêµ^Äàfö	k[;Ï¶N>î]×=@ d´è°ñMÏ3[îp®{È=M=M\\$"TòóD1B´åøD. ×ñ¿Ðº ^ÄY÷^Ý#À_Uÿ9òáÐâÒ5)ÆVAª³âþÇYy/¦&%)éÄôUQÝaéçi)é!Í]£=MN~çS½¹ój½¡Ð¢Åi	m³l{Íá=MÙùå¯XAÇôiÁ=@16¦0Ý%¢?)ÀR0´i»°É~U°ÓVÛÿ"%Ò&Ñ8Áz©ò·,§yñB\`EÚçàâtbCPÙáuM|~gc¬¦Æà&ÔK\`T¼à®ÃJÓò[.9¸Å\`}îNº^é¶Úje¸%=M¥d¨¹	ÚÄÛÞ¢Ìß¥eK-®4×Ô;GMSÖ	¨¨%L#\`\\±æõwJ¸Æ£üòö·ÅÌ4°2´òÁsàÿ&Q}g³Ù=J¶³ù#IxÀq3­bºÃ*M:¯Iv?Mí Ü·¶ó2iÒ±EÉõýSÙüÄË4]­4Â¶tÞtÔ#É}nåU7p2-	ÑGÃF8öÄ2êD£RÔ>d"Ùà*oIÒ®£ÛJØ.½í5ú+ÍíÅz7DZ¢gN½¿­ç~Ç=Jv!TÆÿÀ8å&Þ¥ÂdåËÁÒ¨þZÚn.ÒÁã¨Ýu¨x4þ|âPah-ÔôºÒBzx·kÍo*QÉüU'1ÝLÅÆ&ZÆ+PyAÆ^4XÕ¯ç<8#CWi¯08k&±ªw¢îÛÐ	fÒÐß|1twEÎªj¶7ÅåÿBËêø©î#2ro0is«+tqw'ËW27 7uúÙ³)Uò¤'ð+¸Ù3Bë+	õÀ®³À_OàD=@ø/-Êòn(ÓÈ1º^h£×{cfð»Ö579 âú¯­;)ÈfÎ ÛÇ\`EÂ=@AÌ®Qbàð)âÐñÿãl6º~,eòÇ=@3¡Ôñl´ù}VÆpkÚBuYÍ=JItnì-£p>SÏeN½ÛÁÄTä¥Ò,æCáq§&=Jí9in·«XTöf,ÝU.Ë¼mM,Ty2±Ä/\\Ïóý^­¥>YLÏª>"ðV5¬=MEú4ÛºB]æË¤=@~°×ÅÕv7dçÕ¬Ïw¿õFNXõÜ{i°½à½×öiñò«ö=@äÅ.ÿíãªeùAØÃKÎÈI?=M´Øqù@»wàJ°þ°ÜÐq~ã£·ýie.m"=}ÃhÌÑæ¯ÿÚ2%Òâ#AÊÍµ¤äìÍõÝÏÅwfóXäÈ	­	õ©ÄÏõu£'Ä0ØQ¢§×­ÁÆ^5:Îa¯¸KÔ«ÿÃR'Fí(ÓÉW[u>1k­Å#áÃÔD=M¾fðãÅ·T¼À p[VRzÛÍsêùêýR=MäûùÀilÐ	ÕÂ'ÀÙëRe,á·÷Yõ=}£-Ê½)¯®­à312EuPbKPòµ\`øK ~\`bÇüY­oßÄU¬êo>¿=@Ã×8yOô=@=}sJz¡u\\\\=MrNýdçVï¶·þL-AVÛð¤Ä·9_e&È4:A:Ä!>¸ðà["Éú\\òëCBÁ¨dÇ¹¯ÙÞñåÝdv=}?ZcÔ6qäz\\xËâØ]á=Mük=M^¯bâ÷=@nGó«=}Cogc ä£? ?LMËA´8jHOÜ¿ÝÔÀúÂ7jÝd¨í¬j=@²{þ%Äc YÌ62ÌeúyuÃiK*HÈ.zÒÁÏÄ,ûí5zQþHøh0!è\`YØÀÿãM´»Ä'MmãäI¨êÅÿvÅ_z!ÃCÃØÒw¼¦¤ i.³?¼¿j©v¡É5A1Ñ²é	 !ûH_%Åcy!{çÆ8G°Ä\`ÑGGAö]´°nE]@EæJ|mÆóÄá3\`±ÄÆ¢\`¢XqpÇÈÏ±PÔoFJRtþ~lÜ!£¹jTíÿ4Þ¬J=@º¾õ~è¤ç_OüDß't^ÔJæûW÷á'ôNÖA0ÿÂ°6¤«¡po¬§0Í4jJgº¢6N_9³T8:Ñ*nÇÅPK3Oÿ¶Ò?%~ÜÇE¢Ð¤y\\§9Zíc$g]ö_¡,º¼éOûøûÄ3êpÛ(ßSÅifÿÚuZúÌÎº4·=@¥Â"äú*n;¿öæ+Â]Q'ðÛÊtn^>W=} 6÷¹hRQ0÷ðo÷±ø¡©Ûã=}öéfÕø½$aÑÄÈ¬n%·&ÅÜ¤#÷ü÷&à*½òhÒ=@w61L68î´wÁÞ¥½S,­~rnËØ}ðp¡à·¿uVkß	-o(¶a´ü²dÝÐ®aâVÖæÍ«[+Æ:ÐcàÛZ×P°Þ=M±þ¡MÇ(È¼$ePÞ¤DxbÌ[Bv|(w²E¼F^ÛUàÎðd0Zn)¯Z«ãÃ_7?±Ø³÷&!§òiÑ }jÃ¸@ÅyX<V7n1qÀÀæî¾I­×µ\`W}±sýø>fR[x©5rBÁÏÜYHû g$´±Â®%ÝA¿&gÀN@.¢Ël(¥(~í0|*AÝ«f<¥=@íæÜ¹&UõÜä¥T;a¼¬ª_=JÍL;W¦h"çÅüÆgîl§.c=Já	"iën©(y)EÂrN6ÛðYrßÚ~ØNjü³Å]y<³»~ü÷¨]úàu¿ý£0bIl8=Jùâü]ó/­í@|Û-gX}rw$åO²Oý²$K£Ó!ôµË§#ÍÌfÅåÆ÷gÎüªòZbX£¿pÿÎ@FÚçä£¶!MÓ.Eò?qQ)aíÜ~[F4¼K¿¨=@âøw7Ä_BbÎF=@g, ºxÓûÇàëÅaÛÊÙ/uZdÒ!|ùÔB>õæ/Gøßkiÿç=J5ÎY/X1¯K4_ûNû-·­,µ¢eè#·	ö©;}¿=@kúk&]|gVXc[(´$wY°çÆa×ÁMçgX	yqÓõÎø£ÌØÏ:=Jô\`½¥ÿ'-kq_ ,äðùæaGBvµÖÃ¬ñæf3u;º}0Gy¼ÏZ=JåXØAÄôG[Êª¨bïLæîÐ¥b$Æþz&rwþLæQô@ØFêþuìù^ýßí =JÎÄdIÄ(>í6Nì<éµMõà+/2­ò{@=@ý1G÷ôs 	Éc®+>?Ú[\\_=@Z¸Ç@=M·æ³Í3Ü=@ö0¦±$ûvHwá>/_Òëµû­m,ñÍïÉgÐÇKï=@_>üej^Mø=@ç×¼2$Xc pp.ÈO3M'Ìu8·qmv!ÞHÖ¥*ÿ¾=@ç´t>ïæfà@x±VÇú2WV¯OÍ%¸÷Ç^>­ÓU}ï8Ã'BLÓÝßÎ¶Eç.ÿ£cý×dæº¬[FÚö³²ÑºtRü²mØcá0;Ûß&\\9ÈÓ¯ñµñ·=M×¢Chà´ñèµíñ=MäIÙÄû÷´Ä÷nê>ETrôäØÈ¼}¸û\\ãÂ'­7þeïù¹ý<åm÷öø-$ÎyãÓçû@Ú¾ÐdVÐ¥r9ZÁhÎív¤±ÓÉ8s$Ú8=M;GdMdÞüqÎÕdþüñÒÎ¹:ÑQRÏQ-X¨l·©ü è¼Fà[F íRbF,cFÛBC÷¿®I¡÷§|M-ü¹Éw{1Ã09ëuR¡¬Ïx"|Ð4©¦Ò/©f6hp\`bùHEh¥öiÅüy#Õ­\\¥ Í(Ãûq°Þ"»ëUøýMíq&ÝÄiös'¨¢ô,æÄ%°ù £üøûI{*$nÈÂûköyÇíæÞ©Êèî!úÚè±0ùd(«Ý-­7)ë]¾Õ¤°ØÕ¢À8ÈmìÝ£È¯CÖjäup6h³ñþBihf´%}oxøG_Y¾q\\ýñÍ«k=JØq¬=JæÙÇç>õlêEÚ?'¤2ºêËHS¬í9©3xr¡ú²Æ_ßm­KÉüI,[aXÛ÷P-Èstµyç±ÁÀýÂO=}Ö{ujè ¾¨Zµ Û®Q¿¥<¬©è=J¼¬®£^c¶º¯ôà^¢F[^ÇÞ¢\\"jA¿µ¼í«ø1Ã?HVw{N=J\`wúÒ!ÚÛÚ#»iÈ>ÿKCyÅZÅB"¸ý6BvX¤¨þ&G=}8©Vw2é\`@F%¸:+¬Ë(YýàÃFýJÊìÏ#I¦¼\\ùö·dÁtY2OS.|]9HüyÌ±ÞzÐ¦w¨ÕÇ4bâ[ÁÞgî[MëP«Môþ-úkdTM6*ëTC^ÙîzpNïÐ#J6.¢&:¦ýC+=}Z4lGE5PYÆ)O8(JÂZÙz"ÅxÐÂîÖÇ¾$øÉèPXBS¿pÏSMÂ´uÛmF.S}ÙöÒIï8¯Ú­fÛ÷Á}éò¬úóøQ©gËûÿHâ(kØ0¬±òPà:GökÊÃ©ýÚ¯!¨CãÞ»ý9uyÂ!Û$ÊGÑ¢e¦Ûä¸=MÊ¡ÿ÷DNrQPÿïj=@=Jf^§|75ÙFmH=J[ïýl*#Â,Ý¯û	po[·rbÞ¾TÜCµÌÖmlwÔ Ù¾zKCÝîoßuW*5ìÏS"oÚ=J¹ýÞ£CÜÀ­+_³ ¡©øT¢ÖB£(æ1ëÅëv¤9_7Â;ÂàÊ=}=JÚ®PªíL¦Çí¬æçïÎÁÂkaóTËm¼ÆçX±8¦ÉmuÌ®ÂÔm7ùË,Õ:íÏô¬ÿ%%²D±Ó¥P÷Eîµí@8±­J:±MJýz3Ébû,Ë1q>5VDïÝmöí2E\\0S8>B=JjæÜ	]yÊVJ=Mh«1íUUÈÕµ#®I¬ÐõõFmC¸FôDÈa¦ 	2µh1Ù.@ç"qëÌkä9 &rëÈ?§¼×Ô&ôÙ$Å1/ æfÖ5ùÈVÚãÝãëÝêÈº?É³ê®ÌY(ÃW#Ò¹0ùÀhÀgÕ*If¥0GhMÕÔ5íhùÍ!/Hw±=Jû%ùrÔEXÈ[½Í=@°q¥=@S<Â,TCZ¿	ïÖnô^úÒx¦ÎW¬ö>J^Bæ÷LDÏ6æ¥>Ý­Tí&,;Õ·}%ëÔo±@n6ò÷&w¨Ùó6i-eáûsØ_¡GlJ®Ü«/$ ¤aT¿wE?¢)ÛãOnrÿÂÆPxÙQL¤ì5{¡}W=Mq>ÙéR2´0ðÞ¯ñÈÝ=}ëw«.sð\\ð	ª÷¢	÷=@¢£PàI±\`­ðþE|ëì&ÛùôÂ&6C[Í£=}¨T­²¹ã^Xth¯Ñ(õ&cZ+lhöEÖ\\qéK¾Ü£DrÚ´TØÚ0ÔÓçpåJt|;wtVC\`fè4&4ÏèØn¥eØð÷w Uï!(;Pºt~ûuåÂßÒË]äY'\`ÛùkNGÿAÐUn2Ù¾ÓdÍ=MwÓ¿»®3ë3²ãOPÉö'ì¶Ziã4@îì»/¦´ñº÷Õèhp7+Á+y´Ý¹[ÑW¢­=M1Oâõv9J¾gK©Ez¥¢Õ4=}þê\\£¥gé#ëÄ§k¾´áYÓMl|Ñ>íÙ_DÖû@Þ'ÌÃL~J¿ÍYfúDu:4È ¼VíÃ6H@½ð|R>ÿq&eY-þ´ëµ¬º£{1;Óñì,MØ­§Fóúëîä	¡0%éaª¡,Û=MrpÏpoºKb%Ör¦P¤°ÈmÃ?~eiõ¦/»3vÏÁ|)ÙóÔ¾Dê]+³£â$(ÃÁOËèCãÇ°vGOy«ÖûG{Îï0ô¿íÃù°£rÛsk88¸Dì­ÜÌ".¶å1e«§säÀàÄ%ôø*9â0Àkï­]*&ë¸¬=}s°÷â{£~F×æ¹wùthâ+RG^YÓ®ïE/ÇAIZÖÁúÅTÆ?#ÛEUL\`×¥¹A9° ¤,	½LÆîÞå=}ÆÓò%dÆû>o@ÔÐjXß-áPç¡zûÎ{DI­¤®(®DJ6è%¤Òïéå«q'b4æ_èsýJ÷sÆGæWËÒâ¼©×ôZçhßÐ2ºLÙ@ãà7+Hâ*¥±ååÊ¨kÕbà=JÁ¸õÑ×T>P®3H¤uRúu¡ÄhmT¨KxÐP:ö¬ËØõ ¤,Ò¾mÑå/#exÙ?ÆÚî½Ç@Ïe­Aki=J¦\\g9c%·%ï8}]$&yQ36ÇJe8ÎÂÈ1É¸µ	ê-Å±¬ÖQNÖÏä).É#vfãÃ}î,K@³»ª}ØÉx¼³®1Å©3$e´¼±¬¦VºUuE±Q,Þµô_Ìr9I¬èxNkëuF²gka¿@¯K©«|ÁÐ³¯ñfòç±^Ô._x=J" )¿v\\ôxuÿÈ#¿·È#âwõ&>\\=M°ò5{IÜâøñÂ{8½FªLZFü¹ð^½"¾oÄ¢@ù¨Ò»Å{Y$±7(Aì=MY=M92¬M(y8r¨d¿ù²M¶íè=@®,ü?êmæä6G!ÏVXoPòé?v~å´ìKM*ìòg/oöo7¥(°®±yz"¡Áãì0ØÜh.Ë× Î/½úd=@A¶¶»¶ñ=M!üVPí·õ¸;\\§R2íÆéÝvw#»E*.½á9õZ^s\`¥Ê»±I¸!ÕmíåÌSZO2ÒËKúö¦¦¶õ=M\`Ì(+¾%ÿ3[ÇN©G^~Å!¹7$äïmªiÈ=@R¼êá05µôãÛÐú©qìý@5ùTÈ>pk8ß&a6*}SÎ¨sþ2+öÓZHÖ1ÉÕ*d#usÍÓÜhP±2Ê/¡Y¸@«ïe»åav!{^Ç®"³Zæ±À3©rËe3o¤Õ¦^:üå9;hè tQ5JãCCG-ÂÐØ @0.N¸öÌ!2ÈeJ¼åéWlÉN´Ñ·À7°#ZMÄ9Rç8O&ò=@ß;I\`°Ç·#/³¼,k+¢ôÀ>=JJÜñ öd¦¡H)9'ébè!¹¸('Î¾¨´4k?õ×É$$e/{"õûìÚ·1L1È(;g¯õÙÜ¿'QÞUc¯±=MLot´Ì;ô(^>8Yå dÓt²dý8Ü'xFÿ¿ý6	¿èv¾EÚÓÔôæsTÀ6í9ÈüûÂ²¿ñçÎµªÌÖ2Lä0øî~pL^Ï¢í©íQwI½ìu²=@ì¾7x5ÕI¾Ö/6ø¶lX3¥4f\`jBX9²@wá5Pvt7Tl¸e*UPzÍ+.û£®*Êà×g¼ÉÀ15nþ9lM5s¬2ªq=JÌÁf¿ëBnÔÌ'Ë×áBÜ=JôÂ~=@À/Z0U¾>åm_ÎTÛ$SèG)-Éþì.Ïú°ðòtèC"õÅKØýTguo[ò¢=}K#®¦ÕW#GR(\\]OH«~{nw¬Ý®nt¹^Rît¤ +ÝQK Q^tR%ò%«ùl'Ï_æjlâÀ)ÙÀÉ÷Æ·&(?ÛãWâ ùÙU'Jå:ý°{%·Õh·Â û¨Ù}:Ý-ýà¼Î>kW=}371¨õ"|P[=J@}¾9øub\\ñ,ì_ë\\uÛGS/ÖjÐ¿TYî­ÙÃÁMf·ºõrÛè_÷3[dv	ôjÞï[AcÐÜsia@v¨5Î8¬ÎJÐñÿÐ\`Rg"/ïµ±||3ö»~*hwÀ¿ëüwóÃQRÎscXì$XÎ+_*¢ÀTj©MÎnq5ü0ºø¬=M.ò@Üá[zUóo{d{¾Ì*wîÊÕ*_R^{/é«À±ýÒt³¦ü°¯îÀ7¬K{n_®=@4µñâüÊÝK¬IòJa+ÇñJCO|òìåì18)pFr®Õßé,ög=@¶Xö-²K59«.;ûjt÷G<ýUóNb¨-LTRN=@YtËvÊºY«=JYñLµMÄèõ¬p=Ms<!¿¨í¢:®	|o#%)£^N_F)aZ½KÜÃAº-©»;*VPJÔÈQôLäÒ­\\"M¹Ókÿ¹.ø3OXe²Öûõôß¯ÙÂQCõ«Úã%aº-»»Üï<SbúÒm7Öô¦Ô.w=J­/S¥Vä<Àôr%WõÈTÓK'U«{{¨YË!·ì5ØõÅTiÙ²ªoh§ÎJ»óï|YÞ)@|Ùìz2ßõ¶©KGT­F4eSáçþ¬4´Òg½BXEÃtÍ8l_þW¨¾>«õhUv'µtØa6ìb¿Ûø Ù ôÉâû¨_$l¢Á*ìíMHÉWÿ87ÌDa£3Í¾½má­JgKNÆmMçÏë&ÚB/]»;p#Æ Ò¾mùí+®cþÿA=Mì£<ZMi3ÈÛQLØ)H³Üùo¥t^C0¶ l¹qV¹Ðüå;)úõ;KRÅgðy$³®îlÒ=@ê~ÌiR=@=}Êø MÏü¸X®d'ëV¾lõE7YäOÈºåý.[fQH5y¶Ð3=Jgs°lhßcÏ-f	ñåÕ¿nV»´rEQ*Â%z7R¶·jò:÷úZ9|côÇ)N/d=@ÖëÊÝæAÅ!z¡nõy,®!¹9oZL8IÞf½åkX8À[(;©IÜÇI¨êVÕñ«mNÁ)ãL/q#ã§þWýµ¤«r@=Jd]ßY°%e0S3Çï=@=MvÎh'±0P-»pïºbåã«ïYA/¡]K_>p¼MiôÒLÁ92¬¯ÃM¬MVùþ^XÌ0¸g<xüò9°~7'g¹­JÐqæÔæ~Ðµ»,.|O~ä×ÿáþ\\¯*[eQo\\ï¹ÕÄÎ6I°SÞoÿtÜªÂ¤b§ê;7÷2­+mÞOÏc£ÿW3máú^öL¬jw	ÐÖq*=JçÜºÍtpm÷º<;Xö×ÚZ³\\És\\ïi_\\¾öXÌOí×.ô}ZÎúu·õÏX>èñå lêGwº¾~^XÎÚaúñÁÁ©¿sÃí¡ï%IeèÓ¨ºìÊ{»,Jsaùª2ùâ$å¹'}M¬\`Èã/«úäqøÄ×(t®ùK.YÍÌ¹AH%&iÙÚ¸8Ê{9¿õX"¶h[3¡ ùGaxW ËQÜ5Pâãa (vÅ¸yQ ëIÈ{ëN'£GdÎùzs)Äylò/°7qcpÝá¯£°í'_¡À¥ëæÈ¥)35ÝÃ¾wmAýucÒ³A4´#Ô¯°0Ë	|%aa;ÚÖ:tÜ_¢¡UGìááWaak87i¿EKcÞmç	áWoðà&§\\4#ü¬)Øü)üBÒÿt]gÝ~¼)çRK1Eò% =@®ÿ_å<©ÕL(Nd(ÔòF¬CgáÖªbU!ÌN¹Çô*­rfDfJö¡hM=Jõÿ;Ëü(äª%há8k>=JÔªùì6Põxó)kõµN@|håZ©¿Ì|T?¬ðO4GÃÑYh =Jê«ÍáÈìOÒ\\Â¨ÛâÑæë<ÞÇ	ÂIÅeó8ªæ¤X©¹WK@2~à4Þï­NyÕ°°Zìà®fë"ë<¬õÞyÅ÷;lª4Y Iÿu§búVd4<µ,m¼(¾H%òPxPNíª?ñÚÚöCQ~_4"H¼3PSê¾y¦î=}Ïï\\¬µ¬qfo3TØ6¥¢ãêSyÂYE]ÿun#ìôø3=JÇ1ð/òøás²,{L?M&È%GÿOéXg 9H&Å	èÏ|ÖØuÈ¯ \`C4fw"nêßºfË¥èÌ¯~F5-Ð­vjôj<ÀmSÉ¨ª5#ºªjK¤ê+/¸çS$¯*6ú¤«¥ÎL_;!øx=MT>æ¡døD¡>cü9T	qÃùOåA.qFXhá®(OÉËùÖ#GBþé0èo¤WRÇ×kDvY°¿£Ûæâó+}°U´72½7ªÌD\\-%Jõþ	J÷+Ãìz~(CË±iç^~SfÍv8­ÚøXlF	°<Ü%=Jhýö'u¢u¶4=}G(£èiÈ=Jn.hî'npòÜQÁ®~VÄËôåÃY' $v¢Vº,ã¹H ¬6îÛþ÷.ÌòBCáò0Cû2®[ÛóºúÑ»ò5Thzá+×ÍzAL¶qjTi~á!p;WÊÙI%N$=}\`\`í{ªGº\`Ö]¤è=J+U=@8íV2T5=JÜcËAw.wzq*]z5#/u¾¼´±o_³êí78F&·I×èêÇg6´]6µk¡6óW@­ÚBzé>µK-ægt'Å¯ÿêCuK¥@*J[üÈÈ¥Êùã¬Pµ]fæ/£(ÈCf©³3 ù§ko4èîÜÌÊKÞ?-9lk¥­¬(·p¢­H6â×W=@Ä;ms¤û@q5¶kñ6,\\§»/àÚ8Õ'¯eP½GMÒnL[Ó,²"Bvô&ô6·§öj[Ã»oZä@qÛs6{"É¼X	±úÊfnÜÉá·½Å ÖäqH}Û=MÁ¨÷2·VLå¨µÏ75zÃúltèÍÞ1h8pò@ðæ?Ôña~,ãT=@û/É[o:vmd=JáqVï÷´I©}aÉúwóéóÈÊ=}Uµ%Bàa]R¦n6vEºþÉï°[NOÊFÙVÃÔJÕ'~Îýà>.¹h¯êØI­&É=JØxa³äËvÓÏ¿7M®è"K!RðwIÝJ	ÄãÖ¼áVú&º8§=MÒ6CíðWqH¶ª0<Y$wçÍ¤¯ºó:K6/¹á/ÝçüÀ£¹y2¦ðüYUÿ¶ÆPZq1	¬]ÜU	~ÊeÔºïæ´ÍSk­G}vËN=@õñßyaQ/p¹ ²qsGo¿Ìó¾§]Më×°nª%½tìî·ÒQ	qk²#úÀèü\\9|¿õöø9Rk»~]À¯åªÊ¶{±_>ï3xÑ"\`¦]=}¥ÈÚPR=M®ß-ó6é ÇûÆ(%c{ÿñtÒÆñ¾Ê\\©IÅ»oóéùOCàh=Jsn #&3÷ýIlìÕiðigô¡æ³3.Ø»NPÉë9oH}{(%)å§;­=@FÐÔpiè=MÜ,w²ù$.2ÓÿwóÓ­0Òf=@.SµàïvÙ£=}ïõ$f>äÇÅãX´$ä÷ÐOMe®<¶éYIÈÀ]tpOvE	/®ÚF\\Z¢iÌ6PüñòS2$WÙçYÝÉ¹.¯ù¦Ù~Òò#WÖyþÊýáêÅ|*YÛöµ\\ PøWÞôÀ,«½/ãôK¦ÿä=JelD¨=}õü³-ÿ¶á)[æÁ¹:+?Om·Øçl4i%vµ:÷Ëqã<V¦æäcÃÖÅMmôÞW¿é	®(ÜË ®Z#±éýÐhEÜùè÷ä¦=@ÚÛR6||ML·ü@ÃKRNäµk#«¢º;räÎ;}rk¸ýwÀlo«/sÄòZ!Uà©M.!nçÑ>c±K=@fÉ÷´j&+£¯!Zó@MGÍ!gò.Å=J¿tàó©@ßS3R?Xàó\`°mF¿X0oPü£×n¡8µmlÀ\`îa{«t6\`ü¯TGè!¼+ê\`õ¼	ï"tVç_ÉQÌ5ÛvùMMä-öuú:O$Ù9|l¿°µÛìÄxr	Ë³dQ³pÓ¡o?§Äÿ­Á>)Qùcm$ßRõ±ü×àò³0né§ÝômÃÉgj¯ôØM¼§ñëF§ÍÆmÝNÒ\`ÈÍËUû*¢>¥þ{ª~ÂjPrd$N@'Ç½ãØ26G j\\J£9óZ-ÚS<RÀàØ:qx ysÞÝttÎÖÎXÀ;<OéapC©çøÈm°#Ñ:}c9M'òå<ûEÏ[£"Ëä3~ëheÛ;¤¼qtËoÀÅßÎW=J¹þÂ?sP+2ñ»o+²gÏ\`UìÒ#c(¿í£ÇcàÁÊfÇv<.öÑ³çÄæ­ÁÐ¨ø§¼ù|â¹=@q=@I.k°)k{Ðö¹sS{Ö!¥h³:<ü©üK§{«¯sf5Þær> _Ø'j+Ö¼ý¿§´°3²$cKäè1¢Ú¹¡²:Müg) mEÒ2=JZ\`Kõðx3ÈÿåôÙeðåHD<]H/õ&4=Jcì¨\`ùóæx8¼MÚØá÷hÉÿ4Æ<i¬D}'Æz7&Újnt5þ!OöO¹0h´Z8!;÷hc]J:+ÊKSÙãÓ·y/}\\I»-°èÇÞo[ÃÐk­®-Äß6GCÑoç<ÇÄÊ3H°9*ú¨S$S+Ö-ªÜHZAö²Ï.©;=JËíH"ØFÞÕ¦?l'0Á	´1ÍEµ¿=MuÅ9Mâ¼jþ9=}c°UôJ6ÿ}\\ñÛÿB¤ºp~z¢dhJÛqX.3?ªn)[À]ù¢T¡¾èzÆh;:ês¯q¢òºË.ÀOFÍ³	ùfÊn¥ü9fÅï+©­Fx¦ÌYßÌÏ.xEº«_¤ªÈ¹8÷Á'ú¯ïp¨Á_ëtÔ½K²Äþ5âûZéÅ1-Î«Kÿ7Ð+»SÃó&Ò"TG¾*r²u_¤h¨jØ¼µøBÝ0kÍýMOÚï68îk'zK =}·­$t1¬"dÈÏÅñCÇ1W!q!	/Ê&æM-­J7:èüªK.4c+B½ô7{\\oÖÕh-ó¢»S7zð«ßµZ:=JºÅ¯lþëx1>îK9|³Kõ¥è<èVzÛM«nÿvDôÑìÊÿm¾ÛÕ#+äRo@Ü5Å§A9¡´ñ¸^=}"u{BÓ\\ß¢m-h®\\"¤¦xÉõ´2ïQYñðFjG½§mBsNGÞ."A¶,9]fDDn7f¾ê*ÉéÄäÂQqJH­2ÄK=}1ÿH/fü[R¿©qm3m=JfdØ¸lpÂîôÀ²MöOù4<´Bt¾£²gÔ±ÈxÀÐâ jä°®*dÁ­J·=JÐQµºFÔä ó+XuVí4#vJ¼ðÆnQ¨.V	;©å¬¹wk|Q @+qÏÒO1CxSSÉ¼Þ {_l(\\U®oÇ6ÚIäWVÝI¶Ë§T|¢<^u>Â»Ãà d\\\\¼K@.'ªaËUËÊüÐ«QÀºf	Ü6Àsªï#ÔÕ´è¢9\\¼«­]SëÚ­ JÅÃeDqOáTV}G÷²lÿ'§Ó{/bÒâcu²Ò!Ræ5´ðvs(áútqhÞ\\BrrþªíZLíÔò=Jºco^ã3DWc=}¢w´íçg5^>@\`wj}jÉa+ÆE(¼à¦o°®IØ×§Ê4ÿL½¿iNÌk^ëÁQ¬ÍuÏãÈ×2%à¢XSÖBp}ÈR«C¾ªJtÞ?®ìOíº§	m,òiT"Làuæþëå¼økF»ÛxdÑ}´¥cÒO^¦Zñ7e°y=}=M(ø4à87ÐÑ8¼t>µ	·ôä ò¼o61fâçÚP«ün©Ir2Y|\`ü­|ï\\SÓd*8èöÁÄV½Iu[XåðÅÐ¢xÂøýtD;Vgÿ´e=@Ý(}µy"óÚnÚ#à> \`å>¦öî:ëÔø¬=J1<ÊE.£ñÊ3Wñ÷Cwnéý¶«-¯5à«ËýnÚWMMYÚ=@­§ÖDÀC°,-Î×SR2 3¨é;ýÍz^Ì¶æVYYh·äXJcÂh ³w×DÞy$=}Q_iI{;éßÈ6&4QOáÃû}ôßÚ.ÎÕÃ5!ûá#ÚD%+¥ßé(Øc*Gü¡ç=}]äE'=}^;	,¯êõ3:Õaz½ë0ÉÁ-R¨äc^q_q¢eì®¤RÈÈ_.ñ%¢³gµ¶øü8	(&ÛÌT C3%¬ßù¤ÔYóRe}o1ïMøkèuìí0º>ae	÷È\\qN¯QGÞ$Õ_qÌÃ{Ò81'ÚfX{=}½â·Õyó¥Ø¶Ù¶õ2¨h©ðkÏmúÁ_=J|÷Ú%cqðÓâ¼­2<»åÙÅÔoê9S¯¾aFÓ(#Xü	}<Öæ6)è´bÍÎ?Zú§ä©BP£übÅLîb£×IãÌdqâQOÙ$J¡ÙTfx3¨Q=Jl6å¾DOT2"]\\ýùµÝ?·®éFMVi@Á©ùù|üó¸Tþèu×òÚh>js[FE°ÁèWNòL aÙÖã$Iâ!JC¬>ãu¹Þöõt?©ä¥Ìs«ÁÏÃìj.:S:±ùu0ÉqåíIK£üìÊpÕûûQÖ=JòÊ^·3r\`Ï\`¿±¾?E1=@Ü3ÇFó¶Á¹5³Ä³ã=@ðMýð#LÞÎ|[Ím2;=@y¼t5»¦:be=J=}\`ò£:£*ªÏÏhÇWT=Jæe¦<ÿ·Æê\\è¾Éýû3\\ÞÂbÈ®;qÂLPûE ä²Jö)ºXõµ\\ÛßõF0³'²âÐ#\`ûíuº sÝ^æS.n®vw#kuë½³«À­Ä<uÙÊö´j ·>\\så¾\`SãQ§~à3WÚá¤¾ ÝìPKzeWkÿs¡ò[^îÍóùB7iDmrL­Zh¯>»ì×0ëq?@®ÄtV¿´²=MN}_;CÞÊï+ìpmí40¼mKý\\	¾å(=}ègmHRÉªié^R]l=J2(;ê¬ãÉ|½kýçp=@èN3lÞ.ÀAÄyº=})²¤lð%oöËô5äÔ>ù°/òKK9.1 ø=@Îcu×¹¸L4õ]AÿmVÖØÊþ/Ù! ÷Ë7i¾	ædÕÖÀ¥ãl|½·°#Ñò+ÏÏ{Îø?!º0Ù¶©d×>e¾)v0ÄN@AâìóÂh^pÌÅp:(eû8ßÂæç/4&WI Ý)Øw¹gª¡4ti6ùã³ì¬?XT3ÿ¼È¥6Á(CãýçÿÌÓ°µÌð7¯T=JïÕ·|q:Åd¶BVCå¶)x¡A¿i%Q¬R|ýÛLiû¡ª@ß_A@vÝ©#²ûzbê®Ó3ögò¦ÎUûíHüdc­ûE&=M9Q[§¾ìäãÌ¬åµèÌ Xµ1I.WÄâ5dìÀ³zHOýP?å=Mç­Êz1bÁ£Qr\\A««uëÄ@øöÉ,Ù]§Xi-ît¿ÀW%dSÕ_òõ³Eú!\`¸3ùØ¥·áõXh Ã÷±iM¼´GÌåHcRh8ú¸©'ßYCÆ=J~p%²3Ã§7·=JÍ=@¾÷+|áAæ[àsIÈ/DåÂ¦üv9®ÿ$[6«£LÂukM¨Ó\\Zÿj^UVPþ9ÉòÅ{Q,â?ËÎb%î%P¿ûfïMïÄ#Xý´=Jº±x=M=JVëÊy'âüE3°a[WÊ¯$2âúyXÕRv0áòÕÿ·ß=Mx4u#¹ÎÚ­dÊ×¾7Ãè=JaYü¬åbuYÉ]5Ú@þï+NÉ<ò²cLn·Í{ z ÃúÔÞ]bÑXo#°V¾ûqÜÏ¸PS7Ë¥Sùp]R#Ï¸SæçËwPA\`wØ¹l	úíeC;#®sh³>f½YÉvýZ%Åµ¨A0gÙÿÅ2=}µNmÅÖ#¾$Áêê11dcL ]·a&­·§	9¨;M·9;õF¬T¿bß:-#Â¡ôîHp=@"5,æÌSñæÜö´?Ý?)¬¡HIõÑ\`©#8{#Ø;éhª¡)¨Åúíùtø¢ÀÏ%#¦«9'\`ÒAÆ¿ùg	¯Úé3%eK)PlÇùm\`ò¬\\0³´çÃs²;Ùu±­jÎr)ÿ»ÖLKÌªBëPVYèaÍäY´4$ÙHø¹ËÕr%Ê{¾ðè§?	øÐS§ùz%Xü\`[¾Þr&é,=@#Î*yõd#â)¤zªõ	#¬:$7÷öµa¿)FÅßqäJöo>¼KE«ãv=J-lØ(VûÆ(­¦­åÞaÎà7¥mojUÂmØËÑ­}4&fË1qSfrV|&ï÷=Mn÷¼eÀ;)O)=@í­!E!ÅH|ëË=J0ø_±þÊíÆð£ºHÏ@v´-YãQÿG+9±ÁR×1ñ/àõV/~å_»N¦ã	Åx;N&s÷Ú÷Zti®YöÍE&Zé.¦ºì°dhÌOÝ6"ÄñÍhzo×Å5èR½H)E±m>¹#ÜºÞ¬0=J|+ìÑg2ÅÕ 2íïå:(tßhÚ§!Û6æÄÜà·	5ñV)K´ÓõíÕãûÄ·Á÷&±~G*øò¥=J´C<kZi!8¹"/CPÅzS"/ÛâÎ½±ýGrxRÀááZëè¸s±ÿªA;Ú	=}föaß²]}"Ûy=JÂogºwßØºÖ;9Ý:'í	#ÈI±ûÜ ¹ÒtÊÃ+o6=@?ÇXUVÎÖ×T¢hnÖbS,Ø[ÅS²Ë«ÊuyËÍGVSV?XWÂ¯SjÅyÄP%ÆéïD®ÁÓbÔçVøû¦ôWÒR|*q¡ðk©P7­Ð.A(IÀVÒø©óh}Å=M¯!L£¯fSR)qûl#±õ¦-¢»½W¤ÙÛÈL&)];vOhHíÉ=}HS©LyZÃu#!bá¨BÖ|äMºcÕ	%Ýr©eõÏ=Mj)©1õ6AU´Á¨wLi=M<Q2/ÝÄ,-[çT»´^f7(ÍPÌ]&Ó]ç»ÿiM"²û%YÝE¦\`_ø©}x)ßýN5à\`uj|t|b@{§¨Übv@ôUo¾gK¸#ÅfýÃFHÍ(hHçKãî*á(=@	îéì8æÞ"Å©¼ÁêÑqß)a¿·¤>/¸wfïwh7y'|»¯h*­)sV[Ó¶LÚzaR£¯ä;h@ð¿¾L}PsÓRÙ¹âÙreeM«ç_0à$ð´ 2DêTì$û(ô$SñÿAÙòKºÓv¶:t	=}Ü¿z60^>FVP|1²já_ÏÔßDnW4/þ½=}êQwIVGå=@,î÷ÆëfKW\`ñÚ!	!OÆD5Õ)8×=@Àñ5-Ù6ÌÐ<z@µp«Ü?zàLØ2)Èçá8¹L$°åLM»³j<l²:N,sA­åååN.y,n°*µYD;ÀïÇ¯¯ï_	~yl ¨§%çØ!Éä°ôv¡ÿÓd¡îºÏ¯EÜòÔ716ä´KufÐ\`NDÜÌµq¸ô¬(îÌj_ÜDÒûÉ!v>½²[X/;³û:Ìs@èÍñn§%AH»5ØpËKê=@}ÂâÖaDT[i±.óhx«R0_üPKnÓüÞwÿWÞo?>¿ù)tfkü$jùð2<nqhgÊ'Pú,Ä6=@+.NX3xÀN9n?ZE=}	ð¸§l@=}à¢¥Ò×lµ@1TÅ°XßPÔPó[¬[>,A@;ÞøÞ¹3,yÊD3I¥%Âªwv=@Âº[P©]PºE=}éE=}cÐ[[Qõ¬¶3ïäëî&åcCuäJìP27ÛÑÈÚnæe*³nPa²pR}Ùd¬O+Ø²¥Ü!Ëõ^+íó:ÁëâÛ_KêYçc/O´=Jü!2Î9ð| ¡8Wàa*­dÛ¡Ú!vOÊÊIÚ¥YDhqÑSÕÙáÅQeó0E£Êëä1ÒvxÐM=J=Mn}Ù/¼nü´*Ä:»ÿ^,ZVì3>ÔÅÂ·úê´ò_®TX<îé²È0ö5ìß­sÕÓJíÆñ{ò<41xoûs«ùKæO|jQ8,ÉÄ0ªjÏópê|ÃT+·]þ}¯¯¸CÊQlãlQ,?n2î½ÞµîA=}¶ çe¼GÍ¯ ¸±Ï»Ç¬µÕbu*:,±ÈÄÁ¯àÄ	¯¶qÒïÝtPm^{aFê±Ëb5l=J@gBû?à»úQ"})=}Ê³ú¥kþP=}Â8¢¬Ä3úFÕ­ç1[Øéì'Á(LG®.,ÍºÁúX½G¶/Ü=@ÆªÛA;È 2.D¹ioEi®«'=M0örTé·L×:KæòÎ6ÛÌéö>ä«6òG'9äþÚdª=@"F­ÅÓcv:¶	u»;ËÿÇÓK|Lx<W8Æ¦[zÝ$(=Mm¸ÈRM»ÊU^ú²?&2CEi²3si2ZÃcqØ-»/¬ò­jâLMìÎÀm*ðvYUª"IdµFkü:ôÒýeNmwºnµS+Üt«æêìÄm5HçPs¯>hßxÿØâI¥WZËþ\`x]¨Æ<zó¬/Kôÿ9Ë­0³­²k}ÐpÊlÖÎk'êø¶Ý,ëw'²±PaÁGKx½2q²Nüì&m>¬-6å-tº­/î âVû&ioK:Ë;@KäQ³#;Ñ·@Â¸üÅ=M®âÿjáÍ0ÎXuB4NQnMàx©d\`²þnÀ.¤[=}óû§ÜÈºRÆúFånD6,Z÷ÿÚ¢ý°]JèûªjJ3ôaäÈjüú°¸§>}t6°Ã²*/RAüï5y<úÚÖëOJòJÃïîÎ³#?ÞØAÔ¤=Mzò¥+hq¶ï+!+.o=JwÊ°zîÄ	äv\`1«=}4z,ªÎjã´ßÎ²Ié¶ì¨r®m:k=J7KìÞ¬E¨ ÛFvûÚÿ±(1;½/~¹ª_S2oN{;ª®Û+«Ýê7L=}n.@+å­	Úä->È®+ßÈ³ú¬V|Ë[¬Ò}0ÌéR¨9v§om}¾Rì«[xÕ©'Öoî]ü1å¼\\´¼-Ð@®/G«GüÜ¤%»jfJTñõ®îJaôw&Ç+%êjQ9=M J	âÀE±Rú»eàGVooÃÇÖÚ¨F:Ä@,æ^>=J]w>D]çµ]¬eºÍ1(KBtºyqFª$âJëJwá¹4$Ðû¸IÙTýß	ë´ío&F¯ý]b(åå§7ÜÑ	 %=@'ýxìdä§°ÑºÄ¶[§rØ³Õ{10w¥S+Dð®¯a'«ÜFÌö;²êWV3û=},E[.­ÛtKQÖVÖî3ü2z>·}.ÎPZa29ôã"«V7·Q: ÝIÐmh«ÉFq^Td+>ç ª8I+j¢jä¼çFÐ:-ã¼ë¯ÚKÛv-=Mï?þº=Jç}Û¯´úiò6_gpTjÝò¦7ï=J'JÚ-ÂÙim³´Í¼Úõ¹ÏDz..È5­Ò@Ç:Û6ßm¶(¬KÐýÚ0=M=JYàq@.÷ÌÂÍ¨=J&zÓ©ÎL/wÃî#´Ñ4c4µC1\`üÞ\\êýwûñ]PÃïÂKqËs¬bN~¸à ÔM¹ÔC®½µZ\\¾=M.wþp°£Äéà5KøJ,ÊàdÌjÇO¹:ªÑ-FÃ;zA uWÞHÛH^ç<ªEÃôì\`uxUCWÇ{é­ÍbvÛ½ªc¹x/Lñïª;JfÑÖHþ¿w21VÞ>^²ÍlÐü²üæ=MÚq2xeØÏEoû8kkRwA13üvºò20Jjýò]Jï^¯µÕ±²ñq<1kÂÉn¡/¬ópÎu3zrån|ÀJI^×®÷{¢d~9\\²ÕXÌ´Ê»u¨µvg=M4¤,R®=@[®l0ÔA\`H¤2/(/ÒÄoÆ:³È=}Äe¤{,2µ0ÕZq?0G=@fî²n9²¢ÛõVz:;!áëv8¨Ìß¸ÂnyÐ3¢­#¬¯ïBPéÑa8ÊñËÒí2r,¯a¾bE¼¸°=J<lù'aÑú)Ó^S=JËJ;nÌ«nlEsfÉWò³6¹Re÷1*þÅS¢Ó·#aeUÛwÎL³Çëh³ûRWgàßÑSØ©Âå¸?ò¯½3)p$Û·ø¼¬C_ÃB ¼ã<ºßrzÃÿÌDÎOHMpääjÀy&Ö2áJW??ôIxäìc§öJÄGp6®ÄÆJl±}i´<_hÖdl¼Öo5@t¥\\çö(¯ñz2Åúvå+Úä¯gí2{Ñ^?Ã×¡Ý¹ò¹ ;Æ£.ìà+D=JZl­n Â¢©¡tî±²Ð»Q¶Ê¬èñv¹ø¤¾Ä2¡©>¸=JXÉRF#<"F3:r	+ÖlZTVY£öû;5³'ÂþpScØýÚ*ùÕßÎGu­ ,F²ñ6ùòØÅ+( -=@äêRvMö(,.Z7nÆu¦=}X´=@ÏjA¹<kô^Ûì-=Jº=J0/IÓr.ÊÇNRK­'ÎG°ðG6QãEâV¢Mx½¸gx=}gQ¶ÿsXv<o6O«Q\${Bü_+0S¥sPÍ5Zõ&},®ö=J8)=@Ð>e^ÅýXOEtp^H»-ÙL.W0"k¢MÊ2÷+Z´ök×çÜ=}Hl2Ø¢âe%Ü9ÝãÇ\`Ø×õ­SÕzØFKþW:Ò:$ºH/;ÙN®Ç¼Öëûº1¹0ÁT²ÕuNGî[w²¶7³J]rî¦ÁWlòlÄ×³#_k½ ìéö=@5æ<¸f¾×ÕI3£ë1OüiRàU)Fn-ZuF¾çýà1cêís´Sâ;§)Å¢p:8ÒM¢©¼B3GÑúèÉj­¾05g«è©f+$!QÂacö\`±>¬¹ýúá2I_\`ÍWé*#K|Úä*,üèsAß;HÃ«<ªp]Õ^Óg?îSåéçÔÞøäpPjC ÓÃ:Bæì|lM´H<ÝH¥0á¾Ôk=MÊAúKöh®c¯Ú=@§¨2ë´£ÚÂ*Ø2£;e?Ug<Û}GßKLNHN:Ó2l·¬DÌ]n6Kò1³,TÙ=@x=JÒÜmñ¼	¹úÛî!úÜËñ8Ñ¯¸ÿÌ2ïÔ.CóMn=JÙ2K0ø Jb*ïXÃÈ²WA@/Zçd;?Q¥¥Ç2Kåö=JîîPq­3Åþõssz¹WÙÑôaØÔÆ.õÔ:2ñêªa>KSÁ &ë.Àn*NWM^Q©;¼§º¥4$R/¶ÊZQÖT¹Ìi½lo9D¼Ôü%âá.!7µco½Q)õMsXs¹®ª9'=M»NRjRl÷Î±(¢N4ù¤¸CUôD%iÈto(	¤ }ö)=M[Â]ßñ:U»ßÎ3«ÞH½@DDÜv7¹²^qc°	0Ü=Jsß	¨0û^ºný#Á~ÿÊÛMÅJD(Äõ¾Ã ;LÖ_ÄªCVÑ²:íî®y¹l;Ñk»ÞÅÚÚ/!·ËP;«PVNÕNð<<Qk±Ð,§ãßÖºËQB7¿Ä^r®uÕÃ:H?IÙ!JQÞ¹N=}Fø^~FÓ?Þ:Ò>S	À*U#b¬lÛ!/]¸-ËÈÑÒOÈ^ÀÎrõÐpÖAË\`öý3ÃÝKþ{=M;4]Z|zá<ÑÝ¬ÿª\`-Æ\`Ðg\\ÂAWC­dnz&Jüôòm÷"lT3æQÛ¿dÂqý/&Nþ\\¸êpuµ'9;¿<¿d:}±=@©ªJaj¢,ôA4_¢y®wúæò?w2¨S^©º8=@,øÄ~+®¾¨(Kmê²Uº*°7i83o=M:FCDF¬] $+!Tqò zÑ³ÇúÚ Å²<=Mì¯8¶«à*z++w/8Ä.¼:S¯à-u-kÕcUî7N}@»nny<±Ü=M/eU=J·øeóP2ör¨QKR^+ÒzjDkSÒ¯>â²)PÏ¬Ùÿê:aaç¼Û©ú;-®°?n5&ð=J2Á®c@BR^\\6[ÊLQK±=JGV#Ë\`Êæ8¶sÕ*cÈAéS$ÀjÛ\`Ë´á­PË~,ÃlÓ.©S\`Z.è´'0Zw²ªÛÔ5Fmx3/KÚ«×sf¯4VCçiº\`Ä=Jñ|zi©<¯Ì%*ÎwÛs"î5*¼N1=@jÎÒüÞÓ?\\Ó4pºÔ²@­=@jM»Ê¯Ä^.kú®³g®²»Äj"^jSLoÒçhoÊ!@æÊ[ÄD¬lêÃÇ¹l1Ì:71%+MªHË:ÄI?ùQÈHv²°{5{å3®|lJínY»ì´0yxº4.¾¯Ø@p¯bÄ?ß±¤ÅdzM?R8L\`C¯NÊR+½R.N>Ù=ML~3j5ëeYÌ-úrN-fâÊ²ô½Ör}Fßq1<Ì,¥®TÀB=}mÂE1°+zíÜsß>Ð¹º|»¼yÑR.b²²o=}©*sö¯ém¸áQI>¢Í»ÊõN¢dx.	m2æKÃK"*¡çp»9^k?C 5ëã¯¾øN¶^:¤<¨,µÉV	6îÌNF¨;¬zcÚÚ"{&>túÞl[qF¿sÃR\\ú»-Ô\\.ûy=M¿0¡%öªeÛ	ké/tb=@ÖlÆ~´ê°Ëê²O=}Ey´nüT×ª¬øã7iï­Q*±G%3ZÏ]ú»-+]<$¯S»¡@nßÏ	6rü{´N:îg¿¬DÿSÕ=JêUÆNËaFKò[¯+. 2æÝsKy_ÂVÎ JÙl=Mþv½=Jmd6K¬ZÙ¼ÛôkkÈ=Mâ^"3ý!N²jeõn]´R¤*QµPµÇxFwn·ý*üZAØã³¯ÉNí>(íCaBD½è\`®ÓËBËªyL\\÷Ø,=@8RmÝ§þB¶È÷¦3sXÀG;9zÒª]o	ê±Ý±¤AÙ²Û¬²V³o2_{2h(ªÒË×HT{_,ØÚ1,àá­ÿ½6*Ó§¯x>k*]T{X¶=}úù M164<ÄïM>ÛVÞHµj!©5¡l°LEyõ8O'MIÌÀ{8®ë¶ì©ôÎ­ö4©kr)¾9+hSq<'+j#i]°üI©ø°zÌ¾-gn4Þ©öÐ­4î¥)Æ·~ ò«®ÉÝKEw©l)cÅáÀ×e'«¡iõ×v©´'\`.ÏFy"iõÍ­cÎé)ÆWÙÀ×c'«YiõÑv©L)cE:³Rq§$-þ©ô@¬MþÐiÿó»|ýPe=JÎ=Méêº0£h´361[4XÊâÇ2BowfQ7w=@¹ÎKi|°ì)vBÌ3)]²P&ùKÄi½¯ì)v@ÿ)eÜê	ºo©q@?)eÜR%Iól6Àe&	GVlsL8«ì­Wi°vV:vÈ>@Æð;ïlÉWöJK6®U¨Ò.¯J¶p:6üµÈ©ú\\JÒiü\\â&0­Àë¹Cv0©ö=JÌ'ñ6°æ)Â«Ìãýº"Á6 jÌu<D¹I72x:­Ük|ß=}CÔ&04xs-I]bCT(0,cÍë!¹Cv0Wp!éõ=JÌR ¹CÞ6¯)[­çl)v÷Àv)WÂéIý:p-»:8UrRrÀu=@/ª[LÑÇ¿úL$2	8¶»2ÞÜDÌ¤·ÿ<Ê^®p!áå!ê­ûæ¹W^qÚ¬0¥P=Jî+LN¬Í|VìJSvA~+fÈ"uÌ;anï.Ð{~/Ü=JoÌª×@Js»Æùk*K ×p³õk,(\`î¿kÆÖ^i+!N\`mï0ç ¯ äL2"Iñ çÂ§®jRÊB×îIorÞF!ÃîÛ'³bPXªî¬põØéoÒ?çÄG?aåé²p:¥©cbr/Ã/<Ð=}t+ö¨d-ßÐÇ?ÿ$6§o°nÄJsåm@¡Jx:¨¸ÊJôAË^Íàà¾aé!ý/lP4J/L¸à"iþp±½fõ@j m¥_CØ'ä=JæD4/oê:%ÙOêÿöóî5ùÁMò3jßJ+Í=}/&@QËè'TN¹i>°0oþ"z^JzûÖ¼¹Éá©&&õ(½Z*]®ü=@rÁ´z<úc+(j»pÚÊV.°Û7¿ÖB!2D-ì:ÿ=J³û	³6£æºÙKHj®µ2­Ä+Wµïµ3Ý¬½¶®R=}Ý,îms:K:ÑÅÛAêÜ/&Ë'*tT°EÚDÇ½.;fùD^(²´uËy=M0ì£ò¾7ÇJÎ328GÀÒkF=};µù ÊD©TLbgWï"=}S^®¤®¶YÀ]¸J Mw*K»2ÂjÍÉ*öR=@+Pìn13§I6Lå]0¶ÚÙhWËÞ^ýhvÆ<H^CkøP6\\2È@ìL­Ã:j+qÊÅÑ'kÄ3±@=}ñh|LZÃÌþ¤P²mY±ÔÌ¸JÔuÚç~µWy$Kõséäjiµû/ÎZ-û2DUOÊï[#*é;ú{­p¯NÿÇ ¯ï}üê¼sÂúW!®8°T26rîßP®u·ÊK[Ly.'²æÇ9pIú¼Jfñ}}Ò9Äl­k=JF­$¾ÿÖ.mÍ-Äz_<#ÃÌËLÎ<¬7ð5ó^2dOÔR2­özÝðÖzZK"	@SwëN~s¢]IdO\\VôWNõJëàX3_å¢frýOûØìW|»W2ü5<øû}Ké°X³:ýMJºÆKßKúKËlÇÜèÛÀtZl<ä[_÷_ÞÆ;¨ &rÊ4 ÛwQì#;wfU÷]5v}v}úìÝø=}Û]Ûã³Em®:I;=J¥2õ^vCúaArè ¶Z1>Ë§+IpD.9Ë{lè>n$&<o¬í!I®ª®kÂà§0;Øz\\L:Êú¾2Jè?©ã½®¶Ë@'LX¥=@~I\\Ð½ÖõÁ_ç°â=MÜ=@õ¹õ=JÜX¥Á÷*N)Ó:qgc]õ:HJ´* S#Á¹\`¼Zá|vcWHH³ÿÒÛSÂL+&®øàü(2xupläyx0,Å½ª_Ì;íd/|CRñ³*êu=Jr2õò:,3­0´>Ö\`¯+3ê^~XÐSågéôyU+GjÖZ¿ÃÌm:Úo¬Bt®p>"Jþ*¿K8ÕvH¥	1íÏizjI6&L¦/{6Û[dorD"ôm*ä~=JUa0/èæ[P3w¦2þ»Vo¦z¼ò{ºb;ÂåVðÊ²åLÍDÒ2«Z~§=JÂø3F²MºIÊW½8èL"Y=}Û)oHéVïå§â2¡¾Ií¯Òï¯Ð?[p°§¶=JÀìô+eÆ§÷øCýø4õ úÂ§u:C1­ñ-ý¹ñ¹[»§5¬=}üß:Ýé²\`_;àI|Õ³Ð_g<~ü^y;NNñå´d¥ÍÁ÷õy¾?ÂýÈ+]Xý¬,µ¥®oï2÷Ún?@ÔL±K$ìjx^o6Ûº¼gòJÞçÞò}Qw°kxì¸µ*"E9KAÚô>?]%Ï­ßg/v;è3~ÁöönvàÜ ¾¦stl{¶Jj	úãíH; ª:oJ· á.#L¡Zè-:Æªp³d'}h÷LoºÍg$À*¹úÒiÊÐj%Kþìg¬¼xLLî­k GBW¬ÿ-×-ÛêøÃW*Û§¬Ðç±bB¬ê&ê^Þ­lo~IrÐÓ-[jeºÁP¥ZgÖBíæ E(øîIGÜL³ºíF­ëwNï7»uôçUm_³2½e5h}ÚÕùStP;Ô6À/ÖÃGf|=M%%=@¯yHW¢QÑ¬ýè®\`l,áî]Mÿ6'îa"Hc¼pàÈ$Nÿ«l1µ=}Óp¶b#3ãcsMq;¢yö¹DP5QVa[i¦mTIgý¢'Æ¸§1BåFã0µ%sÎÿ3$ç)ç|Ð){STCVJ°O,Êð3¶^ý=MneHEGÊé3¸]rJ¾²Gnz(7¶_ÃX½EÓÌÝ¬ôÍJêõ³ûö~Ü¤^Ie.Q¯5¬ÛÙ=}´l¸Y«ÜòÖEÐAÊ.×LpÖD{,Sh%x=Jd´e7¼§Yã47Å§Ý»;Ènì2®fpÑlýJ1ËÁ­åOìäË»òZ¬Â,ÇÖú(Ú=@ö,¦Ö_oÖ]7m%ÓëÂûgz 3uù:÷|.ë è³§½´Ð³ìlF;#XòºpÁZçkïkñøb@±.ä7~÷LJCÅ_?_ØK ,×#-GÑú³2! :0ÿïS;pFöJ>Ü; ¹úüìzéáz¯«aÄºU¢D4­±RµÎPîÁ«æ¹SFI$­-kù¯w.Ç.]r²ÃÝ?ÒÚÀA[æý¬FÐ±b:ö<¾´>ê¤²M¯.þ»GÄ¤²=}+»\`9±øýmÆß2:ÀÀR1|ëÞ|Þj=JÏ*­oFu«Ñbö4£5Ë>m²[SæFÏ¯ÁÌ?ÄÝ>A×>2ÝÀÌgWå>×ú|ÞloS>ÒÆlÐæÜÿÍ¸Úúa[.±L}Üèl%t¢ñ²¸</ÜÛ±gJ=@t]IÌ8í½Siî×þÃ|Ñª)ÏX>;Z3èºèÚÓÑ½ËR5Ûó:µ²z¬ÞybJP :Y¤uË16=@:9¤uqÂèú¤²QçOhú\\gîµü8u5ì·FRö SHZÇß=Jú´Q´Ïm¥S.E²íÆÏBÞ|6KhcuëÄÝ>×ú|ÞlÀ,¾<,QÍ:Ö|¦æÄÍ¾Zå>Ë|RJ¸ª@îA¶kz²Ê9«03=MÝP¾ÌÀqfûo%])åÞiý¥Pèª³1¢¢®Õ 2;CFÏï[ù2	éilfñMî=}ÝH+É[¤./ÿÌqê7©¾wO´ô£²rÈ ±¢´É qÞâÐêfqWë+&¬ï[oe\`ñ°ÖA¯¸3Ð@7ÕKtlì¹²ÉÚJ.Zl=@Ì(Ñ)2svKèELe®'ÀM\\l¡ýlPy.Ý2o¢;¯½ÑÌo.ùb2ÝGâIxèÚ/¬T+0'EÕ(ä>5&1ZAW5ø9m¨±^ëi»øTQqlWð^l;ó<öÐRÜv8ØOólb<8Aö@ªa/3û=}"¾ºv­´³}>UpÂtø¿âVl×zªB+ÒYNyìö~P¼Úõ;(PE®JÞ}¶.ñBÎÀA(à. KlÁ5Û¼ësÿø¸¸»ÝÇW÷!.-k(ºc­Í1{m2]oI<´ªù·ÑggúþÄ2@hÿÜ'_/]?AË3zu¨>iöR&ê§M~¢øÖâ-hÄÍÀÀ/9ßI/Et¦é5ÈM(dëúÀ!qºp ¸Q£2SsÝäºèÁ)ÕH0MM=JÞm8Wã½£TeVì²ÕìÓñf4÷À9ÞïLY&´¯²Bf,_We\`% rÜ7]Ùv®Ýsm¢4ê4®X"Í'²Å0=MI¥ìóºW¬Bîwmî"?àÍþõ¬¹ÒqlE;Ú{9®$¯[.ç27¯$54®WÝº;<ì®ÖZ!=}ó<}²+õÅæ8:3§¸}îìë6Åv?î×Ü¥ép;cGü¸Ùìò¨BÈÔ½Ç_]C·J	üó£w5.mYÛEL#ÅðNëÀ:hJ]WÂÊðjNÀAþºcW=Mó'ñ^K_ÿSw.=@M:Ï}9³=@ÔÙÃ¬{½nÑ=}oó Â'Û Fã)Ýñ$8¤=}Jà£Ã¶@;=@jAèükÄ÷b¶:1+ÐK:<òg*¬ÞeÄl×oôLl]>ÚÖ,=@zÂ,qÝ0	2 Å<G3W¶nÏIèYÄD[¾&ümõu:/ëÌgZÃÓkzMJ[ç=}m®°J×GÃìÁ¾2Ëh¹Ûtóf3èq¬åðtKHMÄ5\`NÄs\\ÞÌ^a[Ã<X2¶[©¢hí»ö/G³]Ý\\5-slû´ºÜH&äPW±Rs=}ª4VFnnÛºJzvibþ/{>ËJ©k¬Ò ÿKîyÖÖT¯7ÿì²¯ÙK£ÐL9,3GÛ?*/eí¨¯È|¶lß.?5a¿BJ=@7Q/>'ÚOÀ7ó­Le8çmH4¾þ,wpo=MFDÄ\\"³þØ²åþÑÌÀQY=MAÎÿ¾³öØoÄKÈ<¯	LPeñvN ©w´ÅYÒ¬:¸úN*¬3ãòé>_íAdÌ«=JÁKNY§#°.v9ó±dº9ë>nõµeFÞ¦K#Ð±.ýYÁ:ÖH~)êKKïG]ºYzê6û\`R½Ês=JËk«]îqh+zðû¤±²hÿíæÆ&onÎëþz+=JzIFdZT=Jf.\\{,,I¹*³®9oeHL, ³z=Jesâ2Í¨[Ñ*?èZÚû>pöh¶=}3Å¿b¨i,@ÊPlìµ¨+mÄJ*X,áúù=J¢§:E¯ß2ÁjÊD±Îòñk¬Ñ5ó¹4³KÎ*\\°·KÇX2ºø?Ðu8Kò¤r{+°tH¾Q·ð*læ´H444vÍäbø5b,²½:°-Êf,ªÒgÜfÌðÀ­ ±RÆ=Jço©>4Tlkk»oSØ¤L\`G¯;};L?<µ o=}<	/®:Y0?@é7rÀ½fï¢Þ!Å»3ÐÃÀM³oÒ¡1L_\\3õ}ª¡D:¢ñüæRP¥×ë³5ÑâÌMúÙ8±i$0$v]²Ø>43?gª=}e.ã¬Ð±Êsn5²|GÒÞÈÂ8TðJxÍ«´­fýmPHiéÒ¯ÇòU@t3,É+@0»-~âi(­¯Ð?ì6;Ø½1JxàòÍJÒa³mþd"råkn«²l)=@/ÊÁF=JtJ^¬¬ð(Vµ©¬úDKcú=J,xÃd«z¿ûÐî{=}ý®ª0Zz/£GoÜ^Md.;Ìf_¨êÞò´Ô=}l!_·£^ØÍ( B{bý^ªH<'¸ûbªÛp¬Âj¬¬2dµàr5[Ôò2DÝ½ÁÒA=@\\ó5ÙßÆÀáRçÕmrÛ^ø29WÀj¼LÍMkmý¿N¿tý0ù0Cõ@JYx;êVQ»LTô9L÷9L/Ìû^J·Àê+ê°Ñ+ôã684 þFk;Ó9oñ÷%,k/QÈ{*îYRb7T>¨Üâ«ÈîªBx[DÑ=MwN²XC~ ° =@VCz»,²C*õhp'{}7<ÿ÷±¬66T·§Dý£¬zF|K5/ùu9ýHrõ=}we^ªßQJR¥ÄZ¥òÄkmr¯YáðmKEôÝÜÉ=}¨ÜmMLjâ÷JÛNJCK}ÍRíì²2=JaNþQÐU(¿<lúÂGz½µOùCzÞGþÚûK·Üå#+Liëx±ÃQvÕFøVfPüuf½¬v]m¶ÏþjÖPàäêjaá Q3+<°¶ý=MRBÁlÞ71oúkêyj­1ôÔ²És>Z*2/i7'-×Mß¬ªØ®juxËP½³sF+XûC@PMZêC¯.átV4OÅ¸VX¶~ë,RÕÌpÓÇnEÃe¯ò{5÷k²×?ß×¤xêM2sYËî?¥Gkü:Ä6ç.HXâÖH;E)Fg¼/Ñ®ÚÍ¾P6Äÿ¦ÌmWOf2ëúw¶ËÇ¸Ä×ÃUîóü8¶J¨NPB Ë_Ro8ÂZ_½ßÖÇ:¯ë;%Ì~-àjOì>§«=@ºaolêäúA%RÆ¾øÁpznlßªEN+>ÎÛnù«äÁ=JYî(t5ß±6Ñ«S+&Tlhüogq\`µYk)÷çrqhq %ò¯i	ÕþNqàÄìý4q¾næ]{Qe=}Ã'YútÏ. ç ºË6s?t¸=}jßm¶H¥'¡o°ð<ìárÚµ>÷Ìú(§µ5-Ãd«¾ÜEÒ¸Á!t51W÷Ïm®ií±[U½à5#u »B¤cËï_QYûÉÎbÌ(&h#D«ã÷¸N+NÜ¢ìîT.oJ+;Ån¡[jãMø4«JMZ<øßÂr//0xÆs)Ôãt ,­q¢U*l:+Ä.ÚgÑBÍpÅGtæÙ0íÍw=M^K¤?3¯ú;ÿÌûj®ÿBòs©ªãË]5F8ópLp]lh|ÇßþìuMGåÿ5#4ãæjjû®B3ÄOEnà;Ý@:9£ò:wÔØäö?5ÁÝ@ò¯=@V´7ôdYìú£ç¶¢0Zün"ûÆ[ËÎüÀe¼ù=JTgjÙª[4²Ohw¬»:YºïúB>áî¾ËÔ@¼³­Ë@´M×_òì³N6Äöo®HQ¹¦[Æë	÷½)=MïëÐAÚyð?¬÷){ÌB*¹o\`qkêqBdlIÍ¿N*!Àp;µd%Ú²|_å!é=}| É tû1ãRvU4{­ò÷HÙ-=M§K®/lbäjÝü­=M..>ºÜØ@ßúþË.¦ª¦c«ð»Þû·¦/hGÃ_²¬V;²æno«ÿÊ7'/±¶:ôF«g!éÙR~=@cÜ"Ý:zÔÃ¯,$ÉÌ«NHzg¾9=MzeV=@[ªªlúF1çÚ©BªKb^KÄd:Àùª«Zª=}û.¯,@=@;ÏêÈ3?wÒRDSö¾@ÆZ3¿êóKÀæÍÿ-l.KyÜ±¥^ÿÞXýHNX<íã~ûÝfèIå¡å)E×N:ÄS=JËÂÌkìø]­Ë4V·Êv>Â/´{»'Wæ7ù>j%QÇäÎFÇÑfre/ÎàÜb/£ Xª¢¾Ð}úÆ=J9ÞV:ZV~­ò¨¥%>.	ó4ýq@*Õ3zb«hjsq®iÝ3¤F\`áÁÅXö«ÆÖìà<7¤ýÂz³ÝÐÖÄãz3 <*oÔ¿ªªx=@f æXOJ°¿½?ûÏïáÖ<n&D6gQ÷ª¦#züA:Ñ¤¡[XêGB2=JK7»ç-3 °æ/,MÐaÜçO3Úz>!ÁÎÛaXQO9ñDv=@5Ä3µÿLø«¦Â^æV¥;Ü\\WîZ»y¥¸Ð)?pdê·ò/ª\\¬^D·¸ªBÃÄzcî5«\`w1ïÅ;]8ÒYÖNõÔ=MÙyzÎ6Óo7ûýÜÆë¬0òFàA¤Þ+Cz{D @nUÎôcûbJá}ìï¦áôsm2sÜÈô/å=Jg5þ¤½TW¦ãÌ·[ð_ºÍ:º!Z):M&N>6KdFµ?oÝ¦l'OROÝGó¾ù¡2<XSËç¼¨2?ÃÇ3'÷ãÌÖq5ã4Í=J<ïFõoeN¬AË};ÎcÎS?½xL^CxË4SoõÔùaø|cL+NÎ)DI.+ç @T¹ç^ÕkRû-r°üJsÿweÎSkFW3Sq¶¢¹F9÷¤¹ýâØß¬mw«»¾­óîViîÛb³à²e¥M"D¶Õd$SÁ®µD4rsëQd¹{ëk¸OÅZlq°;Ï¯Ýê?||q²ÅÒJ}óì@rVnÚvþä4M;-z¶oÖL¿{@iKÄHãø²~wqCûÝÇzüî¥»3¯¨6«åâ;îæöý(=@&(Ë»/­gµåG^º;¤jEÕÌ0þÞsn×ßÌõÍ§íc{ÛLÑ\`Fì³zV»ßØ;°ÂÑÓÙúÚvÐ´u>uåj~V»kÎ×>#Di¡õO=@TdèéUU¯ JË&â´?øLz":zöúÈÊbÜ¶±{3nzD^iÃù-[ä®ZPþf7zÆ¶+µ½>­*§HÇ0r~Ä#Z¨¼#Z°³±ÂãkDþ?ËBúHÃÊ3ò·$.¾j-°g¾Û-¯Æz±«@b[juÌðtk¥zeZ¬<&ÈTJù£ÜÚÝq:²DÒ7O_G\`?±0 à4fkÑêOö]>10>oT¢<8¬1«VmÒªW(@j¹;Ä¿gÓÓuÜÞÞRû=@i,obAØ^ÝàÆÜ8óäG=@®GÐXLéY;þü|¬"ê=J§*-êÑÁd}-såÿæÈ,å5¯sÜï6³;·³±1nf®{j2´Jêgû4ÎÛ1âNÌ£êÖ-ÀY1·2J79Èwë}Þ@ñyunçË=@®ÛGKäcÌ+æi2ñµ=}änä? Ö_ÓËÎÔ]©¹=@_~fÌD¼ÍÒ0N_¡ÞÁÞ5Þt@Mª¾F×í*¢SÌÎ =}=}wPGµbÁÆìmJÇ=@´?rçN$w5õ+-³F*PNJYVú,÷Õ þ¼ä5[º>Þ=@ë7*4/anôðé×ðk2~¼7X.æz]l=M9ÃÜ²¢/Z!=}Á¨ï'XÎA´UMJÐ=J2xµ812ÜÙÁìkj¾ä'3a@ç|ÆäÐâü*Õ§ý/ÇRgE0ffbaÐ_®tOÞ<E[Éä=M<ë'»]W#vû<8¶Æe#¥ýåHþzòs²0E¥c,5@=}/xÄ4üÞg.]µÖ=@ëýêøÁú%û~ÀÂ?*Ö,;*ã	äËSºéö=}{%BQ,)ðÞJ \\.m2d³Èn¼r0kª²«²!sÆ;Ã¯*-Å6Þ>®»e}éè>LèY Ñ25àé^îñ*¦ÊçÛ¶Z°*$0£Ú+J¢¿é³=@þ ÄíDÐ\`>SÎ!ÐÒIDÐ®må?Vã@\`ì0N"OÁt°}yÄZë8tÞb¾Ó8=@¢%Jyì	ëbL¢KM¯ÑHëè<;3OqWÜIÑEG<ÌMê±,Åq,Í'nýú*î§©wU®F¥+6«hÕu[­ðæ.úwâDL;k8 0l÷4>g<G¼ã+íÀ_¨òO7<~MC3¦§Rj.hvÓëÈ®÷ÑÚÜiÚÈ;kR*¯¿·âyíÈIco:qBk<?î(½Fe6ÎÒº.¶ª.M3=@Ñ" ðbl½Kc¬~ûm|.¡3·=}îfNÐµ=}B¯>Ï7öaoö àh àh,ôR¯¢Ú­®ô%}ÞpJ®úÏR..¯YJÐÈ¡®N®0N©Ê»7rxë4¥ýd~Â½·T}Í¬bÒ¬:,8LoHJbé÷ÚJm0	{d$À°E¯NJ<Ll´¸Å£1§êM;.¿üÆ,.Æ=}#ñLàV~/ö¯ê¯6´uºõº:ìËFDzJÛ«\`;K§=}õRpW°®OI×× Q2UO ©ò*ï=}ÖQºMãæ¢2Ì{Ï¯À¡~¬JZ¸XKz±IlFü)(>&	h¯=Jy«kr }úú<çÍ}s<.«ÇÇ¤å=}ÔP¶î=MÝ­ÒIuBÌË²T¯s½OÉòs=@W¬|{E÷7"alÁÍå"¶¸§³bcºÚ5!KöÔRQ<ªM.ï§ó¸ç*7TVfcö¢ºåHs¤³þ_²£E/WÌå<n ç,l3Å=}öfm¹3³øm¼¼àÙ2¥«=}ºBN¿Jvm¡ÃlJYK/¼MV(2ãEmÁP;ÿµ^¨ÞÂé¼.±¶ðïè»¬5û:5<\\ml=@2u®8=}úIÌK#Èª5û]4¡Ê°®/°©NZÓYÎiöIo"W¹:»=J7wx=}WæÚô»ë;làÉÎ×T¢Ü0:Ø«$VlÆZÚí=}lûmÜúßP©m.Dåà	mª)H7¸|7u+©lJº@Þ\`r^ZÃòävOJÕ»QlÓ0U¡­Ý-ØPqQÍÅVCÇ8¸0æUÚ£í¤ ¿|ÚNck ª®ÿ:Ëg³©ÐÆÓ%Ø%Ø)°"³-'¡îeäZI¼®MSóâéñÐ8½ÜÏû)vC/¨§ýé§ÿ©""#µýQQqí±I9øî9»ÅÈyêWdº¿kf;¿íÈ´o?ýé©q¬ÿvG$'å­íañÇèdc¨[¦(ó2S¾ º*ïVaÅöýWo\`b¤dÝ´KõLè)L?TÄÐ½þxÃãq»p¦¥ÓëÝöÕÃgÏÃ9]õèDv/>×p9qG×L·ºð°tÃúD_ð}D¾CNyö&ÿ	¼[Õ¥¹æùV®+§X§zÁ%!e	FFGkz±©!¿m1	ÊæÏf¼ÍUlvÕþp'6Ã©\`û¿Td¼¸éÏÃy]NiÓ*üõöÃ]]áÀÀl(äµ¤­=MXñÖ&[ç8¤rX¼+×höÅ"Õ±ÞÊåÞ¤Mo+S¦­¦b¥NÎuÕéût²½äÈ%B|äP×¨iÎ	v9=M!¤Èó¦ÙÅo±÷Ã=MYÆÄWöfËI#Ì×ÃÃ±=}@Ôfa®èõ·OdyéBÜeÝÅ±cãùØ»Á¨À¬è1è9¦F¢Sj=Jê«-U/Ä,Y¼Ùèº¦-Ð0~7¢È¡t£Y#9a#Yò}Nù ét¨%¦M§¡"¾¼¼eOm°ÅçV'f¹¢BcÈçåp¹XpÅ¹ÂvÐäð3°mødïÒ=M±ñ$:§#BÚ¦éUé)Ä%íY=MhI"'Ï¹I æ©)ØåÎá%	B^§ç=Jÿ=MÁ¿x¤%£ïýÉç¦"=@Qèyph¨#ÒÍ9hf"Ê$­m!	é¢Ù%ç!¡Q	W¦!úÇeÈ¡þ-±è¨û×øá4	¤©ú÷oa±§}ã"ÅÐÅäÅü÷Î?µõlRG[_Sà{´.#âEÎáøIå#óÍ=}1äT;Ïµ?68àâBGüÙø¼ÞI6<'pÒå7'$ëç²ÉÅ&3%è*Æ¥ie~(U"WbÕ©Aó6×)#½Ól{9îIÒ)=@w	ë)Èl¿I|-ÝÉÇ5E·Éæ¥¦ú©V¼q¤?çl³$öÀÚù({¯F	?J©¹Þd§÷&|ÑÌ&ëÕê1óÏÅ½­ù<ZYðQ÷i©Ì!­ëI÷yö¸©&=}!Ù)SÙí¥!0»Ù\\G¼/Å%húã@7öß³öö&·¢§Üà(ËsÓe|g'5ñ9ï©¾éØ;"ã}ñlÿVú4	>EÚ³ÍÖ½¶Ð=@B"|bü2N$¼iÜ	û5áÉäH~Ëk¹Å¸T|ß÷Êõ Ççä ÁË]=@Iã»Ñ·à­ðX¨À·ÍqX¨ØåÛT1y§äÁÙüÞ%úÕÿµã-ua_ =M¡/>ápQ÷¡è|ä6Åæù¥¨ B\\(U£l¾¤Ñ×dYâ÷ -ÑÖb¢MrÃÐ×e¢eÊßà})¨W¡¢ÿxý6	=J\\7°¶Þ'ò÷£à´xÄã êfëÔ^µÅÝîW):ÑèÓaÈåÇÑ á«ÍhOÎ~í8­c£ùQÊ¦ÁÎ3ée¥Yë´}AgJjS=@Ì)\\Ø%±aýÌ1)¦BzÜáÎÅ9§@NÔ¨±aÈè?zØÿª=@eñaÍ×&«T÷¥ñY¨=}ÝórÉA°A0½Õë1éÅçw·6EÞùíxRh$ï¶Ï·}xÃÞÝá7E6µ7Aº«WØßß©ÂÛAØø §®Æ5°X_S±ïÇýÓºV¸E6»Ðr=}o¡[nåÖ¡ð7°yð»s3òäü^GùªZ=Mmcm=M:Í¹¢:ª	éã?¡Eæ«Ù¢¸\\ØSÉ£4©ïã°p0Oí^/äb¶]6;?dPÔ©=MÆe¶$÷s Ó\`\`&®=M7"j'Èåq§Ý·Í°õ;Á/pFGîÝ¡ÌiCàãÈ[CQÃÃÞ 3_\`\\g¤&ü&ÿÚò£­çå@WÚÃLöpá7·y·ÅÀâXèK+#±#2Èæ>·$èZk·$åÿ¥æ/cQËÀ1o¥¶DF´äF\`NÊ'4ä]_#BÍoÇÕDû3rö1!y\\§ìå¹nõ:D´¾îXßR=}õRÑhb¦¤®påß¡uR&½KíÞü^ú@çòþOô÷hµ@µ%¨\\&Û_Wß@wE_²ÔF{ÛvÓoì4A673î®üõ|åáyIä¦æöó­¤à|UÜû&£ççfö¸üà3½üùÆe%ÁKÿÄå¥Å à÷¨J _^^N^.)Äÿ2WE\\Î÷ÿa!ÖgîÌ¤úKiùÃâ Áð¹(Þ¤!îgåÙèÙåèçÞ¡á¥!Ãú(Ø=M±Æiõå ×¨£&³ç #ÏE©wâb	Õ	(f(ÿ=}ØÃâ&ôÛu=M£é¥º y§v!ÈKÿÕ¡Ùè$"ßéÙÄaØ¡÷·Éb¨(P¨) w9xU%éihÉÓJ¨æizõnièhþJ¨f=@­¨¦æãØuh1ômÑ,øúçù¨4À¾ý^ù¦ëçÝ"ÊÃ×ÇºÔõ§XÏxû²7"^ã¢Ï»"ÛÜÇ2Ï!ãööY³=@4ÿåÙÝ]¦¼CvÏ=}<§ê³ùsZ?k¼sXû8atü*½Nç.M=}Ts·»L½ÎÓrøh/õû§òÒCõàÆãìÿYÖl·1PYá!"ÿÑÂUÍDà¹xCaÿ½áÄ¯À·du#£°½È£¢AR}ãÅÂî[ÝÀd£ÏógÒvßPÇ1ÎxÞK'îÿÑ°/ôEGÂ\\(%ù(H|«_ÿa¨~ÔñÙfß¢/¯þØ&â£ Æâ$öÆáÏä$6Geï ­éÜ.Á²ÖhP&¬_å9æ ôV,C°·ÇÝùÛéHå¢/¾²Òÿä%úûU FèòíQ©³´7qQ¸k§y©{æFÕP Çä ü3RÛ3=M×ui£'ÃïU^fÌ¨ÕhÍ×§ÙÑXH+_eöe¸¥ÈáÎüÒõ=Jþóið­ètí¸'}@©$ð5¹¦Ï¾p<pyÜ{g³ÅÒ$$8ÅZgô©CfÜ¨åÂî3=@gÓÕqû_ÅD^P)]¹#µ~Ëî#!Çä#ü=JH|äÝ­qwq©Æç#ìÿ<ßxõx'q¶Éõø}á£"?RõßÃZ¤¼w&¹1«ÏÖ÷äñ'^ðçqX£Cà¤S=}(Ü¯3RCé,\\p£YYGÑÁ¨3ÓidÝdÛ©!Ã«yÖcÉ£ÔµÕõ,v§Y÷1î±øIZYêN¿9É¿ÐðEÂñä¶³qÈ¦ü0èrvIwÛ§ØóX1ö«Xñq^ïÉ6½Ï¤ïÅ	ãpË³Ñ_Èq=}ù}0ÐÙ$HV½vCÐ/¢T¿åì¦fqcUwËñ{EÔ®#çO%*£Øâ¨ÜóF=MgõÓû¤2yr ó<äìv½å7=}hjýÙøÈg@BÅÂI=Jgäâv^]ýsÐüXßou&?×Ü¨qðs«¢q¤ÉþOìGÎ$PånÂaå <²fß\`øñÍTÅ¡aãË'ðäzÕï=M#~ÌÕ5g%¢ÅFä1â÷·o*W·(ÊÀ¯¡ò±a !ø_ïû§ÊAÁP@Ø³ØÞÎ6îeúÿ6½ÕÎ?ÞÓ=@ÛR£eôÏn_¢¹!çHÂYåØ¡Ë I«a¬Ï´h~µrý/õ/u[VûØ¤AgèÓÉSU{(uæWW]ûÌw¡m¦ÐÌ?æöjhI¹L¤Dÿ¡$=@øØê'¡/¤Ú^RJhÛRQucõAYLIÿµqÉqÐÁi'Ö;k©ÝØÿðü£íÍµõjÏP¢0ÿ¾hþ0½vVEúlÄØL©T«z33ÀØC÷©foÕ{£2Ù5°ØQå¤Û¨\\ßK+À6¶)nHÏë¸.âüÌ:oû\`ý}VUn×qN:°.ð½7W§?ç	ÜªS×'¸Mq=}kÃ5e:TûxM[êT4aþJÂÜÉê¼£ÅtÄÇbäÐo¸wBfÚáØÇDYdæ¢ûÊj©y½ô&(Iq9ßÁ=}¼$Ú¨÷D;ïm¦ÃÇFGüÐÞOÅáâ¦õð­e8	{ÓDeØo"ÝQYÃfÜVÙ½å!îHDü££öÌ¡yÏT=@¤s8d]h!&ÇÝùûaÛr·EðÈÕñÃi¨ÈâÙzå~L%8Ôh\`[KË·Øÿ¥7·¹ÕÂ5¡ÂeöÃÿIÏyC@=}~4Æ®Ëe!§ðG¥q!ÇðÙçÿÔKÍÔÖg>ÕB¦±®~G'ñ%o=}¨O£"""Í1·G	ºA©ÈÜ¥ Ú%mÞÉ³×å¡öÑï=M¥ ÅA	Ôql9)lmÕù	££ùº1ÙÄÚÛ!d!ÂË3Ëé%) @KëeVÒ'"\`l=MG(m&"ÈÀñµ×c<=}u¡YÆ«´òæ=}ìÄö/8.õÑÑ¥¥=Ml]	yñÖ$ëLèÿ7´·IðT£LDßÿÂ-L°þÙzXcuNk:ËÁ4£0qó7I=}N×¤¶:­Ï ¬¹Úrg5Ø½ùªb-¶adRA¢3tãÛçmd­n)8Rx"'(û_§Fê6ÈI°Â©3#åññ¿X|Z©j)f¨èhã«aÚâåãäÐ+¯)I}Yâ[ ¬%mÉ8©¥'BbÙ¨g-0WÞæÑ9	ç§¦ûMéã¯O}[ø|?"Vù	P!tÖ»Î·rmÏ;Î±µvü§÷ß'éäuQMÏS5iØÉÆÝ¶²@oÏÅ%Á¶6Ë!ì@áüáùI'Û=@ÒË'äàÒGÔºÉÁåÕ#qßùÇc&ðøÿ½¥Wê	÷jÙH¨M	bäÿÆ3s'åà~}ÓäË&«(èãfWXP­½â£	#=}<ä~UÄñN×rF\\i4ªJJ=}w»P¹Ñ%	zÉã)¨ìÜK÷TA7opMøüµçmTßö#èÛWõïß]ÉÈçnÙõ?3ø½õíÿN§)þ"0O&WPWyáyYØ/3WL4"âµáô& 'ÝEñá÷sÙlª^úi@×ryAMç<æÞ=M¿äÕäü·¶¯½ÌM4£¼_Å£àflän¤\\LÁ Ý²LøüñE%ctÈHtSÓÁhiiéâ¨¡q­=MÕqÞXN§§¨¡	¯gGÎGcÌnÊÕ$((ûIeî=@Slÿhéæ2TKBû=@1¨ÇÙ3iAÌÑIÉeâ¦n%ò&È0Ý¦%$Ãý%ÿ9!¡Íx°¿DÁTÇXWgwÀØ¼hrWN§èçÐ¿é­û«»´á­#Ot¤¨¦££ñÒPÌqqAñn£}µ§¤²ÀÏ§ê ¨¨¨£y	Ä¯fÓh	h¬öt­ÙHÆÏÑÁ]ýá¹ùØF"n1ÏªÁÒ!ùÙÉ\\×©Í\\#Ç@|xþ¢£Ô¹G½#ùþZqí7W§üáÁq|UäÎYYú.SåÍ#ÍD	ibèâyoIÔîñQAà'þÌÎAßò!a8V¸ÕêoöeIIÉë9ùWà\\	iéæÄh]ÐÒ¯H¸³÷ÇÍÒ¥¯*qp¥)",ß¥ûPÄñ²·¾¸~¼H¶ö­È×L§äbÜR$°~åñqýËéØ×Â	ª£ýí¶»IÔðÁAÁUx×÷·gÍ:S²=Jå%ñ@³?# óïÍÅAüPuëï-®´Ðë"mHË¬éÅé§§êÌâ$ofïJàØ cDæ'AUúà¡ì¡o!|ÿD^úºýaZÞ¢³Ô7§ðWz»\\]e ¸GZb(ãD·¡ÃOÞq2LçÉ¿J 9Y=}ó ) õasX(3i(»^Æø/±Ä*<mü£<C}H¡%<Â{<g}hÝ'HöêLi î§Ë62Tñ"ùdÜàØõdñsüloÔü{» eRü²"g½ÐÙ¹³¾ÒÇV##Î¾Î®pÄÝÀ\\¡°Dë(#xü¨åw)°4Jn*àºk¼?5=M ,ºàAÀN	Ì¼:TÎOOK|¥Ö=@Õ»üÔ4»l»^'¬=J¨ó&(Vð)u)Y')[;«<+=}ë<<Û<<[¥J£K«¬¤u¬ìr¼&»je|J£ºK»X4M?l4m,7{nV3m^M¿kT±~+S,Ó\\<ûW[0NuÒ«~5Ó8|gÎ0>FÓ3|]Î@r×ºz{l¡j®þ¯.rgº¤Kk´k´o¹^:3u3²¾ª^6S»;NE|TüRÎÉrg±^HLüùr}ºÐK÷jÄ³^EXü¦Î¯rµ»ÀL'¬Þ,?üD=@º\`Jl¬Þ7ÎÇrå» 4C&¤º\\º¨m$Çþcrq»¸MÇnd·@fü/Îi»XMkä°-@üGÎ¥r9ºHKgk¤°,?üEÎ¡rúÇtÉºèJ§M/Ô1ú)rêNVÛ¼;3¶*ßÍ)»fºæºK#J#K#M/J/L/Mû.*Ó:|B|{ÎrÚ¬¿tK¿kT±.-¢S,3°zGÌ)»ÖrÿºJÿlÔ­~9Ó+|MÎPr÷ºJßl­nf§1Îx~y%ÂÎq´ð3cEßcß=}ç=}ga@/üWÔaÇHrEºhKÿ+;Vn¤±þ.Uÿ@ÎJ´ÎqrÚÇnÔ+LójÜ¯%GÓ+2\\|IÖ	º¬¢tÿeµ>±ô/ïe´^6î~F¥¹¥ruk~fûJÖråÛIC9,ªgrc:Ã±Y$7,Vg9ð>2¶s:y#Zk¢Óâ¨,'¶ïX27àÁJì5/Y2û-7|Ø2ô.[¸10:Ý<¢P@ÜXJôÏÏ{A::ÚÒM²]*îC1	ÝJú|öÃé«r%ªrYïåñe­z×Jþ¶µä=}:E:Í°Õð]àªÅÊMßnÅàpàoE­aª¥ª­kÞáäÌYäÍyêºnpIoÍÙjâé¬Ñ«1Ì=}ªÍjâJi:ØU2;®U­ëlt¸J:ØI2a6®E/ì+ìG2ìÇ°+U2!D2b1ùÂ±Wê]Auz1:9:0:Q:ÇÒpþ£]8¬¬ë½A9I;î¤<î=MJ':*®$e2ßëSÞ÷CÞ;²E²OÞG2V0wÞS²R²mÞ_2H2uÍã± Bû,ðÊ?VðGà3|P·[¶Ñ1BqÉZ BQ=JÁO¶-ieqiõý1íYlÙóÒ¹%û¨F9ïÞùQÞm\\ñ¥cÍ(¨Afv>ÓÂ.H¢ôüZ:W-KôüK=JÏÐ¬#¹=M=MÜ=J[\`)tÎþÐdó£R61@N¨BÖþÇJjY7ÕÑÁ"ç¾ÛxY·çØÁ&æFNG1SMÿk¤Úk$+%¸¼FRcíäêÕÍîÔdsÓ=}ÆÎ1©bsí¬ÇO\`*p@JÖÛ0óYJBNÍÒ{$Ñ{ÜoÂÎþ¯P3àT¼ÖÁö¼õo¤ÚýoDþuÏ¶fü¼I\`àbàr9ÀÎyogÎöH¼ñ}èS#7¼ÂtWgÒÃuD RÁîÐÀÖ?§ÎÛ¡§Né^rg$s=@¨ü­G£Îy­'Oæ|ñæ¼(*óh³á3¾ª£gªo"ÚUë<	?Lª:ñÐ®t¨ç4rà/Ï¶¯Î1?4uÉt°sÃoµJ©{ócæÂÛâîÔÁº|ÅÁ¾H8Á°ÏÀ¼Ìü¼¿Áëõt¨Ïöô?Né´ü­;üÑE¿NÎ¾WtÙr¨ÉÂîO£ëÁüÚ _NøtC¯=M'r¨ð¤¼n§S=M-kM½è³¾cãÓN1\`ÁÆááº&Dà¼Ý=@|Þàü­t(GNàÚ½/	wåþôü}Ü WgÒDW§Uhñ´ã¤7ðÓ;KäqÜ]ø­ãR-5võÎZúå;^Å4ÄuïìîÌ=}@¡¼VÆÀÏ_úÖY+­H²ÜsYCÅcrv'YctÓx|hó¢;0Qðõö¼YAS²Å¾ðL¢t´¢uðãÏ¶Ýè¼_=@\\p½=@~3À\\¼mO#§KS§{ó"usSCSßoóB@O¯ÓTóÕsCÇEr0^mÃÚ96dOCÅÁ=@~wºÖµ|bS^ó¨èNyKóauð¥ÏZ	í|õ¼_)w÷ò¼ASí¼×»¨Üû]v]_løÀáÁíì%õðþ»ÉÜûÆK±O'Sõ1ÈõCáÆ0¶1M=@÷C70¶Ã½=@ØÿHÿÏdiü¯G^·ýµ®°¤£Jçû§ý§É¥¤a±_Ð´8ðôF\\àwÚPÐeBf3ö¢üú{8IB ¡±Íû'ÃøzÑþåGÆ¶5b¯g&íshÆûÞÓÄ;]Æ·GYd[~Z }·ë$w[ÐÐw\\°ØD·mµÅipÂAwðï÷YñÂ}%\`GÕâÖcÚïâk ÷bûíÿ®Õ~á_%AåktX)ÄH ãåÛkau'éVÓÑÅ£BÆ 2Eú}h]]Ù_·)\\Ø'¯¡ðä¾ðBu_Ð?ã×»hÓH©$®wDõQYQa¾ñ2=MÚúG(ÓÇ¤ß!5Ý vª®¦CW1*¤%óÊ_u0"3»µ®9åÔ5_èFÄ«CÞ¶äøêf86Î«ÂÅMêåYu]áÎê6g=JyFÏ©dsºE]uqéås\\gÏ¥Ñ§Î¼},Î|GmÏYÇµsEþüÏÎ\`?Dr$WÎÿ$tÖÊwÜøt½ÇYO1I»4GçYgô¾ùáUS)Ö·Ò=J¢ãs¹£è1ãëîäÇ¼íü¹¨¾©¬è}óU$X[ßFÈæ:úhüÛßm¸ð¤Æ0'~ÊD(áäC0=@XÖ¤ »ù5a÷fÓ @!èÎå*u¬mH=}õÁ t	äåÍè=@]¨éq ÉÜ7Â¦etµúºÉi¸3'zí!ì×¡¤Ñ>õ¿jóïïñÁD æûo?Ld>b=}càÖTÆQ	 H'D$½Wõdßv¦ûèãÇ§C¤(ÚQþE0(¡Q«±r3*9\\:¦ê^ÖÛ	4ô|9AÇRkY÷R¿-gAI=JTäO/)À¤àÝÚ>açÌþÐ -SYÓêñ|þ|½¬¹ÏWï¼ÉÁ¹\`Ë¸XÁ!N§-m±¶«öûÌÃýóø]QC·;3åv× f ý×­ÞqÓl7æùÇ½Úà)´'«@8çæJ\`ÐO¹Yán~A%DE@¡"\`×'Pá=@Qt)¥ÍXN¬KÁõü¾Bç»½îårC{ãÎSeuÙèprÃws³¼¥JYWÝ£å¶ÕÛd!ýÇ-QYòv¶¼¡^]vÿÔuaà¼p«	§ÐRÅÔ¡ëöYÕtô5T D|=JÂ'®»ÛC×¶À+ö\`WR£>l,¼ß{Wß;¼ñ±¼ÚVyÕº¡Ñ¿ÇÜ4ØÑfàø!ÆhY¹ÆQèª	ãÞo×£V	ä(PãÏ	ÛÀ"¸»èéNï¶LåH&Ø5¾Ee08ZÀE¨	ç6¯ìèOqP($Êjlê"wu´IZc{D©	y¸Âÿ{A¿%¼íÙ<¶á4I2=@Á7´ÕgÜÕÇ£åwäþu¯Æh¶$%0©îQ}¡Íº»¼@;'}²	|±@~ÀÛ#v?Ú@¬*yÿ5EÇDòf=@vhq].\`oYSs{¤3¿ ÑNzÌ¦Þa7,+gkD+h³Ø1«¹×¬÷	*»¯ëq ðbÖMÚ«6ÈOLEÇÚ]®*ôCÄJÎ­°ê¿tKúP®u»|mrÿ×é¿öà·ÿ?u?83 Nc¿"Ù¥7U¿SRR¹áì\\èÙ8WEÕ×ØjI¡¼¢sS3-¤¡ýÖÔ»u@4kßð°8ÿÏ5(*IµsÈd¨üêÂHÇa×Ýt.t8ø=MXùÃ\`)háá~¯|omçýP)E\`âùøÅaÒ¯¿òQÙÛø¾Í¼=M1n¡Ô3äâ!;%émC% Ú$Áoý|¥åYÃAeêns¦V½5ImNåÔt´ø%ïÐ¥\\ãÝ¿ñ¡î[\\&n OK\\YµLùè(g%Â»ÌFa>³D§Ê~Ý%Ífð¹¶Då¢pþ×UÌøÔåÌT=}{÷a´ÈKô×ªÝ#×ÑüÓ~Êü%ùÌô®e?¿Ð_¿Þê4ÙÿÃ¦ªÜ£àwÖü§´\\V¿oôªU¿u(Å¾YÇ¡TH¥ã|Ýú;Ü]ôúLÁ¿Þçá>Á¹¿ùUx=MéRÔoñ,dÛúïP=@"äEUÄµ"Ú,û(Òj t¨ )lr|{ðÀ¨/õÚ1õÝãÍTÛ\\4%§¼¿OæÒø¿ÝlÛÓ[7ç[wÕè÷´×Éq7¥ #}q\`âwAàaÀÒ1e'qYÎ9eáN°>õDeÑ6!­¤±ëV:ðyðÛ¡=M¥3 ãËøäÊÖzËn =JL[³¿å½î@Þs1¼Âê> §j4á]¯Ç¨Åì4°Â@\`Ð8áÛîEh£)ÞÛ»¡}EððP¦ÞÛMaEøÞÛ?r9»èK;îrFeøzÃ>¸|ºo:2í*,ê1Eª=}¹OÝý¼JË=@ú¤=J=JïveCS$å·÷"´i=MC¶\`@(F	9¦EÙ$I\`@ìðÐ&°ÛÛw\` ¢ã·/Êø%QÅ·gGÖEðØÁÛÛ£K\` µïðh©u5IÑÚÉYÐÚ=MCSÖ$>4u±¤ÏÚ[·|#> L4ÅÍu}HNÝñ½ùwóÖ\`r\\¥ÿLÃUÉöXx»½i¼%×sÖøþN Î<å|e³#±PÛ_	=}u³%Àn@hK»§¼ò¦L<r!n@bÕçb\`£bú?éõ7øí"VZ=@ "Z ÒøZ î¡B%©Ruh¾_vGô0aBôH%8NÚ½E<Ï®. ³OZ½K«eGù4ö´OñÝsëV¨FÕÜ\`¸÷¸·í=MÂ:Àà2Õf2Õz 2E%ZUàZUbZµYhÂ£f²£ÙFîä¡Cîv£1[ñµ-ÕSzàÿHò\\]1Ú@e1Zé+öS*¤ãiõ_ãi5ÔÉ·¨¹Ûÿ'Ýà'¨i\`VûaÀ/·Y¸(í$ÜÏ/%Ü;6^°ãB÷P·²ÏµnÝ%ÚC³§­&§!çÏ+çç¯ççøç±ôÔÈÖvÈÖ&ýH ùgÕ<gìÓ¡ ±u¡ãØE|åEð©C¿Ç7ôì<ÄÉõñ7-eÝ eeÛ=M7eÛo!dÜ5³G*¹¸Ö	ô8Ï8Ó zÁ Ö÷ ÖóÂ Íye\`àÚrEÒE\` =@½]ÉÉ[éÀÖóÀð@Ö|ß@Ö³=Mÿv¶ñwÍ+wÃ§=}\`\\Û3¥ÇÂÇHÿÂöø·îhÅEÛÓia7Ãt- ö×+ÝxØùFÝô=}Û°¤ýyRuÓíÈ©Ô÷x9Ó÷lþù¤áÜé=@ü#D¨D§pä_àV©_ ÆÔ¯u ®¿£¯¯?èöçä¶#}³4%ÚJ´W³N)â\\µÃÃ8+TÛ7µM.Õ¿z»_ã«'é,åÝÍfµ3Tù°¶YñèçTõÆÀ]\\ôÚO¯õÚSÏÿ¡ÏÏàÏUHøP±°Ýw=MtÜ@yuÚþpO×ïIÖz¦[@{Ë{\`x;=@BeûT¶{Â¿øÂ¿C²]/ï/Ú3/Ô%ËÖuÿzà¨À&[®DìxÙ97Æ¬åxk=Møjê<ò!ôñì£*Ý8Ó§Üû1&H©W\`9½8"ÛPã'#àO±¦ÙãYéøã×=@DY%óàÿM£Ú1¹Vo5Eg=@Çç=JðP¡	1â\\½ìàÃÀ Ã³¥L¶Öø-©ôÃ÷ådÛ#FÒá8ögô«o'ÎQ¶á¸WQÝXõJQbÅÓÖ¥cZ"µQï©qOí'­Ü eïS×Ü¤ï{ûôý÷Y¾ÈU}¡iHph{qôDmO!¿EÿS°­¡¾ÿUs1TqÔz°Ô¾s¿ÙTxå(|ÁãÖ¾ÑMÌÁi¾ªté¿=}¾xSèÇz¼±FhhÔ>¦nS¦ºÜâøô®	¾Ñ1¾mé&(Ï"ÑçôÕh¥¾ü©|ÿÓ¾'Õæú ÏÖ×ô'@O=JPï$0ÏtóG¿Óë¾½SYÙzØNGÐöXÝ~ÓÜÛ\\»|ç,#£ôÞt¿uUøÝ¾§ý¾Úý?¯ô#}¾oÃiUwäw|ÀGÄÊv5EÙ.wDÕ^¨(½<ü¢Þ\\¥õrÝÔ'¨´ÜÌÙËtólô¥-?±'¾ë¾ò¦ç¿Ø©HøÌÆ{óÑÆbtãÉ³S	næ«ìþÐáÙÏ&Ã§Î´TctC{ä¼Ü¨£Ïíæ\\ôù7ì¿Ô|O£Â|ß¥kØ&tém«ô¿"æô/'¾µã¾ci£TôäU¥Å¿Ç}7tï{s¥LUYíéocw¢I_ µÒ\\¿Ho_Ä e­U{ép²üùb?ß)ëÒ¿]Ì@v=}{§õ²Äi ~µõµÍ@AÃE¿¼bg'³{æio·']SÔ¦)Ò8ÍXHßå×Rõ½²Ò¥´o33¶TÀ;ßß¿mþÙ¡Èo  cIC¡Îc£wMMi^´&HÄQÜ²%ûôØL#_1¡'ø¿½4u7Ú%À®Y	!ÅäÛõ%ø¤åÙþ@CãÏyt6s!ä\\gÒ?ÕÐY^ßx)áqä¤z$É;(qðÎiu"cç§ËÞAÏ©Eç^çÃÿÁv!Â&$Ût%üé	iºè $ûM{üÅiæÂ¡$ß¿Ð¡â%b§úÎô¦vÉ!!Ð%yQß9Í¤Ñµäñ{Ùß|Ö÷×h(ÑÈÓEÊ=@ÄAÎ\`¦¾çËºT·SÌØfgI~tG?'¡/ß±po×^	Ôàç§Ìà$SËÈd©mß­ËÓä×{5Ö=@¬ÕþLKÇ~)ÿgþêAçÿÏ%Ôm$Õ÷¡6|ÍiîÓU6}©xr|ÚÓí}ÿD¨ÍþeqÕ¶{ñçCÕÄd'Õ"nêÛsÈ½ÿKäÓ·¯ýþå?ÒÓýþGÛÝþ~cOÿiMÕÇøWz±oY|ÀÒGX5°)ÌPIØ é|g¿¤öDßÀ)dßÐ÷ÔEÿ¡A\`Ó}¤{a¦Ô\`ÂÞAÚmßÓ°UåÿýQ!Ò¹}qhsý°_úcm÷É jFzÇà(¡¯í#-qþº0ñþA¹ÕÇyÔéhfÏ(h=J¶=Mßâædô¬o_=@s÷våÖ¨çÌà72æØ=@¤mgIu÷"à3çÕÔé}y®fzUX§Òt«¹ÿú/yþèùþùÿYÿ\\=}ÓÈ8þÄóÿýÓiÒÁ¨~á%Ö@h%o×Å$ÈTÎ¦C³	GY×æêAGÙæwù	qeK¸æq(´=}ÙýÃ1¦õàB"Èphó	îÈ\`aÍö¦p/A¨ Û5éú¿±\` =M?&\`¡ä±¯% =JÝ9£÷ÈækYè¬AÉ\`ÅåÀóï-qP°rI¨Ë9ÙgýÁà$Õy'âíÆf¦©©(öÉéÆ¿Á¡Õ<ê¥i4=J	Ñ=M/T/Õá,£(k&óZÄ>ì)2øùFôù[Ë¦¿¥+¨+èÚk%}køAuÌ4·ìfý@ð½­´{%µ¹øo£ËöÌ&=Jì&¦$&á"<¦Âsè§}shâb	£iÆ|u=M(Ï#uñ7õ1â²Ü&Ëycø\`¿=MãÀ'ØÀ_0=J5ÆU«5T	íM"Ö­;&¨Õt¦=Mt&|¨êW¼Án¶R(£©>	úR¦~ið¦æô®TæÃ¹¿	&ïôÀÖôe×ôÅÿÖðÿ]ÿ"Ìàÿ#%eÿ#«è_â=MåD¦|w(zµ¹ÉzµYÞþ/ÿk("ï¢)&£ðôä¦vgèg×¢§h¦§ØUª©ª¡Wûºqò}´\`=@^W4\`!Á_¡_·_¯_Û}Ä¦ðæò&áù÷"øk÷£ñ÷#·øWâÉW"$W#ø¶Àæz#´7÷Éx÷éõ"úë¢Åå"Ü£½­£ù\\"Ï"ãSãg	#ÒgiüÌ-\\d	G£ÕG#Ñö¸fÝ¡Q%QPÌ]äÎ]©=Mþ¯	¯d¯éV	¿E¡Mè¡ä=Mý©ðµ?ø5¶ø}¡? =J7=Jé¥£¤½yûéAºúµùeµYÅEÅæÅ!¹íQxíGHÁ^aø´yÌ£¿BèYW°á£BíEõÁ&ÁåûÁa4¹EpîH£i¨MàIäáI	ùuÞùiXù'É ]õ9=Jçp6=J}¹8=JÈ-#'\`-ãü«¦ ­«¦k¦óÊkæ=Jøk(\\²Á0M0Þ-­#k':Ñ$:H\\¤2&:¨x¸=MÕFiÁ>ñE¸=Më¢·¢ÈHGùñW¹UÙïã=}"03&ï.,!¢¿ê-48í8oP9o]°am£«f¡õæ'Â&Ùí"¡±yÙ¦¿¦èÈ%!&ðµ&ÍL|W»Åòmü<#ç³f L![N ï½"õPs&¦<¡ÆÅîñwWØOë	½"·¦ó¦È¼ö©ºöiQPï½#Gó&&ã£\\ð>Q©4é?Ãìßr¥}â)yS&&>¨u4¡gÆìÁsiçréæXE)úðçT¢¦EYþðm¥¢ébE¡F=M9Ñâ	,EÉãôðeßK%&ù	&Ñ}\`È¤ûð¹Ý8¡fÛ·qéÚe¦÷1E	%C!§Ý­	eýðiE«çÄyÝùÅ9%&Ö÷Eõ¨ÛÛì=}Öú*Eþð¢SE/H	ø}%CSr!>=@Ñv4ÝPÝpq¼Öóóöå\\e³çÃN <zg³ç"¾òxØy¹QÜÐn %àÍ' HøtVIðxEðàFôØ8Iô¥88Õ<Âmn,ô¶¡ÅñÝm=M%HV:ç:=@=Mó ÙëÁ­«=@­îó«öò0ÜÜE1Úç£0ÚOÍ%Ýåy$Û3·%ÛCÃCõXõf¸ðÚÇk[^Õ-p®I\`éq=@©YàyÀÎå|¥Ú(1äÝ|¡=@\`ÜEÅ@¿ÿ	¯wèÃßö\`eÛ'd\\'8öºûÈWã	¸Ç\`à´Þá	äáµ}Û¥]Ü]Ú÷ü½÷ÎUwË1wõð±pÖ°!0ð!$¹ÙÎ¹ÃG=@{=@=M¤Ww OÍ0EçãdåáÊD5D¿~;¶ôÍÚÉMëu¿ ¿#ÉMÐ?rÏ4°£¢ÍVu°§tV÷p=@Tï&fì«uOÂ{=@Ü[eÞR¥a¶wÂg²7Uò4Æ5ð#¨O®ïç48é.ÜwÛå|*µ=Jùßôíøu¨öß9Ja%ôÅ§ÅïàÀQø=M«ÖÔÕEèô¯O[Ý½©Dæ-¥NeÝ^qòÐFÂ¨±¸Ï~Á\\¿¨¥èTÉy§|¸¦Ù§pÏ¼ñã|õ³ý=MËöÈ¼=JCãË®ÄÙT×Á¿LÉXRõÉÈ}xe×dlä%Òì©cÎ¦É"Åeé¼åäLÍÓÎéÐVgåÃã­ÜþÅtË<õ¿×ü|¯ôyuSaU}Lü¾O$tÈ=}iU¸]PR[×ñTW¸xIË³´¯9{ ÑF'ßÁüÊ¢AÏ÷ÜàtÐ¡Ïóy7¾T_e{¹pRñìõR}?}0§XÊ¶IÒÆÕî%¥TàËo(ík3)_ºµÒÚ§áÌ¤ (MÔËRíÈ{åd×¹D×F_§ïÞRÄÍÍf¹ïp7¡@_wÓBßfXJþÛý»WùµQ!¥Uq7ãñÿù _ÈÚÉ_èeG¶#5±Ðù¤ÓÎéûP'K£@·wÙ$WW'r tsyù%$&iý©Ýuý¤¹wÃ½ÇþëØ	æþÒOF¬ÿu5Ó÷ÌtÒÀiõÔ$ñb~'þ±¯_|ý ßz=@ÙfG	Ô¹¤©nÑ¢·Nß#ð~_óßËÊX=}ÿú£½ÿDÑÓQÇÔT÷{É!ÇÙ8âr·dÛ~×ãdbß¤äëdßxpÙ£þË ÿ)xyHßªÔHØÂË@¤zÚOÂDhÎäC¦§ß!Ìd !õTF=@þþÝ=J?ù	ÆéÑ¨hzwi(n§&ÿ£5hÒ£Q¦6#ÐðÀºâ¨Óöµ¥#'~1ÏM)Ãi=J#tÅ¢	£Òq£	ÈÂeYö­ÙÉóÑhAõ«	§"(À¨æ°fæ³XYÉúLªE=Mñ	1=}ÿ­ã2yä¼É±°@=J	Ì5lf&whä;(£{hu[øÈ?ø¯teGí#ÃÞ|&»ü&þ\\&ÙL"í=@#±û?â}o&.©Õî/oýÍ"æØ4^¬qÕé#Ë=}ã¦åD!£ÇÇ­ß¢õ=J¦qûd&Ãä&¹²¤&Ò$òDtmHã;©Ø[Ì3I@¾ð¹CÅ9IÅ}!0+å4µ/Ó"¼Øãñ=M,± ¦Ó8fÁ¸eè=}9ÓÃìYìÕä_Û¢|=Jw¡/á=J¥¥/¥¹¤;ý¥î§"ía§"uÌãuçBè)6éhåYSÀa(UÀYsñÅ£ g 1¹\\ªÙcaªdºá¥cºtFî11=M0Kü:hõBñpñS=Mâ^2æì¢¨Ò£,!gºêá@EôÎ7¥i7¯9=MÁ!8=MQ§±=J¦ÛæL9GÂòyq¼¢¦õN<I£U³	6s3¼£×¯óæûïhO¯e~sÅ1Îµ|"ÄÍS&Õ>H=M¿ü=@ðµP"ú\`(ß·ÙwáSÑ¦ïE©°âE!"¬	­I'ç1ã ô%\`&Ò·OWÛÛÃ§EU Q¯#c¯ÃµÑZÀ»öÄ=@wß¹NÛì¿½±³VgbEû.cíèi°\\Í=Mz^«ÿÖCù=@á¶79?kè:Thº_6µXU@ïÜT%Ü>6µ±#_÷ó!ë¾±î =MmÇËxÖt1"¢e ½=@Ö  õúÀVRçSµiÂ'ßKuéÉ#ÝXd|ÅOÔótvØøÖÕÜ}ÏÔÚÑÍÚX¥qÚ7?Â¡ò$uÝÚñOØ®ÖñLÖìõ,zÑ&)JàèhàÎi%=M¬YÕE¼Å?ïÖÜÚaÌÁÃo~[ÚgG­ÛdæÐü=JQ ÞatÔt·×9¾òá¾$Ùj¨kcÄ¢{H>(wC¤ÉÜ8u	÷tèßôMéR­@T§ÇUéYÂÔFXdkç§¾â)ObP	3Õ=@v#@~}3¤{S"{#â¦tHtÕvçüÙÝÒ-Ì(?çÿìÒYqp	RÔqf{wqMµÖÔFÃ[Èÿ1Ç§}5ÏÑã¡rù¡¦¤ÑÛ¥ÿºÁýEÄ	Ð	ÖÀÆ=M×¨"]SÓØÞpÔÍÒ7PÞ~yXÐ\`Zj×ÛS ½äònÿßÿFßÑ¨ÛôeØzYÑ óÌ@×èuç^lµ&¤zçÂäl©×;ÑD&Ä$ÔöG_h&»äi¯$ÝÇd)ë¦¥³ÖÌ,Æ"&¡0 ÚÃ©ÂðÅá =J·§æ#óýã#$~i¨ÐÈhHYÂÙ2e>m&í"#o#6<¦yæ=Jµü¦=Mæï4&øÁ2ápNap?¢?h/ h_¢#&Ù$¢v¤üÓ+	=@à;D^ôa=Má=J­Èßé÷ÐÞTàI=J?Ñ ´¡ç ¡5Ñ¸=JyÌ¤eÕ¥ðÒ6èèY9¦Hõ±AùaGê7Cò¥wDî11±Ã]¢ô²¢hÕ,êËæÎýZèZ½\\ÆÑ¯O=JeO5¹¼âÉØuÐæõ}"³!Sæ«=M5°"¸\`h!Ö·¥=MkíUkéú{WÂ1çÒ·FÃìèw<U\\O»çÓ^Æ'ÛRyUîÛ50]­J¥ßÏI%>ÁwGý±¿=@½_··È+gk8Öðï\`vÙÞoq^g@\`GÿQÜ¦Ñ·{Ötè2DÀ¿z¼·®g~ªÛKkVàâifAç¡Å¶»¿Âã ñÿ%´ôôÇÑ¾9R7É&Ô>èpÜ¢«þ>O rþûBÏPt¢=M4ô#Å£¿WtÑÍ¼Î£{Ëq#Y	E#PË{Ù 	Wç±ý6¨ß­R£=@ë°­~ùº[¢ñCýµÿ5sÿ\\Xåÿf³éÕ8ÉyhéÐ\`¨rg¦Çda)°cúA(9ÝÊ9	½ÄÁùó2ã?É>Wù± 5ô{_TQ?(ß_èWÈféHIgá;9F¶YWþ´¡ûÀIô»±¡ì±¡Á¤ûflèÐ©øjù¨uFùÇ¼ê	Eð­ý°9Áò¦xÉIQáwS¦rwE¡	=MÑÈâõYuHPhws¾ÀuqÎ¼ùYÜ£¸Ö2í$VñÏ¼'l(ÈM;¼wS»õ·ÖU©ù<=@ñ{O¡¼¥ô§ÖU©ù{4ý3ÉkzcoHoÊõX±ìø)éìh£-ml5@4U|Þ<OuÀTÐã?Tn~ÔFCÏZ××¤·Äß? 885YA;Ï·ÿâµßã¹§$ EZRX|ô²ìh¯ônÕýÒÕ GåQÐ)=J"sSÓÍðxÆfW=@#µ©ã'ðWWÐöÊËSÍñ'fïU=@èe§)½Yçµ¡/þj"Þ¯Uar)õ¡Èæ#»Éß¶xÆbïÀçéÉä¢'(Ýù¨«?ß=}aì£uègù!Èæ¦Á3ßàa7å9Èè¦%ùÚäçpöùù¤¿VÒ	® ÆèÏz×³}ÁbÕðw0xç)½v|u"ÿ9xd·¥&Ûó³¡'öÓÁEùæ¶²Èç)«(µ¸çÖúðÅ¸»-ÁÈ$GèÐm_8µg^)À=J	åágPÔj=@óÁ"¡$m± x×Âøòòã'®T/S±g=}QxÉ|ßZÚÌ©¾ý²Çb¤è§Å©ØÈm&e=JêØEP5{8¥ØÍ±8Gå¡ýÎÔ¯OÜ_Ü£¡i:p*¤®}ÔLY»ÕrZjÀeõ%­þEÎzHQAÀðs9ÏZkÔ7W­h,~»+üCSÈ4ÉÓBÕ·÷Ý»1òí¼Tô´üFÍþOá0nÂYðO+ U1+_8¿pu¡ÏãdõkXI¾Îèü3ÓÂfsXPw¼Èt§g$ôQ²±~x½õtüÓãæXÁæKISsäToô5r«Y½u%ÎæZæ4¡¬X2À}AÅ4.Õæ>Ëuúoøº·ùb4I«ÊÒMÙ»êìR!»¹ôHÚi5´ÆPÁ¬'(U(»Åê­ìmHRÉ¿'=JåC &2¢¦¬Qêã7&S&;HJéí5Qã*¦cëÉ¯-C¸9#¡?(JQ½]vÐ©°n-êÀ_ª¹°ÕFUÉ¾ëe,f>ô=J8è0éôW=Jgºu¸½Yò+?ã0©¯¯>æhèëJ*)·*ªÉ½|*Lq,xÎE:ìõÔü\\âÎ¿9òPSdP?»QòoÎ3üÓØæØU×ï?WI½+$PÇ½tõýüüßþ~Ta¿àtÈÂ­øó£Îü|O£H@ù-pt£¹M»±õ©óx|yº~zHMA¾ðêGâÐæ|ØS×¾ÆZõG¼Î¨üSÓ®fXKwÀÈu7·mÍP!½yóãÏ¢L*óÏü¥ÓÏæmSºõocÉ¾¬ó»Aó´Þ2èGRÓ|hö´gæ¨­ññRci&ê¡=MAãDfa#a6	Å=M)ÂRA¯A÷=}¢Ö½ëIðVñòñY¢Æ±aò6ã6¦êÙÅ6[#æ¹£%4¦mõ¿/H¥ ¿Á=}UÜ]æ¥8ííÖ2¨d9=JUÜtØ/¹EãA*D(P}¼£+ù»wM"	âõ'ýÜ9f©(®!óã,¦¢hê¹Ñ4bh¬&ÑF2iÊEoV]¢ìÕ®õÇ=JÅ=}REkp Mäëö¯ñßa»·Ã0aÎ·gb?¾Ï·\\§ýE¤'}$Ñ\`ý¼ùSÖv¹ç	ÎZ1Ùµ%L|=JÇYýÆxÕeÔñÝ!¯Ñ=J<IHÎ ºîSØø+@¨Ox1¨ÙÏ_ÆÇæ	_Hðp¨ÌphEôDâq185½þñ_=}{Íÿ®v#fkWI1^_f2Õ)ñ=Júë¢¯oÔh¤:cã$àjàß{+ö¨µDÆ¹óseÿ"mÛ65°~Àï­[ä)[_	hReÍ¤Pý~)ïî±öë=@8è×ô¨ê«9ÿÉQ¡øgÈÕ¯i¡¯DèáîÐ@%Ö(ã×-ßI¡ß(¡¦s÷àVªM¾ÄçÉ=J+Ü®]YÏc%Uì·é"þ>#g¢!PB!(·ÂÚ&è0{i=@ÙHe ÑiIÔíO=MÐa_Ò©Zi¥ØdÕã_i)Ú0èÔ/#¶ËÇ¯£äÌÚ,K\\"Ã#çb9Dë´¦Ñ4ÖñÜüÆìë|=J&bñ·K9q°¥bR­ÍV°\\cô¢0ñÝBÈó°dþ¯ËxFÒMqCö{¡°¡=J¢A°¡¬A³1îäwc¿ÇcÇË7b¬Ëwb°Ë·b´Ë÷òo¶Ë7c|kÅÞ×¬\`/øû 4$ªÍY>3q	RM¸è|úF§ÑÊ9c$|kÉ×¬h/§øû!4ð*ñzZPbð°¬[¬ô/°RBmFsëÂB4ðBñ}ZbðÈ¬[ò[@?¶s¸ÛÓ¶¶/ÀTBíFëÂB4ðbñZcðè,D=JÊ//^ëkE4®­Ìj]FÞ=}/DÊÏRú>1o«ðbW4^ñk¥{Êk8¶,wúN¾­MkÝ4)C=@¶M¢IG=}üÌôyÞu!=}|£nå~hûXg¹ÁÈyÞuKÏ$;|§³ Ó(nåhnå¨nåènå(nåþHnåþhnå)(½GïYÄòo6YR*ï1z/+/n09´Ð2òOë5´ÂK´Ë,ÓCc\\WWÏEß¨ÛõD=@×}ÁÉ©jÖßÿ ì£èùø%ø#F'HÚAiïÈÚµ§A¥íX ±&+å"1 AiïÉÚµ©A©íX(±*å- û5ÌIoyÚµèAçëX$­2å=} wÙA'ìX¤°7åG ûiì-ì1ì5ì9ì=}ìAìED©AHAhAÁµ)ù¢·!híã1!ÈÅ=Jå"xèÅ_Ú@=@îM÷ÖÇgÚA îM¥ùGE5¬Ú;àì8Eu´Û[àðHI=J5¦¬;èì"8Iu¦´[èð"H7Ê/^«\`ú2k]17ËO^¯àúBm97Ìo^³\`ûRoÝA7Í^·àûbqI0+P-p/1°3Ð5ð790;P=}p?m	Ø"ùð\`¶%%·§ª	ù-[ìéù1[î}=JÝmöVLP#(V;Ý¦)@õ²IµîfáÉïlÌO[ýÛ¾Â(Ûuö)VPPå©W=}Ý)@õ³Ø9µî¦¹,¬õ/cíã®Æ$Þmø'XLQãèW»Ý)Àõòø±dÈãºÆ¦ØNd©ÀuóÓøÑØãÂÆ¦ØPe)ÀõóHIV½g¨Wjw=Jï/0¹iuz}¢¦Ü­Äí=MÁÿLþNH	ÖË"ß6_·ñqÕÒ£f¨WnwÿOP¹éu{}£¦àµÄõ=MáÿþH	×Í"ßF_Ç1ÕÒ#f©Wrw#ïopùiu|}¤¨Ü½ÄýÁÿÌþÎÈ	ÖÏ&ßV_×qÕÓ£g©Wvw#ÿ=J Dg#ËéãÉ¹£G°£i#ÄùíZ!­9í¦I6'Zö¤Â{IÚB'Zö¨Â'ëZ%¯ 9í-°Û96YBð¨Z¶gB%ìZ °9í"-°96=MYBð©Z¶iB)ìZ(°&9í+°û16ÍABpiZ¶ÈB§ëZ¤­q'±HB§ìZ¤¯5íC°ûa6Í¡Bp)Z69Z6IZ6YZ6iZ6yZ6Z6Z6©Z6¹Z6ÉZ6ÙZ6é £gÙHÙáÝíåa	ä§a¤=@ðDçáßÝ1i9ÍÉAêù=}E7ÝG\`²@E%£ï¹9&fèëq¨[	mi9ÃÛÉÁö!êù}Ð7^Wý8DÂ5·#£÷Þ±0'fnÍ¨]Ìi9ÄàûâÉAw%Z=Js-p&æêºÉq·WBÔÛ1­¨ÈW×Û4ÝÄºÐ1mxÒ±?ÙËWK»a«Ju§Ðý^·6@ÕÔ$p½¬ÆùSTò©¶d³kÛäÙÓ?4Ôþ}Ù²ÈÜØ8ü¤ã¤tÔÕ^_ÒiMÎL^cÎkÊy_«Ë$lÁþCt=@^ºm1'ÌáÒ	Ìdh3ÄFüÐhùwJÕøù¥'nôr½¤nÉ\\n³äpÙÕ¾ØóK@'Ð³;/0ÇiÆÐ¶FzAqwUÓ}Ðdm-¬Æ|yâ¨ÅÕdc¡jþ ¤ÿ³6Üÿ¡{~Ú~¾ÕÍÎ/?êæÙHv¶0}Ù5·=M9Õ¥w'Å6·=M¡g\`Ã5õ¶ýyÓE}Zg¢n'Ãú6þ¾¾·´¦ÐUµþQ£oÇ¼~wh£p'»Æ¸$IYÓ-\\}| ÔyýTÿ3#jçºw~ùuwSA7{\\_OÂäQ©´uËäMAÿIÃÊ³T1ÿ?#½=@ÕyÛdODo: \\¼mÇËîíi "ùÉ¡LM_¯ñ©È(\`LàjÌ}Vons/ãüëçiN~sE9ò½P# ¼æX)¸¾yAõÕåé[³æDWyø¿YÅ£¡Ç&erÂM©À©PõmÍ.#³fýPÙNóY£PpÂQ©½©\\Ë#R|@÷ÀwE=M^ãl HOX¿!q|a@÷½wÅ=Mvãp HVÕòXÑSÜ~ÏÏQ¨Ü]yF  p]Ìº~öë©I¸d¡=@]±ÑifÕèÌ hmÙñõ@KMt@=JU=} UAxíÞa¥v=@XØmßñ^\\|eEÙçÙÍÞj×Ö=@aGË?÷ÛÔÄQuÅ9ùCya4é%hLàäÈ²þ4'éÙA.ë§äØäÖÖØ=}ä¸dÑÕqSù#ùÑ)g&¦ð#)ßÚ)n-´9Xf~þèÚ§k%¦5õ=@ÀÙÇèUþDrrdcüº[a=}	ÃûÇ§^åø»ícGcG/×uíÏ¿o_µ\`ÉßYî°öÜôôIØT×2XÕXÓ5¯I7ßxuu£¨óÑpHOÐ¡÷ò{aÌq!TVÚ¢ÜÄ¼ÄÜ?Õµ@^ó	Ä	Àß©¡37UÐ?~a^ÑÂàeu½sGeqFI#úµA°µå;þQ»q¶s÷ÛÖÌ#ÄÄÌÔ¼ôü7ïwÄÝ¡ßÞHÄ;shhm´¶¶ñµàh@Åä©ès¥½9PIscÀì]MY¶cÅ_×"èâèÂÈâ9¸W7ÙX}å¤õ&$$oÅuÄµ¡ódºßQÕWöØSQÈFºælíóD¿óB¤ÀCWbüÒ¯kµ()#6²%1'\\ÏÒâ";3Í=}½ðh^&®³=}½}||9P]÷óñÖ'×á7	áI`, new Uint8Array(91366));

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

      this._channels = options.channels || 2;
      this._streamCount = options.streamCount || 1;
      this._coupledStreamCount = options.coupledStreamCount || 1;
      this._channelMappingTable = options.channelMappingTable || [0, 1];

      this._inputPtrSize = 32000 * 0.12 * this._channels;
      this._outputPtrSize = 120 * 48;
      this._outputChannels = this._channels;

      this._ready = this._init();

      // prettier-ignore
      this._errors = {
        [-1]: "OPUS_BAD_ARG: One or more invalid/out of range arguments",
        [-2]: "OPUS_BUFFER_TOO_SMALL: Not enough bytes allocated in the buffer",
        [-3]: "OPUS_INTERNAL_ERROR: An internal error was detected",
        [-4]: "OPUS_INVALID_PACKET: The compressed data passed is corrupted",
        [-5]: "OPUS_UNIMPLEMENTED: Invalid/unsupported request number",
        [-6]: "OPUS_INVALID_STATE: An encoder or decoder structure is invalid or already freed",
        [-7]: "OPUS_ALLOC_FAIL: Memory allocation has failed"
      };
    }

    // injects dependencies when running as a web worker
    async _init() {
      this._common = await this._WASMAudioDecoderCommon.initWASMAudioDecoder.bind(
        this
      )();

      const [mappingPtr, mappingArr] = this._common.allocateTypedArray(
        this._channels,
        Uint8Array
      );
      mappingArr.set(this._channelMappingTable);

      this._decoder = this._common.wasm._opus_frame_decoder_create(
        this._channels,
        this._streamCount,
        this._coupledStreamCount,
        mappingPtr
      );
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

    _decode(opusFrame) {
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
          this._outputPtr
        );

      if (samplesDecoded < 0) {
        console.error(`libopus ${samplesDecoded} ${this._errors[samplesDecoded]}`);
        return 0;
      }    return samplesDecoded;
    }

    decodeFrame(opusFrame) {
      const samplesDecoded = this._decode(opusFrame);

      return this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
        this._output,
        this._channels,
        samplesDecoded,
        48000
      );
    }

    decodeFrames(opusFrames) {
      let outputBuffers = [],
        outputSamples = 0;

      opusFrames.forEach((frame) => {
        const samplesDecoded = this._decode(frame);

        outputBuffers.push(
          this._common.getOutputChannels(
            this._output,
            this._channels,
            samplesDecoded
          )
        );
        outputSamples += samplesDecoded;
      });

      const data = this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
        outputBuffers,
        this._channels,
        outputSamples,
        48000
      );

      return data;
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
