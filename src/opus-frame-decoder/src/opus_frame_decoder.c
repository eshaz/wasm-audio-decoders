#include "opus_frame_decoder.h"

OpusFrameDecoder *opus_frame_decoder_create() {
    OpusFrameDecoder decoder;
    decoder.st = opus_decoder_create(48000, 2, decoder.errors);

    OpusFrameDecoder *ptr = malloc(sizeof(decoder));
    *ptr = decoder;
    return ptr;
}

// left and right should be able to store frame_size*channels*sizeof(float) 
// frame_size should be the maximum packet duration (120ms; 5760 for 48kHz)
int opus_frame_decode_float_deinterleaved(OpusFrameDecoder *decoder, unsigned char *data, opus_int32 data_len, float *left, float *right) {
    int samples_decoded = opus_decode_float(decoder->st, data, data_len, decoder->pcm, 5760, 0);

    for (int i=samples_decoded-1; i>=0; i--) {
      left[i] =  decoder->pcm[i*2];
      right[i] = decoder->pcm[i*2+1];
    }

    return samples_decoded;
}

void opus_frame_decoder_destroy(OpusFrameDecoder *decoder) {
    opus_decoder_destroy(decoder->st);
    free(decoder);
};
