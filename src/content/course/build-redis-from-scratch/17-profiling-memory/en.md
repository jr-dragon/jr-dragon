---
title: "[Day 17] Profiling with memory"
codebase: '../codebase'
pubDate: 2026-10-18T18:54:32+08:00
---

After #15 and #16, we can get flame graph below:

<img width="3842" height="1042" alt="Image" src="https://github.com/user-attachments/assets/103c8740-0346-4cdc-b9c0-b33ae2ad9598" />

The `runtime.gcDrain` takes 25.14(13.9%) CPU time, it means that our service creating and destroying short life objects frequently.

## Memory Profiling

We can get allocation and heap flame graph from `localhost:6060/debug/pprof/allocs` and `localhost:6060/debug/pprof/heap` after benchmarking.

> Note: Use `redis-benchmark -p 16379 -t SET -P 16 -n 10000000 -r 1000000` in this chapter.

Here's the allocation flame graph:

<img width="3840" height="744" alt="Image" src="https://github.com/user-attachments/assets/2bf3b183-fe43-4106-adfc-182d843a9c7e" />

Here's the heap flame graphc:

<img width="3850" height="780" alt="Image" src="https://github.com/user-attachments/assets/8df679a0-0778-483d-bd5e-034fd23e2065" />

The difference between "allocs" and "heap" in Go pprof:
- allocs: Memory allocation history, including active and destroyed objects.
- heap: Memory in current state, only active or haven't collected by GC.

Because `runtime.gcDrain` takes a lot of time, we need to focus on "allocs" flame graph.

## Use `bufio.(*Reader).ReadSlice()`

The `resp.(*Reader).readLine()` implementation: 

```go {./pkg/resp/io.go#L102-L121}(61e559535921a92aae63bf93424a6038baf1f4cd)
```

It needs to glow `var buf bytes.Buffer` many times when reading. Refactor with  `r.rd.ReadSlice('\n')` and reuse the buffer in `bufio.(*Reader)`.

```go {./pkg/resp/io.go#L150-L178}(99b5bdefac2a4a1907b4829978434400642c424e)
```

### Result

Use `go tool pprof -http=:8000 -base ./scripts/out_archive/1-original.allocs ./scripts/out_archive/2-readslice.allocs`, we can compare the memory decreasing between changes.

<img width="3848" height="776" alt="Image" src="https://github.com/user-attachments/assets/a5f752aa-4f39-437b-82cd-1bbf04790c93" />

## Type casting with interface

`Interface` is an useful feature, it makes us write clean and readable code. 

However, Go allocates memory on heap for interfaces because of casting. 

In `resp.ReadCommand()`:
- `rd.Read()` returns `resp.Value{}` interface
- `arr, ok := v.(Array)` cast it into `resp.Array{}` struct
- `cmd, ok := arr.data[0].(BulkString)` casts `arr.data[0]` from `resp.Value{}` to `resp.(BulkString)`
- `args` casts remaining elements from `arr.data` from `resp.Value{}` to `resp.(BulkString)`

```go {./pkg/resp/cmd.go#L26-L60}(61e559535921a92aae63bf93424a6038baf1f4cd)
```

I made a fast path of command parsing for `resp.(*Reader).ReadCommand()`, it expects an `resp.(Array)` with `resp.(BulkString)` directly.

```go {./pkg/resp/io.go#L39-L77}(e7e6badf2ea122b46677fb8201e9296e2891d329)
```

`resp.ReadCommand()` uses `resp.(*Reader).ReadCommand()` directly.

```go {./pkg/resp/cmd.go#L29-L44}(e7e6badf2ea122b46677fb8201e9296e2891d329)
```

### Result

<img width="3844" height="610" alt="Image" src="https://github.com/user-attachments/assets/54c3d25d-b9b0-469c-9c6f-238161aa14e2" />


## AOF Copy-on-Write

`resp.(*Commands).aof` is a copy of `resp.(*Commands).raw`, because command could be updated when writing to AOF (`SET ... EX ... ` is updated to `SET ... PXAT ...`), even if AOF feature disabled. 

As you know, `resp.(*Commands).UpdateAOF()` and `resp.(*Commands).MarshalAOF()` are only invoked when AOF feature enabled, we can initialize `resp.(*Commands).aof` in these recievers instead of initializing in `resp.ReadCommand()`

```go {./pkg/resp/cmd.go#L66-L83}(99b5bdefac2a4a1907b4829978434400642c424e)
```

### Result

<img width="3842" height="556" alt="Image" src="https://github.com/user-attachments/assets/7bc93c94-d413-4279-aa3a-d9d374fbcf84" />

## Refactor `resp.(*Commands)` fields

There's definition of `resp.(*Commands)`:

```go {./pkg/resp/cmd.go#L22-L27}(594c4e4b1de8c798559129b34f80e9ca9c92bc74)
```

After `resp.ReadCommand()` refactor, `cmd` and `args` fields are unnecessary, we can remove it safely. 

```diff
type Command struct {
	raw  []BulkString
	aof  []BulkString
-	cmd  BulkString
-	args []BulkString
}
```

```go {./pkg/resp/cmd.go#L53-L59}(53bbefca0f1c848757a98b3ecaca50a32cf39595)
```

### Result

<img width="1925" height="272" alt="Image" src="https://github.com/user-attachments/assets/32fdf3c5-2cf5-465e-909e-c7916c453689" />

## Shared Buffer

Most of `resp.(BulkString)` are short, but we need to `buf := make([]byte, sz)` every time before reading. 

```go {./pkg/resp/io.go#L103-L126}(53bbefca0f1c848757a98b3ecaca50a32cf39595)
```

We can define a shared `[]byte` in `resp.(*Reader)` and reuse it.

```diff
type Reader struct {
	rd       *bufio.Reader
+	bytesbuf [1 << 12]byte
}
```

```go {./pkg/resp/io.go#L111-L139}(0762d32056a4a7644ff9cfe0e5dbc7da1d7bf519)
```

We defined a `bytesbuf` with 4096 byte, and reuse it between requests in same connection. 

Because the `resp.(BulkString).data` referenced to bytesbuf, it covered by other requests and get unexpected data. 

We can update `resp.(BulkString).data` data type from `[]byte` to `string`, and make a string copy when creating `resp.(BulkString)`.

### About `valuebuf` 

We can make a `valuebuf` in `resp.(*Reader)` as a shared buffer likes `bytesbuf` for `resp.(*Reader).ReadCommand()`

```diff
type Reader struct {
	rd       *bufio.Reader
+	valuebuf [8]BulkString
	bytesbuf [1 << 12]byte
}
```

```go {./pkg/resp/io.go#L41-L81}(0762d32056a4a7644ff9cfe0e5dbc7da1d7bf519)
```

There's core changes about using `valuebuf`: use `r.valuebuf` if `sz <= 8`, or `make([]BulkString, sz)`

```go
	var values []BulkString
	if sz <= len(r.valuebuf) {
		clear(r.valuebuf[:])
		values = r.valuebuf[:sz:sz]
	} else {
		values = make([]BulkString, sz)
	}
```

It's important to `clear(r.valuebuf[:]` before assigning, the `r.valuebuf` could remains previous data and costs a lot if there's a long string.

> Note: `resp.(*Reader).ReadCommand()` could return `valuebuf` and it is assigned to `resp.(*Command).raw` and take its ownership. It's ok in this case because commands are synchronization in command pipeline in this case, but it risks when sharing.

### Result

<img width="3842" height="604" alt="Image" src="https://github.com/user-attachments/assets/04c2a19a-a5c3-4582-8a99-5af3f22dbb2c" />

## Something else

### OK response

It responses "+OK\r\n" when set successfully, it makes a new `resp.SimpleString{}` every time.

```go {./internal/service/cmd/set.go#L64-L64}(0762d32056a4a7644ff9cfe0e5dbc7da1d7bf519)
```

Use a defined variable `resp.OKValue` makes it better.

```go {./pkg/resp/value.go#L58-L64}(99b5bdefac2a4a1907b4829978434400642c424e)
```

### Debug Logging

The debugging logging creates a `slog.Any("error", err)` and takes CPU time and allocs object. Remove it (or disable it). 

## Conclusion

I tried to benchmark Redis, Olivine #14 and after profiling by parameters below:
```shell
$ redis-benchmark -t SET -P 16 -n 10000000 -r 1000000
```

Environment: 
- Macbook Pro 2023 14"
- CPU: Apple M2 Pro
- RAM: 32GB
- SSD: 512GB

Result: 
- Redis 8.8: 1090512.50 req/s 
- Olivine #14: 70773.91 req/s
- Olivine profiled: 1397038.25 req/s

The throughput is up to 20x, even more than official redis server.
