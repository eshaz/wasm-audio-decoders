#include <stdlib.h>
#include <mpg123.h>

typedef struct {
    // stores the interleaved PCM result
    int *errors;
    unsigned char pcm[1152*20*2*sizeof(float)]; //max_mpeg_frame_size*bit_reservoir*channels*sizeof(float)
    mpg123_handle *mh;
    struct mpg123_frameinfo fr;
} MPEGFrameDecoder;

// sample rate should almost always be 48000
MPEGFrameDecoder *mpeg_decoder_create();

// left and right should be able to store frame_size*channels*sizeof(float) 
// frame_size should be the maximum packet duration (120ms; 5760 for 48kHz)
int mpeg_decode_float_deinterleaved(MPEGFrameDecoder *st, unsigned char *in, size_t in_size, float *left, float *right);

void mpeg_decoder_destroy(MPEGFrameDecoder *st);
