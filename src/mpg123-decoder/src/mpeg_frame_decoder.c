//#include <stdio.h>
#include "mpeg_frame_decoder.h"

#define MIN(a, b) a < b ? a : b

int mpeg_frame_decoder_create(MPEGFrameDecoder **ptr, int enable_gapless) {
    MPEGFrameDecoder *decoder = malloc(sizeof(MPEGFrameDecoder));
    *ptr = decoder;

    int error_code = 0;

    decoder->mh = mpg123_new(NULL, &error_code);
    if (error_code) return error_code;

    error_code = mpg123_param(decoder->mh, MPG123_FLAGS, 
        MPG123_SKIP_ID3V2 |
        MPG123_PLAIN_ID3TEXT |
        MPG123_NO_PEEK_END |
        MPG123_NO_READAHEAD |
        MPG123_FORCE_STEREO |
        MPG123_QUIET, 0);
    if (error_code) return error_code;

    if (enable_gapless) {
        error_code = mpg123_param(decoder->mh, MPG123_ADD_FLAGS, MPG123_GAPLESS, 0);
        if (error_code) return error_code;
    }

    error_code = mpg123_open_feed(decoder->mh);
    if (error_code) return error_code;

    return error_code;
}

int mpeg_decoder_feed(
    MPEGFrameDecoder *decoder,
    const unsigned char *in,
    size_t in_size
) {
    return mpg123_feed(
        decoder->mh,
        in,
        in_size
    );
}

int mpeg_decoder_read(
    MPEGFrameDecoder *decoder,
    float *out,
    size_t out_size,
    size_t *samples_decoded,
    unsigned int *sample_rate,
    char **error_string_ptr
) {
    size_t bytes_decoded = 0;
    int error = mpg123_read(
        decoder->mh,
        (unsigned char *) decoder->pcm,
        MPEG_PCM_OUT_SIZE,
        &bytes_decoded
    );

    *samples_decoded = bytes_decoded / sizeof(float) / 2;

    // deinterleave
    int output_channels = 2; // TODO: remove force stereo
    for (int in_idx=(*samples_decoded * output_channels) -1; in_idx >= 0; in_idx--) {
      int sample = in_idx / output_channels;
      int channel = (in_idx % output_channels) * *samples_decoded;
      out[sample+channel] = decoder->pcm[in_idx];
    }
    
    if (error != MPG123_OK && error >= MPG123_ERR) {
        *error_string_ptr = error_messages[error + 1];
    } else if (error < -1) {
        // -12 MPG123_DONE
        // -11 MPG123_NEW_FORMAT
        // -10 MPG123_NEED_MORE
        // needed by MPEGDecoder.js
    } else {
        error = 0;
    }

    // MPG123_NEW_FORMAT, usually the start of a new stream, so read the sample rate
    mpg123_info(decoder->mh, &decoder->fr);
    *sample_rate = (int) decoder->fr.rate;

    return error;
}

void mpeg_frame_decoder_destroy(MPEGFrameDecoder *decoder) {
    mpg123_delete(decoder->mh);
    free(decoder);
};
