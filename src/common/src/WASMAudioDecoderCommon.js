export default function WASMAudioDecoderCommon(caller) {
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
