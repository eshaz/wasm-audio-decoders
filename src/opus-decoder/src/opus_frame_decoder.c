#include "opus_frame_decoder.h"
// #include "stdio.h"

OpusFrameDecoder *opus_frame_decoder_create(int channels, int streams, int coupled_streams, unsigned char *mapping, int pre_skip) {
    /*fprintf(stdout, "\nparams: ");
    for (int i = 0; i < sizeof(op->data); i++) {
      fprintf(stdout, "0x%02x ", op->data[i]);
    }
    fprintf(stdout, "\n");
    fprintf(stdout, "mapping: ");
    for (int i = 0; i < op->params.channels; i++) {
      fprintf(stdout, "0x%02x ", op->params.mapping[i]);
    }
    fprintf(stdout, "\nmapping ptr: %d\npreskip: %d\nchannels: %d\nstream_count: %d\ncoupled_stream_count: %d\n",
      op->params.mapping,
      op->params.pre_skip,
      op->params.channels,
      op->params.stream_count,
      op->params.coupled_stream_count
    );*/

    OpusFrameDecoder decoder;
    decoder.pre_skip = pre_skip;
    decoder.channels = channels;
    decoder.pcm = malloc(5760*channels*sizeof(float));
    decoder.st = opus_multistream_decoder_create(
      48000, 
      channels, 
      streams, 
      coupled_streams, 
      mapping, 
      decoder.errors
    );

    OpusFrameDecoder *ptr = malloc(sizeof(decoder));
    *ptr = decoder;
    return ptr;
}

// out should be able to store frame_size*channels*sizeof(float) 
// frame_size should be the maximum packet duration (120ms; 5760 for 48kHz)
int opus_frame_decode_float_deinterleaved(OpusFrameDecoder *decoder, unsigned char *in, opus_int32 in_len, float *out) {
    int samples_decoded = opus_multistream_decode_float(
      decoder->st, 
      in, 
      in_len, 
      decoder->pcm, 
      5760, 
      0
    );

    if (samples_decoded < 0) return samples_decoded;

    // do not return the pre_skip samples
    if (decoder->pre_skip > 0) {
      decoder->pre_skip -= samples_decoded;
      samples_decoded = decoder->pre_skip < 0 ? -decoder->pre_skip : 0;
    }

    // deinterleave
    for (int in_idx=(samples_decoded * decoder->channels) -1; in_idx >= 0; in_idx--) {
      int sample = in_idx / decoder->channels;
      int channel = (in_idx % decoder->channels) * samples_decoded;
      out[sample+channel] = decoder->pcm[in_idx];
    }

    return samples_decoded;
}

void opus_frame_decoder_destroy(OpusFrameDecoder *decoder) {
    opus_multistream_decoder_destroy(decoder->st);
    free(decoder);
};
