# Build Redis from Scratch: source review

Reviewed on 2026-10-18. These observations are for the author's decision; no
upstream issue, source code, existing article, or renderer was corrected.
The new English articles retain issue prose and inline examples. Traditional
Chinese articles present the explanations in the author's voice. Historical implementation limits
remain documented in their corresponding chapters.

## Course and source mapping

The course contains 17 chapters, each with `zh-Hant.md` and `en.md`. Chapter
numbers follow the issue's Day number, rather than the issue number. Day 3–4
and Day 9–10 each remain a single chapter. There is no missing issue #9 chapter.

The original tutorials are by jr-dragon and licensed under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), following the
[repository's tutorial license](https://github.com/jr-dragon/olivine/blob/a63648004b01f06837689541a0c792d0382a86fa/readme.md).
Source attribution is recorded in this review rather than in opening notices
on every article. Editorial changes include translation, frontmatter, terminal
formatting, and conversion of source links into external fences.

The submodule is `src/content/course/build-redis-from-scratch/codebase`, using
`https://github.com/jr-dragon/olivine.git` and pinned to
`a63648004b01f06837689541a0c792d0382a86fa`. It replaces the previous local-only
`olivine` submodule location. The article fences retain the individual historical
commits from the issues, including the unmerged OpenTelemetry experiment.

Initialize the source after a fresh website checkout:

```sh
git submodule update --init --recursive -- src/content/course/build-redis-from-scratch/codebase
```

Use a full submodule clone: the articles reference historical commits across
several branches. Do not initialize it with a shallow-history option. The build
does not download code automatically.

## Items awaiting an editorial decision

| Source | Observation | Possible correction, not applied |
| --- | --- | --- |
| [Day 1, issue #2](https://github.com/jr-dragon/olivine/issues/2) | Modules are described as a feature introduced after Go 1.13. | Separate the initial experimental support in Go 1.11 from later changes to defaults. See [Go 1.11 release notes](https://go.dev/doc/go1.11#modules). |
| [Day 3–4, issue #4](https://github.com/jr-dragon/olivine/issues/4) | The Magic Byte section contains the incomplete URL `https://github.com/jr-dragon/olivine/blob/`. | Choose a commit and line range. The URL is preserved as text, and the original inline constants remain visible. |
| [Day 3–4, issue #4](https://github.com/jr-dragon/olivine/issues/4) | The explanation gives the same `{MAGIC}{LENGTH}\r\n{DATA}\r\n` shape for arrays and bulk strings. | Explain that an array header is followed by individually encoded values, rather than a bulk payload with one trailing delimiter. See the [RESP specification](https://redis.io/docs/latest/develop/reference/protocol-spec/#arrays). |
| [Day 6, issue #6](https://github.com/jr-dragon/olivine/issues/6) | Prose uses `[]cmd.Commands` and `cmd.NewCommand()`, while the referenced code defines `[]cmd.Command` and `NewCommands()`. The `Args()` excerpt points to lines 54–56, which show `Command()`. | Update the identifiers and change the `Args()` range to lines 58–60 at the same commit. |
| [Day 6, issue #6](https://github.com/jr-dragon/olivine/issues/6) | The map warning implies any simultaneous access is unsafe, including read-only access. | Distinguish concurrent reads from concurrent access involving writes. See the [Go maps article](https://go.dev/blog/maps#concurrency). |
| [Day 8, issue #8](https://github.com/jr-dragon/olivine/issues/8) | `go test ./pkg/resp/value_test.go` selects only the test file and omits the package implementation; `./pkg/resp.value_test.go` is also an incorrect path. | Use package targets such as `go test ./pkg/resp` and `go test -bench=. ./pkg/resp`. |
| [Day 8, issue #8](https://github.com/jr-dragon/olivine/issues/8) | Prose mentions `b.EndTimer()`, and snippets use `slices.Equals`, mix `tc.expect` with `tc.expected`, contain a malformed quoted `t.Error` call, and omit a trailing comma in a mock struct literal. The first test-function inline code also has an unmatched backtick. | Review these as tutorial snippets rather than copyable complete programs. The APIs are `B.StopTimer()` and `slices.Equal`; formatted failures use `t.Errorf`. See [testing](https://pkg.go.dev/testing#B.StopTimer) and [slices](https://pkg.go.dev/slices#Equal). |
| [Day 8, issue #8](https://github.com/jr-dragon/olivine/issues/8) | The final paragraph lists `internal/service/set_test.go`; the referenced history contains `internal/service/cmd/set_test.go`. | Add the missing `cmd/` path segment. |
| [Day 9–10, issue #10](https://github.com/jr-dragon/olivine/issues/10) | The introductory `func (app *App) Run() error` snippet contains a bare `return` after restore failure, although the return value is unnamed. | Return the error explicitly. Keep the later channel-based evolution distinct from this initial sketch. |
| [Day 12, issue #12](https://github.com/jr-dragon/olivine/issues/12) | The illustrative declaration says `interface Server` instead of `type Server interface`. The initial kessoku file uses `data.Config` without importing `olivine/internal/data`. | Correct the declaration and add the import if these snippets should compile independently. |
| [Day 13, issue #13](https://github.com/jr-dragon/olivine/issues/13) | The paragraph about calling `Worker.Start()` from the application links to `internal/service/worker.go`, not the application call site. | Select the intended `app.go` excerpt. The currently linked file remains rendered. |
| [Day 15, issue #15](https://github.com/jr-dragon/olivine/issues/15) | Examples switch from the earlier port 16879 to 16379 without explaining the change. The same write cost is quoted as both 151.55s and 151.53s. | Confirm the benchmark server port and the source measurement before normalizing the examples. |
| [Day 16, issue #16](https://github.com/jr-dragon/olivine/issues/16) | The block-profile instructions do not mention enabling sampling. The checked-out main reads `PPROF_BLOCK_RATE` and `PPROF_MUTEX_FRAC` for this purpose. | Document the intended environment variables. Block and mutex sampling are controlled separately; see [runtime/pprof](https://pkg.go.dev/runtime/pprof#hdr-Block_profile). |
| [Day 17, issue #17](https://github.com/jr-dragon/olivine/issues/17) | Prose treats interface casting as necessarily allocating on the heap, and repeatedly names `resp.(*Commands)` although the type is `Command`. | Qualify allocation behavior with escape analysis and measured evidence; fix the identifier. See the [Go allocation FAQ](https://go.dev/doc/faq#heap_or_stack). |
| [Day 18, issue #18](https://github.com/jr-dragon/olivine/issues/18) | Prose refers to `trace.Start()` while snippets use `otel.Tracer(...).Start(...)`; it calls the default span status successful rather than distinguishing `Unset` from explicit `Ok`. It also names `data.(*mapStorage)` instead of the `repo` package. | Align names with the snippets and explain the status distinction. See [OpenTelemetry span status](https://opentelemetry.io/docs/concepts/signals/traces/#span-status). |

## Spelling examples retained in English

The issues also contain spelling and grammar errors. Examples include:

- Day 0: `job a job`, `practing`, `production reday`, `specfications`.
- Day 1–2: `funcion`, `exaple`, `sturct`, `stdard libary`.
- Day 5–8: `RSEP`, `mangae`, `Databae`, `imlemented`, `Sentiel`, `reciever`, `implenent`.
- Day 9–14: `gime`, `Inection`, `Depencency`, `finiate`, `millisecons`, `explian`, `stringn`.
- Day 15–18: `Olny`, `Verifiy`, `radom`, `glow`, `flame graphc`, `Proemetheus`.

These are examples rather than an exhaustive copyedit. No upstream edits were
made. The original code and commands are preserved in both languages.

## Historical limitations retained

- Day 9–10 explicitly acknowledges a shutdown race between accepting a connection
  and registering it in the connection map.
- Day 14 explicitly leaves `KEEPTTL` with AOF unresolved at that point in history.
  Later commits may fix it; the article still shows its historical stage.
- Day 17 benchmark numbers describe the author's specific workload and machine,
  rather than a general performance guarantee or a newly reproduced result.
- Day 18 explicitly describes `d18/otel` as incomplete and not merged into main.

## Website observations

The existing explorer embeds highlighted full-repository snapshots for the
commits referenced on each page. Rendering all issue excerpts produces about
102 MiB of uncompressed course HTML in total. The memory-profiling chapter is
about 9.3 MiB per translation. Sharing or loading snapshot data separately would
require a renderer change, which is outside this request's content-only scope.

`bun run astro check` reports no errors and three existing hints:

- `src/components/sheet/sheet.tsx:130`: deprecated `UNSTABLE_portalContainer`.
- `src/pages/index.astro:8`: unused `CourseMenu` import.
- `src/pages/index.astro:13`: unused `courses` variable.

The homepage course menu is currently unused. The course index and translation
routes are generated and accessible directly. No homepage code was changed.
