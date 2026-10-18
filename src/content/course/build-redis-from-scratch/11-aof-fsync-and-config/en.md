---
title: "[Day 11] AOF Fsync and Config"
codebase: '../codebase'
pubDate: 2026-10-18T18:54:32+08:00
---

> Is there possible losing data when shutdown but AOF haven't been written?

Sure. 

As I called `os.file.Write()`, the OS (POSIX-Compliant) could write data into page buffer, but not put into disk immediately. If there's any unexpected termination (e.g. power-off) before flushing, data loss forever. 

In most of database service (MySQL, Redis, ...) uses `fsync()` syscall to force flushing page buffer into disk. 

## AOF Sync

Redis provides 3 policies for AOF syncing:
- `no`: do not sync manually, wait for OS
- `always`: sync every write of AOF
- `everysec`: dispatch a thread, sync AOF every second. 

It is configurable by `redis.conf`

## Redis configuration

Redis can be configured by `redis.conf`, it is a text based file. [More info](https://redis.io/docs/latest/operate/oss_and_stack/management/config/)

We can write a parser easily:

```go {./internal/data/config.go#L1-L74}(e722f4ad06b89c57bbba359e8bc40e5f7b6cd87a)
```

> Note: This isn't a full Redis configration parser.

### Apply configuration

Initialize config in `main.go`:

```go {./cmd/olivine/main.go#L8-L13}(e722f4ad06b89c57bbba359e8bc40e5f7b6cd87a)
```

Use config in `app.go`:

```go {./cmd/olivine/app.go#L28-L47}(e722f4ad06b89c57bbba359e8bc40e5f7b6cd87a)
```

When `restorer` is `nil`, ignore it:

```go {./internal/server/server.go#L48-L54}(e722f4ad06b89c57bbba359e8bc40e5f7b6cd87a)
```

### Sync Always

If `appendfsync always` is set, call `aof.Sync()` after writing.

```go {./internal/service/aof.go#L39-L61}(95a9c4ed8156480c582f9f0ef73aee89a63f9aac)
```

```diff
	n, err := aof.f.Write(marshaled)
	if err != nil {
		return err
	}
	if n != len(marshaled) {
		return fmt.Errorf("wrote length mismatch: got %d want %d", n, len(marshaled))
	}

+	if aof.cfg.AOFFsync == data.AOFFsyncAlways {
+		return aof.f.Sync()
+	}

	return nil
```

### Sync Every Second

If `appendfsync everysec` is set, add a goroutine in `cmd/olivine/app.go` to call sync every second.

```go {./cmd/olivine/app.go#L65-L74}(edc720e293d6535b7a5d3a08abb666af5a189fe2)
```

Don't forget add `Sync()` in `service.AOF{}`

```diff
// file: internal/service/aof.go
type AOF interface {
	Read() (*resp.Command, error)
	Write(*resp.Command) error
+	Sync() error
	Close() error
}

+func (aof *file) Sync() error {
+	aof.mu.Lock()
+	defer aof.mu.Unlock()
+
+	return aof.f.Sync()
+}
```

## Redis Config Parser

I've implemented a incomplete configuration parser, but it includes some problems:
1. Because of `rd.ReadString('\n')`, it returns EOF if this file is not includes tailing `\n`
2. Because of `strings.Trim(line, " \n")` and `strings.SplitN(line, " ", 2)`, it's hard to understand.

I told Codex (GPT-5.5 medium) to fix these problems, and it gave me:

```go {./internal/data/config.go#L27-L88}(d26cd864ef27c5080d37ea615b46926086759b3a)
```

Ohh..., what the fxxk..., it made everything hard to read: `io.EOF` checking everywhere. 

There's an important context: Redis configuration is provided by server owner, and it may not a very large file.

Therefore, we completely load whole file into memory and parse it directly instead of read line by line. The tailing `\n` can be added after read in memory, we don't need to hanle it in every loop.

There's my answer:

```go {./internal/data/config.go#L42-L60}(ec983943b393ddbea842eccd65834baff58b8bed)
```

### Constant Enum

There's an important design is enum of `AOFFsync`:

```go {./internal/data/config.go#L16-L20}(ec983943b393ddbea842eccd65834baff58b8bed)
```

Use `iota+1` instead of `iota`, because the variable will be initialize as zero value in Go. We don't know if `AOFFsync` be set as `AOFFsyncNo` or default zero value if using `iota`. 

## Ticker

I used `time.Sleep(time.Second)` for AOF syncing in `cmd/olivine/app.go`:

```go {./cmd/olivine/app.go#L66-L73}(edc720e293d6535b7a5d3a08abb666af5a189fe2)
```

It ignores shutdown signals in this goroutine, it is safe because program exit recently, but it's not elegant.

Use `time.Ticker` instead:

```go {./cmd/olivine/app.go#L66-L80}(ec983943b393ddbea842eccd65834baff58b8bed)
```
