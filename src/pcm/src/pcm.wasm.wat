(module
 (type $i32_=>_none (func (param i32)))
 (type $i32_i32_=>_none (func (param i32 i32)))
 (type $none_=>_none (func))
 (type $i32_=>_i32 (func (param i32) (result i32)))
 (type $i32_i32_i32_i32_=>_none (func (param i32 i32 i32 i32)))
 (type $none_=>_i32 (func (result i32)))
 (type $i32_i32_i32_i32_i32_i32_i32_i32_i32_i32_i32_i32_=>_none (func (param i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)))
 (import "env" "error" (func $fimport$1 (param i32)))
 (import "env" "info" (func $fimport$2 (param i32 i32)))
 (import "env" "info_int" (func $fimport$3 (param i32)))
 (import "env" "read_write" (func $fimport$0 (param i32 i32 i32 i32)))
 (global $global$0 (mut i32) (i32.const 66592))
 (global $global$1 i32 (i32.const 66592))
 (global $__asyncify_state (mut i32) (i32.const 0))
 (global $__asyncify_data (mut i32) (i32.const 0))
 (memory $0 16)
 (data (i32.const 1024) "Chunk size: \00\00\00\00\00\fe\ffF\fe\ff\ffJ\00\00\00O")
 (export "memory" (memory $0))
 (export "init_decoder" (func $4))
 (export "decode" (func $5))
 (export "__heap_base" (global $global$1))
 (export "asyncify_start_unwind" (func $asyncify_start_unwind))
 (export "asyncify_stop_unwind" (func $asyncify_stop_unwind))
 (export "asyncify_start_rewind" (func $asyncify_start_rewind))
 (export "asyncify_stop_rewind" (func $asyncify_stop_rewind))
 (export "asyncify_get_state" (func $asyncify_get_state))
 (func $0 (param $0 i32) (param $1 i32)
  (local $2 i32)
  (local $3 i32)
  (local $4 i32)
  (local $5 i32)
  (local $6 i32)
  (if
   (i32.eq
    (global.get $__asyncify_state)
    (i32.const 2)
   )
   (block
    (i32.store
     (global.get $__asyncify_data)
     (i32.sub
      (i32.load
       (global.get $__asyncify_data)
      )
      (i32.const 24)
     )
    )
    (local.set $0
     (i32.load
      (local.tee $2
       (i32.load
        (global.get $__asyncify_data)
       )
      )
     )
    )
    (local.set $1
     (i32.load offset=4
      (local.get $2)
     )
    )
    (local.set $3
     (i32.load offset=8
      (local.get $2)
     )
    )
    (local.set $4
     (i32.load offset=12
      (local.get $2)
     )
    )
    (local.set $6
     (i32.load offset=16
      (local.get $2)
     )
    )
    (local.set $2
     (i32.load offset=20
      (local.get $2)
     )
    )
   )
  )
  (local.set $5
   (block $__asyncify_unwind (result i32)
    (if
     (i32.eq
      (global.get $__asyncify_state)
      (i32.const 2)
     )
     (block
      (i32.store
       (global.get $__asyncify_data)
       (i32.sub
        (i32.load
         (global.get $__asyncify_data)
        )
        (i32.const 4)
       )
      )
      (local.set $5
       (i32.load
        (i32.load
         (global.get $__asyncify_data)
        )
       )
      )
     )
    )
    (if
     (i32.eqz
      (global.get $__asyncify_state)
     )
     (local.set $6
      (i32.eqz
       (select
        (local.get $1)
        (i32.const 0)
        (i32.ge_u
         (local.tee $4
          (i32.sub
           (i32.load
            (i32.load offset=16
             (local.get $0)
            )
           )
           (local.tee $3
            (i32.load offset=20
             (local.get $0)
            )
           )
          )
         )
         (local.get $1)
        )
       )
      )
     )
    )
    (if
     (i32.or
      (local.get $6)
      (i32.eq
       (global.get $__asyncify_state)
       (i32.const 2)
      )
     )
     (block
      (if
       (i32.eqz
        (global.get $__asyncify_state)
       )
       (block
        (local.set $3
         (i32.add
          (local.tee $6
           (i32.load offset=32
            (local.get $0)
           )
          )
          (local.get $3)
         )
        )
        (memory.copy
         (local.get $6)
         (local.get $3)
         (local.get $4)
        )
       )
      )
      (loop $label$2
       (if
        (i32.eqz
         (global.get $__asyncify_state)
        )
        (block
         (local.set $6
          (i32.sub
           (i32.load offset=28
            (local.get $0)
           )
           (local.get $4)
          )
         )
         (local.set $2
          (i32.sub
           (i32.load offset=48
            (local.get $0)
           )
           (local.tee $3
            (i32.sub
             (i32.load
              (i32.load offset=36
               (local.get $0)
              )
             )
             (i32.load offset=40
              (local.get $0)
             )
            )
           )
          )
         )
        )
       )
       (if
        (i32.eqz
         (select
          (local.get $5)
          (i32.const 0)
          (global.get $__asyncify_state)
         )
        )
        (block
         (call $fimport$0
          (local.get $4)
          (local.get $6)
          (local.get $3)
          (local.get $2)
         )
         (drop
          (br_if $__asyncify_unwind
           (i32.const 0)
           (i32.eq
            (global.get $__asyncify_state)
            (i32.const 1)
           )
          )
         )
        )
       )
       (if
        (i32.eqz
         (global.get $__asyncify_state)
        )
        (br_if $label$2
         (local.tee $6
          (i32.lt_u
           (local.tee $4
            (i32.add
             (local.get $4)
             (i32.load
              (local.tee $3
               (i32.load offset=16
                (local.get $0)
               )
              )
             )
            )
           )
           (local.get $1)
          )
         )
        )
       )
      )
      (if
       (i32.eqz
        (global.get $__asyncify_state)
       )
       (block
        (i32.store
         (local.get $3)
         (local.get $4)
        )
        (i32.store offset=20
         (local.get $0)
         (i32.const 0)
        )
        (i32.store offset=24
         (local.get $0)
         (i32.add
          (local.get $4)
          (i32.load offset=24
           (local.get $0)
          )
         )
        )
       )
      )
     )
    )
    (return)
   )
  )
  (i32.store
   (i32.load
    (global.get $__asyncify_data)
   )
   (local.get $5)
  )
  (i32.store
   (global.get $__asyncify_data)
   (i32.add
    (i32.load
     (global.get $__asyncify_data)
    )
    (i32.const 4)
   )
  )
  (i32.store
   (local.tee $5
    (i32.load
     (global.get $__asyncify_data)
    )
   )
   (local.get $0)
  )
  (i32.store offset=4
   (local.get $5)
   (local.get $1)
  )
  (i32.store offset=8
   (local.get $5)
   (local.get $3)
  )
  (i32.store offset=12
   (local.get $5)
   (local.get $4)
  )
  (i32.store offset=16
   (local.get $5)
   (local.get $6)
  )
  (i32.store offset=20
   (local.get $5)
   (local.get $2)
  )
  (i32.store
   (global.get $__asyncify_data)
   (i32.add
    (i32.load
     (global.get $__asyncify_data)
    )
    (i32.const 24)
   )
  )
 )
 (func $2 (param $0 i32) (result i32)
  (local $1 i32)
  (local $2 i32)
  (local $3 i32)
  (if
   (i32.eq
    (global.get $__asyncify_state)
    (i32.const 2)
   )
   (block
    (i32.store
     (global.get $__asyncify_data)
     (i32.sub
      (i32.load
       (global.get $__asyncify_data)
      )
      (i32.const 8)
     )
    )
    (local.set $0
     (i32.load
      (local.tee $1
       (i32.load
        (global.get $__asyncify_data)
       )
      )
     )
    )
    (local.set $1
     (i32.load offset=4
      (local.get $1)
     )
    )
   )
  )
  (local.set $2
   (block $__asyncify_unwind (result i32)
    (if
     (i32.eq
      (global.get $__asyncify_state)
      (i32.const 2)
     )
     (block
      (i32.store
       (global.get $__asyncify_data)
       (i32.sub
        (i32.load
         (global.get $__asyncify_data)
        )
        (i32.const 4)
       )
      )
      (local.set $2
       (i32.load
        (i32.load
         (global.get $__asyncify_data)
        )
       )
      )
     )
    )
    (if
     (i32.eqz
      (global.get $__asyncify_state)
     )
     (global.set $global$0
      (local.tee $1
       (i32.sub
        (global.get $global$0)
        (i32.const 32)
       )
      )
     )
    )
    (if
     (i32.eqz
      (select
       (local.get $2)
       (i32.const 0)
       (global.get $__asyncify_state)
      )
     )
     (block
      (call $0
       (local.get $0)
       (i32.const 4)
      )
      (drop
       (br_if $__asyncify_unwind
        (i32.const 0)
        (i32.eq
         (global.get $__asyncify_state)
         (i32.const 1)
        )
       )
      )
     )
    )
    (if
     (i32.eqz
      (global.get $__asyncify_state)
     )
     (block
      (local.set $2
       (i32.load align=1
        (i32.add
         (local.tee $3
          (i32.load offset=20
           (local.get $0)
          )
         )
         (i32.load offset=32
          (local.get $0)
         )
        )
       )
      )
      (i32.store offset=20
       (local.get $0)
       (i32.add
        (local.get $3)
        (i32.const 4)
       )
      )
      (i64.store offset=21 align=1
       (local.get $1)
       (i64.load align=1
        (i32.const 1029)
       )
      )
      (i64.store offset=16
       (local.get $1)
       (i64.load align=1
        (i32.const 1024)
       )
      )
      (i32.store offset=12
       (local.get $1)
       (i32.add
        (local.get $1)
        (i32.const 16)
       )
      )
      (call $fimport$2
       (i32.const 1)
       (i32.add
        (local.get $1)
        (i32.const 12)
       )
      )
      (call $fimport$3
       (local.get $2)
      )
      (global.set $global$0
       (i32.add
        (local.get $1)
        (i32.const 32)
       )
      )
      (return
       (local.get $2)
      )
     )
    )
    (unreachable)
   )
  )
  (i32.store
   (i32.load
    (global.get $__asyncify_data)
   )
   (local.get $2)
  )
  (i32.store
   (global.get $__asyncify_data)
   (i32.add
    (i32.load
     (global.get $__asyncify_data)
    )
    (i32.const 4)
   )
  )
  (i32.store
   (local.tee $2
    (i32.load
     (global.get $__asyncify_data)
    )
   )
   (local.get $0)
  )
  (i32.store offset=4
   (local.get $2)
   (local.get $1)
  )
  (i32.store
   (global.get $__asyncify_data)
   (i32.add
    (i32.load
     (global.get $__asyncify_data)
    )
    (i32.const 8)
   )
  )
  (i32.const 0)
 )
 (func $3 (param $0 i32) (param $1 i32)
  (local $2 i32)
  (local $3 i32)
  (local $4 i32)
  (local $5 i32)
  (if
   (i32.eq
    (global.get $__asyncify_state)
    (i32.const 2)
   )
   (block
    (i32.store
     (global.get $__asyncify_data)
     (i32.sub
      (i32.load
       (global.get $__asyncify_data)
      )
      (i32.const 8)
     )
    )
    (local.set $0
     (i32.load
      (local.tee $1
       (i32.load
        (global.get $__asyncify_data)
       )
      )
     )
    )
    (local.set $1
     (i32.load offset=4
      (local.get $1)
     )
    )
   )
  )
  (local.set $2
   (block $__asyncify_unwind (result i32)
    (if
     (i32.eq
      (global.get $__asyncify_state)
      (i32.const 2)
     )
     (block
      (i32.store
       (global.get $__asyncify_data)
       (i32.sub
        (i32.load
         (global.get $__asyncify_data)
        )
        (i32.const 4)
       )
      )
      (local.set $5
       (i32.load
        (i32.load
         (global.get $__asyncify_data)
        )
       )
      )
     )
    )
    (if
     (i32.eqz
      (global.get $__asyncify_state)
     )
     (block
      (local.set $4
       (i32.lt_u
        (local.tee $2
         (i32.sub
          (i32.load
           (i32.load offset=16
            (local.get $0)
           )
          )
          (local.tee $3
           (i32.load offset=20
            (local.get $0)
           )
          )
         )
        )
        (local.get $1)
       )
      )
      (i32.store offset=20
       (local.get $0)
       (i32.add
        (local.get $3)
        (local.tee $2
         (select
          (local.get $2)
          (local.get $1)
          (local.get $4)
         )
        )
       )
      )
      (local.set $1
       (i32.sub
        (local.get $1)
        (local.get $2)
       )
      )
     )
    )
    (loop $label$1
     (if
      (i32.or
       (local.get $1)
       (i32.eq
        (global.get $__asyncify_state)
        (i32.const 2)
       )
      )
      (block
       (if
        (i32.eqz
         (select
          (local.get $5)
          (i32.const 0)
          (global.get $__asyncify_state)
         )
        )
        (block
         (call $0
          (local.get $0)
          (i32.const 0)
         )
         (drop
          (br_if $__asyncify_unwind
           (i32.const 0)
           (i32.eq
            (global.get $__asyncify_state)
            (i32.const 1)
           )
          )
         )
        )
       )
       (if
        (i32.eqz
         (global.get $__asyncify_state)
        )
        (block
         (local.set $4
          (i32.lt_u
           (local.tee $2
            (i32.sub
             (i32.load
              (i32.load offset=16
               (local.get $0)
              )
             )
             (local.tee $3
              (i32.load offset=20
               (local.get $0)
              )
             )
            )
           )
           (local.get $1)
          )
         )
         (i32.store offset=20
          (local.get $0)
          (i32.add
           (local.get $3)
           (local.tee $2
            (select
             (local.get $2)
             (local.get $1)
             (local.get $4)
            )
           )
          )
         )
         (local.set $1
          (i32.sub
           (local.get $1)
           (local.get $2)
          )
         )
         (br $label$1)
        )
       )
      )
     )
    )
    (return)
   )
  )
  (i32.store
   (i32.load
    (global.get $__asyncify_data)
   )
   (local.get $2)
  )
  (i32.store
   (global.get $__asyncify_data)
   (i32.add
    (i32.load
     (global.get $__asyncify_data)
    )
    (i32.const 4)
   )
  )
  (i32.store
   (local.tee $2
    (i32.load
     (global.get $__asyncify_data)
    )
   )
   (local.get $0)
  )
  (i32.store offset=4
   (local.get $2)
   (local.get $1)
  )
  (i32.store
   (global.get $__asyncify_data)
   (i32.add
    (i32.load
     (global.get $__asyncify_data)
    )
    (i32.const 8)
   )
  )
 )
 (func $1 (param $0 i32) (param $1 i32)
  (local $2 i32)
  (local $3 i32)
  (local $4 i32)
  (local $5 i32)
  (if
   (i32.eq
    (global.get $__asyncify_state)
    (i32.const 2)
   )
   (block
    (i32.store
     (global.get $__asyncify_data)
     (i32.sub
      (i32.load
       (global.get $__asyncify_data)
      )
      (i32.const 12)
     )
    )
    (local.set $0
     (i32.load
      (local.tee $2
       (i32.load
        (global.get $__asyncify_data)
       )
      )
     )
    )
    (local.set $1
     (i32.load offset=4
      (local.get $2)
     )
    )
    (local.set $2
     (i32.load offset=8
      (local.get $2)
     )
    )
   )
  )
  (local.set $3
   (block $__asyncify_unwind (result i32)
    (if
     (i32.eq
      (global.get $__asyncify_state)
      (i32.const 2)
     )
     (block
      (i32.store
       (global.get $__asyncify_data)
       (i32.sub
        (i32.load
         (global.get $__asyncify_data)
        )
        (i32.const 4)
       )
      )
      (local.set $3
       (i32.load
        (i32.load
         (global.get $__asyncify_data)
        )
       )
      )
     )
    )
    (if
     (i32.eqz
      (global.get $__asyncify_state)
     )
     (global.set $global$0
      (local.tee $2
       (i32.sub
        (global.get $global$0)
        (i32.const 16)
       )
      )
     )
    )
    (if
     (i32.eqz
      (select
       (local.get $3)
       (i32.const 0)
       (global.get $__asyncify_state)
      )
     )
     (block
      (call $0
       (local.get $0)
       (i32.const 4)
      )
      (drop
       (br_if $__asyncify_unwind
        (i32.const 0)
        (i32.eq
         (global.get $__asyncify_state)
         (i32.const 1)
        )
       )
      )
     )
    )
    (if
     (i32.eqz
      (global.get $__asyncify_state)
     )
     (block
      (i32.store offset=20
       (local.get $0)
       (i32.add
        (local.tee $3
         (i32.load offset=20
          (local.get $0)
         )
        )
        (i32.const 4)
       )
      )
      (i32.store8
       (local.get $1)
       (local.tee $3
        (i32.load8_u
         (i32.add
          (local.get $3)
          (i32.load offset=32
           (local.get $0)
          )
         )
        )
       )
      )
      (i32.store8 offset=1
       (local.get $1)
       (local.tee $4
        (i32.load8_u
         (i32.sub
          (i32.add
           (i32.load offset=32
            (local.get $0)
           )
           (i32.load offset=20
            (local.get $0)
           )
          )
          (i32.const 3)
         )
        )
       )
      )
      (i32.store8 offset=2
       (local.get $1)
       (local.tee $5
        (i32.load8_u
         (i32.sub
          (i32.add
           (i32.load offset=32
            (local.get $0)
           )
           (i32.load offset=20
            (local.get $0)
           )
          )
          (i32.const 2)
         )
        )
       )
      )
      (i32.store8 offset=3
       (local.get $1)
       (local.tee $0
        (i32.load8_u
         (i32.sub
          (i32.add
           (i32.load offset=20
            (local.get $0)
           )
           (i32.load offset=32
            (local.get $0)
           )
          )
          (i32.const 1)
         )
        )
       )
      )
      (i32.store8 offset=15
       (local.get $2)
       (i32.const 0)
      )
      (i32.store8 offset=14
       (local.get $2)
       (local.get $0)
      )
      (i32.store8 offset=13
       (local.get $2)
       (local.get $5)
      )
      (i32.store8 offset=12
       (local.get $2)
       (local.get $4)
      )
      (i32.store8 offset=11
       (local.get $2)
       (local.get $3)
      )
      (i32.store offset=4
       (local.get $2)
       (i32.add
        (local.get $2)
        (i32.const 11)
       )
      )
      (call $fimport$2
       (i32.const 1)
       (i32.add
        (local.get $2)
        (i32.const 4)
       )
      )
      (global.set $global$0
       (i32.add
        (local.get $2)
        (i32.const 16)
       )
      )
     )
    )
    (return)
   )
  )
  (i32.store
   (i32.load
    (global.get $__asyncify_data)
   )
   (local.get $3)
  )
  (i32.store
   (global.get $__asyncify_data)
   (i32.add
    (i32.load
     (global.get $__asyncify_data)
    )
    (i32.const 4)
   )
  )
  (i32.store
   (local.tee $3
    (i32.load
     (global.get $__asyncify_data)
    )
   )
   (local.get $0)
  )
  (i32.store offset=4
   (local.get $3)
   (local.get $1)
  )
  (i32.store offset=8
   (local.get $3)
   (local.get $2)
  )
  (i32.store
   (global.get $__asyncify_data)
   (i32.add
    (i32.load
     (global.get $__asyncify_data)
    )
    (i32.const 12)
   )
  )
 )
 (func $asyncify_stop_unwind
  (global.set $__asyncify_state
   (i32.const 0)
  )
  (if
   (i32.gt_u
    (i32.load
     (global.get $__asyncify_data)
    )
    (i32.load offset=4
     (global.get $__asyncify_data)
    )
   )
   (unreachable)
  )
 )
 (func $asyncify_stop_rewind
  (global.set $__asyncify_state
   (i32.const 0)
  )
  (if
   (i32.gt_u
    (i32.load
     (global.get $__asyncify_data)
    )
    (i32.load offset=4
     (global.get $__asyncify_data)
    )
   )
   (unreachable)
  )
 )
 (func $asyncify_start_unwind (param $0 i32)
  (global.set $__asyncify_state
   (i32.const 1)
  )
  (global.set $__asyncify_data
   (local.get $0)
  )
  (if
   (i32.gt_u
    (i32.load
     (global.get $__asyncify_data)
    )
    (i32.load offset=4
     (global.get $__asyncify_data)
    )
   )
   (unreachable)
  )
 )
 (func $asyncify_start_rewind (param $0 i32)
  (global.set $__asyncify_state
   (i32.const 2)
  )
  (global.set $__asyncify_data
   (local.get $0)
  )
  (if
   (i32.gt_u
    (i32.load
     (global.get $__asyncify_data)
    )
    (i32.load offset=4
     (global.get $__asyncify_data)
    )
   )
   (unreachable)
  )
 )
 (func $asyncify_get_state (result i32)
  (global.get $__asyncify_state)
 )
 (func $5 (param $0 i32)
  (local $1 i32)
  (local $2 i32)
  (local $3 i32)
  (local $4 i32)
  (local $5 i32)
  (local $6 i32)
  (local $7 i32)
  (local $8 i32)
  (local $9 i32)
  (local $10 i32)
  (local $11 f32)
  (local $12 i32)
  (local $13 i32)
  (if
   (i32.eq
    (global.get $__asyncify_state)
    (i32.const 2)
   )
   (block
    (i32.store
     (global.get $__asyncify_data)
     (i32.sub
      (i32.load
       (global.get $__asyncify_data)
      )
      (i32.const 40)
     )
    )
    (local.set $0
     (i32.load
      (local.tee $3
       (i32.load
        (global.get $__asyncify_data)
       )
      )
     )
    )
    (local.set $2
     (i32.load offset=8
      (local.get $3)
     )
    )
    (local.set $4
     (i32.load offset=12
      (local.get $3)
     )
    )
    (local.set $5
     (i32.load offset=16
      (local.get $3)
     )
    )
    (local.set $6
     (i32.load offset=20
      (local.get $3)
     )
    )
    (local.set $8
     (i32.load offset=24
      (local.get $3)
     )
    )
    (local.set $9
     (i32.load offset=28
      (local.get $3)
     )
    )
    (local.set $10
     (i32.load offset=32
      (local.get $3)
     )
    )
    (local.set $11
     (f32.load offset=36
      (local.get $3)
     )
    )
    (local.set $1
     (i32.load offset=4
      (local.get $3)
     )
    )
   )
  )
  (local.set $3
   (block $__asyncify_unwind (result i32)
    (if
     (i32.eq
      (global.get $__asyncify_state)
      (i32.const 2)
     )
     (block
      (i32.store
       (global.get $__asyncify_data)
       (i32.sub
        (i32.load
         (global.get $__asyncify_data)
        )
        (i32.const 4)
       )
      )
      (local.set $7
       (i32.load
        (i32.load
         (global.get $__asyncify_data)
        )
       )
      )
     )
    )
    (if
     (i32.eqz
      (global.get $__asyncify_state)
     )
     (block
      (global.set $global$0
       (local.tee $5
        (i32.sub
         (global.get $global$0)
         (i32.const 16)
        )
       )
      )
      (local.set $4
       (i32.add
        (local.get $5)
        (i32.const 8)
       )
      )
     )
    )
    (if
     (i32.eqz
      (select
       (local.get $7)
       (i32.const 0)
       (global.get $__asyncify_state)
      )
     )
     (block
      (call $1
       (local.get $0)
       (local.get $4)
      )
      (drop
       (br_if $__asyncify_unwind
        (i32.const 0)
        (i32.eq
         (global.get $__asyncify_state)
         (i32.const 1)
        )
       )
      )
     )
    )
    (if
     (i32.eqz
      (global.get $__asyncify_state)
     )
     (local.set $4
      (i32.eq
       (i32.or
        (i32.or
         (i32.or
          (i32.load8_s offset=11
           (local.get $5)
          )
          (i32.shl
           (i32.load8_s offset=10
            (local.get $5)
           )
           (i32.const 8)
          )
         )
         (i32.shl
          (i32.load8_s offset=9
           (local.get $5)
          )
          (i32.const 16)
         )
        )
        (i32.shl
         (i32.load8_u offset=8
          (local.get $5)
         )
         (i32.const 24)
        )
       )
       (i32.const 1380533830)
      )
     )
    )
    (block $label$1
     (if
      (i32.or
       (local.get $4)
       (i32.eq
        (global.get $__asyncify_state)
        (i32.const 2)
       )
      )
      (block
       (if
        (select
         (i32.eq
          (local.get $7)
          (i32.const 1)
         )
         (i32.const 1)
         (global.get $__asyncify_state)
        )
        (block
         (call $0
          (local.get $0)
          (i32.const 8)
         )
         (drop
          (br_if $__asyncify_unwind
           (i32.const 1)
           (i32.eq
            (global.get $__asyncify_state)
            (i32.const 1)
           )
          )
         )
        )
       )
       (if
        (i32.eqz
         (global.get $__asyncify_state)
        )
        (block
         (local.set $6
          (i32.load8_u offset=3
           (local.tee $2
            (i32.add
             (local.tee $1
              (i32.load offset=20
               (local.get $0)
              )
             )
             (local.tee $4
              (i32.load offset=32
               (local.get $0)
              )
             )
            )
           )
          )
         )
         (local.set $8
          (i32.load8_u offset=2
           (local.get $2)
          )
         )
         (local.set $9
          (i32.load8_u offset=1
           (local.get $2)
          )
         )
         (local.set $10
          (i32.load8_u
           (local.get $2)
          )
         )
         (i32.store offset=20
          (local.get $0)
          (local.tee $1
           (i32.add
            (local.get $1)
            (i32.const 4)
           )
          )
         )
         (local.set $4
          (i32.or
           (i32.shl
            (local.tee $2
             (i32.load align=1
              (i32.add
               (local.get $1)
               (local.get $4)
              )
             )
            )
            (i32.const 24)
           )
           (i32.and
            (i32.shl
             (local.get $2)
             (i32.const 8)
            )
            (i32.const 16711680)
           )
          )
         )
         (local.set $3
          (i32.and
           (i32.shr_u
            (local.get $2)
            (i32.const 8)
           )
           (i32.const 65280)
          )
         )
         (i32.store offset=20
          (local.get $0)
          (i32.add
           (if (result i32)
            (i32.ne
             (i32.or
              (i32.or
               (local.get $3)
               (local.tee $2
                (i32.shr_u
                 (local.get $2)
                 (i32.const 24)
                )
               )
              )
              (local.get $4)
             )
             (i32.const 1463899717)
            )
            (block (result i32)
             (call $fimport$1
              (i32.const -2)
             )
             (i32.load offset=20
              (local.get $0)
             )
            )
            (local.get $1)
           )
           (i32.const 4)
          )
         )
         (local.set $1
          (i32.sub
           (i32.or
            (local.tee $4
             (i32.shl
              (local.get $6)
              (i32.const 24)
             )
            )
            (i32.or
             (i32.or
              (local.get $10)
              (i32.shl
               (local.get $9)
               (i32.const 8)
              )
             )
             (i32.shl
              (local.get $8)
              (i32.const 16)
             )
            )
           )
           (i32.const 8)
          )
         )
         (br $label$1)
        )
       )
      )
     )
     (if
      (i32.eqz
       (global.get $__asyncify_state)
      )
      (call $fimport$1
       (i32.const -1)
      )
     )
    )
    (if
     (i32.eqz
      (global.get $__asyncify_state)
     )
     (local.set $9
      (i32.add
       (local.tee $2
        (i32.load offset=24
         (local.get $0)
        )
       )
       (local.get $1)
      )
     )
    )
    (loop $label$5
     (if
      (i32.or
       (local.tee $1
        (select
         (local.get $1)
         (i32.lt_u
          (local.get $2)
          (local.get $9)
         )
         (global.get $__asyncify_state)
        )
       )
       (i32.eq
        (global.get $__asyncify_state)
        (i32.const 2)
       )
      )
      (block
       (local.set $1
        (select
         (local.get $1)
         (i32.add
          (local.get $5)
          (i32.const 12)
         )
         (global.get $__asyncify_state)
        )
       )
       (if
        (select
         (i32.eq
          (local.get $7)
          (i32.const 2)
         )
         (i32.const 1)
         (global.get $__asyncify_state)
        )
        (block
         (call $1
          (local.get $0)
          (local.get $1)
         )
         (drop
          (br_if $__asyncify_unwind
           (i32.const 2)
           (i32.eq
            (global.get $__asyncify_state)
            (i32.const 1)
           )
          )
         )
        )
       )
       (if
        (i32.eqz
         (global.get $__asyncify_state)
        )
        (local.set $1
         (i32.or
          (i32.eq
           (local.tee $2
            (i32.or
             (i32.or
              (i32.or
               (i32.load8_s offset=15
                (local.get $5)
               )
               (i32.shl
                (i32.load8_s offset=14
                 (local.get $5)
                )
                (i32.const 8)
               )
              )
              (i32.shl
               (i32.load8_s offset=13
                (local.get $5)
               )
               (i32.const 16)
              )
             )
             (i32.shl
              (i32.load8_u offset=12
               (local.get $5)
              )
              (i32.const 24)
             )
            )
           )
           (i32.const 2002876012)
          )
          (local.tee $4
           (i32.eq
            (local.get $2)
            (i32.const 1668637984)
           )
          )
         )
        )
       )
       (block $label$7
        (block $label$8
         (if
          (i32.eqz
           (global.get $__asyncify_state)
          )
          (block
           (br_if $label$8
            (local.get $1)
           )
           (local.set $1
            (i32.ne
             (local.get $2)
             (i32.const 1684108385)
            )
           )
          )
         )
         (if
          (i32.or
           (local.get $1)
           (i32.eq
            (global.get $__asyncify_state)
            (i32.const 2)
           )
          )
          (block
           (if
            (i32.eqz
             (global.get $__asyncify_state)
            )
            (block
             (br_if $label$8
              (local.tee $1
               (i32.eq
                (local.get $2)
                (i32.const 1717658484)
               )
              )
             )
             (if
              (local.tee $1
               (i32.ne
                (local.get $2)
                (i32.const 1718449184)
               )
              )
              (block
               (br_if $label$8
                (local.tee $1
                 (i32.or
                  (local.tee $4
                   (i32.ne
                    (local.get $2)
                    (i32.const 1380533830)
                   )
                  )
                  (i32.or
                   (i32.or
                    (i32.or
                     (i32.eq
                      (local.get $2)
                      (i32.const 1768846196)
                     )
                     (i32.eq
                      (local.get $2)
                      (i32.const 1818321516)
                     )
                    )
                    (i32.or
                     (i32.eq
                      (local.get $2)
                      (i32.const 1818850164)
                     )
                     (i32.eq
                      (local.get $2)
                      (i32.const 1819572340)
                     )
                    )
                   )
                   (i32.or
                    (i32.or
                     (i32.eq
                      (local.get $2)
                      (i32.const 1852798053)
                     )
                     (i32.eq
                      (local.get $2)
                      (i32.const 1886155636)
                     )
                    )
                    (i32.or
                     (local.tee $6
                      (i32.eq
                       (local.get $2)
                       (i32.const 1936552044)
                      )
                     )
                     (i32.eq
                      (local.get $2)
                      (i32.const 1936486004)
                     )
                    )
                   )
                  )
                 )
                )
               )
               (call $fimport$1
                (i32.const -1)
               )
               (br $label$7)
              )
             )
            )
           )
           (if
            (select
             (i32.eq
              (local.get $7)
              (i32.const 3)
             )
             (i32.const 1)
             (global.get $__asyncify_state)
            )
            (block
             (local.set $3
              (call $2
               (local.get $0)
              )
             )
             (drop
              (br_if $__asyncify_unwind
               (i32.const 3)
               (i32.eq
                (global.get $__asyncify_state)
                (i32.const 1)
               )
              )
             )
             (local.set $4
              (local.get $3)
             )
            )
           )
           (if
            (select
             (i32.eq
              (local.get $7)
              (i32.const 4)
             )
             (i32.const 1)
             (global.get $__asyncify_state)
            )
            (block
             (call $0
              (local.get $0)
              (i32.const 16)
             )
             (drop
              (br_if $__asyncify_unwind
               (i32.const 4)
               (i32.eq
                (global.get $__asyncify_state)
                (i32.const 1)
               )
              )
             )
            )
           )
           (if
            (i32.eqz
             (global.get $__asyncify_state)
            )
            (block
             (if
              (i32.ne
               (i32.load16_u align=1
                (i32.add
                 (local.tee $1
                  (i32.load offset=20
                   (local.get $0)
                  )
                 )
                 (local.tee $2
                  (i32.load offset=32
                   (local.get $0)
                  )
                 )
                )
               )
               (i32.const 1)
              )
              (block
               (call $fimport$1
                (i32.const -2)
               )
               (local.set $2
                (i32.load offset=32
                 (local.get $0)
                )
               )
               (local.set $1
                (i32.load offset=20
                 (local.get $0)
                )
               )
              )
             )
             (i32.store offset=20
              (local.get $0)
              (local.tee $6
               (i32.add
                (local.get $1)
                (i32.const 2)
               )
              )
             )
             (i32.store16
              (i32.load offset=4
               (local.get $0)
              )
              (i32.load16_u align=1
               (i32.add
                (local.get $2)
                (local.get $6)
               )
              )
             )
             (i32.store offset=20
              (local.get $0)
              (local.tee $1
               (i32.add
                (local.get $1)
                (i32.const 4)
               )
              )
             )
             (i32.store
              (i32.load
               (local.get $0)
              )
              (i32.load align=1
               (i32.add
                (local.get $1)
                (local.get $2)
               )
              )
             )
             (i32.store offset=20
              (local.get $0)
              (local.tee $6
               (i32.add
                (local.tee $1
                 (i32.load offset=20
                  (local.get $0)
                 )
                )
                (i32.const 10)
               )
              )
             )
             (i32.store16
              (i32.load offset=8
               (local.get $0)
              )
              (i32.load16_u align=1
               (i32.add
                (local.get $2)
                (local.get $6)
               )
              )
             )
             (i32.store offset=20
              (local.get $0)
              (i32.add
               (local.get $1)
               (i32.const 12)
              )
             )
             (local.set $1
              (i32.sub
               (local.get $4)
               (i32.const 16)
              )
             )
            )
           )
           (if
            (select
             (i32.eq
              (local.get $7)
              (i32.const 5)
             )
             (i32.const 1)
             (global.get $__asyncify_state)
            )
            (block
             (call $3
              (local.get $0)
              (local.get $1)
             )
             (drop
              (br_if $__asyncify_unwind
               (i32.const 5)
               (i32.eq
                (global.get $__asyncify_state)
                (i32.const 1)
               )
              )
             )
            )
           )
           (br_if $label$7
            (i32.eqz
             (global.get $__asyncify_state)
            )
           )
          )
         )
         (if
          (select
           (i32.eq
            (local.get $7)
            (i32.const 6)
           )
           (i32.const 1)
           (global.get $__asyncify_state)
          )
          (block
           (local.set $3
            (call $2
             (local.get $0)
            )
           )
           (drop
            (br_if $__asyncify_unwind
             (i32.const 6)
             (i32.eq
              (global.get $__asyncify_state)
              (i32.const 1)
             )
            )
           )
           (local.set $6
            (local.get $3)
           )
          )
         )
         (if
          (i32.eqz
           (global.get $__asyncify_state)
          )
          (block
           (local.set $10
            (i32.div_u
             (i32.load offset=48
              (local.get $0)
             )
             (local.tee $2
              (i32.load16_u
               (i32.load offset=4
                (local.get $0)
               )
              )
             )
            )
           )
           (local.set $11
            (f32.const 127)
           )
           (if
            (i32.le_u
             (local.tee $4
              (i32.sub
               (i32.rotl
                (i32.sub
                 (local.tee $1
                  (i32.load16_u
                   (i32.load offset=8
                    (local.get $0)
                   )
                  )
                 )
                 (i32.const 8)
                )
                (i32.const 29)
               )
               (i32.const 1)
              )
             )
             (i32.const 2)
            )
            (local.set $11
             (f32.load
              (local.tee $4
               (i32.add
                (i32.shl
                 (local.get $4)
                 (i32.const 2)
                )
                (i32.const 1040)
               )
              )
             )
            )
           )
           (local.set $8
            (i32.mul
             (local.get $1)
             (local.get $2)
            )
           )
          )
         )
         (loop $label$13
          (if
           (i32.eqz
            (global.get $__asyncify_state)
           )
           (br_if $label$7
            (local.tee $1
             (i32.eqz
              (local.get $6)
             )
            )
           )
          )
          (if
           (select
            (i32.eq
             (local.get $7)
             (i32.const 7)
            )
            (i32.const 1)
            (global.get $__asyncify_state)
           )
           (block
            (call $0
             (local.get $0)
             (local.get $8)
            )
            (drop
             (br_if $__asyncify_unwind
              (i32.const 7)
              (i32.eq
               (global.get $__asyncify_state)
               (i32.const 1)
              )
             )
            )
           )
          )
          (if
           (i32.eqz
            (global.get $__asyncify_state)
           )
           (block
            (local.set $12
             (i32.sub
              (i32.load
               (i32.load offset=16
                (local.get $0)
               )
              )
              (local.get $8)
             )
            )
            (local.set $4
             (local.tee $3
              (i32.load offset=20
               (local.get $0)
              )
             )
            )
            (loop $label$14
             (if
              (i32.lt_u
               (local.get $4)
               (local.get $12)
              )
              (block
               (local.set $2
                (i32.load16_u
                 (i32.load offset=4
                  (local.get $0)
                 )
                )
               )
               (local.set $1
                (i32.const 0)
               )
               (loop $label$16
                (if
                 (local.get $2)
                 (block
                  (f32.store
                   (i32.add
                    (i32.load offset=52
                     (local.get $0)
                    )
                    (i32.shl
                     (i32.add
                      (local.tee $13
                       (i32.mul
                        (local.get $1)
                        (local.get $10)
                       )
                      )
                      (i32.load offset=40
                       (local.get $0)
                      )
                     )
                     (i32.const 2)
                    )
                   )
                   (f32.div
                    (f32.convert_i32_u
                     (i32.load8_u
                      (i32.add
                       (local.get $13)
                       (i32.load offset=32
                        (local.get $0)
                       )
                      )
                     )
                    )
                    (local.get $11)
                   )
                  )
                  (local.set $2
                   (i32.sub
                    (local.get $2)
                    (i32.const 1)
                   )
                  )
                  (local.set $1
                   (i32.add
                    (local.get $1)
                    (i32.const 1)
                   )
                  )
                  (br $label$16)
                 )
                 (block
                  (i32.store offset=20
                   (local.get $0)
                   (local.tee $4
                    (i32.add
                     (local.get $4)
                     (local.get $8)
                    )
                   )
                  )
                  (br $label$14)
                 )
                )
               )
              )
             )
            )
            (local.set $6
             (i32.sub
              (local.tee $1
               (i32.add
                (local.get $3)
                (local.get $6)
               )
              )
              (local.get $4)
             )
            )
            (br $label$13)
           )
          )
         )
        )
        (if
         (select
          (i32.eq
           (local.get $7)
           (i32.const 8)
          )
          (i32.const 1)
          (global.get $__asyncify_state)
         )
         (block
          (local.set $3
           (call $2
            (local.get $0)
           )
          )
          (drop
           (br_if $__asyncify_unwind
            (i32.const 8)
            (i32.eq
             (global.get $__asyncify_state)
             (i32.const 1)
            )
           )
          )
          (local.set $1
           (local.get $3)
          )
         )
        )
        (if
         (select
          (i32.eq
           (local.get $7)
           (i32.const 9)
          )
          (i32.const 1)
          (global.get $__asyncify_state)
         )
         (block
          (call $3
           (local.get $0)
           (local.get $1)
          )
          (drop
           (br_if $__asyncify_unwind
            (i32.const 9)
            (i32.eq
             (global.get $__asyncify_state)
             (i32.const 1)
            )
           )
          )
         )
        )
       )
       (if
        (i32.eqz
         (global.get $__asyncify_state)
        )
        (block
         (local.set $2
          (i32.load offset=24
           (local.get $0)
          )
         )
         (br $label$5)
        )
       )
      )
     )
    )
    (if
     (i32.eqz
      (global.get $__asyncify_state)
     )
     (global.set $global$0
      (i32.add
       (local.get $5)
       (i32.const 16)
      )
     )
    )
    (return)
   )
  )
  (i32.store
   (i32.load
    (global.get $__asyncify_data)
   )
   (local.get $3)
  )
  (i32.store
   (global.get $__asyncify_data)
   (i32.add
    (i32.load
     (global.get $__asyncify_data)
    )
    (i32.const 4)
   )
  )
  (i32.store
   (local.tee $3
    (i32.load
     (global.get $__asyncify_data)
    )
   )
   (local.get $0)
  )
  (i32.store offset=4
   (local.get $3)
   (local.get $1)
  )
  (i32.store offset=8
   (local.get $3)
   (local.get $2)
  )
  (i32.store offset=12
   (local.get $3)
   (local.get $4)
  )
  (i32.store offset=16
   (local.get $3)
   (local.get $5)
  )
  (i32.store offset=20
   (local.get $3)
   (local.get $6)
  )
  (i32.store offset=24
   (local.get $3)
   (local.get $8)
  )
  (i32.store offset=28
   (local.get $3)
   (local.get $9)
  )
  (i32.store offset=32
   (local.get $3)
   (local.get $10)
  )
  (f32.store offset=36
   (local.get $3)
   (local.get $11)
  )
  (i32.store
   (global.get $__asyncify_data)
   (i32.add
    (i32.load
     (global.get $__asyncify_data)
    )
    (i32.const 40)
   )
  )
 )
 (func $4 (param $0 i32) (param $1 i32) (param $2 i32) (param $3 i32) (param $4 i32) (param $5 i32) (param $6 i32) (param $7 i32) (param $8 i32) (param $9 i32) (param $10 i32) (param $11 i32)
  (i32.store
   (local.get $1)
   (i32.const 56)
  )
  (i32.store
   (local.get $2)
   (i32.const 0)
  )
  (i32.store16
   (local.get $3)
   (i32.const 0)
  )
  (i32.store
   (local.get $5)
   (i32.const 0)
  )
  (i32.store16
   (local.get $4)
   (i32.const 0)
  )
  (i32.store
   (local.get $6)
   (i32.const 0)
  )
  (i64.store offset=20 align=4
   (local.get $0)
   (i64.const 0)
  )
  (i32.store offset=28
   (local.get $0)
   (local.get $7)
  )
  (i32.store
   (local.get $9)
   (i32.const 0)
  )
  (i32.store offset=52
   (local.get $0)
   (local.get $11)
  )
  (i32.store offset=36
   (local.get $0)
   (local.get $9)
  )
  (i32.store offset=32
   (local.get $0)
   (local.get $8)
  )
  (i32.store offset=16
   (local.get $0)
   (local.get $6)
  )
  (i32.store offset=12
   (local.get $0)
   (local.get $5)
  )
  (i32.store offset=8
   (local.get $0)
   (local.get $4)
  )
  (i32.store offset=4
   (local.get $0)
   (local.get $3)
  )
  (i32.store
   (local.get $0)
   (local.get $2)
  )
  (i64.store offset=40 align=4
   (local.get $0)
   (i64.const 0)
  )
  (i32.store offset=48
   (local.get $0)
   (local.get $10)
  )
 )
 ;; features section: simd, bulk-memory
)
