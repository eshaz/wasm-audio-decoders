(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('web-worker')) :
  typeof define === 'function' && define.amd ? define(['exports', 'web-worker'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["mpg123-decoder"] = {}, global.Worker));
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

  function out(text) {
   console.log(text);
  }

  function err(text) {
   console.error(text);
  }

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

  Module["wasm"] = WASMAudioDecoderCommon.inflateYencString(`ç5¦§åIÓ§NGÜN8=Mª½³-Óü>¥U¸=Mfª.¼6¤jSÎ¼Ë»=M¢ì~À>.m§±s«êCFmiü¢ÄyY¯PîÄ ,mÊË´5>ü\`ÏËúÃzl¦éé)%rà½õfh=MnçÈ)$Ù)$é	;0k:¨gö´ÑÐÐìÓÅL%7yêÎ%ÆæÓn,Á¼ÙþN)¾ª~þÎ|Ò²ª½½fôtø]EçÓI.Éûî~bk=JnåòSl8%ÆÚÄ#Ëèsè!Ð¼Tþ¿BvjX¾WYZºÙï/~{W¦"J!WkiéévÝ	Fèÿl¨O2#§Å'ègÒ¥z³9®¡¯{W¶½ÍHÊ;7~Dç$=JzþÝÜÕevï{z5ÍÊ¡b7äÔßRØ±ßJxÌbX¯kF !|>1ûgY³íÝõ·<O§Ë¬|S²\\éB1+ú®kOØp$?nëÜb¿ôW°7tBxqý{Ïø¢Qè)¾~ùÓ¯éD/Ú[F5G°e­N¦qé±e­­"ë®7ìJ9½56!±%ìóçM=})ùå	AèQ&©'Øeìaãñ¢?vç ¡·õÙçGeñpa'÷©«çmé§#ØùÌÒîbqÍ×¦uè ¼çÈÀ	næ^òÅâPòÑ[óÐüJ7=@1ÏfFuuåX3Øt­ß{é¨×Öc)w:Ötç[Ç0MëÐâÓªÖÏÏvu£änû·º®´ÑÉ7ÍÞ[Ô;ìÍnÔ#áOÎríæ¡^9¿TÏ&fæ¬ú§ú´=}ÄÍ¬^ø­,ãÕ#¦ÔÁß{Ó?Ï«êEÿ\\4·8Ïà0¹vc»¿#¶ð©½LÌÞ¦^Ë¶^^×>Ç±Í!y´yü²ò9çìüîÁ.k¼ðóoÓsänZÀ*Õ^ü(Á¹¿ðMAG	ÏÀüÇMýïéÓ§×Ø^rÄ¶Î1÷Þ¥ÎjÕù°Ó^Üê»&ófÕ{¥(ótÞ-4&ó_=MÄ¯YÁ_¦¦É ¨aÖ»¹¦räéÿÿ²óßê+o,jÁUÊþ{jDál?<XÔø'ÔÌ^=@ý±ÉJæÿ_<ºÈ«rw[@V@´Ë'×rSüÑSôm_%|5j&Í%a|¤OiH¶¼kÃ¼^ã\`U9éUW¿qQ¸æ¡Ö½aýÕÆø·	¶@àÂ«æ»ËÒñlá'ÅSÔµÔ{öíB¿à­ØÄà_ù?Å0.[^ã½ç6rD|ÄöÀ=}¡êNækâ©7QQRLçÕÿ½PoBúw'S:ãVWìå}Ï+¾õÙitHôv9ÉÊH(ÍÁ=@·qýÞ3.Ï'}/7úgT²óÆ s%Öêh)(Öùôx³=}=J.íuÍ£¾sEú©Ä	NïymM¼ä^kUÀÏ'I¡ï·qQ.l\\*à>b-´ü+¼p¹¼4 Ô- Êw:ýÅ8KÎ=JµxÁx_æÁüK<|ÏwÃÂÊdÔD'=}&õ´ShI]0IÞôìòÀ-×®_:ïötf#2­ÓðqU=@¦érÕ ß¾äsIPûNS¬tk¤[&"diÃ¿FÖ²öy0ÍÃ~óýûÖTæ¼äùPÀÐ=@¦sÛ2¥eaº=@ù·%q¬IÿÔÉ('jOfWU¼ËL^*¢H_ß+½ÏÍMEù\\Ýÿ¨W÷4îù,dr+¾Ð¨Âòl¤ÀÒØ¾¶ïñ¼UíèL±à±}ÖGÊ=}ºjÕ=J$®'Ûü9®SòÂWm;ÅjóÚ'h:û$JÌ{fl·2"Ä_ãènO7Úædè{É ÂÍE¿Aju£a'ç÷¢ÇÖ¸m~à±Ës¼i³ì\\_DõßexEý¡cÉF3$Üà³by²½²¢þÞÃ°Tp_]Ò¢^Ý7½ft¦\`ÍÖNvuôtÏÀ?Æêèô°b[ÈpôòÒ×\`·,Ót+}_0 æ±wí\`&Ö^¢¥pýü×´ ¹	//¼y6ÁÒ£Îº)òÖ5WnãbóæÞÅ=M©Ì%ìIûý#;òñé©öÚ;Êi¤¨pcs0·ô2ý¬t­UOóåìNµò=MT\`ß\\Ô\\á¯ÖÜÎm³¿¾îPÜäya=MHÐÏs'ó3Üþ"×U{=@ÙjXÁ8Îm»s:A«²A÷á¸Hçõg\`ËY1ó}ûÖî¤QD¹Gßoy¡~}bÌ¼ÏbÒÕ2êpÖ.xúæ³U|PÃWkonÔaòÙâäe²àðº*èéÜ´òÃÆ³[[È-å¤"ÑaÐKôÉð^d¤JÕ§ðý'jÕ4,MF«~ý²ñ\`ôÄÕB·¨]Çÿþº¿äÕV9ÅÝ¤@à+%¼'RF.Â¦¤ä2÷Ü^qì-^Õ*ôû!}	<£¼k«O;ÔªR/hWÔæòBµÛ=}r!6A¿Ø84ÿ#\`*í ªqÁ¡­¦jË×|]\\;Ë¶é7[2ã£»<]Ù¸jü£*ôSìó4A9ú¶;ZØ\\ÐªÕÖÒqrË,U2Å¶å³]Gû¼_v3ý¦sþH:=MHvT<3ø·º¯ªfw"ïTÔ7ÏÈ¸Ä7µ|°½K}6â²r3^GDh{DÀnöhç®Â_ÄºG[»ÏÙr³¹x=@Bg\\ÅèdpôEA§ã×lÅÒ·µæô!$oSoâ =}ß9Ïã­é>ÀSÿ´g§ÅVô=@#4oûp° ºÇDÝ^èSy\\²ñn±A#Ìr½Öõ2ÞY]3RÉ\`ÙÞÞù+ÊÒ_¡-óÑtrÝýî¨ØE°ì>WÌBäéÝèJ¾Ú¯mmÕp¹ày:ß p­Ì"dGU¬=J´=M}U®Ú$1«@ FÄU~^EÅ'¿xq.}v6¢ny½÷rRÇürV|8YdßÎ{|Ì=Møa²SP>n~xÔþTbCd/mÅÓén·ìdVÈºD·z\\´ÊÞ4£Nôò+Úë²Þºt%=}=@¨[1.1§n·dI]­ao¥«ÊUWÿæÖyCÛª:=@m·¶åÒ\`Õ©µ¥Pú6©f­ß8Úþfì=}Û{tJzÑ%b[ÍàWLmí-º¡Ì@oÜ´zgJÎ|Fù+¾k¾ Hâ«YEª)o!0³&¹l¹d~g'Uìÿ»ÅF¬ÊYedüûÀÝ¤=M.¦iq½2þÂÿqcZÍC{5ÿø^|\\rtß|¯ebÒa:J:ábôJíÛ©u¸®¦ròwz^¿i&%Ê0eBIy)±Ú#4ñÁIs@z³â3"øóÙq[Æ½¯GÆzÒ´:x¯À	Ä¿=@{§Æ)Ûsn¥±e©ñ­xÊ_=}=MdrD¾qªúªX5yA&-ÖN\\´¬çt6Ã: ­JûMô=MU³¶Ò]%CêóÕXËî bºìï÷Cõ=M;ÆàMeó¢!(øö Db03l¦þ*¯Râã\`9;Ñµ¸Âÿoì¿®mûHw!ú8ÿé7ß	AoÓ;úå\\2Ry¢8äßcs¹´Î¯àïüÇº¤^m}Á±°eO;ÏÐT=MéQP¯®ø6±]'ºJ ñY\`¨¦¹G0õ¿©yc¾°pXS)E"÷W±9ÓM9½Ù'³»Iè$àÁéÎ!ó!ö	¢úmÉxØ8ML¯G=@(yí¾%ùH¦ùI'K¡©5	"HßÙ%ÇIçç÷èeàF Ù)y	íIRLbn	³^GQäDföÆÚm"b"¹¨&ÉRíõ¬¤µà&Y\\ilòé±Ä-°pih¡%tpghÎ|(×9h[âã'à©þÔùAYÌ­­8ÑÏm÷«­àOã¯}3¨âzº ä¹*Õõ	fHÕNôyfø¸@ÙVô9HÌ¬¯á's¿}=}\`y®ôML¢ÒGÒTGI=@ßê'LgF©½»×·\`YX!î+öö#·4&±»XÊôÜë®½ÅW0ó©O=MS¡ûÖ#ùìcG¹äàá2)%½«BtûòÏ¡CyÊÊ·YÇÚ¸SèÉcC&æ :Á\\rbÂÎJ½òBÁ2KÀM=@;¢c v$Ö¼N¦íC.Ò¸G=J]=JmeàÃCt^fl¯G+QIâ*8{4ø¸ã÷2eno÷²2[Dß¹úà¤eÜ4g7¢KÌÆj2±±Fîk=MLÊ+¯ÅN <¤rÏïóY¿/ÍåbTâmôÚá°:ç_¯|×bð°®ß"þ À¶|!àÞðç×B×\`ìÐàá7EÍ7·ûïðÝ¥åSWdÐ'Ààknvrº3Blm5ú±ãZ½Ò_Ürrñòäælá3m57¡.Ws¥]^»¡çëÂ@~u+wv«ÑE9+D;e¨Z!i;âë\`=}:¢Ö¡ÚWº½ç¬µQ~´Û|ÁP"Ê'cÆiÕN#GáÏGöQ¬¿	W¼O®#=JÚ XsAv£¨ØHøÉ_À±kzGgdñ8Q©QFÑÑ0¬_ðsf ©ðé*¾0uqôE°®TC°ÉF4mâqÄ\\DÄY×´xþÊ+º¯B{VÇi³x»¯ÝÅ²Ç{µüÖW«Ý]$±RGã=Jøi=}FOäÛÞæQpû$ß=M¡Ò=}\\ÝmÝq?Æ±×¼ÁM¯IÊo=}&[¨®mjC,d]ÍÊÏî¹â]8l¤dê¿?lFxÌcæÇEÿ¶ üE,GçÛØ¸Ð¯Ñ¡ÿZDçÍéGíç£À{ST}²(r,Æq¼î¼¾7Ý"ô\\Za"[v<EI9{»RÐËØþIïÕBÇ/»ÈV¤æQlq³Ón{ìYÕ°Ýd7}.cùzåZ.\\'y4HÑó-qÊµôr4áãóúºÖÅLbn((pàz«Wµ»îáusyü´ú6ÆÃ=@6G×Sä;3ÐX!Ûïc\\å³Eâodsoy¸w»gV\\xRE:.|¶ I7þ;¬po°aôqÜòµùC®\\Ý}ÖsÁ;t UÈZãGÒJÕ¸cT³¥B,^àÍI&=MÉ­6$±X¨÷7ºú:u(ÉHæ%%§²^ù'&§($	¬\`ÍÌ©^&ëé!À§®é 1yg¥©åÃæ&Á/I}a8©dyz9m=M£¯¢QyxgØÊ=}â¨ØÚ9ÌÑ±ØBy¨FonæZÞ±Õf?áXuk³Dö=J~úk³\`)ÐX§5§2Aº~-1óOÏ2epBklÕ½lMi>~¢2ÔÐÒÕw¤#äèX${ÈÀôßÔ@òUÕèQßþßz¿MéÆ=@,eZx+µÚòVÍçå¥E¨A+6ÌLg_ nò|²Pk´d0L¨ç3AÎã­¢ä;Qq"{c@=}¸?&ÜFù Ù=M¦Xq&CîHz&4¤­¨îÄ|òÇð=}üÃáaS|ÒÚE¦TU¡K¿çD~J>_æn=MÃÂ¡MÐÆâÙõ²ZÚÞ=M¾m¤:¾&Mæº}jDÆA¯Éð=MüvêâGfXøäÜò@5ªâ¶ñäVÃóÔÅKV=@ÕñÄÖ[½\`m4´¹ñv=@áCÌól±:ùùøÄóÜC´¹×?XÜ³ÖºqMEÆó°\`-Ü¯=@ÜÝRUÜÅOQb9øLåý?]r)]C)¡¸à;à\\h½WÜ¼dãpwÒ°lh.íÔ,°R}*üîÃv³\`uë*Þ©p6£AºÖê,ÀØ,+­]CïNÅÏªºÈF_=MIS3ÞÝYäÁÁ¹ãÁ_#ÍÆ¦çæV©çæf©úçÖ÷É&E¥iYÕyãÒCã¦èÉX-îÝüèPiÝ«ãæClôÝ#áò=J (vàX§s¨ìö<×ÄóÉSüãç®FÝ#ýXÊ_ÁZ]½b½79P$MÃsS¦­ÎÖS_ÙÂº¤ü¾4XLU´HÎY¥|ôó§\`ÏÚ¾=@öÀ÷Ùv=MÌÇýRß¹Å#rïýÔÎí\`Å7UbÇÅFwÝT7;®×ÛÚäl)V)MøØÜú$üËãÖÀsÿjÃsgfÅã,¢À);5OùÇs=}TÝv°ðvõ¡A©ÿC.Ôã/²nññ#ÊÇ@ÛSëÕ7¾ÔµUÔ°±¯³ñ¢¤Vì\\-]Á¿;ºèÀSÍÜà´¯½Øw1ü7twøÝÚß|Ðÿ=JOÊh]õ&Äý¤¬÷ÞEÖÚ¹Å"B9{©í-\`jj\\SÇ-Ç¯³ðbUg©\`WÝêý,ÒðÌ@JY1ºÌ9Íy1£Õ¡~¦e>Iéê±¾,RééÍ¨Õ.¨ËL\`â´aÂx§&áÆúÁè¶ÓÓz¦p$2o=}¾ÒÍ»§æ»¹ÐU/¤ôjkooë ~îï<=MÚÚSZ¥þcÞÌørüRuZG|Â¸ gI:«TÊ{JâÏ²vîL2zq:}³®[dtÙ¼YWtèÀ9ic5áuØSÎ=}ÓU#|5½tùÚ:vc§ÓKÑ¯¼9Ò; 7IèûFúOÁÖ>/­ãóWv~=MälÏee§oª#Êt¾æ­9íRjìÆÌjÏ"Ø=JÜo¥·8ÍÌÜpLJá=}hñnÇx»Wu©àT!X/óÑÉµ¥ùØóQmÖÎ\\ÑÈZ¹ïÃ'ûYu^Ób3×·hëZ­y´S ¼ ÒnAÁwí«9^¦°CV­Ç=@pt7Ãhn¦åN\\T±½Kó=MÐEºûGÐÔ¥·=}=@Ô¥ÔN¦B¸skßC}BúLbÆz-=}¿ðDán28>Dñ=MríÃî¸kï5Ùm83ÉRWHÅM²îúÚ-¼þ4ëgz¶¥ÎÓÛE[|»ÑÄ±=M<Ìú´¢#vêÿqlóVFd3Ø¾r­ÊÏUÌï¤=}!;HVèýê(¬¥K?=MaEÆø+éN^k+¸¸Ô ¨7(9(7x¬ØÌ¬7P|¼ªö¿åqòÃVí×ä-eäÞåþs=@ÙÂÑ!z'JÉÆá-råýJÌHÞI­Lßb=@ÔQZ_FÈ^@~S)ÙQy(ò$"±UñYa·FÈé8PV1´È¤«S£÷TÇó¬õ#÷Ñ\`ø9Óyk¿¹ö É&ÕX%yh¢8¦uA:!ó1áhÆy	^(2wÒ÷ø|³ùgV#¸äÏ@7åÍ,i Ûpt#=J#y¡êEYëÙûiF"èÛêô#É§énn!Äªí·Ä\\ex«C2¾¦hFÿùþ¥.THÔVE,Å¤Á±=}=JÜHdÍ=MUGÜð»LgXU ¹Ô¼¡qÍ¹Ú½=@ÏoK^*ÅAeøÆn¯D_Z!	M	¥íÕXå?eÖõôI%7g Ã¡fËñ±iÞõ6GÇ0+j¿p?,¨PÃÇO/ß:û<À¥§þ9¡å¡é ä÷¥à*õ©"ü)=JF¥¾7úìJ:ü¡dÕ¾q­ ÷ÐÝÝ3|gWPÅ®DS\\Æ½H=JV*ZY\\z°wñ¥uv øçO7~ÛUÜuiã#¿]üèÄ'o"87r%\`Õ!¥0¦¿¥QÞ®¥Ýé.D¾O&CÇH=}ÅeÄN¥¬Ûg¼ä~KcX1[ÙüüXËÄüÈvþâíðo¹¤¤¬lzèåW×¶i\\ÕX¿Êßµ¤¤¼­{ ÎØ,áF¦ùz/m4a,mW²'QCÞ'¡_9ôãõ¤(i)Xí¥í)è÷fÆ¦ò°(f×ÄvçÓ?_iMþëº÷<ÐlÒkÁüIl9Àu·l9xB,»×[J¿¥x¶0DYMy¾3M?dL©VC¹M[HÏá:¡vC=M{?û,OaSÐnÙdÌòå:M°ÍWZeð8ÿ¸h\\ñq¼cú~A¬î[ «¼þàïÊs{÷Ns=@Û«Dæ4½N°aÅ)U}À2å´'®½MÅ" WðºÐ2¥îÑ5ûçk}z±èVl.ÐYfè|ÕòáØyÉ;zhjSz8½p>|8Ó»,ß¿KvÑËãö³A^<ZbST¤Ëëéµïq7^éGFQãÒ}+±òªÃ'DÑÌ1y Û\\EEäv-ñ²ÊJ=}.áý¬mÇø^BSÂÍüJ|¿a%ÀøFý=}à<v,¶Q5=}þ5Zpï^vx[w¯ÂØÇZÓÓöïú\\|t|DWBñZÕ¿zÙTçÇ/dT¼dÔ<´oç´Lç¤®\\<©|Ù\\ÎÒ×\\Q>TÈ=}úGª{ö¿ãÜ}ÃüWQ»_çi=}µd´Ò	=@;=@ßÐå"÷Bï¦\${Í&^ãvÅVÆõï¼¢GäoÂ3ºS=}$r{}L»þÍÞ­3=}µcËw§Ti('¼2¢~axðpPûH{V-t¤\\+ò[,oâ\`sYzlÌuÑmã¢GtýÛÞ=@uÎ*Ü±ûßx=Mv¤,÷¤St<PgD®;mo=@Ç®ÑxJ¡Úc+Óö³ºc+I ¾ck|aQìý÷³8¿e}Í6l§ì³µfxÖd_t{1M=}Kã=}³Æ&V:ÜjÏ3¥?UjÔ-óËSqßlÌúÈ+Ñ½ó=@®{nÛuðm^ÐÖÖ\`º;ZØÌ%Ò°FZÒÜÂ~QYpKpo¬Õ·òP¿<ÃtÚ²ë.|þ}Âs§B5òåvõxOTsT1ðy¿Õ²_Ô¤rÐÓÍ­ë6Ù6*ï[M×õ	 ow¢±=Jâ=Mv¿Tr8Wï·û_:Åp÷ÍZvkúþXcJÏg\`²çýÈ[â)RïµÄ"nwÀ<Î?çÇBlÅ[=@ïõÆMtÈY[ð;ãJòÃ¨örìp­¦oäõÞpõ#cV^=M¿^Û3¢¶è½Ü¯ßõÊ4bìk²ô"°Ûæµîtô²èzÂOÀñ|¹ÎÞò=MDµàt=@*}<®k_~J@=JëP~w¥)âÎÇó¾lOZöT¬DwÜúÁßùÉLvUWüV¼¤¨Hêøw?2êêtH^Ï+uÓÞ=@\\õîãxB¥d@:¶õúúÞøÍ±þ\\(ð ]ç¸á´»Î²]çÂ-eëjwÿñ2ÊCúV¿÷é²ÁFñM~ïxÏ§Áäw],¾>äð:{ñrîØ¿Ï·}ôoW¬8ÌÄKèjôµ»øæµ+MPá«yÓ/kÕPà=@ªô=@ùúÉm¡Õi$_à=@S´sÁÁF÷¹§PþÔPr_3×Çß¦ãàÚ~Î¬ÙWáÁ\`¸Ðö½:CH/{´áDË ã»6A?ÎÆ¬v÷Øü÷'dU²ª·ï"Õp¡¨GÀSwÙ´\\×§x )¦Dß« u=Mà¸íÉj»XqÃiH¶ÞtU&éÈ?ç¿ÈÈÈ??§n¢ï´$´ï´¼;<Ë¤ÒÑÝLkDN(^ý5à0*÷;Ê¹o:VA\\Ós{DX°óÚÀ=JHz5IUµ¹%k7Î½íÊ[¦Jg6ÛR=}úKÉ°æÀ ûù*¾-]E7ü§,iG16¢_ÏÆÑ0¹Ò±¸iÇvabü¥Mu:ï>=@7I7µ]¯­9þ[Ä°CªNDÄáÏgôR²QaÊ³Akÿb=J=JrpÐìJTªN8×tE¤ÂZX=}ìºÀRè[MYÞ}ðnGfGÅ7ZjDÄ] FùÑÅ@?¼) dÌ21¡9QöÕ«ÞöÄ¾ÂDªO7ºÚäH(GÌnÇ³ÅéÊ3Ú7­?U.cÐÝÎ*ÏX+rX[Z­%êdßPé=@8þD|åÑkÙáwHóÅ3B{àÝdÎ» *º+áBÌôD=JD³tì[~uêdJ¾´h[ìôz%Àè°BF«ÄÂë:Ò¦ýT:³Ù­ïØkÅ1-1ÔLBH­»¦Öl/PþOOhI>ùB¨zñª¯7øveÉ@³¹JwæèÜÕåÐDÎäü?>rYÜÜ´ñ tDîP2<9W3äõ\\PN#ÎMüIfòz[DßF;üûNÏ¯Ì]ìpÿ>W>0è°ßäÌ7Q8LR»ç{ÿÔ-è¡|¥ú×NXÐÏä¶j¦¼ Ãláä8¢=}^¬ø»îÓÅXîj'¼¤w+²\`Z<{L¸¿ÀRW<ÄÄ2ò{Ý1§2ÅEg{)~-E¯Æä»¨=J¡çbEàÛùéíY§5Sã=}ëèz %±-~aÂ8RsËûF õy_Ù¥ËFC"zË&½)\\¯8¦üRdÑ=J2èloù³ês¤²¦´ºr«ÍHA|êFg 2{ú?ö%aW¢*WRÇs¿VHõ±+óÒÇaÍ­$§ Î½úHîÄníÖºÜ~cÉ±¡ö3¸û±áàÍ~C.Ð­÷ý!¯DÿùN³ae;¸ËYcÒ4ôÑLôÞ~ÙBY×bX3&~ÝN¦û°h¤èÇ´_U4ß@ÇÿÆC3Q­j} Ýp[Øy5{­¼kSG<8j¸KQ×æÐàã¾*jÏldÛë_ëE WQ_Å£õ3j©H§bEf­É>Þ[uh½ß=}¨8³sÀøè-L\\ÿöGpü>féq&dyGÑöË¯dê.-7>æ=@î_égÞµÚÖZ(µëìçá³«ð³üð5"Ä^oäpSÏ¾Xåw½Øø #¾58¼Û²Øë®±tMy/ZPXh"Q=MøÐÑ àl¢Ë=@¬õµìoßo=JÚ~@ÔkF]üÂ²zþª©ËµÊrQðÁ®+LGÎòî\\LR>9ÔSb|zÑ;P¶½ÿÝP6xØ¬ôó*'S3§A7L¬JË·kCÿbr\`iÝÛíaü¹Ùí©AZ1*ÒämÃQ@eø3û°>Á$Å¦3³ã~òðdübÇÇ7ß4ÜÂ#õ®ogã_D¾¸¢$_²N!ïÙkîJÃËW7ô*ðÉ¿[wo]]òÉ¢ûdÁ=@v¥=M-C\\ºl7?fù4³^.³áË\\ýõþU÷×t±LÃ°i^D=@ øóÖÈg»Ë6	dDp3|#Ã¬ÒáTÑ=JkÅ·khùóëðkËûoº=@:,s°£Oâÿ=M@Ðòmú¡F&´{û]à¢ÊS^t#03B7B²}{(8°ñEê±³x°ÃÇoåA¾QãD°oo¸Ã>S³ó=Jb@0³øPøn÷ÒÑð±hªHÐùJiÕÚòvyD°÷&1J®ÕN 1!æÿ>ÈÎ®x_Ñ±DªÈ%ÓiÝ®¶xFï"ßûí!r:e¸èºýéöIJ·xS¿Ú1+áÃ ¿\`O4!rD=M_VøyòåÛyu#LøsCÐ¯NrÓ£àìÃÐZGÑ·cWRÈÑ»ªÑ±jQcÝ®'«Ü¶qpEîýõÍÏ£¶·¥ð«5£úÿ0²Ãp°þ¼¨<²H;¨ÆÉ@B­|Ô=MÙì±SH%é¯²KJ5û Qý÷vÏÓYHDôÍ´3G9=@Ïý[Ç,õd9_á³}Þ;Ì½O.#ÝtÜù0é;Ã5½8äP/°_ÀtRãÝ¨E~0Ôü´ °úLá÷¬hæ7?·%´O0]\\"¥æºÈÜ¢¡È·ûAäÂªD^\\7)@ë!=}gþBtGÎÎÈ}e5ßÄ=MêËôÕ°yPQGG&´÷Â ,¼L%ÌÅµÀ+ÍjÑÚS!ôm\`h i0ík(m9vy[É´=}×ÆEGæQ>Ùº8O²¥wÝCÜ§ ©Hvù¾ÁÞ£¥;£ÂíÐVÚ[$²eî>VEÕô·«~¼oRð£¶Âô	É³ÜÆpî£SÊ\\qvÑÆ=MéEl¾V ê:àáyº+\\:üRÇìTræ^óµL·}}etYGS¹P8þm´£aù&(ñ¶géü¹¦ì§y!#¹%¢óòqò³°yÙè§ÆµeöW1íe«x¡zÖê87hªEbHÐ_5iTÒÐ%êäæÖ·È'i/¸'3XÊ¾Æ:u=M7Y4hf¤JfÛÃ&=}D³­yN5F¾¤ªL;Û)3m¶:e!ì2ý½ø2W)Q>DF=J6êkéÈÍñã@´÷Â7»]é))_æ2Óìx]I÷(PBçzxËð:°*àß9p½ÑÕZ459;^¯klÁ&Üw¿fwéYÓ"åtÔÍ#Ü¡è"tbx³8ã´J=Myò'ªBl§õ-NWj7H 7\`»@¿H&ä·©8ÉæÛvE"J±&ÊÀsnGPhâAøÚw±°-ÛÏÃiZnTõAÁßê°HÍgÊ=}Eß ¸#/*]6Õröl=@e;/*«Õoxæ[L­	3*ñDñ\\<5|ì£pÉXO©µ¼×Ë¼Ðz¦ûääéÛØ¼1X\`OE(/c»FwÂ1/1¾=}B£*_xlÅÌ7÷µchj=J"*£møJzóX­ÙI'Eó°ºoóaôÛ©vÎ*ÐPÓæØÂu=J¿3l½Ý/}Æ.@Î@ÅN"ÇÜH7¬¯~ìMdßu*^æ}:4®®¾ÛßOâõ!¢Ëç³lÅ=J{o!¼[?¦kã\\Z8WNxýIó[¶ýQ|\\¿CÝzQ=}XrÅb^;êk¸3ÇØ¬ÛBýW|ðëät=@¨9·a¯=Jò·:Ð°ØËwO>k¾õc<ë$[QAÊ]M­bdÃhÅkÎZ5ÏãÀRíÊmAÛêÁ½µ¶¬ýYÝåÁÝÈáZ]?«ÃÐðÖEÃt(4¡P,3´òã´'äêðlè´ìº{=JÚ{ßÜÀr­=@í}9fc¨ØIhü>Òs*&=}d¨Ûç*7´áàX|ØUe/¨Q.·¤\`ä T¥×OÄeqjÉîW÷4¼v­oõöäPÄev(}/1 Û®¢ýFX÷I°ýêk}+ªõÂâÊ­/Áo²  ªª½K"PÑ	w1YA,í1íÚßê¼ÂS¿êzÜüÛÖÔÂçõúP=}aÓlÚtöñûLw8\\|Â_ÐegVâqrU³³È·ê± l<þÅY¾ÆÂô[ñ ÁÃøæl¾ùïÔê«ád=MWØð´öý«øFeò³¯ÝëàË£ÉÖõ¦0#aÑ &d²SK0Æ°$Üç;)do\`àçõ0qWJ±ÔdZxNüTÈç|æ{ºü¼æPÔKi@Û!Ë*RTËÍËmÕRðL¹"ebJUèî_¼X_sñ;ÀÔÇÕÆ½Ã\\ÇÿütÇä:A´c~þ¨Ò©í¼$aå$aâ¸aFµ[È>v8Hbµ*ê¢Á1ZTTd+	]PÂÈ¸ðõò7îrÓÍY³¢°«ÒÜCÛZBééï«Üí«Ü3RUbÏì=J"x±ìû½\\òÖ.ØÎ¥bLK0¤ÆMñò(¸î:WoóíÀ·©Ã~+9O<ðÅ=}D?[ÀAü<.¸¦oÇê3  ÆrÐ÷WzÒÀá5Q-µo½ÂÍz²]º¸ç=@s,ýN[÷¯þÐ<Üó¼ÃðÝMLäÇ·CÚ þNüòtádýÁáIxw lSVeÿ0(¦óÓ²ÎCÐóã«ÖÊtôj$D<SòèS#ýÒdÿt2øÉyQÔ¬ßKà"<y»çuGlÄñÏ8K0h¹mòÈodéxÄý%ù2å=J:ÜÝLó^GÕýÍÙàoXs¤Éñc;ouÇrqIá¹í5#çEò]?	ý@üÛ:M©·Çæµ~4a\`7±h@[ fc4Y33ñó+ù>¼e4Ûô¤:óÓÈ9=Jøø#8¤=J9é%I»VJ}ÆV@oÝÙ)m¾ÊøõØÎ®&ÃWMþçGFrS9WlÅþá#[îÏ¶CõÄÑO%»	ìyò·Ñ÷ÌæñùºAßï£¹ÉÄ!«]¯ß»)+õY|o åWåãø5qF}L¶±lv±~´ÆòË¸#kVóîn{Iò<AZñþØJó|2ÈjÝPJz ¯1jÄò$qè~Úa½¹dV»dpò)ÇÏó=@Ô>w[?þÍÎr34Ý	æPèÓw¿ÃØ=JA¾}%QQúkÖY7ýj¼ÕÓ¸ÑM¾bµùk¦¢@Ã5ùK&X¦Ã¦à$²\`³§¡dòQÀùfÛíkÑã:ÏSf1Çxà«ËV=Jîª·è­ñLf¥Tí#Æº!úú&¥ÈéÊ}\`ù¬è=@oíuÆ=}øAñò*¸4s%^^Í¢\`÷·Q*Ùäoäô¨1üÝÎä«*²~Bjb¹ÈD,Ë§Ù~ñØ	ÒHîß¼I;¿»8qXäõ¦m_lq¾"Ë¤EpóÜbU=J	þSm»fYö|õûfXs÷ÁßËÍÖÅB gTUîÕR÷^>ÑødÑmzQ~À5îªk1aôÛS·s³NTÉ¬îRZÆR7|"è²a8^9Vsn>=}MöãnúJ«Éj©û=JZüÔ;'ÐçÖ¯bß½P#=MÙR£yh}=J2¸Û~¶çÂøåÞætÐ&d8@1¿ÐOðF4¥ãÁaöqNaË\\Ð|¸à­¼qjºôÃp7¹%5A|õ~Ónô¸=MóT~=}Y§	lËû{ñ÷¹&ÆçÈÇðÍý\`sÆ¡=@õt|à­K±GL=JuýfpÛá¦¼n8ÚþkÇÀ^Ibû¦ÑbÑ©rVGéýÞ^#÷ýkFáwéûK´òûmÂ6ãOôG7û,=J¼Õo8f,ÒbïÃÀÆûúoÿs¼1ÌbÆêÓbÐññy=M_5NÍò$=}*cç:GíË¼ëÐ83ï*=MmlO=}Odï#%u ¨ñà5ØÎs·h (\\¸)Æ=}~§@ô<Z=@@Su#=M#±³«'ÚcQ\\È¸4tKHf§ä$hÐ$b(YÔ9	{um=MåÍhûMãå1¥Þ¢Ù!\\Ë9¥v5Y¥dZÞßàÔ|Ý&¼=M¹,îÕxQº¸Ü¤³"Ã¿,8$Ö\\!=}(«pÛ:ÿô»8xiþ«9ÚødÈ(SÿÅÏÕ/TzÛ5ßæ4NÑÇ>s¹»ý4 ¸~:Aß>¹=}hö6<3¯¸ÕÑ¾LÉ×ÇíaåÜq÷ðò*½iAx+v80^=J&¾jÆQ+odÄÒ:#ËÁÁæ°íÚ¢64âVr.÷1T=Mã÷!2%)jpÐÖ?VLEÝ#Þµ\\=MU6íRsè"¡·ã¦!»ë]KÏÝª°'ÌÊÿ44>ÞäÂ3²ÖÛàâ@b!b1ÖôgÙÓÃ³«ì¯$én ^_5ubp>O}_êY¶ê<^V«D/=}ëOj;ÙBSdzÊÜlâU©ÄóÍëv\\¤Fo½¾e0ÑæOÝÅ=@Q@üçì8µGådí_ü8	<j](Ñ@àë?À¼kHÖ¢4·»åUx@	ÖH£ÒSeõ£Û§ôª	hÑá|hZ|n*î¢§N\`' 4øð²øzP<×µÔâÒÐCß%Ò¾x¦ZÝIßíoÃ±¤vð§þ÷Xt@l¦×_ÅI/t{¶\`ÍIåµüÇÙ÷Íà¾|ËÓ¬2G'í|æÿÑAËAWÙ¹ãèR=@Ì$×pIßå*ðÌX\`b§þ_o=}VÔ×{eµ°þd=}I5o¡þsI¯óæTW>9C6±_m7æ¡%QÜ[4¨î	\`£Yî»FC\`z1/¯Öîu¾w0æS½ÕLþmx#ªZAh»"Gªqís/ø\\M6öoÀ²M=Meûm.NóIµrþLG5}eÃÆÂJPñÆ=}åh	­Û]¯ihY«Óóï¢¡<<Q+ûÓë¢ ¤=J°|9RcOëKôòþÐBé­xYÜçkÆÌúW»r-Òè~-G"¥þ<zãÓÂR}Y­hNh¼Pô©æ¢#²/Í§ûçI³ Y¡K±>¼©,-§:5æáªCí§ì]Àè¢¶:2lëlð&jñå®o±Ö^ÊáîffW¯Íå7v½è0#ÊUwÔ¨kÓ¨Q2¬çÅyi=JÅ%Ðmãë©\`-þ^½Cb¶W·*³=J_¸P}ýî¦PkÅtHÕ±ç¥ç­¯àu¯ü¬0KQElUeÊ:Ì8I®?bJd	Y|m^9¤M=}KÝpÄìhú¿3ãså[³  ¶­DàñÇ=}ÂH·=J×ë³¡ã[Ùà¥½ì3¸}3 fû ¥ø_q(O1Óùß÷f¹ÊÔV&ÿ=J8-JÏÿ»¹»[¿L­c»ÈÜãwëF:Ç³ì×²k¦Æ¢HÅï'|ëdA\`¾ûååH¤4E@fò@}XÛãçÅøÍ³î4Å0ÓïLéH	^Gn\`Ádqo\`4A}«cqü:öüjE»P§9Ê\`ú/]|»½NÌºØ¹à=MvããlÛ<Ñ$úîÊíBBXM{;{ÑUÐæ=@âK{R^Ëõïæôú3:bÉ¶²Ò|U¿AÙ]QYRíä(=@&ªÐÍË¾èûÌæ»_ó´ª»5+c;M  9?ÕAÛ0y[ÿlIíÁ¯âú¤^øP;P¤²S$Gæøä÷àèÑ÷ççÍOê¨ÔþHÄYylâ¸xªÖKpÍãpo?.;×@G¥!exÖ¥KæÄªzuÃþVÊÈ¥ruâ!àµIåF¹üWØ	óÍô%>Æ§Ò	o¼@ñ=}¬u=MãbÄûÏÞx´¶ÏØ3?§ÁFot eæ»&^Z?³ìÙÁÉdóã[Rbu5¥áK	v~áë{» <0è<]>ïmÕ[bðöL¸¡ùÞÖUËKG4'PñCLë>'Bx,ñw².àîº|GmÛ:5|ánã|Ó ÒÁX=}Bòb­ÅÌÛï\`Ï$|#¨Ç¥ÏúÿºKDpÆ38SïbËmKéðø^ã8#s¨7KMÀ=MÉÜÇ\`´àg¡q¢X÷ytW6¤J^udÔ\`Ýir]Ê¬³±.÷8Óê¨1â»ÔÑGª1÷ì­ÞÐp¯wa=@^æ×$eÁ·åÇÅXÎÜÎ\`ê¡{-M3eò+x+Z¼²È=M¯f(óñw¿1MlÚHÙG1>]W?ÞN ë¶ñAÊøÌrÎ¿¦þrÚýÍÉð/K1S¶Bp"ÍxÂBÐ}Çûùô4øÚäK4­unQA®ÐÖ1X2UÜÝ.$ûVgNT=}kòì@gÆýÙ ¼Ñuêö[÷EìÌÍßÑÕ9£I·A_}pEðëÌW0»-îä¯¼×^ac~QÊsÑÕ[ö,n]õ¿Kò¿/\\O=MïçZ¾¸öð¤¸}]^îQ·Ál·=@Q&f§_dºR½þáW5½Â:7©òãYw4§\\KîÕ_"\\Àd1¢á©[±ÜkW}"iZ±ÂDüõZUÔIÞwX$pð)Ð¯4d<ä®2Þ®$uÒoWKÙ,ØOþ!LÀºw7Xr=@òê4h§ÂhtÈQ#¾9ÉK­¨û.hw}$Á\`¯ªow»Øt)\`ïÀ.v=}>¾dÚeé)­»#öcUgµì¤ÀÛ4p¼ß²0yýºÐVß@×a?³YÒ9@ tcÑÖdW\`#Ë'?Í11µðúöyyißK)½vÁ©TG²N!Üw%5þþ>è¤_:þ¨/ò®ü­ÍÇ5éÄ9öyÚ!ÚöÞy@åFd¢ëÞ½?åªc%AD¼~vA^·8YW-ÌûxR3\\ì=MËD®ÊMúC Sûàqón-mÊççÊ>æ¾<ÉÕ|_Å+sÖ}ÝÜ9BDß§êêî*/Ú¤)CÛ$iáµ$ù^ÄuÑ5+µÐµçÅX÷A_{vA8£ËLÉÇëºÿ«ßÅÑÍ$©õ@Þ;z'Þ2Ò¨.~¡2ÒÂ\\HÕNY4'VÇÄFÉæ*¤h±Ïèâm2þKÄùØmÔù	K÷©±Z~îµpîoyZ±x±¶/Âmð-Ä-Gë¯pF¿<®=@ì¼Ø\\oUXÂ>¤ê²	¡ew·èÞx]bÜ¿ï¯Í$W=M¢ ôO¿ríæÍHýLTå£Ï[6ã*$¼ü÷Oö5~z¾>4;ï±¼_«Ñ³gìp* ¬èÄFnoúÍj±ø­¦]Ñ&$i=J	÷ÇÈÝ¾ñÔ¦CUØÌÀ_\`2e+f7° å4q>? W®i<øbù'¨ï{'ó§È|ÆWNpx0Æg-×±¬W¤yèuN»VäRB}8%=J$g§ô¨ßg\\{iÀAö?ô£G/±ÄèæPß_Õµhê¸ðó)®´ÇZ¿dTeÂKY®¬sp@ï¼ïZÔà,PC@ZËþZ frZ°QøìÝ7}Í'¼ù~L!Xe´ºÁö×-éýM;ëOf¾}w1¹î¥X	Ã X¥Utfß7køI<KÇ£>zá¹¬N¨>¤øf4gGWp±òb=MRrÐ7¿ye]¬«û+#¯=J¾|+Ñ^lfÆ°Ýå-xÃBÆóy*Q®Öë! A=@çBøAi­ÀöøCþcÕ¢0Ã¨ð$ê#}Åª}ðRÒG Ø)í{íÜ)z­FúbðÜFOPRÉs_Å¹½é¶íîæÃ3<1=}©«@Tkï7	#OðÔ\`Wd OIìeº²ÑËÇü½¦|*Ö!q9e½³Ú\`e¸û&î!íði|ú²!Â8	RZ¢G-?"¬÷¼?4ÕÞ<·*ú0}}íCîÑµÐùÓÝ.Il}à0êÀôßZLuòC7vÍwdZÓzä Ï7E>yfÂýïý÷,X{=}pZÆÌ5]]çî#\\éEÐýÜE¶ËLºCp¤uú5÷2KE¼³BUÃU;\\z1Q%Råã´µ7y<]¼¿¦²^NQ;"õ²½ÏÏßÁ7­q¹^e1¼ýøÔå ¬aÈ9¶ÒÕ£ùp/8þC©¨ÍDú+íåcÍ=MP&Þá¡|[Ï¨0e]åºTL%fä¿¢=@øzMÞ7§©?;òÀ!Îß§q´umÇäÝ«*7+Óe	b¡@§ÊJsr¦úÝ«wbµù bµJ[en?*wÒ¾O!.âßuðöÒ¬ rúY=}=JÄ¡½è=Mü@F»5kvrNgeåêZíó®í5þ\\G¡ëÅioÐÁÅÜræ5èµtNÊA	.ù¬ükûfÓh½îÿ³ÜåÀ3stÁ&rbègÄáE|¹ÿ¨·H¸Þ­(b¸cIYÐÚaºÕîb¦à$ò"ehoÕh%Þ-ÅÞÌ»M¡Ä¸"ñmÌøKK#ÚZä§ªÊ®Ä°QLK$û»Þ÷÷ø=}É<ïeÈçù¹Å«áAVwÌ39Ùì§UX$ÛV(=@×õ2Kçæ¡Ó§Nu ¿ò0xQÕdU$óÚÚ½bòÁÜKMLÞæÍä!wíoà(ÆÔ uÿßíIüé	,sM	N±½øç\\%s#ä	 °©#ÁæÄ$=Môòÿ %ôþ&À&=}/³Ú9#ëÀmI¿I¢ÉXÅiÆ¿hô8áe0l=JPÔÔy|¤r[ØÉ	¿×±±{ö§äZj=@E¡KKÿÊL Öç¥#QéªØ£Ýqß7±Ý)wå)ÙÙ£%ÙåëØî á¨³yé=M3çðÙþéÜÕÖÒ7Ðwr\\WDÅi¾å¹® ¿L!ÐùI{øIÞAåÛbäèi¸Y#'i¨¡µXZ'ñ Éâÿ",}K3µÍì»B§üøªo_ÃÔuõ!Ï?$PhÖÕÏÿq±*ôP;=Jj÷aÅ6%uøÁç¸kÙ:¶àg!©´?Iæ~¡®¯!ç¨ûPÿ]ÄÊ#çéééN 0Kyh&Mâ¦À$°ÙÕ6j|QÄPQãy|³ñKe=M=MâÔÀ/çÏ¿ùLÜñI¥GúÜÁJ¶cg×F÷üÄ*¦èVfNíøøqg=MPA¦Å¸^®ÖCÝyù·R¶ÏÔÇÉæ#A|dhµ9ö;dà)ÎB)e(q 'Ðáç!ð(9ùh2=}ÆÍa Øö¨ »«ÇÉ¥E¡õ¥7$!1®Áoä÷Yï#mI]ç&ü§®Õí±ªÎ§5ð¿Ò\`PÖÛ¨z¾ªÝïÿ¾¥áács Û/án±µ@c²Thq	ð.¾ú8j9ÚÚÙìÍ2!/QqJÑËV$Â#ÄÄÄn¿=MgÑ×¸	Ucÿà²cÇOè=J*ñÐâ¢wÁÁWÛ[¼yè=JSGK°Ý9ÅÛ)Â\\?pkD¡µÂY!X=J£îÖúÏÞ\\C+mõËk@ÀpcÌp  O¥«hYZÔ ¿y±8h~¦jNù}%y#Ðª)î?Ñ!É?§´¨È +t(ÖÙÓØy»ùbBJ^=MMÅèg_5ÈÕ´A8FÆÂT«vúöTÖ(ogYzdüÝóãJ(>¿{¤@×¢ÈÎsÑ67o6Snlmxð¾+ÇSA¯%±G£ÎMúx8æ\\ð#I(äcé #;Dåà}	5î²#òáúÂKpSøâc|NùhWÄ=@8OùÈ\`OäßsÝp_ß+%Ø ¡·7aõ7î	ºÀÅç¸V¬×o§\`p	Õ³íâíÁÕAÝ½Ã$½ø6ýp¸Î=M-Kâ÷k­lÈ#Ñ#BL­·ÈbÉcº²ÔÝ	G×¨ø{ðê#ÜÍ,ÊÆã¬£ëë¹cw/Ï[ç$ÿ*ñfTÕ<²<ãeïÂ¦ÄmV#Q±lÈâ<rÛvwJ­çÇ6=Jäoy¯(±,¢Øyü[ÇCRl->ãðñæ:C<ÛÌe°¡pâÅ;b¨}óÌm'ðò1x@½ê[Húß¾Íe~VÉù=@îæÑ@÷ÈO\`×Çê5/=Må÷²Ö*4Ot±È¡Ä%Ã²¤ö¾0LO¹Æ]Q¥øcxúæ¸ôéMs«d¹ò4Íh¼hMÖYrüO÷=@¸.)ìø{ö<¿ÀØïwø}ÀzlÏè-F·óKÛnÝwUËÕUNº:: ¯¯(z=J,Ý±\\ùÂÒé#«kÒãð*Òd|Í=M5w8µ=@6Óãå¸-v©%Y"¼ìß\`qÈÉgÍ®U¤ìW=JîÕÕöñif"Å]=}Ö V$ýøiÈ\`ÁÕo<dVðøüõå2ÔË@¼)½¡¨ÖFRã¦ Äæ¶¤¢£,t¬ØÈÙþA-Ûw#Úë9ü2è//´nLôvSÑÁõ«v!=@Ùêóù°ípðc %F5ÁÅèS<@³Î wÓ$ÐÂÔ¹=Mà-èk÷aÂ,Ýã1·äQ¾°=@¼Æ%èÇyP1E¨ÖÕþ4º*6\\á2qb)=@Á=M­Bt{eçºÙà¿wLÀÒÑ®Å»uüA°	Ô×ç¦ïøKHÝîþý)øíÇ½ÆuÎAbßÍ4ûùr#/TÛïd¬·õ-Í5\\ÕP4¡aø¨Ä6Ûô"!i½ÙX¡(·ÞX&·¤	ÑÿÄÀ[söÈÌÀ­x«ò'?Õ·4É%a!&1üKËWÓµ·/:}çlXXÌð£µqAãÕë8ÿ¨ð£-Ý?¸*«Û+´MYÔØ³eqìW>5¥ÛµÄÀ7Áe|l	¦R)qÖÂnwwOÉñU±KgåÝ?ßË¿YsNY¯ð÷Ë=MH^¥é´¶Ïá.Â&yaÕÞBocw1þöodÿÕ x >ÞÊ;£+aþzÜå.Ó¤¢¤ÎW+AÒjÖÙ)v¨»¬¿íS~°w©°ÏÍ[0vÒìA,?tÌü®øÈÅNÜ	î³ø­\`dNÞ÷íÇØº)Ô³ÝÄ{²âhvzÁÖwã¾w:è 2eT³ãÊ3ââÊ@}Ya±[c¾$»gÓ&8ã®hìJcE3otyª°"ï¶ä¦¹àH´è^4Ç:]=MÙ×ÆIYw¸õøíôÆ9áE/ãÂÏÍ½*7pg¶ïL[	  í¯hùïý÷{µ3ñ\`>l´KK¡sÃ#oÁ¡òÞùáÈ6	»Ø=}û°Ñì-Öä(aÔ·piE#í)=@D'«rbàäÚ=MtråüÆ,µYõÉ¢Âf884xË|2éúv@åZ;C×eå£Û;=}ö£N.T>ÓÑËyoÚlÉ¤Ä?º-8dëùÕÝtå³kl5íãÅ^ûZõiàt;VXl¦¿EX^eÊ°}]$ûêO#£ëiKø'AùÜ£)LXø)ÈUWÆ¡>Ï&L&?_XÏÜ,ª|¨ñû»ZmLû=@i@þm(7#cÊäÌ3Ö¦Ô|WËÑ8pÍ÷Ç­wH	"d&ÎnÎ]»õÎÎß.úZ}GÔBÍ4Ña1e¿æksª¨$!\`g¦þÃ\`¸\`Îº3|¢Â	©+?Ý.¶%y;Ô	*z¯íñõÊ=@üG$0mÆ5ÇLÌÁÑQöPv³ùwèaMdq.$,¥	%Â<'çí°9ÑEü75à!í×7ïLÕÑE?iPkÄd¹¥÷+gz­_ê#)çÃí-"åMþÈ¥Jö{ùÛï»çø$µ#WÇR×b	¡ãêá6ÔTÃîòbc2ëkÅ#»íµ¬cÈzENëò7¸Þö=JÂøCªÁQýZ)ÇNð×¶_ÞÍfzñTþ¯<JÂéÇ¥Ú#Ì²k¼=JC¢jýÔD»ñ9¯Zø¸®#ÍeÿÖíÉáË÷3míæõ%x¿ÊvdÒßYè%¡i3E1ëp}uÑ4Ö]Éà5kHB¬ò?ÀeO{«P¸0a.¤g©túúÐ!Qè	ç©m1æV/çËÄhÙEì¤â'­!4ú8=@AÂ¼LêÝ=JGóEEÛ«BYîó	æ»Öã|fªgÅdSyûÔ&5ºÆMçÏi©á@8&wûÍïÑDõõ\\DÖnälüÊ¸¢~«±»ÿ>¡%<cHa (ÔNQE\\U¿·EçxSªìßÀ=@Ï¸lÝÒ\` ©D=M­Yi[û¸£ÇT½°Îôwl8ÞÆ½EêòtªÃõà]Y@jwÌ{a.*ÏÖ pÁ¥pÔÎ·¤ZóÇuä¦'2(\\e\`8¦z¹ì_jØ}Ôk/¼¸[ð(êéG\`ÙHÀèÂæ?×ÔL¯ä$õüsö*©nÔ>Ôl{ÍÄQToÒ¶Ì\\3.G{(¡¢ö¯jËÃõæØJrÍ|ØðKQTDU?+óÿñ4O\\=}Ðut&TY=@yA	ñÈXà~4tØúOVo@C·µX=Jü\`ÒgójFQTÅþâ$^qÂG3ÈT<ê,3Ü»Wx$,3±áA¨ËXÐ¬ñÿí»ø=}iÕQ©¬W¹ S	Þ×#=MT¼Ü\\q×(æ£p%eýÏ·èiÖéÀT=@_d§Ìûö?ø÷9Î÷Å¯~þ)ä«ô[E Ð³ò½Ü§ï@t¼´\\Þ¶Å²Ê{|1èAÚG"Dkèá=@t-È#ä,¹ãÍ=@4($"Q¢Õí%£&=Jx'øXïÒØK¹æùHñ_¶åÑ'e{&)H.wC©nh	"år¯#¹iCÞ2ÈÙ¡Ê=}¸Âñ·\`awWñ¸lÙwévë5[w!O'©öÇ£ª¿)ß¤ÓÖü+Á«@J,,láó5:,RLµEXâekK°6¸N>>Fþ00¸°ê6Òî³Ò:NW÷ÌÊìÂz:³-2TBn.%¦ùãÿÕxQPöI=}ý¨ùg!V	Æ=J^J#R@3GwâÎê¨ÚÕ/îùk^ÔÁz5[=J@kµ4#CNþKÁ]=MHÕ­^Ãd.àhÉP=MÝµ_.Ñöâ:a¸s=Jüv*sÊÝìu£ÇW¸¶k¬5in2Û6·Æ&'æaÉÇ|W:Béâç»Í=JðÎúõÀm9Ç?£¸±ØøbY{ÙF¢\`L=@*ólSÜëM]ÔK\\Éòe ×r¡rßïéLæÍng=@^¨æô%EZ¼ïyÂÚÈÃ¸ù­ì¦µ3³=}MÿåÒsö[àt9×o]FÉ;=J\\{=M}TêÜ¦^±}£4¿$¬kÏ4¢¶LþÜcZÊ§÷\\¶ÜÒêß"ø·CÂ£Ö=MHå/»ZÁBépí>v§[mæBzÿ4sQkÏ\\JRüCÿÇçBjXïÅÕ¤éØåKÁ5Hö­	%c(øV¯-)À¼]ãä4*¡=Jøö_jþÈ¼VT°¦ÍCiy;=@LÊLÑÎ0s¤|eQÜÝ,A³ß>7ÕyäÕ×öÏî{µáÙþÃÓ&ê-Bk!ÌìñÍj-ØÖlÒÍØëlÑ q wEKfD$Ìú1"åª Ýë:Åôh³D¬³\`ElÎ§×Ìå=J ¤ÿS4DÌf×OÜÞ7|å_=MÔßiKÎÀBôÚÌÞ^Ú ×.<Ô-¦S72ü7«þ#FEX|9¦9À@ºeCiÅp?ûôo;ÍLÏ®ÌÇôó$½O©ôZÍØ,_ÓAYV öà?ß£/¦lêh=}¿hpXsÈÚpD*+Ûdæá·@xøÔÚ=Jc5ÖD×µôM8a!ÊÎ.Ýzê7¾HÌ$GG$3Vb\`»$OëÙ=}áÓü=}ÊsuVFÕ0Yê±ôzËÇÓÝÌ'ß27ä~ÚÊ¶|ai4ßÒMG¸¦¦íqò~	4Ìþ\\vÐ[àv9j)µy¶Ò!Äô,db¨\\®Ã8ýWÇ6h®£,/½×(ãZtmp¨^A][¨¤^ðo3PùX KÒ@3¡ÚÀtðÃ^-BÇpèÆDËYqµï~:áï5×=M@î¹Ëo+ þ»Jò¼Z¦òº	ÝÍ±Ã$O¡?ÅTle ö7ØQjº&ë¥DVÖt£4T9yvvPÏâ¢GªwáQ%¨ãGµÎjæ~30¸°vügxrù¡tÜg¯ûPZx}RBv¨^Qj÷ºÁªý2A9´ÏÚ=@c»ÜóßVÐÃÐ0>?=M_atßFßKR6úµ>øùYh½ÃÜÚÐª_¿ºÞUäÇÒ×Åø¾a¬m°é[­Jí%òBS ÉõÞ»=@ÃÈûãíX¶]±.ÙÔ9a¤ªF*Vó\\ÞsþNô£ÑoWÑ¼7_=}V$þ¢Y¬VUV=@´µ[Å1uÏ{ÅZë=M®ÎokHèûTÜÏô¼=JÄÕ·û´ÇÛhÄOJ ,d0ãÝï×¼×\\YÊeY-ÚÈñ÷@^¨À =}P­WYqå¯¿Môâ,\`v~Y1Só 5Æ%´Ãj ¢O(ÑÆG¾TvbÐú3µ/Ìí£øýÃc·/È<UúH8B}NcµQ´££µVOW:3Ì/D~¦À$Cs\\$ñ0Ùæ¢×ÎºD8wDFm·d°x[äõ|NÜ®PPNÇN¼ÕüÐÒ¨óò±[²Û;XKéðL{ÔÔÂ	zÃÓ~Ouü®6\`ý¦Ø|ÂøüStëRÚ©O_%­ÿz¥?PÔßÃ#øÎè4È$ô2§r$ÔJ a¶ÔÎ9.Zø®Z^¸á­zXeaRÎ2,WC=JÃXl®ÉJDYsÌÛ¬=@&¸¾ÚÂÕÀùÚÓÌ¸ôø	JF×" Å~]øÈ{#-Ê_U¤L¹<ËM·ö<·}>!B§mCÒ	J³PîÁûu1ÁåÐMrî\`G7&	õ[Bùþë)¯kG!×°=MbªS>ùü]ïR>ÅÔ]_oa)YÏ¾Ãó¡ ^ ds	±ÌêÅ°oPÒy^%8Y2ZÊ¨2Hv!ÄBp¸_º_Ì¢^ÎÅ5û¶=McF¤ÏZP¿ÎûíÃéM\\ahÙÖ3ìÚöüÀ[$qÀ3è_LêäB{¢EiÇº7L ¿çÌ«w~«¯Cá?á±öÃëbîW7væCCPæ§½©~ëyíúv1"íÑÖpéqEò,ÌTüâë\\ZP¼¸J9AJ4¨ÔDû®+ c^,KÛe¾¶ôUª*wcÔÝÈgÿq¢âþPÌ=Js1Ô¥Ó¹!$·Aê8I]7_7EÂ°ÃòE½	ÝÌCL³dQ}/åm>¤LÏÏhGWz*oXjiáîª"ô/à$Ðð(´¶Æ¯82Ñ\`RCÅèªûVÂ\`F'7Ú6§@yûÊNµßÀ/	R¤\`¿M^rHÖÒøßÈ3EE¶Ö?Ü?ÍIUh|?C+hû¥¬÷þïª&N8UvûàI¨9£Ýê+¨øYÀ³4«lP$/à×UøQcø¯1#ZPè÷Aåá¯Ý²¥6'²ç	a}vy®öê¾ÒàÃ´¸÷ÞÃ²ptMÙÎíÀÌ©<FôcfxÈmKy0ÛX­Î|î¸ÕÚÆ6=@¼«Y©Þê¸^ø¤´9\\Qæ/DsGqD¥£ÁëÜÓßÃ8ÞÅÄ0æ÷Eþö¸¼Ô¿ÕêÎÚï½Ï²~ÞùÊöí÷#pv>8z:[6ÿûÊïÆ%ò¾ðrMþ¥fÉ÷ó'·:Ï}Ãa x/×·÷rÕ!â«¶2ÒÞÅÒ%ÏD[«]¼Ð¶\`l=Mv"ç×}=JìxìÉü-÷£D{òW½**Ý@ÇQ´,Jsz2%êËQTø%T(D/K_íîi>3{£aÁó@¶ºßÀµò]M@=}g1º XµYPPä<éÝúéVòçR¤<þn­àãV/áÇZ«[±nô¨ÖÅRFØGrÇùìãØù;6d=@å¢h²¥Ç u¸¤?eYJ,¹Ñ%íüLUcÆã¹k2Ýüõ­2{¡xÚ0tÞ}!ó8NÖØ\`ì7Ûo¤vM°ÙN\\x>Ü0Fl©nù=}¾éñ½ãcä=JÍdÃ¥@ê¶2?eègaAÒ=MGñ=@Uh\\'¡5ê6=@£ïb®YéJè²Y#k5°º¸9=Më¦Àó/Ë½÷%¦+Üô¨õñtEYiq¯î52}¬9kêþêaN}­z35=MÄ»¿ÙQT/$àÒÌýwÙ¨ÞÜÑ¡>EDÅª­²)²;½ÑbRKÿiÙJ¦|Q8qã;i÷KyzÅN[?ýù(0x»Éý°mÁèGK(OôÐ|'B´ÂÓ k1ówSÅäï«Xiá\\¦r=@H^$ÁR=@Âpo[}Üdf¡¬þüÕs¹=JØïÝÖZèþµ9s[ÿ°¸é~51?\`Ç=JÎáè4 ¨¶Ò0|¥ã6\`oUðyî>WPÄR´f3´mÁ´<w4à=@J qáNÏw=JÂoÅD§ÀLÏ¢ótÃ>\\È>\\Òe K½4b¬Ò&­@ÒÓxYÛ5u_=}|Ã$	Faú¸ÑÔ»JÓÏ²¾ZK¦D_¦R&ö±¼Sî×HIö/\`6b×êkXY¨¡¹¯a@{ÝRô	]ñ7¸~¿cµ°O·.zøöÆ¹Köc}Ðç¼×Õz;¾=@Ýg×è=J·®_ç¦ÀÓx[HrtÅ¶¥$®H­SzÒo¶VBX	eÛjdÀw.ÎI×í=@DcqO\`zà8{n^?$o²Ã\\µäèHÜfUÄç¥'ºÓ$#\\^×ìÜfÌþÐ×Ji!"ÅFÓzÃ"Y#ÄMâaF";ÀIòo°¹¯×QäuÒyó:ø;:Ò·{ãºûÃm>g=Mdþ¢"Læ¾}\`¼Å·þÐe/J¡£íØ×¼Ìÿp­._ÈÄÐ;×£^,öáMÞqË0	ÌÃ	ëwõ¶°i{Õ=Jobâó0ÊAEª¼ 9QlåàóøbäO&r\\Ä£´nÓµÐ¢7¥ëÖ=}']ke÷Ñ"å÷KîÅKûá{Ï^ß5VÌK]JÒ±¦Ä@Ë¡ÜSùôAê8ó­AÅÀ/Ë² ©ÉÇ2 ÒZþV´µý´Y£[4p.¸Z¹åÝQQþ'ïÆÖD³ù­eRS"»â0¹[¼Tzdj_g	ÈfbÇdZdï©çºC¤ë.PFóv=@CSãê=JYCb:ÛÃéh|¢°$\\íà tô@;,tQ	o_|$Å£ ÄF÷kH^¤s"ÍØþý_=J²Ô¯v¤¥ñZÓv|»\\,mùU®¿\\t[OjLÙçíÔ×e6Kèù\`Ö¬à4¿±ß:É!EÅ®£ùK§Yiã{K¨Þ×X\\Y:óò=@#å¸~3 [MRÌíÛpËkÂ·¿aûx@UvÎÕÀ:fµÕò#d¨­ÿ =MnÐHà=@4õ?®# ¨\\dæÜlce0´.¨t»Q´Neê¾öëul»¤î×Lv?å#Ü¬=Mt´bV?IZHOB¡¼þâmC^HÝÀ%»Ó@nZ+=}ø¯«Ùwº÷¥Í¢ÊÄ\`<_q´óG-o´Ùß2üØ=J¢µæ{;²RñáKk¸9þXVÀÅ¬ð.7Ýº­4 <Ú'Ä=MÝÍXµÅÞ#mD²s	v.ïJq^ójÒ¶Aj8¨õ¨=}òö=}êÔc/à÷jSBQ6%klgýj~ë2h;ó3ÅÞÒÞ6y8P=J69.v,+Æ~ïÏÊVXÇË]=}#<±pV7g½ ±!6­o5ûN.µ¯Oä/QºOÎoÒ/«ç5Õën}ÃÛh[>Á®Ø<IÇxúFóÝvçà6°=}fgHP3oÆ²ê_§ñV£ª	b¯bN£ª8ÎÜgÝq³2?xd\\÷>uög^lèºöOy_ÃBwü£7¾-LúNÝúE³vj=}øè;Sy³=J½1æøKÜ^Þ§ðÀ^ãv}Òÿ¤a3ê¾¯ÃÙrQíÒÍ6êÞâÀ"ô>+]Âh ¢Lùû6c Ã} ìÈÁv·6ù[8{òñÃO±ò\\ÁMà=MERñifbÈUIvª­SµcVéá±Ø@6£2]¨ã¬jjSª»ÃïøxvðüKÎ®#gÜèp	±¾CÉB)t¡ú$ÃgàsRH¶n#ÿuUt{1.>pvl?­qËcÚ{ú¯9Ïª¯­?vÃÏ\`ß\\TR»«V³w ù4Û21òòuû@b¥Ù2V°iUÀc.×oçÁh9ÿÏd³^pÞ5Mo¿o ÀbsÈâ<û£#»!§!²(Å9¬VóÔ1DGr³"cá8Üe þl¯ì÷ÙVø¹Ù©coù'#äEïiÿr* ÝÐÝKæC}äÍÂÔmÞ2Pë§>8w½ZV¢|ß¡=M¸Ùð{:(°e½"1ÂÖ±ÖÓ/©O¨x=}ðÆð}.EÅZ;Â/iÀìÌy´VNÙì<Q=}j¢ëõ7^+êSCõÅ9ë·Þ¹Ó4Ëå7"Tè'*ÊY¦$\\s3mH|J ·ÖG>Y¬yhf»âuÓÅ½ãVû<ÛFÕö³¢Êú>³ÉÁqÔÆ¡Èv.>UÝX1fÊ½¢\`l%ÞØ«÷QL(ôì.æ/7]dE÷äÔEþIS¯Õô'Í²lN#Óc-ä)aÌ{&éÔö1QinUôÑ5dïL19·d5Q¢9÷Ù#Ï¿dÛåé@+½ÌfcMtGêÑÌN@Yóf0ññdI$D´j0Ùë]éWÚÏ.iJ««LBMFè^ÌÏ¾=ME@nHìF£Ð§Äè 3½P¦ÐÙðÝ¦æ#ê"ø=J}ÞÇ	Gï)÷Ü<±ñùïYæfèÁ&5¡·ýFm.ûö¡b?mrT°4?øn¡ÏÈªsÊóP-è2Ú¯G#l¨+õ¤¤F<:¨z\`ìèè8½*S_Ò¥gÅü¸i¢èÌªQRøñ!]AEØy ÚÛ®G?ZÑ2{ÕÒ¢¨=J(ÓÀÉóAÛëdaéÜÚüd\`[+­&Åôú=@ùÁÞ»=MØ}×¶×Oé*R»ëÌøóÛD5OÙoÛñäcÞ=Jüx$rçùéXy^ãá,	ì¡º\\û*hþU6Fïú³Dì9YçÇÓF¥á&E|3þúZÒªw|¤±©öÉ6Gf¢GyºªGß¸°RÝ×'Ì­i¨õäEôs=@;ÂC6:¤«4\\Îiòa=M¤Q´c±¶J#àmHÍ÷zXãï´´X)¬ð;"D4Á2üÚ+K"ÎLù2Ø+YÓkÞSÍ¾«-¾§aiÚOÒ=@?kx6lpKÊçqÖãdÄ½· 5ýGM]a@zÖCØc³Òû0,Z,é¹aUü±vg²°þl p~®LP¼ÜÊÕ^ùýeç>YzZå?ãÞÆ	Ù[­"¨ØÕÜk}o÷ÛÆÒèz%Éà©F³kâÔ4m6h­Å_qÖ }ãwJ½|OWÑù#ü$HD&þ£K¥z¹{'UO!û¥xrðcgÏÈèt)ÕÈU¯È}mÃ%Ääíß@Û7Ä©£G	Âü7MlÆà=@]v>5-G·ãfz;o¸Puø,óo¯(¦âjfA>X©Ù:.ÚÊõpU"=@_=M}ø/¿Óøë7Ce%Z¢Í1)¹=J¬¸ëü;igså{.åV¨ÕL^µn@æ¸:"PqaÑ{)Lai¡û&¿@E©!ÞóåEÉã=J¡ åÕQåR\`þ¦u>Ê®&eLoÊâ<*[Ë_òYk4,:èòæëR\`ÀVZù;Æð=@{Ô´=@k7A}XU°Ô±yöûÑr>ë<[¤xõ4 ØÊÔPp_ëbIA=MAàS&T©¹Pæë=@Ö.<õM´fPÍî*c¦ÛúÛËË+7ÀyÛFý&KÊ4!""#0õènÅàJOØà* üáKßWÛ I+!ºtæ&4[fÆ¤Ü=}áèNëIgêòXO7$SÙYbRî@bhü=@ÞÚHµOþ×÷-òÂeT»pXÞNá©nrT^MBÜ¹Ð«"FSÞÅ½Aæ£=M¨¥¨±¹8Í#PH)ûõICà¦ë¦À¹J\\çqßÞj- ³,CF/G%+=@òKü £uë«\`Ý,ÃÈå¡Â=}01¶SÈwÓáª@b*RFY/þb|~82¹wá%C.ÞÜ]m¦&S9%ôw]\`ØzFy-cØßùì=M$ö×PTä.tæòGè°W\`6®XèsÆÉ¦óÎ¢X&x\`/Hy\\\`-gÿ£T	«\`[è^ÚQ4Ý¢Ðè?y£¨ßæÓ®ãZõ^¹ÄYÀê"Ë=}¹~µµ8=@~ÁÏ4©Ó,ÔîiÁ¥±ó·×q¬æ£±Z¹ÿÕ5/GÂÚ+/+}0ÈíÉj@Çz¿×5øéÏqÆ¤#¬¯Ø_ã¤àÛ'wÖÏ_ë×º½îÐØpau[*oò$ñ=Mª?¨Ré4[bÔ¾,"ÄPÃyAð{xKmE´ÙòÅö±,öõ5o¥µ§Â½z}Æhloº«ÛïÃ.Û¼¹QØê|£æüläãÊÕäÙ)8ØÏ¼aF{-ï/Ö,©>a=@Ê*FÀpõ«A7°ä[g¦-]Õ*Ejw$»9ù%#÷Ê©²ºbñJ+g&ÖÂW³'ÎtÝÎúr[Ùèl $ÇËòCTª0®¯rÙ*ìÄHwÿ\`ùâéª¸jîá(CTBX2&%P^P"Ã 	[kÅz:|DòA¹t°FÔ=M?¼Ë¢ÏTÑjµBÎà5Àª¹A4¸Ü?F0xiQ5¬TH/ËqDãüsÂùòG6ùM¬NpnùÄRêJlF3Yt±TKUö¢Ü]+Ò±¸áÇ¡ûPø¯/®5O¬ºU;®ãÝ¾À?GNÎe¥|í	-^Ò~Ã} ¿ÿ­ôÏÑbÇÓÄE óJ-ã=}jS[É$_jÅD¶>ÇÉnÌq=JèH<ÑÜ:þPòµ±Ë¼wÜlÜSÜïA¿Ý~b(GX)dùì Z®ø|¶º¦mâ2_7¯+pãbA1O·6ÜÒZ#@vëºkf%Ý¦4@p	Ú§ã¾îI}m¶	àaµåg¦ÇóÚ¤ofÿÎAç/TÌIZ¿/b)ê)Ü¿c¶?ºìÔ^~Ô±Î<ã#pï! j@JÁ/vPÒºAåÊ$¯0ÙpÉXLöà|»çúh¾«p>%¢CìbD-49{d^H¨®ûM8\\lÙ´DíÐ«ÉYzCW3@èö¿ë¨Çà¦KA¦{×¥â6¸ÿ¥³Â1»3Xß¼ªP ¥Ýö;8/mHöN¸ãÿ°LC$u7R ¥2éCf9òî;!0oT=@3[%åÚiíê,CpèßM=M¦1ÕÎ&DsÆÍm4Oðhza£b²Û§ÑÜMc¸îÕj£¶=@ÚÕðîõ¹¿´ºµ¬®yÌ6þ«Àf±êöÉTN{D¯gð§Ù©Q*?Ö8?æßçº:kÂ­p:Ü\`ãºÿÑAZ_M îwSúäÒÐíÿðYP0åNT#ZÜBdqxëaªÕq#rØ=}ÃÅ@O°^±M¿mí°$Ý~q®'þN«³²?ÖÇn¶ì$Ñ¯EmH¬0ñRÅÝ ø°7+Iønÿÿ.WdÁ=}Ô!xõ=JKDVàwñø©6Þ*Uþ¦¶;.<Â8wÑt'¶2Ô70ñMî¯1Ü¿{È·u+v¸Ö\`ÃÒÆw=@ÞÝÒIÎ¿}îs¢KëÒ»à»lÐ94-Ô=@?ñ|ÿ.<LG±~]u65"Ò|¡£ÀÙtG>ÍGçÀÚ²ß¶yXÉð\\Ød¦J ü_e)ôaä*,î=MZrPª2õ¡ã×	æÂö}ÅUYIQ\`qeòøHÃæ¥³ÜË¶->øÊZã;ÊZs¥*µ[¯Èp¾ÏIaôø=JaT|áíTì»ú^ifCñÒÑÅÐmÆgþ6®®ù5V5ÇúÔ|QuÓ~²ØÞÝ?!ú0!¤ÿ(,Fçs75	SüûypC õ{lö^åÊ2ìUâ:¾.¦Ð¯Åk§¢dh:XÉl ¼=J>Ô° +w¨½HÒ­[îÁ¹ó¨TN7 îÚLÆ2KÊü#rçÉMRGÝ®¦âÊ./%äæÝ^£ÏRÜæê ú¦Íßã§B!ô±´³3¸Æ«@IÇÆª)LÇ5ªaüÍ&ûÀ;¤bgì¬yÚ3rÉ.=@ÅñQÓSuYX~²]ØDµ&ÅuÕÊmÕ¡GË?Î[â¹QgµIØTí=MgRÄù0q0ìjò?X°lgÏÊÊÖÒÔïÁÒðuÚÄö»«hëM6&ã]\`ú ¸põÔYb£M!_·¶«¸ë·_¤Ut¢#hf^QHäW;ñb¦ÅZá×-ÛIx)\`­ºZ.\\i8V1Øªcø?¾³&Lø=}îZ÷âæÛãP1@ÔêÆ1jG~=Jîâ>·}[¤[Q¿pV]gv»Hu<;û¯ì>côXÒÛm]ìv¹¶Ì®ºþj¬j}þ\`lr@ØD,KW}Úå=JÕ=@þCÂìÊ»Bö-Xã±ô7ô²ã%dõúÜ9KÓ&øj£w½BküìvXtB½GLõ-ãÂì¥&ß´p<ìnÙÙõ-F(÷ÒÒ8SäHºÐs 5pKÿMtTqär;+È´À±·GJ% ¬§×ÃwS¡VÛ¡1»ìÙü±r6»_ä:êÉ_ÁÄíÉ_ÁDXÄi¨IêIé9×=J¹	àñùú6é9¦f©&(vù%¢ðñ­eëIé¹IE©&(ëähIÐí&¨ÉØ%=@Po@þÆ?Ûg·Ëp­§ñ\`_æ½Ü÷òg?½ÿÔÌw{" ~KA¡=@dÖÒ{VîLu»,¸	µÓ9;ÕÑ_b5¡8u~ìÇ­ýe½íÇ#ÇØ¤pâýÅ³ìÇÃGå¼~Zç5mdçc4AeçÏtÆÛÄóÈ^çßÁvRçWþÔuV¾kµsxÐQç9½û¾aÔÑó$³TâB.ßj@±ç÷õ÷[LAYOYQÅ*Qù¥vv]±e4/õÕVBýãfäaiºä¡lÈ;Þ\\V84ÔáÀÏ ýãÌò23:^3DöÀÿZum}o.zÛÁán]yHHObxD>P¼É÷hdDîö!C2·µ>í1è³ò2Uâ2\`/_În¥¤ÙÎAÝUû¥þ©qW©õQ´m!ÉTçùA¨G7_(Â©2DX½rc.k|®bÍüèëHöC=JØA×´ý^Þ?nüç%@ ~°û05Ê·<Ì/êY;D6A÷XRÐ-|ËL*j¬2U¡ë8Ñ£¹¾Ç£ïÃdjëjñ´jÞÐK4695¬bìÖÎÏÂêº=}aó#MA¡Å*o»ùDÏó>áÌ0ìóM^fÆ@I<I!N¯daXdÊk¦ï4¶Õà.µ!î@êóU±àòµlêÌöä¢2yí0jâNTÃLuxR¦+´´:Ü=}ÅeÌ×»më?[ûMÝ/­Çw=MWdÅ®¸[±.W¿?< °a{2|0[!:X>/x¥¶ø=@*6°ªÞÀ~U^cZ8Ë¨l8Ú¡E)íàä¶GÌäÀqP<Sû}ñí\\tÐöþ'ôy8D.%1®kqApGìMjæ[yJíx¿O-µÉée:«.&5°Ãvê¨Òïÿ9ÜÍ¡õô)ò©0@Ó©òWOtéûÈ øVù-°è¶|þÐ§OU:5¯¸a)Ø\`?²©¼¾¶h47ûÎßRG¼Ç¿'¡BÑøÍr°=JÊf{C6ÂöZ·ÎQÕ^?d³AXEæG;ÀY}*sâa*~>»áxá:¶Ð6úÃ=MA¹?¬<±ÄþþLéXyDLºTÌb¥þPE\`«W\`ÝîQ¯ÝsªÅ§¹lFmÀñGUÚÁ«½}|Xä6·8{$[»óEj×EÄ¾}{Àí¹þë¬Z>HðâÉÚ§+<3IÂs5ÔÎv!yz\`J^úHdîú$OæÆú©Ýâ"àíµ5Î?r«¥]QV0a.¶ùþÎï\\ëBÚB¹EªbØ¥lº×vw ôþ<'EáÙêËK _ÑxåÀ½ûSóÌýÀËÊ¯¼²Xß«|ERïÿû,RF±6éìëoÁtÀ^=}ÍFFÚ(_½g3Q5ÇdÎ¾ç®£/\\¸Ãx¬¯I*GOaºæ¨MÀ?0f}iÛ[D]ÛÍ¯ÉwäÝoçÙsÂàc¬7.KÛ²y×ÝÄº îà½÷<i7¯y5ä^CöÉgÕt\\Î*V~ªõâo®¯¯DrtlÒQ¸ÀÄ)®v\\ú^TÝd×ñóodEdÑ\\äËKÈL¿P"\` çP¼:ãuýpíê¾ÓÐÝ ­=Mô»P5ÄKÊ¤¼¶¬þs]\\¾ßÎê®ÆL{¼Pò§q=M¦¢JOHì³¥BGrV»§³èäÀÍRå§ÃC0vãü|¾¼Ë¿òè¶Gêe[Æ$(®:éPBf4²°·Ã=MFäM¢Ôµ\\Ï'wq¶{Å[ÈDwvõÜÈgÈè.Év^@M}9[=}X]Ìçßï×·ØdóÂVlx&a©ÛÖ×æV¸þï9¥zBKÝRIsÇ0Ú2Ôæ=@ï¼p.>ÞÓH4¡aóÒE°ùmÖ@UU0¡9¢AÀ¶ÏÞí\\wytJ»Ø7:©³,¹ûuÈéÿdYGùþ*´)6ré§4I?ÚÃâ~#r¢*Éxêþc±ªoPi®ÒÉõ&â² Ïäô¶ÁeÖÃ¾=@bLM°´ý°fÀ=}({ò äe124=MóåHwÅ/bÉXÐ	ìå/~ä¢Í¡QÑ7 öîU0wåJÊ§0bÆÃ=@ÚYE÷-X§zðcÅOë´ÐÞ¹\`D6=J,¬8Ns,<³H~¥^ëÁÝ=J¹ü´ÿL¿¯jYZÉþÿC\\í$ÈHLïÅ|¶\`Émj ÿeÝÌ§3±îSæW*¿J0jÓÖÏîvN' ­ëÒSÄÃ½bï÷Ák´vXÍü¥4_­2_uußJ	-ÿòÕ?ÏÿTn} W4-Õë´ø[BCS´=JmÀ9_Ä8¾P*;J0*ÂÅ²-µæ¿Þ pwHSÇ$ìÏ°°z7u®sÙéK~W»ãMtWÌ=@G×´ñøZÿÃð=JÉ·{ïÝ·»!ÃÑÉÑ®Êß°ò.áDì{j7Û_¨mN¸vE<LÎýÈk¶@7»:â\`ªe» fÛ îÁÛ¢Ö¨a@|A~{[LØaÒuÝÏc×µ0Q;ËýbÆ¤ÔM=Mlø_±>$ö÷v¬=@öùSñ®¸Hèg<6e}=@ÀX=MG¬u,ýðIMnëpP2r¾Øk¨Þ÷1z#m|CSµ5ÝcSú¨þ×Ënct¨GGvºöáÖ=M}þcJik6acXOîöÿ½=}ãr$Ôu@3ÔmÐûùÁ¤7&¸ÅNß4ºóî(Òï¶®ÒÙ0w~Z¼_®Êy(À	ßè»Ô³]W¼×¦?=MkÙHþ÷Q¤ÊMÄöE¼}%°Jµ¹îTzÖh øúäDÄÓàr6µ-\\=@A®dáÚÉý6ÿÁ½Ïl½£k¶-C}yÇj7Ae\`´×)ì=}S°ÊÙ©¼'\`\\¨¢4_-0ÜÖ~×Å§úå¬Õúïc=@´DèoçíâX5!]/8©_>r¶¼5ÞòB+Åg¤bé¾\\ÓÐä»µùûÄSLÑï]ý×Ç=MA8ãýà=@?·dj)¸,[=M×º¹p°P$ñ¬AFÂõzrÞ¾@ùO2=}üpQk=@EYD,¹ k£ÜÉVHz¬§½ÊòÅìW\`e:Ìiêû1ÊIÂéÒdú}ßl =@Ççç{Ç¬Uns|WXÛäNÃ:@!4'L;CÁ¯úmÌp¡å¶×1dLcBl_céèìþêæ2âæ^8ßâ×íßã²À®OT3è$®ð*ôlC³Æâ«µÿ6=}ÏzíÄ*qVðâ«.ùlÊÓ¯1øÚÄ:)Ê¢©ÿ§SÚKÓ/T·ÊÝ,¯RæL¥²õXxÙLrIaZ¹£MRnÝa>IÉÇ÷rmä:C=J²ðÈ¬¨¬o\`¿½sÏcÁRîtÍeAÊÂ>mÔW´ÎñÕ=@FÜÿz|±\\¿g®BkÎI­A·ÃzÇ^³¼V}Ða¢fàÒpùãÃÆOJ²I9_Éòv»¹»z}¯ÄÕÛùdéÖþÀýÇ>ÇPäúÂcl}÷¶Æ­Q£X,qøÄ+Ì¶¡z;3ßÂr2å½Ãjý¸Ò±RB*=@ß*7TX6¶ 4Ý|Ä$Å¾pßABîu×§b¦µmsß@ñE:î÷X¡½b'Âq7uBs[e4IõpF8.S;vÜbSùóöÜTºoú¼vk±Î¥Ígph<0n;ÂJª\`Ê*'òUGÊð¹ÜrÁ=}ÍÖ×¥zü1MºÁ@@å×Ú³Ãë	þøµ=MìºÂ)Yäÿæ=}|% !ÅhäY×ãð ë(ÍµñtáÅ))Q)ÔåmÕ¯ü°n{1w­Ù0¢úür4{«¾¯ mã#Ü=MSY>.Â\\	¶DèKµ-ä[[=}ÅÅeÅÙ8o¯?P¨S£NQ¯T8%ÊÇi=}\`ÄGNÜþÚSÅÌ«ÊgÆNéú07îÌ¢¼n×Z´ ¢Âë®ÆÖMÌ2å¡Ï3tªð=@{jOÓ°¯ã"Â"H-TáR&jªÈZ2¶B~cÀ±	v<EMuCª+Ðïdcv.qr£Ñd·~$R=@¡oý³½Æ8_Ü?Ò°ñ$ÞeüÏ,ÃwáuÅäú7<ý&Lúv[÷©ÜÂêÏ÷l}Uì XÙ×»G.òMX²À=}[ÈPÕa7-³FkªèÅú{©áÅlBMl â×Ú\`R¥ \`¼¯ÄZxÌ|l¹Î·;©ØvÁ8àûl[U¢k!RA%-,É[d¥q½Ç5Õg4åÎÆÍpæûïô¢lzëê¾£÷xUOS:¤[õß$²;ØYhhòttP5ôPqðh×ûK1ºHÔ·B^¾çÚ\\ «S½æCv3\`ÿ»½÷0ÿFYZÝ1ØaKnE}^¥±Ô\\1ãcÅ­ÞÅ¹×_ä§¦/òö×÷dsí]ÝØêQ\\#ÂÐ5ßP¯å~û$®ÛÅÅrûÎ½N^J=Jú"Y=}:Ä<³Â@T²p5¿=@÷ØzÓC]S]<L¹xÏÒÆ#PÒÛ±GÖàe$iKÃD5Ï;=}ÊÔwÅ³ä]ûÑ7^âQèÓ%Ñ@PÙX³9ð.iÊÀ<dKp=M6jÇ"¬®ñ5f¿4Ú3H>ÙOâe¯M¿35Éü£M	Ì DuËÚ*ë&ï:­üOZ{½r¤Uu³©t{Õ­ZÇìàìe¦¡=M³×²ÕÝ¤/ÏZ7¼ÇÇ´úÐ;²µÇ\\Z¨H´³DëóøãÎå·; OOÔª=M7¹¿R\\c*÷y9B£ Mµá×Ì2¡ÎòÔÛ÷ó%Cß¨s%¨wÎ þ¶àd9Î%hE¨Î,ýRpßì]üø¿æN|ÎAllLëûÎ	ðmS}Ùàä½?yÆ'S{XÒÙAvÙ¸d ±ÒõbºÈÓå)â<¨þ ÓcÝôäQ×¼ªÂñ=M[Õ\`f=}Ñº´Â?ÅHB&=@Ð¥\`{¡NEPe5å×ZNs9âbï{=}jH;^XGÝôþWIgwó³6©/5×ÂÄY2 >Ëz½Yê}Ô+÷0ê*$¾^*ë*fxÖ+jU6Á²­ÃAÝ!KR5,$²­Ð6â2¥,îò©Ði=Je=J(£õ|oZôÿÏÿXWõV!¹«»ùfÝÞtÈìÂ=@üs6Ò9T!e"?=M9¸Ú[(Zð"ÝUªëQ{Ë8+?Ä=@Ö©Q®åà]²AÜE<|íç¾FØ_¢O%¯0ZGwSGlÄ«dó:¶¤T¯Ò=}Ðk¡ïkÛR^´Xo§ë¯úiet:{ðRL3=J_³î=@g'¯p÷ÜõÅ]%þõ²³´ËJÐW»üÙ[¾ÒM´NHäÞûöæÃt¾;?6F éÚ_Zé¬Ù!r=Møeø*üCÜf±±Sk_YCñÌÁ&Ø«!rBTHF­dG¾q[Sì0àÀÀ"|±sÕú[«ûFíç0Ý>ûWmqÃ¼^xâÎ¨u³nfÐ·d¨ûð_g},~ÉÓïÔã-BÔåÄý¾ÛcëÔ9¼ðq}\\DõÞU¶.uª¯s)ÙÃ´¿f±¤Ü'áèséÍVÓ $LºsÅÛLPYó¾pÂÔð¾¸OÃÎ?ºé=@JôKÒ>CÎk°¾PQF®ZÆ¸LÞ­HÁººH×$H¡Ãl·ô¢yP¡h2ªÝXõýãutã½Rv½!ÐezÆßx«/»F®4C0,-«0æüÛæá åDé·ð;¶|õ/|X½ô'¥Ë®1Ø½-t28#=@íüÔæ5åFöbôqÇ°=}ä»,f¾õÃÝÁ¾r·=MTá¢?Tã¯¦½T±Éâ%±©° 5µÅú²«âõB0¾8b±_0-A¬uß;W<uà¿¤\`z^.aÈ=@êÄ-qÍ¬ÎÂO~+hêJ~ÊE%,*þÆb@Óò}úô·ñô¨=}-Âø¾{}a¬MËv6/ÕBÅ*s\`uàrUÔ÷y²PVV¢2ºünIb);/!U,°"P~+ïÛo©æ¥BÊµâÌöAEÓxIzö^=MEÒô÷¹v5ËÆAùèõ]#·öµaø]È®ÉÞLX¶Ð=Jã}þ:ØE?dsPHà¢ôà¹ÆÃjE"äÌg"£©<ù@ÅÛe(æ"ékFþË¸µ¿\`ÿozÇg?ÓûWDrufÊ8ãÔ××}¬¡4¥§dy°ÔÔââéÜbMlÌxüÕP$5KÉU²	Ú´ÙPeK7düôý¬m?=JV]¸²{yOåÖîÁK¨¤ÇõçÉè¨ÅÓÐ·ÿÛt¥g!=}ÙõàQ³6zAJ1nwºê øK~¾I\\áÑ(Gµ<yÍôÁ"Ø@§9û¤Ðü^­&þ2T{^ÇòtKÀ|9ûÙ^¨HyÓ%Úñò.|nPÊã*k¦7J.¤ðWÈmàm}ß{Âj Ô²ÕVd,UM_ëúL°Ó¶sEÐ7îW"Wsv5ã´©ÇVÚ5¬C=}ª~5W|%oZ6Óï¾ÅÄð¾Åe­¡ç¶¶o!=JG½Ígø´ÐX__M~Ñs1a ºÌfm/}Íå9ýp¾÷b¤HV5×goûNÚ0ÍT;=}Aù¸d]×~?&ÔÊè=@eõ|¢tCÉÕ>â¸¯J\`~rÅü;^Sõé9%bÿüÈo²K5C¬OA|¦ßÖ\`Â²ÂòölBîÊdÍ¶agÍRN)(¨SÜNH\`[Ó :~Þe4a3ÿ~ëøÒ"«þÒâþL´ <ÈÝ£Þ8=}<_<YXë?ÜJ	3AùXÊ¸½A¡¼ÈU"Ö=}hæ]Äöò Go=J§(áòüìMÛ(õÉË?-Ì%3àßn#õwWi«R#8ã]Þñð»°¼=JäNäåþAcB=}ú01Àüàç(àõ"=@»ðIÛà[M°ñîÖ^\`¼ÒZC¦·^ßâz§~ÜvVPñ=Mcá$hõ­ýõ¼0Z§þ¾»=MøÜã5YhâPò»Taba¶&2(÷ÈvrTn:.??axèMgýòÎ] ÛMþ&víÀ¬$º8n½uZuâÊIâJólô@Wxõk¥º¡¿c\`åéþNÈGæÑ§v¥«T!ÿ^zÎº!Dº_«Oa7¦§.úßú*¤ö6µ10õÑì8¸m@Û»­ÎÒk!xæfcX aQ74·ËCÕÑd¯Õ32_4È±2aöÎz¼ü±T.ß­È¼§ïÚ ªCÛØp!µRÞpj¹04NôzÓ* [:mv¤ñþ	Ü16ÅZ]ÒÊ1^¼Ä\\$Ï=McïªI	÷íÁ/Òw0o:1¶\\ÿDC×YÐCõéOðYd¤]¤»Ù«³=@/eÌ$µÆJÓdu4pþð¶!x¬Õ¡=JIÿ_\\×æaýÀB}ýûêdÊ¼¡q×iöþ<qÿÆ ÏÖ¬µê_÷î«BËªw²s\`f=J'Ä hßZ×°mËÑYàðWnÕKÜV7X}qö³Û¦6^Wýoäl(ì:\\ÅoS_4Ñ8;£µäØ5·wX×t;æ3ÊVÝÿµglö·@3w7%sAtÛjÄ­ëË´üjt&ÿÞQÚ\`±Õê9 ¼ù¬ç^ïÅ3ßKÃyÅÏëÜµáyþqG rôº\\\\óÜ_«MZý[%5,x¥CÊj\\·ý=@àr¢ß³Jk[¦z4¬å_m5ö-G©Rôîú º¨«÷ÔW@bµ«ÂÝv8me°$uuØzÌ0Jn/ë,Ú3?ÜvpôÎoKo/Þìw(GèX98ÌOÀBqèHB&Q=}ò+=Jº-EÀ2W¶'°OPtüS'&©Ílz¥¦2In÷¸íJîAª(F.|°ÁQÞ.x]\`_ÜÖêà1/G¢8´^sàìiWÁi.^ó9­bÔÔÍß³=JÁÆÔkVÏì<º]¼_ý±Ó¯PÃnºr@f9×dQÕN4!ZT=MW8;»2Ò6OÑõP$@eÀ;/j*w¶K+.;ëW­-ñêzw {üÆÆªêàÖ2CZfP}§1Æ1ººhW³'Aþi2=}4¯+ì+iâ9TÚÝXIÚyF÷LUûE ¤«:Ë6c=J±Ùï%êß²-§õë¯qÛíc(0«bªé*ë&+Ç,Ì,g ~èXßÄC=@ng~FõÁÓV¾_bñn=@ãC7Yf´ÆoÉ«gR0mZDØ®	úTKµ¼Ýµî=@0Õï²ë¬+Çîq\\:=MTqS<Õ´æìÚ1¬BU©ÓN9*EìÈÔ~<ÌÛÛgs7H{)¼9A(Ö nÑ2ã|üa»\\UÜ¬VèOv@=JL³âÛ[ õ0(cï {Ë®%º IÈðÊö?Óu©eÅ{Øæ;kÌfÜ,áïïþGâ à¸Ô%ý êrõ¨9}) ê¯=J¥fA'Í=}¥Ò(SQ£µsòLµyÌ=J-\`Bn@°7Þw²ÕceS[QÐn=}:äõ¿A°BèÏ\\Gü	3¶nsé mÙá\\õ<åxí31ÌCÚ_£¡Ü¯xÜ^;øÀ\\¿Z¯»ëËÂY3åì¥×®2\\ïáãZj}£yÌ¼ú\\oÊ÷êØ4Ä4 >rQ¦³hLËh4ØYæÂè¶õÄñmÃúípWq-Ç¯I2ÑÃûxw:Þ)ªÜsZ[n#Üä9ÛSÊ=J°"QÛ&sIúHWUì.A}yT Êf¯¯F¼Õ=J+4<ë¨"fë²Dâ·n=JeäcÛÍ½ØFvCË£(êöÑv×G ÌFÖ-ë-÷_X°"|ZµoKÐÁ7±"Ñ§øïÚ$_MØXm{£hb»K?øçb§ò¤Ý6±À¦µë~9_GïÑK°C=}Bhïjf÷ºÑZc:ÃoÐ? w*A£7TWè÷ÙÿWÇhÙQÀéÞyÛ?ìãï	AaM¬ÚZYK2'ýLª§	ÎägöRe!¢6û*¿{~¯5i£§þÄbÏ2:\\oõÓò÷àöëv÷^ÆÆb÷ò¼¤üMö³Éåë.Dµ&S1&2\`ºmà´DöuO¥êhÚ(*Ýj7ÉtZ®@(¤\\Hnzx³'·õÓñÄþvf¬±ïl6[âpö{]A¬8 ³¨.Þ°Bw¥[Ò´&_ÖÝ«â9Ñt³	AÂy>X7	¦~¨qÇÈÀ¯H^LÁ¢ÿ7¿Øù=@Æütg$O5'&­l¹)ùÈ"Sè(Uá'ÿ<¹¼"¿¡h;OÈJì7íùs<éâÿt $½g£°î÷$Au®Øp·úªÚ=M¥ýÎõR tSé¼0%°ÛÙÎXNö*NàË>ª#|­÷Å¢QU=JÓGR?f2¸çÀ¯ù6ÊÞÀYãÈyG¥ëôW)ïKvÀWõ¹×8vÜ\\h=}Kj ¤ÏêçD9õxh×5Ô6/ Dò\\¬c·×uÓAÓcªÒeÒ¹÷r{?9«t;ÆV×¹Ü=}tÔïf8¿é?*¾ô°¢³X=@fz«Å	Xk"[	=@üèÁ¡×éöà6JG¡D]¾f=}³tÔ&üÜ~T-¢×~¥k¸ÓÜSÚ|á ãþ|à¾ýÀ{È7¯Ï°Ùå=}4Î=}\`.·måûFØ÷³û=}ÕJñ°/+ûâ þL{×o[ýSS©n4ñ;£M½kP4ÿVOÒ«ZÅ«²¸{«L_ñ	¼©Xi°,ÉïÈaEcBÐ¾6$Ý¬­¯AÖ~?8I=@5°Ò´õu¬ì°¹¬Û«M×ÄvX®©þeMG^¤JÔãëÕ©{4ð%ÔüOÃÔ\`QWÊÔkÙBÔôúÚËPm>	ÁÓ=}ÿ%þFç	?°7ÝðZ.\\N[ßø4^=JÊÖ3ÅwÕ|S°É¼0á}:kIi¶Ä_üëjâÃÈZE#æ/=}{!¦9hóAeÃÑ{k>¨ÿ§ÎôB4h"q:ÍEÕGÓ£7F¼N*|1¯|ÖU5°NÚ.,Õ /a~YÍÓ0 °ñØö¯°"}ÃÕµÚå@?xkÑVtöCj·éV£ÂñÛäÀv\`¤Ç	¦þgqÖ¨Á(9¿5!Ù=@e F+7ÓBe½õaÚ4øïyD]íiçK¨ü¥' 0ÿ¹!"¥ðô0þðë¸|ØjÞ¼¦iºAçõÏ"µ¥ë<¡î²òÿ¯5Ùøyò-yÆæ¾	 ¼¢2ùÔýpa	+ñzÎ1¸}À¹)Uiþ®ár¡õ7´Xp\\»=M©é!IU·=@Å*@i#1±¾8ã)Àl;­ªÝ·d=@Lnþ¯|­ûÞTß¡\\o&»5i»W1ãê´âáÊÿhZ^ãò¦hÐ²s;ýðYì$v=Mùë\\éS/G$#­ß¸D@(V§J»ÉùwßZ¦×ae½ç¿wÛ0ÉpüÞÐuP=@ÈüÎ!í¶M£Ûã÷X\`ãÜ\\´#ú¨±ÇRýäÜù÷ß¿s]Å0ðCí¶WæõGå³¼)°¾ß~K=MÝÀµÖ§8ÚÜ48ÏÍÿA½V.ÎÔ|ÀmIØçaiô¾ZØâ ÈEdJ|IiÙ>SLcåÁ=@>mÛµOqeËnºByF""Á4£3ÿj\\×Épu­x=@¶wU(ÖÂ&X?=M'À>½ÛÛPB] f£;Ú=J=@N#Ý è­»¥ÏR±[ðI½kâ½ødÝ-û=@ùPºå(òÙ©5Tái WE~Ñ4à{ç³§éË	à[L¨f^Ým+èÛìùl¹d+b=@dlµÀHÚ@;l1ëÍÍ%Jë!Ô4Ì=MH¾¬\\nâ®5½jGòÐ÷PoÌÝwk®9ªÄ!éN±½¦Q}\\ú.©W¬,Ò¨+£Æj?PlüÇ«á8ªösH¹Ø/ºG[M>ìL×ûBc´ÂÜªv¶,¸âçÛ¸·gdÎ*¸ÇP3éDmêÌ¶ål=}'J°t6±?gI9¸:gì=MôÂröÝbÅFÀ¡Oé[ÝýËv»6.ëªtW±å¦àÞ"¶VÉÀcø{þ6.ê~û5ÖKÏm5Â-Ú	L£xFGp=@¨]2v@=}þ+eí=@ù]DJ ÂH Öø&XJìè±¢>Ùûú¨²îêÜËC uú¶Ý=}M]+¶-Ó=}«¥8¹«Ý 2:9¹=@ìldå\\lqQµÔjIµ'¦WdD­~²Ñ;\`ømßsnÛoWØ¥.=M§4hW*ÈëÅ²z}¸a:ö®ê©ï±zö¾õíE³áïNS©á×'E©çê@¯Ùi¹ÝÉemr¥«=}qm$Æ»!úY¨<üÍ¥ùÈ(ÈèIx		ò$ìÏ©vüÅ\`§&Ü'àºè)ª»Õ ¥çõeI9÷Eã'yh KgdÓéQé'"q92#±·ÆiYã¦kfa&i©ïò½9©§µ)åá±À)¼]è(÷Ã°M±çÁÙ'åËºøgÞSá±^ÆÎIeQ)å9wè\\s)¨ýÅÞ¦ÅKçZi=@##		Äf¡òñáç=JºH¡²=}¨òý)¿¾B£ uø)îýK'ðÃMQé¾ÏQì!1y$!!xxüÇ'Õ£AYQÎq¥p\`YäÙI<üÅ!©qYf'ÂºØFýéÞÙöEl$)éþ?9æiÎbÝç&«I§bó)ME	ó1&r9÷CóçÆÕa»f)'ÐÁ×ÅÝÛlä!Ê(Ð'å7	5Y)»	Ã¤=Jy¼$i!\`éurÉB·^Ç]µ	¢T#èáéA5é°CMÉ s#ÞóKçÏY1¦!3¯©e1!búº¸ )ðAh¡=M¼ºøß¶&"Îå¨¦þÅm$'%!¦ï97°mpÆõÙ¦¨¨ÔÁ'íÍ1§Ps&ûÃy×7Õ9EãóÙã#$º¨õU$y¥Ô¹qrá)%E¹Éà&ó!y$õHÃ ØQ¼ YfÓágÁþ©)H¥q (É\`'ùðy)(I 4WW'Ý ióU±'$	ä¢±µl¤»U £ÿï}m$)Î¡hó=MAüAH=@©÷áy$±mdÄú)Ó'g#ï©6ûð(¥É)Ó­8·Ýq\`¨?g¹2] É!©\\¢¥|é1$°GèÑs$ûèÕ§Aénr9ùE£	ýÿé$ÙK§þ(Ei_åÓ=M¡Èèª(Ù#ü©µl$ö³'ñy©ð1¯[Ù©&ÂEÑÆébÎ9eag Ó4A$0è)þ9V7÷×'QèÙ)çr9'Ü$'!ïÁ°Î¢&7)Æ¾h9¨=MÀ·Kgé=@=M±!äeÎ@$i¢ýá)íK§øME!&#á'¡æ\\Å=M¡\`hCðìòÀ½X¢´KçÏ)±¡i!ê¶'¼WM1  ÙY6÷GM}¢Æx3!èÜ)ñÅ	Ú)}5ô»EçÌiËÍ	bú=M·ø"v¢è$òí¡æ75Ù4¹%=@6)Aû·s£#(µÐÈÛ©¹mda¸áÈ¨bÎy©ä²ÙÉ ¾Ñm¤âýowñ%úèÀ(È¥¡rÃ\\ëQÅijr!!Í	¨è)¼Õ)$µØa°èU©'øQVwÈAqx"9Ñh\\>ü!á·6ÉèÖá¨\`ÎqÉ%ð«9@©'ÿºH=@áùñ8)ã	5Ë	G'&ýg);üûÉ\`üZ=Mi§fÎùóõiúÉ9ó}qà=J%P&Kã)Õ(^£èK'5%	±ÓqFnréé×)5('y6#WMi=M§]#ÈºøgàÒ	#'mri^Ü·!&'±i=}ühç³Õ'ÿKç#Ûèq©ñÉãSÎÑy©)Ñ!½ºhy§½Y!ßqm¤9$Pç#G©¨XÎ±(ÚÓ[èðÁd)B=@Åý=JË!3=@õHíímd!ßèÃq©=JÞ?Q°=@\`çþ¯IhçKgÍèíè!ÏY¦NÎag!ûèÃ¯%Y3ýYÉ¡_KHÃýu9#rr)é è-VÔ!G?.ÛÌ;ÏT4@nz~;gp1C:«+S ¬O ·D·WÀÒÛE·O\`p{O=@î´çEô¡ç\`ø©øã!h))ÉQçéÿéßèàôwuÇû!Õô¥xÕ¢ôìÀ	U¤oÉéQ=ME'ø©=JÕ¤ë¿ÇÓ	Àº¢­·ÓãæÀ¢qõò´ØÊï9²sIbá´îi4bæÍrÿ]ßß"-Ó=M±Åd_¼âùãªò Y=}¤®tæ¨SuYÇxÙLûãV]õ1>ö¼¢ùQ+Ï¢pñuæ¼½ë¥ol]­Oè³£óO¬ñ8bÂaÏäî1ê\\(í«5^$Ñ$þSiêtWé_=J'âa[Çau&=Jþ3[a­ÉÎsf¦ªÝ®ôý¹tbçxï¤N¨Ý½ÑÕ) mtEÀ×æü=M%q<éÅñ"~ä²¡D'/VÉf½!³ÑQ+äcÈú?¿b¨5¢=MïµNÈ"ïaP÷O0¡-°£¯ÉîÓ¹£Ù&m³çE=JÃË$1+§Ñ¦© ³%BØÎ!é^l(ã7o87ÄJ]H°¯e¸c]vU	ðs(Pr¦Cun!Çs&;íM9äW»¢Ýì°EµèÈÝxÄ¡ù]$8³	Ö~ðß­<Ý=@¡C³Ñ2ÚµeOÈ iê)&¥Á=@9Oh¢ö©a<IzÿÚÉÔ"6mã?-¾b'Ê¶ËýÄÁÁ¢÷ô°´o1XøÒVO7¡¶ók(<iüåë<!óòßmÕÉræ{õ$Éõ'5³ý(c9ç4¸À"³L°lõ=@Vbjé%D,¥çâ Þîý´¦ vuhw´Ù¾©[©«îC?fC[ßî±ââ"×'°aÏ$CàyS¯W S×(¬À«xéãL'þ=M-Ø%wÝUðÆ¤Íû'óaÐ]?!Õ"(!±ÿµÓ¢ô¿¢õ=@ÝW	ñº÷Vµ×ÒáßÔîåL´±Ú5º"³0!áaLìÄuFÁ|5WÆq³ÉÛE¡£Ûâî9äBÖÔ¥£³!þE\\½ôEØø@)\`Ûiv¼"ÿ¦ÀêèÏEö¿¢lµ¨û×ÄAÁuÂ(÷<y3^f{^eíI/â¥"=@3³YT{ýÛÜõ<!]F7WO(a³YÃ^wÈ=Já<é>ÛR\\ïãá7]ÕèÔºùÆ9_(ØÌî¥@ßàh)ìÝUDHE)§³=MjóðÈ Ë(ÁÓä}õEi1µ]ôh6M>qµ·³;Û-N¨ÿñªªÅA¹»¢-uÈýÙÅK§¨mìÝ¹çÀræcµ'Ëi_%ìX7YÓèå"=@ÊÉ_F°µCIâN"T°ÉE'jÕé¶OÁ!&¨E¿^ 7HH!là	ø?¦/³=M'\`8¿â5í¯ú#GU¾"cauÓ_YÉRðÿWAiæÞ·î-ÄCÌµõ²S¿6Ága%_·½¢JmëçYä9½"yu«FQÞÞÚä§U	l6Å×ßkU?ØÏ![b^\\ëºî9äyÃ]_"Æî\`[ýÙ´åM0ÏW±IüY£S"°×Á$å|Ea­ýÕáçÆN8ÇëámíTs&®½ÝóÜC_^û|^'÷P·NÈi¾þöOýí\\Õp±»(<ùÂ|êè<à6v±;(+§V"#~³9ÞÒ=Má¹¿=Jµµþ#=Jþñæ¨×½ñt©lxé³(mËÔGGpßQ(ÔÌAASTé£¡çdk¸ì>uÔù}ärÆ>;Ø[=M3S®o®^¨Î¦ÙÑ­Éòõ)G8©px&¾OôCkÍçþæH)¤(Êç\\iôa)(Êû¿G³Ó,Ë®Î'é­úô8}4'¥£ÿ=M_6ë±Ë&A¤GØlo,oTÝ§Ãéf:¸²\\qO7®¡¨fÑÝù*¢%ØýÃùh-T%6ú]ò_ãÔÜLöpÝò«úÊzÞ9´Ëwú\\RNBx¸³n¼ÓØhVKX=@qNBw¤ÂÒT$²ÒÂÂRÎhc	iTÓa-½­v3ÐnðOîï´ª¦\\¡PÖÕÅ¶í°Æ{÷÷;3Ð¨¤i®5uúñð¯Ýäin._ÕyZPÃnk©Òl^L¼SùëtýÝìÿ¼¬÷çk,=}ZÌÛS1ÌÐ´rZÃ;3ÛðNs¤þJ¯¨Wo~Ì/ß§¾I@¿n¬<w3'Ì<n ýÜó´ÐBÍüK{ð{¾êÞLÎñJß¹M·V_LQÿÜ¬F§½{W]óþUó>ÈoÎcXk>M¼õ°Ã¤C½=}w$â2§rÐèÿ^Þ=JHá784CFÞ§ÝyAÊ =Mé¬ü·{$Ð¬0ü}ÍÔn¢íi6\\½î!¸´['cèxð.Ý\\Æ7ÍLç¤E÷»FFë;{3³s¤¹º=@ëw'v3³{T¤ ÖSË´ìRÈw<¶\\¼³ÏPPOÂ¶Û)Ìò©ÍF¿® û{Ð[øö:¸yxÔÔO>ÁFmx[·$°K×ðÂÚç[kNÉºv<öü=}v$Úââ[ÊhS¸¦A4]Äí[{Û{/Å·´>DNÍPoà¶µµx°{wÄr8ótÊ £MÍFÁÎÚwl¾ÎAÙûÉÇ\`Pð>¶{qò»¡]¿	¦0â$"ñ6ú}pLL<wsªÂÒÖ¶Ù^ÍÉÙhóBÃÍ¤ ·hÂþÅöë÷Rhî/£B%CÍrÌó}wAÈÖZLÏÊãIïÈÄØ3j?§ÜLÅwFn¯ÉïªïµÌM7ÝtÉZzÎqõÌÕoßr\`q5¼¤Åb»{ëZ¤9sßñ²aCÍ/ýÜ÷'=Mös­³£Í<Ý|G¼nToËE¼÷¬/ìÓ)<vTð2°ïz»wBM¥RSëUËSÂÂÒ1pÏU\\Ö\\ØÔöbßÐNtªÿ¿Df£úÊ«$n½SÎ¹Ï¼LýÄ$û.R3ÿOc°Å<ÍLoWÍT®$7¹´²Ju³Ø;ØØÔ=J¢ßòR{b·´ÔÂ&|÷ ÉjµUîÙ6&3Þ!d9_RÎ]¯'¾à¾e8wyè5e1SÄ;@?+pôd#2é<4´äÏW¹^Ãw3{çâ%}ùÓXycÜ%ç.ËVë¯=JxÒkÒwZ:Ä:l3323®RlVK¯Z·ZÉvx´ýÔ;xtj~7©inÿ>ÁÌo¯®p·ðË'ÿªN.ïNo^lå ëB=J=}km:DT~ã2æÍöÿÍ¾Ã¼¼¥HÜ²Öz@»ÐG=}®EFF5±û¥Kî=}|2=Mìâ9Ú?Ñhõ&-¦ºìe33Næ@13Y3Y2ù2y3¹3¹29392¡3á3a22C®5®Ý®ý®=M®M®'®®~ì@ì¹®ÿ®353Ý3ý2=}3Í2m2ó®l.Ë1Ë=}Ë_ËckæHjM":T=}2X®®Ü®\\<îÝÈz»=JSý%=}D;;ä=}ö®;®231Nw¬]U³CgK¸Z±Ú¹Æ=JppÂpblòõîë®Y3128ãcz®®U.9ì lEÊO0,ËæWÃ¼ÚÂ¯z¼æItBxobs¢vÚÑ¾Pâ<3¤¬Z.;ënRqbì2Ài°*l^höà¾LEÑÝBOðTÃ=M4C=M>ÃEC0CLÆö=JoâwpÂmp&çqpB%î×jåÿ¼ö¯öº¢	ßéßXãíèO}åófî ×=@|¸qÖ=@X×ñòNAX»1YF2»®hËNë»=JuBrâyBñ" vEì¦-Â)6õ3éß¤ÚA=@ýÀM] eÔÛw7èÕ-èÉÞA¦tÄÚÙ1\`}/¡0ÈÀ@ûUa?H2ÏcDE6bá¢áB¡+\${On,Mö : RxSPÑ-UòFb±ò8b×=MB(.âÃ¾8vhö[c3vbõ(ù=J07XK	Í<¤îÿ<\\}ûájhUí=JÑm%&d~UÖíøÌdæ¡=@sGp¿ûjcG\`Èo±[?s±ñ®ØÆ]1±/äÿÕæ ;å\`ÉHb¨ÆÊ¯û0(eKmÈM,pÎJj	JÏH	ñÒÁÕtÇG	Zò½|±Dâ8S(Æ3#IeÛÍq¡<,#éø¾åvãÛ½¡+«¦P|Îdoî;oµ³1QÇ¾RÃÕ>¬=MYÞ.¹3í£=J*FÆnàimúð5a©^mkBMý¯yÃÔiÃÙcíb×æC±Âx^ ù:Þ¿É9íÄå¦¨õ#ÙDÎ(®Ýà"÷­a¾÷QÝïÕGpËÝ­Xý+ä!#Ë¥*äñ/Ëå2äÞìFÌ)S#T9vyÄ(ã(ø)éiéTÿÉø)¡&))¢ËÞÞ"©1))&Ç)'¡&©Á(#¡¿ê)?ûð)(Æ'Ó&)ý=M)é)Æ%ÏB­)#)ýñaÑè=}©=M)BYôÿ.yØcµßæ%×¼åÆÏK1ë@¸ãêí	ïF cô*Ø®S!ãtt©qÛæÛV¢Sáæ¡ðë3eîÉ*»ïÆ¸>=Mc°kw.Ì/äì¶[¶ç"Ç¥Gµ7îA"ÝßßÝõÁéÛ<æÔ%ßJtUëÆh¦ËÌU¹§µ'¢¹jÃíÀÓ5ddÁ=}åý©Ö÷5ÿ;ê/òøíÇÛ=}á{vlÁ¼Í\`»éÚÍCA¹Ô¨¨pùØ×g<7¡=@IÍ´ºÅWU¶I8'>¨öÿ@;Bðä ZÉ±XpÁÐ=M5ÎÞSÎ¿Õ	â§nÓ¹E°II(ä/ä\\\\±×G}Á|ñJiFiÔÓ_a*¼Z3Uºçpas¡lÁ¹£s¿tBÅÌ¶×÷ªð'Þ&Mg4P½¾FÜ/GuçîÒ©äà.¶=MÂëbPÚ\`ûüFßcdÁ¨«w"ßl;í],I(F_sÅdO(ýÀÝàÞÓß¿"(]ý"s$B¶ó¶^¸3=@\\¡³"ÔÅUJJ¨twHh(7 ÷O¨±9ñº±ù{\`½áéÈ|,.mÀR}³òæ´°;¾×|ÛîÇzNØð1§,±Ðà\`\`\`à\`£e	VæJËãÙ&dÜ#8@ô9°\\æ:íC*& àà¸Vý}bÖô¿ÑýÛ?ãø½q&ál+IÉ#Åî!î´æY¼!=}ØïÍÈ²½!>£YV¹WY¼¡H­}Î}¼¹b;½ÍfI3ü§âKòA¡ûJAMlÇ´åPAe³JdØÈµ?¡Og}y¿¦æµØA¡1£ØÞm:´md×;^/F,Z ÁÿeAÕ2T\`1ï3!ÔYu®åÚ¸=JX/¹)>Î4dëlôi%µ~¯äÊ¾Á<í¤ñ¤ù$®üDÒrwuIðWô=Jp<>ö»ÅÃÕRåLåíwÜ?ÿ¸´¶×xè>#ÿþï½ª¸[Ì._)8XmÇ\`þM\`"·|t1.]ègµI?Øþ=@x6Õß7mÅâwp®DÜµ"w¡¡Õ_²QÉÞ¼ò=@2dÞ=@2¤F¿¼hoùX=J=MÐ_¯X×dúì.ÝgÞò£õù}w^|lÝo¿Ånµ¬¾úf?aáÙn¥"×5 ¾µ±ño¾¥ V¥K¥quZ[×Ç «2=}W<|Ú\`t^|¤r¢²;×:|õ<Sô:×O©A·#ÞDGõWöß=@m.§ÊºrûI»vû9Ç¾óÞÕw¿ÑNâ3ßsßê=}ûn3A'µ[Þ}D>Ä¢°¯;.¯Ì?dEÍbHSÅá§³%ëwà}³¹¥	Cpg?H7ûIýÉqüYìDq ¢²ûz¦Ä	ñéÜXQ±&ço¸'Â$ÏFkåÊÆãJ;Ì9~$ß9I21¡=}2Ì1^TµÝYnTiÏÉ.g¶Ýc|çZO·Eÿ¸Ý¼}úXpfüËüX¾°ÙÊhQiÔ¾ÕÏÔkóYbjÏhQixàø=@ ¯¤w/''>¤i+½¬N¡JÏE<9¬ÔYÒ?Nå©D=}sÕÊ\\Vµp@¯>2húðì3DaÒ=}<z³Kl<7OÒAµ(zý^J1"rc:ÜRpµ=}gê·éV8òÇÉÄCÇã[7Î\\²¾/[ÜØv$çI:¥®Ut÷é=MbÛõOG¨P¨³Ú8!¢'7C¶{éï[¤êf¦ª¯ta\`×5X¼x_!¢÷ºÍ®IÚjÁS¦Hx¿¬Jà@ÓtM¢ó§Ë=M/ AgBaI¿âAâm7 òßÐéâIÐ)'¶[3½fºí}OvÉÍº=Mm",Õ¿úËbuùq½­"¿]2=}?Ù.!}Ì¯¹³ñWO	w$f0«EtÙãTùî×WÕûÇKé²¼=M*l²wîó{ZÁ"t$l4±+AcLÈð¢]&>ôTf=JJ:üÝp¥c]Æ~4=J.ýwÊÑsxuø«Ö=@&î*gn;à1¾%¶qC&lTÒ[:ÐÃwIùwMÖp×C0ü¹Ûa<ðPËÐØv¥nä¾Z*¿ ø=J©t=@0Ð<£u=MqÏX1ÈMK8ø÷þ ÿï<Z½Y¤'Q4ÞteOqhÐ¡Óà6Ä=MOÞ8'xÕutÙÄ=}ý¿Kñ(t5p[(¹äf{àÐNÐS ×=@oYÔÄÖ3ì£@Gs9V¯ð;ßÓ+´]r¦1eß'Á×=@Þ,y'XÖª+p¸]ìuù b®zÉú;l$ÿ\\¯0:üsóº¤ÚÂ7nÃÄ(õàªó!YæÇ¹ÙLÃ·\\èóxó	Ò+÷0²c\\Sl=@£­Øðæ·±³R#l×=@ÉÅ¶óêdS,¥jÓAD@ùõ§xÃJ	íÙÚ³çjá=M>·zrË½§ÉìÃ/9Bè¾$î·F#í¾©i¹óÏfg±º&¾&U´ÐAá{·y3øn²ºÕF¼W<¤JÔ¯\`Úm]µÈsÆq×«²©Ïæ5÷ÚwØÔ²Æ©³{äð¬fSùÍu"¯q¡:F2P¤°Ú¿ÜÙðõéº$}$þÅ8¡°7ð@Ï½´0:ç9=}Üñ4ÞònU®¾ù{NbªDl«kx¦ÃLÿ8æK~Ë0bn9wÍ]*¹àl=M½Æ¹é{³ÃïCäº¦w1zj©NÖÑ\`zõ=}Xì*OH¼ÿÃ)A{ÿ>l¯PÓÍúßÌ{£¶Y®×=@$þ}$Zý£ÇpRsÓ® ©dk·=J£pÕß.prf³}HÕ_¯äl¹=@ÓÀ-%T¡''3l9Òjîr§WmoYjòè'_õYìÕSõNé¬®þAÍaÊ¸Îº¥÷ Yø¤©c'I)\\Y| ß[©®vÐÐÇüHÑá¡ÇüÔ® &_è¼ExuWOç.·y¥=J/yr	]¸¸Mm¢)ÔQ±S2·Læ°%Þ=MÔè£²1tGeÓoî'<ßð9¼á®ÉÚ@A¾¾$íÀ¥Rá¯\`§³k_¸v'.ñ?³=}ãA:yï»F¤hç0¿´GþBcØ;4'×Ë´ÿ%Ús7Ê¢ÿQ:HkVö½D®Í5³£Ïü­#æ¯|¤m=@¿×7h=@,Å?©~Õ£À8:ÂÚ/¨õ¯vá~¨Ì9òäS ß=@ÝSÍÄA|Xu¡ÇÀhîsÏì°53XUõ@íwm?o]fG_ áÌqhíPÏhpGÊ=@?	m)7¾¦ßá¯55YÍâÔßàê|Ã¢0u¾Âäì_ý¯Æe5ÃúÒÂsãêBñ6ÃÕc»þ;Ì|Vy1ÿ(5§J^ëñ éI_nsOßú.}ãìNlq}-Ò)JÕè2#»t}Ø½¿zÈprqGJ§ÌÆnï:héº©èQfª(Ê3®@"Þ8zO+ßnj¿©8nI=J4§I×i-Þ)jEzi)ò(E\\Qü	#ÑN)×YòçP=Mû¼Ùóæ¡½=@fµ|®¯Wy¥¥qcÔrøO~¹ó§lM2ó_ê[²¯Ë=@Sf2ÿz'°ßî®éÊðH«Âe¿èë#V	ê4Q¤cì O3ykÇ;Òþ2ÃVêã¬´³ëKð©kñ@Ûÿþ\\fVwij+îg¾Ù¯/ßZÀ/HpÐxúÞ«3ÒÛ(ì!éÀÿØ)Ä1=JW5ùß(,e³ù)#Zn"!,=}HèâÉÊþ0ò<üÓWî&JW'+ø'Hô|®÷WèEìqÒÑÎù¯í|ô4K)LJEè²\`ô=Jp>A¨ë0á?²#ëaþ/]@4ð\\~".I%-øÒ9~Ê+[Í:|éÅù3#éT%ì-:è'iÜ(HgQf¦$¤´±Û®éY¥Ì|¬Â+N·äÂQ¥+±Â!ÕÛðÙ¤'TßÔ9Ê'Þé|_1²ßJ'i;ü¨´s¸&þ±\`)}%$$ßÙEcçFUïfÛÊâlX§?[½òq{:nÛ-ÏXÔ£5S,\\·-#möÎNóMß|X'kNXÒí¤ì¬yKG/2f9ðe\\Æ"¹³iPØ×5:µýÍVp=Mz]¥dQ¡þ¦«Úµ2Â]½³·úÕwP ·Wð§ÒØ®}K7û ToÃQÊPf©V­å«õÌ=@r^{?	E·w2D=@-éxÕ­ Í=JZÛñ¢æÛ=J#¤âvà7´~¥®¦QLà¦V¸9­';¡^ß/5Lí%¨9¡yð×11B&.Ùïà=}X$hô)- QíQ¡q6¨	.¹qmÉ¤F¨ùðôÜ"ìb7 Ï=MõcPVT=@-½EpôcU=}mâ©µíGÇoL0³sRãáS¸oÐí(OC¯³' Ãú¢0t d³-½´DíyåÂ\\ 6×8amdôoiììÊ#äB(ZÈ¶WµK}UÊyÏK"ï&@h'~Ù;\`A¹¼Û H~3i¦Ë@E]Þ3ðæ'{­ßd_.ÅÀùl8é=J=JuVS,K'M¦èAùØpÙKÙ[§Q>¡ä­ÞG{hI¿THëÙ=}$Í%´¦ÙEÈU·¼iëlULôëÆxpÖ£>í°É­µ5Ô	G¹å¤û²Ýq!$=J¦#Vdå¶õÐ=M¾µ1fðïøK©âdb=MúMRÈ=@DùôXq³Õzßw¶6íÒdæÂü79qã¥yûÖoM>¸f·Cm¹°&C#fÀÆwÚ >É!I¸O¥pëBZ8=}<1ÎØ²e«!Ü¢è2P¹¢.á»bB±ù%ëïS[x°=MË(ò=M6¸wÁçbâÙ[l\`v=MÁÈvÍßø£Y¾õÇ{ð{î)&e´0èêy|Úxd8æ ê\`]ÚåJÔ®m]¶&@Õ­{l^Çè1­Õm(8Ûrh?û¡ôí!òaB,k-Ù=M#¿âe@Ø	H·cè HpÍq9i"z:÷lüBw²óÕËýÎÜñætÔí¹Õ¾k+èÃ~#ç]ÄØÄ´Îeã#ß<70Ý.V¨®S]ÀýÞÁbØ7¸¥4'D¢ZÿEC«gúÊ¥¦c¨bdÞn^îÈU¶÷ÔÍõ® g­=J b°µR>µ"/£Í¥È=@~L!±Û´Í£z¾	¸ÌfÛ)DÖW=@H}Ù!ëâ=M{O«UÎu¡Ì©C¢í!î	å=M¨	?²ýF7Â¿[4uùlÍCIzöN"0ðd»;i3ïá«¿¤ÔCÉÑVl¾Ù#9ÐÐÍú¨eG=Jh­)þl|ÌIìè¡¬ò8FBé7¯EH^y ñ­ÉÌõ8Uà4=MÔK¦>çù¤_zpSÞÓå4Áëä±i=Jaqî3«!Ê»=@@I/%ñY{ãëNî$økÇw£»®$%Cl9©¹ß¹ tiÖÈh-C7¥ÍÙõa;¤yµ!A=M±=M´½Y"ª&XJfN,9àêý­xG¡ËSÉaºæCfèè¬ÿSh²Â<£¸b×µWø	V5íðÏ~$U"GÝqí¥RäS~¶ñÕtË¿/x(H85ËªÒ"ÐI0yö­ï=}Ú©eîÃÙ=Mû-µø¥5oqé=Mñ\\&"îE½p$(Bý,®'SùÛ_&\`Aiyï³õÛÂ¤ÊfæX(®OØaA§·Éd«Ñ!P¦À\\6AXqé/[âõ¡ ìÏW¢¥-ðöî"ÇIÝ6Îptfè^9Ö?H«£¶Ö+Ù<:ãy£±Ù÷ÂC1èåäã¶-·=JÖ¯miíò´#j9[ÌðL~²´Zñ} #îEÅMä=MöÕm8ß{ÁWÒY´Ä¥Êåùw¦Oôrñ¡ÿ'áS)rGÔ,è´ä3¡ØùÇlç·ñ@k)'F¦DÿäíÐa7{ì;6£,Xð@Ff, §hqÿ8ïê¹WB>2ñak½[ "=J¯ÉZ¢¦wfõîà5úåyUÞ«¥åì%Tø Ç·1ÌjòXíüxgzÖ(¹rÉ³Í¦oÓðBFä&=} ¦«:=}g¯æûÂÞ¨7\`ÎÇjÅ8÷zkövrñ<¤rz5àÁ0=M{®¤èïÙ±9ÝJ63é¶£¨ÑYÀøtq)ø:IHR´-úÎn=}r«}ÀAZy	¹_åÍ=M±R=}:ðç#H&$6Xm8MWòùx°ãùÖ)ÚIðºs²å+ñö;ÂZB%µëÕ=MUÃ¢/Å9Ñ0a>jü tâ_¾ÑHøwj+ÑTB{Li°oöªøýC51í±9eû[";øý ) èRP	°çÝí¡¯eÈÂý[ÉIø×²wU\`=M"û¬F·âx_{Ï=M¢ö##0¨ÿmAÕ:W´b´98W#evÓAµÔ=JÃû¢éOH'¨<Glßdp"¶ü9î%¦¢Ì9Ô¿c± ÅpMøNÞ¡c4Ù8Áºà)b¾&0ÏáLbä n'àé¢»l¢ø!=JI£«ÄÓ®	á%{¦û=}»}¤·qb~¦U¶ÇÑ~ÞCßI,5MÍ]¢Á$³zËt=}£ @1÷ð¬ _Wdèñ×«iæµI&äJu¡?pä#=MÇ£}Sþ";Uù@n¾w]Â\`fðõ[ØVæc±4ýaò@Â§æ,DVæ®uwe=J|nh²ö#ïÃHBFã>6l±Áµ{£Fitåç-äÂzë6iÐ_4=Mð×/ú&Gç¸!zÐú\\+]ð%z	$-ÄE­YE¯ËìÂ¤Ò\\04EñìÕÎ~S¯påF[øT0.¶ñ´ça×å1ù=MN£$XÂÀ~°ICªÏXëgÍAÌØ¶¼ó_±Ég)=}DYþM î¹¯mTÌúà(4´æ­4yÚÃhwÚ:¦Ü7\`é·»¨ïaCpbMß¥XîÒï	KVvH®»Lä$·ä¤òß(¢)æ-lß4¬üáF°_:ÉæhbsÆ rÃßb/üÝ÷û+rôÒü¹RÉGNxÇÏâ¶æëmd¦·$~×Läµ>;Uña+C²°äþ¹l#BÉeI)QFGBõµ-oH»](ÙæFC³6ºrXz4~\\.wÐ=J©±3Äïå½bpÏÆå­ç?ù¶Qü>ÃL·bI¼qY7:ÆÎ3¹³8î5=Mô=MÚPæyÆW;ÇÊgv~zíN§kùBò¹®1£¡|µXt?Cá ±æ¹©$)~íùþÖéxzíp·­ÅÖ´b0W¸|ÑÛeýbr=MSÂ^x¥üÙÖP·ïÑ[D3uMkf¡kD%]·wvUTh´pLßÿÞ.¨P×N«±Âü¢$[×6«íÑ>D	òAýòÓ{dy'ÖiÇÑÝ(=@Éø$ý©dy'ÖiÇÉ'ÖÉ×	Ëm¨ùù&#Ãi)kç(ÁiÖS¹·e¥CºùK©«¬¯4AVöóã¢³¼ÏtÁSØæè¬µ¢o%É²)(³©®Âaá×>7ÆvªxWS55ñÚwâ"ÔKeçÚey·ûËkílr#\`¯·"N{WllÞâ¥$X@õ9ö>Óç&ÎrLpfý{©=@®ô îp9hÞ6nú»^Ç­w­Ù;Qh©ÁuòË7Ñ!¦WÁjèÌÌ$sN7Á"ÈÝVµæí¯JîïS¹ÜçùÍc1¼Èè'Rç"']#¤ß¼È»¿¦¼sÎXÑÁNÜôU)#)x¤E.ç	m %é&üay=}5¹Mzµé=@Znña­¡Í¸¢zôÇmÕ&I`, new Uint8Array(107357));

  var UTF8Decoder = new TextDecoder("utf8");

  function UTF8ArrayToString(heap, idx, maxBytesToRead) {
   var endIdx = idx + maxBytesToRead;
   var endPtr = idx;
   while (heap[endPtr] && !(endPtr >= endIdx)) ++endPtr;
   return UTF8Decoder.decode(heap.subarray ? heap.subarray(idx, endPtr) : new Uint8Array(heap.slice(idx, endPtr)));
  }

  function UTF8ToString(ptr, maxBytesToRead) {
   if (!ptr) return "";
   var maxPtr = ptr + maxBytesToRead;
   for (var end = ptr; !(end >= maxPtr) && HEAPU8[end]; ) ++end;
   return UTF8Decoder.decode(HEAPU8.subarray(ptr, end));
  }

  var HEAP8, HEAP32, HEAPU8;

  var wasmMemory, buffer;

  function updateGlobalBufferAndViews(b) {
   buffer = b;
   HEAP8 = new Int8Array(b);
   HEAP32 = new Int32Array(b);
   HEAPU8 = new Uint8Array(b);
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

  var ENV = {};

  function getExecutableName() {
   return "./this.program";
  }

  function getEnvStrings() {
   if (!getEnvStrings.strings) {
    var lang = (typeof navigator === "object" && navigator.languages && navigator.languages[0] || "C").replace("-", "_") + ".UTF-8";
    var env = {
     "USER": "web_user",
     "LOGNAME": "web_user",
     "PATH": "/",
     "PWD": "/",
     "HOME": "/home/web_user",
     "LANG": lang,
     "_": getExecutableName()
    };
    for (var x in ENV) {
     if (ENV[x] === undefined) delete env[x]; else env[x] = ENV[x];
    }
    var strings = [];
    for (var x in env) {
     strings.push(x + "=" + env[x]);
    }
    getEnvStrings.strings = strings;
   }
   return getEnvStrings.strings;
  }

  function writeAsciiToMemory(str, buffer, dontAddNull) {
   for (var i = 0; i < str.length; ++i) {
    HEAP8[buffer++ >> 0] = str.charCodeAt(i);
   }
   if (!dontAddNull) HEAP8[buffer >> 0] = 0;
  }

  var SYSCALLS = {
   mappings: {},
   buffers: [ null, [], [] ],
   printChar: function(stream, curr) {
    var buffer = SYSCALLS.buffers[stream];
    if (curr === 0 || curr === 10) {
     (stream === 1 ? out : err)(UTF8ArrayToString(buffer, 0));
     buffer.length = 0;
    } else {
     buffer.push(curr);
    }
   },
   varargs: undefined,
   get: function() {
    SYSCALLS.varargs += 4;
    var ret = HEAP32[SYSCALLS.varargs - 4 >> 2];
    return ret;
   },
   getStr: function(ptr) {
    var ret = UTF8ToString(ptr);
    return ret;
   },
   get64: function(low, high) {
    return low;
   }
  };

  function _environ_get(__environ, environ_buf) {
   var bufSize = 0;
   getEnvStrings().forEach(function(string, i) {
    var ptr = environ_buf + bufSize;
    HEAP32[__environ + i * 4 >> 2] = ptr;
    writeAsciiToMemory(string, ptr);
    bufSize += string.length + 1;
   });
   return 0;
  }

  function _environ_sizes_get(penviron_count, penviron_buf_size) {
   var strings = getEnvStrings();
   HEAP32[penviron_count >> 2] = strings.length;
   var bufSize = 0;
   strings.forEach(function(string) {
    bufSize += string.length + 1;
   });
   HEAP32[penviron_buf_size >> 2] = bufSize;
   return 0;
  }

  function _fd_close(fd) {
   return 0;
  }

  function _fd_read(fd, iov, iovcnt, pnum) {
   var stream = SYSCALLS.getStreamFromFD(fd);
   var num = SYSCALLS.doReadv(stream, iov, iovcnt);
   HEAP32[pnum >> 2] = num;
   return 0;
  }

  function _fd_seek(fd, offset_low, offset_high, whence, newOffset) {}

  function _fd_write(fd, iov, iovcnt, pnum) {
   var num = 0;
   for (var i = 0; i < iovcnt; i++) {
    var ptr = HEAP32[iov >> 2];
    var len = HEAP32[iov + 4 >> 2];
    iov += 8;
    for (var j = 0; j < len; j++) {
     SYSCALLS.printChar(fd, HEAPU8[ptr + j]);
    }
    num += len;
   }
   HEAP32[pnum >> 2] = num;
   return 0;
  }

  var asmLibraryArg = {
   "c": _emscripten_memcpy_big,
   "d": _emscripten_resize_heap,
   "e": _environ_get,
   "f": _environ_sizes_get,
   "a": _fd_close,
   "h": _fd_read,
   "b": _fd_seek,
   "g": _fd_write
  };

  function initRuntime(asm) {
   asm["j"]();
  }

  var imports = {
   "a": asmLibraryArg
  };

  var _malloc, _free, _mpeg_frame_decoder_create, _mpeg_decode_interleaved, _mpeg_frame_decoder_destroy;

  WebAssembly.instantiate(Module["wasm"], imports).then(function(output) {
   var asm = output.instance.exports;
   _malloc = asm["k"];
   _free = asm["l"];
   _mpeg_frame_decoder_create = asm["m"];
   _mpeg_decode_interleaved = asm["n"];
   _mpeg_frame_decoder_destroy = asm["o"];
   wasmMemory = asm["i"];
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
   this._mpeg_frame_decoder_create = _mpeg_frame_decoder_create;
   this._mpeg_decode_interleaved = _mpeg_decode_interleaved;
   this._mpeg_frame_decoder_destroy = _mpeg_frame_decoder_destroy;
  });
  }}

  class MPEGDecoder {
    constructor(options = {}) {
      // injects dependencies when running as a web worker
      this._isWebWorker = this.constructor.isWebWorker;
      this._WASMAudioDecoderCommon =
        this.constructor.WASMAudioDecoderCommon || WASMAudioDecoderCommon;
      this._EmscriptenWASM = this.constructor.EmscriptenWASM || EmscriptenWASM;

      this._inputPtrSize = 2 ** 18;
      this._outputPtrSize = 1152 * 512;
      this._channelsOut = 2;

      this._ready = this._init();
    }

    // injects dependencies when running as a web worker
    async _init() {
      this._common = await this._WASMAudioDecoderCommon.initWASMAudioDecoder.bind(
        this
      )();

      this._sampleRate = 0;

      // input decoded bytes pointer
      [this._decodedBytesPtr, this._decodedBytes] =
        this._common.allocateTypedArray(1, Uint32Array);

      // sample rate
      [this._sampleRateBytePtr, this._sampleRateByte] =
        this._common.allocateTypedArray(1, Uint32Array);

      this._decoder = this._wasm._mpeg_frame_decoder_create();
    }

    get ready() {
      return this._ready;
    }

    async reset() {
      this.free();
      await this._init();
    }

    free() {
      this._wasm._mpeg_frame_decoder_destroy(this._decoder);
      this._wasm._free(this._decoder);

      this._common.free();
    }

    _decode(data, decodeInterval) {
      if (!(data instanceof Uint8Array))
        throw Error(
          `Data to decode must be Uint8Array. Instead got ${typeof data}`
        );

      this._input.set(data);
      this._decodedBytes[0] = 0;

      const samplesDecoded = this._wasm._mpeg_decode_interleaved(
        this._decoder,
        this._inputPtr,
        data.length,
        this._decodedBytesPtr,
        decodeInterval,
        this._leftPtr,
        this._rightPtr,
        this._outputPtrSize,
        this._sampleRateBytePtr
      );

      this._sampleRate = this._sampleRateByte[0];

      return this._WASMAudioDecoderCommon.getDecodedAudio(
        [
          this._leftArr.slice(0, samplesDecoded),
          this._rightArr.slice(0, samplesDecoded),
        ],
        samplesDecoded,
        this._sampleRate
      );
    }

    decode(data) {
      let left = [],
        right = [],
        samples = 0;

      for (
        let offset = 0;
        offset < data.length;
        offset += this._decodedBytes[0]
      ) {
        const { channelData, samplesDecoded } = this._decode(
          data.subarray(offset, offset + this._inputPtrSize),
          48
        );

        left.push(channelData[0]);
        right.push(channelData[1]);
        samples += samplesDecoded;
      }

      return this._WASMAudioDecoderCommon.getDecodedAudioConcat(
        [left, right],
        samples,
        this._sampleRate
      );
    }

    decodeFrame(mpegFrame) {
      return this._decode(mpegFrame, mpegFrame.length);
    }

    decodeFrames(mpegFrames) {
      let left = [],
        right = [],
        samples = 0;

      for (const frame of mpegFrames) {
        const { channelData, samplesDecoded } = this.decodeFrame(frame);

        left.push(channelData[0]);
        right.push(channelData[1]);
        samples += samplesDecoded;
      }

      return this._WASMAudioDecoderCommon.getDecodedAudioConcat(
        [left, right],
        samples,
        this._sampleRate
      );
    }
  }

  class MPEGDecoderWebWorker extends WASMAudioDecoderWorker {
    constructor(options) {
      super(options, MPEGDecoder, EmscriptenWASM);
    }

    async decode(data) {
      return this._postToDecoder("decode", data);
    }

    async decodeFrame(data) {
      return this._postToDecoder("decodeFrame", data);
    }

    async decodeFrames(data) {
      return this._postToDecoder("decodeFrames", data);
    }
  }

  exports.MPEGDecoder = MPEGDecoder;
  exports.MPEGDecoderWebWorker = MPEGDecoderWebWorker;

  Object.defineProperty(exports, '__esModule', { value: true });

}));
