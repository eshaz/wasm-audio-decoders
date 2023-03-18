#include "pcm_decoder.h"

#define INVALID_FILE -1
#define UNSUPPORTED_FILE -2

__attribute__((import_module("env"), import_name("read_write"))) void read_write(
    unsigned int in_offset,
    unsigned int max_in_bytes,
    unsigned int out_offset,
    unsigned int max_out_bytes
);
__attribute__((import_module("env"), import_name("error"))) void error(int error_code);
__attribute__((import_module("env"), import_name("info"))) void info(unsigned int num_messages, char **messages);
__attribute__((import_module("env"), import_name("info_int"))) void info_int(int value);

# define MIN(a, b) a < b ? a : b

// little-endian
#define READ_UINT_32(ptr) ((unsigned int) (ptr)[0] | ((ptr)[1] << 8) | ((ptr)[2] << 16) | ((ptr)[3] << 24))
#define READ_UINT_16(ptr) ((unsigned short) (ptr)[0] | ((ptr)[1] << 8))

// big-endian
#define READ_UINT_32_BE(ptr) ((unsigned int) (ptr)[3] | ((ptr)[2] << 8) | ((ptr)[1] << 16) | ((ptr)[0] << 24))
#define READ_UINT_16_BE(ptr) ((unsigned short) (ptr)[1] | ((ptr)[0] << 8))

// callback to tell JS to set input and write output
void yield(PCMDecoder *decoder, unsigned int min_read_bytes) {
    unsigned int in_remaining = *decoder->in_len - decoder->in_pos;

    if (in_remaining >= min_read_bytes && min_read_bytes) {
        return;
    }
    
    int in_offset = in_remaining;

    // put any unread data at the beginning of the input buffer
    // this really shouldn't be more than a few bytes
    __builtin_memcpy(decoder->in_data, decoder->in_data + decoder->in_pos, in_remaining);
    /*
    for (int i = 0; i < in_remaining; i++) {
        decoder->in_data[i] = decoder->in_data[decoder->in_pos + i];
    }
    */

    // read more data until min_read_bytes is satisfied
    do {
        int max_in_bytes = decoder->in_size - in_offset;
    
        int out_remaining = *decoder->out_len - decoder->out_pos;
        int max_out_bytes = decoder->out_size - out_remaining;
    
        // JS should set the new data at `in` and set the number of bytes written at `in_len`
        read_write(
            in_offset,
            max_in_bytes,
            out_remaining,
            max_out_bytes
        );

        in_offset += *decoder->in_len;
    } while (min_read_bytes > in_offset);

    *decoder->in_len = in_offset;
    decoder->in_total += in_offset;
    decoder->in_pos = 0;
}

void error_callback(int error_code) {
    error(error_code);
}

void detect_format(){}

void parse_wave_chunk_name(PCMDecoder *decoder, char *chunk) {
    yield(decoder, 4);
    decoder->in_pos+=4;

    chunk[0] = *(decoder->in_data + decoder->in_pos - 4);
    chunk[1] = *(decoder->in_data + decoder->in_pos - 3);
    chunk[2] = *(decoder->in_data + decoder->in_pos - 2);
    chunk[3] = *(decoder->in_data + decoder->in_pos - 1);

    char code[5] = {chunk[0], chunk[1], chunk[2], chunk[3], 0};
    char *messages[1] = {code};
    info(1, messages);
}

unsigned int parse_wave_chunk_size(PCMDecoder *decoder) {
    yield(decoder, 4);

    unsigned chunk_size = READ_UINT_32(decoder->in_data + decoder->in_pos);
    decoder->in_pos+=4;

    char message[13] = "Chunk size: ";
    char *messages[1] = {message};
    info(1, messages);
    info_int((int) chunk_size);

    return chunk_size;
}

/*
WAVE format based on https://sites.google.com/site/musicgapi/technical-documents/wav-file-format#formatvariations
*/
void parse_wave(PCMDecoder *decoder){
    char chunk[4];
    parse_wave_chunk_name(decoder, chunk);
    unsigned int chunk_code = READ_UINT_32_BE(chunk);

    unsigned int file_size;

    switch (chunk_code) {
        case 0x52494646:
          file_size = parse_wave_chunk_riff(decoder);
          break;
        default: error_callback(INVALID_FILE);
    }

    unsigned int read_until = file_size + decoder->in_total;

    while (read_until > decoder->in_total) {
        parse_wave_chunk(decoder);
    }

    // after reading all data
    // if there is more data, maybe there is another wave file, reset and continue parsing
    // else return
}

void parse_wave_chunk(PCMDecoder *decoder) {
    char chunk[4];
    parse_wave_chunk_name(decoder, chunk);
    unsigned int chunk_code = READ_UINT_32_BE(chunk);

    switch (chunk_code) {
        case 0x52494646: error_callback(INVALID_FILE); break; // cannot have two RIFF tags in succession
        case 0x666D7420: parse_wave_chunk_fmt(decoder); break;
        case 0x64617461: parse_wave_chunk_data(decoder); break;
        case 0x66616374: parse_wave_chunk_unknown(chunk, decoder); break; // fact
        case 0x7761766c: parse_wave_chunk_unknown(chunk, decoder); break; // wavl
        case 0x736C6E74: parse_wave_chunk_unknown(chunk, decoder); break; // slnt
        case 0x63756520: parse_wave_chunk_unknown(chunk, decoder); break; // cue
        case 0x706c7374: parse_wave_chunk_unknown(chunk, decoder); break; // plst
        case 0x6c697374: parse_wave_chunk_unknown(chunk, decoder); break; // list
        case 0x6C61626C: parse_wave_chunk_unknown(chunk, decoder); break; // labl
        case 0x6e6f7465: parse_wave_chunk_unknown(chunk, decoder); break; // note
        case 0x6c747874: parse_wave_chunk_unknown(chunk, decoder); break; // ltxt
        case 0x736d706c: parse_wave_chunk_unknown(chunk, decoder); break; // smpl
        case 0x696e7374: parse_wave_chunk_unknown(chunk, decoder); break; // inst
        default: parse_wave_chunk_unknown(chunk, decoder);
    }
}

unsigned int parse_wave_chunk_riff(PCMDecoder *decoder){
    /*
    Offset Size  Description      Value
    0x00   4     Chunk ID         "RIFF" (0x52494646)
    0x04   4     Chunk Data Size  (file size) - 8
    0x08   4     RIFF Type        "WAVE" (0x57415645)
    0x10   -     Wave chunks      -
    */
    yield(decoder, 8);

    unsigned int file_size = READ_UINT_32(decoder->in_data + decoder->in_pos) - 8;
    decoder->in_pos+=4;

    if(READ_UINT_32_BE(decoder->in_data + decoder->in_pos) != 0x57415645) error_callback(UNSUPPORTED_FILE); // not a WAVE file
    decoder->in_pos+=4;

    return file_size;
}

void skip_data(PCMDecoder *decoder, unsigned int bytes_remaining) {
    unsigned int max_bytes = MIN(*decoder->in_len - decoder->in_pos, bytes_remaining);

    decoder->in_pos += max_bytes;
    bytes_remaining -= max_bytes;

    while (bytes_remaining) {
        yield(decoder, 0);

        max_bytes = MIN(*decoder->in_len - decoder->in_pos, bytes_remaining);

        decoder->in_pos += max_bytes;
        bytes_remaining -= max_bytes;
    }
}

void parse_wave_chunk_fmt(PCMDecoder *decoder) {
    /*
    Offset  Size  Description                  Value
    0x00    4     Chunk ID                     "fmt " (0x666D7420)
    0x04    4     Chunk Data Size              16 + extra format bytes
    0x08    2     Compression code             1 - 65,535
    0x0a    2     Number of channels           1 - 65,535
    0x0c    4     Sample rate                  1 - 0xFFFFFFFF
    0x10    4     Average bytes per second     1 - 0xFFFFFFFF
    0x14    2     Block align                  1 - 65,535
    0x16    2     Significant bits per sample  2 - 65,535
    0x18    2     Extra format bytes           0 - 65,535
    0x1a    -     Extra format bytes *         -
    */
    unsigned int chunk_size = parse_wave_chunk_size(decoder) - 16;

    yield(decoder, 16);
    /*
    Compression Codes
    Code        Description
    (0x0000)    Unknown
    (0x0001)    PCM/uncompressed
    (0x0002)    Microsoft ADPCM
    (0x0006)    ITU G.711 a-law
    (0x0007)    ITU G.711 Âµ-law
    (0x0011)    IMA ADPCM
    (0x0016)    ITU G.723 ADPCM (Yamaha)
    (0x0031)    GSM 6.10
    (0x0040)    ITU G.721 ADPCM
    (0x0050)    MPEG
    (0xFFFF)    Experimental
    */
    // only raw PCM supported
    if (READ_UINT_16(decoder->in_data + decoder->in_pos) != 1) error_callback(UNSUPPORTED_FILE);
    decoder->in_pos+=2;

    // channels
    *decoder->channels = READ_UINT_16(decoder->in_data + decoder->in_pos);
    decoder->in_pos+=2;

    // sample rate, bytes per second (ignore), block align (ignore)
    *decoder->sample_rate = READ_UINT_32(decoder->in_data + decoder->in_pos);
    decoder->in_pos+=10;

    // bit depth
    *decoder->bit_depth = READ_UINT_16(decoder->in_data + decoder->in_pos);
    decoder->in_pos+=2;

    // extra bytes (ignore)
    skip_data(decoder, chunk_size);
}

// integer to float divisors
#define divisor_32 (float) 0x7FFFFFFF;
#define divisor_24 (float) 0x7FFFFF;
#define divisor_16 (float) 0x7FFF;
#define divisor_8 (float) 0x7F;

// simd
#include <wasm_simd128.h>

typedef float float4 __attribute__((__vector_size__(16)));
#define float4_size 4
#define float_to_float4(vec) wasm_f32x4_splat(vec)
#define load_int_to_float4(ptr, vec, offset) \
    wasm_v128_load32_lane(ptr, vec, 0); \
    wasm_v128_load32_lane(ptr+offset, vec, 1); \
    wasm_v128_load32_lane(ptr+offset*2, vec, 2); \
    wasm_v128_load32_lane(ptr+offset*3, vec, 3); \
    wasm_f32x4_convert_i32x4(vec)
#define divide_float4(vec, divisor) wasm_f32x4_div(vec, divisor)
#define store_float4(ptr, vec) wasm_v128_store(ptr, vec)


void parse_wave_chunk_data(PCMDecoder *decoder) {
    unsigned int chunk_size = parse_wave_chunk_size(decoder);

    // read all data until chunk size is exhausted
    unsigned int block_size = *decoder->channels * *decoder->bit_depth;
    unsigned int channel_offset = decoder->out_size / *decoder->channels;

    float out;
    float divisor;
    switch (*decoder->bit_depth) {
        case 8: divisor = divisor_8; break;
        case 16: divisor = divisor_16; break;
        case 24: divisor = divisor_24; break;
        case 32: divisor = divisor_32; break;
    }

    float4 out_4 = float_to_float4(0);
    float4 divisor_4 = float_to_float4(divisor);
    unsigned int simd_block_size = block_size * float4_size;
    unsigned int start;
    unsigned int total_read;

    while (chunk_size) {
        yield(decoder, block_size);
        start = decoder->in_pos;

        // read simd
        /*
        total_read = *decoder->in_len - simd_block_size;
        while (decoder->in_pos <= total_read) {
            for (int channel = 0; channel < *decoder->channels; channel++) {
                load_int_to_float4(decoder->in_data + decoder->in_pos + channel, out_4, block_size);
                divide_float4(out_4, divisor_4);

                unsigned int ptr_offset = sizeof(float) * (decoder->out_pos + channel * channel_offset);
                store_float4(decoder->out_data + ptr_offset, out_4);
            }

            decoder->in_pos += simd_block_size;
        }
        */

        // read any remaining data
        total_read = *decoder->in_len - block_size;
        while (decoder->in_pos < total_read) {
            for (int channel = 0; channel < *decoder->channels; channel++) {
                decoder->out_data[decoder->out_pos + channel * channel_offset] = ((float) decoder->in_data[channel * channel_offset]) / divisor;
            }

            decoder->in_pos += block_size;
            //info_int(decoder->in_pos);
        }

        chunk_size -= decoder->in_pos - start;
    }

    // if samples are odd, then padding byte will exist at end of chunk
   // if (!(block_size / 8 % 2)) skip_data(decoder, 1);

/*
    while (chunk_size > 0) {
        unsigned int samples = (*decoder->in_len - decoder->in_pos) / *decoder->channels;
        unsigned int bytes_per_sample = *decoder->bit_depth / 8;

        for (
            unsigned int c = 0, channel_offset = 0;
            c < *decoder->channels;
            c++, channel_offset+=samples
        ) {
            for (int s = 0; s < samples; s++) {
            }
        }
        decoder->in_pos = MIN(decoder->in_pos, chunk_size);
        chunk_size -= decoder->in_pos;

        // read channels using SIMD in multiples of block size
        // output data

        if (*decoder->in_len == decoder->in_pos) yield(decoder);
    }
    */
}

void parse_wave_chunk_unknown(char *chunk_code, PCMDecoder *decoder) {
    unsigned int chunk_size = parse_wave_chunk_size(decoder);

    skip_data(decoder, chunk_size);
}

void init_decoder(
    PCMDecoder *decoder, // address to save decoder on heap
    unsigned int *decoder_size, // size of decoder
    unsigned int *sample_rate,
    unsigned short *channels,
    unsigned short *bit_depth,
    unsigned int *samples_decoded,
    unsigned int *in_len,
    unsigned int in_size,
    unsigned char *in_data,
    unsigned int *out_len,
    unsigned int out_size,
    float *out_data
) {
    *decoder_size = sizeof(*decoder);

    decoder->sample_rate = sample_rate;
    decoder->channels = channels;
    decoder->bit_depth = bit_depth;
    decoder->samples_decoded = samples_decoded;
    decoder->in_len = in_len;
    decoder->in_data = in_data;
    decoder->out_len = out_len;
    decoder->out_data = out_data;

    *decoder->sample_rate = 0;
    *decoder->channels = 0;
    *decoder->bit_depth = 0;
    *decoder->samples_decoded = 0;

    *decoder->in_len = 0;
    decoder->in_pos = 0;
    decoder->in_total = 0;
    decoder->in_size = in_size;

    *decoder->out_len = 0;
    decoder->out_pos = 0;
    decoder->out_total = 0;
    decoder->out_size = out_size;
}

void decode(PCMDecoder *decoder) {
    parse_wave(decoder);
}