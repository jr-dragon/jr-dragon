import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildCodebase } from "./codebase.server";
import { fileAncestors, parseCodeReference } from "./codebase";

test("builds a sorted, nested tree and safely highlighted file previews", async (t) => {
	const directory = await mkdtemp(join(tmpdir(), "codebase-tree-"));
	t.after(() => rm(directory, { recursive: true, force: true }));
	await mkdir(join(directory, "codebase/src"), { recursive: true });
	await writeFile(join(directory, "codebase/go.mod"), "module example\n");
	await writeFile(join(directory, "codebase/src/main.go"), "package main\n\nfunc main() {}\n");
	await writeFile(join(directory, "codebase/README.md"), "<script>alert(1)</script>\n");
	await writeFile(join(directory, "codebase/image.png"), new Uint8Array([137, 80, 0, 78]));
	const result = await buildCodebase(join(directory, "en.md"), "./codebase");
	assert.equal(result.name, "codebase");
	assert.equal(result.tree[0].name, "src");
	assert.equal(result.tree[0].children?.[0].id, "src/main.go");
	assert.equal(result.files["src/main.go"].language, "go");
	assert.equal((result.files["src/main.go"].html?.match(/class="line"/g) ?? []).length, 3);
	assert.match(result.files["src/main.go"].html!, /astro-code/);
	assert.doesNotMatch(result.files["README.md"].html!, /<script>/);
	assert.equal(result.files["image.png"].html, null);
	assert.doesNotMatch(JSON.stringify(result), new RegExp(directory));
});

test("does not publish control directories or follow symlinks", async (t) => {
	const directory = await mkdtemp(join(tmpdir(), "codebase-boundary-"));
	t.after(() => rm(directory, { recursive: true, force: true }));
	for (const name of [".git", ".jj", "node_modules"]) {
		await mkdir(join(directory, "codebase", name), { recursive: true });
		await writeFile(join(directory, "codebase", name, "internal.txt"), "INTERNAL_FILE");
	}
	await writeFile(join(directory, "outside.txt"), "OUTSIDE_FILE");
	await symlink(join(directory, "outside.txt"), join(directory, "codebase/linked.txt"));
	await symlink(join(directory, "codebase"), join(directory, "codebase/cycle"));
	const result = await buildCodebase(join(directory, "en.md"), "./codebase");
	assert.deepEqual(result.tree, []);
	assert.deepEqual(Object.keys(result.files), []);
});

test("expands only the selected file's parent directories", () => {
	assert.deepEqual(fileAncestors("src/server/main.go"), ["src", "src/server"]);
	assert.deepEqual(fileAncestors("main.go"), []);
});

test("line ranges work with local and revision-pinned references", () => {
	assert.deepEqual(parseCodeReference("{./nested/main file.go#L7-L14}"), {
		filename: "./nested/main file.go", revision: undefined, lineRange: { start: 7, end: 14 },
	});
	assert.deepEqual(parseCodeReference("{./main.go#L3-L3}(ABC1234)"), {
		filename: "./main.go", revision: "abc1234", lineRange: { start: 3, end: 3 },
	});
	assert.deepEqual(parseCodeReference("{./main.go}"), { filename: "./main.go", revision: undefined });
	assert.deepEqual(parseCodeReference("{./main.go}(ABC1234)"), { filename: "./main.go", revision: "abc1234" });
	assert.equal(parseCodeReference("./main.go#L7-L14"), undefined);
});

test("malformed, reversed, zero and unsafe line ranges are rejected", () => {
	for (const fragment of ["#L0-L3", "#L4-L3", "#L-1-L3", "#L1-L0", "#L1", "#L1-3", "#L1-L2extra", "#L1.5-L3", "#L1-L9007199254740992"]) {
		assert.throws(() => parseCodeReference(`{main.go${fragment}}`), /Line ranges/);
	}
	assert.throws(() => parseCodeReference("{main.go#L1-L3}(main)"), /Git Hash/);
});
