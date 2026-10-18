---
title: "[Day 16] Profiling with mutex lock"
codebase: '../codebase'
pubDate: 2026-10-18T18:54:32+08:00
---

`redis-benchmark` uses the same key if `-r` not specified, it makes mutex lock waiting when set/get paralleling. 

That why we can get a flame graph with `redis-benchmark -p 16379 -t SET -P 16` below:

<img width="3844" height="1002" alt="Image" src="https://github.com/user-attachments/assets/1a498d11-1071-4faa-927c-2c88f4f47acc" />

It wastes 40% CPU time for trying to get mutex lock, and get the same result even if we use `redis-benchmark -p 16379 -t SET -P 16 -r 1000000`.

> Note: `redis-benchmark` uses radom key format in `key:{12 bytes number}` when `-r <keyspacelen>` specified, the 12 bytes number in range $[0, \<keyspacelen\>]$

We can get more information about what blocks service by getting report from `http://localhost:6060/debug/pprof/block` after benchmarking.

<img width="1918" height="398" alt="Image" src="https://github.com/user-attachments/assets/a4f9b29d-1450-46fd-b610-3fd5f9b180ea" />

It takes 1464.62 seconds for waiting mutex lock.

## Lock Striping

"Lock striping" is a pattern for concurrent programming: lock a part of resource instead of lock resource completely.

Defines some "slots" and decide which slot stores the given key by hashing.

### Refactor `mapStorage`

```go {./internal/repo/storage.go#L56-L70}(aa1e4c94898c067d305232f71fbbe2693b2c86bb)
```

`const lockStripeCount = 16`, it is a balance value of slot count.

```go {./internal/repo/storage.go#L243-L245}(aa1e4c94898c067d305232f71fbbe2693b2c86bb)
```

Use `xxh3.HashString(k)` for hashing the key, it returns a `uint64`. There's only 16 slots, it can be fit by `hashed % lockStripeCount`.

> Note: `hashed % lockStripeCount` equals `hashed & (lockStripeCount-1)` if `lockStripeCount` is $2^n$.

### Refactor `(*mapStorage).Set()` and `(*mapStorage).Get()`

We should get which slot will be operated before getting or setting.

```go {./internal/repo/storage.go#L80-L87}(aa1e4c94898c067d305232f71fbbe2693b2c86bb)
```

```go {./internal/repo/storage.go#L172-L187}(aa1e4c94898c067d305232f71fbbe2693b2c86bb)
```

## Result

The flame graph of profiling after refactoring:

<img width="3828" height="878" alt="Image" src="https://github.com/user-attachments/assets/acfea854-84ec-4acb-88c9-285b3aa9f25a" />

It costs CPU time from 47.33s(37.7%) to 8.58s(4.7%).

<img width="3840" height="736" alt="Image" src="https://github.com/user-attachments/assets/f4403593-cb77-45e3-ab1f-c8830d008acb" />

Otherwise, it blocks from 1464.62s to 22.53s.
