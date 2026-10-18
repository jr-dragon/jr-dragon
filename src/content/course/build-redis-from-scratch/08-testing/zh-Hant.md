---
title: "Day 8：測試"
codebase: '../codebase'
pubDate: 2026-10-18T18:54:32+08:00
---

測試是 Go 的原生功能。建立以 `_test.go` 結尾的檔案，再執行 `go test` 即可。

內建測試提供共同基礎，讓開發者不必先被「要選哪個測試框架」或「怎麼建立測試案例」阻擋。

## 第一個測試：SimpleString

從 `pkg/resp/value.go` 的 `SimpleString` 開始。在 `value_test.go` 建立 `TestSimpleString_Marshal`：

```go {./pkg/resp/value_test.go#L8-L33}(29ef724be5776461828bb34b08eca5906a282a3f)
```

`*_test.go` 中以 `Test` 開頭、符合測試函式簽名的函式會被視為測試。

我通常把測試分成測試案例定義與 test runner。Runner 再依序分為 Arrange、Act、Assert。

### 測試案例與 runner

```go
func TestFoo(t *testing.T) {
	// Test cases definition
	testcases := []struct{
		name string
	}{
		{
			name: "test case 1",
		},
		{
			name: "test case 2",
		},
	}

	for _, tc := range testcases {
		// Test Runner
		t.Run(tc.name, func (t *testing.T) {})
	}
}
```

測試函式或 method 時，通常會有兩個以上的案例。Go 提供 `t.Run()`，可以在同一個測試中執行 subtests。

> 注意：只有一個案例時，不一定需要 `t.Run()`。清楚、可讀、易維護的程式碼更重要。

### Arrange、Act、Assert

AAA pattern 將單元測試分成三階段：

- Arrange：準備資料，例如初始化 struct 或建立暫存資源。
- Act：執行要測試的操作。
- Assert：檢查結果是否符合預期。

```go {./pkg/resp/value_test.go#L24-L33}(7aa836316b4c685ba39fe3c6417338f725407cdc)
```

對應的程式片段如下：

```go
// arrange: create SimpleString by tc.data
s := SimpleString(tc.data)
```

```go
// act: Invoke the s.Marshal() to get result
marshaled := s.Marshal()
```

```go
// assert: check the marshaled and tc.expect is the same
if !slices.Equals(tc.expected, marshaled) {
	t.Errorf("expect '%s', got '%s'", tc.expect, marshaled)
}
```

## Benchmarking

Benchmark 也是 Go 內建的測試功能。

我為 `SimpleString.Marshal()` 寫了兩種實作：

```go {./pkg/resp/value.go#L35-L55}(7aa836316b4c685ba39fe3c6417338f725407cdc)
```

> 注意：不應太早最佳化效能。這裡是為了學習 benchmark，不會把相同實驗套用到其他 RESP values。

Benchmark 函式以 `Benchmark` 開頭，參數為 `b *testing.B`。

```go {./pkg/resp/value_test.go#L35-L53}(7aa836316b4c685ba39fe3c6417338f725407cdc)
```

若 Arrange 不耗時，就不需要手動呼叫 `b.StartTimer()` 與 `b.EndTimer()`；這裡只是示範。

### 執行測試

使用 `go test ./pkg/resp/value_test.go` 執行測試，並以 `go test -bench=. ./pkg/resp.value_test.go` 執行 benchmark。

也可以在專案根目錄執行 `go test ./...` 與 `go test -bench=. ./...`，測試整個專案。

我會將命令寫入 `Makefile`，簡化為 `make test`：

```makefile {./Makefile#L13-L14}(7aa836316b4c685ba39fe3c6417338f725407cdc)
```

## Redis Command 測試

回顧 `Command` interface：加入新指令時，只需要實作 `internal/service/cmd/cmd.go` 的介面，再註冊到 `NewCommands()`。`GET` 與 `SET` 也是如此。

```go {./internal/service/cmd/cmd.go#L10-L22}(7aa836316b4c685ba39fe3c6417338f725407cdc)
```

### `Storage` interface

`NewGet()` 與 `NewSet()` 都需要 `repo.Storage`。測試時該如何提供？可以使用 mock 或 stub。

有時不需要關心 storage 的細節，只需要 `Set` 接受輸入、`Get` 回傳指定資料。這時能用 stub：

```go
func TestGet_Exec(t *testing.T) {
	cmd := NewGet(&stubStorage{})

	ret, err := cmd.Exec(t.Context(),
		resp.NewTestCommand(
			resp.NewArray([]resp.Value{
				resp.NewBulkString("GET"),
				resp.NewBulkString("foo"),
			}),
		),
	)
	if err != nil {
		 t.Error(err)
	}

	if !slices.Equals(ret.Marshal(), []byte("$3\r\nbar\r\n")) {
		 t.Error("expect '%s', got '%s', []byte("$3\r\nbar\r\n"), ret.Marshal())
	}
}

type stubStorage struct {}

func (*stubStorage) Set(ctx context.Context, k, v string) error { return nil }
func (*stubStorage) Get(ctx context.Context, k string) (string, error) { return "bar", nil }
```

`stubStorage` 實作 `Set()` 與 `Get()`，滿足 `repo.Storage`，因此能傳入 `NewGet()`。

### Mock generator

有些開發者使用 [stretchr/testify](https://github.com/stretchr/testify)，但我不喜歡它的 mock，這讓我想起寫 Java 的經驗。我改用 [matryer/moq](https://github.com/matryer/moq)：

```shell
$ go get -tool github.com/matryer/moq
```

> 注意：moq README 使用 `go install github.com/matryer/moq@latest` 安裝全域執行檔。Go 1.24 起可以使用 `go get -tool` 管理 module 範圍的工具。

在 `Storage` interface 加入 go generate 註解：

```go {./internal/repo/storage.go#L13-L17}(7aa836316b4c685ba39fe3c6417338f725407cdc)
```

執行 `go generate ./...`，moq 會產生 `storage_mock.go`。

### 使用 mock storage 測試

使用 moq 的範例如下：

```go
func TestGet_Exec(t *testing.T) {
	cmd := NewGet(&repo.StorageMock{
		GetFunc: func(ctx context.Context, k string) (string, error) { return "bar", nil }
	})

	ret, err := cmd.Exec(t.Context(),
		resp.NewTestCommand(
			resp.NewArray([]resp.Value{
				resp.NewBulkString("GET"),
				resp.NewBulkString("foo"),
			}),
		),
	)
	if err != nil {
		 t.Error(err)
	}

	if !slices.Equals(ret.Marshal(), []byte("$3\r\nbar\r\n")) {
		 t.Error("expect '%s', got '%s', []byte("$3\r\nbar\r\n"), ret.Marshal())
	}
}
```

接著可以查看 `d8/testing` 分支的 `internal/service/cmd/get_test.go` 與 `internal/service/set_test.go`。
