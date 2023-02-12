__attribute__((import_module("env"), import_name("read"))) void read();
__attribute__((import_module("env"), import_name("write"))) void write();
__attribute__((import_module("env"), import_name("error"))) void error();


void resume(int *heap_in, int *heap_out_len, int *heap_out) {
    while (1) {
        *heap_out_len = 0;
        int first;
        read();
        first = heap_in[0];
    
        int second;
        read();
        second = heap_in[0];

        int third;
        read();
        third = heap_in[0];
    
        *heap_out = first + second + third;
        *heap_out_len = 1;
        write();
    }
}