#include <stdlib.h>
#include <mpg123.h>

// https://lists.mars.org/hyperkitty/list/mad-dev@lists.mars.org/message/23ACZCLN3DMTR62GDAQNBGNUUMXORWYR/
#define MPEG_PCM_OUT_SIZE 2889*16*2 // max_mpeg_frame_size * bit_reservoir * channels

typedef struct {
    float pcm[MPEG_PCM_OUT_SIZE];
    mpg123_handle *mh;
    struct mpg123_frameinfo fr;
} MPEGFrameDecoder;

int mpeg_frame_decoder_create(
    MPEGFrameDecoder **ptr, // pointer to store new handle
    int enable_gapless // enable gapless decoding
);

int mpeg_decoder_feed(
    MPEGFrameDecoder *decoder,
    const unsigned char *in,
    size_t in_size
);

int mpeg_decoder_read(
    MPEGFrameDecoder *decoder,
    float *out,
    size_t out_size,
    size_t *samples_decoded,
    unsigned int *sample_rate,
    char **error_string_ptr
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
