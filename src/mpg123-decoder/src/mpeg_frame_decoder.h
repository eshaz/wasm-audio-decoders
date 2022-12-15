#include <stdlib.h>
#include <mpg123.h>

typedef struct {
    // stores the interleaved PCM result of one MPEG frame
    union {
        float floats[1152*2];
        unsigned char bytes[1152*2*sizeof(float)]; //max_mpeg_frame_size*bit_reservoir*channels*sizeof(float)
    } pcm;
    mpg123_handle *mh;
    struct mpg123_frameinfo fr;
} MPEGFrameDecoder;

MPEGFrameDecoder *mpeg_frame_decoder_create();

int mpeg_decode_interleaved(
    MPEGFrameDecoder *decoder, // mpg123 decoder handle
    unsigned char *in, // input data
    size_t in_size, // input data size
    unsigned int *in_read_pos, // total bytes read from input buffer
    size_t in_read_chunk_size, // interval of bytes to read from input data
    float *out, // output audio
    size_t out_size, // output audio buffer size
    unsigned int *samples_decoded, // pointer to save samples decoded
    unsigned int *sample_rate, // pointer to save the sample rate
    char **error_string_ptr // error string
);

static char* error_messages[] = {
    "MPG123_ERR",
    "", //"MPG123_OK",
    "MPG123_BAD_OUTFORMAT",
    "MPG123_BAD_CHANNEL",
    "MPG123_BAD_RATE",
    "MPG123_ERR_16TO8TABLE",
    "MPG123_BAD_PARAM",
    "MPG123_BAD_BUFFER",
    "MPG123_OUT_OF_MEM",
    "MPG123_NOT_INITIALIZED",
    "MPG123_BAD_DECODER",
    "MPG123_BAD_HANDLE",
    "MPG123_NO_BUFFERS",
    "MPG123_BAD_RVA",
    "MPG123_NO_GAPLESS",
    "MPG123_NO_SPACE",
    "MPG123_BAD_TYPES",
    "MPG123_BAD_BAND",
    "MPG123_ERR_NULL",
    "MPG123_ERR_READER",
    "MPG123_NO_SEEK_FROM_END",
    "MPG123_BAD_WHENCE",
    "MPG123_NO_TIMEOUT",
    "MPG123_BAD_FILE",
    "MPG123_NO_SEEK",
    "MPG123_NO_READER",
    "MPG123_BAD_PARS",
    "MPG123_BAD_INDEX_PAR",
    "MPG123_OUT_OF_SYNC",
    "MPG123_RESYNC_FAIL",
    "MPG123_NO_8BIT",
    "MPG123_BAD_ALIGN",
    "MPG123_NULL_BUFFER",
    "MPG123_NO_RELSEEK",
    "MPG123_NULL_POINTER",
    "MPG123_BAD_KEY",
    "MPG123_NO_INDEX",
    "MPG123_INDEX_FAIL",
    "MPG123_BAD_DECODER_SETUP",
    "MPG123_MISSING_FEATURE",
    "MPG123_BAD_VALUE",
    "MPG123_LSEEK_FAILED",
    "MPG123_BAD_CUSTOM_IO",
    "MPG123_LFS_OVERFLOW",
    "MPG123_INT_OVERFLOW",
    "MPG123_BAD_FLOAT"
};

void mpeg_frame_decoder_destroy(MPEGFrameDecoder *st);
