(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('web-worker')) :
  typeof define === 'function' && define.amd ? define(['exports', 'web-worker'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["opus-decoder"] = {}, global.Worker));
})(this, (function (exports, Worker) { 'use strict';

  function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

  var Worker__default = /*#__PURE__*/_interopDefaultLegacy(Worker);

  function WASMAudioDecoderCommon(caller) {
    // setup static methods
    const uint8Array = Uint8Array;
    const uint16Array = Uint16Array;
    const float32Array = Float32Array;

    if (!WASMAudioDecoderCommon.concatFloat32) {
      Object.defineProperties(WASMAudioDecoderCommon, {
        concatFloat32: {
          value(buffers, length) {
            let ret = new float32Array(length),
              i = 0,
              offset = 0;

            while (i < buffers.length) {
              ret.set(buffers[i], offset);
              offset += buffers[i++].length;
            }

            return ret;
          },
        },

        getDecodedAudio: {
          value: (channelData, samplesDecoded, sampleRate) => ({
            channelData,
            samplesDecoded,
            sampleRate,
          }),
        },

        getDecodedAudioMultiChannel: {
          value(input, channelsDecoded, samplesDecoded, sampleRate) {
            let channelData = [],
              i,
              j;

            for (i = 0; i < channelsDecoded; i++) {
              const channel = [];
              for (j = 0; j < input.length; ) channel.push(input[j++][i]);
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
          value(source, dest) {
            const output = new uint8Array(source.length);
            const offset = parseInt(source.substring(11, 13), 16);
            const offsetReverse = 256 - offset;

            let escaped = false,
              byteIndex = 0,
              byte,
              i = 13;

            while (i < source.length) {
              byte = source.charCodeAt(i++);

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
          value(source, dest) {
            const TINF_OK = 0;
            const TINF_DATA_ERROR = -3;
            const _16 = 16,
              _24 = 24,
              _30 = 30,
              _144 = 144,
              _256 = 256;

            function Tree() {
              this.t = new uint16Array(_16); /* table of code length counts */
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
            const length_bits = new uint8Array(_30);
            const length_base = new uint16Array(_30);

            /* extra bits and base tables for distance codes */
            const dist_bits = new uint8Array(_30);
            const dist_base = new uint16Array(_30);

            /* special ordering of code length codes */
            const clcidx = new uint8Array([
              _16,
              17,
              18,
              0,
              8,
              7,
              9,
              6,
              10,
              5,
              11,
              4,
              12,
              3,
              13,
              2,
              14,
              1,
              15,
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
              for (i = 0; i < delta; ) bits[i++] = 0;
              for (i = 0; i < _30 - delta; ) bits[i + delta] = (i++ / delta) | 0;

              /* build base table */
              for (sum = first, i = 0; i < _30; ) {
                base[i] = sum;
                sum += 1 << bits[i++];
              }
            };

            /* build the fixed huffman trees */
            const tinf_build_fixed_trees = (lt, dt) => {
              let i;

              /* build fixed length tree */
              for (i = 0; i < 7; ) lt.t[i++] = 0;

              lt.t[7] = _24;
              lt.t[8] = 152;
              lt.t[9] = 112;

              for (i = 0; i < _24; ) lt.trans[i] = _256 + i++;
              for (i = 0; i < _144; ) lt.trans[_24 + i] = i++;
              for (i = 0; i < 8; ) lt.trans[_24 + _144 + i] = 280 + i++;
              for (i = 0; i < 112; ) lt.trans[_24 + _144 + 8 + i] = _144 + i++;

              /* build fixed distance tree */
              for (i = 0; i < 5; ) dt.t[i++] = 0;

              dt.t[5] = 32;

              for (i = 0; i < 32; ) dt.trans[i] = i++;
            };

            /* given an array of code lengths, build a tree */
            const offs = new uint16Array(_16);

            const tinf_build_tree = (t, lengths, off, num) => {
              let i, sum;

              /* clear code length count table */
              for (i = 0; i < _16; ) t.t[i++] = 0;

              /* scan symbol lengths, and sum code length counts */
              for (i = 0; i < num; ) t.t[lengths[off + i++]]++;

              t.t[0] = 0;

              /* compute offset table for distribution sort */
              for (sum = 0, i = 0; i < _16; ) {
                offs[i] = sum;
                sum += t.t[i++];
              }

              /* create code->symbol translation table (symbols sorted by code) */
              for (i = 0; i < num; ++i)
                if (lengths[off + i]) t.trans[offs[lengths[off + i]]++] = i;
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

              while (d.bitcount < _24) {
                d.t |= d.s[d.i++] << d.bitcount;
                d.bitcount += 8;
              }

              const val = d.t & (65535 >>> (_16 - num));
              d.t >>>= num;
              d.bitcount -= num;
              return val + base;
            };

            /* given a data stream and a tree, decode a symbol */
            const tinf_decode_symbol = (d, t) => {
              while (d.bitcount < _24) {
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
              let i,
                length,
                num = 0;

              /* get 5 bits HLIT (257-286) */
              const hlit = tinf_read_bits(d, 5, 257);

              /* get 5 bits HDIST (1-32) */
              const hdist = tinf_read_bits(d, 5, 1);

              /* get 4 bits HCLEN (4-19) */
              const hclen = tinf_read_bits(d, 4, 4);

              for (i = 0; i < 19; ) lengths[i++] = 0;

              /* read code lengths for code length alphabet */
              for (i = 0; i < hclen; ) {
                /* get 3 bits code length (0-7) */
                const clen = tinf_read_bits(d, 3, 0);
                lengths[clcidx[i++]] = clen;
              }

              /* build code length tree */
              tinf_build_tree(code_tree, lengths, 0, 19);

              /* decode code lengths for the dynamic trees */
              while (num < hlit + hdist) {
                const sym = tinf_decode_symbol(d, code_tree);

                switch (sym) {
                  case _16:
                    /* copy previous code length 3-6 times (read 2 bits) */
                    const prev = lengths[num - 1];
                    length = tinf_read_bits(d, 2, 3);
                    while (length--) lengths[num++] = prev;
                    break;
                  case 17:
                    /* repeat code length 0 for 3-10 times (read 3 bits) */
                    length = tinf_read_bits(d, 3, 3);
                    while (length--) lengths[num++] = 0;
                    break;
                  case 18:
                    /* repeat code length 0 for 11-138 times (read 7 bits) */
                    length = tinf_read_bits(d, 7, 11);
                    while (length--) lengths[num++] = 0;
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
                if (sym === _256) return TINF_OK;

                if (sym < _256) {
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
                  for (let i = offs; i < offs + length; ) {
                    d.dest[d.destLen++] = d.dest[i++];
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
              length = _256 * length + d.s[d.i];

              /* get one's complement of length */
              invlength = d.s[d.i + 3];
              invlength = _256 * invlength + d.s[d.i + 2];

              /* check length */
              if (length !== (~invlength & 65535)) return TINF_DATA_ERROR;

              d.i += 4;

              /* copy block */
              while (length--) d.dest[d.destLen++] = d.s[d.i++];

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

            return d.destLen < d.dest.length
              ? d.dest.subarray(0, d.destLen)
              : d.dest;
          },
        },
      });
    }

    Object.defineProperty(this, "wasm", {
      enumerable: true,
      get: () => this._wasm,
    });

    this.getOutputChannels = (outputData, channelsDecoded, samplesDecoded) => {
      let output = [],
        i = 0;

      while (i < channelsDecoded)
        output.push(
          outputData.slice(
            i * samplesDecoded,
            i++ * samplesDecoded + samplesDecoded
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
      this._pointers.forEach((ptr) => {
        this._wasm._free(ptr);
      });
      this._pointers.clear();
    };

    this._wasm = new caller._EmscriptenWASM(WASMAudioDecoderCommon);
    this._pointers = new Set();

    return this._wasm.ready.then(() => {
      caller._input = this.allocateTypedArray(caller._inputSize, uint8Array);

      // output buffer
      caller._output = this.allocateTypedArray(
        caller._outputChannels * caller._outputChannelSize,
        float32Array
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
              ](
                // detach buffers
                Array.isArray(data)
                  ? data.map((data) => new Uint8Array(data))
                  : new Uint8Array(data)
              );

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

  function EmscriptenWASM(WASMAudioDecoderCommon) {

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

  if (!EmscriptenWASM.compiled) Object.defineProperty(EmscriptenWASM, "compiled", {value: WebAssembly.compile(WASMAudioDecoderCommon.inflateDynEncodeString('dynEncode0085ùÊYÅÅDÚßWÂsßb=}=@fsóü=RÍåN2=K õ[ñÞvÔõçzCÐåéòÄèTµª«HmH·ÌÕO³¶ðÆDËÖ>óh;¾jcÀÀ>Ô#ü1=K6Y°Ð>êèÐ£lÐÞëÝw]A@AåJ­<Õ<eÅÞD(^üÍDheý÷G¾á¹À=K5ÅÝÆ¥®ÛYWUOÊëÌ¥U[sÏ-;§Ù°³g=KÖÕ4=M=MÆÉÏ*­GÇÌìÜIU¢¼½áËÉ,C=@ALÖAnPÌ:§Óe©ÑeÑg¹eÑf±Ñh¡gÁÇ~HÜ#ý´M,`ti*aweVØ|ýíÚ%^Ø+â@R°|jÛ¯þ-ÖèÔD5£PLÜÅ(óhñÒoÖ,¹1ïjLÚ=MèRI<<Üo÷=@Ù&ÿ>ð;s#ÛF÷¡«ËÍËÅ(+ÅÒËò_?úzo¸wAVÅ¿ñùÁUö(XÓ "ùcm×%ÐË=âXNóR*nÖ¬t#,.ÞãÛv<sv;é UÈ©"ÁâdLD1²lowyD ¹G°ËùM=M4Þªt=K:K=Ll=L¤IôÖ?.¿=@_1>Òó¬Þá¼ÇBAéà8@*.à÷Ì;¡$/vÒÁésië·.QÒg½PQA²âõKSw½ôvv ´ êkLQQQQQQã{pYÓsÝÊ,Z&¯®~3-ëpg!Mþ«"®ã=|É=gÎOtÓgé¤ì¡ä£ÉÝyÔ"ì¨÷ ßu«lÎ-øõ§å3bûãJsæ£¨Òæã;È¯ø0À5´SJ]-X¢bfò?ÅØm·ÿZumu=M»°_Y_Ù3`ÛB¨c_¡döÌó]S1=M=@,VCÂV¾=gÒ2Ò&à=}ôÿ½2ìn4Á¦`VÈ=H¼òR/¬ãQø­B´ü¶éGWøþ8NÃi;Ò Je=L$e>»3-Ø Â¢Î¹zûmµIÌT7y¬~< µÙkCc7[úí?S¹Ó|¤=M%`^u÷ÈÒs¤©þrÆE|Vù]tû=Kvµx§¯yl4Ô=LÞ¿¡{=KÞÙç¬B%s*bKCÖHÉ9ºEVÕ¶}äA]IfÚ<bzg%ñüòèeü¢.ÿô8{¡ä¤y;/æ£Õ­óÉ-våÈirÙ¬aþå<^âbÝ]ó_òÓpqIxÐb2Å¸q=göÄ¡R?Y3Ò |Öè?½^9¶®Ba78Â¶-¶ÍJ]íøy2à<Ão¤=H¼ñM`FfÀ=Jµfç=IE<·Øã$F[¯Ð-¹-Õb¼Å-äà0¿ô&(»¦þ`h>Ý»×Jô³Ûùù*XmÐ©Vú¸ÓOôRh#|=}¨ëNxóï?Òb¼ÈJ°»â©þ=I¼õÉ+w;bè}ÐvÃ,¶?ýl·Üüµo?éðsÿ·s[bèé»ºÂÌ/}"Ã=%JÕsf½Pbÿ ¶Z@ü/tûa¬ä%Ð(dbåDæ×wÝÐm6ûê5ì×TpÕ@;÷¶^J^È/)²Bµ¶& {%=KëÅãWân=Hk"Æ§=LaÞËeÈ×Ù=K+j°s¹ênþ­âw·ù&Û­f¦ÝQÎÚä­Aÿm²¢ÑÇ=JypÈI[@AHÏ°Fsw¥þ¥7n=M ño<^sQ£3a×hcD¸:^4ÒF§.¿?Åô!p¢Q¥ªG²ªïAìKZCÕâåÃ%À<gÝ¾£è·uZØ-×0þ)Ä¦ÃÝ§N³Dª^jÑÛÌ¶»¤×hcËÉÃcÉô:æþi:û~µCîÜ=@;1«ûØTÄªÙË#fàÐ«{« s÷çô=gr#å#ÁÈlù)É[ÑØä^Fé¢´·=JgjÒ&°#C=Ht?ÜüÑ¤(w>=}×ÚAfxØô~=g7³ÒgCÀÇXöD¢>¶WkîÈQ4ÒØ,½Ñn·Ú6à`SÐ½!ÈX=}"5n_yFÈJW=Hæ=I£Ä*Y½â=I âncµÑK=L;Ñ+-FszîBË~ã=Hª51Ía5»nÇE]ÝÃN=K/ò·BîÀ3?nøÍ©}íÝ§UCC}Ì¨Vz®Õ@d,jô2«ZÔ%_fb=gÅÉXÆÑÛQÕÂBn8~ +iiKM¸WÕþ-Òye¯ø.Eóg=@"=gr=îKvUk%/Ùñ0¾¢Ì2*ëÄ¡[»èj{S¥«¯N¯{/W/¤÷ïFB5iÆ)êOs.Ä×P_ »&(ãg¨TÚõÍVè¤Ü=Ló2fñhRà?I=HN¨ÒB.¦ÉÑqc%/sbmû`=L"Ã gØRò|ØR¯`Ø6.ÑÆ³Atcõðçt=HC½çé±Å¯ñ?¼ºnÍâK.KëóÔ7¢Ø·üvüÅéÚ=@ÏëRéøJÙØàÖ¶ýõ·^é¤ÏgiÂ;åôðç¸±gô ÂUjiPxÆ¢Þ®¡6¶çÊÚï¦ÕfKLW$er¢¡=@La ¨=LZ=L-pBâÎô£J×9õËT=Hâ·V®ß·­ég0²21¾Mì=IÏ=I¿²yà_å(»HCßÝ¤»è=@zÈ;º¬éM=Ix=Ò²Â¡ï¢ÇýdyÇùÕXÃL¼UûóPó¯ÂÉ¾ä¿É¤ì©°aÉÔ9.WméÙÄ±6 u6.6Ûí7ÊèÓºdJÄ¡ÝN=}#-·2%,£çª1(.6ÉÚäÔK¤K}½½ÕÍÏ½q§sÂÎ<r=MÈ;>z=H=@©YCfpäAý`1ÿÇ<³Ê9i}p¬ÍMÝ÷)Ur»YütèÙÊ´¼â¹h×ÛÔKk¾OBEÄ:#O=J­øÏÓqVÀ¤îÜÄÕ4ÊÕßí!.b*ÎhØr/1c+YÌi-1c>òuOÀº.EIÝÿ.,§&Ý&dºãW®M=J-cv×`6taÍÒC1xË[Ïíªhk=J&B<r¶ EUi»>=H§åJ°=LþÂL]º¦ræ¾L£Cç]°°gª5üA¢jµ±=I=HÞ+ÙIÈ;ë&»vò:Dª8®£=M@ÚZ¯ÌxAßÉ)+E=MzK+×%æ%C_aôß×ôÃÔE}6Þçb=J%ë=M)í)ýÂÑa¹7»=Jì·µÏtIl:,=}ÔGaºSöWÃ=IÑH]ÉáÎÎ-ãÿeÁWÇi£ñb9id{ÂÍÐw61ÅÕª¡Ç=gºZ=L(óöåFTþAæ=gHDÕÀ<¥YYTME=H©=Izxq>þùå·h:IÈ A ¦ÓYíÐ^6F@ñú1ÜÄ¨úÿ¹LðêI³:ÅraÛÆ=}µM¢kMéÿ YrÀ¯µ(â±Á{KÛÎ=HÜ«+Ïyÿ¶@µÿ=MÅ.â9±±þÂá¤Õa-Õt=}=L=I%²=I4ªkÞÌØ¡<0üâB,ÖC&SÏ +)Llê:qCaj$Á n!åcºÏÿ´&nðq&¥B3ÓñôìïUXRÅ5vNdu®XBýõÝWÅ´ÒÐXX=LÑùæ"ú;®UÄdáH+4]ñÇ­_Y±Ï2,c¬Þæ·XxWÈµA;YP:÷TøX1úK+ËF,cõP=H=K°JGóðBµ²o0ï±Ç8?:b¢`è"Zp¹ÿ$fõò[°éèx=J=Iý»:.yþbË¡7ï(v{î#ùoü]È7¸vÆTl{K{l¼¸giZÁªjB-è?­Û{Ãza=JÂ±(¼ZÔx¡øGàÊ4î²*4á-ìªr×4ÓðWgîC@ÙS$h~¹4=@}a¦=Mn5îämÀéèjjzK,e./=Hò¯ðùA=Iç#LB;NÎ=JâYÔ=KíûmFy2=L0o=HE­çÀ=M°¦~i/Sn¢»¢ªõêãu/EfzyJÎ?$Îy_Z¬7ÂMÔx¬·óÔ;Ñcvªs$=HÄëWv¼ð`=J®BuðbüâAè&RÌøliÒñT =@B=@ä]kLeÌêú¥IäÄpA9´IýºçÍ=H}³=LæÃ3íËA¶} Bic~£=@[ú{qH=}Åmq¯ ³½ÁpÂx¥A[)]öN¢pQqf[=Iý_fà(?m¨ç#;6sYö$6L&¯{RñÉÔ1~#¡A9³6q»63o}=Lz3!jd[)£`ÝõQ(=@±{´"=KUÅ=Ä+bP-WAÈ×öèïÜþ®LbÔlÜ9ÉÊT¡k&m6ªªlíÌwe{Xì!v!ä±ª¹=L&j=èô(z$=Jø¯æÇúÚ¬%w8~Úÿ_°/xüx=ID£¥0_.×ªÿõëc)töQ &=gg=H¤«£¶ÔM¨ j§hã=}oØcHà`ùª=~cÿíxÅCTæ«/d¡Ç(É)5z}]B­dÐt"¬ ¾cù38}H¾=@=HÀh(RkW|=M,!hbAªüôÏ3yüØ8%Çögú¬½lÁx#u£¡×äu<Âfòr¡Ò}óôJb=H=Mt»¹ùT@ô­}p)sD4TaÄ=³Öûvw[Z¾àä»EwÍ£&0)ðcJ=IÄÄ¢ênÈÕSÈ{ÂzHØ¾Ktúó*÷=Isi7~B8ËC}í¸ðr¨N)Ãÿ[ Näkâ3.¤ýÏÌ©¶eÅÌFáG=°Ó}=Mï>×ð¹ÝSÀ­Zú!àkÃhº¸I¿;ZÕK·Ábª«lxºkÆ ¾ÿTe=JR+»°Ü.p¡,Làåo_r@=Já»÷=Lë"ÔC=@iÃ`Øpt^aXæü@b=L!À!Ò,iïfä¯Î/÷ïê¾SS¬þ©HX¶µCÜëÝ(FÀêÍEË]þ©IåkB=J=VÔo÷t=LLZéØ!Â½*íl=L¥?â®abd|êÅf&ç9ÝÉ=L;à=I¢qÛ=g"´Aàªh[@"¢ýt~iD¬Í»=L!OâØVZo«)2çCÃÚ=ô»sûDþ©&t=I=?ÁGÏîîÍz+ôã=L½ä|¢SÍCÇ«U$aÄ$¹Ý=}ù j8Ô©üÍëwäÃ¯²-¬7tê|/t=J¯il¥¥þ%z¥=JPë]ÓÍ0ÿØ-=}é=HúkÑ:_º°×-¢gÝ?n¤~óª3?fâ®cbYä°íüQáOi7¹ðµgç^ËÛ;y×Xbz*°¨÷ºÉcAFÑvÖSÖ5L¤Âpl±ëe¦3=@J+|Jìb´!ù§P3=}­{R¨ä=JlE2QåÉ¨ñmhs=¤IÄ_Ò{vèÑ|â²¡tj¸«$¬õÛõ6­h©ËmJÚx¨íÎJào¢¯pP=J]#ÃI¡!¢[Ü8lKb¯[>rmþÍ=Hûr=}K½¤)qÁnº©¶z=M¶=ÌX=pY|äwt5«¦). Zin@´îRñÄá=HTeRbè¦­7ÆH ñÌØÛ¢³W,sÄ ¦dðkÙ`Ìy¹¹gi=KCqJµ7Ò=I´2¤Ø|b(KipÊhYM³3&I­Í²¾&òUsG_´këÍRUÏk=HÁÈ_ÍßDÄW¬¾«Õuê]¸èiìl==IoÅ=K±Ã~õ<ô=KOµºäý¿#?TDÛ§F¾{fÀ)­9ÑÚ;ºlÅ*{Áyèrx>KÙ/½NÙÔ¥¸j#¨@a=JJw¾ÎAv¥k;ht¾kó*ÒìêZµvf}øã&É¾)>¡5v¶í:1Á<Å{ô¸ñ=gx&È1GÁOÆ6Ù¯_ÕE¨ÒiG¥ÃEÝ2=KhÎ}¾=K¾:wÛ/îRå.Ã¢x*xN2ÙdÄÔ65Í²0_s0³WÆÉd¦.¤|ÆêHFZ¬c&=JDwhín4¤TÓ=H=@á*q8m8äRAýôBñ<Nv@QeYÙO£zhËp5&þÍurù9uÈ¤ ¡nÖÁ©FDÕÏíEÙ£i*>Ã´?cßY¶XD±=ôU7`oMy}EãûÅ£4/nH5Oá]õÎî÷%ÁJ¼=Lêc=}®Þ[ÀY!BêO}PütcRüýt;=KE½L£v8{+é)ÌØ7´W=Kÿøèo.¶Qx"åh·KÃþ=LÅF¨Ò¦NÈì´)LõôÜkä+½ÇO i*w{PzZØ4C>ä6D©áGãºaâAue½ïÏ&¶=@é=¢^K5g¢üv_IëA­{ôA¸³jv?D÷®úKL[JGf=L9JÇx³Ú=INÄÁö¢È3ËÀ±%d9¬ürlãos=Hi2ÝwnQpðÑåÒÓs?´8ºñ$ÒÀW¼]ÇÛ¹qÑ!¹û=HoaÉxfKÕ|¼ÌØ=@Ãn=}~Aªã6bìFÁyÙäæóÒXö=Ùñ ÿ2=L¯QL=gºNø·:ñÐ=d:¬aÔËØflfð¶×BÜêÎûfÄ.±vrÇÛ9>ç4M¤¨¶X¾n«æ­á¼*)õ÷®´w×^"nÀþVò*`®²ÐSkßYüªûdHçQ=}<îD5¸Ôhó1$=«éÉDìiº¾]ÙÜþ÷¬éEc-½áHT¦0rùÿ78Þ/|=H@×Û´0¢È¢ëâ%MNpë»=MtN¿º¸: `_]I=J5Ø=K±#=@F¬¾¾Æp7=K xò?bD=J(Û×çéØ?SE0ÿv£Ñiöçß¨u5C«pØGªß*¹Ãv3Ô7ÒÛþ$Ù~F/£EÏè²¥c=HK8îÏ*=L$Sõ¬hãÒnjQá=g>öÚPÅ÷bªØx1ØÒçÀ)ÍàÝ».³»êVX}=LhÓn>SH=Jµäm®ÎO"®Ô¢=@m¶­êÑLS=@T~ê ­ýW×æÍ¸ø¿+ØTÿÝ8ª¡ÐQð Y`¾ò<áÅé=IÕ|[èkO ÙBçG !ÄÕ£þÖè¯åb=}|6²ZR >É1¯TrÎÅÿ$ö2þßÝ]9Ã3ÕnE$SúåZjÅfÂNÂ@m.>6Ð×©ÇØhFxÁlI³Ùiz¨Ëú=J®Whÿ3ÙyÒè#åtùñn¤sú²k>¶pÙ·÷Ùºs(Ìùe1·îéeh)Ù!F¼i«uÙá­g×ÍÖÄ=g=Fá®¦íU«ÓJ­pÌä±ùª­zà>ØÄ¿d.(×RÈy:èTäs=ÁNS NÈ0Ù5¤³a,H¡Gjlz#ç<iA=é=IÄíÈ5çâJþÑ¶Ol½!SW£ÓLµ¹[=@ó¹à¿m)1Upë)bE*Y!LGyù¸}V¶¥Qy¬ÃfçÑýåßbµº=J$°×¶¹$Õgô{ç7wtCêñY$>ùËÊrX=Hõ)P©aUÄÍÑëµ¿°fuá/Où=M@ôÖÙ-TCúÒ[®k$=K»æ]$&ÕÙ´.Ö 8ûÿY!)(ot÷=I&¡Á«aº`õx ÷ÇÐ£3JW¿[>u$Îbkx~Q¸Ø)hÚ­Mîs 9à?üû1ýÖä~w B=I3@pp/ôZ²¬AÈ)fÌ±BiÌ-rÛ¯A¦ôÒÁ%Ø1¥DKhÉ¸|øä~$aF©æÕ<!ÕØ*PÑ.¶¬ýLrvñä÷ä¡ZâèY$&íc=ImT1Ï=b·´È>9Lõ¹,ED°À4í}#Þg§nkNGáS|=}D0Ób=JhS#C<n Xâä]v=@q¯BFçUÅhÉïIúÕX§ÒHäyÒ¸6õ¼]~r­eå|d=@îJLì.²ó_u°®ÅÛ××_§Øª9ßqïÙ®|¡¢Ê3ÒÏÈu3®EýTd¦¥|*P+¯P/*v>!üEÿXýÔýÑÞ=HnP·r>uv÷hä@ù=H$[àJö(27¯pL×?Ü*u×à®ÜÂ<0ãOö°ªµ¿ûì¦-ÚëÚÍY]Õ7ºÓ=@GÄ31=HXX·CéZx¨´ÊÞH½(loeo·F)Æ(F}7ë=L´B¥ïútä£Ô&SÉ8=K<Iºt5o,hD¦¼xRHÈÆ]=LØÖLºML#o(Ò¡=.³n#××´°î3ì=I&<C´t(äÉÒ¡=I °«"ëÏ²hO¥àí6%¿wTó ÆpÇìaÚDÝà*»òUë=K8Qít^ºSCÖ 7ö.CiêfPËêÂ l·Àó+ª×DZ×*,M®ß8ôÈë¯hª¾j´,hòoÂî«íà0+±ÚA­±QÈ=Kßü3=J EÔ¶r¯®=Ky>ÔýFÞïÕS}=Håh°î²O<²º#B7c=}µ±=@N^²Ø5~ «èx=Q Dç[ý<wJTæao4.vÚ?X_ÑÛZ[Ù`®3*ZÞVPÊ@!:P^>ïû>´=r÷c³l¾ÁºEnÛIç&*ò5M¶Ëw³*$ÜA&=g´RÂÒád XÿhåÃk*¬¤R6ñXñL^1¬^1,]Q»:þRUÁH+·T7n l]kÁ QAE+ðcR«¶^ÉkÏ5IÄÇgÙïR=K®]Áç]!¸¾ ìÑS¯*ÿ3Qi»fÛ=$VÈAm$³´]f³È=J?1Õ¾,dbCïDà,6j1zð´9ð´m_,TT]f¹?x² [4Â=3Â,ð,$"Rè¶?x²=gûrâP½y¢Ó(Àd÷I:¸ºù>ë·´øb=IÏt=}_EÂ°?l.ûTØ:3Â>ÝÈüCÛn_hr_h:Ç=Ó<ð,ðââ8r"4¶÷òú;½6ZE.ÄÃ¹ýøuN=gí8ºÆæfL÷6¦16"uJ8eûµHÇ»is!@F>W+ùÏKy¢±L//tqê-úåM=LtÌMVb@íðÇöuW6r$-<ý]kIi|>FD×m°*è÷0,9ßgj¶Æh´¶ªÞgð^(V¼ÒãÊêÙOÐçGCLGÔëéÞ?-C¯ÂÃf6íZ¨1uÚäáÅw=ÜÈ!ðÃ«³ËøàÍ&=÷Îp)¡Ú5õrÞ»*=MÞó°h@Éý=KT#T"z$#S$ÔÃäÏ±Àäip3ûFb|¿²æÆ/{zKw¿Â©ÜÁÉõßWÒ|ü(ÞµªdL¡7¾}-h:Ó=KÈÆ¯ßJªYGËô¢Ñß!U}êÌ¥ Ñ¬ªì¬DpÁ¨ßDgU.3)8ÿùÚ¶;-pW#9í~Ö?ùö0*^¸<lå[ÝÌ_é¨¨ÏKÛ¦%=I$F÷;@ZªkáFÒßcü=JÙQ,"êäaÕ 0Jzd ú7Õù35o¼R]@´t½pÃp4=IõZ£ 8K7¶TG¿2=JÃúTiyRmJ¢½Óa®°Zþ¶b"oðÓM£0þN%2ºU)ô·Ò=JõÜ;A*¸}=J®Å&^ÑéÐ%C ä tKr¼$¼æ^²7þ#ÄÌÍY=K}~=K@Yu7£q`ÛÈwÐW(Z´£Í¿AeîBÝÎ¥¬±AòyÉW»ÎÄ(Î)«nºÒWèÒW¬¹Î ÒW,¹Î4ðcY©«n»Òz=J+ÑØÜØ=g.ÃÇ/Ü|I$V©²ÑW ÌÑSk!®]ÁèÆÚÒÃwáµm»5Ã½ÃØyOÁ2a=Kþ¯sNÅ+íDûÿ6=Kó Zò >rçP+ëzZûòÚ=¯Rm9®Å<=Mzð²[UòØyë g»HÊãô=[È(¾¼kWx8#ÑSl6MïÀðiAG$ßen^9=}Qç2W:r_Jß&ðhûòAÝpo_ß@;;Ýùré@ûw²Xø+nÞ ÒT=M!vfqÁö=@ËøyRV9|jm¸!X¡ò÷ãÄðt¬Üö*|b@ô|Q"-î=Jø´·¦ÎÜå¦=I!½ôbHCÊKA=M|[üò¶c¡}òc¡ä¹ô =cLk!øS^ðc|l[ù¼ÇðãÅÑ=2/ØÚ,Ó"¿Ó"7øñïåÅïuâ1"Ë]]W=INÞµÝ=LãFåRÝ+=4S3Â¡½.Ve³ÏEI0ê{ÃÏ¸ÎOë±{càBÌ¥Ç.â ü­H¦GÏ=Ô¡ïÜB}%r#à£=gÏ«X&Ê1«èâêeÌ^,Ç+aËü{«tua}´8æ·yN÷þ0ÑnÐÜhE@$Õú9VµEcÝ.67ß(a+ú«º»-¦pmëÃÙa0;#]OÈ%YKº=M_t^y=JlÁfúa=KÓ8Æðô læ$ÿÊ¬¸Ã>~%î±unÔ]c81ðëå7!`Ø¨Ò?Yx,*½ÝËù¢6=Jk¹8_Ádib½fAäÌTò§EÔómß ÄAú,ñÏq}³miz}zEDlpÿÞY?£æ±Aí»ÿ¢Åu>tðöÔ°Ïm=Mf°hÜ©4_O¥ÏW;¨sNYâbódÀ`jb¬`m­â¤¢7µ×÷¸z/­3wÎ½Hã>ïÈK&B ½Pëçú;HÄyð9§½Æ·§ü!.&»rèÙµ9K?ÉÀ%¯e+ÿÙS"AÆï=IÙòd qJ^¨èýxÌo¬<`oÁ&è=@¤§âÑ£ey{Æz=K·Çt3»Zz=@~TSL=JB,ÅS¡l*H·/ù)ng1èÃ³ÙlÜÅºCèÈØ0 /å30ÏóøÆóÕ,RÕ,ëòÓqGZMãÿº=M@ÜÜË¶!&iXqièæ|~I>T.·:P=}÷xÇÕ¸)F3<%?ÙÜÕ"Lì_]¾ÕU»z¼áXw¦SÒ$qøÂ¬#~Ü^íëBRâ^·Ñ_¢Ü=}÷Æj=gý¯áñnYCSÊÊ$ñ),~ð¨§ î[tm$¡²«y´öøæ¢úÿ/Ñ>;Q]ôÆmâóm¿ôYÑYu¿.)ªr=}!=H¯xÇæÿbúW%Fº£V­Çsß=&Õ,¡ma¯Qbë^Os7E?¯·Ê;HrÜð`ÇØ$«=Ló-%YÒløoþCæ=Jt.#ÍTº8òNYäþÆ[ó<úý7Ïb¹"Y+Vo/øçpÃ=ÈÊª<?áÄÆäý1Ö÷!e]pG;âoëùWÁã³@3|£¶]£JèÚ¢÷=gó¬<ªa|¡Èo4Ø;Á3-RH]-ÁYm£øüp*w$±0§C¼¯ÿºÙ)äÆ|³,³ún}9aP)H¡ó¤¨XË?£b/A©|e¯*w t£YÔKJÿ¢8~=gOê)¥§Ö^|¹Òý£3ß3@èáø¥=Hþ>åÐ^íÝD¢wóÙn-Ñ3Ü¨Ëªº¸|FX=LìØÂã®1:nNÛÁqêmÍ¸,ß.kq2Û°ÜÈSÐvL:pXþr9q×ø³QlóÔÍR¦òÊÖ!izòì5Ý=Hï4Pû@(Ð;B5=MÒóxªÄS¤ÔËhçe3O®Òy­TàóÖM=2@Oð±jqêÝPï¿ãýÒ[ûË=}K&ù<=ILä)âÈýo7Å"P¶¯<Í{¸½òýºdüCl¡[4iñä=H2`ÈãÝèÌU-Ò"Â¯e,óIôÛ!å!¿2³×EnE ÕáÝçÌÊs(±I¨Ê®)¾êySM0=}ì@÷ú·E,R)6uyn,ÇÇsçþ=Mêh"eÆþ=Jï±nxsè-÷{®«&¹#;Îð=LfzÒô|=@}=M1pøJCáEÉÒIjhÃà6ð-»*ÌiÍ@Í¤;ßÒ°³önÆ¶÷Jéà½,Í^wÝïÜE( µ=H=gO"áÏ¦7¥jÑÎ¼=Lõ"mâNN÷Þ_7.²ÜÖ¨=gÚÈaJiãkÎG¾{¦ÞiC©%nå)7y=JÖêä"ÕË]=}=}çGkµ3Ê/êS5äAyI_¸=Jú´±Ñ°ª%UgÏ¿_J¨JÒLÀ1¢?îlDa~ì4}L¢Dwüô=gÚC[×7ÏiA_t³ä¼=L"«fi=rÑ6YÝGé¨¯ fÜ=gb-íþ¸!ðãêÿ¾9ùt¹¹o`þ¤L=4<CrfÂÙcqç«=}¾K:H÷Ö§XñÙfÎ¥ê}ÔÛm»±~=IÎÂ/W=HÚ±ª=@¢ qá¥|x§¼ú]ãÎÙÍTÂ>JµÚ"[«uøºÏ±#ñÜ*½(Ó;`7£çN©ôjKBø"Lbw×ÜÕrnûîK>(bóÑf³âooÕS;Û]fQ]ø±FÛ­lÌJzÃk:hðR¿&=LþsY8Osøà,>ôHª¤P<ÆHõÛáíÐ<"¢PmLû¡=gûùõVàcÆã=gñÍ>Ö³ZÄàåmT¯Â8h]àP¬U8[BQEÂÙê~j·Cî¯d°p£Ø¦Z#çéâ?0´EùR*ÛÑ=ûñZQ¨à%°8âmnÎäú6·m§FèëEâ»#óµÂÍû=L=LO¢ûl]ÀôI»=@ázçÉq¹sÏ¨;¦ù##ØÀ¦÷-¨JõÓ¡íZ²·r»_æèâ.ÄldôH¤>ßìàèSTuÞÒG£-:99Y£(w=MgKEç`=gä+KÆ?U¾×°ikºUªA +äaE45×O(cf£°Ý¶¸,Ñ`þÃ ÙÅËÀeI°TU=IYhL=gæg£?Õ²=@ÇKµd;ïº1mêI3ßãÑp*Xv@~¢¢(A-öY¾ìèÿz%/ÔO%×ÏÇEÆ6©=L´yo}1)®=L]·þ·²ºÀÏ=69û9eKÿ^!>+¿ÇCf-*ÍÈÞU.°ÐÄoJªªCUù`~³¥¿ã«>¹åHrÙ¡æwü¦þÿvî­£áA¢eþ¸á=ËßC# QÝãM$Ó^oÔMpâ?9Ç~=L§?ÁFÃªQrµ[C7=@Ë{à?½sûìa!¨Ë3Ô-=gN(úÊÓoÄJo£%õhÿ¤6¶è¨IÕKó¸ÖDª+T-?4[UÓwt/Sìb}_öø¬±.}aõ4ØÄôn5§JV¯¢ûêU:Ï=HºÜ>«4öå?tì?Éß?;Ó7µ¢D·w«@ò|ýy-Ug½Õ~+TÙTéiÜbh2=Ò9»óÃïY~<äÚ}¡KêIoöûayzUÛ=Jq[§öze=¦Èê¿fÂ°FÐ½¬ªîRÎiÚË=HIµké$(#ýý=IuaR)ËËùA5]jq8ê=ICù¡:Vuïiù§ÿÚî¹ééWÚ³_é÷ß*çòÇ·´ô>)°õè¼åì=HàîEAªR¨ïLAzß#ÝóíBÉh+:-A¸®Þn±=Hg}¡¨ët=}8=J;ñ¾ü«ñRÍ=IÍ;1ï§á²Éän±hô9üöw X]²¯=IB¿çá¨ndúB¥Á^¿ØÈÄ´ÑLnÁñ#ÔÏsÀÄ£Â[áé=}iå¸AR³¦E¢ÝE%wBàºS*÷âJµ,=}gôÑ÷(=M%7yÞXjóòXR:rªvÙÌî¢`xà ¬ÏQÕ^6{çY(£Þgëô8@íú9o.sû 1W_íúÐ=I[º%z_°LZ"=Kt=¨¼+pJ4Æ=M,!+++«ÕÙXrðúóLK*>%!ØU¶i¿,j¾û3ó$QáÐÀÒ¿=gBÏ4H ¹ ÿ>Ôz÷o;7qJ¯4Ö~j=Mf½Ô8ïa£ª[né_»ïîê=J$´¢íîb®ûéúÉÂÜþw¡^Í¶æ57ý¶ÉGý«æ>OÜPM|m¾Ûââ,Y|=KÇ|ËryÎÛW#o86¢=}v]äb=K$ìô80Ìj«^-ú+-kj·3×S3{|¢ñ=J&²Oß;PA¶Ì¸ÅGAÞ1Úâïï{%k=Jûkno@d£PmKîzJMæjq÷=HýâÛû  3R½"ºSp=ISùÕ«Ü=géb*ô¶þ=LÝpÑâúGÇå¤¾KêÝ?·E·ÊT%nMIÛöQÇÈÕkjhÒ,ÁÈ=H7¶>GþIØPÇáªyÕøéðCB=L­Wèå 5Â©Ìê~Ìö`qö@ÜdêWû¾¥`¯2­=LÖþz]úAåõáJ¾5Q&U=J¬Â´;]î¡U¦­Ä.o§=H»%ÁÛ;7?$53;4;k©ÔaÐËyí]Àä·"°+=JÌ¯Á°C6Àïúß9´ÕcöÜw©pöY6=Mú+øTUÝl`t}ÜPNRÀçTû¹d!XÌ¿ °¶w¼­üD0"ýÙ-hüLÁN&_SµÚÃGO/b)¢(÷=}ÿÅ¦ÍÕ¥I(:¿Ýb5ùÃu·ë¥HÄõ=@û|@xwÒùj néjàm)jàZ¤P<>6º÷]§ôÊcéô]6¼`À{Hcïs]`qQBvÁ¨_|ô5Ïùëù+UcÝ#îW=I{o»=Ü=}FC|® ²ÎÀ¹Ñ/úI3X/J|ãGáÄ>¾ûÑ1¼HèM|oèÑ´mätmFÆãÇíTÚU9úé×öÙ¡=LÙ=MyR5tBéáAB¯FzSOadpCÓ­86ÿÒægë=Jí·+óÂK[2iÃRÜx§í¥=I=HÀÜdáaÆ@=}1yCT¬ADÀûAò}v>¦tt=Mþ=@7ÃÝÜìt-SE X°F9ÊùVÓÔdör:=c;xÛ©6¦FnìÇÝs`¡-1ú:T<{Ö`f¥FÏ=}´yô[T:¾ñè<ØBç=M§ní^ ke2ôßehF30(^bÂÞ¿¸=gqÄ­ep«j=gÒµqAa3¨*t#Õ==g¤(`÷"çübýÍÖ=Ï!ôV8ñróTÛÜ¿®Å¶¦Þ6¦|Åô[e=Iõcæ¤©G½¢¦eè¸=IªEØ³p´ì(.4kmØôñâ}c¡¼K=P«=M¢)øF4qZÇ²ù²ue¢=KÔc¢½ÈtÿÕÇ±8®ÝÚ×4gèk¢¢mÏ=ÑO[o]ÈAv=@IËX¿¥óFÛRÏþ2úH#âªÍ=Jêúr¿Tkè qñþM¬»¦=H8ÚPÈ-ÔWJ©èçÈrd+CùñHÈvÌ=}v1ïÁ$-ÿ¼#ò®¼ÿ3Añ¶[PEÏ.Ý#îÿkÕþÀ]KrSQEP¿8°ø=L²N´:@9¶ ^HÄ¤!s£Ãå°!§=JÇUnS%%qÆ=JäC ëË}=Hæídhªz2dPJ÷Þ$åGäênr³?¤©Ø&P=gé~[Âu#üÜìûOí=gYÃüøÚ¡ÅTÕÝ<2ø/ËÖál²ã=IÉ¨Þã§è§=}=HÇ§$-Ý=J,B[G=gö=K2GñâûC ¹ù3½z.Ã,2»O2;¸2à¦ÈR¼¡6Uô=IPÐRÉjý>¸²§9¦Ø+&=@å¾EÂú³ÖBþôí÷ªyh!]¢m-ÀuÕcqM]À=HÇ5¸ùÈìÕÀÈ¡¿=H=Lû@L»Ç[-Çµ9*+¼eâ&ÿHØQøö{=gOåé~ÀKKþ?ÿe®B¹ï=MÌ¹vuQØ±½«e=M÷TÅ*ÍÈQØ¥®³mðY=Ç¨téoåó©?úIù¯¢ñ#];+aÄ÷ßÎ¢? 8X°ækP"GhöW|Qëã(Ô[Yìä"åC´Sö´-à¶ö`>G)kiçI­`<÷:Ic=KHíÍîiClb¹²xÆçu±¤!pÚ)6Û6­±@×=L ¼$§@·±xl·¾(ñë%ÖÇI=lý=@¸8ì=IüÃJOEXi<=};^{1^6Û`RI^)§ý<¶&{½EqüF¾=HFC>:Sºæ2øºhmjÝ®(""Ýî<î"çËëXå<ß.5=LOúÏ¼H·Ø&t ]LõJ¼_·G0ò¼ =L§PØíuB3göÊ¥^æpÔÌÙQSµM3ñ%.äîï.=}åÒ=½·¿=@£§ç³=}¾oØú(ÓòÖb>mO7§§SE·xnPÃ-jº6Ñ;y±:¹`)óîõ=Ix»×4Ó63<Éaø¶±Ñ>}ÔD"pwàû¥-5+­qdPyzÀô/h=gÒ¼¥LÌ060{M@Ükb7À°µãÔ]ì êÓEXQ$O½7û>í=@Oênæ?Òé­Ï¤D(z <;Ò|ùXäùævÝtà FaÜoÝMjrMÄQÜò!æÙ¤³~ò¿=H2wt©Ú"½±ITæg9¾aSºóh¯Õä)ý¤=}ckhÜlâi³éøÖE½ãfUÆîÍ Fën¬¨Ðþå=H2t½°XKÇ¨ß9úÅü«`óoêKüb%ùíüCoPÓ{ÂH]Å^¡7âzÂO£@fanØ{6bï=MÊ<)B Í>cMs3(·wüºË=M=å]ÏuïaÂgô6=MºG^Eñw´Ëé¢£~ÂÁfW<ÄßÞ/ÃË½÷o)ÉWH;`"Bòd[&ã%ËòÔ#ÙwíJ}<ZÜØÅ,HþyH¼íÊ¢ñ%PÕÉª@±Þëï¢hë`ªmiæ¿Õî´íé_úÏv<DFñp ËðßJ½-ØpÛ=ÅS»K­jC=L>âK7/cBà§à"% +ºû!ÍPá.C¶Üô®ÒòâàL²O8ê¿ä£5z^äOó_ÿãðÎ0î;Os<QEìó§Ä46±CÕÌµÃð.¬=KJF¼9Ë:Ç±@Ï1(0ä6ý«7ðÀ£¸ÜbÛ«Ìë=KÆp(=IÔD.órw¡¢ò-úÜÉïe/t=@Öå¨}I7ÈL¯¯SÞgÏ7¥}ñ÷ÚEä8`tß<Æë|B*½J!]w¨U¢ÛoÛ¼JßsËb¿­´ër§¤¥ü0»DéÂ/áº.=g­èÞScÁÒö¦=}:=KÏY¼Ê¨©òÃ¬­ Ù¢7Í=K{¿OÄ¯c8¤Æâ÷úÙÁikï=I¯©Â[ªô[Æ#þéÿêÑ¢37a0=H0¬§NZÚÆQíjÇqò¹é3iU]ô3o=I,Ä6ÆèùìåU°c=I*=g^_M@à2Ø=KïÌ {q oóF­Ü¯BY°½­ ¸±£ÛðMb=g=}ò&-`ðoÚ8=gmHLrUm@â{¢?;Ýã@u"w¿"KáhÈè©:´eýõ¼|çìçôf¨4õzÄËQ¯g0=@Þ¥eÓOPIarú*S#ú6LÕ´hûjQ*=@î=í§¡îBñÒä+º=M¬Ú)ð:Ã;¦ÄóGLã+BJó=g¯<ÕöôÚ&«Éëß¸à#Yò÷Ñ>gaÄ÷º{úzyc%Hábñ<%ÜJh8¾F}µe|Íy¢ç=}à-æÈ=J=M0KífòX ô`[;FcÛáÆ,²«Ó«=IÑ0½õ¿ßâO£ßL»)²?¦rx²ËZéþÒtiôêM¶vz[ØÂóò9>ØÌ$Yªk3x1YóªÆÃ#ÐbË6½ÔÞþ½çgÏÞÓ!ÓÞ£÷Àå%¢HÔ?ÂP 7üàE.÷Æ_©äß%5Kóe=Kòc»ðÙv-héÁ/Å=@:Þ+¥]1þÌÇ±BÝ@Óªy0Ý<åì&ÖÀ&Öb=g§²/>µê$×¯Ú9Æià@¥åS+ÜwËc=M¼=gc}=LQÇûÎÅ18F¾·WbÿÑÈ=gq=}ëØv³Oé«Âèç&mæHSµ ­w÷äÚÆ`jàbÚýbWÑ31AÐ¢G£SéÓ0ÌóíÀÞZv:êò¢XA6þ1Ç³Qv°»V­=}ïnÒi â/*¿ ]¦É£¿Noe÷jÒH¢ìe8æðéùÙw@µç¤yÓ¡vÕ±³&Ìù=Mqõáðõùüe½+Mt=K6*¯¿êV×*È-U:yyÞ­qÜ0Rç1xÍ³Öã=H#ï´¶@L7JÈL!Ëõ½Ê¶7¼øÈóÀÉ:­=Mý6v~A8À÷A û÷íÐ½½·=Kü4ÒZÆ]ù=Ló§3ßêÊ¶¯þ®Z_yyÅëqJ>n<eGº§ýºì½H§¿èb¯<=KHÃR¼÷Ô*Cy²ÛÊfº×]î<IvñÁPÝÌÉ±øÈ:=}¦=KP=K=H0ï¥«Å+`huðd39Þäd.r¬Å·ÍølÇäßK¹ÿ:¨fpÇA=J±×¹¢8P,§TAäÝÑ¯«´¨ÌU¦=}YdÊ÷2fãòF®sRûEÇÀö`é_Á¹£Î¢.+îg¬ ößËûWÓ8jíÍRßN¥Ãs!éPéÚ=InLy~æ8Þ?ÝËç~ª7]`²"0«àÑBë¢çÍÑOZË,úov3(ëJ¡¾?ø*A¹Ñ[¾Ñêìí·ã°°ÉrJº!íqju#Ôì  C>X½âÓÇæ`÷MrïybþÄÂç÷@{©(6ò56ó!_H}×Öe=g²«=Ie3yÉL?Èôc]K¥*e=IFÁêËêÌJ¥®³¥E=gâÏ÷é)73c).»hà[ª^ÁýN=@bÃ½7èê;Ô¸y%2_!Í¾ZÒh$Ó´I6?7XÚPa[Wøm¤2Ë­Ö-ìGN2MP·Q½#Ó÷OzÇ=Hr¹)éÜD:)=}ÉßÆ¡¼Y]lQø[ÜçÃZäZ6PÞÍÌ4É®Üo(^úÖ¯òÙÂdóË)üSÛ;/NÙÌeïp-Ræ»:qlyK&¡ç¶×SDr¢ZkÎ¬<ôiôp½¹BUu EIüf=Mð/·Å=J×í6=J_âíQp4¡8BYàòÝ­¡ÌÒ¨ñÓúhÚHt<HP=^ô_§«Ç×£ÜpW<³ÀRØc7Î0b¤=HD?Hù4=gNw£cäj=}6´8àÙ|/#Ys:«ËØaÈrÞ1ã&=L§`ÙÔNu=HuB|iè!ºç¶®»¡fù%À¬+;=J¥?æv=ø ÃÙbl_Ö:=MÛ3×sµ×ó7~T^°rB(77½"C¼K@}k:1e0#PÓÝ.Pß;q[=J%vb=HToÁoÌ.ô9÷òé44;Yã=JÆM»:ö6FÈ²iXïÞü]/MýªN­tqoÆúâ70>LTc=g-oq:~¸y=H;Ïÿ­;Ë¬c=LêQ¡<÷mìJ;ÿ_r×_bå0æsý(]LH¤#Ñ~Ýâh·Ä=Jé;°÷%·9=@¾á:5t)y¢ÀÖúÌ­ÿ2uNõÆZp=g=LBÇ±èÙX£¥5¼ïÂhûº¥FèTõùýJùÊP£¼qW{L2W@Ä¶;£©4ïIº _rÿÞpoàâï¾pÑàêáæ(é4;%+T²¬O=H]¯ýÖ?äÚdäW=Lâ0Æ1{JUÇ Òh%=@K1t%±5+Ì{áûì²!·ÂÕÚêK!aN%¾nÌÿ#¡V >VïÃËÌªQv=}HJÉ«,¬HQ/°v½WáA4BÖWl½ÇtHIYÞnõ¤=!QÍ~ØëU9o¢¡Ü|(¶Éº0}v7n=HÃû°ü8Ûrú=MO[Á=s{=Lò~Ü=}kwÉ<ñ+ +·þDBBÏ>b_ùg1°u_°lD*Ãò4ÛþSfèQvbSÖÍ(=KÏ#2;]IÌ®¥W:;g=KÖñMþJ),£¶B#¬=@ÍEMÀ|Û>ÎQµý}c/¢=J}ï3â|Xd nà²W®O°nE)Þ©=@þæ"jÝôÕ0°V6#ý=}ÇLnæH=Hÿ±FÔÃ`¿=J£=IAã=KáîÂr6ÆN)wAc3©ÆwÉ$®Ãþ=}iôÛåg÷[uÿ±ÂÙ>L[z §~FYê;ÚVýÊÒ:#ñ|«dSkÖ!£®v,»¬µ=@( è.eÎ1t<¶+W=gA¦ó-¹ºÒ+öåê=g±¯=Lÿ«,VW^=@ùÅ]î_Ú& ¹,âÂ¼0s¥©=I©, ³Ý6F.6ïyÎ£mÿmá»«ñ<øh 5åòôÆ|5xçCXù³éõ¦=M÷ÜV¦ts¹tuM1×´ISM =KíFsW¡ü%¸ÂOîRfÓ[!OV6êVÝDf®³5±©ÞHZ¨-É§+XÂ9{¿·£Çe%¸ÄÂ *²ü£ÿôI¼H7xìsýrbóÿ=I®ún%v^}¦8If°Xìob_Êø!s|îcT¸WÏvGô(%-!zý)·7;_È¢cñmó¿ÞMòD-,âÙ $pz2¤Ï£c4×.=}á/·Óó~}¸ÿ¾¨ñÎÀÈáV9~#¨¦Ç=H{^~9âÿömþÖ¼W3 ¶#×ö?Ü=J¼0wòv=J7u´¯àÈ£/±Ù±õÞJ=}Gv?`Du{¾-Ý#Ðr<ÚqçË(²ïKa¦HgnÕÒºZ°ä[;½=YÒ+=Hþ"Õowá²¸ÓUµ^£^rx%=HR?gò[=gÍo¥ iDÞ>»5+=@øu+8¹Xj·!¬OJIu» àÙnÀÈññ²ÛmF=HQû¢ôKDqüÈÕcêà®õÌwÖCküõÌêÏ3¸R;W"Îaä_tÎ#W@ÔhL=M¸L¸·ì9ZèèÔe0=@¥Ì£=L©Ê¥AúiÈHltç{C4MÛ~%{§G UöÄw@Bd¬Dp;¢i:Á×ôp®=@=}¨oP=M6ÔjÉU=I¦j/k=H6Ü7p÷üô×Òí×+ì@ä³È~¾7?=ì­=H%bx¼¹,0ªtóÂ±þ=Kün¿h²£R=JÐÎ&6K;c-ïlFÛ­mâuH·¯é4jvgbÿP·-¢uûclÃ;=@µã;á×½!äÓûr¦0û/}-KÉ=L¼=Hp,§cLÚmr¸&mÍ<°<nµ«øß)°ÁùÂN$ÀuZ¾iùÅ{=Hªb¯*2çîV=g¬UØbA ³$äÜ¿+I=Hee­bMc¬=}É;Xõ¶u5åú=M§w¥&ö=@£} üÃ)M=L4lw¹%f_ÀÞpt á]7BW{µÆ(ÁÓ¹î4¢OÀi ÅéJf»R"Í.pª±dã!X7=Õ|Øô_öU&¯¥|Åî4$Èè¬óºQfõkÇ¡MAìFPw`#$ò-ÑÇI;ìq9uºôPs±«d°,C8ÙÉþ)¡Ô$ìøÊÅõÖªE:Ï2*;Üä%#/z½¬ "Ë2,H7FIñ=g«Ñò¢N¢SÆLº}ªû}ÿÖ¡Â##h(ü[þ²]âÅÕÕÍÊ´|Ð=H6óÓÞ»ó=Lò£É=L Ù!se¬wà¬Òû$;ÛeÜüìtÔÞ_~wD=@X»§*×bµXKÈx©þ{=M3V·õ:?ÂJ=HÚÉ¿®aÙÄ~¦CÑç}SçÅ^ìvxûSâ(·*Uhb¯õ=}r§ñDL].ÂÌÄ>>Ï0°"|wªY<=KrüPôªhPh½Âvßô )yp¿?d=g=I¹-O¦å÷RÇ¿[hþÈ=y9¿Á@Üê/¦=K=@D!Í¨J`J7Ç+rÀÑ¢¶úÄÝcÐéÏ«-óD8Vs¯u}lRjO£NËÁÎÔTGÓÕÞ±Ç,£F.§¼:4=}M9¡sË`x«õ´=KãÝP`(:"Ìý2@¶%UihçaÄÃs çPù=}=}¬}9¹2¸j¨zõ·ùPAóqÇàHÿàü®9Ì+ ^=IP=^-Ä*QFèQ)5Ê¤°P7·!1ÓwÀ=Jÿç/søùÇÝÕ¥~÷Ëóm*e^à®£l^[ÔO¦ÿUúd@³²=êÙª}[ë¹ÃîfKo=L=@ñí:vyshp l0úà=LüBþ1]W¥)è×Bý>wÉÁ=LØÄÍ[c|qÙMnbZ=KòqÙplt}8xÔôÎ¤=Á,ò=Mÿ°ÁD9}¨thTò;L=K¨`ÅÏËdVäCúlAdû|ëy~öBôBFtþ?ç.|59Â-FßÍ4ôÔ4T©¿Tt}y-Óq}£vlÙð$R4cÇ=Ji4Èb/K Õ9`=LãxÎ¦Í©ô^q.ß7Aôø=}ãýßÇc/åÅ:¥éXWrD¦Á=Haìª"=@]÷Í¤ Yàð1­ãfdí{Â7ÉÓe`:äÕ¦X3#â7]© ùøî[£ÊöG=Kj`íèé~ÈåEõiéÒu«li=M ¿qÌ,ê:ÁeÝÕ«O[¶ÉÄ¦Ï¶"1ÿ¨âÌëõ%åJvf[7ÑZÚL,á/Õ_ØÕ66{+ÝâF³i£ÕÿÍÀ=H¿oiªõ9¼KK=@K<}h(÷Øa·ngZÏÿ*R÷¢²º5Õd7ÚtÅ=Köö5©Â@`<¤´ó~µ9íz×ë©O»AQ®Ü÷åî60~=K=IÌû6­L=H¿®R|©ì)«9Ã*æÄ¬.ÿáHM3G¥Ø>[sê8jëZÈ²0=JÝÛ,C5¿Ò?Å=}ê£4E±½åÞ¡Þ9=LBÝ´nF½ës¶=M­:¬ïÄßK=gù)ÊÑªaî(´kEÂ­ó6Ñ6úáùøÚA`S±PZ¹He<QR¸AÉI×hïÅAÊüXZù:âk`!¼-ý=g¡ÏÉÛ |b!<ÊíBÐK4áÈ¶TTYÃBë^_«ÚQø¿ÉÔzYºäç[yYy6þÂ÷G¶}=JÕÏØòS×!Â?DÝ¯Jþ³­©÷{îwì¢£$ÁÑÕM=I!)ÐIÌ1VÁ¡üÆ`)±~þPL3aÄ·]ï¯@í´hHÍ´_=M5Ì5{T+{¨ÿ7Ì¥DË7EÂMû±Oµ@Üþ|3µÒõÜ+óe%p(ÇìèÔ¡TT7Éné·;ÙT­FÓS)¾­QäË@^¢±P½´X«¿¦º$N®vlqªJã) ¹Ø¾¾RÇ¿ÿç{jTÌ¼ög;§f]¿fxôØ*}¶3cò±eOKI<ðãÜ{´Ë3kG¡CÂÙï`î³ü¹r§¯RonîqÝhÔ{£¥-}Õ¯|h6Ë=JØ@Êóª&¿=HÊÆª¡_òubÚl®_Js/|%UFá]mæ_ÂÌ®=J+pÓpTûÖÃ/¨¯DY½Úa|îhºóëÑ¹xÙt¡$X7øAXPYä=}0éÛDù³õV×N3¿#ÿùÀ¹d¿éÿ¹+%ì¸41ûÊß=@gTðó®5~¹ÔâÒH~¯Äÿµ°Þ±hÓJ0EK«(¼û`ÍØ8Ô*e7Òlä1«É=}q=gO$pÿ¾¢²AA!KÏ=IÐD®&,%³K1=gN^*höµ".U³@Ï+´ÉSTù.òë2¸:#=MG£Íï^éâE¿ô4ÿ¬Ð·å)3bjÌüüêe»Úu±pò1ùxVAÍÖÊýö8ìB=@d=J)T=Iþ=KPÒ=T5Ãndj«³5å3=H²Á=Hró®µù¿=L=IËÍ6j=JéÚL4^x<v©[¤=tÀLf$îX6òîèæ¿äÕ¾î£¦Û­ã¸©UgÂõÍ=M¬Ñ»-W6¯m{5(/v³1KÁP.ÑïçU=}=±I¶GkõãÞQ)ÑY9cÚ :Fg.çßÅ¿º/c®hÕ¸´¸¥Ý9zGi~ëÐ(ãp57=Jî`óº¨2GApäI>FiÖ=JOûÆ|ÂÁñbK~6ªuÎøÈ.±ö§$Èð8AeâUãÆF°à^íQìÇª9×¡ºáÑ=@ãq.%ÔU±-ò¼²Z$Gú8=g¹É9KÕ­ñ~UR`SöHÀÃ$å=g¨<ú®ÖèY´=Y®Wce)É9Gø<AX8AH~¶¶<KwÓ±tµJÃÃ&bwÓAðþ¬ï±teèD¶»ëq=Jû&awÓ±t<AÈ¯sgcw<³ëþ,a/Vª9M[RLýFM9Ú*1¤¦þÇ«±>Ù®Þà=KÒ9²XS¹Þö®;ªËr.§^¹¶îÏïK³?ù0É±ØìM#æX¶ÉIF3F ,FX®FØÁ,enÁFè¬=}ÜJeßJ=Me6!âáí=MµAr|¢¶¼ç¸LºuÕO´Ç=M5q~²=äÚ¢u9£c¶=}Z BIX¯sLd1¶Ò3çÇÊ0¤J)Ëwu¨5Uç³X»ht=IéÒ«KÉýL¡óÍEjJcAx65[¨O=@ @DßBDÂûDßK~²¢¼@A=JYÞÂ]3w|ä&ò)SÓNÇ=@=<d4¤&b9}a)ãi¤ú{±Kü1ôH~+ÖZQ©çP®Ð@±/ ïtp×ÖwrÔÊN<FRÃ÷ªôLH ³ÍIE¡=Mç46=}¤Nÿ[|Ê=I`Ê±û/*,PêÇæ XTõÁA±Ös]²#<Ú×=IóéOód·*z=LòEª{Ö{Eþéió&»ÜÁµÈåkFN§?f´%ûÝ^=L=H=}V¦¡iÒPBN=@#<áqho¡¬&¢·u=}70ÝÓñÅnÃò]7®Ò`RVñÆØû± (~5½¸ö©ç[ÙÆ:gá¢Õ~=û=}-ìÙØjî¨h¦ä±=Lx(ç#d=L²ÓûgäAá=HtyC÷gàîtJÀRû¡Yý±ñûl¸Kö­Ìª9á+7~o+þ¨,âµg}]³)Ñ¡=Mt{íVC=gg·Vÿ=Jhÿv×AlacLâüì®]¯p^ÙÏT¨ÛªóY{/=MoÐÃfu^¬mR:¼=gÏÊ½N?F1=Jøä>²òkÀ@TîÎJüôÕÏµÔÃÈ°UYû¡ª®/* íyG¡¹æ,ëÉ<mÝ:8¦ñX;YãÂm6î:5YèüUè8ï¤"P/Bù-ÞøHH+r_èÙ=@{^ÍÛÇþG£²|ÿ=g=gV¾Û65(Ø0GgWqÊI¯C;ÔfN»¡$ ¢$ Ö]Ã¼¿Qãe8=¡X|¾Ã¼tç6ü8þ¸µÑ²Üvi»,k¿R@ò}f6:ùõâ,dÏ/{X®/oÁOÔÍ?Ðehl=JÈ½ÏÜ©ÍÝl2xvðÕù{ZÃZÃ6ßBIÁâ=Iç2ÿê;~9÷cÅ]ã¨@êé}·`,»Ò}¥ü½Ý7z5,2¿LV¯óYÔ´=I©9à}Ï..=}V1gaÔäYËÆ@=H¶½rUW­4g§+Ñ¢Lâ-?%+=}M¼õ¸F=LrjÀ»e=Ã)Zc"xZpuxOxZÆÐL_Q@·gêÀÓfÙéÈO¾5Te5P5ET7xÚ®j²c¥^ì=LüýoÀS=H+r/¢-,er¢Àå uñþ=@öj×_ÆÖ5ÈñyG39¨ñºQÍ¾à)·Èó²=g9PM@N4k6J;¿1ãø®C¦§+xÔv=LvÇ2*,á,¡®*9<¡¸A¥K5Êº·ôÈa9²Ò ²Ê=Hª­D²î »if²aÖ¸]ô8OÃà²Ë¢5:-Ë 8>èu+çdNq³/D÷Ò2.ºàöôr ùd=JÓÖEãæVaZcÙçÖ9Å0À­0 ¥f=Mítz¥.goJôWpþ)ñù»ÇGL{Ê1>é=LÝo85M­YW#ÞËÿºEÕñPÛ±é f·Ö,A¡Ö¶PuUÈ£ÿ=Jü@UÕ&|2f0r[¨ÜÇ}²ô°þq²Ú"×½ðSÚ¾uôÙ½çëÓ./#õºOs2óÅ0Ú¢x3ùnü=}à¿hæ/`]óÈdatÆéhâúC?Ë5ÎMùadù=@Js¯Eû¹öÞ«øÖ=I£=@N~o_xRÍùBz]â/³@=_íÿ*)½å´¨¤ò6P=gø`qD#T¼"z·Ë=KÈo=K&W3;Pr¢@G3J2çTë´ÃU=HbTU¤;0EJÍÑ+Ê¶ÀÆ¹éM=ªÐ3¾§{UB&PB®çbêWÌ÷¥¯UÌLËámñþîé[1¤ú=LõMùk$NòÃµªu{9^&®=M 1¶s=HÊúTZ60®ê=ghLLâ¿²4Ñ:VZëf]®vHCËÃ¹/Br%_`áÀdZ¹Ù¢#ôU§Ú¯ø÷ÃdðØJ4KêwC+&ªÇsTdÌánÓª®nûZ cSu,=ÂéûO$oÀ¹`ò{`_GYÑÒÀÊ`S_zë|k_ÞÄêty=Lôyö´zW?!¾8¹¹Ô=}MòçJG¬*=LkúV2{N×&®f=}ãÁWaë£]hÍë®¾«z´Ò+[bÄý]z²?¥»_zÓw¼øÐ¯/%E{ð¤v^>ôBL=KGb*SßÞÒayeÜ´YVNH®(KCr~¶Æïªà=@I|p:£õÂ=Mv1R~ü=@3rët&þ¿¢¬:í.zÐ7¶éÀÍL#Ø¢ ¬;ª©íÁáÉYÁH£ß=H9i£ã¦ðÕ@výñ3ðö+2ï¢=LjD=HÏ>S1ñ¶Ü=@£ÊPÂ´=L­Ä7¸yç=Löö0Óàý[=gøö©#û=g)!å/4®ª|IÑz¤·õÃ¦æôpJY=Kkù=J=}é»0ù~Ó»/Ó[!ªJ¯çÈÇÉÁõ¶â íï Ï°¿w(ª@ÌÂÚ÷)j=@söèÈ0bq»Ç)è!¯ÀÑRRù¿¶ÄgåÐoØÑç­IÔ¶=KÑ±=Ll=}ÂùOàÄÝÓó¼0Ö1ÈX"·¦i.å®Åq­=H?SÐ"cØáð=K×v#·TîüÆY°8õ1UVSKÆñ9Tr5ùs·èBúI9iqíA4r$h@ÔÖ§¿íî^ûàÍ÷U#¯$Én>+½µ õÙÎÄ9»r5³WNOê¿î>Ç=L¢¿ðõ=}¥pïóJ-ï´wÎ:ë¯Z§§òàlðPl0ê1Ëeâ*üj:6cºÿxÚfKÀ«Û¿UN.ÁíÊ`gÓM=JÛn>;ÏôMêÎM¶¿08>1Rl7ìÃTùè«ÆÚÝ$S¿§È³0ÛQk7ËôMêqïîM+È¸®ú=J=LÛ¼zøñ*ojòÝ½,ÙÉ0¯Ó¼Ì&vÞ"ÉB=MóXÙù[ë]¸äI08Êé-=Móì*¯§6SÑc0O ¾¸ä§<OÂ=Âu¥ÜTø"#£"Kç¹}mF¶%îuìsTeÂ;ì§ñïB5rVx²Æú²½Îöl=J£òDÿvTöa(oâÙ@{=HÓËÊtUf¼=gVÎ¾¼§Íd<RR¯ojUN¶2Ãä*_yU¦[Ãä:¼)ÌôlZvÎóËô|Zzo*Q¬êÃù7"ÐxcMó³¢ê@ ÐÜ^Sl¶¿B^á7~áw~ái·å³ù8>ykøNkøN,>][=gHöúnóó§ 73ghÐ=ý=IM9½sÅª=×ÂëÖaEê%t¸Dë=@Þué=HÛñù{+=g³¸xØÍ*/=K#³]ã$æLz.°ûûÝn¢Ëø«ûûÆ5LEz¨ß)ßñ=HI=MpÕ=HÂöfb<Á³=K@#,T0ç$4SÁ2Çd¹X=Mþò:ÖÏ¶àoTª¬`Õ pÑ¸ÂºzbVmÖ/í{;ä~=HÎÜ:cµ=Lé@ÂvÞ<ïM{(@®ÀÒOSÑ_yÖ«Zû*ð¶9Ñ_~=òKSÊÔÝÕÈCÉÔppDÃWÜÖ¾7=}ap<BÀm¿=Iýë^¡DåþÁâ=}vÛ¢g=KêÔÕt-?Hì#DdÉtíSü)L{»K]:u~=LXTd!=g7pè=}ólëûV0÷! :âÔc©öÝPÉÁÖzîLÑmN÷Z 6+û/+pþh{®­=@`mÄ^yOÊYQ{Ü±Ãy º`D?1{ºFÝ¦v?µx=M=I=g¶ç7Ìsz]NgH(:RÇ8¹x¦¶a.Ï²÷Uð=}Jã`Hz=gNdÃÍgÂØ=KÜîù2Ä¼C=HDÌú0h¢¬ 4ëúäZ(ÔÒ6+ýÝ1ÉS=MÇk"*1ªîk~1>?X|àþàö/ÌAg¤g=MKëð-MªÚ¨}0æêÞÊ·*ÆÊÊå0A=L²Tàï*çÔÌÉ{l]Ñûzèý&y ácû=M}E+vlcÏãý9aí9óèÁ0JÙvçä6¯ÍÂÃEÂ=@~=gß:ã·» ±lÎ,XÃàó?Ï`Bd+Tt,il¨M`Ô#ottÊ¢¿v¾z6WÒKÌÿT"Ç°Wqr$ÕêÿØÁêòo.-¹ëà[3­iØÜX7t övÄÇ~&/¾ÅÑÒÙvÛNâP)]E=JDº$=M_¤ÍÔ½ßìÌ=J¶ Z=Køj·¹{PV¡Òÿ?%eÇ¼ê¯9Y®Õ!ê<v¿P+Øå5ÝBA_hb=Ôu}/6ã.=gÑ`çý5_ßÿè~N=H¨´îiG=+=K×bâhræq*¶ÐIYÄôê$sTß>Ñ|,2á&Û³USéIëÒî0·WjÜÖôÚÚÌ?¥¦Ç¦É´=ImñB·ãV=Hîyw¹ÿ¾ÉXm¹?tVâ]é}3T}väFËJ¤etð·3{æfáh=Jrvó/zî/ú*Ç=J9zðêÀQ¸[]­ðRÁt*84q¾zù­gk=@0ü6ø>òöï)×nh{»­{æ¥É=IÚçt!í²=gÀ=L=LKCÿTàHªÛ¤-fsÉ=Jè¾D¡å³=@ñ0îzW»p:þ=¿ÜËÚÞV6÷S÷"3)X^¯ù»Oê¿pj"Z÷S÷>Î=Lô,aqn¡±`ù®"èêÇlk·~Î¢·±ï©rs¹Ìr:M¿×>6ï2¸õÒ=LÎ¤ªxIHEÉH¾«Ïx)xQH¹õÓ¿L¾ò|a{ecó0E»N±`=}eÞ÷XWó<Z{ó°J¶@rBo#Ðø¯òºÛ1J:=LàÏQQxï=LA.ö¥ÝËÏÄåÛ¯@Bö%¦~=@ >ø÷©ê)|)-6ê¨ÉûâíËÀPµÓ{=LQ{_gaÆz²<a"Û?=g9ñ^m6-¥=@=M^ýkÂÉ¸;ê#¹æS¸YÙ²3RÝ²öÀ{Vñtõ|f²m7n(ËMs$ÏXkòsçáh´üe±o z[íò¢vRWºóØw7è34êïÉ¸= 3¥ÚÍpô¥X+É=HÔï bBPR+Ò=gúUcë=o¨LêÕ?ú>FÎ:àZòmâ=}8ÛVÚV¬C·O£â£)+õF=K i®ÿïôÿUz<ÔÂQqÞ¬ÓÃ*¡vxÝ9Ã_Uï³Ic2Xøÿ9ò¢ó=Ä2@=Ly¬(çÖ8 Zc-=IÊWåá%é!0¦·@X:,þg?0y~³ÃD;:Ä^Î{æoäÙs¸Â¢råtx¿Ò?9Ù~Ö,î}Ph1AI¬ß~F³ÇÃÈúr5!CdC[ybÏRNÓldÉ£Ô9zË´±6ý/Ã5=@ÃFuPè@¦Sð=Hþ<®ÁÑu3=}ùÒ`Ã89ùXó7ãGãâÕl=M]Ò nÖ½}´ÁN0çP,ÔØ18;Vî#xX:]â¯TsÀýr³<fIø!=Kì´Í=äªOÄß=îB«¢N#ÎÝFNv¾hù±8ÔEÆ2N_aß÷ØëLé}v6`9°è,À´¿5~üØÉÏ6F[×8£û=@Cÿªßy*ªÐJí6+j?8ÐÍx~äC6qùî¾©e=JZE´ü/~¹³¶[BPÄ¹fì-ñÖ«=gÎO»¢¼Õ_j%f]=K_¥·Å+ï ×"NUÍÆÒÍÚJÃì_Q*öBÙ32=g/ÑãÆ&&¾ËÉUH=Is¿YPüÎøH"=Hóþ9ðv³{aihU?­IàyéõÂ(áÀG=H®ç)Í^} »åhf×=L=@,e7Hú¡sÎF³¾aè®³[ü5H$Z=H¡qñá¡ñFFÃ=JÄ=@´Û½]»qgåP{¾ýö5ÚÝáûö5úÍ¡C½]=K=HBÄÌ´;jåwl]JF{¿]p~øhJF{À]0~øxJFQFÓxl{=HÚÚ ¬~ø¬YFW^N`ÆÕ: 0ÆÕñRRN.3²7¨ÎÓæ ûmäsôÎÂhF[¶ãWJ0äß<½W?JN[²sîbg{[²óîbgK[²]óV00àDës@wÅ,]Ø=}±çþ NÌ9Id#wÖÝÆ=IjÈc±NÆ>LhL)â%h=HéÕá%t0½EKÊ¡åtÊ/°ýÅ<îÈppÿkýÏECwe®^¡e{)õxÊ¿õhÊ·½ûÖC¡B­EEäåF³@Å¥`Fuù|#s,@ln»þ?Â"-²õ=g+8s¦ò¯ÔHÙ=gVÝ/ÎT!OÆ¸Þpï7;Á$/Î=HRítk=LnX/0©ßFnSÚ8=KY&h»1_Wm=L>Ù·ZÉÚ4u?5~MÔóbu-¤ý[<¥Å§p×à¦ïcùßñóH®Rd`>Ëd)®tm|ÖØºò=M+y§oLë>ê÷Ä¾MvØÊì¹ø=îgÄpôßÅdÝW8³cHoåDv`#5û)¿Ø)ÿÇ/=¥Z^ÊÏ8l6sÚû½H*&ó^l;ÿf¥ª[W Ú`G±XZË_h¼z@CÂAXÑÔ:ÿ=K¯âÍ"#W©8=@ìæïÀ^j»Ëÿ¿°gþW=I¨ÄLëù¨ôcñoRerÔBýw×ò0Hè=}ëXKìcÙsÕ{; ªr=M$ò@±ç®Ë>âú#ë~ÐÿÙß|pF¨Íäl´¿ÍEL«WtÎd´:sh¯Ú7x>×á&¨[ÖÎp9 GzÁÎ = =IÜNTÌ9(îhÌTwhdÝÉ¨m±]îÂQP=@ÁÓ}9Ä=M²+l"B:¨q¸µ=MvÄ2F=KP=MªGúÅóCk2zô=Mh£r¥²X^Ö²ò«pzZÙÓÁlÇÑ@q})/0ÓYØò:tzdP¬ÎcIvJT½£ÂûÁ4"­äDjÞûnc,¢óýä+D=´ÑMê­÷×RÞ=Iìû-å8Â"=gjã¹=LiTqOÉÀßþÝ¿FÑzYÃ4syÒ{Ç´°Æ°ÌôpK~>yCZcuUÿæºdv¾Cî=HÝAóULøÿ:Ù>EÄÑ=J0¿Ôî=LÆJX(Prþ1ðp£=ïé·1Ë^ú¤A<jW¬ oâJ¥T}ß/,yoÄFSNæêsmua,ÏKe1¬®UÑ«dÙv>b(%éÿY=K6ØÑø¹¥¶Ð7ûÌÔ]Gf2ëØ¤Ä=JÊ<[<=gÅcãÑ¾iÑÔþ0ÓWnÎÐik©=IÑ½=K¿WÎU=@þ*7ÍëÞ¶Aà<ZV=@Î,Ð/;QUd°²I³-hjDbÝÿ»Çßg´òGC=$Å°Âæ%¡ü©=LL(ÔjT,ÄÛZ=K^èLÞ$J¸Èf2¶{ÊwÃiSÎËî0M=M=JÓ1+jÈ°Ã¢þF=@Æ.r=L*säÕÑï¸ülKßÿw=@>F×ö4&ñQµx¡°Xo·×ì)©M(l±;z.¤<Ô<f³ôØÛ@Ì9ÎÓÖ=ÆúÞ|ÖYCMzuû½ÀBdb&=M²ØW"#-ÔáArb@fô8=I=Mª©¸¿C²´Æs9=Ii=JªiäÌrëÎ?/mÇVÆ¾µhÇP>ÆÐ:«=göÿ¾·~ÛÜ²Î»A=Hì}½ÕÌ|=MÎìåäA£kzM{iÝO`d<oºÿêV.ßó½ä~¬-Ì_¿£Üa^Eìù=H`v=HUí¦ºÕeewà²¤á°c¥³àY§<ÅuÚFóäÆVa7¡s¤ôÞí"ÊôeµK£½©ýo¨àÀÄ=IA0=è>Ä@k>´aö{DÁDÄÏb$¦8F£_BIm|:ÊXU¥_FXQ>V XdîèLnâäK"eßdøëeÀJNR[¸Ç¨6·Ýüú¿ÄD·©Ù=g(S=Mm,¸#¾ §G3¦Äõ*!_)=})¶w,è´¿nbWkë:þ¨=(ÊêCMÚxð8üâÚìÊ Wª=KÔûáªô=MBz0Z«çyÓ}ÓhJóX]óXUú)è9¦ôòY`çË¤Ë°=g=}è® å6×ÆA{cg}3Ê×f,SõØñ9¸¯¿ÐB¬k[î÷v! Lè_6ó8b¡îSH$ù=g~Z=g*GDã]8ÄòL,ùÌºÅY4F1=Ks³Ñ2DYDBÑ¾¬6ÖÏîkÅc¤¼4çÑb)J´.ZÜ¶M¯òÓ@qC.z2ðÑqá=}vT$>÷Q­Du$°ìaÊE&RÎÄÜr6ömA=Hüe´æycºã=´[c¿aEÌþ³=I=}9h%cKÀÒ×)wPjÃÃLW+«P¯Ú´º>ZnþëÌ:Úìgû;Üé÷½=Jì=Jo¶Øí-LÉAØ¦Â÷Á}¶j=HJÍ³oÜr¨-×Z§R#MTÓÓÀÙDA1Ô©ÿk­>¾Àò9p¤êK=K0HD:£)¶ÚÑJÉÔ¯:.=Kk=g¢Guêô/0Õü*É¿=HpPÍi±-l¹}!_q`*Rÿ¤,³rpt©éí£=I~§>öC6ÂrBHMÕl[OÝxáxÍ"ïgCTþÚ5jÐf^w14e¬=J]ôW^f­=@SqoÉùH3Æ¦=JØì4ÖøPÖpÞ½*FÖ^=}>q¡&ûz°ÎsQ÷®l_)Údÿ»â2²úÙPáZÐ¬©AH®ÑjYäf®×>;=JÀõ»|Îþè¿Î8¡øZmpú,LÉÕWpB7o3²É#BCM=}/Ì®Á5¢xp}1FÅg¶úÇGGgfÅÄ"«¹{ÕµpÞùipÒw¿¨ñDÒÈ=K³¹&¢Rô; t,¿èC«dôF¡ ]±i@OUz«9¤µ µ=L=J«=L2Hæ<]ÆMæ´È|¼&¦ßû!Ùµb^õ,õ¬P ÛJF¨uJE"SÁúÇ èmÈPù?Å=JGó=}.ÖÄ°=Kò£@R^8~«Mú^Ü¸äjøãÍo=}þq¹LÌ!hX»î=}[Õ%â9ÙÜt¹B%ûê³=}¢o*¾èLÕ>°Ä4egræ}À=KD@Ì3@µB_=gï«e*õ´-¥¯BíÅ¶I1a1[=KÈ§)£]v>Úâó*öø¢oÐá³3¿éà+!ù®"9êäºb<|¶ÏäÍßÖ!i³Â(gó)D=LI!ù®÷×aÂý}.Y¥#DläDÑ¼ÿFJå>ª2µ[Cºá0¹Ó¤tvÉ¿||êð²míèØîX·z½·Õmö?ùE4øû=Hâo¶ATïmÿó³á=JcvLDç=Mp+â±=K¿¾ÔÈýGz{qOMméFiça¹8úïÍ<fÿ«P)GÈjÅ1¼ÂÖ¤×{â]=2ëL?0ÅSdái3Ó:Ç=}3Øhùo¼ÕhõY;MPòü2PDíJý¥cêg=@ýÿÃR6=J¡È»ÚÃk»ÉX!÷³<aÛÑøáÕ3j¿lUÔo¢V®#ÖµBÅ¤³ÿP,òul§s&Ñ¢ænöl7L«E1Ê&.än¨ 2=KÔª·å$Yj=Jå»úé~h°$zDbä=J0(ÿíQîáaJ&}F)q±>òÉsòyHò­¢ß¦ÄZF}³[a§h=@g°¥¨8²=JºyÇÚâå?%)=J=J=Iç*§(=}ÉNWêU²Ã~OÊ²¤[ûÏiw=I=Iq¡*JúêÉÝ.Lõ%Ã¾ñ¨!ªàkd^)Q=}züÌãO)ÉÁ/zòÜåÁVièµÓ¸ºü8¨+-DÂQÎÛ{bO#Q[ç1¤<ºÔÁþ¨ãcÉøO§<)³(òüiÀ#Ëè=}r®Â7!hnÌfËÐK©îî?=g/`E¤Â¨]?L!¿&Â=@B²VÿG¤4öÚß´?æË½ílñ;àkPw¨Ü3Iìò.U KÓ..=Këþµ´¹:Ënê]Lï>ÀùÝ¢«FJ¿=Jt]0¸U=Md`»«q¶ÿ$-«×¬(þ_çìõ çÉia)ÇZÓ¬ZYHË259ý/ã3¶Uã}"K!R[ÅôC{¢fsÍóM¼:½@­øàQD,rïíH÷Ê|VÇBÌOcÃWÃokóÃÿé4þ61ðF8Âf0JÍãþýBß=Ì(K« ·ØÇFK8ÜPÐ²ËYÍÇTP®×]õJÏ$h¼:âª#NßM4]ì¼`=g²ÞÛñ=KXNó?f¹âWº;ÓõgüÃv×3h9oHîRÅx¥>ýj0ðãsµ/áð5àbJór*Zïü«]<.~O4/ç¢¯á!_å)¯)=MtßP´É½»ÏîX1uÕ- äVú5eAm³âj&{ñºr¾d«´:[°dÃ¼Àl§ããWUÌGR±=J%&Æ"zµ+Í0£Ì0üqèúÌø!a2;ÑãPF2þþú­PÈ1g>f@4bÈ$&íILïQ¸]·Å¨HX¯!%æKFÔ¼W[áÚQ AÖTcôð0`å/«KÙ^Ò§õl¼¥b:öyò©Í=}ÊÃð®þVöxëñl|3i:ÈÉm±amM«i%=MMÀoÂÕ#Yg¶ühã=}H£Ñy»=L×Bõ}YïåTÄê|ÙÂÖèïøô£Í,Þ­.o=I+NÞ5ÈD ÚIÝ!À¥Ã¬¥gÜ½½~JßÕB¢]ÑnÀy©S`ãÊEA0b=Lw=æ"F£Áº[.òztLüÈ=HZÓ{>±=KçN(JÚàzÙb¤MU`|ãÙ¤=g5óßéªì9âq¬ÊP+ã]n=Msg<âÄíäJÙ²N;Ï0l¹ jÎÌ&=MóÖþÇO9:ß¬ïñÛXB_èªä@±-K}¡ît`¿×É¥äf=K[¹©=@Bd¥=HÆV~¹=Jæ%ÀäõLM3¾7k81×/`Öú8+±¢H6ñ=@xqúÚü=MaÍ)>¸{[=I&JÆ&¾ïe8fØFøQÉ.`­9Ë7²SæïÂÓ/=KS$á=M[9m±=}»¯Ã³îê2ôíÈñýET²=}ò=M"lb(üÛÿú+§PÕKÌö°=gmª÷ öÙ¹=gÐ%`²uÍý%QPó½ÏtM*=g=Mÿx¦ÃQèKíVR8éüõ³ÿ °ïúºE£ßLq=Køm7RV2TLíwÏåþ8ïtøvê!707Oêdãe=JÎCQÊi=}ÔJÛT)Pµ^¡<2cJ`$9Yp¡!¤éZËvÞÅ3Z=gÑ{`§×.£ï+p¢5±ëqClBº®ÉÖÂðP©¨æ§Q$P#»Çß|7»ÏíPJº-ÚòÅóó`·Íúïµ ¹Ó¾Òøï`ÒéëÖtÙ®gf«ôÜ-ºîtpe¿Û?£9XÔü.Êf@µìOñ=J ÂÚCÜ1TÞ£6vÏ_ëZ]JñXô5ÜH_Z7=gwüÒð%$Èå¥ü/óßÜ"ÛÉ!àÉ*b]jGáp:%IµTrËÅè{@+Þóïó°àNm¨*PHV?q¬zíå=MrøÓ©3çä½_7Å§]Õ¿sÉÛÄ¬¸v+ëñFf£h!H)uKWò6{æ¦ýÙóõ£*:K¤ös¤Hâ*ÇJ×&ëcAZî8ãö]ûÏÁM¬l _b@z¤EAñüKM=IM$ùaEÆ+Çää;<I«¥ê#»í;A[µdÉÖ¨ºüi÷éízF=I=IÑ1=Mw³3ÅãDK÷![ª$Êû©¼·_Zdw®.´Ó(5/i>°r%&ÿ=gE¢=}ëW Öû`Éì¸H!Rý7)9³ï5ÉæÁ)ïÏÍÞÇ/×´¦ªUE±òNÞf=JÇEZÅ£¶&YÛASÛÄÑ®ãbvÐ´ª×YÖ­=JY+öR~O=M×=@Ò<òkã,Ö(®C²¼²ñbÞWT=J=JÒ`Ì/ÆqO^ê#ÞNÓý/ÔF,tÙH&sx9=HòâXùòÇî¨-¯ó£=Kx"{ûÁ:ve=L=HK¾Éµ¥=KëÒ=LæÅ=gY|fÚa¯2­å=}0½lvËyÄé~Þ¼RÎÁq<ÀB=J-Zp©îÀgs|ÃvÊ{rL|Ãör`à2ë®:=gk4ªTxVxv=LgªµG­îZDjÄJÕ=}§f¼Â¤¨$xa}x·ÕTöwT¤ÑÃ+YLoÈ,"bóFî%ÞÃÖÅÏ°§Ä$mÈEæÇhcÍe^0)Îò`dz^;ò`;ò`;ò`ïJo«øL©SäÂ=Kö5¾;Ñ5^©U¥æý=Ml&[Î.Pï|It£BEe5jsaöÎ=_Ç?Å=@AµØAn6Þ¶Jõx5¦ZÍ)¶Þu=L·¤Z=Iµ¤(&=KùjmÿzéD¿#µH.ª=}È÷$ÍP¤¶Weº£Jõs¾Z=KêïËiébDðÅô}Ê1"=LÃ­eàñÊl/Í¤MXùåtUèo=K=M~êßA=IpuÛíï#qÊ{_¦sÿ%E-ÇJ´Ô¥GÆµÅ«º¿ËÂ%tä=H=HÆyh%C³KÛôõUÁû=}=M£ùÃ@Ð¹XÐ:?"IÊéá®=ë Ãª8Ð¼Ý=LMòá«!Îÿn`=L±þæq£þU@± äh¦ï1=IÀHQææ¤Hó=L¢à[À±²Ñ{¶ùìítUMU4¦°Èï=L4Ó¹¿Í9ºµ¶uñÅßEÚxjû?Ó|NxósWPbð=}lÈÕ6s|bb?£àêºêøâ£Ï*WKJG#k8=}qî+ÉSyïo¶ÙHfSt=g4]Añ&;RîÒ8<!¼ Ò®+.K FUßDÚÜ%ÒX³²Ú)1³[:±¿âmä½@Å d¸úãhA@>úøtl¹Rþ$b¼`1Þ3=aÜÛ=@/40Ë/=gÚd`ÂvÏ8gCç@ç=g=g(§Ð4uÚÍ9ìÅ=H)Õ¤uådO.Hÿ;òÞ¾¶aTÒ"wR=H°¬{óßÃüOmÆÂÀ;ñÝ¸:×÷ñÉ=MD<@ÑGWõ=}~Pãwu=KxlÞÅ!¥²ó3¸°Fç.ªÀØ <?@K¿§e¤÷d½ÄË=7`)ZÁ­Ï%­SY=}/JÝB.ÖõóÆçåá¿6WUQÊçzÒ;xvÅ§6þ|8¶I?=M?9$8ÿ¾, Æ¤|=@Õë¡ðÏqMÕSß!=Mê×­Ü|MõÕaD!U÷ÇÐ`»±¶ Ý¥ýKÛuò»=J³1î!4Zs¼SÍ=M:Ìµèûð&Èë¯²];>9ÁÖ£k¨+Èïæu7ZoíV=@¸2¯/B&®ê²Nâ2H<ãBÌ0h³×å$Ý0¦þ·=N+ÚEÊúÐÄxIQEUÍÊÀÍ29)çü=q=JÒ")v®¥¯KEç§3=}× ±ÏQC§°ªd>HAcx@øTøT>lT>îÕ¯w=MÊ³ÌÇ»Õè%gÇ ¿´Ò½àwÜH!t|*Ãðlþ3]#ÿv{pdî¢d=KmÜ#;oßý4a#CA;"V9 ¤¡Øã°ÌLGj¨Z¤ý_3=JVL£AX¹QÓ´1~ÊÈdW¨ýt=go»=Hî8¼q¿ülzôÁ"nÃð§kÜ¹n=}Scþ÷Ú=H6(T/òÌx/àºÑñ»qÁãÙÆâäµøjSèß¹òÁ=rÁÃ9òlÉ©"°_+¶FìÞucX=JÚ?KûsûëDí=¸vÝ âw+ââ=ôX;}17,Ò«k³ø=ñTCß C=KBî3DRåhM]ø=#ûïmÔøà7jM*Oÿ»øTâ4~pÞ {+Âós¶»øÝ8°@iÚ@Cb72®Þ=J|oV»C½Ñ"d«_=}´Q>q|NGYÌy©ð=IUS×¬Ü7a%<=H,I²¤=MI=I¾ÝLm©k6ã¶ö#-B¡Û¦MÛõ¥Òì©YÁ`Go¼9¼BÁÁiÎ¥3,õ«"ÎÁ[ªn°9 0éJÎÂÊÃNáåwNÉÂý[þG5§Ýß]¸9÷òNè:=L¤Éa)¸nÑW¿_¨IyT¨£WDWiþõZÔ%Lõ=gw­u=H=LU|uêWí×"q¥E9uzWjÜ ¹ô®"Hçe0diIúkÒ7PÍî¥þI¿kxÕ¨I¾çÞûÎQégnÉÆÉå:ZR¯èäåS.NÙ0¹°¾x²zÖjéµ¶ÁbÉà]q³0%þÕÛÐxÑ´æÌÄOg¬ÉÆ/YçèQ¦¥ ÚÙ¼Äþíç=HQ=Ð¨jðmÅâ&Eô¦]=Ið7¿;q^Ø=LA2ëL7tÛ¯ÉªÔó¨äH±úPn5ðÅB=K1=IöI`ð,çÈ=´Þ½ôP¬Ì`î»ëØ,Ñg GÏ¯M&6´bârºOÏtùOCr=gÚ",  ÓÕl.V?#ûmÙnQyÐ¸SÝr¬á6þYn×"÷áê¬$ôG¼7M Äb©ÇihjÚ«ww·vÝg:¤ö½håæGb`tØI=HÉÇ´4ðçöæ@ütcòÏQC²Ó=}"UõûæóÈÖ{F¤óød<»+BÀÿ46%õÏûæÆßøXFa+ltØs=MË=M IîÇæÕégjªy¯-îî±=}!iÀÕÿµº@6ne]<Vã;ÁÉ}ò)Vù!/ &­ê/ÎQùdßÍÍÔj°Ú¶x:2í=H§[n³ã¼ÖÊþÙÑ%ÿýWJ°¤¤H*=@ìB.ß)h`«#&8dda.ìòC«ÄadNºmR]]u£´æV¦)&ç×::÷¦.àjñÝòªU^µRì=LoSËmÙ2Î{cÐ=Iv¬´ã01ðrèù+¿ý´_=}zE8Êüð@¾õÛ?Qâ¢AÄªh7=};âÇïuóx[=JtÄ;}òÐ/É`øÜ=IqÎ¿=@@;ÒÇ÷ñì³ÝDº{M>g´@;£x»ó`$âõBgú¨R¶öõ @±¹·YêöÒØ¼ìIü!<¯¹·ª0mSk£ï~ü8ÛñÓÃÜãØL$Oáè°l^0È{)k¥w3"gÝ½G3i¤sÁôÍxy2!(ÓjbwCÐÚPYOöSoeÂÎ|J=L£;/*"`q¦ÀWsBñ5=}Ø¡Ë*ëb4UHjvò!òÑ½øÞA6 ÛZ<|â5»íOna Tßÿ½1âlò]=@©@%A/3:å Ý?Sâ@jEVx*4ßÙ+>Sà¢õÇN=HR$]ÁC*ÐE/UâîÞÜE´2ëín¡5¯éÔßÛVb²b/&>"T=gErv,¦k£ÚÒØ8tk3düµ@ucP»F¶Qá9îÌ=òü/,Wúàç×Tá?z7ÔÚ"Xbë4Êª¡@Õuò¬TõL§fSIÜ÷|î´Ø¸!s:Áõl9X3çáðFÖ%Õ{©¡ØWfÖ6=LÐ¤¼{}8H-Ê¬G­oRU¾-s=Ld¡½)wN~!Ó£Ñ¬XÿõeöSõ¹æYÂë¤âÊWºµÇë =}DØª~|Îæ!eoæíu±}enëÚGv%ïLÂÉÛ¾e`R(ïîx^ºY½Ã¬ïcÓUî=g mÁ/³*ÇYTu?Þ©xö©9ÌfH¡Y»7ì43=g%HßÅúÇ¡ mé¾(¾ííÄ=M}$Þ,wFaéué¶Î¨Q¡ÇE=Mvs("-·ûò¿Ýoå`KÇ~Ð+ö[§FÄ;MU]|½.Ï¡Ì$>LíGª×è¹Mb·=MF§[Ø¼eêWÏ!òQÿ:=I^He°ê I×M H2ê¼ÆÓHé}?Åú¡í¹ÅÀ.kx¤È÷ËfÑ[øp>õ"ªÈkñßß{ãwFC=gJ=Ñ¾éù#ù7­Fðy9ÙR½e ½á*ÖPCK=@x­¦Õ£çÀ(vM¡®=JZÉ3¢<k¶½d×Â(Ó~H^2n4Ñ-Î:ÛZy»TWo}EÍ¶f¡¡§r=}J¦ûÃ^Ñçé]¼;º5=J­óØÎ~ÄB¨7ÜügZÆÑ²À"f¶5kW>H¡=}G°ætæCìe¾=gTeZ=JÖe¢(FÈ¼á`þe6pt¸Üwý¥¯JÕÓ%VÚÖÆÑ(ìlÛDUÝd ýÈæ®ÍéÍløõ/­qbSÉ8<F(±#éo)º^g^rà*l7·(ûñ`9öbÁ4n Ðø¨ÈÂº×r8o x´*,rß¾¼EL`NWÉà=H×Û×ÙÅ*,³â°³NBß×xöJÒ´ÜÔìD"ÐÛË+)¤>õ© þa·(¯ij=I§=}P~«pøÈSPJÊs#õ=¨¾(?=H=L¤ë=M8=H[jÉ=g¾=JPÊxHk=K=Mä|{uFgQÂ©²÷»h2Üw#--ÅtãV§dÎ®ìôdQÁÙÜuú{(@Ç+Ú~¼$s,óÓ_¡ùØý0­Îmhjhnît#´wgH²"2ìG`øÈÇ=IÒû,Ë«ñÔÓbá±µNü}-½Üå=JN=}?5ÞüT,G8§¤zÂÌC,nái´,=M=Ijj=J¦VÖÌ_c9qrU»î!r)­êy·Haã1§raÞO·=Û­xz0Ç£yýIÝ×<ie¢(º=KP´§Sï®ØDÍ`4 ¸ìbcÆå=¡ø¶µä×Rì¡I=gýÔìÍÁ§§¡q{¦Þ§¹¯«ªI§ÁÝÍ_ÚWü«NZ6/hÇÚ=LWÅMÜÒ=Iç%[ÆJ*ò0L}2,§FÌÐ£È¢^³ÁA1->&´¤ðëÑz¬mnoíðîïE`ÕPæ¸¹Ê7ÝÕý=}11eR[1!d(@ü|D3É*u=I¿§ÞË#ør}WvRxìÔ¤±!fmåô*R-¥üÙøèCu=JÏÇªÕ(ÖÀh¡Ì$à¯óÅyéD:SM²Æ¥4R^=g=gªk-2gÇQÿüUGÚÖÙ(Èâôô#d=}ITþ_¨¢£=L&ÒbP¬<RÃÖÔ"Ò¯°gUò-T÷2TóâSÍ`@êhwþÃ3N+=Kÿ_ïá»ÒOWF|O7X=g»Q¹=ªÖãYðØµE×É`a³ñúZ½(L ²ºB,çI=gkË_%MÃþYü¼çKsDoû´þ.2¦ÞTe,ÿöÓÑe§ÔÀ¸èâÚ=KÉdÄBQ!è*LªÚKúKË¤kÉ²ö-JFÖÆTuÅÔðRzB ìÀÑV=ee=JÜxJeëYí=I=I¨Õ/Ã=}5ñ[Ù»ï2Á=@­]î7´[Ù?áÿì=KÃJí%`³KÑò´!4(=I=K@¤t<ÜØÅÈBÄ"äíOÖÇÈ"º¶PrùVÍt=@v.Õd®ïíyøÓ=K»Uz{[Nµ²%Îß¤=HiÀè3·cà"ôó!$ò*È°fÍC{;ÙlK1û»Ú¨)r<?wf»ÿñÁN£¶Xâ±ÿªÅb6om]É=Hz6ëOí-h=Lêÿí=}0¯SÚâúD?5NßSÌÎHR}Ø®Að@#"öÖL qÿÞ8Ù%*ÕôH"Ø&ÃZµ#T¢Ô"((=MDCùCKc2ú­Ê®?#+/Ð¶ðá¬w)mC^Ö=@z}þ;¡êá5=g06Ì¤è:U`©¾û/~(ý.;ÁúiM(V=Ka:Í¾¹*h4#õ"ºl¼ÀïæäÄZäÔáçRØGÃÃ<Ù"dn¸L¤äÄ[F_<V©i*sªR|Ô=LQiøL3TDÁqW}»u6£lbáÙIm¯qâ¡ÿ¢oX=J%Ve@½øêóË|ìÒA¨à£k0jwßØÇ_¤ö£ßKõdÔ¼Þ÷¶>zÓ±èÏÆ%d$$`q)²J¸=,ü=àuÙémß0TôzkøKVÇ³P×[½mÖhd¨²Úlû.®g¨4Iç0pß]=@QÞXrÍÂ»òk!=Jð»Â+Y9~èÛ#ø2/èð^ÿ2`?¨w0"|jpÉíAMNNN°­­B§èèpqÛvhÜT¨è÷·ºÞ°|.MCê·êÞDÑ=L¨·âß+ÌNK5ê±^ÝË»_uýrÉþ>Ä|[à<wK¦pü§ù[>4úÊ3­+}ÙÜ=IÐÊ`8ÜUæ¥Ö<=Mò`Ûò`;ò<ì`;ò`;ò`»kyñ#W¼Voè<f&cF=L_ié:Àt=}úzY94@îÂgk|ø@USluØÄDûuú=dy=LvOÚ=LâG"¦Y¼=Ju³8:ÃÜ²K®¬}UÀôöTÎ­tÙ¢=M¥gÍ¥WM¥¡w­%=MO-%oí%_mÑÜ?Xcy*ÄQÕ=K¸VêÁQÙ+¸^QêÃÞQ×8Z1êÂ ^QÛ;èûçûè{ç¤{hghghÓgÓhSg¡Sh³g³h3g3hógóhsg£sh£g£h#g#hãgãhcg¢chÃgÃhCg Chg_:X§=M§=K½Í§=J¹·M§=LÁ­=g=I·¯-=g=K¿í=g=J»¿Xsy)¼nTÅ¸fé¹èTÉ«¸nQé»øÎç=g=KcÑëÂ=Löo©¬l78ý{sv¢HÀm®ä¶C(Cf#u£X¨z=IFÖÿËíÂèù#5ÁÛÒ¾¯ÓSvKëF©o®`ª.Î7ÃöÌºÄÚRWypWb@¾ê/Øìp ÔÎq+áüO=HÀ³d"ym{¯ùì­{d°¸,aað¯227ÌBïrÞìtÿì¹½0VRSóÈ0Ý_IYÞñâI]Ú1bJaÈqÂjUà³iYÜój½Å3=HiÁÝsÈZåßÕï¸ßK-Z½º %ûZõ7ßÓÖXîïÀÈì/zñº$0{xzåã±Wªÿ8ÑÛmZÏÂà2üðzÕ¬ôYXRÿ@Ú<Xð¼GHò<@~D`P]Ãkqìs[¡ér¦{½QãÌ]x­=@¤ph"ú=g¸Ôû{.ç½È±ìn¡6"¬KJÿ6´÷=}Ï³=Onÿ>b­Làiÿ !tbïõ$ßý-(¤Û ÌZM¨n®º=@ÛrãÕHYwÚºz½tx½<=@Ü2ÄÕxYØüÄm¦t5âÀÄ<<,@<ÔÌ~Éÿ Öº£´Ãüì¹x8AVhÃ<ðµ3=L`zyxÅö7v~k4wx»h=@Þ=IÓ¼äãÖü_þt^t¬h.rGû£òävÜ,3=@ü6§íÍö>s5õúHbæú|×ïfo{O-@à¯8àB?@@,3$¼ÛRèwø&åoõs[Ë©r¾FÌÐ°ç«j­aÏzÌ|ñ«ÚâÝYë¦òæ¶zSÎÐ¬©Ö`ô·ñF£ª®=L÷¡a¾Q2ì­å@)ÅkFÏØ"Úe/åÙÁ®ñ(­Ãã*5I.¦³ÜÈ®X %ÆºÍ²ñ@:-ïsZaú?ÅSÊP(ôò:¤  ædènij²ÌõÈ"å[½Èamà=@ÙÂø>KÇ1 +Ã÷¼4qr¾ä¾]û>hhµÝ§Â¦nj=}ÒÖäeWG »g=H/ Ã-dhî6¤+|=°1ÅÍòåKL£{kRp È_áñÐ`;¢àtÕÙæµ4=LÕ¤V=}Ä!³{=Ièæà=LühævÏ=I]²O2díËìéúð]Ã<ÆÚÖÀY=<=La6vÓeíÝ/@Ç`=}¹é¸å$"gj¡õ.þµDO=LÝààöhªµ´´=Hà.SbEâp/#z=K2úäymP,åê¯©¥moÝB.ÅTmÅáYM_ué±ùEO3ç¥ý6çÆ8é5/j3N¦[®EtØãÖ½-Æ?îÅôíF=ÆµÅõü=I:¸í´ÜÍl Åe][é¤ÍhÆD:¾m_=M<¨¥KwÎeà=Hñq.Á[FÞ%¼¥1¯=Lù)íK¥ÝàÜÇÝî]ü}Ò:%JÐÆë19ôe ¡=J=@dÂÝ¬A2Î2«Ç§Ì-¨Ô1ÄIîäìÇÃù&g§SÞÅIÃàZÍ=I¤=@4ùäFÝtþ¶yÕ¡¨Yë¸×Oå=K_ì¶[R ¦|½¨¯$¶¦OW¾RÞ×O/&±â6jä[6ç$L1e.ÞZ6·UÒ«ò4èoéùVÐZåÐ´×j©ù!9ÐÓz4igó=J}-ÉÆ´×uÔ´®MîÌ*.9ÛTÚWW°ÏfB@Ïïà&=gªÛ:zuzÀ¯S ÊþH²ÏÌ:ÙÐZïWgÓð.fdÓV=M¤íþ7[ÿå*ó¨W.£Ç8ØyÑ)S?*Ó×ÀmNS6ÿ]ðÂÒnë@cµ=Mì8ysÞ¨Ä®Z¡Àp­òT÷7+dõ=g ?¾d½ÐàK@UÜ0ÿB0µ´VÒ¹ãúhìôÇú³¡ÞB=L¨îêsYÿu@ÁI7##G¢SébSÉTSí¯jùy¿Öô?h9<úZ¤0uªRÇ}àÄÒ=}s´ëñ0_nB¬åw=L^Åjò¥³=J%`~`ýÎ±Ñ÷ñ>/Eò=KÇ>â=Hhdù=M5ÀgvÞ¼=IYÛoTj²5r|­±á"5D¦/Ò²QÈà¶SlÄF¸ÜÏ³=JN4ÍßeùV(±ZºVQsÓè/?èQ_·Ô{wñÞMÒ;=gä^|é+gÉþ=L»Ìi9ÐçlÊÅ´0÷Uó/¦¢àU=I÷ÛoH¸zZP|¹tÃZ;þTmË=g<añ¢¶Sü/ú=Lø´$¹Ü®XIÎ½L¢ÓapÖ8üØ2w=R¡d¾JD&"«ítwä~=LBL<õö¤¡77jyuZN-k°çgÏSªÓr;¥>÷Û`rLr]è%»j,=HÐ·ÞØÀkÒöÖPJxOb-ÿãô}ôD<^NÂ11|²ôw=K):P4Â9#Ú7ÝAË-°¯9¡q!eøU4ûèI!ÝùÑ.!)(À}¡D½:¥<´ªdd¦L¸øBR¤·³S8]Ú;Ñç27,SØS$Êîáj£ú,AÒß~=@?,CK5%lxDSú0qm6´påpPu` ·e]-Z g¯=Igû`Û,sâTR³s[Lø%L´:=éÆÒÄtÛ­å{XÇÏ÷ÆR³ÄA=@ËM,U½¦zfIAéóåyìP]¦8ÜMqèéÜ/ë^z@"þh±Ì®e5àÒM+tÉlÅl¦éÞ=@dÓÈ+q´µTµÅO½mé-z&µ;õu¿ÇßY;.=K6f»Íæ=IQ®ééà :Ô³YñÙ¸ßh4Ð¢ðzÐaMWÚÞ@§4=Hö~[÷æÈ2mfH°Gf;<¤ö+4§=LC¶ã©âsøbÉ¨=Lo´4Þ=éè´Úúág";§Ø*îÔ0ß£d»=@+ÄfÍa×«Nzñì<ÏÿÄ}=MV=Ly£VöÇq=}AAw=g$vß=gæ×.H8ô`Á±¸äÉ@¤|ûèÎ[3pÀ^=@â`Ê¡ZÊIÂ«854éÀã=LûÜn¾å<ZD(=}PÝ×å%_Ë 5Ù},ÓEÀ¡µÉNá2¬t¢Zm||j¹ÙìjE`±ÝM¥=LÏ-%=K¿e«u=I´É)=gÀ=I"%>ÅX@9¸L=K!¢Z}û´QÓr¥IÌ9wûü[¡¾5ÜÎóÿ{ÇÇÙÍ5 ãh°|³°MÏr]¿¶¿©M ¸ïµJ·ïí4=g!=gA$NR%«ÄÑ$µûÍD£ê~â`¬LºÓ{ö=Ê:¸«¶-T|J>n"`©J$j÷0RuYóè`ëRð@6òÑNQ²·Úï`s[cl4òÀ1òaJìh}ý¿`m¹Þ>-?ïÝ$¡ £½)$ù$ ÞRðS$Ãî!/Í#¢·gÄûZ¾õw}&BÀ<1ä:ùÆzÙÎZO_²ðcß{D-vd-°Ê. ^Ç?N¹$Rß,b| ¯I×GÓëÓ²ÁsqÑÛ²=}w$dtòW<]g©¤=g4Ùò=gáøWÝþj7^wøÀ=M4¡^¬|Àÿã£=}ráìwþÌ`ÛG"ßÇ,>ÿPÞQÌu^Ü-»{/Ó¯=IrxÉæéÉ*`î?µDë3Õÿô.%ýBÛ=}òAÒ}@ÜUÁýÙmðß]@w7ÕgùÌ-Ã}ÉíÄ/Öý}oBU÷Wf=MËØQHàç81²H¤ûIÞÔ £y6Ò¼«!¾,àØÀR#÷ìüLUS ?=LâÞµSôò+{%}ÒôÉD]ìgçJÕï¯Ëu³¸¯$WGm¨Ëwà¹~æöñàEvÎá?#kn¹3³T¥À«fRø}½âÆòXÁÌjèC=g(þãI{çkâ²f^+×wxO5<Ü×üÛNm÷?Á°ìöH¬ÙÙ0þ-Õ8î4Ð¤Z]¾Ù¡®@ÅiÓ"Ø§«<ÉKÃþu×éTNäÊÓ>~Ð)Z¤º×3w´®Ð1Fè°¬;{¨=J7Ý²±©Kí²¶Íø®ÏE~ËÞ@Pªzý±úS}{ÛÎ¾<Mq$W>d*ÀÃÐüAvý²Zz×.¹äD³öãéD*=M¡c«÷ï:=M.ykèØÊ;§´øÊÉé|þm²7UÏé=KM|äï¹/ûØR>hï¼0ö 0ë-kéæï/@/þè=gëØºXpÙáÀ,§þ C8Ù-ý)gÕÜ¼yÙ³lz÷Ãt±ìE÷ãéø4¾K»jñ}2)w;bÀýÑÛw¸ÓC46"MðOm%Úê_âO-óÚ=KL"×Ñ¼ãÛÏH×Ó w2;js=K®¦ÍªqÛQ=J²J}xç_;³«×;øõ±ç/ê:=JùdÝMA1ÇÿÿWhZ@u´­%àl¯Äih7¸¤ÀÊÃÊ3~ºk&8»I=}Á_iVgë³¦XøzTjT¤Æ=@¹RÛUWËÆ"¡ù0÷5mH}Ô^5Ã Öf^¡ðÒJ&±[éëæïJ 8ë7G³V=·½­ëµa¾=Hs¼X¿¿¢´,ù?áÐè;·¦[î©#Òj;§zÿ.a½Çññ ,µâ·cn·þXöÐ=g}ç§$7>cÃ2Òqm$¥VÁèh>çT=Lö¨wÚ±0°çï£ÐIcSæîÒ¹¼V­¹(Nã JÚD­ãiéá©æ¤¨ÖFÛw[=L8I¬¡<Xæ]=L=IÖÞO5ÕÉÞ­XÇµµæqoåb=HBÄDãÆ¿¤M.EÅ;c¤ÊIÖ¡ò¡Î=Hç©glÚe$fá¼¡(ÛH>¿îd`èK9&Ùü¡Ï nÈýZöÂ/X=gHå,gÎpÆ µöÒ§/uà³yLkÒÄã*{Hvîäs=K|Êû2{æxvcý~yKð´Ûß|ç_#AîdX(=@åy6ÀºNbö=}ºF}Eþ´j±î´l=M·MËÈî=@WØôÄ;±xjåÀäµgî¼ssK8ÂâN5mÏF)³ÿ=Ûf"a jcýÑ|=gl¬Ôó=L=@ws-Ú»£ñ mÓUÐ¼KøHð,°î¿3]>öPóÃSÑtÉOÜÌS=L½÷åã?ýl`øy7¢¼âr­"ñP?ß gÿ_5æº/4ÛÁîJ*RîîÎÉä|è0æSX¸Á=g&ìOÑK$µKMEãÞËMÓ·ÇT3nq½1Tö×yÝz´âßnw©Ù=Ll 9Dð6ð%(ï×=%ÆBh°ÀöuËÌ/1ÀwàV;Ì_80ò=@C<hVO;©AóÈ=Jô ôRk2]ëUE}±_Yö¤ XÎc¡~=Iëù?U"+1=MíÇaÏ¦%ç^;ò`ê`;ò`38ò`;ò`;:ñÌñ àuÿaäð¨èD¼e¾5£¬~ßÿÑ1FÅ<:>Ý¨>AL[(iã=MfK=K=@lC¾ãÃ^ÍóSgÜ WþfO$:®yõÍ§ôî§QhÎ$¢Ì(ûôLÌøÔ³M¨/º=I<ÔÖ±ék=JëJ&CXä3c±wGÔ`=HV¨aNsOËì¯ô¿6©NO"{±ù9*ñ+j1-oïNo=LkùÐ¸j]³_¦¶^Üy®4X*ô9ä/NúãúØèP¢¹(á(MÒþz¨x8()m@×tOÖðPFPUw=Jiq$Ñx"êä÷ew$5w9AüoDKSÏÞsÈ?nahvJ`1 õ=HÐÎÜ­BÍ}øn=@$hiBÂGr¾à;übâÍ"^ÓW²Mñ¥q2eHºj2e1W×sâI+Óxþðº ÒÜë¥¾¯|«ñ¡Î¸Ëø¼ó½ä=Lõÿ^Å!7ç´V¨ùÌ+=}¸ßÊäúgæÛ>Ý?+ÕqQf~NGÛùÅT;ò`lñ`»7ò`;ò<xê@R;ò==@~é+æ«óÑ§Âè=Mó0©á,B*/þÞñÐñÎ·+Îó×«/=J×i´~=}o ®uÆG¤b«PßTÿÈiO2iâÓãT§F:r!´ðÞMBµSÇîðSäSÍQèSI3!ÐØ³@ãAýÉ?¥Á|)ìÊò)[ãËÌ+ ¿èüQî ßQÙy¶Ll×Hº0.i?7o­b÷=HÕì==@YÿF ¿Fz§Ø;1( Úí@-»5==M´5%hÏ{ùTÎ¼ßájÈpXY"í=M*£®¹éXÒy#Æ¾ú?ÝÌÄ[:Õ2óß÷=MßÑUìV¸µ;çó!&¶ôOd3=IL91Ì{BR=}ò6ü=gqãÑØ¾{µ]òL&MFfìvø{ÊÃ>=IÜv3?aF5mÊÄGLþT}}ªÒcE/qÂq}DD`x¬;ûF&áµgJ =@Û¡_=g×µ=J5=IÁó3ÜÉý-7ä/Å2ÜZÿo­¾1CÙ²½WUÂÙßp(s!¦iÞ¨=Iõ Å3ïqQÖýc$ø2¥TÀì]f>Â{¡ø=Iù=gCõÆë<°Úaö=@(¬#}ÿ&ox&L¤c¨ý-#R¦ÝkèGß®I(5úóûJGûàÁyBµù»ññ·ûÁÑÊÒÆÛNÅõØ«}7öò­=LêÞ­SSLúRõ´°G)Ö¶=K=g2Ú»ô2E²Ï5À/hÝ=Hê@oLÿ)tíI¾«Ñ`_âÛ2õÝ=(ý³rGÎó1ZàWMot=L|¥p=Kuk{jÓú¥è`;ò`;ò`~ß=@ð`;Al0ò`[QýçGlv¢=@DÏ¶wÄ®ó¦R[qÄO?Ò¼²÷i_M=@ã#=ÏÕI§Ð<­ö9ÆDÒÚý{äã)O9ÅºÅzY6PW¥ÍË=@`¹v.=GMÅ ÞÌ9^Á%È2=H³ Ôp·jìÂYz6A3T6­=J÷~#¦Î¸Í»kW¨èië 5´KRL+Á îËò¾Ò|R~·JÐ³â<I{°ÃýßØþK¡,1ò>þItßrÝ*îÔ^»=@½Uyck¾7½aZ0ÓS6ÄrøÆ@OL43¡ßeKBÕü+#üleH?#ñdiÎô/@sývbcXY=L¾ÀýfP]âäùC|h#&Ä ¶Í%h×vÂQÜ=g=@=LBþ­À=J¦ñG¬Ö­¹Gâ¡K4õÃqìÈÛ4ËuØÌ©°ÃÊzì>=KVáàR²T/ËçMÒ=Mê6±±hRR½9J¨¿#ÖÖ|é~hTÉíªæÄ¸°Xé«³Ï+X»=J°Ø}Z¾Vú.Y?,¦]=Kì¿¤»+ØhÆu=K©3}3N©d¦ÀÐ8=}êÒ[añ!yøí$=H=J÷³&Äk÷uÈ³@ÿwµýLZ/ùSk8¾2âõ­Éïò¦¶kÊÁÙInç=Kÿ®CÚQWA7UeàOª*¡Y±ÈÊáK3ê¡P´¬ç¾ËóS1e=C»ÚWyÏ=H0-ÞáJÐ=Jïó<Ú÷=gìº­R0f´ºÜ=·zå²ó{ú]ß=LiÓ¢zé1-l5ñø0 }|ý+)»·|É¨ösÒ)[IKðÒù¼x=ëis¼øÃ7j²Ñ]µ/Vn2dðª¸9J_ÍB_Ë+ÜÀ Cô,ryàûõ:B=Hª¨¢­úgdN@J"ÃoéËÅdü¶~ý¿ba®sËüÎ¼8sûXrcHg#£¡ûz¥6$=MãûdPyB¡r¨¾3 $M¿]LnÛÌ{øÇYÔ[#1ä|tºEÝPD´¤åjj¾$ÃMX$®¡É~¥kÈÏ=Kõ½=Ip¦I´=L5;¤K%å7ä=Lþ6è<=KVVµ¼ÏÅô@ø¡õz.üKÇ/è=J96³Éµ§Io=KÈªês§#ê½^´Ç=MäÌÉiäVÊIÚ¶ø¨I±°xÆ­ëV¡¶Øü¾þÇÑR¶Oòªá5¯äGcû+DÍ½ÃÔG&²YÏÝÿÖG´Ôªq~¤ôÑêÅÚÞÉîÎ@FGÕc~±? nn=KÜÜá@6Àö6À=@K+Psó±5^ºÂßÒÞM7åk¬E©ËÅ×+zAàª%l»p=I!Ö§esºïibÕ{ÝÅU°kuw D¼DðõztAâÅø@Å¿uÌ¥L«BíuÈëÜùnAÅ=@?Ñ¥8ÂGÝ?¹i"Ñ&)E:Ï¯Ù×aýªÒôÜð»1Ù6=L¯Ù×¬,<PiiÁÐÓäM-5cOíë¬ÂÃ²*8×/t¥*Ö>Ù¸¸ÓÃP&ÌW¡÷·Q¦:Gñ×8Q¸ãþêVz¬y¸¯·ÄéU1=IïÍ,¶n9|þâ{Ð¨PoÙW+Ùõ¹=J=@*U3~Ny/¦?ªV_YFµó¬ªÆþÁ" ÔjøMC±±=@IV[-ÝÏÃ£ÈÊD(ÎS=gnãªä)Íw<%Qõ÷¿¡Ë°$=JWñHÕ¿¿Â=IwÎúøîâ)âô-ÛÀ»|,@^YnÌÀCyÿBZ¢y+VûÜ=@Ww=L£é{["·D?Ös´ÜUoÇ=L¿XXDÓù0Zû%ÓÒ{ivc=g#]òB:á7+~LìVpò¸îE=g¹ªþ¿Òu#ËËÉ|ÿ¶ßañÊ+|+WnØØíWÐ¿îÆ=H+Ñ+:?Ín¤¢Ôéhí#rÝoîµ=K³d ÊGøw¤Îû«¨MZµßBì­º ÖïÔØ÷H=I9+Fñê»¥:Bn=KÌÄÿ*W©ÌÿXødãùØ*¬zad"ÓÀü(=HKY;[=MÓÓµ)/ i/Ì¸ù@ÕÆæìÔX&o@_9ªÖcüU©ö"¿z¹Ú¨Z8¢Î¾0z^`SßÞøR¤Ûvq¬=@zj øôOÿîë;?qFÀ{NmºP»ÿFnÄê«¿$o»TòÛuv0áPÚÚ¶j=@48DP35£îÞ¼¤.Ý6ìbT¶vL®;@½àm`xTÆÛÀ@¯å¬Úû8arñF3²qîgË;O÷¢`*TÿÚ2åoð7ýDÊQ,TÛé³ÀÐ·+ÛÁº$æSkæñ{£[óqJa½8=Mô»Q«éX²<éèK8Z Ë79k¦ñãåû()PoòM=I¡¢[fp ]¯ÎX§Ûwá¢=@ÐgçÝ¯V¯?¥¾¤÷Ý·äú,éRC+RæÊ=gÉ/s®NìQC[=H¢ªç2Te²Ûæâq23ÔÍ9ò¤Ì=}²²±ów=}iê;½ý-=}f° SSÄÍ¸IãÀ¸_[ê=@I=JìC=g]²;Ça¯c4mDhGI-èr=g=HÇ=HLYjRÜ},Mã_Åý<|gü¬u ÎØ~Ç:Al«À#ÀQ4ÀtR1~V_õCI¼dþQl=Kév!,÷sú¹lºQlëþß]·ó7êª<3TlZp~.® }l=I2Áè³._R,®en«þ2x¦ó$þÄ]÷luXA|8øA-B=MÀ{jAYg¤göIwµê¤äRÐû=öh¼þèv¢Cm_ãÙz=MlZÄj¼ôCeóCkRút=}Ý^EÄá~Qø³¹wUHd~òDý$*RîË Ô¡*Zb¢åó-¼þï~Ú¢Rõ¯XÇDö"5Êh¿m§¦??ÜmF)´¼Io¨a;p1óÍ`¢ÿ§Í´=}üq=H*c&â]Ä(ï[ÅílfåÆ`¡ØùÁó=K¶d=Kç=IfíÓ¤Ú¬ËÃÈXñ¹ãÆb?6-­ =Lkvýµ§c~ÒG4~Vv¹tßÇ:òÝ&û=KàGálcô"=K]¸XöBï¿AsÄëÆÚHÜòf¸UìÌ]h~ýa7ùI9N8©Øâvú=g Ì>¨=IÂÁÖ&r=JäDBÕx_ SúÃÍ¾tNÀ5²ô»û=J=HÒÅëdÅÑ=MÂºÆÝ<¼KÞ¦é§(µa&µ¡¨eº»O+Í#=Mç¹ã Ke|hQâ^1½A=L°@k%8èÁ³»JhNKÉÓÎ=I`=HÉqOÓ,æ·=g«hÃ*eEaÔÊE=ÙÑ*¦Úº¢òXvÉ¬P¸5ÆÀvx¸6/º¯îÞäêf?Ü»ÿáSKN¾Ý@³J÷µ¹µ|øÖbÈn×iÛÍ¶?D«.·}â&A8¡ÞÃ÷=Iñècø¾#×¥ÀÑ`r=}cÖåêìªY+®öÁÊºÀ½Õ3IËª·@»ÊCD^÷wc´e%­åÚ2Ô¥¥@=H~ä¤_ÿà%déã³ÅpOºíiÐª"Ý&©¢øªVªþ½­M3ÑÓÈ,On=£r×p³ª@Ò>YtÛî0lV=Mñ76N=gHÃiÆCnê ËËk.YÌ°=JûaÐ=gÀî®úg®é¡zù*T(.®³]@ßÓ¤3=L×=gÞ¯=Hííê²mgÔ#û9¼L=Lry=g=gêZ@VcÌ³©Ãö=g=Lü¢M-QiLñíYOÞ¹Â÷Z"Ë¤Ïmy..¹¨[Ô«í&|½{æ¹úR»,-[f¹Ö¿û¢Ç=ÈXJWùýíÄ¿µ4¼b?b=H¡ú(f6Ë9;Õ$#nQÍ=L±,îÖà9¿BâYQò_ÞÅo¤;¶ ¸®I1ÔCêÛ,#¸,=HÞVK`1áÛP=}Ô¾=@¿yÐî¯ælÓ"ê²LÞãD=HñÒ^ã£D"ªíóé=;2ë*¨7,æ*N×»µÃ=K7æ¸ÂÞ` »e,¸B·±sLQòô@¯Ð}©>±cÁm÷ãwIü@)êxÁÎNæÜÎÙ$ãR"O2=KÓ:?ø,MÛïtbªÓþëg¿B¥60HVä(ÅÑ±kg%]=gSüv*@«¤BN?ÀtX¤R"óJ¨l]øl*ÃAÿÜüÀG2®=}3lC(ñ=:ÝHüôgV/À¾|v=@¬v=}{I1xcáS=L$>O¤Ã0eÙp>úd@ÁX¶ô¡ìþT´GÜùF<Còk¼Úå¶Òïåp²}oe=³uw¸àüèÙ=ûHfA#- ^Bo¦¶î¥.eaßØéy£=KW2¨5[ýnö½l»c¬hêª¡129æ·+æ^uqóQÎ;ýeéýÌm=L½hD°8À;ÑwI.ócÍi=HðÊÝ4yÌ"Ê¥GdFçú+=L¦kç½;^Ì=g+±Aa¤Çr¾µ=L=fy!né}þ)eÕË¯ç,Æ]!<à¸5ò«ø85¦Á <±øµß¨ÀÏøVâ®J?æ·mÛM¥h{=@¾ÿI®E£°µRËÃÏÙÙG]«õ{Rzëõ?ÊEDr2=@®U;²Úé¶ÔÎò¬Éli¹CÒW2=g¡·UP+$¸n{IùWWÓ*KÎyìÑ2ãÌ(ÔÊl>D»áqMSñ×êÃ¹ç3Êòü&eÙôÈøR%ÄÌª¹2$ªn«Ó%ö`ËX=gHH.æL=gíc G¯@30ÃJãmÉv¿o¹ï~ä{}ÛðñÿH=Iü]Dlï]guPQ*f sú>taK_ïÛ6I=xÝÒþÁdnSK=}Òë¼$zæc¢Þýñ2É37ÊçWç¬nâÕñz²`,½×WÝ×¶Ç¯JÌ=gïÔxôªAEa ?)öHÆ~z:ÇrÓàt|âh*zAxès{jÂ´B=H4C%XáqLò_¢Êþ5nWÅùò=L=Ku>¾`«g¤p®í0ëí"µª>;ÕñúIR3m$sbëC=M½pp¶«¹ÿWÍakI¾mÀ¡¶þØ¯GWÖ§b^}^´=ÎfÝ=K^R÷¹Õ%P¶ª·ñm"ÕxÞEO9aÕ=Jfa_;Âìàì`;ò`;ò`;Ú`;2éÿP*sv!t`ÄÈeMYuAé>åâJåò¥H¼:AlM5]ø§a1QÅÍÄDe.åñ¦)ÓÒ¤TýÄqÿÝ`6â~$È¼saüuM6©·²¢Â¨¨¸° À¬¬¼´¤D%¥ËÌ<¢«¸6øxÖÉJª*êiÙZº:úyÑR²2òq¡!ábÂBU"©ÛÃæÎþêúòÂÈ¸Ðð=@ì¼Ô¤DEeum=}I9Qqg7O?Kk(¶¾Òèð¬D=M]IYQWo=KScv^Øl´d=}ø^ Ô`xM ¿}Ë+iZ:zÔSä=}zmZ,RÌZ1A(¸Ï @ÌlSãBihs=H!W_3ÖÎÞ=Jú²"l3cþyR<ÒLµÒ@=I_S~¼¤C=}±ê£ãXDýhJ<Z9wûÖJâx<c3¨ =@¬9"BgPï¿ÊL=}8C2é[w´mDó0ÝZyHoc^¢,$1å¸1àýC!`¯ec÷ãA.ÜP¾R@4´lø±!=@Dx/DCÑ]Dr¦ü¢3äìììØØÊv$Ll}kllLK_­­¦%o¡¡¡ñô4¿Æ-kìëëàg®­¦%=I¨/NNN##=KÝ¿}L=K=K=K¿¿ï(¶¦%¡  ps3&%dE¥=glß;2êàP;ò`Cñ`;âP;ëtñ`üBÌUh{l³"ìÆkvaì{Bð¯=Kx³8©P}k£8¾LÍjõ$vA*p1E¿%BlñT¾·¿c<ké¿VYõ º]K¤ù|b>ËÓ, ò·x=g³7­}=IK£7¶=LÍkå¤VA)0±H¯C&:,ñR®W¿_ëê·fÙöÚ]I´ù{">ÉÛ¬ óãëÔ¢üÞ=LâÈôô_  iú;vOsÖM~çÃ¤i=H]u#.F¸âó¥P~£<LÎr$=IÕVzÛéÂÄWFxûeÁ!å=M>ÆºbóÒ;x¬Â;Fi÷=K¶«ì­kç6Ôîgæ õivnH°O?_71kà_ý_»!«"èê»+ÆÚ¼àRÏ´`=JPéøkèYú<ú^RDyv=}ÊÃlå÷$G³5µ}=M=K£5¦ÍgÅt =KÁ,°±JC=g*¬ñNW½Wlëë§&Ù÷=H]EÔùy¢>Åë¬ïóëÐ²üÝ¢ÊÔ4`piû+6+å­®s8=ITío ÷=Iz6nPðO>K÷1fÀ_ÿK;!¦Bèòû+Îº<Ý²ËÜ4]°éü/kì³Yøz]Hyz;>Òlí×v§³9~Ë£9Îo¥¤E­ãÕ_ëªäXO;g©w=JÞÉbíê»w¸"Aí¬³JÎ=K=LÞIÖ`"[ë¬XP {gþ!ê!®KÏ=}Y±jøþYë¡ª*HçKv=Kw3:Áð~#û#:¢ìNe½d=HîÉÖb2Ûì°DXR0ûh¯¾!ëý|.tãp8nl¢ö=LC(U¡h%¥ß`;ò@"_;ò4B:b];Rüè`;òÀÄ¶Áôëzém=JVs:Ct=gl¼KÏyÊAÆÖi¡ë:v ñ@þ6fAF}_ÔÑPK¼Ýë(P0è+ÈÚhT2÷õá/Ö·)5°·ýÙ(=J®×áä¸=L£"=gfNÏ×ú%Óè VÖs¨¶§TXÕàcüc&¢Ç!vÃSÇø9ÏÕ~f¨sv60zÀògvE=@[Í>½£4Ç±¦gR_Y® ³=KÙTçø¿:wº{ñ7(>â´VÜoÇEm¶?~f¾«Û~ÖVKìM!£Ï8·$¥V¹Ó4«×mÌ-=@Óá:µli×d.|FçX4dü¶}Æª²îBJ¬p.u_²âVÏÎb=Jd+=@n¬Ñ=}Ê^¤çbÄ4¶G`±7 HqPø>| c6DêN<T¥%ÿF¾{,{td°rô´Ö®;=L!4ÞòN«c{,3Ðttew9Ý¨<$p8 B9gáqb»®tC½al);÷=J=HhØ|_^^0í@=}[{osÜ_éîTíæ5ÇA>o§($ÞÑUEÅHÅë¶ùÖPú|=L=LkS|êó[érqNcV=M[íË=@Ágº#v#N·ò·«péÓ{n³X®b+è?Ólù¤æ¶ÑGë=JZµ@æ=Lî]£Kæ=L¸ÑÅG~Ü"ï³è)J¹Î îÛX±r+æßÓX9"KîÂRXIG=M¶°è«ûKÕ±.]è6»kçôKgR¶0è»ûLõ±n]£h6Ãkè£MxÉcÌwOþ«t!=LwWþ¯ô"Lw_þ³t"xgþ·ôÃkZl^ÃJyÆåH¹õÊ[_üå¹þn@P|8pûÂT3=8pqßâp8ðÄûrT3x5pq¿´@ST35pq?´@sT3þ5ðÃq@kL3þ7ðCq¼@kT3Á]@wçÜqOâ~7°ôûjT3Ã50¤qo@H3Ã60äqo @L3Ã70$qo°@P3Ã80dqoÀ@T³qwF³´qwH³ÔqwJ³ôqwL³qwN³4q{<LÁlºãpÂcððÞX_{5ÂrrSgÑSkSoQSssgÓsksoSsóëæ«ëèËëêëëì=Këî+ëðKëòkë´ÞMÉ»·Qé¬ÈÞOÙ;·:Qê4?%?&¨?=g¸?(È?)Ø?*è?+ø?,=H?-?.(?/8?0H?1X?2h?3x?TÑ5F°Q5HÐÑ6JðQ6L¥Ñ7N­0Q7 #æ3=Iæ=K³[MX7¬iòçÐ$llx~!üSÄ|"TÁìCQ ~8Ô{PC^Äþ©$iìwÒcNÄ)$yWìÒdnÄÁ=IuGØ}ôfôý¡Ã=L=füý£C=L|fÄKvìDK<vô¡ÄL=vü£DL|vì6Ó=I^ë92sâÝÿÃ)nÌÿC)¼nÔÿÃ*ÜnÜÿC*ünäÿÃ+nìÿC+<nôÿ!Ã,=nüÿ#C,|nÄi~ÌDi¼~ÔÄjÜ~ÜDjü~äÄk~ìDk<ÂòÈö!äld~þ#dlvÅ´IvÉôI¤vÍ4I´vÑtIÄvÕ´JÔvÙôJävÝ4JôvátJvå´KvéôK$ví4K4vñ tKDvõ¡´LTvù¢ôLdvý£4Ltv¤tLj¿­¥ÙQ rdO9åÃµÄ´Q¤kx~KèÃ$i°~ÐÃdiÀ~ÔÃ¤jÐ~ØÃäjà~ÜÃ$jð~àÃdj=@~äÃ¤k~èÃäk l$l(l,l0l4l8l<Tüd¬£rñ`;ò`;ò`;ò`;ò`MsòZ=ßü*Ú=Ý=@BÜàø"zÜÇ9VÈº¹VÆ¤YVÇÏ//&;ÿ¯0++¿o0=g?ßo/Õ®Z¹WÓ´jYWÑ¬Ù×Ô°b®#÷Þl#ùoì$üwîì#øÎ)Æ»þ©Ë«¾iÇ¿Þi¥NÙ¸Q»TéXQ¹LØÑ¼Pá«ßË^jáßjäÏnêà=gIÜãpbãhr|ãrRücÚ»]ëê[]é=LÛÝìâ±>o=K`s>q s=}tpó>pG*Û`í@Bàð8"{àîB2ûà9¯å=H·íåÃ­%=H³ÉÈñvÉÒÑöIÊù6I¦×-æ=I¢ãM&=JÓ}&=I£Û=}¦Çú6L þ9¶LVLüI=M°h¡åiq­K;ìh:ò`;ò`;|<Ö`Ëa%ûè0Æ0<[©üf#ÄÇÈ­ýêEº#n¤ÁDÌf¶° c´CÔf²ÖZI³°fÛ@u°=KXÍÝr©ùy=JPß=}ºHó³Of¹Û=@öÃ!«F¯«=He7ó"å<5f¤úuè&Á½×EÐ¡QyFãæ=KÐ%!S×5bóÝ6=HùGË½9HÀHÙE*!Ñ¥Û·u&£:`Uíû6­Üx¥-±³7È.tm-rPJÖDÄ"N+|ùÓgH=JÔYísdJåfñU=HÆ¥mòk¥&¼U%¦¿ßVëûmk3Ï9úÌä&=Jÿ5õt{=}9Ö&=JCüÏH°qî¤tuF¨4xýx@Àu=}ÎMiÁ÷~~^ÉÛd¤òéHlâé~hÃ~Ht"d¬oSètªºö§ï¯ÿ·ï·÷·¡!±Ò´R­Ò´Smúoöqû!ZSï<©uøÔuY,ÁìklëëH?h°Ø=gÐçïÈßB¢=L²Ú³nc¾n>Þ=J®~NJÎêNêNòbkÃè$öÈ7ªbPdHÂN?GAOÃFÖ"yt-30Î³Ï­Î¯Î´OT±³1îòrx¢öâ»R^ÜÞXaGPÇ !à!_bÿ2â[Óp-ûÛ<­à«Ð,y%e|¿xl´3géÍ=@ÇÏãóÓÎùæ×ÆçîÏúçØõôüÅìeT1h=KÚ`ïØ8xÕêù0Ð=Lè$p=MUÁåµQ ÜÀ/$jïZsÚ¡$!l­Ý®ÔËù¬ìlkë¼=IÜ«ÛKYª:©ûy~{{±ý²¾&d72·)¾×¤ÆÍ¯çÊÍôE{])<s)=KØ¦s¸ÔT=Mêß086:8=pË(î±=gT`1BKdíü¸d', new Uint8Array(91333)))});

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
   requestedSize = requestedSize >>> 0;
   abortOnCannotGrowMemory();
  }

  var asmLibraryArg = {
   "b": JS_cos,
   "a": JS_exp,
   "d": _emscripten_memcpy_big,
   "c": _emscripten_resize_heap
  };

  function initRuntime(asm) {
   asm["f"]();
  }

  var imports = {
   "a": asmLibraryArg
  };

  var _opus_frame_decoder_create, _malloc, _opus_frame_decode_float_deinterleaved, _opus_frame_decoder_destroy, _free;

  EmscriptenWASM.compiled.then((wasm) => WebAssembly.instantiate(wasm, imports)).then(function(instance) {
   var asm = instance.exports;
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
  return this;
  }

  function OpusDecoder(options = {}) {
    // static properties
    if (!OpusDecoder.errors) {
      // prettier-ignore
      Object.defineProperties(OpusDecoder, {
        errors: {
          value: new Map([
            [-1, "OPUS_BAD_ARG: One or more invalid/out of range arguments"],
            [-2, "OPUS_BUFFER_TOO_SMALL: Not enough bytes allocated in the buffer"],
            [-3, "OPUS_INTERNAL_ERROR: An internal error was detected"],
            [-4, "OPUS_INVALID_PACKET: The compressed data passed is corrupted"],
            [-5, "OPUS_UNIMPLEMENTED: Invalid/unsupported request number"],
            [-6, "OPUS_INVALID_STATE: An encoder or decoder structure is invalid or already freed"],
            [-7, "OPUS_ALLOC_FAIL: Memory allocation has failed"],
          ]),
        },
      });
    }

    // injects dependencies when running as a web worker
    // async
    this._init = () => {
      return new this._WASMAudioDecoderCommon(this).then((common) => {
        this._common = common;

        const mapping = this._common.allocateTypedArray(
          this._channels,
          Uint8Array
        );

        mapping.buf.set(this._channelMappingTable);

        this._decoder = this._common.wasm._opus_frame_decoder_create(
          this._channels,
          this._streamCount,
          this._coupledStreamCount,
          mapping.ptr,
          this._preSkip
        );
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
      this._common.wasm._opus_frame_decoder_destroy(this._decoder);

      this._common.free();
    };

    this._decode = (opusFrame) => {
      if (!(opusFrame instanceof Uint8Array))
        throw Error(
          "Data to decode must be Uint8Array. Instead got " + typeof opusFrame
        );

      this._input.buf.set(opusFrame);

      const samplesDecoded =
        this._common.wasm._opus_frame_decode_float_deinterleaved(
          this._decoder,
          this._input.ptr,
          opusFrame.length,
          this._output.ptr
        );

      if (samplesDecoded < 0) {
        console.error(
          "libopus " +
            samplesDecoded +
            " " +
            (OpusDecoder.errors.get(samplesDecoded) || "Unknown Error")
        );
        return 0;
      }
      return samplesDecoded;
    };

    this.decodeFrame = (opusFrame) => {
      const samplesDecoded = this._decode(opusFrame);

      return this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
        this._output.buf,
        this._channels,
        samplesDecoded,
        48000
      );
    };

    this.decodeFrames = (opusFrames) => {
      let outputBuffers = [],
        outputSamples = 0,
        i = 0;

      while (i < opusFrames.length) {
        const samplesDecoded = this._decode(opusFrames[i++]);

        outputBuffers.push(
          this._common.getOutputChannels(
            this._output.buf,
            this._channels,
            samplesDecoded
          )
        );
        outputSamples += samplesDecoded;
      }

      const data = this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
        outputBuffers,
        this._channels,
        outputSamples,
        48000
      );

      return data;
    };

    // injects dependencies when running as a web worker
    this._isWebWorker = OpusDecoder.isWebWorker;
    this._WASMAudioDecoderCommon =
      OpusDecoder.WASMAudioDecoderCommon || WASMAudioDecoderCommon;
    this._EmscriptenWASM = OpusDecoder.EmscriptenWASM || EmscriptenWASM;

    const isNumber = (param) => typeof param === "number";

    const channels = options.channels;
    const streamCount = options.streamCount;
    const coupledStreamCount = options.coupledStreamCount;
    const channelMappingTable = options.channelMappingTable;
    const preSkip = options.preSkip;

    // channel mapping family >= 1
    if (
      channels > 2 &&
      (!isNumber(streamCount) ||
        !isNumber(coupledStreamCount) ||
        !Array.isArray(channelMappingTable))
    ) {
      throw new Error("Invalid Opus Decoder Options for multichannel decoding.");
    }

    // channel mapping family 0
    this._channels = isNumber(channels) ? channels : 2;
    this._streamCount = isNumber(streamCount) ? streamCount : 1;
    this._coupledStreamCount = isNumber(coupledStreamCount)
      ? coupledStreamCount
      : this._channels - 1;
    this._channelMappingTable =
      channelMappingTable || (this._channels === 2 ? [0, 1] : [0]);
    this._preSkip = preSkip || 0;

    this._inputSize = 32000 * 0.12 * this._channels; // 256kbs per channel
    this._outputChannelSize = 120 * 48;
    this._outputChannels = this._channels;

    this._ready = this._init();

    return this;
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
