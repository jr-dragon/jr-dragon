---
slug: macos-lima
title: "macOS Lima 指南"
description: "記錄在 macOS 上安裝與設定 Lima Linux 虛擬機的流程，透過 containerd 與 nerdctl 操作容器及 Compose 服務，並整理資源配置、可寫目錄掛載與連接埠限制。"
pubDate: 2021-09-23T23:11:39+08:00
heroImage: '../../assets/macos-lima.svg'
heroImageFrom: 'https://github.com/lima-vm/lima/blob/master/website/static/images/logo-dark.svg'
tags: [vm,docker]
---

[Lima: Linux virtual machines (on macOS)](https://github.com/lima-vm/lima)，是一款專門在 macOS 上模擬 Linux 的軟體，基於 QEMU 並為 x86_64 及 ARM 都提供了良好的使用體驗。


## 用法

### 安裝

Lima 的安裝可以直接透過 [Homebrew](https://brew.sh)

```bash
$ brew install lima
```

並且利用 `limactl` 進行安裝

```bash
$ limactl start
? Creating an instance "default"  [Use arrows to move, type to filter]
> Proceed with the default configuration
  Open an editor to override the configuration
  Exit
```

> 第一次使用的話可以選擇 `Proceed with the default configuration`，它預設會啟動一個 Ubuntu 21.04 的虛擬機，並且分配 4 個 CPU 與 4 GB 記憶體

> 個人會使用 Ubuntu 21.10 的 image 並搭配 6 顆 CPU 與 16 GB 記憶體，並且將專案資料夾掛載為可寫（這樣在虛擬機中執行 `npm install` 或 `composer install` 才能寫入）

### 使用

在 Lima 所使用的 image 中，大部份都已經有 containerd，再加上自動安裝的 nerdctl 就可以產生與 Docker CLI 類似的使用體驗

```
$ lima nerdctl images
REPOSITORY    TAG    IMAGE ID    CREATED    SIZE
$ lima nerdctl pull hello-world
docker.io/library/hello-world:latest:                                             resolved       |++++++++++++++++++++++++++++++++++++++|
index-sha256:61bd3cb6014296e214ff4c6407a5a7e7092dfa8eefdbbec539e133e97f63e09f:    done           |++++++++++++++++++++++++++++++++++++++|
manifest-sha256:1b26826f602946860c279fce658f31050cff2c596583af237d971f4629b57792: done           |++++++++++++++++++++++++++++++++++++++|
config-sha256:d1165f2212346b2bab48cb01c1e39ee8ad1be46b87873d9ca7a4e434980a7726:   done           |++++++++++++++++++++++++++++++++++++++|
layer-sha256:b8dfde127a2919ff59ad3fd4a0776de178a555a76fff77a506e128aea3ed41e3:    done           |++++++++++++++++++++++++++++++++++++++|
elapsed: 5.2 s                                                                    total:  6.9 Ki (1.3 KiB/s)
$ lima nerdctl run --rm -it hello-world
```

另一方面，`nerdctl` 也整合了類似於 `docker-compose` 的功能：

```yaml
services:
  web:
    image: 'nginx:alpine'
    ports:
    - 8080:80

```

```
$ lima nerdctl compose up
$ curl localhost:8080
```

> 註：Host Port 應該大於 1024，這是因為 lima 無法以 root 身份執行，對於低於 1024 的 Port 會有所限制

### 額外設定

使用 `lima` 可以直接以 bash 開啟該虛擬機

```
$ lima
(lima) > sudo apt update && sudo apt upgrade # 這裡就是 Ubuntu 的指令
```

另外，可以選擇使用 Hinet 的 Mirror 加速更新

```
# /etc/apt/sources.list.d/hinet.list

deb http://mirror01.idc.hinet.net/ubuntu/ impish main 
deb-src http://mirror01.idc.hinet.net/ubuntu/ impish main 
```

## 結論

Docker 的出現對於雲端服務的革命功不可沒，同時仰賴著對眾多平台的支援能力，也讓 Docker Desktop 穩坐江山。曾經有許多軟體想與其一戰，而它們有些已化為朽骨（對，我就是說那個 [rkt](https://github.com/rkt/rkt)）。

即便 Docker Desktop [宣佈不再免費提供給大型企業](https://www.docker.com/blog/updating-product-subscriptions/)，可以想見這樣的習慣仍不會太快產生變化。

就目前來看，Lima 是個極具潛力的軟體，即便對於非預設值的支援還不夠完善（例如選擇其它 Linux 發行版時常常會遇到問題），且在 M1 Mac 上也存在許多待解決的問題，不過這並不影響它有望成為 macOS Subsystem Linux 的野心。
