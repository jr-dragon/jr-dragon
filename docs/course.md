# Courses

Create a folder under `src/content/course/` for each course, with one numbered
folder per chapter. Each chapter contains at least one translation named after
its BCP 47 locale, using a `.md`, `.mdx`, or `.mdoc` extension.

```text
src/content/course/build-redis-from-scratch/
  00-overview/
    zh-Hant.md
    en.mdx
  01-project-initialize/
    zh-Hant.mdoc
  02-RESP/
    zh-Hant.md
```

The course index is generated at `/course/build-redis-from-scratch/` and lists
each chapter once, with links to all its translations.

Manage course titles in `src/config/courses.ts`, keyed by the course folder name.
Each course has an English (`en`) and Chinese (`zh-Hant`) title. The homepage
menu uses the Chinese title. The course index shows the Chinese title with the
English title beneath it. Chapter pages use the Chinese title
for Chinese locales and the English title for other locales. Unconfigured
courses fall back to their folder name.

Add another entry to this configuration and create its content folder to add a
new course. The homepage menu lists courses with content, linking to their course
indexes. The folder name remains the URL segment when the display title changes.

Translation routes follow `/course/{course_name}/{chapter_name}/{locale}/`.
The chapter's numeric prefix is removed from the URL:

| File | Route |
| --- | --- |
| `00-overview/zh-Hant.md` | `/course/build-redis-from-scratch/overview/zh-Hant/` |
| `00-overview/en.mdx` | `/course/build-redis-from-scratch/overview/en/` |
| `02-RESP/zh-Hant.md` | `/course/build-redis-from-scratch/RESP/zh-Hant/` |

Course names, chapter names, and locale filenames retain their case and
underscores. The chapter's number controls ordering, starting at zero if desired.
Padding is optional, and numbers may have gaps, but chapter numbers and chapter
URL names must each be unique within a course. A chapter can have one file per
language, regardless of extension; equivalent locale names such as `zh-Hant`
and `zh-hant` cannot both exist in a chapter.

Every translation must have a non-empty `title` in its frontmatter. A
`description` is optional:

```markdown
---
title: Overview
description: Build a Redis-compatible server from scratch.
---

Chapter content goes here.
```

The course index displays chapters in a static list. If both `zh-Hant` and
`en` translations exist, the Chinese title is primary and the English title is
secondary. If only one exists, that translation supplies the primary title.
The chapter title links to the Chinese translation when available, otherwise
to the English translation (or the first available translation for other languages).
HeroUI language Chips beside each chapter title link directly to their
translations (`繁體中文` and `English`).

Chapter pages link to the course index and other available translations.
Previous and next links preserve the current language and skip chapters without
that translation. The page's HTML language and alternate-language links reflect
the translation being rendered. Missing translations do not create routes or
redirect readers to another language.

The homepage course dropdown is interactive and displays the configured course titles.

## Code blocks

Markdown and MDX course code blocks display line numbers. Add a filename after
the language to display it above a code block, for example `go ./main.go`.

Wrap the filename in braces to load its contents from a local file at build time:

````markdown
---
title: Overview
codebase: './codebase'
---

```go {./main.go}
```
````

`codebase` is resolved relative to the article file. The example loads
`codebase/main.go` next to that article and displays `./main.go` as the caption.
Filenames must stay inside `codebase`, including when resolving symbolic links. Missing
`codebase` values or unreadable files cause a rendering error. Ordinary filenames
without braces continue to display the code written in the article.

Append `#Lstart-Lend` to the filename inside the braces to include only an
inclusive range of lines, for example `go {./main.go#L3-L8}`. This also works
with a Git snapshot: `go {./main.go#L3-L8}(21b0f49)`. Line numbers start at the
original source line, and the caption continues to show only the filename.
The Sheet still opens the complete file from the selected version. Invalid,
reversed, or out-of-bounds ranges cause a rendering error. Files without a
line range continue to display their full contents.

Content written inside an external fence adds display-only lines to the loaded
source. Each line accepts an optional `#Lnumber`, followed by an optional `+` or
`-` marker, then the content to display. Separate these prefixes with a space;
indentation after the marker is preserved. For example:

````markdown
```go {./main.go#L10-L14}(21b0f49)
#L10 - oldCall()
#L10 + newCall()
```
````

Inserted lines start at line 1 when no number is specified. After an explicit
number, subsequent unnumbered lines continue from that number. Lines are sorted
by their displayed numbers; ties keep the fence's order and appear above the
original source line without replacing or renumbering it. Inserted lines can
also appear outside an excerpt's range. `+` uses the HeroUI success background;
`-` uses the danger background. Prefixes are omitted from the displayed code.
These annotations do not change the source file or the complete Sheet preview.

Click an external block's filename to open the codebase explorer. It uses the
local HeroUI-based `Sheet` and `FileTree` components, selects the referenced file,
and expands its parent folders. Select other files to read their highlighted
contents with line numbers. The tree supports keyboard navigation; Escape and
the close button dismiss the sheet and return focus to the filename button.
On narrow screens, the file tree appears above the preview.

The codebase tree and previews are generated at build time and shared by all
external blocks in the article. Source Markdown is left unchanged. Only files
within the configured codebase are enumerated; `.git`, `.jj`, `node_modules`,
and symbolic links are excluded. Binary files remain listed with a message
instead of a text preview. Only translation files directly under a chapter
become course pages, so Markdown files inside a codebase are browsable source
files rather than additional chapters.

### Git snapshots

When `codebase` points to its own Git repository, append a commit hash in
parentheses immediately after the external filename:

````markdown
```go {./main.go}(21b0f49)
```
````

Short and full hexadecimal commit hashes are supported. The code block and
every file in its explorer come from that commit, including files that have
since been removed or renamed. Each block can use a different commit. The
filename caption shows only the file path, and the Sheet displays that commit's
message subject. The hash is used internally to select the snapshot. Reading a snapshot uses
Git objects without checking out a commit or changing the index or worktree.
Invalid hashes, missing commits, missing files, and non-repository codebases
produce a rendering error rather than falling back to current contents.
Unversioned references continue to read the current local files.

The overview codebase is initialized on `main` with commit `21b0f49`. Its adjacent
`codebase.bundle` preserves the repository's committed history in the website.
Jujutsu excludes nested Git worktrees, so the bundle replaces the loose codebase
files in the outer repository. A clean website checkout can build previews
directly from this bundle without restoring the embedded repository; references
without a hash use the bundle's `HEAD` when no local worktree exists.

After committing changes inside the embedded codebase, refresh its bundle:

```sh
git -C src/content/course/build-redis-from-scratch/00-overview/codebase bundle create ../codebase.bundle --all
```

Keep commits referenced by articles reachable from a branch or tag when updating
the bundle. To restore an editable codebase after checking out the website:

```sh
git clone src/content/course/build-redis-from-scratch/00-overview/codebase.bundle src/content/course/build-redis-from-scratch/00-overview/codebase
```

These Git commands apply only to embedded course repositories. Continue to use
`jj` for version control of the website itself. Git is needed at build time;
readers receive static snapshots and do not need Git or access to repository
metadata.
