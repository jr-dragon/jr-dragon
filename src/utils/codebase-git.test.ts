import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import remarkCourseCode from "../plugins/remark-course-code";
import { parseCodeReference } from "./codebase";
import { buildCodebase, readCodebaseFile } from "./codebase.server";

const execute = promisify(execFile);

async function fixture(t: { after: (cleanup: () => Promise<void>) => void }, subdirectory = "") {
	const directory = await mkdtemp(join(tmpdir(), "versioned-codebase-"));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const chapter = join(directory, "src/content/course/example/00-overview");
	const root = join(chapter, "codebase");
	const source = join(root, subdirectory);
	const article = join(chapter, "en.md");
	await mkdir(join(source, "nested"), { recursive: true });
	async function git(...args: string[]) {
		// Signing is disabled only in disposable test repositories with synthetic authors.
		return (await execute("git", ["-C", root, "-c", "user.name=Course Test", "-c", "user.email=course@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args])).stdout;
	}
	await git("init", "--initial-branch=main");
	await writeFile(join(source, "main.go"), "package main\n\n// VERSION_ONE\n");
	await writeFile(join(source, "removed.txt"), "ONLY_IN_VERSION_ONE\n");
	await writeFile(join(source, "nested/file with spaces.txt"), "NESTED_FILE\n");
	await writeFile(join(chapter, "outside.txt"), "OUTSIDE_FILE\n");
	await symlink(join(chapter, "outside.txt"), join(source, "linked.txt"));
	if (subdirectory) {
		await writeFile(join(root, "private.txt"), "OUTSIDE_CODEBASE\n");
		await mkdir(join(root, `${subdirectory}-extra`));
		await writeFile(join(root, `${subdirectory}-extra/main.go`), "SIBLING_CODEBASE\n");
	}
	await git("add", "--all");
	await git("commit", "-m", "test: create first snapshot");
	const first = (await git("rev-parse", "HEAD")).trim();
	await writeFile(join(source, "main.go"), "package main\n\n// VERSION_TWO\n");
	await rm(join(source, "removed.txt"));
	await writeFile(join(source, "added.txt"), "ONLY_IN_VERSION_TWO\n");
	await git("add", "--all");
	await git("commit", "-m", "test: create second snapshot");
	const second = (await git("rev-parse", "HEAD")).trim();
	await writeFile(join(source, "main.go"), "package main\n\n// UNCOMMITTED_VERSION\n");
	return { root, source, chapter, article, first, second, git };
}

test("parses optional short and full hashes while rejecting refs and malformed references", () => {
	assert.equal(parseCodeReference("./main.go"), undefined);
	assert.deepEqual(parseCodeReference("{./main.go}"), { filename: "./main.go", revision: undefined });
	assert.deepEqual(parseCodeReference("{./main.go}(ABC1234)"), { filename: "./main.go", revision: "abc1234" });
	assert.equal(parseCodeReference(`{main.go}(${"a".repeat(40)})`)?.revision, "a".repeat(40));
	for (const invalid of ["{main.go}(main)", "{main.go}(xxxxxxx)", "{main.go}()", "{main.go}(abc;echo)", "{main.go}(abc1234)extra"]) {
		assert.throws(() => parseCodeReference(invalid), /Git Hash|External references/);
	}
});

test("reads historical contents and complete trees without checking out or changing dirty files", async (t) => {
	const { article, root, first, second, git } = await fixture(t);
	const status = await git("status", "--porcelain=v1", "-z");
	const source = await readCodebaseFile(article, "./codebase", "./main.go", first.slice(0, 7));
	assert.equal(source.revision, first);
	assert.match(source.content, /VERSION_ONE/);
	assert.match((await readCodebaseFile(article, "./codebase", "removed.txt", first)).content, /ONLY_IN_VERSION_ONE/);
	assert.match((await readCodebaseFile(article, "./codebase", "./main.go")).content, /UNCOMMITTED_VERSION/);
	const old = await buildCodebase(article, "./codebase", first);
	const newer = await buildCodebase(article, "./codebase", second);
	assert.equal(old.revision, first);
	assert.equal(old.commitMessage, "test: create first snapshot");
	assert.equal(newer.commitMessage, "test: create second snapshot");
	assert.ok(old.files["removed.txt"]);
	assert.equal(old.files["added.txt"], undefined);
	assert.ok(newer.files["added.txt"]);
	assert.equal(newer.files["removed.txt"], undefined);
	assert.equal(old.files["linked.txt"], undefined);
	assert.match(old.files["nested/file with spaces.txt"].html!, /NESTED_FILE/);
	assert.equal(old.tree[0].name, "nested");
	assert.equal(await git("status", "--porcelain=v1", "-z"), status);
	assert.equal((await git("rev-parse", "HEAD")).trim(), second);
	assert.match(await readFile(join(root, "main.go"), "utf8"), /UNCOMMITTED_VERSION/);
});

test("versioned Markdown exports canonical snapshot IDs for matching explorer data", async (t) => {
	const { article, first, second } = await fixture(t);
	const renderer = await createMarkdownProcessor({ remarkPlugins: [remarkCourseCode] });
	const result = await renderer.render(`\`\`\`go {./main.go}(${first.slice(0, 7)})\n\`\`\`\n\n\`\`\`go {./main.go}(${second})\n\`\`\``, {
		fileURL: pathToFileURL(article), frontmatter: { codebase: "./codebase" },
	});
	assert.match(result.code, /VERSION_ONE/);
	assert.match(result.code, /VERSION_TWO/);
	assert.doesNotMatch(result.code, /UNCOMMITTED_VERSION/);
	assert.match(result.code, new RegExp(`data-codebase-revision="${first}"`));
	assert.match(result.code, new RegExp(`data-codebase-revision="${second}"`));
	assert.deepEqual(result.metadata.frontmatter.codebaseRevisions, [first, second]);
});

test("rejects missing commits, files, path traversal, symlinks, and non-repository directories", async (t) => {
	const { article, chapter, first } = await fixture(t);
	await assert.rejects(readCodebaseFile(article, "./codebase", "main.go", "0000000"), /Cannot resolve Git commit/);
	await assert.rejects(readCodebaseFile(article, "./codebase", "missing.go", first), /does not exist as a regular file/);
	await assert.rejects(readCodebaseFile(article, "./codebase", "../outside.txt", first), /must stay inside codebase/);
	await assert.rejects(readCodebaseFile(article, "./codebase", "linked.txt", first), /does not exist as a regular file/);
	await mkdir(join(chapter, "plain"));
	await assert.rejects(buildCodebase(article, "./plain", first), /require a Git repository/);
});

test("scopes pinned files and explorer trees to a repository subdirectory", async (t) => {
	const { root, source, first, second, git } = await fixture(t, "codebase");
	const article = join(root, "01-project-init/zh-Hant.md");
	await mkdir(join(root, "01-project-init"));
	const status = await git("status", "--porcelain=v1", "-z");
	const oldFile = await readCodebaseFile(article, "../codebase", "./main.go", first.slice(0, 7));
	assert.equal(oldFile.path, "main.go");
	assert.equal(oldFile.revision, first);
	assert.match(oldFile.content, /VERSION_ONE/);
	assert.match((await readCodebaseFile(article, "../codebase", "main.go", second)).content, /VERSION_TWO/);
	assert.match((await readCodebaseFile(article, "../codebase", "main.go")).content, /UNCOMMITTED_VERSION/);
	const old = await buildCodebase(article, "../codebase", first);
	const newer = await buildCodebase(article, "../codebase", second);
	assert.equal(old.name, "codebase");
	assert.equal(old.revision, first);
	assert.equal(old.commitMessage, "test: create first snapshot");
	assert.deepEqual(Object.keys(old.files).sort(), ["main.go", "nested/file with spaces.txt", "removed.txt"]);
	assert.ok(newer.files["added.txt"]);
	assert.equal(newer.files["removed.txt"], undefined);
	assert.equal(old.tree[0].name, "nested");
	assert.equal(old.tree[0].children?.[0].id, "nested/file with spaces.txt");
	assert.match(old.files["main.go"].html!, /VERSION_ONE/);
	assert.doesNotMatch(JSON.stringify(old), /OUTSIDE_CODEBASE|SIBLING_CODEBASE/);
	await assert.rejects(readCodebaseFile(article, "../codebase", "../private.txt", first), /must stay inside codebase/);
	await assert.rejects(readCodebaseFile(article, "../codebase", "private.txt", first), /does not exist as a regular file/);
	await assert.rejects(readCodebaseFile(article, "../codebase", "linked.txt", first), /does not exist as a regular file/);
	assert.equal(await git("status", "--porcelain=v1", "-z"), status);
	assert.equal((await git("rev-parse", "HEAD")).trim(), second);
	assert.match(await readFile(join(source, "main.go"), "utf8"), /UNCOMMITTED_VERSION/);
});

test("renders subdirectory snapshots and excerpts with codebase-relative explorer IDs", async (t) => {
	const { root, first, second } = await fixture(t, "codebase");
	const article = join(root, "01-project-init/en.md");
	const renderer = await createMarkdownProcessor({ remarkPlugins: [remarkCourseCode] });
	const result = await renderer.render(`\`\`\`go {./main.go#L3-L3}(${first.slice(0, 7)})\n\`\`\`\n\n\`\`\`go {./main.go}(${second})\n\`\`\``, {
		fileURL: pathToFileURL(article), frontmatter: { codebase: "../codebase" },
	});
	assert.match(result.code, /VERSION_ONE/);
	assert.match(result.code, /VERSION_TWO/);
	assert.match(result.code, /--code-line-start: 2/);
	assert.match(result.code, /data-codebase-file="main.go"/);
	assert.doesNotMatch(result.code, /codebase\/main.go|UNCOMMITTED_VERSION/);
	assert.deepEqual(result.metadata.frontmatter.codebaseRevisions, [first, second]);
});

test("handles subdirectory names containing spaces and pathspec characters", async (t) => {
	const { root, first } = await fixture(t, "service [demo]");
	const article = join(root, "en.md");
	const snapshot = await buildCodebase(article, "./service [demo]", first);
	assert.match(snapshot.files["main.go"].html!, /VERSION_ONE/);
	assert.equal(snapshot.files["private.txt"], undefined);
});

test("rejects a codebase directory missing or replaced by a file at the selected commit", async (t) => {
	const { article, root, first } = await fixture(t);
	await mkdir(join(root, "later"));
	await mkdir(join(root, "removed.txt"));
	for (const directory of ["later", "removed.txt"]) {
		await assert.rejects(buildCodebase(article, `./codebase/${directory}`, first), /does not exist as a directory in Git commit/);
	}
});

test("resolves subdirectory snapshots inside a linked Git worktree", async (t) => {
	const { chapter, first, second, git } = await fixture(t, "codebase");
	const worktree = join(chapter, "worktree");
	await git("worktree", "add", "--detach", worktree, second);
	const snapshot = await buildCodebase(join(worktree, "en.md"), "./codebase", first);
	assert.equal(snapshot.revision, first);
	assert.match(snapshot.files["main.go"].html!, /VERSION_ONE/);
	assert.equal(snapshot.files["private.txt"], undefined);
});

test("a bundle builds both pinned and default previews without any embedded checkout", async (t) => {
	const { article, root, first, second, git } = await fixture(t);
	await git("bundle", "create", "../codebase.bundle", "--all");
	const bundle = await readFile(`${root}.bundle`);
	await rm(root, { recursive: true, force: true });
	const pinned = await buildCodebase(article, "./codebase", first.slice(0, 7));
	assert.equal(pinned.revision, first);
	assert.equal(pinned.commitMessage, "test: create first snapshot");
	assert.match(pinned.files["main.go"].html!, /VERSION_ONE/);
	assert.ok(pinned.files["removed.txt"]);
	const current = await buildCodebase(article, "./codebase");
	assert.match(current.files["main.go"].html!, /VERSION_TWO/);
	assert.ok(current.files["added.txt"]);
	assert.match((await readCodebaseFile(article, "./codebase", "main.go", first)).content, /VERSION_ONE/);
	assert.match((await readCodebaseFile(article, "./codebase", "main.go")).content, /VERSION_TWO/);
	assert.equal((await buildCodebase(article, "./codebase", second)).revision, second);
	await assert.rejects(readFile(join(root, ".git/HEAD")), /ENOENT/);
	assert.deepEqual(await readFile(`${root}.bundle`), bundle);
});

test("an adjacent bundle takes precedence over an ancestor repository", async (t) => {
	const { article, root, chapter, first, git } = await fixture(t);
	await git("bundle", "create", "../codebase.bundle", "--all");
	await rm(root, { recursive: true, force: true });
	await execute("git", ["-C", chapter, "init", "--initial-branch=main"]);
	await mkdir(root);
	const pinned = await buildCodebase(article, "./codebase", first);
	assert.equal(pinned.revision, first);
	assert.match(pinned.files["main.go"].html!, /VERSION_ONE/);
});
