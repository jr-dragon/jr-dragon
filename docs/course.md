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
