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

  Module["wasm"] = WASMAudioDecoderCommon.inflateYencString(`Öç5Ö£¡ hñç¡	!gÁæ¼OïÁn´ÌR»Å<	<õ8StÛpÈäÀ¤øÏD|ÁnL­{ÑÄp½{ä[¶pBB²{bªËdØ«B=}øê·ì >í·k0ÿö\\søRªÃxg{©)×§øãÎ.­;ù¨×ç=@á=@$=@!§¥üãF¿tÏpµYîanaÒ=Jéü5ëY!L'~ª¥;©e×bÈ§K$lRB¢ÿkÃÌ¸ÕYÞm_aßå÷ë?A×ÃG>VÊÌ©ÿçü:R¶¾{[ÐtÝÏ@é©¨)½|Ã	ù¿TY¿õÏ|ßÆ~tÏF¿{QÔþÑtß$ÍËnFÁD=MîöXXï¿¦)Qã]Ôï·tS´Ä}gÔÅ÷âUÿð¿5TµÌ½K÷	%Ý©BáM$y=M|#üèïüùqY¿É¿Èµ¤ÏÍ¨cµt×©ôÁ¨ã<¿âbé£Ôö{òïsæt=}X¸U£#ô³ô["]t=Mxþ òc±[AåyÓâî£þuÓºm@ß[X#öÓÐÐ(¯UOé°Õñ¤ÿïÆ%dü62dÕÖð?©=@·E(ÖÝD¡&ÜDQ(_È5Õ¬i·Á&Ã·ÇiàDUÕ´içD %=M'(=J¦úÉG·9#ÝMÕ;¤ ÖyùªÁ½V¨tgÓÛ-{û2*fQ¦¸DÒc]F\`Ø$ï¿pc¼ @GX&bµ9Á©hT	t+wÃ4ihôpxã|%}{°U[|CyØÑÇåÞ¼	ZJô·Äÿ}ç=MÌH¿×\`³Jp÷¿%DPúøÆUOAá©<q7bdëüÜ:J0póIÌ¿zf¤|Hçk½£AÖ¶áÅùã­*|U¨+po±¤CííµäàaÒ³Uúr±4ÿ^ì=MR64D>.¹*Û*ýzbCæ\`]bBÆW?3U#ìÿÖ1>äùùü­Dú«Ä*XGþâÍ:_cçáVûgÌÔC|±_=J¤@Çó&tÎçrÊó;tn§A¡°H¦­(¿øÀµ!IþÖ p|÷t9qÔÎþaföÃÁ&à)_ÔÌ	£Å¶ò©S·ìñ)Í1é(í|©æS¹q=M"¢ç{ü¹V!ñÿ¢7´IGaV3¯¤-vÞOï·ü[ðg)ð£X;Ýý'öáÈÊüëãÚá@d÷É@2EÇE#ÜÇx=MøÜË³Û°ÙE<ìhéz=}øtaâlVë|èüÆ¢g©) ÓÑÑ·ÖÜðR~¥#ë|³¯ÜÈÿªÌÄ	v¢·ÁbÁ=@¤ç&9tçÞìV=@¤ÖA=Jdcw^V¬Î1¤a&e:÷m@/¼ºý	miÍé>Aêºì|Ñ$ÛÏÿd×|¿åt[Ò Ó}(Dêÿ*»XÉc}Rý¶Ì¨6µ×FÔtRÔtn«½HBGá©éH_WÎ=}0¥Tø|£cGA'ecN>ÑÈÆ÷M.]¾ 6õÅÌ¨bØðô3ÆäFXhg0wMÐ¤|>Öÿ>^Ë¶ý[¥ýÒ Ì³Ñ _ÝçÈNæò×ð×¦t(·mçÆØ¯éÄàÂ¨U_ñ¤=@+dêÌïdÎ½­eØdYv³¡vcäð~ëÝ¾ßþ~Q¹Ù¶ï\\édÇjs0Mñý¸Å8ÙÍa}¨£DÒZÖ>7-_RäNúÓÐÑP\`°:ßó®VhVð½zÖ7«Qð×ÏÖ¾\`SÎÁ:^DWÅþ4ÆéÏÉÿàdÞ3 ìJEZ£8±ëû-×ìß^£ÃeiÀM¦ñÎbÑåüK?î&õï"ÝØ¤s¬	ÔaÞùé¡ÒÁ Ö{Wû~Ò_À³-;ÿñ\`e'^ÚðBãà¼û"åñZfÈÜûÒüVM\\XÖäÀß½®#!iO¾jªÝ~¨²óÔçT¾×¬Üm{mù»¡l|·©53PÕë³)ñ	"Êè\`?«[ZçäÇ·ÙqAÃø,ùæO¯OÞ±=J¡ÈoVR)=M©a.LY!:<¶ñ$ùz(W)×iNpó=}AçÂï'caüÁ¶ìòu.)Ý¼IÅ)Ò	(¥{ºÒdo<]LTq<Úõp¶û¥4¿Ö¤pï­®Oón¾q~ÌÙ»,MÊzØ?døQy]âækûÞÔÈuò­QP±og§ÏÀCNY³X2XÜk)ºöBµ½¶ZG¼¶N3s*Ö!ÉF-Tà1Zû*)¸®þÜ3Ô;ÊV4]h[0ÎIÛ7]=@Ha£÷Y--?¾Ù¢¦mo_b>>ND/>Ô½¨ÉJû/×ÛòõÌX=}Ü´p´ÿf:9ÔÌÏ·lecÉúîr¿Ë*PdQnB[}ÿ¼þ( ¦ã{©?m¬E-éðFÁ/8=}ò®+=M¼1Juì¿¸=M/@0±ùkOko_·ú~=Mp=}M¬ÿ7õ²O·m§K¿· x¸×ï]l;=@_=J×ãx¹3·BîO¼"îUdçÝqÙjÒ4D:Ô<Çß/·Ûxp"½Â¹.3aý2|¡iBR-Çû¬BÏwÐ@¨ô¶#¼nÁ2rJKP¦ZOå.YM.üù$7ÿðAs\`íARøô<K:	wÖæÅøbíÎ7­,øU0#±O\`Ëd%OÉ0w×©×É\`þè\`/æÐçÖÀYßUS¬úÒ]8Ì»ã÷VÛc4-ýsgÊÖ ¡~OÔù=MõmÑåþ5M­fpåäSfGØ[Öaáþìl@k¹ÕUb®à:!Ü¼\`ÕÕWzèàDgHç·ºWÃúmFt0^puEwU4âH²Ì;²vû2Ü|wW7=Jüö"ÚKlõáÆºmøg°ßÞxÄót\`¬x»Iâ©8»ÕóÎP«wàNIÃR¼]v=J£é¼aØVÑÀÔàª=}Dk3=Mð»HÜpöçNY&>üã±µÂæÏ¦nÅ;Òj=@2Ö¬õd­á"ìî­¼t!vÚ\`ÛÄCw";û»£S§pÞÎ©of4/t¸\`d¯Ò¢µäÙã=MÞÔ =@.ùû	#eØ$i"(=}q	0-ÿú÷=MÉ"á£Rw|'yC~ÏÑ{Ú?ÕÔÏÍz#{a%ÏfWa-b*ú'TÊ\\lzk¼äÕÙÒþ}ÉËÏãÙsªÐßÅéø:çÍk	÷¬çÇX1ü1µh mÔuwÖ{=@ù°êß^¼¨Û²=JOÕèÅ÷ä}+éÖ³økrR¤²¦ýõÊþZ)ø@×xßä=Jä5dÀY.5shY"ÃÆP\\Å¡áÜ#^ðåð	£êÅ1àw~?³Vv·xvmJÓ^¯L0M>böpïþKoHYÕ¥µ=@maÑÛ-=M0Üþ*ûÊ+þò îâÒ4ðÒ)´Ý+w<ZÁ¡g ¬(k¸öÔ:_²¸Ô¶EýÀS´ªÑÉÃL¶Ø£ø ½iíç]äagÓî=Mz?¡Þ,îf¤ÙÒEtoûOÍÓ¼·ÿú}aÒþ\`Ê´Ð$\\s7kú/8_*à×0¿a^=}7Åsxâþâ9KvÇëg-ZTó[=JÂjz¸ú3ª°/Í7úösA_*UMTOP]ÜËó&7DaTõ	G¯2®}^óD<ð\\FÌVÈ¹RÖy2 >5aÂ¨½µ½zyP¾ÞDT®hwQßc=}<ºQÐ~öÕ0Ë¼/>N³þãNs?¿ºbf<ghjM¿ºÞ7þ½Y$¿fù½È<Úhì¬/Ù¯°êDO- \\=J(~©P$5RP-¬a»äîÞ:ûî|fo×owåÈëü¿h^it·zGçOl|Æ+®Êã0¡ü];\\$ÊMÅË§eYÝë40SÔê§\\¡ôÝ1Çá·8Ø÷¨ûÈpìC¶dål5DÁ]"¹¢^R4?¸Î3ÊTR+ÓKÙ>>-3@âe=}\`£øC©ÄÆÏÜ9ÊgóÄ¼ßÞ=@ÍB|yÂ/m¼ë4ìHa0äÏsé«n1Ç°ü³hÖÉ	Û()5à|)ñI'øiYu=Jé£]èü_$1½VMÖÔÏ3*^Kpª°H!ØØç¥Ôj-=@ág×ØdÄ	¶·"_Q×Ä\`e ·$N@D]=@Çxñq×pÕf/z{)Éô-qk^a-^q>ôÄ=@?¨{E?¨y> Ú¢M1w2=MEmöÝht¡Ù¡ÄgÎéô$OÞÊ=Mé®¨ÞÕV+pg G~@#oz5Ó3ú¼oàn¬Q½ü!äRC}ÇkúhAÖôà3þýë5{\\óÎß	âh©-õÆ\`báv61ïò&0ò~qåÄ¢¨)©èÀTü´p¾A=@D©HubÊÔüÕ=M#Ðõ££7Wmï·É\`ï ¿H§Ö¤CÂ®hà{dPèPÃòsN/°>¿@ÎÜy½z0c{Ñ-ÈÍ	Ä%¯?½oÇµ×Ì%¡äÅvÅ²tEUÕV\\VBMoeàVÓ'Ëäök¤9Þ©|Yý¯xçà©ýPöVlµ5Gz¯R³góé?¤ÚúÓC1}­&:ÿm.®N©uýê@',WFg^<0E½W#É=@kPni×Áy³ñwÅÍ1Qû¿ëÓÛÄ0SÜàDWç±tÑí¦[·ÌlÇh -_AªYLÓQì]CwäôBÞ\\çq´;èø;ØÁ=MÑý5&ÍÝóðTØèÛç%mÇ=@ÒÁàÐÏA9Ù>=JÓI¤=}s¿Õe*×?ç-þ»¦ùS©ºøûÆ iIûÆ@sÍ¿ðq^Êö"n¶YZùR5ÁÃÎ@m	dµoðã­¨ÄëPé#uÐW<¬¸i)«O@÷	õi´Ô9¼¾¾üwþ9Ke·ÏWg.ò½áËÚrÄk>I:WYÇè¯á½ëÃKMÙððÐÅásõÛp%½^1?åá3Rü_ä&¢ÔJá_YÞ	=}U%ñwgkãÜaþÔ (ÏoøÖXàÒG¢tíÜÇÈ[®ø¹Ñö­ã@×]ß&áuñ£ø3­[÷tù=MÞXoånù=@s:6s_iLgm_±Ã}ÿæ¼=@ÃgG¢oÒÑ]ûá±¨ëÝÕWÞÁØàD)T)à_E×g!ñÕ{Ï|ë,0|\\aV?È\`æ<Æ¶õv=@£_(4·Ò£6øaÝð­ß[ÖøCÿ*ÂO¨ô_0&P¤ÙñYûÎÈ!¸Â#qß¸Û*'%¼i£)ÉÊü_'M)ÑðkEtEHêp0Q)P Qá©±ÃËk Ònôÿ"GSIÔ­EC-?ÔW$Ð©ãx¢×¶üýe¡çÁéX«RïJÒ/\\Ð¯Þï²=@ÿz, *-xw!õû è0´ÉÝ,aúzÂã´!ô(çÞ=MÙ+ìá©Zè_ÒÎK«»úî1Ío{DC¾¤1°ÏèvÓÓ¸YåRÿåµ,Ñ×¹WüòìZ©1ïúq¾\\¼Î{:ùÞR$DH¹Þ¿ôQîÖ;E;p£Ä¹¡·õ¶·=MÕJQFRd:þßHÄlØãýè^ýö=@Ö~iÒK	ÄÌX&¥ôÛ*P¤{¡èf?Éù)	'äTÙÆöÔ& (&)¹õ÷·½zÛ!Ðvh¼OÉ+wÃßÙø)¦9O¨3o··éhõ@ä¦T)IZCö=M&ÌBR(¾qDÄ©ô{×BÐÜî=Mí¡ËôÕ¡Çe¤m·'Ka3ÒgGê=@Tç²òÅæ £Y÷·r{ö5Õå±Òr<¬ÎLñ:Òibv;½jü&\\ìü+b¹"ß­g¨íðü³ÌÿØ®²7®=}TÞÔo¶ÎÚ¨%#µòFXa«bsM]aìµTBMULPÉvNè¬]Ph©bÿHO6jØ-¶m¢AÈ§Z¶6Íõð_\\°OM&ÊHÄ­î©XÕùyÑæu¨¯Tö6T\\TûTÓ©x;Ø^ÆCM6¦É bZL*ËÒ|Ò=Mé,>§Ê<Ûï¬â<~w=@9Yj1Ú·8l_ê=Jºvð8 |°«]ÕdÞýÏ°Ì\${íê=};Ëøä#÷Y#cSzuðÅ"Þ7ÒT±kÌjc_ü/¿·@+ÎÇ¦tÙú!Iö´íÌ/ÂfüúSâÖ@Ütbòß&>DÛe.I,\`;ñÄ¨ÊÄ=@tGêS_º,,[\`ä³çû¥ñ®,e);ÙMöK?Cº'ýO·/0R×G_±àJ^éaVkéP(ÙÆME1bç¨Qî11¦Y<Pð¿eÉÇ?î9ªL=}#ÁÑ¤ìIjü"ùßpÚÑEqÜÛ¬W^gÒ=MlA8p&¥ºï ²<È=JD)í=MÄHÑ4[j|ç3M¡QãÕHÝ5S¬gyÛD/ëVçª·è«©R;ï5±7E{Î¾ºvðø«äÔÓÐË4H­9i&:ïa0äöÓZò5öØÆ;®t8·2Ò¾gKF@ò¿Pyý6}æ²¾,Ì}=JEÝV2¸jUîlöü±¿}Càè×\\_Ø4À\`´WºâVõp'Exyà\\)FM1=@­×]Áà=}òÙ7,¦gâ°º¤¨~¶Uä¼Ig­nÀ_¬B|EôÄH{_x):Ö7£=MéyÌ#µÈ?íL¹Ë«¸X4Í·ÔYÙùÀ=@ÝäaNå¤¨½7¨©W)ûÁÜWY×DºåÈ=Mß 9ÀýVjâ½À	>d°Õ°/¬Ë6%¥Ï¨àîâY{®Iæ/Ï7	Ô¶}ÚCüØÛaÔrEïÚÊjóïô·P+iå+áwÍ¶pgø)2ßÅ¨Ù è0õáË2\`ì±Å_éºYyÖ7î«x(A<8PFJVÃ=J®ÂJÙYb±{=Jté6@ÿØ2,A{~àdf¿RÙwN»­jWóòÂ¹ÙM»vÜÎA]\`=@{µ6öÚîäE\`hþ¥ÐUjæj}bDðú©lõJ1Ê½%óh@è¸ûHøZ·£w~êÖ£ÙñÓ\\Fmóe×±åø·uÉ1·ý>=J\`¡=}N1x>ûãÚ½òùµ¹®²Ud*£¾ò=@÷Ôl\`þ-÷Ä"75´-MÐo³á{é²´[J²jiWï(®Ò-¢¢=}jËÀ4úq9YjßÉz¥b%BÅ%æâ¸æUp ¹6¨"+åÁð]çù=@jÄåÌ\`¯u':úQrÏì+'[×©XFÆL(¨q¥æÿfqdB¤Æ ZùRìC<Ãö¬r7Påô	ÌQFÛ=JãFC¤ÀH=@ÃÒàAªÊR{}3óígà+ÓÂ7ÁSú4¬¢mÄ}ÐóY}#·Üëÿ¾ròÿ UûÒ«pá^	 U½ÚB~é¤áCÀ[/CÛ?3 ÏE¶T*«jÌÛ[ºþfNÔbjÊÇ,:ï¡è´Ã®ÖãO²Á~Ñ]ÌáþÕ}ó =JÃgóâgíî7Å£!öZ÷3®mt)ÀneùoPª+Eï¤#Ð(~íXëjµ¼lT^§l-:o~\\Ä1ùÆ!Eñä«T;ßïûÒý}ÞyÛ[^i$ÊÆEæa½³CA_Id	Ó)ïx¦[)è~×dy	Æ¤ 3<Ó¥aôau_Ì-vL%ÊaÇ÷[F²Zc¾=}U¤aüwÐº37|K=}¯äÀy×CE»	\`ñW×Û.ÿ¨9A#]RtMöÄ<=J¼ÛÒÛ¸0ðÂµ1lÂÌðìÞÄBü¸I|	·ê¡Ä#¥=@sÂúÒc²ðZs#a§Krúî¸Ã×=@»DBê:'±ÍAì.=@^~FäP\`	!Kù'Éðy×+dÆhã×sÚ^:÷GF<}¨Ö9àXÐÞÊçwGO¯Íwýe}öËîb÷'YJ~Àôè¢ÞÇqUG<ù~!çý¼:=J¯4##}»9Er»-ö0ÂsÊ9ôäóiÙVõ·ÓÚqr4,=@ª¹´nÞ#=J!ÔtÑ :5ß÷=}ª	¨=M±).=}ó)#i'µL»ZîEéKÿë|×åà½Ú+sÁßQùÆgsNp|sa%÷jø³W£Û½xÑCê§2Ïeªi©tùNÉ»?²79rï8þãvK_ÀKÀvM±ëéÏUY¯ ¹´\`Ùºt-Líÿ÷âD½úë [¹÷Ï<JþIÇ&	8õ|ï®ãÂ³Sr°Ò$=Mda÷¡ë_=@ªÃ~ºÎ!2kdÏp¡Ð0ñ¾ï¬è´AVëâÊ½sgÕzÎY=@Ab0'~á¬Yº«ç>âF>°Rþn½þo9^84VãÙåç©"a¨])ow1§ók1ùrÝâîÊÁ#UaçÆE ÊÇáø·Ü»¹þûã¦iGÏX½dÏ³äÀÐkÞ­Uv!9.GÿÆ5ÖDi	ZWØÛ3HNVqjxóEfsÀìª½äÚãàªT¡òÙÅïªØ+$>µ<±Å}kM_Ï{µÈîSâ*Ý§×{Y3iýv8ñ­½¦$Õ}6]º2éu&X¸V0>JÚ9ô÷¯MqyÙIÖaUQ©©:0z~êðòþíb¡¶aPì£·PòÍ]EGôq]ç¥^=@}>þÊ´Ñ1Yp9ä73F¹@¥§ Â¡°>zr*û¶b!àtLåãÊE÷çûE;¢Ô¿N¶µøYc^¸G7[ý¤Ú+Î}!´«SäS{>æbGÜàýkMÞÛ>À¶Ìÿe\`¡üæ{Ö7ÐðÏÙv?eº æµÎø=@¼\\<~Áí£»íª³íyál4ðÎê\\QLÈlT÷ËrM8·ãDnî=@¼Í·óÊi¢ä¿Ï@HWHa°¹íñß"ÂTH%X´Õ9I±¹¨®ç¬oaU\`Ù;+}ÒJSä°££txcpõ 9\`zÝ>¹gixu8_]cÅ7½hÐ pÒÉí|ÄÚÂÿKgÊí$º8]GÐü§dNíd¶ÑqÎ¹útIÿË»ØzuIýË¼hØmÆÈúË¾È6â"3_(sá%tð7Í=Jº3î^<¨ó_!s·Â7úsi¨\`³qG¸Cf.YË3°óÁduÃT&Ë@&Z"B=Mf¥"[)táãgÙ8óÍí¹$pµICüq0ÙbyÑ¹6ÉGùä'ZáO%ëU5ÈEhseíoÙ§n+Î=}£p1ç]½g×¡8øý(Çí­$<	mí$HDf"1°ù86È_&Ýçí¥1ùzØCäØd¢Ð73ù£@öÝ,X÷C["NH}ö)Ò¿%Ry?cßc¡þÞé¢{HõvI¹0È/«åìG3Ü«¡ØÕÿç |V5«ß-Õß¾ëÜÓKj¨+ý±¤ÚÑ2Ì9i&ObKkM=@þ87°¦tå§3îâî\`Åö7æÅ¥PSW´iÜGÑyÅ¼¿vÚpW+#}$ëVï<È~s¾5(ç%¬u4ü;ûZl@Téü=Jî²ûüóú-~Xt81dI²Ë£Ú^o÷»«Ò§_kÍí¼ïìq(ú¥|~µ¯fìÖÒex]æ]ã#ïÅ}Õ¡vb&Û^¯M&Òe ¡k®/2°$ñõçvðvÅ«Úÿ­°5ÁØ©sôf]aTçÚÿåM¾Î:r÷f¥rÙÙßg³ GülÃ_ë%× ÀS=J=JðÎü º=}ýñ¶.Å.¸R}9âm1ÒÞ·Z*.Õ¦ûæ<mC»?íÃ­Z:=Jmw.vêRæ5Ã¡VÂæ(Áb"¡á«ºèíÆÕéldÃ<Ý |e©$Äâ²ÿÏD¿Ð¶TXïð7:Îvç\\Í¨>e>ì8î\`Ùx'L5lQeÉ&Þ±Äoõ¥Æ=M$ý/ãD2HLÅlZ1«(wí@%ÈýpxiVgñ­ Æïd¸­aÕº¢KÇÚé­Ã~A-­úÛs½aVÊçª7£Â«ñ>y5ó+¾4ö@p©E?ï^Lú|ÔòV´Ü8ã3¯_Óç|l¯ö<å?ÿäYß*V2ÁÐ=JAÿë¬i¬wýÜò81þN'cÕ=JéÛ#H.0ù]gþ^üqÎ¬xªí<Ä*8µ85 @½=@0N±Ó±8sä± äFd§8W³<üÓ8_g±4ÖÈm6ÕÁT5ÁMFÐÃ^±:Y8åbF8¬jF¸Â«vmO¦°=Mâq5®HÚIó}V¦Û>ùÈ7[9MòBÎbzº«-ô¨ùfï«ìÝê«¶µ#.øGÂ9ÙÖ¢ØX=}È¯§2ÄXYí³6bR¢ 	§MV¤%ºïIæ<¸ÝG/µ0Ç¥hM/¥sàÔÅSéõHþ?ÚXf¥ìÝêÈ°ù0ù,¥ íkþµ©P,=}È³è"àÙËhDf$ Ö,Ú©C%¶Â×ÔXþ7%f¹A¢^Gè­qýgùÍKïÕöåâ¥ðÚyÔ¹¬EHÏr4ÒÞêÖµ¨AÝ=@ý;ÇSýjÅÍd»àö5\\}ªîýð_µ¾\\{ö7Ô65nÖ\`xí1Õ@G;[ÆKÑaa#¯çP]Æ)þ7pQãÀûÿ2÷­:ô¤£1Ä?ÂÒ~_~=J'ïÀ:KÄbçÈ²3Yn£yßþ·I{æ(ÌMRDÎEý@H¥=@÷´ãw.a³£/<NCõB©åÁ½-\`=M§a=MãÅÌ§úI6D}rÿ15¡íÑïhñU³]®éîâ¹Äwî#Ó6LhüâÖS#>È%Yêí.òß5ï¹÷%ZÚÛôF'°zôîÉµKëTÔâ´ËíÄCÖÕÐ ¼C¬Rÿsoæ_SÛÂ£"TUÂÁ$ä<óâDaÁ_½×æ?ù	%qÂjU{oY=@Ì°øèîh/»áõÂØª;KÎéÔ{ÐèÕ¶¸aÏpÐ;P.QJÀÂ¾§\\­5]ë&TÎ:5q@æSHm´ã_Ù#$¢±C_.0fSøhäïÆà=J7¸I¾Ö=MX]çÍgê«z ~¯®)éj×Tv¦{ã+õ&1­ï /{UìéÎ¸2ëËsÛÉ|6ýç=@¢ÚðÝoú µ´zç«~¸ÔéjVkR¢sÜ6\\¢vä»CÝuËz~Iµç6zU0Y4loGnÎÐ­G55¶ãÔã7¬úQém1=}¨	Cí)* 	3î¸±M£ý·C¿D?k°Ú=MÝLÃC¤¼7z&V»AÊ£qPZ¿Üt'éPÕ {*ù/N ×óí%À®$ D\\Ã¡¾f/Üp¡n»?ES¥8hEKïP/cbbê57ô´À=M=}ZH. OUe-úg=JD0?9ø*1e4èyâQC\`=MpÇ}Þh\`gáU#ð/ÊúæÎ<@>î¦êÚÐkÔºÄñþ×òµÞgfB3¦y´<ýx¤ÏLðq}>ÒÄ,ãþà7Äko½pö§6;$=}ªZ"ÕË@)ä1H=MR=@"Pw­^ÕQ á®Ì¨t(ß°Síâ$þÄLökÀñ³æ\`.¢=J,G¬=@%/×¬dXÉÌáÔzÏÃ:P¢WËjW#6÷Õ"ûÅ±bÃÄjZ5°ðã¤W3Ê|8ÇÀÏÑ@~eçì;ù½wÄ¡¾6®1'ªóÛg~©_üÍA¥cv÷ÆiÓÉNZ¬bº¤´I¦dXð§-9H4ÛÈæ½þÝÀ(=}¦ì]áðx;5®Nq,Ü·wã¨dóu¬O<H(OæRtH4Û¾³mØâWFÈ2ú°YT²Lg¦2$d»./WJ ²1~Ç>Ìõ¯&/tÄÝÅP@HJ!HÀý²¯Õ=}þb«=M'Ü[óReW½£\`¤=M\`WÙ}ò¶ELYöo§ÃóeIpcv*´µêòriEýîw}@f#Ë¬opçÎI¤a"2¹é¹iJ2¸"icJ#ç~¤iM¸Z 9%=}4r²+9\\â	ÁÜâ>ÃJ)Ø¶[{T4±¶*2M!â?>[ÅA_#E<Hhk	4Eâô$:®à»@vlÝÙZ\\p\\H¹õ£	ÑsÝÂ6aXepòËJ6Ø)ø\\·_q*:vÜ	°¥iVíúN«pH¨b¤Ù8×7´Ðê¾JÊ°°j]ï[X¹²Ôñ%1zQî¼&úzg\`¦»@9Ëß-(¢Ír,	DVþWTðï£Ål)I3»wVÒiÕ¢äÓ{ÎC/cþ	Z*ÆwÏº$O{MÂ/ö]ÑÜë¢ÚH¦°×,YÇO·Ðóô#ÂFLª@çb.@nº[óõ¯oû<Qì°I=@¥P&óK¯ØN>×Ïïûjâshn""ÄSÇV¶«ºÄåÂ¡6ÄäC:ºb\\©³àM¢ªr(à2§¼R=@É\`¤_Bí¶h²ËÎd¾Mp¦Bø¡\`¡?Ntä5./=JS|ª­òÐ¡I]å×	£&i("id$!½|$ST.Váó§ÑêAnõÑWq5í\`´I²F®¥$q>XéôÔ!ÉúØ>Hè¹µ>SûõU´p¾S%ýzbéÎTKve²ó e~x]¦Ä#\\{òíÐÔTÐOÓ\\6i¢tqLH¼X,´ÜL¢å³¢ßDbÝñý;}C¿³ú¾7)7ùÉ¦_ë©v4YçMÔõ3å£{\`bW×¨z´Û@Zb]4ãNS*âfJ^XÂZS_Ò~3c*Î×Âj·ü/:n;,ªà r¨HV:ó}i2Û¹VN3°K*¼·G«µ~Ø1õ;Ó´ ±àòõ¨«U|¿@êBÖz|8ÿº´ÓîÑ" &9¦|5=}¾lEÀCMU#Ò=MY°âwÕV?ïJ=Mw®=}×à¡Ê"õö¾¢.|o;_3ø<<SgÔûÊ:U/ÎùÈ®ªóñÉúRËM1¨g5÷÷©Á=@¾,3(é¨\`\`è£é#îÌß=JiéØ­lvEÌq©}³ÅaÙ$^Ào%é¬wkö8vu¼|â¡1ß®ÉyN^F"W=MÅsÃîªÆy{h²ËócYòI55.õ¾WïÁ¡Î>Ú-ÃÔæ:½Ï7è¸â_åmXMï´%=@^QîºZ§õS©+ý@ñÂôP'Z#WÞÉ½Äe¾5¼¬ÎÃHÅÊÒ=J¥A>YH¤usOZq|ÿ+¶#^0uaOõÉÊº Oúã¦3åºð/þ*=JóäÓ*'·º<GWrEjd¥5¸=}Jñòðj×NAonÇ{´,^;­´×,þÊæõýn?)¸/HxÍTO=@uE@<Å\`2°n;ÿ:UþY=@ÓI=Mä£u±«ðù°æ5¨ÞõM­.HÕ£­Â¿róK54Ib&EK)×=@(ÄÏ3Z!]äÖ[9J°Vf.Ð=}nnñã-S_ù¡rvÁ×ÚO½=Jþ%7²ÒÊº½ÕéR¯\\«l¨ç.¬¡éFµVü¹$X5D·Qs$7=Mk:¨uÿ?)»ûºþ&éêvè¯êõj8&op*Ú~ÃªÒ¤ð·ÇRÝ³Ì8ô=M­Ó·fôÏ=@1±g<bQ®ÁâJÜ¤óoYU@èÈîY1ìëøä	jÔ7npôôÅ?u¶Ï=JkÍ8_ÚôUÓ<^«9ôÝAÎÛÉÿuÊTMáV¥ÔÎ¯Ù.oo#÷éº¥é¯a=@3YâXÀÕ&æL,@#»¬nPAuçú(®uç4mKÖùÿX](¯Ò6RÑ |5TRÌ vâÞT·d2ÿ{á"{|.X#ÖZYTã¬Zî5¥ºøåñdùùéU©p%ÿ5ë,â39¹â¥¦à~e^²O¶|àw8ô9¬ê£¯º8·õÁ0íÔ>ÉùªopBË|8g91ö=}z­Â·5sÂë¶&Nò£ðà­Ç²âü)£NôhASûBZ5gHÛfÄtÍÃp&mYq®òÍ BiÑO<<5ËÄñ»+}³(Êyªd·¾teã:Ë1Ýz4W^~ç®À¢lx=}îÆæ£¶Wóg[ÜÃPª!®OC4#þ¾8º¦IØàÃ;ÇÝ¾oTLÉ*m_ÎË]´_,Km^ÕmífròSí(½>¾ñÝ0­øø	m»·;W¹g3:i¼gºAëÞëµb¦úv´±å0ãb²°ï"q&§ò ¨"+ÙÝÖH17ß»(´>F {áþwY¿/Lªåúû÷þéµC²CÎN@¹]»ü¹#IDÅ6nDÛ?m¼0AéÂAÏù¯þ}Bs¸¢)RÍ´ÔiJ3Ø?°ÿ¸2¸Úf}ýâæÙ³ìEbÐubsõKÕÍgB|_!f8¬ÂÃHÔ¨{ß·ÃXoÐ5Î«;r¿²}Ïà½|õ>,îÒÆîé?ó>gØ¥Í»\\¦BÐû@åUó,è+qîa^M606¿»ýÀÆÁáNþ·7	lÑûZý³2,Ã_§ÃÜH+ª!ÀÁõ¬mä·TC7_mtâqâæ[µÍáìëðëîOÌõ¦ôOóº?)þîóz\\å³Àæ9á<²Uyë½lY_WÕÁäz"¼G5+¡^§k||ûâ®½»ìjéI(¼Q8	?©~#Ð$kä5­po4ªNf-Lf=Mh Éy¿¹ú5¢ÀA.lHcá$Uó=}hÉ¯:æ¹´h¢É)æ°í¤edªpãg~Xå=J]´#îNÇg¡¢«bß¯ÈõXÂÖá´¾#]ïØehÇ/©¢p/½ÎÉûË»hÙmO'h5K?B\`F»B»É¡ùÉAãC8!Ï/¡À¥'QÚYÎùä|=@_7vYãÊPRRÕ@ÌCD®¨u	ò	îoêÜlR«ó=@=J×2	ÔßÆ	.c^&~à®Úý8¨	üß>C!óRu5(åt)uÆËU÷ö|s(!Ì®FJÉÇ¥ó;t&Ç×´"½ÒÕ%ÕLÕò3°ÏºÜ,×µ¼®ÅgÜ¡T-6LªZ	»%¶­Y½q®té%°é+#d.×{ªÕ,h5õ]ÂVÝeO)1¯WY¼r#ì&ÜµtÓ~2DÁºSÈè"«-1¸¤3ÁÊô$ïÈ0uºý üÑ©¨úOeò-Ìã&gà®JzTú@9¼Þi×DDàë2=}.1u2 ÉûWýh\`qÂ5+Tæñ§~YjÅÛRrâY4²9¯s$}¤íKÅbëÅº6-Fýíàí\\ÆzR=J¥rPÅÎ*}ðg;y®¿@õö3ðY4ÀG>OÒâ\\Ç,ÑføéÂ÷~Y³;5ÓSeQª¡HBAJeÅOK4q³~¶¥Ì¡~ÁÒ'¼åi¢¨%ÀÜuÛäX£´ARâ_=}ó+l®#´@|WÎ9Â8\\+S-s8Ï¦³±#³-W®mü+,¯+1>b ÐA¤Ã-Zj¥/»¤µþnÝeÉÝe·Õ¶{â¼¯e{riÒ¦IÔågÁ´:Fâ"Æ	<$µÁ¦°h©Û¡zõ«'D%@ßÊà0[çBïÌP1v§CØòU\`Jv\`*è×µò6­Y}©­^14ñmë}#®H(üzÏ¶\\ãcæ9ìdå2¦Et¢óÑ­%v]!YW[Tv"#(¢¬=};"®=}!=}CKõÈ<|Û°TÉäèï]Ûj4öhÄ¥5\\ú;ïô{a=}²LLéCnM:ðîPml¥ÇpLYÒâ%ºk0Òá¸l²ZH+Ó&zEoÞªè¨Æ½­wî6o+ j¶Ûø#¬1Öáe6ÁÝJÒVªõ®^;âÓ_kãG+Æ÷¾mWõç£AV{èsT¬G@ÿNìË÷+9acõëa¸ÿ§öá$,¡ [RøZV0[ºQá6äíj'|V°6 R@-V¯*¦«îr¥¤«áiÈ5ÄÆYù@#¥&OPi!/ûAS"<õ´¬°ú7f2/74$aD7è£Z¢=Møßàßp6×QoÃIWZ0I]2òo@ðë eÖ A°Âvèã·Ê<³îÎ4JZSU]ò_à![-Ëñòp@ëFï×O[Òq©tä¦Il­º;óóÔ§\`xÝH£v£ñ¸$_M^Ýµ¾$ïYÐÁ\`Vjl5S#¸üH"bBKEìÒ¥I	z3ÔÍoA¦ð>kZ7ª	HÛÞ?aáU¨&w×¦laO)P¥¬xÖÛWæ÷Ê;[æ]j|É©@±Eðº¾ªéàÙÝÔÀ­Öè!}»xÁ{:f%>,ÕãÈõ©6©¬åä¡cN°\\ËÏÀø_¶:$¹¯	ÍBa§ö¬¦Ü¼ÛtØ	ÜâmmàeÂ·Í\\6EáF£Z,Dr¾éaÇ!¸Ä?lP±k®Z>f@ö tghKCuéÖ~]ÃêFG¦5øòØ¶§}Ó­Òl@T¸Ð.7 v[ß±¼YIhÆ>B³gÓMHO>´ÕO} ÷¶.áD<+ÌËÑyT3=}aÌÈö§áIã/KðÓm$tõ÷iÆñsôW]eiæËº1Óo¼}ù@,¬\\pI=@z>QbÇ§ÇÝùv£ìÄÊÊÿ·=}üÿ8N]&ç¡Èo$n¿IU§£ýÍH}¬ô&Ç©Äq@O)°iÁ %Þ­Qç;ÁO^y©2¯3Ù(B)R	¯±PP¢=}âp¼Â¦0i>£vo#) o6èáÏ½ÉÂè÷ÕðC'"¸õ4^Ki=}JòÑ_³µOÉÏ8DÊ=}ÎV@]ççíwöAYz ðäRôëaÅÀ²¹:tZ(èæ§Ú¥øRC¿¦[¦Aæ=}ì¬ãòê=J'²Ì]Â®sIMÑJµÉßç èö¨g<>hç|ËLáÚh³{­x,t+æúñ\\ÑYôÊÃbÁßúT4.x@TÑ±¬2®#wVuÍQ8~]È	(ñhl.ú¾6_ä 4S&]Wk^±HèsÚÜØ£Ç¹6Sýß~(É©=}$õ°=}ìI(äyÅ$òð£ûg%\`éíðÌZrs·²^t°ÊºY0¥1kpJ¼¬ovK/cxa4?/?¢OLíÆÙ(·Ò»;=}È|ÖF°Ú§¦\`U¼-/?¼ý	ÙëN¶¶Ü	!ÞÇM=}¬üUP)²·ÿÐNÊ~ãâPBÄ7~äæE>Ãrß<ÏËõ	cVÙ93:Ý	o/ÔU£[ÒuAÔ"ñu0*¥VÕu¨A=MUÛ=@¦È²W¾ï\\g¹¶È7ZYkm¾ºéhÆs3ßDXð3dK§±PÆNDÏ?9|&Éfå6éÿÌVItáLQDò;' ÷àS9Ï¨ *?Tå¸uØ§G1·è7÷¼Ê¢·°×ão-=J{{q+|§,ÿÅK½¡xäÄKZ¶Ý÷+óªgNáëÊ7îíÐræËäËkFeÙiO«ûøT×ÓáU»´Û¬»äpr¾&ÞC&d¥8CÇlvf¶MÌsn¾ð±Pz/%îpsèIS¯@«=@Ü»àªi¼}NÃãÃÞ¿/JGÑq@/÷M ª£¿äÖ3Íàé"8Ä¬ÒÏÏ½¡\\×u:ZÉP 8 Ä$c!s=@guhI©:Î1C(1oÃ¸Û[iPÏªo³Û#Nlrr)s±³ëo1@üQçVú¤ÅK{â -/Úásx SDPJø®$H=JëhKl¶Ás©Ó!&Ó9ÊLªíª®VEe¯Oæ¥TéB¤rÖë÷¢úAVUªù2%fQdcösÔ¡¹âíäì_#¦àUt&Þ5vl£ý_í=@+;SëYz	ÁZµ¿f´C%RìâeqÂ_%öê­j®µ/ª°ÎæÐ=@_h?vóþ©n8B$ ü@óñÄ¨/7<8êØõ\\²¡Æ@tÜ ­P¢Bhò-j%ÏÑ.ÚÐ9*ôÜ¥ê¾]MÀ=@=}&»qª±8¥=Jåäúë×2ÍE¨UH¦·²Y¸Yh¶¦tÔ+{iwBØR±«ZµyóFñËkD{§k»"ªîHã:¾O*<'ñÊøf=MÏÕ{Ä%lè#Öoj*Q?HKm°<À¶P¨iª<siâ@¡ý1&7b³èÃÿ´À<bj ã1=@û-¤hd^­£ mÝÃ?@E#=@.UÓ¸wÔ¯J|ÁW=Jpë&H6º0°~ÑaÂà1nÐPÍý£Ó¡z¼+¾MKXÓ#"-ãtXdöDòÃ1·x¹¾ê@]²c:1mÇ¯y^8UËG2 Ã=M¢ÀàHàGÞI£	©A¾«Ð¹¾7º7¬öaj"t-°:R.ÆvTanó>ÛØ#6N¡oÐ^jC1ÀXìj¾­m@4{1eßGzê½§;±frQó¯V#t"Üjï¸/Ø;]RÉ4­9{ðØ1Ì>ÿòX=@!f¯SHáeüv=JYÛoÎôþ77#:ô=JÓc§XUL>ÉæFùE*²y´!7N»ªû<=JõZ´3fÒùÒ:»_º},õ-¦(=@¤ÉF«¢6L°vF~¥ÞAêréïÊî(ÓI7O6­âc4C<UL¸ZÁfUrRRçý{KÌ²ÕH¤d´ÅÌ©Ãÿ+D<,Öð9¬^¬©ÃÈVl¤ÒÌO1âVÛ6U]û«rD<Ç";Ú¦q&Ç4h\`/sÇÖ.F§¿ÌÀFbÏÎ¦tüÜÃqÿ2#ÁõÖ: A\\ê¨àÚöÀ¥§Z° ÓrsúV{pìò~ór°:-®Ø®¬tÅ0Èlø¦õè]P+Ü?ÓØT$Ìgòr08øÎ.íÄ7«F¿ú	ÔÚvë¡^M4!É!Ïp?=JÊVMÌø	ÍXRD]O#	lUG#ú´óJK{-8í³Âõ7ÕÐK­­×m>ûðOÒ¢ßv=J_SØ7¥! Vúzó^-ãw+§¤	¶/ Ê%uÔ?Cä;ä§âà «T~µvø(½²0û²1È2Ø¹ðW¿¤àLã¶ÏÚàBw£Ì.àzà-¬Rû:ä5Á6m §93J'Õê³äÓY|1tdé1nøïdÆxÅUÊðÁæýëFéaBhÏw¶%eUªd^ÂÈÈerT}V¨ÅaTKuð¹?[I=J ìÄ.t=}'§JKærr9tå?õÎÎ*âe"\\üáÛv¨ÚYïâDÄcücáyUnËÛ~Uù´%wWØgQí;Ëïë|Ê|£×[=}m.Áá·Ód5ø­IÊuªà±Û:G­ôQÞFa^;'àwéë[08AX0°Øw=}ëÐÁáæ·¶æê9 Û°B°56ºàÐÊJQ"×)pvµ¹lû²\\Üææ"^ãªú%O\`ßúhyÆþ&¦no&À¤\\UÉ¾¶ûÅÄp¡wSì<º×Xq	í1ÿ($å*réÏ	=@wöàýwâýîÁq¦5>,YQÂkÖ²kw/E¦8Êæïå#ºýýFÿFßíî3=}ÇË¢¤=@:F=MOÀ!V\\du½e¦%­ñ´Ô¦O5=@hÓèæQÉËây?»G>¹b1#ÀY÷39E¢m|Ê½¦a¥ôF»>ÈÆû×=@F³ø=@qËdIíânwv\`ØhOåü]è\\XÍM"#»'¯E1¿8k=@ªuóaí´I£C¥ÏØ=Mt8Lrnèà³Ó@+iÎA|Î$¡år©ysÚ¥\\&%T¶¼êj!(ÖÛÅ»u=M´:=Mß¨Òø³FÜÉÇ¾æÔ­ÛçÔbO"ëÇª5[|ÁÒÒM=JùòvýñgYø^¼=}(â¹Ú&Ô'giusQeÔ²}%XßLí$Ò{²-OÃñæBü$àºÊMµÎ¿æÜ¥§=J­ê3|Xgü\\YU&µÀO/È¹À3-;jÎjFhYC¦H8©®s5­D¯Õ×ôóqõ¥o­ÇÚ¬M­´ûº_P¾K¾ä~H|ÞúIõPæ¼Nµ[h´WNÀQµC¹þyEµúÌã½tïî¹Ã9Ç÷Kn­gsTWn½kþªyJk+*ÀÀ$àÒÎ«s~±aü,åó"|È§xqQòú¢<´qF´ÂnÙøK¬Z)mãVYôî=@XÉBNMÄn9YkQ÷àûÐ::;\\ãã¿_í1W/ñyP08uVç¬è]U,_ðÓ}òöO=@}Î¼É{PÞÊëì×³}ù4íÃ¯jÞú/QKñú:¹Pg^&6K³6ìæ%>|Ò£o4ßÌC.I:TÛ~TL¸½vÿúÓqú¬@1~£3E7ßÇ7UBr8¯®wõ¦Á}ì¬ã%åy" 6ë¥Í¦,À'ú¹'üÊ÷2«M"q~+5°Ð§twè1w!Dó%½þOú5û<®úíhÇmãw&MÃ5§CýA[í±TYÔ|gÑÕC@J±®f:Fc½Vïßhd´RVùþÎ9ÛÚå¬|Aæa±¤_&z¨ ÖÜ4ÃÛuw\`DÉL1¾Àp§»dmDúç\\(ÞÌ}z(]³C¼=J4Q$²ýBßµEk"Ùáneþ ?Ròß¦÷(å\`g *ÓURÓ)ª[ºgP45âÒ³O~éu¤¼Ã[$x!ÅµÐDX´DaÞ?ÈÓÞã­AÙô_tGÛkú[ÒÛ\\ü'eú(É2ðÍrwÍï´î'n	+þ=@Z÷(MpÍóm*=}ÐPZ!J»ØnÉ9¥rÆÇ7p¹iÆî{ð3µÔÁ´4Xß%Ðµ³åVI¦:ÞXÖ3íPl£Ò¿ÆyåÛÃ~¸!8à­¿kÿIÇJóÞÏ/0X/b]©4æø¯å'6:UàÎÖ=@ÞKõY­ÿQkùÃ¥bPfñã_ð¹Wå"ý\`I(¶rTø¡¢µ°¤®Í"eúke¬'èÊ¤«}CÓMPð!«_^¬¹}\`1r¼éÃðP§¢@s]g:ñZ.³X/Ã¹"Ïìõê~-ûéÙÚÂzi¦LpÇ2=Jî¯¼=}É±Å~p>¡×¹>åvU¬mHdã½¹­Ý.­h=MtN¢EîÞæ«@M=JliçãêÅ×Ì]CLÙa=@¸eSVi¼ì8ªàÔ{\`$¬	æâu5Vç¦øVê}A1ºö§tJM³:_¸ôoÓÕmÇ¿©çlÕüø=JÆå>EÜzoIóÀd°³ÅÎ^®ÑiE÷ÊÁe¼Ñ °\`Ã^ãh¼Û3§m9nú=}P£#N|vè¦\\wõë¬W$çBæåLvV¼6ÜÔÇ},-IFÎµÆ©÷a9\`ð!§õÝg"o¶^höoV2Ô~þl6S­;¥þE=MY2¼µÐFô\\Uë÷&5ó¿¥¦VµÇ´&en»åÈo&$*Ü	'%l9iUÇeÕÀéÁ/hÞ!âÍØh!¦Aì(P®&ÅæÝé3h9¶K5©óBNT PóMÀqæXG8,»L§'qÜ´®²+ô.ÅÚææ#¶èRTÞû¥åé¤Ò¿ciÜ¯ÜÙLó÷­o¿}DÝû% ¦ÍeÅìÑgm§år¶ïzüL)4½,fW=M(ëk+X©5lÑa^é·ë]Y´~(=@Hë¬ZA£}Æsø±.\\«92ã #½Ûîq$97Üëûº\`7?+×8ã°È=@9x¯Uî®HFÑJÃÛÂu¿ÉAa¹=}_uçp&µÁ&99¤r/±´­EbF|­8±Dµk¤¢¿ZÃS8æÈ~¡.ªgúGÌÞHFAXÝ>z=@o¼¨åcoºQ¯_í\`íÚS':èZ¹í¶'<k4ùE"²Àö\\=JÌI¹$j?ßìãX"Ìâyô£&F8{fõlü4éEªu/2É JÂÌ×K6A°k"Uó$ê ñð]ôÌ_¨YFÝ&±RÐX9Ùpða\`I|÷ç¡*bM«Ur.ë&cõgAÂ¨kÏ=JAî½xH¬w¡ÖKcËÐì.%dPëI-nê¨yZ	þMøvñh«ùÍ@j\`ÿälÜpföl¢¿ã!9é§¥¨Fpõài´ÍT«0>[®äÖÊÛºÜàÔ=J%:ÛÎ2âðÐªK°0¬Xg¯¸ì¡ÛÎÚ~âÞö@ÔÏ*hóÃ(@;ÐúÕÐÜbqSáÊÌrÓù+FC½ë1'Ã^Î7Ä<"ý§ÜÊd)O¡%v¸AµÂÙ?ÌÎÊò)¿Ì¯9Á#0LQÚùgo"ù)LÂt¦f°iØPf|á)nÈü\\Á'ZÏqJóé!»( Àuñ«(á(9ÀCþY>Y'Än¨ôèðOx:4_/0¤L?¢Dâ&qvn"}	¤MÕ©ìq;Í!ßa"üÇ)ÐÆ(äÑsüAÿìÁö«Î¾ÎVÌ$&ÚóüÛÂV¾´S	ÿ¥lFá\`£æÑ]cfÚ	p'§f¤m	ò²+ô'×éë²©¯G¢a)NY«y¹)ïTERî4F=MÅ¢´ÅØ¦DÈ$ùÏL5§*0)ç½|ûCoËz4M¦æV¶USíoÐìv½ð|÷özáãI»  p,¥6·?:^üª®Í'	¿|¸ÕûY»mJ}ÃBKî¿èèQUíËBÖ6èRbvÎ8ÚÙç:«t_þ³>4ÒQQªyÄhd ×/²ÅcÝ­£lð¸áéub_@)G×W¹Ôî@Ø0ø=@CþÿnÕvOÊV@·,UÊo;6)© dd´EØ¸Þnd,s2KlºÊë3NOK¢<Jü.B¦ú=Jø=J­Ñ8BCBB' Óxòøå=@%ùá=@uüÑ¸õh¨Å\`òLÔ\`GZS°VûÂºÿË­;ò´X=@ùi\\~@¹ÔQð<_1´»ÿZ©É©¸&ýÖÀ³;;7VðÏÂn^®ïÅÛ:	(oÄq¬Õ÷ú:ówZöU[=@E7¿BøÉm¬ÎIÑáêT>­DO½Ü:Ì~dÐ×@dÌ´YôÝ©OºÞ(\`zBkü»÷¤¹dé3ÞªÀD­*«D³qì@þ³þ¼«R,-k(ÛYòë@ß±Bx=@4NèÊÞ|ÌÌ¿Ö@Ý\`wZ°lìLõµ=@ôÆ [k=J3~LI=}ú³óD=}\\ð®&ð.Ìl(¡Lñ\\P=@c¥vzEµ[k×Â e"¶Òïé½ÛÏµs.×ë þ=}\`¸Á1J»r02qºNê?ûty$hÂ@BC»XB.a¸P."ÏaÑJoX&wG«kôøË# PGöxÆGdÀbg}4r1H%µ°ùÅ¶ ´T'óxÜëp@ú+T}À»2bûü+Q»ÂìkãPb®_p*PÅ¯%T«l=}Õ»H<ã°¶úÖïm¬"Aýª£kâ ºeO?ýZÑ	NÜ®«}|}=J]2³Ö>ú³­jÀÐ+JzÜ»EÚÇ>=@Ðl*ÆÍ6~K0³:Ø:&³j/;vF»½à;%lõëÁå-Y[rDsPÂâ´å.Ê/P²³ØÓ3½rÕó¢®6dØÎ\\n5Ï'ê+¦BÝJBû­{>§ËE3£¬ii+Ä2ã¡¸HnS\\«ªFþvªGg²'g=}éA¸JqMN:R÷¤3\\;ððêHP×÷2B;Ãé1Qð lyÊû'R XZ%{L6IYoL%¯Pìµvpì:eP$õvxØEr«ë)ÂÁDÑH:õDgÇú]_QÄ³6¬¥S|LÞä½Sg_n4~îÈnµôõ½Y0	)_(hRqËIsÍé¸Bû,Í«pÖÊqòbÒ4'kVr$«mªó>5÷c\\OI²jõXJ=}nFbÄñ=}CHPßB/:¤Û\`+î)úî2¼°zNpÇKC¬Nvs¼M5ºÌ8×,èì¤AFl°9×]³}U.ÍÚÓÔ ï'Ru«4Ï Ä=MÀªt@N2÷':DhºbÚB^ÄÐ.TtDþ9ö_W:æþ¹¢;^³Z¡®byLsQþinLBhjñÚEÊ.c2|jF¹¯c0ðÜOA×i ,;<Ìõ¨½²I«RÿFaîÕ0¤ÿ_rÅÜ®Ëj¦l^LÑÝà=}·rw¾×sÊAU»FQµ=M3Ûì3÷»¸uN[ñJÚ0ý7·ab-E§X¸?80.\\ÁJÏ¦Í3N7!pÛÎîÂ39zªKæÚNë+7Dv×0¬&0¼£¶xVÄ[l~yF£yÅhêÒøFHjz..t2kÖ#×åø:hËz9O:8òÇ/py4®Õu°Â'õR±®e..:L~UÒê ÝÝÊlµP±ØhiÂVÊ¤Ö-ÖskrL³¼*P¾72Æ/TÃêMÚ7×I&°=@GÊÖì7Òv®»<·¹;½dJ$µ&!jÿ^^£³L@Ríþç$¹pð®iM§ÚUXíÖRckú;¢=@X·QÕá3î-ÄÒ¶x6Í|Á6Y-¨1\\£Rá1#xñÝân¬ ¸öd<ßSTüÎÎ¯=MD­ZÞ:Ê=MÏK+ÉLû:ÉÿvÉ;«6g9øz¬¦d,Ý¹µSBÕóÀ&{j	^¤÷=MOä e¢uÂÒµÉg¶ÅÍ¥6ñ©!àYPº'h'àéyiÝÉÈ=M=@û]öi¯þþ¶½mwÎ·dº[òdu3úR]°Q¾Yæ9®·ª1Ës²È:²KE¶4¸eËµMtºXmªÌ2åpLJ_«ãkR©:øÿð9n²Y­ù¨8¯$Öï1|§\\FûêÕ0z-d§.Ê¿--«ªÙt$Äìo6"t0Aì°î\`7¶Ayzl¬!xïèÍALl)J]îBÓ*÷L_N­$«1Z©¼±üVÔ¹llYiÀÀj;î;÷V6äÍÄÁ¡lî\\þ8[$5¬Âm±E®­ébH=J^µ¦¸Ä%«mË(½4?Þö³f³?ã4c<µ?1dü\\êüweûñUPÓïÂëqËo¬RN>¸¸ ÌoM¹ÌC®»µz\\¾=M0WþÎp´£Äçà5tKê-ÊàeLkÇO¹ªÐ-FÓ;zAr uWÞH»HÞæ<ªEÓôlauæxeCÇ{©­McÌv¼ªd¹Úx/Lñïª:JfÑHþ¿w2-VÞ>^²ÌlÐü²üÖ=M±5xeØÏDo8mküRw@13ü~ºr30Â=Jª=JÐý»åÐj´4=M@é^ùó9ó¸¹NX¬Úh³n/¬ò°Ñud3zån|¾JIN×¯í{d~9\\²ÑZXÌ´TúòO^iüoÐÈï¦,R®=@[®l0TA8H¤Z/(ß,~wMxZÝnù3óG^çÒ]+®o­ÒÍ4\`­8¥_\\[?Ag»ÿ-ìV'\\5þE¢îÿ'Z½«É×ÆDTûb½ìF=@Ê\`ÀJ[°ó·mcòòZA¼éj7O°àÍÅëã®º)÷R©÷¿@/´Sh¬PÀJûÂºp<÷5LïMÿx+ªC_ÍD'gH(qOÜ³wNg;à]b¥V[DïäÏñÛ\`\`#_&9A×ÛÒ6èZG\\	ri¸ûZÍð=}í\\,Ü@[TÝ~­Þn\`¼°°ÎPÐ1Î#¾où÷·Ô0\\°ý|{Î&ÎÕÆýÑ÷6üÏîZ{Ý¾=}®q»Ìp±ÅqÚv¼_ëyÔÁéº7_é°Ú3óÞH:0Õu}h¶:ït­»¤a%´BëÂqJEJ{/8Mî_2Î¹³$å}Jdnf-[ÿ¸Vî+?µxöø¾¿¸ìÇgUëhUU#<"F[:r+Öl:TVU£Öû:E³'ÄîpScÈýÚ*÷ÕßÎGu­ ,F²ñ6ÌùrÙÅv+( -=@äêRvMö(,.Z7½bÁ"P>×u«ÜXÜ<ý­®û±1êKë74Úh<»2Ükåszl0%we6·e2x\\amVÒ»XÑsqhÞÈÑ[ÞÈ=}ôîAP¸L°¼jÕ=}'R>Ã*­>ÕgÙî½$û/¨ÞS+l]z±©}GÄÝ÷¾¼7OMD¹ò«;¬@-&JÖ;ú®*Bo\\Ê lP®*´ö{éhö âàX9PÙ×lâ®záZk/ý±R¢Oë¾w5¸0i¢^¨Ó¬¢ä.¡püßxýü7ÉøbÚÈ2\\a-pÖ¡&OÞ°VâDÅ^éP&%ï7áêTòmä$»=JÁG¦*}Ä$1ï	Ü­*Û­Üy Q1b¦b³}[caÌ©=Mù2öËV7b&yFMK=M>üA¥8^rÚz8'M1öéÖ]F|2hxm	L¦þÖÿ¶¸&,Â1uóë+2s%K¾pê0ìr*<÷ÖÀûâ ~:áð' ®ÓúdÌEÃ*Ñ¬ª4w3¸rø£rö¤ÆC|Ô0·­j1aÑ#=J>ö½#KbU=@ë,âLî¯~ÒN¦ÑdjmÚof²Kú|®D/^n2Il=J9<.~×Çj{å¸OõéIØ³Ëm¹=}âxGÕïo<´3\\¼ßp²êùl=@ëÔ=J8¶ßx*ì´}\\²MA\`/:çd?oQ§¥ÇKåÖÊîîKq­3Ç¾õssÀzË¹WÙÑôaØÔÆ.õÔ:Zñjªa>XóÁÀ),uLª¡À;Ä½éóÝhòg/§¾,lVzÒ=}¿qûÉÛsKØÌ17sÓhWk§mxû"ó)¼OOSuZ"zI<Í*ØÖ3_½\\'»O<ùôq}ZÝ¶?·'Iã|¼)á÷øï&iÜëÄÓmÎn=@û½@.Ä=MÐÞúú=J¢nNcô[¾)\`º/wÔOy) ý[²À«FMÄéÎ¶Ï{ó­ð¹«%P}dq2á=@®¿Õ-ÚÆL6=};Àçf4kÆ0oìì@þa°ÄúßÝo.ÄÚ=JÖ<EuÆîf^×±µ=}Á¥õ4HÔ§«ûzÓs¬nàÞÅ3K ËkX)$8l¤¿¿OÓ2ZÐËrÖÊãjOy£)\`/óð;]î¥:=Mâ:£lÎÛvM£P__$LmçßÈxòÖÄ8Ë¸D¹PÐz--W/U{dUr7r]jM¯£û¼[RM.oñ9LÓ¶fþ¶Yâ×¼j¥<ÓÝ¸£.\\êylV­O=@2FÞ®æBù):ØSÊØþ«dÞ(-.ã+ö=}ö¦KzØ·¤ì¬·qÐ¬uØ#­úPA=@N4ÊUÑ=}9S¼-°mf;Á.Z"sRüÐIÁÊòú=J<¾Ûý9âhlä±d·®°ßén®½*EAPJ6Þ7ª<J7|Uúbº®rSÎGDÚ4÷X²¬QÈÜNMf¤<=}eÀGù¸=}Uò+s\`«p&mÅe[k+mÑ[j¯0²9duk·TNñ¬·)aX?×0°âã¼¶­¸2J~Ev=J1=MZ0mâNÖÛRìjÛÌ»¬²+Ï<[;5[.×ó9Û+ïú¦Ö=Mu|/²õ»¡&P,ï®Lé¸ÃuY3Ë<ÐS®tÚÁ-mÊÐoØb*ý®PZ «2Eçs\`ËÊg.àUúæ_¸Ñ:«NÍ$-mØ3¤V/QRä9jn?Å®wæ*0Ws¦7n´4w±ëMAÀÔJ.³Ñ4[7^<[Òsm=J.wÒ½vpÂ0±BÓ3®w-®L¬nä¸ó=M,ÿú¬ð2+ÉÏ Ð¯8nåëE8øû,p*glçJNi¢TQÄHvÚ°{5{å3®|lJínY»ê´0yxº4»-ül5Ob×ì^F÷´ümæwGÒ»4>1Å¶<ºAÆªó¢>6Z´â2{,úlzqÆ¯¡*D³Îª±=}A7>{¢?¬M×Ø j¬YÈ:ï<Ò5-%êZ*Âv\`Ó¾l;T<3>#ÅêD1=@5»ÌeC:ñeÒgÊêD·BPký3LH¬7ø6ë1âÅYa¦Ê[ÔrÛZøWNP¸åÐÎÍ«ú=}íÌA&ÞôêAOýÀ5AÎ±ô«®ÿ¹Ñ}¬Ð?¬c¤èÒvìn;«¨µB¯ô:ni·CU-¢éïÀ'0'@~U¦·Õ4{|S,E°FëÿÁvFfóÕ;Õ®à,<dÄ^&>Cmy*0e =}sßqÊ	L0FôúäN5×zLäWÞ¹ué_IºNÍöX>J²¤ü4/[ÔçzÞëªBûüôsvþFXòZ¯+. 2ÖÝ&sKÇy_ÂN JÕl=Mþ~½m\\6ë¬ZÙ¼ÛõkkÀ=Mâ^3ý!N²jeõ\\n]4Y¤*QµP·ËÇx>w¢·ý*ü[AØÃ³·Ébí(íC&aRD½è\`®ÕKIËªyL\\×Ø,=@8RmÝ§þB¶À÷¦3xXàG9z²ª]o(	j±Ýå¤Aî¡ë¨nÄîì¯Är®I©jþú{9P¿RD+G+ës´^ªâþèl_M¢Jª?¿X¾=}úùM-6<Äoí>»VÞI5q!©al®LDQÌå¼(;9õR0=JYpiïü«¯éÂr)>98hSp<'+j#io]û°üI©¸0Ì>-gn,Þ©¶Ðo­4¥)F·n ²«.¡ÉÍë	Eïw©l)cÄá@×e'«ioõ×ov©´'^bÏBy"iqõÍo­câé)FWÙ@×c'«WioõÑov©L)cD:³Rp§$-}þ©´@¬ýMþÐiÿóº|ný=@P%æëwñ©u«K7Ü¦>õ<28L>Zá L>_ Ú§æÈ©ÆDÌ7)=Mö:w"ÉQ°ì)fYn=}(KÄiy5û®)£~)Ð/=@À)n(¡ýÌ©aWô(ñK0uâ§&	GVlrL8¸ì­Wi°vV¾3À£y5x=M²8#Íù:=}0ö?Whn¬¬;pM20ó!ïaùiLb;=Jþ ILb;([¬kµ#ñ2PW¬!ipûL"(.aWl©¶jr&u.åM{O3³q¹0.O²k#Yû_QÓÝ³2([,cÑÎ«"¹;ÆÞ2?)[,«Æû=J%ñ2PW¬Í%	oûL>%ñ2®ì)BëË)\\ÐßõcÐ)ö	¹ZÍ8Ý²31Ó?b>îõO,êB;%ýxtH'®1ìrb7çp3zDlÍ% ¡ëÖñÛ@ÄMòVk­f=}*;<ø{óAº>Ð5Ô*Dy&OàEXæ¬\\ýÞãòÕ,Lºí5ºÎ²ùJª:eÅ³õk,$\`î¿vkÆÖ^i+!N8mbñ0ç ®xäì3"IÎ çÂ§.qRÂõ[´i5Ác]³¥¸âP|XhjkMâ	fþ´÷ ´ÅnWí3àçéÆÝFN¬ö¬3ý3Ë*éZÇ«ýx´§°èLoL·»ÎçKµa=J¤Q2épz:Ýµ:Ä{ôÅ	%,ë¡=}3:â,qBc&ItMÞõsÈ5ê%ËÝÄ6ý¨7¯¬f²<ÖYN¯[Öúõ®Ê|:­û³F¨µE^	¨â?¼qÆI4m¬Lt&dRD:Òó$"ñùi¨()sB_ªC¬NÚu¯U3rÆÖ*©JyMb_z>¬Yí°r¶¥âc·ëî:ï=J³ýû	&³6¨æ=J=MÙKHª¯µý2G­¼+Wµ§ïµ3ÝÆ=}¹®ò=}ÇÝFîms&:ë:ÑÁ@êà¯ã"m$+¾~6aãî=M\`dQ3V¢¤È_îã'?ÁÛüûÉð7ÂL¾7ÃJâ38C@ÕkýN@çÉàj^(~®¤´Q|22SVáq=@6kDõ*vLZ«pi+Â»	×ûë,þwâ³9<$hBn¤þº7=JD§=@lÐÂâOþg[,ÉwR:fW=@®o0\\ëª,ø¹jú8y%­^?8÷QÚê¸ÿÎ®\\åpÓv:¿°T±Ôæ¸êÕuÚæ~Wy$Kôséäjiµû/NZíÎ;Ö¾ª«@-Ò'°mq7D?Æ~¡¬?¬A¡wr-wPËlá=}\\BTJZë;Ä:P_8³;£L±¦z$ª}=M.KIywÊgÌß370°6ô}ý É=}6³8«kÿnsÌµ°¾³ºt2\`B?þ½:t~zv6|m÷DÝlê.±©Î^+½:OËøit¾²Ák¶é<=@Ö òr½OûØìV|r»Y2ü5<{Ø=JmÀn² ;:rðºÕ:º:£Ëv	u^KBË3B$Ä=@Dø2éb©N^z¯\\åbÐýî#w¿Ã¯Ð3Ðóa3	ÃÖ½Emâ:I;=J¥2÷^VCºaArè ²z1>Ø§+Ip<.9\\Ë{lè>n&<o¬í!I®ª®kà§0HØº{C2zrt®VºZ¬é ol]ðúÈ¤µ¨;¹çÝHÌ9Bõs=@áÖñÄmf $UÛñú¹gßñ*¼)dþ_ÚÍÈFäáCä9:¯-£åÒ>#&¢õqEsóÑÆ9¹þv»*¨l)z.Ñup¬åyp00Å,½p6>JFÑ3*,¬p´:2B^:Î½ÝBªÀ*vmÃÜã&Þ=}z	+î4uÃSd.8NÚË®¢«9üp7zCÚõÛ!§Zv$O8+>øëêYì:#ªðCEÍ-®Î«Ùf.Êµýhp/èz=JõE,ÈZ=@îÁ¯jGsm"8O¸Fc³=}¸ãõ64éU\\´°¢°:/k¯=@1¸ÖÀê¯_,#+\\ó=JU¬(lVi%îõ<æ±µZq#[²v0°ä\`)\`;îèñ2SVÀFºíù¾[ÇÖÚ·I/·Ù.»ª\`¢Oú0¹à&¢&B}HÙêcKg5ë]¥§mÞÏ³Ú'j¼¤w®a×ó»J¼Ð¿]¥³J@QC=@oþ1çe¨L×êÆ$6È>æM^Tp´?MÔúàju?C6ûA 0\\LÍU¦ò´G­®k0KÏwpd\`6Ì¥,=}].rñ	2{êT½öt14ÒL=}ÒVÃÃ³ûSú¼Òü¿ÂÌBkªèËãíHH ª:oJ· á.#ì¡Zè-=JÆªp $Á¦Äp´Â¸ ,flÅ¿%+_¯èIv§÷Müó®Çw=}º0pEäJZ«Ñö@*èjým]F6«¨DkK_ÚLT9býþ«BÊÚGòuµÝÃH 6Þå8©Ì¹0UH®õ\\¸ë=JÐSï7»uôçUm^³2½e5d}îÚµùóuP=@;T6à/ÖÃf|Í%%=@¯wHÒ=}Ò}k¬]EK«\`&Ã»0iÃ ÷Fàq¸Nã»×ÑhsJúënLÆ;Mx¨lx|%²{b=}MÓ°óì2õwÖ¹cr³'mS¨D×ÉÝ÷*ÁM\`öh3µÞff«}vi%Ô!éAôi4oS­.îÚ®í6·4þ2hk·»¤ÆG¥ñ=MÊ-ak03®<¬2ôÉ§ªûÖPýÜ¤M{À}£N.Â(CV{UÄÄtàs¹1ÎZkZ ?§lòTOº@Ó=Mc÷,ÞµÊîõM|jÇÝ	.ØÍ¢=}=@J¼ÓúêèY5=}CsN¶°:w2Ñ÷dQ"h7:@@ÔFöW=@w·n´;Ní>rÎï° ±à@=JåÐ×S¦ÇÒIy7ð¶«Úu¤°DÁì35¸!ÿxÅ~^wN@2ù¡k°^¤®7L8ä ðßZiNúÊ<Dó,óÖ³Ò6è=}qMõIòb¯y¢âáåZòTX3©a0Ëº·Ý©~k£u5oÿ)m?4Ô	Êlô×Êò7HæV¼Â:0ÜhP¡¦9ü7î¦ÐYFLP²k´lîÆ'Öj­àæÇ@Zgî«ÀJ~N1¸ýmFóOÊ¸ú^ýmÆ2RµÎ£âÈHÖ£=Jìk±ÚÞnd=J4ÐÑÌc,ùx/BVüÈ4^iïø~ò2ÓBl¶c}Ë&ÎÌOÄÇ´Àø~Þ~êöôÃ´À TÌÓ³´~jRzÕlc¯~£ÕqGËûÊ»þ30oÐw§¯ø¿Úè¸;øâG_O5ýð ªrUw§î³d6c}¦ÚÓ	\\Ïx+'uSf<¦K§zyakl{>L½ë@;þÊ.ÉZü«yK~uÜË16=@:9ÔÏM~cgî½3çyäÞv9æÞ­$üÆMG1ÝÇ¿´1~WâÞÑ³üÈ´eë0\\T0W?m²yø~Úávou^e?WûÆÓâ*EGÓâ®êòRîeU?IRÙrOÁâöxïR?²MÊ//O£ö\\2b®ý1^bÞáZ03Ýð¾LÀqÛáÌgù)Ø?£¤£58¢ªÁ°VßV®¿ñfq@è©ùl"M5»@ÚCÍVòÓ@+]â)»\`ÏÖÏU4Kf£]>èh^éÐÚêdqWë/¬ï_´ úØ7Xß5=}vWDm¾.±ï;iõkZÊ®Öán'y%;Â¬§an Ü3'áVmâÐ¯~È2è;æ´ÚLòQys59ìÈý:eÖi¶¦Ë5.ê,6$a'óA"9X@rÇI´&8¬¨LÃÝú=Mð|x°®¶¦^ló<îÐrÜv0ØOslB<8Aþ@ª/3û=}"¾=JvÇ´3}UpÒtð¿âV×º­B+ÒYbyl÷~T¼úõ; PÄEÂJÞ½¹.ñBÎÀA à. KÁ5à¼ësïø ¸»Ý·W÷!.+k ºcÇÍ1{m2_oI4±Úù·Ñ]gGúþD5@\`ÿÜ_/[?Ë3}zu >iîR&ê¦M~ðÖ¢-hÄËÀ@/o9ß/CtéÈí)dëú»!±½p ¸Q¨2ËSsÕäºèÁÐ)ÕH0MGMÞm0Wbã½¤TeVl³zÕìÒñf4÷À¡	ÞïPY´¯²Bf,_Wa% rLÜ7]Öv®Ýsm4ê4Ë®XÞÚq%a7ôói¸ ®½Kmå/íZÚÅ°²UqÓÁ/G{¹Â\`ìÍH2ç52¥D4A]:äö¬qr2=}ìÚ=@ëyâ÷QwvÇÿM0NàdjNc;û51]\\×=JáôÓ'DoýK¼x)$>Tq õB~ÇÖÓóº.)ðÁð8uðÄMB©³ý:	^L{à.0Óø.ï[0VÛèÊ°öÓCy\`iÀ3ôÔ³xKÚH+UÇ¤rÞ§w?~ÄNdÇ¾¸Ýß=Mò'ÉÕóeÒôPªñ\\CWLÚ×«=JYÏ­^÷ÙæÄBK8,vmJNº£Þ+=}ü4ØáSµ3÷zêÜÂ3mËÌÕwA(4d_r)pºù¼rL¦Y'Ú§û²ÊÎÁHdIÌ¬ò3@Ç«sw7¶D+û¸Ç2L^.sr?èÎp2ï ~tsÚg<þ_ 4»÷9XbºTóº³þîtâJzð&#6m\\AÖîøö´V>N3ÿo¹Rð÷küó¤úDáFÖN·+T¾ÇÝçû¶/1«¦%ëÊX²æ2/#µSRÈ°yGl&îøTÈLÒ þÊgW6Ù"T@¼ävYYêYºJ=@+zÚ]yRÁÔORÙâSï*ÛÉMb3Ê±ouÛrHn9AûGlºmÍæÌ>\\tD!úú>ëUyÎ  oæÇÍf?ßb£{HéJ×ÎUy SÁ6(¾ò'@;cL¤)¥¼	¦[U22w8öwöl@QGÜYoó¯¤w±a:&\\®ÏY	ºªK#z05ëÃ¬£°­@ùeN	º$<¬­ôIbgNnþæ[-0/ö:­^3Ä0574ÆK±ßIÒ/òjCyoå«ßIL$~9Üµõ«?×wL7Ð°Æ}5*±$Êú«{+K=J³<ÂA¢br>a¦ò:Úyâ-söoRµ_/ZÙÚ¯ë«·ÀZL ËÆræØn%;Ú*_;$<À5Büþ,+Ê â¯¨0yq³´­>¬ÿL,«F¼ÐKI13ÄXNiSN¯º,²ÂEd°åJmäÂHc®®K»Ko/BÜU£zÈ^D-T¤RRRZ·ædY=JÊ5ÎëylBXú«ìþ3*¨Ë ùDñ8øIL¬!@'{RÒ2Ï×c/o>ØÑ¢Ôë3	qVo~r~WAwrA:àÍmæÞ?~&ãaJx¸ÒA=MûnÐQÂèû·îÌ?ØGÔ{ÁvjÈ,ÆMåýÚl±êdÀ=@oÛ7x~b#G=}G«ü¤w]b&û]úlÅkÏBå|rÒ1ÈBK²?^gNé0wLjÎjwÍîö6^DÒâò]gN Ìµ|Ó¯æûÐþÇÂ=J]ZáïÛkîªBO9Â)JfË¯Zm®Î=@+½WQ27=Jß8\`ü :H§Jd@Öúé+u¸XÏX:<ëk=M¦Àoi«7ÁF+ÑvÇjÒô}L×Ò³¢lTj-BÒ#£Go¨ÜÞópú;½:g=MÓû-ø ¨Íw>?±:¬éQ×¢ùÍ¿Eáíê´î«ÅÐ÷/òKûR@·-RIvvPöW[¬2d»òA~;;öhçîkçÚ@ûhçúõµ|Gl´Ï³dígÞ²,u´²¸.7wyìß»~TwEÏß]¥CnVµªÖb¯-ÝÆ½>{¨vü&ÂÎj¾WÄ0Îû<âX*6^jcÁëokÖÈÄKRfK³&¢c7§JÒJnH/Zp&¬¬ýZÐlQµARiM-bïÆ¸ÄÑK¤ãzC×ï\\ÊJ/î:]*ÀãÚ§¶$ÍÎ²EN´Å93K96t·=@§Dý£¬ºF&|K4cùuC$Cü nõ87324=@=}9U²§DµöÕo% x©RÎmÃ×àv$ìØ¶~ .2á£5bÀ.NM¢R;+&°Â$né|lZDÝ§8&§ÛcíF´¸­D\`dâ{ ]I÷ÇÇQòa®¿=MÃ¯ñn|5ø1g§|º²{¾D²_Gî{áH2r%=@È½J»2ðbqëò¨>ÌGbò­8F¨ADfzkvÌÌª+jR"IrGÓ?.Q^-4_Ãvn2z³øúZC«O-ðR.}MÒ¤«{R{N4@*m/_<sNòvñU.q¸Ä8¤p×¢ÔGÿ,H«{u32QÕ5ým2°27vòOºãÊðÝ¤nF&r@Æ<ÔqéÜáSWBÞÔn±tü:¬ÌÅBmeG_]¼²½ÐGBx&²ïvZlúz´FÚTQK­Møï^}7bü+¿2Ù½!/¤mð±>#5+lnM<d½DÛk3ÿ,º/:ºð´;Ï-Yë²¿ÿ8Cx-}Ö,"â¦ôüÎµî¨8	@¬=J(Å£»¢¹¸»3©¤ù¨Ós°_¯Ï?ØR2©Ìv L\\åZYú|ÏT,ååòåUm<¯¼.Fz=JÍñä)×²öúrl@³5 ; ¶ÌÞ=}éªJQ÷»| =M5û;Ü(ÊÏÃ2!BUã§üà§ë©óè<mYQÞâO$½.qþÉ)Q)×Â¦pPr¬HjJ·QVØ¬{®SJ¦ý4X02¡îë:®¦.ìâ@5ÓJçjê³­]ó_ýtFvsÉuº'/j2ÄªP+ùóç?ðRÃûeá<ÿ¢ÞÆV¢ÙL°ådÌ^d6RÇúDí<Iø,1ÇmÜ»PÍCXIÓöÄ¡OÕwGå=@54èæjjûÂB3ÄOEnà;Õ@:9ó£r;wòÔØäö?EÁÝò¯ V7ôäYú§Ìç¶ò-Âdì'xÉ#:|G_?ÛIÊjB/cî¼ÉðëòÛ²4ûe^0/&W;RFÿlf:þlÎß0b;±k=Mã2=M»Yðµ]åÖ©~¶\`6Ôª§[øÙ:(¹>ï*ú¥Üc<L-hìú;BWO+âÉ]_vùs±÷pÎÔç)çÆZÁÜ)Þù>×¦=JÀµîÞÎ=J_ÂØ(dZA¬JÂÍ5^WgBxªûp8ÓO{4wFtê8øÁ=}²FEòð=Jý»­rò<KØrùu">7ú*ò2Kæø;G)u´lÇM¤¯)_¤/+ÏÄ?2Ê)SØPÇÐãTZ¸n+ÿmZ8ïÝýøI-2ÒçPB÷º5!Á°,BÆm=}ÌÓ-#6B2/bwz2XÊ[G{4Ã=Jû¬T°Ì»vxð3­ÇzóÖ8¾F¦óegên:&Nååq}w\\WMºi¶u¯N@gÕ#=M%¤áéûx,ðÏÃFH´O´\\<¤ðÄD6?z=M3¿bLñV:µ¬YK=MÐ*yå3æ=@Oh7=MkWJß¿ïW­Ý+îÍ^¬.©J_A¡«ªs¡K\\In\`=M QQ"xÒh´å*ÿ|ªðóé5+äu\\L&ótaÉçvº=Mºßãg	ÖË8?ä¿âòtÅl¯t_¿ö¯|ÝÑ*R|W/"0ÜÛñót+hÖÆÖXWäÏJ&c4öõ%¬Â½èªb¿ýTèéµ+ríjú09s²GrÚa/U:BÛöä»Wª¯ÊòäéN·7åc3³©ö »øÎçÊÓÚWÈ\`@ò°síõÌÝAKU}û¤6=}Þ¦^#Ùz4álý+ö¬9U*¾s<ÎÓj.òî®ôK9ÞoùØdRpîb¾KèÚ<YñÓ¸éÐikÈ¯[Î·_nyó¨Ð¶îFJÇû0ÎÂks:×=J»ªS¼q=Mªöx3ñATQ7»KÕ¼g¿5ÚÞ ð¥@þÒØQ?õ=@	oE¶J÷qïOJË(KÞpr#s2Blâ@e´Ð#®ò%uztüe¼Sÿù¡2<XSËsi®È´òYßø®×(ûØßÍã/!{}³à¸ÞÝ£LÜG<ëäµú×ã2üF¦||à¾´sQ;Ä¶àÐz«]oµÔ?ùaø|cÄè,ìs)_d26¤×V~H¥­:Ìû+º>ÏoêsÿwåÎ}SkuFWô3Xq¶Òq¸vÝDùßÒSZ\\¸µÚÂÂo±b@q¿²²\`á½a¬Øë"è´ÐÍÉÜsâRËª¾>ÌÍBOF|è30MB{Äe5fKK¿®¢³<¬h¿FY«îp.÷~y×ÕZ<[*ïîX|C'=}Ì;¶²oïÞÈ;§àÿgå3Owþõ¸vR9Öï ¸JÏåÐÈ áø@<±$Éó¯p@.äÍV újp+Ö´<zùýK;Ï=@¼X¹ ë5në³Â2Ñ³;ÅÖ·âyUîfw¦o°°\\fLÑd/Ì³N5LÏêøãVÛûg%hYÞ,3ñ}@«ì1I­Ç­.ó»f¾tê¬üÊ#s§H²ûO®taËªÎ6"NI.bæ\\jÌüþ±½þ±[vfîôO9üÊØ2ïªøò.wjÄþQÍ.DZË^µG2®b6îÜê³+<_4m­«¬A®ú!~ã,ø½°ÇÅ±j¾jÊUÓóÚSÓd^ÚÝoL1ÇP-ÁÚøºIBöR<Sµ³c2D.æ6K,à"Å*gp NìÏXó°ûüæo)2>äüþdN =}´dvn LRÏÏ.û«ëû%ü+ö7*ÉTÐÔ0¼ áÔ£gc û\`4çÊ¼µCFMD=}992é£Í*Aöjª¥Ì?râ¡s¢ª1~ÀY1·2nJ39PSµ=MÑÏ_æzl¸:Fûª^!I®b ÕÞï3Xf4g=@Äþz|ÿÃi$qDtÈÒY{6ó\${>-ÆÄeO×%,×¼ï2JOqZ*4ÃR³'în½3£±=@L¸=@OÑZ:erÑßÌ¥/<Y³¨ýj+Ä L1ª3355ÎÀjOcÁÊêW¬X=@¦Rt×sQD+¬DL	 ¼7X.æz]=M9ÓÞ4©/z!=}¹§ï%XNA¬UÆMêP2x812ÜÁì=@kâ­Û$ï<V¤ÏbwÏ+Þ%Ë5\\{ôE0HÆO,ñ2cú£Oö{&vLâi\\ÐOÅSìËÙ®Ûvd¬îMÑc°zmKQPDÒaK81knÕ_µ3 ,Ow3\\\`dH¬0 Ôo@~Êo'TucÖ4*+9¬ö«ròSr·ìµ¬»%cð³êéÛV²½6ë:¬8ÌQ»ÃÎ¼+=JJJ&§<nKêêÐA­fW/Ëxþ¾ÿÙYã²µýS¬,èo¾?*húBØ®sCìÇbß:³CøZI:p.4SzóË7}E,Þ>¼¥½97}lÞË5@!JÚx¬LxÓÎb/M^Û¬H¾"RáùdË kÈ®é­nlì«J©,'»P»:þìzÏEG<ÌMjÊ+Åq,Í'nýú*î§©·	UÂFÎ¥+6«hÕGuÛ¬ðæ.úwÀåDÄÞì­F7®Â?R¤îdN	^ºÁ\`¨òN7F~MS3¦§2j.h~ÓkÈ®øÑúÜiÚÈ;xR*¯¿·âyíHI[¯=}qRkÌj,r¸G0¼rMÒ=}hër¬ý~}¦¥FË×s»FxÔR½>kìÍÊ=}fkjÃê7¶lü0ÅfeIeI+¾fµkOl'óÍ:¼A,¬ìA:} õelY<Kî©Ê»wªÐn4¥ýh~Ò½·T}Íz/KÎý.Fn Ó,ÇTt)	Ëk°ÿ>èm­èÏpB3²®PK££\`íP«Eb².xÏ^Í*+n ¢²M5?«ReQþª·5úðîc.R±Å0NrÊ·rn	î\`´{µKóq¥Õg1ËÏn÷9HÊòkøô«>Eó<!oPp»Ï¿@Ì{ó2,ñbäÖvJ8Ýl>ü)Èµe)áã:¦çgAR®¬=@°^Áed?õ:z©2ú~ÏÇx®ÓÄzä;e{ÝuBÌË4¿Puh;½Þîvo^a=J	ºqÖn~|¹Ù/ì¾/±ì¸£.äFdLZ8U^÷B<l?Ð¨ÄâÊÅµOsÜP¦*=M<å389ÄÁ½Vã6[Ä:åH¼Í?õæ±æFû¨ä3L[¹ú-î0ti@ÝàZûl«?v¾¹ :Qó,ÕKV\`ëÑM:n¡Ã¦¤JXk5¼WNl/wuÃÚÕK\\¨ªÛzËìY8Ä·²ðº\\<®áÂ³ÊÐàê4«7[._13Þ4¸J=@@FÎËSríæè5i¸3©zë'MxG$ÃÂë.ªé®xxc:=@:ï_>JÇÏw²]°Dæïµ K¡M¼ JÌ\\,èY	+&é¥qíñMØ:pÎK/¬°zMçûÜ,ÄêÏ/Î½¿³ðãÚ'[ÅqÈºkmÏDö×7ø8ú©ûãÄFÇ¶ÜüebDÇØ¾£í7tÃë¼.ÈÍ-, {Í J(óÃÐåå(EQX	QÀë¦r=@;(ÎN=M«'¯I©ßÃdfëy´ÐÏp)]N"!wÑ) )ÿëµ=MYxÉÆF7I¨Æ³IL\`yoêUdæº?k²ìVpÏÌ¬\\	éÍjUÐ8'(ëÅ=MáÙxÇFéBh©#®À?|Zdberª¡ÀÖÅwÀLÅXFgÇoºä »W	©»4?w£cýsQßöM#rMè!çþ=JÿöÈüÔö±Ãßd7Ð,´ÌÛ±Í¸»pr\\mÏÜ×àØv·DXâ=MS7ô6¼QX(sÖÂÿÜçØq@ìâhÁãhÒÞu$'%Ç8¸8ãê=Jíé%ôË­ú|Hó{ä¿£KÐUcÍ¦°öi\\Åtd¿_G ótUñ	üöÑÃÙ\\¼É~*öÃÃ\\uuË©oçëÁ&ÞÂ1gNAóª=@¤É#b w&ÿ­õúWç»ÌªZèkhÆg<üÏÿ	$¤Oîs\\ù§[6SU½éIüÐ±¥gùèw¤ãÌíö$âAx÷@Èú¹¦ûÝ=@ööí$³Y5ÈÅcl	ð<U\\GÑ	 6ÇwáíÆ\\òuiauk	-	1h8æ>¢J=JâêØ«¿,w«ÁWó_rèÕ+}-Ô0fùeUÏæÁ&1#Å&AS¼åOé§è»èe¦t"VóóÇ¼Ë¡m÷@Ù¨Èqf£6ÛFùÍqÁTXÍ÷qvP}=M.íKÇÝ^þÕí§²è×ä¦6_VÉ%ôé(õâù1h§)&±G	éÕ"X(a°awY¢"ÏÁ½¨#YÉ\`¨ä³½»¹h&íä99hÒ(=Jú'$!Y¨'ó¡5	gQ$¸G ªËáÙ	Õ×ìá	fû÷Ëa	~@èÃ%ÐÐÐaÓïÌ#ãú¾8ÙÂÄ>ã£×Ò\\o¬¦7üÕ9Þ¦û³­$â ¿²üï401"¤¶¸ds¹0«(cb#dÍÝ[þ°ã¨'=Jîùw(Ø®§¢*pëÉGÔd©Þâ?&@ÆÿéØã5#â°)&ó~ËÒ1ÜØã9Uþ©"Ð=J)_yËô$¹dÓ«"[¡Ûùø¯·£ðyghci@óMç4ØØ#Ëî¡¡§Xu)Òl¸´Þ ºéqÇè¨Ó}{(=Jÿ[=J­ü÷óëÖ³aÁd=M½ßÉéUû%ÛëÝâ¹ÜÝQñ¡ãi¨ ³¥Õ©¾ç¥­òÃ8säÙ$¬÷§Iµâ0$Ûn(pæh©¢úÎþGÓÈ(¯=M±iô	2&S×ËÀÙÜ£¯Õ´7¡¢îûÖ¡=@sp}6¦SF.,'óIÖ¯y9ÔúÊqwq£?Óú"åø¡UåõúC¹ò}ÖpkAi£õ_¡ãðûMAi£Ù¿à­QÙh¢õ§Þÿï«ÏEDd¥eã,´Í½×e¢]Ó¤°wÛgYéÜ_e6ÃÜ)¿fKtçXýGâAÛå«}Fæ»UÎvXý=@GæGzäâÓÕ©éÀeZæÑâòíaâv­K@i]Ä×Ì½ØgcyãT÷bõiîÓ&·£Ó=JÒ£Å¹3SDÿÚíÊ#x3R	OìYøõÚÅ"þo¹fò?z´ßi#Á¶(7¤'ÞëiI0¾ÖW mÉ/A³Ô	&·Ñ/¾_æß%ø÷à#ÒU!FéJæt5àFç	î\\ü¯¯ë&ëÙ}Mí0]ÚýB´¹@Á¨[=M~Á}Pí0íí/îµI¯ÑÝÄEãÀ@ëøÏ°5æcGÉÔ0óèë:´^û HmÞõ¤A"FStj¦½<¿Ðò+të¶µ76Ï·m¶hLKÝ*é©U\`ü¢-éR	Ùòq\\Ã\\¾ùf/ÛémM-¡ã¼¤Ä¬ZFðÇ°24G=}¿éÞdGp#äNåþ[£ÅE¨ì0¦dÊ¦ùàÍæÍ¤þcÜê´Õ­ò¥Qt(½ÅcA½¼Ó¿sÉzMmQýØ÷Y÷7µÆaÑèkl0ÅSìv_ä¦àî»¡}=}7ûT5zøiöqº }^ô%ìÚ1Oñ»@îÆ®|H>[=@Ï¯ÞRôºª UÄù¦ÿ¶@Øoé©o×<:ÂÛ8É$®ä¹nõ:_7ot¤Á!ò¡Wüî\`´=@Ó¹bC8DIÃHË!æû| Btb)òZ×^7^ÇoYg\\ß ³ÃùÌoçÉ6©wuãoýp7ÌTq~V}Tæ¢»Úì/mm,ÛÊÄÜ¾#ýqáXIadÊÈÄþ´V^©YyAÝÍÞìÎÞ]ø(rßÐ¿Ðg¶ÂIò@Gä77737ëé_lõ°6Ý¤÷gÕ9ÛàÒfòùPØGç¡ÏÍi×gÛ¡ùÿÕ'!ßYå çPÄé!"KeùCa$ØÁa©_å Ù¨ð=}Xx!ái¹Åé ®ÕPXéü"ÿ¥Èb!¿=}ä¡IýçrÕÙh¨ÙÿÕ·#%=MQ¸É)¿³Ã	ég¡ý­üô&(Ù&¹ùTe²I9þ\\û¹Ùy¡\`_²IyàáÊIIØ¼ù«fúÓª]\`%ÄÉå¬ÎE^·6	]É V¨FD'QÎ\\¦ÉuÓ}^-¨FwØ?N¨ÖQl§X]uÌßl.ÉN§0{®jIú<noº¼æuÁí·¼^êNsYkò®åt|®Á2NT¬Ýyë_I\\ðÜ×Cæ5ÕzÍ+àó5g¨Óe=@ôÒ°Í}ð÷ß%×ÁÐËÏÍx'|¨âK'ßH/ô~PPöÖåx¦9T}×s+Ó½AriÓK«\\=@p1ÐvÂé¤(Ý©ãâ±~7·I¿à!UyWkË?EßEiägQØh]WÓÅhmñøÛ'=J#ÙÆVëOLß¹sFé÷íAÃç?µj®ÖÙñX+OLßh´G±YgóÌ­ û³z=}Éã£>Yñß³Cf¤ ä§ÑØç^,4Öÿäì"£üy©47¹Ò	Ôy&Õ I%Óµqj#wd xCa#¸ÍÈãWÓ^\\b&ÿ9Æã=JÀÙâüÚ©¾ïÅ ÉèìMSÏ{%Â®ûýÀ~y§?fÔ¨åèíPö¹Éå¢0@¹Ö	XPìæ¥y¥;Þ÷ç0·Ä³$§»e©»t7euÈb©è}aDmt=@Ò¹ÝaâìÔ=@Ó)²Ý¨£=@U9é,ç g=}pyÜ³)êUÚ¾ß!âÉVâ!ò¯eÙg-õUXìöàz#V+OÍá·xj®÷rÏ¥Ø&ÏÍÞüYKw±(¤ñW=@&h]³_]yªÏÏ#ª"ú'-/ÎÝüþ§Í%4ÁÛX²½ùD*çA³=MÔS=@æù_ªcúbòtÅÀb½|ç~Ù¢e2gØXÞÞp¨Þf_#Ô{ø\\ó¾ªS?=Mcü4e¸üz#LöwY{1²ï´õ4ÁwBy·PmòKOáuâ4]W\`Vª#ö-wÁçô¥e¥=@!¨ª¤ÛÃãøÐ½vÏµÀ"ûTõ'¸à¶ox«ÒMÿQ@³Z¡qCÓæóX;÷Å=@å.L8g×·%rÃüÐ"wéÛXþòÉ|Ëæß¹áóû'Ï¥ªhn8=Jü9#Òmhþ	eÉAq!«ØÄÂâPäüÀ\\:ÊÑCPõsáU}×ÿ» Îu«tHçHÂYåØ¡Ë I«Ä^ëoIToÎ¬¬ÏBàÝÛãçµH	þù×ºõtÎ)<ßÏeÞ3²ù~ÞL·ÁC²=M{îÇÐÒéýá ¡/¸éUú­Ïm,³oÔiôÈå¢ã|¥@Ò~d$f\\çn%{·2$ÅÖ\`àxùEH0ä|Y_[qH~|$zEv\\¿Ýj5ÿä´"ßo¾,ïÊ><Vá]nó©Ì¿Òæ¡®/m½ÝçÚi¡Ã:â*¢0ð©Ì9áüJq,{Spû\`ý}UºMÞ=@M^¼ß\`²[m.ð½7W§?ç	ÜªS×'¸Mp=}[]A=J¡JÈû}¤Ì¿ÞÛå÷Çpª~ö³URzá«Jô¨,sTäØÇÅ@÷Åe\`ê¨Ûä ~ço­,'gw¤Sõ½%©Fgâÿôyråí$_n>9÷ úuÅüÀä=MWE9bÞ©qÏâ@=Mñ÷Èæ¦óäÝ²£éx=}¥£r[µ 	gÛ¿ÔOcöîÉ#Æ¥¡¥ùÈgqµýÚïL_¸BÝ¥ÙH("£°ã³çl³eÒ$î®®_ä_^hè×ØðWßî[©ÖÁhvzSz<¼±½³³åñ!CýG¡ØEýçÄÕ°¶ÔÜÜzüG<|IAw¶³ÿÝ%¿=M=M¥·H^ ¦ÉûÏmÀ&£ôí¤9ûi=}¡Âyµñ!aYè¹®Hb(¯°×ÈéÈë6_ù÷ä[m=}l©!ï)Wm¬ âz%®peæ'×°"ØøøõgWî¹ANLøÀâ-û¼£QÂ_Ã5F3¼xy! ñ¯èßÉü¹­o¦ÕíD>×ÚEi·ÙÞn¤^ÔÔ[1jn6ÓË@Ýr,MlY?àý6¸¼EhPbãCë0ûu.G»¤@QÉ+×0ÎCzXú<>=M¢±0«(FzöÇ"'(û_§Fj6ÈI0á©3#åññ¿X|Z©j)f¨èhã«\`Úâåãä=JÐ+¯)I}Yâ[ ¬%mÉ8©¥'BbÙ¨g-0WÞæÑ9	ç§¦ûMéã¯O}\\ø|?"Vù	P!tÖ»Î·2mÏ;Î±µvü§÷ß'éÌ Y{åüórS4l¹QVMaÌo{(OMd­áçÚïC×q©Â_éØWqÀTF({xGiÆÛõ@! ]cczÿí÷Eq¡ØÄ]KÓ©=@·T?uAU¾iú	aÁÑï÷ï<Yf©llÁoÂÎ?3·Ítq,Î7ÌS¼õ)EG}f!	\`ÎÌkè²îgçx¤Û¡ræÀÆh	aàÃ¦Øòåó¯5pß»=Jfãfwü!yyxW¹zì	=@¨%TºúLÌª¹åÒáYÉbèx|¤?41Ñ«(Üo¤äBÓtÒ£ÝñUíÎEC5Qoq>NWb£®Û²nXØ=Mï;oÆÏ¹á=@\` ¾èfg¾|}Y§¨¨¨ý&¸ü1ñ¹øùs$$&üÞèß4¥dr	dæn²jç''Íi ø²×}öñ®Ì§¨£=M:È~¬Ñ\\ÄIÆ%¤é¤O&h§%"&ëMq!^úÃÑ!øÉÙ¨âéE\\Þzä~Ôá¡½l;Q_×&GÎY¹8¶~æGÎùyyYü-=Mõõep_3]ýÖ§v¾aßÑqÑ=@¸1©Á!Î×ò½ô÷MRï¦Ø^"$ëôçÎÉÃXé§¦ êYMdR/ænè©¨%À'E¿ónÕê¼Ìñõu¹}§Î¡åÂÎù©Ð°ctIÕÁèçf¼ûQ§¥¥££ñ¬Ps	xIõIï" (ëï§T$zKhhãÚÑ@OçÒoèéã ÷,X#""6ð¨¢¾#(#ÿÃ[ÿlW¾c@Øa¡¸Ì?,Gß?'=M5þoÅG­ Nta|d|s¤Z\\9¤àèµòÌá±E{GIûw±(äàÔ¨-=@³y9]p§ÒBÆ=@×âeßìÁaa ¶¬±K«ÙIþQì¾±QAá·öuVûû1A9Ò;TÄ0=M9ã£±4(Ã' ïß-µA>­¤å¬ ùÖæßk3û?÷éõ	uúÞmámy	êúÃOÔ\`ÿÛ!Cákoô~÷e ê=J"¹^Ó@ýHØµ¤§*ÁgævN)³ýY	¦OÐã"Qâ'"qäFu,²7s!³vù³p³vö ¡Ú,µ"bû³¡´=}±^ÖMöÿÕFÕiÝòàäXµFQs5?ÓtqoÊrMÈ!¢·Åèéh@À½{ÌÜÍ½|¼<¯£C÷óC.%e%ÏüaÇ'ELªö;+bl0sü¶5ª¼¦µtükr¼´¿¾Î±2ÛÙpâså Sfq2oú5=@­%OÉ#Ý®C)Y&é)ñj=}¾PZwÄÂ^ü jl*Ó.À.«»N#Mr«£°jÜRöIÓ:lB,:£ü¼Z©ør:ôK~j²jÒ¶jÀ2-U,Ã]þjÒ¯z1ËHl-y¸ú.ËCl5®2òSËlJll¶a®H2ç:$JîJîLqB²*Ï®ntjB°ºr2¬7K?>ìyNÈmB¹Z;®S2ý:JönÂ·ZAhìl®ï2u;¨k«Ú47{2E:\`Kk°Uìx®2¥¯Ò6 j2C2éK&xF®Í2ñ;xLÆpbµH,ìÉ2Á;ØJmâ«58ìg®12¹:ÈJfm¢«47ìe.òxÏy2:è»*-©.<àó²*l*hû)2H22ã:¦:&:&;,:,;¬;+Vªz2K6ËRl.ùtÏ:ôJ¾mªæ>«*n²8û)2®2_:KþkÒ±ú*Ë;l=}®2W:KÞkJÄè-lQTÑ§vüâÍ[o=M®$Æ$·Æ³n#ðLÖjâoðØý--ìQ®dÂ.5;K^ëxß/KAPo\\ìM®\`×xLþêNójÚ±%GË+Pö®hëèKöîS¯VlF4AªGRìZvÐb¥m´sÿï=}°³6aøM=M[ëd=J6|8½öíA'°+?uù­[¯3aaYðNPy#Z[|Û'®ó!]\`ÙãÂªævñNæz:L¤Êkô?kÄÂ¶=M«ãE=}3³·Ö5PüüR5Pvö{pvø*vøb2Éï.W¯ðÆ³· EPIvüõ{Ò]PÔ?=}_Í\`ÌX.½ß7PÍ°Õð]Æàì\`kqæ³\`·àµ\`ðÎªs-½\`B½ o¡32¼²Í?PÙÂâýZ1Ì=}p°$ädôÂâJKOqvvivZvRv@Ââ-[Ñ*&´³¥7=}b1£öm5ºLç.êÎ«så+½ =}PÇRp¾£]ô¸3å/­QXþ9à9îg³ó=MJ¨2ª³$eP­}Å]MvüÂÎ]YËZkù=JïnÅHïF :·³£9=}uÍß±ZÄ5B­¶çÛB¡bPrÃ^ðZÈHF§ìÛÆªÀÆ[8&úF'VÍyIÊ9±Ëé2PÍhqÅ%Ë§§g>ùûhÉú8Ãõ:Ip#'XLiV>Ó.H¢ôüZv°³Uu±ªÀÄ4gØ¹õü­ñb&UË½|ÅNËzFÖ½"º|Ùü­*ç^ÖÈí|ðdç^ äºFÎ¶~1ë1ý1ÆÍõctæÍ6,éÙ¸<ÕNÏx¼H&N75 À*R·\`r¨û0S]íJDÏ1m·üÑi·¼WìNÏX^sú»&÷<éÀXü­ÇXüÚÌØ<T½ðø½&ÂÝ÷ñßo¤ÚþL§TKºdÈ¼yóºÁîö|Tk÷üÚqãN\`Oá×M·çM#Ï«{ýyÜ¨½HòM§DYô¿|i¿Æ!1r¨=}sæwÊN-.+^ó±3À"Ø:S-=}tÒÕªzôÒr¤zËÚÓÂ¾Þ2A¿Æíµs¨?µuÖ¤3Sß£skS³WTW£CUYØJ%¾HV¹ºhÒN,MÏþ{¼¤o%îNTóuÕt9è~½°ßÕK}ôREÙM#Csà;Ï¶Ù7Î1ó·Îy$P|Ð¼FltùuÓýt9Tßq'erQóÜ5éÅ¡Óå¾ãÎÑ	¤z_$	Ü§¸?D¶}M=@m¹ïäîÄß0{0=@@ÂsÂpö~öã~pdk¨Qó|ð=}8ó$<:«BYÅ¼ÛÃ­Þð.ü)¼Í¾ÄN¯À¶AË¬æ÷VC)»ì°âsÓV¼_¹ÑÞÐ²á¿ôbU'Ohw¿SMc~¼	A¼ì=@A¿¶é¾¾|Ù¿»|e¾¶{|¿Ô¼æÔÀ¾ûã«Þj]Î0úøÂñçN½(üÄÔ3¼Ûwt·HQ¯×ÈPCùÁ3UNã&ó§Ù>¥t£ÜéS×C#v\\8%LÂvÜ_üy\`¤°óÐpòC%ô& ¢©Âd|xÇhuxÝx\`Ä]ÚÎi#êc=MÀ½÷÷jÇ®ød×ãXÍë*Ç[¼÷ßdõÍä~qäÚ­pç¤{çÆúzY9EÎaXÄ×9¥ÄØyy÷Úð~ûëãÅmðàS8=@î1=MÆÑ8V+¸CyDdôMGí^äivC¾¤á­½FÑÚ±©bóQgÇ]Ä\`]°ÝÛ=Mof°¶6ð86Ôè[éSðþÞsðZõÍ½&ñ2½ÌóbØâcB	Õ?Á_1@åBaòØCQ¤âµÆ_ÈTà)a½í¸f¡a\`s×)ÁO]9=M·ýHÍE¤ôqx¥ßÐðÿæ×éçøÁ¼õBóçðÞLá_WüQÿ=MyÉÚsm¦·ã&Ïå&pÇBË¾F@äíiß}ùæ=@¨+=@È3ZÈÈºYÍojGj\`iCÞóö=J6éXK»&ËðôÁm}ÅUZ­ ¶{¡ÖÃHQ«ªÇ6d:.2¶!\`Ç>ÂË1´ÍÞyQÄ8¦í¡aÓvÐÑÞ¹~tª~ÔÒÏ[­xÄçÞ´þÐl-séÏÇ~Ø³?Þs=@|çÏ=JM|ËÍ!Ïqã·# OÉÈß»E?FYa»Xù¡%JaÂáÝx¼$;YÇYvú¡T£o	OÐÀí½%F,qd=@Ô òûÙÇý=JæÇ4=M)aíêï¶¿ewùf\\'£Ð£·±XÿÁáGsò#üá¥!4¾eèøõ¤ð!ò(} Õ+ýÆ1;Dñ[ËIÂ5â_x¾ã6Rãâ""üuí¸ÁUäÒln±,Lñ ÅÏ¸Î¸×ÍÉu­wé÷ÜÑÀ³YáUha×ÝùfmùõI î¶$íê'Nº8S+Êk0¬8Â°g kÌ½HOÏãõFÏÂùï1âtá¤sëé¿ÈVVïwÙRßÓj4%uTæ>¢åþÎ=Jµ[#ãN#ÑÍw AçÍõgs	êúKJÞÀ ÄöspnìX}ÇÕF¹=J?{Ôz-Ý"ÎAÖé©=JÄÃ¯mYY²7¥áåóM!õWC;ÿïèð°ïÇE($æwéóåóÅü)Ò5sÃJòÿÜ^OpYçNÛ&X|p~Xô¸&üÕÙ;|½ ¼&£ÌH¡DòuõXc=MÖø'Q'êóµF\\=}ÍÆG÷6}@¦_çü·×ÄÃ{=J¡ÉSgô¥¿ZõÔ¼¬t¿å°þCb©E\`peÍ*äw5\`tHïæ=J¿åª~uÄ®ÄNFVõýf$ cÑÖ¬SA¹×gÑãùõM³YJ¡Xe{ÕH5¡àØÆÀÄés¡OhåÎãYs[=MÁòØ1é,ð¸ëÁ-¶$°åà¡YmËÚó»³éhAº:Z¨ý¼qavx¾ð	!½Mþoèá.=M×ì±f¬­¹ÖÂÔ½X|KÑ9Íeäh$èë	\`s#þÇ!¤%Aâäon)>!¦çþËoA¿ãh=}^//ÃÊßFj}ìkÑ08\\C¹_¿ù;b6«v;u4üæ\`DéBB¨>¬ÏS[¾RHÇw­jåZÉÕJ¶*Çnù­jñë*òìÊMe=M¤F Õ;bj 0w$¼8» à·xCb¬+¶w|ãkl=JW#t£Ï:r=}ìÏrÓKâ=@tðÚ´Ï4±.¢¥<Ét&ç°ßÖ¿ô>Y>¾ñØC	Ù±À·ÿÞXÜÊ¹eæÎ¾®+çeß=@Ú ÿòO5/#£âÊm1üØ¯ aV©ª¹ïNyGi\\v¹x×Å=@ÙO,S1ÁvÅZd[Ø©ÉØ\`ØWÔlÓÌËÜ#½©Ü7Eáà÷Eþl¨OóVÄ]&Ò"+ûeàl¯X§î(zðèÇaÖ(ûÞþ'uï8z{<Iµ"ìñA1%:óXÔ¼Ì(Û¦¿6§ØD#Öà=@A¶6éD;ãs²ö%õÌòÝÙ©¹&h&ÀRñ7oÌpIÒCÿ¨!R¹MÍðXÈ;¦´ÒÝØÒt&n~wáÌæQ¦²U=JÖ¨ÓT?Ò(ÝÒ\\xoOæwOWÚãìPIDÊÈ}ÄàEÕ ÉÌöãauC »\\=J#t¼)PuÇ´ñØþVnã¶\\ÞòOWïÏ$Ý´ý"Y´ûÛêàxVÛ³_èð´ =@DhÖjÞiEfTºÇÄ¼É)ã:E¼~¾ÛàOÃë\\ëÒtÖ¶Áì¨É3YÔ]ÏÖzg vm v=} Ô\`ãU=@{Eí=@È§(þ»7ý¯·Fëx)ûµ£FíøW³'dïÜð8'S-§JÀZ5d®½Öÿ¢à#,Å§RåÝBEfbU~R»gbÀò@ vNÛ/¼$«\`PZ¯Iºì=@vÑ	ÐÚ¬\`\`Ð¯·Óí=@EeÛÿðæ9iGEå þð æÛÛ3IòAEå"÷ðÆ]/ìm®2^ãN¸GÒv,\`qÓ]Ðo:P°+=}î+IF*xfÀöxuÄ4ß°þ-AqUó2û	ðÎ%C£æqHÙV&cèI$\`ïiV®·w#7#ÛÛw\` ¢ã·/Êö%QÅ·gGÖEðØÁÛÛ£K\` µïðh©u5IÑÚÉYÐÚ=MCSÖ$>4u±¤ÏÚ[·|#> L4ÅÍu}HNÝñ½ùwóÖ\`r\\¥ÿLÃUÉöXx»½i¼%×sÖøþN Î<å|e³#±PÛ_	=}u³%Àn@hK»§¼ò¦L<r!n@bÕçb\`£bú?éõ7øí"VZ=@ "Z ÒøZ î¡B%©Ruh¾_vGô0aBôH%8NÚ½E<Ï®. ³OZ½K«eGù4ö´OñÝsëV¨FÕÜ\`¸÷¸·í=MÂ:Àà2Õf2Õz 2E%ZUàZUbZµYhÂ£f²£ÙFîä¡Cîv£1[ñµ-ÕS:àÿHò\\]1Ú@e1Zé+öS*¤ãiõ_ãi5ÔÉ·¨¹Ûÿ'Ýà'¨i\`VûaÀ/·Y¸(í$ÜÏ/%Ü;6^°ãB÷P·²ÏµnÝ%ÚC³§­&§!çÏ+çç¯ççøç±ôÔÈÖvÈÖ&ýH ùgÕ<gìÓ¡ ±u¡ãØE|åEð©C¿Ç7ôì<ÄÉõñ7-eÝ eeÛ=M7eÛo!dÜ5³G*¹¸Ö	ô8Ï8Ó zÁ Ö÷ ÖóÂ Íye\`àÚrEÒE\` =@½]ÉÉ[éÀÖóÀð@Ö|ß@Ö³=Mÿv¶ñwÍ+wÃ§=}\`\\Û3¥ÇÂÇHÿÂöø·îhÅEÛÓia7Ãt- ö×+ÝxØùFÝô=}Û°¤ýyRuÓíÈ©Ô÷x9Ó÷lþù¤áÜé=@ü#D¨D§pä_àV©_ ÆÔ¯u ®¿£¯¯?èöçä¶#}³4%ÚJ´W³N)â\\µÃÃ8+TÛ7µM.Õ¿z»_ã«'é,åÝÍfµ3Tù°¶YñèçTõÆÀ]\\ôÚO¯õÚSÏÿ¡ÏÏàÏUHøP±°Ýw=MtÜ@yuÚþpO×ïIÖz¦[@{Ë{\`x;=@BeûT¶{Â¿øÂ¿C²]/ï/Ú3/Ô%ËÖuÿzà¨À&[®DìxÙ97Æ¬åxk=Møjê<ò!ôñì£*Ý8Ó§Üû1&H©W\`9½8"ÛPã'#àO±¦ÙãYéøã×=@DY%óàÿM£Ú1¹Vo5Eg=@Çç=JðP¡	1â\\½ìàÃÀ Ã³¥L¶Öø-©ôÃ÷ådÛ#FÒá8ögô«o'ÎQ¶á¸WQÝXõêQbÅÓÖ¥cZ"µQï©qOí'­Ü eïS×Ü¤ï{ûôý÷Y¾ÈU}¡iHph{qôDmO!¿EÿS°­¡¾ÿUs1TqÔz°Ô¾s¿ÙTxå(|ÁãÖ¾ÑMÌÁi¾ªté¿=}¾xSèÇz¼±FhhÔ>¦nS¦ºÜâøô®	¾Ñ1¾mé&(Ï"ÑçôÕh¥¾ü©|ÿÓ¾'Õæú ÏÖ×ô'@O=JPï$0ÏtóG¿Óë¾½SYÙzØNGÐöXÝ~ÓÜÛ\\»|ç,#£ôÞt¿uUøÝ¾§ý¾Úý?¯ô#}¾oÃiUwäw|ÀGÄÊv5EÙ.wDÕ^¨(½<ü¢Þ\\¥õrÝÔ'¨´ÜÌÙËtólô¥-?±'¾ë¾ò¦ç¿Ø©HøÌÆ{óÑÆbtãÉ³S	næ«ìþÐáÙÏ&Ã§Î´TctC{ä¼Ü¨£Ïíæ\\ôù7ì¿Ô|O£Â|ß¥kØ&tém«ô¿"æô/'¾µã¾ci£TôäU¥Å¿Ç}7tï{s¥LUYíéocw¢I_ µÒ\\¿Ho_Ä e­U{ép²üùb?ß)ëÒ¿]Ì@v=}{§õ²Äi ~µõµÍ@AÃE¿¼bg'³{æio·']SÔ¦)Ò8ÍXHßå×Rõ½²Ò¥´o33¶TÀ;ßß¿mþÙ¡Èo  cIC¡Îc£wMMi^´&HÄQÜ²%ûôØL#_1¡'ø¿½4u7Ú%À®Y	!ÅäÛõ%ø¤åÙþ@CãÏyt6s!ä\\gÒ?ÕÐY^ßx)áqä¤z$É;(qðÎiu"cç§ËÞAÏ©Eç^çÃÿÁv!Â&$Ût%üé	iºè $ûM{üÅiæÂ¡$ß¿Ð¡â%b§úÎô¦vÉ!!Ð%yQß9Í¤Ñµäñ{Ùß|Ö÷×h(ÑÈÓEÊ=@ÄAÎ\`¦¾çËºT·SÌØfgI~tG?'¡/ß±po×^	Ôàç§Ìà$SËÈd©mß­ËÓä×{5Ö=@¬ÕþLKÇ~)ÿgþêAçÿÏ%Ôm$Õ÷¡6|ÍiîÓU6}©xr|ÚÓí}ÿD¨ÍþeqÕ¶{ñçCÕÄd'Õ"nêÛsÈ½ÿKäÓ·¯ýþå?ÒÓýþGÛÝþ~cOÿiMÕÇøWz±oY|ÀÒGX5°)ÌPIØ é|g¿¤öDßÀ)dßÐ÷ÔEÿ¡A\`Ó}¤{a¦Ô\`ÂÞAÚmßÓ°UåÿýQ!Ò¹}qhsý°_úcm÷É jFzÇà(¡¯í#-qþº0ñþA¹ÕÇyÔéhfÏ(h=J¶=Mßâædô¬o_=@s÷våÖ¨çÌà72æØ=@¤mgIu÷"à3çÕÔé}y®fzUX§Òt«¹ÿú/yþèùþùÿYÿ\\=}ÓÈ8þÄóÿýÓiÒÁ¨~á%Ö@h%o×Å$ÈT¢Î¦C³	GY×æêAGÙæwù	qeK¸æq(´=}ÙýÃ1¦õàB"Èphó	îÈ\`aÍö¦p/A¨ Û5éú¿±\` =M?&\`¡ä±¯% =JÝ9£÷ÈækYè¬AÉ\`ÅåÀóï-qP°rI¨Ë9ÙgýÁà$Õy'âíÆf¦©©(öÉéÆ¿Á¡Õ<ê¥i4=J	Ñ=M/T/Õá,£(k&óZÄ>ì)2øùFôù[Ë¦¿¥+¨+èÚk%}køAuÌ4·ìfý@ð½­´{%µ¹øo£ËöÌ&=Jì&¦$&á"<¦Âsè§}shâb	£iÆ|u=M(Ï#uñ7õ1â²Ü&Ëycø\`¿=MãÀ'ØÀ_0=J5ÆU«5T	íM"Ö­;&¨Õt¦=Mt&|¨êW¼Án¶R(£©>	úR¦~ið¦æô®TæÃ¹¿	&ïôÀÖôe×ôÅÿÖðÿ]ÿ"Ìàÿ#%eÿ#«è_â=MåD¦|w(zµ¹ÉzµYÞþ/ÿk("ï¢)&£ðôä¦vgèg×¢§h¦§ØUª©ª¡Wûºqò}´\`=@^W4\`!Á_¡_·_¯_Û}Ä¦ðæò&áù÷"øk÷£ñ÷#·øWâÉW"$W#ø¶Àæz#´7÷Éx÷éõ"úë¢Åå"Ü£½­£ù\\"Ï"ãSãg	#ÒgiüÌ-\\d	G£ÕG#Ñö¸fÝ¡Q%QPÌ]äÎ]©=Mþ¯	¯d¯éV	¿E¡Mè¡ä=Mý©ðµ?ø5¶ø}¡? =J7=Jé¥£¤½yûéAºúµùeµYÅEÅæÅ!¹íQxíGHÁ^aø´yÌ£¿BèYW°á£BíEõÁ&ÁåûÁa4¹EpîH£i¨MàIäáI	ùuÞùiXù'É ]õ9=Jçp6=J}¹8=JÈ-#'\`-ãü«¦ ­«¦k¦óÊkæ=Jøk(\\²Á0M0Þ-­#k':Ñ$:H\\¤2&:¨x¸=MÕFiÁ>ñE¸=Më¢·¢ÈHGùñW¹UÙïã=}"03&ï.,!¢¿ê-48í8oP9o]°am£«f¡õæ'Â&Ùí"¡±yÙ¦¿¦èÈ%!&ðµ&ÍL|W»Åòmü<#ç³f L![N ï½"õPs&¦<¡ÆÅîñwWØOë	½"·¦ó¦È¼ö©ºöiQPï½#Gó&&ã£\\ð>Q©4é?Ãìßr¥}â)yS&&>¨u4¡gÆìÁsiçréæXE)úðçT¢¦EYþðm¥¢ébE¡F=M9Ñâ	,EÉãôðeßK%&ù	&Ñ}\`È¤ûð¹Ý8¡fÛ·qéÚe¦÷1E	%C§Ý­	eýði=ME«ÝÄybÝöÅ9&Ö÷Eõ¨ÛÛì=}Öú*Eþð¢SE/Hø}%CSr!>=@Ñv4ÝPÝpq¼Öóóöå\\e³ÝÃN <zg³ç"¾òxØy¹QÜÐn %àÍ' HøtVIðxEðàFôØ8Iô¥88Õ<Âmn,ü¶¡ÅñÝm=M%HV:ç:=@=Mó ÙëÁ­«=@­îó«öò0ÜÜE1Úç£0ÚOÍ%Ýåy$Û3·%ÛCÃCõXõf¸ðÚÇk[^Õ-p®I\`éq=@©YàyÀÎå|¥Ú(1äÝ|¡=@\`ÜEÅ@¿ÿ	¯wèÃßö\`eÛ'd\\'8öºûÈWã	¸Ç\`à´Þá	äáµ}Û¥]Ü]Ú÷ü½÷ÎUwË1wõð±pÖ°!0ð!$¹ÙÎ¹ÃG=@{=@=M¤Ww OÍ0EçãdåáÊD5D¿~;¶ôÍÚÉMëu¿ ¿#ÉMÐ?rÏ4°£¢ÍVu°§tV÷p=@Tï&fì«uOÂ{=@Ü[eÞR¥a¶wÂg²7Uò4Æ5ð#¨O®ïç48é.ÜwÛå|*µ=Jùßôíøu¨öß9Ja%ôÅ§ÅïàÀQø=M«ÖÔÕEèô¯O[Ý½©Dæ-¥NeÝ^qÐFÂ¨±¸Ï~Á\\¿¨¥èTÉy§|¸¦Ù§pÏ¼ñã|õ³ý=MËöÈ¼=JCãË®ÄÙT×Á¿LÉXRõÉÈ}xe×dlä%Òì©cÎ¦É"Åeé¼åäLÍÓÎéÐVgåÃã­ÜþÅtË<õ¿×ü|¯ôyuSaU}Lü¾O$tÈ=}iU¸]PR[×ñTW¸xIË³´¯9{ ÑF'ßÁüÊ¢AÏ÷ÜàtÐ¡Ïóy7¾T_e{¹pRñìõR}?}0§XÊ¶IÒÆÕî%¥TàËo(ík3)_ºµÒÚ§áÌ¤ (MÔËRíÈ{åd×¹D×F_§ïÞRÄÍÍf¹ïp7¡@_wÓBßfXJþÛý»WùµQ!¥Uq7ãñÿù _ÈÚÉ_èeG¶#5±Ðù¤ÓÎéûP'K£@·wÙ$WW'r tsyù%$&iý©Ýuý¤¹wÃ½ÇþëØ	æþÒOF¬ÿu5Ó÷ÌtÒÀiõÔ$ñb~'þ±¯_|ý ßz=@ÙfG	Ô¹¤©nÑ¢·Nß#ð~_óßËÊX=}ÿú£½ÿDÑÓQÇÔT÷{É!ÇÙ8âr·dÛ~×ãdbß¤äëdßxpÙ£þË ÿ)xyHßªÔHØÂË@¤zÚOÂDhÎäC¦§ß!Ìd !õT6=@þþÝÊ?ù	ÆéÑ¨hzwi(n§&ÿ£5hÒ£Q¦6#ÐðÀºâ¨Óöµ¥#'~1ÏM)Ãi=J#tÅ¢	£²q£	ÈÂeYö­ÙÉóÑhAõ«	§"(À¨æ°fæ³XYÉúLªE=Mñ	1=}ÿ­ã2yä¼É±°@=J	Ì5lf&whä;(£{hu[øÈ?ø¯teGí#ÃÞ|&»ü&þ\\&ÙL"í=@#±û?â}o&.©Õî/oýÍ"æØ4^¬qÕé#Ë=}ã¦åD!£ÇÇ­ß¢õ=J¦qûd&Ãä&¹²¤&Ò$òDtmHã;©Ø[Ì3I@¾ð¹CÅ9IÅ}!0+å4µ/Ó"¼Øãñ=M,± ¦Ó8fÁ¸eè=}9ÓÃìYìÕä_Û¢|Êw¡/á=J¥¥/¥¹¤;ý¥î§"ía§"uÌãuçBè)6éhåYSÀa(UÀYsñÅ£ g 1·\\ªÙcaªdºá¥cºtFî11=M0Kü:hõBñpñS=Mâ^2Þì¢¨Ò£,!gºêá@EôÎ7¥i7¯9=MÁ!8=MQ§±=J¦ÛæL9GÂòyq¼¢¦õN<I£U³	6s3¼£×¯óæûïhO¯e~sÅ1Îµ|"ÄÍS&Õ>H=M¿ü=@ðµP"ú\`(ß·ÙwáSÑ¦ïE©°'âE!"¬	­I)ç1è ô%\`&Ò·OWÛÛÃ§EU Q¯#c¯ÃµÑZÀ»öÄ=@wß¹NÛì¿½±³VgbEû.&cíèi°\\Í=Mz^«ÿÖCù=@á¶79?«é:Thº_6µXU@ïÜT%Ü>6µ±#_÷ó!ë¾±î =MmÇËxÖt1"¢e ½=@Ö  õúÀVRçSµiÂ'ßKuéÉ#ÝXd|ÅOÔótvØøÖÕÜ}ÏÔÚÑÍÚY¥qÚ7?Â¡$uÝÚñOØ®ÖñLÖìõ,zÑ&)JàèhàÎi%=M¬YÕE¼Å?ïÖÜÚaÌÁÃo~[ÚgG­ÛdæÐü=JQ ÞatÔt·×9¾òá¾$Ùª©kcÄ¢{H>(wC¤ÉÜ8u	÷tèßôMéR­@T§ÇUéYÂÔFXdkç§¾â)ObP	3Õ=@v#@~}3¤{S"{#â¦tHtÕvçüÙÝÒ-Ì(?çÿìÒYqp	RÔqf{wqMµÖÔFÃ[Èÿ1Ç§}5ÏÑã¡rù¡¦¤ÑÛ¥ÿºÁýEÄ	Ð	ÖÀÆ=M×¨"]SÓØÞpÔÍÒ7PÞ~yXÐ\`Zj×ÛS ½äònÿßÿFßÑ¨ÛôeØzYÑ óÌ@×èuç^lµ&¤zçÂäl©×;ÑD&Ä$ÔöG_h&»äi¯$ÝÇd)ë¦¥³ÖÌ,Æ"&¡0 ÚÃ©ÂðÅá =J·§æ#óýã#$~i¨ÐÈhHYÂÙ2e>m&í"#o#6<¦yæ=Jµü¦=Mæï4&øÁ2ápNap?¢?h/øh_¢#&Ù$¢v¤üÓ+	=@à;D^ôa=Má=J­Èßé÷ÐÞTàI=J?Ñ ´¡ç ¡5Ñ¸=JyÌ¤eÕ¥ðÒ6èèY9¦Hõ±AùaGê7Cò¥wDî11±Ã]¢ô²¢hÕ,=@êËæÎýZèZ½\\ÆÑ¯OÊeO5¹¼âÉØuÐæõ}"³!Sæ«=M5°"¸\`h!Ö·¥=M[±(ÐkpßHË\`4%à_ÃÛÇsÖò¾n Ðü ñÈËöíg«çÙ:ñX¾Eö6ð«ÿÀ¨}¢\`vIy=@a\`¤0.ßeÚDAZçü¼?Gû¾ºÆÁÇ²ÓóÌÉ\`pÛT#LÂ¤ks\` §; {+ð°.Û(Öõöß»¯[qü¡IÙ¿ÙUà±©SU¡È|ðgÊ^¦Õ|Î#DÏó/ôá}}¾¥M¿}q¾ØµÅR·URßúS¥É¸t¼o¯¨ÓGé¦Å®À¥åqçá¡©áGÏ¥Ñw©[Ò­#ÿÜ9ÌþïÕ/E8|gmðÒ=MGÒyYYN×õâN(Øàe¦g#&Ä"ïMË¡þú'Eîm­"ùÅg¢ù¬h¦yhQMÂäº§|¾áfIøWRñqÿÒîéÇ~"Üÿ"èß¢&¤¦pf]èÞzUq¨RqHã5¡IÇ´ïÇõoê5§#Ä¤'£¯c-£g­#ûWf¡t,©ÉB9xE¸]Lc³©¨Æö\`ÏK_§µ·É¤=MìÌYñéV«£Â"^ïQ{XG»Øu=@géòcÜ J6áÝFÉÁ¼s Á5i#¥¶nfÑ¹s\`óÏoØWaÀÝÈ&gðuIýqëÑ¿sS!¿ÝÈ&gpSfÑyQ¦0óm>£>«ÇYÁ÷åF4e)Á)4å%763WRÖrûïu¾VÔÃÜôÒ:{Ó¾ìÂßß_=@ÔebVæn~¿Ô_ÿÓé=MÐWßèØg¤³êÊâ®³sSM4%>T=}×xÍ×üçÉÂ(­=M±OÏÎ¸DeÞÞY(ÄEáõÉá¾ßÅ[­°Ð¶H!ÞÃAÙá£%'±yÈé=@ç±Y§ó?Ó{Á+ó=Mý@ØâM'áÍÑY	£µq¨=@\\dÆ? (¨%ùh%/ÒØy²3ýWç%òÃiÙ	¥ÐOþÐ	²Óµah¢$ñÙiÅí D[¥gi¥ÐÛÍ¨=}¨$ø¥ÁlßäOxè=MúïåÙèCµ_Cb£(µy\\ÇußßWib¿^ñøOOø	ñ]ÑÜðfü[L¤ (1¸¿%Yd ðÛlÙC¥dp8¤Í­"ÐÅ8ÿeÊYáúÞ)¬©å¡äÂÒ,a	ýÑ9Gcß´¹ßeMMø=}Ô>ÎB ÑyÆb»»Û§tÿì>íHµ({vK´¹ûÍ% (ã¥6ê«-å ÂWn[Û¸Hdw½Ô@ÀÖõ=@òÇÏ'jE+.à;üwÓ´ænØLk+VÁ7|v¯ìbãÚ^x¤Rÿ°4|jC;Ê´6ºør~6yïVÀEuÅOµfjhM%lI¼~{ÈM¾rIÏ=@Xã_Jì¦[¨Yó8úc2rÙûÒ^äUÁÁõÿ[áFkoUÇº´ó½üNÓ~YÁ=@-ØÙ¦l À°r©r^ãÖ¾Pç¿Äõü óHL)K¿¼ÎÕ|Îæj¸¾@rÏ hãçÞyô5?ùÕZQ,Å°c?¤ÛÓÚxÚôuË@ä> 062%¶ÍÚ;B¹ãgHà4_GvBh{-Ä%[MÑóÏÊé)4ä)PÚÊº1ôi°H)c,BÉ3Ú-¥4i£Â¦ ®/òÚl"sX*¸¥ÚQKª°Ím( ¯gòsN&6¿ÉEû*Ú7ÍTñôQÚ8ã*5¯Ãc£æ­×ëÙ59¼=M5*oØëËF/Õ¹ÚfrÁeê¨M*=JÇþd*Fð»ªýES0\\ãÔÞ6P-Üs´À¸so3;¬ÔUÙ¿tÛ oõñªèsÎüãÞ^¤W_¿áôwÏ×¼Q=@ÊHâÁ~sÈ1ñª»üMá¿ r£Ü½þ}dN?¾ñò/Ï[Z1ØSÙ¾tUOQÖ±aÓÉtTKyÀur½Ï|m£ÍzRãó'}Sä2*ä£ÀSºteÎæ¦{øQÏoÜLW¬×q¿etÔ¾9Õ9Å	[tø9åÃeÚ"oØ05Bçw(w\`í biPôoo.ÀF¤Ú±[õ[5Àb7\\mX-ÅÄaÚPa­¶ÁfhY%è,º#¦«¿ñãG&n#´6ÈíÚZCUA¬Çø-´Ö¼ëð/*d¡$Æ°çó>ãNÖ ê½2 a©#Þ-õÉi§\\Ø*EÈ9ÚMSá¬_¸¹ÆJ)S1ì80{@õ6@gÃÚTQ.ô\`#0º»h²zW!w¦Ð«A!7e9x/ÏÁ¿dàv	^ðæ)¾(ÓÆ·?ÞN4Uý$ácSöë$è²>\`¢õ@Ñ½ÿ¸Ò §Ó@âÆî±1ÓçDNÛ¡§´Õ ª.Äsç=}«	Óá¥7Qa·Å±Û»	åÒ»ù°Ü0X'ÿû«m,!N÷. ¦þ_Ëf}hyzõñ«Agw7yDì)[GbZE»Ô¹Hî øØèfº¥â~¦*ÝÀ	Ì0 üx_(zVí°Ë FÿÁ¤Å$Ê6å©v÷¡ç9eôøÒÈsçàAÿi¥Ûa[ÿK¥Úß­ÕÜ¡\`=JmóÃ¹ùÇË°ÿ%dÛÓïhÕ©jñÃ)G|ÝWub=JòAÏàC¢êàÀVK=@öuø(´=MYh_o¦9ç3eðç¢ä©MeVa)ÂÙ+eþ¹ÁÕñ¸'ùñÃÚs#âww@IöùÈÕø÷ùiÖ+åÙkh? ÈØRÖj§Ú6è¡¨YømàpZãbÉÓ,ÛÖ^QaÜZ@éCf²í;ÁG¸¡Cü=JrµKw¸ÞC=JòµKy¸æCôê{@°\\¾·Ë¶FR]qCê{A°dë´î-ÐFÒ]qCªÍWB®ÍB²Í×B¶vîBºÍW?ÞSqT¸àúFÙÊ9b$lkÉ·¬hU/§ðû¡4$ºÍY?Sq	T¸èúF§Ù6¶//¬RBMbØVZbð¸¬[î[À>¶S¸ÛÏ¶¶_/¸SB­F{ëÂBÅ4ðRñZcðØ¬[ö[À?¶¸Û×¶¶/ÈUÂ-FkëÆ=JÂE42ñ³ìÆÂe{ÂmFS4´o¸ößRöc¸ãA¯cò[AÍZQcNRñ·îÆ|"ùúFk%ÄXgÑãuü%^¡SgÄå¾h÷ô¹XyÁômÁôqÁôu!)U©ÜØÍb(o=}ã²/oö5Ê"*æJÊªR=Jkû>+ãN¢k;]n{õvV~jU_MÐÏUÕÏU×=@Y MõÔß¨}9'dÈßàè"fù!#¦ø£éøcÉÍ	-± -å9 YÜ©ïHÚµ§A¥ëX ­3åA Ûa©ïIÚµ©A©ëX(­&3å"A a©o9ÚµhAçêX$«.å5 ûEÌio¹ÚµhT ûYÌo	ÚµA'íXfêX¦êXæêX&êXfëX¦ëXæëØQ ; =} ? ã"©(¶¢9]¦À¥Yóç#8èµå-wÖ·_Ü=@ö-¥y·gÜ öÛ+àêP0EU°ÚKàîÐ@E¸+èêQ"0IU¦°KèîÑ"@I=M¦¸û*j=}-·Ê?^­ ú:l}5·Ë_^± úJn½=}·Ì^µ ûZpýE·Í^¹ *@,\`.0 2À4à6=@8 :@<\`>@ _´)íâé	Q0"'V\`:M&%V :m¦g/èhµ_îFéïL¼ù?[õ!Û¶Â Ûqö%VNPä§W<](@u³ÓIµßî!ÉïÜ%_['ÛÆÂ$Úyö¡'XJQâèVº]©ÀuòSØyõ_FÙL¼?cõã¶Æ¦ØMciÀ5ó³øÁtÐã¾Æ¦ØOdéÀµóóøáàãÆÆëgc	=M±ÿ,þ.HÖÊ"ß._¯ñQÕ_Òcf¨Wlw÷?@¹©õzý¢¦Þ±Äñ=MÑÿlþnH×Ì"ß>_¿ñÕßÒãf¨Wpw_\`¹)õ{ý£¨Ú¹Äù±ÿ¬þ®ÈÖÎ&ßN_ÏQÕ_Ócg©Wtw#÷ù©õ|ý¤¨ÞÁÄÑÿìþîÈ×Ð8Ùû½I$%À%#ÂÂ!½Ù#f6iB(Zö!ëZ	9íÖ1°I+¯=@9í1°I6ÝB)Z¶gB%êZ ¬1í=}°ÛY6Bð(Z¶iB)êZ(¬&1í"=}°Y6=MBð)Z¶HB§êZ¤«-í3°ûA6ÍaBp©þ©;°ûQ6ÍBpéZ¶ÈB§íZ¤±9í*í+í,í-í.í/í0í1í2í3í4íÁý D¤hõgæHá¥GÙ¡Ý0ÙÖû§e¥ª·g$£ë ¸7&fàëp¨Zmi¹ÂÛÛÉö "êù]E¦GGhº#@I%£ó¦¹0&fjM¨\\ÊKi¹ÃàúÂÉv¥úùÐw^gýXD ÊE·%£ûÞ9-¨È^\`îùÅð86#£þ¬[iÙD¥Z,i	DÕZÕ3¤Z®¤Dt=@ÌøéH<Ï=@ÝH2Üþd×xýòÛäpÙÔ^SRñÆÌ¬áøÒí¿B>ÕÄ$ËÊtÇØhä°SÕJ§ÏÑØÀÕÑÐät}­Íh|qTl½mDþ/$~=}r@ÔYsÇËw-cÎ¨úY¤ ¸$gYÔ=M½ÊóKÿ.¼ß&æÑyÞÐ¶^ÓqãPm¾Òä$pÄFüÏûÄB{Êú£­ðôò+«¨þÞ¼d¯Ô]^JÂÏ¸øS°áßÔ½q9n×ÑÇòJ§ÁHp/uÿoãÔhtzË8ö%ëîz)\`èúb(Úäaþéóúb(¨]ÿ¿ãÊèö¢g ¾ä[i/ý­qþÉãÏ8÷jwsÒØòÄàÜr§¼þSsÿ½þI#ùÓÒ)¼dJÍ_OÙ$H!^Ï|Çº9þ5³ÿn¿vèþÀ|{zIO}}|¸Ó¥±Ðâ>Ôe{'»3ÄÒz»É_Ãç$NIÕ}Ì{.kQMcÿCqæg&¹)&£QL\`Ü¢&Må0Ngï|n¾~ºUGÿ%m|p¿ÞªfÃO¼Qóår#Ûæä!EMÉÀòÕû#ÜsèwÁ¡óé­·cñ#ÜfÞhtºÀò]t¼&<À·£ñ\`#QmHÔÀ¹LûÞ{\`x½¿U{Ü|¡¹ ^àW¿ûfÞ\`ø¾¿ëÜt¸Üo ÄLuô¤Yeî~hMÔ0sïö?&!Ò¡Ç g²¤íÝÕP]¤æ;¼_Ì+¨WØh;éÐ^våw¨ÍßñØd~¥výXMßÝà dtåÇØ'8þð§Ýß;Ð=@FÕÐÏ£ÜÞ#Z)(FÉK Í×åMØ³r×ú)%¤k:=@ÿÑÄØõäødËâØä¤ÇüÆ)¦!©íù&À)5%oî(_Ê"=Jìmo5AÞùßÊçàÖ ôål×Ë¸Î¸Î½íX7ãHM\`ÇCqÝeFógÆý»ý{úäÞhC~Ý} %lyvòVÅßÐÖ&Ôü´Ü¼ä"ûzÎà¾à¾±ÇF¨îK¤1	¶æ?M¤ ØìðÌ7u\`°WÕSÓSÛÔàÒkÀ&×#%Ñ ÑHÈúºàk¨}p$¸åý ÐßÎgÃþ[àî»Y9çB©"ßâE[Ip§<# ïÂ®æGõTtÀÙÓSÔTÓVØWz^Ùc¥xuËGËÈ=M=M\`ÎØòò¢æè¥ËàÓ%QÅÞa#»¾3Y¶h]ìÂÝs=}´µµ³e =JÒì=@_ßÕáöÙYØÞãÎã¢øÈÖ-¥Ü¸øÄ¨ó7óU^ÆÖ{Ã¶ËÀû¬M÷¯D¹BÞIYÉùªâ¨úY´´µI»Zd[m=MðyÂb[cOO)º\\ýÆ¦ö	¤ê(§Õ(+`, new Uint8Array(91422));

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
      this._preSkip = options.preSkip || 0;

      this._inputPtrSize = 32000 * 0.12 * this._channels; // 256kbs per channel
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
        mappingPtr,
        this._preSkip
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
        console.error(
          `libopus ${samplesDecoded} ${this._errors[samplesDecoded]}`
        );
        return 0;
      }
      return samplesDecoded;
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
