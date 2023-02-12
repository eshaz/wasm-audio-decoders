#include "pcm_decoder.h"

#define INVALID_FILE -1
#define UNSUPPORTED_FILE -2

__attribute__((import_module("env"), import_name("read_write"))) void read_write(int max_in_bytes, char *in, unsigned int *in_len, int max_out_bytes, char *out, unsigned int *out_len);
__attribute__((import_module("env"), import_name("error"))) void error(int error_code);

# define MIN(a, b) a < b ? a : b

// little-endian
#define READ_UINT_32(ptr) ((unsigned int) (ptr)[0] | ((ptr)[1] << 8) | ((ptr)[2] << 16) | ((ptr)[3] << 24))
#define READ_UINT_16(ptr) ((unsigned int) (ptr)[0] | ((ptr)[1] << 8))

// callback to tell JS to set input and write output
void yield(PCMDecoder *decoder) {
    unsigned int remaining_in = *decoder->in_len - decoder->in_pos;
    unsigned int max_in_bytes = decoder->in_size - remaining_in;
    char *in = decoder->in_data + remaining_in;

    unsigned int remaining_out = *decoder->out_len - decoder->out_pos;
    unsigned int max_out_bytes = decoder->out_size - remaining_out;
    char *out = decoder->out_data + remaining_out;

    // put any unread data at the beginning of the input buffer
    // this really shouldn't be more than a few bytes
    for (int i = 0; i < remaining_in; i++) {
        decoder->in_data[i] = decoder->in_data[decoder->in_pos + i];
    }

    // JS should set the new data at `in` and set the number of bytes written at `in_len`
    read_write(
        max_in_bytes,
        in,
        decoder->in_len,
        max_out_bytes,
        out,
        decoder->out_len
    );

    decoder->in_total += *decoder->in_len;
    *decoder->in_len += remaining_in;
    decoder->in_pos = 0;
}

void error_callback(int error_code) {
    error(error_code);
}

void detect_format(){}

/*
WAVE format based on https://sites.google.com/site/musicgapi/technical-documents/wav-file-format#formatvariations
*/
void parse_wave(PCMDecoder *decoder){
    if (*decoder->in_len - decoder->in_pos < 4) yield(decoder);
    decoder->in_pos+=4;

    unsigned int file_size;

    switch (READ_UINT_32(decoder->in_data + decoder->in_pos - 4)) {
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
    if (*decoder->in_len - decoder->in_pos < 4) yield(decoder);
    decoder->in_pos+=4;

    switch (READ_UINT_32(decoder->in_data + decoder->in_pos - 4)) {
        case 0x52494646: error_callback(INVALID_FILE); break; // cannot have two RIFF tags in succession
        case 0x666D7420: parse_wave_chunk_fmt(decoder); break;
        case 0x64617461: parse_wave_chunk_data(decoder); break;
        case 0x66616374: parse_wave_chunk_fact(decoder); break;
        case 0x7761766c: parse_wave_chunk_wavl(decoder); break;
        case 0x736C6E74: parse_wave_chunk_slnt(decoder); break;
        case 0x63756520: parse_wave_chunk_cue(decoder); break;
        case 0x706c7374: parse_wave_chunk_plst(decoder); break;
        case 0x6c697374: parse_wave_chunk_list(decoder); break;
        case 0x6C61626C: parse_wave_chunk_labl(decoder); break;
        case 0x6e6f7465: parse_wave_chunk_note(decoder); break;
        case 0x6c747874: parse_wave_chunk_ltxt(decoder); break;
        case 0x736d706c: parse_wave_chunk_smpl(decoder); break;
        case 0x696e7374: parse_wave_chunk_inst(decoder); break;
        default: error_callback(INVALID_FILE);
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
    if (*decoder->in_len - decoder->in_pos < 8) yield(decoder);

    unsigned int file_size = READ_UINT_32(decoder->in_data + decoder->in_pos) - 8;
    decoder->in_pos+=4;

    if(READ_UINT_32(decoder->in_data + decoder->in_pos) != 0x57415645) error_callback(UNSUPPORTED_FILE); // not a WAVE file
    decoder->in_pos+=4;

    return file_size;
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
    if (*decoder->in_len - decoder->in_pos < 16) yield(decoder);

    unsigned int chunk_size = READ_UINT_32(decoder->in_data + decoder->in_pos) - 16;
    decoder->in_pos+=4;

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
    while (chunk_size > 0) {
        decoder->in_pos = MIN(decoder->in_pos, chunk_size);
        chunk_size -= decoder->in_pos;

        if (*decoder->in_len == decoder->in_pos) yield(decoder);
    }
}

void parse_wave_chunk_data(PCMDecoder *decoder){
    if (*decoder->in_len - decoder->in_pos < 4) yield(decoder);

    unsigned int chunk_size = READ_UINT_32(decoder->in_data + decoder->in_pos);
    decoder->in_pos+=4;

    int block_size = *decoder->channels * *decoder->bit_depth;

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
}

void parse_wave_chunk_fact(PCMDecoder *decoder){}
void parse_wave_chunk_wavl(PCMDecoder *decoder){}
void parse_wave_chunk_slnt(PCMDecoder *decoder){}
void parse_wave_chunk_cue(PCMDecoder *decoder){}
void parse_wave_chunk_plst(PCMDecoder *decoder){}
void parse_wave_chunk_list(PCMDecoder *decoder){}
void parse_wave_chunk_labl(PCMDecoder *decoder){}
void parse_wave_chunk_ltxt(PCMDecoder *decoder){}
void parse_wave_chunk_note(PCMDecoder *decoder){}
void parse_wave_chunk_smpl(PCMDecoder *decoder){}
void parse_wave_chunk_inst(PCMDecoder *decoder){}

void aiff(){}

void init_decoder(
    PCMDecoder *decoder, // address to save decoder on heap
    unsigned int *decoder_size, // size of decoder
    unsigned int *sample_rate,
    unsigned int *channels,
    unsigned int *bit_depth,
    unsigned int *samples_decoded,
    unsigned int *in_len,
    char *in_data,
    unsigned int in_size,
    unsigned int *out_len,
    float *out_data,
    unsigned int out_size
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

    decoder->in_pos = 0;
    decoder->in_total = 0;
    decoder->in_size = in_size;
    decoder->out_pos = 0;
    decoder->out_total = 0;
    decoder->out_size = out_size;
}

void decode(PCMDecoder *decoder) {
    parse_wave(decoder);
}