---
title: "Day 3、4：RESP2 Value 與 Reader"
codebase: '../codebase'
pubDate: 2026-10-18T18:54:32+08:00
---

## RESP：Redis Serialization Protocol

溝通需要共同的語言。要和 Redis 溝通，就要使用為它設計的 RESP。

RESP 有 RESP2 與 RESP3 兩個版本。這一章先實作較簡單的 RESP2。

> 注意：RESP3 大致上是 RESP2 的超集，自 Redis 6.0 起受到支援。

Redis 官方提供 [Redis serialization protocol specification](https://redis.io/docs/latest/develop/reference/protocol-spec/)，說明 RESP 的設計原因與格式。

## RESP Value

### Magic Byte

RESP 透過 magic byte 辨識資料型別。RESP2 有五種型別：

- Simple String：`+`
- Simple Error：`-`
- Integer：`:`
- Bulk String：`$`
- Array：`*`

在 `pkg/resp/value.go` 定義常數：

https://github.com/jr-dragon/olivine/blob/

```go
// file: pkg/resp/value.go
package resp

const(
	MAGIC_SIMPLE_STRING = '+'
	MAGIC_SIMPLE_ERROR  = '-'
	MAGIC_INTEGER       = ':'
	MAGIC_BULK_STRING   = '$'
	MAGIC_ARRAY         = '*'
)
```

> 注意：`pkg` 下的 package 用來提供其他開發者引用。可參考 [golang-standards/project-layout](https://github.com/golang-standards/project-layout#pkg)。**這不是 Go 官方標準**，但能作為中大型專案組織方式的參考。

### `Value` interface

[Build Redis from scratch](https://www.build-redis-from-scratch.dev/en/resp-reader) 使用下列 `Value{}`：

```go
type Value struct {
	typ   string
	str   string
	num   int
	bulk  string
	array []Value
}
```

這很簡單，但我偏好為所有 RESP 型別定義共同的 `Value` interface：

```go {./pkg/resp/value.go#L14-L16}(9b5841c1a7764708d8a4c545c4c63b9c0ed037c8)
```

`Marshal()` 的命名受到 `json.Marshal()` 啟發，回傳要寫入連線、作為回應的內容。

### Simple String

先建立實作 `Value` interface 的 `SimpleString` 型別。

```go {./pkg/resp/value.go#L21-L39}(3892588b3493482ea5cd72542bdec55080a445b5)
```

### 寫入 `net.Conn`

`internal/server/server.go` 原本以 `conn.Write([]byte("ACK: " + strings.ToUpper(msg)))` 寫入回應。

```go {./internal/server/server.go#L39-L55}(975447adc04bdd83a41182de40169cefefaa0075)
```

```diff
-	if _, err := conn.Write([]byte("ACK: " + strings.ToUpper(msg))); err != nil {
+	if _, err := conn.Write(resp.SimpleString("OK").Marshal()); err != nil {
```

```go {./internal/server/server.go#L38-L52}(9b5841c1a7764708d8a4c545c4c63b9c0ed037c8)
```

### 使用 `redis-cli` 手動測試

Redis 提供許多工具，其中 `redis-cli` 能以 RESP 傳送請求、處理回應，適合檢查服務是否能與 Redis client 溝通。

```shell
$ redis-cli -p 16879 ping
OK
```

### Redis Command：Array 與 BulkString

請求中的 Redis Command 是由 Bulk Strings 組成的 RESP Array。

- `Array{ BulkString{"PING"} }`：[`PING`](https://redis.io/docs/latest/commands/ping/) 指令。
- `Array{ BulkString{"GET"}, BulkString{"bar"} }`：帶有 `"bar"` 參數的 [`GET`](https://redis.io/docs/latest/commands/get/) 指令。

### `BulkString` Value

RESP 區分下列兩種 Bulk String 表示方式：

- [Bulk String](https://redis.io/docs/latest/develop/reference/protocol-spec/#bulk-strings)
- [Null Bulk String](https://redis.io/docs/latest/develop/reference/protocol-spec/#null-bulk-strings)

RESP3 才定義獨立的 Null 型別，因此這裡以 Null Bulk String 表示空值。

```diff
// file: pkg/resp/value.go
const (
	MAGIC_SIMPLE_STRING = '+'
	MAGIC_SIMPLE_ERROR  = '-'
	MAGIC_INTEGER       = ':'
	MAGIC_BULK_STRING   = '$'
	MAGIC_ARRAY         = '*'
+	SENTINEL            = "\r\n"
)
```

```go {./pkg/resp/value.go#L41-L74}(3892588b3493482ea5cd72542bdec55080a445b5)
```

### `Array` Value

和 Bulk String 類似，RESP2 也定義了 Null Array。

```go {./pkg/resp/value.go#L76-L110}(3892588b3493482ea5cd72542bdec55080a445b5)
```

## 從 `net.Conn` 讀取

目前使用 `*bufio.Reader` 處理連線，但它不是專為 RESP 設計的。

考慮以下 reader：

```go
rd := bufio.NewReader(conn)
for {
	msg, _, err := rd.ReadLine()
	if err != nil {
		fmt.Printf("err = %+v\n", err)
		break
	} else {
		fmt.Printf("msg = %s\n", msg)
	}
}
```

傳入 `*1\r\n$4\r\nPING\r\n` 這個 Redis Command 時，必須分多次解析 `msg`，並不方便。

> 示範：[Go Playground](https://go.dev/play/p/f1Pe0T6PMCw)。

因此，我在 `pkg/resp/io.go` 建立 `*resp.Reader`：

```go {./pkg/resp/io.go#L16-L38}(3892588b3493482ea5cd72542bdec55080a445b5)
```

### `readLine()` 與 `readInt()`

Redis Command 是 Bulk Strings 的 Array，在 Redis 內部也稱為 multibulk。這裡以 `{MAGIC}{LENGTH}\r\n{DATA}\r\n` 概括 Array 與 Bulk String 的格式。

在實作 `readArray()`、`readBulkString()` 前，先建立 `readLine()` 與 `readInt()`：

```go {./pkg/resp/io.go#L94-L108}(3892588b3493482ea5cd72542bdec55080a445b5)
```

```go {./pkg/resp/io.go#L85-L92}(3892588b3493482ea5cd72542bdec55080a445b5)
```

### `readBulkString()`

Bulk String 是 binary-safe 字串，讀取時根據 header 指定的長度取得資料。

> 注意：C-style 字串以 null byte `\0` 結尾，因此無法直接表示任意位置都可能包含 null byte 的資料。

```go {./pkg/resp/io.go#L64-L83}(3892588b3493482ea5cd72542bdec55080a445b5)
```

### `readArray()`

RESP Array 可以視為 RESP values 的集合，逐一遞迴讀取其中的值。

```go {./pkg/resp/io.go#L40-L62}(3892588b3493482ea5cd72542bdec55080a445b5)
```

### 處理 Redis Commands

`internal/server/server.go` 原本使用 `msg, err := rd.ReadString('\n')`，現在改用 `*resp.Reader`。

```diff
	rd := resp.NewReader(conn)
-	msg, err := rd.ReadBytes('\n')
+	cmd, err := rd.Read()
```

```go {./internal/server/server.go#L37-L53}(3892588b3493482ea5cd72542bdec55080a445b5)
```
