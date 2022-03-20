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

  Module["wasm"] = WASMAudioDecoderCommon.inflateDynEncodeString(String.raw`dynEncode003déúHé¶¶3{,ú´4"zÔù¨¬ÏbÔ'ÇßeÎØOO¢Kfîg´yÓ#ÙOÖÆboåãàÎ&ÆWPÞmM =}Ã.UÅíÂn I©nypÎsÐ	àGc}xt',<êòvÔÑÙÝåå¸3¨*òûòôû,¨Ô{8"åg<o¹^û®= ÷."C<ÒeL»öT&äçDÈ5èöë§F¬0)HTþ-èìKQÒ°ñ·ºÞZçö.çªKëõ¥R,Ý>Rò7¸ì/ç+ÒÃ}.¯¤áyLÈÇvÌtßÜjò5:(38ÜÑ9»ëf|¸ækÒç"ágÒd åËwâ{çWòGbõUÌäd££¨°®fë$= 8ìwNÚîj«ÉèHØ'ò©òæsëàöQkk×I¦;Ü: õX¼WÔßÔ3lÓ»{·æ!ß<é1hzX2§:üj7"û9£"æn^Td.ßhñöÅ¸¦vóøì!"hdg±fÊx= $Y)ßzâO¬"lâKéõ­"p â³Ø×6Të¡Ò9³ÆXëÏ\(¢T°+(Æèn]%éïW9 r«5ð§.¤§Ù5ðÖµÜjéH;©¦r/¤«r³;©§ù
Üêéh;©4§ùÜ*Ê48ðÀè.~¼³¥r{!Ëé%î{z@ï5f2ÅÒäßJ=M¶= =}-Ù¡.v¦Ý¶"	­õ'¤RWö²$±õá. i{Ç:6­æ¹¤hBq¢g9å6eÄVv¢"*ÒXë¢yöÛ²+» ½eär§2ËÈ·óÓa¿Ur+¨½Ö}x°ëÑ±;YtÕ %A°½åÜXUb¼Å¯ú.%ºÞ¶1C#²ío·«¯|$÷L¯>¹ê5®DUTZ'¢ILl'³Ýcë}= ZgEÌàùpeõ¦My>>Þ¡-	©­óbýì!Hð¯\Ù(z| LÓ¦}D§>õ± Ë!1ï­ð2Åè£ZáÀ(±c0hÎ3_
ÀceN2òVï¶¶Õø.J7w¨âþk¼ðXrhzYæÏ-m¢§0;äå· ¨Æ»¤"ªn^<âqËÞH\<Ì[97L:.ây[Ê  2|üð\ìØ rÍf¼²©ÊîaÖRëÖ(æJmÓQtäU¸2Ù<X$öÝ	ä2p·¿D¬Ú"ÿ%q¼]©±«é"³wÊxÃ¯dWû«E 89v´h¦G
ðA6® 29:âÛÛsïWà,"D¸ªÎ°ØbS·@Ç§»pòrÍü(2/|e2Gð(î¯¾¶½(!©têíEÏ[(úÔù¶0,¹~¥®àràJQ¼L:É;=}GÚ'Óß(ñ+gÝðâ6 ¨=}Ô@÷Æ¼#ÚàéÐpÇ7nió¯åëêfÞågNB·±;:·ñòÍU)æu""±1,á$ÍÙ·¯sÌÎP	ni¬Ç6ôöWàhd±®'Ç®õ51UýrÊÕ(¢í=MÁoë)àÆcÛóÕ
3·Ï-_ô×X¬ò/Æh6tK¦2¯öSæ:§¯ ëêª8êõî¨¦Z´ (D%=}ÈS(ÍK*õ'íú­nbn"µ&WÀB×´²ÚyûoSø9&±×@ÂdXÉYx«wíúË8¾ÞÚ$¦ÝÿítIÝ (ëÐÙ¦ä×ÛãÖýXÃ¨bPçêöî5íUîsÍ¦BÛUÈôÓïáÍ=M=M¨éô©h­ßÔ<ÿÒ»ã(=McÞFÀ©ý!váZCLñGÁ$¢+ý:Ë-ZÎéÆÚ+ÇÄMÈ.lT ÷'¢bF»è=Mz<ÞîêòÞcçLð\)1êýWð $× ,[ôþí.µàð	Ìõí'O#üº<Ñ?>6^cè3çóG¿âôJJzîFr;²jaÕéCd;\¼ ¦À7Aé 1'¢²r«æü[Í¤vHµzü.ÒQÓ=M§\¿¶ãRîà9Ì<Î¤MÅùm[(|²8øâò9òì:ÍUb1S4ì¤"ù°´¶oG= lNÁø:×Þ°ºÕª;¬ß»8,~ß'áR	ÅåýZýkXÞp,Êfï'VRLOÓaP[ÆûGÉ½êø%¹vÜy
Ó0Cïè·¿j^LëÜÕYS41Ò£Íùa÷]	öCâ:~o ioÿ±oÏaa>í¼¯íJå[ý¼ª@9xOcåÓõÄø¾ïeñ5UÍ»sÝ¸!rüIñLíûâ.JRÍ¥QµÈæ7º¿¤RñÓ^l¸Æ÷g§Xêh0}yåÇÓsG*Å"©¼P= Ãÿ@Õ%ÙM=M80®$:ÍLF«I9W°©SuÑ]PCÉ[½iFwËèTUY{D²Ò±DRqÊXÉEtjü^ÓqK2Â§rvvÛòÏREá½ô#wzcõôtPÔPì%1Ç\Úú?êàg¥}å±SqwX{Oa= :ÑÝÉJý²HÑsÖå8f änÛÆ´Ê"O_]¾ÁÕ- ¹ÞÔ)OùÉM|(rX	bIÝuhÁÁ~¹tÚî/«wä IàÞÐsIGuìU!Ä\ÓÁ')Ô¬ÔºWq²ò;ò»8QÑ0×«2ïû¹
ëáEðÌÞu±È#ÿÖrð#eIäÜîb²¾ö4½ïÂÒå§|Ìl¤JÚÚ+lÉI/V*'ã.±õðûÙèHHAzë¯ì¡ Mó­êëó}6ÿë¨1µ¸Ùô¤2sÿò¡àºJ®ÝfV	Uj¢ªqêe·]Ç]o= Çæròq½ðp  ÃÝHjàß°ÿ~îªJv4Uw¦chEwÚ»;vëcÐ×AsÏ¹¡ßm¾$¶:õî¹Úèë£>¥Ab©ÌXä·ð¶W¶p4Ïåü-$ãÐZk/¦Ò/NªÝ¿>= íG£j(IÌFPL§fpþ§£íÔrÀ#Îâ1VÏãØ:R.eµReÞx%QßóÒ j'û#çäÊçPz¼Ø$à,õ'øÌ:8YºXItÌ¼Ã èØ÷$¶àr2|¢Â ÒÛþÓ´éç¤ÞÔËãðª"Ø)Ô«â0ñI=}}4èÀ	H~Bó&ì£°üßºÃÓ#ûc>×«;x1ãÌëBÎºtØ°°¬èH«ÐØø2³÷ÝZ\i£6J²æækrÊ¦ð´zX?6¢_¿¼Òµì7«s(£¬úB9ãðcwD^Þ%^/¦lÀã¦ ¥:¸xñw'¿(ûj%ûMia6ñ ú¤¯ÃÖ©
#¬U,÷V¼°ê$>¬[saïmrwnJ¾½âQÇUÉéÝÂnXRÄíTÞ¸ùé+j÷LÙLÉX@ÀC=  Nè ïÞgUà;h
Cqý2H7Dvoè]wçã¸Âp«ãe?Û»¢¢Çm÷#v ÖÄ;I4%Û¥2âOÌªGM0%úà«ýôfRÔÉã×ätèøªÝ½ÛÂhÎÄØ'arA~ TÍv=}÷¤òÃX­ª=Mõt©cvª {Ám²C4IþÕÖèa½ ?~v«dá@W«TÉs}pdÙ=}ééÊåÑÕ	Ãb.t¥åi¼´Qï¸= M±d¨U­Åïµ{ßíÇz^i7kzÖ§å¡Pë6¡tÚ#õ}Û­ÆØnìWÁSõ½ÎbÐ"Ïa-1Ý8=}Êsßú%ø/¡zë¶ý7EHSùSW?È¦ÑI½6´ê:Ö%jÝÕIE'OP.Qò§Rrê,·B7=M9erÓ´1ÔõF®C±P§À·ä$×¼Vü
í%ÀË©ïÂ3*ù	CÜfUá±àè?4éfØ
³\Ö´swÑøÛr8¸XF¤Ín'µ*Gj¥±|öÝeÝvÏc½çÝÁBáÃùIÍÔb+!¦x¤9â¦¯Ó§|½3í®b¨ÊÅz¼R¡ðJÖChE¸©U%ÓcÎ:COZ±Wd·8í»»Ä7ôü<l:\¼1x<ùi¾<#
5%\ûÔîÝÈÊíçÓc=}=MñÂUª>W§¸ø§Øö3+Úæ?êJÇú2¡ô÷'ñô¨ó¼pÇètÙñ§)µÊr'Ð¥	©´wêÔÊZð\òòßVêëî.Q}ú:¼hLYúBÒI=Mý\e¨í6Úªõ6zþßÊñZq^ÉÜªIn7eú¿¦´¦3Í;×f(Ô=M³ôÀËô:O7ëïAU2Ø²ñ­"T~jác}SO¦FÛ(ß¡²ëÒB~8í«ôhcDlaÐ» ¯69Ji°ãnnYQ= è.X]ðZ*§ï 6:Ôð:¶6³ìèh£XÖ¨õ:¶¹j½æìË$Øk$"rñIRt»åT·1î'¢O7&Õ5çØ¡_dÂÎQU£©Ð{þë~Vý"ÚKµË»¨*TãR
²kóÇÏ*&«oªç¤= ÷ÐÚfªééï±îÉQ*ïá3¨Ä'ÌnD&z=M;úTw2óÏ<®ÚØmÈð±Hjk±}¾RÞaß2a<%þä£ý\J/ÑLNMÏ9j@1Hñ­=M4=MåX©ó!¼DÖM<ñë{b[tªË[ÙçDä§Wá­§õÒò1[gúÜöL´0qÇG¢´7ÝúJÝ=}«úÅá·Ü±Hä
¡q&g =M1[fÃ5wõ£¯ÆÊ¬Úl-ÌcÈXè¥ö73+L²ÞÌ×Óå|ù½ä»%aë+=}ñ1K×0zä9~wä¤°Ï :¹°aÊÛW\½o Pp÷úýyàé j£ÏIº(iSV$K7Ò¦CÖ9#ühÖóEßæxÓ<½:DÒr¼¤¶jü:eç»Æz±t|Á)qÓó1M]÷ÃÿÃ= ¦C¹}ñÑüÙ²7SÿC¤¤ÃÉùWü²VØ«cjW*Y=M,cÝí©(/ æ¿ù=M» é,\´rÞ4A"·Ìæ§8ÌÒSvðöåßÛ´± 
fJ³·MÓx|ÛÏnL#ñù/»jZ$vìbIqhzÌ÷Q*Ozd~ma9Å1I¹\£Ê0¤3±RÞ÷Ú[7Bëìô=M÷§9Ðæ9Ù¬íÐôë¢2ù\ìÒBHUíµ-·à®«pkp¾Ì"ò5hötß#nu	WLíw¤@÷ØÒ5êfÝX©0Ø%®ü[ðüðÐ·xãß$ô\w?1,;!:¼¿1¤Ê9 ÜWDªfª¡¶åÎ>´XXÙ9(Ü;Z£ÃCÞOfÞÆÔ ´á¹åK«¡I	±èÛô%Ø;¦$wú ò²pè,2;³èôøAß¹RÀÝ³TÕãRS= ¬~F@Iurj6ÃVùf»Gýú}#ghì64ûÊüCE£øö<þ5ÝÏÃõBÇ~P\ÉS²à¦¡'ZUãÒ7oâÏÊâwû*ß,kHÙó{ó= ìê¦H 9ZQ\Ï~y§ªìà%¨µygÜMð©U"¦{»²rkpsãÌì¿Ùé®½Þõ(é~¤·¦Gö#«à6pØ¬ð:ÝÃ¹¨ÇÈ÷-,
f¯>ÕÅ(6/ý¼ó|<<3(êæù¯oè³080<¸|×jtÐtØo6Ò¹Cq¶¤Çûóv<0zÑ5bQr·¨r;7iô%².æ9Àº¦ºýý¤møÌ.¬ÆÝ5[¦¥;fòÕOÊüLÂgì²ç*­&Jr3ÄµdÝ4±¹úÂð>¨Èè1Ã= Û^¬/·"úqt_ÂÐpl¦ì·*[à_¦ÕFÏÇYÝ;õ¦p?0EDñ õ|ûä K35JèVÈdÇøóôP_sMå=Mç§RnÏÿ7*$ôüjÏ¬= °øAÖdÊ	õFäjçõÊÍêÅ¹Ö¡
¼oÐ5GÕ5Ù<¢¶ÑmÅ@ÖöKmÿJµ3þnoÉ£lXUÓÉ-À·¥KóN<öé{|Ú/Çjê6Rçmpå½åèá×<vñø­£Êm-ÊºÎýéÆ=}éÎÄßÞàÊ<§H1¾ÕSHr|ù=}ZýswôFÝ>ÀoVvVC±ìÿª&=Mó¸
øÔËæðX·Æ'J@ØýÂw¼Ö(#tèú!$á}jÂX¬¯ sÝçYCÆÇ>"TsAÍ³/fú¼mhïL ÆS/±þäïhÍÜ^/¥½+M¼EÁY¨7
À§h²=}äñ~GEíö(c3,ZÊNG)9ÙüËmÂ¢}3àÔqSUÝñ³\¿=M¼:íA:×5ü¯Ëé¬Yå27²Ú½N\Y-ú©Õ¥Vðè*¹³M|=}Ç!Û'F¼=} ÐzWÒ Ú«YGóò=MÝ2Ý«ÊHuU.,§T¦ð¾¦º^µ¿ ¨9LÌ¨·úÚÛh=}2cíÀÊ¦Ú­$ë·	káE3	|ÿ¦QAÈî1?s7ëB;ÞQlYsÍªÎ÷oVxD³&ëæ»âßØóÄgýØ®¸L{9-QU%oäÿ	= lmø¯Mgvq_Ý3Á­å]Ð×ypõ._GÅ¾¬	ï]uû>êMHÆn \ç«¢×ú6óÝøgfó	~ïiX2¬u¦èz9°ÉYL£ò©ëøû]úsÙHõ0Â2¹×V'6në%»1I£N¡Hªe¨·ÒØu:ðís!Ê<{ÎÆ# j·÷ØJÈí|ÃÇØ¼îBw÷åäâhÉsçûù»zó&Ð)ß(6s5:ò9ìÆóùñÛì¦}+·ïÊz»Æð=}»%UïêWRÚFÃïn),Ò7O ûN»-SÑsõÖ¼Øæçn £Ùôöå_¦¦¬Q ¿?bTht×A9)CsÊoëXê2©v<= «7úÇ¬6WiÃï= ­E\«9ãúyîÓtMDw6u¥Ø­½íî¡¿P¿ùû¥ YÒ¢Àf:oèö_E¦Ú'-ßùú«úrÎK?²ôa=  {ûËoêÏ	jom¼þO(«éä5ð ,Öë=}.»>Þ¶¥©XÄ<F
jÀYÙ¾¾³ö+dä65w¸ùxè q#r>Ðð#ú[ä­áØJbð*ñ[Çø*w°Ørkº[qÅÀ¢ÎYuÎÐ ìØä"Óþ£ô£^|l¿zO·^ë%=}!_tè§FÊLq¨ë tieK¡ÊÕSbúìö
ºÒ <_g½]÷@:ñ±ÂRÔ6PßKæ=}Â·çf}ôòZzù=}»*) ­¬+¨0§Úx/ëUæ|oÑè8D)óV
1{ô@²ÜÖÎ¦+ÇQkäª4}Ü^ÒFD1±ò;ö=Mº®­Ç58ª´\*.«ðüÖ0±\&=Må&¢°®þyàE¤¡ón îþH_rÖ)ãf¼ÈÛ°åÆ«À$¯¡&·¤ß>¿ßba¸LÔ4Cásã}hE¢J¦Öcü"ètãB_êê^ìàBÿX¹ìÿ·:Ã&£ÝTµ¤aÔ«mç=}A@ÆÃ}0Íå=}¾³G}Q6ûf¢Oï#Ó]ÚÅ§ôìbö¾¤ç4a 4­JPt©#Ò âp °tdMKf:O*yTêÖ=}C©Q("Øï6 JøA@jGæ=M¥Ê2òÄÆìHJ}Q	¨[½Öz°ï¬Y(ûBçSàïzªä=M9%À¯ïª-ãòc¤¹%¹ä;TØx.98ò'yæ¼°Çâ&bá+úüfèÔiú	¬ÈKmÆ)À§±s­]ÿÍ"é%±øtÖc=MrÂñQ'{ò£©»¤ÖZôñO8zí!µàeÊåp¨µÀßxWU k[ýFÇÛ XH§x»ºt?¦#,bæü èäÞ#ÁÂ= WÀþa"1Âõ^~Px£ó§é =}1\ËEPÕØ®%×	¼Ây4ÐºW¬|òCÑ&¥®³ò6!ïòcþ}q´­¡¦6î{÷Õ«¿3t²ÒQËs,þpÄO q4äú½Á²g8³[ªàìå²Åõ|º 2ª~½Tg!ü${©]K­nX c¾û¤z	h(cÄ:üïièøtãÿ[®= fE@{gOÿ$ÀèãòfÚitÍ@»8Ê\;Pa<$<1lû¾ÆÿM¸ª9¿ÂBò+ÿCaÛõæz°3aÎUb)r@ªxdò!vÚÛ¤­Â@4^Ñ+=};9ÂhzÐ¹]sµz©^Rx=M$oÂáüÏÂoÊå\ÏD<Ó·ìùåRÔ|gðöùgJÅI tÄ Ï¦§þ~DèØ¤µ|ßrÔí¾é¼±/¼piRP#cã]Vß&¤Ê(qBÝ@£ËÂÎ£= D&ÑWÖ«XYü¶SH7gíA ãÀ·c2éÇ~Îû	=MX1Hû}§B3¯UßPTz=MueíÅ$û+3»:ò Ø5
9Tþr¦Z1bDZ|= 
ÏPÀ#ìå1¯«¶À³·vt{$/:±Ñ÷'ÙÔc'×CKë©pö|M±°«líã¨9	¸º¾þñõ×¶bµ	ÐíZ>vb¬=M.aG@û(ÿ#³>ãæ^ü«S@÷C%ÄiÿY«÷ÄàªBÌÑjÿ¸Oä©>	3òúa9px©\Lçæ0Þ&ìnÉ
}_9k.øuï©X½ý{etTÊY¢zú»=MîéÙ¡<:ÖU}>X= ªJ õ¦nµØE$r×]øÊ£
¹ªý´eä\
1+±ÀgÛ[ùUz%sa­y)2 ×V©^ú@p©gÆÝ,#ÏÀ«Äªq4¬æÏmlwü!=Mu³q±(þ÷DÍ¦hCã%ã	0«¨±DÊ=M¿oÇü,0îËrÕWÒûo)}ÓÌ.kÏwõúKÜ$KÜ@cK¼zç HfUÐ>ÙÅµGæqÄ_Êuq#×°¨MNÌscÀ;&ÓµùòµU{ëJ\ÇÚ £èµ)øeë{¹\{ë8N3çFSéåùAîÞ¿áé(W#"fv"UjÐÈ|}
óy39ujîx	©"©sÝ7ÑØXªÞ»K¦ç ÷ÄÂ1½K°&w	áÄ²Õ4&ÍáL(mÛ[ÞÐ{ßhºÄ÷çjºÄ7õK®·Ä·od5d£,hX°tÉ¿ ~cÍ NÈÎ5®ddrs}d:5a[²Ív£-MùÁ¯dUb'Ál¢ç-Ä-  ¡ÀÊ0)îð9ðf"3Ñüúwµ¢bð¤ÌKÜz'ÜVj»¡È\VùyÚ{o¹³|è&3 Ó*ÄDìiýè¶ó¬5©Üd*ITú3NBÍë!ÆVZ13ñv	x8´KL'¹ºLJ(¸¥-é ÜZU{xmµ-3KÜ*Zyöç¤%÷Ç¤&ÖsayØ$ÕnGáøq¤ÐµÉÊn<à+ àõ|!#;¶ÑjpºyWµSA+G´aC
øë³4îiAKéóCìäÃ=}6B\'þÛ_Å{9-ÔÁ±DÊxqU/f*3þ
bM° O©ot-«+Öáñe;³µ¦ÆÚ{ªËoþWòA!¨&Dð¥Tµödk54+HkfÕÐ Eå9«ÀN= ÈdÄL±öevY%¹Í^Ã#þQr¿B«à3AÊ·LËRHØ\6,jSÏ.ñFðóÆÞÃ,u
½.!ß$T¬ên-QË-¨ Þî,BNS]U'\l4oªØVnªCÿLWk÷Û<þÄbf0	å°æ1ÿ,ËÏ]r0½*^úû3a²H¢A,ôã½ÀXÐ»\pO©OußzKZáàsÿ=}MéÏ.0I¢ßI¤ÒLÿ}½LþtÚNm>à-k±¢îî/ÿ6CË6K°ë;GÂü&¡Ç	æ,9&¨Â^Ôÿ¦×o¿æõRXt~Ío2É7)ExPù»v2ÈiEÚ)¹/[§Sj*®ÓÊ(T!§]µÅ©HþYA×6tJµ,ÔÎ¸Xv:í1Á¶\èL®Çô Tè(uK·éã~Â±ÿ;K£I¡JcÂí½3>s!C[yjaDÛÌfmU:ªQÅÁæ_Øîew!ãbQá§4FRÏn)(ú?í]×¿DH;EsÛäÚ^¨¢våZÐ¥´4$é¿Ä:ÇÊÎ$¸MùVyá4½\ÎÃ¦Hw>K¥?uiÿvi·ÄV±ÐYãZwa&³Z(¯%ý4vñaÅäw2Ygí·KnéçiúûÌå®Õ÷¤Yó~ùu)£­uE?®uCoJÒ-VË [jM·ý»aÜî-ßy¸syÉí^ Í}¾~CKh8z0QDG?Doj#Pu´{ùïö÷ÕµS3^¥÷ùIdnÑµÞéº ¤4Êí%*Sôº-xÃ³QiW±+â8ÌQ)dç¬ã9çlü¶ ÷-)F?¸ÛX{ØXyH)JÜBæl;ÖEµc7ÜÏüÃ7¥-©& ðGýÛ:þð¤=Mþ*póç÷t)0y·±5K[ú4yÌÃQì÷n,+V {æ{G£ªµñ¤ÊÒ_¾fÝÛ>ðk6	±ã@ªË'ol>OÀþXi¯êýúnèråo	lMîuòL\é±¥Þ­ÃÙ	!T3×	­;tí°XÚ!°^qÄJe(ª"Z¥ûã¬ì´àÖñ¾¤2ìRØÁÊ¦1·_ßdùM²$zt».7ÈïÊÝ¥Í«µ)th"sNa"RÍ¡i 9Ú*KÉ4	¢ÊÔ$«Èã2~¼¥p¥ú^\iÉJÜS8YìébÃM;ÛN {§ÓtN$äoÅ5Õ ïã!µ×*ü	Ü@LP]kQ|s, ùþg°1XfØäN¼kÃAèågÃK¨£íë×¢ñHßdR.£áÏ #
 èýìã'(aüô §¡ó/y¼,\?æêRúñÈÈWwà8¬P8©Rþk¼÷?ÁÍ;çÖ7ìãpwÑVÖÕMÙ½Õ3Il	µB0ÐèÍ£~iY-äµIf#ù×"( Zó¢M­V-áu8%S°¿tu»ïËø	1Ë3=}DROË:Ä:û>òÄôçm.ê"CiðÒô0Ø\ISìTÖêµH<Ïw_AÄc»n4 êþWSª~l×f2Cvç;ÿ
@êîAÞ¦doÙn&£	kÂºü j3o}êUùeEÖT²MÎ×K³iimß"çó"sEä~Ü9KZé8ºº¤=MJüò<è²@ºdMx[Ë!t£§AVÿËðü
Ç¤ß¤%ÃrÑ~ò0ð	½#ZÖý»fâ2<×éæ>yÀRÍÕÂòcìL,Ü¶O'ØÎ¦¡/QWN·©Íâ)vÙ6©ÕÄQØQ!å>jrehËýõ¸ýòPÔá¨¦èöì)I}4½¨Vyu@ý\)e5{Û¡ÉXÒ´81ë!ÐÂXT½~0ÏùM¶.> ·ÖCúæ¦Î\øô_l÷4µ.¥äd-zfÿøxþ&ÒÇùì V\ñªÞ§G!ór­²¨¸DRWân4nå%å>ÿøìëÄ9ø([µÌàý ØqJéÛþ¸OÇ7Âh6WãI (¨ÇmB[d/§Î¨M¾Hí´õøH,TñÇ H²&õ¹ÇçîÒ£ÕÞôÁ?Êò±äö"pqì¬[¡§?þiUW$'ò©äd½v±ÓÛóÍü*ñ2þFøys¦¦÷pµN[1@dÀ3Íò<üÌ)"mr°ã<á»Ïý=MFï }Ç&f»-&õU4Jyí¶e·/ç8-FÔÑÐXÔviMÎZFss"7&alFÓµò6Ô-ãüàe¶ecKöóñ®µ_}Xûå= Ç1-^%(O¡RÉò¾= [±¶²«ÅkT/Teò²¦«×µ	Àé¸= SëÇ AË¬4aà)ñ#Ö%ÖÌñù^p«ÅùmT2®¢cÈ*¹ÉV"m>eãj?= Ü^:ÕªPtÆáÆ¤.¹"ÄGSöV2Ïã¼%¼^y;ïz;½]u<!½!4Óâ&:Éuÿz)¨e]ú^Cyè=M»¡¿9ønòèeYo?]É ©í$¬µ5AÂ¼´Öh©g(M×¢mF
ûë ºþUµyk$ºÜc
oõ)U^Ä¿m	ö;xqÑ\ö>}m»X+:íIÐ¡ðDW¶5%²üwñsùh×?¿½WW?
	Tõy«= ç[,\}öÚM/~ò¶ì2-ëìyÁK5 ¦Ê_F¹¨íôåÙXøR$ªG:´ºaùsªîÝ;é&ãÎ£Q!¼ =}­sÒ'ÒÊSmÙC þ·-VóGÝÐü±Óq××bh$ ¯Å=}­4õ¢NùPö¸a´lTSÅÜE X»,¢Ö-dÄQ÷ûÐáôäÒS@cú8M ¨«ä±ïmCÓ¨+ÛÒn½¦'§¤®¢}}9b³Ìö@_ö8_1ß¼¥&ÕLpß6]ÃÏ(ÿÌ©X. uìÕÍe&kMQ½ä©>K_Øº©)ë ô»$.¼2=M<<T4;üÜÑ^åöò+|ºDû]ÇH{ªvUó9}!]9|ßä­6úÏø<Á³bä--ºáÆqßÜÃÿ~8¢dF¤~óÆà÷¯×ø	ÔÆ¯[sÖtj&Ï5þwWPî/5çÔ±NÑRþØèýÖzÛËÕåÁãQ¬5¬µ;!èF; µ&Z
Èïþ¦þ§2ÀÉò½þÖb¾CE ">ß&³þÁæ~â®D]ªAç¨Ñk½]wÌM=}óò//¾Û7~Åº¡^mI>Í©)E1Ïä¯zK@Èñ|ñ2S3HVÐ÷ëï=}ÂÏ´åÃb|ô ¼ÐÕÝQí	UtZ¼¶p¨â¤æeCV¨_aÜÍ¬òbü@£ã= ÍgÇå­ÓÍ&ÊCÂk]º3aA{;ÁF¢\¶|-è'¥«;èüñãÉTE/</ðÖð.
Ø<
ü_sTêB;6²â\¡TMz§<(ù¸äNðkl8R©G³³ÏÑÿúxåb9¹_Þý¬VaC¹Ç/~I¶Fã8õcã©føù= â½Xñ"ÂÕiª-r0¯ÁêZ¯Vfôãv^ÃÄ&6HÅØóu#_s&$¿¬Þ:ÙÞÍQa
1õCêDøÝµ.=Mg¾vÏçK	äïo÷fvP;AÂñhfÄ"ÂqkÝC=}B%¬ÁÑ%¥~=}­Ù=}v3sC§böed'ÉQÝÆU©RÝC"Ûcç}8´i=M/­WfîËlíÍ	ï~maÇåÃMÞ»î:U
wIq»s!-à[V!cÝ0
Xa éKµ5ýÅ G6¬ò3i½ö×¢Ê¶=}n¡^mÚ]_wZæ¶û÷©ÂjÖAä¬}BÂ×:fÑFQ/(bMù8"¡Î»´=Me¨yû¬UL¿-çëe¼<¼ÈiÌÃáÃ <*C£/jAs0?¯lo?½âAp«)ÖT²X\ª!kò{åw)Îýv^ùâ¸DÎk·öó-R0a= »vMkH³{ª<Cª]oéiBäHW²å¾ÖÒÝF¹Ûjø]¢Ìt8é?
V¦ü¢bÒhá¼bÍhg¬;Â8j1ûîµþ²¶ð"$RNíäÌQaoö'Â3_'UGºë³Ö.lá¢Í¤x"óÔ~Nò¤H âº= ¦~åÇ÷ÌÏ_­¶¤Âæ¼R)Ã^HÄé¯z¶»;6PtìEK,Oýµµ ðâÞ~ clÑïª¯%»MáDhÁÁ°¥á4ûqÕ\JàÝ8¹CioÿeÜKÒ¯%¶uÛmÄWéw(ÿ©uÿI£!d~póZ)Ò;ê"Îe8ñäÑÐý¥l1µ/¥gÊ£óX.LúYN_Ì¿ò 9áÜÓ¹jÁ§£ZCb7Àz>'©tg*å"åÂ[	fñù2OëFöxM °/#nó­b4£×=}PÓ¡e!Øw}0ºùø£±RæÅñòÞº?½öLÍÃ¿
eEÁ¹JéKJ0]Ò= äI6Ý«ZWIw¸îv¼Ls³ñy3a}µ<3}ACl-~pf[+óX!]«VS \.2^6Dùï·Yõr¯6ÜÒh­ÑÜtúåSÅ¡>+Ëêt:¿j£õü= Ë¢ÍÏ=M©z|#¼¥½ªoM¦IÆðÓX9³þ­Ô{RÐav:àÉg¯æ;½ÝbõUÜv_uÿ/ /ûcG¬ÕjajÄéË3=M0uE£·è8s£÷åRÖkÍC]_Òë³jEMàËò°O<a4õç¶ò*Ê-ÕÁ*êaH5ÃæÄDYN=MÉmUmÃ¯×ÐÏtsñºHÚ d_E¡1ê¢·A=}kHJ&sç¡qIfÛZ/iËGDXDPÔÅk0fÔa9Pd)¿b/{]ëyBàGúÅòé'³ùè¢lA1B OG¸@:»¹¶6ÛÑv¹ù<î"Ø'D&kIWRf=}Ï±0IÅ-Éèü8¼{{l¥ ÖMEê¸!éú'ìa5¹T-ßzg7µî¼;0WK(*%=}W"3ö)¿e#PÐ­¤´3ÉB³ T·ïjøïÃØh³«$Qôö+5±T9VRÜÞÐ»Ä7ùKÒ1ì6ñlÁ­Û »z¸ºõ"Û¤u°Ô«öT+öô2ÜýûÍ{(Ûq±nú!ÛÀ×µÞÝÕìÅ£¥M7jò¼= ¼PT>GÞAcÀ´ô^¹¸è¯»°P!=M-ûNÏ x8º¡©dàÍlj5,g:lÊ®Ãêqpb6ÈO¯í¾¹³ú¬¬*bðh.´ógßàëû*ìÇé^dUÓÓ~°GÅÐò¯lO«3æImÅÁàþ@ÿÉÒº+pÏJû[Ng:+ìX;Cõü"°(Mñ>ëG5iiï	+Ñ9\Qóù^"ðH0kgâ^¥ã=MÎ¶7 DKYu·(¶b¿gÀ&TÈ¸Xi~Ü;Ê6îöÔ)]äJÈë$/4O¾}¢è}y;ñ§¥C= ©ÈPÄ\i^ºô8ñYkÁBå-\4úÄ@ªßà]ûe]{Qc&&®òLÜÂ©A¬oI®LKÙ®òà½,^ÖíªÏ?V4yNipdUüe³ÑÝíÄ´ÓHÙ/Áv<ïsúaÑléâã)Ù=}¶½)©³ØÒÁeÍZbnÿ,Æûß3+ <þü6*k'÷!f¥¤ÐÞý ÁaDHP÷$hÎòÍ{wAáIavÑ/¶bZ#dKÕòMÓLDEQßDYØß%¢Ký=}*âTõ'jP®+¹+qëo³ä°Ò²R+é®Î= :Ý/ºÑæ+3ïh»~­°»%l/V79×¾~jD3¨ÝÂ*á¿WáÞ1ÖTÈÈØYm2¢õ_ì½m=}5ókç^píL¿ú:JYÍfYLB"ÜN·5Òÿp!#-{E()_.ªebøÜK+p
üÁôåmÜ$8 FP¡Ái¸ºÏâVç¹û(Û6ì¢T¬âÁ?fmÜ8¥+l}ÄéRhÔ]ÇÉÎ®È9£ÍNÊ}UPØIF*²WÆùÝ+C²XÝwG²^ÿµAâ/²²¸¬Q?77®ûßLsP¬pÉRB>¦pwà$H[í+m¿Ýï=}kØP·ãA"³A­sKòÍl4#í6cæE³ÐEÄsäByí"ýþlDu4n'HàÝu íU±Ä}Ûn%KÈ>2îUoýàüJÙîQï¤>-BO= *&ö¤Bç;Ù¸j¥¯ûÕz °Í$,Öþ0ÔÕ<TÔáihGWþr-]Qñte%¥Át5#þÊxêVnñÛáTª¾¢»áòýU±º	]]TXD*íUó o6"s¿aOÐg½õÂÌþá	ì	]IÁ[= ÜVAà¨®Q¸òÓÝ[Â<f&/ºEJabè3¶u¦ò¦ç¸!n"Zx»&É=Mµ
ïjó(TüÕí=}ÒFjá!x¸ Á©þª	HÞ÷*Âº¹bÍèÊS-VAþqá@»¸ëë5.tò²0FÑ9Ø)Fwî¿êóõÌ¸²0sÀ¿-ñ>º;Y«U?:úÏæKï7wª~-Å*Eé#·k<n<F+'"±ÐåXÁËâÊÒvm%È|SïºÌ1nH/êÓgö»ÃJ
L+tËÍn©¯!þE¥];ß±x§ãEÖYCNÿ-µmhªÖ45Áý¤i:ï
ö¢?°±-ju= øo3âK÷àG	èu×Oqn[ú¹8±°a3¥äËµÑfÇêÓtpO§AÅÃóÜ{æaÅ·o4»!SÁUÜâÓLêª&hj°r¼:­[dfô	)9-Ã[áS»Òz õHEUºÙ±Ç¬ 4²{pî$F¨¿¿t»xÍ	-¨4¶S
&üÜPºé1"Ì¶Fg0´;î¦[ÁÒ9X;Ï*KÛ1¡ÜÓ=My:^Qcù7 9à¹T[ØÕW/V9!nR"ü<üTn5Ó£º7sìW¤1 xkh=MÁ:é½]ÜÚakÓ¹Ów¥½ Íï¥	1×4KtnùéÞöVÜ(ßåìhD¼©_{ïeþ58/3þ+¦và¡/ñ.-EH#^@À4= ÇOcºÌÙ¿Ýl»28o825	4ÂÇÙÿ7aJw´HùfB-\ÙûeÀ«¤è©fMuÍèÙ[ÿêHû= áN#tîiÊÛu
µ»8\ ¸6EN}o%há-ðñÕBY·Ñ8cþÿèøÚÐ÷ö#²{oá6èº;%lX§EÐ¼5({ª'ð^X$4)é¤:KXÈÿ]br_eªþÒV¿ßØúUÑ,ZÅDV¾áGSnÂQ!u¡fQÅÒáÆÙJ°³ü8tß­¸îÓ°Uÿ3¢
0éKÌRÍ¼üCÐ©nn»³ËíFì¡Ø9¤^sØÏ½®"£Ø© ¥s&/»ª¡_ÚÑÃk¼$íú{a¡¦	»°RRåë!àkå¸\lV=})¢ðék6Éì0¶_§òS1yoß¸sýùAJã<7­bb¦õUbé&Á1Z×¥â°Ï¥Ñ·äzµ.¼/)Ópá<Èï¹e§ÈÙ¥]Ä1tãyÑÓ6@å)w¯jö´2²Y	t6sq¿§ ¶rWÇò¯"SJ½îZB2ÂF¬ïÂáàvÖ(§Ãý=Mn£sDa@Ï4ÍCÀsMLØ_.Ã¦(ÇÂC®Ñ*¡ü;ÑBxèñãëg£G'ßªV^/¸£Ñ.()v¡ÕÜ²GnÒ0mÌùÈcNúWÐÄ\çØ}R)ðPXÞd6»áQA£öó?;ÊÎ¡#£S½Ý²Ù[QrÌ@#'ë¢ðßbÉ;ÛÜ vÙÖ ¨³FàÒÓñk~ý¹×èx²¦'$d4iÂ8¥º¡:~Í[¡5\Q¢w9ÕÑ?Sb·ü$ÐE^^:äbZdCTÒZÜ1ð}(ªÃ L¡RýÇcvä¥Õ½uìÜPß(¸½D8µÄEnc:â0¬ä{ñ¾Ç=}K@ó¢Pï©)QÓ-+úè9÷ ù(Þ^î«Bt ~í	ì=}{Ü= )¤0Ù	(!mdæzK(·Hé"0êýf.kånF"ýLDáAü}ºÿi/e£=M*àE +­Z)Ðp@L?NkS=}WÏ/×Ø5mb<Nv%a\Ð¦7Rqu=}ìök]Î®hëJ×5]L=}*ÔâÜOý×{=}e+>°É-[>[w)¾,'~Bô^Ì«­6êµ-r÷^ûvûñ6m/ÂhæC:rÎ õßYCÿýjzb°YÊÞÄC¦2BÃä @O¸!Óí>1\À£v0ÉÔë¯¦+H6#ðS>>ÙµÁÄIVÿn×5:	@ñd:ð\-td7ï¢hñ>"[àL%6%=MI#²L
£©!´PéáwsæS¿åó½XÊB0ø¶m}WUÚ[MÖÏÖ	ÌÇ$âÏ~CËÁõáà$ ´J!gö%Én¨]¢[qwz?	]#}Y¡L²S|uåìÁ³]¢Ëì ó¶Ù³=M¯¼!º<CØ{s}sEo=}hJUÝÍP­ËnæMb÷÷"pÍÂTÖ=}¢YøE@KKöeZ)³}>3Y/]ÂÚåbTïù$h?RxÏRõ
áÞÉºgIzVø×\ÝÈ¬^øí´.­Tãµ+p¾üSÂÎgÈtqÍ"eÀìäÔ"1öéÅ¹/¯y¬	>Ñ^{ftÁÎ>½l¼²þec-Ý{ àãÞ~ýFiL-6èäÈ&º¯AnÅÝVo®*=}= :SÀO6ä»qÑmÑJà "e¡Áé©Æuÿù/é]ÞÅÞ1ôÖÄÅ= ë·%&¡f«ÇÈ«<¢Dá¨EÝð»V|EE;¢·ïE&ÞçÈ£ÔYïoéÒD_¦	±ý/Z.´óh5Qa²ï£¬N­1Ç¯ÍÑÏ/f£¤[= !kð=}8Þÿo+2þUä_Âd~ð¾VFÜ¦¨ä= b= V~=MLµP÷OGgªWµFv0Êj8ÖAÙâ÷ç%ÈÃ4]= VuuÐOI¨s¥BïÖöà®¼èÿoBÉe¼ÔW½ÀÇØðñÊÅw¼ÌÿøÝ¥	Ñ!¼Hê±!hcÀ¾ÁJuIÐbkté×ÃIKóKÖÐXÔÝãÏp¾áõs)ð}îb¬J!sB1&ºpSýú¾+læ£¡%û%«2Dçjov6ð_W= [¹¶_õ{WÌò×(Çí¬È$oÓÿÃár"ÆOÛ~KEßñ~%ÛjoI4za½É2ðê?Ä¬b(ãûZùh&9[NvT(á°wªûêõÔÀW/À
D°9í 5Ñsn+,é=}£(=M··+]æÑÒ
î5ªåé¨ÄiV|ÝºýÀH¨Oe14¾Á-_¢= ze*iÐÏç@+¹æo6þûQ ï¨ù¦Ç$Á${êáNÎÂêõ zh+üròõ3ÁÜIøÁSDØ¬¬ÀóÎ"ÔòINsã'iuL»½k>³ZÓó~Í´IgÜ=M¯Ù1s:CUuýÚõXU÷sAØ/so/?¨zçVÛUkm}×¿¿Üô;Xnj{G= //å"?ÜÀæ* Ôç~8á|®00NR.(ýì½ºo¬³¨ÛVrâH}÷ò×ö­\ºØLèî\í8(,×@=M^:Ó»rn êûtP[.jEùÙCî·= «BröR©-¶v½/S,#äÈÚ°°ÁKôPdå´Ã&­ùÌÔð%i+-*L\hçÔ.Òíl8éä7/Û¹Ãï {³yY!ûqdy©J¾³ð0)f°µ®èìò°awÜ\Â'Íº=ML OrnÆõ7Ñù*5õÉËÔ"à3T«YwAº@kbIhûÜÀº!¢	*Ò÷ËhvÅ]Nö8÷cãA9Íï¦² Î'Ú,_:zbþ·*
-,èÅp>@ä8Äî«ÏkÊðfÉÐ7ÞÛxdç°Á»³/çãL¯3çÿ ÑD´?kíæÞßßË½|= pZ4ùu5{ÿ/ª®æ349ibÚ)å_*øÇI(à^KÑ¡[0î´&¿ËiÏ£³0×è,2¾¸LÏ>dÎø1ùé.äøÔjÓQµ{³×¦b¹J=}Î?®5ù¡-¶ñx9NÏdjI§Qëógd\j,RJ³ÿGËIgÕÃ¡'£¶ó~¼jØ-Îiµ6eóÍåÛÕ¨jû¢y|ªùÒlÈó"gRP|÷¢{±sÄMJ3aæñMäCÄð@{ÀÙDÎD=}'ßÏCø dZÔF	*c ¶3vZÚ]ÈÆ e[®ÁfOúóìxÄEÿ9LÆ"ïùePø¹ÍÌÅ¨×¢PzùA¦Üq
Ø}!#ÑüJ\ñQYzÖU¥våÆjî1G7éE¡Uäû^pÔñ¦ÐÏ»¢Ø=M¿C¸H¼êôc¦|hI¤úR?òTÚ±ÄYy×	2É-ànÁaoE0+Þ#RfùÇ£M¹~åææÅuoä[Î~HY"b©q³sé]vQOsj0FüH#+,{pA,îÊ/F3|3À¯r= AË\BiUãÒØ3fr6[q¨a¤*ØÔ}lM£¶~Lä6±KÖ"s.Ìå¤k1¢ôI\çùÝè®2Ùë£½YO/}­$©×ðQ7%eßíy¼Îzÿ·*G-·¬Y'-6
âð§öÔh¡kòr¥Õ¼ÇYW2'®L¦}45äÇî6a£Ý®¾hÙÉ&=  kÇòÆªAüÃòP*È¨Ý]/t8,1@µäëÝá;@}3ÙØeißbÓ:k&£ó­&ÜÎxªk×§õe§=MÛµã#Kùge²CîæÅÞÏî4,±´~6ð¼_UÔÊ_rÊÃRhO4PºD¥°þq8ÔÌUÊcLÂ@Õ×ýÀ	÷Oº{)^ºêÐ°³sUúþ|;­OVìbiëèÛhgõøÅ+Øk§d+ïåº-~=MßÆøÝðcI¬ÖE"Þ¯{*ûú£îxxK·C¼ÍÂ°Ö´¿a°ÓSUõQé¦	9f-wT+ÿ2p}é¦ïäÐïÃiü¹JÜõþB
z¤+²¬ Õ-Y$÷µX|ó) Ü¹5p_æujWëò(NÛÊ*}D*E38Ï¾&B¢áóÌÕÍVD=ME{§Y]²;£³þX Ø1ÝîÈÊöd
1}ê\ MÕd¿öQ¡{ÔGl@ÚJð:Óúÿ:-ÆùV²_½NTÇò¹[ó¬V
ò{éÖ,oêEK¶%!{KOI7ÌhúÎªµP/CåÌ½H:1#?¬óÇ
á¢­Èùx+áíÑ<Gxå@çÍ&H»0kjõÈð1/vð=}¨®Y}o4f¾ÉÕðbugT¢âë£L²;2«ÜFêxÀ°×*Ñ¬¦Rºa'UcÃªÏM÷ÚÏ:©qÀÏ*ÛÿX¡¯!7Ûc1JzùÐN~ÜÕ!"Ðþp6/qjDðüFó%2Óº=M0*ûÆmîoñç³Óæ¼FI¹­ÝÐÐk¯;¢t°µ |U4j3Tn5mTî	^åÆHnÍÌ¶äI)¬¡Êü]Ík×¯	héBôr.lµd+.îi³g£0Ô,MÛ,·S.(@»4,ôFz9é±+éÃ¤÷Ü:ÓT5=M¬ Ë·þöë60E8ØíüP/¬/;c6y¡pÃiå:b ÍåØÖaÌ[.÷±uEÇ12ZgO_ÇBeÌN©ÿ//#¸pç8ßå=M,*ã<'Þ#9SûÇa¤rüLÇR¦	,.Ê+©GÜï4I2ò,_ªp³RÈ<hÚG-ñéÐÌ8êDüBBõ9ÚlEÞÜ=M9sCùe³6î¸AäHÿ!®cv\ïNÕA{]!"O\
&|tõC¸§ítAñ¿v!W·|uRëM¼
P·­ÚÿÀ¡k¼yi¶2ó V.l/¬zyµìú®ü&^RYgK«°JwY¦ÙÔjC&§þ¡ãu-Ï¸N=}3}´µÆ·­éø	}òÀRÿäÒ8*ûæ"Q~ÿÜQII ã15ÿy÷þLp3ýDfy¬å = o½ìÆ»	z'@G$ûöÈ{f$.ü®u.ÕlHhå:«=}kR]¹ÀûÆó§ÄmùXCìa(@´\Xýèf¨È5ú­	/\ßÕ÷yù×XêVÕº	¼r4>ÉùDëÕ^NA0°ì"Ýj4ÅÍï6BÒ¿MÈØw¶EsîÃ!Á¶Ø³HP)(ÕA¼JµN>8zþ ¹¸ÊupÂ\8áB{ÌÃ@(GW.mH#|9ó2Ú,6®Uj«<eËçA×VMÓª&ï¿ç¿Ô*ÇÐ_WðÖ?ÃUWE÷1QwG®ÏÿoÌåÓ?ñ6áæb¤ï6éÎµÖÇì×Y
ä¿Ç_â{D­±¤C\1¤Ís¥­4¿'9Ô*pòvµlúÛÅÐ¿_<¼QjÑ¼õ	t½Tv¿ê4·[(fÿ¼;|Pþ n9f´rÎ/3û:d/AÐÓöÑ¼Ì°(ÄþgâH|?Öð;ú|È1ôðwK1ü2t¼í	Ý»îßµ&d/3rk®¿mèfmMèOæ ýj$|¤_w ÜwP<X:P{¿ÌUú<oèúþ¤Ð+9t"1zÏûè«Pû¡KaâaÂ N$dÈÀÓË¡Þùqv<ëP%{Üüò zÚ¾:s', XÏ8I»(¬:JL<h)]Èü6c¶F¹·8l»å^U±"-¼kR%@m5,ÚOÐÇe?H²ÀÏåX$¢VkoR£ÿÛqÓ§£Ãûû2:Å8ÇñpôpO è¬é¥ÄãÎCé_é\*<ëéL,Ó¯Ê».ÇY?ÖE^ë12z^V{L¢-þþ_²½º*ÂE±ìHìÞß}zv>¹1þî¨j}	ÖZ	Pp³Løº<ºÿæîí7,=M§ª¶ibó­r­ó;Ýëc¢g>¢î¥Qe>¢hlÇe8,¸(%eïê¬õçxO&Ea^ÁE~¿CdÍÞ®´´ÔÁ½P-~ÀxÀøJÛwÁ­¤­´´
4äw^°Üxú,,|l
´Úwk8©6ª¥ò^ÈåÍ²ýÍâäUï §ÄKÝ^h÷Ôz<	|çÛUYe 9º;v§0ðëòcÇqíUÔNÆ¨Mß¦ÆT¬ûà¥º8T¦[ÎFës¾êdtþmì¬q=Mu¼KFÐ»Ù?èI§ùâÒÕÆÞ&Õçô%ÅgûhÜ
÷<Ò~7}¶ AÆs(z'Ý:c=M?§I>A§a[FdÏDßEJñB6¬ û]ÈB[uhÍ5ß
¾ãÞêÆßÆï	qþUG¾FÈ­jlh¤°A¾dÆÁÊúº}dc¨UP/üVPÅçÊF6ÊÆYÕÐ")n~ªiAò³*pßS<«ÓkcPõôCuÿëZ½_ÒXµ= ÑæZ~Ï=}hz&8=M ½¡Å÷Mu×MÔÙ¿QÂø©
.t¸²AD¢føvÄ#Ø±½nx®³í(1f]Þ\í¸¡,lW{Ä´¬oäfç1ììØdxCXÝ~øDåã=  ìBÙÏGD"×MÛÍX>Õ©S+èAGé·Â$Woð«RLFµ@#B~+áÒ Ù»ÎO¯D¾^ùbï}dK?Ú×C½}â«ý³ÖG>­§Êo¾ÂÉVÝdõ-d?Rm®ë)HjDà+Kù¡¥^úàÞ¦¡dÖg+O½SÕý^×b÷ãb^êc´þ Nn%éöÏMjÑ3@D-¿õL1²Â«a!F;<A¥_!v·MâµÖAã@¯p>× ²í4]24Õ<uëÀYÊÍ}ÝqÈ&bááUX >¸ÕñÓr= ÙÁ¢÷:[ÙUFz¾4àñö¥ )Æmí¼ù½RÆÂ*ìÎäR×EloVF)Õ%lpvö«]B¯D¸< §Ú·}i¨1±Ë~èÎ
Ùí¨coE,âÆ=M'ã1MfNä¶OjgÄújûUåº<ì58ÍàYÂ»aÊû:w±HÉCWî¿»Z^ Ýg1Dî]&DK>ciq$Ñ¹]?jø½M®¥[¡µÕÅT}Õ&©BM<¤N= WÎ	X²·Ä¡ÅFÏ¥pbËi}ÆwÍôG5G(¥°EV{±þàôaêMÉÿãæR4àiªìBgÑ¦Ì?gÍ]q°2¥5Ý~ý=MÁ¦×Oåh¦|=Möp ñ}-|ßò
¢ÅaÿNyÆaÚ<MÆ5=}Z «½O!]>®yS#UUÓñ;¬ÎHÁÂÈk8_»ªàBçà°MìW%ø]ªçÖOÃ?.FÅêøÜ÷q_róc¾é¯ñ¶ÜiËdGdqwkÎYÀýW¨rqñIÅ¬1öuuVM¿Ñ/ÊëdÍqñÞ XÏOÀcy}>Â¡.ÿÏADq©¨mÆôWE/X#²nwî¥ºHzÚ®"zª7=}Üàw °ý¸=}~NµPe^Aî#ô+wÐ
~6ÁzÑ}u]´SUzfMëlæV3là=M\O+MÁPµÅêÝ·@ÓÀGj×Y÷7Í<ý ï½'îKícB^Æa?=MØs]­Såù¾¢?Ìýÿtñ»-X´½ÿðGtÝpN×Ðq{'Ñ¾%l/@=M!bÇíÝIØ4'|WV¨N;É1þëáøIðß!½æBÞ~²öqÛé»bML¥ÓàowþnÊöÆûpÝüI5Z!Þ[!xZ¯ OFxo(áóÀâåÐÛÐSÌ¨Iÿ½ËÔÃA¹ãÆ¹ã¸nº­Do1ý|uF/&ÅH	{kãÍìc/>º%®rÌÒñ&,jßk»3m«Ëÿ*ÖpY<ûÑØå~381;{:	·¼·ËÆìmØèÊ:QnãKrÎ»r'}]è&ib}à	UÛû-ã|MÓÀÈr?[õÂc^·= Ãý¬m³fu+ÁÓÂjËe~÷I>Ç_)Wú®È½A#CÞ9~uX|Mâ^ûùÎÐJ«|8vQ'ðS\2­@ìßX}èª´L%2N½KÁ¤ÒJÁB?úëh&¦GTnhVEXOñrmy~FFxR8ËÅE:À	M á?qÈÍI'DÃZý¹:[ðå{GFú9ë>MÝörðm%Ë§FNx%lE÷JZ«MK;µ¡¾i/v§+DLÂ7ôg=Mod/a!gõ$élY%@t*\èêÕá÷R C\ÂSFßÍuwÈãèèRÊÕÎ|Ç£MkëÌXñÐßVf#¦3keÂõ@L½+ÅA²Óy¿@×K ®áÃ}]jò=M··=M/=}«áfHi.w*¡ñ²ÏÚ:JÇÌ!Åo?'yÿwRÆYT@½-Ùßî ¸£r^Ií=M=M]ÇGºÖ= ðË ¦Zku*õÓ³¦Q¶xÝJBÆ¢àqÑZa~_bU¿@¿Ø+×?fÓfÉ9ydzÁdx{ÏõEÿ7a÷PRH_XÛk&¡dý~þ*Oª¿=M¼ÍñRK¶&z]ÛÿõÅÃhç}= Ô=M9TÖ·R0FÝMMGÞúVåuµ%þQ5GîrÊuþ	Ozda´=M1ßAMSJÞËgIw)Å1LE¼î1i¬N4ôþC»ßò¯Ë¦å ãÚF°À£¿ÁUcøätK"]^ì ­;?ÂrÑõXÏË«C$O:tà=M<rQÍfã5E×ß¾ WqÜjÆQÌxêD=}£	Ø¶æÊ§14µ5ØZÒcÏtÎ1)ªð¥Q(Ó[é!-|éñÇào5ÿ±Áº= ª:u¤®þÉWI¤¬Få	§JOWÓVËÎ×éÖ[Í#SzèttÿèWUÎ/ÄÎëó®ÜspÔ£ÄN 
Më æ\ÇWZ«Zþo²ùBÈºâzæ£<s9Wÿca«¶}ÙVékºÞ6mQfJ£()hï ùÖºB [¾íª½RuÉM]Í{c',¾%M.IxïÁND	lwnxvãF´´3é­B°6éé­"°}]¶DíG~åÕðé!î©a3¨OXâ!µ ?qìÏ³õjJF­í¦^[pÅ{= ú«oB5Lü&?àmÊm8äHMýqØ­ñkB÷LOäÆZ[=}ÄAteý7_C*c~FV)t*mq+]uýJòðÝ÷ÙÿdZ6=M·ëÚñ·eèPÕuÇU?ê1àâ¤?Ié3ÍúO'TÒ6ãAEÖð
}Z;ê´¥säsÑÉ¥y·= DEI-Àí}N×@QÕÀ§êFÖM?ùho´ò<8mØ¦ ÷yÕùóGNÿAR\Ïàý ÒAôÏrjuW9Õú8âG&OVw®t¹v ý·_IÙXî¢0Ô=MWï£¨©»Êá:óØ-,T¨Ør?èÁ= L¢('¿³->º¦'\QÒ¼Kß>ÕK{¦ÚY-a!Åû<Ê|= mÄïqù0|®ÉÁÉ)v=M]âþv=M4ÌYm<ÛÀ¶Ðð©°^5uJºÈ-ðpw/HÓ\ibDèÈÚD]b*Ä±W>ÔVE= >qð ~ïX4Pã(éÈ«¡?ÑÜ×FÃ>hqbx_v$^n(®£­æWqK¯>ZÙ#ÀØm¨$ÄéÔDØFÇMTûîàÏ-Ú'=}ìJþSþ.]ÛÄ}ÂÐP§QõMÚ^¹E¾|áP¶ò³?Ò*wÓi<»õËb÷ÄóJzw
²éSTebW^?¼zÄHDè¿xmóxþ>EhÑ= ËQ}1'Á°QÚ1*²ÿÂ)·îã¾OPÄå\Jc±ÿkdbë~Â{óùÛfõç¯OlèýY@>õádÔ;ÀFiÆ=}Æ¥;ÿb7]4Q1GEî}Þ[¼cÂõÇ[qaâ7õôA2JÊv d<ÓÔáiþú¼¡É?õïc1Óyh\þ	oár3¼!;rxT0<C¨ãÓJÎOM¥ËØ ÀÔæNÎ!e;}SqæÓy:]C¯É¥÷<ÏoÓbJWØzï¦Bßî*ìÖÖ&Y^Pã¶êKÕþ¯Ç­n3/eA®WR®øFHU§SN¥ÿ¿ð©iþ®O0=Mñ[jÕ+jhµå3BâcFO«cÕÄÂDö9(xÅF&Óá_Ù ÕÃÏ= î¿#?Òy":QýªbX	Mø,º~É Å$¨FÐoªÊ!¦Ö%ÈIÚ2ÿÃ¶w^ð§wÁw§y×ÕJIñQê&é]r]
=}âÊ¢ÌQ#ÝÉõNQZ|Åáo/pûó?*¡âw#N±>|FîIÒ= ­=MO/y<õ·â½÷D&=M7LM!Cmm0Â}
ös'FôF×r[ÖßFlö#L~ØýÐe½ëíÜé|áKUK.OýíbÞØ»¿_ÀÈ|Â6E&['qóPW;ON?©Õ=M¾m=Ms=}½qÝêý~ }O_âÍ³¨ýg¥r¤öõ^GÛµÿÐÉ-%)©ô³y¨xé]¤Bù¶dAÃV.Lª+ABIÚ=}RßX­= {%iBrçÍYôHs;õíòWU#ãoLw_½ª­n¦¾\É UIÏíßE@ÇGË^CÑiMñëÀb|CQ~0îËàjR]k².Øù¬FQ¨PÇÕ:w£kúaÁÕãMgþÇJI¾×SÖìøù>P×ýBË^¡¬1cÁ¿3Më}0uÛ±BÏÉ'LáJöc%îQÑÜÞ%{=}¦P©Os.?ýVña.¾rMfgqZ§BÌç¿MaÛgùÝr=M¥ÞcJ¾PqÞoVWYácMsJMÇEN&w§dÌH¬~HWàæ^B¹ÓÖÓRwM*C¬uuHU>1E2¿Í9æÜ¥·ípþWëj*cMFæÀIPú?hWyv~gKHjÑñÿH­qhL.s²Ý£gYÁ¬o¯}õ®?c mÆ eç _F}H~Z®ïT>¥aÏ?[qÆáFËñïöú@F¾úµQÁÆÞkJ)@ =}åoáG­ædá!¬?¨YlßÆ+í¤}Y°,Íà3¡À?¨q±ÖAdÆ¸EÃtupA\«ûéÔ0¾å_»þuôÍ=MÖu+×ÏËC	¬JÈ.gØ¢Ø>ÑÁ kÍ[gDO°|ÇÜÿæH×E#%6×àoFPA7jýRgM:q¦¤­ôìIµ :S3X1êÁ0¢r£êgâE©U¯ÙBìo®-aìêOG%Ù¨³-¡Iz>U)ÜµÄb[¾»ÈU­e(×Î=MlñÆõ(óýçzk:¹}ÏÉoø¾]'hQå3B@hdnú°õõ^ Q¿BM= í£
/dâêÄ±{ÿî
Î¾é¯FÊ¿æLmAHÿùÿ³kDÖBËà dÐ±^?*iM
eù%>Ùi×q»Â³wqÂ²èr@íø£ÿbs»IÐ8L¤- Ý¥Ó8MßêÂ¹Á?{ÆÁñ÷GxÝIÎ3 ÝnësÈ.buö³Á|}^Ë>Q6¼@ZËÊ
+'N B8N¦OHT§_Nÿº9>zÕß¥A´A©¬Dèdf=}8GÉÀ=}×ö}|ÈÊIm¥SâJ¬ï=M»iY<
ÆøHNÆ¥åÜÅÓ*7yµjàU­ÀüUÂ<QÈDÛR;_:yu5áU1D=}"<Q
áX¼ù<vWÆI1MF=M;n×ØSJçf,:°qO^C÷N¼ËC¼¬Qàt:F:$¥ñ+1DÎ<QjôSêp:f3ÙÒñä|<YjÌSJ·$;;°ñùñ#1Dó<QjÜSên:Æ9$¥}aßU2&L<fEÌÅØ;dNØ)0CtZ<jBÃ¥t/i]uÅ­þÃÆ½ 3æÞ.·;®§Ås9Ìpq¼ÛUßF<0ùM5ÜäÂ¥ÿ<yjP;$¦:üØS;Ø¦N6ÈÇ<ñe8\äÂUi3¦.¼´íE^Æ=MvíxGLó9Uo¢îc#zjuÊ= w!ÈÊ{ØÖ~Umñ5MFGUÊ]ÍVaTðy<ÅÝ½¼Åá­6ECj¿"\= ÕñE<UþÈ8ÌNñE¶<n?¶°ä^.lN)ËÔaa[|WMÑ]C"üÙá§
c_6E!ÙÏC|­_9EA¯À,\= ÕñE×Ì+¼TþÈ)\= õ¦NG< A¸ðÂ;Õ×j$Õ;Øp¼|ãþÉóx	_cYáMlÔñH=} )xfÞ¶1NûZE= ¥¢r2Wæb}¦EÊ+¬¬¾Bà¶ð[Í¦Ë]ðAJ/ýÆ@ubÁ~Õkå?¥y.Ôÿ¬õ-ÇF#_ìGáþÈ}Kj}Ï_{ÜÀ=})ùªc§jDH%MoB®ïÛ°:AÐuI¥ÈZXõ4Pw&Gd¼¡ÐÎÐ23òPYÞk¥f;õlß"µaë*v×öÙ6=}ÆBÊÓ¼0h·rh«³¼NòId3;¯Ï®ÍEoHóbdÁ?:ÿ±C§xfç2V7ÇQÆqÏ3Ãi½(Ú]9ÿX~~ÝÒ
k¥ªªf¬»,äHAa}ïHÁ\ª!-¼eÊ=Mkd¶Ój=},Ä§o8²þ¶rQG/½^½îçúÕÐÅTíÜlÄÐP·¾~Id¯5j«	º8[®»eIFÇe.(Ý¥}Ýßb( \|¬<56Ô:d=}£EûâêÎýkRëa]ö°ï?9¾yÊ}EûI X_n+#qCPQ¼¾d¼0dÇàp5.¿ìÊðúÃµ=}SÏîl= ±IïCÝôi3Rlb	¯yO¤= Ü±û¯MLöb.AÙ=}ÇT#L&Dn½"OÌ%Ùaí&¶Mà"3Ä¯¼WtÈÙþã Öt¡¿cýÒx¡ÕéC®Ð1»ó?ª5N&¦hÜÞà^= á¹î[pAî¦i@mÆÁ AW:A»ôDHtc§|Ý%8M&ªÜ~s½¨õâ¼2¬FâêÖÓ4ÝE¹sÞÍ~-ñPSVéA@Gu|?âxy*LuqÜý?xðÎOË)Wâp~WçÅZç0w?ìkþ³0
ðô©z&Äed:'?:	j ÖTÍýIÐ	î?CÐJÝ3XKZr¥­F£Er^JqÖÁG¯å½ýÍB¨ÕÅva!ÆÝ\Ûô0~&@¯ÊPÁ¹yr¾ç2ÝÆcqUUneºmaw=MBãBPbÎÚÆkWcg^ç~Íf~nnJr¨	G>PYÃ<ªÐAÑÁ×v<Íf¦ÌÞ«^Cn;ï¢ìî= = ÓáøGð^ßú]l¡õö¿¼JO^ã}]V§êÝ!Âo¢º lÁÁ÷b¡ %¨¨¥x= 9©<Î=M}R)ÕP$ÄrÎ×¤SÖcÕcäÁì¤Úd¹¤ð¯ô«I¦¹¥¾,^qí¡}]¢6= Zõ3B¹UMyÉÂºF6M0TFL¼M?OûBÿ4Vµõö¢Á= }^fNï}ÿ¹òH;¯TF
U¸'j7y3·éÆ{ idÌï[¨¯J.( ìéÓ\Ì~¢z3[Ø>;(õýË·¯%£%Óþz}ùRK!*ßù"0 j\ªaªbÜ¯×|yè Ðp?5FÚêâ:NÙãj¦VF+{VV¥X©FéWnÙêýÒ¾­Ùc=}¥FF£Vf]=M}Í¿Û=}?mJâÈ¢ë¬$/}ºDMhi¢ã%Mu©ÎýÃO«ÚB{Xr}¢Å kÐ4þm&ÒÒuAuD@üE~!@W¤©ÉK¹NÏCû/M½k8UR5Ê~¾l¬ÉF¹¶ÿPS?²aJxÑu¯!au#kÈne9ëeÃVVRAR\uãöð?TßE!D¥aÀìE7Hî9Á,¼Nl-«\kÿY"­^oVU'®:Þ¢ÉN8÷\= µâí¯}K¤|ð±ïÿs×ºQq£üO>îÔ}Xy/ . ¶¡ü?$Á1iA)2JÓcÿ3@'ªrNñc¿×)b¿Ù¡¨T¤\1ï¦¶*5Æñ?°'p¸×.Ë=MåUÞfÉå?j¡mXÅÉÃê-^h³IOïDVÁñÔsVª&á¢mÅ+Fµ
­N]Z¼à^º>ènðhZéÚfÝÇôÝï¡£cîÐ¢Ðä¡ßÇA>7Ãç"ëJ¸µ@QêÀqÞO!H´þ5K½è°?Wâ&¬§0¦Wfwú¬F-Eª+DQã8»m2r´ÌÕd°N³sÀ~³VUª%¿ D¾Úo=}ù 8?¤L
­mAË6¾¦¥DÂýÇåyD½ÿ³]lj³¤·n=MÃ¶*w9ÚÆ{ïXé¡¶PkÄuCÀØãíRÀrkf4ëIa÷= +i%N k{dlÖåmSÁî£ó0Ê+,Ts¶ñàÝBâºF©ÁB£-¤ßV:¢t°[vÏ!óÛ7a¾}DØPÆ­Éu6FîÞv*= µéÌáWcH= itî{#é^b3Lâ5îÜ¦ñ»sö@ÁËmÀ8ai0-An:)è<e<eQâIOM OKpqg= 5ArÏ&®ß²)ZÌÀK=MAVaMF_e¼3>ð×Ô'Ê"ÎM7ðò¢±îê¥§gcz×ÊZÙÐÿAþ1F¶^èíÔ}áÊ$írH=Mk¿Nl Ê>²Ç»PõËÀ¡üã@8£üi¡ÁbÎmWq^ÙsÌ&Ù8q~åå¯môÁt
rOfÍI]úÐSX\×½,×óã-²ãÞ»¥|rUp·DÿkÞ&Vß¦Gdiuxî¬qÎÅ= yBV%NÓtÅu%Vÿ9Í}ô¾é¦aHa ðcßp5ÝZÊi¼] QÏz+ÿ]èõõb9ÅÈVÁs¿
;Bª$jjQ<¸Jeå»ÀãFfô¿ã^tµ-ï¹V7Õ.Þ|tM0Öû­ÅÝØ]CfGN°3ð?ÒJ/ÿÄ´Í 1MD¿¿ÎYµxL®aÔ½wïêL®_ÝiÏ#¶·Åð#¾HDZÿO&½hÕÓÚÇ#EyxRíÅ¸g=M9QÔv^¨^áEn#Â/ÎÇÓ¥³gßv®>ph¤g«æ¥Æ£äßbg>Þ}êG"Q"Òê[²ÁÀ÷Ì®dUQÖÏr2Rwÿ7wu ³ùÔÅlXø@_êq2Nd'm!.þ«â» ÑwB1l²Îä-½-Â1ÂzAFÅCõÀ¾OõºÿD{îäÄµjÃZmyåÓËºâ$1Mçb1{&oz0K'°ÿÊ±Y
³g[ÚòÛÇdÏâ¸g+AXÅÙæUñI^{vþ×pRj)ñ°ã?©±áO?= àM,é¹Ýù×= ÒoxR®¦Þ^Ë½STÑ!n]M\=M=MÿéXaÑ
WÇÙßZÎàÇ3y<øñ$&ê"Æl¥v>Wï­ïMÛþ×\0Y5;zHÎ ÌiËý£Éï]äÑB	;ÑïÓëeÙÄ-!¦57ñ¤9×ÿ¿>(õZòATíHSÕhò~øs¡ø¥k±mò¥JOYSø9iÀBþÕÀOïO2|*Å G3Mc1ïIÎ÷Ø³T¶_¨8Û-gÿÇ]ÚybjyH¸~*íÿ:m/Â³lM>Hm%¥2b|½ö¥]²»e/xáF7Æ¡ÌXvVP§n/½FÂdMØ_òoVõÔaF©u=}¾Ra¿p¢´gcùÎìUÞgÞVÏï­òKAÝóüyFr¤¾æælØ¥ëª¿=Mã{OY ½ÎOÄ­kCøbRx´v÷sóqPAA#±Ë[J^QºÅÞÎfY {tÛ1±~ä¦i©óQåÚÂc~òàj9ÅâNÞá.@0Ê
æVðJ8¥ÃQQz»ÒT¡e<¸K<(AØ~\XxÛ5= Áãaê'û~7×;ì¸UÉ±É½KVñ!'æý,íÁFb»~êGà[0eqï®àºSØùíhS^-Eñ©)äÊ^Æs	áðoºNcJ²¾f=}hÁO÷Õÿ[*Äqed<uëØPÃI*§æTI ý«W_ì=MZâS±zEÄÊ·]1lÉ^­,Â¨eÑ	}%oH[^^E D°|sÜqn²ÌUÍù(=}Î=M$õl©Z	=Mñ¾gøâË2¨QÄéwî:(åYl 	²ïðãcóN:XWxiVì¦ËÅ<b¼Å
OÙ
¤êXáêvPQUíï8¿Woä£yé<cÁfècwâÂý·Aé±'^2r
¨Ï%±×ïÚv£Ë= 4¼Óêc,ÝgÖ=}[ô
¡ñÅýóC¿üíÒKqü/§ÁuEmJ¾Í}#CøÞfõ×äi¿¢bq>Ç cJÂÇësÝ8h	(¥]:X~{¨ß= ÞÂÎæÈ-ú1 3= ¿ÏÛØ·%¹©¶ÆG_d±Ccrrm§AxÓ´_Å=MMaò= 5ÏïX^Q
fædþ3fs|ùö}ßæab°PÈf¿}V0Ä"pIíNxphïÍaTªzàUtDd(~ì¨¯íÏqCå³Ï
¾2pSYA/æ*DÀ÷]/_Q!lãÝµWçz²E.PxèµÇµÞÀ3ñmù·èÛ&³púùÅ@ü}¿Ä¬B}þí|ÞÇÎèÓÝù ãQ@»Ëõa½ß\Sjï^¶Mzâ´EúKÊ/ÇÝe¦AêyÎR.³Ë/!¶9¿ñÏ¯êyÎâØo5_4¡$Æ&:,ê»0é]Á= ±t®xmtn¨FöÙ±ûQb T'rZ}-MÏÔû¹?ãÄ!ViÅD¤Gß"XKy,Í¹¿&ÔE³Lg¼1ÍM¸.IXQmñJa¥Vjqe­ÃåZ»àS]@¢yR*ëD»Å%zkkDñsÆqÕW¯j=}Y'ÀDBÉÚÄ½dÝ ]-^¬Á {§J±dnTÞlQýùÿSCDsÿÅÄ¯_0÷O,ý?%«lHA½Â S7VyZdgKûEÈ­FAç®×Ã¹Ya¥÷Í9µâÍRG]«%U*¿ÝJ&·!MOÃãÄQRë"~¶¥Iýè%ÞÝÝýq/ëÈ(ù½ÀkÍC|Fõ}¬BG d=}5Âz ¨ÉZ¤vu¤¼ÅF1ÞÝ_Ñó#QQøÛæCäd¹ÎZîQþ^ò¥q^}ËK.Þ.Ø"½µvvàÉ¸üÆPÖÛ×¦8tOÈõ·´ÝæÃp>º¶G­Ë) GZ?(Tìru!´±A×(r
-Ü
}ÜFªCÒ)^Þß¤Z=M¸©Ä]=M1Í9WqÆ¥>Îç@rÊPnÈnÅ¥Ý_1ÍùîÆläS/ÇÔØ´¿ýSCN@§ Ñõ|;À-ÁÓRÿINãÐDýóÅàÚ]åt¥ÈÀwø~µ1¾%í<BÕlv÷ýÒ÷}A BêÊ0S:Aãr¯ÝþBÙo²?ÞgàÆñßcãFæ=}JÝ#È¦$æ²Q6cX
1ÉäLu8ÊsYE;ÛñãzÌ«ÑK@hOD«×sT]ÄüàqKÝ¹é
nnÖmôÑH_ñ&éö_¬í	n81OD2ÿ81¨jäj²²EfÓc'I4=M_«Fjf_wOqqzFæqª½Ò)¢Mîi>ïQK	¯µ6n0 Ï?ó¥WÍ÷=}m =}"CTBî·§ÃÝ-Äa/ "q1º¾Ý¿µP¶QýU.HG ÕGÂÚiÝ9ÉLÅ±Tà®w§§ÜÂ%"Ï~¢¤¥òS ½¿QM	=}#ÿ3n'ÌÏ_«Íe«{aÁymfr4¦$F¯-Âe!|l¢%ä¢Pjxq½ò¢d]eåz¡ê]3Þ¨áloìÿT*v:ÞÍK¢óo&FøoÞÎªN]#jOÍÉæÎÔÞA-X'PÒ¶<Fþ¥	3vå.4Ó$I°ewK§%
¹qÄ²³ÓÜ]äð	PãË ¤S[P²òju\11~ãÖ^î§]±±P·]]*Ä¸¿¾÷^U ÑúZB= 8ÅÈ³]Lw­5æ¥-}BîpÆÇ?C=}ÞäÞ¼]²áM=MòÚ=MI¥f¡oNÆ= }bw ¡AÓIUàMÊÝ&ÆBÞáÎÂÎe=}I¢RaòÐ¥= pZêMYv§ëv%VÎòæ³FµAjbñ= Ùêßj¨Lê= ÅX_qpÚ^Ô}#¿W'N®-= ­åÃZ:ãñ=Mç«äPZ§¦¤hÆEÇ«I*±±
_×³¥ u.= SpþíH¦è~f¯ý¿ææé¢ÚÁJËuTrD_ùT%¢JV\·!lAáHºNòÌ%·¦CÂdHå~T}}WhÑÓLúA¼^×èx¡uJîÓH/fÐkO8v¹ô¹F¿8¬#zïvïücÙ<&z8âcVïQÓõß]9ÚÆo¶Æ)×þù}ÒçE)·*_¤*ëIQÃPá°}âÀÌ[¸&¯:´ò_o= Fa÷lpÇ£¥<ûò@·¾ÚqÊl=M7¸ÞÂ¾Ó£^ÜéÀêÕ"33B<b8IúÙ=M×ÎÔ%OY¼;¨Ü9´òÃ «0VÖé= F·=}¾qÛííöGNã½-hùøU]N´BM/Nå²F iá¿1?>dKa¼h®mbºk¾~3 úR=}^¥?×Aízd4Uà¡Ø*ÀÓ®îúÇU+¿&Å%mÝ±¨I=M¼½öÞxHY±K×É£õ¹áo¨æÂÒés²)l¡h5/?>  a¥ßÒ©ÁN¾¿²éá¾~|a$^q^æö'o©×= Tðtáf(û­Ü~4Æ3oã^L'áF4àvº#âª´Üý»½>Q!MãºWD= ÿ^gÍ,=MUQ-ôÑÞ­H.~HþÎWáYCÊ$_ÌÐûUlÝ,ï<nmÙæ?3uÈúí6|Q@}*î#ÅI5E ñÑA» nzd¶\sXÎçã4;4¯ÿ;{ñ/¾kOÏ¿÷¯ð8(ýµE£¾Ëk=Mñ1u>XváÓéèfq®e>Üvýx]ó®ª±= X¾§J_^Áõ_zlr¥¼>	^= Á-w±:lhGÎ²Ë%R;%RAÑ§¡^½;äõ×±×#çýuOòDL uQxÈºI]Ý×2×q~k©WG­KÅãKÁ"p]QÁt~^õ½ù²fÍ¤¿¸HçUÇ¯pâvVdI³¶bðw¯-b,¥2=}P~-Ð)+[rêñÉ×:mkRÏ1é#Ì,&«<xFUÔ£¯µeÓe%V¨§m}ÊÜbûÑÆYð}­jGïüùÂÉôÖ?¥|*c©è0ÔÑà8qÉD¦ô½SôýLËBMÌ±HÏP9¾B?cÂ¹MÉª¼ÚÙxÞ7e+?>ßXdèØ:k=MD%kÅ-dh¹3o~Ë#3±ºðÂwÍÐ%ë^h¬÷HRg®ÑoTþ
Û?ÝòQX=M×[bhB5í¯ïÿøñõ(ÓÒ¿-ÀÞ$áfmÈl*H7?è8;kBå= J@~Xya^ï´]þÍRé}o(÷ô>S¿_(;Ïqs)"aa;nîwÐ3¿ãÿòÅ¸]XcJlÈÁé&n/!üfGDÕnH{é=}cÍã@êN= PPßhÄµþz=MSzø'ÝåVN £Â5ÿùYäw;×;A¶RÍ×tMzÊb8Öo³P°½±Þ¸ÞXÍCbâ¤~ñ¿Ü?ãÙ[Ê@oxbYé´èÙqÃ­êÏ2kýV,àøÛ¥j¼TªÉnë¾q\RÔ½ùÄ7Ä=MW^"d^E)e×#P_,l~ÎhØ*ã|^áõáÁb:M·g_üwPó7Ø°øË#¯RþbÇv#öÈ³A(kÇô$_°-gcÚ	¥o×BóQjçyu"é¦7GEdþ:%]m%òôï¶)æJÅD}ÑS>d¨t*ÏâÁD¦l®ñedõYnß[vo
ç¦yþÞãýukþSê\Yß= _E÷C 8g×Ë»bßÁ?=MÆË Ñ­Í 6c	XÉÍÎ¦+i-ÁÁNbE7¯ù=MBOXNqzòëÿ=}Q Nø¢áÂ4Åãép_SR·14)³dÑqlxoÞÍÌ|í«Tìx¿åØÔ+×·wùÑ\'¼cTWM%Ëðµ~@VÎêDñîg}zÄÑ÷yDlÙPBøb§ ^ÙcÇ©ïr{êM0q.RªXWÓ.ÅÉÚ&QÅ¿bÏiÅáÒ?xà$ë¨î4)¬¢6ù=MÛHaÑ\î AG\¹IÇ²KPa×.g>HÀ#d2¶]ÔMgÁ×ä>ÇÐo¨®Ð¹MÝ é0=}Æ\\m.MhÔyÀ÷_Q@w= Pq>¦ûÜÊO¥ý=MÄi³]ÍPmM?dC¥f¥LJ§DGMÈ"G¡vW³³¬[?@ò¾ëác ãá'=MýSÈY±×Iÿw»màáiïd#]¥M-oÁE¬«>1Uªâ¦ÐEÔ÷aX0ïRª:= õ°þ&¨(ÍéÞe'm²NºÖÈÝÑÓODCÈ,Dmr=}¹çÖçWç#2!e1¿Ïj£­É¥yy]9#þÊ?mÐÔ@>+Æ]Ë¦b
@§ê\ÏüÅ\q_M¾ayØÙä¥jËÜÓ-·êF¢x±°@µ¼MìËSd±ø-±h1¨¤;%\ê¨e¶ßûna(I­§+¥Òñ+HñS= ½ÑYê =}µf¡ßa3P Pc!ZÈuÔÙÿ­)]ÚÇ+Rùa7°>B¥ÆY=}caÍliÍ§?
"¿?ôEëø½}½ßÑ×±ß¾Z]å^Osc<ªtc´#kýHr Âz;Íè-=}²|.Õù,?¼^õÿv?i¬¯K|Ä=}$q,=M³½]8»f©ZÁxTèißÇQTW}¨ò\÷]Pâùþ«}#þöBþFY= $}$R(fáò=}Y¾·XVÏÝÏó­>z¿J±M-¦ËZÆÆC§Å ÂàµJÂtHÑqbá%µEWèS¾ã¾úRÞ4øÞæi"íg=}ByEoüB^^r¯FlGås3°ÉP¾¼ MdV¿(>¿Ë­%ÔÁ j³º¯½u­MnmÉsÞS?I©·nM¿Rßãé»º¹Ù>H5SÄ]/×¤ õOc¢E´?Ú}â;¹½~UNeá­~bÄsªE=M+|qFÃ³jñ¯jYÁJífÒQä]ªPH£k%~ÆSÄÌ¯8éÀ³Z§\!5xUAlaYEÏ;d=M\¦OF^jIBâúNl>$"kw?AWí¶ÁFÉ3Pê@M4:r»ì¯Í+BÝnA7é³iGW .O}t+§¥GL¯=MtMÝ%N(Íº¨Å~5^Ðqb¢Éy¾ìL>Å=}ÄgrE
Ð=M6Q3¤JpÿFBÝíïN4¦Õ = cíÅH"C·Pµ¿°)mÍù?ýEB®ô{þ¿(¹¸ YÞêÎYçeÐQ~ÿàÝPy~+}ÖýJÉ/Ãày¶	³ó{³ó{?eöµíTÀÁÿ8Ðô$]õ=MblAAÂl]ã)Ó´?ÅíÅ<}= Ø=}ÆQ3ãº	ådWãåÝÿþÝ}äFÂ)&BwÑ;îûÀI
èf¹ÄDº ÊnOMF//IM½ª~6=}êìJuY«k?ä×½½°_8uyAÆÇ}ÑöÚP§ýB¥ Y§Pïq]~÷= ONtîÊ/§~¥fð8ÀDe¯Íð¯]^ï¤ãqêñM0ËMu¢¢?®ÕzPßÍ;4ñ'U0#-23ÝMÏÚHX×,%i}:^}
üÒ³wNã§&¡Ü*
Ûj©ÆÃßf×i6«NpRâ	½¼ßZî«¨øaâ#ßm>A«{ÓIoMé{~ÒH.©TÍ?FÆKæ8NÓ­¬Ý
 tOSåíDyÎ}QÎ Â5CÎ¾÷lQ ®ñ=M¥ÓÃÅÌósÿ.hqÕ4Í= a¯ôºj~ÑÑR¾D·~Sðó³¿Ë+ÀxÐ²ôì­â¡¾N´Ø"Nß2ø«|MÔ=MDOÁÁCK7Ùx·I¥]ðm¢$ÙNJ]þÄaÑ¬n~­ ª>d?YV§{Q¥RñL2YcáÖ­3ÂhmnJÂl1öMOpLzÈti¢í°¿ïý?mäÙñÚGv¨Ý WÍcVàNK"øÍÏi«·xpV¾-«tÿÔ*,=}Ó;úà~%N EÀµÖ?
ýÏ¥>y5?2°~ÕDÖ
= ]ðJ#+C¤Då%Ëtow&ZYJï¶ù0Ã2)öhâ	¯?>>Xjó¸M<!v44<J4-PT7,­â±{a(EßÏ.ý;ÿÌüìZÛdà<ÖoO9ë8ã¼8ç<'-.0TäËÃL|oLNØ/ä_RZÇ]¯­àþ±Ö7,s·ÝRrÄï»<+-
.äìËIÜü¹oNHfUZÙZaÝ9x
c0±ÎTËÛé_¶oøÓ,üÂÇãôùÙ&aòÐ£+Î¹áN48§-i0§£¦# 	¯ÚìC>h è= ánÖÞ¶7cñJT.ÑC¢CPpT¼2ôa	§w= ,pHÜÜvb:;:tDÄ>º"=Mþt¥t¬fÌ!eùÍ6rgòÒÙ{#\Ö±bÚ×Kø¡â´ôÒ ,·&²#	Öwg½-o°´#		jÖââöü+ßõnh»ìÀ[ÏÈ¡}¨ú¹Ù¶x0c;'þÅ%kêÓ=}^]\[F&'¬º±úOákÖ$ûUÃÑÒëèL&4r452úÛ¤o(cú°#µºHä£Hp%û%¨£#:ÔÂg
YÞ,/· ÆRÖË7¬xÃ))ã7+°Ö¨!âÜôØâÝ,¾,@\DGyMõw­ý¾ãý6Ó!(×la½æ>@Û$ÚÒô;À9;H/QðìÏ{Z{b¹Ó!ó!2=MøÞ4£lÈ|= [6yÃKö$³,+ó2àRÔ#= cÐæë®¿Íð®W'õî{t{ÃWÓ)4º"ô(°¼ª5¢$@Üû¼é1n; Ë4,¹Ô1³<X ØãìTù·9ïl«|ì5¹7ðÔX|74l\²»±+ÄD\¼­%»:8T,²ü4;+!øÂ,[÷Pº0Ë·¸ý*=M¬j÷6,¬[÷ö%#=MØê¬gtH	º±´÷öêØè¹ö¥wÄÇ*ùÖ_~{+C&ê0Ä4«{´/%~ºwô«ø&BÀ@¹újkÚ1èða*uÀ}<YÙ¹ÚU'k¶ ü»­l$c¼ÿ{ùl=}øKÚ|G»H'Â¹oè5¼;¡ç@s³·ôÄôR'ür¹´-<×ä¢:Úý©9Õø¤$ÿy· d,[ÜY1\È!ÎB6¹ìøø{pÔb)ð¼^´x= êpüæe¼-'U-~¯&#!µðXé·Ú.0Ò%:m·ðPð øõ\|8ú(|³(-ú~!èÄaºþ#ûL±ë@°ºê_pp¼àtÜéê|ù3³¥'Ëô<ÿ.î3\"¬ö¨A»+Q3îr7yñÿtÃxy©¥x(aàærCûQËm?¾;ö!Ì©´1ÿ*ä+÷D¥=M= ¶3ãàôùÇªp¥9ï¤,ø5Òë¢%É2«!fà*ÝîÈôÜù"×ø %ÎHóÜù(+éþÐ\ù+"èq*{±§2+ýÊ·JÚú35Ú>êðZùÖìúk cì°3ÛÔ×ZÃö<ÛMâÔ5¦èK3HëðýfhKRã³Ôõ¦(K4KeêªüZUò±!XãþÍnÈó\öÖh¬
p[õÙdõÒ£®°sÙõ"\*t²;°ôù0+s­ù
ëÁQÊ§=M9jd,6AÑ,ÏqÔª¤,"hî¹'ßê[!Ge1Ü9²<-Cú»ñ*ÜL@*Óq¸0Þè¿È,m©;ô?òWm«º¤+5#h¹éÒ¸ËhMâ¶,5BË¬sV&0ÿ-ÿo»r5ªðôæêÎ+ªÀ3Ö«¦IÈüÕîñ®çfÐ³4óÀî?jmëðó3Lp3ÿël
Ê-È/öu$ Â¯viÙËÀ¡®±Åq×%j·xÌ^¢úHp«m¹oËQvb]û²Æ(±!ô=}âÃ¯Ã^\Î0M.½üöR´X¦ù¾Ñ,!= V³õ	²Ö¨¤Û¿®,óÞÎ¾ø²mút~ökUK vÁ¶ÂöËÆuZ4Kà¹°Ï'ÕùôJ|·@{Zû$ké÷z§õY®±~!úPb<í
2ÙÈuáòåîÎÞÐ(¦(#Ô#ìÃX)êòÝ¨^À
QãWsér{r«³÷öøæÆ6Ã¥ÒBe$\#= ôó¶øfW"ºÀO2´è 3¶HfLÇ3U(ÿòqîóöóvQ¢v©}8R±
¤û§/nÈorõßüßFE	D,oºß"lÅ×Ãßqb®4÷¶ú¸!øS¦X(YêIDÊÌÌ=M¸¥ô3«æ«¸IbÙ¼o¡Õ×C×ßÔ[Öøé÷6	¤_ª.Ã|óãâ3*ß¦àCÒ= gÓfRù¿Þ^¾·¹43&àÔÌèØtjÚvk¶³§Ój×|ìôÔäÈs)Ö°¤<oá*¨´¬[³ù¶	L¡HêKçÃÃÃÁÃðWÞ¢Ã1éú7#ÛèÄ¬[w!$vPËø(5Ü,Ûø¤4'ô;ò¸4ôÔ3+8³,hP·
ò¸9ÍÚ0$ÉXº¶ëòlìØ|.*×økü± ìFTä)8¨2Ü
ø·ÿhPÔv³¦9'z,´Yï8+FøÌ&pá·2+\ü3'02ëö9:÷.P<(	,Ûø&~¦¢»<7»*$pÒZÌ4D§Ö%äxØWÌd·=MÌÌt²$}®Û«%ýVÚ:¶
~Ê¯×ó.Öxõ´S|Kq0è²Ê»ièP²VûâfWî>|ËcGìqO|3èPÞ1{ÔÖ6bÞ·4²³¿Ï{Àå±ÝL%j.vFß_ob÷WÏáÔ]¡ÿbænÿÁg«ÏqRþä6Wj÷LVr Éptõ7Âåé(=}!Â(3[ü7Z¨¢ 3f #éº/ë=Méä»f|lÍ»/pL,?¢gt©PÐu£/d¬ûqöDÒæá0½ÈsáÜõ7Íè}V¨àë@c	úª<ügíÃê7Ìò85ÒäSìÝ=MÇÊ2Ê\t¬ÛPÜÖ0SêôÜÞ ¤ê»-9*ÓOÎ2aËí£4Èô	6Ç]ÿíî°)v3 Tì½ONò´\wwªË Ô[¶5!lî~8%ne,Æ(yÇÔ 2I[z¸ûWj>Âh§h9ù²&dì|ðµÂÃ¬d»1éøÌ:2= Ý¹êcZ¸äÉØö¹¨0ÓW²VÙw¶;'*Dµ«­¦îüª8µÎìÑåºÿ%¦sçdë{®0Gj[üP#ê7y@È¬TÐu÷údëz²2Eië£ðÀ
:ì{0ÚüâÃZ7bÙü³æØlJ+^âèr(sµ±1Ølj(ñ)¼5ü)y²(ÒÄ¾ïé8ÛFàäk<µRé¸pÓ«¸!ÿÚÛ¾¢èô+RÔo#lå¹Ó½Ï2d]ÿ£á4z;²³&ÔÍ70ã¼zè S¨;´ÜV5×0Öä÷õ÷iý4¹}¹%;>0?i6-¦§)ûºÂ¶éÔµ¤kÊª½È/®Q¨$×)¯ýY%¯Y¬¡âÙ3mæçù6Ú¨Aó[Tµ= |µÛWpí¹4e¤Ö¡mj}ëÑ+G0.Y&éqÂ÷Z¦å¹N#4ãÔe,@ö¯¢Â6öc°É4iìäÐ(^!Í)Ïb²ÂÖS´XSý¹#¾ã"úÚz(¸imsn|}z÷õñ$p0ãkò9¥Rê¢ï»_ä}Î'PÈïÕøàÉ¡ÔE0£ô
«(?NÄÛ:µá¦9+ctñT§òµ!f÷÷!%;zý²Ü¨«©_D-«¦1Dò¹h^\§),Ú¨ëÈà8}kk	jP¦VÅw=MIÐè"áRñæ'î¶xâ}bµÌ7èL	Ôø8Ì}×èßLÒ_±þ¯þIñõèÌ¬'$¢b¼ÆsðZjA¬t¤gÎI0.e¶««ê&øø?,´R%þµðÞµ°¾5_Üi"iùæú¨ÈµkgZº[Öß:å2ðA:
·Xäð$JÌkk@æÔ×Õì= LgfºåJcÖsÝÂ'õêq9_¬¾GFÓëV_tê!|¯xÿ(¿Þô(ôëéÜø	³ªÅs½jy@ |òÄ¦Í= >ëq÷åQqà%ªØ&fó*RÎ·(NWXsÕÞ6s? ÃÓûÇ,*·r}1Qòê»NàÆÕÖH-xM%fz#= ný²g#RÑ«å}M¢|¾a0sÒqw®±È#
ZØmµü«xrçó±µ.ß~¾;ÛcúÑ6":|Ë[î§"lðda2(ó:×r_ÇÄ5#oxvw%â¦s¬í®6ÓÊD´Yüà÷rï³Èó. £o¶û¡ùd´,Æúyqá0/Õøô,Ûð)2ÏY±£¹+6úxì(úï¤Ûà¦ÎWsÉzîÌp¼9y® Þ³ëõ3Zº©ìWè4WW\ðn S+n´Õpè|ÜoicåQeF´+ 8É&wó4Ë+xÊ&ð·
çð·e³&n5KFæw7Ì4Ècñ':/-..úLWxû÷%^l;y¢4)ú3Ä¥6ÜÆêø´	ä ¸3ØTçLY<è¶¶+Cì×íî¤4#w4ÕÞFÞü80<3S)^~xiå:5¯sàZ;95/­°¤®$"ÛÓ«Èê*/vON®¤´l¾1ùP	×	BK0A­ää¸¸. p&é7þ)_ûJÇÊ\,g¶_zWò±Õ@]_ÃìkvÈa¾NÞÔG¦CJ\PÕõ·ÙÉÀ%â³¿ËízHëÐ½u@*ÉtweT¥FGö®ùuÀ}<«Ke#²9;©<%×{K]Ã«ÌoÀõüÁ6ê96  òTfÕ|um]ì¼[|Üö}X·­õnu½ÿ(3¼*ÌæÔ³Õ´¸þ:ÞÄüz.òé»É¶Ù´üÛ>²ÀçS+Ä4,{{´)%Îtsêî6OöfV¤æÇ±¹Ó1$¬hÐ8râ±6ÁÞÅg c&û1#;8Ôå´&¡áQkBê¨^*0Ð0·ÓÎkéXßå±°<ÏNÚþ*I7736*à|³	WrñSò= RK/0¯´r<e3öpäË\ö·¯,÷¢H5¸øÖÙYå'#t/Êàx
ÖÍü¨(rÒÇâÈR\%,Ø#ouÆÔ4ªÛ|^Þòß¶ÇÁb0= >mCoQ¢/µ÷<êÊK2fÛ8,´kiXé¯]qÛdúxá¯uÜ,*Xï{l¡è61!ÿ+B= ·rèë­Û[ëc&8ädäÓte¬nv¨®oüº·®Òl¥Nýg0Ô4«Ysdæ¨úGÂ@¯ö}<­²±ò_¶zÉbùñ Ò÷²±è÷«ÊÉÂÐß= G¶ÏßÙ¶óy÷·o_Ô1³ªð1.Å_¨X8vÛ[f,æÔ{||üõ¦»´&0À èñk$$aºº»¦´ÂzZá¬¬«ZvßªÝè7;;\x¤f# {üù®EgþÖV
êôL:wúúO»kqÜûº¹»*/N*= 0¸W%	/*(¸¤ó,|ÊwVG­eç±÷ñ1q·ôøó7±^òÅÐ163×;KÔDgK$ääÔ±h&¾2.""Zà×ÁÖ¦{w÷ucØ)à¨ñi*@ï|000¸7i!"67#3NÑë{wW¹º4i"Ô{{ø¯ÔNZÑ?ß±|ü÷º¯ñ;Ê!°´ßv÷ "âæ{ø²$| YâìLtñ1[ê%ëÐûúúùù ~Põá,«äÌë"Ì¹¸<5{RºåM\Ü3ÈÏ_xíuë£>Tî+¹¹¹C |yôu¹<9/§7	Õ§ÞSYHØx3G>ëËÇ3;.B§4ßöñË~¾OâXfZæazUÖDz7±®¡1 Jêå±ìËÌç%ã¼nü>(äÄV= ê{Élll(ÚØX¸þFNòý´4Ìj'Ph0* ÐÈtl#âjÓ%%ÀÈDERÀ.ÄóyëB¼ðó	»87¾®2ÈµÇ~©úþ)ë°q÷¶8$lÝª,Áî%+Ç#",âçr¥Þ^ðä¬¥.	OXó'8ÉëÝ_¢ç£³)Zx­9¯rWô+pÈ¦L,·ú{h½*[cÏ*<*&Ô¬ûO9P»9= «uðpKðb>Ãá8oãu+3$màõ·ãµ£8x¾¹Ù%øuÆ4­÷WðN#'Ë-ìÜ±¡ªÔ±ËÐáÂÇâà_*´áN-¸ù\Hew/0fFîêÿùÉñ£jê¡+In¿:0Úõ:´&Ø;JN}#Å=}Y^Àa&hs*Býªliûb&]aÁ3ê= áøQÛ= Á_¥/B(þ:Ï69ÿÉ<T;5< ÝFPÕci×éqn¦o¸]µ^½¿µ¿ýÏ9Nm´á}o]Q#ÌE^I>°ÅÙªÕ|q¤áoE"Mg]]Ý¶Á¾R¾i[§]åÀLÞ>¶m¥¿=MIÞBhÁs!Ñ½= Mw^±^XLÁEºMMN7= I½1ÿw_b]Ia¯AþÃÍÇmGdO^ÉÕÅ-pÿQÁ¦EpM£_	ÕÈm\^ÿÁâEü]é}ÂíÃårÁJEØMó]©5Rdÿ«ÁúCÐ^ÁIÁM»d®KÿÁ EdN= ÙuÌ­>ÁEMë^}õÂ­D[ÿ@ÁEMÛ^ù}µÂ-CZ?¡ädÁlE½g3>1|?smFé¡=}^=}t-%¼ALAlÁE{E»E;E>E¾EþEñ=}S}eÁMÃQÞu?Q©âE¢M^}ôÇ}½?= Ä%¼AhrÁWEòM']¥½=MEÞFpÁSEêM]M>ÞPÒ{c¦Õß®º:ª*²ß¹ N]ß¯ &¾í>PZ¿ÂE,M×ä¿ÍHÐ_VNX)dN§Ï¡]î :Ë=M=}P#o\)M£/Ñÿë´S^KÂHýË´QUc®Ùz+^iá'Æs ·ÃíX$Î.ÕZ­CfÄ#È»õ½Çâ$þÕÿÁØØT OÐ+ä¹UðÕµæõ»ÿ!8VØýruã OeÅ´nNz=M]"Ç].½4ÊF6éA/BÐ¯¦¦ÑBPðuc#í/e= c¤=}c¤YÅ¿Ó 8JÐñLc&"çå¨²VPÇÆ×XªTª¿CÐ2ñ ñVhmØÝ= òØóóX «ýá*¾XÉ¸èh7ßx7AA¬1q7GP4¦Õõ@Æjm®àm® m®:m®n®Zn®¢ÍÍÏ= cëhcë\c«Uc«Qc«H¾Õõm=}»úÃÆ¨ÙÀy#^ìB°N/¿o3ýá½8FÐó·Ñ²= ùV¢Á¿þÐ¨T'ñD²ÄwïÛ¡ê®M²|Ásý:ZPòþfñ
VñNc&tÖÔ=M³ÕÝ¤n-«ßnvÌ¯K¸ÅóùÄÆö1âó3°³U
BÉ~hÉxYPáW ULmË{)m}lUD»%´Ë»ÓäL=MÄ =MAÉÐ\,à
:=Mûóûõ[Ç$¥Ü¥Ä	¢ÅÌ·và9»TÎ\SÇi?Ly¢¦Ucj ñóÒâî}B.ö[¢&þ Yí­;òÒ=Mæ²Ï0eKi9mæw&~½Wl.·f ÚW¸l6¶vówKçÀ1ìÀ1&@"Ybv¯Ã³¾Æ²ÏduL;­ÏÃBx©=}Ñimî·Xaü¥ÀÑÖÍé¶ÊÀÞ&ÜSÏT×a%ç»î£Æo¯jT&þT¦Æl²Òo/õ ¤ö»u	£ö _z§Î{R2Ío´¶¯Z6çä!t£¬f²Òô1Ý£k¦àOØÏï1Î2Î9ý2å&dü6L³!Î{J3Ô©¢0æ\08@aüÆ6acÏ¾P3=}# ëA¹ÅÑ¾Æusb/(}ïrhe¢hazå7oiA.ÈaüÇbúÁÑùá1Ý´õqiòÑSÒÓéùI/lh6öÒÔohÍé:gLÓÜ«Ï©¾Î§ôe¶ú_6ºOì¨Ò!ââDç Íuìf¢QëÊ7Î9É2aÅ7CÀ!dºPf°¯K©kv¬¬^6r©bî¤êâ¦ªâDÒà;ZaóíÐ¡ªB*/øï3,jzåWjº/,h{Çò·JæN(^÷ïp
Àòe@¨H1ám	´= #©g#gss= sÚíï]üÐ¡f ñiêFÄ¡ºFE1}ÉÔ·	~ ?&¼´Ïÿ3vÈuþn+£ÓÉ¼öáoS×o3j¢Ù2Òéî;ÏnoÜñãíÑÎYg,H(ÈææZhíefé%}pÝV©À°¥¤	 Ïî¼¦A÷câÌÐÿÐÉ*$/ÁRÏ»ð¡)ûG0ziâóyl0ÑÉ¹cVÄºÎocW&dXz !r= !Éº²¢¶»¸viùü©ZfäÜbä3dX
V¯Üï¹öÙ®ô#£Ýµm¤ÚÔ½Õvô£*Úò"ç0= ~àuúå¥åÔÄJXT
Äzä3öäô#²° ç%é
^ QD¨÷À®ÄrÓ=}ÉdJZ"-ÎË´´uWÜvã+I²úþõ­Ë |Ù!ÐÛVØwìVn .ßð2²[2kC ÄrÃrUéQ §a Õ"çuñõ; Ák³¡YY3¯Évò,ªðîÇ×@ÈÉX¡ÉPzêõWÒ²ð¼îXõ1+/ì+ÛøXX±ðá<Ï·÷ÖÄ.¦ÌíJz"= äzpór05ll '«µ¤é¢Éî! Î×S&Ð'.äá^ûô»/»¯à¶É^<í=MZ;æÚ·#ò4Hð3½.1Á¹Vj§D(=}8Ýr£C¤5²FÎÈÁ$LøçHrûY×¡¾Vñ É÷ 
1ýwKAá(¡=M¾Ø= }±ølpô&áýIzÍYâ²¼w±X«püø¢ozâ¸äºáÏ?áZâlÚÈX¯)âásRW7j*á¯7éÝïÐ'ÚlbD\ÎGZúlzªÑôhf<1éÊåµöÌ±¶ûDöþ/÷Ú²Ï± Ì%»&Ñ¼ ¿ûh7knòYÛù$M=M{îòË·*ÙC$:'ÝW$;ô÷VCk£é¬·3#Î&Ht
°¬y±æ3$S4ûáø*'=}'¿[PÔ3÷ø­à0²ûp»ü+3ÜïJÕ#¹x-È=MÍÜ|ËF: ¥4ÿê´·äQÒ¤}ÔW³ùR_wQuPvóég²Ùd³±¨*[:W©7ªÐjwò¹û.ö¦Úº#V·;íd£¬XC;'´d¾Ä±F=}JoM±ýq)îGLTÚ1e~l
#eÒ ¹k{ý÷²G;jì1©¤f«·æ*C$¾Ì âå âcB\ùÇb|úûk\ªôø%Zk,7CÃ#KV@ÖàòpäÐðÙ¤oW= O³Ö'ñ*µ)ãDì¥ÌÂWµÜw dúª<R8 ?	iY·¶~©ø[ö«&Ååk3rsi+-$ª8«êÑ;4A~kìÓâfn·&_dÆ"´Îoß¯³!ÔºÊÍoØñÐ!Pb4õð}£0³V ²+äx&D!ÍÖU"a,¥£Õïè&Ô«©aÉ?ü8&sè,¿ÖÒÑTç)ráýn8íF=  pVj@0ªí/e#BBa¨àñ§= aÌLaö#Û$^,hôw¢RI¥öµ©Ú,v
º[v¹>öû°¦È/õûð²"ñ9¯ü l.Z= 
º¼ÇVü³z5Tet³IûYit:ÿï"ûè·VGÂºË92~ø½Á½.ØÓQ|÷¯ßq;ûÜYnèàkg4bÄøbU¬R{!NélXQ¸¡!êw0³Ø±æÔGvºU24J;óÆä+ùü]=  bj_7äMü$'âKj÷å	j 0ÖÝglAê"=}×çTKwr­Íµéæ¹ËýE¡ÇuÍ#ò5½6à-OñgÚÆÞ.%©WA¿6BA%a·[AwóGK¼@}SCZV íÊý>ïp¥Ô±Åñðª±ýNIe¤á¨?ÐJO?¬hÂ}×MkJþô;·oÜÐsëÀiuaýÐ5ü+ªØté¢êãµÞÝy³J5»úwñ©ìãò¯öÏÂ@ºÆ bâaI%æðÃòèÓle BW XwåÔ³jñø6@¹ic¶'5Î@ ·±§ñ»
gNvuÌøy¤ÁÆ®:8±ªï®§RRJ2ÓÔ
Ø9ÐªûzxôªÝS/hÎüÙf bLÅ+îPg±®,= 3¼Äo3*÷2lÈ#ãâ3+´ol³½ÇÏ5dT{ûuÄ³ÒQÚ4$Ç4#è¡%°ò¤êgÌ,óòïûÅ ¡5Å*¡SÛº:¸!4nì_$ìðv«eOr7}
å£4ø¶É\Vr³.Éå Ú´dß×¬÷R"zÑ>¤"/âæ}â4ÜÒF´gg¨g¦¾
Rèèo6=M=}¢0©Øñâð8Q¢úíhÈÑ>gÔ9tfw,y3¯â£Þ= ¢¤ÑÞkh¦¸¬fk
[hÜúÙ¼ÈËBó²ÞÈé.²tqôTð-Bß:¾)Ñ9);ÂÍáßÉòj9GÓLëÔ¤°¢ùQ38ahµÚg£Â(î Wï¸ ×íºØðRî{ÌíWó3)0äË©­Øk©ÿ«i L³7Ì	 \³«I(fÓr³%Vý+(Cî1KÀ^ÉÜÉ ê+ð
4O)°Ú² ~ ÞÆ)þîóí Oh´dÆj¥Ð	Laðn¾f)7½Qó«¤Gx:sÂRIðînj©Z« ð#Æês#º/;¦ = ,òäsó ÊÊ5¥ û¬s#Ù¦ hM[_¹Ý²P= ®)u¢OívÚnj¿mnIÕ]K5=}­î¡³Yårá[õunP,Å;« pû_ z/µª .:Mô®<gÛ< nd©©¬¬ÌÊâ¬ïî ªi=}¢|s©)&}XÈ,£ 2×ü's³úÉÊ
Hîîis36G5uÂ:¹nÂZjäíOðpGxhÂÊ¦ÑÿäíT¶YGØ/]ÖÚ|Û	·«£rädð^ÏèS©6¡³^´oÈ¹Ü<Î¬²ãcîdºÐÒ	|qÆê6Û¡ôaï-FÆ)¨Ô#PÎ÷dïå¸ *z ï Àë5«u°[ÿlL >¨Äîó Äî²Ãî= û ä83Þé'sõþ3´e·d¾ÚÍýgbaíi¾ÖIFé&µyh{ÛGË¤Î4 Òò®©³©YèW[éìÄíñª"^ÂïtÀîêÀþ>À¹.þi ~	¸"]ú]£xÅvY¾íê3}ÓÖv½òv½&7JÞ@:ë:;©1ø»Éê+×ò*3Ø8în8Çûîi]¬i¸®él0\ÔjjÔÊu\ 3 ßné¥s¦qha×ÒxÄ
) W!, ÷\(
kJ%
$+
k)*w´+§x12¡¢'3¡"Ü3ð¼+þÒ%þO²¤,øð|÷p²Óm;øoë)©}3£TÓ=MéH¨<ép{ãp¨UÖòÆZ¬Æj÷Î)Cµ±¡:³$g²0ò¤Ä÷ñ¤ªó ñ Xºî~èïÂRïOíêíî4ðÀpØ×69Ç67ò= Ôô¡jó¡p³ôÒçò2q¤ÄØt¤Xìs ¯4£É|«[J¥©,ØíÎÆ(	)1åiÌ° ³«¹= 3Å:ö^°¨ÉWí¤«JÕ²¯º#%ÜÛÌo Ü»ç&'oZ39ª³·ªS7ßS¸øSHøÐ:ócÐ0((pçðRèðÏXèî¢6èîÜ$¢lçï= = éig)gé-¢+¢	¼ÜÿQÄB©ÞQP= 8Ò(	±åOHeÆªYþ3×= êÁÇé*G)ì7RÚZ"¶s¡¹v3*#óiØÎÃjfÃÂf
çûhkòj.­svqÙªWÏòµ¿âsgþ¬j7µT¤ÂÈîÕ|ÈïGRÈïÆ°Çí\ Æ©Ëÿé±ëÿé	ÉÜfkSlÃeýL¢çÃïrH0ð!Ì^)M³·ºm¨Q	²G\´Cï?Ó}³ø{S@Õb´=}*ØÔÊ{/57ð§î¶Õ±ýÌr*8ïj&{i  ·²
»6rTÈ´«ò3£´µn¤óêëdXnÀzµ¡Lh%î+©,BtsvüX8{ýÒÖTó
!ÿ{ôqðXé°= XP¡²X7©Ðìp¨Æ
$ú²+Ki'dz°|æ  ù²©¦xÖ²C{þ¢Ä,Çàì¾þÑ{f; |gV+\Ñzðf¾¬ÒhhÈÇûÛ«»Þh4Ö÷8æ/m/ÆoÌ|\gö»øìå³nYùàè³w­v"Ãoúãç¹®2Ô¯ü	¢âã|ÒXTÒü9ÞaDÙ7
wèÙ­xà	[°v4*ÁÏy!õo4.â$= HÄÑ²»cá<ãyJ|ÝY7¢üÔØh4ãh|*2àÑ;¨Ô/çâ!+Ò$Âóhb¤ª(ôeN@tfKtej(ë+èJàIÜñ¶.»Â/ß0¯b&o¢³ÖâÒBÈÒKÈÑ'ºTeã×è!wF´Ûâ'ØãÁÚØëÕhÜßi9¦ªÏï)=MA¢µb¥â.0ÜÑÍàÒgØzÒ(4ÑrèOÒ·JSÇÛXåui,äI+Oà#(ê±:èø/­£T"± Ë[°x"þ:!#6cÄ$JQûßëoúºj"l')= ÑÅÒÑÊ4hZ#Ò»«MëÒÇh ÑçHg¯"7ZGë$;g%ä	â	6¦°é)Ù§×hËP¶V;j¦ÿ8å¾ôÒæ1eçñä\Æ7r'Ñ»æå:LKúëÙNòÛå«¬È'«9îhàYòõåÑ&,ÌÉo$:f§)Ür 8²-+W²®0åJ¨ÛXiçî±ÌåêêYß»ú0iïð65÷ø_
H= ¬WV6và!4=MyÎÌÛøç¯"OT´Üèv­,÷(´3ëÙ¥§Äºô÷Ëôa¹6ûäºË´°ºâóuäÚhº÷
Ï&6çâìtºÞæ²74ûzÀ\8É4|oc:ÿ&*Hââ´øul:%â&Béü¹° ÷!ÌÔ;:;¾1òÌã\ÆwÐ91÷ìâlì¹tú &Àcúü# 7ùüûätìü·wæò·UxzCÈ·êÊÔw¤ª«2.¤|2=}òù]òà9'êGÂ¦N²"6'6Ý'åï'ìøhåzYhèpWh§â6ò*ú''OòF2^8XçZIªÊåÀ¤òTªäSF&á74'çë(ÞCû%êShXªû ÍW:^zÕ7°Ïw¨ÄÊXÛç-Xâ+vzÉw+
2.'dç@ËÔ4ÙéK¬iÙãêuzÜã+ÅÚâãw¬lÖè;Vn*±«¾wi·Î×ô*u´æm9Tr6=M¯ò°8Ò'æè åò9æÊtê¬åûøíÚ¸È÷0òþá*§ü½Zç¢ rêÛ{öº»Üw/÷×sÉè¾V§;ñ@'ÝÀ'ñ2üè\hY\ußÃquãûµ2'¹:2f24>¤ç\çª$ËT§PlçîÓ§£¢2Ð,Rò
¿è§}²ò#X'6Í§lô%:"Û·_!¾®&G¹éÃkµßk0ºãK¸ëë°¼æÓÖ-2±µà»èÛ»4X8~ú¹4à÷¤ò-l§ê×4¹þ= "¸9+µÖ¬êç Bû%µ"ª·;{¾tH®!
kx/´Ùµ×yèpóýL4q/;c;/ñÆüV¢#pgõ-ðÌ57ÂëyñîXìå°$Lôö0zitôDÜºÀ¬Ë4!G·.ÊTù5ñòk[µhT|ovtt7-¨Lºµ*ÖûùóÌº'Z#!8è7°4¤;9"éùùÒ=}8=}<{j\lfÍúR0ÌLÜC0TÀ¶áM;­»»$»«ÈF"èH-3G-ÂjH/ÜG¯{üMOÕØ¬Q#ÖómÛYÁÌÁ¸±kH¢S"DTS LhT$lT$üÔ ù/*Ø/þ2ÿ68ÓÇ\4l
$;×|«Ãä|e zÑ"Lº®óæYðy,´òyìnå?ÎLÎ<[[þ¤ZÉ4\Ðg0@«ÎüaÏ¤Á.8à5ÃGü¯à7nûh c
¹é9#l»ô¡¶¬é£rëÛæTòêæL1êþZ8Ï§/Ä7¹9Á¹ÞâslmèsL/ì dlë 8$ìp" ÿ'.º('.«(0X(°C90Cù¨ÆÃyÛñNlðãN¬ínüüénüØìF¬yìFlÙèfÌÚÑ$ps Òs üº«´K§°|«¬±«þz<©þt¬´£ñ!Âôù§}¨;±¨;« ÄK« ª Ôr¬ØY©¸Ó¦¬lª¼°¬*6*6ÎSZõÏ¾8S(
'|¢³!Öúx.¤x.oNÚ¶bÚ6Xäk9kùök9¢6ëmüh\.úh¬âXÜ;té}´´Û¯üxìðD¬õßD<Ð(ÐÜ¸/Ë;úµÀÁ¹öù·.ù¹ 
ù¼\{®\+-åLü	ßö®q¸O
Pè-º¦nù
 Uå¯û!$ûùÊûùµim_Ó4uP ?8.Xî:5ú:5¼ß¼;®¼+<ñ|Ü»=},r=}Ü·±=}´4Y,ôVúÓK!ð\I!@ÈLCJB´K/Ô~ùñoÕ,WnÕäZU	L'Ä-wÄ-Íµ Ã-°¯Y
5öáuµ´YL»T¨Á01%µ{«¶y¶jÛ$Úýltld-¸PõèA[­e\³elo¶el×nÑdüVÀHI öK *I ì¼Z<÷xÉ¸·J$0çI$À Ä0Â°Ä0üL$tI$\:O¶Ô§Æy[ÏÓÄ,!~ôPöÌ^ÆôlÛs$ Ïõ a{£¬O¬®jÆL;Û¬!#0Ñ¡;Ä¡;vnÖlÛØ	ä,#$b0ëÐvpã-{65êQûçGPØÿ:¼$ä-Àõ(Qû)G<&G<¤ â°5¿s+ ¨µÞs[8õ eX¼u:S5	s¦èÊL¤ ¼;« |Úï.Ès»!×Ê´õ¨ Ìªy7ÂÊ¶  ¨{5µ,ØÊ\9ËÖs;V¤EÙº¹ÿÖR¤¹u,#ü ªËkX¨4ÈÊRÛ¥ ÂCãs¨tXh-M$³Ûÿ÷äí{¢ÕrpÖrwÏ	££Ð®ÙaîDPÐÀ')ä³¯º_¸{Îpbï¨ÄðZ*Äðð/­6m³çmó2#³²5°e°ÒýY_OÍ£yøyÛZ÷[4Å ®ÌÄí'ºÄí[Cðü·J£üWKñ[_K¡sÍÒu½*
p½jVÜºÌ¥Ì
W¡³Þ#®qÃ*IÇ ßZ-s_¹8í6z·ð;Ø¸îz\¸ïaâdÒÀ2|=MÚjÔ÷ðóÎñõëé;7k©/
éÊ¤¤óÆ(Î&$³ÃÉ3©:³)ñîZØáj8øJ8úrÙÇØÏÚ¿²¬ÓÛ©c¦Gz¥ÿs£ {q¢üs¡(ûttû¤¼¹êcºéì(íãÌ§ð[¨î¤¨ïlVr%
úB=Mçé¼hhßG0Ç)[ÂÊ8YGç	ó¬è<Yþs²ìgppX¢o)¦sïf#$NKgþ©ÈÇðÓÈîÞø©'ïÿ)©Ý~epË/h^i+M°5bÍÚ¨×ÌÒ?C¼³è[³/ »èº3Cö)Ilóòédx®ÿWL±¤/kiæÇÖÚ9#W= Öâäv¿t"ý1x±iâ÷	/;Ïæ106¹'Ð¯)#¸"+ÈtÐìlÒyÒëÑØ[LÒ¤4ÑAìJb¹¦êüéQ6±~;1Ù¯/¦¢ÆPR;^"8Q~8ÒjRæ["ãb:s¢&
	²XÑ¢àgäéGÒë©ÒÓg k»oöNxÖOÎãi/Ù5®Ùn~Æ¦z¦Ö´ñ¯/7E¢Di¹Åïô¯|"%ìúÑCøeªÓòoúØh»§Ý±¸ææÇ·qvSÖwèÕo%°>¢¡8}"{bîJrh/\K}8ìÀÂ*øRð4\JzLV3)Ë¦º¥:å&hãvYZ"¶is§õ ðå¦å"®>'ßËâÜË©Ö¼¡TôwÎüìv§µz×ì3·(óì.Á8éÞ3&uqºb:2Ës&ÌÄLð¥©·¬¦&k\ð ·h··+$ä<Ö;Ø"·Ükì¸©ìØ)á3K³|<#â{(ÛjMéëªSò9zìïwÞç'täówiéÎ×óèÂï¸² &ë'5ºÈ8è= wè¬aæ
tãçæèRHÊD²ÖåÃØéuxz&q¦Ë7ù,¹²ÿ§Æâ§ÒþÞèJæ²sç¼
ßKôè;t´ç¸o4å2?2­Iò}À§ø{Äkf-¦dºå#0'èúTîüíããÛBêµ;ó÷#9z20ÖÄ§7.d' Ûè´üxì¼è-~
xð· tróÁ2¢,äw-lZ6$3ù;N@8py83± {¶.[¹:a{2ÆTüxTÌÛØL9+ 4ô1 t!±¶6ÁS>õg\|;{ÍÜå[	ÊµÒ9yqñ=}<SÍ(sT¬G0¢È-ÀÈ/fÇ®3éu´kÏ&UáÒËÑ#ä{Ô¼Rf\ók|Éëý²Øg¯$|= õ;b;geÏÜëW$²µàNÉ|×Â4;LÚå"õø',Ð\1ëC#xÇô"¼ |$½W/åÊ5¯Ê¶O5í=Mãùë¬p»	Ù¼5ÙÜ÷¿tuÏLÇ×lª Ô±ªR¨x[T=MÛ|ñ$²¦ü±!.Úµ
¹ÌT»6·T«ÒìÆ*ØÔ?ª/÷xlõâDìPÐhÈ¼ùÈÌÕØd, \û& ¼O
'-:ì 52º¶4îù.î¹|	ð|,öó|¥Ñ>¹
ö>9¾ù¾ù]{|Õ¼XtÕtL[ÐÃ-u[pwË6Wâ~ÝR+0
Põ,¾Aûò{= ªe8¦el»Uüù´U|&xÙ(CL$ ËJ$b@P¶%ý·¼_|'Ï c.HÐ59£o%Ï	¨j#Êkc0kfÞGy]ÂÑÿY,â-u\XLè¡ ÓósqþÄð.Ìèª¹ª÷Êvª hë5p)zõT9[9U8,z-òôîªi¦ÆÊ
)¨  Çîxf©f	yÂîÉ¡ñ«oèºaÆRëÙ{i¡&Ö ÅcV/:nÑVZÄoìßFé£
µóû¢Y¨»EèG9ÀÕ.¾iì=}±æ\îeÓ¦ÔâÕ 	{	ì¬s(3÷Lãy)có,[\'	H²BwíÿîÜï£òðÃó¡PTt¤~&9)ÔèJ727)Ü²ÖÎi¦¯²£*ÒÚgÂzº\Âºæoèx¿ª-ëýiø¿×Âzk¯bQ¤zûS"ÃT£SÄw"¤8LDî2Â0îr= :\T¹Íé¬ls ÒÂjü&Oú	ißÇ¾º(&[ÉîrpÒ³@|fðäúz§©ºÝ«øâ¸B9èHÇ/å¯à-¬½8ÑÚ³e7«0êã\6VYð&(y6ºþ"­F+*àÑ :ÄhþnîÇ8ò£ôÝ×=M8ÇþÇg"Ç/¢'Ò»ÛZ|T2Ôëå(êSºÖxo§7z/#Æ×¨wW¡"ÉÞT4Qì{­è|,)èÜez
ú·ë÷ wjÌèãÄ1ûÙ=M9s:P¤ò!Y¬2 Üþ'G²âr*[ªmÞâ·¯tò.Ã>§Êç¨ðÜcçëRäèÛ$åz2È®Â·¦(wò#Sò¥2'âNç!À'ÒØR7ð§Ê½|õ¢+å.Ì:^lÜ,6L{è$ùRzüO$üp-óÄ
9 ±tùòD¬) 
Û
ä7.p//y¤0.»þ¹Úevà]\\Ll¤µÔ¸¼G$BÑ#xXÔ j´û-÷r_¶ünGìýè-Æl­Ë0æþ ¼ì   ÓJ5óóÊõÝFÜûVÓøB\1éb<º¨{pâj|îz,7å@ìuòPìùH,òühäx|²áD¼OÈØìo0Ú µ02º¶0{ù}¼÷&=}û«}¨]«ØxÕ|Õ|ÁÙN0PíCK"bÚÃ.ÄÄ®ÜÑyjiÎø[@êfÆµÑº8a°"oìpÂ$ÛÿùJQXm´éð.ö¤ªùXËvùO0tJoçB0]ôGòîÇ= ôêÉ*ãaïtÒÃð|3I¢[+F)ºÂu³Þ£mK¡ìó1 Üÿ8ïæ 7íÏ·ï£xøîp]då¾õÃ&ÒÓé%ÅãéÿÃé é÷)SÚìg8ñnÇTþ ïHïî(ÈídÈGmsaÅS4¤Ë$ëÊié4«PÈnxïOÐûh;µêù·ºîz9ö0Ñoë(>âÐÒ_
eSlûÚ×ßXæÙwWà±F¬~v¼pì/çÂ&8±Ïqlg1*e<"¸= añz'ûú8øâ4'ígx:§÷;È~Z©ìÓºMâklj­Í'VoZ,uj¸·î·^¦ú¢ô×d.´òð'$l[æÄLúä+Ã+md[W)ÿ¼)þ¸S1¸0/vVþyú¿ù+Ðßù"6­«~v{çb;*áÿüÓê4JèÐ$ à$s¾ÀØ.âÂ.«x/6w/-õ8-+9l+k×D%(h	Vø+V	Ì«Æ öO58¹ µ­­ÙO¶Ø90 ¡+ófÂLæ¦ +©9°XTSºv;¢F	 äf{Æ¯&Å±ï+6sÎòDõÜ"5ùÑïüe8 avºïkbh¯ªöîÙ2!,n8Õ{G{ê!¯öìÙ2!,nvºwp[gäàELºö©"6ü9d¬¥þÇShß¡âÑjûÂÅÒ= àQéèìðêÿþ"_ßçêèú7JXtªçø3Zx´*è»@CbIVäÖ§²Wr¨ë Ô+z81\Y|ifb²ÆÐäâ
×x¼.lhéõ¢;ùâéJ±ÈVqq¢1õÜä
Ùøµ÷
´ä,|¹/9âèô+z¹.+ëÊ÷I[Üó­"Z&üZzº6Ðty/ðÓÆP$éï44Tì¼3líú³ºÕ{¬&'Ê´è9¶:ÐÔ,ojÞs:ù4þÔ¬|»:YôÅ(6ìoÊX2Ø-Û´øQçj®'/ZÄkº2
éýè4¹Ï&çêªFü7þæän¨Ì|³kg®;ë|ÛvÒ*o» ÖÔËNð4|­é¼îtËR·
¸n¯\Zé t±å£>ºNøÂã:O9ú¸4êèR÷6O<Ü{º%=MæHI¸éVVVx´ëÜâ]íwºÆÉÉ*çSãU31ÌHI¸éPÌ[ô¬0H Å¼DKYò¨ ¨^ÇÌ²1=MÞ¸4«×òí¡ós,K(i*DE]íÊÍ«!b¯RFG¯¤¶ü©Í· gQÓÂâ®æsÍ§@]4ÓÌ=}¡½±GÔäÿ£µg§ ¶ði!>/VT7mÔáÇ/Yößq7eòÓ´ê>N#È.¸³½;~}·ÊÓâæ÷ùëËö"]´ÔLk&ÁÛaTÐcâ7/·öûñ[%³º"Pïôq7ghä¢âq&êktÔó/M6LvìÑaÒ_"B¯áñ}7gòÔ4*âºåµÂv~TqAæ=MÈÂ²¿Gò=Mâíp%_¤¤YÂÊýµ	*.íå= ìÎ(ý£ÿe4ÎÌ[=M|ÈVvkB::=M:_t¾BÂÄy{h8þ³ o15$Níÿ5A½¯X5 !ï= i}»ÄRÿ¯>¯ÀzþGöCéoY"[/,ïh)~ÿc¤å<IÅC½j¨=}XJv{f$¿²Be	Ñþ Z©J»Òý·]ÔYdÍ@h¯J3GH"eº¹À"~÷>3X>=}|øc(áë>]ËAÙ&s=MÆÔâ¢m(g\Íñ±g_ÍÈPá¶êÈòh{c@1wdÒÓäââ&¨ææù«gªÒyîCÚÐ0 âüá/yõÛDÉÑó/[öêñ= LÔ<ÏÚáÛ^æÝykeÊ¾v­¶âfvÒxaø:áF¶ï×izÔWX"Ã+dÜÏ°.=}=M
Ïðá4¶Ä^"Ó "È¯{fBÈð_lÏR¦N©"wçâ¹Rì·9CÈÌ¯»
¾*l¯rý%"«/¬ïVót<nkGh×dí!dÀzÉËÎÌívL¨ÍV¯Vù¾söVé ù!þ/¶\(3RÃ	Ôh ÿ#Héy3*h ld¡¤4YÃÂöM)±[ý¡ÒHSt¯l=}=Mö $q)ãbò0?Ó= Ø!íü®Ô8ä¢\;9F(Ð¯B-¹½ZöRé®¹!A6vM³}tÈï£í%ÁFÔxþsdótÀÉ1±À×HÌ¨ö¬= XpJùõ¬X¸­geú!Xèî¢7ãþs#27ä1"©éãb&ÛÖ[¸ü
KT4áíþxãôuÚ	ì³Ìò¤,Hòý"a{y*]Æú(Úð@a=M9ç'ÚK9ú¨ux¶üö§yÉÊ9Ê¹sÑr­&ìËKYSõdæÌ¨cí$àèFÖ/¶¿{K)û%¦§µM<Ì'ýÞÀ-GÈº1]ó°¯2ª ¾© ò§à@Õò9Sruð\ÐÐ³ç.ÄVsIò åûiÈD"²< §û(º³2'
ãôúå;ÈúÆöçKÖÀêZ¹Ò:÷ð¾@\ç|+Ù¸yH¼+	Gr¹è¬Æj3:°D§|+ë¨9,'5Ï×ªÿ>ûeòr¸|ý@óò¡Fî£'°3ÁX¼.æf¸-û+n+:Xnö6¹Jß»ùéz³)¼{Äú¬§ï<»3²°¨»;JºH/VèíxG0±B'À¢-òoø0¸®[ïr¿R 6RÌ¢âv¶×bÜï5
­Ì VYËõI,­ùÍCI¦¯á
ÍDI¶¯!
CËïmÑÆà©I¢!ehÖvDË÷mFa[(s"åhÚv'=MCYªþ=McYª =MYª=M£¡_=MÃYªæÝv~X°ñò¿s$¥¸BºýTG7Áà¬Q1Nf%pËû=MÄYºæÝv7~\°1ò¿{$%¸B ½ ieUPY þUþ®¢ö¿n n³QÉ^Ëîá®ÉjB É éfU°Y þU!UÈGamvç¿nn³RÉËîé°ÉªB Ù éhU0Y þYÕHG#Amu#Q#IÆÿYÕÕY°hG°É ë®	úe	~ËöUÂvnt= nv#§a#iÔÿ¼Ãs E÷q´&v
Ç°Ôäö&â1¦+»q´f<<ìé°<÷Ë5T!_ÃTQnl½@å0¿½?ßµÀDA!ÏB	Mjpî>êÉÙ¶ÖÓëéÓÊêñü¢Êi°¨è7æê|Ý4(µ§8«0y$0v$:w$¹Ë»Lí·Ô2þk(ÂLø)D³\)ï¢<íÈzT8ýk3¿)DøP³îl)¬;íÈ|T<ýk;¿9Dø5P³.l)¬<íÈ[Tºýk·¾1@ø%F³T)ßt¼íÈ[Tºÿë&)ßíÈûTú k7Äµ½5½µ¾5¾µ¿5¿µÀ )ÿ= )ÿd)ÿh)¯.<9Vì.[¤5i4Ð¸0Z¹T´ðCÿ×X¨¡êéÖòðD3ÿÛX¸¡ì)Öú @©¾íJsÿI©ÆîjsY @¹¾-J{ÿ5I¹Æ.j{5Yà>ñ½c=MCW~h¥C*Ý^ñÁã=MSW¨¥K*Þ~ñÅccWè¥S*ßñÉãsW(¥[* =}iýA©ýEéýI)ýMiþQ©þUéþY)þ]iÿa©ÿeéÿi)§%R<Ã®¼üîI-8©]54)]Ã5·G¹ºS¨Åvû»ÈaÜgÓ,Vn
* îËÕ$3ð±8éa£÷:jÓO|S¨Æö+|È¡4ì§ó8vn2îÛÕ,7î}­ºë]¤õ;iÔÍÜÓ¨vë!aô"g¯Ó(¯Vv
6í°»iTÏPÚlÒ!$¯fv6ñ²»jTÐÐÚ¬!©$¯vv À"·¯ûLèBåFyûê}
.§F§GÌ¨°µ9ïÁ× Øgi[<éÓÞã.5¥òKrÌèÂåÆyûê
!.§f§gÌ¨°¶9óÉ×	 ø§©[<êÓàã09ò[rÜ$LèBæFzüê
%6§§¨°·;ïÑ×0ØçéÛ<éÓâã29¥òkrì$èÂæÆzüê
Yàd|14j40nì m,d0¶U#»m	:Õ,Àû\ÃLIð{'@H é\ÃLIð|U£üm	;U¸ým3¾)B LÃîdI UmÉ:U¼ým;¾9B 5LÃ.dI UmÉ<Uzým7½1? %DÃPIàlU¬mÉ;å<=M= IàUìmÉ»Uz m7Ã1K %\Ã>Ã@ÃBÃDÃFÃHÃJÃLÃNÃPÃRÃkìä*r 2óºÓ¸µz«4#xùô,£Jà8ó³3$>X¸10¿*ZX5¶ÿ©ÀÊ9ùó Ã»[n |ìÕ*.¾Ü¤	t5x#x¹%$^0j{30Ï6[J5¶ñ¾9ù¢~»[pªÞn|ìÖ3=MÝÜ$Ø¥¸ãq)$~sW40ß¦\C9y¦©ýÅÜtÊZU/0åîB »r3=MðB»ûrP1F2írÑéÚè»zaïúé('£zM¡æ±ÚãÎþ²Ê¥ëËø'vBö'¬ÚÄhneô'r2è~Òwº'²J~7j&²ÒãCò'ºáËÁcÄqåH1æcÍi%Ïw×C¯:Ý1)Y2¸d~Ð$öèFa¨6¶úÜ¥V¦Ì%°Ãe%²2Êrváßqnß}Ý0'DÊÑÎ@'?:å¦b²'H¤¥}mZÚ'&Il§d$Ë[Åêì÷xÎ~ó7kz'ùÉGÓçÈ¯ºÑñÝZÕ4ÀÆÝ;ª'¹Þ®9²¬ëæ¼ÐÞ®9'9ë¤	#èh°~ºÖ.·÷)f² »GãDÌå|°Z×¾×ÏïÎqª¢Î7aìåÏçdå|/èÛ< b²}¨2z+¦âw^\åTOèÆg
'Ö¹æiâ'ßùÞ{ããáY4!L®f´!ß7= Pq"Ý÷_|¨o·2{äàE¿ë¯çpñËµ¸5[<60©¡úç-5³J¸ÇâÅeæ]wç4ÄáÉg¦ >¶oûaÏ´"Î/&¶²ô+t{jÎà"ö/¢Ð¹Øk,ëÐ¼DX°!Ì
/¡¶¥ê¹Ñ]üiÎ¤!Òa6biX0!Ìª/Ãyj\ßï¦à©Ùchà¡âï+[*¥é©g(ß¶ï¦ð©ÙfhÀ¢ÒY¢È)qÓçÑê1ìéù³#Æ å¹JÏÇÖh5, $+w*·#M(1'Ä¤¤%2µ_a¨?9#º_»"ÿ¦Õ³Øë:¨Ì"²å3Õã§¤ òô©*²Ñ³x8ZåÊ7£¨ú= ñêv(0¡¦0;:v{)&´óPÎÞ<42¿]õêèrÔ²Ú²®$±2%wâ(v<6ñë+<ùÄÜ5(j<üS3ÈÅ:¨}.þÂÄÇTól¥Üì¨~¸ª*ï'Òø´ÂZZdÄW¯z#©xp÷ðÌ£´	vÏ¸uä= äàÝ²¦ºõçñçoùëå£ãù*ð3ÂÛÕÍs¨6 âR¢b²÷-àÞªfªfLxv9Åë1KûV¶h'1%)ÂÊXÓ©Iìóëª¿ùj60ï3*zyÞ^ªñ¿'÷9ãÉ#1Z³ä*¨¸oæ ©$Å = [·n;ÿ-¨®t{É7a/*%ÈnFú¶xÓÑëj÷Þõ¦°3ëéÙÓðxzªÎÎ.µº3	ª4t¦¬/þ!= fOUº£!Ân¤ÐëcùRTTP´)þúÂê"¨§¬Öü¥°°.ÙzDï3¡ò"YÚr"9Ð WÏ¥uàoViàB×Hr[øm¥|'{Ü>®9Ý	PRT|_±ÄÊÜm®¯ç;^
¡ãv6Õòü2ó¾:8:@`, new Uint8Array(91457));

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
