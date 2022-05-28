(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('web-worker')) :
  typeof define === 'function' && define.amd ? define(['exports', 'web-worker'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["mpg123-decoder"] = {}, global.Worker));
})(this, (function (exports, Worker) { 'use strict';

  function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

  var Worker__default = /*#__PURE__*/_interopDefaultLegacy(Worker);

  function WASMAudioDecoderCommon(caller) {
    // setup static methods
    if (!WASMAudioDecoderCommon.concatFloat32) {
      Object.defineProperties(WASMAudioDecoderCommon, {
        concatFloat32: {
          value: (buffers, length) => {
            const ret = new Float32Array(length);

            for (let i = 0, offset = 0; i < buffers.length; i++) {
              ret.set(buffers[i], offset);
              offset += buffers[i].length;
            }

            return ret;
          },
        },

        getDecodedAudio: {
          value: (channelData, samplesDecoded, sampleRate) => {
            return {
              channelData,
              samplesDecoded,
              sampleRate,
            };
          },
        },

        getDecodedAudioMultiChannel: {
          value: (input, channelsDecoded, samplesDecoded, sampleRate) => {
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
          },
        },

        /*
         ******************
         * Compression Code
         ******************
         */

        inflateDynEncodeString: {
          value: (source, dest) => {
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

            return WASMAudioDecoderCommon.inflate(
              output.subarray(0, byteIndex),
              dest
            );
          },
        },

        inflate: {
          value: (source, dest) => {
            const TINF_OK = 0;
            const TINF_DATA_ERROR = -3;

            const uint8Array = Uint8Array;
            const uint16Array = Uint16Array;

            function Tree() {
              this.t = new uint16Array(16); /* table of code length counts */
              this.trans = new uint16Array(
                288
              ); /* code -> symbol translation table */
            }

            function Data(source, dest) {
              this.s = source;
              this.i = 0;
              this.t = 0;
              this.bitcount = 0;

              this.dest = dest;
              this.destLen = 0;

              this.ltree = new Tree(); /* dynamic length/symbol tree */
              this.dtree = new Tree(); /* dynamic distance tree */
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
                    d.destLen -
                    tinf_read_bits(d, dist_bits[dist], dist_base[dist]);

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
              if (typeof d.dest.slice === "function")
                return d.dest.slice(0, d.destLen);
              else return d.dest.subarray(0, d.destLen);
            }

            return d.dest;
          },
        },
      });
    }

    Object.defineProperty(this, "wasm", {
      enumerable: true,
      get: () => this._wasm,
    });

    this.getOutputChannels = (outputData, channelsDecoded, samplesDecoded) => {
      const output = [];

      for (let i = 0; i < channelsDecoded; i++)
        output.push(
          outputData.slice(
            i * samplesDecoded,
            i * samplesDecoded + samplesDecoded
          )
        );

      return output;
    };

    this.allocateTypedArray = (len, TypedArray) => {
      const ptr = this._wasm._malloc(TypedArray.BYTES_PER_ELEMENT * len);
      this._pointers.add(ptr);

      return {
        ptr: ptr,
        len: len,
        buf: new TypedArray(this._wasm.HEAP, ptr, len),
      };
    };

    this.free = () => {
      for (let i = 0; i < this._pointers.length; i++)
        this._wasm._free(this._pointers[i]);
      this._pointers.clear();
    };

    this._wasm = new caller._EmscriptenWASM(WASMAudioDecoderCommon);
    this._pointers = new Set();

    return this._wasm.ready.then(() => {
      caller._input = this.allocateTypedArray(caller._inputSize, Uint8Array);

      // output buffer
      caller._output = this.allocateTypedArray(
        caller._outputChannels * caller._outputChannelSize,
        Float32Array
      );

      return this;
    });
  }

  class WASMAudioDecoderWorker extends Worker__default["default"] {
    constructor(options, Decoder, EmscriptenWASM) {
      const webworkerSourceCode =
        "'use strict';" +
        // dependencies need to be manually resolved when stringifying this function
        `(${((_options, _Decoder, _WASMAudioDecoderCommon, _EmscriptenWASM) => {
        // We're in a Web Worker
        Object.defineProperties(_Decoder, {
          WASMAudioDecoderCommon: { value: _WASMAudioDecoderCommon },
          EmscriptenWASM: { value: _EmscriptenWASM },
          isWebWorker: { value: true },
        });

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
      )}, ${Decoder.toString()}, ${WASMAudioDecoderCommon.toString()}, ${EmscriptenWASM.toString()})`;

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

  function EmscriptenWASM(WASMAudioDecoderCommon) {

  function out(text) {
   console.log(text);
  }

  function err(text) {
   console.error(text);
  }

  function ready() {}

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

  if (!EmscriptenWASM.compiled) Object.defineProperty(EmscriptenWASM, "compiled", {value: WebAssembly.compile(WASMAudioDecoderCommon.inflateDynEncodeString("dynEncode00c8|Ñ`%=}¯CNC³¦#N#buZµ;×þòZõYÍôezôËÌ£Ôe_þ=KqzÚz¢±=-ìãí¹ß=rúàæ'oô/æåGçÚILif[4°ðIì¬ýÕîiãÛTÇ=bÃ¤í(1¡=}C¦3·¾¢3¢s§D3ä=MÄ_9>7§@§yFZ¸â¹þ±I[ÿ¨Y[D¿º÷ê£lêÙY*:Zÿ¦CWz î]æYÇ²*ÅdxbÀa ß ·¦còr=HyC&zR¹èëù!¾ðñª¿Ü=$S'åRÁE·3µ¿=}Þºã¾ÃBÂÅ²ÀÕj¼(D?ä[|!W³GG@fxô¶%fìE9¢P[l]l¹RÀt=@q9í«ìµUZ¦ü3Up^v«¦tÖïsªðU[¦ÛÕ=tG/r=K=ìHÙmÚòü®ÿUÿUªpqß%µQ«q,ò±1ÈÀ*¶#gb}»²¹ÜÇ.üÞW=M¹@<;D=L7U¦â7TÖ¹cð¨=@òª®M¹Âÿ¤Â7¢EÃfÇ¸C¹5?Å®-wE¥³'9«õ_ÁV§ÂW£FC*·¬qÀÀRÃ«Ë¹%¹·Û§Û¿Áq¥¹Zl`î#[u!|îõw&?A-3å÷·WcQR@ægßÝÃ¢ñ¾-ÞuWvó=Mf>ðòSZíÂ!=}ý!kJÇ¼=}¦Üu4²C+zòSk^kñò]úR4LjÃ*Úò:eFþT­]UeØæÝÕ·ö¡RôöÎR qú÷ªóÐUKµ|$3´ðS°=b=b¶ý§$´ã¬=}ìq|m®Wì½ñ£çu´«VE?-Q/F¬]RpX+Ú3vZ!<ÙWåaìkamâW¯=Hìl÷RêJcG§c¿ÕÊÛ@¦=K{òkïµ§^ÅAÇ°¨¥!ÂKÏ¢KÜ 3<rÄ7Gÿ®[þ{Kµ<x,á¥8¸Iª¬@/&o¶ªq[¹]¬°ÌþÜÀ[¹S?Òü=}Ò«'|·Óå¯³ÂtÃ³mâÁìL,Ï¢EÑv8÷h¨Í<GAÉ]vÊz|åsX¶2¶ªËqjôûdèn¥âYfI´µùÞù¥]¥­¡{=@³=êõ¶Ô=Mqà-zX¸¡ÆÝ=¦âUY=Iab!»Ä#!}°¡E<ªI=bÔVb=MósVs!b¼Ý­0¹F%cá áãáRf*³=@»m§ÆÂw3ÜÓ=Mtð^%5d´mµÈÛ¦~®e*HéNV=}:XÉ*2ó[Á*OÖ=beL¿Ùæ&«ÑR¶6×£.á¢d_,]tW=M¼7xÔ·ï(ñu$DÅº.>¸Ì]Ë©4HZzI³WSÞÖ¬uDáù­Ï,¾ãÄ³ÏºéßsQDÁÌ²!+4TãÉ´40ZJÂï»Ý!'êE-J&ô^¥j4±Uïî0@mÈ¨?¬Å¡=H~À}1a}4=HßÝ>¢û`õí.ø#6MXJ÷:Yo#¸&¸Ö]}p/*J²p&-14×¸÷÷oÀ¹0+¸=Iòä^V6 6zÎªásõTá°çyEøÀ0KüÜhr^ü±«îèwÞý]uè²=@óFòF`t¶fÊ$¡ØÞ &-Þ½Ü¡ &Û&Ä{=Mmq.Þ)73Õ!+=bøâÅ²E.Â1å=@=HÓ3L/=MúLüf%d,!½°°N×x4}'jºûWtÚ¬çh£òlX¶=L~`õe½!¿/?Ö5×¹íq>H¦0!×0Ý$§Dä¿ ^üZD½µùpþ¢#îù4ÇUAz°ÜW ëÊ~.UjªD×Èó2ÿ²K¸=bY¦fí+ã]ÿsÜ½¥=H}C^¶B>û&ï3SÝ~Oi1þ`2zwúfo¢ª|£lHôò²«ÂvÞ[£2E£=Lbyïì´²éÃYþ{ Ãå#`.ûN¡ ðdWô}Uaâú³±cí=b.xÊsæ-mþ ÌqõëîSu©±æ~Õ£NS{{°Õeóò7îzCÀæXl¯ *dkvßQ*+*SRõ=L4:ao=M-ÿ§OæsÈ=HHÀE#D/PÀ[AsÜ¿EÆ`+k|Æ°¥Ïà¯.» ,ÑcÁ¹Êùyk?v}>]Ý=}üwx^m«5Yù.?ÓÎeñ[ø-bÝï!GÉ¯y+,. ö/&y¤ägº«Yÿ=JQø-ò[r=}:J]¯i=L!b`fX&)¦_aÒ|=Hj¦=LÝ¿=U¼·ÙøÛÓºß½sOÇµí.$Àì×®ýuz<32Çù· vI&Bæ(rSî£1lü'Í6U(6»]ýBF&±w-yæþ·¼ô¯%ÊÿsD=bÍÒÏµ0|]7ÔX-Ê=ªK<sC¸I³§¡wÙëºv.&Ëõ½^=LÀoÏn®kf§B(dí¥ª>Ô@CÔov·WR7Ñ)=}BY6·W°>:A=@ê<Î=LÐ0]Üééíaþ9=Hsu¯ñùË¾ªÆÌ#=LèVúd½p8i(Øa®i¸7-^@--eÒÚ(ÍI=JcWý`ÜÝÙPWg=JèâeözX8³m=H~UAcÛ>gKÅkÃ&¢i!VYºÍ'VFµ^û3B&­ÃÍñ=MÔ>¯ÛÍÕ½ ó%¨³üBYÉ6oI.4öÅ=}â] ^¶JËM =MÑU-±%oZ?åØ=IvTâÄOº¶4'yé·ý*ù-lzª¾3=KòÃÉRLáÊ=6/ÃA±øc¾?úNimEüiLÛªµØµ­½¢>õðÒRªw¿¬lþ¡cñVµZÜÁ^×VÎ¶MR-{xaÐRqUæp,ûºÜ²iúbRÃ]KÏhüRÒ6ò ?çüYÚìN2ã3È2í=}dT=@¹IWi?Ì÷¨5aùýâ¹)ÌÒ=I!ÕZ=KNÿ(KÙ~!ìÖü!Q­ôHÙý²$U&.k_´mÍ!-wø¸U¿®]=Ho2LÐjâ7,¤=MÑ!¥Â#ÐajW6ÌZ£±µÙ7 ÞXôõ±×è=M¼¿;2¤5#=L¢ÏéaLÉ=LÎRÀpí&æBÄ_ÛB¥à¨u®ÓÛ(+Zêñ£ýOð|c=I±=I¨ó*=@ÖÞ4%H<BÕøÓâj¾mÏ×¬iÏh8Lýwòâ1=ú×ÔTbK w ò£¤Ù=JA*=IK ýuÒBÌÃy³Âæ#9z´9ëF©ò=@·èÉ}É÷~Û¯À-~w§7=bÄ]½õi¥å¢ÂvªùS 1ÌÝBYªÏHúk²0¼sry«G»gÛðäkå=H¿~ÃKÇtPbsíBì=MBíY1Y<O3ËÚÚiðp=@õ÷âÒÿ&@Y¶}B9¯#Ö75§{öV{}óf^=JÜ$¹¤~Åé=Lïú©!eLóÄyçõG¼q£e47ó7sjÑ°%=Lòdß]ãçåÛx~îIp>4ãß¨Lk­×=Iæ*,ìÚ«-dÓùkî=LMç.¸ëÄâçd£æ Æ¿½÷ÆÄ£>Ç«¯Ç¶¢+;OME¸ï7Äee#Ö7Ã×Æ½ÿ¤¸/RP®®¤D1äOz¼ëv~G·oïÆy£¨(º·¹õ;ÜùÂj²§´N¢:@K=J¶5A¥¿TÄ`¢gûÀeæY=Jñ¹d=J»ÞÝVíuòÌ[à=KÖùLa)Ìiâa.7áüL©Jv?æêì;Rüåè}äèy_4hå8Ï5þUD=KdÒ¢Í0 ÒÔkY4?K:*lt´u7õÕõÔxÝbÚ¾~äþCþîaeù§þîëÆ~6ëÔþC£xù¡¨7ß7ö¾ã[Æ~A+zaf5åfI&`Ôý%@îD³«=J»N<b©!=M{p$¡Íþ#=IA=@L/Nl¡ê|g¦(q1-õpm4åæ1JÆ+êTü©.îC{°)J¹ð>ú:'Ç¿Æ3ÒE!Ü5$abÂÊkàû¦=b,{hÀsÏÆÃÆRY­çñzÀ¾æ{ñ}5Â5Çl¥=@&0¤k3O{$3%ÜÖéW}NÐ·D.]ÃÑx¼uK7}Zª+¶²òÇtzÄ{ºkWDÁ£ÆÅJEÛ'#<dÐ]=L¼¹hr<þ³T¿·¢ =M=MÃß =bã`Ë8p©Y/¹Í1eÒ£×¸Bå2:xÕtpÁëúîÃäÈÕ¢ÇÌoûyØo²C¸·gT7ÿ§5ô[¶A!Ê©»Q[s|õA<m5oì-Twîi­IÿPÒ=@h¸N³Â©o@f~ä äj´±°¢A¶AJ5>æk4?Û²¿¼ô©<Ï[eõ~³Àa»þ¯àg!Ïn<ÄÑ?ð¾ÉÖ°&þtïC¾øô®®Ã*M¢®²jÙjH±´4pÛ2 =oîÀ±:Ã:@2üe?$mòì5I]<Ç5=bM9¹U]*ª=Ì?§4×ßÖâû=bãB¹¥Öÿ¯ªàRXÚNø¯!52ØÔÑT°©¡%&oû=Lê=bô@yL}E3¥éÞº1@êíKbuÜET}å:>Ûîá#çuz{0j:oö¨ç¡=òP£}.3Ö0+j=}<òóIê=@ Î¾VRd]Ø ÐHÄÝòrä4Ó¤Ó Ñ§=LªkñîpK#×³îw=I'<Ópbý¥êéÃãÃ¸r,guý=@Ö=M ÷Éseÿ=bóT !êPJõBP2=b~vØ¥_2}Qz¹Ñ©=}z½ÑB,³þåRkf´àH@ÈaÜ!=HjÐ5 ó5=J±{~{çÊêWÝe=J«4=Ièg1;=@,ò1Ùõj¼Ú£µh#_ Fîö«íÑ*Ô©Ø³N=K¶Hbð?Â+ÒxXÖ=K'í£>Å©ÿÅ<ïiãÆ¸;óöF¹Õ'¢*<KìÎpS5GÁJCÖÅ¡·ìwÃ´%ÇÉÍ²¥¾ß·=@¾y´ïÄ¢çF¿kÇ¬­BW?À^®~eg@:»ÛQ=Km+!}j=b+ùR%=Hr=Jö?Øåà*¢R¨=L¾sIó*2ß6ÙN¿ù=bÞª/I=ôÏAÖHàCÖ°¨PÊànu÷$'wh_±ÈM8è¯¼u({=}k6Ðqt¤Á¨°û8±·r©vWågêßeæÉ ¿OiZ.d>þ+n×3ãæ2£ª|}ÙS.Ç^þ*EÓuÐ<µ{S¶é_>xú´à)Ì=}>§¶5cÄ4s¹ä#%!/Ö=}ÅUþ­Í=}MÕ>s_3·Eov¶õt3ò§[%=@+I%cûoKMc;*cw0·¦óC·|§ë0KSx=Mwôgb=by{PvØÃ¸¬s?ò°=L Ïóv ¡OZ¥NÒGPÑ¾5ý÷U+ _³kÝÉDcoØk=I¶=LàOâ6Kæµc_ÌýãÐG=}Lâ6Ö£ÔA;ù=}§åóL45é0:C{ÁF=L²*Zkù°%TCª¦=}=L­Å'Ú§î> Uì×ëÞWUÞF{¹íM7ÿZD¾¾G¸åyjÒôN{ôÿ¯E¾µ>ýçºCZVhbÒ©ì7Þ±6Ûü U[yÙìÕ>¨H6ÝyÔC_5Q)ÞTèè(ù½2§C>µ2Fh÷ÐªüSî#Ù4¹ d÷bsc4Þ¸ÑFÒWS»¦±ÑZ¥=Jÿè¬ªyö7¯}Ø¿ÞZ×²9&¦ÿe¿4ªà(i!VèF5zò'ýe×5ª(ióØr¹ Zgeg{QkÍç£¢zMTW'D'yQ=I|BFvæ]Ät±D­î¹¾Q%,G~<âa%+¯ÇÆþÞ¯SþaLkúøuöüþ9=HrË4Ê^6ª=HjÈ,HÚ5Z=bÈê¡Z1½7(ÛcPÔ//ô¨tøè(A>¶<ù=H¦Ï¬ÎÿíEiCò2¢Æºdªhdä¸_»SñGA6¹¬·¡²ªÑGáñ¦¿=}C1Ý×ÁrªOæ}NÑ{àfCõ7&c1ª¡¡~*`{|Áz¡DµüéaªæzDþ('_eA~¡ÄäK]ÙY®³í'`ñæ¼H¾4F©¼<F<$6ËW®<©ãìãpA±üKüX½,¸çX¼:(=@e®!ý.úÒP6®Á<ÆJô%c¤úó`îaE¤ÏãBÞûz©ôgOÝd7n¨¿óªêÐâÎMíûÄWØÎûüeu`aO.`EÐBCn{]D×¬A~Õf©GLý)o{î9û©T±4X·&Æ2Xû;ãõá&ò7rô2ûÐÑ&-qAPÐôæÞîö®¡¡¢á=LÎ.þwè*ø/NñÏ´{AEî'z-¡Îí´Ï{AÇÔT{T1}R>ÕÚ`f)F2H!c´nõ£Dt¸ÂG'0 Ò3Ì¼xêA!`¡¡Íû!]ÍfuK²ô2ý,ýÕ±fÿ²)Üã¡:¦â%Ý§=I%£w¹é­÷±r@QÊÙãªÕÞîvØÇõ.âÔ--r½xð/=b=bÌ3[ÑÜ#&=IðfùÒ6!øÝ9ùíØ>yM½[Û¹Ôeg&üà-Ñn*ÒÛcv¯ËBÍ¼]Ð¶{î*ÛÙL5zøñøt(òY¶)TvZ×p¬-¹Ùnò|=}ó=MBêþCcõR=@=Jø´Nd®pZ=}6xw3ÀÐe®¤ ñ*mà{áµí7}øÙ³zS=¶¤´Á!s¿p¬5-ÀØgVÊèxíòíL7»J!=Kí~1êÌª£ØÕâá£$=Lh·Rs_%|¡Ç;?fÃ[fE}É1ÿÊ©ÙìTgÂø,òZq=I|Dz>m9õÙGM á0! |ë×Tµ3Ô°¸=MòSªüW-ØÉ8bÓþ| Ïz8Wà>'=IòºR@olhP££Qå­ôgÚ´¨µÚkµ=M<ÐWunG¿=§!¬äg°¦WybUÁ?/1Lô*PelV°°âÅIúÇæo·0ï3Ûq­­·Ý¾ë8©ø°|Û¢+_H(IPA÷Íþ¶©[Ëµ>âÉbÕ=LúHhÙìa=býä3ÿbø{4ä+Ä¹k[ïG*¬;«zÇ»]/Å_wc×¿ÂwQâóÚïÁ&o»°z£Æ°ã/Õ=JJñØ<úC¡Ï¦ÇÆo//.÷Ã­¿G¼ ôÐÕØØ¿ÆW6G`1¯ë<iûë:B¾)Q0Ì`]Aú´oÉ ²)vµJsÜ7÷Æ1zÛ&¶øïFÕÇD¸'T=bõºWÇûIjË]ðD=¡aÌÎú5øÏðÁ{GäW1;-²Êá9÷*¨Ë-´Õµl¹{ÁÈÁ~6eYÞtãZ¹Ò=bC]íáCLurëðÒÉ[ËÉ>W&ÂtlE{âýË`Ç?¡°×&>±´-ÿÇÞH=}!½oOK¶zW¤Â`æ·B¯!#nÉ('ÈâlìÕ1iîågÎ..=Iõ=L<h2¹©GïoÅz_4¢{M~$¾¯Ágçe-ÛxÉ¢àÜ <^Dxñý¼wat?.nQ(S(lRT/mæÿ=KË`ßðn«EÝîH;'=MËö£ÃD-%~ÁÅc&øõmla'OÏayV²Å²E8bý¼Ãî[!<Û0pwòI! ¯°HàÖb=L¿Ü=M«C$Ü!Sþ?1-_Ø-DvËH9OUomÄÌMh]>Ã.Ìã~nnî±þà-»Ìò8WäÃíÕrbþ;¡ÒM£Övy^´Æ[à¡Æ´bW·Í{_ÕÄÇ§ÄØCgÄ¶îæw66ÄÕÅ=bub$RõXØn=J.oq=I»_ç.=J÷§õ^MB`øÌ«åò¿!öi»ªãº=Löy»¬í¦Â1êfiÜédÇD¯«árêBh,Ãï÷Hq{¡Þ=L¦Uô^ç¹Ò5I¡=}>âµ ë{>zElÓbâ=J8¥=@x»¿#¥p3f[ ÿò§`dÀ=b´R¢Vå1ÈQÅ©yDu{¢ý`Û=}/Q!Ëg4vªiw Ê.Eï»Y¬©CMKÏ??%©´ª=IÐ»m¹ÆPòà/·=JÔ^ØPrû·áÎÆ½jw°Ãè«S=@gFÃ¦NmXÓ¶P¸éÒ=Kà:{6ûüÞß¨`fÐÁá>ìË À¬=M:2=b+xfrßøg~P¤o1á´¢#îæ¶±í[^A=bq86~|±Î7tJ¢QRË'~=bµ|TÒþ]ù2CÄù)±^±PäéqV²RúEcUo®DOÁÓÐø­8ñPRï]{ß Î±m^ü!ïDÛ«£WLØ`pàOÎ8|G û£Ø2ØM(Öuh¤_(êÑáëÔKCËIz@ß¿ùS¿4(·²äú·s£§îøÅÐÙhMâùy$îóJcB±R#¦á3Rà×Õç1.U[C4ûk{èlÖØã]Ê´áõÃüõ2ö¾ÁCXÊ«¾1_îmspÀ90=HG°R¹Ìký¿_ìt{¸3¶³<í£!WG°¦ lõ2£;+­Ü9ÉÃ0 +Á6=@*ôGK+ÄuA¬$Hò$?>'¹~$@=L¡Ó/j²4=MLË×a,ÊfWû ¨Ðµ>K{=KOÜ¢!¥6½3º=KJJ:æ¢)=J³Êý7'×¹ôVD«¹{Ê¯EÆýÜ§ãªYâLñ¿6×ß¤o·Øÿ³9;=Hº^©Ëò¤=Iy224­K~VO?÷u4³orqéøî÷ë['×F´wëPmùæAgnæÛ·Aè_ßßwællîC¨ùläÒlÐ»=K6=I¹wÙ;¼ç/çaY3ÝyWÉY¾yl=I>äóVÄ°ûRXÃæúê1=@VÝ×Eûâ.ø«j#ME8=LïÑU-ÝYÉ¬;Ý`ÜÕRTÑW©êïw¬9HEíWGóqUÝS¦ÀóQÀw1âk¸Cç[vn =K=KYV;»uyÖ×ÁÐê ¥|n¯7t Ùá;=I«kj/+ºuO.ÉÔNûCTõæ^wY¬¨_}ÎýJ§9<H¤{^0¯E¹¥Ú#À¤÷[3íq0ÿÔ]ò]¤ØOKÎ÷Í,Qµì}z8_`5ØùH½^¾5{9r£=bÿc Æ¾<ú0Æ¥=Hz,'Ú¾Eml(0I ÆCIg÷§~Ç{g=}ÇþÊæ_æ54vDÃ$Cá¥#fõ=}ZËhÿz4£3'{º×}&Â©ßª&¾t=b^=J_§<Ò%½||Z;ÏÞLÆoÐyhD¾=H!ý.Á¶¹P=JÏXÕx¥×æ=LÇÉIWSÝJS4ÿ2=@çð6=MBðf¿â§ö­=}=«ü® #`j=L}=@føb¶N5õ=KñêSÌÒ=J¬Ã¶b²{NU6K°=IõP¥Lª½?Ýr[=H>2÷Û*o~-2®¶tG´Êºr!Ýðµ)ÉûpÊ|ÿqs+¡ú ö#Ï7|xb=M£SÒÆùí±ñâO$¦5éÿíCË]~<ÕbNn§õPaw]=L'n®£öd÷'=@2§7Ð+Ä¦ÀìEëm3#ù>Êyÿî#þ§È=JT=H<dz¨«#Ö.q«|ü'Ï/o-!·¶7÷ÓJeE!=K$ªþ?¢^àõÞÖ5K3Ä=@¸í¡¨6bzYX{?Tò¡j£ý±âôX=@èÿ;¾®3!nÌz]ï~&ü#~A³©<°®}ï~ÉE=LÙZ2FåíÁñM§d}èÍT=LZòÿP~.o;Q@ýDö^a-=Ltë=J¡¡p6Ô÷é#õàÌÉMümr&¡ú¨-EqPð=LÌ«=HDçk°>¾¯(>â?è² ÎË¢á èÞµêå2|vpÕp¼N<áDe¼LÔå,yBÎ-Ì6ØMtí®q¨ýV?m95R5([uxR4É{p_ôsK}ÖÎ©,»ýÐyÒÔ51^)zûvq#vPª½.¬eDó|F|?#Pzy4ÒüÌª <=b-®êÁ·1õo¯HÚí¯,­jÍ.­ðÃ D¬xHiùo¬vVÊ»=b²Æ=Jñz¥;âæÜ 4ÜRÛ·W5ä Z+åÌ©+X©QOCíý¨%ÞîÀ~=by)¾ X£pLNH>ý­qéýËÖª'='½sþs¸@'~´%=LÿO.]e=MJ¥&°A:½áÞNJ<b=þ4¹ÕTØÊðëàþ]*äÇÛ£A|÷cñÒz`%F¬Â÷Yù1ME@`É1S}hYþETnÁ4&|Oà`ÃR=K§Ê{4;stoú7õ cxY|?û~)¬³5nÄtð9|=Mä=}¢1²A6}Úò`aa]Ý#»Î¡ìz6vêëÝý×Dõ=HqÅkûÔ$k?ykÒì_¡iæ-¾ÐlCeàCåü=LÚÙ:=}CåZTV*y)ùr+mÞ`å]³%N~fa¿ª>ªLá«mn{ízDtËöNPû.'´KJn¢=J=Hú~Z9(ÎÖÛMÒ².4]3,î?8is{ ¡4¨Oyk£öÞÑáÒÞqÙ6á±a|/$ü»ø¨iØh+ÈÉR=Ä°ÈÊó/È=@å¨]ûÉÉ¨ÄÑ¨.=<ÈvÞà=}Ö=JÑ`MÈwKâm3G?â=KWá-üm1Í(N8ã=bËåeahq~V]Tá|Î$![²R65.21=IÍ¹ýçOË´_mhÿlíõBHÑ/;êk=}¾¦Õ¯-pÚÁA¬#ÿ,²æp)OÈmH§Úÿýü±Ãèõ¼Ê Þ~âkè¬¾)ë²Ó|=ÅDÜë´`uóºK>s}z¡=LFÞ+S]¬ÏÉÊb_Û3ÜJ,ÒSòQý*Øt,4Ý+M¸V½^±~ÂøSG=e£ú]ÐM¹t7Ïg¢qqA0ÈQßiðùªDäè£#ïb0Ï=KniO÷üº¿æaø(ªsïÄXV·bì>©ÛÝþú ×=Þ=@þï=M²hVÏÇU²=H¼)åiZgIRew­áè~ Èvo#Iêò¢R·aaìÛ^ Ð|üü,³¬Ð¥vR$jµZ* löòsMâîóì;ÆUbzø£{1RÄû´=bÜN&®ÅãBÕùð£-=I¢¿²éÀpR!HÐbégF:ª)J6=M~aª¾bD¥Ò=K¿IàZ©Ð§¼%¯#¾ìõ!èlú+Ôq± døMSøÛrâ?=}^O=}73~ã=M%esÔÔJGoSõ,5¦0Åaåø4óEê/ÑñÌfh7FlÈh²­=IÈr½v´Zó-t¢úèÖ=}*H'ÜqÌàKQMô¹Âáèª=MÙø[>ØØÕÀg& Î÷ôëKÔø@å¹þ!/lª1KëmtÎgMxdß£o<8´;eEÍÿ»IfQîD=KÄ=Hn^+w´P°i ¦«8m½]aTvÀkBr-Bñé²þWÚ¥ÎäÑIx1ELpcìÉ'ën~Ùj&©n×|·ê=L¥©¢À¢,RÛé2c=M1ç«kê­÷µ0©)ñ&ßè3ÉR^ÿ$'Þ3tØ}4T=M%4µÔ=%xp³%Pm´=Muû`Lp'ó-sÔZéÒc9Ïú·cÁÙ4)¥XNZn´¾NÓ¸=LÇ/[ÿWí`cÆ=I(LörØ·ÇÂ=I=@ç=YUe$ n@øl=Jxne­Kîô±@¼ñæÂèêS÷XÃãéu*u=BibªL=M`Í«ÌH~XnZáMÒ½ìiß=M½=MÓNûòòhÀÏ«=}*Z27Ó²ÄpJÂªÒÓ*e«3¯­ì=`_`opm`eÙ=@ÊLàá5zHóuÅ-Ly=}(X==@5P¯pÑ$òiA=IÂpaé/%ÄýâÉæKW)®.ô¹ñôW=MK`ØQ×ià.ÓìTÅ£òî=JÁÜL9rºñÛôêæ§¨Ï¦×ülæîw·m=@?/9¶¾)£¹T<*¾)_ºKq¡0P?EÂ=LEàöp×³³K¶rwd:ß9Xòfü Âa=HÆ­è82Å:[kKVQîÄU§zÁ[`ñr=KÇÊ=bÖ÷j1=Mf7äÝP¸-7øáUHßûhÁóOÎO_8º=KØç®<>Mö$]kò[Ý!=} ±u¹¥ÖÕBhdiìëîõã9³Ït25yùÒ¢²Ñ/Q³öüú$ThAÔoH{÷O=I/ò)0Ñí¤Ú§¥þfh÷WÙF=JYWM.d§²ýåG=b¶^j2ë<U`8»MjKä1]ûóë³g?=K«ì»=IÏw[=H3%{AèÖY(ørtAI îÏËËÊe°ZPqòsËëóË=M==@%I±l3xmAP=b2c=@wß§ª+³$¨)`XS'UP9ÔeI¯¦=JònªþJ¬Ið¹LÚÔ¸Ì8Yò%·@Û=}Ã®§sî8¼põòæõÍmÿûR5%fkÈÝKR)?:ëÒI0ü¯Sä§øwÀFÀIÉsö¬+4EµP=)ÈªbBA¦ýÃÕ±=HßãZëz¡E6.îL¤q!p 6ozEÚ8kßóð6ÏlWZö¡Á¼=MßzøûÈôøñ½´gYÇeH2KOµ¼äÕs5úÐXpDÞÙSõO=Kñ|ïÌ¨¥¢´ù7.Å-a ºðû,=@/ý=M¡È¤#<?ÇÐd~xó~z%OâX.å|ðþª0Y=b5=IîÔøüÕÀÉÑ0|q´Óbù®wÅ+5dtmæ±B ÂÀ=@*ÐVK¦Ù®îÏ¿ÑMnãÔ=Jå´G}¦a´GfnboÃÿQ@þ®=JH¨=HÞ=}!ÆìºþøaÄì.º»öa0^^þ=LÃ^¿6e©PîâÔgM¸Ù¤Áfê¼ù=bw¾;û¤f'øè÷çEÊahy`VG yKa4`è#÷uPBà»ÕÕ%ÒÃHê­û¿÷|=}jª¨/ëÃ2N®OH}:lÀâÓd}§=HýèùU±µÂYØ+àj=}Y4¤=K=Jù=Ly4:|î·ùfË½¾¬e]ãv?¶UO*»=Ky¬×=J_Vº>°ùÑ=L®U2%¬£«Â}nv&ë=IÒ.Aúõ0lL=Kúa$Àüùì©%P9=M<°å9y¤ãuï)ûo»vá8NöA=Jæ|=J,{#¡=K;Ò×'®g¢:ïvÖ;ë¸aìÎ¹¯=}£çB¶c=IÈæîõ.¦^ÏeWq3LML5¼à'RO,wË¯)9#Á·eW|&K$´ý%N+n~=KS%¹>=Km¯Â<å}(ÒÆEÛ>õujpÅx¹»(þÖøýê²xB=¨;ûçúék¯æ¾_=IÈE¡MÇH­)Í{äÇ¤Ï-C£«P=I5¨øÈy|xÅ8{¡ó 5à÷Bw4ÆZ¹ÙK½±wÖ?ËÍ#sÁ«öû!^Q²/Ú§yæMÍÖ+ó°bF(=MÆ©T=@â]Ô=LÅQÒü÷ðnV1²KBIã6¶=}=@;®Üo[=J¯Äk¸lø®4Íw%Ôa1àR=mèÜ£x¢xG×L4êTRddé3=b¤íõFmW@»­5Øueï¨©6úbÖ=K´$Éêäææe®ÑNcIÚ®ÇÒ=bPu,($.BÖì %î[ó+ø6ãQðãA_ÎÝðjTÙÊÀÇ¬çjåHíX'pñ¬=L¦=HIÆÙ»|`ÜØ0êVz¼T6 {õópÂg§>»oÇµ¨Í»Ø=bÆ»cÎÚ^ÞDZ=1_(prC=M×ãØ_LPÔ¶«-ÒB]]õl=IrVõí°F4hÏ-ÂlZ2ãZ²­ª¸:1Ú&ß¥Gq*·µìý(=J÷n­}]ð6ZÆÌ÷6PÈh3ÅØZÖ&ÉÝB=Lìë³á3ôEÔ[m/=H@ +!%ªÕhA`»aï=}«¨´uÓÙ]0F Iª=èò=IT RÚ=LíãºrS<Ñ%ZèòôjÚ`coS¨N>SJ=LímÿßõÜ]¼ÌÑeÕÖ=L$æª`s3&!µù§;Û³}Ù¬ó:Óí'yÄý^$Ó=}XÂ©q·ßN$²XiÀÔXôX«¤9¬Ø7Æ7=HvÒa,YYT¿!=bD©X­Üv'ÂÝ×ãùT<÷Z®*£85ôWàj$#¶q?'+ú¡#19æ0M{4é; 'Ô=MZ·¶0k<§ÔN|êéè;d=MâIÐÀ¶V$¤§Ô=I=`Þ`pUñYÇ=b>¾`ÿX<²^æúuRÿðòu_Á_K2ræs'V°ÏÏC-2|^E=LÒ¦¯]:+k=HhXºk÷d=H=K­,s¹W¿oWtÁÉÈµ¯ÂÈ3~|v)qøºúVKõ6.¶þäî¾Ò/Ë>:R´S'ZB&S)6â8Ði§ôRßbHja@©çÖE îuÌ>¹¯¿Ä<=K:?pQÖgwáêV²8²§F¯v¿¼iZSÄ+AçÉ7_ö~sJOo÷Ñá÷´ËEq:È¡ÜYþ§/)@a2É¼ÏÛ&õ¥ëO/ÊoÂ1R2~!rz¢öç¬sEUdt6É¹|Â=bÿàóÀæê£¥XìFrúËOÊovg²µ|§^QäÛÏRð~åû;y=JC¿%CÏ0¾p%¡¬õáp(s'õ;Î=HNû ãÞ(TÕsÅÆ%Osz:;í(OäåÊJñç§`º5FÀý#êÛÈ@:fÍ(DÎkP=I26gJ(û¸ýL=I#=@ù0;ú¥J#a÷Æ¶ïG[õ2.$°%cÜà+gg#yò!2i½ÝÝgÄÅCÇ=æ¡ßh=Ä_|ãPyäâP&ü*èÍ)¹2%áëå=KÙ#u¶=@òpÅZ;êô6õBHÞ0sX]×ñ2n7Òx=Iá|F8¿½­!ü$ïk¢rýÕ1}>×ÞVb9Ô¶ò-ªù³'3Q.¶¦2=MwD ø]=I­4ü·Ùþejä|Z;Bì]ïÖkMýÑNlnãû#µ'Ïø.Ö?V@ª´Ä(hùÓnl)çi£6­»=JÂäGö¨ò}{ºLxÈºw ¸Ü H ¿>íÐH~ÈiÐÉ5øhv=J²&Bþzÿsùíåü:=H¶ºàõÎwÓ°ABVQÍ[²)1ü2ä¦¤Y¥¯ôÕZ~1áÊØeJ=çåYNÉ¨ô6¡J,¥TIv¤_Õw¾ÉgÊæÈÿl=@8v¼SOÇ7cýeoX<=MíËµ²¦¾=M%ðÞúÚñx!¿EÏ'âÒÔ×~÷ìÅ°££V4NÿµNåW£ã`ìÀw³ý-{é½ð²·¹8ðNøÐz³Xn®ÍNniÙ¤-à&ÿfS¶Xj*%vq=Lï0g1=IÞJ8öÜ|8ÉSÂsû¯xßÊ+Màó²Go2ÇiTS·q¥$lð­Ù)¦_=Òn=Ç0wnÆ6Ü¬;ô°Y¡>¿Þc=b3<=J²÷Ømáqà/Bðíà=bvN*IFx±²©kt§â=MºÓ^/Dé@´k©ÖþØpÑS=b­É}7=KYâ½=Jå=J-±H¬QÕÏ=Kù¬ìH4î=LO´ájHÓòÇcIûkG>a¹0=Mä¨=H'+ZÛô|£Îºrø¯F½ß=M.2îêêëÊ7G3ØäE*åâÏÝvXKt£­fã¥ Ô«#¼FL/x;T0`>Zäe¡Ô¶ø=KÚÜÔ#¥¾±kýc=Jº£êá¹Þs¦oÝ³5Y=L=MV=H£tU>ÓÊ­ÃXlÝV@7}=@+=}UÜç°ßÛÃ=Lú?¯Qc©¾¡=b9Äõ¡MO-HFhýZ3Þyñe÷ºqÄ£[Ôì0eµÙÉx¢.~~«Ç0=J{ ½°<ª);,­0æú±¶ÜVÑF=@ÿ29<~ÂÀÙD1l¤UúùüD¥(¥°ÁNm1Ê!ókZ=b9óúüNB§ö©ñ®tÓD.yå_ñ3¨àÐ¤¾Óùg]Õ'¦§°K*Ø6î5ûÞ­XPù§Æ3ußc$Ð?[A¨¨çú£=M1òTÖ¡·8=J<òÁ²©´4å=}Bû¿¯&&rºz{Å»4QîÀîþqPVmÌ+Êr^V[ÉuÑ½¦êVC{ÎïGÒ¿µí©JèÕgè^[-êÖTRXVÄÜøò¶/áU×pG]÷ÇÅ¼ºµ¾¼ írC+ ôú¬äÚe%LîÛ)Tÿ-Pñ=H¹8)Ô»Ñ#î¨³Ñ¬&VÏâÇÐÊ®Ñw8O=L9Ù´âfµÚ&á_ßW#è)MXm;V÷?¾ïsÝuéDz$ BqAÄuiÇ:º¤òû®,!p=J|Qh7~ë¿qû|0¼©Ç¥wúF°ÿ¡·Àuè(1µó}¸{¡=Kß^3paÓ¿+YSç=L´ç®+æ¬ù§2¡D¸HïF|£3@öZeÝGÁ&;ùGËw«7õHüíu!ì*ú¸Xöº@Ùä_ººK©EûÏïíI&[ëäÎ4H1$W:=HX¥%)IUä@mnç¹¦=}+pHÿ¹öXUA_ÌìNôg!rpûd øìÝ9¢îÕÔT%Ñ0uÀDó7RÀß2Ma=@w¶,-0=KÜaJM}=IÚvþìI7:üD6C]ö¿ewäUª§·,r-jõÎÝOöµLg¥.ûöúáÃù0úð­UIÝ¤Ù=K6©`XÜß6·£DåÜ.L£|½hSwP$ØqöA®½Z33<¯âEcê=H=K{Ñjá8«Êùßbwª7¹Ç¥+¶eýæ¦¬ÓÐDiËÅÔÛ?÷u6wùªóÙÔ*'ÐúÛ}B|¾:bzà¦èÆ¾*m=bæ9³Z=}~èwÔu íGÍ¹=M%úáÀnP5¸òî'=ÁPþ` =KÑzÓ¸öícØLÔ`À~ÍIâ´wE8ÙG=}q.²lKîöSª*ù÷íJª¾êÍ75'h~{¥vþ õÌÿ'È6~¼MEâ<­Y%/¤¤e2p£=MÒÈñRÖ^r¾c¢ß°9{ËHÀÑ|àäVrú=bê* ÌW2ÙX³PaßæÄ2¤&¨ÝVRèÜÕsdÝ=}}2y¢#_»Ãûü²þ7å2Ð¦/Ëk¥$}ÿÏ/óWÿlö+çùr5p×áÛN4;¨=MAß¥=}OÕÎÂ¥°O`0/yîeRq=bÕæ¡ª·<}e|(4=Lmà/üp»[²¬yETsJ®Oço´2@i1¬¸1(Åb®0`×ý¦ñÞòï=bgà=>ôNå6D[%rÙ`sV´åàÝ91T2àß'óV.ëÿ8Î#bc)-h![æ¹o¶m¢zO9ÊSeÔ¸-E 1ÈR=}È³«ã`h¼0vbýu33ÝÆ@,³¦ å AAH¦ûÃR4Á¾7eë=b©³à*:iûtqC:Ùth9³~Sx=@ljÙ9%HDSÏ=HäF¼@/Dì³ùÅÐÓ=@XEN i÷èÊ=Kgà¡²Ï=b÷¿¹l3È_v±>ô´ø¥ÞÐI=I¡à=35zõTo­3úºzÓ<=}z4}äNZÝ'-¡b<MêíÓæ±»a}¥ïÂ=M¯o×ÿ«¨¹5t$£S¡Ó£ªÍb>§ÄªúiöDfÍ>ÉÒZq0´<)2Æ0G qß¤yº1eÎ=Jgø~=Hk?=H=}LXß6O5z&`©Us=}4ýîëcfÅ=Jñè÷ýPI=I[Ü­Ýë¡ïÏmiéØúü=@ÅúvraõÍ¥¬vë=I&~`¡mvÃJVÞÚ=KÕ«²Û¼ù{Ø~Ú=}/iÌ7£þ«ã7S£½/Õs7jÄus®góÐB ¾ÅÈÛ +=JG.'LN>§çÐ[nj¡|å÷=Hê0=}¥äZdbFpd¼,EÓz¥0ÿªÿ¢áµ|B|é®²4Lé#d;UI-æ1¡õþtWm*_³Ó¦ö/yþ r¼ã¼jmô(sUãÉÁ¦2@¦öÉêg_®cu6Ãëbó=}tÖ§7SVxâ©@Á*ú j½B|# (ß¥£ª½hGÂÊïÄ~v2^ÄjvÁ­´=@á(=I· ä#=bü£ÎÝPÝäkq×8uXØtwaÅB¼ß=KÆXïAÞ=bò©öÜ,j¸=KÎD§õ1áðqÌÇK¦@7¹$$þa§1v)»ÈÜ=»=MÒ­¢%=HíÝä-ãXÔ­ú÷Â-²%fHDàHTÌ¼£B]æ% `,óR)õ=Ic1!ó)1ó#qÅ@=bõÜ6ÞzG]õD|sM½sA§Á»»exºÕ(¡hÌs,F@=@DN9äÒ£}³þnj¹n}F1q:÷§ßUùªùnæ¯OSå´G=I=eÕD¹u>à]=bº=H¸éåý(]¤]Òâ³U´{Øa4Y'4ËP¾~°:¥ÁåsA9kE«±«åçvX¡S7á²Ð×æü(Y³SÌ/*Ö=b¤ýKáè}Ù©ÇøÊ=@~=@7c(ÂïËý³{WÆW`ìöëgåd¢0^&ÝîvÌ !;8æñ*¯H;õÏÂÇJ=KXÛcðVÊ(_=})êÈÝÉXQ§ùZi¿|=H¥!£áUlj'G}15?Ý6=@z4vyÕ»æ%9néµHÜÆÆ%çÁÅÚ5T÷~î²Ñ9±5Å¼,ø«æ/Ë:²=MÛW»c7õëL=JEºç:|)0nOÊ[ÉNWñ0ñ,j¢|¼=M-âÙQw ¼Ä=M_ëÎ_m¡+´;ø9j¥¡n,NðBù¤u;?ëöù¶=Hø·âÐ%û?ÊAD{XBtEÖ³dn©bNÝn){3âº¦×µ ÞµÜüÞ^Ë¡C¨ßÎ¡ýS¥ÚìJA^c;öqÎ{ÑmÞd®1¦M=H;bßJÇXKããuI5euÆòl=KxPçHQê®tÐº¡ðÎÇ$=J^Ù;ÄJZ@FI¥¶¯!×ÝsÉ¿SÉÔïòµ>¼Z-F6cWÍ{ã.®¯¼ Ü8¬KhõÁ>Ñõ1ÍoØø,u~=}Gxâs§ö'°äõ´Ì/Y¨¯»Ü·8G=b¥ñ´ix«nÜÒC=ÛÃqMåw@)Eç1=H¿2=H7t¯?äx@a¥-æ=KaiÎ9=IÉ-k8Ìþ'K/ð(VÊ=L§G§ºÚì%ïõâÂÌ­®cÏâDÄTQß¼áÈ=b³4ÈüÕÒ=b.AòOnÉ[zÂ,©Ò.iÊ$MJæ³öõ¾ÃøÇ©XH¿Aýo8ëÌª¶$»X]n5(/<5~sån[%.Ô±0ÌsÛFæï^:=±4L®Í=@zûu::Îb}SdÆmìâcp·Üö¦·öàiN#nØIE?¾Û[w²¥ØÐ¹«¤õ°êåÃ ¸N6Ø¡jó,î}.!z=} ,*19¾=@å¦-²Ãé9§2c¶Á«ÎècO©àhë=Ho$=KµÁºE+¬à0R5vCµ¡àd¿ézç³ìC{+å«q»!=@UÀöK=Hû®áf×RÙ>o/ö=MQN¹%t¼y£M*«ñpÙ}¨©=JÜ3(jðJô)µp°¶×;D§´=JvT6ò¯QÀÂdIäå|Ãò¢ª =}M¡Mvq¶9F6l«o$ø+ÿ¨Vàj³fa§©2/N3rÀøæv©æö£õ=II=IKª´zôuK=I-t»((~;¢YpÙ^]Üm->«ºX÷µÇê}4oc}BÐñtâsýäö÷WÄ±#ã=P;'9/êëT=IÑ¹k'ÄÓOò/©WÓ½ àwµsÖ¥íAßïªÇR ÑÅÆ¶´=@ìbqiòRbcQ,à¡yS]~ÿGe=J=H°hG®ß=M2ðï}2=b/,XA_/]ïÈZ]½=Ihb¿1þ½!=Mn0;56d¸òiþ3»=IÈM{Öz´jsÌÅÙ£=@Âz>ØÙÜµ=}QBË£åQZüI*Þ6=b¬ÛÛ¦Å{Þd=IÔkmìùj/éN±xýÊKÄ ðU@ÎsëWX@´a/ÃYhÐ9í=bùëhÙ=KèÈb@àe©t=I=KùNúR[(åþÕ³;é²ÞeÏÇ=JDí¦fÕê{zR1­ï£3%Ù]Âð#S3|B|VB/³î¢3g=}¡i&Âöbn®e½òÃ´e66<§%wØÁs­;]³3ËXÔÅn|ÖT´²éñ¥vÞg=IA­,êBllI9-/%o[3µ²Þä<ï¸¢4U¢xï@>L~¦Ðú.WÎÖ>CÅ{vWóié1H=IJOÕ¦ªR=H«<©r¹^jÏ¯!×=@ùë£%åwB}5ÿ?;Ar8ó¿AÆ=J/=wLf³*b}÷3æÖ®s7ü.+×ðµ¾ß³ýÍSz!Ãòø-¡®;=Lùg~ENAÞ§µü©¢4YD½%¡²^¥qÏµZ¥^jadëb^ácÓ¡2÷<$[TGýúÆR¾&¥X1µÊcó§×W7¡ÑýDäæµf¾uå³¨Ë¶ýAþvÃü½³5¤*öÿº®v*±£o¥ÿ²Q¶ ©:=I§OCÛñ|i¥;¦Å­Í#Å®Àä£Ý é¢»uÄkT!u^ßÓ´×fz#ÕªRæ<Â-GOÌ=@h½$¤QCÐZõÝ?=JÛ ¥jÝ ²Oï%ÜõóôkMÅj°D½=}AËÜ[DÉÜGB£ö/=Kð«28}@o9,ÖÑÊ¥Y¡]OHµx5¶â~[gòOu:ÿ³=}û?øêù³,|¡­iÎÜrìxjQ¾«I>#¿:õÏDÔ)¬·ß%¿Tx4¯:¹:ÌnfÝ¦òp³Bs|¬Fò¥Røt¹ÏÒ_à¿À1O]ñÁëãr×óÿZîâq=ÎßàØP±=Mþze²Íù=bÐz=}Úè §Íqe Å=LÌûx¥?fv[ÅQ³§tÙylk#­ =@=}~SÍªæs8Ñu=L=K{©,z£µ=L¹·EªØ2åôykÓó CåüÈï}=Mk×.Uß=M¬ã=LýwéKÃ=@¡ýRq=@d÷Ú/Byý0$Nâ| ÙjÔõxVîEyª>|t¢,6J%=¹6ú=K/~ÐÝ(lª=}zÜïWSñâÙÕ½ª©cþR¯3ßq;?ù¿É^1Ð<UªÑ=IOÜ$¥¥=Hxº¾y%M=I[³VÛ=KiLé­¿?ÿÊ¸è?&õ3B=Lk`=gA±Vý¸píM¯úÜ×AvSöåÌ£Ö|rº·zã&ÛÐP9Âä­·n0;N<esTåÊá5÷±æ|gÿ¡hÍ¿Àh¿ì#Êw+ÿ®tÉ=Lª2Ôâ=Jó¬t[ ÓN4F^âýûeAWúD&hQF®£ê=MB3_=Ä5ÉæPO=MÄî}ÄÃx¢ÜÄè²1®PWi´S¶oLõ9Ê~=},ºpen<^eÿ4é=}dÑÖ-¤Î6Ayj`%wx=b­äÂíÌCåþ=@s=}5%B6n<`9x´ì²kAÕØûcn=MqR¶<=Hëgí`aý¬üDZÐµÀÚ=Jï~üà>#CÜHòÄ0«<J8è+âÃÀ¾Îßþ½8àÙÑM+àÞcmI:Âèç&O5Ó4î=Hú®¤çöÊüõ§èkðO±üFÖB²þ]=@ýÜ÷à¯Ñ7I_{¤ÆäüGËÆo´²=@ÿTÏdC;?POKcAùùí/û3X:}qþûªS<@ZCý{Fö§-{Óé¥1^<¨Ôl6¸Âã8Léõçï=HéXu*³¸îNÆªÓ'ÀLFFü©ñÝÜÀïÔøCfE $¼ÜûÍhRµÈé]Û$bó=bú#Jü/Ihñaý§+üöÛ½A{¦¨Í5F{/ï¬µÈdm´^OL¤uÉjµÞ ðøJ¥®Ò|Þ´â¬ëB³=@»qüø<?]Ó¥Ì×¿W=J¤ÄÖ(½/2=H¸@Òv¤Í±ä§ëç«©¬ùW^833±æßnlú_uÆ C&pÓ÷¬x@;B6pÙõp°ãärï7z93l(=HáBb(<!=Kb9ðþ¦ïsc=}ouz°rBÄ=MÒz=M<îøõxüÏ=Køs`/¸æ©;ðº-NçT_49Ì6Þ4¶%0S=J}ïíL=}6·ÑEÖ&W(î;=b->sÝÕõ/;*¼|û6è£M}Êiitn¼d(C2*ò#s(¶ÄF:y ÎH=KCøî=HÉMT²z<ãi7Åb£ ä6Á=IqÙõý8¨Nî|9hõt°áËÑ9ñV'»=MC}Û^û6Dlr@v¨!ÖÓèÌHÎ|æ¶Ñgz=K®»(À1L:çÐgÂq+òÌ(Ýp¬NbâÂ^»Li°«ra=K,ó¼Ï¨ óÕjÈ-8aÐ?{ ½%óç-fÍ§=@¼Ñ>zmMW4V-Bi¥£í ¹½ü¸ýÞobZe.Õnº¹¥M)O©Öþ},ø´Vnõ×Ã_Á}¬®£WÄ7öVÇÀUE©£Dê½æAí¿4ÄÎdzøã%¡=@nmé´àNùtzí² ¯¸ÈZÀË*ø4ÿþg®°þÊ>ýø-)AÛ´»(mzËºTD×ùñ<WX©£+`!6&MÚÌØóá±~ý>?Q7²¦ZÙtÁs¶7]?)û¸9 vi40vz?á¶mÅEÅÔmfô !¹ü SÖ~ÔaKíástJ ô%GûâÔ¾c6Y]­ª×3ÕõµàÝÁMFjJoÇÜHtEÂî;Ml}=b{&+iñJ1P¤eà3Û-·ùÛsª¾`VHãfô®=Jeã²Å:c ×ÏÃ¿¦I=ó×Ä.ñ§REh¨n0Ps³- dnü=<Í¼¡³8 O<Oipâ>,D³JåðC·=Mß6êühQ3btSïwEê·qäBîðB{ÆÏºÂvÒá =}ý=M@ÝÝÿ§=H}A#¯ì=I=I¶VÎNíóO4 =KwÔ·z¨·,}Åó³eÂ¿yõXéº]ê9Ä^-~¿[¢±~´§EÅ=Mwny¯K&9-¦ýH¶ ì§Á« Æ?Xç6aC¯¦Lç6Ãé¥[Aï´B£Æ+¸¤rOri½u;*¶-m/³©Ã)Ü;¶ôáBeô=Mz¶G_§~·'CÁë[gm7¾as¶ÆSõ;O©¾ÅÇ1¿'±½E£7©BÁIÿ¾©#ç3ÂÊÅÃÞw;A1n8c¤ÉQ0¡Â9Ï¥GÑ­ømÉ%±»=IË=M¹L=L$ôÇÆ5'¼U/Í§=J£ÆÄ·^d°va[O=}ÝDªº$È[60½?¦IëU±r½Æt¯F}ðså.GÌëRmA|Ïa§`ÔÏòn3KÀöy¯½^ÓF«Rm· 48Ç³,qÛ@É«LÑµ·gHîñLÙ¾eOGZVñg.±³=}¹+¢î<¦¾Ñ%ÜùJó4;.­ô©ÂbvG´s7=@ûa(yPÑ?¢ÔôE¡øRºÇr!tqQÓ£B>TÁü¿ÑHªÔæKÛ=H=5MÉÅÃ÷ÄoÝ^í£&@ÃÂ&Å3á=HÛIå¿JkÆcgW¿Y%A³÷µÏ«GÅ/ïÆÐ[+¥GÇW6äaÁë6Á¬³W¹B±ÕÂ¿/Lâ.(ÖW¥w!©O¯0`&)Åën=bJðöÐ°üëe­=JoÅïâ¤gËb»rè­lÄEe}À=JÈÕkúÓv`ï[=I½AWÓ6ýkÈ A=I«#&Ø$m:AÊÇ,!Ä=JÍ£ÅJ4ó(îµÃ=}ë¹xiZ;nÑ$=HÂFÃºcca3ÅËv°a=Læc-uîIuÌç['=eóÏõúëa¬7¯Ìµ_Ã+Iç$Byóù£õROü»¡Ç R¿@%áÖä;l°=KeçÚ9ÅYoc9F*>=b=b&Ï­<Eühãjø#¼°3>µ:Þ±jÔ°ô}=©«E¿v%&{à¦%dCC}o%!1hÃw?D³u7FkÑU.S@¾P.£¶¥,>Å½õ7²Ã)õ_ÞíM2j¦UdÓAðâÀ-BÍ»&òÞÈZh°³vLB]`¨8¤<fNãçáÔaøÁv=I×qÎ½¹æ=Hêü' Ãú´òÅEPLÁ1L §¾®Çÿ`¾õÝ1¸ð>ii)¢:cþÐ¥ù]úg¼d¢,ýöÇ0>6ËÙÀ[yÄ<-ùÓ­V[Þ=}¿X'LX´Èî²=}eÞBÉ-Ê÷hÃÓð¥.qÈöy¢Ç*·¨kòzs{?=JóXèüVHðPÉ=Hëðòêòö«PÓpHÐààä!jjhjêªÔökðVÃÚ9ËÓRV=M=MÉ=IÍÜÝÌÿÂÃÇqCÃ>Ðpû·E7¦ÃÕ=b±#=}7µoe#­)çµn¬ä(âP£x.b=g0=LH¦ó«èêO!1=@À/Ñ¯ü!Úl·x.Ôõ¿¬Có&©áîJb²ùÑx=J¶3Ðãík²iñ¿¨Ï5Þjúd¸åÊóÅ`Ä=JJsñÐC Ù¿/ÁÚºOúnõÐ,íÚ±)_<Üñ*ÞÍF3È=}¼¤pÁ|¾7Ôp¥ÒG=IÇÄóê8TPGòÏRXöøhÑö-ò+QNû=I¡g²o¤:n8ùÃÃLÛø§÷ÒC®_7ðÔy×R>ÁíeúñAÁ¾1®Nºäí7¥fAñn¥&R33·Á3ìÜópÍk%^´ÉÔV÷ê¤3GªÂ,I×ö!Òô¾¿eÀXËØZÿ´iñdÂð¸f[!ä=@õÐ||^IsRáßÑiáY*æñyr^îQÜ¾§|UÜ©Èm0h/®b¼7ùædY|1Î¡¯Ò1ëÁhßi=IM©ª)×Q¤óÕy8ÑÆaúMeÕ¹£1©nèÝ:ÊÏÏg=Lbkú§Ý3=J2¶|8ÜØ^SdLz8¶|+ÒScÊÿ<AÅ?3BA=@Ìá{êPÇü¥À0|ÓtÇ=JF9hªñYêxZ=KÐRÓ_SL®:D[íÚbÚ¡÷ä=Já©xÄÕeP9-¦Å¶áÌ]=KC»Y;Ò(<ÙÚXIgÀÁ0W)¸ûÏnhHø=}(ûÄ5ä6N÷RU¹ì¤Üñí©*FÏ§>nhßõ|=Hüâ=}ºçî£É0¤§=@õ©~=J|ð(_Oü¼8É.¢Çó¡$Ediü,Dätñ¯RM,¹3Z²êf¢à ½·ÃåÙ¹Ú¤²²ñ3=@î¢õóW-Pð¢Ëøï¢£ØHjhTÀo(Ø=MÍûA`üæM*ñ³nË/;èäÕ39BcãÀIÖªj=IVé=}ðËÞ¿=KO Äæ¿Í=}=LóJ~*¡zÇ!ûnº.Ì=}^¢Q´é·Û18=I@](Gú½ToûùÔä¾=JàøÒ==»íªãNÚÓVõÝYÿ=Má¦ËÀ_òká+«ç$1dÃB§Ëª¿,OÊÄ·×¢Ó¹5ÞHÕHyßoþªEæs=M÷tÓÀ:(ü¢<Nës Jè =}7©ñÖw(K­KnlöDâÚReÉ[H¥Ëù=@N!L,g)½Ìu¿ù§]ÿ¯ééÞgàÙræËOOl÷ÍîQ³ëWÜ>=ÖÇ }8#ðÒÔ2Ièm|LMàXNg¹Y$ýãâkÍõ=I:QÊ¹£=I@ûrPd=HÙ¢=HköRÝSËøT-ËÍb0y'ª=K¤ Y4pòRõ¶ðÓTS8öGPz=L½µ¨ÇluÔt%-w1Ì3ÀÛZä)Å£2ÑHÿ=IþhpYàâ±NÇ4TVPÀrS,ù¨6é³Í.KK{9O¼::ËyÕ>l0ë~c¬lÞ=JlÖn°Mw§ù|Lí[ÔIÜµõë»$û8=MI=HaxYä[mä/¨§Cá/Éåð Ü­õë¨VûôMXbûx=Ip1Tû1úh±èSûú³B±LÆN¢Ý³¢]Oðøî=J3¦è[Ä7Wäýæ·5bo±¢î®A+cJZõwÅ0ÛQwc(Ò5Ûì5=HsØ£L£Ó¢Ìêi~ÕOrãè'9$-a=JËÍ4åjº[h½=IzB ùì?=KÉÌ<ÃIøµZÖ@ÉNÌ¸!¢` yïKí%a|Y¡}ÕÊÍ{Xo,.Ë`Ø%cÓÉW;9´CÞ0ë§ç±puÚï§5/Â÷}[¦e>­K|ú7'síÄuµô~µl4Oý£Á3Xt²uè·rÆ­Ýçí£a»w»8m·me=&Îz=bÕ0ðÄËÕÜTØªÃùàüÁ¬lxßËçcÁoÃ±1Øº8ø¬m=sAÛ=@«È°>-|¨Ûk-g/Lz=I­ä¢>J-Bá¥úéÎ+ì·fæ&8Íµ©ß×rl àcÚJý©4ÁÒ×=Id­Þ#ëDÓüJíÜ`&ÝÅÂMÓ¡ÔØñîªZs7LÁêóÔq¡DbÿWç<=I 1mUôÜ©áÁÙv¥à=HÚoSõHNÛmj:yæ®r|õ%Ðëðà¬xÀMx<í:=IjbÏå<ùû#=îp=K_É2[Þuá=LÅÿáñåþ/kÞ¾®zÜK¡ý¢¼Úbi{n°U=bßV`ÐQÏÛ=LcÛäè¹°¹Yö=HÛ)êàj©ä@ÍÁÕÚñèIá'|iµ¹­1õ7Êl=K²ËÁåµK`@tÌ¢ëÎã¹6ßç®IãS1L§'úX(2ÄPÌ,_Ó_SGb9 ±K×=J?è,-PçuØXç=LúÊF=@Vªaf&I°ÅSl0åx­t8ùê=Óñ×ôEZÕm=J°îÜËY².©.{êÍ¾°îeCl*è}N*ïÍqLºáür)¹RO×=IËé_YPBvôõ~ÜùäêB`ãöKÑiBEçqe}2ÜJ;=@uýÒOMY=L{ø¢Tçk¤Õ$%=M63õw=é¿9ãÍû*ÝZ=LÕÊDÂS[8XªÈ$E¸ÕÁî8ÜïuO`=IªvR,*qþI½{=HÝ^þhp®>ºÉõ k,ù¯(4ºÃÇô K#p(õLl=õÌKR>ÓÝÄRõlösyàÒFÞZméîØ÷¿ØÒc=LJäí.âçÌNäl½ñÓIvÜ·¡Ýìm<m µ¹ê#Ê7@ñJÑÀr óÄäA¾Fò.9NzaØØj=Ð¼=J=P¡7ôZJ1yb=²_{¯vÛu+vu*XVÞCÍØ]kVHa§Ç-Æ÷UÛÞ­GÈ!=@=J¡ºØX|hñ=L@Ý:<èRC§AÌh Î[<IBß/Þ4bH=}QUÓä?yCeÖÿúf(dtT¦Ç§týild,°Ò_Òf&°ì=HÑ0LM=KE­Ø®ÚÖµ­=êðJ£(°J=}ÓÐ¾A¹«ÎVò¬¨*¨Ò8WïóSúè=b{:Ö pÎÔ.>§å,¯=H½G=}PR¿~$¨hÆ:=I:©­ÚÂÝÍÞ³=}=HTÅ__Ó@;à ãô²@Ï2O¾LüÌÇ§ËßÈ=IÔhÉÈ=¥ÈÈJÊè/ (Z@LÇò¸GÉF°0¹úx7¸¤H=H~ÆHèñ-=Hj=}=HpÉÑÅSËJMêFýè>=Jæ´ÑT¡øÍm$¬mè>¾ä%#c&]iÜ¾eÄ$Oô=J¸Ø=L}Òq5íE´hÞP=J#|ó=M¨&ñEP!²îxrB]%Woæ)Ë³%lÅtvíh.m'ÜuÈµÊo<­ÐHÇ×ÅÛ´¹¤Èv.RÛ#H­gpÛ¡àt²¨óá8)ÝèÃâírUmÿ-M=bÚ4Mí¡ Ú=}aøóehmÔP=JÙhÔ¿z¬HýsxÖø=³ûj«=L=IÛ¦íß=MôÇ=HÄpëP«=J¹+Ùè¿Sä%ì¶sç%=}+UH.;Knu×z1b$ÀõjjÐëKM]0åO!/+[}9=b+ÎEþj=}*'ÚÍìu(ô=}[eãYOü)¿Ö×JFfõTð¡=Hþ@>{É=@Jó=M´Î=HR¯ü=Ôò=@ÛÑ¯³üºú©²ôÌÚRü²ÐÎø)Jéï×ð}kµ}k)<ÜO*-Âx£6ôP2LÌâÖ]ò íû½F®uÞleyä¥~¾4sê~2ÅÝ=bGå0«(­]Ð=}K9+=IK5=Hþ#­TKø<!éñÑ?à=M4Í|@=I®¯¶r¨s·ð=}O_dTÝüäJþÔn¼sÜtù=@fÖdsÇi@¥~Ù=@(ãu¾­íG2Fb@é_Bß=}íÂôæ±1e¼?õ ©{±eKüHÏP[°<×§06ì<Ëõ½ëF=@3öÖk@=@7ö°ú@JËÃ¸öçIÇÁ$l¦$8iË8×fs©N­?o¸Ê==bfnÉO»6=H-@Yî÷=Hj«S¾èÚëõì1yA¢c3È'=}ißR¥m=}.cS*)Lû®S,¤ÈjÀuÂîLEV¦Û¶Ã¼ã®yÁ@I^¡#=LL³Ðg¸dÓÞëõ_á©QY'M­ó©¸9ôìu}l­3=bÛz6WUJªÓ`ì*=bylQAG=N=IIÚ`A=I=IÊ0ZâÎ&8­X:=Ið¨?Hg¾úÍÿhKúëéTâò;Îß{$FHßUÜ©øLæv`ÙöÔÔàîÎDB^­ÐÏe7=J@«Ñ»ZìßÊ©wº=}¨AÊÛòxëÖK¹@YQ=bÔ9ïÉå7v'^M®=IÙ=}¿¶=HPúÝªYRUÉ}ödeúcÊ·Ð;:aZ-.Ø;ºÀNì?TéM5t=HU=KxÊ¬os/´± ãÝe, ¡5áÃ*¼á+÷ËÛæw°M¼Ï¥ðÜUÜjçxÏl+û:Hù¤°ÉS:N&à9lË·TC~å? ÀX©ÍLîHQß<YÙ6LßpY# á? `?>¤1cÔj«VÄfaµTìµnX¦°ÎÅNe;O¼*ÅÎe;Sìæxÿ¸p|=KA=LßMû¨Ö8£W~*wÊ5s@Îö=I®÷Â(Õf$obÜ]8ùþoNªÂª^âåÖÿ^==Ku¹±<9ª9B{­Éw°4hüRù.Lw!¿¡¨©ã²b?ó-ÙñV¿îº=H+¼¼I¢Fºèô6½ÔßdE­Õn©Ó5HpÐÁ3ê$¤2Ñ¸4oí=Hç×VN¿úlP$rÐ´£Têw·sÞ=µn=N&ôÞG?V§s.'íÛlajè/*3µ=ñI=Ñß¥Å.òlü@¿Ú¯¸ñêæ´uïN²Jb Û³¦t&4=}qáÙxÜñh·öýZ¢-@±Ëcw3DØ5IÆãæIÙ+MP#=L0âQBðhß=Iº¤0¯:<lHú1µÓt'-DsVH)ÛL0¼Ê^Ð|ècëòâ|ÐjÉË4è2J<ï¸qqÎ÷ñÔ@ÉÔ=Mñx«×SYU@Êì#Áødô=b.=HjR=bQ)MKisô:=b)$!dCË%<i`¤U=H=MYté¹=H«0øÔ%¹¡%%C*oýÍXñü$ÔàºÈÿ=¨¬ÞÓYèÊÍ[8àád4ÿ77ÉïãSÐæ=@3¬*8'zmÊ¼678^=IÑUªë°U-)É+y,-f£C=}0eOÏº9iÛ¿-Ê#^2ae@9áÎ)®¡>=Ix=LÃÜ.æ3=MâAaAÐ>ýº|Ól51ß¶nCÔK=KüyÇOã=Iª=J¨¸Òñ«þñ°1Úp&æó¦È_úQÑ4ØÄý·:?bÜºüqÙQ/ ´ èCô>ñ¼_tÔ?Ì¾&eÝØÈó`=KÿË=}9yäºØTº´úÖS;½HÛ0eÁ°ª#ÿ=bèÞÉÖáfÖHQ³Yãjx*¡I4>èµÈR`>è£É¨É(iË>w(ëÔ_Y8ÎHËV -o·Éä@=KHÅÂª,CÓÞë-½^±|{=IÇ½45Q.Á³f.+­ºõTõ©cææZó÷e0mP¦à:A«ÁY³ìMJÌuæ©­ÕòÊìSReF Ø^ã-ºÉ[ïËuÄPÓbõû@È=I^æ¬Ó¹Æ®î-êdyìôT¨ÍÍ=Jâîx«sªÒBt*ÓÉïÎvÕÔÔyÚÂÕË&¨)éùþgKe{*,êù=M÷¥V=JÙ=}³ðÑ/YÔ«DÜÌ<0øÇR(ÊÐ+ÔQ,rO]ÔÁê§»M³¶V´Cbiî=ËA¾XÍ6ð6=@MÄsön=K*ÜbðôÀ|ÌFfDlqþ¤§ø¾=J5{»5ÿàÈ=LÍSÖR¹ì=IØÉn?äPr¬PÙßà9Þ1EªÎ4õÓØ6q*o;=ìzD-+i_6¿lf.3ç¯=I¢=Hñ#¶ÕLL^ð.*,§ÄZHïo^=ùÕ>TSËC[=Kéè`Ö]múrþ=J@:clílJµ'«|G7=Mj5½S==H:vhé b²)e#ÌñÉæ½¼ëCëÝ,ºv¨ô=bòåI.ßÒmý)×üj PÏ=;-èe^ò¸PS{É$¶ùª|¼ÿÐÖ=i¦Û¶C=IÛev=bcotyeLc:ÔçÕB9å°nK=J%ù*ðìÿü°ÞêáwI¹«ÿÂh#vªùµXKì=bñj[æñÍ¨õUmÜÍ÷¿ÿffî`ý=H´ÈæUãqj J!ÛÎvâbÈhÆ*9È/kHEDÐG=Jà&âýbb=b½3u­=@uÌÊ534 /ÉJOêÛ4%ïSôâwçM±eí¾$o _üýï½xÎÖXÙÚ_yÌ©]ª}¢¦kën1|M®ä=I=bDùh×1gJaÓ=bÕBêûñìdÈBcíÿX¨ÚÉ!Xêù`tGæ ÐÌhGþ¶BÙo«qÍ£*a23_ì*´Ö¶Éñ¨æP=bÏZïÕau!g=[r']1^=LêÜs^M øP¡ð×V=b=M#=LyId»íÊSÆú$|¨)ÎUþz,¦GÉybhhÁð¸¢å¨jvÄã·8dÉ)r*UPs-ìåë?èÝ°A¿ÞnùOæÀ Ë¯tm¤¼æÐÜþ BYð5ëÀ³#7ÑQu*¤:åyS¿Xÿ]ú¬Ì¢.Ü²2<¿¹x0@ð<öIÈÈª:Ð EÐ¯Ó=ìu3]^éÄ¼ËµÔW¶ÿPØR´SØÒæÇ×É&Ó@4ò=J0OÏï^ªÅÇ=J=}V6wu|üF#=}Ò[¿²ôÕÌLÙ¾Çx=J·gä%· Æ¾¶R=b­%7/G;Â&Û6ÆÅß»ü¤~=L;:IauO0×YSØÜ=Iæ¨xÆK¯é9ùHT¸Í=M¶=M8ôÒÖ=bþÎ¤ðÃ=æ=KñX´bl¦-+ï¯èíØHÝ¡Ë±ÝK×-I=@}A9ä%NSPËº<ËÔLÄêTÌ6=H=Èëæ?iÛí EöZ¬¶=Iï:=Ù_Xi|Hp5S9ûhP³9cÉ=Jgì·üXOÙ!vª¬Ø$(P%W=b,Á2ðvÞÚ«Ê=Mÿ©ö]©jëýèOÕý}DÿA#µS¬È&ó`=W,Ê=@uæ?/Þ+'ûó$N¸Y¼úA|­tdÿ¯2ÌÞâ;»æR¹¿áæ:¥EímÚØ{Õ¾ äýË¹éÆ÷Ã=JÕm_V+#VH¸=IíF[6·»cÿ!°ÔCî;ø¬3aÜÿa_w[Iþ³áv4=I=J¤¡×»¹Ö'Ú3ÀSî¡hÆwdvýHËÝÓÖÃ}ß¿ßqP8Î¤~¨=JÑq8=ë/ínX9Yû·z=KÌç¦«ò²· Bl-oì=}v+3?Ü­i(%À{p;p1²#3ÚøÆq)ìÃux$²¤ 9uÜ=Kcñ³=H?HvÿÂ:ÊSçÿìöÝÿñ0ÿÊ»dÝPÏ%IAÒ%<ljHÂÕW=(ÒiH×Æßz{/±â=K~{¼pÎ):AjôßÔúJ÷=L3ÍðÃb=KëXQ©Jx*3:+=}Þc=@NÜoumôí´y&ÐÀÓ=º¼dS³< Y]r8+èl$­ìásàº¼&³P¸!R+=ú$üò+oSÎ¸ÿðÌ¹eæ¨-7AÂ°&3=J9¤=Mä[XGIó0P^=bs*y´Ü=IÈ9Çj@À@ð¨O¡=bþÞü0ÉZ=HlÓËì*;:'l9õÛóæKm&ïÆèºhï=KËkjÿf 1y@õÿ?=IåhÎ1 =;þ _**Oâ Ü=J'ãûÎÔá<WÚ­ØÓ;V^ø'PsÔUjRÙßwä^Ôëj¬f«EfêÛKY«£Q8^@ïºÚGÐq{=I`l&¶qÀ=H5^3¤Ê¼^Ôë)ÆÆzu~yí»Ó0ìIÇ­h=KE­,ã»!ÔÇ1éoZÆ?Ü^ésÜÙ+A¬©8¤ìÈÒM¤NSJÊLæAìc * ëK¦tÀ¾Ï>=Hmè.æùÝ~×tÍ&RKVR¥MÜ4ZÜZü+8B§ÖwbÑëáÎ·é:éb~=J4-gR÷ öólîþ4Ä)Ô}KÀ¯Ð<SxÎ@âYéS÷ÑKtÎ¦âh@/[ÃÙìª+xíÉÐîR0ýÝXTwNþíQsÑ6=J[=Mc(îÿ®ËDZa=IýÓXp=}i!^eLÿCÈ4y0ã>ÊiuírklyõN´I$Õi2!WÕLYù'ò5ºÐ8N,!×u¢=JéçÑç!0Kà=bÌïzáÛÃ*]²'3iÒ¦8¿pð=Mñ=bÜÛ¬}þWÎsB=bWå{'pCSþy×®_r[É=LZRú;3éåÚ¸þ|$¡D×+ÙñäÝ¡w+Ùæ¥^´¯1ÙzA[=Hg>$8=@êµÅ¡{òÜüô«kg¹ÉfaÓ18~ÎøÂeh<è<::Ø©¼<ù¶×É=¬¹NÜÒ];¨14ÕýË~È=@ËJíÄðÞÊ¤5Ö»ù×åì5èÏ=@çQHÜ>S#`% ¾ª! #¨´;ÎÑk-°¾¡¥J±¶ÊI¶ðI:xpÒ=IéÌÔ<`,]°¹nÀÞRÏ÷Ó=LS:Ô¥XÒ#ât>6ÓãÝeý6¤qÞ9)ÙjØü­¡eÜ·ë}_=6iÇnÔþ¨d¸,RÑmk1IgEµFû=IlQð?K×x3H±èpÅîÙïO<ÍòPbÌh=JI}{H«%wæ_=JÌÍêÀ=IèMy=Km^×t¨]eÛÑ-JÚýÐ5[9L±ëÑ,ÇêÏï|ÁøÕ&6=}ÚøB÷ë%M/=@É||i=@DpønÞò$ÖLaª=LÎbH£3U¯_SÑ¡Z:0õææõÃ~O¡_zÑJ(ªS¥òÔÉèïOË=H=IC<ê´[.©®#c»LKØ¹è(=@$æÎñJÜð(4 9j|¿Ë¸°¤ÞÛ©È i]Ô)Û=J×ª Ø»Âõ¡Æ°ü?C=HPpSZ5 ±LÙl^¼9®qÍb|©úoÎ=L¤ìõÍñcNW|ÄìzS÷°ÅLj°¦ªÀÝs©)Ç­ø=J:ëû=L6òäá=I«~_z=MÕèáÄ1GKzÍ)*=bLîÒ}]ÑÚ,?ÓÍ83af.~)b#8ÛÜ2f½=H±ëÃ$=HÅ N>Órêõ*3Q|=L¨Á|R}¬Ynk#~ÖÿÍM#<$HÏrX=}=Jâ°÷7È<HÒ$×'I®|ªõ=ÍM-Õ¢ªtèbÒ =LÍ¡îÊÎ(ÐówÒÃäúGì=}Ì7Éiöc{=Hfhø´FÔÒ¿j+=Má/DÓ35Á8#Â¢X3!Ñn£Q,XÐ=J÷}uî=JºdIüÄY(Æf.=JåI4ÍÐ¬|Tàè´3°V=H#Þ©æ¥{!7=b0{=bN¢{L^,(âjOiÉ²=L}O(yQ]oÐ$ðñÐèçû`¬ÞkÌ7dë-¤ö=J+fQcrØð4:dVêM=IBÌKE=IµÙäw ¬l¾w¦IÎ=I@@¦CzûlKyû:W¸<N²!$g=JW] »ÆV£®ÿ=}Lj®Ù!%Õ=}Ì#û¡Ù£¼¸Ý|ë=@(óÏ¤iÜi¨YFæ;¢))»¡~=Hóþ}õ$îÞ´I5n£ÞéôµõÌ<SSÒIoó$û8vÒ¡I¬e*â×Ëð¨»ã¨þZóÝ=@iö[ÏúdÍÀëHÝó]Ã¦Æ=}0¾fG)AQ =^ljâ7¹=ìz=}­*9QÄ%=Ð¤Ë¤ïâ#Ð«è=Iê6k(r×/é>5ÇÐràòy§¦§åk=M=}éGÔBEÒùÁû/.â6¬£vKüî·<6Ïù°è¶[ßL!ÜÝ¥C1ÃÉ</tw¢1rTV-Ùn¼ñq=Kðf÷Üý<Ö=H-eM~LßÖsÙtÐ÷Ø=b¥b^²)Ïë+Üý¼ÐÉ`à=@u°=@:Ï*ýûéKá²Ð2å£û­7HGélSÿ0Þ&R;×)]º_[ÜQ¦0ñªÊ£_è´o÷þÖò=Hh(¢+Ze=}ù¿ ÿ§@Â&òÜâÖóà49çÙbq:ä°QÒ%ÛiÁá<-÷][úzwnµÏÚ©ðô&Sõt=MÉ=IMò*ÌªÞ2x³ m9d­4=uRVR|O²(Nlt´ ß¹Ø~sÚ_qì÷ctìw&r´T90r-qlb3oº°IcÖ$Já¼ÕYdw÷èú¬åhþ/Uô&'4ææÒ`÷þ§EÞÜ=6Ê=Lt3°ú71Å=L]ÙC¦·×¹Û³®#v¯-øåWlSù3Òâe£x4âúÍ~S19|ÍýírnF`o§Qce3ÔÃº9Êö Ëh±c¯ôçÉCy=*iË2$¾9Hp»Étõsû=Iã'¤ç>g«8Oîåe.#Ó9Øc=Mã¼6|»µ;Ó¶=H·.êxÉvnjËËrFûÂÌààÿ1§B(-|ÓE¿J|¿¨{OWÛ'üÙ'¾çå»xò¶`%}ÇÄ«¨[Ü¿étÊ=Mnrw¦öµÅ¿àb¿w!c¨ù÷¡3é)·WEÔþ¾îÒô~/Á:¹è¢wm;Ù<¿Þ(¿p~j´=KÁLlh @ÉË¬Û©^ÙYP¾q*îH¤q+ô&~O3Ôs^äÀÈ¦~yz¸I*À=IIåì§VeÙZÞXy^ÜÞuuAjë2#»6Ø}Ú£bÿüu=L9=IÛ×öÙõÏE&|]=LqüåàÚ½õê<=@=ÞEô=bÙì·òb¦%|ü=JÜhüåÖ>¸/¦Õ=rx=@Ú=}>ú!vAì< ¯tF¥»>£Õ7½þ1zñ¢[³=H}Ô>F:x­T)c8ñ-#@úª?þ¢Ë¢^|ö'>àq8=Jþmc4ñ4ïÿma1·nL53ÿ=MfXê7ì=MR¬^ÜñY^¤Üq]þy¤Ü1áG¥Ü1Qy6R¼XÏvc¬¬xüíZjbcdü]lNÆ~ëàVý¨ÌÑ3[@y­£ÏÉÉfA~Nñý-¸Þ²ÍDVªm!X6ü=Hfk9T!Rf=HÎ¶#-8µ!Í '=J(xB6ÚÄ=K>d5~6&L§õåâºü=JüK½íÕ=}ð4ÈÒc{èñ-Ù[­²õcÐ|È¯pÒ¾-ÌÌðAÓµsqgì¶ÃèîO/²¡¨·1`Ið½Î¿Ý%Í«ÝÄf:¼æ¶°ÏÐï(^=}ZÑHä|úã»O¢=L(ë]ïÖÄÃi9Ç²±_Û=LDpKÔ;Z/©ø$T1qh¼÷OäËDvàðàð¨,Àìw·^Ñ·Û©Hk/}äuåì~øìÞ§=MýÓ gPnQ?TÑ=L|1 AÛvVFë@=@cá²Ùü¹öL<DÓ³ä=LÛg?t×ËäÓßKÃ°4AÕCJ4y%Ýy·ÍØÙkößú,a4ÑÐïctGBb¡çÌýý|VùR°0PB=MÄtÛ¤í&äë1ÅY½éÞóP²ÌÏhèUZ/ÊÞÌ¡þÁ2/ß2DTÖÃ`=J¸pÕò×æZPP`X²ñ¡=K3ryÁ=@CÿÊãCiM¸4ìM¬ÜàõNÉ¦íæþÕ2(}iïæ×ãVôÿ½ûN!NÆñO¸I_È*UÒõJ×À§=}ì=}iÙÓ¿)bØjëE¨,a4¿ñõEùóoëÖ.çð=Lfîÿ$ðNHá=8ÄÌ=}o6Qrùûß«òØØt:OwøìÌ©¡Ü=HgîQÛÍyí=KRèOÌzuuÉdÏ¸HÌ³=}È9½H½ò ¿ÿÈPCbQ7yBXtÜ¦á,$¹¢{´>$íú½+õK-³Þ¸èç§|öo!2b=HOE4B)o²g72ÐäO«KglÍÊÅPK«,ê]bt×<=KÄÉë¥ªìî­hffx¦èÿMêíÅ=HLØ1¥zÀ1%nu«¿·ÊÞ¹¡×o·!$O¸Ð{ìZøZ9[K0êò8=}?$`==J6ü¨¡²¶XB¥ÚÖ-Ñ±ýæ¿¸pØå=@ºÜÍ¤üØpqðÛÌ$4àÏWô¢¶íqí[ð^&k}½'¹F*ÔÅ´{VôþÊ<Þðk,=I¹bmoü%Õ2bsü²U`àµ²çÓñÕ*,g¡ÌàèÙ·ö]qñFô«LÊ#Ñëaj³Ph[ÁöüTê=bÕö^¾b¤ &©¦÷JO<ß]Í:vðÏýL­á»yX0L£.«Ñqø¾õÏ¸jìIb=JÎ®)¯9^ÕTpJ (9Â´íI=MjëFØÔ¾&~Øó=J(=Lh¬Ìe«¬lÖ¼fôÈb!¨¢):» rªÌ¬ &EøBÒ,ï=J¢¸¥ë¸@{ ØßÏQìÉ|¨,é$0ùY=KnÃÀ8@ï`NÄÃDT,=MÖ VÎÛÚóiv 6NL¥Ø&ûñðÐÜWüø³N.po6=HèÎ=LækàË=I=KÜ¶=IäÛÜïêðZ=@ÌØOÜëÛ}Ñ­à°ØØ{¦é·üä=H'b!Ö,{ÒQFüÈf>ê´ãU»ÂoÅ?'ý¾¸foofø=J8é[=Kçl}þÛõ°Û<ç=KÕé=KY¤èïaJd±òõþ8¸qIä0/Ào&EdæHø4:áÞ*idëÏÓâ=J¬f=J4Mn0sÑ¯ÿÏÞÉ5··¨8V=K'-=K%ÜAA¾Z?=.k*^ÍÊï·}Ø²íÎák=LÕLÛ|ÜSS-WÉ½ö~uïñ5^3Èúþeþ®YlË iÔu¶ýÌ3=Lê=K^ÌÝx»(-=@ð}àO¼f=z=J ªzfæúbõÿ³ÞÞ>v:ir¯ZX©D`5§ìÍÑ,Ò(>,Ü·EMz×º¤jmËb<æø´^¡Åä¿µÃõDúD+Z<©þÒ~ßÂV*|}ÚC7üº=I=b4µÅðYØA¯Vß'PÄÄ¬d%ÚAØY}S±/ýPt@¾ãA»=@ê7aÃK=L´=Ký®TË=bÕ=}>õgl!eobb&ÇÛ?¡Pp,îé¾-0#ë¤°NLÈTA;ØDpYÐñ&SñÔ°8ÌXL¨©^×=HÉmSØq«Ñ|)9ÜW»¨=MHæP§ó1Ü6+*;ðs¯~=Mô$ÓXô4¨1Óä î£J^oæ¦C,=MþÙG8ýíæË¦Í=Mª× t×T,ÄsËô¿@ÒYxsþþqALÜf¡Æ}k[Ñ/Cwµ^#;³ùf=b!>³Ú<jüeth`/2u1p=}KÁ}JíìÂ0qáýÆùy5ÿsàHîDbÉ^åvèÏ,-Ñ[õJË6ÐkK=bôüY.ðôòH¦ÚyÊEÜ×ãÞì~MmÞìEç8I!y-k=IJy$ÒGPüóì$ðp·Ä2þ÷}z:ZXcà³qûôÖ¥I¾ç¢Î8Ê(z=b!ôay<HÞ+Hrß¡É=Jû³|ar¼nÎâ0ò¿«fX@bb­ü_n=bög5òPzqmayAfnæñbâ´²]0òs=bèüñÛUYÒ=M=Jý2´_-õ»!ÓSJÎ3æÈEKòíÝFø@MÐ¹ÍxØ°£NLÊ×AU/ó`ÏòS²½;/´î³É=KÍÿ³©YÖ¦¿ï6;jè¯C'Òâ±gr+´óäEq±$%Zb@úüàR·lÐîÏîpÓ`þ|#ÓS%.ffvÉw¶ã¯ãÚûÏ2v=Mç:yDä=K=bf¯úE±HBçA£J7=@cW§¿d£ÎZ7l|(m¸]YÏÏôQÿÀ9e 7|­¦|b3¼Äì|­6âeã8ûÿûF×ª¬¯ï=M&[Þ£9­rgíúÓÙÉê{vÏÂ¼fO=LFQ« ò=Mf½M=KÎ¯ë³­`ñ¡¼^aBsÅ&øNõ¶g^3¬SE8Ã%Ê$¸laâh=IQdmküÛãZ§¯S¨SÏ­m=0S5Äb25±ô;æÂº>l¤0É#aåFû5Ó^F«qªeU{.Bs .¡­#õgºF©:¯[&Ýeòbþ$MTá¯ç¢ÿ0êY4]ÃàmûË¡þ:ë<$Æa/0kMz¨·UÎÒ6dëÚ[70¤<c´ÙOxOäèÍ=@$%=@x^ôVx;9özÖ=M^î?î¥ÛU2(ZóÌõ$r½=LÆ~såZ]üT=b¾j^qíÈ]íµÞôg­ÜK.Râ29&ÔóÙÚ&½ãûþ¹ð°ø$æ;µE(¾%våã¡F1W&ÄyàC¯¢Ê=@L ÃfR'!k?~åÌu¥z»;nëcÄ¶¶Îò¡?ÕÙÓú-d¬!.S[Vjmâ!À{w2¨¤Çk«®«yôhsTT6d@ÜÆNc¯=W;Ã[Ê¶éJ¤©he+=856²r=KAr8ÔkH1O8ÇÅE=K%¾»¹´ã*.ÚV!=@=Kþ[ÞÙfÆv:ÄÚÙ£ià#)IÆì¿7ÙþB=@§@xËSÙX¿½>_vQ4¬'xÏz?ÍöyTîè(Ñ{ä3×õ±}øUbUýYÎlFBs[§Ò¾Z{þ2:=KÓ6ìBç z?¸î<N}Àc2b{­Â=@Á¾[2µ`ëuö<=H§2L«âG³S=JIÕq3@ïA:<É¿ãrß,¼¿¸gI,ëÖ!@ji%Ä<þx=MëV&WÒ×¸¾y.iðmx­=L¢ÑÎéu=K¥ï=Ik=M÷åVLhÌ~=@CI=K]|XÙ=Mß=}Mg> ÷ScA6»fÛ=bÎm]Ï¡më1OÀ·ªüuã<ú-mê×ù5ËX=H8+ÇöîëÂ®}À=@'iû=}éQjq(ª)æ/39_ÖFºýÂÐ&h?v¯Ü8Óõ?ãã=K,#:0aö>7¥ô²¦(ìk1øê=ì9ÑTìÛZmî¡&SMÒDnôàs!Ññß¾ß2K=Hñ°7ÌBnêÞ¼ÞVÐÕRàÏ°]âQªÜ=LÕI÷ZÎ-w=Ij*dËj`¬ìËñ¯fËÍ0ÚÄ%ÐÿÖú?öâ`Ïô=H#KAà8ÊÓH#ñ)ÈúodtþY ëÅ~à5*ÌbR}8¬;JhdÉßí+p»UpG¬4X°ÛY>@ì=@ëFþ+SªÏC4üô«ÃZí<È=}Äþ¾[:UùüñÈ3ÀÜ;gþuhC?ÇøáÊÅôÆO*¶ÍÊø¬Ð.õ.´/=böFØ&zçdþÕæ¬q-Î÷©æSñî÷q¶Í»cÌVm¼Öäý»wâ¢+Þ5Ó(=Ipïl¦Ahp=J0¾ ¹0YSªUú)EéõõõXPwWIºó¬°ÒZNN050Z¤fqHLóVÝ=÷¹å%Uùê­¶;K!*pÌ·+=bÎnõP/ø­Ë.ËþBp{³Ó]ûÐ5¨c¤=IMmõSÍÞóúÛ¯NS]=JLÍÊ=nå 5Í 8ÑGÐV>hÊ2®5#=Hñ_NeØtöaÉ!êjÌV=MS½P-ÜO÷¹ý`KEYÞòÚâÂqhÁëbÉH¡¸ýõoÜ<=M=M-éOV:Ü=JÓmÓëjb´ÔKûúéA=@yæçÙ[6ê¢³ÐpPxvh'¾ÝZ(}!«WªTih4qñÈõÜblqüBßÑÖã­¥èëäJ=M×¸.þ=jz)ïQè%,j*ÍzË­=bÜ¾Ó³=Mu-Ã=Kñ«=H¬2y[ôß=I`tKpH ûJ4l®M'ÈÝÀòIÑ²l52ñÂjJMâbT:É¸Ênÿûüçy=LÉW`è=Må)I&Ôp³G=}Î¤=JZÊð3ÅòHû¶eµF>Ò18ep¼®WiÅz_«2¶þ'ÔãÁ+x3¬²=M÷7·È8z¸án$i/îhy¡VCÕÒ=ðÀhW'&=bËà·Ûô=I¬á(ÚýñLûÐwH$ðJÛïI=@8ØîLè¬L)=bË$ÝëÎ©Ï·=b×9¬òKÏ3l[göM&=Jeð{tv;=@ªM~Ì'¸ÃúÉï=M­×¸.=_ËÇ1l÷©ÔK'ýæ$ì÷,üqûú#=LÌÏÚ&ådÐÛ=@Ä=bÐQ¬ÍÖ^X|gLåêîÉB¸XéDâ¬=L»z$ù!tX¾ª*¯*Ñf±VjµRßù)1CÔ®îðMö$3°Þh$(êd²!QÊ:úálg=}¢ËL<[Þùdp%ùìaÓ#Û0§KÅÖ)1Ê¬xtõëï#uÔÍJ_ÀéGLñÞ7°Üe=@$½ÃdáÞh'nÈ ²åú=K=IfÊdXäJâ¡·¡¡Ã{§Ò,¡j¬á!cFéä=LîW¯òs~ë+XÕ-ù½ò}ÜucçðÈè=LÉ·.üa­=HL~@pÌ7°ÙÌÍ*à@t~(w1Ü%ÑèíÂ&ç=br{JõÁoEÍ«gûh¹% !%ÃÅ¨­þED¡l³)«c=Up$|¦Å>+w[¯ÅQ&9y À²ËªÓ·ä!]ñª¼ucï~x¹­=M¼ÿªË43=MÄÆþ°®CÛÇ±¿ÖVç«¬èÅdÆïFFU7Ð=LÏeÇku¡@%@1çæ;&}Uc=}}.Ïó^9ªãóïÃxÀÖïÆ=Mµ¸¡ß2«Å6>½E¹t»F=I-WóÚ/VB¯|U¿æºWåÇ8²¿ÿwFåþF³ÀXº¢m5~Á=Mú§D°u*ïfçe¾¢¨cv4+«#³Â÷1OU=}P¹:sÖ¹©¢77»?þÚE¬ÂÉGvUGÄMÏÇº=MÁuªS$½ÆS¡@=}1º%=}=@·p5=}/Æg0«µ=M?ýE¿±¼/4Ä¹ÆÖEj¼hÿd¾<Q×æa½Oã4D0=@f¬nOÁ£ã=}2'£=M«ýªG$ç} ÿlG=@¨Æ«|y¹F§æÁ¿2ÖUk×EÇK4¤,'6­óËy¹;£=L#&ø±®=}k5v«X×7<r»÷xg¶>eÛ·ä@A¤¾ÍþF=MÄ¹÷%,«=@B²¾M_&ÇU÷6ãE)¹s¦=}º7u~n/5>²3ä½·®×d¾_WÆ¬|S®F.Çn¾£F¹o®þé¢vY#7±2«stÂmÆþuôFcSÊï À¸(|°eåAVUrP¦» j£öz¹8=I¼böæÃ2ã'fÙE³oSàEcU÷¶Ø'Dõqy¹9Ã÷¡¹¾zód¾'!¥vzªåïÆ9­±¾þoÄdåYÏÇ0«=Kk;fn=K.ký²H°E¦®½xUWóTæ>ª¡À©ÿåÆT4jê¦³¬va8zUcÁ]k& ¦)´àãwQÖÅW'b6«çöj¥{¯¢Àº|@è«VvýG;²SW¨®oþô~¹A{1ÆrU÷¸÷+R»£À¬Þ¹Ã?²;'·=K¹õS*/| 2¯wè©¥ÿÌk'f³Å.ee¿¡¹Ë²Úo³âF¦ýÁ¸)þz/¼]§=}¡FVUOª³C÷@½[ª¥þ-ÇÃF!DÅ»Æv§=Jãÿwc»¢¸E°]m¯?G£òÓgµL¨Bãçkz¿Ëof=bz¯,3wz;®ß~G¡%ó{¾¤ÿ=÷ò÷3®Éþ¦F0¨_#Ap»÷BÅ%v5:ZUc½]?DB®®+d¿IÀX&ò¥ 5«s;«;Nïg>kU÷§!Á¸=I3Êg¦/«;Ú]5ö³½¶=/4B­E=b5«©72_mÿÃeþ6Àc÷¶¾_g4üÆOqg¸måw(<7R×33«w¿SÆÆ¦¥B£ÀÃ&qã·bå¿Ä;=b¿ä)«®[¢ÉK'Ä¹ ¡À¿a¹~¾Sv{¹92ÿ³¶z¹òFAÝ_ @!1ü·¤3×BOF!DA[·Ç ÃÅz°=ûô§-«'.f4>3Æ>Ç¶r3°=K¾7+« 'Ûïtã¼÷ãÿ¿~æ=@¾=K5D£¢gÏ°hYþ&Å:-û¼»þ&sºÆ£À¸}µZ/·y¹¤(¨efV£ÀN­}»'Ç;73ÂÄå¼O¯PCvzhU¿CtþµÃjmþ¦øFq?¹õe¿VqÆ+gc¡ÀÄwò'&=b-éÃß3wd>;iþ¦=}=}­e8ÂØã·#Þ­ºZ3~¹áÆÀUõòã­Tx¹©£ó#)¼=@ã7%ÚµD·LÅ%4«Ó~¥úyaEgväÁ5DvUþ¹>ÄÅ­Åc'£}/S#&gpÄ1×+B¶r2Ë÷¹­·^ÖbxÇ¤5dæ%E=b£@¥v¢å7EUþÆ(A¼¶ÃgÆw4D;=bD£#çáÁkÇÀu¦3§ý;%£ó}x,«.3­×åÇ¸b®þ&#âE¯ù«å5§®q1'ß§£ÉW~<·©cÃ£ÀN]ÝÏæ;U=Kd·wäGµ§nwà´vYþ&ÙPÞäÿ}:¹Ìã'BÃãw ýñFý{óF/ýSWµX[¢ÆÝ=L·A­J%0«K=JUûS±Ùã·A@D 11ûþô}¹W#×5ÆË¢@=@ï0Ï$-«ãó×´¿Àçþ5x¹­gÇ,°ßþßÅ¶}RáÆ(«[«%;®t¦á'3D&¯0»CïçÄiUËGUucBÅÙõ4ÃÆ=Mß¥6GãÇ1<áÛÆqþUó¼ÞË5s²Cùwç3«KRªýwÿçGÁç4ä¯'±GTà=@¢³ÒjÁã¾³¦0zUGA(|!§D|FNU÷÷V?%BÅow¹=M¹´½õÁ³5þ&[ÝmcëwBo=LªÀh6Â*oÅåk=Åy¯|ß4ÜG§Ç¹¥_­§ðF¡õÆ¦3§°¯~¢ÀÄ¹tÀY7Å¨¼wü¦®Ë;>/´@WKªEÁ=Iâw&öÀU31§×R·¤:7·%4DFcÀ/÷r|¹®>þV»Ðãÿ33»7gCÂÓï¢À²v¹í{»{5D-ì¢»Æ&O¤û¦OOksb2¥Q_óogÇ¸4ã§XÛ'/DAc5DH@@ï¥¤+«©t°U+öcÆLU¿QFE7RódÀ]YWà¸eU÷0ä'¢8¸¥ç¢@~Oü#6sU§ðC¢K1Ë?¡À¢ÀÍ¯tP,µ|Àc°U%3a2«×å> >ç#¡À¸j@Ài·G;hU7ÝÅDTÂ¢¡¡¼ûN/Õ9ºG#³C³fÆ©§¹(´¿=M4=Uß£>B¬Á[5D=KpqD¾Qwx¹Fe«1WÅ°kAþæU@Ã5åß¢À®9§ª»cÂp&.¼kÖ¦Á(aÛ÷Rç¼4«yeQv!¿»S¢ÀxÂZg½ÿSÃÇ=}jçdÂbg8¨¼ ÿ~Å!¹Vë§»Kãÿ2~·®q54³°Ï=KÆBªÆ¥5D=}£@¡K§¶ÄGãç8D&³ ãwäÜå%x-¥©þ&Â)OïBäFIUgÚSþBÆç3¢{¹ÕåªßÀ_M=@½}R×Öî¢-¥2«#WV~ãþ0%®ËÃfw¥ÁoCGô@¢Á3ü@ }E~U¿¾nË£ÀO=MÒ:îã·æGÁ»}©M§¢À3ïõÁðÅ#Ó7¢CµVíþ6DË°ûu}U]g°<=}¥d@)0s¥×ss¥=}5µ¶í¡À¸¾¹<©Rû5D¿À°}Ï-À´@ã×çÚg>§¨ï$ª¬Ç|:Ä£æ¥ï?PóÆûµ@Ê×¡n¿jO¦ÃuÞf1¹×@Û¸OÄó½äÀ ò=bº=_P¥/µ²B³¨á¿øOV¥YíO5ñEgÔÙ=MQâ«=JýÊL­ø¶»DO(×®µk^ù^û6÷-yä=Ùc»~ÇµÁ+£Ãÿ®uçcyG¸¨ô&ÝØb Çã|t »ÃÏç¾Ç;A½§HÏY~Ü×éAEê¢=}â=IlùÍÃkE%XMù¯UåA¦ »röú5î>1ûyM.´á+x ©.8´°I. LQ+k²y¯L÷tâù)Í©û÷`=@¾´ûî$ÜvèD©A/W=@»Ty/Od?ÆA%:XÓr¼Ò×äCa+`­Tù+ë÷`8ÆáßªmÆ»³x¶Ùd?ÁXÚ§ë Îý£³|eÅ8ÂÆ¡Jõâ!#Óþjq>ÎQÝlá;quÛWN«cQXOP½ëdû*´PÑ¯eÍ)_¨âk.LÃØÞëÙf=K@Ù©5L¿ØéDR¸íÐèÄT¨|-ë¬éLÙÖ=LPêdùy²Êobw²¤ÙÛA¥òB`»»¾W»²°kú¥ÎÔ¨WÂ?¨¬òÛã=}¦Qëúçv°?Û¶0û,¨ù=K¬×«ï¢$o74á¯Txüñ#LcRê¤¯yßdU=Jé=HØôtáó·ÜtþLFÐKIb((ê%0¶Á7?¸{Õ¡¸kÕØFx©C6ëDS¸ÕÖLwÙ~éDM¸Í¯ÐcÙ=M P¸ÙL×Ø¦=K@ã©ÕLØÆV¸ô=JõÐWêH¸ÿL£Ù®ë$W8ý-ÐØîêdWøÚ©<L§éÔ=M=@ÊIÆ=JóÙBè<=M çiõ=JÌiÍFÐ4¨;àiÝ=JÏÃEÍiÐèdNøÞ©ÚLëL¸jµÛ.3*$Ðßè¤L¸ÊL~ soê$W¸Ò=JîæP8SÐÈÈ'Øë|æW¸ü=Jè¥`Ð»Ø=H0Y)aÐ?êt0R}Ì)ÅÐ7ê4=Kð0KÖéTXW¸Õ¦éô=HàIä©Ý=ûÎéIºw=HøÐk¿0á10«$|CÑ&9vþ(9t@ÓS*ÑÞôP{yà*ùDRM8ÛÞHeQÞôLa£ÛQ^ ÔEaÔ* W8©/Q=L¾^=L*©îTõÞ^WYÏK@ÄÚQúôVwïÚ·D`N=Mº=btý`ÏL³x(DÐ;§ÁÐÙÒÙÖ=LÐ©ûL!@GâÁîëÇò=;¾N=LjVhf«§Úô[VËnF0§]03Ø5ÇÂºüñÂDì²«$+fÈÐBÜ=HiäHj·¢â{tÛðuÏ©¾Íà&VË9®=H+Ï+Wä+Êpb8Vù_T=@À &ÎXGý®=}vù¿*9tÎT§EWùíW(ÖgüîëÖ*§Ò+vAá;ºnùO¹'Ï|ÙÄõÈ»'Éc*ò¢-Ê1Ég±d­û:E®HX¬û]Â^n;!ûgAyV;ÀPP$/5µû£Øb©aû@c·IÃö=K°£®PEvd]ïs­T0ôGüG­ínú¤wÿ=@àÅi²&ôøgrCÊÈ¿ü²ÒäÝw@¡3wÂÔ=Jç¿µAµ!B&¹áÄú¼û!JøÀÌ:«'=Iiñò®=KQw|y1'.ø $8îcOésÎi³çió $CN ²&=IÐïK*CÍµß{B6&òVC·}Ve¥æwÔ^x]CN ²N#á'RÎ?)öFqñÂWÏ=b:ÍQü»Ëþ¬¾=LNÁðY1f,aÚ¡_ù¥=I«ÃñÀû5UT7=K¹õ×)*Æ%º/§g¹5þÂ¼³ÁÆÇÅÁ=}÷ÿdÇ·ÇÃ§Û(·ÇaÀG¨GºÇÏÆÄ¯ÅÇÜÄÁ/©Ý«-u=@ø«'·åWNºÇÇÀÅ§a§Ò÷ÏÇ£»Ç'g'÷«ÃÇ¿åw1Ö¢=IóØ`£IªÉå½2xÈãK?=JõÎÏ<ÒáDésîHÄíÿ§<¡R7zØ¶E®v9/FG¥;¹£2ß7F}W%)ñ1DÔÄ^{/éÞúè¹ÿ=bï¥¼ùb ;M7Ì=K¬=L§eFTTttd¤9[.YVÏ½àDã3Jd%é)CÒ,è6ýGÿaÁþÎ6 ¢dôKÂ}=}üÏaåúk+ýëEf¢` ¢ôWæ¨5ì3ã.î`K¥y<ºÅqõË}MRÂÿ æ=}dá1niv¯Xw7T7wõ¬@¥bµù( zû×cM·þ'ûcëëÓ'_=M²ä¬b=bNJ²'-.cCT*û§§4'eWÞvóµàb¢l!5_¶]ËB½82³IÙáV¢¶ýçj/{íO5$kz8B}ø{ø/anÿ ?Ý2+}Ý^^i~æEÖãT±?2ã*H9»ükÊ{.Ãnì¤±7¦¢®E¢b§C§Æ7®tï%½+Ôx^+bh^}Xv¸¿ºÂÃè7vÄ[b¢?u°ÿÀÜÇYáÝ(Õw¦tº5¸E²£²ÃâèóSÓz{ÀÖSèÔñ[lÚ=b»ê}VHLÂÅQÑæfYfffYfáÐJ^aa1=H^GáM0b+:{{ûº;{ÎûXfW<ì`T¤´TT=J=~Òm¥·×À(éØ>]ËI|üa-Ç¹TGeóxSÅµ/G¡'¯ÅÊÃÆN×§âÃ£×w¾¿ØÃ@§fq­=M}³=}ùµG¡èÆ:@À8'ÖÛG¬÷<¶?èc; Áó§«_dÆÄ:°Áã|ZçVë¼ÿ<lQ¥y¡àÏÔ«ÅðtsÊ|=¤Æ£ÖÎ?((ùJ^ßâxî[õ÷R5=Kéõ>´­sXÅö~(Óôþîþí~ì~KÏng>ûuÈQ×ÌÖ[Ü)=@Jù=IÒìGð!ÙÇ5Ê/4O#ÿ¬0MÏ)%ú^k»QÕ¸©ÕÄÛCBçow¨çl=Û=Hç.V§KÈ¡ÎÌKYäS<d¨Uéä2¡éJbÉ¨CêÙË¢ññ~NÅ8=bÆÜÕ½/á>÷H[¿Y¼á]Û8Ô=LCÀÞ}Yo«øµþ=}ÿO²|p}5Û#Ü[ü|ÒäTµ?~54×ôg(lê~åÍºf/D×k»Í1=H;ø­°Ô=KÓ`ÞyíÚ¯áé**°8F Ò~*CRXª|,­ªô/öÌ§ºi¨DFöë÷Æ0ß[·¬ÃQ=@×_oò;ê`=K3÷üO»ô1O;±¡ ü«X>îÊC9XFÖøUyåW@×~=L²°_bûØãö3,p©pm¾¾g1Å¤Yd×N®0@$_Ïó¬eï yqgð­x·´À®Ì£ÛÕ=HÃ·Lâ,Eç7¢©?ÊÊ±-+TÍ²é«Æ8V[ó¦aº#He;¾Á´´ÖµIN¦Ck¾$ º;Í0·³¹b'F#B·´B¾GZ¼ÿ=}Ì´=L¼$¯ÆÌ¼£øÉ«Æþ>Ãs;¦Úbì/È=JÎÂ&f±¾yÜ¯z¶=M¶ÊvË/öT{â|5¤ÉuYepØR/æÂtHv>ç8÷:®e?äÉxÃ¤ÝØ e¶ç£Å¥¶6Q;Ú(÷*¿Ê/;µÎ¦Ã{ÁìX·ó{&2ÆI O.a¥ÓbÙ'S¸P¡J#Ä3Hé9(6_È£ìª.ÕÂqwû§ë­LO5úöªA8·ì¾É*×a=bÅRÁÞD@þc¹¶w®EA¿U¡L K.q5ù¨¼»¿-¨§¸n÷ýö½æ(^¿+I;¬£ùFÄèqCDdåSãÌÀÐ`Ã¹M¡6~(l 5P5YDçËJ´K¡ð5ÇÏf=HÐîY06:£dN=?Ü¹jâys*jacÙ×ØÀ§î2(dD£$ÔS¨»cÅlÄo¸ÄCý¸¥®.M£¿``kcºî©sHÃ/ø¶=HQ0»ìÆÊ=K,¢;®ÁE$1ba?8^z¿XÅÿ»I«íÚÙæu3£$,Bë­ùL!°Ãë¾ÿ;æÆ¦Mø¡=>»çy{Þ©ó®õÿW%=IÐ?=I:Ë?û5÷{Ø¹[UÀ£Ù Çc0Ma=K:¬`;I%2Óvø`ãì}ï¸=Lª:´&ÅKaó±¤ÝJ¸ô~nq&{I¯îÚKH:ÜÝZå.NH ê9ñø¿ÈódÝ9Ðè=H+l;gÈ0oµçÏDY=@Ó¯â+È§AÒ°Ñ8Ñf{8ë¾Ô´Åì=IÐ¶Fõ[ØH}¬´×=@ ôoÉ<¨'ºÌ¬IC>wJ¥O¶Æ³¶ç>çIeÇ`dÊá`ø'é6´>¶=}C(³cg8CKÌÙ>?Eê¹¡2§tûWèÓCeyy³ÑÙ6?D:§C¿Ä5þ¿Þûå¹·=Kº¾Ë´¾=LªÊIÐÁ/·»¿=b¤ôè,Æ2?ÅüþaÏµTÅ§¿ý®àA¢1»?(¯wß|ÉÃâ)ô¶ý©Fì6ý÷¡ÞÙÖì?ýi=IêùD´¾/þ¶Q=Lç;GßÃeX)Q¥=M(8ÇªôEL¯Ø'LZAÏºc¤Yf*&=L²®2Ä%MxàC'§ì¿?Å#öµÔLCl%4fZz§ÜÐÅÅJ¶ýKYºáõ§8_§ìÚØ=J¨®æ·^%å§¯ØÉÊÌÔ±«ÛHËXù»mWÊf@¿G7´Ç¬'8=K¯?(êIÉ­ÀÃð=JÕhI^Eø!:LÈ=Jg£ß(³ß¤µLìmÿÐ=L§[­®Ý|¢áÖÞOaSëüvÿ¤¡{=@ø=I§~OØ+ê$*«ºìÚHÝTíyæoÀ¼¬8Äº¼·)èäð a4À%Gøªßz»ÝÓ¨¦§ÁÁwõ³C¾ÛÓªv÷ÎþhûE·dÅÆ¯¦?xû÷¾¯G@Æ?£å§E*Õ¾û¯'a¥Àâ¯DÃÎG³ù`³Ö?¹·=}~59;FÓô!ooc7xÇÃ>(>¼T´3PÅó® i`ÊéÒyN8VóÁDö=}Ëð§}Hâ×£}=M©é»IlvG¡oª´V«'0#8È(ÓD¥éV7=KªIëGÍh ÒPYtÎUX¸©aÆÈ0çQïÞÊ°Ñw=@ÉùJ»Ù¦ý P¼í Ã¤¹g·[Yà)_6|=}íi=IòÜ@=J¸o®c%ààÁcg/¿¼(A»ìÆß7u¯+W ;ß>59Pÿm5K¿{-Û2ìÚóÌ<Ú¸L(Â¾!Iëam®®6Èu¿Ü»ÿGÙ>Vþ?@×=Lª;_Åb`=JAdÔb±µ;=@ÙÃ&)Ý®W.f=}Ì¶-¯Èx¼ú=Àh¯©Éé=I²ÁÑØjqDøÏÜînÈÌÅÇ#§dº_£=Iï3ê_ ÓøH¿^;i(ÖÁÇeÃæùHödHh)àhf=H<0ËÇ½Ö Êä(8ç/ãÉ¯GÚÒ=@|ÉÇ´³ÄW¶âoÆn'}»?Ñ6GÆ:§CÄd¢?¾ª¥4aEÍ»în@~A¬[»µ%=JùRµ²ë=L¨Ð¸b©uJÜ2o]èÜ;©éP÷°£Ô·Öcõ6¸Sãì*xäfÜ¼h©f%=I+ÝL¿G¶AÂÌyÏÈ-èéÕÉÀ<Éô8ç?ÍèËî=@=HùÉEÃ&8ÇW¤>í¹GäÔh{'G¦ü§«¬Ññ·áëN§´¢#Ò=HÓ¦×Z f¼÷ª¶¿MõM/fÀâÙB¿ýèä^4V÷ÇaBÙ6ãÄ%HÅþ¶ÈÀ(Yu£Ò@Àû(=Iº®EìxJaíXR×0È×ÜÞðä¨UJÆ!dY«Æ»'¿ùÈª¾ÃÅ£ëÔ'?ß#ROf ¿A'ðí¸Îøe=}¦ÛZ H@·¹Çªòoµ«gÖÙñ=Låñò=LZd=@iúíÙä:VÔåÙÖXAÐ®ic:Ü®ÔÝ-ÐOjúÞ·=}_«Ef}¦/BÆA¾=b·E§w}¿¾Æ%··CE?';|ý=HG!Â'Ý6!;2fÉòôÃÇûê¼ÿº+ÀýêÇ÷¼«·¹'Å'KEÅ»¥ÇÿÆ¼×p_v¼]r9*¥wTè¬';Ý=JjoÎ=I5ubIrÉ73~wæ§Á¢ª=KýZÂB¬Jçµwm·r¹O²=IÕýÖP]R¡3RÑG¢&#F_½ËzF=H×Â§ ¨<Ou¼äØm}ÙEt3'`CÒF$ñTà³ÁaÁ®g=I¯Þ$»°'UÏ07KÄ&`FÂhÑvq°øWfo¢xÆ¡Dõ°þW#eáä­Â:/^ÀoOû7¶=J¼^Â3q§~Ìe©Ð1æ=Jäï|{u°¸àã?¶çïun»ÀÍ=L®e{î¹KÞ»ñÀ×Âi­ãOEõ7êòCà{=@]wm0_ñkÄ_k¼ÑÓÚy¡W=@Ñ=L®F²/×a8è£PSÛ=@b¨ Í±Eäp=LÀj4 ÚfÖ[¼¤gOy~rkvÁM>;:¦y`ýË»ý£ÙöbÍ_x±Åðü·¤ÿ!&0t-®Ì}`W £mÏÔûâ7(7ÂA4=Lïf*{CüV=}a31ÿÀ¿.Y;ýå6:£½õ£²ýëZHÕþL¥¦ !·aAO¼½­å>·=LS·{}@ÎOü9»Û1R¹]ÊþD)D{èÚEÄ¡»q×;®®*ù¶àVùãÂ-î1«£½ÎÕ»7ûígÄ=}¹${0=Ms°*ÒOBXa­P=KænYªï?ÀÐ¢ü0=àj¤p JÏ®´¡ã¤Ã½h&¨=}º:¡¯eèÇó°|ªB*òâ¦ø:$~eWÇO=MôÆÁß¾Ö/ºµû µàA=bþ9](AöØwt&,¥9jºýÃ)89Î}õÕù°V¼)±ÄYÛW=K=MÖhTã¾*¥aÿ­#{LL%A=MËÒÆBå©oö7Ò½Ì9mU¾)<C]y(ê0;,ÛEªÛ© ÞwØn¶$¸®=@,wªNúÛ»3é­ÍùÜïtn¸DÚåì£CáTggÛor²ªþ]la¢e=@'þáå¯¼+5ªä=bº6b{c2âÂ3¾Âlô+¢·=@;sÍ·.·èEòcâ^xü)Ïq§:=}xï7ø#VRÆ;=@ü>ÊAvFÁ*=I$Î!ù=H=I6ä¥åá¹«<Î=Iwéij=}ÖcRQàVQ]®ÎD3Ç=LrfO/xòÂÎ²ìsî=b[A1×CÕOxtøP=M?*xeòÐ1!.0î.÷C]gZÀ»EÑ@MA4³bæÑQVi#¹ãÓSmyo0Ý(yýëëÿû:Í½²k'ô·YÃÍK³o-ÂÔ3ä`µÀ/gª=JÑ²e©¢c¢¼e6Sk7/9ÒåÜ*ô£ÚØí¡o²îü{;Òn£{Ç­=bâØ:¦Ëa³@wnð|§¢õ^ØO=LdýûûêJRÀ<ú¿¾/=H>>>[%´VèwÃÌT®Ûæ#LíKpYE#>(¬HD=I·%Ê»Åà«´¹¹kW¼u=IçøÅ4áuÜxf¹y7qe5ÓÕ¶úm©ìDbÆV-5Î<GK{|ÃÆÐmñà=@öa3¯~k£gÙ$®Ã×©=Lôqkq,¶à¬=J&F=KCT=¹ïÑ©²?näD54ª=C/ØµF_?cTô/1#ºÆ=bYoÁûL-ßb+;·ð£=bRlªÆ}´åJk}y~mG¬ä¶2¶ìmöÙ~NÃ´ÀÀR`CgQ#k¸0´Ún,àÓ=J-Ö1©ß=b2ªç Öc@dAö¿FF×Ñ--hûÖ1ë`G£åÃJN$x³=IÇÖ$ÔJE¾9îNzÝ½Wàfá»Eà+8UÛë¯Û®§_(·ÏìÖ«ïwVüAT>w1Ø²OwÅëÞ|¡M±éí#äe^»KºTB/·Ûç)íM&uAv£ù¸º.~ï:@³=}¢Â²XÂi½·.ûÃ´gt?V¥UX}½ÿ|JsY,ä&ýô­i.üNÉt²Þ{Á¤uzé­ê*¢k&¾aÛ1ãaØüXFþÔçV¥Ã¤æNºÓóq«ÙO!¯åìÁÀ) ½èYe:²Zn¬=M;ùÇð1kó¸àïaJ.øyÏ¾8¹ïf&¶üÃ_]]48=I©ÉUÃÙ°=}QÉç]½Ï-¥`ÝXH$¶d=}è1}Zá=K7øyðKÕ=@¡ÁÏBÿ¶U<veqèü[5Dq£»íîv¥¹'P=}ûf¦ò*Þ[_?=H³=IÎ'6ÙâIr0e+^·üJ¿æª:°Î$oX!P?xÆHëß.´©i¡J{M½X`~Ä W«Û{6na©eÑ?l·Æ³Ë^d=IÂ²äZu@årìéQ¤,7[WX;qöÎù>¾1Wu?ÔQR->J¨ñ¢to§ír<Ã¹xÄÛ%=JðT~­¡UÁn¶j¬¢<#/Ga¿l±eÀuOÅJ03Z¨ÁÔT-Pí4¶kMv¹òbLå/ªÈôOWn³huwÜ.Æ|e óRE÷Yÿ2üIÙ§vLSUV«<å×E«á]v3ºn+/êÀ4«õ`£¾. ¡5¶$éÒÎG#kZ¶ëQCõÐ$9çwªÜ®!>ê³±³ìY ¶è6-j«Ö]ú?ÞÅb×eøWFtù5E¶¿¹ª©|Ì°¯ÕÍT©=L(Úï¿³µ=b÷Ú[&ÔÓ¤î=bÜjPñB«Uÿ°Ãz!·/`°/Yù4ùÑç#;Å$ÎÂá¤ãWáô°ùÎ»0ß4GhfÇ=J4FTè~ÑÔ ,T'FPéÅÙW·=MX¦Á^­AßðùØg5u±zªè/.±Z¬AçsyD`¢Ì+ZuÍ;Òµ_q¼¤,Hý!Lãd!§kGYeÝù¼FRÁ3õVûAVÏ£Uº)ÿ»Ò6yògNj`¦AÛ#ø½-Ð9ûa?DßVë±5ý=J¬&Ò^K:÷NA¸(ì¥R<ÿpq¦Hõ;bÜ*Ûn¿C]|0pkb^r0ç6.õ/r0èYÞ»Rr±én-ÛÐ=J¤yGÝ=J¨FtØªN=Jú=}MØþÜ=J¾Ð)=KéïMØþÜ^uXz4q=Hé­=ÒiðâpTlé}ÒqsàSÑ·éLMQ`ql=KòÁOícRGmÀRGmÀRGmÀRGmÀRGmÀRGmÀöÆ]ª'ró½qiï£³¾Bz¦=}ùÅsB°Gp`=@}ýü}|ÆhksovFÂÎÕÔUâþ24¤lqQ1{®.®ÞrªG«ÇÇºjZtmiê«p^sþª{©T, èEa=}xY?Ê²:³Ñ{:;|â6¥½Q$}ÎæpslÕ$jñ*òtNS¹1z#_å/¿;vUÜ§ìð2§G[zÀûoSrç%±~¬Hbv#u«Mº¼-ºE?rlÕ=HÈ[ YqXR´ÐÞëwèyë0=IjêDÄÛOìNrgÚ=K{ókÙ#Ä©Ä§¾ùÆ7|7Á}=ËG3÷o®cKX}ÁOÅSÂÇÇÇl¥ç{Ý¾`D²RVq¨=L:Í´Lz¼_²çñ,Åìg²ýcªxD:{K¯ÇÈ", new Uint8Array(96365)))});

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

  var HEAP32, HEAPU8;

  var wasmMemory, buffer;

  function updateGlobalBufferAndViews(b) {
   buffer = b;
   HEAP32 = new Int32Array(b);
   HEAPU8 = new Uint8Array(b);
  }

  function _INT123_compat_close() {
   err("missing function: INT123_compat_close");
   abort(-1);
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
   "a": _INT123_compat_close,
   "f": _emscripten_memcpy_big,
   "e": _emscripten_resize_heap,
   "d": _fd_close,
   "b": _fd_read,
   "g": _fd_seek,
   "c": _fd_write
  };

  function initRuntime(asm) {
   asm["i"]();
  }

  var imports = {
   "a": asmLibraryArg
  };

  var _free, _malloc, _mpeg_frame_decoder_create, _mpeg_decode_interleaved, _mpeg_frame_decoder_destroy;

  EmscriptenWASM.compiled.then((wasm) => WebAssembly.instantiate(wasm, imports)).then(function(instance) {
   var asm = instance.exports;
   _free = asm["j"];
   _malloc = asm["k"];
   _mpeg_frame_decoder_create = asm["l"];
   _mpeg_decode_interleaved = asm["m"];
   _mpeg_frame_decoder_destroy = asm["n"];
   wasmMemory = asm["h"];
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
  return this;
  }

  function MPEGDecoder(options = {}) {
    // injects dependencies when running as a web worker
    // async
    this._init = () => {
      return new this._WASMAudioDecoderCommon(this).then((common) => {
        this._common = common;

        this._sampleRate = 0;

        this._decodedBytes = this._common.allocateTypedArray(1, Uint32Array);
        this._sampleRateBytes = this._common.allocateTypedArray(1, Uint32Array);

        this._decoder = this._common.wasm._mpeg_frame_decoder_create();
      });
    };

    Object.defineProperty(this, "ready", {
      enumerable: true,
      get: () => this._ready,
    });

    // async
    this.reset = () => {
      this.free();
      return this._init();
    };

    this.free = () => {
      this._common.wasm._mpeg_frame_decoder_destroy(this._decoder);
      this._common.wasm._free(this._decoder);

      this._common.free();
    };

    this._decode = (data, decodeInterval) => {
      if (!(data instanceof Uint8Array))
        throw Error(
          `Data to decode must be Uint8Array. Instead got ${typeof data}`
        );

      this._input.buf.set(data);
      this._decodedBytes.buf[0] = 0;

      const samplesDecoded = this._common.wasm._mpeg_decode_interleaved(
        this._decoder,
        this._input.ptr,
        data.length,
        this._decodedBytes.ptr,
        decodeInterval,
        this._output.ptr,
        this._outputChannelSize,
        this._sampleRateBytes.ptr
      );

      this._sampleRate = this._sampleRateBytes.buf[0];

      return this._WASMAudioDecoderCommon.getDecodedAudio(
        [
          this._output.buf.slice(0, samplesDecoded),
          this._output.buf.slice(
            this._outputChannelSize,
            this._outputChannelSize + samplesDecoded
          ),
        ],
        samplesDecoded,
        this._sampleRate
      );
    };

    this.decode = (data) => {
      let output = [],
        samples = 0;

      for (
        let offset = 0;
        offset < data.length;
        offset += this._decodedBytes.buf[0]
      ) {
        const decoded = this._decode(
          data.subarray(offset, offset + this._input.len),
          48
        );

        output.push(decoded.channelData);
        samples += decoded.samplesDecoded;
      }

      return this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
        output,
        2,
        samples,
        this._sampleRate
      );
    };

    this.decodeFrame = (mpegFrame) => {
      return this._decode(mpegFrame, mpegFrame.length);
    };

    this.decodeFrames = (mpegFrames) => {
      let output = [],
        samples = 0;

      for (let i = 0; i < mpegFrames.length; i++) {
        const decoded = this.decodeFrame(mpegFrames[i]);

        output.push(decoded.channelData);
        samples += decoded.samplesDecoded;
      }

      return this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
        output,
        2,
        samples,
        this._sampleRate
      );
    };

    // constructor

    // injects dependencies when running as a web worker
    this._isWebWorker = MPEGDecoder.isWebWorker;
    this._WASMAudioDecoderCommon =
      MPEGDecoder.WASMAudioDecoderCommon || WASMAudioDecoderCommon;
    this._EmscriptenWASM = MPEGDecoder.EmscriptenWASM || EmscriptenWASM;

    this._inputSize = 2 ** 18;
    this._outputChannelSize = 1152 * 512;
    this._outputChannels = 2;

    this._ready = this._init();

    return this;
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
