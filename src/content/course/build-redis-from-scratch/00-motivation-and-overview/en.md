---
title: "[Day 0] Motivation and Overview"
codebase: '../codebase'
pubDate: 2026-10-18T18:54:32+08:00
---

Hello world, this is jr-dragon, a Go developer.

I read [Build Your Own X](https://github.com/codecrafters-io/build-your-own-x) recently, and I think it is a good chance to start a side project for my loooooong weekend. (Because I was fired on Oct. last year, and I'm looking for job a job in these days, but unfortunately..., you know.)

I tried [Build Redis from Scratch](https://www.build-redis-from-scratch.dev/), which is a good entrypoint for me: I built a lot of APIs with SQL(MySQL and PostgreSQL) and NoSQL(Redis, MongoDB, Elasticsearch, ...) on HTTP server, but I've not written any TCP server yet.

> If I cannot talk about what I made, I've not understood it; 
> If I cannot make something by self, I shouldn't use it directly.

I think this journey will be interesting, and I hope you can get what you want in this.

## Overview

Redis is a key-value storage supports "Redis serialization protocol" (RESP) service, written in C. 

You can image scenarios below:
```
jr-dragon: Put "Sun. => Sunday"
redis: OK! I put "Sun." as a key, and "Sunday" as a value.

jr-dragon: I forgot what "Sun." means, can you tell me?
redis: Of course! I found "Sun." in my storage as key, and "Sunday" is the value.

jr-dragon: I want to know "Oct." means, can you tell me?
redis: Unfortunately, I cannot find any key "Oct." in my storage.

jr-dragon: Oh, "Oct." is means "October", remember this.
redis: Thanks, I'll remember it.
```

Redis is awesome. It provides a high performance and open source option for key-value storage service.

## Q & A

### Will this project replace Redis?

No, never. I make this repository for hobby, learning ~~(and practing my poor English)~~.

I don't think I can implement a production reday key-value service. Use Redis, [Valkey](https://valkey.io/) or [Garnet](https://microsoft.github.io/garnet/docs) for production ready.

Honestly, I've implemented some Redis commands, and it tooks a lot of time already.

### Will this project use AI?

I use AI to read, analyze specfications (especially RESP spec, RDB format, ... etc) generate some testing code or get some inspiration, but I don't think it is a good idea to generate whole features because this is a side project for learning. 

I blog in issues for practing English, that's why I try to avoid using AI to generate article directly. 

### How's the performance?

I'll not focus on performance tuning too early (except for taking examples). I want to keep the code readability, clean architecture and well organization by first.
