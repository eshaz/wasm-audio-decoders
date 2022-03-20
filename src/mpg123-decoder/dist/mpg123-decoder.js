(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('web-worker')) :
  typeof define === 'function' && define.amd ? define(['exports', 'web-worker'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["mpg123-decoder"] = {}, global.Worker));
})(this, (function (exports, Worker) { 'use strict';

  function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

  var Worker__default = /*#__PURE__*/_interopDefaultLegacy(Worker);

  class WASMAudioDecoderCommon {
    // share the same WASM instance per thread
    static instances = new WeakMap();

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
        if (WASMAudioDecoderCommon.instances.has(this._EmscriptenWASM)) {
          // reuse existing compilation
          this._wasm = WASMAudioDecoderCommon.instances.get(this._EmscriptenWASM);
        } else {
          // first compilation
          this._wasm = new this._EmscriptenWASM(WASMAudioDecoderCommon);
          WASMAudioDecoderCommon.instances.set(this._EmscriptenWASM, this._wasm);
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

    static inflateDynEncodeString(source, dest) {
      const output = new Uint8Array(source.length);
      const offset = parseInt(source.substring(11, 13), 16);
      const offsetReverse = 256 - offset;

      let escaped = false,
        byteIndex = 0,
        byte;

      for (let i = 13; i < source.length; i++) {
        byte = source.charCodeAt(i);

        if (byte === 61 && !escaped) {
          escaped = true;
          continue;
        }

        if (escaped) {
          escaped = false;
          byte -= 64;
        }

        output[byteIndex++] =
          byte < offset && byte > 0 ? byte + offsetReverse : byte - offset;
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

  Module["wasm"] = WASMAudioDecoderCommon.inflateDynEncodeString(String.raw`dynEncode008diJ)ëò
t
ë{dÆYi Ùó³&­tËÍÝ'Ñ×Ú[ÏÞÎbû,£:âÇ º Ï£D &Nú+"ôóÝ~@õÌ~>ñX4âG­¦DA;jÚèBåé(7âgßb{ïÒ?llG[ÊÙM:fMit)xJ<HÄl½}øîàÉÂÂ¢Ûj¡füuË´jtqÚ²E¡ 	"4³414³"ÏÒ1()qÞãÿ+nký|Ú¢=}Ï´³3O´gÒÛwÿetbYrÚJÄ"á.K7Qõ<ïw.a÷	Âä,náÞº	 s­oºÎÌLLÕ8l©KbÏ¶
(KÊ5} ÝÞº ç0«dw-fyæá§JmÝa@?8ÈÙãRÞÝ0-ÅçêG7Bµ;B­Û/Å»Î©ßñ¡^æÊ¼P@Xç²
.oß¶o¿Lî¥ê]Î²åë;Ód¢ÑN?Åú"Wnºnr×¥ÛÔ= Þ2[ýq´Kõ!á\6L©nõ=}¾©kªÈ±	Ô}nÈî¸N<ñwèO­ |OVJ° ï\úHº	Ü8êüIÿTv}W¸;%pzD{§Lq#ìtÈûr(lCnv;<JD	ä4Þáï%0:^cÁÅÄK²¸ìVëüÜXü/¼ë§qZ>¹é qà:%ñàöx8?ß«22ê$ä2Ng5ìÌ8<ãc)B3¼ã²k¥:ÛíàiáÍc_Eß32ÉjB¾/uÓÕÏÒ;= \^¹g¥bnÞ¯b}{yhûß1îkÈ'×"ß«ëÎõEËuúRþZ^ÂÎ§tNøib	 ËbXxg5a_Ím<÷¦ES8_½ºèÔ3{)UW	ÓðLÖÞçË¿'ÝÓ§§Ec¸[P^´ÃRD´öÑ¼ñBëîöoØ­Öpq¼H/á|±j¯¥X·=Mâ§ÆöCyXGÔ|×pyüßØv[volaKãä§º±ÚÓ_:ógÊ_-bôPá§fýmÕñÅ+b5Ê{ñ²Æguñ'þZBzO¤yX§K7K;ÜÈL;¨cUÔË±jlw÷ÑAqgÃm;=M¯¸-X¢Ýwµ­è.¤âtøâÞ§xvPÜkw§Õ\Í13¥£¹7 RÝã1¡öAAE= ¡r.>'
6­@Þ¨¶J¬ÓV-ÙÖ'é("l"#W{0 Ô?ÿkÈcyV(ö9âÛ¸tSü¹ÓøèYMÅkUÝá:ðÁ.hG<Z7¡âÒâ:µsîÆy×hÎäÀÚh'BtÚ¥§iVë±6Â¸ÚóX|Èík­iL  ¡kbwÖ ¯u³@A!Ãé#£nj6ß<Wrd¬²ò3ÜÝ^X·xS0öüg_96u«¢QñÛH1
ãí,úcôr»4Qùýn72^AÉW1uÌÚyAüïG´@.AÃÖê'-¢X_xHoS0 Á®¦=MèÇ)GùÆ½ÒvÖ0AÔÖÈbÈ]3¸vÚ:ß}Ò»4X4§kØv|6_³ÙÙÝªb8¹zòR¡,¦C¹çòn=}ñXãO§|ï9C½ó²+	Náp0¢øË~?ì 19âç×Æj1 õ¡NÂ2:­J¥¸Ç	*,9Y{×;9ÀãÑs´^9Y¹7qvõã¢ëÖjô ýØàøK±:åJ*¨üÕxtSB°NxwÀbÜ ­9+#¢VÝ§É'çF=MV_^zô&f÷L#óüoô*Æ1×àÌÙñ®ÊX·áäº×SïÃyðúV"îìÐhÐE¶c]BU·-âý
Oå>ºöúP¡ñY#.DÚ-ñe8|@õ
^µ«.Ó	Z§@éì±Cåëªl5ÜúÈ¹YC^W-2IC(ú{kB¸:yóIÛãT®·hP]±V¬Ôî&'ù|¸ò>úþç9ª´<vH)ÜD
æhÑ)?´ÑyÖùÑÉ÷gyÙÐzù¢0'¦áÉ'fÖÁ«2ýËù(Þã93²ò2ßXÛíìòÐ)¥Ü°òqÂaã(Óùá²E?=M¶§ÈkP3î(ýã§IÊ0övã¿ÒHT|=MÖøA´Øa}ÉßùÕyLôc£¯CéÆ)ñþëgZ~L¶^
Ânûzõ|vñz{pl@Ìóe]¬JøÌ0)±ÓòÇ;öÎ¼2Î¢8qêîÒqþ¢(~ç&ùâ&hÏãæú_.Q××o·ü æj4(=}þ= _1}qæ÷c"µºxä@¸­$Ø<½_B.U±ÍQ=}sèÔkr«(]$q¶õãïJ ¹Tg/4GHÁ·z¶©ÞÖ_½)ÿaâí°c½´õkQ¢¶ Y#-¯¯b¨qäéjªÑèðÕlìæÒqÙ[Q%¥\Ç<êÊ ¨= ¾rÜð§ªÊâBËp:öÂ:X9ÿ-â¾Í7öQð¨òZâÓÌ@&[÷÷ûU×jbÁ #ZæÊÆèC
ÞA¡=}ÆÙËJ¾êóæ'°n'bÆþru6üIÀV7­A{M âÍ!,£âkñReþ¸1¸×dÄw	¨=MîÍ@0XHN»K¾-ÝGã69¦&ÝSl¥iIÕ¦=}dÔ­vÉr¡n9ñ@õS¥ä¦àMâãa°±EÝ¢ÚSjQ&õV§3öK±÷;þ³¢;t>ÓÿUÏÍ+³	EFï¢ÀbßÜÔZÒ¶PV¶éÑ1øü'Á,5ÀØ¯ó,ëÏY§ÚUD%Uy_Cä1QÔ´øÂÿz«&G;Úìª°rKiã.ÚaSÒër/!¯éÈg_ziÎ<ìúX!÷R+KÚ£òxÇ/ºÆ>@õ°ÐÈUÛæ§lF!9´¦Qð8Á¯yP8	Þú±>Öcòºþg$&¡DÜ(äçgtÝaB'ÈAº@qDà²1föïÌdÐî£^ûÃjìyfÇì×eO..â0Ôh´?çúÈ¹0ÎÞ*¢ÎýÀR~E6"ÏåÍÈ¾Z¢·'Z×4°¶3ÇÉ/4Vó1Á!Ûö±£¶À¤*ç_µ¶ÅÞ=}Â8þô8¨Q¡ ¯·4ùÿâÇ÷¢)Å*8.Zaì/SÀîª£ÜÕÓµ¦¾ÒÝçÉòqeíÑç¸Õ2øL%Ë/Ó*&8N¨ù/JÍ]"#÷Æküã4åÍø<.ÓSêá(b:LRÊ ÄõÌ«E@Nçåw«neµ²?5= B
)ýB¥Þh£.nUÈÞ¯æÒ5«ß¶ô{WFD­×ÈéDM¤{M/8ÑC7;Ô.À:Ôªº7«B¢nwUÚÎ]$ªªvõØGæJ~À¼Ë=},0Ö÷Ùw0)Ã%^A5G@÷ô§þ½¶¦±2zç6Oª©a¨¹è©ò?nBezL²ÔÏËú±q³Çµ'W¬ÊÝº¹ª4êe	pØ±5ÑiÁ	t7qä0¥[VOÛµáÒ4ÏÀXüZ×üxµ8Ë[U±/JzP*LóÎ´]'·þªÄÀÇ±W°ÍõÍ$A4«ã>úA¾¦ÒNë²ÙÎur~"ÑSa¦;
Ã{íqâ$ÝïÈ©UÇnosr~EÛhB*qIúôóÈÁ©®ËÃ÷=MÏ¡é?iû¨<FEG= ÒÔYw¯nWO®u3õ÷C@Dlgü8/aõê¦!4·ÄÉÇÿjg)1ÔÒßDÏhïvÛÕÊ'{.6XÐP*ßà"þCl  xOýÏôP&ÕùHpt¨ÌÇ\ªkT"ÜüÆ!hÓ»¶R¨ûº6° {$<[f¬I}C$L1VYly]nÐ,×;°ì¯ªcÜP!ýñÜ¬	\¬vìÎý«vB<ùz¬KJZKÈC©k¼{dlýP|¸¯ÅÑælÁª´gyGõü§ÉY)=}ÐÅz@	y¬ðµPXíCvv¼½ÌÏUL'ÓÌÇD×ÓÊË1ðßZÉ¾êoEFúõCxe7\¤¼/d42ÐZC²Fà=}rÝ }ôçG8qØlÅ}«8±WÜÉþy[ä£r<¹W«/Dþx"à ìæÃÜW°¯5ª5·ª¬þcB|fwxM¯Ê© :Ã¼ó»QYç}Yþhé»}-W?dN (tºV²pñq¶^ì9\MêÆªùGCDH ¥×^U2¦Ü--ÿ¼*=}¶K,Æ¦9$¿ëÕöÅ%1­ U¥$í®#°üdcþÆìÙn9ì±	P¦ë5ªõtmÀmïÐÈC&¦×ÁÉÏªè´¬EtiÞð[FZÈÑÒZfð¾§Bj]èvëCÈ?eèÊúyt®/ç)hÍðèÿ©QÎèp¯-r(±unÕ2éoiRV¼oj"ît0HÅ·EÐôþW=}DîJÂßy:ìÅSkyúBa#ûßCóðASJ:j¥:üxÃO3CD¨0{zo^R{úSõ@Hð¶ºhÇ3#CÎýÑÙÕ¥jÏÐ]F½ 5Âë?ÕÕTUGIrÏDÐºzÖÀÁüünJN%£{ëáØÚÙ4¨ú§È½Ì«wENÃâ ú9ïw=}º J´á>ß$³^-éÆ)Ìd8±çíªDì2ªY´úæ"lº² âm=}»Öý¤Ù;«[,zÂ#ÎÝªÊÇÿ~êT´èù´{è©44ÂSÖÉSLê!ØÔñW¨·¦n,©ÐEÔ'¿y§'¼:Ûkga-¥êÞo¹*ÌýÛö@(*Þ_9º@ùìÀùµïªFm[Ì y©²G> ArsýIê´Óã^íBp5q ã¿@Ð@Ôôì¢):÷ã$°ñ¬þ-Ò ñ¾tÐÍç¦ôÇæÀ0-2~æQEÀøÏøyÇnâM"æ¢Ï©Û/ìÆI*¨b_¨ªJ>~;3ù~ä4b½è§J0LªPæJ#Þ¶·àÕ)äÔQ!@ñý Wâù¿½Äh¾Ù¨õ¬Þdµ3.;a¬R8¥*t+¹ýI´ÏùÔd6ÑÞO¼8ùw@ÇkàÆ\ÝH}½ê¿«4ãòVÔ-WjñÕoDFV]å9(¯ñÅgìÑhÿÓCÝðº1DØÖÜ_]î)&cª:¶Gòi3»>RÆw¿}Hn¨þEÒÇÖqÒÜÚôrÊ¹¿Ûµ¨ßz¬üaÓÒÄWÔ?U}\¦rê|¿f@à9Ö$×÷úq¸æ+½Fªo5­8Æ·¥ÁgCx°¬i0ò,Ut»Zìgïñè÷]ôØhp¸kJ@ËÕ't;@ËüÏ(Þ^CÌ©M>l
XËOì4+ÊjÙëX7¨Ì"94»5.~ÉEÏÉ? ´´<«ä]éÌäe^= Ðä´Ì/ý¯ë¥¾gPyâ+{h¤@2­FÑþCùóý·u-FÑ(ÐÁ$KËÇÕ7q>ßª°-Ã.bÖ.¬·Éâàab³J	ê»øÞê+#gwWB7£U¸8Kêä´BãaBÝ"°L)ecÈu½Ûv=}Uu¹ä0JHãf¨¤/¯ÊÂÑUß³ÎÇ¯ñJô¤1åFGûû´ ÔÞÆ£ ü¢åqu?©qf\ëf<p	»wÔ¦Q«ûèÝQ'ßU*S _&DÄ¶ßj5=}¨	·¸®"ðJ§á­¡ÂqþIÑp&%°ë3jü)~E<X½=}Ap!Ð!ó°IàÍ§)¤ú,Sp_ùfÙãkùðMtóEªÉ»[Gó?góU£j=METG¹&V7(®ý¹úc8T'9¾ âÃÐæõTwùÙcD¦/VÏ\~u\['Vë?¦ú:¢»?9Ô°¨)VÃ?c?@µò¸ô?â(²´Å[yÿ¯H= ¢ÀÕwÀ¦üCC¿êË ºhù?ÇeFôÓÚ5ükÏËP7dãùµà_Q&ÙÃØNînwAÓzxf¤n9Mãû#;vfÀ¦R±(2h=Mq+xj©Âp¬»A@¼E$$sF$Â0{r)	kJI¹eJIÉ]J9Z,øösl¼8ÜG5 ¦Frý	Kö,æ»Q@_Kõ³Ìîö@FyI¦ÏW@ÄêUméÙC»
ÖOòøYò~:'V,ÿ¶_FùJ©@= »-Â$ê½À êÅ tå³°&Ö¶	19¶Â<%î_{f!»¯¸uÿ«1¼ôßWéVè
Ã2=}!ucYé#Zñ<Ùp/* w= µB(ÕR= ï71PöÃ(¸Å*(f©Ú@ú·ï:>=}GÏ¹°[;?]ó_.fF9ü#ÖbÍõé&Öä~ÊÉ(òvF#ä²\*Ö o·@ÙnóSÙgX¤b¦u7FÑThTèåz-å*óö£>¶N8!7å¸7Tãk¹On¿À$"ôãìKñ#¶â0ht?gùC ;Ú_×eÚ|[òj@=}Bß3b÷mw²-ËÀX'= ZþëA¨å9=}(¥ÿÞPÃñÍÍ¿¶ï*ù*SÅ¸ÊÃº@M= 5S/£­¼{/æã0åÜ8á	Èv¡ð¬ÌT!µLL0o8.¯ÃEÄå%Ûã
D)ö]$K6ãî6Ý	òÓtÒ !50
I3¸~WÍÎÒ~ûÒNáQRp~=}=}û¶n½öaÆA/[Õ_µØ½ªß%çÊ¬·-Þq­Eî2fÙQó¯hùîÝÔvàø¾Ç×k<¼º×K#ÌâÆDØ;æ¶o1 þ6¸ß ×\=}ÙÆ
6®45ñx¬K^©]h²$9¡ðFêVèºÙápGÏ2ÈÈ
Ògw=M-×kã!IþPµÍO)/qÍ2}ú;múãýì?Ò0/?Ód¯­D ËTÑ*Ûº{óØC·gôõ»yV4,z\;êV´Ïh91ÿò¿4öo+½R&r^¼ÖénÁ6Å:Ë½Üu¶5Ñ¤e$ÙPxåÁ	â}¦¹*cÓ ×&ËóÑ	wH±úê¿·ù ®Vpj3¨i^ªâ37 c77±	¥ÖÎB¦àî¥]¯ðÅ)vÝ ~fw"S§DÑ¡§TpÕP&kQÎýRìn<Ð,µêº«(°Q]=}aNÊÝ16>¨z¾ß4'pg/ä]yôÙöMbÔÏV¹©éÇí;å!ãÕ-2¸/R «¹K= Mþg®¢pÄ¨t)s[L±ÁïÎ7¬òÛ;v/³çß=MY"èHÔU&¹P:GxÈõGAðHaÖc<%4Ýí­,)÷DÕH= ù­/«A¬úå¯B÷Åc7´½Âú©+Á£á¶<´Ü]õxò,¸Tti¼ìÄ©{+ L³÷¹r+qä¶Z·*VXû4Ã[æ6ÜvÎd"Yê(,Q8ôsót»vÜÉù	Ø¤DõîË)ÜlÁÚ5Z[÷ßçä\Ê¹G2ò£H0iÌd>Ó×múìÚsMû¨se¼N<^l¬+>MW,LÑýèÑ'=MP'¿ÈÛ¦éäe!	íË©bk\a·t«ñ7|¹¨($ mt?«újÇ0p¸êª?Sö¯Ê»r¸7Ô0=} csó2~Ò®ùÁ(è¤È[)Ñ §Âx½lò°l
P8t»Hn¢Èv9XW¬ÊédêvÉ.TËEÿXªe}*Í"Ó¢ö³z&*²B^{ê#
aHÿçLìGZCXò}_m©!]ãO­ô_uDÈ8!oÔZ3ê@@ßÊº³x(§¶¿) «m¹½¼ó¿ÝÚTØÙ[J²á>ù|¸x?ØÌ>"À_K'ÕÃèë8~î÷	"v~´Aø@L§÷!²úx¦*« (È'±t>ÊGá®Æ»¾íû<__».'_e+ÙõaEuPS{ÒùÏÝKHº:Ì¿8»"-BûùóÞê1;D©	qeÜöÝeyòÐÄÐðºî´¦AfÂêWFXÌPPø(IÆfçÂ&à¸÷Ó5®(²ÙYZÝs¼2ÌY«iºv#§«)½¯èðÍ·a)¥ÁëYÔ+µ ÓC¸ÑÕ¿;¬ÒïÉ×üPV®{%¿S0·/×CüßÙTëICÒ®UrÔÔèíªa;U7ª
ñ[J± -6A»dðyHX±X5fúÎ /'Ö9ðÂ;¢³ÖküÃ*ä3¹N¢´ÔcÃ~ZzPVè^­ÚI¼Üf¤/3-BC
æAYcftÙìi
2Msäüê,eÌ°U.	=Mß-Cª³hgµ1©ß°^÷¸Ð%ÛÐ & ¼õa±íýGàSáÏª§qVõÈÅÛÿÞ4ÀÂÛÒ+yïòÃÃvY%vÎ8Í³û4Ç*ö]¾ß½Ô2Î1·hgûº*Æ3´ù²%s¥Ü£³a]5¤íRöAn%an)ï'¾êÈîßà&.ò1!1Áç½î_ã<·.ëâÈYa8QEwâ±wâ²a8¡¢Ò7ò±1ëòwÕÞèòÛµiásaÉ´Q-È0u%R· ò4¿t2èÛ¯øcN³£¡ÞVK:°9øÚ~¨¾G0Óöÿ&ÃæsRÆ^r$²~ÇC½ ­àAUo³]]0QFw3Ñ¯6Ôö ³[n¤ O_Ð(á²bE~;6ûA*bÙ/Ê/åuj!ñlïg_Aþúë-cÑ$Ûÿ^i~Ç!3ðö:$Õ\ñ0ø*S&Y'ßk!±ÙÁ= N¯9DÇH= \Ülg)Í{í ßD% ® Ëy¶ 1ûÛ4( ª·3Ó¦Ctes ¤e*åPBo÷!/QÔG´Ïÿ´dÅæY­Qòv× ·ã=MáYÐàGøÑ.PÉÛf³ :0ï$9QõÙææú­°íéÒÞÆíÝòr¾P6ÛëuÏmcä¨= jÚ·²u¿"í154½ O½£7]&#*×?wáá,·Bäbøeá<Ù= àÔ¦ë¦ðÓçx#Lv'}NþT&·â©ç¨0ø­OÄO;7s(Ôîa%-6êÿÍ×ùB4ÊðýÞ¤Âjw~Twgu'¹V±ÕX·oÈ¾Ãt9ïG9:= #ÆÔ!Éìï°? lÍÀ%Zd$xö#b åõ=}T¸öï a}¥
´òJ=}Hø>$Î<¡ýx"~ð¤h"!<
.½ØG¹2«ÖBöRTÂA¤úJ!93±÷5Í¹MZÚ5C(mÞÖÈ ¶×í%âÂ'ñH-¼:÷,ÌÒe&ãç1æUu²HÉ=}=M*(·WC:A"S7=}dÉõGØ@K#ßö:ò# *½¹a®¥$..ö*Ô6Xj=}_=}òbTyóRªü¢°Öô;¾w'7eÍP¿-æ·J'nW¼]ÅÔ5^^)×v»(ówkµ¶@= rG­/Gêp·Ø¨4!çªwQCÒ= ÁÐ	= =Mi!v¤DTg¯*d£gÓUÚû,ßUãÚgú:rA"Z9,.\Ì[\8;{ãøù:à¡ »\¼fÆ'¬5âvÙ÷aèÈøÿúdBXHî6Õìèû¼ú©Ú&= ³®qÀkÊ/g¡üÂÏzÿb¯p¥CGs\¸ÕÆHH&'fêp1N'âãt¨~nãu{uÇ¹à'ëN¡nòç\)y\d;Á÷= y¤SúxvªÌq¯êQ¿É¥xö"ãÊ¸¸ÊÊÊ¸·W~¢¢n¢²°±ÏÝÜBôÒ?ÁCÖÖ=}JHku4@^£ù'°kÎ¬­å»ñ]à q0Áé; îºNÊg8-I£Ëã£¬Y¨Õ´jdÜÎð=}Íc¥uYAïÞ³-vÏËVlbPº<z/p+µóÃ]§1Ç?¦}÷kU×TÅÜ«ÞªUSÇ:%9ûý1Ó#Q­¶q:¨Ë§E£Zó¬u6>ïÁHÀc_ÖÁÁüØu!ÞÜawûÍ ¼ma7>?ýoNNwÙÎáÖ©ç";Ã½îé³g®ºÞEq	ðÓë;õ4ÇÇ=}Ä¨íOÁÁôyÅ+ÜÄft¹qlµ±:Ñ7{«Û%äö@&B9?= Á¶8½VHGÂQ^×§­îÊ=}zÇÑÇ Ä^AÍ í¨¸ãUWÿÙôÖ×^êéqdïí÷Ú:ªo5Â1ÜëZû\(uÉQbÄ>U ½?l0ùnôÕ°z­Qeü¾Ñ"ÂMÂ"ð5#=MÍµ¢
ï".º
n½ÅjÁPM½®MÝ38KWá­ìFêÃeáÒ½Éb¯åÙ5Ø×G
ËEB¶+¾-A¨)&UËºu ¬Î'
XñäN_ÚLÁeQÕ2¸µëñò¢Hz"OCÁÚ?±9S«ç$= òÙÕÖdÓ1ÌU.ïÁ÷pmÅ¯10Öm×Òô7¶çµ	B÷hÒ¨CÜAªÑIÝ¯07âw	|s1-èÖéÙØd:X¥j=M±z¿rûªI}A\A³õ*°àÄêj=M\[x²'úí±/Ñ©¸ºÞç±?;ÂÂ0ócÃjVd/6UxÃÆl¯M|fýÃEúlð,Tì³ßÿ´l	f.ozB5û½ªÝUBÏ0vÅ=}z¤l?wZ,ùëUnÐ<oÅ¿}NÏ´ÒªÞÛNb	+@ ¡®ÔxÊ=}»1=MÆEy/-¸%:ûç}çÝÇ ·æÉ#JBÝÈvVüÓ8ryÕP³.ÊÂZæ®ò6ÿË|% ©0üúÔ6]ÀÙ^R(4|Â7,Ûaü¯C©ÐìÿGÝ¢!ÜÒ!ö67ë¾ëçþIBêl6óÖ/
	È¢8÷uä¡÷ºq=}Ç= 8JÆÀÛGf=Mw3_zóïmxé,q¤/E²ßÇ±©=M9©ÐÛç= Úú F¶f=M×ïø]Äyç[ÜQ÷Ã# M=MÉYDIýÃEaÌ®Aõð#	Çø´¹w\ _[owº*t	Pa[Òwñ7&fÈ1>µXnd+ÇÛ&Ð=M_;Üld§µC:ø?^õ¤î<Tåî¤ü R2JH¤}âöß×¶ê(³ê*Bz¶¤©e±ðê"Óg,íCIÚé	}B^ÛS*ÚÜzjù}Ï= 9^#¤÷M<î6c¹áÅó1Z¾.5FPÏ¤Î:Û¼ÑÇÕòÑÝµ«á^ßý1-Û°Ù¥L·8ôÚ¥C*éB" = Xgß»§ÑpÍaÏ¨mZCÀ7þùSóðFaû1¬ì_w»_îqNcÞv¿BÛ=}P@¹) UW/F¶»Ä] 6B1þÇhÇ¨÷¢ñ¾Z8U#A V?÷Áµªx}øÖ{ìÎuÀÐè§!Ì¸ð'GRUlóóM;Ì_W/Ü»:t&S¿ñ­§·+¢öQüÐò3$VO5ä'Pç"Ò¿RõÁ9z* æÊe°Ð¦KÁ1?rÀÞJüâÛNwÃ¨	+ QÐ0S­:®×ý8TH¹Ùvr-|Å¢0/vôù~Íà;õ!w½§]¾4g/R©=}WÄ_*8Y¿ÈX»µÜÿÂ©Àjµßgq Nþ¹*Ú)hq<'ÞZAÛ\J¬ÊÙ^+Î[SuQäí&+Á(ÐPänÖy|>8¶ÉJ[Õ*oøÛ= ÁÊd ÷¦*gÅ~ø0|­=}©
b®4&ÌÍ§po*ß·îGûÀz¸= Hù×w¡{Á7Sf÷å),Ið,#Ò) ¿ÙjÖ9ßù= ;ÀÚîÇwÛ¨ çmÝÉtÜ°ÜÛq;ÿóò¦tÃ4\#ÔØ¥¨BE¤q.8tÀ[>]_6²ÅHÉ¯ÅÌh¹½W2áTìjàÉUfÐÍ£/= zÜ3(&×àx= ìOÉÁ!Ô¢>DVn Ç«9Ø4ðÇvc$«÷û 4[õ°Ñ´ØMô"Uò\,>°¿x¤³BªÚjø_¹"ÝÿôÃe5á2¢z.Òû(
¨Y·C¨¢vØóñ}®Êò~{udÊ¨0¼eHg¾xjÁõñ§ÚPh{´wHM5¾!ÇiqÕÖÊ4£IøÂTÐ"äl,ÙÛKÇÇò(¾z±P?]ÑÒÄ¤º?ÔYÛîà{jx"ù]	GzW«%+ïË^¡´çÆÄÇÜE¶GìZ®n©×C(óÀñ=}= yqÊ%+¶¼öwYA°½ÚVæíðîX¶Så;Äã"¨F6±Ý¥¾"L¼ pñ:?tÅ?àÍò[&ÛÆTÄµæy=M®ùü,i®ñU­1ÞSÇâIö¤PÒ§Z33!ëÇß«Ú©5¡Pû+¦@2d«E+{l¬~LEH ,oë
EÆ¤U%èwEK*{-åª§e	ÄýÉÙø£máÝÚæ¨Êô©ðéÍ¶Æ®#kS¨ë¡	ÍïÀ:v´Á,]Õq= ¤ÅµgRxÒw°oð 7AFj7¥®{W4´*ç?µÁk?Æ=}NEM¦=MtÊfÔ º¡r(¾¨=}°ô¿èI6OÛÀg¬ZtÇ¥JÝÛ.Sò|CBêÓ æéo4r8e½ÁúÎùÏ$8?Úý"ÉÚL¼6qìF×70?K×ÅÛñF­rðÜU=M¥Ï
Xö±ºÍð«Ã£"« ¨?©Ëð&Ã}ÎdÎº sÇÙ	ý¼)îr(<KùØÀ_îá#¼»øÊÓ7Í´Ã÷zqªK÷¥ã[&G:aZ°RäO*9ðÑL Âò±£1Ëês×³²èÐ²Ú.sxR0¸ïê²mêù×Ãÿ¯Æ'½µ´½÷)ÃÒjs¨'¤:ÿ	=MM~)Î-êìÌÄÃ®ü!ð%AÖÙÚßê¾$aN¸ ³ô3Å¹ÕºÃÖ}ÈòÊS§h5Ô÷$õWh84­¡¶Pïp÷Øý$|~Ït ÃN0{D²ðQ¸ÿòí©oçÕ)3Ì!ð¥4Üq2ñ·D¿óh-Ûw³_êÃþõ¯=M© Ç:éð¾3è1@>!9«§üNr§®ÙnXêNÏ(×µµf$ ±ðÛ»ÍôÓþ¿
ÃÕZî£× >¹ÞCÎ»ïX7»´¤¦4jëó¼\qôTgÊüîóC·ÀTÙæÄ¿"²{uYÚWeY¡ ¢n=Ma	¢®f/Mî0÷:ñºPm<94«ÿéÌ	1:µÝ [´Qïg^J§¡üúê1é= äÛ=}§AùLyâçØÁ=MËè'¢c±&#&vOÚÁ%yï~3Æé'Ì43sZ$¾þÎ»= u@zy\´Ð}ÚÛL(ë»ît÷D±¾à·r.ñF1ðPæ^á<½$.HÚ[³Güßí"%Z0Ò'©9ñs[1½øÙåýãY Ê¨jz_²5ÄìsµÆ¾"ðz¼ÀV)µX+jâHü;Sèé¢&4*Æ ôjúPÐËPZæ$büÛzàÏY?Æd= ñ°ùuù$[tç_CÎgâdGí)Õ1âcÉn10u­2²ÚMgâ= Ð¹ï|ÐÝYâÏÔÐdGoäÞnÑ«D}ýÍc?aä	ø±dé÷°¹âÈfäÆ´ÀòÇ82"ÇJ®»¡ 55jWÝ²üüýªjûÅ£LïÉX¶%©Éý£rer=M~»íááKôÙ_½ÊªX$¨u?ßÔì~ÞjòÀïî½üòòxÝUäqþWØN<@}*0l³ò<: ;1oÅ¯®êfóó)°TUþQºyÒVP#øhæ&á²S( §¢¾#y¤÷_ìø	Ò÷*Mey)Õ3ZºÝx{5ò#Dó´éëxÒ %0ÝÀJcÖä= ì±¾Za3?ãVä&S@°¯dG*ù¦=}a±_U×DÇòx= é$íD¬ÛrÚÏ¶¹Èbq	V6x1w¦s3VF9-×tWÍ§¶UK¶ k5Çbü×[,Ü´7øB}®CÜJØªÏ'|T2®îËÐU+ÒküÇLÛþ'= ÜfHm?@¯tV~Ákªrç8= 0ð<CvkÒ»Ö,TÆñÒúØ*ÕÔ¬DPJ¨UÀ¢l= v£_>~°öøn*IvieáÄÃ}tË£¾ÉtÆ¼~TVq\t¡È>sWV6+m[[mèL¬}¹­à)¹£{Ò@õ<ùÐu!-ô[ûX;e1ûö&}º°aJªn©îÕ¶ºÏ(aD¾Q2¦Xæ'4² ølOÜUëôk4Zzn/IT\¤BjR,'ÀqBtèdX¼äßÒHºHF[yõÔ©àû¯éÏÙá)uU.Î¹VìqQÑÞ¬U¤ð½Taþ;­Vßxð+Íùgþ@³í­gÝùögÍ'UÔKá=}Äx Ç¹ÇÓûrUfú*2Vc7¡Ú¾¢a01jÕr@lIé³K6Ú"&;m¤d!÷ûàö´´]íçÎ9¼= Íñ86ú4z°!ñýÅ\Î	ï £&\®s »	&	úCåÃ
æÇU´#\É>hPÎ4F2¶É*ôÛC.¹mQ=MKTç¯eÉ·Pz)]]+úLs-à{Ãr\KçócÒPvØ) [î¤gTUÖÁÁ0iÃZ´e<GöÒGWq_@1Gá¥ÍÅ+§y.ö
<áT;klçv5«QB¬n"Ô»GX	ÐzÂÏÔ!x.¨ÓV?Å¸mlía¶rÐõdÉ¼nYßX^É»ÖúZ$B.09(¥sæÊ·¸Qî8µZíÁþ¡4[Ç4ÐÝs´á#Qø=MÎÄW>ï¶Öj±ý·õ|(Qµ½)µdßKÄëïÁöóðs¹ÖkÑqè¡ °YFÑñ]­,õêÍö^mw½z_7h3J9ÅB ä³pò<µÜËàm>áJð%[HùAI×3Çn£ôu"3²S©Fùõ$ìÄYÔ±Ä.¿3ßCãhíÔÍðWxvþ&tÓdé{é¤ßXáå6rÑWæupäãëøV·ôá ö¼
lnÏ.d^ÞTZìkv)Jë+è*S0=  ÃÖ)çcX×ßeC®ª¯mÿØ= fÉÓñ>D	tÑi=}qaÎ*#Á¬sÅ^	4Å4Õ¹ªL= AÁjZ= Î©DÚLe^®úU^Ð{%F²Wª^m 8ÒðÉ5~ÅR&#ä)^]ÒòbÖx/Å)M6Å3TtTÜpëÂùô±0oU¢ fÆJìªP.~N3~ôôRpÐÏ²q ²fÇR×TC;1ÖæË¿ á
×£W½vîc£â~¶ØfpfhrkÆ´h¿+üf×®f«Éye
G}Ë 3Å¼7lÞØxÐpH0Ë|^°FHA<vå¿.Ù¼Ç½AíBC7ß@poQñ8Ûý´|ô?&"9¿ åiÓ>vuîbW{qÿÛÌa=}[Ç+bî(28q·Ý>BIu±4}*¡Ö= á¤B¡g ôËkY84!ö¯û,:*PÄHù?sÔZSU Ì¤~úÛÙöÁmÍæ)zTÒÇ'5õ.$$~IqëP=}E¹ÕñZöt·pFZórìÓ3æj9ñ¢f¹¯¨@Ay¿pé¸PöïµÖKj{düF	ðNÀ®2æ@=M/-b¡AG%g9>CEù£ÅÅ9WãÊ<6þæ&OLjÑÁÂØÅdÓ¡²óàÂM¼qMÁ¹§ N²Í<¥¶ÇÝ-k?|ÏE¸óy'qéôVð0NÙ¿é©Ò !È4I²å@(c´£_|wìúJOªHÇPÂ_lÍÀ4£CN¢#Î«9êxhùrH¸Û£l9«5¶È÷X>
W=MlËdf4yDzßË½ßdÑçQ
ÿ±íÃ[Sj[äêÝ÷³v~þ:7E53¦B5èé!Û~	ú½@ ¬BPÒ&ùeÙS
aZ»×£Ï	:Â(ü¬ ×ÞsqkÃ0ú¬H_~*<Zóz0Cæ!êß.6tªPßIb4í¤.¤º<FKµc/:Ó¬BHS/»ÃÅ
aÂÒ ¹7î:ÞÈèaÇx ¬ Òæa÷xÖ¬dødVIì·º¡¦ÂÐ{Iì´?ø¾ëQÌÃ\Qî©¦ÃÝ9QØ!ÚùI¶ 8¯atÐÛd=Mã½¤Ëªï=MüÔzPÖ[¿°YÒ#d°pÈ^Ð±V÷¬Õa¯ªw È}&)%­³Tæ) HËld>ÀÌË¼6VvR´^6NmßµÆ²N®WUa3¥ëLùÛ¼?JÎ)r/]ºÕn5Káqª|üaÝF6%µ|àìþ¼~Ë±Ëû³WI=}ro0
ä^J¬}|¼óü®¡©
dID=M¦P
äOÀ#KýùÏNÏSÍTHøÒz9Áç~-ñDQÉâÉº0HÙ Kä.¸Ú7iÎ6´êJ(oèölt(ö3ÐFNóùLôÃaÁë  ¦Å ºðgmÂ³à= Q	³Î(×«8JJCØ_h®´|¨Ï¸fÈ-/¬¢Å­Çl¼ßÐÁì° ò®ÿe@Óûø'OîË ]~"èFÖH¾kýx§ChT* %«im:óNúFþ¾ù<C {O|àñkÉ^ïî[ÂÔäÒ6\BZÉ-7d¹bm­2béæåì¾ÿ"¯þÆíü+?FÚNï©*O:Ît	)ä«(RßNÇ¤Ã!^HHý«ñ|¨£sÉU£ûàwyw»>FJåý(ïî[0Qs(6R¯L«úlÁªëÑÃã$ÇÔÒÃ¤àÆÔ_Y_Í¨³
-Ãó]Àßð ±é/;CpÙõFFÏ>ä4]Q-P¥¥»°ÞæzÞ4¸3vIcE®ÞëµjÁ.ðXùRIW]~éÅöö,|þø5ß¸"è¤<À´¼µPGcâæ=Mä30.þ!Kj^/ðIèÂkV=MiÆý°êøý¢õk8¤>Ü¾bÏ¬P$E]Á[g³³é¶ëôôëòªI[GâZCK|4ZJJü0²Mï7a«'¼ÜÏEÛ=M9|®èÓ0FéÓÒ¢êüy:£ñªìjÈÛÿ9®I'=MÝØ&as¹-ï+ìqÕØEuC¬H©_º;lV0Wyê¡)
5lÒf£çT ØpjFÅ'^2AÛde2y;æ¢
$ø©Òd×uÈIýÁ½¢v}Oî<$,ÇVF¾µÅØvòèD®olòÙçá}DNÞõnKÀõ¡RÐ8¾ÅSY¯õ\Aù9¸.|®sªù³Tâ¦¯Nk¡¥ÛöêTúÚCQß÷ªxÐ>ßDqÑFß{6x5$» ¥UÅûnf(/>çRÃ2ùß*2]b®§Ó)¶RÅ.õ~Ðy®òLS[ÁFiÖïkj®°#p,|?g*ëÃCÊÔí»ZãfÜ×ºr ­ÁØÇ7Ã@ÌëäÕÀ-~òZ6M~Ee74ª=MZwOìîA3Ó ÚÄücÁI:Èû$H*ì(»1ö?1ÃñMfÞ°ÈqvU Û½æ+pôgòÉVTÚ"°Ï=}«<ª¡Àº¢Aï±NþTèq¤-[/Õ1"	aÕ=}= 0,S®¶u¥Óö0ÿÛf%¥3îà*^\Wj{[=}G®ØÑ´¤3ê9h»¸?@í^¹Ê±· ÎUO£Ê)ð= r<xgwû4ØMY¾Zó¨O/0B÷ã48gfe¬¤ÂàÓ¨SN/ºwóQGí:ýãÁöÄÆá´-Ö4ï|8k¾íYÑÀX"t®røU"¿ê²pdRúJ½!YoSàgxÀÁQøi´è$Ïgôkc´É
÷ÂõÇüoµ eaDwúº g%åUeF¼Úóú
¿®Q8Âõ¿#ÇDi¾â?ÎsºàvlÀ~%§ìaX½¸7¬æAÚs»ÓSù= 3ÇzwèGåAgØ5|Òº®<;²a¯#Ú»ÕícUMtË
%Ë×+´æík!,®^ËÚà$Ã=MÒÚþ;ø×ÃR#Ù ¡!}Ç=}ÈLYÆ¸ÊOï#>åÓBÜjw= 3¹B£:Ä¢ï¼é5£×Æ49ÇºÃi.æ¢r0S]YlÜÌ>®´ Ù$¯ªq~±?gÚaa¡K÷ñn{ÂþaôuU_y0*xLôîð'yYÜ=}=}YAjrÜ£H©ÇgNA ¢He=MÆûÌü¤ ë§áÙ¤zñÁx¼º/^Ûyñµ¿Op.ò§ò-°}]¦¶^åCÔVÑfÐdní-JJ-¡Ih!,û8ßÂ(zzÖ9à@ìç?¥§B
MðMQy=}¦>ÌB\Áê'Ø43sJ(»Z¤ÂêýhÞÙ¤û.v¯,wûiý*NbëB(4ï0U£AÝA5çá5%¿«æ8±úo¼¹*û'ô©èé,IËêí2KEÐåa®'\;Ð7\l®Zï½~áQÓQÒÜ½Û%ÐS'qªgN÷úÓvæ©"õcOj;¿Ò¸»%¡Mlð÷ÈÚKAÛzÀóìÅ?"R0ºpú{kW²"ÕPI0«= ¯·sH2¾F_Z²YáÝ!{¡qRûÂ4ÊOÿÓ{ëtyK'©ÑÒ]{0ùÍ[	À4ÌmlZ*+@!ÿT7	¦ÿ¸;/#óÂÃÈòuÉâvuyHÔ¡¢ºÌ[Å\sRÿóÞiV
+ß) º±ÓÛ)Ê:ºÜKØ±¹Gµv¥àmÊö
äWòBÊ¿÷ÞþkÌ#¤Y¢ëéWªe'ïKèI³BÂ8óvËMSqVzuÿ*½"Çí·È%ñò®¼ÖÓêsx£RR½v7C³¦í£½.a÷½ânÉÕ½îüoíÿ´[O@à0ï÷øz\á¯é»öÈ$ðêY:õL= °N²Éf!vùàÚQ»l&ä»{æ¸u×ÉsBÎ[â¬®*¡ÝDõå±¡[ÉÊªºÓUçiÅpµÕ3uèù"ÜÈÀv^ôm!âß4ÁÏÉ)jô@HÛi&¥)V´9Næ¤ócJ¥[¤Ì#Yw[¦aÆ8ì&SönyÖM (vô=MàSµ5ªû;XÞP?zÝ©]ÅS?©²³µ,ÖÂê~û( LPQIo&ë ìÐ¸"­{oÇü~½CüGðâ(£ª9ABnªÕQ= ]ÛvÖy¾Ë6¾Àc¾=}0;*VÑå(ªTõoHCnzÁp¬¶õQY Düü¡%»IC	NsÀVâg»<Óõû66no= {ÒàEtaæ¿®¾G¶èm X»rç¥²q3^³ª%áÃµêH_´«Yvovóþ$5°¥ÛÀ^&&ëo	&l= öf¼ÓÝU?°Ê27Æu:ó=}½ÖÑ7"Ù"¦5@ 
!jéRR´<¦FV×K½Ñ§B º7òQV__gXN0Ô'*xVvôbêHN¨\û ÓabIôÄ0CwÌL^»u=Mnj)Þ;þ ÃWh7È 6C%ß½Ì*7&êÕ¢º
«j×IxÁÇô5ÅgKL<ûñX_gK°R2.¿;ÛjfÍ=M|a*ü)GÈKú]B¾±±K½uvM{}3 )RôH )R¾%ª/@¸=M³a×zéAg²ðóáÎ±u¤»@ýZ=}HÖlBþöU­3Æ±+*êíû%8nñO{î¼{÷&DHmZ,¯= XZýæ1klÆDÒ2]ütÁÎv-õ+á,ÖowÑfêX±2Ø±)l«ZCh6T÷LÓÔgÎú©T)¤=  e¨Ubï©KÅè
ñ?ª,G/b½,
gÚç^U@HÅÚÔp®Þt	å%jËÍÝÏÚP ;ú¿õ|Ugó{sô~Ü{}oª\ktTÚFM(þù#³^änK¢¤üõ£³xcòëkHáºzË²H×ñ½4 â*¢8qÁåeÖ©qØæ@yÀçëúÞê;3n¯h{·»ÛâÈ82w;9g.wl|û±üPÖtë&z1	jüPÌ@ØkÚ
8þòq÷
År»÷Ø~;Q¹e	X.CWzÁIÜ$Z¬[×,¾òèª®ý âb´6úÊ±~¥dÜF|WcPB DPµsËÿj¥­xÈ:wÿÝ»úck<J7B ,TÂd¼Ê~Ff8{Ð»=}gPf|3j1ddIy
djíäïúÈ(LQ4k~ëpäwlÄfâãÆa= ;³1&;£8Z¬×8jÔÏH×DÇ= tF;µtgjå©jlC¬R$	B|L@Ò¤%Ð\Üé÷	6¸RÞnÕËvyºôM/7'Ùbz2r_
 ¬cb_w0Ðò z»ý­@s(Ú²t}XëT-äÅÓh+LRé7ÈOOk·ÌyuÆ w¦Ú]	klhìÈ´¬®ûüéËØØÿPûEdF<â-Ã6 Ú  i´½6GÑºpªC>~Bþ?é¹âXk<ßzWôfpJõæA;ØS)+cÃs}úöZûËì£«îôt0+þ ?KÒÔ§Ïcf<TtÓ¡Sßb[Äk ¶ª,RùsªhßDCªe°H= hEëHðô«?{øtcu
'¸@,ñítôlSj?hë
Ë.ò;âØþ]ÔÚ¼L¬n·}®­öl(þ²7ø9¬¡òÊmyãþÂ²kzúÛ_'j	ùNº^nïêÊJÒ/f^D¾²AP¤]¹y8}hµO
NVUöµË÷KçIsFs$³È^èr\ö8pW		2zÉoâÛôD¼ÅÄM>6Ã;§ë= ròØùqàÂ	)¼×ÔänyhPóyÌ3ÙÞejo¢sXJØª«>©¸¶:ÙÓM]ãµãr"Þõ%%*êVë-DhY¤C7Hjãòd= .¤¢¬V ÉaàK6ÉmÌþR6iôÒ,/,4
è(Ìxø7xàqÀÕèÉZU3üäZÏ#´Ê7o´3×mÃ Á@8Þ\!Aùÿ»ÌÒò!Å
H+Ò¸kC´ö_¶ÐPê©PéW¨] 	G¾òÍtWR&nîÔgæ«vA <~FIL÷[<*QFS;za¾ïËºÁóÞÀû¡V $"ä*3B)ÐV@%4IÚû:_9ÞÚèú
MK8Êdê	péPZÿ~d¤1ró<°íø^Æ,^÷/dd}¤{ýj²dwRyñ3Ë1 ÊPA°ªÆvû e-ôËiöË"Uíé0´Ûô±/w¹eÄè¸&, !¾h¢ýKy5M¥µô;íkâ½$}ðÛàÎö<BÇjb¾W7F/Ñ{Û~¢s©ì%säËæÅ)V.F't£;ß¹à= HÉíü´Eû^à.L.+xà$Yô¨]Í¤Ò;~¾¼ÑÑ9unª'{ó(¬åfá
¿)uÝLþÇ¿iÎ$ R±½éÈçº¤2hu[Ã¢Øt@Â¾|6ÒHôÚø´}ÏNû Ä¯¸=MÏ.t*s³/«À2HÕh°tYV+  Á<0¼dÕßmâ&[°?ÈÆ&Ou$*1ÜØdÂ¸©XÂÖ@B°NÌ@ ¡@Q	22ø>é	 !²!]6|=Mc§ÔðÿÕy¢^ù= ×çuw±êîn#FÌÆ¡EMy.YÀ3¨w¼ÖíÝ(¥÷;¾7HauÏ P/ÂÐ÷{;ðe= lG'1=}:Zt4"æ\µn+ýÈ¨~w·~SÙf8ª&ì)4Zr÷>)@»÷5q~q*¬:ÅTÆ×»,JóªüÂð)«ëkIÍf%-8t¸RMùàËù=}ÁüÎ/£§ÞCI?¤àWvrÿ­= JÂ¸ý@nýEâ$($þãjËTOfrs(üÒ¯6êà7K¶3wðÄÈÄdEz=MüsFMù{Î0ûgé¢2.B±tKüt VhlÉøci·B±$YºO[LrmÉFFßaÛ¼q8:ò ²w¶nsHéq¦D.EiD%÷x	üÆì~' TùcÆ¾LGýæt±tvÛzõÆ(ÏÀ_N&ù>ípÿ=Mfu%ÙÉwIgjÚ¤*@i#,³Ð9¿ZÜr¸(X*°:0¤z@L3boý'#ã¾ÖY+/#jÛUj¢s8ä,äÈgùìi_®.ðk|º6ãðàJÏ»»{/SiùÔ~¤dFè8NôbW÷@¢>rç°¼7; ÈÔOûº¡>'#ê|û$ìÈßÏl	µ9ó%ÑÚ{Ú²r,w}úTì¸®Ê~È@¢Bv.ä÷"¼Ö±¼SZ.p«ÁêL2D%ÜÃs8A¥ÒçÆÚ|aìYÒèÇb8òÛ¡rxA-qÄaåÝ?H6wt1äºï¤5Í9}Ì6¯b¸Xluß5(oVFØ>Ô^ð%ÝnJ<¼·!Ñ2J*= ÊÄÖñlnKfm x= )úuÕõ(^Çê®8_âRôÂ0nþ
%KA-»æ(ÿHµ\'­	HzPKE[Zná VÍ ýþÎPº=}3ëûðÿµnr°;àdªÿ
G=}Îÿ;Ãoa"+;R@B}r¥«úÊw¢
ö¡GiÈ8A®aôSìBèÆRkËë'O©$^*"Æ¬ûÄSkC ¾ØÔ´T§E¥ÒïKzzP
+4(0£ K;úµ¡Ð[Ï{¿»|öt+üÊxIE¥K°ê´9/Übå@xüá¨eÃHì(VøI\û:®necðxO¸®zÖ õ¼K¹nîÅ=MÆ¶]È×®ÏÀ2æ-FzOÑAòA{ysRcÒÙAH¾t:=  5Ý1+ûË¢N
wöãIÎ÷ÅuFÌ<[7¶zÿ´ºtû_Ñ(N¹e·BÒ=}E)"âûE]I|%§ÛZEvÔô*T"qtýôdÅ= 8êÉ@XsDEÅÈ;AýkÞ!<}äaE!W×úÒÔOYÔ8èMèÝÄqt=Mw³U>8CØB+Ç¥Ã\bÃ	px [Ñ»cÍ4öPÙ8Gð!<$·Y,kMúªyá²v¨lj	}ÞôgñÆgÐ/²Õpîá\½#(|ÌÎ5øVÐô¤¬¼TçØ$u¨þ»?ë+;*½(½²ËÄ
kxù¬uyZ 0×Iô¨Ë!ûÕÄ¹ekDÃA8¤9+ûâ%ùöwÉ{ÂìEî>ÐcB,tÀ}Ôe6ÊÍ%l0+Pð°Zl)¤X(ERMgNÇÞçþK|]Zÿ= =Mü¦uââ¿þ=} Ã°<¤ É.ÃÕC¨©öhJ%N¾*PÀ¼Ü3îhxÖè¦øõÔYX.â5\±Í½tÇíÒxg²NÀwf}i=M]4âÂ¯¬î)FwG©xM]ÔbE8>æÌdü:Ð( F$*·ÎHme%gÞøì|	CÃ3#Û¢å>óËHùf£wÉ½¸¹FM×/G\Ù©[<!-N-Ú|Üw
LGk^æÐÂX	o=}ìÄQdý|Z¢-ª9¼;¾²Ò=MôNÈÄ[HÄïpvB¾Gë Lr°æ\ 2;Ãßs+/âtd®NÅÔØRûº©N'/ÔDÜÂ#$<iòO[UÁYå1Îª~s5°8¶O{= ²ÿÉûCxzâÖÛÃñã·Z§Ä*ßføVs¹X:ØrªfóÞúyÁSìGï/Bk©Çâ³Ö"(ICªõtÆv´Ä=MV"À$VtùôQë¹=Ms(Ñ0ûK×æz»GâÖ¨íGÈ$Yò;Yú©-«vukøE=M]êPrv3áYq[±ªðLÈùëÊ¹
¾vre¸çâÒSsT$2PSO%Qá¶7eáI0ÓÂ\ÜáAÝb¦bÒòÇE0ü~%f=MÏÀ$êÎÓd1MéÐÛáAÂã·l8¢×ñ³mbJÚ$!G<áwoì9,»KjÊêù6¡!Wê.Øå¹¿o§¤êM2úÝo ÅÛáÃ6xnýö½ÈÉâ±=Mu]h[ò°èE)fgrüj¼iÏêÙ8BW°r)´ãÜè?Um«zKßYZLîè<IBTâ±ò:uòEçlæÌ3Ø¨F	CCFgæj¹fEâ9øqgwÑ0&¸)(Z¬k_Ö(Ä6u6^H=}8"ðÃyÙjd´òºI!±¢= nñeö¦ÄÎ01u	ÄíD=}ÈS}Âa	ü:"É\«\ jbÔ:¢~JÛg~GäHM*q*ZéxÝê:QÐ«,Êsø¥tÜ;/|«Ú¦ÑËlHÕ ùqëÌ¦A+<åë-í %ÿeTcwÃÄÚºTÏ<Ú}LuÿÙN¾íÚ²Äs[ÉÍ;7WB#w{á2I»v¹Íû ¤­ÝÑ£ÄéýG¥¯±öñ©aomõYmÏ)Î__¹¯¦¢Å=M-¯ÔñX|ÊtKä<Ç*%½YÜÙdHüFÊi@	þ'= =Mq0å±åò±n?XN÷þì:£Ì8^5ëÐºQ=Mèº·qôÝé[9_%òweF	'\ÿ¼_b)ÀpÏiÅ³* ØÀ>«]²[¼öTCÅ¿»	Q ®Q;¾ÁÿkécÖÂÜéîI|OC/Ò;"ì¦ Ï8ºèþÌ/âqÆ«7ÈÈpIéÒJÿýp&ñæ1²R4áVY5U	¯|e= ÏGÐ7Ân¨²w>3~pâkd=M¹ïè¨PñätÙ 1"x sèÕ)¥6;Úï>âHD@êüº%s$§,ß#r0æ)Wà5aä·âMðÙ¤.#ZÞzøî!Ò;TÁT-Pø\ðªÄgºVGQÂ§0íowvlwR=M7ãÕ?Çk¯¸"Î;\Mçô8{yRÿ¶kéê= jFaì}ðK§³h\ô¶©D!Q'VrcãE; Cîç4[½ÜTôÝ¾q¨ZÍlßí £¢Æ´ÂÕ_ gÅ® *¢EÍ92õøå
_êòøò»²çIú2Û×*v«MÇ£¡»óE/.³: ÇBÌ?ügÝn^]üdÍ¤ËD·MljA(eáÖaÙAk×°Òxø¢Ê¦û$j:Ø*/Í<®W= §¯Øh-c³bcèã¾;Gâ¨ ¢Ï÷.iµ×HÚød§Ú­.ÇýR$_=M­jÕ*\>¯Mí¦óFp#?PKöã_ª <è>­ïá±HÁÛ(ÝA ÆÚé/Ñx\§ó¡Zâ-³ZYoR[&cI/Ã<=MÜeô/_TUËV cÕ­­Èãx£;>Y)æiYVæ¢£Éôâ0Þ*æÜÑinsÛ!!Í£WEn'_ÐáV.,Moð 6ìA*EÚ"[ÚçïnårcËá#z9×*z8Òõ]2ò!ÇÞ5Ò
ü¬výqp¨ËßÐ3ã2#¶ô¿>òG,G(
ïÑêdãkªÝèø= N~Ø v³YßXùà%ûvñ}V³IßX µ­(ù\Þ§»Àp0f%~= ²0¾K»×Äóþ?«ÏÇô#ýÈø6ñ)ÖÛìÌ^öqX?JAJåÙèIÝdÇûÎé½ë¡íÜª¹P4ÊÈ%Ö3ìÿäCB6ß»AðÒtêmV¬I¤4nSOW!4-}QQ±dûßèbe?|$h>ÕQØ"½ómÕU±jpA"õÖC´½GWSöR=MVüë(s¥U:¦ý§noiËÙ>¡X§¸´ßÃF#Á= aª=M/ïIsÓ6#0ÃnyìõO[ÈL8úÇåàVÖH/x#²cçÈuÙ°¥sÃñT«À¿IüL"s*ófÙ¨ö*v¤*ÈyO Õ=}7Í0UM/+¹Ð(ÑZÒ/)wç]ÿ¿fÝÀN/Ü´U?Oïº|=}¥0CD@á§B= ³£ÉÛÕç¡qn¨:;¯è7¹;&rKg¥JV~W= cÒÀQÛÍÔhíÊÄúCEâ?ÕstòÊ_ zEfïS\]Oñ=}ÒxrõD=}ÿÑ¦DæMwr­²f Ù¾ðU«<ñZLy!@ÿ¨Ø2ôX¡Ç³û>ÍÅ\&úG¨ËÀ;Bmi ïgPð±Ô:~¥Ø¾¼ºü21¯ÎAÍ÷*<jèÌ°ÖÓEé|"§<¡ßP.ÖP
5;ÞT]¶Ó$øæqç#i±Xq7 ÑÿBéç¢b¼Æ½³j¾ÃïZ²qdå±×¢ê¢¨·Àw9íÖ'Nó'\â×ÚhæÇÒùè¶åÒh:©<1(	=}§÷<OêbÓ3KÀ6<OC4K©Ïì¢K·j0·vÀ®pú!X[6¨O&ÍØ³JnTSØõ9-b­©²¹óC7r= yå750?ÄÔ¸KZ³bÁJ@èáÅõZ+0FÑuÕ°@Ñ¦äp¡fÊÓìªÝwdT	o'Ö¢~òAoKR	e3v>ÚÔÿY©SÀ}îêÝT£
ø*nÅíR= ¤Û½×ÊN3wÚbÃÞfÚLøvZ©ò3*ªÚ"*&Û_.µ}óEîw cË)5¬&£ J³pçÚÉñGµ«ªösÏÁzåkãé¶Ù(Ö²öAdýs|?&YZ%\¸ø½¹@Aòêòü½C»Ó¡+EoS¼±ñ*²è¼(5(í âíâîSúNz® ó½þ  <ãèÓülq¬ß}àh½Á= }¶øé'^|.¿§(5ÙÃií&Ç¥ ÖÔÄÌâÅõÙ¼©'G·e*ú×ÓrrM=M3@bætûw°Éé÷ Þ}1JbjbT»Sí(ú'ÙPCYÁqG"ÖEõ'Õ/cVáNçh³h+Õö6ÜÔX©¡Í]\ºC(¦¾­K¿éÎJ:K6~IL®°t.ÉO6×S3üÉíÁsCâjÃXã9ÆÐè,R@ÁµVïòNÃ+Úr½F©Ãø§7@ºè%ôOS(e°øùNuhiCÃ$ÇHÑÓ=MÜ+íÀ¾-ÄÌPàA4Ì³¼x£Å»=Mk\ßËÞÛ®ÝUñèlÁ\CR±Tf}m·¬SQXDïÃ £þHVk
 B[ñáUÙçó(5u}Y×+æõ1Ã×sÂí&³4Z®\ù+°qf¬ñx¿Õ·ÒyEçxÔUí¦Õ´yÕp94­ O(41ÚkÎ1>$Ó	¦¹(ç(vÍ8*J6öMhIÎZyµ6çC'ÙèyËæÕãÓVÉiÙ\2"üB[ÑnPÝªªçYFÙ¶ó%ÁÏJT&I*ilÞÇ&ðtá]geAg
l¢¨U=M×È%'ÒCì7ðÅ°öWõ°ÁËTlèÔé%jÖejxß-xÉÜPxFHíS ÑØÛÿØ±×ð¬ew8\ëVìRì8­ÑÉKCû%¥ÙØ¯®·¼ym¿f¯?ÃY	óQïÙIè¬_kò>{yRèjÑäoäÔh¹¼ÿ¼$I+¤Â^c-ú»ØNú´ÙíæÙ®?¬xó©øTÇÇßt@ý;x êÂfÛ+o»4ê°(ëR[Mp65A×4è{ðO9~í³Ïaz) 9za
?ª88=}ÐùÞG«= â8ÄÙF 9^¬rdº%ÿÎ¿Äs*úá´ \/«%.ïTDr3·{)7peÇ²Ë×3ûN%NÇ<¥ô+}rtT¤²lôN_~îÉ%\¿F­?ì)´Íãfüåöpry5î×}®%§åzó+ñ÷·îîiéÀ?o:úÑ2Íl£âGv_ãaïÐð ý½z~,]×ÊóA²1t¡ÜQ.µähptÅq÷ ±3ïfdM¶@çþu_Ä;p¹QLÓfá7©Ð«ÀÂYë¸u­F¶òà9Å]Ò{pãUgÓ§R§= ÕHµú×ãØsÀÙç2ºÈv~©©[B#¢S$~¶3ç^>y ÷îm7i3à©)#Y¤8Úh9Z[\bÍ÷¼$N35ùR%/RÑ Ò*ÎþußÞï:ÖNÃ·j^ºÖö Åó^3Ó,%rvÕ¶ë@ßó'´w*ãU1­·÷7= ØyÑbßZáóÈfjgÁ¤èG°6÷±§ê·Èã¶¯²Ù,
¬ÌÊ.ñ~µs¨Ä)ãm­¤~äKhÔÐ=}¨5æ¡ò9x)rÔº7W90ãwé²Ýå[[gr)ò®Yçýâà3IX0ã/¯µ:ðçÈQø¹àn)ïÉ!Ã¦ÊQà-Ý¥æO¾éKHïÁ(uÕHËçbð:vÁÿ#×ù-ù@ª/;õcW·_aCÀò
¨ñÓÁ d®àD}Jñõwèò^q6hÙèÂöþi­ÌH©6Ýs&¼'°EÄ©kò#¬UÒ:´Gfø5ÜVèkç[fu5"ÞF^&Ò¡ÊpÇav»¯kI#ãàünÃnHañ3È÷­P;:âÓeÂ'3:Áx	YDyðt°AÔ.l{s/&l[îÚXúÌÞd¨nÒÅEV-¨=Mî´üÏHùC&V[ÅÁüøÕi¿!èþÑ63éºNpÀïÎfÈZ´HZ®Q(é®n^jýdDÞ2ÁxyBºÿ/®À­5	ò'£õ.?¶\eW¤ MVä(#.,&5½~a¹Ù= æ¼ÂtÓ½öH@þ´æ´ab)o9f§\Èµ¶Eãgü¾ÿ·ÝÇÍÂóªl«|ÉÅ*ïÇ½ÇRJ{öï¦yòN³©VÙóoîc¦¶FMm¼¦Å>&ùLËùeßúeHÀPCñe×uW£ ×ò´læÒÂßìHþó'©WÎ«ÁÖó0;maè= {Â,|ð7íÙôT½6Ùßï¿¼¸"¿×¾on²âÍ¯<JêP7:Èø®Kq¼Ã9C"B,¤¨ã(~Æ¼e®
ÌFÞ®òA:»¿z¼vVUcePHù#ákîê°µ/Pð>Óîí.Îf%}"óþÄcfÛ£¸Ù18#ÿyîsÉ8Ujgð·bÃpå3n±èøòO	ñ(Ì¦ªÐ?ÏÆÈã×ñ{´±ÈM!YNØÏÇR:ä¯Ù¢È?p×íÅ¹âoüµËíÉÑ½uswÅV5þ¿õÉq<óHl¹°àºík³)ì¨°(Ó~ÍZ;oÂú±E÷¡ È¡P¯ÕH+@nºÓÒé°3.©lBÆkìHý@1(ü§ 1ÄQ¼ÍXfØMø4+NGÁû_sö­³
À¡$Aª^ÅT.¿ëÆºÚ­ÀHÜ8s²ù6f#Â2í)õÀy8ÜJÞ°Ñ²²ù_/_ÏÀÉRÈ%=MÀÉ½þô¢$?E[ÙqØª7¦F>Áh¢kÀ'T¤¼Ñp	º£"ñv£)Í#ýp?¢.£ãº9ðÚòCR'eÝéG×	+ÆÎ ±$*ZcÀg¿¥Ûab~%	²¡þ'®dõª@q?
p¡oqÇWY«>²¯áÅ+úxUÁàº¾ü´ö	®&Ø+÷¿Ã§4pIQ§KgµÑ-þkfó.:[ÃeF%]=MY³)>
°ß+YN´*niÐñöeõaºbõÿ&/Ýv8Cbü©=M¶ZÀìÛOiÞÔVOc¦=M¶þN¹D~T!fµegó½
OyE8}á+0¦ÿy¿4y.*<X%§d¦+ð7©U^RÐ= pØò»ÔsUù^ÔÃÝíÉè;Ì%àu£ eHåhûêº¥óÿ=Meà°$%R[ÙSþr_®1ä6~J?KÓlx!¦ñ¬¬Ó]&ÊCÖòµ«ÑbØ¸Þó¡ÓîÙÏ¢Ô.ÆãùDùÞ]~$3=M
¢Ù&2ãÃB¿èãþô·µ¹æxîÚ\>VUØ^£Åý<¹ÌX$Ç:ÒJ$èËÿ b2ÇÁÓA°÷Ò"ÒîCÑ©B±ÜéuI{}|FôÝYÎ£AqJbb¼4Ñ	zº)è fªÃÈ÷®ÏnsÄ¡tSdL/t¿Éjoìuû±üÈ:æ= Æfk¶»jÞÙÄb®g¾Ä mË³A7Ö¥Á£É¶9:çHÔ8ØpµP*ÖYÁcÐcy]LL5ð[p¶Ú%<Y¬Øî^´Ò£äî¿ ­Imò'm!rZ ²ý0Èyð7ÏuûKülu,KÙßÏc]&¢ê°øRmà)%d¦Ü±{ßåwsñ»ØAÑå¹· ¯kBÈµ¨ÁÒotr^F·´eª#´ ÅRW9¥u1¨+ZC]ËêÄ::-äL¿ÌüåPcÑÀûGSÉBiÔ	n÷Eÿµ/Ö÷[=M{õ¡ü"·V^¿
Ægù0R¯roÓH¤Ûw}«'ìL×JdZ@¸ïº³ÒFÆÿÓ!ÇgÜÒÖ¹ëaËÂ¡QëôèíØÍWÒ=}½ÓÅ	öÑrØ¶TÄ¹OZÉÆ]aÚ°OÂb	ny ³ÚQgÙì]ô= ~*N4õ¨LÈ(ò²°t,ìê	¬8£{§4ÆQ/&ü·á¢=}·c)>{gVØ* Í ÚM	mîrÈ7#sWÆm­?T-ùucDb

¸³ß÷cJkÝÃ2dª}ÉÒDeÜÝ) ~À¤¨;Ü=}>{ª¢y½4Þã85ýÿymeï6#,\¤>NÇÈL/=}OîÇÃ¿(ð×#¼$Aph;à:q:²¼!Uí^AútqåE÷Bd@/eðjy,võúóÕJx<»Ì(´'i(ÁüÃoÈÕ&õÄ=Mú||ïuÑn4$ë BEcá¹½0è6÷õ¥áM³¶Ê= x\´êT q¤íÔ:rF®WùúwêDmMûæÐFÉ[ÇÀ¸Ï¼ÝÎ3ôóéÜzé¾t½(«±lU0A¦WÈËÖ95õs¼eò©Þ<.ýFó­¨Ü·m§}w s3ÒH"¯Ä×¦UË-rÚfè÷êrQ­Aò¡gQg+:0ÆfõD½j¾¿ óR'ng' §D£ú]»°íÔ@É»
_Ak
óÕºAÑÒu²ï¯¶GçÜÉJàcØ~ÉÊGÐ*ØXÕü§PË¬mG·¨Áâa©X6w8²mÆT#¥qx17½ÁÜDR-srÀEæ QçûÌB#hcÑÊ6ºâì_ÿ)|º:|þ3NlÚ*¤?¥RcìBë \¢Jt¡ñ+= àt&ú;LwFßuÆÂ!F<Ö4X³ÌéøØl-Fó$Ôc>ª£¦»j½¯QöøÊSÑ>]hk%X¢ÞqõÏLt¹éáuVQ Î~rNÜGùA_Üûê ÊËréÝ&w©Ùl-">0Ä}{ê»%r5£¹ª~=  A¨Ò=}XoC·Ï@Õñ~Rxü_
 Wª¼ÿ@¤Yêî>~ºÜ(IKRtúEÇ/ïÐZÃDÑ·ÓUCP²ßä7¸-ª ÇÔÓãÏ¬1­nY¨ïð[©NV³yûª27µdúªaýÃr?ï%2Q[©
ñÛÉ´0DszA9í|7÷ïá é}þ¾ò8O<uOZ¨YúºT×Ý»>B9Ì/Å\P¿×P¤:t<Áºíü5@	t,£p·]lðÈo$D§íøºLFúg!EgeØlWaDQcf"
iÐ·~xúT}ýwVKÚiõ ®H!Á6vüV4I;m-pæM°ÖèdkO¹#ÝDÃ0ü­ð{5õÒ§F]iN°6]=}îUË(pÀ2]ûÛë}szzËÇísW&qÔ<8AúòeæËU«b_-<îf´;$ñ=  ¡yå°ÕhrZGhQûñ;{k06ðÛ¥©½G1Ã2SÊçm-þIý¤YêÞp9ÖÞÆM®ÉÃk{ôUp]WûFZî~üä2Éy¸ÄZYfEÏþ-*qESËxÀD'5=M6µ~¯wLêB!f½Fï²þëÿ~âX oF}ÈfY¢ÉVe9át6B
gQá_M+µYo&çãÉr>dK3sO¹= É÷Kùîæ8mÛÉåº»ÅÝàê#·2G5ôé{[T´ÄC©órOÉã<[¤íO¡Ùö¨O£æÏâCYÈ|#Ûþwr¸£Gcqë0= @züïº27û)±Ã¢G&èµÏcÌ«±<å2sßN®2¡MdÁV	Ç,Äÿvìì	ÐkñË¡íëëµg(zP±(Áì'o·o±º[q¯"	ÉÆ#W°r£ßXcZìbýº"Ip§Ý¼»ï¢0E>m=}ÁçIõ½aâvn¨%®èeðü_T	[ô[ø£Bw aQ&unôRùÖy´â/È,²ÀÐ:?= ¬¡Ò[Ýa¿­¹p7Ðí dõ7Ã@KkI¯LÒ\ÝNýÎml÷0¾^O¼BÜ÷l%= ÍSGé¿HoÝª¼$R¸âÆçAi­Bê=}	IÝý!:m½ýÆÞá~Ê_U"ÛP	Ó{í«~¿¤ °F¿W¯]Ñ¶ oµØÞÇåäÖæîcO ª(~ÍÊIòH{)pùÀþ»¸¹°éµé­ÙX*2A9u­®jf §«-&2W9?(<9·dó¨á»ÊâPvñÜbi=}|CÕ¦½\l+_×a<gaí1u±BÇ´Å"-ÃÎëiÓ"ù¢âÜ ºK};)2·T}|UÿD£C#ïq ¨OêPÏM;öu»}Ã7XRnGe´öx3ÔÔ
VDåðoÇtìsà=}½kzX2±#Å,§ïcÊåwgúnxÙ
dxp³Ju·ÝÝK7¹M$:W®9å!¤ãº0N/ßÊ±"U"L&\Ä·KDC^K¹=Mð¿ÎIeb¼ÁÂîC"yêN/ÁG3eTXS®= ¥Ý%©";ðÓpÎ{Ô¥Êo­P»S5¾ùWK£F)WõÖ<OC}ò;3= 7èBrFUs÷jVú¤Ôìøý9kØQÉÙý6"ìÀIã>h)nïµL/ÿ½¥%ð³þY:Ã£V]ì'øÍ>LZÐ-Zåt×ÜõÐ³ETËÄµÇìàþ@×fl^«£U½:§¦t¨7Çå²êpdÕo©ªßµ¾GVPÎ|ÐÈ"ª+ÜXþ±$èWðAHÊìÂ³Ãì/á+ê¡±	ò-QCqFÇóñ´Vdµy¾{=M<íÂ5­p:z-¿T©ÁBV9ÛÈG=M6¦>°û×~cÓÚÄâ¨;;Ã²¾EÌµÞVDÒ&ÿwKéÊ3XTÿÔ *UlÆ÷®,Ä1Æ©;©§cd,2WË¯y4³ÙÑ¸îz±ï¡cÌºiÅª¹ø<ÄÅÓf)B Ã9ý³7;³õ^F)ÝJåt^móD:¤üçÀ¹«¸ð-åÖ0sð­MñõÇæwLóÑÝÚüÄÅ«~¯»ÉUo#:5ÐùéíñBVÑrù?3*Ò}ÛÊ8)±ÛOÓAúßæ&Ìµ!D6çä©Øâ Õ©ßZ¹¾¹mÐ0Oªr¦Këb¶ÝçQ¯c¿Ë;0	XEóNx}eÖd=}|¸lAvP)®(¯-ºlòCï¿Úú;IùIè¬ú´üÆñ{¯W¿Ý%ÆOqÓ=MO±z¹¢ë¨Þ#%lµÈl5èÖl8ÔÏ= }ñ©(ø.+û'þÝÀCªË¼
>¹Ï8O= Ö*¹4ß®G_[ã!ÌÙ¨ixâ)þ³bôN¼	4!ÖLZÔÌV¨òe´Ô.¾= y®ð<mÏÝ}&£û>.vÍE	fÖ= DÞ5WhÈeÁÚ-S6^ÞË·6ÁA4föPý¯]ô2k× r°-!\¯>n=}¤y (y*2V¸ÂÐ¢üp38'Ü@sÐ¨:ZzÐEä»ÌßQëÜÙýÙtS?xqn»->kÕ+Ô(= ÔunËN#´­
Qèüÿ¬*13¹JEÝ&N®[E÷	º|·:ï<_
jãçRInË'*1ºF
E6aj-õË¨©¦I ®äE=M¦!3J@C.7¢,ìC.§¼N÷¿ÔÀ}tS\eÍhÈ§º8ó2H:m%tidÁ¿ÇÄc-x:µNpr4}])EãBÑ©pMúOiCWNVSÅhÏOUÅa>©E/tÅäÝë ´ÅÜPÁpSs'©å53î «Ýú pßÁÛRuVR)á§>Y½Ò5ºÖ-ÔÑ¤àqµF-SNZQÀÊK6<¾ÏßÚÞh®æE÷-ñAÙN{<çàôíS
Óï½áFIörG*ª¶Äµ®s#.z= êx¹ÐXË1ÈJrbÚïFîZØÀF9¶îÙAî¹qïSî|:d·§Ö JïJ«m}ü#dÓÒÕ^<ÁÚ?è½6«Þ¯äÆiÒ¥ÍáAÉùyífD¤yøZù×FðJhBÌÑ·Øôå9c²9KÙdÙ¨9Kádý^~
õË@Ì';4
mpp4xGlTÀÌ¬i
epaê¬oHjJ¿¶w>50«pá8MzöÂ§yðÈI6fsò(!úÓCwfwó8%á8ã¢*üOD4F:@R·«R	¹?á¤¶mJ%-£>gRjâpcýtÛ²iÆ½JÀËi&(k&©{YÖ|ÙG_ÈÞEÀÊJðä3yúîÕ4¹Ônï49á= ÈãÀf 3929çv*¿õ¾jV1î¿'ÓBÁæì¹ÈÞ¤ÍIsVoÝ8D&ÆÓqoKqÒ{ñùÀ}ðmqöýÔ.=Mû2ðÇ(Ôrà[èjÀcèRÎnÙÃlÿ+¡[Çä!©¦®3:·ÎfI÷ºÓ
öõ7·ã	;õsVÊÐTÖOéàªK¦jTÚÔê%æpË®Jîï­hÄ¦îDyî«îZ3-!õÜÜkJúZâA{Ï¢÷ú|ò|ù> 2$»rOü0.³ûZL9¶= Éê+~p\ùªÑ0Zò¶­Õ÷4âÇWÄ%jÐÆiâhÜþ'CÕçKü|Ok8h½aí¨AÞÏA²Ï/f²©RÍÊáéî»e®yÁ$×f&ä"[C:¡iõÞöPP-Ç½¸ö¾³=}xrQÚé?åª³Íæâq@ÉDö¿:5½äU©4QRhÊ.[¤÷ã¬	.D¨ðÈ×èRïmq"ÐèqÒ®m¿ÞóêÉ{4î­é0Ù²´!½ÇKÌÒÒfÚDªÞc=}UúG.íùùy%ufy;?Î@[-~£*ZøÏT%Ð#WÿP(µ¶%ú¤º4ÊÓôxùÐÍçØ7¢'©¥ÝÌ®e{H"@îèªÿSÞêùX° !u6ðî¦²àówr´ÁO-Ê:E 0Æn-Àk´:î4WÒ<\Ì¡ÍÁÐ=}Ù³íÌao'e^Èñò:qÌaôÿ|A(*ÀØ=M.¼£0¡BHöìVQç.pZL8âo,±²§0ÏÐÁö×Ô$ñtâòªS6'µ®ÅµÜ¡æê³ÀÙ°v7¨ÚDÛoX¼DÙÔòØ¢Í{Ú&¢M©¢Òq:àº0ÅF¶¢sÒ*efp	-Q.ó*ÂBIU<j '1#uÃÛÛBÖjÚíZ¹~ã.£fùm³èì0c¥Tòþÿy²§$pq!a%VSúµ%ø»\qÿ-cý@ÚW6µEX.FTº¼wíÎ%·ðþé>ÜeÃA8úYEnbé3Tµ¨§õÀªïõ}ëÛu@Læé	hmRCE=}¿_1MJvC £¨Sô÷_oÂ¦pÂ¾åTÍ©dj@Â®Uã3³Hô÷¿h#p<]úEúH'à47êXUu1ñ^öXBÝ]ÏÖÑ$9gÍ6!Å9o÷{Õ¼¡?ÐÃlAølØ²Ø'EÞå'Öû ÛªáÅOëO<I¦<QÙ´NOxÚë¿LXyWÁÀ+6,e%(eÞþ&O\³jf/kd±Ùh)»NzåQ4cæÇ@øÚÕo hGVó,O4ê'óDZ+â²¦ß#Ç·Í8òQ¯Ï@OÏ±2û.¿aðÁTÀXÁZÙ3{CÇ¦õ§"æ*cp{ñ¹/î**@à¦j]Ü× 	¨zKÂ ºÖÉæ= ÓPu M!63}@xý{pWæ³ÿ'®-axÖÀ¿!Bgq1M)¯Þït³ïUò
Ôp	­²«Oúu¥ªãÕq¹
æK6#0µH
&¦ÙF_ß!ò."UKxªM ÈË)ùL³|¥É|w&py© Ç¯7¿Äæ(G¥0ÃðiÉ¾'Ga%#2*HNÊ
¢Ë&õw¹Ó3Y±¾qðå»= /ÊAR{.;Ç[%¹ÏÛèÄx>90Qæ©6¬W?>-½oÏóÞËQCÓ¨M¯8£¤Ø¨"pÞE^3µiRl±ä0û¥óÊ>ç1<9¥iÊmêå¿c"_XÁÂ¶Ñ'HÃÍöTÉÓ¼ãxLÉ µY®¸E
áMûôyïr°n	Æò4îÞt©3£&Iüú0G»p¯Ch$w·Àë{=}óßçp¥·Ü¸åÛX)Ò®h|ìr{éz!JËé¸´|Áúü£m	[HÙÄ«kò-g;= R+þ4kªì*_dÆª<¥Áz/=}û¦mý3PèPKQ:ÁFDÏ¦tù#¸'ç^ëgõ½=MÇ±)Ø!²ÝzaìSÌÏôæ¶ãíä_¤JM	ßäÀòUx÷¡üGØ¾g	fè|Y#´5ª´}Cá¥:4?#À4h T.32õçÚo¡Â¡&éÓ2n¡÷L÷CH#w}÷ÎK8ä¸×8â³y5çY¢7wãj¢*ð½s¿; ¡ZNY¹¬÷ÁbQ©µÚ;°ÍG½ZÃpäT·ö:Azd>'ÉßÇØP.O¨#A ëÐ5çk¯ FBÓ!wèÑ:xÈç^¡r*î7ÀNÌ= §0ô¨°|ÀZÜÌ<ÜÎd÷q»Â0=M§ï@øqÕ©&Ã±ÑÕ4Ê
¥ºc§¯®ýús<Éz=}ïz¼ð~å9û¹[1»5/wxïÑéüÝ$ó<Ø ç¤gw¯ÏB(þÅáÔS)ø·((&:\(h,à¾zRÉC	n8o±¥39ºêSÈ>$3"ÌÓÙC·bwê@*õ(-= 19¿ß£¤wó ß-5ÐÐÿ!gbÈ%­&nûæT4õ<¾iqE!Àä$Üq¯êv8?ºæ±5&ÓR(KéwùdDÆûb'¸Í³ \ð0£À/K§!bÞNÕ?b	BóË0¦dÓ#8³?ZAÕCNäêÝÄ,uõÉüÕÛz¨¹ËR
8ÍR@ceÈÐx7GOf¯¾¹WåìwiOÛÀñ!K©¼¢'YïI«eW%w÷5Låh>Þù¤+Õ¾
"°l#yäDf#~P à5¦½ò2ÇWGf4J¸Elê)ð:5¸áa(Éx_ýÌàmMÄÐQµ¦>ÍDf0¶ ÷7¨F¿¤0¿RèAóGB qOn·ecG/Þul>ÙíÈSøI¢^U]ålå}0 ¦v£(_oF:îÏgU±Up*ØÐmÞ;Y{ÖQ*´~o²eÄÆI¶iOú@»pÉ£«
7J*â¸ñjfP¨ÂçýµÖ7rºªÖ8×6ðþ<]¼NæÊ±÷DXeÇ.°®á 0(q¸ÙéT=MXØpÝhÇÍä(õÖåï;mXºÜfú-¹!¾#UVüµý>'îoG©Wå mòY¥Ämæ¡ÈB}M¦ëào²kâj$ÿ{¨ç-_Ç¸ÝO¸BÕC¹ò|6»þÐ%$ÊÏÁÐ~n
lfÁñ¿¯©~Zeà]Ü=}µª3ÿ¿6Át¿åötaàï5éBÒ¡{ùbGÐCG¨×÷Dè3?=}«²0]x¯I^É 7 SÊÞòWzÓ¤buÆÄ @qª~p.óxÀø&¶ÿxÞ÷7Ý
ÂæÛÄ#g?Ùúg9= o8= 1©Y×¤§ÀÔõ7& }±8Wé=MzUæ »mzØá)*z÷º¯.£ îù¿ ùgK©B9»MG£-Îi^ëîª+:
ã×àì _5:BüþµözJcoÅùpZù«E¦krû4¬5îVM¹Ö¸ùÈênðfpi­²Ö£´rÆ&¦Hëã?çÿ¶u]*	AVÔO=Mµ ]h¡-¬2ªaÅoÞ£y¿ïA9×ígøjRoYXïd8¢ÃÃÀh¼gþé¥ÒD'oøwjùl{ ZÔBÂÄheê»ea÷~åvñìõB½ëçµw-ö}bíªæé§öÙ®·=})¿9]µÄì
Ér ÙsHÚPÄQºù -¨ðpã>KC>wÝáåûo$Ôÿß5o=}gædÀîÐ;fÎ¯Ø(?¶§eBRgPÛzû]Í¹TÖa0õþ£)ÚÔU~Ç¯'=}ä'M2Qõùº¤Q£âWóå%¬|¾-ÿÏ\uMSÎò¡Tx}(Öïðñ¶½MAå´6)mVºÊ¸|á4×,t8ª¹¸xV^¡êo±4)ù7n>Ëz³xßY3g2ÚêÃõFö¢»õG%s$E¥¼óç¤}ö@a=}*XøêøñH%Ä¦/2iÑ4V·eIäÐü/ÇÔ-<h³Aa¬æz3ÝªÕ©'FÊ·iãeú¨!úBÊ È¨VÏÚ¥´Þ¶®Æ9Ô_SÌä3Øh<9õø.%¢I-¡A\%*J0~[Fb«jðßÄÛÞ°½kuïòÉ®5ííWIsù4¢«º¾XB;¼Ë ËU××ù³W³qÔSË:^®«òÇ×= §¾õµVsîÒQzàO³jÀQ&ù7°x´(7\ÅëíówJk:Ù^yª7+J*:V©qOtíøú3= ûÊIcu~¢%®ÀDÃx±\YGÞJËfç VTÉÄê5Â¶i2= ´j¹hÑO³*±f/®ÌXSf+=M=Md!Õ¹PO@ÝÎÁç5Aûò×Z%þ&¦ U÷ ·ÒrYÄÓÔÖ=}gsQÄgüVa=} ìµ%­J* úgb*>Ëú-NZÇ~Ú¹Ì½>½âNÛ	ÄSÜÊ@!]Î¾§ô½ÌwQ¤9´ÌÛ\ë%t6áeïÌ^-ºNj¶©6Ù¥@×![è¨£BdåW@s¬¸¥!»'Ñ_Ô>!42¡ÿùø3@ÙXCÙH|ûÉþ:¢~÷ã©ì<-¡3Î?à<= ègÁþ>àk\Ð¾Þ°ÅfÆ)D¾O;1Ñ¢ý9n>òÚ³=M9vN¨°\ñ~ø!µÇdª¶?÷
ù ¿Ó:ì_Kl'â 6ÊÂÃ0BÛÐÃvKb¬¶©DMÁ×HÝé:½eACìéã²¼Ö%aÈvfÕýÁÆvDîjÝWa8B{ñR ô×!ØJgxx= $c8J®¨wb¿ÏÄ1ô·{Ì;¬Bê÷[9?{Ö8±­sîgY7"ÜQ¶1¯³R3LBv+'Úa*ÅVV[¦Ëf"d;¢ä¸Ößgh¼gþéaQ¦ÔQ¦:¿éÜàÿ¯PìNBÏ¸33HhW¤ªÒµaq}!ç(÷Í C½M%Ë²Í½)Ã øÍf§cP²oísÒªy
W=M¨o-¶»fë%¾¿jl=}vEbE+?áYIÿ
B&öBXX¿XðíqÀ\¹:&4½¤óê*Bß¥wÐ*WR°ùÌ¨¾y×*í}Öá5ÐÍ3BÇxÌ§Oêh¦Qf6në×Ä·õ²½ªÚ¶ªÏì'ôÇÿV·5 3ÎRÎ>ðµÁx»gÑ
N]ÌÈ×ÞSµþ¯kmÂQcÊxÓóZ?{Xå(ÀùýaX.ø­õ3º_<¾!5°±û«GA^k¥*PCÀ"9µ°·?^¥ÅyîøíIì= sS*x)1À=}ò ÷Uë¿Ò¼ê|a¾áÉÅUvÇk¶ïßwYùºhI¹~29 ã.ðgeL0Æó¶/èaÆ®ö)ýÖ#E gbWAciÙ¨/8È´c5Ëà^Ñ ½iâVlÃ4P lâ¬±³ñÁ#öä¥#Z ìÀPZ¡= ·ñü
 aæßDú?Ò­ ÃðÒÙkë¶_R½â¶ªÛ¿= Ö¸­:Î!ÐYÝ¶q¿aÕT¶ÚSÛÅîÅªÒõÈÊ»®®Ê;èÊ{¿§"~;k#Ù{cVôêO#4 Z$9q!ÿ´Þ%³|Ú-UWÅø*o;¯Æ¢¿r2PüzÂ¨°¥2#q:1éS"CkÏH@é´!©Z:2â­NÅ%þ["R8keDGÈ´n¯µ@$Àô¼¶JW¨Tâû~·áÿrH³âÌþpÁz£s£Äk-JÚ $¾µªýWø?»$÷8?¯ç±?$ù¸ABD_õaYûÉ:vÂxÓÖ¾Ø5A	=MÎc6Í8Ãhw95Æþ¹ß4-"¨#³AY¾*¶03ÔÏ&Y¦aã@E½Ãù=}#]ùPjãá(,o= dÙgåå}gkV®2XdËý°{ä?~Ú5ðZbmQoeâ½ëÜ¤BýDÒ&Z^»Ãå*oË-%öSÄ[nÝ"L/'¬y)ÏÆV¼Y+ôn§) ü%ðkÉb¾ªIËsÕÒ;)¬ÚVM 45®éLbÃ·ÙÉù~!vc:ôº6.	ê^«	l)ÌôÚBeÿÛì ­w]QR×8w¯5[[au£1²+= èLébcá6 NJ7Ë*°Pbÿâéilå)®Þ´özb 
G@ÜG¢Q|cäRä |*ºE¼vøòEöN.ý£¦T¹Qµú;4êãoX½J[rËï{ÜlÃÌE?Zá= Sweý"Jn|dóh ÑÁ5/³Õí¨t·Wû¦~hÚÓ´9ÞrØ	äF>; uÄ*àöNGËÄ÷"µ'×ñ2Ø6 uä§Ì4aþÃeðñ¶¯ ]é=M­K£ÀÊp£ÜA®h.=}6gµÙ­âQâ£ª9"Á;'íõÁûPáS1àp#= #1Ç3éRLZº¡eBNÍ7£6=}¯¥aïWÚÙðW*NHëÓS¯8 T£gõ_õoïàÀÏ']ð¦³WÀá=}ÊÂGøÃ´½úÑf0tM?]g°êá¢øË×C:nÃ~õAùÓ9â7¯ìb)«ad´ûæÜ¶p "Ä¹Y>Qö ªBEç£Z×eÿc¼ª
ËãBA%Øuª¾ñ®Ð=}8qOè<b Àª&æU¥á4â:+~3ÊÇ¢Ñl4£°Øoî  WóÎÒC0ý Ý£ÄÔ¢©ª¢Ìë*¥¢¤èÑ^^t9ËßF§¤$mú+$G|¤sÞT~È÷ÖÃ\r	Ã§Ë	Á+*	lPPØT¼LQÐD¸qåVYùxq¸ît<PÂ.BEÄ¦ÑV\*þ4ÊÃÁé d²V_
h2K5\ÆT%=MÓÀÅ=}!k×@züDëSD)ÀB¨¾É#À°óª0>ÑVmø1>g#7Rêw@/òï¾Æ+YFbäÛ¼Ø§M&àTÝSæT¹>Fg¼ËE³U ×êÄÅÄiuàóÜ³Ä±¢/7C¨´l«ÇjwjU1À>ÊaP#n1eùÑ ãØ½ØE-,åE­VeríÏ}W£ºÛðXÎ"æxÆÃHLa±ð+zI4
Ùóó·âÁÝ1§óÂ²ï|Äÿê]ïB>\YyïXö4OöÐ£>fE5ÎÛIÜÉèÆ»w}ÄT.
¶84Ç8¾ñÂyë+jÄY1Ýù_´¸çB+d
R=}=M¦>;öæ×µg=M«¡Õ!B.ßBNygï­g%8Lldñ@Ueu¥IÄ\íóYiÝÎõ±ÂpIñØ= YS ÌQ%¼svÞ8­¥rò7NÁ?¿CvHçfëÙÀa#ÇUìó;¯l X:ðQgÑBE[£ÆÎß#¡W5"¦ls*nã|MÌ7<Iømñ_çü3ºjbK?¾33nm0Í²|ç\^%>5fh²7Æz×få= ¤øq(p>J¾Ï(pù_MMÂHztéWøîçx8ÏRÜêSùèãÐñæ§é3% ðc¥õçÁL ¿:&© t<h¹×6ÞÅUèÁ7Â]ÅdqÏk³ì²Ä!òC>ÔÕ¹F^¯.v9úÌvÏÖÈ£Õ ½Åáþè§uÙÖIÇWsýbexNëæ=}$3 .Ã±öÂ9Áåc¨*
~x5P«6éæJßÓ³æC³ýó§¹3ùìÎMV:×üÊ¡ÕSµpeABºëú¹ÕÝ¬!mûZ]ÍT¬¿¾Az0ìí@÷)RÇO¯Ä­s¹ P]&.f¸!5£ÞÎ=}ùæ¹ .)¿öÞÕÞ:ý T!<XõÒc<	¥vÿe§qMÒÏ¢ðLV"Áä×L,j5a«¬OÝÀH°~-Ì©!nrº= Y©äEFÚÚ8¹È¸=}zÎÎ+¯Ú:}ÜXrè0ÚPíH!÷ Np¼ÆRâ¾èº2¡´Õ[%þ&ËÙºÁn¿Ñ=}ÈÈfé^ïA ?7ÒÑ.»Ï®^)×üáà&öº_De>íõ÷PÊÏ7û¦©Å¿üïFG:ÆÆÂTHHúæ¿í1"vu©<½[¼bzéÕÕû,#Q pï³ý>{àíôêËõ,Åk(Òã/Äç/¬LyÍAçÇmü«MðrZ£«TÿÔkó$hvwöm¼Í½Ý¡´­·ýÇ»ì¤Bé¤ÚçFg÷9aÇtåKÙ*ð.ìNÆãd©[= à$ottÑ:Uð±Bm×QãÏân9W²Mw¾o	ýcC-æMGè´~áS	ïérqÃ£ØQÎ¶mùËKeÏ¿ó6<<J7ßÖS;Wù!a5V#¼Ê¹¼0pïºúü+¯¸Ýäêm°êÆëÆ½ò±{9ùCsí5T®zeË®øÃò»ífw±JzùcÒ sº÷¡Â¶Þ[)Xº«FIý:ýzúúí@Ô1z´·§ï-â,÷Eõ/±«ÿX£ èþ¹¯Y=}¬=}T­?½ù-úÏ%x2Q)¥¬¾4B9y@5Ø"6ùº*MÕÁ,øÄGMðzdpF=Må×Àíø=}.ñîrýÉ2bz¡4}ØZ	£eæ¶^Pö÷&wk­²7æJ¯Ð>VwD×GR´T÷ïÞ"ñ]>ÕÆæÉË×ó]´*uS[³ËÜC®Oe}¤ªR±#äugöò%-èwÖrÐô:=}*\¾!¡ÅNàº%\²eÖ5M!ÓÄþÎÏiÌT¬%!¶4ðYÛé!(A¹¦=M3gê3FSÞiýÚ#ò²QGÿ×N¼@4¼ùZ¡ø?î.I©éNzó{ë)K¸	É{æ·Ø«O­0'n&ÃPÙ0|+C/Ä«wóUl$©<¯H³ÛFE9l[5bºzËÈT!L?äþ¡Ãh@p¹aúÓMQDs³îêO<4R~>VófÕ~Õ-}/5}Mt6Cõáoç¯åT¡3B÷àÄK¿= ÀÄüÃò/º(Æ×wÕ³N|©ñ¹4	¥}eQÐïNô·÷½ º*yÉ/#Í= Åf"!æÙáÊ9µä;QS2ZP÷÷§NÃP¯§ÕgFÐÇ95}E&¸îåÌUfxÐy/J¥¡Ë'FTfÍiø1uY@TxüËïËÔ)ßôX	XZLWq¼béï_×Êâm¤×kÙoäÜ\+
¶KxDJñTÖo7È,ÊØ4ÕIÿPM#'QP¨CøèÕiPC´\ EWØ÷]b5|9§úü'Áÿ«Zë¶ªã_íLh½"[&þQÃ!®ìùJúmÄ ¬ðºBð.ÏNd?}&­c?2Ù¸N6pjú¼%ð¥êILÅ×ö¢B¹@*?[R¼B;WßdÚIx"JóþÉ­øA»µ±¡hø­7*t-ÃI»=}Öê1ì2sM'û4ËÃ°ÒâÉ28Ãý"AËWÛµ¶EÒSë½Û·¨o²GíæÍÿðÚHúx.M	ìØðhëkF#Çh¿m)Dlbö	[Ýq¯ö67ÖXß6¥]nBßzFT22W¿M×j)hvßØþxï[é(9c¤£TxLz;±Ûñ_ÁkÓ EÃäÑ ¿9§£MÒXoW¦Þ;£Ùô*î6ròR%éXâ@!-Oùó«Ça©ÜëCY]¨ì£DWk¹jíß¿u\ê=}ßâEFúå¼¥Ã.W<¸»= º#§+cTë/D÷¿Fµþ|-]]ú.5s<3¸~ââR§¥ëâ:Tú8×$ñ7g)áB=}*7zí5·ÐP'öà	37Üâ¬Mjÿuä¦O Z§8U©Q!ôÆ¸]m÷@³ùÂ8×Í2¥Ã×§igÍ
UJ¶÷aÕyJ]¼Êî#Qé+ÅmnLsg¼¿Ü0= t¶]K7Õ"¾¹Ý­ÓÄãhàg¨û±Öí-?gIS1Iåä£_Õ»ëâz­:û5IÚ3<}x)2¿¨2¹¸Ù òC»O{çáÝ1òë$êFAûþXd±bõècýn2ê<b(E=}â¬g'.ÿnÂôYK*°¹yÃ¢¶TÉøã®CÖ°l:´Hd\Üül¨Wkè<~«Ì\åf=MªiedëW¢Æß¼´B?z/¤:¡Ì^<åo»+¥FHG×ném@z'$xgëÿØNæbÈ(aiuhn¥70Ã·ñ0rpÂ¼£º7L?JÔ[Ù¾¯$Êê^"gÌ+è_¨0û#¦äe$¬wäÇqdèR!Ã÷ìµÝ,¤WÖ_7akV¡~T»ùCÔ¬Gr	¸oK[ã*me.q¯=}¯3±ÒÙ¦FxÀÌßpX3aùõfaÇ+ú#²ÍÈp+(÷NÓjéªê(yb8úÂÁÏ#3ÂêÓdóïz³ÚÌi[EÚÛääeyïP#Ð·0nÜ{ UD¾:¸jéè&Á@6ÎËQeO(Jin(µ<ÜæØ¢¿¿øF-Sçct¸8ÜÇç
²VSf¨6·´ñÆáßn'¸~PV&ªYBv8zY
ðØÙwpt"ÏÒ±ô¤Ùs_ïzµ?Qyõ´!ßzZpf°+ÉóhòÏéÏÂÙx´HC^_- B¢ð= ÌÈ·³LàRL²Rñ¹ò	#ªÜK¹EbÖ9*<líq«ôö»Wî~7d1u,¤{1@yÍAr¬Þt;ÌhlcIWyú\ÉC
(¶D)úÄ#ì¼ïl<|>zä¬ZÝ=}úyÆ&-&d@]0^B½'ø÷ª.ÒØeî8¸x-CÍ[Þ¤:âOþÌÕ´¦;ºéOÖE±Yóæ¯@æ%­CS8ì"h?V< F¶ÖóLÎaý,=M&ÉÏE Þ®<[=Máår±TÀdF|%¶NÂcõ©Å¾¼&Ô3ýÓÅië0RS«ªáÛíÞ<®íÞS Ðy P[¿-O¸QÌ©¥Ü°ÔB"Ö%<¤ýXT9Uå÷= O.ÎTSEbr¥¡¦!NQ(¶øön.FöæËº ?\)05¦Åd6/tèÐ×¤Ýw@l¯ÌÛiåªæ­bÀñÙ£ ÈÏ×c\§ùê­HU©wùT»ÝMKtòË¡<c]ëeÙ¯æf]²%Qf&Sa?ÊGÔ?æ %ÅÔÒí¹ª ê¦®
D0 Ròþ+CÒý{¿áQlÉg'1)£«aÏÐåÕiD3^O=MÛ³¦D¢­ÀrÊ~Õj´ÓI¬j×FÉ=}æYÈl= 0~Dùbê+°³*~oxÐÇÍ8#\¥È¡_ôk?Ô«ÕzkÀ wH<Á
pðKØ!1ÄûIm?DRcíLN8°XÓÌ¦W(À+wÊÏõéÜP\NôvF+ý[Ì¼GïëÉÄÊLmè|x0ksï\/= Kjv43¦ItdüH[Ê?¾DhiÁ1¬xËÀÜL·Öþp6(#D)j+¬©ýxi¬üÚ+<vËu:¬uJ¼1«ÉyE,¬i²r¤,GËéÕLðmþªüÉöÓv6}Êà(
j
p u+"Kv¸¤z¢_Ð*(£iA(vÚÀý+4«¢_"0Ã+Ö\LÊ1Ü:x²ÔémTÏLx«I= Öû}t«I ®jÌø½À<fò¨éÈøN ddÊ¼Ûr¨¡_lì] {nÌ%E\ yÈ3ÁLD Õ¬¬Ã*Æn¸lÃK84
Ûd3äLöE¶pÐ PmìcD|¢_i
YÜ{ê}N®ªÚw[r|(JîÞÕtçOêÌÈoê®>JÇÌ>ÔÏ= Î@dÌ@¯ÌÌ+ìÙ_!§|ËfÂ®
Z®¤úÊ~ZÄì¬_|
\¶\ë&Ø{vP>à#¿vìe>¶¬	·¶üßÜnF3\LR1 kQ[Õx|PkÌ¨K}TLlÊ1ÄDYe%4<)¨_Yw\5Ìê_è3ëFd¨<¼+©_4#S
m\ª^K}+øLÄidËª_^%+\|x<ÐÕÂi4Ü{çÕü%ÆEn <|	ï
Õ,ËHt)tp#Kh ÊejÌ0]:LÕ_ì
lHK4Ïí[mÔ,8Ú¼~ ûY3ÌK^¢ºv= T©Èº¨c«_ÔJFtV0û)ýkOËqNÐlQt$KÀ1 $f&¬ì©_(Ó©k$7{Ô\|¼v._í>~7FxÆ¶<ú}°,EoSZ¨Ï-:ôx:TyÜÕ<¶	o7tûHÔÐYÊÄy8àû|qò}dT||÷	Çl%NZ´)U"àÏ Ft&JmA
tºúgKü\vÚz ë~Y0ÛvI.tô(kK|@¬vWaN¨ûJ}/ü)rv°l¾M 8ÜïKõwm0Iz<vi\GävnuS1I	\Ò Üh\ÏÇg_Ê)éÁ1Ü
;=}ü,ÿWtÏ-þýpÒÚTy= T]K#+¤|÷+
ïÔÕü+½tg'ÌHìÕzcàé||ÇÉÌl VÂ¼ÊÉª®*A7lm6r tRNp[vQTÐcNàD»\$Ïu{|yÝ~Dlv:j*u¼\ÞÕ;U|t,xI~#ö¬R ®
ûÜìþcìÆ1TÜ©	|¶
¬ªÙu<ÿ\ äOJÐlsI&ªýåÕ9BtnV
vFº¬Èz0= l}n[Ê>~Äj_èË1ìõ§iSÌv¼v\ú	÷m'BÚÕü/~H\Km(ÏwQ+C
î,ÒÌvpiÊVøLÕ\ÖEJ&¤ÐG&~= KÇÜîKE~ÄªÉ<ó
*>ÒÌÊÁ1 lw+qTÜæ	Õüp¸ÔévÌ_¬0<;r9kïôG4¤«E±1ÜJp¤K[:døýY¼»Êu®Jõpw²ì)
hGd"Nô)bm|OP,®<@hzVÃKxR6r+JRëó\Q+Á}ÀPS9ÀP{R,p¢ ÏÌl
%
|ÌÅtSã
6ø|ÈM7Ecl:­ã¡yGÒ6Þfµ·Cµ«0¨f­¨1eÓðd5^5¾#5>¨^åD/eØ9¢ÄS;>¾êÀø   [JÉflY	8ø
ú"¦[ÒeÀÙoØfG
sÿ÷êä[ò(æË5íËQÊ·¿PÈ³Îo"éÙKX ¸,«¯~D¬,(ß¯9ël:-°ìe3Ø	­ù0+{È¡Éì4üLÇrt{ì.täk¢hò0QIkË®ÓupÁ4*ÿú#å¨zÙôa6å|9QLkQ6wLë$w_32¸».Q|q>ÊÇ&FÃÛhÔ¢\r
¹vþÝ{[TÒ²ìë	?wÏÆüÂy¬(óÈÎPÉ¶CÉÍoaÔ
ä	âÐìF ¡ul&îÎ3	íÄf&»4x=}±ßoFÚÒgg)µ~= ë3hóÆÊé¼l[RqÖ<³Õ	é¦èñgêÉóÖÞ= ?P~H¼#@O3xðËô:QxÁBuô"úLÞVa5dY÷±ûYôèL2e= ÜJ«qlíP´D<ÕÉzëÝmFDûú«Õ	7Nõmuê<±Ë=}AzVnpwfÌ^}¦K3ÿXcgn¹þ<®¦P3Â¼¼~'"Ú¢ç!ÞæoL$ÁjÃ4å×ÍÖ(ô>Ül!"Eì»à;2xèaãoZgcá;lô,Õ)\eÂØõQ¤¾¢GßCóNZl¡ibX0²+ãYsDúçWcöÌèasF²K[NÁDmU8±ËaZãp°Ãxz¾J·Â-[}JÜºùÈ$xS_\Ûw¤Aÿµrò¨,úÌãÂRgì²ËHZú):RVäÇ
;Ã¬ògÌb}=MwÃ4üÝJ%4ëÛ=}úË= úÏ¦lYZCu{(8×	CHº?Q­¬¼ô	
Ê¿IFQþþ.= {z±~@Cºp»ºÄà*"ø¼x´~ëÓàóÿF«°ib£c»{HÖL\#«i<<±+eeóé@sòÄÇ%óçjÆï0QàÚÜ#¤ÚÚd~Îûä¬ÁKéohCbûFQÉÙÔOWéÛâoØ(f³ì*´BQ¼fCº× ³º= Y7¼¸q "ÅtÐÚ'ÅK6µ~ëÒúS¢ú[Ê$y3èÓdêìoªáÿIF$Ð%+RPVò¬xE Z¢ò¬"7@Z0SQUELoôÏ];SÕI<º\gvä<[E¾L¶~a&ÔË²k3)Z=}Æ{k=}|';	4¤Bâlâ	 UÜÇ=  cì!Ï¢= $8[J<dìS#Xë<×'þ»h|íÉCuI8Q~JC| $EÐ= =}*·d!æè6b¼+êøµ~Sbú¤óÅA1:Q'&ïiZÕu²~"Ù$IÄÁ$DàNÊd»$¢üèæ4*´xâABßÉªK#<:Ù+ª'òqê2Dü\ô$L¶?âÜ|ôÿ÷_TÎ¬}=}b,¿ô÷uæbQbES²CQ¨!CªG^EQ (ÃìyLr7j6üÉÙ»¼kþÅ³d<±~p»Ck²Xóa]þôè^°Â(ÁwJz<4ù\i_ÛoJIù@÷Á½éo&Ùà7ÈylbÜoSgCn¸ç+{Åß\¸5llÌ(·~kÃúîã>ÿ«	î.Ã¬)Õ(¤:Æ2ZK#åv¼+\vÄ^µÁë@0Ðg÷±½é= 8»(Áo³rY= ÔpÄ|©û¡ê´UÞæï6ÛÆ	÷¤ð¯OÂóÉ®"=}S||~|LµXõ°XÖ?ÑÆ¹°ñA#dxì\¬?ÔsÔ3WIxk\¬¿G?àº¾â­!Aäú]Wfàfö×.¼<øI'îh½< hbÐ5Õ-ÕòC<·$/:^cuqÎ}:Y|¬~¨ìL»"G}fdüíòLÓF4áÜþÜbù¢Æ£®Ú^É9çAÒâæàïðJ£,ù6øÜ>åsÅ^ÊÃG¾¿ÇÃÃg§òÙÖ½Û{PM¡píØïI²þ~þ¯­,Yjx§2%ðf½0¶ôá øñ	êð/2L^îP þ~9{®h¦ ZV£Þ]¬7¬!ùÖ =}g9ý:1ÝøüãUõùVõ6¯ º£ðñ	ï)Ææ+¡Êå2ìÜ¤*!±NÊÏ8d¥úÂÔ´ -±ØïuÑÊHhù?ïð²c9ÕÊðÆ¯Ï¡²½ÊêÑIöd¶ÑxpµÀYÖéB#¹G'­TeTïcWÙCÛCÑñ§òÜ¡Rq?"n#ks!±¾Ë_e7ÚàwÂÃü§cGêõ\ªgA÷¦§cAÐ@¤-pLåghzY^~S3_uä07ñÑPÌú ±BÆêK[sÑ8Ç)00J%:Þ©©Nö^ÖVÓ<ãúÏ(§è /p:âyåØï¢"ÞI8§(±':ñm1ñØÚ×ÛA%pwÒÓÆ§zð/ ¹ï)@&®g'éâÜ_µË²#)ï¾'èB¾'ðPàosÑ-ÐïBDÆæ¾ØÜAQ¨Ppà9sQÎSqê²iù½SÓTÒô$¤÷Â8ßõ"'!¢f¿ËË³¦ïÑz'Äö¯Æ±¸ctYãø	?WÃþ^ãÞULÛgeåØ!Æã¨®ì^ÒKZÁ¨u{¤¥È]Õ¦Ù?±@ï0@¿wJ_IþSñ áwfÂS ?fõ>ÓñÄ0¤)rò{ü²£üºêÑW!;Îck-0ÂãúG»â¶7ùC@±ýâ×#­ÁÓÁY·.Ðo­ªº;'¢b¯R§°õØ{ðnMÒÒèP¥J±bk|D®NïÙX3ÄÄD³@£sÛW×6Õ6 ¢ûÕ>£-ØAõ!(°¦ï¡ÐÒÃîy.qÑ |¥0$;íï08X¬¥"Rô";W=}SE'¿p%èB'¶Ó÷}!N¦ ¹#¥Ë×ÙøvÜ -³a/bqY¨îÖBñ827wÄ¯Ç¿¹²HÔGHø(R b//ÒnÁ·'òî$ØÀhÊ;Ì¡}´]ìZ1Êaú0=} GZ¡àgßûÆÂÊ;»YXJ©1wÓåáácVÔ*$ÝÝaºú!R÷Ö{Z:,ÛÜW^ï$rgÄ|²òûÜÏÏú]ÓõÔu×uÎ´Ñ o6ö ×ÿIëÚ\gØ¯/ø­G3Ea¤Ê7â8»5^Å¹=Mª%equÛ#kõlË¡	÷¯1ê¸Cà¼|± y¬ú21çq+¹¯¸!ÒñÊèöTn³´tOnëáOEýû')!IoUY&=Mk×°nÂn"lRvéOO OàO O°OÐOO
OªOºOOâÏnÉnn¡n¥n½î¬î¤îÈî nO·ODföÞ.¡Ï©®] ]&]])­ëä¯"«ÄÏÏæÏ¦ofÕ5Õ}#v:ÊãOÕO$Â³N&"Q+Ü%ÐeØÓ}­<´Ù°©³qòoÝOô4i©µO¹Oò¤G¬î¸®Dª]½ý+Ýk+ÙÖåÑEÙµÖk°­9±)­É¯Åß»× i+°ÎG\¦)=}í®!°©óÆ>r®=MPG>º2ÊeSvù£Ó>GÏsEÙSÅÖ3eÏ%Î­À¦ûs§Ìà!Hñ>¢2&î= ü_Yý&YÜÞ©|·Wohyè¿Rj¨YPÛùÚÞ×Æ«ëã!,¼¶WÞ¿VqN©Otñ¥îÆ#ÜµÖý³ {S¾KÊ= CïKY'rÑéÞ¡¼#zSg>KºñS»ùÔÂC6hÄ+úïh#:ÜÖ bMÓ7-:;M _ij/·vy9O*Iwéjp©.Á´éðÐd#©|©p;Í77Qµí1")OªWKªR¶RÑxíÆ&p¹t&X$B©P¬¨Ä _VÅ³´=Môe¦iíJ[²qHáÏFçÏó·§U4½¹DKUüÍBOyµ÷Mèä{#Áíá¦$ÀítZj¥à^=MË"Ñµt[Æ= Jý'üåB_ô´.KvNpTÆÈá¥úo¿rVÂ¿õñ·ßx~P·ÿ¢Û:øýmxßxÝd®ÂÀ.M0Ôç{ÉqUÏ½,xd&_ô*¶d}»­%\kwa-7ûÅ0õ¾~mïýº² "èý©©Ry#m®î\y UôfYÅ1sóµqÁPzñ'È	;}®àÉÀÊ4¦4$Äp­= S¦ÏÃÀ{zîE*Ù \<Æ¹âA,=}úY#¨|!ÉÒf	9ep7¤H¡á©îÝNvPh½ëÔîEßAO©/¶7dÙxÕ'Fÿ[LÌL³b¬[.Aè*ü$"M¢ë^Sú)~.= p{L)~ä2¥z= TÄ4K ~p¥¼y[bü;ÆBs÷I"È)2 ®éNâ¤FMPô~O)ÇÅX;6<s!i&i=}	T= Ìlú(]= ãûæ,zÌÖi³#Ao»syQ0¥ X¾9÷¯¥º]ãN¯yNüi|ñåñõ­ËÿP,JJÐK"µpsàÊ-r	Þçsph¡ji{øyPè¨óX©Ùê]fB)e*ðúË5­»ÍÎì{áªEï£a©B*êXEâmÃúª¼F@âgyæènïtõí;QýcB(I>Ál«Z/Ú²:)ÔbMSª¯ØJÜhý	ÁYÄ!Æyª%G!(ÃnëÚúEÖåyR¿ÃÖp	YØ7ÁOeaò«âøÂ;¨-d£M«vRg#p¶(1s¸uéWu°ÓPB²ï©TùÄ{Mb]_½B#s5ZfB¡øû_P<d£å+eWq5ÖgAî¸î9'C)BÚ\/Ú8:)dì= ,Þ([Ü§dTïÁÜó1þI×=}#6	´½äjéÎF&ÄLàøù]?è»~ tË%È#É	#?&ùEïEòb}mm­¥?Ñ&×ÙÔsâÂå0¡ø"Ïè²ãx¯ºËqWðÅÂBD@@@DX(hósZzmíÔ$lk&Zô l^^KÝÔeÀa+n¥[etADóö¨+Möò;i:U*È+Éo¬]Yl±K1´àq
.I¬$Ê«qÓ)I4Wîù.I¥)t³*$TQ%©rþðÜ{TúÎKEHu«þ¤wáiÒÄHeÖ¡Æ= þé8E8v¤(o;spêJEÈVH',BªïÝ©_ö\n¡Yï>LÑ8k5HåÒeß>ÆµFäæ¯iº¶4|¯âUþ£ßvì1·¹= 1K=M= 3xWúr;%hîç_§5ÕÚyÜ¬ÓÞ?ÈEÄ¢ só3e·W;Õû  yöãÒÂ%0¯ð8 ¼Ò:©:~±§ííµÎXLÚfVú5 iULßØvÝSÍëø~G¯Y*gg*.µú¦÷ÔhQú¿Ï°aêQ\?àL¸×ÜËv²r:u:Å8²
+*iMhXÚJ8·ê<1òQ@õHaP+j3'õ1Cî·VÃ£5.e·û[>üìWC}Ð¤y¶Äf:5vyoSo¦[k#Ýaïç^Èªe³ç±gp/ïúbkö1}Qkp°ç®g1"²gà!®ØY»ÇvpÂ×¦XºYÂWÎûkäÕ1¥=Mµ3u[÷¡gb3wà¿Ç¾ig1çmÖõ/yZ¥Üg¶*;ÚPOÏ^<·*Þ©bZhQm®h6~QJ|À>ë·AuBv\°v¤î?E°ÉQõõÆËY|ð"\"òq,"(qe6ÜÞXAWF"?2*­Í0ì¬Ým3}qÊ­Í4?ÅÏ1ÝÖ]°SÅ(°Âkä= ÝzE7ÆzïR@»ª§zÏöõw 0ÓFã7S¢aÁw pñò«DCÜ6axß¼u|<_åá9 ¶dSK°¶bgU£\/ä¨Î:]³f= %íÜç"næÁG_»ø?µ1Í}Ë£»]FÎø(=M×5öµÎJ-è#3ÆMÜWÒ¾)uûòþÍ{ÙTÙY%Y¬¿ìócÝ/!V!Pß£QU÷F¿vKPµY$b'P¾ï$=}àWO¨Ñ¯îº{¸¿¥0r0=MaI<uú·¤Õ4# [°|½ìz$¶	«Îì~2*´Chbi~hÏTy¿û«[6þ\þ(e÷ù :÷ZÚþÌÑ¶ðw ³= HE¼x:´÷I"ËÔ®fT~ã6.Pý+»^}ôi?³YR×ëXp¾{?4Ñ¬l(÷K¨>dbCìp â+Þ!ÿE'b{¸uN,¾áZ>¬:ÚQóVÞ4~¢~¢E¢ »ýÑkÉ®}òÖ!âXlQtMÎQZNí1ô¿YOÔÅ.S¡Mþ3(ÍlÜ$)#)¶×qÂ«/h{w
°S03º¢a¥= Y34µö)bõÂ¹R­¾î©ôçwWQKÒÁ<Ø¾ãútË-ñ:ô·DÁKäxÿoÆï«omiÙøäê¹³k¢À.d:]Ó8¡KÞ qÐ¬$çS-ÆKÝÐx]|á!\µJç÷üÙäP©7º¥RÌw±f'%3È_\â!óìÒ¼÷'9¯£æÞË2GÏtgaR¦»±K°B*cX_(Úíª5l¢]¹MÕËÈýÓ%:hz¶f«=}'z ÇÏÕLã3]Ï¸6Æ¨ß£à:µàdf£ÝÉDKâ±@ÞsIYä&Z¶Ì5ãÍD«¿Ô³2êUÇÝkB%D)J~½²ìÕJ/ìòÙcÚæ¤e
×J]?Ëè{ W	&»ÓÂ÷y×H/Q8§.×8»oËÀ«½OÉ¶PjS÷Æµo ^ç
®Ü¶$âÚ¼Oû.§P+9)d®\ÂW£ÊºbÏ¨µ×¥ûñ^ÀµÒÓ)§rêõº¿ââÔépØ_âË¤qÖ«êO\ÉG È84ïÌÐèî¯<4(¶çÙC6Ì&2Ü
vý$òeùßXË.÷®l¾®X¹ÔØyÎ'ÓÕ©â5®A«¥òQ$7ßzQxûÏ¢÷=M]§Äß}åó8Á{/ËV¶µÌ5¾@ÅÐ¤<x=M7µZxaçÏ[ë¥5s§X0¹@ç)º|ØÏWH#ÏÕH]±á'KÝÂ°<ê}¦@b,Ø¬óÇ<= ²¶bçyùh«ê´õ>ëÉ\5µ²½ßoV)µ×·M?J«JROp= ¹Lsà|OU«]A=MMOvfHçqR7qøë=M
Zx#ìiläà#bÕgn6¼ÓüÍ¨Ö®GzdrìUK{*rÿÌOdUAò[Þ»Ý¾Ù33*ä= «0ä!*0F³nGªª,XC-2£ë[4Ê~)´1|¶ÔÔ@®IZ GÐ¡ÓëPÊgþÚlÉM
Bªa¯oçpÈVèOÜå÷ý×.¹XÊChÓ(KåC-§Ô3ð7QiüTn©ñ«Júa¥ÿ#øÏÌ	:5¯	¢dË¡r3a'd	nQNé6Ò£WKÚ+ä5ÊÄ\(µ2dòêfgm
º=}ÞÔ'LW_ K=MY¼ùFv#÷YAÎæK×bøcÃòáÏWòv;à_Å.CÚeý®NòòfÏøµ×G7¬75'î0wvõ>HáÊÃ5ÂRßw:kû£O<4qøJº1ìå¨ZâÚÒö²¿B}£8¾^"ø3Å£¿.à¾ ÿ<v=M¾¥=M¦¿ä [X/5°Ñv2å+]'¤Íõz÷÷÷.3ÿÖ3]qã
A,7>ÚFÛãÏ
§¶:B=M%ÿá\ÎÏ+}ôO´çmPÇÍ .ABÚBÆ-
=MX
ë= ôø
úÍ(°üW)Õ8,d7üL=Mä®GÛ8:ØK»'lJÒ#æìI4º×£CÉzzú5ÿ®Æ$]É,±­±ì= Ô®ó¢ïçü2}­Á\Î¨c £¥ï{ýÔt?	»×ÌÆOw²ÜÎ(õa&¹MFæNÎSÏvdSv³>âa¿É¹ÚÌÍQÊ<ôB½ «Ó3Û]Bsõ>äOL'b;ùìíGm¸\ì@Èñt½Ñ «KE¬4aV_6ºQ­hxd¹[«UßZd¹Kc¨OÔ543ìTPßwõûí®¯ô¨oKÃâWma¶o»?ûj¸¼6?ôkºu¢ò5}kA)lÝ¬õGÍ= ïÓ®1¤dD+ <fÚ­	ñJ?Û'tcB¢Zïìe±B¾ÕY§¾ÜUAB¾|dïRìÂ÷Â¬Í@ÔöRG2cø'øÎOLL¯1<¡ ©.b
4VLCKxxìd 9Æ^ãïÎvPýé·ï³i0:­iï×èIb£ßtDñ§´%ÖÆÕWFs;_Ô÷2éwGÕé]=MÔLÏ±mw«mÚýóÅ~ÔQ¬Ñéìx¤­£4ÔJçSîãIN[+U5©n¤_Áô³D¨.hÙùHA(YÞdç´èÂÑ ¸ýIä¢ò3,M?&}K{¼Pç,/~C7{õù}ÕÍU}+òçªA¬âìÌ8ÊÔPx"L$<ØA#óh.ÕBUdú¯oWTne}Å«Ñ c(½Ì?Ë	|Qã\¡iIL¬3®~?ÛëÙüÄüï{.Ên]ð¿ÿODÚ}õâh®mfäEK/¹Ë¾ÜÐvèùQq
ãôß¸{ìpÝ´¤©é+®d®óß§×{ö0ÞvýI êÔíïÊåçsØÁë(*ÜmhíÈerâÝð
y;@èìOCîbnî×ÔF%å}´5âK»ÓÉÆTðXïuauèöµCK,|EaøR®JqÉ9f@¨âç~CÝ¦cdï{K<Ý|BùÅÆ¡¨#ZÏzÌpÙ}¹»é:LÒQÉ¬±)ækÐTm*ÞirÃ_'ÏJì[îfuÍá7¥LÙ¥=Mûª·Jº)<Á×¦¢Ñ#xÆ*Zå3¶ÅÄX³áLÀ«DOPÊÔ¨m«ÜP_¦6$sÛTÖÄ¼Føêçîl.wýE{¸P0ç¨ÉºH²;Ôb/Â¾WÆ©0'¦}	×9æÄr{ËÎ@£ÝÅw¡ãó)RÊ¨/<´qçà ÃMv 	Éí£|« ]ÅÙÕ§B G®KØpf[P%É®ÉÒ.p.Ý©Ç¤<r´>hÉ¦[­Ô¾ÅÄ&ÊêmMkSõB§LÉ¡4¨: [À3é{ÿÀ­n4lÝÁÆ
)¬û4ð|ëOûÓâT¬m¡¡p)LS·pájEÚ4|SwbLð©$ÚÒYz}Ì²FCÍU-øÉ{Y%øDÓðÌJJ¾ufÀhk¢Ñ@<Ã­÷Ö¹²ÃQq«b>MòÀClQñIÙ;P8!ìËÿu·LÎ= "à	È¤ùLáOXîØîú#;¾òSßù%´gDR>	Üí)ê\Ì§J­°E´§U\SÍTk5ªE@ÞJæü&=}4gN´Tê}«ïÌPÀ|ÉU= ¨wêMJ¾âþÁ¦?+è~òAÄªæÂRÇíwBK¥ûÉ7±ÿVUÈÜ+èÜixD©H(°o@¿ÓîþæõÁpª&Ø%ëô«¿³.3hýEé»B¸ppau#Ôa¡GP\4;r§iÔ)çêØÔD»½¬kpD-ý¨ÛËVs¶+Epéýh	RãïIÔÂÑ/æ<[µCä/yojåmÈ	ynEj:mÈø1'iÔN~^áû½þ ÝôÐëqÄGmùÉ,Kc	=}Ðlïæz0EB¯83\ÍÓPËµfÜË hnzg{(âEyoË­(õ¢(mú~ÐtÛÈ^!CB|8ºÕf~¡ëìéS7áÌÑÛÉê}gZ«tû!v²ué ©ÑåPHµGð÷áiÔ¸Ø.BòÆÛ{£Û.M057ÌÙY~R >üöQè<nn
íû»e  ãÓûÒðTý¯äæ	e¤ syÏ'¥= yÉëå
6\=}ÞÂñ¢wIªT¼Rîw}F}°£H ô zäå= eÆI
Äm0anÅ,¦<¹®êL8@»ûRx(|½Ï³S|¨ðîL´Âß }&"Õð¢tÆ7	×Î¸hÊW= ç	«ôRY5Ç}lfª0\Álòäyú º©ÙÄðôyÈµí¤j¿£/Ï	àÈ,Q#Ô°Ni©¾*;íÛÈg9ÿÌüÏTÝag Êûm@7¸Ý
ÇK6«ÚØý|w5$¢}ÿj¯{áwìAËGSütmÒ4Ý:ÔËùbÒ[¬S=}ªT¾O»9·ûP.Ò°n]ðázå)«ÔÔµäÎ¾4	¦¿¦ðéOËþÐSdj= ÙùfÆ¬
CÓ,rõJ4¨	lÀjópf&µ]÷¿$ïÖt+µã1[QK/a¼ðëÈÊÔ¸ÊI¾%AûÂc4ªÔhZÝ{ÚÎYÙÙTïÕøÝ¤m×uLS¼m[= EFôþûÌ#Y×T=M»4

¼«*¼:]1Ñ Ùv Ct=}Ûlbâ-ípµ isÊðn{»û¡ûÐ®çºÅ}Tµô³Pg§cJh¼©îõñQ9æ0cÛ©
Òor>¢}ÛGD_Àûøx­ø²i©Sàô´-=MØ¢¹¬P°ôMmzpjHªu¡tõHÊä¡ DûN+æünLi :v%>Äô$Or¨þyÕÎÅÒ	t'5_öÉsªL¥D­s "§Ò«NÈ4£Ey3aPB¾âýõIj=}È7B/çªÀ¸ÁÓv ½úËIö^¤bW)Ò0ÃôÇEªÜTÕh)×ß(ÊÀ«j.Hl½/Õ®ÉpýüÌÔZzKlý4Tñ	_ÞàsïÅå	ÀYêso÷tzõÈ÷¬[¤ÓÓLó}ºPfl-Ï"³u[+ª_]Yø?(KPD;þÐa¤¤^~[×	wÐDt/ú²%àp9Åà^Zíæ°SºPE#@}wÑ·ÙÐËúfT·-NEeA°;³dÒaU)¦,){®ÞØ=}í	>"T~AèÈ/8b¢	S}ðç0½ºi)§Zl](z¤òªOk; ½pò)gB¤«Pûl.vk¾9ÞÅ·6·ó-=}¹	çÎ÷"ßõA= ¦pÉ3ïí]¹l Ä¼N+GHn~y«ëÓ3|òþò%K«C.Ûå_¯ÉÀ°÷K'ÞXJFs} ¤©¬ùÍpÓZËÜð]µA2Ç#Ê,ï*û0Oðù1Ü ÌI¢Kºf£¨ì:O4$N$¦óE°Bw»M5Òl­~Î©wÙ«ÜÄ<ÍÙ^Q@ÈL=MøF}æÔ¥GCO"6Ölñý§kÍ	|ëAôpñþg° lR¶ëú¡4ÐßÔ"áÔ8íþw¹bz= xÉ1Pd5,Ód·Ï4HÕ~#C	Ð«ÞõõØµ!~F~lGN^nIÅNëqÆÐÛùsLHX®,U­qïBÍÂÐUQº´ø%æIHðáwFÈÅ7ä~YEJ¯ÚÎ#¶_®QojýþS¶¯ÜÙi÷ý·´ë¥äl§0ÃÄn"oùÀuyó/Ç³vWÍ®ÉÑnjÒ
¼ëJ5:âöôi'úçøD}Ë#9ÐZ¬Ì= Þ@ãÍzMÇ®¨ÂúO@·o¥AÅ×*S{Ùpñ°4í_ÅzÖðL3>'Á£,S9ö±¹2>~	jöy\ÁÃ¾:5µ§NMdã=  ö(A«ï×pvTA¿K,Sàö	°ì	ÚtÛ_æÇxÜôv9Ì*4@c,[= æÇxÜôv9¡xÜô	øÂÃÀs\\Ü·wÊLðÚyyÇÅW=M	Û¡¹áE ^ï»;RØ!¹âGÙfÿr¢iQ¸gÑÜ¼PIFz2õmÑ	+ôÖÚõäèÅ+ú¯QäfvÊ÷§£Ïw$@8\zQ´÷ïQOÂtk= ?åê+P3×zRð´Ñ¾oæ,_æC»áTÂG;ò½Ï4¦)y§qk	:ËÅ~(éÏø üÅJtøF¤¢BÜ¯üEyO)òæqª»ö¯»Û^az
K§ZöÌÌ¹PzvR|,Ö\d8by9o Ù¯ÊÜÿNÃÈÊL±âËìV¼X_h®qzûW?¼lÚt$K'%è©çÉB'®K¦IÈúQÐß¥)ÿì6= `, new Uint8Array(107295));

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
      this._outputChannels = 2;

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
        this._outputPtr,
        this._outputPtrSize,
        this._sampleRateBytePtr
      );

      this._sampleRate = this._sampleRateByte[0];

      return this._WASMAudioDecoderCommon.getDecodedAudio(
        [
          this._output.slice(0, samplesDecoded),
          this._output.slice(
            this._outputPtrSize,
            this._outputPtrSize + samplesDecoded
          ),
        ],
        samplesDecoded,
        this._sampleRate
      );
    }

    decode(data) {
      let output = [],
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

        output.push(channelData);
        samples += samplesDecoded;
      }

      return this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
        output,
        2,
        samples,
        this._sampleRate
      );
    }

    decodeFrame(mpegFrame) {
      return this._decode(mpegFrame, mpegFrame.length);
    }

    decodeFrames(mpegFrames) {
      let output = [],
        samples = 0;

      for (const frame of mpegFrames) {
        const { channelData, samplesDecoded } = this.decodeFrame(frame);

        output.push(channelData);
        samples += samplesDecoded;
      }

      return this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
        output,
        2,
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
