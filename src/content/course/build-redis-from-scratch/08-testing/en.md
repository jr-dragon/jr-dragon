---
title: "[Day 8] Testing"
codebase: '../codebase'
pubDate: 2026-10-18T18:54:32+08:00
---

Testing is a native feature in Go. Create a file with `_test.go` name suffix, and using `go test`, that's all.

It provides a foundation of testing, developers wouldn't be blocked by "Which testing framework should I choose?" or "What is the best practice of creating a test cases?". 

## The First Testing: SimpleString

The `SimpleString` defines in `pkg/resp/value.go` can help us to make our first testing. Create a file `value_test.go` with `func TestSimpleString_Marshal():

```go {./pkg/resp/value_test.go#L8-L33}(29ef724be5776461828bb34b08eca5906a282a3f)
```

Functions with `Test*` prefix in `*_test.go` is identified as a testing. 

I usually make a testing with 2 parts:
- Testcases definition.
- Test runner
  - Arrange
  - Act
  - Assert

### Testcases definition and runner

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

When testing a function or reciever (functions in struct calls "reciever" in Go), we usually using 2 or more cases, 

Go provides a `t.Run()` to run a sub test in single test case, it helps a lot. 

> Note: it is no needed to use `t.Run()` when there's a single test case in testing, write a clear, readable and maintainable code is more important.

### Arrange, Act and Assert

AAA pattern is a famous unit testing practice, it mark a testing with 3 stages:
- Arrange: prepare the data, such as initialize a struct or open temp resources.
- Act: Execute the things which I want to test.
- Assert: Check the result is on expectation.

```go {./pkg/resp/value_test.go#L24-L33}(7aa836316b4c685ba39fe3c6417338f725407cdc)
```

As the code above:

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

## The benchmarking

Benchmark testing is another testing feature built-in Go.

I made `SimpleString.Marshal()` with 2 different methods:

```go {./pkg/resp/value.go#L35-L55}(7aa836316b4c685ba39fe3c6417338f725407cdc)
```

> Note: it's not a good practice to tune performance too early, this case is for learning benchmarking, I'll not extends this method to other RESP values in this repository.

To write benchmark testing, create function with `Benchmark*` prefix with `b *testing.B` argument.

```go {./pkg/resp/value_test.go#L35-L53}(7aa836316b4c685ba39fe3c6417338f725407cdc)
```

It's no need to call `b.StartTimer()` and `b.EndTimer()` if arrange doesn't costs a lot, it takes an example. 

### Run tests

Use `go test ./pkg/resp/value_test.go` can run test cases, but benchmarking is ignored. Use `go test -bench=. ./pkg/resp.value_test.go` to run benchmarkings.

Some developers uses `go test ./...` and `go test -bench=. ./...` in project root to run testing and benchmarking for whole project scope test cases.

I always write this into `Makefile` to simply the command with `make test`:

```makefile {./Makefile#L13-L14}(7aa836316b4c685ba39fe3c6417338f725407cdc)
```

## Redis Command Testing

Let's review the `Command{}` interface and implementations: if I want to add a new Redis command, I only need to implenent `Command{}` interface defines in `internal/service/cmd/cmd.go` and register in `NewCommands()` constructor. 

```go {./internal/service/cmd/cmd.go#L10-L22}(7aa836316b4c685ba39fe3c6417338f725407cdc)
```

That's how `GET` and `SET` commands do.

### The `Storage{}`interface

I noticed that `NewGet()` and `NewSet()` require `repo.Storage` as argument, how can I get it in testing?

Mocking.

Sometimes, I don't care about how storage works: it just input some data when `Set`; and output some data when `Get`. 

We can use `stub` while testing.

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

I defined `stubStorage{}` struct and with `Set()` and `Get()` recievers (struct function), it is a valid `repo.Storage{}` interface implementation, and I can pass it as argument with `NewGet()`.

### Mock generator

Sometimes, developers use mock package such as [stretchr/testify](https://github.com/stretchr/testify), but I don't like testify mock, it reminds me as a Java developer. I use [matryer/moq](https://github.com/matryer/moq) instead.

```shell
$ go get -tool github.com/matryer/moq
```

> Note: moq official readme use `go install github.com/matryer/moq@latest` for installing, but it installs as a global executable, use `go get -tool` by installing a package scope tool instead after Go 1.24.

Add go generate comment on `Storage{}` interface:

```go {./internal/repo/storage.go#L13-L17}(7aa836316b4c685ba39fe3c6417338f725407cdc)
```

Run `go generate ./...`, it generates a `storage_mock.go` by moq.

### Testing with mocked storage

It's easy to test with moq:
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

Now, you can review `internal/service/cmd/get_test.go` and `internal/service/set_test.go` in `d8/testing` branch.
