---
slug: ftp-ftps-and-sftp
title: "FTP, FTPS 與 SFTP"
description: "FTP, FTPS 與 SFTP"
pubDate: 2021-08-28T11:46:22+08:00
heroImage: '../../assets/ftp-ftps-and-sftp.webp'
heroImageFrom: 'https://www.pexels.com/zh-tw/photo/5882581/'
tags: [php]
---

## 概述

### FTP

FTP 是一個歷史悠久的通訊協定，RFC 就多次提出標準及各項補充：

- [RFC 114](https://datatracker.ietf.org/doc/html/rfc114)：初始標準
- [RFC 765](https://datatracker.ietf.org/doc/html/rfc765)：使其執行於 TCP/IP 上
- [RFC 959](https://datatracker.ietf.org/doc/html/rfc959)：目前大多數的 FTP 實作規範
- [RFC 1579](https://datatracker.ietf.org/doc/html/rfc1579)：補充 FTP 被動模式，使其能夠穿越 NAT
- [RFC 2228](https://datatracker.ietf.org/doc/html/rfc2228)：安全擴充
- [RFC 2428](https://datatracker.ietf.org/doc/html/rfc2428)：對 IPv6 的支援與擴充被動模式

### FTPS

因為 FTP 在規範中是明碼傳輸，這也導致其安全性與隱私性備受質疑。

在 [RFC 4217](https://datatracker.ietf.org/doc/html/rfc4217) 中定義了 FTP over TLS 的實作，使 FTP 傳輸的過程中能夠以 TLS 加密。

> 註：在 [RFC 的草案](https://tools.ietf.org/id/draft-murray-auth-ftp-ssl-00.txt)中曾經嘗試定義 FTP over SSL，但因為 SSL 之後被 TLS 所取代，所以這項草案一直沒有通過，但大部份的 FTP Server 都支援兩者的實作

> 小知識：在 PHP 4.3 就定義了 `ftp_ssl_connect()` 這個內建函式，在 PHP 7 之後它依賴於 FTP 與 OpenSSL extension 的實作，所以無論是 SSL 或 TLS 都能夠使用。

### SFTP

FTPS 時常會被與 SFTP 混淆，SFTP 是基於 SSH2 協定的補充。儘管目的仍是檔案交換，而且有著高度相似的指令與操作方式，但實際上底層是有相當的差異。

> 小知識：在 PHP 中，需要安裝 ssh2 extension 才能夠使用 `ssh2_sftp()` 建立 SFTP 的連接。

## 常見問題

### 主動與被動模式

在 FTP 與 FTPS 中有提供可選的主動模式（Active Mode）與被動模式（Passive Mode），其目的是為了實現 NAT 穿透或避免防火牆的阻擋。

在主動模式下，連線流程應該如下所示：

1. Client 端向 Server 發起連線（命令連線）
2. Server 端向 Client 端回應已收到連線
3. Server 端主動向 Client 端發起另一條連線（資料連線）
4. Client 端向 Server 端回應已收到連線

在被動模式下，連線流程被更改為：

1. Client 端向 Server 發起連線（命令連線）
2. Server 端向 Client 端回應已收到連線，並開啟一個 Port 等待資料連線
3. Client 端向 Server 發起資料連線
4. Server 端向 Client 端回應已收到連線

由於 Client 端很常是隱藏在 NAT 之後（例如路由器），導致主動模式的第三步是難以實現的，所以在被動模式下由 Server 端開啟一個 Port 讓 Client 端連線。

值得注意的是，SFTP 因為本身由 SSH Tunnel 實現 NAT 穿透，並沒有被動模式。

### 如何用 PHP 連線 FTP, FTPS 與 SFTP

#### FTP/FTPS

FTP 的連線需要 ftp extension；FTPS 的連線需要 ftp 與 openssl extensions。

```php
<?php

$url = 'ftp://username:password@ftp.example.com:21/file.txt';

$parsed = parse_url($url);
/*
 [
     "scheme" => "ftp",
     "host" => "ftp.example.com",
     "port" => 21,
     "user" => "username",
     "pass" => "password",
     "path" => "/file.txt",
 ]
 */

if ($parsed['scheme'] !== 'ftp' || $parsed['scheme'] !== 'ftps') {
    die("'{$parsed['scheme']}' isn't ftp or ftps protocol.")
}

$connection = $parsed['scheme'] === 'ftp'
    ? ftp_connect($parsed['host'])
    : ftp_ssl_connect($parsed['host']);
if (! $connection) {
    die("'$url' connect failed");
}

if (! ftp_login($connection, $parsed['username'], $parsed['password'])) {
    die("'$url' auth failed by '{$parsed['username']}' and '${$parsed['password']}'");
}

// 如果要求 Passive Mode 需要額外啟動
if (！ ftp_pasv($connection, true)) {
    die("'$url' cannot enable passive mode");
}

ftp_get($connection, '/tmp/file.txt', $parsed['path']);
// ftp_fget($connection, $tmp = tmpfile(), $parsed['path']);
```

> 註：`ftp_login` 如果失敗，會丟出 PHP warning，務必記得關閉 PHP warning 的顯示。

#### SFTP

##### SSH2 extension

SFTP 的連線需要 SSH2 extension，通常會需要自行以 `pecl install ssh2` 安裝。

> 註：如果直接使用 `pecl install ssh2` 會無法於 PHP 7 以上的版本安裝，這是因為從 2016 年的 0.13 版之後就再也沒有發佈過 stable 版本的 ssh2 extension，需要[指定版本](http://pecl.php.net/package/ssh2)才能夠為 PHP 7/8 安裝 ssh2 extension。

```php
<?php

$url = 'sftp://username:password@sftp.example.com:22/file.txt';

stream_get_contents(
    fopen("ssh2.$url", 'r')
);
```

##### phpseclib

因為 SSH2 的安裝上比較複雜，可以用 [phpseclib](https://phpseclib.com/) 作為純 PHP 的替代方案，可以在 [這裡](https://phpseclib.com/docs/sftp) 找到相關文件

```php
<?php

use phpseclib3\Net\SFTP;

$sftp = new SFTP('sftp.example.com');
$sftp->login('username', 'password');

$sftp->get('file.txt', '/tmp/local_file.txt');
```

## 結論

FTP 作為承載半世紀的通訊協定，為網際網路的發展寫下不可抹滅的功蹟。

儘管大多數的網頁瀏覽器（Chrome, Edge, Firefox）都已經停止原生支援 FTP 協定，且大部份 FTP 站點也都提供 HTTP 的瀏覽介面。然而仍有許多大型軟體（如 Firefox、Linux 發行版鏡像）提供 FTP 站點，也有不少虛擬主機商為了簡化操作而提供 FTP 上傳/下載功能。

FTP 未死，但勢必也會逐步退出舞台。