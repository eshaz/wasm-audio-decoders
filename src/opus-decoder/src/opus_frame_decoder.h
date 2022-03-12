#include <stdlib.h>
#include <opus_multistream.h>

typedef struct {
    int pre_skip;
    int channels;
    float *pcm; //frame_size*channels*sizeof(float)
    int *errors;
    OpusMSDecoder *st;
} OpusFrameDecoder;

OpusFrameDecoder *opus_frame_decoder_create(int channels, int streams, int coupled_streams, unsigned char *mapping, int preSkip);

int opus_frame_decode_float_deinterleaved(OpusFrameDecoder *decoder, unsigned char *in, opus_int32 in_len, float *out);

void opus_frame_decoder_destroy(OpusFrameDecoder *st);
