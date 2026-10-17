# Agent Instructions

## Project

- This is a personal website built with Astro.
- Use Bun as the package manager for dependencies and package scripts.
- Use HeroUI as the UI library.
- Use jujutsu (`jj`) as the version control system.

## Language

- Prefer Traditional Chinese when communicating with the user.
- Write code, comments, documentation, and change descriptions in English unless the user requests otherwise.
- Preserve the original wording of proper nouns, technical terms, identifiers, and commands.

## Version Control

- Use `jj` commands for all version control operations except Git submodule management, including inspecting status, reviewing diffs, describing changes, and managing bookmarks and remotes.
- Use `git` commands only when required for `git submodule` operations. This restriction also applies to commands run through scripts, aliases, or other wrappers.
- Do not fall back to Git if a `jj` operation fails or `jj` is unavailable; report the issue instead.
- Consult the [jujutsu documentation](https://docs.jj-vcs.dev) when needed.

## UI Development

- When changing UI, read and follow the local [heroui-react skill](.agents/skills/heroui-react/SKILL.md).
- Follow HeroUI v3 patterns and fetch the relevant component documentation before implementation.
- Adapt the skill's framework examples to Astro and its React integration.
- Use Bun for dependency management even when documentation examples use another package manager.

## Development

- Prefer available Language Server Protocol (LSP) capabilities for code analysis; fall back to file inspection and text search when unavailable.
- Install dependencies with `bun install` and run project scripts with `bun run <script>`.
- Run `bun run build` after changes that affect the website or its configuration.

When starting the dev server, use background mode:

```sh
bun run dev --background
```

Manage the background server with `bun run astro dev stop`, `bun run astro dev status`, and `bun run astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
