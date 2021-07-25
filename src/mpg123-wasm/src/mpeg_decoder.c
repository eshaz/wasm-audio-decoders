#include "mpeg_decoder.h"

MPEGFrameDecoder *mpeg_decoder_create() {
    MPEGFrameDecoder decoder;
    decoder.mh = mpg123_new(NULL, NULL);
    mpg123_param(decoder.mh, MPG123_FLAGS, 
      MPG123_FORCE_STEREO |
      MPG123_NO_READAHEAD |
      MPG123_FORCE_ENDIAN, 0);
    mpg123_open_feed(decoder.mh);

    MPEGFrameDecoder *ptr = malloc(sizeof(decoder));
    *ptr = decoder;
    return ptr;
}

// unpack method for retrieving data in little endian
// increments index i by the number of bytes unpacked
// usage:
//   int i = 0;
//   float x = unpackFloat(&buffer[i], &i);
//   float y = unpackFloat(&buffer[i], &i);
//   float z = unpackFloat(&buffer[i], &i);
float unpackFloat(const void *buf) {
    const unsigned char *b = (const unsigned char *)buf;
    uint32_t temp = 0;
    temp = ((b[3] << 24) |
            (b[2] << 16) |
            (b[1] <<  8) |
             b[0]);
    return *((float *) &temp);
}


// left and right should be able to store frame_size*channels*sizeof(float) 
// frame_size should be the maximum packet duration (120ms; 5760 for 48kHz)
int mpeg_decode_float_deinterleaved(MPEGFrameDecoder *decoder, unsigned char *in, size_t in_size, float *left, float *right) {
    size_t bytes_decoded = 0;

    int mpg123_error_code = mpg123_decode(decoder->mh, in, in_size, decoder->pcm, 1152*20*2*sizeof(float), &bytes_decoded);

    int samples_decoded = bytes_decoded / sizeof(float) / 2;

    for (size_t i=0; i<samples_decoded; i++) {

        //memcpy(&left[i], &decoder->pcm[i*8], sizeof(float));
        //memcpy(&right[i], &decoder->pcm[i*8+1], sizeof(float));

        left[i] =  unpackFloat(&decoder->pcm[i*8]);
        right[i] = unpackFloat(&decoder->pcm[i*8+4]);


        //left[i] =  decoder->pcm[i*2];
        //right[i] = decoder->pcm[i*2+1];
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
