---
slug: url-parser-using-libcurl-with-php-ffi
title: "以 PHP FFI 使用 libcurl 構建 URL Parser"
description: "以 PHP FFI 使用 libcurl 構建 URL Parser"
pubDate: 2022-06-17T23:28:18+08:00
heroImage: '../../assets/url-parser-using-libcurl-with-php-ffi.webp'
heroImageFrom: 'https://pixabay.com/zh/photos/waves-sea-ocean-beach-blue-water-3473335/'
tags: [php]
---

眾所周知，在 PHP 中 `parse_url()` 這個函式遲遲未支援 UTF-8，這導致一些英文、數字以外的 Host, Path, Query 及 Fragment 都會解析錯誤。

```
(psysh) >> parse_url('https://中文.台灣/你好嗎?我=很好&大家都很好#你呢？')
=> [
     "scheme" => "https",
     "host" => b"ä¸­æ__.å_°ç_£",
     "path" => b"/ä½ å¥½å__",
     "query" => b"æ__=å¾_å¥½&å¤§å®¶é_½å¾_å¥½",
     "fragment" => b"ä½ å_¢ï¼_",
   ]
```

這個問題直到 PHP 8.1 仍未見改善，這也是促使我寫下本文的動機。

<!--truncate-->

## PHP FFI

FFI 是 PHP 7.4 加入的新功能，作為一個 extension 的形式被加入 PHP 核心中。

它允許讓 PHP 直接使用現成的動態函式庫（Windows 上的 `.dll`、macOS 上的 `.dylib` 及 Unix-like 上的 `.so`），而不需要費心撰寫 PHP extension。

據[官方文件](https://www.php.net/manual/en/intro.ffi.php)所述：

- FFI 是危險的：它能夠以相對低階的方式執行邏輯，這也導致它可能會危害作業系統或造成不可預期的 Memory, IO Leak。
- FFI 是低效率的：FFI 在存取資料結構時，可能花費比原本 PHP 存取陣列或物件 2 倍甚至以上的時間；只不過在某些情況下它可能會消耗較少的記憶體空間。

只不過，不可諱言地，FFI 提供了 PHP 與其它程式語言的另一種交互方式，而在很多現代的程式語言中都具備這樣的特性。

## 如何讓 libcurl 解析 URL

用 libcurl 解析 URL 主要會需要三個 API（不考慮 `free` 及 `cleanup`）：

- `CURLU *curl_url()`: [https://curl.se/libcurl/c/curl_url.html](https://curl.se/libcurl/c/curl_url.html)
- `CURLUcode curl_url_set(CURLU *url, CURLUPart part, const char *content, unsigned int flags)`: [https://curl.se/libcurl/c/curl_url_set.html](https://curl.se/libcurl/c/curl_url_set.html)
- `CURLUcode curl_url_get(CURLU *url, CURLUPart what, char **part, unsigned int flags)`: [https://curl.se/libcurl/c/curl_url_get.html](https://curl.se/libcurl/c/curl_url_get.html)

libcurl 官方文件上的範例程式如下：

```c
CURLU *url = curl_url();
CURLUcode rc = curl_url_set(url, CURLUPART_URL, "https://example.com", 0);
if (!rc) {
    char *scheme;
    rc = curl_url_get(url, CURLUPART_SCHEME, &scheme, 0);
    if(!rc) {
      printf("the scheme is %s\n", scheme);
      curl_free(scheme);
    }
    curl_url_cleanup(url);
}
```

## 如何用 PHP FFI 呼叫 libcurl

大多數介紹 PHP FFI 的文章中，都只用個 `printf` 點到為止，就連官方文件也只稍微說明了一下一些簡單的 C struct 該如何使用。

### 定義

實際上，如果要使用動態函式庫中定義的 struct 或 function，都要顯式地定義才能使用：

```php
$ffi = FFI::cdef('
typedef struct Curl_URL {
  char *scheme;
  char *user;
  char *password;
  char *options; /* IMAP only? */
  char *host;
  char *zoneid; /* for numerical IPv6 addresses */
  char *port;
  char *path;
  char *query;
  char *fragment;

  char *scratch; /* temporary scratch area */
  char *temppath; /* temporary path pointer */
  long portnum; /* the numerical version */
} CURLU;

CURLU *curl_url();
', 'libcurl.so');

$curl = $ffi->curl_url();
```

因為 `CURLU *curl_url()` 的回傳值是 `CURLU`，所以要直接把 libcurl 中對於 `CURLU` 的 struct 定義直接複製過來，另一方面也需要把 `CURLU *curl_url()` 的函式定義寫出才能正常使用。

如果要看完整的定義，可以翻閱 [chivincent/php-url/src/curl_def.c](https://github.com/chivincent/php-url/blob/main/src/curl_def.c)

### 使用

如果將上面的 libcurl 範例程式以 FFI 包裝，應該會類似於下面的程式：

```php
$ffi = FFI::cdef('...', 'libcurl.so');

$curl = $ffi->curl_url(); 
$rc = $ffi->curl_url_set($curl, $ffi->CURLUPART_URL, 'https://example.com', 0);
if (!$rc) {
    $buf = FFI::new('char *');
    $rc = $ffi->curl_url_get($curl, $ffi->CURLUPART_SCHEME, FFI::addr($buf), 0);
    if (!$rc) {
        echo FFI::string($buf);
        $ffi->curl_free($buf);
    }
    $ffi->curl_url_cleanup($curl);
}
```

PHP 的 FFI 封裝了諸如 `FFI::addr` 或 `FFI::string` 的 static method，這可以讓我們很輕易地使用這些 C 語言的概念。

值得一提的是，如果某些常數是用 `#define` 的方式被定義出來，那是無法使用 `$ffi` 去取得這些常數的，因為它們在編譯時期就會被代換。

```php
$ffi = FFI::cdef('
#define CURLU_DEFAULT_PORT (1 << 0)
', 'libcurl.so');

echo $ffi->CURLU_DEFAULT_PORT; // Error!
```

## 實作

至此，我們可以很清晰地瞭解如何使用 PHP FFI 搭配 libcurl。

如果需要完整的程式碼實作，也可以參閱 [https://github.com/chivincent/php-url](https://github.com/chivincent/php-url)

## 結論

對於 URL 的解析，其實我曾經找過許多不同語言、不同做法的方案。

### 他山之石

####  純 PHP 的解法

在 PHP 的 `parse_url` 文件下，其實有一篇 Contributed Notes 提到如何實作可支援 UTF-8 版本的 `mb_parse_url`，改寫如下：

```php
function mb_parse_url(string $url)
{
    $enc_url = preg_replace_callback(
        '%[^:/@?&=#]+%usD',
        fn ($matches) => urlencode($matches[0]),
        $url,
    );
       
    $parts = parse_url($enc_url);
       
    if($parts === false) {
        throw new \InvalidArgumentException('Malformed URL: ' . $url);
    }
       
    foreach($parts as $name => $value) {
        $parts[$name] = urldecode($value);
    }
       
    return $parts;
}
```

使用 Regular Expression 的解法，事實上這也足以應付大多數情境下的應用。

#### Python 的解法

Python 使用 `urllib.parse` 做到 URL 解析，其問題在於：`netloc`（Host）是會附帶 Port 資料，這點必須自行處理。

#### Golang 的解法

Golang 在 [Go by Example 中就提供了 URL 解析的範例](https://gobyexample.com/url-parsing)，事實上這已經是相當完整的解決方案，而且可以應付絕大多數的使用情境。

#### Rust 的解法

在 Rust 中，其實作詳細程度又比 Golang 再更上一層樓，在 [url](https://docs.rs/url/latest/url/) 這個 crate 中它甚至會將 Host 額外分成一個 `Enum`，並且其中可以是 `Domain`, `IPv4` 及 `IPv6`。

事實上，Rust 幾乎已經是我找到最完美的解，但因為 FFI 的適用性問題，如果要將這個 `Url` 實作完全導出是相對困難的，因為它的結構複雜許多，這也是之後我選擇採用 `libcurl` 的主因。 

### 緣起

事實上，會撰寫本文的靈感是來自於 Dcard 的 Intern 實作題：寫一個短網址服務。

根據實作結果，我通常會將受試者分為三個等級：

- Junior 或比較有經驗的 Junior：直接把字串與對應存進資料庫（不限於 RDBMS，Redis 也是一種）；有些人會加入過期機制，或是太久沒用就會移除的機制
- Middle：想辦法降低字串的儲存量，並且運用合理的資料結構去加速存取
    - 通常 Scheme 都是 `HTTP` 或 `HTTPS`，如果只用 1 bit 去存，就比 4/5 bytes 來得有空間優勢
    - 一些常見的 Host 可以建立一個 HashTable，凡是遇到這些 Host 都有一個對應的值（用 1 byte 就可以存入 255 個網站，比直接存字串划算多了）
    - IPv4 或 IPv6 的 Host 可以直接轉成一個 u32 或 u64，一樣比存字串划算
- 比較有經驗的 Middle：在實際存取資料儲存空間之前，就知道這個短網址是否合法（存不存在）
    - 在短網址上加入 checksum，不符合 checksum 規則的甚至可以在 Reverse Proxy 上就擋下來（甚至是做錯誤修正）
    - 在存取資料儲存空間前，先用 Bloom Filter 確認該資料是否可能存在

至於 Senior 或以上的，就不應該考這種題目，因為沒有鑑別度。