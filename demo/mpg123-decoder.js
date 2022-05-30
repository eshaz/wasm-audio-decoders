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

  if (!EmscriptenWASM.compiled) Object.defineProperty(EmscriptenWASM, "compiled", {value: WebAssembly.compile(WASMAudioDecoderCommon.inflateDynEncodeString('dynEncode009cÈ)á±ý¨ G.º]yý!Ñ:Tk|É_®¸"Ñ3|¾@_GáXZüT[å_§©½Ì¨t£52LFÛ¢í§»ÔÂ4I3=¼N5ÁR=H£=HÈÀ]a|4E³8{ê×ÃÒeÞ¯t=H£íSIÈÖB»ÕI=J£¢L0Õj%É,ßl~¤%aMcfÃ=gº3=ggÔ@{!hàg(õuõh¸ÚÐýÕ(a=M-µê53>Ø]/0¨(ðÕËöÜ¦ABÕîÙA8ýòbC¨=}°¥ÎÏÅ YjBÝÀ¬½,ßá¬áMn>~x¡-ãÍò8,¯5ä.Ï}K[[AèK=@ø­=L±øß]H=LûdéÁS)xÒ=Ù~½g7=gçg7÷RûXÃò»+GXLLiwëB^ »òºs-@·z·ìkä¿5=@+/p,_&ZHÓn/¹ÿXíÒ*35²¾I~§d.¸eöÉjèd³X¹=H»ÏÉÏÏ¡IGØnS<mXÊFDÙõÙC«JÔ6s=Jè ÕÑ_4p»+ú·©ïhdIËÄBæçñKkîþ½Òé&pá3+îùAQ=gpÂO6»·?GæýHúAÒÔb£hâî¿Æ÷þVÂ)bô.èæ¢F§¶hX,»3òÐü<<%¼ñ:äkTa±½ÝÖE@6A¤ïY¹ð-åHKðÕç-éq|LbVcM0<³x£4BÑt>vÜxÖÎ$~å»qqcû`(¤&ªÎ~Ê=g¥×q1cÃKNSÖN@­£+$D¾ÿKò¦=@uÊ¯ëè½;ìñ;÷md.©i~äkØu-g².ºÄ(ª)hPB/ÊÎCày¤ÉÀÁÆ*ÊÀYØél^-å+¸=HCÃ3êÎC$ÂÚW@(=MâwfC=} LYp%yì5Óé¦iÁù¡-(îPèõB=HðÜí#N%".ª-:·ß=@U=IÚênÑ>¼+%,;¯NDÍgpänð4ç¨ç,õE£D¶mRòN9=}±³ÞÂ£ñÝ£ÃûÓ=I°C5%ae¿ÚêFÁ32ÄJÂÍjOË=Hi²|màWïTKD<Tæ2&É*Èð7FN>&þfòM"R¹zÎÐwá2¡¸¨î«Â ÐHfK¾§Zt YÜV¡EåD<@7¨U²qéq°íhÚnpo>³ÝôËóùà»NlÚÓ¥6h°ß¯ù >®Ø$fKÁÃ¨p=M=Jd&VH`ÛÓÝûaÂVeàÿLÕfóÆÅÂ¢!éYï<=ïæ,+ÂÍ&Úö©P{~À¼¢c=g¾}<=Mn³E7òÿ;r&yÈfRò%C#roßà¥À±½ckÚ=ÌÔ>=¤¥@Dà=L.¸7ùê}kãIÑA_5hõÝX¨ÉÀªÜk/Ø3àÝ¨õ¼%¡¦67Ñ®JºP<áK95 VÊ¶êÑrµ(ZÚ¶=J=I0è&OÎëìdðacÁÂîa%Ã¿<ÁláÂóvÜµý¤:Y0uxx$¾?`+nx¸ØhêÍÏ¯ið1´=J=LEÀ?=MnÕ=HÏu?´4­*HFåKe¼Vù/å³0È¯.iÈÎ²;ÁouoZfÆÐùó]O¨*ñ8êIÏo½cy6=L°7¨.ÜÀCãrzø@¨¢!âÃ­ÓÆ%õ¿¡¨2c¢´Ù7v÷dð¢TËá=JmÉé(/¹ChàfgÈ#M4¶a´2Àáñ=KÕa=MRM%ÁóØêCb®ÚÐýå]íÀ(¬éªeêön8°á±úµ²Ió9Ü:=H¡f,1à_9½¶Öç·.Áhæ_V°Ó´¡<c!=@Bu´±²iº=Mxãv,Ð8:â©ºç?S?/5DBû_½¤mÏ¼ÇÔ944G]¡Óo½^u7â¯=Û}D¾u·gäÞòÓ~¢øÄæPMbâ|~¸uUíi¥u ~þÝ¶JÈj#OúvQáÝ£»ýÝ(=HíÒ5BÚm¹çbüeTwØáRda@÷üÆefÅMJB¤¸"mêï=JNU=@>ÅRÖÑåµf}5½&¥ÇX6è§ÿEãD¡¨+âAw³1µRäiÍ(5¢yòÌëªì=J=KúÐá#Í=g§Ú=gù¢0AÚO,=@=MX=@*üE_OBY¾xÎúrGÂñVxãaÈLy*³§¶ÃWòr=} ¥_#AÝ0"qÕ$~×­ÌºÚ=gÿEDø/9=@=L0M´íR¿ñ»ËÔm¢öj0=KíA;òÌnº!yòð´RURDweLÇñ2~&¬>wý(HÈ¸¸GAg¼h¯RC=LpBÆ%v·¶ã6s=}ÂÃ´ÏþH=IC=I=LíÄ»jÿíàø¼ÿáÄò~ò°=Jù@Õ=I¸áÀÃPåÝF]~d©6ÔÀÉ_^eÒ.§U{3åùm+ÇÙVÈÇ#s=g­`ÒâSH7íñþ`ùVòò$gæÕ.EØPNðÚÐc¡õ®)äg]T÷õÀf0MâNdUXDày=Hþõ}HÔ¼Hí5åÂB5Bõ¬_ÂÃ+·fDvÔ[?ÿRwA>p<F¬ëð¿ÚbDßr¾(òZùÛD8ÀâDßf@ñøÖvuQïÒ-aáEpD2¾âÛDL 6=HÑeå)&=Jî:öj2gWÊhQ¶ÈÍuÍõ"ñÔ0°©êêìYð=Iñ;á<Ò=b.vÉQ¤¹`çÆøkÜ Æ¡²çá=Læ·@v¤ªøÆ!Éöc8ç¨´]þþ)G·h+E@;=²«DõU÷§>ºN&öÆ½MI=@n"mÈUßYYÅÔâ½W=ÜGÜàÖ&Z5xÄË¯0ÄLÒÐklæÂyÈÅj÷XLAj8ÆhNÞËþÀðÔ)U2ðW¾Ðå²PìWåàßc­è&]ì^Å0ÖµÑ 5?økÊhã¤Æ¸ÚÑË©@î*=ØñiA6ßM»%ÃmRruÍÑm¸©=LuQ´c?¸ß*)Þõ©ÅgÌ²S¦}=8a=H)PEåÙz÷HrS©ýÉ*Üá+ÎÒ[wQ=}M&=H16àëBzÖRdåÑ%õða¿f¡Í·Ó%=Ig´â*¶8õ=}KòÜAHyõ=@_B/JÝL9 ]=H¬(Ö²ØoJ?6vÍkõ¢úþKC£8gYuçz/½òoå}·ò¾ÄR(Þ¯ÝÊL±vw=}õ¹6î¦ØSq=ID[©=I=HE~Ý<=J¹­ÂÁÁrG³ãª¾HAÅàpæuÅ%§}«éÅÐUl<ßæ¬¾¹<4}Ñ|Ïeñú_ÜøÛIãRÙÙwÛWI¯;GëÙEjÛÎüvo=KE|l÷[zoéf¨=KU·P=J~£(EI£ûúc»tF·ß#=}þ/Ózl#å]¸zÐQë(p; Që^×êîØ´×©;¾XÖMÈ5î(EceäH­wÍ)Ôìµ­¤=IþÈm=L½]ê&3êQ  )ÓxI¤ =MÕ£éòBºaÅ¤<ãDý(D¡¹î¿E!GJÁì·<®ÂØÜGMp+Á­<)Tý§¬©´¦lõH=I¶Ì7}UÌÜ3ª4çUÎÜÌÜ7£hnÔi=@X=}+èÑ"=Lí«Uä¾bi¿35â××^Â×dãWÀ¡.éÄ,]§,a÷A)!)»Ú»îoeX}¯N7ª,Ö=IÆ°ÿ4U!#:NÄUSÄÑÏà"ë7[]ÈÈ/{ËeÆädó¿d0à=Ûk#å=I[zC/%²ÌÈ,&ª3z_q¡l¹³Ñ¡:¸Öø¡Y)î=g¼$-^×t¤=ë=}ªëPBÉ,C&e×¢<é=@/}6Qºbè@=MÏ¸Ú`Mgñæ3þ­÷A)@ËLÕ´Þ=gæôV¥VàQJú1ÚÖê5¬´bM£z=Ç`5x²ç!.¶ÓkÃ­6=}9ÙÓëæüö¯ça,PÝnÞNÏ9Þ°`dY=Jè¢LÙ¢8õ}d·6ægÚ/úbÅÃâº:k¯äG.@Ê-Bltj8ê*ëbÔ@9½eÖ}9Ð}:57dwº¶=J­N"/)=J-OgTþ»nf¨6g=M)<6ÃyÃB»,Êü=}7I"f1kJ/cjN#áPrùáq²ÉE¼Ö=JmÎ÷¥Ç¡{Ä+y5º$ÜÜÈó²ãJ8Û×HÐÉ#î®g%0=@2/¶¦"Öp£µ|¾#=g¨=KàÜáôê=@qªe¢»WÇw4I;ì=KÂñWæ®êåXWÕCËî·u=KÎH~æÔ~·ÁÇê.0y´P¤ùdÞÇK®èTæôä¬ûÁÐK¬ìÍeAfû©u½ÍÇK®Ú*3Ô!³S¨)k>Zj.¥ãÑß580à¨E8oöö2=H%Ø³¤@k3}ßl¡2G§H¨ôêôÍØ=KMÝÂÌA Èvìd³Ôò=JL1ý=gx¾ÿ¼`yâÇ=gäKÔì]¥²ðÜOÿá9¶#`nòF5ù¯Wï¼=M½ñNAÄYæN¹qnñ.kNÞgAvÁx%^µÇF%òBÛºæ_«çËxÓ=H{»>=J![[kéÖÀßôåÄµºh{ù:«P¼aCzcìÊÄlRk{Èkjó:õu·m³»Kº ÷3g1ylÒØqÐzÕú=J«Dÿ©sé=M·_§ó¹¦s`JÄñ=IãEý©Æqî=LÇ¸¡@390=McuR+ÖÍX<ÿäxÿu6õr¿ON£híè5Õ=Mæíe7ÌÊ=I_búÂyd«lèÕ`d=}Õ´=MÉEèWEÅA2ç!§* =g[Wf¹d*Nr´ÙCwýM»íÇµwÎÂwj_8"¯õæõ¾r=Û)àÈ°H=JÃòê=yÅv=MlÜÎ£@änFÚw2ê÷»ãîúG1ü#áK4dUþzT»,^÷RvB6ÕµÖÕã§M¿Õ71euä!ô§ª?®T[¼~=ò&Z¤«t»çqÜ¤pÍÂ^*ÿ×¿üWh9J^=KSiBÛÐUeù?Ð;¹}=L1;=KYá]ØnyÑåÝx7óË¥ªüÏäÊKn°FgJHÞ©ÚIÿ­ÍEn=gä3úPiUãQôå1ølSb`ùÖQwiÛóZSm(Ì·KÁmòY©s¢ØgX[óiiKx?5éBPßOçTÓ£xT·Øù1ÿ-Þ¼®noü7ª=M3v¥}]©%Gî¹ïu@ðàr_ké@Øi¸%=MÂëêö]++Wc¦.=HÏ=gx=HÑ»«6}Ü¹=JJùÑ;·ÐÞálWUUlW6kª6ç/}ÈûDh<u°Dçx=H·Zlì<qxHCqB;-Ie6=ÈQx°V6»ÐAÜiÏT%6{Ì(D=@±4áöï?ÚfsØ=gÇñi©6¤=L:VDWbßd«6i@Ö­^6ÝA¬¦ðF²¶Ð³lé·i×l¢iõ¼ÔÖ)r¦ý<uÄ âiß)·Ð´¨ì»lÝïäÛ:$ù×¿ëjè³=LòÖ³Oo58/Ú=Jjé;¤=BßÁÜÅ)=Hè[¯ô-=}ñ0é».ZÚw=LÐAöô=@v"Û[¢æøë»¦0©ÝiûäCC#ßSÞ_;êµvìç»«®p³,GC[®¤å_ûøGçZ8ßè¿ºJâìÅÒæLXBsöH¯¨ø¢g­Dúãù¤ÉÝÜÖÝµ9p¶zs±=@kÓ=K=J=Lè©¥â¼à­m0es5epD©658Ì¼¨¶¶=}Á¦G$¢ap÷?_rMD¦ vCâ·3zo=L¹Z«NáH|ô^¡úµÑz!=KR§=H¢ËúßX²dâ)C=Hye²óN^Ì rá¢çÖ1|õÛâ¹sÛùèCs¿wæJÓp<¯IAçõLäªþy×¾ö£UØ,KqÙStëÁÒÌm|aä,ó³Nð¬c=g¯µýÜ´ÐÐÞ~t¡&M]¾Ä#éi*8§ã&õ¹W#r_ÖÜª_S^rAÉ_Ë¡Nö?µ¢ÈâþýÜ´ÐÐÞÇ<ËÚGÔ¸f|oóè©¯¤MåÝú¤@°P0l¥¯1ýåðá^Ì òàk4¬o4jB¾2ø£ÁÏ¶f¢]³=HË,ÞììLá=g±¢ Ýß¿P=JC©È²;´¹6ô2í¼iA6l8¯Éâ´¬¢©)llO(¢f}æº=JZªälí#äPýÜ´ÐÐÞÞÞV j<gÅÙHçª¼ÆÄì¹6±¥d â°Vq.ÐÇTuÆSs£þd&FpáÖrë.ª²éÖÜ=JÜ.OlãBù4eí»çAþSeYÝrU/~2ìÀh:=LâVr1ÃâUïðE½g.»*y&©6ùÜrHw+N=LÛrL5tªÅeBHÆ3ÊÍìrSÙõ¤îpgØd¼³ï¶î&Îø=JTP=LîÎúîQÄÃ¤EÈäÑ|=L<Ù]så°#óóÝÀs¸V¹ -à¨ÚiyaC»V0/$ÝwkÆ5=Mdíº·`Ç!ÑEz¢ãvÝ/%Ìyâ¿qãç6É¸ëj¸¤!¤!ËÉÙÉgûô¿ØYþ¿ØaÃ´àc=gþ8´IQ#[Îl,¤@"´þzMb2cº6ö?zt8ã£¶4¨fÛ6jX4óô{=JxyÔæí¤èPo7Î2-`PQrb¯§V÷nËêA£Ce0Ç%åñ&=KÉ7ó[=Lí.=K°ÎnÕø®Ô5°U5[ù}Fdºßµ=Móî¼cmÉr¦N©{)__ÑAáDÑiÃóÙÄöÏíý¿6fÍû¹Æ¦ìîT}¹}ä=K|uq¸ÇîIk2-=Kzéÿgé3[µ]v®Û=JÐ®ÖÐ[2«#¤ü=}µPàMH©ÂtA¯ÑJs½ÇüP?7=LÌ?ÕØ£»(:®És«»Üc;9Y{¼¥d ©"¦HâsÖé#0¸éùVçôáÂ`b]¾ð¢ÇÔ>ºã"Èc¿È £ë0=H÷]=@=Iu|±Ñn=LTÄà*=H¨ÝT³Óií =@®÷ë åY®cì½4Ú£ä¡Æ~NÛÙEFÇÚ_¼Å%îUYç?=MÚ>kË=@¶ªét/ CFS(¹Gä¯=g)ª$Å¨·Ãf¸Æ8ÉÕCîQ Q;8]J¯é Å»$û3ùmtnA+©ï¶àÆÓÎJV­*H¯ÑÚÖ°ª¶ÇpüsËP»Á/J7DÇVÊ.¯¾9mdYC·4Õ]ÿ×=LGF%Å´S(H-£{µ¿"¢Wç¨u,¦þOïWõ£þö­=}h|WÞ©Ò4~õtQ1ÿ©dÿUâ.=Kz h*Ö«FZ÷{×o¨½¢ÀG÷<Ì¼Ý®R.>©¯¼TCY+£ú·µõ0 Í²Þ®ç"<®ÎÎ4¼ÐÁíë0¤=I­1Ìª~Ã¹_m!-=}³Õvaðywþz[£=JspEïÕC¦Ð8hâc´ãâ5Ów.ïp)n÷(&?NEk4æÒ08rêXaðe:áóÏê³±é¸êPôjJÃºRþcÚÁ¥æ:iÎ¯=M¨:xÙ=gÊÙ*G*¿éÕ©cÑ9NJ¶d/ÜÎ|ö=HÊ·O<GòÙ3jÖ¬CS«ÍýÍÀe=MÖ¾ÁX¯=¼?Ü·}déF|ìß+2(=Z²þ3Ö^ÌÚß±9-XNØ5£Ìè÷µBÙÇe4½Lû#=L4v¨mbSBL·jÀÅ?ÿù5¾Jëæü@º­ðFÎbnê^|è4VðÖÞª;paxþÖ&û-*ÍÂíÅMMÄï*>{S5äOóûC·mä/EHOËðâÃuÕÜäÎµs6ß`ç=gdæñpÆi&Ð{]A+Hôª&à]$·j5svCaiÖùé÷u¤Ðºß`óÚ=}Éb¿3w.ðEa·I(>~IOcNJÁë.Ï"¹âòlöÏ]_=h.Î§£È=MÈúµmw(="ã¾«FÞ£VMYÚ9ÙÂqÕ6a±&O×l»¸M(8Ì=Iqxí¶Á=MÑ)±Éw=I.=MÚg»=@GÒÔ=@¿ß!l{Êð=KÊ§ÎÄOóØVÆc&°ªØÂ.%Þ«uàµ¿î+î¬F6=Ø$C<=Ó³î$ìÏkK¼ç}´{tïí;¶%³¿;#q[Ô=KÉ({¶Ò©ÕqÅC{c¹mTA =M&¯×å»µ¦ÈíÑÆØ«¼!ÏßøÛXï>JáOÛ-À$@=L1rµ.(¼1>â£jß(@c^sÏÈÅ[êvÀÐáò=K&<²ð{(ÀF´å=IU)Ô~5TõB8á¶àcÛá<³[¸¾Ã¾M{+ó7$?±[`mó¨ãT/<ÈíµU2=}¢è²àâ=M¦sOíI,oë9ídQ,[ögûä Îè«k<¨.EE­=H@^OHÌß÷é»¤æÅ=Iø>Í?F=MI8½[- g8-ÄWÔÀ9#ÚãÖ¸Ü=@jHýt§ûÙ³â§¼ìçêBN=@ÆÝ|uë ÄïÌ`eðS¢Â¢|rÏºÎ,ë¬=@uûPk¶ý?(TKá=IöözÛ_9Ý{Âþ=J,°è)$[ëgÑÓYE+n[ÉÝë»ú¦J«É±GíYÑ=JÑßúÝÕ=mÁrÿÇ{á=Mò¬GòÛ§<G{½Ö!F ÃH}ÅY-Yt-+­ØîM8{ÁÊ{+D2þÈD]à ~ä°kóÏ[ðbxóñêð[T=gÄôzÃbIÆ~ÞJaÒ+y Äæ@q¥ç]XSÈá«°-[ðá>#z¢(6=I¾¶¼¶ì§^=HJa.UÊÊ~îM¶È=IÑmxÇç=g*99ã´ß*4ÝaDvÈïCS6?ÜuM>ëÉHHV¶þáQ5;å¼mØj%÷8í6Â=@¾=Há¾Ïu`ÜÁ1Ûa_ÀÌ8ÁãgÑ?IR¹ùwÈÕä?çæEvòWÀ¼´ro/,ÁWZBøÙ=|`2?=Kê(ìI(>x9ÛìHro±ÜO2o³O/!Thx9=HÛcÏ^eYÜö _yæ~òxåBèdcøt¼¢$ÙgÞ=I-©LØQ³T"ÆÎâàVîSøaÕÍ³·#>³Áå÷áoÝ6Wf]Ï3äeÄ%,¶TËÅH(ÍÇÅRµ¨S¤=}Béæ%=JrÉ9fLÜ¸¢Fú=JÑÁåTXôÙ$ü×¼Æp-öHø/Ø`y?yÊ¯èïGµvôÄ²ÝV`Q=JÁ§Ó¥Yéù¢Ã©;½"t¼ËÿªuRèP=gF²R/QÐFé3,Så7T úÀ¹´9VûNÑ=H0öÛøZ«Ê@«=@ü¾_²·Ñjãr©Ù>!ÀÐ}ùGPºINÙW²e¼DL¬gÂdô%UäÒ=HâZ¢Ñ+$ =g÷ V8=}{0`äàm[úÍÜääºi»¯ö(=Ml"òDêY_ä×ôPG0Ñ=Hsõ+­)÷&´mÍÏrþ¥¯ß6©-àÒçõÒÈËð$d02Eþ0HI=K=MÅ(uøsIÉàO 5þ=}üSØ°ïúÖ)0=@ÊR¤µ=bNuþ4ËñÃãº¯èíæK³S=Kã2ÐÂ)SàÌV)=@k¯JÊ5ç3E4ï »48f=g%Ônñ#Û3L Äí·ø6êÕOß=LÐv ·Åé=M³E¶¦QFûAOà½·&<Í¯·âðóð]fpÉ=}µ16õ]Éþ=M?¤ß¡ÒÚ­.®Ñy=@=4M®ÃÂ$2({=M×ÆùE¹1ÖüKap¬MKÿ£ÖÂt´tÌrÎxúÃtí5üãá¨p*&Ð=Ùn¦ãO?F(ÆÿOôRTÈó×êÍT´Á^æY°-FEÒæd4Á%7.ÞwÎ=KIeÈ¸pSx*ã ömk"Ñù^H¥EÅµî.(ÈßÅ-h/4rÇê£¼r¯Ø¢]ÿë`¯Øµ®Ø]/¤: Ãg­x|ò¥Ê¢áÒ¬8´Ä]IÃTñò+1Ì ë1|ú)îtJjÑÂÖ­[¬Þ¤7ò¸¥(µèn )AU@=J.ë$N¾5.ªíÊïQP<ÏNÚ·tëîÝ=K&ù6ä2ýÚÑvÀz=I%8XèÁ­½¶-ïÍ¿#B<É[eÒµ?£éÎÙ¸»*Èt·}R/5Ûgh õi Ö=@w=H¿ùágw5Oþ»p÷(b¹u¤Ì¼g M1ýií³q÷®ÀÂOè¥Û­m¹o)E`l/DÃ]=`KyI{rª(CNfªëÜ~±»ÿ]ïNÔû@­ãÑõÐÔ~wvÝ¢oÿâX©Ûøoøy~ús@[¥C¤¶¸b·ð2ÌÛ>AäÉ0m0ÎÈZQÎ*±1-áôdU§¬L=}0§Äcþ:äRa÷ÝpQ®QPÖ¢ýÒ|®å/Ì7^îÐ=@§ÕÞQï~z«$A .Êôp=I¬9[¶ðuÊ¬1²¿öº¿{Õ÷ÁmBÏ(RÝ=ç® Qì¾HlA+íl¨ÿ¢:NÉ=Jâ½N=KÞ¿×$ÆLxA$@øoS|;"[i,µ"Àî%Ý¹¢Iÿì`<¯îR×ÇPNÊzÚÁá²Faf1­_Á»ðM°<å5ÖÄÑþ¡®éln ùå=æJ?¥V_2fQxøféÙ¥ïEùD.Ä¯çaUätïØâÇÉAvÕ>½oAröDþá±!`læV4=þOwH=¸ÎÔ©5ïüsçÔívd´Mº¸F¦½ÕK­|yÀzâÒ%Éâ©-èB¯l1Õxf;;.XÃ6¶¬ç7:óðß?àÑÞpKðFí7­1"D9¶1ð§íå$á)&Ñªí=M$í)N¶ÑÄ·>)Î¶Ù>è$Vå>RèÞËjm°Ûï´rÏ=K$U¿1D2´>¢=@À¶~µ>=J«ñ,DÊ³>!&çpÂnÀà=@¼3àI¿ÁßpÜ=@T=KÈÖ¨ÑD=} "Qçc#|«èYeOÃI%Í]óÃºÑÂT|=H&aÓ»Ñ_V÷Ãj~~»¸ðñ§F;)xïÙDJÄë¿OÚÉÿÛ(0L40àÔwÃb³:ÍµO=L=g^3±qcÁÆ.ñÜIãiBÄnUiG7¾rp»Bþåuc=g<>¿½v½`ÎZi··DrÂRº§õâOD=g¦½ÏÅ¤e*wtë=LC1=gJ$ëÑÏt=MK=gÆâÒ.N¥w|ÃýÂã~=g2CÅä`_½Â-Á¨7/wYRê.þÜ¤²­CÓ"ùßÂÁc«ì>i$=gnyqA×xÒ[Á@÷ó÷h²b7^£·©:ùË÷ú.M5u-gù¹[ZéöÇ¦-û(Ä=@ÁÚ¼c@=IÉ²B[Z²pig:ÊkEÓa §{ =J=JXàÅ)³DeåµGËo-Ú=L)2=J|Ð4ýZ=@ÙçwÀN¾ÅJçGV4=gqàÛùùæk%P=HJ·P&ùZáÀõ¤¤ÃØdà¨nHy=@àtîÑNs=Iø¥Ø`¯ÿ L>÷Äb#=MòM.ë.Nç¼È­ü%fÐ=MÉ¡aþÀoL9ì£²ö0eÓuùb§ðø¿õçî±,nx´àZnADÜ¿uÇi¥$Ìáæý?P5ß&æý8û|UaÒE=ßâBN¡$±¥"À^­h=K§ålYÈ!¨QÚßø+ël!ÅQâ `²ãÂÇh=IÞ§,p"øÃÅ`HyâLn=H÷,÷=L?Ôä°Öú?þç4L]é­H7=@À~¿£dzhÖ@øÛ1â IÊ¡;¸?éf0C¸ì­Ó:q®öQ"WÎ<æ(Äd=@{³íþA>kÝç^`.uÞ+9¼Ü=IC÷ÒÌÙ$º&ª_`Ér-Ô2×=gø/¥â/9ÎHN8L¯×G7.ôA¾1ØhØ+f íX=H¼=MÉd¿`óë@¿*Ü©$ø3¼Ý-"N§=gô§éO[ë¯ýÐÌ$eï¬L(îõ¬Jq¼«?ôvåÌqäYHc>¼*±¬ézÅh¡è=HxCªÉu8åÛHÛÄ¾úzÃµMåbHD®=MÞÀ]ùÊFõô=K¯m¼9}©Êî»]&½KmíÉöCX=}rµ<äüP@Ðf!ïÍ÷°^álcÛIÀoo;ÌI¿ÎÝ³-zA?éÒð,éã¹>:Ç¯ò=gË]XëÙ±m÷FKá=}C¾Û[O9M)Ý=H<ßþýsÚ§qÇ¶9Ý$=J¾]´µ½GEÝ*°«¦õ(uÚdòÂxåÿ¶Ì9e^Ef»yBèPò=Î[Öìõë!_;ÐüÁ¯(×=¢ÆM=}½ükÎ½.rÁnÏeøXo <Þ±¨J¾Öòï©?p PØWùR&©«TiÆù=}"EK}Gâ²¡;n?6`5ÿK_qÅã*µ8Ïá1Rhp¬fe=@¬¤0"e=Hp2CÎôµ×Â¥Z=L³"íÜ%à"{sÉ:ÇQúøògí4s×@}4-R§&=K$O®CÇÙqC§] EïÑÕï¡g÷<D 8}L%aÕJzä§sü+ygÄé$ùÈUÛWú_ó­2#emÁ)ÕMãûKÍ=gsh»ßè~?$âXE.ß§wõ#PwØû=JeÌFõ;ªl¼³=MHñW=M+4Èoà?òH/-¸=HEºA£ÂX»ê*´Sá}­ßàJY=M±ÄS<=LÁCàx=MöÙ=ôÚ(çÃIî?¸Ñ$U[Q§éÂ¶"øæ*ÖÍ&_ò]}=g>´þ@®À=@yxûÊøY=Mî»o»]ü]X6épÃUuÖ#ñV`vÉTåØT½qÊp@©[ç4qdQÈ~¢Uþ:-dJxíÀjô´;±´ôm2ëðÐzuè»½´®:i{þP¯=@Í+¦vFiwÜÝÿo>IÖËóI7ãÌçª{R¾Ê°Â¥NÓ[}ï»|;Ú$=MÝ=@4;ËÐIÇOæÞåc(Nêi;º|Vòr Q¾1¨¸êÕÅlsï=Hª¶äAG,sÃ¶-MÒ%¯uµzdYÀ¹Û=@XÁr×ÊV,^z÷3pÂ½ÞCÉ¬I·Ú}²Ó¿STÑE-¨=K¡0çòîHã|ÊwJmËödxÉ1Ai0<+U²a·©îlß5(9±¦Ö°~áÁèí¥_í%>®×°1ô$æ{Ëï±1@í%©>®§í¥ÿÉÿ3­1ÐâáÁèíåT©:½ÆDD 11ð`øøVÆ-K@Bú!à¦VR3K`Ñæd{@=@%öX.ðSôzû&MîÊú:MîÊú*eû&%ìêÇ6ÔúÀ?jé²óTóxÒÇ=g}X(=JòâVÛÌX­ÇsX-Yû^!Ý¼ø-.ÿÛ,Y=HáôNKÿÓ=J)~òuùçßöÊ½H¯ú@é=@À=Mu=@ëm÷"LÄ@üd:&ÔYÇÖ;÷b4sËXqÉ<fP ;ÆÆ>æÛ^ÛñïwºBã£GYÎç°hz©hfÝ=Jh±¤óä"=Im+$ú(G¸Sý·ìVÚ³Ó3°Ë0}ÿjy¨^Ð_IFú¬=IÅÓo|ÞL.§¯W0^e}ÝhV¾Ã¨Ldmh§ R®:ÞDà¥;äÐÕYÁ1ÝQa_z÷Â5ã=Mó³@¶6Ó+ÞY=@ÑÇ¯ÜH+züÝæ£nL¨*÷©OyFÓ¸:FÊê>YéÈôÅ=gPt*;í:|.È=M=gÎnnáïeeÂ[åC-âªQã§à=æEAeû¼=IÆöy¶Õ¦dàëêê=HmòÆá%ßQÊC®y¶né®-DÆ"h4²Ótàîq:hcækQer=@R%`tÔ©U¶F1ª7tbùëÍ^qbÊIÒÓ÷¦j{_m½&µ6µÍÏïÚ¿BsvKbÔm£G=Kã?¨"õ±2ÎÐd¬¿¯Zøß#Ä¿0ã¢f=J}ö5+?«¿Î=}6öÐí)=¢QåQ=J5¾ûMPp®£Z«>â~_®jV¿vqÖ:ÒÍl³ò¶[gIY=Hqhè=HðÖiQo<=I©~BC6mßÁn×þÍg=Ju°!=JéµÚôÛlQYDÎJfQu=K1©eg=@Ke=M=@m áïLmÀëEkZ`Ú^Z¨ûcÑåÓiÞì|â:+Ä×q>0P0GâHÀiT½¨(¶H¯ÀÏXAÿ=IKe©´TX-!cTgX8=@=¾¹»ÔxrãÆ§¸×ñÆ´=L©=KÞ´=}UÝ=HÆô`üüyfulâÀöÜ½vÉwì*J¸p±V7×|6=Lº¿ÌÈÒdQ·?=píÓ%úv¡¾²P¢µh±ÿü®=I=gã#;ßö¦ÁnæâÕh¯íim==LD ê´ï;ý ýú2-Ò¬·(·Ð|üsApãK:C^ëË8O_@Ï}0L³8e~=Lµa½åB2ä4ÁÐZj×snÓÔÍ¥[VSLy_(OjéNÙÊÒå=Lùã0iBÆcðÃß±GÑèÌJ>ù£Ñ=JH·ÚE""[Êßbªd&Ý-/o/F2íOKBÏ8)ÎÛÅhØziýo­ï7ÿL³NWÓ²ÿÂ´U,*aÍ`aq;á× (Bÿà4æÑ6çF~w<^×ã=Mb¶=MÎÝ=K·gRÒDð£36ð¥YV>=J1§±Ôkw»-_6èb³³ c½:ÍoÉÚ=@Ó+[*]µ|$ö|;+DG=Lô¦l±p=LÈý½MÄÏ`½à«×¥ÎnA¥>LÙ(ÚÓzdìçíAÚ.)ú÷[Tw(*­Þ÷ÓàþVÍÞ ß =Jw¤]mÒ±DùÍaçi}u?ÓÓ&M´¡+[jÀþÇÂÇ)Rd 8+ÐÏh°¡¡ïpò8Ãõ¢öv¦sÿ¹~6Ç­s¦TöÖ²·!ü!Ì=µµìjÎBÑqÊ2=}æ?>¿äÕ¸Þ}_Ñ_aa=M7b=@ó}×çÃéJ³=MoGãÒýîV(gCûÈ[JåUáMz%ôÒQé=LM=HSáu6cVY&rØÚÿºÿJ54°ì40Åñ* óÞ÷cxñÊbwÄ³ó%"K|~Îæ¡<Õ6Ôú"º-=MèÜ}-~TKÏ@~}%ÏÐ6=-7yzOhùQi¬S4=}ïøh=KË¡S­Ù÷IcôC)xaø+­qiít5hÆRõÍÓå{ûJþ^³Gþ`²³§=K¡BíÃj40L9¨_¶ãEjÊ:$MV¾=HGªD¡RÚñ=Kâ¬7ës¼.ÏØ­¬p=M¦¨<Àó»$Ã=JäÖËåÖ³;T¯ÈáåvÍ6ÌM®×58,Ôµéãmª¨Ä¨þ¦£ãvéâ¯Ø³®`1- ÀO]cn½çúcG,¼0DJb=MF=@øÃ$WÙj¾UB"S¡¾=H©£ {k-öQ^zÕrUGónÓ=r>lH8gó÷Vn^=JG3=g|¨9æÎu+1WXHCmá¿g=Hb|o`´/A~=gÁØeN¢FL¢éé=Hxr,GKà4ÛÖÀÔK1:_{¢TÏK=S#âó|K![ñû%æé=Y¥3?§óKsVf~,»¾Û=KáèzÙ Ë´¾¤vÍQìµÕÆ¡8·4ÛâA>»éé¸­=à×®êä.}ÏEFOÊÏb6À]ÊÊ*¿6¸ÔÒâ6¯çÞ]~9ßÈÌZ¥²Ë !4mõç21#ÄNí=]*~üUÍN"rLQ¾IËnrö?W]Õa`,CJãÜÖÓjþøàÔþ¼¹s%Q¼ã? Ki]Í2þªÝóa¸ßXXc¿@=HH8HvNéþÀGZB¾s &-Ói)û¤¤¨ßîÎ½=LËÊô+àjH}ò´ió©@Äfó±"½x{ê®2Ò°·»õÚ±}®MË^übq"=Ii»ÆÇ=MÒÌLKàÆ I)TÉfÖ÷Ú¥CÈ"ÒUU=}t×÷²¾håXòo17Êf*Zi¾rü!W.½UÏ¨5<Wñä¬"¢²Ãw0±ííËâÀØî¨ÁÒÂ!O¦f¤Äð=L¡S²ó¬èS· ?ú´¿FïVñý;¢Ú0=IÛwJG"2Ø@,nå¹ióM;ÆJ|³õ¿ÁÆ$Ú³Çý=LÔãExR²{±-º_ê=L.9$XÍß}]G"_B²T)§Þ*DZáÿôIxÊéõ@ñ-{%p8wÒT%u=I)<Ü%}uI9Ñ.åEÐýTÉOÉµ=}R!v¸n´=gbÓýÌv5Å´OìÐ§Ùxv[×}ÐÑÒþ=}Í=g)Ö=@F;ødÃ´ð÷=@{õ%¶Ä·äY2þs9!#X¢³=Jüw|µßÌ(cæ¸#gUe:.aç§¸Àòcª=H±:n=L ùF7=MÏ+TUsh2yÇ`0q)À©]¹&=g)îY4ï²¢LDb=ä¨ùtVMF/$N:HCIÃvÅÇ¤on"úOÍ5þÕ_ëwH4ß:.A÷ey:Cð0ûfwÏW1wU73,0/¯*÷Eé!$ð¡Út|@À=I­ÂOø%«çBoñäîÿpß¹¸ÔPµà8´pmb©«ËC ¹NîÿS¯tå¡Ò¾ôÁ©ÎÃ¤Ø:q©H2±XV¦Ø¹k¢ú´&xÍkñò=K(´åõøS59AËAá3³;9Z(_·{a¶êËMjÎg·*JeØ®)+=M2*©ÝÐ%¶»"Ð(ß-(Üz%l:;ðí¸UsÖ¥ $.ã_F´u¿[Cpê=@EÅ=@ExRbÖ[´Aw¾®N´t*ýÎ¥ÿGg=LÓÓ±ÖtV*i&=}]}â»í>FòýTAeyÜ8V0R4îuñøõQýDIÛOaÆBaÞtÅJÝ]w~ªfbiB³Þváñº YYõ¬GvfÌ­U!_¥oÀü7ôÅ}QÖjbß²íÜ¹Às·ê¶J×ÖÈg=gPÜø5wÔØúK^BV½ghZõ.Ý±ªVÀ8¾ª{l3+uäK@g!ê{¬ÊszõQq]û.=M:+Í;Þoe2KÈ×hoàf|WøØxÍÖb[öfÕ=H"È¶ûj}ÖTXw>ÈÊo]µGQþòFFáGO8=H#ÃlñÂ=a tFFÉvrbé$Æì"=ØìmO¸t©ÒoGBZ°tÃh,¸HÒF¬ûg"¨åcé)çÂ<¨B¡d©àwpÜ:2~¶_½3|,I¼dI»éY_ªä7Í¼Ö¼Ï´»CÄÎ£U5Ñ=gèffÒ:{êqLØÅôB½cð«ÍØõ_ìFºm?Ùà=Ke¢öu½I=H9òtX<ñçxÒGuQwI=H8û¥FGfÙüñÚ~0¥ÿÔb¾·JßöØCkbDÁ1ÇåÒ?ÅÓ=}%p¿Ì=}æè!ÑrËÿ:Éò¼¡´åRÐ²ýÓ&úM¹Û¯×ÍÌçùk]yØ`÷UzQ±ÅÕ,¨Õ½4>ÒZ°_îøÖX¡©à¸½©%ý5F9áÂ¿¢¬.ñ÷¸ëÓÌ%Er¿;=Hé)cM¤±¾Ùµ¼Læ´iQÇ¬óþ»=LELáÞÖlI²Ê=JÞ¼d?è0ÂÀìQ¥)52:ÑI.7EüãÀíJûêßØ¢øbd=JÅ°}0ßJ_=HçµP<!{=K ý¿á(}Á(Æ©hþÎk=MCoL½±· +oþJ"=I0-}oýKÛÝÔÈ÷ÔyÅÕ}°òý5ä¸sjçP­y¨UÊ)´ÅITP+jÀiÞÙçÖ$>ó~nY¬3dd Ó6ñç ­ÏîU!p~®LrÁÿ=H¥uÌ·ÑÒhd"ÇÍZIt)½-à«àrvêdÝÈ9¹Ã¤Øqóúçó>=@ê^®B¯èéÖ©sXøçrX¸£nÌxÇeÔMËïN=I.z;²óNãÜ&ß¬ç ]n&:ÇwØÝ:¬M02ó a«Ly¯Vnå½C/-¢3¨C.þßBXùÁßzâd´ÌÿN­¡8.Ø1×¼PÀ²Í§¶èÃS=LöãNíf+ãÒE®¦­-k[£Ae=@ t»üÃ.¶L/e5=êÀ¨Õ=g»¼ä±E)üýÊrýºú¢>^=@¿ÆÍ@2*Ëü¥TZÏúÎ]f¡.p÷l.HïÈß¿%ëÈ7@j¼<ü³£Ü@hÇôÅye¢ü¦eFh®ð|<÷ÏÎK^Wï¢:UV²Í^LÔ¸/úöh ]Í¿î#cÍÄy¾v¢áÆîS&Yê,} |#-a4:©H £õ%ñg!^àÄcxjZ(dÅAã^¼øWÞ3uÛ?=I³[-C¦Kô#ZùÌ£=Hõ ¤U¿«ÛT;aÛ0Q`ýOG¦{¦=HÔ)4¹è¬=JaiO¡þ|É®beüMFVº±æSo?â÷Q7T1¤c§Ü^#&;=H°=J´vùÂ{dHÃoøYeèÄ£Î}£eVI7?éRëkZ=Jêª§X£q¸C§ÕÙªF>j|WöGjÛ$d«ìò¾Ò~¬òLcN8 <¾]ÓU»A^-Ãæ·0máØ5Cé(öÀ>Ó¢zØMá;Mþô]Æ"ë=MmãúrèjüÂmæÎjhKÛ+à}5Æ{Ú­ÚRô>wÜ<wL¶4î=eÿõ£/ht^=HwGièæm£,¼¥XØ=ÇU7äiéÕÛ¸°ré`?uBÜ~kh=J$d*/°=MÊðKOÐ^4@q½ü/sî=KA;GUrøz=I.ãùöó$1Bä9=¶xI¶±ÏV¥½×òMn1FÉ¹=}xhMO@g"ùÏ~Ûdú¿nVô@Dìwí^?.1Ç§G´eéùÅÄ¾î¾ÙCÿ:U7JçG JèrM ïj¦>eßè¢ô ¾AÿXç¾§!C¢íñç¨ôG*®wÙ&&Õ=}Ôã´/³È&õâ¨¯Íh&§¬_¸¸/Þ¦®|­¶f¿^úÜRK¸&¬S~O¥¼< °éØÌ¨äÛd&Âµ/m(%@âÉ¢cÐsý+^Dùx«ÞÅç-8Ûj4çÜÄª¦aF@tÂÆ3ß¿»Ð@t ÒTé=ggË¬ÒµÉ<âÊ=MSÀxoR!ÓÄ3[9=KÕ~?vÍ|iÏD¶)âmlÝîð×IÚ¦1÷&!Sð¥´STJðÙq.Ân=KûÒëZ¨Øº:9JKe¦=LËìº÷s^."P)JäÛú~¹Tó1_õqóLÿz rjâÆ:aÕ=I0åÁûHL%r8«®I¡3Ùîj¹ÆÓXòª·ïEØäÍbWQ¢üJ=HÊ=M¹üÞÔ=IËü<´/EÝâ:±uN^µ<W~ôU}©=J_3eñòª0ì9æeà6C4øÒ=>7F(=@¥ú³¨5Ê»Mx¬_¯÷ªTe¯m×®BYlß|)Kl=H/ÚßªCû&á¡¸ËªLÚm·xâÓxd}HÓM®"×¿Ú¡Èga#7ÀGj »*ÌöZ&´âÊLy¤Ðó=gÇpLóÄÂV=gU¹=JW¶NAkãÒ¾ÜE[=}Ã~ë=HÄ¶û}ØíØíÇT«K8=}ó=}È÷Ý£à>ìP=K¦tÕpðs¹êRFytÓ÷J÷XÜ)=J»¦i2X­âX]Ô#K=@¦Ic2~[²;9¯K®ÿM%IÓ°~=IÙì=H¦LAn"ä:Q%EkS©Î-ô÷)$Á8FÙëfÞßO>Þr=I¨oQqÛ6ÐÆCc=IòNs@õï=IòXäuHxì¯½Eúç®=I>ÃÂP=HÄúÄsÔeÒ=IÏZ@%xÂbZºmÄtLÓëÓmà=KÒ^aà<@£·3&Vjªº@ú`xøåbÅL}ánxäñT~?:{_rkE/ýðsâAR»1výJ)ÍE|¶nQ=K$-=K®FaPÈ!& Z#ÉðQGa,=MRø]/1à¤ÍO$¼ÞÇMÂ¼/¦N¡éj>Bñ×6¾t=I=gP0B|=Jb$ð9Èò(ë¬/=J-I¼¦_y£iØæj^=I:mÉRgPÝÖ ¹_ÝXK=Hõs"ü=M9Ù±3¾s9ãäïé÷Éóó$­Éç-¤Ý±¶Ìß×=@¨5â­§Q¾¦@Ú3¨=M2f¡=Jî:=gª³ g¨P_ùÀC¢ëçàaõïÅFn=L:=H=HÖÜB¸Qc±à÷S4?9xÀ)KcëõÛØc=JàâgùÊþu¢Ñàá>ô¤¢ïer§Ë²mdõÇê=J+¾ÂühÐ¶svÛÉVåñ=HC÷8@TZ°~Óºù?,Hs¦e=L~p=gÕ=KfX^0T»kÛ®p=JmÂV$É@¹ÅøÂ¤sÐø5ºás÷u7ùëÇMC52`Ò¦]=ímÕïké0ª¹ús5iøéP=H¨2m.Q·#æf=H+7¢B²B*¹,#.¤j°Þ}÷ Ï!õQQ§1]é.D5·¢iüß"Êß¯÷=giuÜÙø°"UáÇQ?âÑS6=ID¤s~Ù2âÊrYNË@Ó5=LçZeÚÔkE=J¾7ÏÇrìÉx÷(fOpZù¹GCÆx=g=LÂ/£8øéA°«·Ó/&¹àQ58=IJb£¤ME$,ô$¡k:&o°ò±]U¾¼eyÉuELôê5yøRô£Ê:w=H}ok«%ÂÈ&={}ÿä¹OáëæÀï¾Ö&Ám²>¢&S}¼} àÞ*TDCÛýP±H¤Í=@°TôgôHÓ|ä,(2æ3zòâöæ¾Ðu#,;LDüHì*6ÇT­÷¤vÑL¤à]ëü´JG¸U=J¾4LXðÚ·6µfYL¯Ñ<©smiºbõÍ~éçkYlMÐ}äÔ{VÐÔÂóÁ1ÁS}Ù«Z$â=JúÄJ?g¨X¦éÍ=J=Ldîñó»M.éòÓ<=@Â´ßä®=}°EÂ·«oïý°âhE©¨f2Ão4éÂÆÑÒ4ñN=H¤Ñ6Osn#Üîô=H×7zéàK0|°!=L/=K,Ì¯^^Ù=}j=H>O4e(ÃÞ%pBQ¬ª,F§¥Û{Vô=MÉy MÙqÒêV=IiNKÑéNÔ¶ÆêÍ°ì,-ñR§òÃkx^Qn[ïbñX§ªïWÞS´¤G¶¨¢ ]?q+=g¿âÙ`ý,F½à2|ëa«¹ÜÔ¨LÛxYM«E³yä{Y©ç0Mö6wZ@ÒY8ZJÔðyÌ-UK«$_,¦W0ßbQÐmW0Çëk~=L}öè×u6!+ÖôFfE÷Vx0=HÕÌ^[ùJ=LqçTÑêJFWc¼«K,øßô9b!â¦oXaãØad4é³ßÿú]¨4t>(¹Jõ2r=Lü´"AÉíLk]#0È¯=@£é#1=gÚ969§t(ÌHp¾X`úµÕ=L=goèWc»GÔü&kçþþ=Kú¡Á$ù=LN=}àÈWTízjÕ­eô_C¥!FU¼íu¤=H.OÜÛ=}l³[lö¢ÖÉÏE0+¯¥æ¬ç×g>ñôÌ¥Ïp³?Í%ë=L¨G«Ø¶Èÿ=}þÖÌÆÆ®Á~µ UÄ×WóLÊ¯=I§L¤t­û!öY=JCúþô²ÓCczþB«ùg¸Ýýøâ¤î»S¯b^w[Âþ¾õæ.}ÞrK¹s4qL$¿çSTJ|~Y!!ìì´ÇFRX°5dyµx5O~Ü³=J[ã¼WþÑ÷»È7Çx13¼?Tzßë¨4åUeA@¾ÔU¦eyÜé«rA=JfrÝ¢Ûs¡½·H=}sÓÉ£õÁñKMB{ék²H¼+=}Êd^hÚG«K%kz?SSS>ô=`°Ø´«Áp=K¨Æõ",K=JõLL+=g»Ä)Oãgb=@sGKNèù<¶vvVÔê@z{tÝÝ´=Øø«¸A¨yAçãwÔ¦dÉ[7w=K9×=MAkkÛM=KxNÂøKBAËÇû6ël=KfÏA(Ú£î2¢=HÍ§ÎÊªd:ôe«¼=}Å¾ãnÃq=}Þ&â=}%ÿCÒ«Ø=Lo~·:=Ig÷*VBÛÓÛÍ3|7AÎ";%Ç/AA½ép©x2ñ*ùÖäØÜ(øDÖç¶Èl?ÙÀ35 Ïx1$~J:ÙY´ÑKùÓK)n¨«xUþZê¢a»VÇ}óm¯{&hcPÊ¡h²ä=IWßSd¾kÿ·=MìgýÓ6b+éÚt=}/Ó&g¸M2ÐFºKÛR<µàÊ=HmâëT4H%ÇÈ°u/«,¼æÒ@æTw%à`)àO³Ww´éËv=LCnAÁu=MÙ°d"x{«J!3¸YÇ[-Û4ÿoY{û×áÚUûY[À8Ë© =}=¢¸´}%A£eÐ=H­Ä¥4 J{G$÷@Ïp¥ø}°ñsÏ¾sþùÎç£UÏ¬Ö²VÒTUº"«ù7Ç~èè¢¼Ô¸Qæ<Ï_ëeí²$ª®¸Bñë+yëh=g´(ÌZñRIl.ÁúBÓzÓoÃ=@gÓ|=LYè;Ð2}Ìß^c°ú1J+¿rþ?Éù¤N÷aÖÊù:ñÏYØE_¹§ºhÁøí=M/ÂÛ¯w¢Â(]"ß*ôIUÇ_;Jñ~F_¿ciTYpmPê2ÅÛ¯;ú5oÉ7m¿F=L1áîé=LËQ¦dÑFzÙ°ðòiIÊYO|uov~È´OW[õEOç0ú(3Û4ö»þ>-íWrRÉ=KIsÛIkæ¦2°ká9? JG?%³ãÉ2«~T=@ Ô!4²ÒôwÐÞQd æ?¶=@²EëÁ³K|_SkF>r=MX¢«½íçÚ©W^»Mÿ_hfÙ)ôb{*[èv^ÆÊ©êö=}½µ¸v²/jªÙù²"%Í=}÷×væúñ_m=J=M´tÝ¼JêÏË±mÇbÊ)¸ísú}ßxùÌþú}.­ ÙÜî|þ±p=gÏXÓ.ÕýÍ_R=}U¯¯¸lÃ.¤Èuµø+z¶ÀÓ}Èohr:O!"mÀØ4"MêVKÄ·O#|ü-«ýn8`u1ÕN¢+k;NWð=HÀdùl@TØÒÅ/KÄ7p6$.Gx_x²/ºcD?bËÚºUev¥pReÓÞà#Æú»ÄæVéU8Ê­ÅÆVfÉ7ÔuÛì§û00Éæ(äªw=I÷¤j¶m=JÍãd_ë5MXCiµë:Á%XÃkhÈ3èDùÉ=Me«_&n"Æç´`Esá0×ÉýÎs.ÅÛæÒKàf=M%yd=}Xá2cÇOª¨ÌrQ"ù¼4ûÉ<íêç1ãíìvûJtA>æè<ð©HQxhRç«%Oèª^Þw¬è+¥Ãy¦S®¤I=LoØ~Îûm8¬yÆ{[;1i5aÝmòô%¾où½PlIv+1½üIºÈsìõ|ÑW¶Ú4IGy¶0)ËD}® 23óÌÍqB33xÀþ8¡È@õL=²VgMg?8K¡ù5~=Iª@}¼#Pª´í@áý2µ4`Î%÷U[P¼áª"££dÄêJ_¶SªÅBy¶J³y]{Bç$Ç=MEøÉûÕ´n¾çx¨ðh,ý¿U3c=MÙÒ1Ýd?/t@KÄ©aþ£&Jx,È«Òå¾0éR=I½"ymÁ2ßô7LF©ý¤g$¸=K/hæigjÎÜíí¢ÅÜÃéÂe³áSÒ5T"Ä~À®D²7³=J»*.Xùöµs¬¼*UKÏa-GJ=H¬þXQPugWWÎ=HºÝGöRÞøªÔ_°7gQH=}çÜI¨ÅÅGðwþú~ê4è^=}ËÔ8b<ptÁ=HAU¬CúÕ§òì*CÖ¿KëäÆ[(54¼AúÒX­i1Lcnã6Ú4ÿBãÕ=ÞKà£O}E¯tk/÷!{+é]õC!gq2Ó/L¬sºøÈ:Éo®C=@pa@U8$ï(Úd¤7|Êf-_w¥@ÛUZÇýè·*ª»ÀH¾®A&JÚaFä^·Êë¥aµx¡=èRøÒî eAÈAGs"Vº=Kl&^®t¾ùôÒòN¨]v*3VFôºLùÏa3ýQQMÊNùó3tø#È¤Êø3;nÆà=¸ZèÁ±°K¡X=@=MR®3.°ES®®îÐñ¨ÄÀíXÜHÊ9ÐÜm§x°&úF!ÈW·$¡=IxTÖÅqÞ-Ãq¹ê=I)V>Üê|/L%ò~éôndôÕ=J¼Î6Sþstê!Î±¿Á÷#*kæ4d¥²qUg$£=JÖZU°¤7qDz9Üà$¸£¾_ÍÄpÙIv"z9H¸×TóÚ-&EnöYÎñLº¹YØZ*ïî_Åñ8¶¦ ÍÆãæí]Nß8.¶êI¶ê9¶ê©ü1ÆêÉ]Å¥Ô]­"Ô·Þóýo²aN0{S¹êÊ|S]Í=LÃWÍQ=K×JåeÑÁ4¶e.ùñÿ(2Y2Þv¼-=HLs:G±VQò=ME¬?j!TòJ9W±Ä´Hãz|²­¹k}5q¢=J9=g÷ÑØÏsYüØCÙ:=I]ïuãX=LªfjaÝu¡=M¬cS(Scc/vgôÈÃ§#""±s"¢jîn-Z4N!0q¦$O=KIOG³q#7pgð¶@ÂIà¸Ó±yFñ!Fhgþú¿=Kø¡70×4±tÈ3=J=gª£­p´+Âõ(7@PíðÛþÆëP­,½åw.¦*=Hº¥ñ³ZIºbjéoÁçøÂø=K=K-n)ÆM¦EÝO 7EßsÄXzH=g+I²øÒçR½ÍÚ%àS§¿%6oñçc¯m&»ªw=@=LSl~&ÚÒÎÍp]%³q)§m§®oØ¿§½9Oa±=I¶JsC°ìLueG[Aä¼#MmÌF2ûc|Þqî#<3q¸1(n-Ç>èºìzWãHÕ÷­%=JñÂÞ±$VjXç=MR·G²:¥ÏUß×XâÃU°÷u¥ðÝ1DåúäÖ];ñÂý#vøÉrrõqoí»f=I¾~káåòZ]£AWÆâðMÕYêìm>C¤,*ùò>ûfx M7|pRÙµ<øKº·æ/=I^Ü=g0xVW=}àÆ2(ó¯<âPþx¦Ý5É½]ÆÂ÷áÃÉF-¿OînI>Ù½pí=@v¦D}è}7­ô8Èr~¦=}MVú=IâYõ/7¸æDsGÓÅïjESñ~y@ú¢Nmw².ó.ú@+C=}4LÁdV0SnX¼Ç?=gÿåÛå6ÒÐ¶éÓ½ÎÕ~fÂôBøZ¡Ç9b®Q41*õã_-ZÌÃâ_éNauVlp5ùH§é©Vlp=}El!BjG§¥Ð¤9.Ú eÚºdíÿ©Ý5­ã´5Fè;õ1MFè«FÎ*FLç=L¼>¬UÓöîºÅ³?;<Û1nõ*pç¯³J=}í-)¼7þÌû£B=Lju`4XÑ)¿Q3.ð«¯=Þ6ùÄ9ÊXeV=@O[¶!=M@_ë£üB_l0Xfü}@tÙ³ÎõôàÌ}ê/Ê$Ê¿hnÎyñ«#õJö,µÈGiþGG3O4±²oO&èbD*çÇë[ÚÖe<ð=@ý¸öhÕîñeõE=J4?<¥º,N>Ù4únxo°¯ËÏñQôø=g¸Ì8:XÊc×4£D=J5´qCk´qFäÐÒek=@3(ùW]Êü3tAÎ¤1Qí×ÛÐÑrüÔQ3¹vg¨ÜÌ-Ñ½×(Owæ}PÎKÍÚØ;³Ý6®@Õâ,¼i­Àç®`Æ$!î¾ûÌJ¢`q=@qÖ´EÑI_ò¥±F¥ßyùÌ/_ß"þ@rÇb*¬Ñ>Þ*Ó¦XÐHC7¨Pÿ!¼ß[òªN«y®Öãd94¢©«[Ù§¤lá¾Ü.=M@bE@ÌüµÙ¯~åQ|=}ý/!4~áIM»cÌYý×ÎªYß}/»zD5TÂÊoJÜò=@ÜÐg³ó2$¦Pg2_§=DR¦».¯Î¸ÏÂð³Ú-DÍøÐî¤þ´öcî¯PÑ;FUÌÉXgA]ÆæÀôr7=ÝçñÉM]Ó·ï1¦­=²("seMä5û+XTCN}dÉÄ2UèÒX"Ùdr°EðÝaC([L°È³x=}0òHÙäõ0àÝé5Ï9%=g«0%gÄ½óºG8òp±¥Ãa=H¼ýQ×û"þàÚ0äÛÉõ=@+>kaRR@»#nw¾äMpôs7åöa0±.N§¯"¢+Ü7ôµP¤$Éç:Y±·vl¦î?Aß°¤ys")=}É&fêá¹±¿Ñ+Ä3W`[VCþ?áßMmï=IÏÁQìó^ódquoFO§Hj¸jà9o=LÞ¸^µY?ý´ºÔúRuøõûêxï2éV#rÙæ)J+7<¢(®{Ë|f%¿ºä=}ÿØaº°0Ç8 I/L:"ýHYgº¿®%`8/Lø^Öq­apV%í7ø§wQhr-fÂµ_ÑÕîÒÉwqwÐÂãÛÖb=}"z#z¿àîëÅhi&y( ÑR¡¤ µ®¿ïÕåÁ®ÚnÞ^rçt@"iÈúé¸åàß¿Ò~¥gÐh¤Yf$2àPÐþY/LJ í|æ..%R^ÑÄ¼Þ¬7AQálº$æ7=I¡Ùø7JºB7ÞyóxïJ`=@4¯¾wºÎ¢¤Rt?8:L¢ÉnÍÕþ¢é^XØ.g*,¿ÔÆèÆ}Õ!ÑA°ã}éàÐíwÏaÂ0Ò=H<Ó3L¶ `nÁ¼Ð>÷$ò¦_od¹h¤ßhð9^ïÚ,ã2i¶%µ>Í/ß¶oÿm)°qYÒs{îvûK zÀ=@Q!o3P³éD%/¢î»ð»ð4VCøh¡voOªº§?êï ±ä;*ÜÜRCï®ñ¯$4ààç¶=@­¹0dÊ¸Z¥uÜµqðV¿«o¿<WßÇlY>^%Á).ÙnåEà;r¼êL9gjÉ©Ãï O)bÚñúY&%ò$#¥Ü®ðzüi§ëLå=IÍßª»CVÃ_?í6Þ{ìjs¿ØÛî25²c)@´¡wAÚhXª²Ø1­»ix`LÚÀÚµ:«=Llv+ªÑv½T{¯»ªÀ=@ûþä¡ÏLÚîÙ@«Ô»È½ùn£§Ã­öæõ¸Hª¡L¦qÀÐr~9¶øæ¦_¸&Â©¬HÚ×á7®].pálÑÒÖïËñÇJÕêl°hhÏ;Ó·QùE$a +9H+XâMÞHg|mM(ÅÂùð¶ÔM¾Ò0T_³xÐËC1g¦=K¬i&èíÃI==M,óu #]BÊxJ`=LÌu´êDXGL_¢«=grà°=gAÑÎ¾l«­µòµ%à=@~+ÏVSm3Ü-zòUk H>q(x]}vxýÑ#Çþ-ï2}è=}¢=MªüVx é°gô-_]gmV±8OxÀx0ÀZCdÒ¡¿ïï¨ÊQØ©û5"òB!ß3µ`e¬+]åGsÂIqÂµ-þAHéçÊ]=@I=gVð5ª?7¦VWQvP¸==gvÀ¦g"SËËLTýýù®²3"~|äÄ£}à´÷Ö@û#7V¨ÎÀÑXV&óOÊhÿE`>Êh¯¾p6D}!?=I]GÂµ^=}¥-ä-¼-dâÀk¬AH"îà6­A¥NN¸Â¬A¨QÖW£0¶æ¯JÅhzú"u)W=~"!Qäõø²&¿=Mvµ:}Cëá%Ë¿õ^zRÒ8À´Þ`SPT¿ß?òr$òþ²Ai¦Ð¢±ä`øÈð<ÙHsòîèÆl¤±¨yD|8¡ó£=MµüWªI¾~=gÃ30)MC"ØnÉ×=}÷bñ,KÓ¿yÎJgê|Xê9îïKæ±úÿcsaÍe=}6SÄp±fOãX²ñéº`³Ç4xm.Idÿ=@FVHv=@-q"2[§Ô|d¥djÉU-©Ôéà öîüãD¾UÈMKg0=H4ò®âgðnüÈ°ji½×¦µ%¥½mlãPFÍqr.vOÊæÁÕoõÜ.t{=IYôåÌUÞç°¯¶Z`>½:ÂØHL@4HA¤kyMÅ§=I=I¯Ø0_y´E(´Ùñp¼õ=K¼r»ÉCºÍåÀJÃ%Ððkk"$#÷È;lz=}aqµ2±¶üÆ=@ÿ_ÅÙ=}Fn-çøÔbÀ¦òÚ=gÂxÈ==Mç;¨8ª1?ò*¢íg*aö"å=H¹+°GerïÿS¦±Àl ¶1«¸îæ¶Af×=Hh_tå­"|ô<³>%¨¼=KsÖë<õkÓ«Û³dr5¼A¯Ð1Ñ7=@éýÙr,2Õp(½¯,£è·%ÊCè=@%þ?­qÞÞGÍB¹PyPÛ1÷:~%îx:Ý ;À=Lù¼ÑZ¬J=gs¥kqé×=IëËMYÑ· ydØñQ#£>Tª£ÂJEÀ=´ú2´=K!ªb+yü÷JÍ¯¶¸Ý­+½ÿeÎXÁ NÎoõW½-1Ñ=øórý¹Ù­2tYL`fGDÇÄWxÔUÍ_|!ÊêL=LÚþYiÀ=J ¾}Y`E( :b£Øè³rýî=@ÖõI¿r3`$,d27FG»¶iea¢#(Xä¤³ïéîÒ¡=L´16T°rGÖá@=Jä¼;>3+.;Äè%"ï%;×@N0Öç²ÜNµ7Ðw>àèÂ-m[ùÐ,Ê+*+òL®ç60¼Jt_vÿîrºËuNeÎ7Z¿)2E>kÒ>c=gÄ²¼M0¼â´=M¸ôÿ(|Ä±ú°FÏhüÅ=M¿0ùÎüo±>uÜÐôPç9åò¶ÈCâ2Öø=gF7B"årQb=LE_Ä¬n«ZÑK/©¨¬öé;M|+k&Â¡ÿ»#±ëØ`:ôsR¿¸rÙ)Í.uÜ"(¾nzceþî÷Ò"ó.qý¼,âköSC¤·ßtOÊ¤=IÝDô,eª¥Ðx²RkR¼¨åùH[à=My§ÈÊU~"!Iük~=HÄª*ò=K%Heû4VvúûXVQfú]å_:SÞ[ã2ÕùHèÎ[=Mù*£ùñ :^½sþ1ÚÃhÙñëðxáé0Y=Júaô-æÃ{Jg¡¬lsaêú¸]Hþ½x¡I¯ñ(þÎèfM;QUë¥«ùV1ø_´T/7±Ü4ÇayG)JWøÂ¸kðLèD/þ­#Éï=KRÉ37ý%£­Ipve=LëïhDÊs =g°T)9u?¾óG³)Ô+TµÃnAQãXèiÎé­½²gõâC®=L­9©Ô7~MÂ´)2HÎ êß=gä=Mâúñ?6g¸õºN=}ZÄ¸¦cÐ¸Ã *=JIöaFmÞ&úÜXòkðæ¦L8ËÞA@æV9ïæHÞ¢ìË@å¶ÁQÍt( gÕ_5]ä=IãIBº«=J=@ª3c=H Hì«y­D·7KûG{Ä§AuñµÓÉ¼Ká|=KÃW-:b=@`ÿïÇwå>qº¾}L±¹Ëz=K$ôà_Í]ÆØòB*fðàffp¹ÎÖÄÅýåßLf¿=MxMCf?<ÙÜ)=KÕQm+._l¾¿½àYºì=ú|=ú|=ú|=íBÇ=M`gñJ_ÙBßçÖf9Z£r÷áÏ¤kã9½å<¹¢^âíqñ²µÇÑ©Ñ=I´vÈDI¡o#½uoç+Äj|³ªÑ¢Ñ =Khé7.·©ÎQBÛZ1ÿÌUó ñå=@÷óà¯ãS¶ÖãÈct¥o=L=IeÇ¦uóÊOËø$Uu×-j3Y¸aó"ÇKf¢ËY!­m ­=g&ï=@dóåMþÉEL+JÑ5[â§¿åë¨1Tû0ì&ùü/;3§@öñsM´=J]Zæ«ð~$29WÈóÖl¬¢578-ÏqQq¨?$eJù¬dà>0æQ=L¹VÔ«fp÷uÙ7SdnÙÐôÛè.ÖeÖÊeoAjê@Ëà+|eVL1ìÏð8ÓæzjläÓàxCÎþÏ»ùõr!©&Ðº~K¬cE÷¡2SL|t3ÓçMÍy;5Ã¿ü%ÚÉO¦Ìî(Ä_½yc%Ï»¼zoï_8ïðÙ=Jm=Jòz=KÕÍ¦þ;·×è=Iª=J|AÖ[Ï­©=H"Ã2ØîP§Ow»í=@l?Ô#Lgþ§¹;çrNgW*jÒ¶È>¬=JÝQ¶-Ê"~6è¿âD?®)Dz6v{öý½b=Iå¨ ¿±!)ráÎÀ¿qëM7®ËÓ/Sq6R§8BD]°h"·¼6MlÏáïE+ÿ=gûRá¼=RÉ"r?(Áüèo=L=J©ÕÂ"5=Mx#®R8c%mB=gL?Æºò8@e¢¿=M«¥=gÔLÇï®Uª- nRQ 5¡©ÅXNZIÁ4(wvèZôê)ÈJZ=gýÙfjOÔ¯2¿82X:ùh¼19H¥²ó¦!í}=gc¡=g=M©/=g4HowÂGôä+ìdïÛa6¡<×"Ãðz=Kw5üûÚ¨AwS/=g=J²Pðºfsß§A7dÇslVG©cEé.DfÍêhòÕÿy:Ý·c½­É°tÛñü®®+Ï¢ÿW4®duÂo¶#ùÌ¹ÌähÒ)`&;$0J%.åUàCÓ=}ª]¥ÚÕ¯ØñîÇ¼mf=@¾ÞQ.Ì@(ðÒÀ¸Q=JÖÛÕ¾¾ètlHpL..ØÁ²ÔMÕjíÂ?SôI>~/[=@8¯à7$Ó­7í}Ôì§Êþ°T^ ÀpF«<(¥Iüö·õg0ß ®µ/>ìáªõGn^Ämöê¦ä!^BÚdáÝzº¼"=H"VPvÊWC2®?Ì:ávÇÌ4<2Ù0|ïæte)M±k}²l¿BÍ;Í=I6ÉÌ¤¾Xc7x¶S+ÈÌÕqwà¼lÜËÈÂ­()æ/®jI3=L"ÇË2¬ò×4×¢Î¨?®ÊgW=MbÚéc½Ô®W|wòVì+c=M=fô«;hfä²*l¬LÞg3×Ì:¿ú*Û¶uê¾ÆWdâçåùr¥~µÜS ê!Ng=L«{r|÷ZN9MâÐÁ[TOSi~®¦^=M-È¬Cn½=@µkÿyìm©J]kxYøUg±oð®·=IÄ0Rò-i]ÄÎ¬ÓKuêfv üÛ`[óÜ¿:ÞÈø2=}qÆòágèÈ³ÉA7E:B¡ñ]Poáa­êTabAEß÷ÏØÞSZP´åc£ìùo½jEAÆ&[å%£c¾¶djdÌìÖúÌRþ2ÿÕù<Ñ0TÒ<_Y»ÛAbÿ1T¢oVÞBu|údSÒ=@÷R¦Ey8,ÆÂQ²ærµ÷aS¡sslP&§Ì¡hÈçOºÏ×=H=@»¹ã=g¥gç±Iç£=}ß9§ÉÕç&=gê¾s]cbt(ùáÄ=IÎG §E¤Ù÷?,ø¶§¿G"Ò±Àuº_ÆÆ-8S!»g*KôÃðÈpdNâ6>hPâu<â9m¶5=MÞcþþÎV»òÂ1*ñÂò0Ú ýá¶³ö-âDä2&L"& uùJ<±%8ßÇfäàíê=«TD4k®)þÊéaAµ=Lý?9§3Jm#OMíÒËÔÛzt¸*Ï­7£I8$))HkÑÖÔC,cV=L)¥A^ùdÜ@>*L{syÛmÕ·X=}!(Oæ½µ!0(Ý®yVõÒÞÊ¼bÅmåø=L4ä¬$yï[ë0Ò¼P_=Lò%ð¶^FJÆùmødòëáfâk}ÓÁt-;ÿîPFÂÆ=J0£þôÝÃQÉÔRDDH¨fJçkYfÄÚ"¦ðàÔöCüq??h¸¿âÕ¶M1ê£ØÙ øçÇVÀ03fîÃ üraW"&Nmc|=¥>ËÂÉB½%2×J*[Å=MI3MJÅ[Í=}@7¤ö$ºÆÆS1êÆç·Ïnød÷âÞ|ôsÔgStäpù4@D/[j>ºþë¤K³É¬å2Ë¬Õ#>|¤í|¿>Å¸D¥UJòXµÅzáHu¦©ûsÄ¶=Jc[w=XN3ÇQ==gÎ Iß@J!®Ø»cQ§HçP À(xvZcpóù5¯ÆÕQÜÕ]ë+»!üÙöÍ)9Ý#>û°îdÁ¨UàÇq_3Ø|.Ñ,Û)E¯=KÍpËu÷>Ø¿hF¿=L$£÷3<ÂÜpfÓ{SRª=Iw^4_rbiÝUyÛ:«úÄË9êW=MT¦¶1×ùegm<3êgß÷Ìï^c"4³*þÓTXyu£ÑÑú·.Ù`k=K!Ø-Þ¥?æÍ³=}wN¨F]RAÎ{ß¥Áï9Zðº$=Iªî!²=Mä]A£ìWß®Üµ»qG>­[Ã{°ËÑTüØæZS»Ù!3çeC«9s:{/[§T¶jÁò£3uÉvûfs=@fRà=@á­`u=L§Á;m[ºÏm=MQIé@þUãuëL¯N´pçÐ¤kÎ9X[.àT-=J¥Y£¬X¦*ÂÅ®àØ($èzæéLEä=@Ó:ý=@Í>n¼$:Ä[üÅï%. ¥®@ôMæ[Iiôf#ævµ=gDf£Ó7¶uµ*SFur-=J]é×¥VWÑØC×sVCÑ"µ©ûãÖ©×©ûë©;?ê_ÓmYå_ÓoYõ_K=}¶©[:ÑâÍÖËKJ@2*=HF´Jãþ!QibG¶FÓúAì)=MpVÄ¢P"DÀñèEÌ½MÃ#`2Õ"ÔýïæøÔÏ~ÓEö½âõ}FßJ» Ú6ÝdP«uØ¤5½7¢½dx¼`,½ Ê¥=M,Õ©-x¶Ne#h ¬2Æ½o½ 4åäºÞ$Y ß$r,¯=J¤ÙÐàDí=Kpä´öÏéµ#!=JãEQì(XõÀ*McÌ4Ó¤3Ùp¨ßuë´ïX>ãA%T2 =}çWTëÊÍ)Rñµµ®Û¡MÊý=@$NÁÿn¡K ²K«,=@½Ù9÷Äwf=IúÀ>¶®þµH-re¨®g(9Æ²rááì§ßIøy·Á+=gYþû¿ìèiÏzlvÃQ®Ö©Ó=Hmöwuõ)Fâ9¶àÐwìÍzß:=Jt¬}%hÒ+¿£=K5I=Hõµ(i+o:w~_µ&9n]1Éèbgö.ORupaq­=LàÛÒ=gý*5åæg^a]j`Ã©®ÍhÕVnÐ=g!EÖ=H¾+ZÂ§Ê¢PöØ·é@Ö6B¦wDâ© ¿=I!åà`1°=KCõKê~ÔN2==à=H=HhàÈ®pG²ý¦Âõ¥$ ¯Å¶õRo´|·(ÿa5æzün~Ò1ÍgBö©hÝåJðjÖJãô2y Ü×ùè2/ó»ÄR;.«Ùhé^¾n£([¶ºAIuV­¼`qpïNKrÐÿ«RÛ+*äÙ§þëb%½¯Ô2%úD=J/å+ÞDÌEÊB(=}1ùdd|ï._5RÝÍÞe=Dâ5|Å©d¿=}°>§=@qüCÈ½õé?s¿ä«ä|¬M)sCeS#gÇI=îÎ°²øÄ÷ëGËXhá[24£@PF©_¼h¿9gC$.-ñÑf³0>Ê~¢KªàÜÐ¼¦KªðdAÍø hÞÃug³â§a¨@§gù¢¢%ì¨¶çuÕgrù´u·Z¶ÍäOÆ)8úÒ@Ú_º=Iÿª%_GOËÀ=MXüc£+è(ØA1¤´ª¹¢6(Ó¨¥÷2òb åê¶ 1RväßæLä<Ì=}±`O_ã6P*Úò÷¬8rk|Ý»X¤:ÎL=HôóÛgA=×ÜÖ²Ô·½]ÕÔ§xº,=K@¤Ûè¤=MÜDYD,E)A¢>}9TWqìpV Ñx_qÉãÙzµ!(í<ò=IKè£gZçjÎöà¾á+ÆZ¨Àlãís§ÑÆÄ%{þXóqJÅãuÍPÂ#ç¶ÿ1È¬FºïQKïHV¨¼´×R¿a°iLéúS=LsËN»²j¨è±¢¹5óÒbP¬òÓÚæ|V·Ê´CË)èØuÛLììÞ=Jÿº1U=H-Ö?WÒÊµYìÝGáUd,ËÍÂ(ôÁ£¿ªæåÌèËý./ÎìÇÛO°ýÂ.=M=I£?Aî>³e¿¼Krc %îââÀ-?©,Xc:ìW¾«Àì=JZh^=M}n×åÎcÓa0#N Oèÿ$TcúÊu1¿òÇ2ÜòÐúb=I-VfåYêAM©¸í¯å~ÄT^ÒbÏÊÕ"þâÉ%¼¶NÖ.b»ÑÂ2Ñ:ZZêÙJÕ°²á6ñxØ¢ØI Ï4;ôÛÙ¨²¾:X:CO:¤Þ®@oÔÔ3$½I[ÿçÂHhÄ=g»°ßa©GÆÕt=H=lDµdøÝÖÒ[x"yûÙ´ûvkL,UµÞg³eýC&=gÔ$!Ä2÷Sz3{Ö}ï{Øs+´>&2xÒáQìXVÝd2ò>Âaº8ä¼§«è{zñÒ=Lj¾:PEçª»»zâTè|®j]¦Y½N=LQaÁØ;ö¾r×áµýåICbs dH§_û¾p%äjt!}LîåÙÓÀ3âätÍßáÒK¹P¡úUmzÐéG=K©kãi=Iù_?=g°Â}Ulsþ­¬_EËk=KFOåÛ|S`Ú=ã[mÌØ{s}=K&´ØkÚö/¹#ßk¯ÊÍ+]zkÓ¥0JVö%ôÆ-_?âð¨©å®¥§rßoÀyÃ-ØåêâWä=IyÜÔ~Ytï|æüân´,#Ñ-=g ¡@¢µÃ,7¥v«+ºDr=Mk=gé9@Q¯d}]ÿ(ü¤ï@¨PpF_=M[r_Qþüí±Po=Mø.¶Ê`ØyÚXØÚf-Ï5úïñ¶qµfµÞa$O=g*`NÚ^¦àLÜ È5Orù=·:=M@$cDzÑyi²kúøDrLWAÒ¤Ð0ÁlmVòßçécæéìEXç©2ï=J"Tyñ9ÉM³àöÑÔ2yÎGßªx°aQàdòþ¹>iÿ.YñI@ïiXtÐtªËÒ¥ô¾§ù©þBð^»ø´-öqÝµD=HHp,7 GÊ1Ûî°Ä_íìÈôæâç=IOÈy%M=MN:CÑ6lô=Mf1q*0æ<cÝ<aãÙåáÏ¶ÐøX¨FIí)ãì=I¡ðõìqÖ<&ÝûìQºq¿Ñð»òðÛ¹qCFÝ=L|¶aÜP¶FÓ¦-91Rµ×Àª²FöfÈ!|"ßv=MÜÛA¢ïßïûâ]÷=LYüÄYxMd=Lð²q}=}ª²!spBhñkÀdàÞFyØ=@Õ­ò÷*ZGæsÔ[ºmï(±¶{ÈrL=g÷b¸°éXÇ[YÜÅxßôÍCó±¹USrG|¤O8¥@¨eáÒ°ç¹èÓì#ª=M#Ìx5{_z»ûX§=HÕ» b_0¦y31ü}©Úãët%tHµBoL¯½(`©wãtèÀ-QbÞ$5­·5á;cåÛ{­k½¾=M"ÖVä èz=@`cÑ=M T+¼Â.þQÖE<úÐxlIõò¨%n¢E-EÚk{i4¨=K¤´³Ð`t?H¯Ý·ß¥î¼T4=K-«·ë¢c²U]¯ç1-Ò§´8´<ÎèïÇ~¯;×B­h/=K,¾K!;õ=M¾ÔR:Q$=gê cá¤it¹x©A¹ÕEkÓO»Iêc¾d¬Ê×^YôÕõ÷~ÝýMðun¡[Ng,¯#Í=@6ÝT«jâ(NïµÅ¼­Â=M^RVK=¥LúZtÏíi5âZú2!1bÃí^Û#AAÕn÷ôö*Ý|îRûöÕ=MÄM OÕðúñû=}bïÏjpæ óòÎYÕ¥=JTæ·Öò-Ú$+=L?¿sÍóìþYQ_äÂòGrz=KVçSjd[øB,3ì,E>÷÷gÑõ(N1ÕÍX&½yôhQÎÎ¦V;ñ/;ªÒ&ûjÛ3¨#%êcvbpÅg=@=,Ösú°Êqa4_[*=HeK¶{ÈÆGÆmZ^~Ü²{ãÕ:ä/7)£WßÇÇäùSªU°¹yéÊ©¹®^é,¶ÛrWN¶Òtþ¿8·qnÏÂ1-=Ji;³>¹¦HOúRÃfÓÚZï¾ªEå{»¹k^ z°íïÔ¶öV«}ÂÝËzÝèo¦ÏBHî»iã´]ét_Ðü3û³ggSq=MÕ@µøR¡ÜIÏÐ¤úÖ}!Ê,Ëõ*Q¬Ñy/ªÌÿSf¥£ÛóâålG8Ác£Ç7F«N4Q> §èÕJ>µ)ûÆb=Jó²u¨å[+¬:÷øAë}Ã×=J$rqsVz´{×Õß?1ÿà©î-ÖÒocªV^ªêEÄß§³oÕ1sIsií¬¬z©SMY;-â<Â&"º¯c­Rró=IP:caåõüYI=IfüÚ§É7(Ï×Ô¶zèóÙ,±/9PVÄÇ)`×¿ã85¯òÞSgyôdüð=HfàOï­ÔòÊR÷xè759ôÌxYÃ§§öñåSëµzÒ÷êl=L&Æþ"Ù^&MsêÍÍEäÇSë¾²=°ì6þÎEëçþfØñãX¨ô=@É¡ú5[=@²~Ê¢iMlóËB3gÄÊ©Õõ+Cë%-ÈG5Ãé¾* »éL®Ê+Ú½»MxÜ½jkä2ºqÍ=Ië ©ý¼å¯¢wÚÕT©?¶øµS2¥ô$)ü¸ôöVò¬Û~ÿ=JQ»×¬ËdofÈýnAo?¥iYDIÞ=Ls¦~ô4yG³Í=g~M¼íuJTo=L50^«NXY¤~«äÓÛm(¨.`åB©ZX3~/ÅäúÐOëk¥±%?,®p7µh©Êt¡Í=MØ:ÔÆfJp©ïÎ:=Î*=@gq«óªzÞAJþ!¸Ji=IP¨®ùih½ZB ¤¨cC DIi=L=K{Á¶¢¬T&»Y #ÿ MªL}eìærl¢ý[þ§Ä=g$­£º¢V1=Júâ~Ö³åZNÜ8ëf¯­,¨apuÂ4ùòþ©Ê(8{²¨ÞCtACx@4®ej´ËÏïqXé¢aø=J+ËA7F¢¡1Î×3¢?¬0wtþp2.þÓ=}ò/ãû³eEºíá´=I.ÌF>=JÄñ5@G32ÔFêðÑÁÙ,w¾à>SwÒ±¸$úÉ.=@ÿËÂæeÞïTE7«I(Ä´JÑ=K¾zKFÓ[d;=gùÅgÐk=@ð¦üadð¢òÈ»Ç6èGÕÅÒÈÏº§×U4!-=(=}{ZË ÂQlWßö­C¼èºõ ß|Ë9 uÑà;³·]6Ú=K³þJÒEü¼Iów¤=IÊéæ²ÜB?aPé4UØ¡·(âò¥>k,æÄc^~Ã»ÊM¢ýÜÙÙã:Í0oe± !öÂ=MÎT=@æ(=}¼ãÖèåõ¨1úéÊ¥£ý`¦T=@»MBåí&£à¹VBe´Mâ@È=@ZÐZQT¬Lè v³>èÌ0sz$ $]`.w!þþ­m7=JL«õ*¥à²D w¦=JÅÝÒÿYÝÀ=MßöS1é¾ö«½HÁ+i3´ÞuãT½#JÎÀ VrXsÄ=·Í!ôÐhØEjOÿhäîVJ,X=@jq/0ç¼DÆôÝýÚ¯ôËdçv·Ô9!-O¶5lbÀQÑFxíÒl¿~y1%jhÍÁÛ¸ô8,¸NÐD°ê;òâ÷ÐO&úQù&Ý°ªØ=JÂ²yùBÁxô¢$MÞ¶h3) |$®Ú°j2Æ7M°=gÇEÕ>W=JKFþ­`=ÓpQí ÊI,.ýO:1»§µ²qrÜl¼y3ºVw¼j"-R×M=H=gÌb¢H]À¨ò`¶=H¹Ú§H<¼ÿo©f<Ù5QYWJgÆK0¤çÌ%Îû½»ù ÏîRCø!-´ê?óZIH¥=g=I%WøRT¦@xs,åUW7ü"RµqQB³2nz¥g~ÚË=K¦×ô=Hèpúr=Ju|§¡mmëb#_þ"Z»¹.2`$oý5¦%÷&ï®È=MAÝïÛ)4Ë5æ*MU¬ð¾ 5K=HFîyÎ/?Ìo=i,HpfTÀLpëE=}°¦u÷É©§ù3wZ=ÎöËorÒ>¯¹=J±ÒrñQ¶%AbG=gKéüâ;HÚÐËgµ²wïåà%lL`9ø~´ÿµ§·`®Ê$ "U8¯ñìÚ«Z»Ü¹Ë.¢Ï*ðÐÓWíÒÈ<h`p¯.4|¸+à[W¡®Ua[Sp=s¾dbdËý%«¹6<Õ=I¨ºe?¶EB3öüÓÓ>ÂíJíTd6im*ÓPgx4jÌ[¹mÌk8øf9Å&µÉuoDeØþ[Þôn;¨=@_¶4í>c¹o[¡µ=K>FÀEA¬Ú­àOc¨Wù¨ëã~÷*=KdU«=gødm¬=g^èÙSoGaôþê0wÐè/_ÏÎp( 9öH|Öá×·n=Iý5²=Mµøû|£çÙdpÚÍc­=LOÁÉ=LªÇòµ£klÂbOvO£Ã^5ÝñÛ_Ìk,Å¹oO©²G/snbÉØ¨=gxEÛá=L.Ãõ{^Ìïj¦øu,zÌ)Ùz-ôá¯w¸¨"ã6­}i¹¶¦[ÁO³Y|]åâ=@$¤mMÜÔ´µoï¨¸°àßÂ{-Î¥u¡«öx3ÈÁddyIÇs]ë=H¼srWýMÆñíÛó®ênA¥ç=KfàLì32ª­vÚ§1en?=Ió]Eð=@ÚI=L=}IÅºÔoéYúýZ½1)zøõügPå¸UQÓhs>Z.zLà+61Cb*!¯eïe ;2àt=.zÄihÖ/=}L¼¾©EZÊhcõnF?Â+_hïKLE¯Ç-ÈOaÚëýúÏÔÆâ··ÚÚzP©²FïÊçÿLSâ^!öàúBÕb¦25niuV6÷ýÓ·>å=IõÀøDàêóÏ­Ft?ÛñKø ³Fl}·»7±=î¹Æ8m7Ø»È=JË¡ð=M²²Nj·ßù£²pLms0v{=XªJ68Û}À·ö;;­|«=HþâCIMô4tD=L8ÒX_Àb¡]Ãï¶iÞß}ÖöR;Ú¿ýÛÉÖ=K=M>ïø4já©pÙÆ¹IÝù=JÚû1R§êF!Ã*ùÚçZO{:Hznú÷6­y×Yú^¿×ô/i¸×©Û=@)Ãk=HP._âê|©é¦fUuÁ§£Ö_ÞËV¾AÎ=M¤h8ÿ9>3`K¸¥ÓS?Îo®ü]¯Òj]=gÏüêj=Jü90AÕ(Sxê}}ACý¹=I=J÷°2%UYeWØâý]ÃvMLX¢-)ÈKÚ¢U_é2÷_G8æüõþ¢7·m©f=}ÂýÉ-üñôZ³8w`ÚU=Ih`I÷î=I¶¥åu`M9Åo#_}2oÓá/|éf;¹GsÊØ?!QñZÌ¥ÎÁzîØ{=!Ñ8@üaÛm÷ý«Rè¿=}/"ïµVM}/L_Ì/g¡w±ØÖ§³NÎW²éXª3eUá{>÷`LT8Ñ=gçx¨E­pücìÅÈ-=IKz p!Ëô-ïGB;=HGñ:g¥yL;Ê¹~zië?á}-É=HX-àe´uÊ+Ûv^8µ[äèÙüÑWâQqèô>ãXkúf+q=H,$Ù"_ÖÒeNxeL;¶EV3Øà¸@Þ¨ãKýáÅ÷ÓZÉ=Ks^®ÑVc<J=HÔo6Âè¹Ìmx=HäêÛùö³¸*Ï¼ûS¶jW¨£cnMïñÓe=J_{8ä@QwÚ{Î4s#²3h{²²sB0]~öÒD+_d¢ôDàÙ«vðv¡Cömù×"FSÆXs7t:åc¤@=fÑÕ|Z:`mÔôAÃw8Uþå¬øÝùéÒwá_fàð$³?|Ôÿö^ÒÐÔe$4IÎÓ½ÈÍÀÎ7ZE=L?Û¥7yU¯ÈÒ=}SòxfAbðGfJlýTä/°YædÚ«K<½»Úär%|Zº@gñv£L=2Ç×QÑÈm?Bó]XAëtug=LJ¯d@û]p";ºÒ!£ì/)©Â¦§F.DlÛå4+<cj &|ø6üÚCô/!ÁR`ñÑýr¼4E|+:üØÈ?Á5;*kg¸äU,C/}µØnOxrmù·=Hâ@=gË=I#YL=@ÇÚ8®á!{Ø©ÐeZÁsù#¡ý@(ÙL<%x¬ù³6ow)": U,_IG.}ï=Mv§FmTAS§¯ÕRÇÈÂuÍaRÀÂâgQw­:ýèã2_U*@J=@ïTØ¸Hárhµ6_ý=MÃC =K¦ÈrB(é_=¡L=$V =Jçô8¦g¤_2úÛR¡ïqgWÛz§äf7iºc}-RðåPTi±ô<ÝÚW}ÊÈÌBA>ËüßÚòiÇJ/XdnzLh6Æ»öõx¡ÈäEV6¹[ÂäµhdUví}q8ýi]_ßÙ^î³=}Oç ¸±ÜÛ9`Ä4)¿§©Æ/=áê/Mç}e%zË»ùs^ÎVmSâ×üéãÖðWsñ¼øÛ(T*)GpÔ«ÏUÏy"SüéÛ>¹ÏÅwÍøÞ_¥?A=L¨hWVÃhS>ëÆc×}À¾FôõõIï}{Ê`s»ºBÌ?àc!°IÁBVW!é¼ÈÍ>b:)% ¡Q8ÃsïÎ¶:}â« *w¬Ð§åÂ×Ð»1Â_Xu=}=KcI#¡ÛtY#KP§}ðØðmS>£ÈÛøg±¢=L=gíw=Ih¾RJbÓt©rR=Iw¸pR=IWkRØ95{=Lþ£K5ý=g:vv»x=}re³G~ëK7ôÛEÑ+:züiÃÁºøyåîÈÙg=K5¥DÝÛj]ÙÜ^+¶¸xÓ^`êªá`1¸0<¢cdÂnFtÊdN~=HivZs|ºØOêiz=}Ì2gùMËRø¢1²uðaQ¥:Yha5¾åI0G#Æ-yNÅ{}`Ûàào6J5CæpìT=Jù6=IãeR¯ønØ²nY=Jïo¥Bh=KÀ(,+96ü¶¥6k=MZ ½=IôÏ«+3ö_3ÁTSä¿&Ä½ü(©Wi=Múö½¸ý÷yÊW=I oëñuIDÖí[q{>×¸!DRáøå=Hä=@ä-ð:-$á¨^jt¡Ý[»oXþ~¹!ÙL«ÕíXó²zcsº[~Ûè_ÈÈ`î =g_êäÜÊÆ}ª5"D=H6>èP.¾m¦Ô!<úe¥ÃPçZOrÔuÖVêÍaÒ=@IKÐÑU0.>_&¦`rpVóºTSQFôÃVª!¼G/ô0Àòû"+à=IûL³¹PXêö·=LCtLØÂ^NÈñ2Ä=g1áôDÈ=h_øhbÈh=èa=@è=·~ó ÑÚcc«=K~±Ø+Ôº`yT¡s~8+Ï¬^Ìß·=M¨DÜ­,)ÐÀ}¬¸ 1,=@=@¾£Á=L<ªÙl=MÊ=J^/»2ÅÅÔ¶¢=JaW4Ðv³Jac$}ÿ³Ê`t½Þ@ºÓ=@lJã®¾>à*c©¥#à=g=L»cPö8)cÁ¼*=Mî-* UX÷]¼Õ=¶b=MYiR·Nc½wÑéÑA½æO-ËwRisu"£:ñ´"Î"¡~ð${ ¢0/:öx=}0¶WD"ÇAïÔÝ(@4Ý$º Ì½ßÌÎø¿^¼¾Àæ$lÂ½_pO0`Û=@DV3h@M·iWçÌ`e¨=Kê@Iÿ¥å«=MÙÜ×^JÙ~·tß°Ð=ÙP=L;iwðq/ÔBïÅ,te¾{¨Î²ìã ÑaìûÇQö~ºYh&ºÕ%õùö¶b ¹=LÒt×£ÄãNÄ¨SÆEJ@vreB)MN(MR=IwäK=IwR5Q=Iw¶B)=I9xÙxÓ^t=}¤Â0ß÷óHÓø¡i=L¼dzúu¨Êz²*v¡ªw·ö«7* SêðDÕ³ªY V¶Ú[¥B{¥õ«Þz¯üÙ«ûX [¥«|8k|i=K|7;¼£»Ù²ÎÂ{!DÅO!É®!ºEÞÐß46É-Ã8öÄX²¬º§¦_&!Ïæ æ!-ÆÞPö¢U:Ò±i_ÊÖÈWeÊÖIMdÒ¶Ùâß "üç@zªî=K@â`Bªë@²öÀî¯6zz<9S{*Fîv§=KGY|CDþãÐE/þÏüÜöÖµ5õ.9ß=J:-+¥»Le-,&:ã¯HjeÎ¿9/Â=8­º÷bõê-§©í[Ü+MÏ1q|=@5=Ø=}Æ4Á©*ó8qèª¤LDúèèBUºÂUúâU²ÛT¥X|vPVÚ`¿o¹=@¾ÎÍ¥µ5(;PC¾-qá;ÓR#»»=gWk6K+i!Çy4=Ibw;TñSÛw;AVYnÿùg®yÈGzø ûûOë[î{úüésKK]8^c«¡<¥û]ÆatûKÖ¡ÜL`ôÛ,6aês¯2ÑóQYÐjò=MóRß¶?×ø~Óó|j:_:É¡ð,D¥º=H®åÁ/ø0n1ZÐÍ8Ô$ÏT!33<=HÁSä=g}%ÑgN=Iþ=Jý=Ml¢ÓÜ¾U0n/æ¨sÆï.GP^îueu6Tño7¢"N©­ífÄ[.Å_ÁÎ77q}2:ùôøuÙ°;y=I§ª¦vµåóÕêP7AxîÏkT!0Ï~À¾¿E0@ùf)õ=J9ãÉìzY|²kxê~@â=J,ÞILàñø9¤ôÀ.Ú#oÂ^­8cùXj[°fÂ:XËAQþi*16÷´ÈzSýüùäW­þDî:@{nñj=gÅ=Me]¡V¹bõx^=gêR=H¼ÄS^ÕynO1÷D¢AOxÒ~Ê~µâî¿óBkRxüsxWàT¡ÆosÓn3Ô)71gáQ (¶?jÌ60ÒÍrþê1ÙöÒtj,çëAÚ8<¸½{gKS(2²_RôEfg£¨=£¯t9p}dËÔßÈKs¯èc«¥¥¥D¿vR³ûHÁö<f½mOî®ôrîÅ<ÂL®21Jô+ý&$F^Ðé+£Íèðºð»v³VRº>EsUåiü[êÚ@u®ÏTZ)8Y{¤þ´¨éïo?v6i@u¢óonèlPÑ6*.ÂÄª=@=L^Ó*oÀFaêË4®Æ©½±´*ÃT9a´@Vá åïðõ ãFér·OHð9³Z«8Ã_ÛU[UT?xåÖQ«ÁB³¹¨è1v/~tÄ9¾xµÍcÄé.«ÛºI)ÛrR=IwR=IwR=IwRÙR=I9IiUùÃêu#Z1±­µÛàv6¾âÕ]ÒCwÆH jµ´KëâIlumùÛçÔhåj=L2åy9imyt±ù9iä~^x°j×òßÞÓqÄ-=gM¥=}·O­qê=I¿¶v¾;ÕÄpÛgßÛWÕ@hÇóÿÁµ­Éêî=}ù*åóÿï.V¯GN´øµmbàÀ·=}=I·gt(P©Ø­ãp.Ú÷Õh¥jLdqõ¹y±y)ÀQ(äg¦ÁòßÓáÆ9ôJ*JfâµïýÎ~5¯I¾ÿWðiC­kAúiÚsª=L8o¾³kä¨ÀEC ÷.potÙ8ÑÐECN¡ñÙ«á3°FXª?Ã=}#<"!vºy1i43å²e¶ÈÝý¥6óºªâ«ÞwM¯q6{²Ij=@?x¹qàhKæ=KåÛS#¿8p¾oå5W:"e­Eìr¼Kjßóó2àë½ÆìÕËÃ-pÑÔ°Ù$Ôx-â¹Þî3<ÙìD£¯CûâãÚÁÆý=@(hÿsbAì$÷z7ÇO«p·;u>#¯UKå8Èå`=L¦÷<#Í=KjSØdR=@/ø»Óßwoªùß*=L¬eDúÝ²ïßýÎ¬L´`üD)%Xö=Jà5||!`öð£lBòû÷X=Hqöÿ=Iñ+;÷§)c¶[-4À¢-p%$ªß¾[»l=g(ÝcÏF>[Ù»<,@jþÈÚ4=@Ø¿Ý[ßû|¦¢ÞÊ<-Þ=gÚkÀ÷¾ï(¦)Ü,pµ(Þ;ùþ{¹5êî[ýÀol©miÔÿáB.p¯T+JàPûk.paªµmûm/©lSm¢ù0Å(=M6!Öµ#­ÀÔs=}cÏ(Þ¹&JÜ³­"T£OÛvä3=H+úg÷`Ý;Ô§rC;ø2ãýý¦éÛÚÃEª;o.×u2;åÞK}EHÂwµÈ=K<M¸å åøiÞ=L(Í³9l+lsÔÂ¯8iVGñßõ=M*â»ßk~æ¦Òèj|±4p¡5@ÁªR%xù#ãmYU¹ù"ãuÍbÉ=_ÀQ?Ä¾¦Rò.VÒ=}3ÀAU!=@|É¦îPÁ3;¶mÔÛÓ/p=JÞS~NN&¢/=I]ýÈ!ú^àrJÑõ.¥`ê#${/ôÙ0iå=JÈº®¦|a¹³=Js¸à¸æA¤c:G­S´=}_GÎ³=}=}öûòÜ.VûT9vBQO÷YK2Æ,ÑìÂ=}Ñ¢=}¯m`+`f=K¨àÃ½ö<ÛÌÚò¸==gKÜîcÙv;£kxhÛÜH*}ÞP-åûzßëàû<5G±/?mU;Ü¡Ä:?mÜWÀQ«sO¿å9j"ÐÏd&âN¾Ö±ÙeÀk»ûãà2Ø¬DJtÜüjÖZÞÓ|.v/ýYXéHJ=Ïì²=}ì#<ù´(ë«VÕÆóØZàSöP×²¬ÇµÓeVØ9õ´Ù3ÓÅp;m¥8NØa¸ç=}ZzéÃÙÚ)Öªë>ë<»m­ ù*výòÕZjÞqxáîÛwû3O1@zeñN5úÝ»ÝÁ**8È=MJ+=M²åY.®ñ`µÐãß¸aH(Y)QÅp÷mÏEã~ZôJn #U¡Yµ9;7$1®uõwù=g&¯þÅÊÝ~woDßËþ«.6ùëà=HÔZìÃ/¨û?x]|ü@º^ØÀGÏd¥Ò¶Ê¼L»ûÅÎ{M37N´ÜøPAÍ×{æÇ3t=KÐW[ÛÛ=}GrzKy=IÛãÏ;à©¹à¾EÛ·½¡!¶¤KÛxäØ½)%h`xC£Î¹mèwläÓ=@ô:á£^Å¨àc<ÿ¯ b-p«:@C»Ëà=K¹Øå¡ØcÓõUkzÆ+ö´z1ámÅDì»Ü{wh¿Û?¾§{PÓÃ<¿U+F;:¹ ]=}}¥ÒÜ+ãËF=I:ýäbo°U7`Ìþkh¢Ðs2ôe¸,¨9èH0öJO¹åôË1çªQÊjB½=g=@â$;Åp¥ ËèU¶H=};ÀV¸¥KÏÂcÍ9l=I)@º_¯XæX»ºõ±²ÀFÎ=}åÙ6×l=I(^=@Ôã¥i{7lË¹=@J>S°«¯TÛ/w~ÅSë*­¦»Þ=K©Â=}ìk°¢¯x`òÀÎêÃÛÊ[¤æÃçêÿÚ.=MDQ0jÛlÆÔ÷¬KYnh7|e ¯ªlæÿc=J¼»Ï|xPÿ,í[!v=HeOûhÛ@sJQ#?±áûÝ±b=KÀ¿;¦}W{*Ùy, oÊpÅ>è0)óþ2¤ã¯]¤ÝÌ{o»É=KD¿f=L¬}¸^ÓØë!ô2·lm}©/YheZS8=KÔ!4¤&(ej(@L6¦Zâ«|9ÔÃã<kÚv=g}ðº¼E×L·¤+CÃÖ(Et¼8ÜHª§Û`ÅReÜ¼Òòe;p;u«fÓ}/}/¯9ôËïjÝ;ÀWÞ[¯fù¨i«aËè"ãô3@Zà§ìDK­ëuxåî»>l]óU&=@ó~yu±¸)z]ÿew=IÄµ½Â¼:4?¤Ê¤ºT)Ücò1§#Ã_ S×ûÆÆÔÜyx þiçEð¯=Å`WÿêDøÜèÍ3GÍ#Ëhºl´C´ñ§ª47ìÓÞJä¿kÕl2s=ÌI3¹&B§}ývíë`u¢=I<¯=Ml¦=Iç¹ÜjXÇùlj¾ÜE¿ò×lº=Iã÷¾FrÇò{&/6Zú6xQî#BKVBKBK"BFF=KWV=K§PË_ü¬ =OWW÷Þ¶ÁÃ=I«·L¬®(Å=H.&¾lýçCÝ×å÷¶6n©TyßÿCÑÞJ¿Ü_Ê¨¿t»q´éÿÈEaÄôK!B¶wbÒÏ}W´=g:ÿe=K ºÊGîÀù·Ê<-Åb)=K³åö®ñãÙzø3;=gØÓÖpW$üûÒYg°¸ª=@öl´$SÌ,ÃògHD0ýÞ57Agàµm=@¤8o+Ã=HP?ã¸ÚÙ´LjN#(sâþ0Ò7)Q=@ò±Î9½$ú^í(û5ç]bx5I#S&µjq_¤AetM.0k}pûtYÛ"Aóº§&Rìýöd K¸­boB$$aÀÒLÜÕ}æÿ´Ï=J´ã¦@Z®PG-è£År=JÈ=@E§S+Ný5êAPùúQ±ôHRQÛ®>RhíðÃ¥!§=J®ûð$BÆ/maqýÏ»ê%®ö®PÀYLÃÅÎ¬õIsXñv¨þï4/=KÿÍPx¹iÞzÒ=I°{p¬í*qGfýg=}GüõÖ=I¯³M<N%w._4ÈQ¼ôã;TÉÔÖñOnÔ±EKjÙâçí¡cÂ<G&U)=KÕ<täÿD«Ëò¦¾1£ÐÅÅ1þ#UÐ×0ÍË=KÓ¹ç¾5{´Mõ=M5gr­ùÕèÃ2B7ZÀB=}6 ÙÑÈÇ5Ä´bg|ÀbâP`r%¡Ê}"cû/$¯=KO­)Ì@ÏS¨ÉHiÓáG¯AÑÎ¤âY<Ü{75ë=IµYÒÏÓ#îL$=gÑl¹æÙº=}=I;´Ù¹¢õójefûhî~[ÒºÅåK¼ZÿdÛA t cèvpwh·`ÊSßÈÒ÷¦L/®N2±C¿Kýµ.Ï×FXCOe9KX-üeÜxö>CÃßlðR"Àý¶8ïCqr1~8ÐNÚé=÷©Ù-´O4Å/ãLÿXµ¾[ªLÁ¶Z(Ài¸¾Lz6w÷T~³Ýn=J:wßq`2£åoQ_-ã"ÐÄ=}>×&çê±ÞrÄ«Gä=I1~;u±7÷ÏÞÚ^ùhÒ)=T7*zé.þ¹{=I&UxÓ+=I2ªÈ­d¼=ø$.Ô~v§xx­ÕY7mýÕt*?ß~À¨¦ð°Â¡wÌzäü§1í·þ&G³.F)d{@}@³î[ÌZå-ÕNÔ~#ßjZè;}_PKq¸ê@=J£sB=M=LZ©¢}lËg%ÖoñNmÚ6=I¡-néyfèÂj*]IÔâÊÒèì0F{ÞÄ`L%Û¯ÔNÂò¡6$:WÝ:¼?0ù4lviÖ±ËHÀ-ë¶cDÊØè3ë­Á×tõ¶ê@=H¡;?$?Ýi(¡")tQüU3]Öõ®bnÐã®®Î<²¿é¯*åádô¹øR¨Çüm3ju8ª 7$2=`G7mûÕ26+çtÔ¨9áó-E4=êQ=Khf¥ßñÎIÍ§u¸a=g=LÂÅë{±HO]jÐêï®M+¯r=}w«ìð7æ(å¢ÒññØ»U #=I>¡ï´=K=gröì~xåøGÔ©!<À=g)òøN¨}V°Kí`¬~.>Ï¶½mÀÔ×î×Ê®74Et¹Xgx5^pC&n¤V{T¨mÔÿ?£íÚeÁÕ¨ùºâì¸Bn¤káÏ×+[Àqf¶ïÀ«òÀ6àð9Ñ·N®%NÐ+«­bÙb¸d=}"×HÔM¡5ËäÛ-/wLp=JÂ¤eNÆn=IáhNrßó~¿3`>õD,WîÎ(ë©_óhõ]ñ+¤¨wÎ0ÏzÆ>FT_üº{%Tà.p4í÷"ßjÏÞ%93éY(SÔ4rØ l^ÇbUÎ.­Fzøj@ä´gÑÅtUKèc=Kn=KýM=g^íÆÖ =K²=K«¡m`;Å6zÈó$¼èã+uf«=M2C¤êÑTPÍ!xÿù¶kü`ÔçXº`ÄµPRNüÆC§UÛò-Ø1©(IS?ïÕ×!ïËû×ðMÓÀpD66¸å^§MÙ¦«aPrj¾ß}«Òk{(rõÙú=@ýïÞ84ÊïÑNôå©>g¤©g7ªòv3~¢bÓ³Ïr·=gØ´Æ]ÚVL(à!é0êwíÎ_:F ¾¢E}?Å8eôiÃ#ÿ8Eüf¸­jk;(?%»¿ 8©ßßÕ=K=}bí"}5-êí|¼.íPõ³~óÈß0Òåíeð1ëBWÄÃr¿>ê=L£zÈëc¨æ^Ó4=}ójl@X¸|&>±ùá¾åmP*t"C$g¿SÞáÑ=L¾wÉ¬ûøiZ@=g¨þf QeÇ_@¡ÈØ5"U[­«¹ßË8è?Ï¢ùHk®[F÷ê_mÿ4ú¥aãV!CnlÛ¬f×9ÈT0ìIÐ9"ï÷­ùxÜ~WH¬uh]*Sp8§~rØU?Ù,ëÀ|Zî¢U14r?Ñ"§Ä®f:Åý çÛÀðhc=HaíÇê=J-Tµä{µòØb^Fò<W:ÉöX×?«Ñ{=H~ÇÙè_d$×#òÙrUIÞÑß=grõ½&²³xÛoIó=H·ìýô·=gC1îl[XhËö=M±#®tîfÁòTÆ¾+»oË¿C¹j¾§ík9%wv#×íá»ðã-Þ×[oÿ]°;ø(Kÿ?ßNÃ­RCº¢ßh{Ñ¬~SÄ½hÆ¡5Ï¥)wguµðfe§"ÔvKþöV°-ùó4I!±=IåZÅh¥ãé^³½UË2§é=K¤lJhä&°=JÊCö½*§môæ¹ýO=ýô/³tÎtEa$6Ð;âßh$±«Ìð¡ü°c[gwfRI½jRÍj÷=Hs8jRµßJOzQ"ôþÐ£ ½7(Hãé4{å¹Vwÿo¯ÂÃp@·=@=g*KÝëdëÖûéä[FFdÊ©Ö¨4L=¦·=L=¥³x=§»¤¼$¬^$¼&´~ä¼%°ndÜàrÆ¾ñlý= ¡òtü#êLÿ=Jv­òá8ñlaèd;)ÄFB·BaÌ^=LVxºKk»¤"^-È:äBn5=HÊûÛ>DVáÏ©;¿¿3æÁwçé´vj_Cªa(%Ç6$STd&Ð-¥=g8=Ly@Æ"ýG×8{=@QÎ=}Ú3©¾Ãª¹ý²NÇð[LÞ[+ìË÷p/"OóÅª?Røúø!±­»¤¼$¬^$¼&´~¼.Ü®ª@,â¢õ,ãáZ5û=L>ä>t³³ã²Áì=gçMnÛLû5{,"wrÄªA¨{º?¹µóª¯fÆn¢ÿ°ñ¶ÚC)óX}JQ&ß÷úM·', new Uint8Array(96365)))});

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
