// #include <stdio.h>
#include "mpeg_frame_decoder.h"

int mpeg_frame_decoder_create(MPEGFrameDecoder **ptr, int enable_gapless) {
    int error_code = 0;
    MPEGFrameDecoder decoder;

    decoder.mh = mpg123_new(NULL, &error_code);
    if (error_code) return error_code;

    mpg123_param(decoder.mh, MPG123_FLAGS, 
        MPG123_SKIP_ID3V2 |
        MPG123_PLAIN_ID3TEXT |
        MPG123_NO_PEEK_END |
        MPG123_NO_READAHEAD |
        MPG123_FORCE_STEREO |
        MPG123_QUIET, 0);
    if (enable_gapless) mpg123_param(decoder.mh, MPG123_ADD_FLAGS, MPG123_GAPLESS, 0);

    error_code = mpg123_open_feed(decoder.mh);
    if (error_code) return error_code;

    *ptr = malloc(sizeof(decoder));
    **ptr = decoder;
    return error_code;
}

int mpeg_decode_interleaved(
    MPEGFrameDecoder *decoder, // mpg123 decoder handle
    unsigned char *in, // input data
    size_t in_size, // input data size
    unsigned int *in_read_pos, // pointer to save the total bytes read from input buffer
    size_t in_read_chunk_size, // interval of bytes to read from input data
    float *out, // pointer to save the output
    size_t decode_buffer_size, // output audio buffer size
    unsigned int *samples_decoded, // pointer to save samples decoded
    unsigned int *sample_rate, // pointer to save the sample rate
    char **error_string_ptr // error string
) {
    in_read_chunk_size = in_size > in_read_chunk_size ? in_read_chunk_size : in_size;
    int error_code;

    while (*in_read_pos + in_read_chunk_size <= in_size && *samples_decoded < decode_buffer_size) {
        size_t bytes_decoded = 0;

        error_code = mpg123_decode(
            decoder->mh,
            in + *in_read_pos,
            in_read_chunk_size,
            decoder->pcm.bytes,
            MPEG_PCM_OUT_SIZE,
            &bytes_decoded
        );
    
        int current_samples_decoded = bytes_decoded / sizeof(float) / 2;
    
        // deinterleave pcm
        for (int i=current_samples_decoded-1; i>=0; i--) {
            out[i+*samples_decoded] = decoder->pcm.floats[i*2];
            out[i+*samples_decoded+decode_buffer_size] = decoder->pcm.floats[i*2+1];
        }

        *samples_decoded += current_samples_decoded;
        *in_read_pos += in_read_chunk_size;

        if (error_code != MPG123_OK && error_code >= MPG123_ERR) {
            *error_string_ptr = error_messages[error_code + 1];
            break;
        } else {
            error_code = 0;
        }
    }

    // shows decoding stats for each iteration
    // printf("in_read_pos %u, in_size %zu, total_bytes_decoded %u, decode_buffer_size %zu\n", 
    //        *in_read_pos,    in_size,     samples_decoded * 8,    decode_buffer_size * 8);

    mpg123_info(decoder->mh, &decoder->fr);
    *sample_rate = (int) decoder->fr.rate;

    return error_code;
}

void mpeg_frame_decoder_destroy(MPEGFrameDecoder *decoder) {
    mpg123_delete(decoder->mh);
    free(decoder);
};
