#include <stdlib.h>
#include <opus_multistream.h>

typedef struct {
    // stores the interleaved PCM result
    int channels;
    float *pcm; //frame_size*channels*sizeof(float)
    int *errors;
    OpusMSDecoder *st;
} OpusFrameDecoder;

// sample rate should almost always be 48000
OpusFrameDecoder *opus_frame_decoder_create(int channels, int streams, int coupled_streams, unsigned char *mapping);

// left and right should be able to store frame_size*channels*sizeof(float) 
// frame_size should be the maximum packet duration (120ms; 5760 for 48kHz)
int opus_frame_decode_float_deinterleaved(OpusFrameDecoder *st, unsigned char *data, opus_int32 data_len, float *out);

void opus_frame_decoder_destroy(OpusFrameDecoder *st);
