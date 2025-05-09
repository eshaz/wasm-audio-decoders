#include <stdlib.h>
#include <opus_multistream.h>

typedef struct {
    int pre_skip;
    int channels;
    int output_channels;
    int force_stereo;
    float *stereo_buffer; //frame_size*2*sizeof(float)
    float *pcm; //frame_size*channels*sizeof(float)
    int *errors;
    OpusMSDecoder *st;
} OpusMLFrameDecoder;

OpusMLFrameDecoder *opus_ml_frame_decoder_create(int sample_rate, int channels, int streams, int coupled_streams, unsigned char *mapping, int preSkip, int complexity, int force_stereo);

int opus_ml_frame_decode_float_deinterleaved(OpusMLFrameDecoder *decoder, unsigned char *in, opus_int32 in_len, float *out);

void opus_ml_frame_decoder_destroy(OpusMLFrameDecoder *st);
