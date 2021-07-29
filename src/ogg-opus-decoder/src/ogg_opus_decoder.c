#include "ogg_opus_decoder.h"

static int cb_read(OggOpusDecoder *decoder, unsigned char *_ptr, int _nbytes) {
  // don't read from buffer if OggOpusFile not instantiated yet
  if (!decoder->of) return 0;

  // don't read more than what's available to read
  if (_nbytes > decoder->buffer.num_unread) {
    _nbytes = decoder->buffer.num_unread;
  }

  // fprintf(stderr, "cb_read, _nbytes %i, queued %6i\n", _nbytes, decoder->buffer.num_unread);

  if (_nbytes) {
    memcpy( _ptr, decoder->buffer.cursor, _nbytes);

    decoder->buffer.cursor += _nbytes;
    decoder->buffer.num_unread -= _nbytes;

    // debug
    // fwrite(_ptr, sizeof(*_ptr), _nbytes, outfile_rewrite);
  }
  // cb_read_total_bytes += _nbytes;
  return _nbytes;
}

/*
 * Feed opus audio data for decoding.  Calling program should enqueue and decode
 * immediately after enqueuing to reduce decoding latency and reduce size of
 * undecoded decoder->buffer data. Per https://xiph.org/ogg/doc/oggstream.html,
 * decoding would be possible by 64k.  Otherwise, you're feeding invalid Opus
 * data that is not recognized as a valid, decodeable Ogg Opus File
 *
 * The undecoded 64k buffer won't overflow and this method succeeds if:
 *
 *   1) You enqueue bytes in sizes that are divisors of 64 (64, 32, 16, etc)
 *   2) You enqueue valid Opus audio data that can be decoded
 *   3) You decode data after enqueuing it (thus removing it from undecoded buffer)
 *
 * Returns 1 or 0 for success or error
 */
int ogg_opus_decoder_enqueue(OggOpusDecoder *decoder, unsigned char *data, size_t size) {
  ssize_t bufferMax = sizeof(decoder->buffer._data),
      bufferUsed = decoder->buffer.num_unread;

  // fprintf(stdout, "Undecoded: %zd\n", bufferUsed);

  if (bufferUsed + size > bufferMax) {
    /*fprintf(stderr, "ERROR: Cannot enqueue %zd bytes, overflows by %zd. Used: "\
                    "%zd/%zd, OggOpusFile discovered: %s. " \
                    "Try reducing chunk or decode before enqueuing more\n",
      size,
      size + bufferUsed - bufferMax,
      bufferUsed,
      bufferMax,
      (!decoder->of)? "false" : "true"
    );*/
    return 0;
  }

  decoder->buffer.cursor = decoder->buffer.start;

  /*
    initialize OggOpusFile if not yet initialized.  A few attempts are needed
    until enough bytes are collected for it to discover first Ogg page
  */
  if (!decoder->of) {
    memcpy( decoder->buffer.cursor + decoder->buffer.num_unread, data, size );
    decoder->buffer.num_unread += size;

    int err;

    decoder->of = op_open_callbacks(
      decoder,
      &decoder->cb,
      decoder->buffer.cursor,
      decoder->buffer.num_unread,
      &err
    );

    if (err == 0) {
      //fprintf(stderr, "OggOpusFile discovered with %d bytes\n", decoder->buffer.num_unread);

      // OggOpusFile instantiated.  Reset unread buffer count
      decoder->buffer.num_unread = 0;
    }
  } else {
    // set buffer to new data
    decoder->buffer.num_unread += size;
    memcpy( decoder->buffer.cursor, data, size );
  }

  return 1;
}

// returns total samples decoded
int ogg_opus_decode_float_stereo(OggOpusDecoder *decoder, float *pcm_out, int pcm_out_size) {
  if (!decoder->of) return 0;
  return op_read_float_stereo(decoder->of, pcm_out, pcm_out_size);
}

// returns total samples decoded.  convenience function for de-interlacing
int ogg_opus_decode_float_stereo_deinterleaved(OggOpusDecoder *decoder, float *pcm_out, int pcm_out_size, float *left, float *right) {
  int samples_decoded = ogg_opus_decode_float_stereo(decoder, pcm_out, pcm_out_size);
  ogg_opus_decoder_deinterleave(pcm_out, samples_decoded, left, right);
  return samples_decoded;
}

static ByteBuffer create_bytebuffer() {
  ByteBuffer cb;
  cb.start = cb._data;
  cb.cursor = cb._data;
  cb.num_unread = 0;
  return cb;
}

OggOpusDecoder *ogg_opus_decoder_create() {
  OggOpusDecoder decoder;
  decoder.cb.read = (int (*)(void *, unsigned char *, int))cb_read;
  decoder.cb.seek = NULL;
  decoder.cb.tell = NULL;
  decoder.cb.close = NULL;
  decoder.of = NULL;
  decoder.buffer = create_bytebuffer();

  OggOpusDecoder *ptr = malloc(sizeof(decoder));
  *ptr = decoder;
  return ptr;
}

void ogg_opus_decoder_free(OggOpusDecoder *decoder) {
  op_free(decoder->of);
  free(decoder);
}

void ogg_opus_decoder_deinterleave(float *interleaved, int total_samples, float *left, float *right) {
  for (int i=total_samples-1; i>=0; i--) {
    left[i] =  interleaved[i*2];
    right[i] = interleaved[i*2+1];
  }
}
