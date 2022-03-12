#include "opus_frame_decoder.h"

OpusFrameDecoder *opus_frame_decoder_create(int channels, int streams, int coupled_streams, unsigned char *mapping) {
    OpusFrameDecoder decoder;
    decoder.channels = channels;
    decoder.pcm = malloc(5760*channels*sizeof(float));
    decoder.st = opus_multistream_decoder_create(48000, channels, streams, coupled_streams, mapping, decoder.errors);

    OpusFrameDecoder *ptr = malloc(sizeof(decoder));
    *ptr = decoder;
    return ptr;
}

// out should be able to store frame_size*channels*sizeof(float) 
// frame_size should be the maximum packet duration (120ms; 5760 for 48kHz)
int opus_frame_decode_float_deinterleaved(OpusFrameDecoder *decoder, unsigned char *data, opus_int32 data_len, float *out) {
    int samples_decoded = opus_multistream_decode_float(decoder->st, data, data_len, decoder->pcm, 5760, 0);

    for (int in_idx=(samples_decoded*decoder->channels)-1; in_idx>=0; in_idx--) {
      int sample = in_idx/decoder->channels;
      int channel = (in_idx%decoder->channels)*samples_decoded;
      out[sample+channel] = decoder->pcm[in_idx];
    }

    return samples_decoded;
}

void opus_frame_decoder_destroy(OpusFrameDecoder *decoder) {
    opus_multistream_decoder_destroy(decoder->st);
    free(decoder);
};
