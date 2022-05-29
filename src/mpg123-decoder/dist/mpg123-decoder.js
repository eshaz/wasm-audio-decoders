(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('web-worker')) :
  typeof define === 'function' && define.amd ? define(['exports', 'web-worker'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["mpg123-decoder"] = {}, global.Worker));
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
          value: (buffers, length) => {
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
          value: (source, dest) => {
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
          value: (source, dest) => {
            const TINF_OK = 0;
            const TINF_DATA_ERROR = -3;
            const fullByte = 256;

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
              for (i = 0; i < delta; ) bits[i++] = 0;
              for (i = 0; i < 30 - delta; ) bits[i + delta] = (i++ / delta) | 0;

              /* build base table */
              for (sum = first, i = 0; i < 30; ) {
                base[i] = sum;
                sum += 1 << bits[i++];
              }
            };

            /* build the fixed huffman trees */
            const tinf_build_fixed_trees = (lt, dt) => {
              let i;

              /* build fixed length tree */
              for (i = 0; i < 7; ) lt.t[i++] = 0;

              lt.t[7] = 24;
              lt.t[8] = 152;
              lt.t[9] = 112;

              for (i = 0; i < 24; ) lt.trans[i] = fullByte + i++;
              for (i = 0; i < 144; ) lt.trans[24 + i] = i++;
              for (i = 0; i < 8; ) lt.trans[24 + 144 + i] = 280 + i++;
              for (i = 0; i < 112; ) lt.trans[24 + 144 + 8 + i] = 144 + i++;

              /* build fixed distance tree */
              for (i = 0; i < 5; ) dt.t[i++] = 0;

              dt.t[5] = 32;

              for (i = 0; i < 32; ) dt.trans[i] = i++;
            };

            /* given an array of code lengths, build a tree */
            const offs = new uint16Array(16);

            const tinf_build_tree = (t, lengths, off, num) => {
              let i, sum;

              /* clear code length count table */
              for (i = 0; i < 16; ) t.t[i++] = 0;

              /* scan symbol lengths, and sum code length counts */
              for (i = 0; i < num; ) t.t[lengths[off + i++]]++;

              t.t[0] = 0;

              /* compute offset table for distribution sort */
              for (sum = 0, i = 0; i < 16; ) {
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
                  case 16:
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
                if (sym === fullByte) return TINF_OK;

                if (sym < fullByte) {
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
              length = fullByte * length + d.s[d.i];

              /* get one's complement of length */
              invlength = d.s[d.i + 3];
              invlength = fullByte * invlength + d.s[d.i + 2];

              /* check length */
              if (length !== (~invlength & 0x0000ffff)) return TINF_DATA_ERROR;

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

  if (!EmscriptenWASM.compiled) Object.defineProperty(EmscriptenWASM, "compiled", {value: WebAssembly.compile(WASMAudioDecoderCommon.inflateDynEncodeString('dynEncode00073¸=H=I8=J¬î¥¬ùû[»Ä(:xXx¸lbØ=@bÆ»RmA¢.½0±/:á¥¼L~ÔGé3i¹Ãêø;~wëz¬ª0´Xd,}Dä. öí{^S`«Ìu¤RTCþ3htÖ¢V¦9ðF¬é§Õó¥2õvùÒþIõéÂÂH8{I(¸ü$P:ô(ÀåÓ=J¤`Ç÷{K7K7?;sØMï=K[R¦/Î?UxGJ¸¯øqÂ·|I ×øÔP )IÎIë{Sh>­tº&K¿W°óSÌÓ³wTm9­LEÏ_5öÀü.ÅÄë·/glè¸)²*r.òÿ=g"ÂUsØfÕì¼qêëûó¢ÔÊªÙU­+¢´õ#fceôeæãåäF÷Víf=@ÌV×rºmçx$PÁÂæ=Jñ ðsÒ%ÎµÞh=}¤©6òûk#Î"lê m(Ù1ÅÇ_^¹]Ò:Cù=LEvGÎEâÎÓÒÓÓkäfÜ:êÝ@Ýoe|=|<[Ä¥&H¿§ÌzqMÔ/°âd;t?Q*~E®¯ôÀ12U¦®Ù +ß0Y²"dñ^²"Pdk=Mÿ¸x6Á±&ÍÕò=qlÏs+<­µi­2nÙw,Ð«;@k§Á§(ÏÓÒÿ¸¬óÉ(=J=LT°Ù[Á=@b=Kð»®£q)ïVüü§ñÒ=V_÷éù[D¥Ò¶Tn3  =MzÕ»=Mb["OBÎmW[|WdñÓ5bï=gÊõ·Zd±=w®¬;éç|ÄÏ=K^2=L¹km­Å¯ÒÇ´ws`Mícx³n¸´úPNÍmb:zP :©}jÄP6Vûs`C56òôûû¹åJí8ÖË&5ò#¡ø½9°@^o¡A=LsF|i¾íTIúP^Èg+êµWg]/7F©=góWGH©`P® *«îÎà=Lã=}@&=H.ð!ZÎK}|ÏÖ:à²8¤q~Ù[VR`´õ3±_~ob2=L¤o¨îI-b=M2fBõ©Ùd¬ °¬ñ8¬Dß­8L+©ÓÌÈzbº=LCØýÓC%/1ï!´WGL=@Îd±¹T=`XLl2_ÊeâÕg 7;ñárL=Hm=L#óûy-;³ÁwáüZEâk{ÛÚ=¯§«¢àÜUÂ=H°m&pñpØ=g³×=Io¦¶É¿-:Tä×Kä§/èÃ®äa¹©ÍG$þõs¶¯ÒÕPzúµûÝÞZ|ò±Ígz6ZSéÎ¢®ÐI"«=IÌ²L&Çc&´@·[lV4ËçX+3;]dÁ°»]CòmX½ÜÖÅºFD»=M£%a.Q§Ïyý=H Ç(=IMO=gL8Èì1`=}ÖÁ³ïÉ¦brQÔ=@Ú9Üºí `S3ýe=g=JEØ=IØ+=HW×óC¶~ôº§ìseb:|Z?¡q³:óÿ`zz¸=Mrnl¥§ü¯¹i-Yàl.Êª8ï)>W øÑáI=@ãýªË%%mH® m±Q>@¿ÛxX»;½lh%âS}?=M­¥NÁê?r¤1Áñ; K¾²¡{¸U(àÓ).jmø@9¤D?Dï²=I­ò1È¸ºåÅLòÓV$¦-#ÌmO=g+Õ7=Jþpn5^=MIª"K³=@=M=HRºJ¥TBÏ¿6puØ®-0«Ó[ÑÒ)$¸!rØï+þwês+=Mcø/¤¥OßÚKG).@Toy£ó¿,Ô=@UX_í§|£7ÏZWy=g·=MÌ¤(ñBRò,ÓQnÊÁ>p|Â=I×I9:sDzm¦?%#Ká;£¥Jñ<RÊ>ª ±«fÉ(ØÔ=Hs)í!íqwKÈÔ{÷äZ¹5OÊ0çö_ó=Jl+E²"xd=M­cÅ_jj÷ph%úsô¿í¹ûéiH=J!464ÿºeýá¼LoHiHÑs9TèI©BÈ¸~ðo¡Ý(u ð+2®£ÊÁ¡-í=MLb|=@­c¼ÀkÉp½Ad¬ì÷ÓºLeCT­=@¸ÛJÛ=INªÙòþ Ï¢j} :Êø6j¥Ù#6Ä¬ÆØôîÌ34Á3} Z¹~ÂÓiÌø@¬õÖa=g:ÌòÊÔ:ïkÄqYø=}º«ÁÚÔ|®BÝdË=KõÞçÃ%ÿ|Ïøúhp,Äh|UEéÁû½@=K N³Òé_11âk. #lóEMÀò_ÌL2CU»HÁ:,ãf[ðÎ=@Çq)¿µ¯7sztX¾h^13Ì(K¶8kèç_¾I.sfØç¯T=½ð®r×4pe¡ß$vÓ¸½¤½=HÊ=MK¬×ÅFLyÿ==L©Û`d=¿|í»xÏ£×-=L°=Mj:¾»rC·=IúÎvGHº.`æDë=¿Ýê¤`)Ç¥ÅeP.Hºm»¤ä18ë5d²2Ë¬#Ð[%`d1& î3Î+,vãµ5lÑÂ_*=LÏÀÃ¯Käc·É@öºÍl- ¡m¡mH¢³Cu0¨qêàrYºá ICÐX¨¿N4`7a=@}¤´£ë+a¯JúÙ«=ca}=Jáà¼:=}Ì`°¶X=Jì"¥´·¡s=LwuY¥=M£Î=J5ö¥À?æqÏºßÌkÒk ]èOY;?@H|Y¼=cá"Òq¶Û)è¦ÏYèAE=JI[0·¾ÔÈ>O¼è$ß)4ìaìÎÃT||ÿÈiÏ!^¾Ñó JU*wè(E3$yhºyß5á/?WÛYt*P6À¢ÜLå8óÉ=Maü)ÙXûÔííÍ §K¼=LX9ðm O(wåé6|íS¨n](ÂÖ.¨ÉpÓ¼«Á8KkHú¼¢KÛÞ~#XÍ«û,£éNãO°Þ?Ó#n¹ÈéÃº«¨ÉèZzöÞ÷]1ìÓ:Üc]±@¨eÞABí£íE¡ª=H5Âè»£j=J¦jJfLÑ¹Sb=L~gÕj½MáÛ«ø%ö=I³Ý>Â÷<4HL~9=}=JÆâ¼üûn·[LV­å@¸ËP<_[LjÑê">pÓ½Æmx*ÎD:ÕÅ³×^2MÀs·®ÏT.d{=Kºe7ó«§î 5~$;w£lç,ýÿ4úÀÞBÐ9ËQaÅh,Iö¸£vI¯Ó=}§Ibwbw×>=JÅZçh¾Â»¨È=}»¸¬Á|Ù_¶e!B·ÍÚo=gl..5î§viæë0H×¤|sM8ÊrÇõÜ­Ñ=ÿÊUúÊ÷[F7ðäÎµÍBå^ÔÊÂ®Eî&µÁëëØÐøÒæêâéåÊ*öø®it¾:ÛØªÆuvØÁ°&7­}&xèÒÒ&E=@÷u,f @j^N&Äü½ÎM%EQí=gþÁø6k³d_ÂwZÖnåñIêèW:÷=}Ë²Ò*SD]]¦8S:­1*=I¨T£=L$7!5+ÿÕPøy×°§xÂ65r¬ì°Nx=Iï(q_(qeÛOÑJ±²d`[ç=@/ío^GÃ+=KáÏ>s=IØ(¤>kÕú×LJí)d=}k5ú×(ºÌJBÓ hô#9BPê;î¨x©C)%ÉÔLäðDëI!=}cn!õð"êõOË¢×JM}&J=Hýâq24v=Iß=@÷<$6×V"E±ôâSzÛx«yN8 þ¦û=HQõdQÔèÚí68!Òë~éE`=Lðæ$éc ÿ.õÆ3°äöå+±=LÑ$kÉªxæBWd7=JTö#Hvª#ië¦EÅÿ]=}=I÷*öF«JZ4§°&ÇGRFëEàEZ¾ÅZgG&áK=}ð¶`òFÏå;uM?}ÀyÃ=L¿BWá÷ñ¬H=M¡×Je,C3ä=Kt©a^¶Ñ"$®Ô{Gêßd£üx=}~¯Lù¹µ«Í¤P-csnÖ¤==}Üõú¤lüO=Me9knA/ùäççßrwm=H«Ìj¶p±þc-äÑ0.é^¢ÕÓúö=g´QíèÁËn>-ïÓðkí=@ká ³êæ@vNêö ÀdWÑHÊ¤ÓDM=HÃè+rbëóµô»9ª£íyc*¯íPþ ,ÁÒD_ïãm2¡y¼ÇÞÐjV0DäÊ)á=IFîLÜ¤Â¶ïA¤4ÈÜ=I¶ÎåY%GG3Í}3£ß%ÜA£J0¿ O9EÒP=LJAêòw:ôì}>)§Á33Ò¹_·ÞEÈcàMv$üYl·¶6.ËÂ¢zy¼-Ên¶/ú.qÅX¹é[.`R`âH×l3»1Èÿ²Ì=K¸NÆý=Iú=Hc1§Üº1èMîxÒgæ¿3ñò3 [:{¸ÐPPËùÍ@tmk¶lÖÍë¿J=gdE%e_=M³5·9g`hL÷ÃÌ=M ÇÓÌ_á½ð§2wû×´Ïäg2ÊÀLÍGÂ]=H)ÌÆéG=L.³¹§ÔU|q3Rb°­µ|Øâ¤=I°éâÊ²?âx´!f,=@32»c±tÉ¤Ï¦(~©¡olÅ7Ïó¥àßþ¯"ýÖ=M~óÂô¦M«u÷2,ÊÊ=@òôöÖÞÖ9®¦ÆwÕ¦ôì=I¶Qþ¦´Ö³vèR64éêÛ*gòÙ¶âÞdNÅM-ôER$r¿u=Iâ®6c¼6cg=°!{±öÞ×v­Z4=L¾ÉXGÌP |£t¯ÊAËD]¥´ D9²§ÖCL î®2=gÍ¬´æ¿ÓæÖ«b=@%¡0N@ÉvD½,|p¾<¬ÛQ0ÈXg±íö¬ë¨8Á!Ó»ÊÑjFõÉ]9áÐ}%í;ã¢/f`{-iê£ ¥ÜôËÑÄ=I};DRá,´ñª¼tPEõ»ühUÑ¤½a}ÛòlZ$@^Ó"å¹Ü=}ÜÓÐ×Ð@a$Ðà³UÕM6Ëa·ÑÊt &½YûìÇÝçK±µ§Vö¤gÙNcÖßÿeFh>0âtº ûTÕÁ!âr»¥èºj×&µùú´W7<~$=g0úÑê8êó=KÐí=AI|Ð¶Èn&¿z)=K4)F{Ãò³I[ø=Lnãã²ÚçAvúöt;*ñápP»ÿr=JeÇÃF.ÔÔ6å¶ T-õæ×ó)þí>õ=JV^ë_+ææÿ{à;ß­Jã­È÷gNË=°¤0f«[=IKñÝ(ÊÖT¬CÔ#êÈ°P-#SnV&££»VûßÍ,mÛÀàðq5!=}ª¥Aóùãówd<"=}ÊIL×ÂÀÀÓà¡Ò¢4¥òèíC^¯ÀÓ·ÀÏZÐÌãs{"rµ~ß®Á=Hu=Mã@<¾pß9¹B`ê ¸bÒTÈ´²ÀÈhqÕtí-{òruÊ·Ð8©7»­M¶@Ôu×ÝZÔü¢w¥Á¯ÂÍJÏ¢¤«añÉ¡hºJ=LrÔl=g{ÚM!¯@á·@=KRî×a(³&=}"·=}Þ#ÛßhÈWü=H$=}ûDöà¼ÔðBCwuÁïúÙ£¦ÕçûvçÉûB%¿/æÆ®Æñð>Còi9ÛVàûXðò¹Ö¨e!³¬NLÝ´t¿Rq§KüûXV`ÞwÝãl»0DñÂ!uloJ4ÑRWÊdIµ¥©.+~L´íµ³ÀY=}Ôø·<ù4â/Èù¡¡bq¸U7·Ùây¯eNd4HîG=@AH ¤Û!ÕÜã}58¶vwSùa=gK(ðR×ÏÜdÐÛ¯¢à£7=g!!¨ì,=J|BK)ñ´ØgÄèò_[=LIôZªÇR|îïi}¿Þà)Ý=H`÷9|3è=I¶!üöÉ>bz=L=}z¶(HekªÍX½õ¹Så/µk=Hh××´Ñ,|èà=gM$Üä=gdH¢ñ»Åt,^~"q×z´¬43_+y¸õ3´c¥GÏÞñbó®S<x!ë¬G=MÌE¡3Ë8ÇéKM=M×³?}p¤)swÁ£$ÑhZº*É)t´jþ×f/æhÿUßáÙ9I=g=J©&TÒ7g8=JÉ§¨a=HDøð¶è=K§/Vfñ:<ÞÖi=oër=HH¥+ýai{ÉKl#±W=M×ï i!Ø=@[Ër÷§Kg]Jà7ÿôY÷´%=HgØ=JÉ§¨a>Ù=MBVÔú³nRú?íYÔ|oÕ*MoDï`É=H=JÀzìwAª<½;æ=K«@ï·Jz/a»7=g!!¨x¨ dÐy¢p",$EÆ<öupÅ=Hù[mÌaC$¹=g¨ÌÄ}Gm &¾Bdè½kGû`XÌd¶¼î~9Öè©ÐÓkÐOv%¿Ò»:ÀVDõ)°[òëeû7òãJXR/m}¦ÆG*dò¸ùÑ¨ã0±ÛWÇöþùäQç<ô=H=JÁå®ø_~lèH³h:|D«×.¢ñcâËG`ºæühÓIÉf=Mçh=MÀÙYèy²ÎKÆªøÁ¾LH2FHOlH±=HNDôB¤K|=öìÕvVyÔ¨T¦7·ÈÄÀ=@ûJYþ8o`(:ÐHÑj?=L§7§-ÜÞÈ}×k)S¾XáOüØm.Ã<C-ëøð¾Æ6ìzÞ¦tÖKÊFÄ{óèiÊFÌ.ÿ©KñÆÆÌzi»íÛµâ&ÉWJ)Ë8$h.!Â¥érqjÞ:¥ÿÔ#ojåÆ@É2AÙUhÞÁ°xvê?E7è%nQ_MÚÝa¢S=IwÞä}ADCJ­[US±¡ÆZtøòÆïfE4[>ª÷ºÍ¤,üÉ>×®Æ§Ò£c=L.WMã¢Ïy{£<ÂÃ¦óÊ|ªæïofpql9±Lr­Ñsë4­É=ga=IÛ u?Rd?Ù"}<#Î[òºró²¾eÚß|â½Þ*_Â©NåÕÔvÃèãCûç!=I_o=M4Xó=gr}ð[Áò|OÇôï-#tê÷¾%MVµ¢;§êÖÝv=}=KkMHJ=L]*úÒ¤-ÈJQH­µä-³)êjjh1|;º#X<*Jê=J(B=J.¾´gnôá=@Ë÷ý!p¿úiãHIRHHþ>Ô¨ö=K«ÑbPÄÎW(¹íEÆ=ga¶Dëly7D´1Ò5Ê=gí0ZýÀÄRÊPEoÉÑHÎ6Ïý;#!ÆØ²ì®1~S£¯zO"> Ú=}UÐ´#1£4ö?xùÎY¼|ð£ÈlµToàóÁð~½uvóñã´°¦Mú9BûB9ü÷µxÁè³Z<EA!2pÛgÞ6»&.µ¢1ÂG=M|Z/.KA²ìõÖ;7z=MÎ}ç]=Z7}=LúM%n¯ !ó5À:kJÑÔTöl$pà|9Ðö<ßgnÞV;_E?h"P%8ó¸2ÖçõVçô±µwóýÀÚÀþÄú«.ð¨.gæjhD,(8¸{+Ëç BjÔãûEl1ÛPÙ¸´ûVjTYáw|K²iê!"±xRZ<üpÑG$=@^¾¥Ôödr¦zÖÄY+n=Kö¥DµÄýárr´Äð¶9ð¶l½,®¯"ê¬¾MÌlÞáZ¦=}s/@´¤0ã¥r=@Ló^õ:=JU|ü¢?£oð¸£dVCsÈ=KYëCô¡l.õêCÀîc#^#N¡=K!ãrÍBlöd;.êkýx§qôÕ"º§²ïD¦Óÿ®ó¾÷þ7h8Ël?$"Ç=gªG"èÏT±=H÷çWJyÇñj¦É7(J¤Ã·êpì|C`7Sb­D2mu@Ó?¯J?Ó;toaZßnÆØ¸5VÞ.+:B7Yx= jp®Fuw-Säy1$(NOñju¸<$Ë¶SN{EÄ/ß_0NØöbS«à¶Øo«P=Ý@:1ªÆÈócIw°rÔ(éÀLk¨1qHýmH¡öçÙN]ÏéE|f?X7éM§þmæ¼ýpÁ¬UÞß¯æ]½#=IÔ¤ÎøìrøÏìç=}a¹ªX[C·Æ|ý_×¾ÅËåyÍ·JW$Çw=HYAÛ`Ymõ,|äÌ26¢fïS=Kh=ïG>½~ænµºÎ«ANwezFd=x}ª¥êF}¦Z$­4¡Byª+5­Ä lbÅT95ä.t=@s#¥vÜ=M{k¯WäàéÔ¦ÑóL9õ¡Ï¸)=Jd°jáCá ÎÛª¥¤AË 1¥mD7é0/Ô)ÛÓ¹2åÿ%Í¾?ý[;§MéLèÏîhü6U=LâJê¾ÃTJU|JðxN;uÐ8U8i.ð*JèU,±MW.ò=H&«÷mò}QÛ¼OÕSæSoý.>ëûSµÙA4EJæë¶YÛïóÇû_õ,lÞP¢TÝ¢©_C¯Á=LÌ>©$Uü&*ðcô§4^³$NC>ÒzÄO¯ó?/ÞûIç©dëK=KDýØçqXw»é?è~[l6ÑjE¾Õ9Û=gePRX£Çüs[2ëûZª7ï`4«@/]é=@èÆD::/%><dF[mor6·0õH0¨R;[;µ¼ºFk>g°>DDln¦«ú×.SW=JÓ<rý=IæÖª=L¯,.Z`h1)÷óÎJÈ.òXä!Ãô8Å`=I¾øH©Ê ¬ý@G*s¾ó¼¯TRÒã®À:Oî¤e·Hsæ4,=LZ*i6Ú=@ÔT¶ñªÆ·=@vuR°.y5µ5ü^ªrqÃyªR÷ûV´ÐÎ¹^ÅöïÙéÏ¶üY³a;µï±ñ££¸®ûMýiöHEM÷OÌyõ ÖÀ=K¡&©aÅ·æJB*XCfÓI%zÒÒd=EX5ñ¨gô¦£"¾ÀâCý©/.3=Lªøå¾D¯%Ýþd0r©#õ¤·r°Øamþ4Ó|xF¾]²ÇÙ]ÔÄÅ>¿=I·»ïßâ8ë/ [e±Ô9|9÷²`}óä$2ÛÉQ²(Vö¶/=}ú:K5¡Î@xzFQÚã³ÿ¿ök­Õ¢¯«ù®Ö¥=KMfÔÆú6ÆëoÅm»ÜÝÃªrI¢¬öÑ²öFÁ{µ±t½z=H ¹Ê·¥3à¾º<=@ñbÅ4?8ÕJ¼9$ëõÃòqDd=H»=}r@´=}~8òB3Ëñ.ök¥Uõ=LaÞ)õÕW£fx. µä:lEíÉ=M@ÔZGó`qpì°4FÎ<[FlK«¢n-|ú=zyÕÔÜvá=LdP]ÆðºY¡ÂÑÊ:&OuKÏ9{ã÷³=Må@âHb=KÌ_t[¡Ë>òUh_@=gG±fPd#²²½=J©»ö.löÖÑ<ÐJãDÝô9È;J<¼iØ%«zÅ|2`¿Pïtñ9oFp8:Ë(=JÀ"zÏ½ÀÚ5­°aßUÝÙ¯=}¤*v=}8±{g{ñHÄÒ©Þ·Xqw=@EßÀE¿Ê;Ññi=M¤³býéîcàÿø~´ãÅ²ñaîm}4HWh=Hîï(TÝ¸z{ßñsq%òtñ%yµª+ZLaÌÈC¡F-=K»ÿ ê§4b¨?ü*ôgØµa]Ü=MÅü¹%*!¾ûâhãlÎS`,SpùÜ<K£sÙ»]e¯Ð4ZÌ/`úâ×éYº=@µf"Un:ÈÓIÈuòëñÑ/ñ®{!0ÐcÛsù:=K=HlÚÖÍ-`/Uâ<LÐe«äÅ$`éÚ;åÈñ=}Dzcd95Z8ðÒ­ÍFmó7 ìx«2Ý¸Ï°5T®Ãà(?!<tÂ­¿!¼f­ùºK("§8~"M[^[ÈÑaI° ¡`È4ixªøJ=L=}E<ä÷lkÇ¸#.-÷æxB1dy°$ýA­¹Þúiq_¼Þ¸ÄýAwcé r ­ÄáX Ù¯$â°ÉDÙNnºª11j_{½¿3&®cã¸Y6L«q±9mÐãe©ãÿm¤«×½Óbr9<æ4¾êF,´ïnJ¡å8²*<l6DUQl¯F,Ù¥Ú=MÌð=KH÷?ã=LÂ(È$õ(¿2õ*¿=LÈ´C(ÈtPwi§=K¾ç]`D]ÉCX<QhÂAÞ×¶¢o.(=}0?:Û ûñS^>}Ð-[`OÒQ¼»§ÿZ¹E"ßVWHvd¡òOh(<á+åtUUe­cKfMë[ÓÏ(GZçÃÌ«¢Ø=Jº- Åþù%ÅNówâÐ;#ÁlBmZÉ3mÑ=@Akâs*dLÒâ lrÚûé=@ÛbÍm$à7=gT¸hÔXÜb+-~j%×$Ú°Ë×êÛê77ør~ò¾¼=Jê°ó¡ÙÊÌeÇ_÷3ÕpËXSý"£Aøtyô=gpxÿ8*åMG~µðµuøz¶vÙæZ=Kê1EÒ9&ØY«ÿCÑoQ æa ÎÑO_4ëã=LßWÑÇj¸G+âvÌbHË¾#Æaa$7"w+ºPÔ:hy0!¹#Êq.ïÖËW)O¹iY¾H{W°lÂG[ao=LIÚns®TÖmt=M@=K¼I]ïÙÎ/oï8=JVå­§b)º9¹vxI*Bó1·Ó.=H«SÚû¾ç¦ÆÔ ¿°Ë§Ý8/i×Á½B2ò¼¹E[½Qó¾2.gÙÆ±i5Gd¥A}/<i=L£-op5O¬YæØ=KähRlau-ì-ÛU²Ë³×@çã<«#/%*ÀíYô;Øðcr4[¸©Iio,Sg8à:t]g% ÃÓ0·ò¬9z=H£1t«_=£Þ~ðä+årQö÷sb!)°S.§2ÜyÛÀFF(V;<Ï*Õ=}D¶×¯MlqXÆ³XMtM[YMôÛ/®X4KÀ9ñî<1Ý¯@KÌlÛrÜ¯ Kà9ñ&oØ¯òlÑ¯¢+q²Í?1xMÚ­ÿ É×º¥ÒB=I_¡mlÛåMdJCÒ¯âJ;±ÒáXÂIÌ<qpYM=gM´*,Ò¯Ï{æßö7ÔÈq¯­"ÕÞù6 $ÖD7l.V¦»-Í=Kf£Ûï ç¾öæÛ÷òuà¤w«Y4¯Ù>yªVøßª=MÁ©÷DãÖ»ZÙiZèô=g£=K¡WÑkÓÉÜÚ4=HE^[&ç°O]=HÌ>&<¢©Oî½§Õv¸õª½·=gëEe=K$à6âØ(íøtÈßG¼=}¸=L_Ï9¡ÌJd[÷6*=}Ãþî¿ÔB´{L¡² qÎÄ5±pu+üß½ã=MF:>u=}ÈCTÈn.Rý>Ââ½òÕwgG/4)UvÝöBúSQ¥&§K¢&=JÓ¬ÂR~Óñ¿tJÓO¾ó5½óô¢ÙEßo÷óàùãàÒzjìà:Òº*ì3~|=Kp°´/K8©Ûíÿ#éÌ¼ð>_¢aW>6âÁC®å=J#ÅuuÃK0{¯ÐP%²í6ÚEwuçpò;hEnDQâ+¹)0µR²Á=®¦µ5¬îKa=}Î¡_½LË4BG%ëg)=Kð9CÝÄu9)óZ°!àò=}µ:¥Âzé0|ñj=K·l©{b/Í=@`ûø]¸Rß,Å·*Ôìé¸9p<ßU¯=JH4=HÑk¢Ùû5|z1µ³À°}Opu©Wðã=@![=ØOýQz=I©#º)¬·Xá¹Ó(L,¼7ÕÖøãéä¢[ç(*Ú}à=IË=KJ£w=KzâI#¬7¨ÝòXçÁ×ãE¨ÝVêÏ«¦nÀTo=Háò+¼âÓ=}â¥¢tyÕ3¢Þ/ÆÇÀß¦Bm&±=}_´0é¶v|dQ)Ey³®mÝ=ÑüZPK×AïYGþÐÎ8á«#GqmÍ=Hxê`4¨r¿2=J±wÎ¯SD¼%W6¥d$»+S. µÓåÆª«=g£öíS©©Ê7x|+ìÕ)æk§Êo¹Z¼õGZT$}©sn¸VuZò¶=KdUËµ îXGõÌÒ=M£vH~Nõ& =g]ÂÁ¥?é=J<=gy¤JYäv¾&r¨P~o)=M=M8q=Ií¸U1ÉèÅ!ëèRBÚ°ü_=KÖ¸ÅåFK~z=H"þNR}ÊEBjÙ°¾x*ÝCuÓ¡1g5Kãìª¡ìFä¶íÙ æç*¼þ³ù¡$Ü©|Ñ^q¤Èíyªc?ºLGv=HHýÁ¶~°¦¿XÎêv$sþU$$o¹¨sA¹òüËb ·_çñ°åc4ÁD60d¦­Æ$âË=MA5±o¥n¨!g°ßX0$ØT+**K}<=FÏiõH(²8â²sÀªêV&Ø§(ö{¶¨¢`÷E:l©¼=I=@ÜÑ=M1#=H2 Ùß.Â=JÓ¾vN¶Y^=HªíOaö«nÀ®Pñ²1cL{ÿ´­ß"íM´=Hpì}Âs"=HÏx=HI¢=¿Ñ!-¨¶]¤¦Yq£>Îe²Zë#Z¤:Lù½S@q=KÑðk÷Ð{Û®7_ökz0B-|ÅiiÂêXGúKu1=@6»UÆa¶¬c]óÒX_×B«è½2æn,U^±V^±=L÷.öæVÜë[3v©ýy¥Ê-Ñ=Hî¿*4EÖÄöÐêª;(ý¸³îåþëö=K=Hûeü=L_%ÁªR!zéªÅej¶ FßÎNZ¿Jâ~­p»âCf{uPÆF±³Vr¾Ær=gx³=Âx3ÚKü*]n³#s°%¬ñÁÉúI?XÇ()Úå¿bW¿ZüHA)õ?´%g3¦@Í¬]°XÿÃH!Ë3ãá-J5,Î¤Ìh²ç÷LXF=H8Y¹u%3<5å¿G°ÿÃ g·ÀÖÃ¡Tò;=gÀ9àAò±Á)â{ã«Ä6µuO¼<pÊÖæYUc<y´§îÂ`:=Lºc8V:ÄOë^õïÂznó¢y_Ø~1!öóùmVv(á¹úN@tØít§§8ÀpØ¤²ÝÔ*,Aþvâ=Kàô¢æ÷ÐçV%;¶ÝB =IíîTòÑ³WÙ8ª3¥$´=@=Jc¾ÖÑ¡§}=gåV+=Jaûü=KD¢=MYðç1ë¼Mk³|¸¤èãRÙø=J-?eiJõ©ÖóÄ|Pt¹%)[Q^Þ=IÞÁèZåémë¾-=Fã÷]GÀk,È=KõÃô" âÅ¬¹Ä %û8æ©ªHa/¶¾IHI¯Ë£01(=g1¸H[i©XB©©«ß=g1êÖ_ÒßlK,XX@Z[Yå=M;Ö;[[ÉÑQ1i55d»Ï^YzZ¶ÀI)=LBÏ^éÁ,ëvY¹«a[P±bFBYå~VÀ_06VÀ_06N@þî©£jL¤îL9aî³^t¹{²ÿZÆé½`5pk{â¾9ÙècÀmûTãáôù3ól¡ÊDÂàzB6gu¼;«ìÉÑE(óLáKMîTýÄlVó°ÚÂ©ºÀlÊ5_ä©=M±SRþ=LLÌ/(§¡á7¼BIF_ô`©gý51¶^À¸µG¿IÑ>sOûis_ìÿâ·ÙüØBÀ ¿3§I E?-nóÞÔYm¿=¼¦<ìm!ã³¡sÏ5¬wy:ÂµÏEýx=J39;zý=IH§TÉ²Ñ0è¤KÚbY0ß%f?¦lÐ?#~øõ|V©¨¿=Lñ,¢§`ð¸ÿFÊ¢²ëÓÀh #¾Óýó!mÂ=v?C[dç¤Kl=I¡ù_¸p¸$F´CÈ, úù9éÙ­ü{H¿Py®võØMÿ¼N÷rFHÇQ°ÀÐe§ÚHõ=g#=L«©.®.=}Èo2©ËÇ¨_=K=Häð-U+±§(:­ÌÔ Ý×Õe©áà_ð`/¤à¡Ó=}è9^J¶aZ^tã*ctóãqzº¬ç¼>#Tu1Á0¦ZEZ ù 8ìÂÝìÚÍ5Bf2!Dn7KÖ±·8®H ÷î!#AKHV×¥W}:Ñu&.ö.kI<¼o©!,"ïÜ-ÌÁlÑIÌÝØY²Pçö¼E!²´P?ð"#Ø5ÝøËºðâ©RÊ=J¡½ãáÒ]TÄÕ»ÎM¬Ú³U^Bäþâ]>DÜ%Ñå`}Ò­/û~Rlÿ¡ü=Jdâ1ê±µc¢]àÃS½þ¡¥#NTM_;=Hý¢ë°5¼àßNßèòÿ-7ð-p±¿î*ÑU¼/,4ìã±F2PZuX2ò7 eúÙ8ç]=@Þë=McåOÒÎÿÒ=@£kÇ9Ew¿´[ÑÓÜìÿ@}±Û¦jÇ<Ãhù=@=M¸è0g|æ2n¼oü=Ho²>vªH@ÁyW^ïõv©ÊÉ·ß=gÞuí=HZNä+uº_×m"{7[P»4%è$áp0PÒy_=g)p4ªèÙWÕÕôZ¢h{heÝ=}"";çpgÞ¬ÛN6¥ÿîÉV6£ºÊ«:ì0h6=M@äÜÜlê+=H¡a)ð8RÜÿAöcRf|ïø*ü|øêvØ}Þ =@m¤¢kãæ-È|$X=}¢1CZ¤Ã=£4áÌ>¬xôA¯ðzjä÷P<;É| 9µzG]ë°Y[óZ¼¡=J<¤èCr«ê=@Ph¥êøEv2¦á&Äü;_Øð7y($I !ô7¡ùhñ0 ÜoÑ6Ù°òv=Iö#¬Ì rËÐ=KÜÆxtÓâ¨°J¬A¿Û«w¯üð|2²S¯Ç@ýÒÞæ=}#Ý«9Åßö%ÖÍS¾ÿäC¹A=M®Å´NÛ±5©ñ´Èh°E×=J¯YÎFJCIû·7·-*d¡=g×Êïzê¼@^ñJ%ÏàïÀ½<ÿr¾ÔÏî@(»|J+­­"*KKç½Æ#Ä~Z&¼òVøYzýïÔi3MÈê¶ýB£ßÐQª49=H¶ã*dá:LHÈ¼ÜlÕªEa¡=I¡½É~ç_N¦¿mçyéa=H^R×EMæ~7Éç/{n`%Ú¡ñ}&RÄÇWÀXØ«#e¶úË<Êàê÷>òÐµÉ~Í=J}E¦c6é­âÞsÉ«{ Vì¸-ìàÌ.iåÛá<ÈôàÌ¹æl²lr%òý1búÿ´´ÀmiYGhY­[@±ctÔ&ú^=@vªóææÆÊj¨e½Êâ¤ÒØÇø9ûÏn=IV¢îÎ=LÄhÞ¶.=Må×o¥=JúL}¶äTZÜ=}JãiUx8>×ðÆ ÄãMûs¸%j¤=}©øzDM[>ÊNh®¢Þ=ùtºiu×ä=gcµ÷iÉú²þiËý6åQ°=M5?î=}ê}9r#¬AÂ¹*Íñ·4óªß[èÄ HsEdOÕËÒHWÎ°k,@¢Æ;FxòçFîAÿ~ë¦¿dÿ9){-{])t.6=J¶07á=H%HSèèOÁu;Èzl¿7k=}ÿ_a=g+hÐò<&+ÌÜ?Uò=KxÆÎbëÕÞÖ÷½G´èóÿs°ì]2ó¤Z¤Æ1,¤=Ls4ÎùÀs¼=µÒt/ó½@¨Õ×+4þ? ¾ÒÒÎñôÞv«°T=@ñ8p)Å_Éd¡=}W<oqùnê½e»æb@ÉØ(È´û#=}Ç¤é=LÅD>éÂ=I4´Q^év=IõTÿÂ#dSÆÄµÞÞW=@®2i16&õ ú.µÊ JÞPÉÏX0ÿîãÇÉ8y?2¾v!sé-áèß+Ø=@ÊmYLòmdm<Ê55*y¡#?=}M¡RIÈé¾_g3Ó~Øï`R=H/¹X$ÌÈzjk4bÊÝ»¨Obrévö=M²°Ø¬ìJ¥Á%à=Hðã?xè{c.Ý#ÅµØ>ª^iÏ4@=Kd¼ªz°øù%Ù¸yÙE×t*`Ìúì:4À-[Ãv%s«IGóWeL®Ú=H1Ã¿gàF££`ÊÞ4=g¡6!÷OÜÿX¶ñ"wBØz3âvïv+uøÐoåBËÅ ^â"½<¯³Ëà§ÎÇÅ°½>é½/òuà+£¹áëîivvÐaÏ7.øaT¦vÂ/ú@=}_Qkå7kõ]f7;·?à­³Çfy4­-èi/¸8,¯^²§I=L^7réð}×uãjëU{Q¾1óÚåÇ.Ùôn¢ã|Ü×!=gðÆªà12ÿ=@ÝO©ÖÌQa#ÕX±@¾´ü±g¯mßU¹^=gm/C=ÖwßÛ=I¾xHÏ<ûÅo²â¬°U6Û62YOÔ=@¦ämæ±ë¥á=@Ne*àkÎOZ&â9âvb¯ÄÕ(¸oIª&=}å¥ 8=ML:¾×Ê¶4.¦½*®=Lj*!Æ×¯J­ÐsH¼íÆLý¤5XJl=J°ÞYóÂº÷ÞçIÕóu"=Ij8÷_êw@>àºpËñßt%´ÉZ¡Ï"á¬ Fú¦Ôså4ÅSS`äGÙã¨¿ÆX±zÑiäÇÜ¯ËGEæ´""§?/"Ïá=M©¤¹7¤.tàr=}m6Z³6nÿp¢ýîî¿ëfð^y¾/lùýÓuè~õíäà,+¬æë=LÀê]gqZ()a`=}¿C¢=g0b=K§u¦2øhÐ{Áqf+<MD«Þ¸Í,£=}J§æ=$mã÷WýyVß(B5<}BX=IB°ÇM=K²«HÓÉ#n|R]RÃÁõC$Ö=McÑã8Ö=]vnP`÷c¾ ¥¬6,5Þ6ãFN >År?ÄËAÒÐ3v?ÁÁØ+!&Öê; "o<E8S) ¨Ä7°©ã@yüã=@¶|±=K|qNÊ±@=gÆ=J®Ûek°k°ã½ÍAÆõ¬â|÷)¹ßhÙj²Vx>>AßÁ¥lÔ¨ÈèÍÇ®±±ð^h¿¬Ðd,HUIbS°ó1@µ3á7Û]ü¦à1q­ËIß2ýÅHÈâéÑÍÿýÔ­æQ6=K»×±ùûÄûÕ¨âþmHÓ´qÚ2Ê÷ðÊÞæò@­xëõg¢_0»AÕÍJXG$+Þ"U!ÅB93ò}z»Gc âCCàçîeÖSxÐôI º+1#{Ø=!èK=I$Å(ÚµEmÊePÞUV>Àc¢lÞêÃC=IËT.bÅýºó7VÚ4úô9ø£xòÌïq0î· ºoI@ðçuº¿Snÿ6Þ`=L÷²=@¶Õy¹$¥G^ Òü.Î]tØ½=}I[Y=KýÐ=Jü=JB´¶ÈÍDÌáB=Ký:«B=g²Qéà¹È(°)xZª/p=Hd$yR©Çtq=gVRxqÏ¬-=K=H«À=L÷ª°~À=JÙm3@DKí[GíNð@@ÓdmWÓ)w¡é¹Tç¾Z<3@=H18¸DçJVÝ7ÛÀ±Nû÷æØb¹,´ó]½U2Bså¿qÜc%¾Tr}ô}2"îQÜ=¬ÑDgô=Héj?Íp)W3ã=HzëV¥XàRñëÒ^sMuIÊôPGgIã r³fËCâfÏ· ç`ä/Ì}SóßÔÎÇ3ø¢þD~ÖúvìµæáÜVÏkÏhÎ=K¼¬éè42o=géèZvOÒ[Ç¶æàVl«U=H=Ie¹qêóÐFA%-8Ìë´°?ýÒ¥_@íá=H2¸¿[yßÅ*$ï]F(ëXÀA-Q¯_»ÍSRÖ¡õm1ßP[¡òÞ·Úæ=HnÞ¯×Ô)£¹õu«ó-H5}E"ö¼yßOÏªª¥QÉ=Jº;wãð«cÄø"câ/,Ê.Êew_½w×YzÉØ´É9?µ4vÊ)Ù ï=@zdÕ"8åbxðú£=HO¡=MûL¶3¬(5Úgå<±íZYÀÛ,Eü¸è,kJ=}Srs^f¸"J)e`rB¨=Mø Ì}£=g÷KfÔQÓ-¡{!µÇÿ³@+ìw¶+êËÄSÐ½PÙÆTB=I=I[#_)í]¸Ô$ùRPLÀE½Âjµ2Äyá;¿k?ì"YìôÉ"(ªcKô¢ý/çsë+æH¨,·`W<´¦ãÉp$ìÔÐM0F%à«Qß0óLÉLEçõ.ä·FÇU¿!·õSg.£JÕþ]Àr*GÆ¾;ù7ò76=JzXh¹ÇYR|Î=H·=Kcæ06 gìQÛ}bß¯Z3=@{J*V3¢«Õ=g§ggq«m_0äÐ=MgÐ±Óê[ç§f:öÚ§ÉÂZ=M¥ÀÁ|ø8É·|?#eaÓÿp=KÈ8*YèjWÁL»O=H1ýý@HIMj=}·Á&k,]hK°-IÑÂB=J ÕQ[ª=HÀ}5ºÆæMâ5*VeÎ¸ëÂgÿÑß¹ÿézN%ãwF/=LqÕjº"×ÿæöm@ô´-ÆéíàEiçôBÍÐg¸±¿%Q½ÚªMb¼ø¢¿ìÎGÉ¦s=H=Iã7»$ª®=MUz¼Å®:(kÉh%+ò½u¹>àÝ¨DÀFÁ@äÞ3×úå&z¤5ëû¿[üæÌa|»JÅÙ"÷"¸¯Òö»dB¡ìs.³=Kæë¡êN¥Ï´y90u¥å¶=}@qèÿQÂý©4Êñ]:ýBù¹­Bê ®>ÕÓ¶EKS=ÜEE½ý_©æG÷§âÇMq8¬Î¹ß- ¸Ö=Mà½¢ ©=gH=KÏ^ý9F=L¡¦ëõíy?/³¢MºTË¦¡äÞ$.0éc/enp8P=H±NÍ-¶¬åIF^øz´ÀÃâQ,ÏÂù«ÿ&2àØóTA<¿b<1më|÷I}³i¬2=bñþëAIÀ j=HnØPüíÐØÒÁmË7üM¬|¸OXò§½ªÕNØG.4µóbÌ·RuñQH[Yð@$úÓäûda,{l¹,£I~]$S%±j9ÇÙ.0$êLfà^q=»Ë¼ï/¸äª-³$Ì@ÉCÂÆgXÓ9i/h]cíçù¯§.îW,§ó=I¹=@_W¿¬¦TGÊ=JGOqéhG12¡=gk{ª ¤«M4±j!ûòyÉ¯dãI0pzRædÕ=H~=gì±«ß-1J*&;«Æìs÷¢ýþ6ÆGß=Kkï>!ØÂïNð=Lã£wúTâå÷Êc}1åùËN¼jÛÇ¢nW<!ÐÚ©¨«¯}Y=KÑ2¾ûÂåY@gãéÂYü=Oõ¢OÅÀæOCø9óú}¿Å½.2×Èâö©C¾Å,p"ldÃ=IÌòAwÔµ)àÒº6jÎÃ³¤[CØzáUþõÐd(ö~^úk_z®<îÊ¡KrÈ®ëzù¶ôL3T1YÓÄøµö¹ÝÓÔìF±=JS Uâã/àkqdnLÁ³w=Mïµ?væwà|üÇ=J,[n¤YY¦íð&.ÿ7Æï-1êæ ÆêãòRJ­ÒNs%>úè4ìùK{çÎ»$ãÄø¡t9koäèü"e86¯§ê×=H6+æ/ö"@£üè-]=IäWîËNÇ¨Àÿw>®ÀN¹ñ£Vÿìx%MÒÊoÕýÖÅíqx!·=IÈÿ²a=IãÌcÃ¾äzGàYøÁî*"á#WñvïÿbEÃ¶÷z/z/=ã²2nJ/á @!9u>)X¯Eá>=LóCq±ò6bÜu#¡4@^º4å§M¾Ôíå*åg£Ê^zÝjRøfÖÕØ"¸ÆÆ´>étD×æ[Èm=L»îÿ{þ-­Eæ=}30¼=Lß_É§áú«3»s][ÔÁTÊß³½ÿnf=÷ûÿ³ÔQ±;r©ÔP4¢"q=gË6ÜrP©Tûkå4"^ä<U¹TâS¯?p)Æ¸¶N;$=}sÔÚT»FX¢w8A/ðÈÍ¬©µºN=gPW=g8>îdxsÅ;>Yµÿ¯îþ·zñk@1¼rªYBQô7ÞÍÛî!Ù¾vmv±p`ü$b¯qÖ=gêsÅ.Ú2imH]iTG-Ï¡ûÌÓ¤½¦]ôëp¡g¾´>H@æ=I^Ú~:M«éÛn¿ºiÃJßúVÍÂL½/~&7ú/@¾M¾û¢±4Ú=Mðù<øÅÃk"Ì¼~ýcc~%(S<t¼cd(M»3L·pÙÒò^oÿÈðõ8k!L3ÏÜ/c9Ë`1ÿP5ÁÃ=g_m§$)XB<§*i6Õ¡yp®^ìúk2lÚ=H9ì¯De²=gáÁp=}á=@ÖTÙoèLVÑîßÏoÀÒL3â§·wg7ì½e¸MÕhx8=HjUªØ¿ÝEpØV¯iB$Õ¾ð+Ì=Jú,uÈúï!«ÄMW?zÊZ6©ú©6®Ë]Ïª}=}ØLs(ôOìlwTÊñX{Äàü»¡pPsuª#¤:üãKð×ê|¤àÛÞÛNúmÖg 4`Âx¯;¨Óý¿pgqÈvAòÿ}Ý=H/ç(ÆÙSh]tôBöÈG<¥m·(J¨<ý´Ôp¬%5Êã)|aøØG;¾.~­oø%R*òe@Ù¢[;¿,æëÀ}ºCÖ0u)¢:2ÝW{óÔlãÿábÑºÛÅd#r§1ãwú-mó£åíÕ¿G:ñE¬zuJ$K¼ £tµÍ¨°e=@U¥D=Læ®ðb==Kî+û¾ÏîþÀZiè@l}zàÑj$¿uº=@ÒÚVÆFF=g¡ëº/=I=Hö( ~ÓÑDS«ö/KB=0å¬@é©¦¿Ø]·(J(ªÇÌaÍiÄ=HJ9a1d¹aè ÄrÐôL¯â¦=Hö·¯Ù_(&<^÷*½»rgØ¦h¿µyûÁgñÈøY=@»9:Ûgü.qG"µª¢DºiË¡ç¦þØ¨ÐjuÑ*èsòY|SµQ1RÊÂ&úãÃÖdNÜî =H¡iãç¬±µEiü,¢»uGÐáÜS7Ý+IÔ/YT=}%­ÜÔ­ïJ3­Ýú>7/D" ñ=} q^ÐßÑ³Tjr¾N¯Ø£ÄE=KÉiâàsëw¬=K®/¢s 13;|m¤ÌSmC0Q«=}´Üºz[dOÿð÷ÝÌrð-=KâZ½¸þÙtºgõ¼pã=Iéo¯?¼¶xÂt=J `lÂ=gn|ùÓ4c2Ê2FcËÂçö7üGføhLjÉ=g=g»8xË¯?YG<Ï°Öó¨=Jo=HýÂ>]ö¨ç|+þdÈâ§>N (§¬ÐÆQqÚÒ0îrJØäªÆ ?0W½V?kcR%ÅRÀù+ÿ356cp.bº÷¸eTz=@%rÖÖU¾¢4nMÿ¾ú^ÄBËÐ=|~Ôõ¯ùwÑ±ëy¾&ùÄéËÞ8"0Súê$ø*j=}d¸=L:giY}Âm#é`ÊÑ7ÔQb©ÙE&Y9~Ï¡2<B·0h_°L=@hëÇ4UÉê¯¶é0E.¤Ôæ=g}Ø¸óéMBîÛöL-j¦Á=L±íKh2ßôßÝÂºGF¨×Fæa=MA4ìZ°R÷.#QzB"Ñ©=_pm¯ò6Mj=Mú¦ûè]&ßÜ<jhÇ»91ñB,²úýc}Ää2_îUâÉ"}Ë^¨¶¢ä°DÍÔPüßBfÓSü¨r=@¦*ï"¦ÙÂdC°âjFóæB¸<Å3¬:P¸wzfÝ¶$æé!éñ^ !NuxdÈüË¥J¬ÁÊ¤Û¾ì¬O.~¾®w®åÂ=Jd¿=HûØr½E>æ¢þ¿2Öâ¬©êì´D 7yRPLðë1³,~=J<=JübÁbª=L=K<£àgÄ=}¿pÈfl[ÄÍá¢êÞ=@öäb·FÁï(:²=@¶EÃÎEzÊæååi=HZÛ¢øgCWèÆ:¯kelÒÙbGuÃD¡>å2ÂÝféªqoròî?=KjòØ±ã=ÇCc#¬ä.RN°~ÔØèb>ðÒ½æA~÷FèQ¦¦íªþåÍ¹lðïT¿ýæËåMîRfÿí^Åí<&®ú=@æ¬nå=@Ö× &Õ¬ã3=oysú89E5D¸ëä=J=g¨ü)NÙÂé×x(Lªÿ¡×ËºZ¢%¿ðâøÖ½Fù¬4NÄÂð&¢E|üR÷ÃÔY%ÊVH»ËìuppOA¼â¹Ñ¸V±{ÿÍ=JËÏ>­¾«Ç=ID7áJy Pç>9ÊdU~÷ÓöðÌ¯à~ì¦ÄÜbvmçnoÞ ®Sú<9/eçd²dÐþV:%7&Úÿî7b=g¼äö2uL¥Î=}é§Êu;î&¢¸J.Üvá=LÔ?ià4pýþ=ICesH:cñà"Dèi·-¶·ÃZ«nVEG©/ð1ìäU+©.u+¦Åï"æàÍ7vvØµÂF=@ê%KÖ4Ðò¨ON>ë¥væ¥ÆäÖÄëïTf¥äöÖÇ#¢Îlu÷á0ùÐÄöæñdöÀ.èÐrÿöÊ=L=}çÇ¹&¥_SÊhJBPà=Çe¨u8XwçuAr7£©ñMëb³òdV­PB=L¨Ræzuõè=§vzL£PU=LÊX2¾:Ãý#loïn7²Yyó9veËgø¼²Ã¬r3øYÄøÆPÃE@.fÅP=Jòl«Èº&E­&«^íi4=}aÞÙ=g·L®îÙì`<ZåÒAã¸öÈcÉ>pyn:¸tgÉ¯=}#AzËqÖd {´¤HØ_Íbôüê2ª­¬z9Vÿ Ï"ûyÎV>võàºN¯Ñ²3c8ÈÄÛ1=gÞ/¡þóXWp8Â¾¿ûÕ©nVrºÙGþ2¦°õÝán«ÕåØñ/ÜÞÃ6Ö7¼EïÌKõXÂÝ½4vù´ÞF³öÖîQÖL¤r*NÞÜØËªÒxÃ"(Uæ=KS©6Þy=Hpq=@yªn!k°V(¶çÊ¾Ö±y©ÝxÃ=M(XREÂÑEiÖ TÂ ÝóÍæûÆVáíÉ15Ua¨È=½Pv¥5JË»F¨ýbÜ$t@¶±èo¾Bó=g^® åÚìÔ2Í5}ó#XÞHId7i|eèäB=IÇ¥=HÇÜÿ_Ì=güiåçöû}+3mß=};^di=JK4$G9H¥,BªöØbë.Ãl¡àaÔz=}÷Ä¹(ßÚ?ÝÐfþjý&=M]&à-ÔP£´ ¦*r÷ÿ0âöùÉ±4!Ö¹ó.ìvù¡=HWëYÚH=L_â+ÆÎ8ñïÃxVÑkôqâë"()¥J~ìý¶,ä--~XQ µy-UýÛÉ,l*Ê}âIÃ¾(| bÓXìÞ÷Zm3öpzMånÐiCöÐ:ú%FRå,q^ÖcùÊ·)¾l,éÛò)Ñ¤7 rÐëD¹&,¢ÞE)ìî~C¹`å)Òê`1G$SÃ|´híúoëÚDfWaýî2½øÀïGÅ/==Jr4>ºôÙJhéÓäH_o"ð8è«fè^=I¨N!1¡©fæþº¹ Úµ?ï6áæfß2ú3AÆË~ðµ9»×¶áìlÇaæD¶¨¹ÏÈ=@q÷~;Ýn×8bð^</"fWÊB=Kí^78Ü­þîrýîò+iÃ=L3«`7þÇpÁús¸ÖªòÄm¶=Ld þét%«è=g»=MrX«Lh Ë9fÀF¾=glôÏ/UµÊö!Æ0­!µùäÈæp­zË¼¿[=Hµ9=@6¶»FJAünÏ·ãÒêÀ%¢ÑÁ=gëþÃØ¾ÐsÙ^ëi¸=JµãÓþì=}P)ë|â½Êõï$Å=@Ýí!³¦ÏJ_DÉ9[¦â+Ú£fú¹ºW[øD§jPùLÆb¢SJÀx[ûÔ¾NPeÿµ<4vCÎÈãÞ=@ ¼éÏ[{>E8å¡bHFöldõ¢N×±´CñÒ=HvizõeÒ!q¬OP`¬=Iãrþ~I>ÎkÈêû:Å=J¬Íå¸¤þîíG£ì3_H@©¾¦ñËÆE(°9miéà÷õN;jâ¬;Éû8ÚÎSyöeúá®ÊòZ.¿¦¾ÏòÆ¢Õ¾èUî=I²4"·Þ5cø3¥Ôi®kyÛÌ« VËLòEÏ¢yìç5ôÑ*ß+èüFÀÅÒ8­Nw]YLÞÅiÜ~èCD.{NxG=H7=4¦]WDDhùRðñ¼¨Å¾J±{s`a_÷=}ý¹ÈáÁï±_%·údñ:Ì~ññh¼¼¸5¹^ßc35¦ã1Kâ(ÛÍ¢IÛ1[Ã­Ðés=@+E(0g,+«o±WÓO©_ôdAP5wW,0Ùûuó(»xêé[§[L¥õwqZrÛë=KET»ivÉMÍÑ0dMúÝeó"â°W­i+;NLîÿ³{Pî£gXTÂ¿©zÚúÔ¬·pñtæ0óÏxPk?±®ÑÁ.Lbõæ×Âj²ì¤]Qr*0ÙÆüïïìø|£c®Kxq/Ë¯#0H=Lúxy<£a<£A<£!Ç1X£a2x*ÖóxÉø=ú4ök0ÆvB£cÇv&jç}Âp8¼vBµ}P}Ð<@!Ðãµ©8MÒe²IaO=}ßrÖÜäa2û¿¼Û}Xîº»Ic²xÞþÕäÝ*~vwÀnùnè Ý÷óãÙB¾ûq­ÅÈUCâ®¹éÈ#¥Ùé=gvÒêà Îú¶ÚÖ.¼¸_}ê;üùÙÅ­¹k×Úvµº²ó=HÜ¢ÛÒ|[!«-4.¢ä©== üËÃûúMÝÍÀ=}î~72·`6äÓþB#KïÊZjCå¢k°:ÙMX°CØMG+tR1?Ù+[dÿ½BÖ<T3x¦÷ÄÄírKªZB²!;bN· ¦q=}{Tþ=HÞ¢|ø¸ÌVnÐ4+ÍÎðN«}Â7¯@d¸{ã][wÿæÂñu¨Ì=Jski¯ÿ6±"þÚw2á>¹Ù@b-^Øµè=JQ=H=L¢¤Ã±2f8Ã}¿M&"jv®o|S5[4ø`¤ÖXàÇ/$À)=gQì=HìÄoÔPW*CßÃÑKO´=IXæ þæ}jÜÉ:=HetíÉr{¡2gÒ¤GN¼EÆ»E/£¡ï«ðel#BÛ;êq¸½MÖ1¥=MÅD2Y5c»kì"WÁ2iKü^7n×ñ¾ïp=IE«jïÞÆYFHó-?¼´V=M/æã2ÎaçëG¢·+»LÑ|ääùW)RÍ²W*a8=LÈ§Óg´©ÜÏa0ð]X¥ñ/9t=LÛ÷=I­÷Ô/3æürx×_d¶=}ª»¹È³ÐV,ÛòÜòùKÃzñtì°>°ÄóÃ`û½¥ë«ðêp1m¿é¹Eèæ´;6OèQðiå_Ù%¶-Å¡cÚ|K-Jcå=K²ÕërÇ¾g¬Ú_©ýnÇ!f¨jÝÚwk=gÓãØ7s8½5;|m¡!òIZ=¡A5;=}¨°úðIÑ!T I®«=HâÎ=J@qÓ³DE:=J6Zð:²9D]ð±1Úî¯Â=K¾æ%ù.¨¦ª,ìx¥y8Z5¤ìO´¾;¨}è"¡&ÐeEåæ¹0=Mú|gîcÄU´ÐbÚ?Y0P=Lÿ7=HsAÙóÉðûä>=@f3¤sK§7{ÿðÓ{@;l#¶¹7_=KD0ýçëX÷ñUUL^o<nèUiü55*ÓÙ9äºc¸=g:_a¢Ì]ø.n8Ä[Ö1ñ: ²üÊA5´Eï+YF4Î¨Ç£*=èÕAR|Ò@¡ç=H 5ô¾²ð,PÖDT8ø9Z=Ì¼Ï=HÊð0ï©î}s%·ÜCM|Ò«²XÓX6KÚnjóS}ÐÍß,²ß,B}ÐQ}ÐÕdWp¾e¥f"¼º:Nªýfm±=H¯ÄóÛemqò«3Z"³0Bæèn£ä]®ìàRPè=@ÙC=gÔ8;2;ÖLóÖP²=g¡Qs=@È¿¯Ý²Ðë²|7íñZrE×ab,[¯5Ï|þ¼ÊS0Üa¦´ë"BIÛ°Ü@å/÷ã¹¥u9×a@L]ê~Rï#(=J{-¯§>=IÈ¦`Gd+=IÂ*t>U=I.=JØªF8.¥[¥m¦"Ý4Ëf6¡gÌ?ðÔâp®bp~ï$®¢÷MTî¢¿SÂ`À=JØ3¢dcp=g1×Õb¡²È6§0ìM¼=ÿÏ£ÿîìxFj¹&V|øÁ&ÎL*=g¨|3<H¢^ú°¡ÚÉR¾c!³©Ë÷w_só&oÆ³,=}ÿmj©Y(=Iåø¥(ÊÖî$0úrXþKád?y=gl5¶h^à¡)ñZøp ê63ÌBÒ=L~/lÅ#rY,XW®S®úøã=@y}ì¸ÕpLæxYS2¨²ä°0=@¡ºÏ%îLä¦Ütút=KpF¬¾ÜKi°¸ù¶Þù>×¼72+lþT!Q=KáËÑ§L2)ã(½³4ý[soJÒ2ÏµMR/§Öè"êb¤ÑÝA1ÓN=Ir%X5þ5ÃÁ®iªLJ¸ØZt:ù,¼Wê2ëñsÈpÜà:]n=M®Zî;£æô?ª~;Ê=JÎÒF¢ú%FòúùóåÃPVô×Á.VïÅØþõø{Ôç¤xÃ5¦êÄ=LcEx+öäVV¸&À=Ll!6hò+³®h²öåÃÎ.TúP_®?©c>8qv=@³ÂàAyVå+jÿÍDNùÍÄÂ¢ÍkEødÖ5Û×¦ã/V÷0À`¸¢·µdÖ½=gç%7*eik16°-»·ü=}°h:CÒÁ^NØ×T¡aÉYú=gIyv¥7©,4_ö,³2h¿«+ÁÚ]¿=M=LKi§»µ½OV©ámbHæ­rdå¿ð­Wþþë28 mÏ=}§=H4ý/®.³±L(-JSÜ+ÓÒ*Àû@ªÉ«¥:7^_ZétæKK¬½=JZsIpÚåû-]_Á«6ï¾É÷{=J9dE:Iç9m±Uè°Ï*Òí.IÓëÍû_{jDL¼c¶¦Ô<á¾ýÞ2>``t¨{å,ôÌqé¬ÃÛÜ­õÐ^§%z,ôð`=LÀX®01Pö;CúpLÿõôGþ­÷,±Ý=Mä.8;Ï=K)A/d¿«-kÖQÁÖ³­Ù$¥ =JäD©b,äÞ21C/¦¿p=Ià*¦mÑGûpé=KâÀ>ö[+vp? ©+>äoöZÜîÜO¥oÜ¿{`ùÝ3Ã÷¢+Ræ:ë÷x±ò©;QZï"Ñà+dîNqå9úäé_§ªgÂ;§ õ¡=LVhoùEþpxs¨}°÷F¬¼ýªJ}õ¾ËÊ%àpÃL#§qV¦[ðR£:ÅÍûþ@4¬3:qu¼Ü+;Ýéø¤!úc=@@T!Ï(ñ`}1¬,°§rs{­e=Iô2÷cÔøy£Q®ÏÚ ýn-Cv=}íÛqÂY=L¿²/¦a&=L=JAE=KNÌnSÙNÀ2iJBã~ÈTúHYÿ»6ö©W0ñ«üx#å==}ìJGùgZu^iAEö-[å=ßè=JüLr)ÌÙ! ï=@².°Ãÿêõtû,d«¾=õ:(²o<*úwÿ=}~_Ôèäÿ_eël?Z=Jä õEFHÌÃ`µÏèçìoä=IÕ`õ#>,5ûà­gkÑI5Èl÷Ã®1Ú×Ñ»wç=H? é8?ðuüá+¼á¿0]Éá»ëCOÝÁ¯GìÐ·EÁ°§Âb²TÒ=JSn&7¾¯Z_½ù=I"ÝËB~xP`##yw%UjRûòwZ£H=M^Ê²²<òÉCQÃ-qÉC,I¶!etæÃ¡Ò(#¡þÞ=KKM:Á2./¬<¡*Þ/T2ú7/¬¶ÜàÄK0²¨;è¢Éóôläÿ3u__2WçãÌ¬lxw?¶¤½î0=M[¯þ9,ótòÊÊÉ.Å¼ªÌ& #!¼»M»Êº/ª6t]§X=Ç°À_¯G_=Hµ´«=I°[§X]9{ªzc$ËðnôBÇ¾6é)FÍ¤!áøO¾óä95Q=@®}ª}AÙ4êa¾ó£Þ°zeÉv[°ÑÞÁãø|8Sy¯íôÃCüDaùó¶ÃLLøSõpÐÝÖik1Á³ákF´Ô´wwÓÈ¤îby*ú=L"7»-°j2aYgN}/)À3x0=Hàyax°«Ç_/£ð¢îJ=K}h+½åpBïªza~ÜqrPô`&º{¬£ð3=gP#ÿö½e³«Hc¨,WiÆ(¥-C³·«³¬¯¥Âªÿ¥=}û½%ÑèC=@õF=M[zM%1qÌv=gÝ%Ô®l%8JæK!±înJËÒüb3¦±ÄJð²:32ÿ;ïÐ=JÈkjÊ=LI=¬*¿wx]E-/íÏ·µV=MUª]=MXëÒÌañp|ò|sr$û^´ZjÆ=KWNÑú;D0(±ù¡w|ó´O¨JwÓ!·7Òé)rÞBV§`Ö>øFÏÝ =g¼;<¢kThDÝ@Ûí=@(2­K¼B`©ßáoK¼áWa½¤´áuA£Ñ4Vx®¾nWãøê1µ«-åÉ|xÐ|Ñz<eÚUâÚR³¶©m§"p§qïè/ÅÊòf17ÁlCÍb¨øjþ 0"°Ó=M$NWËjÏ_¹vW]­9rÞ3?``j=MÓ{lÞ:£0ÊÂ^5¸BÁ¹ñå5>guÉ7?f§Úda?&¸åméÉ¡"Ïÿà=gxñE*¨®¦=HÚgærþyYkA`´r*ÝúË9îò3Ì=}^lF7¡Îü `FJ?T¬<PåçÈh»^ípéÙ¾HÜ0)|"¯ªeEùR©7°,!U@õÛÑÑXñ3`=K²ÐmsÙs8 =KMM}Æ {{wÒ×WÙ«=K@&^rP`ÄkÒ-Òs;a­Eâ%6±¨b£¾BYü?·M=Lç/¼·3[nqÐx*dòZgÚ©àoëþFj°Úµ4|-`p×:¦!`ñw4!ûæï¢±´ -`æµÜ!Ê¬ÎªAïÜÝÃUÍê<7³H@ÞYv=L]óê:¸6¿cøËýËÁÅ$IÑ·õp£Ï=M>kc ýEUÒIâ¹(>Ã=K³=J;yÝYÆD>Jß?$Î¥|HoòIdÎS½)WtbßEò7.ø¸µ#Ì|6·?~èÌb!ãÌà¹??aäÆ-¹Áö¡Á|áe|ô~fäal6Ãg?·.Z¶ãlU2;3êH^$@®Á÷çÏ¼_¨ÖzVÜÚD~XZÃEl¶¦ÇÂ^8]+Á¦ÙÐ¾ò:G`=H=Kû|`Åß0ÞFúga·õ]ÿ1=MNZ¤ê7rz¦Í%î^yÏàjçUívß=H¼j=Mµ~¶=}Á±öyðð?¥°áhõ¯i=JÔg½4¢hÿ´ÛáüÐwVÚ¦Xdµë0w"BºNÀA#ø5!üx%ø:e«Rr=K ¡l¡)ÿÑ_«Ön ¤OÇL{=}çsÝÎå gI;ºÕ A4)Ì =L=i5ÒùUxR©w#Úw£j?Á¼qü^ÙöÞñ OðS=HÚ¬f´[ÐG¾zQ=Ïñ;¯5ªIô=}*ÈyÕwmwY­½*È]Z>Ù7Òj½CIÝ¼z¯u[Æ÷|èrÉÞñ>Qep·ó1¦<þÞü¼F¼)÷¾äÇOVjÄ9é¸°ôÇ+Øqø+{2a6Es_K{*÷8È1C]­ùn°Bkñ«1Ð¸+Ç*ß=MlÀ?õßl=@XE×%§Í¾£áoNÐho©e¯zg¶ëÇeÐÄÇjSÞ]êî²ðSÝúküA=Jæ5`vÔ=g=I&|1ýÙGBS©©²39]qýrá7èrÚ§½!¯i½=LFæ=g=g3D©?f?÷ÜÛË#iuaãoÇ°<ø´#ÐÄ)¯ytdF±U#qï#¸£§j.SÊø¾,¶/«fÅÓÅw(ímöK9¦þÝzÞÔdee>ð3K^ML3?GõÆy!üÞïar»7û«Îá#þL¶å=L]F=@@ÀG±={DèÝæuûG,EoàÀÒy®=Jh`½Ð°@ZcbcÎ7/ç}ôG-¬[±ò×Ì7)ïÎæÑõàË¬¯÷­µlÉ+òÀ+¶TAòÅC.òÉ]IÔWxåç¨0BÑH*äx¦Ñ=KTJ{h`=}/ÙßÆ=IJ#Oäi6·Ã=LÎ¨Ã`ðíÌ=HÏC =HRûàr ÇiN ðÍFU£`VV:UÐXø¿àìÂ=JâÆìÌ/àmó7¼`äÇR|×Høýn)!ßV3«¬omö¾%©ÝÐ§NxùóhöÖËù>ïBÛF$ë³l=L}D¤t;_Kò=gãqlÒÒ;)dÌ< MéóWN,!XÄ<¼Æ¼±_é*{P=Ko*"´kOM±¦g>,e-r²<t?T=JXø0>G;òi¨n­=L%=Là=JÎ·sGâ½aéÒ:êö¿<«°ìmÍz&Qß±íRªT&ÞgNLC³?ÒP1Ð=Mü*xüî?·2ZÀñì½¼=Kø~ì =LÜ/Ã¹Å´,âáSÅí`Umî5µ½mhDÑrÕº?ð*ÿ£Ã¥d=Jö`ëH1B`3µªÉê!-Þ7`ð=H­¾ÖVÐ·é%¨®<âG~ÖÿYö7Çw÷ó½ZÈíÅñä=@7uæU5Á`Ú¥X=L/êf4µ^=I@¤=@|^"ZÞá¢+Xhã¤49íÎÁD>=JÑK»WgCjOCÕßø ôjÕäµ+n¢ÛV1ñÞÂgY8OÓ=}rËJ¦µUÐ«c©Ú¢WçÂ=KöÕ=Kìq=L?4=g~n0)[2{ÛÃª¹°.Xë¯|Úë×¸¨`°hö+,©][mö?¸@ÕX-ª¾_´©}»Ð¦1 î=KØ-©åTËm[%g?ÛÑþjì¿ÑP¯=&G Z½°ørtkÔ O³lSÑ1ÑLcJeÚÁ:üYG)=}üHýÂ=L©íj:Û¬Ü}ÀD¼ê`[Iv-¯lÞ+ÿ0ÜÜyjsÈz¿=LûpÓn÷²m=KåêÔÅzfÂNÇ#Äét)o§iaÔùQû|Õ´wÒ6|]BB1 XlÇä?j¦­ê#Õ5½5Ûêx#·¹&=JÝÊóÎÚC*@»ü_¨l²iÍzËÒ÷N*âÐe«VlþÚØY¦¼¨=K1ï×°w¥~ %çâ!ÒÞV½7Ý-î^vþý½`cIH?Eé=I(ó[A«3ês6·"±DÁÈ>ÿ Â2~Ài¡QiªÙÝC¹`E=Lh~ú¡t¾^Ý-=K¸*èÄ=Iq&=Lþ9®ìl a´±·o 0¥ì©,þ:ÌÚ{Ã§ï:ô{ØÄÆ.ãiêÙÛ¨´`EI¾E¾PøÎWÚ*ülå=M°ó¬1Æùl=JmPÎ)!ÏÕÏ7yýeûzïø7½ôjõj@d§<î¿=}=I§ÎÄ&F¨Íêqjìp=g(Ús÷6ëb"¹4bÛUDO»a,òú4ébÀ=HòroaLú=LQÓ3Rº=H:bhºªÌ=@¬Ý¬aïWîIRÕ©à®}ÄögjjsMÂµ©=} =É°DbªcÌé0=HÝã=It1O¹D=ó)@vFí¤W¸U`¸¹M]rË±<Q²!|MrkÍ$ÐÏíÄ] /[­@] ?÷.òpcoL!lLéº[dZ2Yt±c¨]¿Õ@µÅ)Ï.¨%Ìvÿ=@}ú=Lc©xcéÉZxp]¿¢zèÙ<÷sA=}ñãÍ=LîÎ"ÂÊx-iZ$G·¸¸ÀM.ç[³6¶8¨[¿&KHÛýhþV{Õ¶Æ%n)YOM(À8O©b>Ò­{ö=Ii¤Ë=L=KßD=M»Np=JIÂÁN«YÚ]|= ó!WíI½d&¸×2ÆÐhNµæ1¡ãÚ°¿X&¯@pbwtXXÞb ¥XíIÛ=M,|w»UH%M @MyÛ;i¤Ñ¿í]{PíP&=}lÈ³ò~ÐjÈøKfSaSÂ=LÖ4~c#ú´óy¦¹Å0Æ8¨«ò=K4KùxùâQ.¬ p5ëÔ*(w3ÅrÃìbs+ñ5SYÛÐflX¢¸NÊNCÆ+Ò£JXw/ù×DÝ=KÃY2åö*ÝúsM¯ò¾îætgeàÂº=H!çL ]Ç(YæIêá=L]û@4ÈB;ï8ü=ágmQÕed3M÷ÚêNe(?#´FùÍÕ§J×öR(7ë´[6w¶NkáG³>­UÃÌËYF¾>NöMÞNçàãþudù X2æ£ÖáA»tjÅ`"ö>ì}úûÂmWÄýëXeA¤÷}êù1o[õÛ~Àò©H6¤½g­`V4#ôÁ»ÁÃäâ<øú<eb-÷¦äå2úK=HQ$Wé¦À¼Êâ@¯]Î¾4ìø&R/P¢éû¬ùGs~=gî1»Ò»&_¼B+xëøXÄ1!øTøé®eÍ*þÜJÆ=@ïò6ûÆey¦Ë¢D{å=@èfÄV¤èp?_$cm¾o(bÅ:äLmÊ4ëqc£ÓMÎÜ¼=}ð­ì%¼nFÕ¥úÀ¢=gýí_õ¥lëêBô+þw*ä=g=K#TÙ~pæ_à­ô}¹"~E`Ó/>©.Ñu=gùK©+J=K2]P½¼0R=@×UPBDjF1¹ñm:d*ÊøU<âAy6ä4Áh.H~õµn{n!ETþ»Ö×Dªèòïe®è¥u¶èòðe¶èz{Öpÿ-Á>pÿmÁ>rÿ<{fªèÞÚÄæOþNõ¬ÜühÛÙTÒò_htº=òÜ²^°eAñ|{ò/ÝØ±WèÝ¥YgIiV4zxÉ­¿wmËþuçZ»ïIã¹ÉL>cfk(ë¡1kAsµImIÏ­1kd ²I`f×ÌfÓ|=Ï­9Zs(Ú=Ï<(+²Iµ(ä1ëÍÙ1JGXqÛ"<Y!´ðIZÍlI¾ªÛÿaA/Må31Ùló8íÉl<ÊHjä[A¶ïXp)u¡,H¦×¬C§EMâQaM=M^pÏa5 3=K,·«òý{¤âIà]uú©:=gÜÒg»å¸£_móK¸·E)ÑfWª±pìñ5â/#!ðjq¥øýVØE°¬×p¿pnõÚáåÕqÛ^;ñ[ÜØ¯tIÄÎÉú%¯ÌjJB t%Nå9bßó¹CÝ öÙ¢&¬Dø½Ì=L:ÜýBÀ=LÍÜë4SÍ÷Òlaø¾à½àËÎzÜwKF9Òh P&RB²¦/thÍØ=Tºy²ñ·U%To¼=}!Ðv;TX© tª!=H=}»=L-ÙYäÄ¤mè¨AÌê³Ða=IþßÞß=Kð_+¯4PSÙ#.Y;Ù{®8Ë>×Î:ÃÈ«ÌtÑjTî»!èd°=H{c·;Ä±BS^&/½¦DôÓSýÉ«ý w<CQ=Jaºð|*G²ì°®kÖe´=@oÍeíâù3A)ü3èôDÔ ï¢.çVçBÄW=Jã-%ÖWhYdßTæ J2þÏòïOìçZÊ ­H8Ñ¯M ç0Ï)¨©-ÈáV`bTªÞ*Owwß-ïÚkb¼Êl=LÝg>°=}C^4Å®Ü®6z°fRSÚÄ0´qÊ÷=gzO®Ïªi¦C©=g~ÐYÛLcüñG+¶KÜ²=JX=@ñG(Ã]!ÊNÖ3{Æ¨m»WÃÕGÁ·ãlgv=gÍ§¸¤ºsDå¶è²=¡üZPëüû^ºø.ü ýo"J:O#e<¢åÌøä&&³D98ù7è$A;0v½+g¾Êr]áq*0àôJ=I´=g¥|v&EaÞëª|û¸º±âáç»ÝÂ²íÂúëÈÃøòìIÂÿp5=Lå=HÙðºÇðWµÖÉ¦bç^=LëHÅÜ[êWX(="Rª=M©ÜBx~²¨¯ü<CÇÿì4N=Jåö%X=J§ü]t6V±ìEæ¬@n 4)§N=JæÄ;=MDYï*¯ò¡¬ì1/×iÃ^ÜÅ0Nå½-=HR}!j=Jü~3±%Z¼¶Z³qR| GÍl~g.ð>Òtù¡·²Æ=g@zÏ[AïïÃ¹8­·ÁøÀ=KÞäwÈ?|ukéPµ<Y"#À=í¹ôÀlñõá¿kûÝH=L´èêì)J¡ÅËyËÑ@xW±VìûYUyY=Mqm9Ò¿½ØÙ0Øë^yòjÉK°**ÏØ/ü(WÂÀÂ=¦¬Ê¥zmè¿wð¤+ ýê¢øiÑJ°JûæÚ)5ÇxR}ìÜ,Âx¢àVYdGlÿ+H®Ù¹ß{¯UõÁw ø~Î7TÓïÆ,X4$ËJ^UîqWÙÿ*ÍË¹ÍÚÞÞ°Îf)¥¤r©õ%=J¥]É¢ÓV³¦#=M2VeÖÚ`ÖÕ"ð;%ó,iO"õ_YÅ¢9=JÑéÌWxÊñ¿Q½0"·sEÛkõrHA=}Ærã|äfCfá%Õlë·êÀóÀÒëÐhr®x°*]õ¢êN¸sæÁüÅó}æ0Ö^î>üÔz(±oÐtZ]{fÌ²"sP(qYCîÈ=J¼÷wÖûôd=Jîã6éPb!ÿ=Kç÷ètÒ=K5è#³Wæ")^bc¹Õ°,=gvÄZÛèÛcv¡ =ghÿzIÔ>¦ë³d2Ûú6Òë×/½JÓWTÇrN=Mã&tøeïu¡Àù­BÅàvv4¦¡âçBºðN,YÃ¢îIfLGÖ.ÆÿÆ¨¥Ö¿éØ=@vîô÷=@&Úú7CæîèvîCÖEa$îè*8Èú¥ÖÞð00d{¼¸[)Ú±ÌÞWTé+4_TÍ[óCUù·,ø@ ô)¼|ª$=IèþõhVÒÈ«8=K(ôr)&ö0!k£GuT=@Ý§ûG¼¢esñ+´¦G]8Ø(S9×Y2ÎaöèÞ=HLÀ^×UÍxx<c¹*nÙÇÄû-=K²;±:>×nÞlÚÿ×g_9n´Â>CÔêOW=@=IqýBü¡4¥Ä¿±a=Ðò~ÜQto`NRRªða°4< 2Ü¨ÛZØÑ"3ú­ãÛþxÂ²?"q6Hºow3Âl]#¿0r4Î=KAK¢Î+óÕbP®ùü<úiÚgBÃß?ÿ÷¸KÁ!ËSØ¯EÎÀyKq$l§¹x§=Mv3Á[OW§NHº=Jg0Ü"4¼Ô¹{.ÍùòÌÜÐ¥Ýo«xÇ¨0^]Y=Iõ¾2%&=K=I¡.Ô¯q¿ [bÒ©!§á1X¼nH=Îò1HÜ=M[ÛW_X[=K[¦=I±=MÈÞ=JÜ©pï²å/Kû]âmû?OsJ0þº"q¦Î=H!SUÄ =LvñØü¨û-ïzÎ)ÊX`ÛAÓbeîZ¢£:ÞO­OØ°orµ©c¸v@ÕÞ6úòDÌß%W¨øÔiÂ¿m£ö!ÖHØËBºâ/2íÄó1tsn>Â7ÂÍ°GQ°Ñi°0!ñ×(õw&Bõ¥¢Òõf3f=gÉ7ÔtåÈÄù7Ä¹S·CÃÈ®Ë»¤¯$®¡¦hABX¿Ü*¿=@`r3¸H`û°ñ²&½ÈêÞÛØLù*kù-*E­þ¢È=K I)²ÜP=KüZ¾Îäá¦lÌ~¥Ït0<9ÌnìâÆèÈE$ê=M¿¹|)oJ÷ïÄå(=L°Ø]ý´Ö3Ù&§ÐÙ¸Ìbu÷ËYh+ÂTRU[¯[pñLºå[6éþ¦ùYËöýÆvh®^£/$bÖaËL.QÎ¹L/Ôß$ã¬$@°Ö=}º&ê´UÖê)mO5BÉmÌåG3¦³Ä4Aø§·_©s;ðRÆ¹Òë8k¡1C=K®*MàÂ7hbdþóæÂù^Ä=KßAÒæ:ó ¥o·S*f6ÒÉþoÀh¯ÊF6í³RÒthp@RàHuíË¨,Ò¨ù±¼"9¥.x­]©{,Ú"£7î²»Øµj=L&ðÏþÿ¶=M>Byf&U=H,ÝbÂ#åËqÜáT>øÝ &ÞÒyõy$9U{rr ´-X½9î5Í£^8«" ¶]±cMHþºqùÚÈM8Çnæ=@öè7Øðÿ[âA,=J YîÁ{ñiSÈæÎB½k^öÉûÔÜ~=@ofæéGæN@¥O¢l²ä¨«µbãCõ.ÿè.O=H&òdp"u¸Jºið üùO¾<èm»Øþ³ò:èe½.}Ñ>EÅZ)°Pæ}&$Öã[ÃPXº×Ä{&ÉTýHÃó.×ènSÓ`¬E¡7qõîpëÇ5Â5vêyOZd½=LG´>; Ã{)d=ge¹#r(qÁF+Òû#gÍuµcèì¨^¥NÌÿÒ¢|à«¹¼©ôS~µ©{ f1Í|u^~àðõùu7GÖ4µÙ®÷ä"©|ü¼ µ>ÍþUå×oì[ËdnæÕmåHÞ¾Ü0loìÌ{eì|ò¼z1vú±êZs¶ó®»=&ª¨ÎËx´üÿ="t§xxY_vò¢9ÖIÒå-ìÓA]TÊ¢ðV%¹i¹¬Àvë:üiu¦äQ¯À" T ota#1=IÎ!V*¼¤å«Æ¥á=LÕä¹·²1}ò÷ètº=@=K®¯)ÍußÚÞQ©@GêÕ»yB+i8S=H¬0-»6-¯ÓZ{ËÂÝ5ÿ=}ÖL×]ç=LàRm0qJ×#2=güoÀöÙYF.ôøû089¥¬u<ú$xéw7²òÍ0=J@*Eÿx=@§Ôê=Mxa¹k^ú¯pvCoÀV¯¢7ßýõç=}õ´róîwlóæaÅ,g(õ<=@zg¬r=@ÓHÓ¢=@ÜÅóçHÃ=gV2:Î«ÖQ®NÜ$ÔÄ¯´Iwëé_qöäù²ô8é¸=gXå5¿Ú÷°É©ÃÄéúO>FØïéiñ6ö,ÿ?E=LÐCýÐõàx^èß±OÎ®ÍâÓ§nuwÈ5êøË8ZX-~¬uã=IÒ=K?Ô^Fd`ÄQþdÞÌÓØ1zÿ=}¾Ú9O{<:ÿµ¦Ý)7#¦§½=}ö¨ÊÄô=Jö;Ï(wFÎidÉ¶,J0`J"4§3)Mç$ï^Ðð Õ~×6c½¹¿.×)Ç=JÌÛEºTÉ]Ë¶Ë!c@Â´;¤i¥ùiQãÚ.BjÃçÖSLú=} :ÀDEîu±áb1¯ëpßÀ;W¶=gÛêvj=HWbQaTí$d+ª£LàÐgk¾PÉ¯¿Á¨[lµ¥bé¯AXÌûGuçØåtºâ[wGà@ÌþéÄ/ÀÉ-{J>&aúpÂ®õ¶ö^Û¢dUûÌµì;¡n91=L·ik±y=J2=LÔF­Ü£H" ÄÌï~hþOgÑ×vä^Áaïä=aZmY=Ll´V1ÌºrE6=}ö;È5Ëc[É®ÏdòÜ=}I¢R÷Ã=M4­|v¬Î¬Äg8åw§`®­y.ÃMûF¨5Aïî!=Hàüû#ÍWùT.^¹r ËðRÄØ08ù#ð7,l8[Ð=}Xn`®ãyyó«%¿«&½­PXK$üì9Á­±+³Z %~øÐCa=HÒK=Lÿ8/=K4ËCjÁÓm6ãµ~Èºå{Ïy~×ôXå°¡s2¿¬=K=MXârG+xJüóa¾ìTý)aA3ö%¢Ö8¹wJdl=Kp=I=MÝ×/§k´@ÒHÅºÕG¡úèó=Iµ2«=g úHü+è±]WVL@=}yáýÍ3Ufn¨ë´ÅUÜ¢ÜÅ8Ô$öiõm¶{A:Îwgì?¨@kpÙ=HXðà¤¡]Míb;ºoeþ2~¼íHzCg>õ5Úu³=JË_¨Á=Ml:²?æ®÷~=}^à¬_CbPÌ"qßY~×´±1H#sÊ¯=}@èYÙVDsÝúµ¹ûFûÝwZÙgÞ=HTt=HÇ6ÙïØä=MxSáõË·=LeOº=Hrä_JöØø3ó`Ö¨=gºð=Ml/¶ýøþBö~Å:,:K 5&d=K:Y½®c~*8£ñMvø¹¹é03½,õzàé1y&J-ìuvñ<Îtß8±rÌæ·Û%ýuVÿT2õú©¾­Þ^uáÚárhÆ=gAüØ¿w_Ó×&eþª*çSfÙ8ÅuA3Z(xVfwQ,µ;oñÂú=L7ZÐ8=}nQÄÏ­1Üqy·ÞãÐ&a gE=K0<ÉS(âÊæºC5;{ÿÚt&g 9´Åºuj"CØ¾"ò±aËYêààî-ÄÝ.2&ÔÒyÌý[XiB»F3x.&?Í_ÍÉ=M¸FgåE=H¥èGÕîKÖv×dÒ&«È*ÔÔ5ÆC/:8ü«m!?ÎJ%¦ÖÇuKuøÞ<¼"÷¬¹=}ù¹`ÇZ_éJ-oUb=gNù¯M±påÀßÔïÀPr5¹­ÂÕØ>lq»ÒþÛbÕ7Æ$þxØ=H7Ö££Ò¤õ0 4w{àÊ¯Ð÷CniÆûÑ·«FüõÇ¡7ªKB­ãÝrv©±=g°¬EKº%:ó8C¬&v@Ã-î=}3y(~KJ3mñÀ´&4m^Êz©ã­¸l¡#í¢h¦®m+ïÛiÞ0ááuÒ»²Öç=IF_ñH­ýã¢4pz_¸Ñ?=}8¥Ü¥D?Õ)Î6 öVkVð¥T·_¤C=}uè_ëULRà5CÐñ½>å y]çÑ±Þ¦ßÊÖ.î$¯e;¸ÔèÒ×u« eäéµ¨^®÷Rfy92Ø%£kK_$j¶¸^TÞÌÇHH;kÙî40g-dw®ÌÐ)_Ù£ÝäÎ1_÷4%ëáÁB3]¬1ñÉPÁ;hp= ñÆRt&ÈÑkðÈ½bú²ç[B1¹$n2coGrÕ{Z¶^vOlªÞ^_Ç9tÙ?Neuôú¼¯¶ëöð®=@·K¡®ÍÐJÐ=K¦KßÇe0ÔÓA¨·=g)±Åzø=}ÓÎ`Ù±âª-÷ÊÓJ}®·°~í23ºÌEhe:r{ñ?ô1M""AEå»±Z5Rj·¾MÉaKe­ð@Í ÙüàÁ¡"h>"©yïHt`+c¯Ky{^9m±ßfm=¸5[¨ÊÞå>/¬A[?êöë°ÂgxB5ç´Ñ·÷vÝtÏfÒvÇ!=}Y¢ÞÈä[º¥úñ2£kJòú:=IþTÓï»"Ú-f~Ë¿ÇVÿkQª`og/CVcæûÜn+ó®Lî4U{¥:¦À¯¨þÁN¬Êæ<¯ÒÜÎÒÙ½ÈPtc¼÷Ï¨úNgÐnýÚì"áRgR:©Bv²~ãZkr¹J®EÈÂ³øë ]y_×Ï°ÃiÄ^ÆPèS@>ÂkèVn_ïLV°Â&=I:®_®ï,ø¢âÀ¦X p=H·ç=H"{jöà¦ 7.nÞ·UÑÙ#ÍRu²wñÙê·=}<¼Ä<ÒËãÕët¥ÅW_÷Õ=}A33¶Èk*âÜÎ=g>¿ÐyRtZóEPÓgz*ÁM@Ûk¥DÓÆÍ53Òþz¢ßÞe=@þ¿³=R±T*hF0¢?½:lw?ãUev©oÃU õ¹jüÓn»·æ1ä-ÈU­ËKîÒ¿·RûM4ÚOï«âè[µtÂ=gsFÓëyÈ}=LþUÉºF9ÂTÃÐÀóL¦©bË·¿£<Røãí°ðÛgÎW03ztÖe=KÛÖ_j.²­&t²=púú¥úä·¦5$éÿáÔVªLè4sÃKÐmñà5p®æáÉ£ ìÆOSDg<ÂI¼ÜëK_©NrÃV¥ÒlÜs$ÂÊA=}òØ¹ãÐ·¦!°ÁCýO=I#«IN¶gL0÷R>yçµ6^É<ÁjÒí§µs?Ú¡-S$7ØlãsOFca:=g&>!ÖBÎÙ¸Z=ÞÐµÊ¦£O«¼â5æ9ÞÓúæÿk=@­Èéa=}¯ÊÏ=M_¯KÅDa^á=L®aØtbml±¾1ÃÚ¢ß¥Oô~Êm«óÇÑ@óçÅ¥ËØ?ôW¬.ä¤=@û=g¿ÓÁ¡³ð½ù¸éVMÈxÍ»ïtùpw8bøhuûI_iOûl=}üYèM=}ÂêÜA_sIµî4!Z´1Âè)TY§þ3(;ÃãÃ*`,5ÒlÈ2öÇ=I=Jaµðßî·K­ Õ¸âd=LúáÀ®Eh.ÖÞÊÀUÛ(å=L Xî2Ûâõ&G¼=}=}=K/3¯Q©©ÞJ+àjEÕ%±@1ùz¤p=@£iTß^=@Î`g­ÚF·¤ø·ÛkÅBëF5z=gÈ®I=M#Vn÷OÖv½5²tM«qÖtlï´·k2E£L¦ÅDú;Ðµ,ü>^d=Lh«üø4öbÄui$å>KÇíûfª¨ÎåÈ5ëØwò±«ÿ_#äÃùq»#µgðüÉËb¡ô£Ð5¦výÓg¸4Øyô}nZåÐì$wµ*°2`5 @r<zíw_ãÐ0DF%È¢ÙrtqÍß;c¯Rç­Ì°·Ó7sðìJ"gÅ>=DÆ¤7V«Ãäóx%pRKr^c=L!ëÄ^vuýá=M¡=MEð<Jå]Ó2µÃÏõÚÙÜå|·Ó¡1öª¿í`Yï==J<B÷Tñ÷û×":z¼ªÉ²^?Ê¡Ð¢èÍý¬5ÛùSn?1Åä@üÈX7"N!Ý[-Ô£ÏBþÒjÉÄâ&åÁµlõ{ðÄD6½Ç¡{¯ýæµ¡èhË|sc¬ÍpÀÔ¼®¦ï=}Ã=MrôPà5þè9!Å<V4újÏå`Ú¬fhÅW^ÈBã. XÌ&,öÜAõISÆDéh:QËcOØQ._iQ6Âbß[=Mýá!æÛ>-Ûyù´cVÐo"ä?uT×3¿. s×Ã^¡ú=M×.Å#¾!h~õÆ×5ZäðêWLæ%½WØÔe{ý©&Ê DGPLh#Ætô Stâ½D{v!P*¼½tâíÈá½@½Ôýâ=}6rî£f0öå+f=@}@=@)x=÷ÀP¯|Eá3kgËdt÷£ÙÖº¤Ã|Üx>72x=}õÍòßPgDMi,ÕÍäDHMÄä°avsVÛzÓÛúÌc*È#ªÕöóôÿ¦ÎZ¾úFÞÄa>ê°â¬aÆ{uÝMjï%5Ñ}°ýké"ò6j&î¸¿xOoE4úe)Lñ{¨Æõv,ià`tÀ®OÂþ}ø}Ìit BqS$<t£Ó4âØ·rààM¸r xé}3c{èAM¸:*hBmë`=@âDZ­Bµ@ßn*åwe¥ììäi]R)K·µ]¤F¨§­fäÂÆ&ÈE¸ÈÅù¾o¼¦ài³»íA?OO@^ÞSMAÙW=J<Xà­t`X üþqõvKlCîøåËÿæh4½h&¨Oë»l§=MûÉ7êµ`ºãÓ)¸ó6]fö©¦Å]T¢½W¤õ£ëfBàXµ<æÑ£@êëëÂüö2ªmVðêmSðÉÂFfax©lÂèsZÃìî0NÄ0ÅtB8Úâø¥ÜñÅë4-tlÛ¥Ü[¡¬ñ~1¼´c2J°]ê?ª?J?ßäßtß_=ÿfè:~ø=MeÍz=Mè=Hã¢x5Ê?$xë*2·:8ª8Ød×%(»I;ÞaÇG"{ÙâËÓÇ9ß?>éÃ®þÐRmbSb÷§D`dr÷Ùß#5Ç¯+9>hDAòIÃ«°¿%²×1=+¸%TÏ{£Nø=L=g*d« á¨=JÛÉXÝÂh©,Ei¥C/íÆcqO6T¸%¶¬ö_ì¤²jDÈÿWÃG=gµ.8É× 7s*¾¸NáP5A¯[ò=J£ÒQTäÒ?ÉWÃR°¤Qä¾¤jÂô½7?nYTÎüQºU°VÐ±<kw<î=H^=Kc=Júªñ©UÈ5cÃß}!êUmÞÓâ§[NíXný=}-ðªD«ÆRïüNýÕ=HÁ¼,ÊæE.@DÐ°´=¾ÞÕrêcêà½t*½tâmánâ½tÆÃp9Þ½9²nmÖFóÍ}Ûå&Z¼ãâzE=<^²Vyè)|AÊV<·hDå=IdèýÈ÷QBÛKè¯XWÅ)CÁA£¹%óÄ0óÅ{õö=LV&°Ê§?ßô[¿#êiÿö1/Â±õ=Kò=Húh?è0÷ÄÎÅVÄöÐ6hÂöè¤f§ë6÷­=gpshÔchG¨30Å³²%þ¾Þê!*"t¢&[ÿ¡ÿè$Õyä¼ÄÂ[K¢Î¤!@íoBiÞ&%µ¾·Òï|-ÜÌHÂ§XT^©=J+Ø¥ýn¦`¸òàn¥P±¯êoÎb{|£ÿxY¸.)ñ?©=L/1­«§SÑ2¯³9±8=H>ç=H]äu]8w&é¾£9=JEév=K£)=H­ÿ6=HÎ´n#${ñ=Ll/çSDñÌÛ³Zm=IÚN×~yãÍØhî6¦UÔ9c"Z5SÀ=@8løh1Z=}¤0ù)@ÏFÀÏ&Ï=@Ï=LO~(_Yû@¿Úrø7®òküRÆå£èîºjÃûºÞFH¦Ün¶¹ÞFú¬6z|¤8Æ`òûý¾{îî=@Y¦=MRÂ`F­Õnºõæó÷H2ÛüYó¤ð=®¯=M÷=H=}ÿæ³Í&¼ü¬õ@=dq²¿A=@µèë.DûÇæ¾EçÂqâvBgþ¡ëq¢c0¬&Tûl/ÍºEBz+ùæX.rÒ¬:cðm`½ôÔ43´³tïDßÆéR¬Yk¿YôÒ=@CÍFKës´·Ûóéyfã:j`ôP/lÖ/øÉÔñx25¶toòöþ~Vð½-Âz-äGfàf»¢¬ãR²Ö·=}ÆY´ÕÝ#³Ã%éákNðj¹b­;fRýrudD|tz*fØ5Q´]_}µùqï¤@y0¥Ñp==}lVîq¥çBql=@ee¶Ùaðm®¾a`bÞÙookÇ}ú:]0]Áþï²;DÄÀéñÁåÌ:|â¤ªÀÿy`X=u¼ZÂ^2>kûTä]mNUíe§dÕÝ¼ð´¹µö´tq¾ZÌB¢¶´ ~Úî.µæÊÀuÅ§YÀ£3öæo>=IMÏ/tuÁ¬¤á=M½Î]cæïpWÐG¬åúAàZEÖë"=@Pitâð=@Tqe<g%ÇÇÕWîêVxÍ_u¾âyîyyyW¡½ôÍuÀ]x8¯ôòø_=LÀ%3<q°øiW=J_À%Ò1]²Ä©]ÂÝ7LKôÉ;T8S[kÛ8×~/ûÞpõ±°úc³=@mä·vÝ=@:h)^×sÞóÄÉ=g/ÍÈ×;<d¡­´ðÜÓ¢yå/wra¡@¡½­NÚØÓÚ=KÌx .Ð?X49ÆÚ6d(:iW3TÝ½s¶¦tâ½tâ½ô¼tnôäøÓaÄ¡Åù{F&{^=kkLKíº¯³Ú-¬ëÖ~¨Cü}m.ñ,Ð/`¢SÙmÊæ±"Í$ú|8<$²Ir¤½¨tàJ?f>§I9û=g}¸Âó[EêLa¬QLöÆ{ÿülùÑ«ë;Sê;fÀaªTáqºcÇOîz%Y>Öä@Ms{Y,á(¤{#tJ}R÷áð-Ó«(¡8!Ö®ÅÔû^=@ÚXbe]ïUçÃËæ*áäµÕ¬YMSô?Õ¥¥Tb}Ê?=Mëo««½«C=}N±GVÊrcË!ê ¨P¡²c´Ù­Ò»NAÖq[ÐM.(,¹Âz³AÎ`,²*¼¼/CE®=HYFv·=@éD®ûÁo²["I5xÙckê&çMU¹²Àð=MA¹xþx)¨¥c».þùÙü[èu«r´µ4ÖêpÉ!,þÁ°=Jç%Å.¹²ærµ½Dy=}PÜ¤L«·-AAõ¿%½Bãê¶þRRFpm2fr¹ºî=H¢.Ð¤+z«¿=gK(P·ê¦Ç=@½ÆÖjV«ø3ÜÂt½cî=@ß!Î$ ýå¼=}m1ÚßC¶È^Â)A÷ãÞQý Ø:þ`>õsüJýàø¨Ñ¸ó$ü¥v}=LuÇzö¶=Ló q6.aÅTiÅ½ýtÙT9ñzCYl1kÐ¼8ÎÍc$·%ÅÉa¯h>_Mäw+A-ëÄ0ÝùoÃ=J}/{¢^$W(d4Ä½{¶{1ä]>ð|Ø«[£8ÔÑ_Ý·ÛåÃ¡pOR··¤°OÁX»Ìq"Z[Ñ^íÂ«(3kã4½=gTMñÑ]>¥éPY}¾°Ô¢À|¨ILcû=LúÔ½I«æ ©Aý)=LsGAðíX1¾&ÏºæÐîÛ<¥ÇmV¦g5nMKnN)Gfá·it73¶L!OÅ=@ìøAÙ$ëaó2§=}YrÎ¿x=LÙs%>x£û!xò3ELâÍy=K=!þn¸FÙSaà5nÔú91µýVËpÓ7R4­*ÄÑÖTUn;ÙtûLA£sÛO5ºEÃIRm²ß»;=Iðjq)NñÔ´¨]Fù(üI RøØ)Ç4Oæ*DÓRîOø=gDàkÅ4ïhö±H~«@<ë/æ(dÉO÷4:[#]²@æN|uíòÈ£Éý»:*ÄÇTÿïÄ9@B`=KÖ(¸æ©pÍBýÃ!v*¤Óú]Lök.yD(DRZí1Fy^Ný«ÿ¯éÆ¢OÞxÔ~E?=JC[®:lµ-1¤NçE1èïþ@âè¾"ÕÊtpz¯&=HôñçÆXBàù²e¿ûð´ðZû =K_m0ÝÑb}·=KpÊ½*Tll·3­"Ù=}ábQ i$è²¿î*õÐËÈÂ®Y{8ò=I=M*äl$¨ì!·vÝ>0IÁ6=Iñ¦K1ë~Yy»¹îúºóq*N(tg%R?pDÙ¤³¬Snðz-EXôäGAÃÖòNABÓEcò=Jþ=HÝ*]×á]@Yt(dÈsy[2?êÕç<ã*üîZãøÊÓßVþ®´%ª¦ÔD=JðyÊþeãø:®*í=}"ÚðJ÷è|¦;[Þ=gHFÙcÍ=Kì1ë¯E»K4Î£Êem=@ýD§®üODÁzîk?Åîhú=Kô8é¹Ø<>º<©d¦ÕÚÝX±(dÓSYu³ðåHÊÃûY:åÍ3sLuöKïÈÁÖ)<ì wF=¥íI"$=Vß¦:ÆòÇnEü=Hò=ImÀÍÐÆªÅDR¼Q0ÀwóBíVdþ¼z$¿Æ4[+vç=K«Üæfð&ê½ð(ðV»W=@xÔÞMQåÍUjÙ7½bÔèÎ¾÷õú0Êòmþð=sé3«sgYçÏªÏnp±2=Lò/ÌO,Óm¬ý¨S¸L3«²ô4Þd_gÖ¦ë~-Mí2 ÉÅ#O$á=g´j¡=JZ;P ëJ=Jp%~)÷@hFð>=M)ìçö¡çOjp¦V<!Ç¶3Ì1þYF­Ö Â=Hàd§y9÷®¸ÐÅ=@""­V>Rf%ì÷¯=5:}½N1Ý¸~ì=K8ÊiBNw2ÓqdJ!lhFò/8·Ey!ÄôÔ¾ù*ÄÉcÑóÛ¼gv*vèJ«Z=@åMÂ9ÿîRß¶;UR²¯¿ vwãFËÈò5é-Å¼¿¢êÈ=@Ä×¹=@H±ØôùU÷=}.âÚîÎpæ+ÿ>òPãVZÂ-·|=ìªüEZ.éÿîD=LG¯öÈÇfþ0wØÅK ·_1²æqSd=g"¯ÇÆøðÞ;b=@âSâèEi4)ùÎ|þ7îXsÇ½Ô¹Õ{úa[.£,cXSÌC³*OJJÉ)Z=H,µ=gc@¿uïò=L¾UéT«©§íNt=g!ð%üYî"¦½NSÝ©Çöó[7=HðQ=M|ÑN.íN×ý-wk÷í=gìù Ý©wòùÆØÒjcXZ-NÆ*Ý´:óvÝ c.í=KÞþl9vÚ°ÐèhXCûZñ~­&®Ìalº?îBêb<S*#mêÂZ¤í½¡Ä8âÚNÿÏÆ-Ø×=HÄ 9À5ïðö±çZæVåA«*ç.sDç¥æw:åÃÃªiìÕ~8tóÆ^¯£2Jaþ6%Õ_TwÆw=Içå·ñU1ÇUõ>²¤ÿdüv^Ûþ®o¨¾û±o¸ý¨ÿì®hßøüÊ)ÿæÅ¹Ø6@z:ÅÜ§Y4qZq£³ÒÝ»Âùíd±8úAÛ=}f&ZñOÜ¯b²Wày°N=%°ã_·ª5=}êFb§±QWbq=g=K¬·=L<<©+,2½KØ+,°°Y=g=L©o¨3éO2QÞÌø¥îã£=Jejuð$ª(AMsÿøjÀï¸8éjÍvH=K ÁÏ<¥2RøË]È©H½<ùzP©Tßuü4ðkB¨î@¦!Rj3Káö]n]ÓåÑJ=@í3Á cþÛ@-S=L6=I$°BµÒdÕïyÛ8¬¨CEÖØ®l;0® ½·øýNøêH|§éµÔívJÛÁ$Ð=ãNÎâ3úöêµ/8ò÷ÜÄ¢@>$zIê"TðT~Nõ<A=Jn 1Ò®êÿ¡JøB?6ðOÛù¤=K>©ÿ¢,))¡[ßOø7ì>â¾é%`ÏÓY:%À=gåÜdNRÀ9ò2µpÒ=MÉ©$oO¸]®Þ½wöÒQôåJéî43¥ªN×Ò4â¥HJÔ0¹+Ò0 Ùi[4=JhSð´MI=@ »¾HmT Ðx3¸MÄÈN5T¤¬ö7Õî[÷±VnÇnýæ·LM±I"ûò!PdÑÛ$øÊÊCJæÿ& =@¿KÔXcmÂvòËÜ¶m=K=M<7~N=}adÃ5ßQVð*}òêg_{RD"üboP¨mµQhd»v»«ÃI¸Ù»$¯K­÷^l Ø½üðßMÀÎ=}x*àvEgÅÑ°µVP;wÔØ>®Î^Qép-)^E·à6RÌ(?#Õæî«DñúWÂ¹¤Q©óH¨Ïò[;ñ§YJ¸Z®=gp=I¬}¬Z½=IÒbÎH­¦a4A=}ù $bÞêþS>ëÆÅgu~÷çº.j0ù=}Gd=}]ý5x{@Ûº80Ífr(´D÷PÍÄz¡®ÿJM»:×!H^s#ô¶JÞ*¤BAã" =@ Sc}êôjSY~Àæ(UíVá²÷3-Ti¼ßU[ævË34¡Ä¤æ^>¦VµçpõJ©{Îi¶*VÝbXD=Jy®¼ c$Ï´ôB?¹ãèL=KhÄU ,Õ;SLÒcTÆój~42>9HÃÈdOÁCJXû#ê,ZÆuæ9Ðgè`ÌcUôY­Ãñ1 "u~*Ã8=I=¦f ¦o3!e7³O¾~5Ì?¾4*UÉ,Ê?SiN­X8ÁîL)ä_²EYR·@ÿCýÈ.A40dóÅUÚïqMVÈu6â5Rè[@Sd¥NÔx_óZëô¤;ÔÄÎÐ;)é#é¿Å=}jÇQ6àRÌc~Ôb©½3=}xvöN3ËJ:%äSX-ÑPØW¹ÈYÑ:]º­é9ÐR%øA=û_=KÍB ÀÄ=LæÏ%}%dÎwÚµdO®=Q¸f¦êsðÉBès~ogrZà¯%uJ@óÒöNðK2ðÈ!¿Kkc¬fí×ÿQl¾·ø6{%ºÍÿÚú×¥Lvá³äITØl-UhÚö>ëØxKÏÿWlDCâð²=}YC¢;c²²ù¤3>Û6©+Ê7úîy?V÷^)ÿö¢öúvØí§Ù{RFðÈü:k³FÈ$âx/²l¹A?î©Ðÿ­TÍæõ=IÙ1;n²ø¬j­vKë÷Ñ~>)°Ê=KxÏZÊª/ éë±Ñ73úÁÀä¤ÆCC@ð±mÈ-IòÔØoí¡F@4í¨Þj;1öY·+5)ÃýúÏö8j¢K@¢Jøy¹Çä­ÿ|IqÄàÖ¹Øõ2lÁ®*!¶?«¥ó´5oð=g¤KþÔa«FÐúÞµ^/8øg©²¸ýØë5ÎzéZA.zÏpÖ2@6TL«ÒëXxøVËã=}ªu4)Ý=KPýùI;ÐÕ£9éwÖN[wðõMUÈæó{bÒ1Ýáªý=@Eüý® wPXÏðd(ÐÝPÊ¢=K6DP£å7%½ã¨gò=gB­(+ñUë²ã12rzm¤ÓP¦5ïZ¿8)Ô»´³iùñ1¨²æî£"oÓÞ+0µ=KÆ¼ó`MöúðëñðZ³þ@Y>nS@^Ü$Ãé$ºx1DùÏ"Aò "WÈ¥êr2j»EV¾}uzI³Ä¿nãéî@0¦íÍ®ñ[r,òh5à_ØrzîÚxg2"7PQFnS+×,(lpþ99ÔÑ%!=J|ÿ¶xANzz/"M:LEÖiÒ{oO¸(:,ñ±ÐOK¯¸Î}±=}ËFP¤cõbÙ7W@Ò;Î1M-³éÌÇ^ð×%­Ñ¢áW:Zð=KüÌ`¯òËY=@ßÿîò1>Õqgm/ré*à7¾òmÒò7úFälÞPnó¾i¿õDHÚ­7<èÑHä^"ú¥51=Kb½é3ô%%ÑãÌpj=I6söjYUÈ[=Kåí¯ÔwÍ=Lë=T¸ò¶®xpåWÏá·6ßÚøÎ<)íñ·;j5µ.¡¸õQê§ÉY1A·¡KÃýTYò.ºRß£$¾V-?¥ï=g&z"²?d4ÖùËm¡Ô³¸^Þ¾ÍBÞÑaNdÏÄÁ&ò`EªcróCÌ^JÞ3¶ðÿÂ¶Ò ¼Ê³0à$(ýÒ=I¥8¬³¡-rxÏk"ùh¯Ò[®Ê¯éV·ñOµÔöFNY-QüXïíò-Ì·êÙ=I¤¿PeÇ=K³¡XsnÞ=Hnin©¤ÐK@Ý£µÇòç}=I=Jí8,NëÈjOá{)æ.MÝ@ý=Kay­`Jð#s´êÇp¤öÍAÀ=H¦~%ïMôîçä[ã¼=}j±¿Äª=MF³¹º«ÔBªpI2õ%gµª?¦Þ½tbJý£tjÏ¥¾óààµ@Þ£tâzjõt¦xÕüw?"E#=HHO=@mª"7SeÛéDÍõô¶2³®,õÞms4E¸·ÕVÄ[JOñØñ±ÏeA·Ç"ówÇã÷Ç&=gÉ=géO=gÙÏGK=}/)[o×hÇ=L]ßg=JUw=@.ä%?~/éC§I5ÕIåqKX<ä74]âîÂÊðyÃE=gN©¸) Qn¹ÀèîñL#X[ä© ÑøØ2«òùdl-öçèZ}ýêÁ-é40¹q­)¡kùL)¥XqÜ8=I?Â*¶ÿõ%Õ]->ëhÏðªÎp(ÝæÜúV*8$tòT²=MÙåaÌh;Ù½esÏ2í²=6|&=gÉ=géG«M=M`ëN=HÌ÷Ækx+XéÂÏ©QÞfíÂú6îB;åÀex/ìÿýªªC7ÀÃ)v¯¯ÙÿªøðvÃ~é×]=u%', new Uint8Array(96365)))});

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
   requestedSize = requestedSize >>> 0;
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
          "Data to decode must be Uint8Array. Instead got " + typeof data
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
        samples = 0,
        offset = 0;

      for (; offset < data.length; offset += this._decodedBytes.buf[0]) {
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
        samples = 0,
        i = 0;

      while (i < mpegFrames.length) {
        const decoded = this.decodeFrame(mpegFrames[i++]);

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
