import { readFile, readdir, realpath } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { createShikiHighlighter } from "@astrojs/markdown-remark/shiki";
import type { Codebase, CodebaseNode } from "./codebase";
import { readGitFile, readGitTree } from "./codebase-git.server";

const ignoredDirectories = new Set([".git", ".jj", "node_modules"]);
const languages: Record<string, string> = {
	astro: "astro", bash: "bash", c: "c", cc: "cpp", cpp: "cpp", css: "css",
	csv: "csv", go: "go", graphql: "graphql", h: "c", hpp: "cpp", html: "html",
	java: "java", js: "javascript", jsx: "jsx", json: "json", jsonc: "jsonc",
	kt: "kotlin", md: "markdown", mdx: "mdx", mjs: "javascript", php: "php",
	py: "python", rb: "ruby", rs: "rust", scss: "scss", sh: "bash", sql: "sql",
	svelte: "svelte", swift: "swift", toml: "toml", ts: "typescript", tsx: "tsx",
	txt: "text", vue: "vue", xml: "xml", yaml: "yaml", yml: "yaml", zsh: "bash",
};

function languageForFile(path: string) {
	if (basename(path) === "Dockerfile") return "dockerfile";
	if (basename(path) === "Makefile") return "makefile";
	return languages[extname(path).slice(1).toLowerCase()] ?? "text";
}

export async function resolveCodebaseRoot(article: string, codebase: string) {
	const path = resolve(dirname(article), codebase.trim());
	try { return await realpath(path); }
	catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT" || !existsSync(`${path}.bundle`)) throw error;
		// A clean website checkout contains the bundle, not the nested Git worktree.
		return resolve(await realpath(dirname(path)), basename(path));
	}
}

function normalizeContent(content: string) {
	return content.replace(/\r\n?/g, "\n").replace(/\n$/, "");
}

function relativeFilePath(root: string, source: string) {
	const path = relative(root, source);
	if (path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) {
		throw new Error("Referenced files must stay inside codebase.");
	}
	return path.split(sep).join("/");
}

function decodeText(buffer: Buffer): string | null {
	if (buffer.includes(0)) return null;
	try { return new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
	catch { return null; }
}

export async function readCodebaseFile(article: string, codebase: string, filename: string, revision?: string) {
	const root = await resolveCodebaseRoot(article, codebase);
	if (isAbsolute(filename)) throw new Error("Referenced files must stay inside codebase.");
	const path = relativeFilePath(root, resolve(root, filename));
	if (revision !== undefined || !existsSync(root)) {
		const source = await readGitFile(root, revision, path);
		const text = decodeText(source.content);
		if (text === null) throw new Error(`File "${filename}" in Git commit "${revision ?? "HEAD"}" is not UTF-8 text.`);
		return { path, content: normalizeContent(text), revision: revision === undefined ? undefined : source.revision };
	}
	const source = await realpath(resolve(root, filename));
	return {
		path: relativeFilePath(root, source),
		content: normalizeContent(await readFile(source, "utf8")),
		revision: undefined,
	};
}

export async function buildCodebase(article: string, codebase: string, revision?: string): Promise<Codebase> {
	const root = await resolveCodebaseRoot(article, codebase);
	const highlighter = await createShikiHighlighter({ theme: "github-dark" });
	const files: Codebase["files"] = Object.create(null);

	async function preview(path: string, buffer: Buffer) {
		const content = decodeText(buffer);
		const language = languageForFile(path);
		files[path] = { path, language, html: content === null ? null : await highlighter.codeToHtml(normalizeContent(content), language) };
	}

	function sortTree(nodes: CodebaseNode[]) {
		nodes.sort((a, b) => Number(Boolean(b.children)) - Number(Boolean(a.children)) || a.name.localeCompare(b.name, "en"));
		for (const node of nodes) if (node.children) sortTree(node.children);
	}

	if (revision !== undefined || !existsSync(root)) {
		const snapshot = await readGitTree(root, revision);
		const tree: CodebaseNode[] = [];
		for (const file of snapshot.files) {
			let parent = tree;
			const parts = file.path.split("/");
			for (let index = 0; index < parts.length; index++) {
				const id = parts.slice(0, index + 1).join("/");
				let node = parent.find((node) => node.id === id);
				if (!node) {
					node = { id, name: parts[index], ...(index < parts.length - 1 && { children: [] }) };
					parent.push(node);
				}
				if (node.children) parent = node.children;
			}
			await preview(file.path, file.content);
		}
		sortTree(tree);
		return {
			name: basename(root),
			revision: revision === undefined ? undefined : snapshot.revision,
			commitMessage: revision === undefined ? undefined : snapshot.commitMessage,
			tree,
			files,
		};
	}

	async function visit(directory: string, prefix = ""): Promise<CodebaseNode[]> {
		const entries = await readdir(directory, { withFileTypes: true });
		entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name, "en"));
		const nodes: CodebaseNode[] = [];
		for (const entry of entries) {
			const source = resolve(directory, entry.name);
			const id = prefix ? `${prefix}/${entry.name}` : entry.name;
			if (entry.isDirectory()) {
				if (ignoredDirectories.has(entry.name)) continue;
				nodes.push({ id, name: entry.name, children: await visit(source, id) });
			} else if (entry.isFile()) {
				await preview(id, await readFile(source));
				nodes.push({ id, name: entry.name });
			}
			// Do not follow symlinks while enumerating a publicly browsable codebase.
		}
		return nodes;
	}

	return { name: basename(root), tree: await visit(root), files };
}
