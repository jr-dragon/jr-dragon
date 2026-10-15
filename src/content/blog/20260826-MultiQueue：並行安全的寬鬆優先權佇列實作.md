---
title: "MultiQueue：並行安全的寬鬆優先權佇列實現"
pubDate: 2026-08-26T02:04:43+08:00
slug: multiqueue-concurrency-safe-relaxed-priority-queue
authors: [chivincent]
tags: [go,concurrent-data-structure,priority-queue]
description: "介紹 MultiQueue 寬鬆優先權佇列的原理與 Go 實作，並探討鎖競爭、False Sharing 及非空位圖的最佳化。"
heroImage: "../../assets/multiqueue-concurrency-safe-relaxed-priority-queue.webp"
heroImageFrom: "https://www.pexels.com/photo/serene-mountain-landscape-with-reflective-lake-35634614/"
---

前陣子，我耗費不少心力在撰寫 [jr-dragon/olivine](https://github.com/jr-dragon/olivine)，這是一個為教學目的設計的純 Go 語言實現的 Redis 相容服務。

在研究的過程中，我不禁開始思考關於 [Priority Queue](https://zh.wikipedia.org/zh-tw/%E5%84%AA%E5%85%88%E4%BD%87%E5%88%97) 這個資料結構，在大學課程的訓練中，我們往往被教導著：Priority Queue 就是 [Binary Heap](https://zh.wikipedia.org/zh-tw/%E4%BA%8C%E5%8F%89%E5%A0%86) 的一種應用，然而實際上這這種說並不完全正確。

Priority Queue 作為一種抽象資料結構，其實並沒有規定底層必須怎麼實現：只要能夠符合特性定義，單純的陣列都可以稱其為 Pirority Queue：

```go
type pq []int

func (q pq) Push(n int) {
	q = append(q, n)
}

func (q pq) Pop() (int, bool) {
	if len(q) == 0 {
		return 0, false
	}

	max := q[0]
	for _, n := range q {
		if max < n {
			max = n
		}
	}

	return max, true
}
```

以上是一個由陣列（Go Slice）所構成、符合定義的 Priority Queue，但顯而易見地其複雜度不盡如人意。


## 理論篇

### Priority Queue 的常見實現

Priority Queue 往往會使用 Heap 實作，最常見的是 Binary Heap（甚至連 Leetcode 上的標籤都直接打 `Heap (Priority Queue)`），而 Binary Heap 通常由 Array 構建。使用陣列其實是很大的優勢：它很簡單易懂，並且因為記憶體組成是連續的，在現代的 CPU/RAM 架構下有很高的效能。

然而這也正是其缺陷所在：對於一個連續的記憶體如果要安全地並行操作，往往必須依賴 mutex lock 之類的機制，以避免存取時有其它的執行緒對其進行操作。越多執行緒紛紛爭搶這些鎖，有時不旦無法起到提升性能的效果，反而會造成效率下降。

因此，多年來一直有人在研發在並行下能夠安全使用的 Priority Queue 實作，例如將底層的 Binary Heap 替換為 Skiplist 為基礎的：

- [Fast and lock-free concurrent priority queues for multi-thread systems](https://www.sciencedirect.com/science/article/abs/pii/S0743731504002333)
- [Skiplist-Based Concurrent Priority Queues](https://www.academia.edu/download/48748848/ipdps.pdf)

Skiplist 其實在並行的系統中是一個相當優秀的選擇，它能夠很好地降低鎖的競爭，並且在存取上有著近似於 Binary Tree 的；唯一的缺陷大概就是傳統實作的情況下記憶體往往不連續。

> 註：其實直到近年仍有論文在對 Skiplist 進行最佳化，相關的思路其實非常有趣，或許未來可以單開一篇文來說明。

### MultiQueue：對正確性的取捨

而今天的主角 MultiQueue 則是往另一個方向思考：是否能夠允許一些不正確的可能性，來換取更高的並行吞吐量？

假設今天存在 4 個 priority queues，在新增資料時會隨機選一個放進去，在讀取資料時則是隨機選一個拉出來，我們至少可以保證每次讀取的值一定是整個系統中最小的 4 個其中之一。

換句話說，要是每個 thread 都維護一個屬於自己的 priority queue 的話，就可以在理論上顯著提高系統的並行吞吐能力。

## 實作篇

關於如何使用 Heap 來實作 Priority Queue 的部份就略過不提，畢竟在 Go 的標準庫 [container/heap](https://pkg.go.dev/container/heap#example-package-PriorityQueue) 中的範例就直接有官方實作。

### mutex lock + priority queue

我往往們無法決定哪個請求會交給哪一個 thread/goroutine 來處理，所以實務上還是需要鎖來避免資源爭用。

```go
type pq struct {
	mu   sync.Mutex
	heap *heap
}
```

我們構建一個 `pq`（priority queue 的縮寫），並且用 `sync.Mutex` 加以保護，避免一次性被兩個 goroutine 存取。

> 註：詳細的 `heap` 實作可以參考 https://github.com/jr-dragon/multiqueue/blob/main/heap.go

### MultiQueue 的封裝

在建構一個對外的結構時，務必要優先考慮 API 應該如何呈現：這將會極大地影響使用體驗。

```go
type MultiQueue struct {
	queues []pq
}

func New(sz int) *MultiQueue { return &MultiQueue{} }
func (q *MultiQueue) Push(v int) {}
func (q *MultiQueue) Pop() (v int, ok bool) {}
```

對我而言，一個 Priority Queue 可以只有三個部份：

- 建立 MultiQueue 的手段（`func New(sz int) *MultiQueue`）
- 新增資料的手段（`Push(v int)`）
- 取得資料的手段（`Pop() (v int, ok bool)`）

根據定義，我們可以很容易地實作出整個 MultiQueue 的基礎功能：

```go
func New(sz int) *MultiQueue {
	q := MultiQueue{}
	q.queues := make([]*pq, sz)

	for i := range sz {
		q.queues[i] = newHeap()
	}

	return &q
}

func (q *MultiQueue) Push(v int) {
	n := rand.IntN(len(sz))

	q.queues[n].mu.Lock()
	defer d.queues[n].mu.Unlock()

	q.queues[n].Push(v)
}

func (q *MultiQueue) Pop() (v int, ok bool) {
	n := rand.IntN(len(sz))

	q.queues[n].mu.Lock()
	defer d.queues[n].mu.Unlock()

	return q.queues[n].Pop()
}
```

至此，我們已經大致上完成整個 MultiQueue 的基礎功能，其實這個資料結構的核心邏輯非常簡單：讓多個執行緒去爭搶多個 queue 的鎖，降低碰到 lock 的機率。

## 改善篇

如果真的按照以上的做法來實作 MultiQueue，報 paper 時大概會直接被釘在牆上不用下來了。

### 選擇不平衡

在最初始的 MultiQueue 設計中，其實已經有考慮到「選擇不平衡」問題：假設有一個 queue 一直沒有被隨機數選上，但是它又剛好包含了許多整個佇列中的最小值，導致輸出的結果正確性偏低。

因此，比較好的解法是：當 `Pop()` 時，隨機選取兩個 priority queues，使用那個比較小的值作為結果。這麼做的好處是在選擇時會更傾向於盡快選到包含較小值的 priority queue，讓機率來做動態平衡。

以下是我的做法（我刪除了一些會影響判斷的冗餘程式碼，只留下最核心的邏輯）：

```go
func (q *MultiQueue) Pop() (v int, ok bool) {
	firstQueue, secondQueue := q.randomQueuePair() // 試圖取得兩個非空佇列
	return popSmaller(firstQueue, secondQueue)
}

func popSmaller(fq, sq *heap) {
	firstValue, firstOK := first.peek()
	secondValue, secondOK := second.peek()

	switch {
	case firstOK && (!secondOK || firstValue < secondValue):
		value, ok := first.pop()

		return value, first, ok
	case secondOK:
		value, ok := second.pop()

		return value, second, ok
	default:
		var zero T

		return zero, nil, false
	}
}
```

或許你有發現到，在 `popSmaller()` 的實作中，可能在 `heap.peek()` 之後該資料被另外的執行緒 `heap.pop()`，而在後續的 `heap.pop()` 中值就不是正確的值。

然而這個風險正是可以承擔的（還是屬於 Relaxed Priority Queue 的「機率上選擇到的最小值」），因此在這邊不多做特殊處理。

### 鎖爭搶與空佇列

如果在 `New(sz int)` 中選擇的 `sz` 過小，在並行時仍會有較大的機率在爭搶 mutex lock，最極端的情況是當 `sz = 1` 時會直接回退到在演算法上等價於 mutex + heap 的實作。

又因為在上一階段在 `Pop()` 時隨機挑選兩個 Queues 來相互比較，如果將 `sz` 設得過大就會造成會遇到很多空佇列（雖然對於 Relaxed Priority Queue 而言，這樣的誤差是可接受的），但我們會期望盡量去尋找有資料的佇列來做比較。

對於鎖爭搶的問題，我一開始的解決思路是用 `mutex.TryLock()`，如果失敗的話就換其它的 queue 再重試一遍，後來我發現所有 goroutine 絕大多數時間都會浪費在 try lock 上。

> 註：Go 官方在很晚在才加 `mutex.TryLock()`，因為 Go 的開發團隊不認同這是一個好的並行程式設計模式，如果在程式設計中使用到 TryLock 往往代表你的程式需要重新思考鎖的使用方式。

```go
func (q *MultiQueue) Push(v int) {
	var failedAttempts int
	for {
		queueIndex := rand.IntN(len(q.queues))
		q := &q.queues[queueIndex]
		if !q.mu.TryLock() {
			failedAttempts = backoffAfterLockFailure(failedAttempts)
			continue
		}

		q.heap.push(v)
		q.mu.Unlock()
		return
	}
}

func backoffAfterLockFailure(failedAttempts int) int {
	failedAttempts++
	if failedAttempts < lockAttemptsPerYield {
		return failedAttempts
	}

	runtime.Gosched()

	return 0
}
```

## 最佳化篇

### False Sharing

在以上一段花里胡哨的設計之後，`sz = 16` 的性能差不多跟 `sz = 1` 相等，甚至還稍微慢了一些些……WTF？

是的，我踩中了一個並行程式設計中很經典的陷阱：false sharing

先來回顧一下 `pq` 這個結構：

```go
type pq struct {
	mu   sync.Mutex
	heap *heap
}
```

是的，它簡潔、優雅，而且沒有放任何不必要的東西，然而這正是其問題所在。

CPU 從 L1/L2/L3 Cache 讀取資料時，是以 Cacheline 為單位進行讀取，而 CPU 不同核心之間如果讀取了相同的 Cacheline，而其中一個核心對該資料進行寫入，另一個核心就必須重新從快取拿資料造成延遲，更糟的是，在越多核心的處理器上問題越大。

因此，我們需要適當地加上 padding，雖然這會大幅增加 `pq` 的結構大小，但卻能顯著提升效能。

```go
type pq struct {
	mu   sync.Mutex
	heap *heap
	_    cpu.CacheLinePad
}
```

> 註：這邊我使用了 `golang.org/x/sys/cpu` 這個函式庫，這是因為在不同的 CPU 架構上的 CacheLine 往往會有所不同，例如 x86_64 上通常是 64bytes、ARM 上卻是 128bytes

### 非空位圖

誠如前面所提到的，在 `MultiQueue.Pop()` 時，會盡量偏好選擇非空的 Queue，因此我使用了一個特殊的 bitmap 小技巧來追蹤哪些 queue 是非空的。

其實原理也很簡單：一個 `uint64` 可以存放 64 筆記錄，只要指定的 bit 為 1 表示該 heap 為非空，反之則為空。利用 CPU 提供的各種指令與位運算（這方面 AI 幫了我挺多），就可以快速追蹤非空位圖。

## 結語

其實 MiltiQueue 的原始論文中還有滿多可以最佳化的（例如 Input Buffer 及 Output Buffer 之類的技巧），或是有另一篇用 k-LSM 的思路來為 Relaxed Priority Queue 達成 lock-free 的目標也很有趣。

以上的內容實作在 [jr-dragon/multiqueue](https://github.com/jr-dragon/multiqueue)，其中融合了一些我對現代計算機架構的理解與實作方案，受限於篇幅未能在本篇展開細說。

## 參考資料

- [The MultiQueue: A Simple and Fast Relaxed Concurrent Priority Queue](https://dl.acm.org/doi/pdf/10.1145/3771738)
- [A Simple yet Exact Analysis of the MultiQueue](https://arxiv.org/pdf/2410.08714)
- [The Lock-free k-LSM Relaxed Priority Queue](https://arxiv.org/pdf/1503.05698)
