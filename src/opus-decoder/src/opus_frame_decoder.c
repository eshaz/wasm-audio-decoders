#include "opus_frame_decoder.h"
// #include "stdio.h"

/*
  *** Opus stereo downmix code copied from opusfile. ***
  See: https://github.com/xiph/opusfile/blob/cf218fb54929a1f54e30e2cb208a22d08b08c889/src/opusfile.c#L2982

  Copyright (c) 1994-2013 Xiph.Org Foundation and contributors

  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions
  are met:
  
  - Redistributions of source code must retain the above copyright
  notice, this list of conditions and the following disclaimer.
  
  - Redistributions in binary form must reproduce the above copyright
  notice, this list of conditions and the following disclaimer in the
  documentation and/or other materials provided with the distribution.
  
  - Neither the name of the Xiph.Org Foundation nor the names of its
  contributors may be used to endorse or promote products derived from
  this software without specific prior written permission.
  
  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
  ``AS IS'' AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
  LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
  A PARTICULAR PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL THE FOUNDATION
  OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
  SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
  LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
  DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
  THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
  OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

  Matrices for downmixing from the supported channel counts to stereo.
  The matrices with 5 or more channels are normalized to a total volume of 2.0,
  since most mixes sound too quiet if normalized to 1.0 (as there is generally
  little volume in the side/rear channels).
*/

#define MAX_FORCE_STEREO_CHANNELS 8

static const float OP_STEREO_DOWNMIX[MAX_FORCE_STEREO_CHANNELS-2][MAX_FORCE_STEREO_CHANNELS][2]={
  /*3.0*/
  {
    {0.5858F,0.0F},{0.4142F,0.4142F},{0.0F,0.5858F}
  },
  /*quadrophonic*/
  {
    {0.4226F,0.0F},{0.0F,0.4226F},{0.366F,0.2114F},{0.2114F,0.336F}
  },
  /*5.0*/
  {
    {0.651F,0.0F},{0.46F,0.46F},{0.0F,0.651F},{0.5636F,0.3254F},
    {0.3254F,0.5636F}
  },
  /*5.1*/
  {
    {0.529F,0.0F},{0.3741F,0.3741F},{0.0F,0.529F},{0.4582F,0.2645F},
    {0.2645F,0.4582F},{0.3741F,0.3741F}
  },
  /*6.1*/
  {
    {0.4553F,0.0F},{0.322F,0.322F},{0.0F,0.4553F},{0.3943F,0.2277F},
    {0.2277F,0.3943F},{0.2788F,0.2788F},{0.322F,0.322F}
  },
  /*7.1*/
  {
    {0.3886F,0.0F},{0.2748F,0.2748F},{0.0F,0.3886F},{0.3366F,0.1943F},
    {0.1943F,0.3366F},{0.3366F,0.1943F},{0.1943F,0.3366F},{0.2748F,0.2748F}
  }
};

static float* stereo_downmix(OpusFrameDecoder *decoder, float *pcm, int samples_decoded) {
  if (decoder->channels == 1) {
    for(int i=0; i<samples_decoded; i++)
      decoder->stereo_buffer[2*i+0] = decoder->stereo_buffer[2*i+1] = pcm[i];
  } else {
    for(int i=0; i<samples_decoded; i++) {
      float l = 0;
      float r = 0;
      
      for(int ci=0; ci<decoder->channels; ci++){
        l += OP_STEREO_DOWNMIX[decoder->channels-3][ci][0]*pcm[decoder->channels*i+ci];
        r += OP_STEREO_DOWNMIX[decoder->channels-3][ci][1]*pcm[decoder->channels*i+ci];
      }
      decoder->stereo_buffer[2*i+0] = l;
      decoder->stereo_buffer[2*i+1] = r;
    }
  }

  return decoder->stereo_buffer;
}

OpusFrameDecoder *opus_frame_decoder_create(int sample_rate, int channels, int streams, int coupled_streams, unsigned char *mapping, int pre_skip, int force_stereo) {
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
    decoder.output_channels = channels;
    decoder.force_stereo = force_stereo;
    
    if (decoder.force_stereo) {
      decoder.stereo_buffer = malloc(5760*2*sizeof(float));
      decoder.output_channels = 2;
    }

    decoder.pcm = malloc(5760*channels*sizeof(float));
    decoder.st = opus_multistream_decoder_create(
      sample_rate, 
      channels, 
      streams, 
      coupled_streams, 
      mapping, 
      decoder.errors
    );
    opus_multistream_decoder_ctl(decoder.st, OPUS_SET_COMPLEXITY(10));

    OpusFrameDecoder *ptr = malloc(sizeof(decoder));
    *ptr = decoder;
    return ptr;
}

// out should be able to store frame_size*channels*sizeof(float) 
// frame_size should be the maximum packet duration (120ms; 5760 for 48kHz)
#define MAX_PACKET_DURATION_MS 5760

int opus_frame_decode_float_deinterleaved(OpusFrameDecoder *decoder, unsigned char *in, opus_int32 in_len, float *out) {
    int samples_decoded = opus_multistream_decode_float(
      decoder->st, 
      in, 
      in_len, 
      decoder->pcm, 
      MAX_PACKET_DURATION_MS, 
      0 // disable forward error correction
    );

    if (samples_decoded <= 0) return samples_decoded;

    float *pcm = decoder->pcm;

    // do not return the pre_skip samples
    if (decoder->pre_skip > 0) {
      decoder->pre_skip -= samples_decoded;

      // more preskip samples than samples decoded, nothing to return
      if (decoder->pre_skip > 0) return 0;

      // offset input by remaining preskip
      pcm = decoder->pcm + (decoder->pre_skip + samples_decoded) * decoder->channels;
      // set samples to decode
      samples_decoded = -decoder->pre_skip;
    }
    
    // downmix to stereo
    if (decoder->force_stereo) {
      pcm = stereo_downmix(decoder, pcm, samples_decoded);
    } 

    // deinterleave
    for (int in_idx=(samples_decoded * decoder->output_channels) -1; in_idx >= 0; in_idx--) {
      int sample = in_idx / decoder->output_channels;
      int channel = (in_idx % decoder->output_channels) * samples_decoded;
      out[sample+channel] = pcm[in_idx];
    }

    return samples_decoded;
}

void opus_frame_decoder_destroy(OpusFrameDecoder *decoder) {
    opus_multistream_decoder_destroy(decoder->st);
    free(decoder);
};
