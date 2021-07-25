#include "mpeg_decoder.h"

MPEGFrameDecoder *mpeg_decoder_create() {
    MPEGFrameDecoder decoder;
    decoder.mh = mpg123_new(NULL, NULL);
    mpg123_param(decoder.mh, MPG123_FLAGS, 
      MPG123_FORCE_STEREO |
      MPG123_FORCE_ENDIAN, 0);
    mpg123_open_feed(decoder.mh);

    MPEGFrameDecoder *ptr = malloc(sizeof(decoder));
    *ptr = decoder;
    return ptr;
}

// left and right should be able to store frame_size*channels*sizeof(float) 
// frame_size should be the maximum packet duration (120ms; 5760 for 48kHz)
int mpeg_decode_float_deinterleaved(MPEGFrameDecoder *decoder, unsigned char *in, size_t in_size, float *left, float *right) {
    size_t bytes_decoded = 0;

    int mpg123_error_code = mpg123_decode(decoder->mh, in, in_size, decoder->pcm, 1152*20*2*sizeof(float), &bytes_decoded);

    int samples_decoded = bytes_decoded / sizeof(float) / 2;

    for (int i=samples_decoded-1; i>=0; i--) {
        unsigned char *left_ptr = (unsigned char *) &left[i];
        left_ptr[0] = decoder->pcm[i*8];
        left_ptr[1] = decoder->pcm[i*8+1];
        left_ptr[2] = decoder->pcm[i*8+2];
        left_ptr[3] = decoder->pcm[i*8+3];

        unsigned char *right_ptr = (unsigned char *) &right[i];
        right_ptr[0] = decoder->pcm[i*8+4];
        right_ptr[1] = decoder->pcm[i*8+5];
        right_ptr[2] = decoder->pcm[i*8+6];
        right_ptr[3] = decoder->pcm[i*8+7];
    }

    return samples_decoded;
}

long mpeg_get_sample_rate(MPEGFrameDecoder *decoder) {
    mpg123_info(decoder->mh, &decoder->fr);
    
    return decoder->fr.rate;
}

void mpeg_decoder_destroy(MPEGFrameDecoder *decoder) {
    mpg123_delete(decoder->mh);
    free(decoder->mh);
    free(decoder);
};
