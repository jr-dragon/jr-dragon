---
title: "Fedora Server 上建立 Wireguard VPN"
pubDate: 2022-08-10T13:29:27+08:00
slug: setup-wireguard-on-fedora-server
authors: [chivincent]
tags: [linux,vpn,wireguard]
description: "介紹在 Fedora Server 安裝與設定 Wireguard VPN，並完成防火牆、核心轉送及服務啟動設定。"
heroImage: "../../assets/setup-wireguard-on-fedora-server.webp"
heroImageFrom: "https://www.pexels.com/photo/bridge-and-river-in-forest-7519556/"
---

Wireguard 是一款開源的 VPN 的程式及協定，基於 Linux Kernel 實現，相較於 OpenVPN 而言有更好的效能。


## 前置準備

對於 Fedora Server 的安裝就不再贅述。

如果有固定 IP，建議在安裝時利用圖形化介面設定，或是在安裝後利用 `nmcli` 設定：

```
$ export NETWORK_INTERFACE="enp0s31f6"
$ sudo nmcli connection modify $NETWORK_INTERFACE \
    ipv4.address 192.168.50.100/24 \
    ipv4.gateway 192.168.50.2 \
    ipv4.dns 1.1.1.1,8.8.8.8 \
    ipv4.method manual
```

> 註：這個是我個人環境下的配置，請根據自己的網路架構進行設計。

## 安裝

```
$ sudo dnf install wireguard-tools
```

## Wireguard 設定

### 設定檔生成器

如果懶得手動設定的話，可以用 [Wireguard 設定檔生成器](https://www.wireguardconfig.com/) 自動建立適合的設定檔。

- CIDR 只要是私有 IP 段即可
- Endpoint 填入自己的 IP 或域名
- DNS 可以用 `1.1.1.1` 或 `8.8.8.8`
- **Post-Up rule 及 Post-Down rule 留空**
- 建議勾選 `Use Pre-Shared Keys (Enhanced Security)`

接著，以 root 用戶在 `/etc/wireguard` 下依照網頁給出的設定檔執行以下指令 **（以下指令僅供示範，請勿直接複製）**：

```
$ umask 077
$ cat << EOF >> /etc/wireguard/wg0.conf
[Interface]
Address = 10.0.0.1/24
ListenPort = 51820
PrivateKey = iKASmQMKyrSckns6uuObrNIlCJq7CvsWXzgDiaTVR38=

[Peer]
PublicKey = A+C7L2RckvGhCg2qUPGL4MqR/Lh0Oz3UhM8QyQndyCM=
PresharedKey = h/yTkEzgoszKNzsYLkziuqqED57x5EKSAiV4mGYGPmY=
AllowedIPs = 10.0.0.2/32

[Peer]
PublicKey = kNcKuKRiv07xWB26o7nP0jB9WHktrXAOwBUiFQ00i3k=
PresharedKey = /iaLbema3QZPKG0HEuvGB/pZdCDTjWm8UiAC59Vyq/w=
AllowedIPs = 10.0.0.3/32

[Peer]
PublicKey = BzusgK64iujPRLnvtig4H/r5vhS6xw5DZkM1sNDdS0A=
PresharedKey = LvULujpPnjfYLGY5TFBN2/WSQba46MdF1bje5t9XrV4=
AllowedIPs = 10.0.0.4/32
EOF
```

最後利用網頁上給出的 Client 設定檔匯入各 Client 即可。如果是移動裝置（如手機、平板）可以用 QR Code 掃瞄的方式匯入，其它設備則直接複制其設定檔即可。

### 手動生成設定檔

以 root 用戶執行以下指令

```
$ umask 077
$ cat << EOF >> /etc/wireguard/wg0.conf
[Interface]
Address = 10.0.0.1/24
ListenPort = 51820
PrivateKey = $(wg genkey)

[Peer]
PublicKey = 
PresharedKey = $(wg genpsk)
AllowedIPs = 10.0.0.2/32

[Peer]
PublicKey = 
PresharedKey = $(wg genpsk)
AllowedIPs = 10.0.0.3/32

[Peer]
PublicKey = 
PresharedKey = $(wg genpsk)
AllowedIPs = 10.0.0.4/32
EOF
```

建立完成後，記得在每個 Peer 的 `PublicKey` 中填入各客戶端的 Public Key。

然後在各客戶端間以相同步驟建立 public key 及 private key，並且加入設定檔，內容如下：

```
[Interface]
Address = 10.0.0.2/24
PrivateKey = Client 的 private key
DNS = 1.1.1.1

[Peer]
PublicKey = Server 的 public key
PresharedKey = Server 的 PSK
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = wg.test:51820 # 依照自己的 Endpoint 做修改
PersistentKeepalive = 30
```

對於一些行動裝置，可以安裝 `qrencode` 在命令列中產生 QRCode 將設定檔複製到裝置上：

```
$ qrencode -t ansiutf8 < client.conf
```

## 系統設定

### 防火牆

建立 Wireguard 設定檔後，應該還無法連線，因為還沒有設定防火牆。在 Fedora Server 36 中，預設使用 firewalld。

```
$ firewall-cmd --zone=FedoraServer --add-service=wireguard --permanent
$ firewall-cmd --zone=FedoraServer --add-masquerade --permanent
$ filewall-cmd --zone=FedoraServer --add-forward --permanent
$ firewall-cmd --reload
```

### Kernel 參數

對於一些 Linux 發行版（例如 Arch Linux），可能需要調整一下 Kernel 參數：

```
$ cat << EOF >> /etc/sysctl.conf
net.ipv4.ip_forward=1
net.ipv6.conf.all.forwarding=1
EOF
```

## 啟動服務

### wg-quick

利用 `wg-quick up wg0` 即可啟動服務，其中的 `wg0` 會依照 `/etc/wireguard/*.conf` 的檔名做變化。

啟動服務之後，應該可以在 `ip addr` 中看到一個名為 `wg0` 的網路介面：

```
4: wg0: <POINTOPOINT,NOARP,UP,LOWER_UP> mtu 1420 qdisc noqueue state UNKNOWN group default qlen 1000
    link/none
    inet 192.168.100.1/24 scope global wg0
       valid_lft forever preferred_lft forever
```

關閉服務則可以利用 `wg-quick down wg0`，它會自動刪除 `wg0` 的網路介面。

### Systemd

利用 systemd 可以更好地控制 Wireguard 的生命周期

```
$ sudo systemctl start wg-quick@wg0
$ sudo systemctl enable wg-quick@wg0 # 開機自動啟動
```

其中，`@wg0` 會依照 `/etc/wireguard/*.conf` 的檔名產生變化
