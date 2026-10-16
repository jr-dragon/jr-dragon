import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import remarkCourseCode from "./remark-course-code";

async function fixture(t: { after: (cleanup: () => Promise<void>) => void }) {
	const directory = await mkdtemp(join(tmpdir(), "course-code-"));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const chapter = join(directory, "src/content/course/example/00-overview");
	const codebase = join(chapter, "codebase");
	await mkdir(join(codebase, "nested"), { recursive: true });
	const processor = await createMarkdownProcessor({ remarkPlugins: [remarkCourseCode] });
	return {
		chapter,
		codebase,
		render: async (body: string, frontmatter: Record<string, unknown> = { codebase: "./codebase" }, file = join(chapter, "en.md")) =>
			(await processor.render(body, { fileURL: pathToFileURL(file), frontmatter })).code,
	};
}

test("loads a nested file relative to the article's codebase before highlighting", async (t) => {
	const { codebase, render } = await fixture(t);
	await writeFile(join(codebase, "nested/main file.go"), "package main\r\n\r\nfunc main() {}\r\n");
	const html = await render("```go {./nested/main file.go}\nstale content\n```");
	assert.match(html, /<figcaption>\.\/nested\/main file\.go<\/figcaption>/);
	assert.match(html, /class="astro-code/);
	assert.match(html, /package/);
	assert.doesNotMatch(html, /stale content|\{\.\/nested/);
	assert.equal((html.match(/class="line"/g) ?? []).length, 3);
});

test("keeps ordinary code blocks and non-course content unchanged", async (t) => {
	const { chapter, render } = await fixture(t);
	const inline = await render("```go ./main.go\nINLINE_CODE\n```", {});
	assert.match(inline, /<figcaption>\.\/main\.go<\/figcaption>/);
	assert.match(inline, /INLINE_CODE/);
	const blog = await render("```go {./missing.go}\nBLOG_CODE\n```", {}, join(chapter, "../../../../blog/example.md"));
	assert.match(blog, /BLOG_CODE/);
	assert.doesNotMatch(blog, /<figcaption>/);
});

test("reads updated file contents and handles nested fences and empty files", async (t) => {
	const { codebase, render } = await fixture(t);
	const source = join(codebase, "main.go");
	await writeFile(source, "FIRST_VERSION\n");
	assert.match(await render("> ```text {main.go}\n> ```"), /FIRST_VERSION/);
	await writeFile(source, "SECOND_VERSION\n");
	const updated = await render("```text {main.go}\n```");
	assert.match(updated, /SECOND_VERSION/);
	assert.doesNotMatch(updated, /FIRST_VERSION/);
	await writeFile(source, "");
	assert.doesNotMatch(await render("```text {main.go}\nstale\n```"), /stale/);
});

test("requires codebase only for external fences and identifies unreadable sources", async (t) => {
	const { render } = await fixture(t);
	for (const codebase of [undefined, "", "   ", 123]) {
		await assert.rejects(render("```go {main.go}\n```", { codebase }), /requires a non-empty codebase/);
	}
	await assert.rejects(render("```go {missing.go}\n```"), /Cannot load external code block "missing.go"/);
	await assert.rejects(render("```go {}\n```"), /non-empty paths relative to codebase/);
});

test("rejects absolute paths, traversal, and symlinks outside codebase", async (t) => {
	const { chapter, codebase, render } = await fixture(t);
	const outside = join(chapter, "outside.go");
	await writeFile(outside, "PRIVATE_CODE");
	await symlink(outside, join(codebase, "linked.go"));
	await assert.rejects(render(`\`\`\`go {${outside}}\n\`\`\``), /paths relative to codebase/);
	await assert.rejects(render("```go {../outside.go}\n```"), /must stay inside codebase/);
	await assert.rejects(render("```go {linked.go}\n```"), /must stay inside codebase/);
});

test("renders external contents as escaped code rather than HTML or Markdown", async (t) => {
	const { codebase, render } = await fixture(t);
	const source = "<script>alert(1)</script>\n```\n# Still code\n";
	await writeFile(join(codebase, "example.txt"), source);
	const html = await render("```text {example.txt}\n```");
	assert.doesNotMatch(html, /<script>|<h1>/);
	assert.match(html, /Still code/);
	assert.equal(await readFile(join(codebase, "example.txt"), "utf8"), source);
});
