---
title: "[Day 1] Project initialization"
codebase: '../codebase'
pubDate: 2026-10-18T18:54:32+08:00
---

## Setup Go module

"Go module" is a dependency management for Go, it is a built-in feature after Go 1.13.

There's a good tutorial from Go team: [Tutorial: Create a Go module](https://go.dev/doc/tutorial/create-module).

I initialized a go module by `go mod init olivine` in root of project, and it generated `go.mod` automatically. 

> Note: There's a lot of project using `github.com/{username}/{repo_name}` as go module name, it works well for most of projects and make others access GitHub repository directly and easy. 

## The `main` function

The `main` function is a special function which means "entrypoint of a program", I created `cmd/olivine/main.go`.

```go {./cmd/olivine/main.go#L1-L7}(35f2394e44d6e315df64d9b1732747e9dafb99c4)
```

We can run this code directly by `go run ./cmd/olivine`, you can see it shows "Hello World" on stdout.

```shell
$ go run ./cmd/olivine
Hello World
```

> Hint: You can put `main` funcion in any folder under go module with `package main` even in project root. But I like to put binary source code under `cmd/{binary_name}`, it helps me manage projects by folder structures. 

## The `Makefile`

The `make` is a build tool for software development, it can use `Makefile` as a set of commands to help developers configure, compile, ... and more!

All you need is create a `Makefile` in project root:

```makefile {./Makefile#L1-L11}(e7e5ffe3069916717e587dee2cbb4ea4fd6409c4)
```

We defined two commands: `build` and `clean`.
- `build`: Create folder for binaries if not exists, and compiles go binary to executable.
- `clean`: Cleanup binaries folder.

Now, use `make build` and it shows magic for you.
```shell
$ make build
$ ./bin/olivine # run the olivine binary
Hello World
```

> Note: Don't forget to add `bin/` into `.gitignore`

## A TCP Server

It's time to build a TCP server!

There's a good exaple from [Go by Example: TCP Server](https://gobyexample.com/tcp-server). 

```go {./cmd/olivine/main.go#L1-L43}(0d3ea3b7058ae13a989b4df217cbfa8d470d9e44)
```

Let's test this TCP server with `nc`:
```shell
$ echo "hello" | nc 127.0.0.1 16879
> ACK: HELLO
$ echo "hello from netcat" | nc 127.0.0.1 16879
> ACK: HELLO FROM NETCAT
```

Congratulations! This is your new TCP Server written in Go.
