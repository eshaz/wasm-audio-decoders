#include <stdio.h>
#include "mpeg_frame_decoder.h"

MPEGFrameDecoder *mpeg_frame_decoder_create() {
    MPEGFrameDecoder decoder;
    decoder.mh = mpg123_new(NULL, NULL);
    mpg123_param(decoder.mh, MPG123_FLAGS, 
      MPG123_FORCE_STEREO |
      MPG123_QUIET |
      MPG123_FORCE_ENDIAN, 0);
    mpg123_open_feed(decoder.mh);

    MPEGFrameDecoder *ptr = malloc(sizeof(decoder));
    *ptr = decoder;
    return ptr;
}

int mpeg_decode_interleaved(
    MPEGFrameDecoder *decoder, // mpg123 decoder handle
    unsigned char *in, // input data
    size_t in_size, // input data size
    unsigned int *in_read_pos, // pointer to save the total bytes read from input buffer
    size_t in_read_chunk_size, // interval of bytes to read from input data
    float *left, // pointer to save the left output audio
    float *right, // pointer to save the right output audio
    size_t decode_buffer_size // output audio buffer size
) {
    in_read_chunk_size = in_size > in_read_chunk_size ? in_read_chunk_size : in_size;
    int samples_decoded = 0;

    while (*in_read_pos + in_read_chunk_size <= in_size && samples_decoded < decode_buffer_size) {
        size_t bytes_decoded = 0;

        int mpg123_error_code = mpg123_decode(
            decoder->mh, 
            in + *in_read_pos, 
            in_read_chunk_size, 
            decoder->pcm, 
            4*2*1152, 
            &bytes_decoded
        );
    
        int current_samples_decoded = bytes_decoded / sizeof(float) / 2;
    
        // deinterleave pcm
        for (int i=current_samples_decoded-1; i>=0; i--) {
            unsigned char *left_ptr = (unsigned char *) &left[i + samples_decoded];
            left_ptr[0] = decoder->pcm[i*8];
            left_ptr[1] = decoder->pcm[i*8+1];
            left_ptr[2] = decoder->pcm[i*8+2];
            left_ptr[3] = decoder->pcm[i*8+3];
    
            unsigned char *right_ptr = (unsigned char *) &right[i + samples_decoded];
            right_ptr[0] = decoder->pcm[i*8+4];
            right_ptr[1] = decoder->pcm[i*8+5];
            right_ptr[2] = decoder->pcm[i*8+6];
            right_ptr[3] = decoder->pcm[i*8+7];
        }

        samples_decoded += current_samples_decoded;
        *in_read_pos += in_read_chunk_size;
    }

    // shows decoding stats for each iteration
    // printf("in_read_pos %u, in_size %zu, total_bytes_decoded %u, decode_buffer_size %zu\n", 
    //        *in_read_pos,    in_size,     samples_decoded * 8,    decode_buffer_size * 8);

    return samples_decoded;
}

long mpeg_get_sample_rate(MPEGFrameDecoder *decoder) {
    mpg123_info(decoder->mh, &decoder->fr);
    
    return decoder->fr.rate;
}

void mpeg_frame_decoder_destroy(MPEGFrameDecoder *decoder) {
    mpg123_delete(decoder->mh);
    free(decoder);
};
