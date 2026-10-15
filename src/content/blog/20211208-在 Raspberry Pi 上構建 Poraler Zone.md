---
slug: portaler-zone-on-raspberry-pi
title: "在 Raspberry Pi 上構建 Portaler Zone"
description: "記錄在 Raspberry Pi 4 的 Manjaro ARM 環境自架 Portaler Zone，使用 containerd、nerdctl 與 BuildKit 建構容器，處理 ARM 相容性、前端編譯及 Nginx 整合。"
pubDate: 2021-12-08T19:39:10+08:00
heroImage: '../../assets/portaler-zone-on-raspberry-pi.webp'
heroImageFrom: 'https://pixabay.com/zh/photos/canada-ontario-albion-falls-sunny-1685768/'
tags: [game]
---

[Portaler Zone](https://github.com/Portaler-Zone/portaler-core) 是一款為 [Albion Online](https://albiononline.com/zh/home) 打造的社群工具，其目的是共享社群間的地圖資訊。

> 註：事實上我也不知道這到底是啥，這次單純是因為有個人委託我去幫他建構這個開源專案。因為前前後後遇到的坑有點多，所以這邊做個筆記。說明上主要以自己理解為主，可能會有不正確的地方，還請各位玩家多多包涵。

## 架構分析

這是個標準的前後端分離專案，雖然所有的程式碼都存放在一個 Repository 底下，但是基本上被切得很乾淨。

值得一提的是，作者幾乎所有內容都是用 Typescript 寫的，這大大降低了在 Debug 時的困難度。

### 後端

後端一共有三個服務

- API: 用於提供 HTTP API，以 [Express](https://expressjs.com/zh-tw/) 建構
- Bin ETL: 用於解析 Albion Online 的相關資源
- Discord Bot: 用於與 Discord Server 溝通，方便在社群之間分享地圖

無論如何，作者為這三個後端服務都提供了符合開放容器標準（OCI）的 Image（更白話一點的說，Docker Image），基本上這三個服務架設並沒有什麼難度。

順帶一提，這個服務還另外需要 PostgreSQL 與 Redis，在 `docker/docker-compose.yml` 中有定義相關的資訊。

### 前端

前端共有兩個服務

- frontend: 主要用於顯示資訊的介面，可以看作是一個 Dashboard，以 [React](https://reactjs.org/)（應該是 CRA） 建構
- homepage: 應該只是單純的靜態網頁，是用 [gatsby](https://www.gatsbyjs.com/) 建構的

比較麻煩的是，這兩個前端專案都沒有提供 Image，必須自行建構。

## 建置步驟

> 註：事實上，[文件](https://github.com/Portaler-Zone/portaler-core/blob/main/docs/selfhosting.md) 其實寫得很清楚，基本上我這邊只提在 Raspberry Pi 上面構建時需要注意的事項。

### 系統環境

- 裝置：Raspberry Pi 4 Model B, 4GB RAM
- 作業系統：Manjaro Linux ARM x64

因為自己習慣使用 [Arch Linux](https://archlinux.org/)，但是因為官方並未提供 ARM 版本的，於是這邊用 [Manjaro Linux](https://manjaro.org/) 代替。

考量到系統資源的限制（畢竟只有 4GB + 32GB 的 SD 卡），我選擇使用 [ARM 8 Raspberry Pi Minimal](https://manjaro.org/downloads/arm/raspberry-pi-4/arm8-raspberry-pi-4-minimal/)，下載後用 [Raspberry Pi Imager](https://www.raspberrypi.com/software/) 將作業系統燒進 SD 卡即可。

### 設定系統與更新

在 `/etc/pacman.d/mirrorlist` 中加入以下內容，以使用台灣（國網中心）及日本的鏡像

```
Server = http://free.nchc.org.tw/manjaro/arm-stable/$repo/$arch
Server = http://ftp.tsukuba.wide.ad.jp/Linux/manjaro/arm-stable/$repo/$arch
Server = http://ftp.riken.jp/Linux/manjaro/arm-stable/$repo/$arch
```

然後執行 `sudo pacman -Syyu` 更新系統，第一次會花費較久時間

> 注意：如果沒有更新的話，無論安裝什麼軟體都會憑證錯誤

### 安裝 Container Runtime

在 Linux 上我傾向使用 [containerd](https://containerd.io/) 取代 [docker](https://www.docker.com/)，主因是更加輕量化。

```bash
$ sudo pacman -S containerd
$ sudo systemctl start containerd
$ sudo systemctl enable containerd
```

之後，你應該可以用 `sudo systemctl status containerd` 看到 containerd 正常運作。

為了更方便使用 containerd，我通常會安裝 [nerdctl](https://github.com/containerd/nerdctl/)，這樣使用體驗就更趨近於 Docker CLI。

> 注意：請不要從 AUR 上面安裝 nerdctl，目前 AUR 上提供[只有 x86_64 架構的 PKGBUILD](https://aur.archlinux.org/cgit/aur.git/tree/PKGBUILD?h=nerdctl)

```bash
$ wget -O nerdctl.tar.gz https://github.com/containerd/nerdctl/releases/download/v0.14.0/nerdctl-0.14.0-linux-arm64.tar.gz
$ tar -xf nerdctl.tar.gz
$ sudo cp nerdctl /usr/local/bin/nerdctl
```

之後，你應該可以使用 `sudo nerdctl images` 看到目前系統上有哪些 Images。

> 註：你可以自行設定 Rootless Containerd，不過這超出本文的範圍所以先略過

### 下載 Portaler Zone 程式碼

```
$ sudo pacman -S git
$ git clone https://github.com/Portaler-Zone/portaler-core.git
```

你應該可以看到當前資料夾下有 portaler-core 的資料夾，裡面就是 Portaler Zone 的程式碼

### 建構後端 OCI Image

事實上，作者在 Docker Hub 是有提供現成的 Image：

- [mawburn/portaler](https://hub.docker.com/r/mawburn/portaler/)
- [mawburn/portaler-bot](https://hub.docker.com/r/mawburn/portaler-bot)
- [mawburn/portaler-etl](https://hub.docker.com/r/mawburn/portaler-etl)

很顯然地，它沒有支援 ARM 架構，所以我們只好自己建構。

在建構之前，我們需要為 containerd 安裝 buildkit：

```bash
$ wget -O buildkit.tar.gz https://github.com/moby/buildkit/releases/download/v0.9.3/buildkit-v0.9.3.linux-arm64.tar.gz
$ tar -xf buildkit.tar.gz
$ sudo cp -R bin /opt/containerd
$ sudo cp -R bin/buildkitd /usr/local/bin
$ sudo buildkitd
```

> 註：`buildkitd` 會佔用一個 Shell，看要用 Systemd 或是另起一個 Shell 都行

然後便可以正常在 ARM 下建構 Image：

> 註：以下指令要位於 `portaler-zone` 的專案資料夾下執行
> 註2：受限於 Raspberry Pi 的系統性能與 SD 卡的寫入速度，以下指令可能會花較多執行執行

```bash
$ sudo nerdctl build -t mawburn/portaler -f docker/api.dockerfile .
$ sudo nerdctl build -t mawburn/portaler-bot -f docker/bot.dockerfile .
$ sudo nerdctl build -t mawburn/portaler-etl -f docker/etl.dockerfile .
```

### 建構前端

因為前端程式並沒有提供 Image，相較於後端服務而言它的麻煩程度較高。

> 註：以下指令要位於 `portaler-zone` 的專案資料夾下執行

```bash
$ sudo pacman -S nvm python2
$ source /usr/share/nvm/init-nvm.sh
$ nvm install 14
$ nvm use 14
$ npm install -g corepack
$ corepack enable
$ yarn
$ yarn build:frontend
```

因為這個專案使用的 `node-sass` 版本為 `^4.14.1`（定義於 `packages/frontend/package.json`），需要使用 Node 14，所以我們先用 nvm 安裝 Node 14。

又因為 Node 14 尚未支援 `corepack`（直到 Node 16 才支援），所以我們需要用 `npm install -g corepack` 安裝它並啟用。

> murmur：作者完全沒講清楚，浪費我 10 分鐘 Debug

> 註：事實上，在 Raspberry Pi 上面建構不太明智，主要是因為 SD 卡的寫入速度限制（當然，如果你的財力可以買 V90 那就當我沒說）與硬體效能跑 yarn 實在有點勉強，也是可以在 x86_64 的系統上建構好再直接丟過來。

### 啟動後端服務

因為 ARM 架構上的問題，我們必須編輯 `docker/docker-compose.yml` 才能正常啟動服務：

```yaml
networks:
  portaler:
    driver: 'bridge'

volumes:
  db_data: {}

services:
  pgdb:
    image: postgres:13-alpine
    env_file:
      - .env.example
    volumes:
      - db_data:/var/lib/postgresql/data
    networks:
      - portaler
  rediscache:
    image: 'redis:6.0-alpine'
    env_file:
      - .env.example
    networks:
      - portaler
  discord_bot:
    image: mawburn/portaler-bot
    env_file:
      - .env.example
    environment:
      - API_URL=https://api_server/
    depends_on:
      - pgdb
      - rediscache
    networks:
      - portaler
  api_server:
    image: mawburn/portaler
    env_file:
      - .env.example
    ports:
      - '127.0.0.1:7777:4242'
    depends_on:
      - pgdb
      - rediscache
    networks:
      - portaler
  bin_etl:
    image: mawburn/portaler-etl
    env_file:
      - .env.example
    depends_on:
      - pgdb
      - rediscache
      - api_server
    networks:
      - portaler
```

因為原始的 `bitnami/redis:6.0` 並[不支援 ARM](https://github.com/bitnami/charts/issues/7305)，所以更改為 Docker 官方提供的 `redis:6.0-alpine`

另一方面因為使用了 `bridge` 這個 network driver，我們必須先行安裝

```bash
$ wget -O cni-plugins.tgz https://github.com/containernetworking/plugins/releases/download/v1.0.1/cni-plugins-linux-arm-v1.0.1.tgz
$ sudo mkdir -p /opt/cni/bin
$ sudo tar -C /opt/cni/bin/ -xf cni-plugins.tgz
```

最後，把 `.env.example` 裡面的 `REDIS_PASSWORD` 註解掉（前方加入 `#`），即可用以下指令啟動服務

```bash
$ sudo nerdctl compose -p portaler up -d
```

> 註：啟動前請記得要填寫 `.env.example` 裡面的資訊，例如 `HOST` 改成自己的域名、`ADMIN_KEY` 要強一點，以及設定 DISCORD 相關的 Token 及 Role。

### 啟動 Nginx 服務

因為目前有後端（位於 `localhost:7777`）及前端（HTML, CSS, JS 檔），官方文件中說明應該啟動一個 Nginx 服務去整合兩者。

```bash
$ sudo pacman -S nginx
$ sudo mkdir -p /var/www/
$ sudo ln -s ~/portaler-core/packages/frontend/build /var/www/portaler
```

然後建立 `/etc/nginx/conf.d/portaler.conf`（如果 `conf.d` 資料夾不存在的話就自行建立），內容如下：

```
server {
  listen 80;

  location /api/ {
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header Host           $http_host;
    proxy_pass      http://localhost:7777/api/;
  }

  location / {
    root   /var/www/portaler/;
    index  index.html index.htm;
    try_files $uri $uri/ /index.html;
  }

  error_page   500 502 503 504  /50x.html;

  location = /50x.html {
    root   /usr/share/nginx/html;
  }
```

並且編輯 `/etc/nginx/nginx.conf` 為下列內容

```
worker_processes  1;

events {
    worker_connections  1024;
}


http {
    include       mime.types;
    default_type  text/html;

    sendfile        on;

    include /etc/nginx/conf.d/*.conf;
}
```

> 註：這邊的僅為設定範例，你應該自行設置適合的參數

### 確認服務

使用 `curl localhost` 及 `curl localhost/api/health` 確認服務狀態之後，就可以打完收工。

## 結論

這次的委託其實還滿有趣的，因為是在 ARM 的架構上，跟以往 x86_64 的體驗很不同（例如常常噴一堆錯，偶爾還要自己通靈）

不得不說 containerd 真的是很棒的 Docker 替代方案，雖然只有在 Linux 上的體驗（在其它系統基本上還是要依賴虛擬機，與 Docker 原生支援的體驗就明顯有差）。

順帶一提，這樣整套下來大概會吃掉 500MB 的記憶體，其實這個服務完完全全是可以開 Digital Ocean, Linode 與 AWS Lightsail 上的，每個月花費約 5 美金，其實如果自架的話可以考慮不用這麼在 Raspberry Pi 上折騰。
