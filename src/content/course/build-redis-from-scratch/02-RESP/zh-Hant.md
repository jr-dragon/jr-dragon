---
title: RESP：Redis 序列化協議
codebase: '../olivine'
---

如果我們想要與其它人溝通，我們就必須要與對方說相同的語言。如果我想們與 Redis 溝通，我們就要使用 _Redis 序列化協議（Redis Serialization Protocol，簡稱 RESP）_。

> 註：本課程的標題「以 Go 建構與 Redis 相容的服務」，其實嚴格定義的話應該是「以 Go 建構使用 Redis 序列化協議的記憶體內鍵值資料庫」，不過這實在是太過冗長了。

目前 RESP 有兩個版本：RESP2 與 RESP3，我們會在這個課程實作 RESP2，因為它相對簡單。事實上，RESP3 是 RESP2 的超集（簡而言之，RESP3 有一部份包含 RESP2，這個設計讓 RESP2 也可以在高版本的 Redis 中運作）。

在官方撰寫的 [Redis serialization protocol specfication](https://redis.io/docs/latest/develop/reference/protocol-spec/) 有詳細闡述 RESP 是為什麼這麼設計的。

## RESP 值

### 魔術字元

RESP 有多種不同的資料型態，它設計了一個 _魔術字元（Magic Byte）_ 來辨別：

- 簡單字串（Simple String）：`+`
- 簡單錯誤（Simple Error）：`-`
- 整數（Integer）：`:`
- 聚合字串（Bulk String）：`$`
- 陣列（Array）：`*`

我們先嘗試定義這些魔術字元常數：

```go {./pkg/resp/value.go#L7-L14}(17a7fb3)
```

你或許注意到我把 `value.go` 放在 `./pkg` 底下，這意味著這個套件打算公開使其它套件或服務也可以使用。可以參考 [golang-standards/project-layout](https://github.com/golang-standards/project-layout#pkg) 中的說明，**這個並非 Go 的官方標準**，而是一個約定俗成的習慣，但它有助於組織一個中大型專案以及與其它開源社群合作。

### `Value` 介面

在 [Build Redis from scratch](https://www.build-redis-from-scratch.dev/en/resp-reader) 中定義了 RESP Value 結構如下：

```go
type Value struct {
    typ string
    str string
    num int
    bulk string 
    array []Value
}
```

它很簡單，但我更偏好為 RESP 值定義一個 `Value` 介面：

```go {./pkg/resp/value.go#L16-L18}(17a7fb3)
```

> 註：`Marshal()` 這個命名是來自於 `json.Marshal()`，指的是將一個結構序列化為 `[]byte`

### 簡單字串

作為首個定義的 RESP 值的資料型態，我認為 `resp.SimpleString` 是一個很好的起點。

```go {./pkg/resp/value.go#L20-L29}(17a7fb3)
```

接下來，我們就可以把這個寫入 `internal/server/resp.go` 的 `net.Conn` 下：

```go {./internal/server/resp.go#L50-L53}(e73353e)
#L50 - 	if _, err := conn.Write([]byte("ACK: " + strings.ToUpper(requestMessage))); err != nil {
```

#### 使用 `redis-cli` 進行手動測試

Redis 提供了一系列好用的工具，而 `redis-cli` 是最常用的之一。它可以協助我們送出 RESP 協定的請求與解析回覆，這有助於我們檢查設計出來的服務是否相容於 Redis。

```sh
$ redis-cli -p 16379 ping
OK
```

## Redis 指令

Redis 指令是一個特殊的 RESP 值，它本質上是一個聚合字串陣列：

- `Array{ BulkString{"PING"} }`：[PING](https://redis.io/docs/latest/commands/ping/) 指令
- `Array{ BulkString{"GET"}, BulkString{"foo"} }`：[GET](https://redis.io/docs/latest/commands/get/) 指令，有一個 `foo` 參數

### 聚合字串

聚合字串有兩種類型：

- 聚合字串
    ```txt
 	Null Bulk String Format: 
 	|-------------------|--------|----------| 
 	| MAGIC_BULK_STRING | LENGTH | SENTINEL | 
 	|-------------------|--------|----------| 
 	|               '-' | "-1"   | "\r\n"   | 
 	|-------------------|--------|----------| 
    ```

- 空聚合字串
    ```txt
    Non Null Bulk String Format: 
 	|-------------------|--------|---------|----------| 
 	| MAGIC_BULK_STRING | Length | Content | SENTINEL | 
 	|-------------------|--------|---------|----------| 
 	|               '$' |    "5" | "hello" | "\r\n"   | 
 	|-------------------|--------|---------|----------| 
    ```

> 註：直到 RESP3 才出現 `Null` 類型的 RESP 值，因此在 RESP2 中通常使用空聚合字串代表 Null。

根據上述的資料結構，我們可以定義 `resp.BulkString` 的結構：

```go {./pkg/resp/value.go#L32-L50}(2a8a329)
```

### 陣列

與聚合字串類似，RESP2 中也定義了陣列與空陣列：

```txt
Null Array Format: 
|-------------|--------|----------| 
| MAGIC_ARRAY | LENGTH | SENTINEL | 
|-------------|--------|----------| 
|         '*' | "-1"   | "\r\n"   | 
|-------------|--------|----------|

Array Format: 
|-------------|--------|----------|-----------------------| 
| MAGIC_ARRAY | LENGTH | SENTINEL | Marshaled Element [0] | 
|-------------|--------|----------|-----------------------| 
|         '*' |    "1" | "\r\n"   | "$4\r\nPING\r\n"      | 
|-------------|--------|----------|-----------------------| 
```

根據上述的結構，我們在定義時會發現 RESP 陣列往往需要同時序列化其它的資料型態－－尤其是聚合字串。

因此我們在定義 `resp.Array.Marshal()` 時，一併定義了 `resp.Array.marshalTo(*bytes.Buffer)` 用於對聚合字串的序列化。

```go {./pkg/resp/value.go#L52-L79}(2a8a329)
```

### 從 `net.Conn` 讀取 Redis 指令

目前，我們的伺服器使用 `bufio.(*Reader).ReadBytes('\n')` 來讀取資料：

```go {./internal/server/resp.go#L43-L44}(2a8a329)
```

比較合理的做法應該是建立一個專屬於 RESP 的讀取器 `resp.(*Reader)` 使讀取出來的值就是 `resp.Value`。

```go {./pkg/resp/reader.go}(135ae3e)
```

`resp.(*Reader)` 本質上就是一個 `bufio.(*Reader)` 的包裝器，只不過利用 `resp.(*Reader).Read()` 能夠協助我們直接讀取陣列或聚合字串的 RESP 值。

我們可以把陣列或聚合字串這種資料型態拆成兩個部份：資料頭（定義資料長度）以及資料體（資料本身），因為我設計了一個輔助用接收器 `resp.(*Reader).readHeader()`，它能夠協助我們拆分兩者。

#### 如何構建聚合字串

上述我用到了 `resp.BuildBulkString()`，這是一個另外定義的建構函式：

```go {./pkg/resp/value.go#L39-L46}(135ae3e)
```

```go {./pkg/resp/helper.go#L9-L28}(135ae3e)
```

```go {./pkg/resp/helper.go#L60-L75}(135ae3e)
```

雖然實作上拆成了三個函式，但其核心邏輯其實相當簡單：

- `resp.BuildBulkString()`：用來判斷是否為空聚合字串
- `resp.readBlob()`：用來讀取原始資料
- `resp.parseLength()`：用來讀取資料頭中的資料長度，如果是負數則作為錯誤回傳

#### 如何構建陣列

同理，`resp.BuildArray()` 也是一個另外定義的建構函式：

```go {./pkg/resp/value.go#L68-L75}(135ae3e)
```

```go {./pkg/resp/helper.go#L30-L58}(135ae3e)
```

與 `resp.BulkString` 類似拆成了兩個函式，並且複用 `resp.parseLength()`：

- `resp.BuildArray()`：用來判斷是否為空陣列
- `resp.readValues()`：用來讀取所有陣列中的 RESP 值，這邊重複使用了 `resp.(*Reader).Read()` 來簡化邏輯。

## 從 `net.Conn` 讀取 Redis 指令

完成上述功能之後，就可以把 `./internal/server/resp.go` 中的讀取器改成 `resp.(*Reader)`：

```go {./internal/server/resp.go#L42-L50}(135ae3e)
#L42 - 	rd := bufio.NewReader(conn)
#L43 - 	requestMessage, err := rd.ReadBytes('\n')
```

### 行內 Redis 指令

雖然 RESP 的設計上已經是人類易讀的格式，但是如果每次都非要去記各種不同的魔術字元、寫 `"\r\n"` 之類的還是太過麻煩。

```sh
$ echo '*1\r\n$4\r\nPING\r\n' | nc 127.0.0.1 16379
+OK
```

因此 Redis 支援 _行內 Redis 指令（Inline Redis Command）_，其目的在於可以讓用戶在沒有 `redis-cli` 的時候能夠用 `nc` 指令與 Redis 通訊：

```sh
$ echo 'PING\r\n' | nc 127.0.0.1 16379
+OK
```

為了達成這個功能，我們需要加入 `resp.BuildInlineArray([]byte)`：

```go {./pkg/resp/value.go#L77-L86}(b4259aa)
```

```go {./pkg/resp/reader.go#L21-L35}(b4259aa)

```

