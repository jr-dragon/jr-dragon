---
title: "以 devcontainer 設計開發環境"
pubDate: 2024-11-29T11:37:15+08:00
slug: development-environment-by-devcontainer
authors: [chivincent]
tags: [docker,devcontainer,go]
description: "以 Go 專案為例，示範使用 devcontainer、Docker Compose 與 Docker in Docker 建立團隊共用的開發環境。"
heroImage: "../../assets/development-environment-by-devcontainer.webp"
heroImageFrom: "https://www.pexels.com/photo/landscape-with-mountain-lake-and-conifer-trees-12705260/"
---

因應近期在開發 Side Project 時與前端工程師有協作上的需求，原本想要沿用 [Laravel 環境設定](/blog/laravel-setup) 中提到的 Local 與 Develop 環境，不過喜新厭舊的我在觀望了一陣子的 [devcontainer](https://containers.dev/) 之後，決定來嘗試一下。

> 註：devcontainer 在 VSCode 上的支援性較好，在 JetBrains IDEs 上會有一些奇奇怪怪的小問題（但是我個人仍然是偏好使用 Jetbrains IDE，~Jetbrains 該給業配了吧~）


## 專案結構

對於一個 Go Project，我與我的團隊偏好採用 [golang-standard/project-layout](https://github.com/golang-standards/project-layout) 作為基礎。

> 註：雖然寫 `golang-standard`，但這並不是 Go 標準的一部份，社群之間也多有反對意見；但不可諱言地，當考慮團隊協作時這種架構有助於降低溝通門檻。

```
$ tree .
.
├── cmd
│   └── http_server
│       ├── config.json
│       └── main.go
├── go.mod
├── go.sum
├── internal
│   └── data
│       └── config.go
└── readme.md
```

**cmd/http_server/config.json：用於應用程式的設定**

```json
{
    "http_server": {
        "addr": ":8000"
    }
}
```

**cmd/http_server/main.go：實際提供 HTTP Server 的服務**

```go
package main

import (
    _ "embed"
    "fmt"
    "log"
    "net/http"
)

//go:embed config.json
var configContent []byte

func main() {
    conf, err := data.NewConfig(configContent)
    if err != nil {
        panic(err)
    }

    http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
        w.Write([]byte("Hello World!"))
    })

    log.Fatal(http.ListenAndServe(confg.HttpServer.Addr, nil))
}
```

**internal/data/config.go：解析應用程式設定的工具**

```go
package data

type ConfigHttpServer struct {
    Addr string `json:addr`
}

type Config struct {
    HttpServer ConfigHttpServer `json:http_server`
}

func NewConfig(content []byte) (*Config, error) {
    var c Config
    err := json.Unmarshal(content, &c)

    return &c, err
}
```

## 導入 devcontainer

建立 `.devcontainer/devcontainer.json` 用於定義開發環境

**.devcontainer/devcontainer.json**

```json
{
  "name": "Go API",
  "image": "mcr.microsoft.com/devcontainers/go:1.23",

  "customizations": {
    "vscode": {
      "settings": {},
      "extensions": [
        "streetsidesoftware.code-spell-checker"
      ]
    }
  },

  "forwardPorts": [8000],

  "portsAttributes": {
    "9000": {
      "label": "Go HTTP Server",
      "onAutoForward": "notify"
    }
  }
}
```

此時，就可以利用 VSCode 或 Jetbrains IDE 來建立 devcontainer：
- VSCode: https://code.visualstudio.com/docs/devcontainers/containers
- Jetbrains IDEs: https://www.jetbrains.com/help/idea/connect-to-devcontainer.html

### 加入其它服務

對於大部份應用程式而言，開發環境中不太可能單純只有 Go 應用程式，通常會需要 Database, Redis 之類的服務

這時我們可以利用 `docker-compose.yml` 來定義所需的服務：

**.devcontainer/devcontainer.json**

```json
{
  "name": "Go API",
  "image": "mcr.microsoft.com/devcontainers/go:1.23",
  "dockerComposeFile": "docker-compose.yml",

  // ...
}
```

**.devcontainer/docker-compose.yml**

```yaml
services:
  devcontainer:
    image: mcr.microsoft.com/devcontainers/go:1.23
    volumes:
      - ../:/go-api:cached
    networks: [ 'devcontainer' ]
    command: sleep infinity

  postgres:
    image: postgres:alpine
    volumes:
      - data:/var/lib/postgresql/data
    restart: always
    ports: [ "5432:5432" ]
    networks: [ 'devcontainer' ]
    environment:
      POSTGRES_DB: database
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
    healthcheck:
      test: [ "CMD", "pg_isready", "-q", "-d", "database", "-U", "user" ]
      interval: 5s
      timeout: 1s
      retries: 10

  redis:
    image: redis:alpine
    volumes:
      - data:/var/lib/redis
    restart: always
    ports: [ "6379:6379" ]
    networks: [ 'devcontainer' ]
    healthcheck:
      test: [ "CMD", "redis-cli", "ping" ]
      interval: 5s
      timeout: 1s
      retries: 10

networks:
  devcontainer:
    driver: bridge

volumes:
  data:
```

如此一來，便可以在 devcontainer 中利用 `database:5432` 與 `redis:6379` 連接到相應的服務；另外也可以用 Host 上的工具經由 `localhost:5432` 與 `localhost:6379` 連線到相應的服務上。

> 註：要注意的是，如果一次啟動多個不同的專案，可能會導致 Port 衝突，這部份請特別小心

### 加入其它工具

預設提供的 `mcr.microsoft.com/devcontainers/go:1.23` 其實沒什麼工具（甚至連 `ping` 都沒有），這時我們可以利用 Dockerfile 建立一個適合自己的環境。

舉例來說，假設我們需要 Docker in Docker 的話，可以這麼設定

> 註：事實上，完全可以利用 [Docker In Docker](https://github.com/devcontainers/features/tree/main/src/docker-in-docker) 或 [Docker Outside of Docker](https://github.com/devcontainers/features/tree/main/src/docker-outside-of-docker) 這兩個 devcontainer feature 來達成目的，以下僅是作為示範

**.devcontainer/docker-compose.yml**

```yaml
services:
  devcontainer:
    build:
      context: .
    volumes:
      - ../:/go-api:cached
      - docker-certs-client:/certs/client:ro
    environment:
      DOCKER_HOST: tcp://docker:2376
      DOCKER_TLS_VERIFY: 1
      DOCKER_CERT_PATH: /certs/client
    networks: [ 'devcontainer', 'docker' ]
    command: sleep infinity

  docker:
    image: docker:dind
    networks: [ 'docker' ]
    volumes:
      - docker-certs-ca:/certs/ca
      - docker-certs-client:/certs/client
    environment:
      DOCKER_TLS_CERTDIR: /certs
    privileged: true

# ...

networks:
  devcontainer:
    driver: bridge
  docker:
    driver: bridge
    
volumes:
  data:
  docker-certs-ca:
  docker-certs-client:
```

**.devcontainer/Dockerfile**

```dockerfile
FROM mcr.microsoft.com/devcontainers/go:1.23

# Install Docker: https://docs.docker.com/engine/install/ubuntu/#install-using-the-convenience-script
RUN curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh

CMD ["sleep", "infinity"]
```

如此一來，便可以在 devcontainer 中使用 docker commands，這對於一些 docker based generator （例如用 docker 生成 swagger 文件）之類的相當方便。
