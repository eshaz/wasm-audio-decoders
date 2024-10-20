/*

Create
  Make data structure that contains
    * Pointer to ring buffer
    * Size of ring buffer
    * Ring buffer state (how far have we read)
    * 
    * Consumed position (increment once we have consumed and no longer need a portion of the ring buffer)
    * Read position (position where the function is reading from the ring buffer)
    * 
    * Last function that was executed (function pointers store the state of the parsing)
    * Maybe a block of memory where some function state can go... Maybe not though, might not be needed





Decode
  Load new data
    Read all data from input buffer until input length
    Fill any unused memory in ring buffer (read position to consumed position)
  Execute the function in the function pointer


  Parse all data possible
    Write all data to input buffer until size or input length
  
  Return the amount of data written (out var inputBufferRead)
  Return the amount of that is available to read in (0 if there is still more to decode in the ring buffer)


Read (external buffer, external buffer length)
  Reads all data from consumer buffer starting at 0 and fills in any space left in the ring buffer
  return actual amount of data loaded into input buffer (amount of space left in ring buffer)

Write (external buffer, external buffer length, external buffer position, write size)
  if (input position >= write size) return -1; // need more data

  Loads data into consumer buffer starting at 0
  Consumer should return any data here to the consumer


Decode Functions
  

*/

/*
Ring Buffer
  MaxSequentialLength: max sequential length that can be returned from the buffer
  Read(requiredLength, out pointer, out readLength):
    int spanToReturn = readPosition - bufferSize
    if requiredLength is greater than the largest sequential span of data, set actual length to the span returned
      increment read length by actual span returned
      return 1

    if requiredLength is less than or equal to the largest sequential span of data, set actual length = requiredLength
      increment read length by largest 
      return 0
   
  Write(desiredLength, in pointer, out length):
    fill in the unused data in the buffer
*/

typedef struct {
    char* read_position;
    char* write_position;
    unsigned int remaining_read;
    unsigned int remaining_write;
    unsigned int largest_span;
    unsigned int size;
    char buffer[];
} RingBuffer;

RingBuffer* create_ring_buffer(unsigned int size) {
    RingBuffer* ring_buffer = malloc(sizeof(RingBuffer) + size * sizeof(char));
    ring_buffer->write_position = ring_buffer->buffer;
    ring_buffer->read_position = ring_buffer->buffer;
    ring_buffer->largest_span = size;
    ring_buffer->remaining_read = size;
    ring_buffer->remaining_write = size;
    ring_buffer->size = size;
    
    return ring_buffer;
}

int read(RingBuffer* ring_buffer, unsigned int required_length, char** out_buffer, unsigned int* out_buffer_length) {
    if (required_length > ring_buffer->size)
        return -2; // overflow
    if (required_length > ring_buffer->remaining_read)
        return -1; // need to refill the ring buffer

    *out_buffer = ring_buffer->read_position;

    if (required_length > ring_buffer->largest_span) {
        // read up to the largest span
        out_buffer_length = ring_buffer->largest_span;

        // reset read to beginning
        ring_buffer->read_position = ring_buffer->buffer;
        ring_buffer->largest_span = ring_buffer->size;

        ring_buffer->remaining_read -= *out_buffer_length;
        ring_buffer->remaining_write += *out_buffer_length;
        return 1; // more to read, call again to get the next span
    } else {
        // read up to the required length
        out_buffer_length = required_length;

        // increment read
        ring_buffer->read_position += required_length;
        ring_buffer->largest_span -= required_length;

        ring_buffer->remaining_read -= *out_buffer_length;
        ring_buffer->remaining_write += *out_buffer_length;
        return 0; // done reading
    }
}

int write(RingBuffer* ring_buffer, unsigned int in_buffer_length, char* in_buffer, unsigned int* in_buffer_read) {
    //fill in everything until the read position is hit
    while(ring_buffer->remaining_read != ring_buffer.size) {
        
    }
}