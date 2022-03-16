(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('web-worker')) :
  typeof define === 'function' && define.amd ? define(['exports', 'web-worker'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["opus-decoder"] = {}, global.Worker));
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

    static inflateYencString(source, dest) {
      const output = new Uint8Array(source.length);

      let escaped = false,
        byteIndex = 0,
        byte;

      for (let i = 0; i < source.length; i++) {
        byte = source.charCodeAt(i);

        if (byte === 61 && !escaped) {
          escaped = true;
          continue;
        }

        if (escaped) {
          escaped = false;
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

  Module["wasm"] = WASMAudioDecoderCommon.inflateYencString(`Öç5Ö£	£ hñç¡	!gÁæ¼OïÁn´ÌR»Å<	<õ8StÛT¡fÀÆuwr<Ã³O\\ÒÐÍxþ~»³ûD=}ËZ:=J*°ðB²ûÚ¯[6q[f]p»þ\`w½öÍ4Pje}a)×ßùcÁ¾ÆÊÒÒ¥ ßèß=@áè	Áh%ôÒ~To)\\¦KèMäl0)¿R9¨ãAÑÔ1µ"ÕãØï35ûAlëðÕÙ8ô>¿Þ¤§ËGÔãÔ8Øâ?ù~Ê+?ß$¥ÙÔ¿°jÎf9µ´c¹aÌùpÉWß"' %É¾ô&¨Ø~Si¥ÓX¿ÔÎ|T¿Q=MÒþ¸d{ÏhÔÿñDß4OâþB¹ÑQSØ~M%Ùd;õÇÛ|W~t{þ¶Õ5Å{ßðßÓ\`Ø~Ízã>X	XÄ6(É'íâyEû©DÁÌùÁ oYÀ¨h¤ÓÌ)ÖþUgEuõû~'éW$t~è&Óô[qKAQÌUwÞã²¥càåÙUQTñùS·e{ïMFôñÌgÏü<{YÏl8Öðâ]Ï ÅÄô#AØ¿& ³EØ¼IA³uÕ[JÖÜD&_"ÝøóÆ"ÝÃÿ¢ðÉWÖð5(__ (æ÷É×ÖðU(!æÉ·!%Ý­Õk© _hù¸ÖðqÛhg-xÜ"S²ñ¿ÑðÌ7úq£oM*ÆcôÊô£öâ?DãrâÎ=MVh´'#Ó¦U/^T&Ò#R±Cctyo¿EØîrfãÈüt¨íªRÑ_y¸µ¤~àÀN¬B_ªÃjeØ¾(sFïaÂ=M.uõlªÒÉEBO©²lç§Ëu£0wÚ\\¤iä9+¦s×"1BAG69Y ÊPØjMGT~ý2¹Íæ]Râz:fü+îü+výËmö=Jà~~OêÙ5ÝIzÆÿôgiíñu9Àj1=@+âz=M¸lþÜqÝ²=@ÕrG=@Îû­PU» L÷­PqR;ßCÜ££Âå7$dÏëX©zÝõEs_UgFÓ¼|	Z(ÑÿÒ¤³¨=@[ðK)Ï^¸Ë5I)¹H&$9u'ÏfH·ñ=M=MpsõiôéÝIÙññÅ=M_ºSô©ò·ÛNÃ?ØÃÓ7ZûÀ>atÑñB¥Æ)EãÊqöxÑ]	¤¬t1Çì^©=@JÖõ d·eõ°QðDèr2ï%&lw~c¡Uÿ	~4÷Ý.u#tùó=M&'ÏÈÈ\`ÜôDÍz1¥s»ÅO@ô¤-´¨]ß_ºéiRü4ÝÛ«£ªa×ûÚ2¼HîçÁ	æ£¦kÍ_Í7>rlx©9'¶(|*m4uÇñÀÌÞtTïÊÝÏx#*Á-näþ³©vÇÍÖw½]´$ûÿ[VàÒØ×SËÒT;/x¤('¤þÞÿßºxBÓbuÎºzÆ¤\`¹»=}öz[V´ü#áãDùÍUQ´â"Bê_·Âðs{Ú}ú®\\ØýwñwÍ³PÈàÂ÷ ¤¼LáÄEß³U#a8ã@øÓ'Ø×%×âÛÿG¡1*µ@ùºx8âÚç[O[¢D­{/ù|Ä¡ÿ|}Çfè\\@åó&ðÄ-¯QE¶FyedÚç¸vï%«ËÇñÊìÚ|îa6ÊØ½ÆmÑÄÈÐÃêElþ°O=}Ô×ãÛ"ÚBylÛ\`º/ÈBµáÀÜ|ÎºlúúÖá|UÌÁ)ì¿¨ÐóúPË3­êcÎG0q9Þ4ü®ê'¸G»Ö³Ç´u±:µYA=MùäO3¨Õúg)ËÛp×ßn}Ë=@PÔ9n~ÝýI×ûêDÝòÄtp=MHáëÚ¢ôpÍtÝö¹òõâÚ=@x<é§ù)¾z,+ø{#KPÕ Ôzà4ô¬Ïá7o7gqÛ3s_(WNÂÖ0Q(I©=M­$~.ðÖí=@=@_ÓéHóºc5¢géô¿>ÀúI¬	£Ð?ÛîÍ&¹)»	:²æmrZHim%åÏß&ñßÙ'ºBOy@!Ùær¡£\\4MY;®óå'ùtÄË§Â(Ì¨%okÌÎ?sö²ÒêGsêXEÿË]p·S~ÜC?9<ÀN=}{H{³èp4¶ªl×åô¦cÉf÷=JÀ0oýÜÕ¤¬WK9ØÉÂF@!¿ºæNäJöãò0Ï'ñk\\Vx\\ìr\\¼NN+Ú©Ú7ÒHên©-&e<|õPÒÀoâ±å«ÜRÞñù"îBº¨î\`Êù¥_é6Þ9ÚzèÏ7?ÿ=Jzzº>~{¢µÓøõy$§¬n?ÞïÀKY¥³ävòTE×UjfÒ´À\`4²©l=}M°ì-ÂÆ:úñvu|%p'º936&D@b¾wJ=}0¶uHªV3d¸ÕABFh1¿1?ÿ^l}·Ew¶2aWéKÀ^8¯~_ccÈß¼?ù2oÎªádgPâáa=}Ár=}Ùø´IÇç,×ÍTjÒtðÿ@^ðdEyh<NvMr'¾Ê¶7êp5¾\`ÃÒ%SíÑ[È³¡·u<LJ«®Âóí¦ËÁ<æ¶:si_~EöO6ÊbUu®®k¦aÇÿÛdÑ=M6ÍóË½\`64bÙB±IÀ®ÁÁî§D^ß(ß¨z%>¾ÄÜè¦÷ÿØÎ2lÝ¹ËøbµpìÃ_ÝîR6vÑÉÛO«ã!ªÜ¯	{¿Òi¹Y7ÇÇ|Y¶6òCÐâðòÝèÆÕ	|55.gØÙ=M:lõtà×Øàj#ìØ¢¥Æá\`lìßlÍ§7ÊSCöûBW^×R=J¤J´pJ\\oMò´ûÓu_ß^ªÝs]=Mí°Ê5WÍ	Ììk=@Û7c!B=@üdPU2dÇq¨=J(cnØP½Ä.\`¼¦ÌrøZ«£'tâôÛ¦Ç=@ÕØ+x.O¹EÑq¤Ý£òD£]!¼Òé}rÐ½GXô¿;pÊ¬ó+MÚ4W6¹3=}9tS]ëîÚÁ_qq­o»ÏCû¼ÐÅ'?R¢?RËe>Ìà¿=MWèÔÑ·ýÔ=}ògq©ÅÍâå¹'=J%yF§E6~ma¹©°=MÕÅ	ä£Íî_siz¯¿ÈpëÀ¡ÖÔüËÁ¸ÐÝmÅqÁÏÞ6=J*jý!Õþ­ôö5k/sà=@ÙéÌ|y§°ÀèP+Ä=@(emÐ¹Ø/»§aÅÕ5½Åå äÊGrIV#7ÓÓX_·Ýp¡gE,ürø#ïL¬©¿¢Ù$\`çw/&ÐÝPd1KËKwY­Ð}í'¥eÞdÿ¬èWè:VN#Þíç=J°Ã~ó÷	ôûBäC©ý×+H\`{NÜZ_d[7«ªÏü>´B¶Ö{Ê¯î[E?}±ÚAË¥æÖWä9Æðô9¶Eò|-n­0zM;Õ=MÜËTBÍ(U÷0^sê5$1c\\ÕlþJdÔÐû¥¯]yÐR,È¨´ZäcíÃ±w(6!øÈÏ<¹mïû4:çüÍêáS?oÁ¶ÐtÄÑaÕåmyÊ|ªÈ¯U»±ÅõN_.ókíAºcþ*äß°EúvâaPcðù{=Mh®Zó0!6þëÂÃÕNñª,kcmQÎ-DA¶\`j]QÆÿ*ÖÖ·Ò¾Âöò°ðOõaÒV©¡>Ü¥M:xûQrBùõ²Ü¢hÌÚ´gK{V$wXxlgÃzüÒ=}Ø#aÇþþwâsjÈ³Å|[ÙD®t@â{ª»O|½û¼N~lrÊ%*·~lü\`zyÌçåógyØ£tê$25@æ@D,µ¾6óªù#¡×{'ÃWÊÂ62n<ýln=}u>ß?_×¤=@/u$ú&R_Àmï¡ôÁâ3s0=}­¤ÑÄ©Csé÷nÚó­¸Ü¯ æö0ÉÿSBÎóÍÕ,!óÖSÅ÷ IÃ¡ð\`d¾åÈ_%o¥=@E3º[¢4WøiãûÊRÊc¼PªÔÊ®/Î°æ|z6ºÁO=Jve&ÏÀôiª ÚOt=@üù·²õsg©?Ý7Ãs0U2¥	BÀP»'0<GDtQ¤%Ú¨¨±ï$áé)Yt'I©e)æV«)÷"tIvèÁÛÊµ·ÚÔÀP*úÞ¯B+D¥åÅã ÇÓ,×7	´çáäÞáà©]´ÕaÿÆÞ¢·_½ö¡d×Á·GÝIßßÌC×ØÛ>joç'©U9Fç/¿ý6úêïI{RùÚ#oÇ~â#g{ëÌ·ÞG^K¶É6[ù$Rç¬¡ º(ÄSÁú á­¸á'<$ýØÜ.BÅÞ{AkWÎPju@<ñ3Èvt	ÌvØ¿/k%ÚáUPzy1YnóN½=@¨=M#&7V=JÐ[[F>MÕEJÝ{GÜ=M#'ÁÝ'£# ÙÕrUEÃ}â'£¦WªÓtÙ¸ÅX_Þ6?a¨ÒA¤Û<$pÂ"ÔÅLQ¯»>B|~½ôhëwØkCênÇ8¢¸¨üAvÐ?÷Xà´¼ï	\\ÔMä½ÇSÖÖÜòÛ¶>ÜÎ ±ø¹[1gú(sçwAdà¼)ÇwÅZµÝ5WXj«?ËNÌN)ëlÑêIv7m¾9;:¼&Ww-5Þú!úþsÒEvà©1Ã:ó)ÞØhOHa¸HÆnÔ1ÑðDÎõâ¿ßHTçÉðã9¡ï^´4¡$Êç7þÊ*ç²Î¤É5Ñ÷^TúôHS°ûq"dqâ³·ÇxY¹øPýµEÕã$ð 9ýËðõ¹ÄÀÒiæ|ªÑ¨wNØ*Þ8zqÄgÑ&kdÑo¼'¦nN·ÈDIûª\\=M=}ó]äçêfÍÖW¼6§V@C8$¿0ñÃ&éUÃàr2ÌÓeÀ)ª'1ü¿_©£Wé'RÔ¨³gs||üua{i®^Àà:Jyä°ì°M0{¦jÞ¾éÆ$@ìx0°¶æDéCÅPWñDyüF~úPÊÚu=MÓ¬=@æú¨íwÖîI¡_Ë!.¤óz¹Ó%¹¿@cÝãÒÌÈ¡=M÷S7õó ¤ð:ÀeiÈ¼[9Þøæÿ	¨WGcÙO6ð^Ug¹ýä><gQûkZNÿ&²6ÿ¦ïIx·t =J?ËäÇùn	H$/ùØÙðáúä&½Ó&=@ÆÚ½áØæIÙp¿t/5BróÚ~¢¤sîÍ]X]«¹ÿßÿ"UþãaÌ[b	öD9=@üïÚd-äÅ¿"×SÊEóÅéHÝénÝ½¤eÐÌáIÿdð,t('©¬t·&íÉD1S£Ò»+¡EïEÆ&É(G°0Ë<SË³Á=M¡Î¦Ò86öÕÈáùÅ(dç=Mßø]tyÕ( Õáå.Ì¦?­Ê AòÂÐ?ü@Mk3-6b_Wq#°CæS¨ø4êç	jmTUÙ#!èû·é02ñ	åã)ë"=@Ê¼°â/p´k=}I¶@ÍozGBÐ¿$\\Ï¼·ÏdèòÌòX5ÆàhàrMÙ×5ñí&G>mI{ôr¼pkfýÙÍ¢füTÉ:ÝpnBh¨_X]\`Ð¹Ù¬ÆÖªËâÖkz¤4ãùwÍ#üv]ÅÝ|'Ê°¦´µä÷Sñ+Â²o#~êñ©ài)) ø×Óæ\\Õ %)¥iÄWa½axlïÅ\\#r¿¦0^£´èàc)g¾"O>_¤_($VáüÿÓ&­§§êêZå¹³Ê"}H(SqßÂô<·é9	¯TÙð	Ô7_ ±¢QÊ=@!¦ç¯Ý+µÕ°MÈK¤ç^aL¯oÿ½]YòñõÙ¤HÍLuÂ3¼´FmÊ(=Jâ]ov,sõ2u1Þ=MâièÑ=M8 "7ÕCuµQ´åàá=}L\`:xÒúÔ?û[¼ì$áéW¼Mòå.òÃQ·öâ3ÑWÔâ·º×²¦Ã÷©\\ÿ½"4øÂ"Æ)~ù£¾Z²-Ãã8Zì7¢ ë~[\\¶YEòBÀ¶­¤8à;)ãÖhiÇ´W×#?ÔZ]ÒªóÒnÕÎÄ)coÞåüþ·Z·§»óêÖ³*Ö»±ÌtËÍ=@·)5z«tÂñ@5tz_iæ*Gê\`dá3ÿÊ+­m\\CcuÿC0øÙìúà¥÷yåÁ¸ÓÝE¤³q7-Åwnê¯d©ÃaÕçÎjW¯E=Mý\`ÊÔF0³´+þrA~\`.º Sçl	©ZUÜóó9í³@ësmÑ=JÜò=@UºÉK}ªï:î©2®qF$÷­U*ÑþÞk42îÚãP pG·;4&qÆé¸Z¯~~j ÍwÁ^@BÊÞ þþI¬ú©'Ú.'Ä"é¸ÖF=JÒ$Çª;IFçsÂCùÝÕ¦ :i*´vÈ3©*s=M½ñgD¿íðýÇFóð4àßúÊÊ·5bBómAÝ«§Kt¢¬&9¹¤çÇÈUî*sPÚ­·ÇØ¤öXÎ2 öiïì>.µÛ,\`$Ø/(Ën>YF\`ºñn»|äm\\Ce1 ØÓ¨ÏÌÅà±TêÅ¥þñ9h&m>	B\\ÑìöMYZåp:Tc^LÊ| ®ÒJ½Äfw]âwL|4²x«öÜJbè+×:5³[íuIÔwÄç#àôþÊýåT~SàökÜVEýbÕgô&¶F9ßøØåèwJç\`Æ5â¯¦ÄCl#{[Øt¨6;=@5rR¤n¿Åb'ÝmÚ\`·)h»³íW¤äïÅ7µÚi°´Å©Û/däÒÑÏU¶\`Ôèæ¨gùàî½Ì#w\`"'ß&qÙ³ôàæÞÈÙj¤Ü·g¨ó³wÝ*x¨}BÜ×D=@?Ç3°Üÿù[¿$<=Mèn;¨@¾\`âÃ©ÅÓÔ[xóíÆuáãðÒL>í¬,OAUaÄ.&0\`·\\ØE×c)Mþ$ç´#DV	°ÜM2I=@&lÐçfÛÀa:1d#rbÅªÚÛ¬=}¬æè=MFq¿­ýS'\\~ÕãL2n{Ç~Ìæçç_»n8,áNMhè¸n\\×ýõ¼öqW\\Z©ë<ÖÑ"zÝíÃØ*¨+Ë£yEm±)3÷W­FÆ«« ãwQÑý#"dp¥æeÕí^_{+½ÝçHÑôÎÅ7OÝÞH´ådÅ_X§H^x}²­wþ»Fb»{þ½ÙÅqÑÀëáwKiY¬g<¤KØ*{LaÕ3·z9^Ø=MaVR8·Â@OpçÙã÷§¿)LTðªJä-'Þÿ¯?Á#=}Ì8=JÓw*¯¤ÔSjáßGgæ*ÿ¨lÇeØBÓi\\¾Õ%1àC÷há-ÉÃ»´>XóÑñ!mjÉK¿31ñß(ãú§´"%¡IÝéÃIÿõúÒûëfÍ2rà[Ûë5L_îÃÐS©µÈÒó³ñ­þ¤Ìî+¬ÌnwON¥9Á!0Î\`ÐjU27xÃPévÕa=@õÐ/}L××KÙnÍ/ìEü¦Ùvì¤z'°ðÊA¢îNÁZÔ*.ü-³ð°ñj|ºÒ*« 4j>	#èSø<ÜÀJ|Çø²ÿ{áÙxOã«Ô!N=M=@!7=}a¿íÏ	]íaQ:8Só'<fA×Ã*0>ÅÜ#í}7å.-Wt4Óú·ß±³Ù57j>{óöHªÃgÜFè/Ônþ@qÍxyûÜgûÿÑïðú&­ÜÐßvPþ¦¦Ñ(AÅeï&%ð}ßfÓ©´ÏOrÎç	òéSÕÁ	Vçÿöµ8Z³­\`ñJìºzxÖsåaÃlPú_r¯Þw>hßn¨ÃGáÞð<~%gÚù¢ÍR·Ò]t¢­uðÌðôeDBXHê3´ÈE5ýre¨r§a,	OÓélÕÑË®¯MD­ëN	¯âKók=}eàqÖ*mI¸2=}ÂÅýzÄö©	¯f!½§Diß0¾ ß#ÜßPëüj^¡óuv#ÛhäÂý¬ aò¿>¸\`wvë]±<=M^!Ñçª®{T%û HÍÙÒ²sâiõ§{ó	íxskªATéyohJo8[EòP«ègöUP±'òéÜVÕåaÐìHMS2-hT<ûì­	ÕÐßSÇðmVþ=@ayº-¨%·I(=}vN))Yè«³nì:¥&¬¯~õ/ußxì0N=@ÈâÓg N»BsO_-eQßïxcÇÈ¯-!K¾*(&¯Ug½¦pJ\`¢gK?eú}\\¯þÎé¼¯\\·ÒI¼1)À¤ÙæÒ?ÁiTôÝãõæ=@mT7²6a±=M¼~wëk1ÕÅï¢iÌ_ÁtÚ«Ö{©©]Vu?=}ðPÐJCÌ·^	/Ê-¸{¯mô»M1¾DÃEFé£}@5$TÚ.=MÐ­¤yPÖ´k»èöúE}=@5èj/ |=JzBÌz=}w|AgúbRÚ²è ¨'ß=MÅ	"÷&Aë_GO1GîiMÿý÷¼=}­ÙÒ	õ£­ ¤caüõph=@}q'¾ävÆÁPÄ0û8Ø]ãi:~YÚÐ&ö¥§ý«ëÞâðÄ£O¢öõ½ÚþG+cOúN4-xèì +ÐÓKé@-ä0±}VìuFä±Íùów/ï¹þ¾pWì¥<Ñô+ö ßpçN&v]eI9xÔÓËÙx[¶÷jL&XåbÜEzªêhRaA=@·Fgç¨úÛÖÆ)ñ'ÃmBj{+EM}ý7=Mâ[¢ïÅ2_ÄJå·÷¦ê¡RÑI÷ûy{z­TÈHæBg\`NfÄC|mKç-n]T³Ê¼­±^!pn=JÓ¼ZüYdéúb ^îyëä1ºwU0ÐÐn{öõòüx1·ú¬ï|\\´éspÛ¸_ÂDù¿è\\jÀ¹X¼duôâçûuz8Éo8É-P8©gÔí5SB½ø+õÆ²¢4Ó^±L·b^Ä:;uø¹\`P­(=JÀ¢æß¢BhØ7I´ñÇÕ¢åRØh¦IhØ%; Ô3@ÖÒæp.vÛË¬ÎÖDScBW½µij÷à}f &bWÛeþö\`Êy$¾ÅEË¨8uÔíä±¯ª8mdöÎ±Ât!ºÎ9ZÈHûË½hÌmU§~±päÔmW§v±t$â8¤l±|¤\\=JQþ"QUóEïa¶¬íkPºí;µ»ûs"QQ_\`jQ'"NHºc:æ®QBðO®YÔñ±ñí=J­·ÛÝñ&ÝS ¾éçd¢OÝ¹8ÉgÉCW¨rµICæfÇh\\¦ îiÕ íÀþù±1ÙVêÕ£à"ÉQ6Aç ;/ºØy³CGøv Þcöey%¡89u¦§97¥Ö=MÉGBheZ¢=@ù 8ÉGfmãÔä´=JÃ\`NfÅÂ[ù4Îå^î=J½¢¶w·[)ÍíÍâiþ{ý(o£¾W]§fD¢@.4¡Nò0÷åØ !ÿuÛV.=@8Ö=@à{0õûÙÑ°*#/vIëÈL²h&Á=J®1·ò}e^BS ë÷O:=M<\\aÃÎÞR(þõ ¢³Çh¸s\\ëDß.y1ÝAu¢|ãQ{X"!5XSrqÂq½í2Ò&u­ñ;MpýsµQm±9{ãRcF¦ºK°ëü>_q¬/Í ÿ.·¤9u¸?5ÅI#ms{W@¼Þ3Ýà³Ë°b÷ªøÌAx×ð	[ñü>¸ËðÛ/;@JBIY!\\ÅCñ[0ì9DXäÈ)ë±OSöÒÓì¸z¼lJ_ªKçè=@ Nr5ô.áÐª­E½¨smxvI]<<bÌvg=J8GÎÍü\`ì*:Ö¼ot6nÌ6¿9ìjªñ9ëaÇ;Z+ÍXðÛÛì#=J	0l¸#8Ø(4¯é´sösÓ&ü¯KÁì~Ä\\¬Óâþ?Eaîkº\\ô¶\${z2eò=}æ¨cµV2Ç¦ýH@WÀ·yAJ¢²5ûëF.Ä#a7¢Á»¥xEc'Ú®£IÕ9´áíAÕb8¤	ÖÐk¯ì(8|67ømýïP¯wÚª ô+\`0H}fWN1zÈ¹SZB'~>ý²®muÓLÅÛRôdÐO>=@Î!t3?¼[u~øçþ,ÚJÄ¬~15(2\`wõÈÑÇKcÒGz½¡!Ö¬±'ð´·»ù¥:æCfùÎ!zýªsI»°5d+8u,bVìcVòv¤±C½FÐüGdN Gðê!cÞNt²sÑdþFTÚ¤8[ÖÔVçè¹ÒÂäüFàkæbb2,b0\\7¿C¸=MHW:¤ê¨NÉwÛïÌ{f¥\`îf¶ÚKºj«k08îU%g>14ù,1\\øW=}b¡hæÜãäÂy¢@ Käæ6Qø[¾¢ïËÖ§í!·Úm@á§tûe°ù >VDÏ%ù¹>ûQÔôÐ&ÔYé£zùõíä3ù,¥ÈEhÅEf57É/Ó{Y(Ã2v¢P$É¼é°$Ý4êÈ'ëÝúë]àÔäzaf¤=Jû"8Hçy!f¹°>Ùä[CíhÓh4¢Þ·¿L«SÊüÈ+ÝX#öyqÐv-¸~ïq\\Yòv+<y­ëEV×{ôêõçq[Õ_Ò\\öY:Ûbß9IÖËoî°Æö	A Äö(}aÚEÇpK^±7lRGèÐÙ¡Í|ÃÿÞ{«Ù?Ål®~·ó¤LÌQæ:gÿ|a¨n$µÜ·Êºv¢aUð\`;N=@?rºV&Çx8¶!ö·ÁµÐk©]vçKIV¶7ñÉ@%FÙÖO°óù:(È;=MhÀa;Ñ\\²"Âu=MÜÐ}¢ÄéöÉ-9=}JX>i\`íæëðTElSÅÑ;©X°.ÕÒT°8ÚØÄu=@Þ5Ì~Q?ÿÎî¼÷=MÕêÙÐtNéá=M=@yàf©I,Ó×n?çÞµµDdÍ%ü=}%?nüëX©ä,p®º(ÔpÃ$ÙÐ]d¾CÃpÂ:ÆªÂ| ó6=@Yö¢/½ÕºkVFøÑ¢6S=@æÄ=MGàþ:CÎb%@¬ab¨zÜ¸åö¸ *1l}?<¸'±'è+ß±áÔZo×0VÝ¿áÅI6@ÙAnÃ×¢5)¼dL.±Pï¨t[v!=M×ëDù@kYÄSl0|cÔ(ì÷-×Û.Ë=JQó\\Æó=J[pöX¯l{§îéíW \\j×BæR2ÃA:»Ä8 VVZÌÔà\`2=@ÑïkÉ&8GvÖ%§§ú7éß)Õ-§Q:eH¸wa~~.Cì¸Ýé÷´îÌs°_¾kßÝöqªGÃê~ô¨SÏ)ÄÖoÓ+f­?ºÂ¯ßPÙ9É£<Å»ò{>òD;o¤ºÏcÆ#Â±>Å>=J=JÒ+W_RU¸yêâ¥êß=}ÁÎÕãÙ6j!ªC~fb-êIR"hÈ¶E¿¡xïûô%Ø½¯EAªük¼tæ{:£+í¤Ã0çÓlð»Iå{áLYýä!¢ÑQgSìsvåeë¿´æÙíCIw{ÞË4|à_ü¥1?wDÏ[![ÒqyÒ+ì=JåÙØ±&åH¢þ¹Íê=MÅ^7üÖÈîë¥<´$¯U#DÐ6=M=@}´Zñ/HQ»:=J«5Ú¡âå5AÞ´5øâ¦´ÔlÛ¿lÂ=JËá®,·ßÑã]^ÙqH,ëVBDßÑQªtcÀÈàºé}ïÞë3åofy\`{ä]¢;H-ùQý­ï º}ß)ÿré¹Z_Ðù)Î¨¼êú3Ü=Mj´S¨âB!7fÚ£Ròï¤x|ùÔ%y3Áù¾ð½EÁcoV:»òG3ò\`\`$NY3Àr¢ß#ÁÐéÍR£Ròñ|P8ãàÞ¢LjEèÒM´Kn<?¶ßî«MH}£{²XAARßøÄ¢ö­Ö¥xM@Ø´wz=M.¸!óðNÍÞ~wÃÃ¹ÞæøyK]²æZAPµõ¦¶CZó+RÐW,MÉïK'Âv=}a³yÎ³¦±4@ãC¼Ð©=J©Kf(Üg(ªJb)ª!ÀÏ}'¶bìgwRJçïK0fîÕõú¨ô|¬&å[ðnßÕRF\\,J¶=MzîþÚr¢".¯©¡ÃU=JTm:ÄqZ3÷èØ§ëòBó¢fX§ÉP÷\\âBKý±¬Zöã(eõ^=@¾Iã+jZó¨E'Ú6m½Ý1D£"édÞ\`æUÄ,}¬ªDD,÷öAùñâfMÔHIjãÇ:ýskmß£ÙoØÙf®=@8"=M·L3¦ÚzáÒÆEå?4'¡§Næo\`ÛÊ(ÖÐp»>zõ©í*\`¿l¿n·@ZùÆô0=Më¤Cà4Ê½éÀ^ÄÄOU²*!â;æ=}ã¥mðN¡YA@oýs²É2íïE¨ÃQ±>äè½zÎáôÑ¿@q-Pç%:=MÑÜZ0lÀÈ¿û[ªjjò&O ¹=Jã-Lã%LsÌ©ÿÂ9]Ì#J°¼=@zì¹EbÙÂ	ºRX:>ªÑs+8LÅ§ùØíá¨©ú))Añ!(ûûéÉ¾üy{KÒãßt}	ti§1èJ´5hcBà{&jJ&ýiÌÑ#ç¼å)® OÑ§Îr³{^ÌvÉ°ìk%xQ3{kvà	³ÍäÄåüöÁ³mH\`ÃaWtï¼"ë}dD=}Û"ÔÁ;z¾?ëÅwîÕêÃgÈ¸ÂôÒv®Ð>"¢(Õ3(|¢G{x÷µÜëë­|¶ßªëÃ{òOy«ñ02í+{Ì ë®sÓkÏtò1Jï.Ô¾XªJd¹:*~àßqý«rÈ$k²§KsZ6+º2¼Ñg8-µrÞiÞ@m 5C½ôäØÜ*ð¯¼¡Ò°~vOiïá=M©=J½ÂÊ>ÚöBóamG©£]îÏÓR0CyLNÉºßOé-ïÐîMºT´ÒsÀºr{·0¯sùXJ§ N.vh(®p3I£iÕ(ÕéÞÐ¶Ar2)ÿÝÃÝ÷Å)÷éL\`A×/(#ÏIA:g)tæ{¥ÿÑ;ÝXY%?4  ¼¾ìçeÒO&¦LËêC	vôN0¦ô´k6wø£3qÐ%=JâPÐSåæMÏªEòÞ|¯ÂV_®ñ×{GCSáÐcK°±x#5²ÅàbLñ~\`ð¬óË'ÆþËº>N÷âþ0o×1	åÊ¢útT«c¼Ô8öÑóÜ\\äSc=}(.¯ÞUS±øu	¯^XÊ0*yüw/®¾k*üÆ*cøl \`0OãRtQ¶|>Ê³B~?Ê0ÈPÔj%¡VúDSÛ¸YÚºöÜkZN´Ò°:õË¨Ûx'B÷d6^¨\`ÍHCPÊ÷ENíÖnt8¢"ê	²=M4#ß VwªãñÄû·£*[KZÇJLdøGrÓ£èmä¯WÃ.Ñjn/¯îÄ'oS¾3>O:æ%»¨ný¡úRfsèüB9¬ÔØR©)©µV¹°Î°=M)0W.\`,=JY\\,ªÏô.nÿ]nÃwnAzpEIv{XßhÒd»êcKæîÏ¥1»ÿuX¤ãà?NM¨c:X5 h)0|J\\|ÖV/Ñ5DÒ«Ãy¿Ê3¦zÈWåJ¹oa%Ö,÷|Cé}O¿UÎ©OºUTô(¯%WèÛx¢ë£Ý?;ÚòÑ¹>N\\ã¯ 	LB4§Ø ÃYÎmºmeàÁzk;ß|5íÏ§M}þkÒð´äï¹¼L£õ¯Ó©{ó?°K5±Ög=@£¨(ÿ#=}aÙp28<êw¢¢î=MÝÏËk~=MPY¾Ü¨:Î1øU®®Î!è^ÂI7ÍÊ%¦0V\\ìRÉý8¿£bÈZ±DÖdìbyì6Qkø]àGnî¿(×»R%ÞÑ¾o½êY¢îT·àE9çF;L¹¬ß&ÎÉÀrr¦W®Gq0vO$­g+a|TÒlÒýù¯HölSÞæûz<Ø3ãew:í[àO!îòÄ*=}ÀR}Å}djð§æåpø|ð?Ó²ÞßË§,ªã9ÿº°¬÷R=@2®¦7ûÖ87J¿MÑ6#y|Ê}GùD6dõ¥Ûc©9o\` qÞf Nj¢)r j.ý0Ykõ]SHàEJC@=MIñK#1æøÜ¤Fâ_þp#É¿U|¾Éq|açÒ@²+¸×mqa}õ'¬WâéM¸º¼úgøntiý©ª\\:î6³ÝuÀEò& ëÁhý?|½wNc'Í¶TÓ(ªÊOâBÉcLbìvw=MèP4=JÂøÿýWNW±Ö¸ rÿú	b2¤îÕô%oÿ\`äÒ?ÃXº0pJLx¿Øw uW}2:Í¸ß<)N}!âÔ£ß·pôÂüo®×N5"°Ó±ý1F;	ú¶ZBZ~p°wÄ½¼za\`Þ§5ÇpívQL2=@×ô¤.*X5=@7\`Ô^þ6SÈGðV¸41E1=}Á²XSÁNm&}=}Qmó¬OhtJØf/Íw4çþ²ßÖlu æÕY.û/sso=M<xp4¥-'¨¦£#sÈ¾c¦æ)Û}Å1X6D?S*¼6²¶Õé%©hhlY=MÃ:2×¥ÖóçÙNy"¦AlÌgT$¢Ûù©(D8*D zã¬ùR=}½¡ ¶/ =MþA¤ÜWåÜ°ÅU }ù>áã"A&C?vüÉË½¨p±p$æ8¿Ù#ÞY®nÈn¨g¥õ§ðâÈbÁãAïãáÉêèºhÈs^[çÈ­Ä¢ËÊÂÙ²:$Wß©M©=}A+õ4Ë.P­¡áüK¦¥Õ=@¨=}ú}è;¼íxeþ%§u|õ	QÍºYW"T'Y·°×^ý]uO#	µ<Ú«¦ øçOqÝU¡àTyÌÍØèÙ´ÖøKQBÀÀk=@õ4²½ßYt< òÓ6Z²®ïÍë-ì¶¿§q]¼7èwH;T'ÙE(0âé:Þp+Ø4"VVùÜö¾&I>àærKÝ5óXTÏ|KlÐú»£$18Fb¤£ïO¬T­Aµ¥ôEVkxsÉ(·#ÛãmÁJÑ7òµØ!<«jÿÕjfrü(Þ0Mµwò=}±IVK§páv%ÞFX®/ÒI!{çþ±-ðÌÍJèRJh>Pyß9É¯.l\\6v98õÆlßÍªKÃÚ¼,vC!îqf;V]QBéR î}¾ÊôÚ±¡À5Æ®c)Ü\`}çNp¾YÖÏÐÆ*£ª Å¿®RºGO|[ì³è	{Ì uü)=Jëé#ôXïäS½Ëê=M=@®yN15ó=}äUrï»ßºhdò.Î6Nc¾£OðGQ8Âß:À9s12>Ì1Fz=JÅÌ8ê*ÏAâqW|=}ù¦ø^Ø\\pøu Ñ¿?Öq»M'Ê§¾Ó ÜU¨kî¨uYC$&ïÄ	«kW1 Ê¯Î¬üDÎËïÃAµøµÅFZâLÙªZ*"àXÔK]Ú9¬çv'7üFºSF9/yÉ;¤"ýum¿ì]ôh2LîROåÉ8]÷é®áîÒZûÉ%=M3xn=J=}xy®V¥ü§srï¼ÏCÔ¦èÈ#üÙAÏù®ñ,SZÉ%Yòj±oÖ?UÁovJ´¶»µ&º;·jB=}Å63D³æÊm0EÊd4Kì¢.îÏm¥>û,$$èyÌ9\`=}]¶?/+]ðdÍ5HÚZø¬ÊÜ*XÅ=}¤ûn=JÐ=@. .\`}8ßºY!Ún#PÓ2 ~½2±\`Ñ/fÚêëY1	b![	5ÍïÊbíÚB±ïjÈ[8µ+uÛB\\êÍþé7ÆÛ>Ü+/<Mã/Ô(Æ¥=@WèÂgíïºÃëÁÂ)AnÁÎ=JuVU4Dlë_J>ÞaR	®a"ë=J·e=@×C[ÞÈÎA«¨ÎßêB§öJJýAE1ÚBà\\#=@û\`¬tN<½Tªâ¯¹ëÎöÙöJñ6®HMÉC.Í>¥ßÀîÊH¯)S§27ômpNñOÕ £bßùÔ¥[Ge¨¶ú¢÷ÜW|àAéÂÚ*¿3WÎet¥=J=M®ëö5Ëä¯§¦mOºÕ·@C}.ë^Î-¨¥îüØØ"aß3¾&Å3dÛ¬×ïàâ¹¥\`­¬ïqîøÞ+s§(FBm|,ôû'ðçø¼Ó8Ü$yodõpk²}2Ö¤X)[ò)3½ÒEô®¸Ï·¿cZlµi@Ü§¹[5×óÀuðTã¨õ°7÷9=@a¸ôº[ë2J{(Ì	eÐ2ÃF0;ìz¢ZUÃ!"®êV'Ü|÷òã,WbMå\\ wÏ8äÍ4öÕbÄ<^[ïþHtç¦%|N Ñ¸¢¾þ{~S´×Àva]<r.²°àÉhÓNv²¤\\!¨@®BÉÏÀ9×UW_©'HQSáö&°lHÎ@s¨w¿gâ52ôBï§m{Æ=J´í!øh]Û3¬¬a¨wreºö!£@÷éÉ=}§Öw¹ô£v3T¡(ÛH®¿&E(¼ý8ÈpÉñÀúf'K>Pæ$&ýÍ¦AHðÅÂ=Jw=JDsC&z[?é)éA["Àx§ø$\`ÙD=MeXUú®ò'ÖyªJÉÇÿNXÀ¦ÀdªôwºÜöÄ!8a[æÖùmËãCÉÌÒÙU1©LhÜmRë"% ëcÍ~ïÞx25øK-­!M´ø<P§¹Æ¬ÊY¨=@ü%\\%órz"ö!t¯´Æ	ì$Np7d¡5æS/lIõÆèR­=@lÕS:bºÕÆHì×5èMÎ;aÛV·Èbz÷¢¨%Ií¥#2;j{\\þUÎÝùÞÂ/ûF¤¾%PëìñÕåÇ½óäãh\\Îvõÿ|#Õ§(wYEy2½©"hÝKEo!Öõ'8EµìJO_LüRë¿C¬lÌÅçB¾G²1C«Îu4@[¯>bS~>²=J¿Î³Æ7 é%aÌppyþ¥tÛÀBì ÷Ör8î¹?ºrx©é0½[ü[ô¨	ý ¸vÚ3sÙÅ&K\`Å¼ª|Å\`î{¨zLÇt¾°X©ÚòçhNmö¨??ÒØïÍXÒü¥IYC*ÝÖX#¶Ùîü£Lßz@õf\\Ì¥\`êæ.7{lÐ)$OOþâBOÖ®GÄÏ¼¾¤~ûÑg¢s©À]Î)µÜ¦RµÆJ±oaÐf¾À#-~ÒdWã=@¡Föûaô#\`^u¬=M£_D´ß@7ªqÛqG/r¯3~Ü¯ÎÍyû	cÃ°êú[ù\`1N-¼!º0­\`:9ÅL°´¯0¾é(¾þ/peÕÞÐØnTï4pÌCK{¥ý¾cÂÉ4[¿Zü¹æµP;ç{D½±IÔÅj?Ý=}EËQ#¨Î>.ãõào,(rx·»ü@ªÊÆH>_¹-ØÝÌO¶(ÈÉ=McÆÃ 3ôÍ=@¿ÀxóÞXkê¦ÄÕóeQ!V¯%§'kºH"I>dðð&Â¾,@ïOð¤é½2KK'ÑOGüQ0A¿GrÉøÝjõ°n=M9?ê´PcÑÂªbÙÉ=}Ì¥ª1%¢±2[üP'ÏÑhÞ«´*8-à=}Ü>ÀçÕ&äæËKÛ/a=MkÚöÙ*hÉMÆöZQÓg8¤5Ö×êSýXÒ[ÿù3wê91nÎ.éj§ìVRúÍ2=MùG=@½]-9,;X@*D¼ÄÅ"~ZO});csNI½$?^rb*ÙãXõJ»þUûóØ7Ä=J"J9*ÁüÏÉ<êÄh*Rõ+{ø¶yqH+Hd«økõ/áôKþ¹#×¢_äKècèÞ#Z¯UÓ0n'_»âÌF0ìêWgOF·Ë±0n/o°Ñ=M-<¥lzÀÚ+rI­c¶ÁØq5ï#Ý@++Æ~¢®±6Ctì[Ä"'ö-tÞQ'=JøÝwIaòîQ$ÜUt=JÞ+HÍq9#ú69÷¡=}ÖÎd\`Ó@¬ÒsàªE·/å£ZjDB|ÇH:Ã¼Ãö¹´yÏ¼ks0z¸®âÎÍ=M¡7Tã¶[JH^dg|,öJjFÿ9@iûbÒÙ® J¸Ù=Mà£Æû ú©§)z0ôùÅh|\`j\`2\\	*U7BlÊº=}¸[Ó:O}îää]º¯AÃü*Få2-{88ãRnGþ j+y oFJ¯ÇÒOAÜæUõ,?e¼?âp~÷ÎË¶§T6gnCåÄIÊµ|~KåÚ	¡AÐ¢r]«éî@¯»T}µa^ºmR­ÙÑøÁãÖ²z¦fö+¾ÿKhSa®»nü+puªY©ëRPÊhíÍÐËkn=@êmx3V9#ÕÑµ§.[²ÊC\\zû*ùM'@­<#Ñ¨^¾Z¾7øÍ=MR®sÖ³bìæÖJË²ËxáoÃ±²=@MØ¤S´µ)1Îr2ÊÝ¨Ci2ü2(¤Ü2ïËÔµÁF=JÜî\\Ö¿ùn1LösqêG¡àU">NÜ;´º¾¼SsõHMXÝlþó*%Ëì\\ëBÑL¯QkÝn«C3ÉÑM}OMCkú9¢=}ä<4TD¢3cù·W%øÃ.òÆÏäÔµ°!JMCbb½<6\`/ÜÃãÍ~l©Õì\\/	û¶R~©ÁDª­´ÅÝÞ·²d©¹ìåÊö¾©5×mUP­«®n7b6½OXaÖÄ°68à8Ã}n½EÁÊÐÿ¼]«Îâ\`ÝjmÛOýî7\`/§]@êç«YÓõñèo1ÔzW\\c#ÝwLDnMH¦£LâhD¹ß~Ä´Úµ\\Àì°Î_³<Èk82ÌÞokÈW\\6!gNª¶Ý×,±OÐèîuGæU&Hî;cAÎdïè×âÁ­Dx­÷1&Ú"¾\`[Ö*ú¤¤JÓ¾¿÷wÛ"ÒÖ±VCiîÊ§ê­5<Rw!«®LMgRïV½¼Ô-=J=Jõ¦Ós	ð\\#ëè>=MÜæ´®sh×Î;»¯ðü}×âgUé_ßâ ®É6åo®@1Åu­àu»ïÁßðv6;\`ÐVb9¨ªX+ GÀïàkº¡6TÉúÆûn\`'0ñBbêÇâEBä\`w.Å\`\\,gñÔCÈBXZjÄ¬¬É=Já(E[Wh4oMôòõýÒ,lÉ­ÓÁþÔk%Îi|;?óêÙª§|\\p ÈC_Ï5ujäßÄãI§Å9ÕÛIÚ%Ä-úK'À¨_[í×èûyax=}HWz2æÆ0Û¤M/_ã?£cª@ÑµÇmxy~®8á=}QvÒ¡°mæ¹ÁÝòVw9ðIUÔÁ¿ÚY%ÖÑ$È¦°Ü=Mhn zfFè^Qf=J7s«x ÝSn|¢üpÕÙßNdÉI¯º§ú9õ=M<_[³â$¾ætù"ôâ¶¸=JÁÍo AF~d.§-XO	6UèÉ­§ö¿ä¸Uc²J;ã%äPÐ.&ºÜrí»	ÇL'gOë¤ÿ÷õÕ²]t+-Ñ%±Ûð¼qX·ÝSl¶½$ËÈeQÔ®õ¨ |ÔÐ9ñ Ôì=M¾=J1¡,XîÚuÓËÌÌ¸ªiM]wñG!æbûrx"õhìýÓ !&VOÇÒLxåþ´6ÍpK8¾HøÛr¡l¬¸V¼ ôÄÕ«¥9¼+Qr»årõæÖ~ÑåÁWÀ>¢h ÄO¦7n*»,"æ£Þe&;¼QW6>ØàTQIW?7 ì4¸6Tpm=@Âz°}}£rûàk©WÅ=@sð»Vð¢#RàºÒÈÂWèf|iæ¿YlµàxT?=}iäh\`±:7 NÓÞ:óÑw0{±Ý-h­Æ1»1*ýÌ¼0øåíQ{GrÁï3öP=Mu£ cGÇJmµ³=MsRH®S<çàÙe±2ì&9³ÜæR=}å¦øºÿ¹²Ä=}gæ.É^pý÷Åljnò=@¾é7IÞ>FñgÃBcÒ³WÛ4$øÖ2BÑèwK]ÁÞy½¼u¨üqÅú¬0¥5©×áPxiU6üç?,ßýlA~Ç±FmmfÄö¶ûÍ[®N\\2}rË?Sæÿ´:¦~kÒÓî|Ó²bx\\mÑH»k5FzO^þ \`ÖJc><\`Wx3é5h].Û·3 mi u­_M.¸=JI{/VBÐ¿Å S_#H^NÅw|ÁjYnu:£k9Ñ#8Ã\`¹ÒXváî6IÔæÊÕtÆØªF<jwÄÝ>$RÌÚf}©»gîì¤4t¤	Fÿm#÷ÏÝôãÁUðXß_Â©´FzDo9j!ô"Ñý´xÛm#ùNÊs«UÆ¶MxþX´ß³.é°ß=}zµóÊJñÿa%-¢ÑØÊÎ(-ðj ÆÅRVÌOÀz'XsàñÉ»eXÄâRúÈ¢Ðü8æTRî0ÛÓmñ²Ëð¼Ûõr!¡k#Ý©LBÁ·L_·°?U<!=}§1{ë^%Á¹B·P9¯-vÂÄê­öqä<§hK§×½ \`Bçëi(<ýqCÙOVØÕÈUTâå²ÿÅXQÜÒ§kúÌ³åÊÝP6Ã2Ëhèçï|Ûee8¤0©º¯Ã¡¬NûÀ@Bâ>Öö&SdýAì]jÖ~ÜÑ½Üý°Vé¦7Éâë/÷g=MÂFä¢EiàyÉ¦"]LÓb	WDØß;Èý·ýj12 %¼«ø/xÎà¹ÂºC	1=@ú2hwFJu( ëEÅÊÛµ·ãïQ÷j×Ií:ÂQ¬ã>hÁ4Y-}Ç7nÝ'Àçìl'³æCLª;At´ýßy¦Hà|C÷}ßh|ÖÃ\\×28£xh8ø<6$þ¹Uç»=J¢=}ý0Ò¹ª5',à´ü÷ÎµæeÎÚ¾)r4eÒ-Ôpº5¨XWâµÝcÝ*wFj\\!S«¶ÂÝOlþbTAÏØ9(É3×te­Ä|¾òl?§NBP°¼ü:äñÇ¼'^­¼ôrÈìEý$rÈïP7gæ½;kÉyÂ½rë]#ó^W1Ýé3àÀ§úè³ZÛr\\ÞóÔ ÀyÓ©36¦Ê½½X(a¢íiB	!Wù =JA[ü"ZAÛöKÒ|³}5[º¹£Ñ6p{·éJºïuXÄöUõÖ/á_Y¢QÛV TÁ:oÈ¤@-ò¨!á3g&ÖÖ°äÉ'ÀðA"ú=M¸¤ëãØ#2%ÅÚé=}ø(Pþ#f]°VÒ'OºÒÅÃN¹Häb2n´GóT<L´/R¹;ì¥]Ô%ÌÒúpÐ)Ë&ò@ôè´N_é9´?øwöp·4ÉÜÿ!6ßL] ?msµî)UÇy4ÞÖ½¹%ù×1é//â&ÇY2ËÉú&\`0ùæR }#ùÛ¥.Ñ5ìwPcIÜ;Âõ.hJyð<I÷iòaâõ0q¥mÚa~.Þ¬cD¤ib?Ø:©÷ù=}¤îÇì­ðXø©fxþV£àCYgf¢ÙçéK?FT8=Jr7dFðÆÁW0ëÐb¼¥|;* j¡¢³ü¤Öåö|jß­?sìÑ¿%èÓ>kìÉ>=@66íÐm"ìfäë9] uê1SfÒ=MM\\õªÙ³¨ög-þ4èã=JµhSébnÂY5sUÒ'*X?J¦­è³à±ZæE0ÙN-¡IEùêÕSµÿ"çöIÌÂäfæÄE×C	Â§ö©r_!+=J¶æ1ØÂK;.ÙÊW!²ºÜ#/¿¬:µÅwd£2\`Û°®£Å 5=}Â.©7¢;+%gëí¦}¥·b]¯I%Î/h¹°þ-~4óDZ5i&àÇ#BW)R¸Ô.ÄCzî:ÀûÜ¬ðlôÔ¬Ámî´½L=JDÝÃ,°BD2ä>d4	ï¼ì|ü\\¹ÒÀ,Þ#ÎÓOÜù#Ö»o¢Ã´mÙÄ=@õF÷Ñ¬´LÏh1v0Iüº\`ty!ó¬&Á]ßc¢Y=@çÈ²ð½¬L)©>W¾©âöaªAc¬×!¤HSì©(i=}ë~=M[&S¡_» è'Q.½Àã¾©¹±ëTÏ5i,ÃÝt(çiµáÝd8éa©ÚöÊ¨ÛÌ¢nQ} _X¬zZÕSZ:ýÕ<ÓríýêWiLdíÉd=})=@E'=}h¬¹Bç)\\Õçëý½&ayõ=@gw¼èÕ=}è8NÏN¯;ÿQµ­wÀ¸ïËæ|^yc)Ø=}hÉéßó=MgÇó«'\`=MûE¼%pp6z¨'7pv9)UJñuyµé#ñP£3¦¤~%Y¨}ÒqK=JB	î}ýþ©X?-Z"Çî<½´øR,5­¼ÒEmsCX\\?ìÈ^À°èèô'²%´Þ]á]<ÕÖ±=JÐ»0ÖLÖI)ØÖ9À·¨´F,Ãtùî2KØgKCh9ïomëëLª§¯2}Ù5ÙËxþÌzjgc+¦üëüÛWjöÃGö=}ü] v9å§)§ìÓÛÚ$ú£VOà_à(ôÊØPT+Û>R+UY´R%¥RÜ×âÔeü<2NK®2k¬0QºþË¡¡Á®=Jsªr=}k­e­å7Èd®¡¡÷!ÑdKÉeùçi	Y÷s¡ÇdX%#ßKµÒºêºÏÑBÜnm±8pÊKUäÁg)òzöiÔÈBuþFRpí&§(cyÝØßP´on^ÚBÁ;³û:Ì³AèÍñl§%AH»3Ø\`mm«×QaëZÙî^úb©83ü½¨Æ,Õz6æÏ¿vðólÂ³|ËÂÔá²TèòUÉ÷ä)¿òkü$j£.³sq\`gÊ'Pú,6=@+.NH3{Q|u¼1Ì27Þ/#ñèJµ/þHbUº"Ì÷«üÐËu×³Ì³Üö^ëB4«3µWYUñ.«Qz³®·ç§vjQPvòB=}éC=}²Ô·3#	·³FõÂ½[kVð.ß =J]Ì@)wðÀXP=}âá0}ybìØGªnL¿E¢M¾ÓGk¼*nUg%úª²qä:bÄ:=JÁÆ¬>¯å÷aó¥.ü1Såc±Åª[e ÚvSJËIÚ¥YDh±¡\\ÑSÔÙÙÅQeó0EÊkå1ÒvpÐM=MnuÙ/Æn¼41Ä=J:ÈÿºE+Â@Õ.4ÿwÖp¤r¯D\\lÝ?93¢y-/kÎ¿~víÆ¨ñ»ò<1xsûw«ùKæOÜ|jQ8,ÇÄ0ªjÏópê |Ã4+·\\þ}«¯¶CÊQlâlQ,?nZnxØo5W1Í8æñKçÍËQÃT<ª@ÂêKÄOäÐ=@OvK×Pý¡ë=M;[Öã¼ô:W¾ -1òù¬âo9p{¯N3(þ).Lc¤:Ï¢Ãó.Ð-z]+ÄÚ!Jð!vÂ)übØ­F·ºjÊ^µOÎõÎqBE+¥ÂÞÀ_MÆo®ä'HÆB3g«p!ÍÞãíq³ZÚ©æª?³~¯Ù»Ñ?Ä2Y\\C3mÂY]cãJ/1¥)Ç¤jV¸kÕ»÷þÆÚP\\2ôÏr³úxÐþ:Sz;Ñ£<WT±çWõyèBÒ§)Ùÿ"%ºÍF¯¨N·è'do5¶0DÛ¬¨GK=MÊT1ÛJ18+P}V^ò¾¦J,Wåªv:=JHy¢Âþ²AjÂï/:)m;MrDl»öE¤±²3¼]Os¸Vj³dºá4"42ChëÍáøNx×:¶ìÐ=@Ó?!ÍVÙ/T¾õð¹,TºJ^m"Êkêú®Ä<ÒUziúã]ÿÞj|iÌßï÷q²ýNì;f³NÇz):³"*Gíª<Jr+f@BBõÀÞ(»5nr®¯µX%wL¨îÍ/ÔÍ~:ÙDåJÔÃõ<°,3û²×åýÉøäw^L_{àP«ÖnÞ£ÉV¸Qî4Q^qdX»îF­êDv_^Þ6²ãbbC:ò¬¾·ØQº^ÞË	Eï¼<­Pfj+ô¯ì¼.1^Z³áD2Er[dÛ§ï5{gÇòg$*ÉÍdê¥*k;¢=}RK.Ûád½÷k#®lg¾jbJ¡@BgS:ØYÓC ñYÍúI<:®=}¢m²z×Ê¤-ùøÀ­4WÄFä$º)êÜªÛ8ÚP/K³Nt,úÅz\`J@Òæ«,¹êìaÞ¨E¡ªìÝ4aÊ=@];Ä½ot^hpv¾«Y	-ûúO´ÚÊ6Å}!iDC;(¶ëØÎå6ÝÌªÓ/Ëkq=Jã^ÈÖ¨O:9ÀÍ\\dë[ò·tã³è]Êé6"GòËHeGù=M<3e\\Îuþà­ÏÒr½È½@=@¹6ìýlª¸Á°.¦Ð³nm¦Ð¥[§p1\\êibm3²5öhXÐºÙPq+§ý_ñ¹¿Þ=JWïÌX¨ Z¸ìÃ]F)è¾ÅÒk %(h'ö¤©¤¸³qÙùZÅÕ·'>|}[Ðy8ó_»¨_jðJÕVOjÍöBÈzèÐi:À­ÿµ_,Hâ¯PK¤lM°êZ Sb®À¯ÿW¸Rkä6+´LDçµªþ.0Ë&kbEi:ÏKèæ»½7i%c>Ý@Irón-ÙÌEjûÕ¡9;ª8®¿7®/,ðçØUõû4A[=JUC2E<Þ_Zfk33e?%¸²2'­ö:ýÎ,^µþº61°Gê¦'sHtÝÒh43ç&Ø+ïo:qÊã_ÝZ¸3;õzeîY2ä7G:8(¢«ýVc1ô9¯$áwTú\\QNôTârÖYFrýõó-uanIÕ×ÂÎä?0I¯@3ÌºzbdøµÐÕÕ?·Â»i´:pXlózØ¹EÞz½ÌCS XR¯â-9ª².Àf¬-Ä8òÎ°ojJWßú¤n¤út*Î=@Sñ5VdÞ¼oÇ'7´¹²\\ïs,fìd?î³FA-lªÆÌÛí¥z_K6Úú|úýJ´4§ÃtMtÝ¸íGXbâÀ >£eÊ7/³sÍ^¾GNr}kLOB¬-¬ÅxqÄ,SÀS¶&üfQg®Qeh¼â2ì$Nä=}?þï5LEÈXQêkë<s{¬ú©ºÞü?8q£zgòJÈìâ²°UÔjMÁú&rAÃ¤ð?3Ê:ñ:4ËçCÒb¢ë>"4zÛ_·bëö<gQN¡úÌø.:@7Ë¸T6dÿòî²n92©ÛõVz=J;!áëv0¨Ìß¸Òn=MvÐÇ3­¬®ïBPåÑa8JñKÙír(,¯_¾âE¼¸0<lø'aÍú)_>ºSÐ"2ÄÌ«nlDs^ÉWò³>¹òe×1*þöÅó£Ó·!¢"ÅG¿òP¼a»nø=JÝî>ÀHñÖiÖÞð´Í\\"ìò®§M'bpë¶Dy6ó3òîÒö{7ü<rDÀC¸»ÄÖÃHº}@gÕaaìÕDòBxuoï»±»ØàxÉ\`]rÁ±;ín÷|x:ØíÓIo´DGGë\\s=@æ/µ§ÏgÓ)l\`þ&DìPNý£jÆCÖX§Ëy#Zl>S7oUÜæÃ§/H«Úªn?b¶:JºhPx«:6î~eÜ®;1~öYd[e}øcÐ3¡¡ Ö/#ÖÖu=JîjJ£1Ú4kÒÂÝÖÛpýmN <EÏ¢xí,^Ù=@¼ âW73ÚKH]²hMç\\ÿ/"9é,ÍZ·Z%Ñ5:ê^vÅ{ÞX/ôäòtv9<pÑ³GH*±.aRê$rnLò0Pk3CaZ^Jbóê7ßÝÊpäÆìQG#úý¤ØÇðÞý¤xRÕ=}Âb´Bt,×xÍzþÏ,6|Ö ºç<yqA¿#ûÐ.2ÃÝ÷jG(×wó¡ø\`Ñ}t\`¾¶f¤M1o26­Úpjõ;Ä->óÂ­×3Ã:,æU\\¡qß)ð%ZÅ=MäfÂæà4ô;lì.?vI¼Íê=M¿.á}¼_WbD&=JûÂç%Ï4<Csdwua¦c=Mê¤Lò6ÆEÛÁúDÜ=J¨·ûÎ'àÅAÅ_,Õ®M9q¬ +v§I>ñ¿©õ8Ì+Âï8ôhÇF=JNxï²è)·iMZ±Ü^þæi¶®¶}rcúJÏëlcú!¹FZ)È­£½ÝørK"b7§µ{Ý]d5ÀIVO1ÕµÇ1JO±{D+ÁC2M+r^Ýp=Mý{kÜE!=}ÐlÖµ,¾ÉÄ3°+ðU^OîeLcK[uÓD^8+GÆ­Å}Zw=@±=JÖÁ1Å3=J´:Aè}ÛýÍ¼Ç*Ù7ë@ëJÈ±ju¯½=}>âý:ÇK¦2«irÎ=}z£ß ,o¿dÀV)¨â¸Oä±à7gx=Jd÷Ö@AsROòr=@DK,©g±51Õ¬eZ=@àeë+2Uxó¾M¸>j®>Çì¯¤ÛÐ«<=}±ÒI7Pì{XQûOØk¯hàæÈS	âÔ<îYÕlêF-+zâÎQÁ(­3V³*³px(ìOù$J!>{42ÛjËxHo©ðP¯â´H^NÏ$âá.7·co=MQ)uÀîÁÎVë=Jmç©s¶,âÜPþvôqÀrfUIwëö\\Î_ ©ts(	ô_eA)ò0ÐÀ7»<qy:¸Å=@ûlm­ÁÓ;»Rñz(j@^ÓÀf'yñJ0¶ä)¼\\ÀpO7DÅgÜ/ÌÛÙÃvÃFK=}Ð£×8Âë´[vn R.Dî?å35z	Blø@;ì¬ÝtVë<úÞHWxÂWU¢Ò /pmÏP3<üPÂ±¯=@1ã&e²3ÀÎLÆíÂ°¼MÛ¬,¿f'>êOEqö:å§k¶=Ml²ó3ÿ½ð\\·Ãþþµ6Çìÿ°£dKÝd®dfÄÂl76Þ>î×nÿÖJ_J÷*Ï·¹>ouðÊ¶â;>Gi²Î\\z]è=Jàt,sÏød;ò+i3Û6ø¿Mú<f)mâ¤Ïªä|1ú$9:0ZyZ¯j÷ã\`3á3Ä_HÃÌ3ðYã9ükÅê½RªØÚÉüyÖiÎr8B8n<êÚñOËrÅ¨¬Lm­µuzðxi=J¯#2H^à=}D=@(<;x,Âú«Zú\`*tª^Ês×êk=Mj<LÏº êT_ãâK4È¢ôì½¶svá fexÖJ/æû£Q.°C9î./6Çð*?ÌEMhV/_ÔºFá5\`(	â~ÚßDBÐu\\ø9dLªz[«I¶íB6¼ÚðÌ2-ï´p4¸K0¾tînVî:ÞØ­Oiî0>kÛ¸ÍWs?JXqÅæ3>=}´Â'dXçN®tÂÐ:Të´76«Ä@ÃÙåæ+v=}Äêÿ/¸KP®¬ :Øj=@bÈl/¼¶9Î7ãPÛ>¾ùÿÉËh*=}<\`,êCÞN«_:ST^G/¹Ô¬:NÈTæïÊ_úrîËP7«=}^Ëy\\CDFÎP:\`7:´2;dÿQ¹5~k5DÍÓKò/¦ÀÃÀ?d:0bbq5B+2¬º&=JÓòÉ¤Ú]ëDØoWnP:t3Ó­6=}çn,UDfckTn8r5W¾=JÞì5ý^Ut9\`ÊqTzF®\\sjâ,P=M{Zþ³íRÔ=MLn3j5kGÜA+N¼,Hx^zn³Î3¸ÞÜãç-3«ç¢l>u®³ËXþ7-í*Ò\\Î|4ÿqÓròQÎ},FYnÌ³ÚjFºÍ ­,^Ã.wQþ³¥2°ab].I=JèÖÁò«ðÒLï¨ëbáºúÃbÄ¼¸0lyö7µýTÅÅ+¾®íyXºHT1<i´ÉìyÓ5Ä2#ÄÍ\\3=}o.$Wê?Tm:'^áÙ6¢=M'@ Ez×®_×TnsÏ2BÆ/Ù\\NÙpî×<4rÆ û}6g+BÉy¢±OÿH«¨µBRmÄ»úYÞl³âàêýÔgX'=@¦j¼¶\\åzî«JsU>îÒ lû/-nuUQ[ç{ââKí>¬/:MÚ÷QÏ×±hÿìÛ÷»«Ö3·}}w¬Ó9óZ.5ìæìu ñX1Ã/¸Í=MüQv	½K,Võ:÷Ræ+ÆVÄ^¨¯ d{^¯Õ_x-rñï~ÚåìO\`¨6½%9ÊvÀ%:Ì×=@¯¦®,h³®õÞä4eÊ6»ù {Ê[Ø\`µObã ®ijK¸+ø>#©-G¸·÷~;	/%;<5AL;ì§&+{mqgÂ~Ì.¡.1ÕQSü*|%4ÿ¶=Jó­*~Äãzxjiµÿ·6Zòs@Ï7}nÜú¨VF)÷³åþ5;ð³ÒÉ²Àt$qf¢WÍBù­éB¯)>ùsµ1È?(L'}fb"ÎBs1*)>÷ÎoEt©æ)cD³|6:3ú([ÄÅ@7ÔS'^<K0ä;ÿ©¸0©>Ía'3'Þ1=@»)>Wá@×]'S ùû=JÆ¿ÞÑi)FW¹@7¤=J((ÞæÞ1à)>WÉ@×['³&jNÌB9v{)S2x¹²{Å(~Qmt;wÅ0aG)W/°aò{VuJb²zë°³ª{þí ÓË¤(²\`&¹]m^©ÈBÌ3)æ:w"ÉÑ¯ì)fWn=}({'éÅ@(Å;#	wµ´)ÞR%IÑ¯BV ©¡Ú2K³úcÚe49à&B\\ÛzPgóWb·Mdµ·hÅÃkvBZÞ":34pB·JºCN	AùÝf)²=JÊoª}©²=JÎo#ñ20W¬IMÂÞ2)Bëoµ=J%¹;Þ2£)[,£ÑKY;¸nÁNNHûiD:¾J0énÆÎ÷PL~#ñ2Æ¼0ipüL~&ñ2.p­IMÂÞ2Ä¹©AëoµzIMâ;4).¥Ý¯(õÂ=@ÄWÂ(Å]ý©iÐë¶àeöLPFÎ=Jz:YÁÞ5*nyeSË£;èG2M_DÓOj2·	«/Í£ÝHñº¸JÝ.û7vê³-nrbqO®k|ÂXÒ,fõÁìâ´3ôvýLÙ4Îëµj8Wj¼LhÉÿ­*læPW1ó5:\\/ÜÈûþ'.½b6µGEâ!=}d4Q=J©½»½ ß=}FËXñS(âYÌ¢ùNØcÄrãÆ#*³/·=JÀÿ©zU¤_U ©;ß6Q (ø¼º2\\5àOvQ®,'ì0weSÔC$´>³^p¼ °VªÇJ&ìEkkÊ¿÷XlpS¨Ñ5.	wNj=JÜ5®I©R·úXQ£ÀW*±ø\\v%ë£_>4ªKøuªÛÔçÂ½²AðÚlÉY±½=}¤«tk6pQ"Wöû§%rH¨R63´RÊjÊÌO=MIi)"#Á'Qþ*2èÏ×»êX?ØNJãÜ,&«f·=Jþj{2è6EL[^0=}m>©«Qxq©Q´Í]"¬Ù·Ýç°¢*@¼ÛYxM6Üu0ÊáV ?YüOöwf<üMÉwèù:9ãOm.mÆð*´A91z|[ª<¹ÆNÚ=J£=@:Í ±ïtq©DaøµÆë}ÐíÃa¬=JPê¿eÂÖ0w½¨à,ý"};øUðÉrËÍKîMÎ¦ÛH].ÛV-Z³®í.D'.p¨áp15zaPiÊu%:}Ék\`ªâÏ©3Ï×ÃøÀz!Êï2¦\`ËºkÞ=}@CÖõ.-4bi,Ïmef9ü~b^Éê,eÝ»<¸óDÏ=@]k~DÔ²GÔd,ÙXë |÷Ýág±RQ','öWíÃoAºê6½pöÛ|,0½7Ê E8G_~|32_K7^Ã®4yòÒªêº/qlÂþ²cNp³ÊIÈák-w·=}®¦f_«ÔÊ³=@P^BBø[Ryw§xZNdú/Ð/=}O»Ç³XD|PlTK~zyÔkºS{k[[r7_ö4+=}F°)½ü.vl¾®Äc)ºS¹Ë{K0[(ÜsÙÛïMMwÀÎqå4ÝrKoÌçJrYsâqã¬©7<KÐqjJCm×lÊml¯\\§Yû®®äOeM&)»új?ôÂx=}±_»Ä@üÃPÂPÑ®ÙÇQ¦Ýáy6l¦n«K^ýÚjJ#MlGzâ /¦Bs:fò¶¯p§3#|:óuòA3ü9	©:,<èù/ì!C¢âlôão®MjKS;Üjì¦ß5(A3÷Bm¥W$of ø¤Ö³hîVQ¹ÜH7ñÙÖñÀI¹kýg þHÅ+r(â}ê¸¤Àëgjæ?8Ì|æ=MWINOÉÄifÕ{½]o,"3óÇ×Ï'm;ÆÐWC3hCCEø3ÖwD[Æ×}ê¿«ÆP*33CSlJújº¬wøÈ*,Z7ÏµôØùýxj§1:UVÐ:b»ê°<Ç/hrE_j²íX½ñ!ëZù¿¿b.zb1-é2k-D¶8¦;¼0è:ªXx%B?"ô·k«Y¶3¦£ì=}@,N7e¾bNxbXµ[R&ØòR°CCl?.?IbÐãÝ,AÌ21õN­Ù2$5Û&®©;ñYuIXìFñK\\CB'Ëo¶;%äIM¢ÏÚj8iÝ}ðÜì\`Ä§>^é<nô+=JÛÁjEf=Mv£é,®V.ù7ûÀPì -s_;ÞPq¬rÄøO¬ÆA{IÜ£"³Þ,]ïï¥Ä}¸úÒBËS¶Òl,WZnEò²¶°×KU 6<Ü1C®ÞÁ\`CÎZ²3v¢÷;JG©ÍKn§+Õv[ÝUGÖÇSÊ´áwÊÜPÛo½½ÑmuÌt´.+$°ÔØ7¥¢-l>×­^Ë<5¡ë"8ªÕ,DÏDSdç321þ>Ð%¨Z_¡¹ÂsQ; \`wî­k CB¬þí1«Ç\\*æ%,w9÷Z.¸#«1¯þê´Òf=Jv}1ªì JYWø ¤[ú°£d&Ç³hÜEÖ£î=}X±ób0­ÅÐÚ?­_nXS!Ø6ûNäMvVv;íXhQYÃqÒZ@®Ûàr·A\`£ÞïÍxÊx/Ï§3ø®ò/pÌCþ'îaHc¼pàÈ$Nÿ«j1Å=}³p¶b#3ÛËcsM=@q¢yÖ¹ÎDP5MVaÛhÖKO 9Ï"ÛÉÞ¨ø\`ñã-®¸Z­ï%NVüô.x['Õ)Rý)R>Ï6<:í<8]^TzM"._p¼ÌG¹­8ú	.ïCN:tî3LR© +pÝÄvÁó·nûx»:$ÝßÛn×TPgÄ·GÆ½ì.ë3£KñÕÚÁjÎ=@·Ú_ý5úX¬;Yí·r+´ù¨=}â¸w­éuÐl-%éVv®O»ZDl^KÆ\`¹ûÆ=J%^òkÒÒZá®a÷_<Spº6}Jç½@EIÄªÄàÐÐË¨i_B]¤1ìXËCÌ4QVbeÛ|û^»²Mf	/Cü;Àa²bCì&ºjá«tÖN5NÝPÌð]"xÊG·V©J=M>¼gìJÕââO&²µC®l\`¬÷({/WW>)¥7RÒ¨­Ð3Sá¬ÐKa¢Ürl¦Cò$ÂËira:Ãè²ÊÅJ0S4; Ý,¿7ì±¡ºí:1¬¬z»F¢ex9NÁªdÜ×mýv9LÊV¼ü£¤²Ý«51Gìü<ªUÂÀÇ´2fe?Ú²u¥Tú&>Ác}KKÎ2[v¯õ»´À TÌc}û|+]UTÓ³ÑÌOT|+Ëj×4>|¿×H®p­pä{¹QB>Ã¼_?dì$dpb=M þæÁ²YvEå-L×^;QZvëÏ¨íó¾d/Y»Ñªs¯¯mg.3o{²v0nâ}­«<â§ìr1hÛÑ±¢{Wó°ðGZýmfÒÀ¸z§ïÏ:yÔOhü\\gîü8uì·Fò÷ THzÇß=JüÈ´Q¼Ïu¥T.E²õÆÓBÞ~6Khc}ëÄ]?Wû~ÞnÐ,Î<,MÍ:Ö~¦ÊæÄM¿\\e?Ë~òK¸ª@îA¾[õJ=J:xIú=JúìÖEN¾÷D}´ÆÌG»Íï´ f)åÞ×³Yc+DÜÿÜ:ÈëûÄIF"(g5»=M¹Vn¸ê¶ÜJÑ¾/ö=J(q¾ÜÀØRÆ±ùî}"$Þû&Äì¬+âGß.AÚ5@ÂUßkå\`åXwZß7{<F@åq&V­/ëÂ­<Ü<iq²4 :óP	Ü6»äÅ A|£L%ÈoTì´JõÇfOWf5¥xñkÚì'Z¯ Y:~+5Z	O=JiªãJ¨ReÎ3$³øl¹EucC=}[ûª3¯Qu:ÅLßó\\CâÁN3sbz*«?Nny=J}¬]¡TPæy»ÙBËTËC¼Üßl8.Êàé=Jf3_«{ÓÓrlYqÅØñ¬úÐwh<Fª»<±Xt0åïO?e¡cäqø\`à^	=}..m¸Hn7Kþ>§²Ë»SFøíhaÈøîk{ÑVõà>î~ÒÇ¯PvkßÍW{&²Ï;õËÎ-·z÷ÓCÝ7%°>>gþ¨¿ARûû)ø¥8).ÅkqIx=@EeÈ"ûM®ÐN×èk$Ä(Ù=@¥B¶¶ªû8CÞ=JxÓêÚ®3O¨k×4ÍHR^ÜÍ§ý@ÅæÚU@ðK2þÞ	ýÑ·K³ò\`öÎÝ\\§;øP7«S*U®<äÂýìH±	^RQ)bØÅ=}x°6ÓA6íêDLðÙúGÏ@ng2±·¤JüY¶K¯R¾öj\\5HKKv2í1i\`É^[¹Bºæô*»úâonYGöúóÞ«	TåÏ¸>w±ÖudÛ'}ÒFYö}ÜÝÐPmà;î'EDeVCÙ¸²)Oxmî©ý²n÷<Æ÷×EÎð×c=}>ñBÚîÜ%¬D\\ÑfÖ)P®SÕPdÏ¯ê¤.ÖKû_z÷¼Ä{ÜÇcù=@¸M!©À×PÊTýÃ*Há÷õÞ²êà0¬éÚ¿8ü^éô®b2Z7«ºjû0vråËSâÄÑV¬O^m+õ´P7¯´Ø\`Ê%UöÿJ'EkhuÌMË¯»Óµçí oýM¬¼ÈÅ¤¦£³4LQ0P__Z.neÀ¡L²ú:NßM"¼ÜEK>{÷SÓQë rzSn\`iæã=JjÌÓNmO|=}µS¬jC±]6óÚ=@;e]UÜzºN~AgðÍBa1sQkÙÚ¼^0Òz ø¼÷«p]@F.Ó1­äJL>YÐÊ¢DÔg2=}eÕ¢´¢Ë}­ ÞZæ¤ÕrÈ ]çæ²-éj¬±/jëøÚiË´»ÕÀÊæ=MÐ>-î¨¸âNªÌI@WïÜK£:gnñÏ¡2çm8·´|ÊóRmm}.×f»? ¸~þo£&¬Þ¼×f»ÏòÅ\\"}L!n³î'×s¨ïÖJ®MaeZa[3ãÆòè>OíA_Gjõ:¼Áè¦m,Ð±mCV²14ÌïE8fº¦ým¬Áu2 9T©=Jº:{¥ð6îõE>ZmÞ7üNüCòW^R°ÒG=@¨îÍ@J-f?Ø1=@¨²}gþõóXX1Þ\`³^ÂDxW*F­l1p/¶Ç±ªQtÊ=MJ{Kñm®íh7Q[AËþY=@>êæì@01\`ì²±Lä<ïqê,þnuûYr}5.ª¯=M@$CfGÿQT8è{2µ3.ÔrÄ°¦FNäº&¢Ïº?l4JBü¬Ê7¤:<°oÐ±>?òØþk£ü6êïÕËÊÊê^Øµæª­Xº0i3âj/4í}Q*"¯gõí¶Gcb©²î3qËÊL¾à>>{îåÈÓ0ÑQ¦ý»õGÛ>ë}K{ß^Kûj¸8üzËÅª¢ccðÍ¶q¥é³=}ÃÈÄ%pa<µâ¤¡ÊÓp°]+§£4¸xí4G,AïÙ_b{¡v.Äu_÷=JqÉ÷jÉ30û¿tKËÌGú¥±Júº&D^³+»Ô-_·=@=}ý[µ[²ýÊLùºæÛ³ðùYtÑ@´ÁoÅ|¡¬ùê@ñ0;-¾âi(­®À?ì6;Ð½1êyà²ÍÇJÒaµ­dråk¢«Úl)=@/ÂYcäê¿äjr.í/×·@'.Ð_Êë/Æ\\,ËTÍw³ÞÌPÐ3Ó*7ÊµÓ>#óüPE÷mqvl¶Ñp9b%·\`{~Fl2(ÈÞÐg¹ð¾	8-U<1Ä\`AJ±néÍ^8Ê¦Ö÷[[ÃZáî¾5LÞÖãoLÚ{onö[%<1ìn%lWÑïWt2SÀP6!úL3îWSLd<^^g3p|Ó^ª¿=@ø:ÛV+Ü>8öx|¢o#[s¼,{àDºpu=Jä*Zíý*0A/Û¤°Êþ±N=M^§«Ê¬¢=}£>êB54xíÂ4¯ÇVÊ&¶ò9²AÍdÉü¯¼kß@óª¬>:mö*ì [¹¼LºRhN®fZîS_!v3lu¯RîiYÑr=}We^ªßQJRõwÒg×J ËÎY\\ÙìAc'Ëº8à\\ù3å\\|Ë»;JW=J<º¶=JÓ»ÁËn.E=}û¿£)t3ëö cÒ!ïÀ6Rd8=Jp÷¦^± ÀÉJÑÝö=}Ð¸@H=}sßWbõIskÐÃKpÛ}J=@=}q¤JJ±¥x¬«näKB=M¾çG/M%{²µ =JJ9d"Ój/Ûõ]³´,0*Ë=JÑË©JÎ:úßÇú6óSþ\\;³MjOdmí.À6BÍ:v·Ê³/pËÎý»o¯»R*6?þrNß½M]Gñ×:FcØcC»ßÓ ~ù3¢.pWóOÞMÆ×ÌWv9×M²EL^]ÇKÁj¬Dù;ùûMtÒ°G'ôÐÞúÔÑ=}GU³um2´6þ÷sLxÄ bM@]ëÚ5ÕkmSê¬ÓÓÖÇ®ò7¸bAýv_=Jr1~LæxA7CI¤}Y.Î5§;ß¹îsv¤î0¯Q~5ÒkAjjDUp¾À9îç.©KøÄÕeb7vÛÀ5=JSu½X<%c¦á¦3¬%ogÜcÜéqPÆ)g%ÏPCÜÿ>ÀâÌJ&Ç³\\£³òÄëæju¿Ô2¤LØ6s>t°=}ÎjÏ­¹H¥'¡ßL\\mM3NäYo]´ûx)èßï-¤«~Ç^qt·Ynqúõ$¥Ë¯«ÀüKÉÖ­×Â s /)O%t6çÆúÄ»Áy<F{©(É&¡ß°CÃÖM3¤*«^ÈÚÚã4p;ÐªwUæåBJ;¡/m:;Ò3=MVÎ¬,+Q8øN©ÿvUZO§X«k íç?*K,Ä.ÚgQ!BÍpÅtþ­ûÀÛ=Jç´B¬²ûZÊl6ýsú©ªãËe5F8ópÄ¶â¦Î\\Ó¯¿Ö\`YùU",+oôNÌ¿®;«¬qÖÎ«kiNKo^KõÓ=@ã\\øÄMAÝòaÎSèÉk!³ \\ÐK9Î3!Íc§mrÏ¡îÉÿêî¨ª+>:uÐ§D1MñìKTºoúB>án¾Ë~5îkz5ë»=@DÎnF0·L¹½oèBYøÊÜ=@ó){[ZÆÓ, ïbµçlÚ#i|>-jÛór²6"2mqòÞ¾.=J¨øþò[gQ£I\`E»ÔÐ!(!ìô(ýh}Þ«X<ý¼¬äÝ%ê¢2«¸XúÞb+pEcÎÀÖÕoS^R+ÉcêexJàîME«yq7LKu®âLgY{_m©+öKM®dqù'YûU4»¸?(?.¾Kª(ÑâÄÄÔêb<ß1~9ïíb>ùxeµ§6JÊÄÄ^ñkXD48w²Ð8®]J>=J®akKâªðænSº¬¥o5ÔB´p]ÏcCQ6 l£OÝdzO*=}k½Hw_×õÞ¶îmÄ'ZX?¼Ö¹ñ)pe3BÁ¢RÀRôrCZ~j·ÉO~è¾³FÝjW4Üéæ¯¶áÃ,iPÕÁ¾Í%^¶1áªþ@áê9ø¸/:¹ü5¼=}&«þ/,P¯ò¦:¶ù©ÇÆ=JeË$R,u+ÌEQÕÅ'Xú1Xó²QU¦ \\k¸m=@ §Ýü¯dº½ØKUä5?T¾\\Atë÷È,Êrß>=JEúóÄñHOU/"ÚÜìåÞâÀ¿¬­ËÎSZµY5x$,~xÕ%(Xð/ÒM7-kEfNKÜ¡Jëº?Öjî\\päáî+@¬L(¼^\`ôNN([Ûqd½ ¬Ðìß²¥JEP7Yµø®Övoõ[vîýûélS4w1Â[5hÖ*zPsºÐ-×û;M=}=}ÌU±¢ëgú@gåÊÒC;=Mz¯"ìtæFÑd(Ä(.£?ðºÄa=@:g·O%óÃ\\ =}ªøË¥ËqEº0OÏkÞ¬Éo,ÐÆuH·-\\eOFÖ¡ÕÆ^n°×t¼~XêüCzÍ=@åÈ~õW©A¶[Ø«^I?Áªæ±$±úDKQK2ûRÄ=}LYk»UsÅrÐ~i	KÎuâÎ®O':¤TLéþd=}à$Åoýå=@¸?qwëO´ñcüøãµò r.X´má=@Lrss|TPÇöo\\Äl/àù>WÔf	buÖ$42Që'JZßáÜz£Ó7l²p1j|¾@ÿ+Qa¼xÏ®1YÞRQâF[ÌHc\\÷ÔñfëËÐêòbXüë@×IFÌMLx2ä0=M%TÄ¸¨ô=@OÌ®,||ú³¸=@¾ºs#PöE¶º»nV®®~=@;Ot2$~æú/<E;^}gßØìrî*>;årÎ¯!y²ÐqÖ]L@?ýû¤p! Q¾^{Ye\\Ëº¹iÚAÙe¬ÒÅÁÄ¤	dæu¾I©PAD:¸=@Ý¢k-C»×1ÞÛTtjgy±n¾uäf1YÆ=}/åOíKÆP´oÜ=@_h×:^?EDÀó~²¶Ç>²¬O¼V²Î¿,eÍØÛîo!#æúÈ5N¾IyÛí.4I¦6´8ü=}NqÄzT+5t­Q£JpÁ:T®ÄÑ+´½\\=J½¦:Êù=MÖô*³t}Iðy|IðZ:UÁfr­äL>-dM=}^+è{É·<êú±üV Jº=}Z:õ,Q0sþS9714:lµ	}4cyD  H,{-ß«ØÎPíÐÎúêø@µFÄ6ìdm¨ZÍrÎVÜQJ:\\®2+BÏ½2ÁäNEpuÜ?'Mzâët}õóºÖËwRZ;§ÃµÊ¾À<n10qµu1Z_*¦ÔþÃÔDrÔoR¬t¼W¶vffJ&ë·,Z½Á-+³J¸ñO÷-×Iz¼é²I^L:«NfòÅÆÑW¸ÉÀ=@¤m×3eln-ü¢	©:Ù¸û@QåU|ms(I×R£Ìèn[Nq{6¿Þ5Þt@Mª¾F×í*¢SÌN =}=}wPGµbÁÆìmJÇ=@´?ræN$wõ+/³F*PNºYVº,÷¬,á2ØåªjªÌ¾=@ÄÌ«GJÒK<\`P)aP¡X=Jlê5_í¯g(ºtÕ*iÂ=@æl,©Kâìc,V8i±*^ú ªJ%¨SG®erAÕVðÌ´}>ADjßIäJ=}Ïæëjëã/ë3FMj?SÎß*F«¤ECý¼Ê¼à+g¬ó7:ò¸Gþzò³³0w²í¯Í¢7¯a5¾^OÎó¢2DÕ@z«Ð«ç?Ë!åËÓVÚT*/f2\\é/üK|K_3Y4pÒ\` ¶=}«©:QC¬+¬¸Á®íW §óªb:[Zn¶\`Ë@,6¤[òý|:¬?ÌÐÖ¨§óo¦Æx+q5"@{±JÄpâ<P2¡þ,zÇjÏ(ð¦ªkB;RÎkO±\`v2ú|rwi^v3û° WÞWF®7=@sÚuîS¿>ÑJ=}5Xk³@±¹%Ö­ GIs"eBq.YNF2¼(QúI<3KqW6/Ïçû;Y+Xd,.DÚ£v®3¶ =}×ym-:!'_¨Ùº/Ê[.$Ö Vï4D<jaü49úa:Ê;ºþ§ý²k"K½^|O¶f«Ù9+²*õ±T_2÷½ú#> 7=@]ì3/ÊÚÜ;!Â=MMPÚ²5t0¤=}¢m¬Zºæl,ê2/áhër¬ý~}¦¥FË×s»FxÔR½>kìÍÊ=}fkjÃê7¶lü°Íf£ö àh àh,ôRã¢ÚA­t®ì%½ápJâúOY..¯YJÐÀ¡,ð²Úm²)jMÅ*w³> Ð§öÒzQûDÐpïÒÊìëÊjrÑ3î¯}/dü¾(Ûèm­6÷ÕS¦±þ1§uí·[<:3wl6:ªk#*×Ù7bFîX,Ñ|Ä{ªªL%bf.}³´j¾ãÇ=}êð/Fx=}Ü^JkäM<;aÛ·þrûùkS{Ý%­1RºÝJïpKïÜÐv^×Þ:w¸txq:bðû,Âg=}Ìº(!ÞB	l Ê:¼Ç5EüÄ~Vmj'Kj}÷é¿ d;ÐlpÉn÷ÈW³°ÌS~ÄV#nvü;]?Ïûöª©mÌGÛ=JåNÏÌqZ+.hÀ6\\t:Öhk¿5Avº,3³8Ó%;ðÀÊ÷a<@ÒÚ1þfz»j>»¯"0»s«äY>=MÞúðÀþ°z²¹à\`ìünU^Â!ºMNáõ§Wk¾¾z?î«1¤k@Ýà û¬o¸­e½áÙÏ«;=@¡Å;xÌåvi:Áú1ó<®®08$Æe¤m6JÝZûlõÆoó;7Jë±N¾[k=M+Q,õFCh>?vmÞ9FøzPÎÃz ¯UZ[7¯uYã:<]9goµaVÚ¬Üê,ZÑÆÞÇ4cÊ=MDzºøüPîCÍ;8oåºq¼Vî¤se]{C«aìÁ*À(	çÍk;=M2­¢Ã,÷mê¼+fw"ý,sn}kÂ1Ã÷MyòJÝ|701Òòw¸xpa\\dGF7Üø£ôæ°ãUÏös,ü++EWà¥:)vc}!!)7!=}A$ÏõhN2Ì|¼ê(ì¹éÙvGÈ=JQoý|Í)Ã\\<&Ø%Ðý©%Ô)=JïAÑyx¸°9i\\øî9;ÅÑL=J?Gò´JnÍ|{ëÃ$	{\`¤Ê?_}±Ü¨)=J÷ÑÙx¸6Éé¦\\l;5SBGÆGNÊ&eu=@÷Pu»wA¸ÈøÖL£r\\åòÀér¯´ÐáæÆNß½»¦Î;!%VyíöÇÙ0}+oUûí{qÕrMÎ[ÃË|£$PÞp7A¾00ó=}]A©áNödM]5ÉõÉc~O'('øa1q±=J+	§úëaaS¹Rôæº#_ýTß¿Æ{hmIÃwOÇôÄ8åÏ¡á¿=M¤ýöÃdóyTª\\¡ööWÃÏÏzãéÌ=Jâõ[U¨vÙ­H¼µjçù¦Æ£eP(ë²X×Àr{*K	JIøH3ü§ç<ÎXÃèB°¾¿ØsÕ	9!_ým!"çÈ\\	Pçû¢§5Ñ5]yqè'îÁ¯Tù÷FË¤³?Ã¸$ýe°øÐ$xÃÏÉáÅÏÊ«-I14f:âdêt«Ðêu#ÀÄYN	ÿªÓ+-ÈÇ¿á|u(­&w(5>óÝÙ¼	h	r	GhO¦ÀàxóúåË!YµiùMH#f°8ã àûÍu?ÁûMP½ÓØ¬ºÝøDâÿÛhn	ah°DÀù!§á©"-Éè©Ö[(í¸!	¦Á )EíÅÐÙAæ¤&ÜüõsYiÙ"¦$ÝÁyEi$î!óòñYI¨±1I~©¨'%Aé!(å¯Hä=}§ñ¸¤¥êúWäÿ#HäãúÅ×Ta5	ö§ý}¡}äã×Å~Õû¦ãdt±vw´æ~ÃLkh0ÿ×±!h¡îk§dáåtn/­-¦çWXpqÇÕÝNqb­j)FÆ¦ÇûBX£íé¨YP©ìhæY*åù8Çi4¨5ø¯¦\\mÕ"©(Ôzþ-\` ¤á±á?é_¦ý¡)ÄÑz'qÇþê&Âåìðf¤=MQHÉFIµ»/#¦Ùzååh]ÁOÝ©~Kñ¡oeò	M×x]éþÓR©Bk¢=@ÝîEÖu¤Çsù	¿'=JZq¤Ý=}Ý=MåâIi%îçÿi ôçkÕv±N§ëè9Øo-§×L]]©ÍaÉÖ×iæ  |¸á~y)ìmÛ Iã.¨> =@Ûz_õ$fÞìÿaï°ef=@eNÍÓ_0è>¸Z,«(ã¹=@¡ìÑä1úM£ ÐÍáæ´~]&Üå"¿Ø¶qSÍÊÛµáÉæÄå=M»5àÉæÖtë½IæÕ^hêü·¤7Çç "Ç+ï×ûsÝ=@GæÃÙ~çXíPÙ ÈÁÄG°vã)tÈ:ÏÁ"Õ8 5ØÝêSU8ò?|Ð Áâ8!8R×þÿéõGBß}EÐëº[µàIãÃU÷ûs]HâÆQâ¿\`ÆâIþa(ðáæþ\`þæ÷qØ®>·ú&WQ#.¾¼^ÁUÛw¦Ì×qH4RïÉ&uð)0ç¨Þ=JÉ9-t=@À^¥ËÕù¬µnÿZ(ðýá,ôßDZ§"U¦þÖ¿¥¸	U:Ï£"/¸\`Cìì\\¨_"=JÝáÓ×»­ Ã6ïqµuéÂÛÞÔõS½ !à­Û,WZØïÝà 9] ìýØY÷·uµãb|í¯cVÆ¸y­	²^oÄW¤e¹Kç5]Z¦\\¸>cOJèó³týá*Ïðï°°üðKpI»:ª	éã?¡Eæ«¾MC âöÃôÈ¬àË»«åóZçawkãXB8=Mxcm®£¯ã¸³ôbG!8Í¦¼Âæwá7i¤-hGzèX{Öä{gâFïÿkç=}O)óÚ÷ÆµóbóþôÎßyÒÛ»Ë½ÁÙ°oøE×}	ßÊK­÷>ÐD\`Ö_h_ äòãåÓ³#°¿/RIMòáà£åSD§­<¡Õ=M ò£5xlS9´ Büìß^Ûàãàc>crj%?÷è[pµ\\_âÌ	éÌ32ö1y\\§lqÌY²Ä°Ì^O!ä£çõ¥å@EoþqF×61·¹v¹ú¥á Ó¥6OÆ©\\ÂÄ0ÄøÌÁHÃåÖnä#öûLy°iàÐÏ ÌÍ0{¿MTÀS?ær¬ËK«zw¤ô¦! ÍÁ¹ÕÅaWÇcX£zù woÀWÄiÙáÁÑµ{\`|Ã)\\Îýô¡ýH æ£ö95×8Ô°°°®°=JÝDËm°Öç$ÈÿÕ±~Hdc=}¸åü"ûÉÈå!ÿá(ß¥!áÁ % U=}¤÷	ß¥&ºÇ¶E§£ØßõYÙÅiÄåXé=MÙ3AÑ%Éñ÷å¤ìÿU=}Ác &g¡yFÜ%ô3å¹]Î¤ÿIé ðØã&'ä=}ñù)ôîö	Èåk¨)$¨ñ]¿Gî¹!1ÃñÑeÅDî¹Q¤ú¹¹aójÈ~êCÇ'£÷ùkü·ÄpàÃyeâ¡@i8^Õ·¨VÕ=}|CèùÏþSDÛ+i¸P4Ù^<i Õ=}ËhÁÃ#OûË¤! ¬y¼h­ÒlÊ9Wc3ÌLr\\sOäõpsD¼ÎÁJìOÓ[ìu®T¼^?ëÑ#DWä9C_=@¶]aâ$¯ÒûÖ*¯ Hé$þG~í ûS=MÖ§=@u}ØúüÖ{Ñ¨SiYº¨]9,Ta=}½b=@Qè^ã1¿Ó=@Îªþóµ\`ÎÉâ$þºÕjCÍØ-}Pöç)émTÚ°×$ð¹tß%"¿Ñ@ÙÊú´··IaÈ=}ÉÃ@×~áwÉË×¨&xÀ=J<»ñN¸Ú!µáö#´oJìÚÛ=@c AÙª<;ß¡Iddï¸íÁH£"Y{Ûk%î[R³ùf´Áî6Hg¥è}DW+¯U=@U&æQÙiÝ¢¯°qþÿQ¨Öå¹'þïMÊ¦×PG¥Ñ¶Åã¦ñûùÀ~DCÆd£(1ø¢õÛéôw%y	¢»Ù¾üÒ§vìu\`ÔQØh4WHé	=}×q$ùf-µq=@A½bäçQØg2VØÝ­p÷n'ÙhòÇérÏ°G$OyÆé 	ÓÅY7KÏÕ_\`¢þñÅYWÞþ©î"éf¿±«ÜÖ%È3ÍÑXî)¢=J?ôÖ¥y]À¥ìÇÈ«Õá?Á\\YÒ¦Àª¼{pQJìÎ!üg(ü{ Áº$Ðm©gÕ=M@(¡ÉC"îÄÃÑäâäVêü!ü¦j¦(+,V|#èû§¯£ÖõÁ¢îóX·ªµîÿ>ÄêFFÏwuÆ óZÓÔæ#Ç.àHA¢Mi¢ÈD]Ú¦ÿ!RÃôZWjØ¾4FÖ^¯äGqÒ¦;!ÐÁR-îãï¯#ãõP¶!VÙÑp½Kº¼O¯Ã@¡E@ê¦«ÐõçÇg¥VZ\`[ijgäâvÞ]ýsÐüXßou&?×Ü¨qðLÑjþ»=}µÜnÂåÍ¶~Á2á÷,;±È=@ð'¢Îv}&PaÞ	Aß¢ySääzñ(ügêÉL11ß¦UþKIÇùØµÍ%jXXwöW=}uC²dúý6½ÕÎ?ÞÓ=@Ûr£eüÏjO¢¹$Õ9öÁåz%¹jwÄÕÌ9¿Lüëë|6ÞâÕo¹òOü©³ü\`ÝGW.aîT»ðõ6îRx£}~×	åå,¡ñ	?ëü¢ÝË¢«"îLÿÉVVùæÓçµ¢~XTG§HÃÌ'ÒÝp.'÷¤EÑÝ7¹XX-ÓÁÄÂÙM9TS§Ò7PÃô\`Ê¯â×^o&Lt«z43ÀØCLa×iût~eì¬ËásáØÖÉåö ²\`ªWf-=Miûß±ºM+Ø^äÒ>^ÍÅSà?ò»¤;DóE\`îÂË#\`,=Mó°Àè´¤_j>ß×=@¨ñ;Í³ÂÃ5e:ùSgûtxM[êTî?¾Òj:i«N\`¿^døwµ÷GÅZ¢ée_Ôà¢Ìk«(ÈPç¾#ó'i¸HÛYÝQNà'Ä_L´±"\\ecdÏwu\`Ú#À·1¡FéÍä|_Ü µà=My\\£èîæQ¡³çf^ÎÂoåáÈÝt¼Fù¦ø#çeÙçÜùÈÍï»Dñ\`¶gÛ¹]©&fíîË Ønâ G~§llÙDÕ!DDI	Ý[=M@[¡Â]Õi=@uÉ\\VPÒ>R3óm¡óîî=M%¶dà!¸e·Ý¤÷ÔmpÝ¤R ["83Ód$¹!µPðîÞ'tçp9DeèùäüKõY(f!ç ±#É³×å¡öÑï=M¥ ÅA	Ôql9F)lmÕù	££ùl0ÙÄÚÛ!d!ÂË3Ëé%) @KkeVÒ'"\`lÍG(m&"ÈÀñµ×c<;u¡Y«óæ=}öÄö/8.óÑÑ¥¥=Ml]	yñÖ$ëLèÿ7´·IðT£LgDßÿÂ-JL°þÙzXcµN«;ËÁ40qó7I=}Ââ¤Æ¶­Ï ¬¸Úrg5Ø½ùªb-|¶adRA34ãæmb­j)8Rx&()Äh8J°ù¹\\­âé®#×&#=M=MßtASÂibZJÙ©HiÉãjE¤â[býªì ©¹ÓÁ Â¡¥ë'Ëy±égßÖ¨¶£Æ¡éÈ+­Ô@ý±!hh¡»	a\`×Ûl#<ãSCÓ´¦ÀU½%_Ï=@#rüp®Ëü²TüíoPè({%ÁÒ¡Î>X/×Kñ½¤À»XÖEûÌÒ)¼;Çë6$$ #Íi öD_Þ@ßMu?8¡_)R ã]Ñ¸Iøã¤ä5"¥åÃÆFÒa·Íe÷Ãºþép_¿´Ïµ?ôIÅõý\\b³Á!ÈiKËußÌ£vü´®ð{OM+Zü0\\û>ó¢ä)×·8SÈ%¡XVEüÖûJn^ÈQçeÎuøbÉEÜvhYÕ#ì/M¤_ÕØrÈHØP%ÑQÑÀñaR[c\\é§¤¿Yr;{êñþTÁ!ùF	\`QÓç4¯-ãýj)ßL£g¶~OþæÞ=M¿äÕäü·¶¯½ÌM4£¼ÌÆ£àflän¤\\LÁ Ý²LøüñE%ctÈHtSÓÁhiiéâ¨¡q­=MÕqÞXN§§¨¡	¯gGÎGcÌnÊÕ$((ûIeî=@Slûhéæ2yTëÃC÷×á9ø'dçç<¨X^Éè§¦¨=J;M¥Döý¥àyi	·dC4RÔäÞ^ÿ¤áåàs$Kß²½# Ä(8üÁq1pT8üÑÑÁU«GÍÄ®Ã=@hdäbPôÅýÍ}qÞV-Üiõ¥ü$=@Vs#$ ;¾ØhdD¦§!=JVüùvÁ	hhå=JÁ;G¾,Ì	iéä§õÞ(·ô¡Ìsc{ä=MÏñÓhüåvüi}íFÏÙ9aÞÿu	Hs×Ø½èççææk=}âÎÑ¹Ø¹¦¥)=J"h?§Ò:IÉ }µ¼þL		eÚbØ+AÛ¦¦¦0ifábô¦)&$öÂË@ôF5Åeq{ 4+Ø¸´ (/!ÌãwÞ¸k«<ÏESGÓNgBÃ1g	o${í7×ÒÙ¸¹ÔÐm©ÿ[é+îÑ±CM×h~¶YYøYÇõÅE¥pë3;ßê¡!¹W=}Uôí½µpaYÏWÀ­µ1þ2?w­±àfØm/©Ýàö¨%$«oµ¢´kçëØ^ä£%YÊ®Û´	ÏÔ_ËKÝÑö<Eà%¶ØÊLÔ Ge&ñ_Dáþ]µ9p¤çhUªõHP¼)îÁè<ý&=}¨&MbÝ]8ÝO+î°Î%î\\Ðb îZÍâî¤Ð¢%e«o¦Æîåbï³!ämD=@Ý;¸ÿÙÉÁï¸½Î¯´~ÏÍL¡zÎ;ù¥æðw	I5õóR{dûsSs3Û×ìæ¶ÞW×6[¬'Çâ'ü¡Åø(7;j²*FK­NU\`ð/êYVsèoOJNsïttüm® ×MÎå>ÈM®L/ë'¼#ù&ì¶)A(")Ê3t=}ÂPVwvÄÖ^[\\¥J¢Kª~¬¢u¬êr¼&;Z¡Îj\\xmJ>¹~2K6+²ÆsÂi^Î\\2:TJnJ~pÊ£u®«?«VHJþlÒ­z9Ë+£Zq¬ú6Ë/lU®\`=@¾ªM:dKKðEl9®2§::;$M6nª|ìdLOJ6mrN.ë°º´Z4Q<ùK¶qÂ²]ì>®2]:LöpÂµZIKì®Ï2éJÖj¯Ú°Ò_®72Å:àJm"?Qì®çl~0½K®6®	:¨Q8ì{®=M2Q;xMÆob¹+y®õ2:ØKjâ¯1Hì-®q2y:ÈKæj¢¯0G,ÑüQ®Y2	rªT +i,\`Z3Ön*K*a©.9.Y®2h2¨2(2+2«2ë2Þ*@jR®:°z>Ëb,>Ï|2:ôKjá´jª,Mn±©.Ul_®D2ß:Jþmªú2Ë3l]®@2×:J:w	+Ë=}¿ýhPûÂÌl§x'pxnÌ¦;JÌ«Ú+=}lGv¬¯2:ÄÑ¬º5½LC;lEQ;¼JÛí'¸ú*=}\\lI	:¾ìØ¡@K8¯5ê¸¡>BP}ÆgKVïÎ³\`íî¤°ÚE»ÂG0S±sµ¨mâª´ÏëÂì®ÅÅA<½Ñ¦BÝÂ¢Óâ¨ì%CÅvê_bÐ<R²¡[;gúJ´Jwvðª!·3#Ö.îp=@/½¾/=}ÝbPÚRMP*PFþ²ù¬Àløîp%7½Þ9PÔÒþC=}ÿ´³Ä{E{A¬ó0½{mÞÞCøUZÅÊMßnÅàpàoEüêÎ«sE¶s¥ÕU$Ìe$..sn{^$4=}!vÂâ-û³WZÍZíZ'Z[G[vºº¼MPØUPØIPBP>P5v«ÂâýZ*¨ïîç°³Æ­fKÙ/ò;¬\\ü êÎªs%3½àø¤¾MôæCñ®¬ë½AÞ1±dÜÈî×:i®\`ên'G=}ßëSÞ÷CÞ;PavüÃÁú ÂÊ[Ìw[c¹8¥²àðîæ±³ãÏà ûm B÷/¶kUð¶eF=}ÎvDBy9Z¸hZxjYuøB1¨¡¸¨ÀûÑ9ú±íú.¶½{IÍ÷'úèàèâH´Éy±ö²¹¤cÍ&¨A»I@´~V,9fBPWínÞà¿ÏÛmjuw/ãHñëFÚ(ß¿úsÓw¼zR8V=@s&ZrÓdkªDyY¤SÇD¥Y#£cràd8|pÔ­Ù­-øûFOc{° «	q³¼|Qbs9(¼°/eu*¾VZÛð¤ENé­¾ÃºÖ£·ü­ËpýÉpó@¼|AÄNÔr¨Û³\\uWAëxA{³Y¿\\âsãs¨böã=MLg»h?º\\¡£rGyó#ÔÑaòuS¿áÊXÍ<Å¼Ü»ð»&üêÒQé#s9 »h7 ÁtÓItø%-Né³#NPz¼«=} *ôíØ.u¦²¾«³b\`O~jÜ_UR~UNgÒz$~\\vôV.µtøïNé´ïOç®¾æÎÊ¡â^Vß¾î@¿ÀÖæ6YU#ã¿Á\\UºÖ'Tt9ÀqrÉ~¼«»|áRó£çL#§<Ù¿ÏÏ1ÔsíÿºbÙS>Ø·$»&¶N²$|ð0ü­püQ§=}S}s8XcK#_OÛ×ÏþÏ1¿Í(GNàÚ½/	wåþôü}Ü WgÒDW§Uhñ´ß¤7ðÓ;KäqÜ]÷­ßR-5õÎZö¡MTT\`\`M\`ÇÚÜJé½S=MÞV×3±§32j¶Áw¤óök,©ó{tw¡¼ì cuðµzbë[À¶©ãrmÎþ\\@óÄñ}}î\\ ôWÆ¿ÖÛ(¼[\\ÉÞÐtÚ¾»FTó5sµtðttÓôrÓGUtðÚRSÖtsuôj]ÊCü­ö=M¼Ûs©wÿ.óäPÏp¹½ìy½¶u®?¼¨Ýè4gVÏàfY	¾=@¶¦PC±§»\\vPDQEgí_}M¶§£¨¥cVæévGSÑxÉOÑ QE÷CüÉÜ¦=JãÆõsáÊø¢ZlÇ=@ÁûªøÂcsáÇß{ÔMkÍbçÒxÒÁ±7üEA÷=@±gwÑ ãÑáÔÖ÷K>1ä­ø}±_À*ñ¶Q7G»¸¡¡bDÉcÐ6tçëóâ¸}íiÆ½ÈøCwÅdÙC[íÌÝHmpX0±_°_	BÖ	>NÂÔûbÞâs(®sX ûFF ¶cßÝÿÛ´õÄ-µ¶E¶=}g×oxâDy¿Ý©ÛEâÙsqÈåEEÝÎ=@)õ¼¤äÃ±ð¹Úû7gMÑg]à_ý"YY=M=@	¢Öuó¶Û»Ä@½ÑyÎKèpá¨ü¨Íx£¶Kp)ÚúG(ÓÇ¤ß!5Ý vª®¦CW1*ÿ%óÊ_u0"3»µ®9åÔ5_èFÄ«CÞ¶ä÷êd8.Îú«ÅMjåYu]áÎê6gºFÏ©ds=JE]uqéås\\gÏ¥Ñ§Î¼},Î|GmÏYÇµsEþüÏÎ\`?Dr$WÎÿ$tÖÊwÜøt½ÇYO1I»4GçYgô¾ùáUS)Ö·Ò=J¢ãs¹£è1ãëîäÇ¼íü¹¨¾©¬è}óU$X[ßFÈæ:úhüÛßm¸ð¤Æ0'~ÊD(áäC0=@XÖ¤ »ù5a÷fÓ @!èÎå*u¬mH=}õÁ t	äåÍè=@]¨éq ÉÜ7Â¦etµúºÉi¸3'zí!ì×¡¤Ñ>õ¿jóïïñÁD æûo?Ld>b=}càÖTÆQ	 H'D$½Wõdßv¦ûèãÇ§C¤(ÚQþE0(¡Q«±r3*7\\:ê^Û	4ô|9AÇRkY÷R¿í¦Xhêäu4(WÙS¤oÓw0||«¹=MÏÒíÏP/Iuæ´óøOóiçèXIláåGXs$0°8C-ÃÍßn]Ñ½ÝýÆx\\DM< ÃÞ¢Ð1Ù¹|¯D¢ÉdíQç)?%=M,öVF¤£kåwuðHãô²ÒX=@ _\`V%w	×y¾(!prô.kXÙÀÏS[¤ÿLQ³¡»\\Ìs} Á§·º\\ÅÞ½ù=}O!âÝüj óCÑe1xºÃBNÂÜ=JÕÁ=@ÿNù¶,é%v{\`	Õ~¬Ã¿¾A~Ô_Îøê[%Ú3M]	CW-Ú{R/ñ/NÍüÞMN¹9NãÈKüyUáùûd?6yã¢Çc÷§Hcy¦+ãèµÿâèÝÞþ&wuéYGM÷§©s´Cén g"ARa 6èFVýa'ìÜèÕ¤C4¯§u¸v&kåª®ªÅÀ>iäÌ^(èÉF[ÕÍXT!O±åOB?h;ÖYE>¥ï×d ÅÓÁ4c§Bûû!7(à³yôÑæqéJMíOýWL$Ñ:éýÏ8WäÒöWÃÊóTYò.×*ÄÔA8d_ºó¢ÖÓ¦¸ê2´b|ºßû"ïª#Í<ÞTÇy³ËnD.ÿ¬#/.N¤H.dà48©-jq@0GC=MÚ·ê+Ü]üÁ²ÞÝlùê;6RÎ,½ô7<,óôU¯jÄ:Xot7ëá(¤\\É½\`Ø­VbNê½"~éÅaÖ×~Ð¢ËÊf 7õ"¨çdÞÙÐßã¼¯-§³=MOÏN6ÓwÝ°ßÕpÀYRòùí/ïDEdÒÁ WÞå#-¦VP£"»s-¤Þ¨÷T;rcb¹åf®û³'%	Ü{?t?7ÀÁ÷yÅ&½=JègeáÊ@U»yéûÆS=MqOñ9²Û=}TM ©±\\ äYµÐÏ ð¡\\Y ª´¼"îQAhèb±r {¿>Ç!´w!Õßüò×T¹àßÜè²"ÿ²òtl@oÈ§'¥![ÙLÙÝncR<_$j÷Ò!åq£¶IC_ ¶Ò=MnÇ¡oQÌÄä?gm¾+yÏ}ÓjÏ!Éo¿3¡TTwT«÷?ÕÕ\\#ú*ÅüÞÏÝ%>øçôÚUµ¾+ùTÁ&aSd~f ÏËMôø¾ËoXU¥SX÷HUÉçÆð©{~µ¸/àËµwÖa^áAÝ=@/Ì'=J{«þ¾&(ù¯ºÎÌ¶ßWó&4À9ØÁqæ> %NUu¢{ÇTÿ¯Û}DÜ¥ÄÚ§ÅÝó?Ûh¹ÚDà Ñ¸ÅXýìV=Mz9 $¹ö=MrI s6SÀ_ ùxCê0Û8­=JüK¶É¶×ðÝ÷!<mÇí=JkíËl³ëÛnàÚ<U¡Q³W½öü9NÝ[«S$ª>à4e'\`¯?6ÝÛ[WvGÝ³×\`§ð(MßÑ\`à=M··w"qèï\`ÆU:HL¦mÊó=}Mbm<ÚctÇ[W¬Z[6ÂJ8"=J*Û üF}Ò_ÎHâb[=}xp²(]èLùò=Mg¢ù':á)TÈ)[Qôò¹·ÏÜÛíõV*ióð\`jEµÄé\` ç¶·÷5ÛÛV\` #4"b¯'¦[¯GùrWÑÚ<Ý|]4eþU¯·¾ìüôÑÚA£}F4ÅJÃÇiÈö¤t_ÑQÝKm¼Õ@ó# K¡\\µ¦Éî)»îwÐPÛQ§½¿söi^³×#ÈòðtáNÜ3³Án=}»òpäQÜÒ¥ígíÜóí­Ø"buHøìY9+±Ûàí±Ûq°ÛMèíÑ%m ËÖz\`âëz ¡R¤Q«ÇºêTONÚyV«Ã63Ö	¢fUhÈw4¸»!=M¿ß FÕDHñÖÙ±ÚÞmKm¯Üma­Û×­ë+­¦ëVù=Mkö¥J=@çõJôe²cFòw«Ú× jÀÃcªßcª$7xË-õ'Øó'zÿ(å¨¶×ñÄßñ Å%Û[%´èÛVJV¥ÖYI=@ÁWWÁ·bIí =MÌ[Öôï\`n^UNÄ¿e	±÷ríDíäI÷X7÷÷Xïd¡ïe} É Ý©ë¿ë<xåÝiä]ùÀZ(å\\õòØj AÀúÖ5)Ö]hÐ]BÃß³G³Wä»rò0¢' Txß±äÞàwðÞE§ÛkÕÜ¯?Ü<qÚl×ÚÛ!Ýp­]ÅþÄ#&´#$ßMÁáWuà] á¿Ôßx^±ÅaEÙ\`!¶iôH7ôÅÚ»³wöðÒðV¹ ¦M ²w'ãKuò¶}DÚ7Â§ÉÈ¹\\þÉ¨Ôõp\\tG &} ¤r@$Ì@¥=@å@5å½'ÿàP½ø=@]ÔÝü?ÕÝ¼EÕÛ#ÕÛÉ~YÔÜMMÖVùTùTÖðÿö©Éìx>}±/{Ëu>}=}M%ñ¿ôöÒ<5R}³Fë ÄM×®´Öó4Ù$?ÇGvz£\`¦c àVÅ»{°WS°¯yS÷ÔèUïXßWï\`c^ÆD¼ß¢¬Ï\`TëtWø$¢A¯µÛÂiµÜ4?µÜ³´ÚIí³ù¸ìÖØìÖö=Jl¶ÉSòX@Yò°wRê9Ô°Ü_5Ý¹Kpý: ¤§Z=J>ö4I¡0Ü,Àj åh@ø-ÂO¡*uÅÁ·h=Jù"$ÝÛ£Âê¹_óñôq%ÜWhVíí¤õ÷¨#_Aµ¡øïß ¡¢[yà×ØQE[ù­g¢9UÛ/a\`céE%hê¿Ã~Aà÷ìhá^ÝEõvÖME=}pE$}ø½Ù]ÿ³÷òpç{8VQgiÓæeÃ0hëv±´ÍÙô«ë¾m	hS(iTCI¾gÝ	Sx«¿ÿUUµ´è|È¨ËvU!Ãä%ÓZ³\\¹i|=@ITã¨åÙÒ y[FæÍvÕ sd}c|°\\~çÐvÔ¦ÁéöÏîÐi¿EA¿yé&ËN1Æ$÷dÕÆeÍöHtc!®¼fâ\\!{ÏzMt5±¾ï¨PÎ)Ðf7iÊF$éÁÅU!ñÐUïiÍ¾(ÁÔøxÏ¿¯àUOáR;-aS8aRWØtÕv7Í6ÉÞt£¨¯ÌO\\ ÃÏt¿/µ¿8µ¾§ARuùù}ÐÄÕd3¡ÈÏÅÐ®ÇÅØÂUv}ðøÉÌVô&ü¼Üú.¢OüÏÉ¾ºðÍ¿pTÅg}¿!}¾_Õ<¿	¤7t@´}È	EÒbVÑ6<Ín×'ÕåA=M¸tHeîëô'tv#Pt±7>èÌØ\\ç§WYùôM¾}ó{ô²ü¿¾·!õUG¿{¨:Ø~¿´Uóí¾Ô5Tý$G4~Øî(TÑîöÏö#ó}=@ÖÆzÄU¸t=}£C(Wôì%Ò«án¿ÓRÔûÞ{ÑI³$_l¾¨ðÓÒ'98qçØÆ;ßôÈÒ	µmþ&ÛUÍFßâòÒ¾î{¹y¶\\'SÉs{_=M%qDuÒ7oÈnnE}VÔtr~Û¹Ò××FÌ¨çVÜÝù#ò"äåL÷ó5MuDC#cÍ{!úf»o¹ÈåÔ<óA¡ÉÕcä¡ ØÆ~±§áä¸	áN¦#èÑ	þ§¸¡=@§ÏàbÑùòÇU§|rä÷¼#ÔqÏÙa§ËÓ$!ègüÿ}­üI%¶r!i\\P'ìù5ÏÏ¡åbY'Ï/õÖxé¦äñý¹Á('(«ßý¹ÐI³d½&ïäýÙÏYÙ¦açíñ­Pçté$æéèÑaÙ}é¤dÓß¤Bÿüeþg0µ¤×·Ádiv*ß=@æJßÍ&×4¯~v;##Ê|ÒÜÙåUÒgFUÕ]DUÏ#ßçõ<ßÿy3þK%EÔG6wÿ·Ò­ßAÑ@3Î$!ÔðØË0è×@UwEüèºD'KxgÂ$l¼d±w·EÈÔ=@EÏcgý¶d÷=@þïQÔ-¸w|Á!ÆÖ8ûwVÆÐ×bmwgÉÐ²ÇÏÐdù{YÃÕ(C[«dV¤»Äánb¡ÓZ&A_#úß%¿ÓÕþm=@Òß&Ó·a×ÒèåÚsÇü¥µäßëÎéªGÔ=Mx_×Èhãq§¨ÉdsäÄ\`¶Õ«øC(Þ-Ê­ÞéÕIUFùIbÌ°^bÐè¢¦|'S!+þÔIùÔïÿ{¸Aþ=}YÔÛÀu½?ß÷¬Õj=JßüE#ºðYáu'È¤L«m4¦Ö°X¢ÌX§Ð8y¥ØØ©ÓÀÃt¢Í=@v¨ÕÈ¨!xE%kç¦!ÍäßY×Ä	þ!¦ëM¥ùr&¢Ã×Ô=M/è¢¤(h«a5÷Xe¡}Æ¢ïÄøf=JÕ]àïê9!^s(P(Þ³éC]TâÝ¹"$¯ØfÞÛEÙÒ9áãügVaá1É§ò­¸!4¤·Aæ"ÞûßvXH¢UAi\\caan$9§¢Ãèæàÿ¹§ñG%Õ$!(&Öææ¿*%{*)hWIYzSºç?ò¹9Éu0xA­£ýÎ:(q¨¨z¨µ3Õ5 4¯W5É4hé:<ÂÅ>ÃàZÈF~®¹®¥Xô5@1A@=M9UAýYAéïÁ=JíætÅtëì#ø%À´I!Y÷(Äi°ÑiRígq¾9§ôàÓFùÝf¡ßfÙ[Ò,=J»9z»)HHëG¶=J!I½T-»éN¼®qù%Í"°ð4émÍ$[èU=MP~÷¦Ö&Y¨á£Ö_ØÈÓðAß×ø		Óø9×ëG	ÿ=J%¼±$¦&®¦ËÏ\`YZÕ\`9ÙíQYØí%Ùõ]=@ì§ïEó0&ð0æ³°fmmÈ|Þ;YÝÐ;{Ú[ééÖ[éÅÙ3fÙ3YÆÕS¹Çü¾]\`=M¿q\`=Mé§ð¡8øiøëg)ëaó¡Þ¯ôáüæj(t(í±8ííÁ_õÅFõ¥ÀñYñ©ùwó#øq#»@Gâ¼û«%@ò÷òi Ãçee\\;Ç£OÇ#EÑX&	XæüãX&#ØZéUIçUýÏEÉ(aÖj¡v¡ÈéeÙzÝ1âÌ1)	½ùü½É~¥¸(ç¢­®¦ãæ¤æ¦=M÷æ©nIhIÒ9éöÌã^y¥<÷=}Õî§[æ÷íBÒèèæ·èæ{¢V	ZLÀ!b=}õ=M,%EÛ'"üç'"m©Ìo©(s©)ÞiÉ¨*_*É¤*¡!FòáCòçÀ8ÝI6-µ9u07/¡8ÁkæÞ\\ÂD[ÂÑGBö9±dÿ±ºûm¢=M	°F÷"ãÎb¢¡F9¨Añ®ñ¢h£f£WÈøÇêYar=JYpQ¥=}âñÕ.HzRI RY\\£RYÄ[¾QéCô­56=Mã8=Mñ6=MÙ©Gð)äe¶¥¤7Ô6­±¯±é9a6I'<£Á³fy	nH¼Àò±wká=}ã¹K³áYÈî\`s=M¼â=MNh<W³9(Èîu¾(u±(c[ÃYÈÅöÑrùOØù½c]Ðh#}"×ò>èÔo4	=}Åì'©tqÑ­|â>èt4)o4)=MÏ"¬\`ûð=M¢Ë=@\`Hõð%ïâ=MRE©bïð'@"ö\`Õ·9=M©(=MiÇÜþµ\`¨Ä·¡â=M{¹f$¯·	£=Mh"ù¢Å·I&¸	Ã\`(C	2Æ§¦ìÃ?¦bé¸ðXE!µ·?È¯0Ð\`ðuaEU: ÈìùrqäÑÚh|Â_]Ã_d¼öwxw½yÆùNÛ1=}½­sïÑn §L¥þh»]OÜ±ÝG±ÝÝ#Z ÔZàz "z	R¿êFL<ºfåfÈGäHñ!²¹±Ú§±ÚHy0Ýé¤7éDî8ÞHîLx8p\`º¿bª÷]ªWCÉ§ü¹w¹÷Dõù Ë^°6´q=MÌG\`L¦%Ú#g¤Ý(Å¥ÛgI¥ÜNÏQ¿­iúÇWÁäÝà»ÞâØÖ($X÷øÖ·àû³w» °¶ ó' ÞÛGÅ}ÎW%|å7%=@ç_Æü´Å¼Ç¬uøÀÈðPô4gì\`íh^é\`èaaè©¦×ñP§ÖõvÙÚÐ¹ÝHÛÜYC_÷ÿç/ÿúÔÖ|©UUÌ4´|H¯·%Fó4ÔöàÕîô)Fë\`ÙòlT]õ]ñEüð\\}\`ÜS;ø8Tëµ´ÝÀµÛËoåÜìsñlÊk=JR]¸ùùUKV:"OºÇÄ¹¿,þ0© ÕH ¨Õ§ 0ã6YàßÖQeìD9XVÓ´ÃÇ&ýòïDMÃÏÑc¬aêeVÏäö(¼Ó#¦½¥µat½ÙY¿fxù¿Øy¾ÅH9¿!¾.Ùôõ7Oþ¦×éÖ>#k(Æý³=}týq?(õK%î	>	k%¿Wý?ÓHÐùxO'\`÷ôöE¾Í=@TÑÖ|4¿Ø¿ÀTíøX~¨\\yã;eÃ<»ÐVûy}Æ"Æ[k³gÃ¡Þ$21u~V¦²ÜáiÙç¾0ïåRÀß\\çÅUw¨Ê¥}}ÓÓ´¤^lc@pÃdÕÂ\\+%jhO	}Û7_UI8tj%Ù{­n¯å?ÿÝ!I{7g9qC ¸ÿ§þ'ÒUÐocFG£V\`âÝÒtïÒ+{Ì¸ÏÉ¸Ã©Aád»éÙc¢õgðÄÙ ¤àÙ®%ÖË vùb^§=@uO'¸\`¹±9sùÝ¤ÿqXuIÝ}¤Uu¤¤ñüÑ)Ã(Å¤ÉXÙý¥ôvÙÅÎ 8 i)ÏhÈqW:ÖØr@lß&gÙÜdðËÔaÑàdVÖ»ÄàÕ¯Üp¥=MØ"§þµ%ÕMdïÕmNÓ÷aÐÔÓypÕ?5·}1ÃÒ°øÅÖ=@bewg^}¸$æ¦òìoþ³Ï¿yõÿëËÕÿý7=@Ó\`Ô©÷Ì8áÕ(a¡Ô¥\\!Ò,~ï6ßjý­åh±ÿXSñþQÿ§uùÒüÕçAÿÛéÚÐÐÈ/×¢(àä&gÃ±$Q=M	ÈÕm¡é|eÙ©Õøk÷eÝ¤òa_à®îu}ùÑdYG# øæ(;-ùî%ø]mfô% =Mhñ£H¦'Nyh³AézeA¹ÈÅ9&í!á=Maw£#®@+âTIi(hºÉÒHö·ýl¢ü¿&f^Þ*)@º\`A4ûµù­µS´ Öb¡X~¼	BøùÎ¿ñ¸¾ÑhÁ©?SñIàXùi¶ØêÅTiMâ(O(TR¼ÉØDï¢Í;¶iÄ¯!(ÿô9ÇÒôÿâùå~½IØï0e´=@áôþ©nþ=Miqÿp=@ªDÒô·"õ·£<w"ÚúÐæØ]¨öÆ©"ÆÉä¬abý¼9ÿ´þÄYríÁõ?eHAúÈiÞõx=JéÇ¢r÷ø¦¹A¨#¤Aÿ¿Ù³ðÅÁ,äeYâÏ1Ù=}½	Uµ©æ=@µ¹ÂÅQíIèí©<÷ï'Ù"§£!tÛæÛ¦sliöÝiãài¾+¦÷ã+&l«æõ«æ|JhziÂ©EaÂa9H½°ðbH]d¸y#DñÏkÊ?ðm÷=}â«.èßzhMR	%RY¨Béæ¡BieÆ09í¸7O-=}£ên¤©Li¼î=MPx5½"òs&r\\y¼öWv·XPóXSËt4	fJ¯y¾ìFwÏbIE9Õ=MÀà\`^ëð±xÝ¹Õ¦ä·yc=MUØ"]ñg	âñA&ðH&B%gßáÛqV³·÷í´ÛeSõùSöf¯Û¶=@Þ\\Õ§N³?ØÆîhVuÃí²P=J	øCð'[¾CG±\\ÙÌ3Ö÷¢àèF¨2Õ4&ÿ­Â«VÙ*ÓIÛRÀÁÏÂö=@höÙ{\`y äy9ÐfðPàôHIö5/}dÚìñÛÉÜßÝ°à=}Aakw&ðÁÕ7$$ôÉÃ»V}w¿ÇT¯g§I¯§Ó\\Õe¬ØêVåõ¬Ä¯gXóO>gè@°Au@±d%91Û¯Û_M'IA¦ºÖrY\`¿¯Wéô<çöVÌ´«§òH¶ÿÛ_]¿ -iSÝÑç{lg}§ÊnåÏþ¥/&Õ5ôûîý´ÒÍôª%¾Ç R$|×ÐI#oCFÝzf#§ë~û3ôÍ¾í'±Uë[Û´q%øtßôáÊÄtú%´të	´Tõñ}´z¿¨ÈoGriAÁØÒ×@p§Ãe\\	$p{g³ÄdDò¶ËA!>ÙhÕiÕÉRg÷çm¤Øä=MýdWy¹ÕÐ±èÆú&\`'x=}ßFíÉë4usÏ_|HqZËÏ¤saß°+·wóÔÝÉþoqPÔØ?ÑÕÈuÒgµ¯¤dßy@ßÏ;Ô­¿Åñþ?$Ý·ªiÿâþÒ¹þ'KYþÉwþ#9hÕuæ?gé<=Jîé]à±÷&íaæß1=M÷yÈø÷Ñ$]ïf¨ë¦ÇmR	cÍJIIð9ùYô¢Á=J¥©4/¾eEÁ=MW=@=J¡ènä_L£é[4ÙêÕ³Y¸Óë=Mô©ÿÙí=@=MÀx7"àà·âüÊ3ÉèC	Àå/IÖO)§yh]ÏWi}Ûg$Ò-Ùbß=}Ù|æ5ßéUzÑeiÎ1©<ÿµ	ÅÙ\\plÇ¢§£=Jhæj©ä*èòjüJÅeÂiÂi®ùÆ;ñ}pî=}Ú08OÇ°o±±É¾fWV»åH-×	S³¢¾î§%N\\Ù|]¯Èìyæy7>EZð¡ÖÝãæ}E	¸cæ<a7\\Ô/Já4ßÛ´M}á×ó¶voÐNÜa¿°Ýi 6H3§¯b ËZ8ÙàÉì%ÜÓ$Ú¼¤ÜeåÛû]JQÒ«ÿâ°¿ÀÖ²ÐÖñì°Ö=MÖänvw@ÇÙT%Þ[´óAëõÜü5tÜÛµÚQµ4Z\`N²ï@!¸Ø·VÖ!=}µ[eÜ<½èU(¢×æ¤§Ûg&uã¾\\Ø+Ï½¿L÷Rw@YzèÇÄÌîEÓÆdDÍn3kc©]ÙÔ¯x%~¼^YTuR)¥M	NÞgÿèç%åÏ!ÚTe'ä(µkGõÙÀ§:ÏXYWºC\\pGbmW¥¤Û¤KçðáÄQ¡ßÝóþðYHÓ±9ç}Ñ°	ZQHDì©ë¥@¥|cCëfç¬æ½Ìæ#kchÔpO(ÎìéÀ×ð!7Õï½=MÍ\`«­ÅÏ¯em#døâ%&|vYXÄ1õþùUöCòåCö¹³=Mã}<"%¦í¢Æ<£Åùs&=MàS¯9Ó=M&þEA@§c(3öíîÑSh³ü²Ü#o\`ù»ß1âwÉ"æ¾vÜéR%ó	Nc§vÜsXOUãÛÆ[l%Âh4h×xyãÙÆ[tc§d]rHTÑòÍ29§ãz#é&Qrëlo´@UÌó|Ïõ¾Wèl¯²t¿MÍ>ðÖÕÙ{Ý×ìëLÌÔ~×{Õxç$7EaûÔwå Ge¡ûÕyv	¨-0ïO6uvtC{ÑzÃòD_ÿØÁg%îIFiVSOþ³½ÑÏ÷Äe©YUÖ	â(æÏÖ7µC^^âÉÑ÷Æå¢ïä÷¡Ñi¦&ÏÕág¦uØ=Jt·ä6rHÉàðGéGg§#ø½afÝÀû³=}ÖÜ!!}AÙ	© YÚlç §pvÂh·¡Õqø&£'½Á\\WË=@\`'pvæ!ëýÁi¨'Fá²#Ù\\·oEÅõÈý¡å>ÔÿWG±X§÷ÖóêóÕ!¦¼Ô×3é$ëÓvÑ[¹i XT(ØiÈc¿\\¨=MÃÁ¸;ûÝ!iÖ©ûÛa¸?¤÷¥ý[=Jü}IGÖíaÒ+§;å¯Ð'	<&ç¥!=@×Õñn?òä#<)xÉh§úøÓ5}6¥ÖCCCe¡ØÉzÏJïÚñd§î³¶¶}Ô@ÐB ¹5{6¥Ö=}q¹Háù5²©18FßínK´¹úËm¥!Ä~ßÚàp\`8V12JÚ·ºtO?34ò£éº¤T>Àñó¯ÏümÓ\`~º-õJ!À¹*ªp4ÁÑì¢Tð£ÝV+CA$ZÁÎ´FãÌ^q$RßÀ¡ó×+;µ¥s ª(ôkj¤·ÀmÏûüÓäæØ¸ãJ¡Á9ôX|®~vÈNA½PsyÏ$¤ãèÞH §=}Üá^n$mTUÑóÏ^×þXaÁàu:#9cÙ¾N¿L/ÎÞj$TßÁ!óÏ§|Ò¢¯ckA^.õÓúµw¯¬4ßúÏÚ]LòpF¯·ê¢öÚÒMÙ»êìR!»¹ôHúiµCcwX/''ú'	La«/¯±fzhU%ë =M\\"ô;Úì".uªE}"óíõÜMVj¨±?ìy+­gë4ã0Ö\\FHÜUkxìPÒv)6²0ªW*E7chS¬ò/Rö¾õëø=MG7¨¿ê¤JÁFQº-U7 45R§¦­kä+ E+*iåPÎØü+Jz¸.Ær\`ú³ÁóÏZsTIºw|ÞvTLyºµr=}Îñ|£×µßUhP-wdQ¿ÀÑõÏÏüÓÓæT¿fÛ0Ç½ríÏéÎtfâmÈ1¶¾àHã×ÞqôM9Á)¼ÇÎÈüKÓÊfpXR·«cw£Ï}Sc¿eNås'Î}|3£ÜlÄVgÁDôE°üpówQÉ¼uüo*ú÷¼õuÝÎ!|u£±|KÀ=MµhS/µÝLY¼?;dôÔ{|Ï¦?Ùõ¤&0µ¹{¨÷«ðY_êÜCàañ)[{X4UÄQÚQ­g¶¸»¹õÚîc9ºCCþæ«ñ\`ãCÖæë£I ?°öÁUíì5Öf ôU=MYQô!F°¯óã:Hê¿5@aøY*úãí=@^wÐòOß,ÀMÅpÚéÁ%õÑI(&3½/¦ªGóxã?Ö¦.#yc: jaµÜÚó®3Áeë\`Qzàóar­¶ûp­Ä5¹ãME]7æâsE¥TRçtEÕþÛ$Ðë\`$ÑyÖòÐOÈù|ÃH¥ýé÷s8Aý!oÎÚëeÐábÇöÙ ~¹mß5yßêN=@hfrÿJ³ç}ÇÝ-Nú&tÔÇò8&uçbe£éãf¶·&o·¦\`¾_Ù¸8Fô@âQÓ¹PÚÍpÕ3Ã£¬h8è¢ü:)¹êË­4µ~§Jàð=M«	íßÍ-Âß&@_bÝI½½ Ô±C\`6ß=MÒèVµ	þ1)è§{ pv÷ÐáçÒ(µç³ãÔ8Ã­×G¦¿'äÝ«-IÔiyôÆ¥f5©ö4_¦Õ³wW '1iØù&"¼Äì+qèRß_¥iùê-àß3Ût ®E©ÓS¥èw[ïý'E[	ã#ñ¦7óÌ¨æÖg y©hø~±çtôñwÜz)¨ ¨(7§5CmÕÚeñ4o/­ß\\å¥HÜ_¬ó?í#þx?¹Ïc£ÄOÉÜ"÷¹=MCmF¸â6æõº0q6Î÷º1q6£÷z0¸ÜZ¾³Í6RUmÃcôøz1¸äZþ3NH\`ÒUmÇcøú0FëúPFíúpFïúLðú°FÓÊwckEÞß¬\`¥/§êûA4$®Í>;qS]¸è}ú±F§ÓÊyc$kIß¬h¥/ªVRB=}FmëBëã¬[í[ >¶K¸ÛÎv¶W/¶ÖSBFyëBBµ4ðNñ~ZpcðÔ¬[õ[ ?¶¸ÛÖv¶/ÆÖUBFëF=JÂ54.ñzZqbt>6ñ³ìFÂu{Â}FU4¶ØoøöçRök¸ãB¯có[aM[qcNVÁì©°\`=M2äq^¡c÷´yÁÑãuûÏ|¨^¡S))ÙÖ)óä¸"AwL°A>[Yª-Ò¬ª,Ì¢­1o}.¼=J/oö:oW]Ûz+×þ¶Æ£ÃÀØÖÀü·×Þé·VÕ=@$Óõy×iÊ!¢=@%f	c'd¦¸¨9Úõ¤ÁëX¯=@9å1 IÜ)ÚµgA%êX ¬1å=} ÛYï(ÚµiA)êX(¬&1å"=} Yï)ÚµHA§êX¤«-å3 ûAÌao©ÚµHA§ìØÌoùÚµèAçíX$±¢ª"ª¢«"«¢¬"¬¢­=MyìMìQìU)&CÙHõ"V!=J½¥G¦A	ó¡Ý0=@ìÄE×ÖÃßÝ1 ìÈE¥ÙÃç-«wÚ7\`ì6m³wÛW\`ð=@F=M-¦«y7hì"6	m¦³yWhð"F	Í+ÞªPú0DkU0ÊKÞ®Ðú@Dm8ËkÞ²PûPDoÕ@ÌÞ¶Ðû\`DqHí*Vê.ê2Öê6ê:Vë>ëBÖëFëJVìNìRÖìV?)°©éÛy6%Jp"!J°"¤4¦§@²cè¨µoîN	ÉïTÀ	C[÷Û¸Â Ýrv%ÖNä'WÀ<}i@³ãiµïî!Ùïà%	c[ÛÈÂ$Ûjx§ØJâ(VÁº}ÉÀòcØõoNáTÀ	Cc÷#Úqø¨VA¼=}ÇYõ¿vùScÿ#Þuø¨WA½½Çõÿ	cc=M­¤èñ9Õ/Ò3fè×j÷=Jñ34¹yz¢&Ü®Äî=MÅÿTþVH)ÖÀËÐ"ß8_¹ñyÕ¯Ò³fè×n÷ST¹ù{£&à¶Äö=MåÿþH)×ÀÍÐ&ßH_É9Õ/Ó3gé×r÷#ñstùy|¤(Ü¾ÄþÅÿÔþÖÈ)ÖÀÏÐ&ßX_ÙyÕ¯Ó³gé×v÷FÍQi!W![ÙíZQ£B¨Zö'Â­èI°96Ýh-=@5íÖI°96ÝiBéZö(B¥êZ «/í9°ÛQ6BðZ¶'B©êZ(«&/í"9°Q6=MBð	Z¶)BgêZ$ª,í1°û=}6ÍYBpZ¶(Ò)úM6ÍyBpÙZ¶¨BgíZ$°8íI°+°-°/°1°3°5°7°9°;°=}°?°XÙÑ_=Mà§À¥¢g!eæá7ùÍ%à  =J+E¥¬GE"£ì­·&æàí°¨H[iÙÂ«Éöa"òùee¦KWh ¼#H7"£ôÞ«p&ækm¨H]Ë[iÙÃ úÊÉvÅþù¥Ð^ký\`D!ÌI0&fê²Éa·GBÒÛ/¨_ úùÝ/¨è_=}üò3Ú_¾ÖoÇÕ¨gNÜtçÖg:ÓùÇÐ»ë·	|zØ¸ýåco/ãÇ{±U[Rá_Õlk¿d§7û}ÿk$tyWyw¿Ð0ßq§Î¸~®P±^Ò5ÓPºV~¼dmóÄ0r'Ê=@F¥~ñQk½mþãÕ3Nÿ#£yçÉwC|¹w°R{·ü_cÎuÌ	^[ÌjÊ1·ý¾»-,'ÒO5~jZuGÇ}6YôQ¸H²×xÙäe»kà$Xgæ¶4ÀÔµ§¾ÞÊlGÂ!ÿ­³ûÊ(ÿ¦Ë&ØÓ©½Ë&&ØöÕUk§Ã¤äS¨4Ð1¹ÒiuGÄ«Ä¼Ü{»ù^»$NÙÒ}¼ÔóQùÒiÕÈ}õ{)=MOjptôgtÏdKIÒA<Õ³T÷Ã¦ÓóVÏÌæËhtÐÐÎF}!9wS~¡Ì$M=}^{ÊäLi\\õ¤shÑnÍ2¬ØøxpòÔ]Þ¸¢¥"ñH)#xnçðÔ"ùý	pî 7rþ¥´Ï²RÓJdÔ!±Î¶T=M+£\\uèN	x¼¡õ	»£áaphW»Íóã½¦ÅXØ½©1óE¹÷ù£×¦¾JéV»¿N#OVùîòE¹y°f~WIoôÌÜÍÆPUòøÍÏÜHÖTðôÌ£ÜÝÆSUòø­¿Fµ^oÀÔ¾×îÙÖæ ³íøøÒ¦p~7¼´ÃU"í{ôd¤:±ÿwþø¢LNnó,&ð§Lø¨ìvÂ ÅØ'p¹óÒ ÂÐp=Mßá¾ e%GÒÿ·ÿ$çMÞv×cvÿt('chmp¡	qîà=}»Ë)!¬Jâ×Õy_ÁÇÿldÏc)#ÞØ)æ±Éù"W)é@ 	µ²'jë¯±´AàYÉÙk¥ôÜ¿åý¡¯mGsGsQ±Dgpe]äÝ¹¡öc¼¥bÑMÑÍÊ§âÔÞÔ\\æØÒûÐæÝ ¯ÈÂº\`w#íÏ?ôÿOäÍË=@sSSù9ec&þ²õmØî8èC£Up¯·oEÀ6Ù}|}àØ{¬ðæW#Ü yxgfËKïÞ¬ä&Ð¶Gý Ñvs¥\\Ó²=MMH¤[(ìah¶$Nµ[3ç£eÀ¾ØW}}~|äËâ ØÖ=@ÆÀmÝelgóññr»»¢§û öñl}!yaëMSñ<B§¯[½ØPæ?	AAý=}¡ë{ç¯×ÿÃésøÆg1Ü ßFÇ_&î½=MD¼bÍ\\CmùüVÍ/qÄ5_HåZûihÉ+	&Ê	ö=}?AiLü±ð·ÉZttÔ(K÷Ðc#Âßéà«'%'-`, new Uint8Array(91457));

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

      const isNumber = (param) => typeof param === "number";

      // channel mapping family >= 1
      if (
        options.channels > 2 &&
        (!isNumber(options.streamCount) ||
          !isNumber(options.coupledStreamCount) ||
          !Array.isArray(options.channelMappingTable))
      ) {
        throw new Error(
          "Invalid Opus Decoder Options for multichannel decoding."
        );
      }

      // channel mapping family 0
      this._channels = isNumber(options.channels) ? options.channels : 2;
      this._streamCount = isNumber(options.streamCount) ? options.streamCount : 1;
      this._coupledStreamCount = isNumber(options.coupledStreamCount)
        ? options.coupledStreamCount
        : this._channels - 1;
      this._channelMappingTable =
        options.channelMappingTable || (this._channels === 2 ? [0, 1] : [0]);
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
