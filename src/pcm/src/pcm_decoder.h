typedef struct {
    unsigned int *sample_rate;
    unsigned int *channels;
    unsigned int *bit_depth;
    unsigned int *samples_decoded;

    unsigned int *in_len;
    unsigned int in_pos;
    unsigned int in_total;
    unsigned int in_size;

    char *in_data;

    unsigned int *out_len;
    unsigned int out_pos;
    unsigned int out_total;
    unsigned int out_size;

    float *out_data;
} PCMDecoder;

void write_data(PCMDecoder *decoder);
void yield(PCMDecoder *decoder);
void error_callback(int error_code);

void init_decoder(
    PCMDecoder *decoder, // address to save decoder on heap
    unsigned int *decoder_size, // size of decoder
    unsigned int *sample_rate,
    unsigned int *channels,
    unsigned int *bit_depth,
    unsigned int *samples_decoded,
    unsigned int *in_len,
    char *in_data,
    unsigned int in_size,
    unsigned int *out_len,
    float *out_data,
    unsigned int out_size
);
void decode(PCMDecoder *decoder);

/* WAVE */
void parse_wave(PCMDecoder *decoder);
void parse_wave_chunk(PCMDecoder *decoder);
unsigned int parse_wave_chunk_riff(PCMDecoder *decoder);
void parse_wave_chunk_fmt(PCMDecoder *decoder);
void parse_wave_chunk_data(PCMDecoder *decoder);
void parse_wave_chunk_fact(PCMDecoder *decoder);
void parse_wave_chunk_wavl(PCMDecoder *decoder);
void parse_wave_chunk_slnt(PCMDecoder *decoder);
void parse_wave_chunk_cue(PCMDecoder *decoder);
void parse_wave_chunk_plst(PCMDecoder *decoder);
void parse_wave_chunk_list(PCMDecoder *decoder);
void parse_wave_chunk_labl(PCMDecoder *decoder);
void parse_wave_chunk_ltxt(PCMDecoder *decoder);
void parse_wave_chunk_note(PCMDecoder *decoder);
void parse_wave_chunk_smpl(PCMDecoder *decoder);
void parse_wave_chunk_inst(PCMDecoder *decoder);