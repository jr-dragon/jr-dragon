---
title: "In Memory SQLite 的備份與還原"
pubDate: 2024-06-19T18:23:44+08:00
slug: backup-and-restore-for-in-memory-sqlite
authors: [chivincent]
tags: [sqlite,go]
description: "比較 SQLite 的備份方式，並以 Go 示範使用 VACUUM INTO 與 Online Backup API 備份及還原記憶體資料庫。"
heroImage: "../../assets/backup-and-restore-for-in-memory-sqlite.webp"
heroImageFrom: "https://www.pexels.com/photo/landscape-with-lake-15691486/"
---

近期在研究一個相對有趣的問題：如何讓 In-Memory SQLite 能夠在程式結束時進行自動備份，並且在程式啟動時自動套用最新的備份。

如果想要備份 SQLite，有幾種方式：
1. 使用 [`.dump`](https://sqlite.org/cli.html#converting_an_entire_database_to_a_text_file) 將指定表中資料匯出為 SQL
    - 優點：將資料轉存為 SQL，如果需要跨資料庫（例如 sqlite to mysql）的話相當方便
    - 缺點：檔案為 UTF-8 純文字檔案，所需容量較大且需要轉換 SQL 故執行時間會較長
2. 使用 [`VACUUM INTO`](https://sqlite.org/lang_vacuum.html) 指令，將 DB 檔案轉存為獨立的檔案
    - 優點：執行後會將資料碎片彙整，進一步降低所需容量；且生成的檔案可以直接被 sqlite 客戶端讀取
    - 缺點：寫入時在極端情況下（例如當機或停電），並不保證資料能夠被完整寫入
3. 使用 [Online Backup API](https://www.sqlite.org/backup.html)
    - 優點：直接鏡像備份兩個 SQLite 連線；效率較 `VACUUM` 來得高
    - 缺點：沒有直接的指令，需使用 SQLite API 達成；因為是鏡像備份，所以包括源資料庫的資料碎片等亦會被保留


## 備份

目的是在程式結束時自動備份，如果不考慮極端情況的話，完全可以用 `VACUUM INTO` 的方式進行。

```go
func main() {
    db, err := sql.Open("sqlite3", "file:/foobar?vfs=memdb")
    if err != nil { panic(err) }
    defer func() {
        archive(db, "archive")
        db.Close()
    }()

    for {
        // do something...
    }
}

func archive(db *sql.DB, dir string) (err error) {
    _, err = db.Exec(fmt.Sprintf("VACUUM INTO '%s/%d.db';", dir, time.Now().UnixMicro()))
	return
}
```

## 還原

在還原時，可以依賴 Online Backup API 來進行

```go
func main() {
    db, err := sql.Open("sqlite3", "file:/foobar?vfs=memdb")
    if err != nil { panic(err) }
    defer func() {
        archive(db, "archive")
        db.Close()
    }()

    if err := archiveLoad(conn(db), "archive"); err != nil {
        panic(err) // archive load failed
    }

    for {
        // do something...
    }
}

func archiveLoad(dc *sqlite3.SQLiteConn, dir string) (err error) {
    // 取得最新的 archive
    var path string
	if path, err = lastArchive(dir); err != nil { 
		return
	}

    var archive *sql.DB
	if archive, err = sql.Open("sqlite3", path); err != nil {
		return
	}

    // 取得 archive (source) 的 SQLite Connection
	var sc *sqlite3.SQLiteConn
	if sc, err = conn(archive); err != nil {
		return
	}

    return syncAll(sc, dc)
}

func conn(db *sql.DB) (c *sqlite3.SQLiteConn, err error) {
	var rawConn *sql.Conn
	if rawConn, err = db.Conn(context.Background()); err != nil {
		return
	}

    // 這其實是不好的示範，因為官方文件明確指出 driverConn 不應該在 function 以外被使用
	err = rawConn.Raw(func(driverConn any) error {
		var ok bool
		if c, ok = driverConn.(*sqlite3.SQLiteConn); !ok {
			return errors.New("failed to get sqlite3 connection")
		}
		return nil
	})

	return
}

func syncAll(src, dest *sqlite3.SQLiteConn) error {
	backup, err := dest.Backup("main", src, "main")
	if err != nil {
		return err
	}
	defer func() {
		if err = backup.Finish(); err != nil {
			panic(err)
		}
	}()

	var done bool
	for !done {
        // -1 代表備份整個資料庫
		if done, err = backup.Step(-1); err != nil {
			return err
		}
	}

	return nil
}
```

## 參考資料

1. [SQLite Online Backup API](https://www.sqlite.org/backup.html)
2. [SQLite VACUUM](https://sqlite.org/lang_vacuum.html)
3. [backing up a SQLite database with Go](https://rbn.im/backing-up-a-SQLite-database-with-Go/backing-up-a-SQLite-database-with-Go.html)
