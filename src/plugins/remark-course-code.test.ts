import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import remarkCourseCode from "./remark-course-code";
import rehypeCourseCode from "./rehype-course-code";
import { Window } from "happy-dom";

function renderedLines(html: string) {
	const window = new Window();
	const document = new window.DOMParser().parseFromString(html, "text/html");
	return [...document.querySelectorAll("pre > code > .line")].map((line) => ({
		number: Number(line.getAttribute("data-line-number")),
		diff: line.getAttribute("data-diff"),
		content: line.textContent,
	}));
}

async function fixture(t: { after: (cleanup: () => Promise<void>) => void }) {
	const directory = await mkdtemp(join(tmpdir(), "course-code-"));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const chapter = join(directory, "src/content/course/example/00-overview");
	const codebase = join(chapter, "codebase");
	await mkdir(join(codebase, "nested"), { recursive: true });
	const processor = await createMarkdownProcessor({ remarkPlugins: [remarkCourseCode], rehypePlugins: [rehypeCourseCode] });
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
	const html = await render("```go {./nested/main file.go}\n```");
	assert.match(html, /<figcaption><button[^>]*>\.\/nested\/main file\.go<\/button><\/figcaption>/);
	assert.match(html, /data-codebase-file="nested\/main file.go"/);
	assert.match(html, /aria-haspopup="dialog"/);
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
	assert.doesNotMatch(inline, /data-codebase-file|<button/);
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
	assert.match(await render("```text {main.go}\nINSERTED_IN_EMPTY_FILE\n```"), /INSERTED_IN_EMPTY_FILE/);
	assert.equal((await render("```text {main.go}\n```")).includes("FIRST_VERSION"), false);
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

test("renders only the inclusive source range and keeps the full filename for the explorer", async (t) => {
	const { codebase, render } = await fixture(t);
	const source = "BEFORE\r\n\r\nSELECTED\r\n\r\nAFTER\r\n";
	await writeFile(join(codebase, "nested/main file.txt"), source);
	const html = await render("```text {./nested/main file.txt#L2-L4}\n```");
	assert.match(html, /style="--code-line-start: 1"/);
	assert.match(html, /<figcaption><button[^>]*>\.\/nested\/main file\.txt<\/button><\/figcaption>/);
	assert.match(html, /data-codebase-file="nested\/main file.txt"/);
	assert.match(html, /SELECTED/);
	assert.doesNotMatch(html, /BEFORE|AFTER|stale content|#L2-L4/);
	assert.equal((html.match(/class="line"/g) ?? []).length, 3);
	assert.equal(await readFile(join(codebase, "nested/main file.txt"), "utf8"), source);
	const full = await render("```text {./nested/main file.txt}\n```");
	assert.match(full, /BEFORE/);
	assert.match(full, /AFTER/);
	assert.doesNotMatch(full, /--code-line-start/);
});

test("supports first, last and single-line excerpts with or without a final newline", async (t) => {
	const { codebase, render } = await fixture(t);
	for (const ending of ["", "\n"]) {
		await writeFile(join(codebase, "example.txt"), `FIRST\nMIDDLE\nLAST${ending}`);
		const first = await render("```text {example.txt#L1-L1}\n```");
		assert.match(first, /FIRST/);
		assert.doesNotMatch(first, /MIDDLE|LAST|--code-line-start/);
		const last = await render("```text {example.txt#L3-L3}\n```");
		assert.match(last, /LAST/);
		assert.match(last, /--code-line-start: 2/);
		assert.doesNotMatch(last, /FIRST|MIDDLE/);
		assert.equal((last.match(/class="line"/g) ?? []).length, 1);
	}
});

test("rejects invalid and out-of-bounds excerpts instead of silently truncating them", async (t) => {
	const { codebase, render } = await fixture(t);
	await writeFile(join(codebase, "example.txt"), "ONE\nTWO\n");
	for (const range of ["#L0-L1", "#L2-L1", "#L1-2"]) {
		await assert.rejects(render(`\`\`\`text {example.txt${range}}\n\`\`\``), /Line ranges/);
	}
	await assert.rejects(render("```text {example.txt#L1-L3}\n```"), /exceeds the file's 2 lines/);
	await assert.rejects(render("```text {example.txt#L3-L3}\n```"), /exceeds the file's 2 lines/);
	await writeFile(join(codebase, "example.txt"), "");
	await assert.rejects(render("```text {example.txt#L1-L1}\n```"), /exceeds the file's 0 lines/);
});

test("inserts duplicate line numbers above source lines without replacing them", async (t) => {
	const { codebase, render } = await fixture(t);
	const source = "ONE\nTWO\nTHREE\n";
	await writeFile(join(codebase, "example.txt"), source);
	const html = await render("```text {example.txt}\n#L2 - OLD\n#L2 + NEW\n```");
	assert.deepEqual(renderedLines(html), [
		{ number: 1, diff: null, content: "ONE" },
		{ number: 2, diff: "-", content: "OLD" },
		{ number: 2, diff: "+", content: "NEW" },
		{ number: 2, diff: null, content: "TWO" },
		{ number: 3, diff: null, content: "THREE" },
	]);
	assert.doesNotMatch(html, /#L2|data-course-code-lines/);
	assert.equal(await readFile(join(codebase, "example.txt"), "utf8"), source);
	assert.match(html, /data-codebase-file="example.txt"/);
});

test("numbers implicit lines from one and continues after explicit line numbers", async (t) => {
	const { codebase, render } = await fixture(t);
	await writeFile(join(codebase, "example.txt"), "SOURCE_ONE\nSOURCE_TWO\n");
	const html = await render("```text {example.txt}\nFIRST\n+ SECOND\n#L5 - REMOVED\nAFTER_RESET\n```");
	assert.deepEqual(renderedLines(html), [
		{ number: 1, diff: null, content: "FIRST" },
		{ number: 1, diff: null, content: "SOURCE_ONE" },
		{ number: 2, diff: "+", content: "SECOND" },
		{ number: 2, diff: null, content: "SOURCE_TWO" },
		{ number: 5, diff: "-", content: "REMOVED" },
		{ number: 6, diff: null, content: "AFTER_RESET" },
	]);
});

test("combines excerpts with inserted lines before, within and after the selected range", async (t) => {
	const { codebase, render } = await fixture(t);
	await writeFile(join(codebase, "example.txt"), "ONE\nTWO\nTHREE\nFOUR\nFIVE\n");
	const html = await render("```text {example.txt#L3-L4}\n#L1 + BEFORE\n#L3 - OLD_THREE\n#L4 FOUR_EXTRA\n#L8 + AFTER\n```");
	assert.deepEqual(renderedLines(html), [
		{ number: 1, diff: "+", content: "BEFORE" },
		{ number: 3, diff: "-", content: "OLD_THREE" },
		{ number: 3, diff: null, content: "THREE" },
		{ number: 4, diff: null, content: "FOUR_EXTRA" },
		{ number: 4, diff: null, content: "FOUR" },
		{ number: 8, diff: "+", content: "AFTER" },
	]);
});

test("preserves inserted indentation, blank lines and escaped HTML while highlighting", async (t) => {
	const { codebase, render } = await fixture(t);
	await writeFile(join(codebase, "example.txt"), "");
	const html = await render("```text {example.txt}\n#L4 +   <script>alert(1)</script>\n\n- removed\n  plain indentation\n```");
	assert.deepEqual(renderedLines(html), [
		{ number: 4, diff: "+", content: "  <script>alert(1)</script>" },
		{ number: 5, diff: null, content: "" },
		{ number: 6, diff: "-", content: "removed" },
		{ number: 7, diff: null, content: "  plain indentation" },
	]);
	assert.doesNotMatch(html, /<script>/);
	await writeFile(join(codebase, "main.go"), "package main\n");
	const go = await render("```go {main.go}\n#L3 + var added = true\n```");
	assert.match(go, /data-diff="\+"><span style="color:/);
});

test("rejects invalid inserted line numbers with an external block error", async (t) => {
	const { codebase, render } = await fixture(t);
	await writeFile(join(codebase, "example.txt"), "SOURCE");
	for (const line of ["#L0 + invalid", "#L-1 invalid", "#L1.5 invalid", "#L9007199254740992 invalid"]) {
		await assert.rejects(render(`\`\`\`text {example.txt}\n${line}\n\`\`\``), /Cannot load external code block.*Inserted line numbers/);
	}
});
