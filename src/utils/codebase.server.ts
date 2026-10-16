import { readFile, readdir, realpath } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { createShikiHighlighter } from "@astrojs/markdown-remark/shiki";
import type { Codebase, CodebaseNode } from "./codebase";

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

export function resolveCodebaseRoot(article: string, codebase: string) {
	return realpath(resolve(dirname(article), codebase.trim()));
}

export async function readCodebaseFile(article: string, codebase: string, filename: string) {
	const root = await resolveCodebaseRoot(article, codebase);
	const source = await realpath(resolve(root, filename));
	const path = relative(root, source);
	if (isAbsolute(filename) || path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) {
		throw new Error("Referenced files must stay inside codebase.");
	}
	return {
		path: path.split(sep).join("/"),
		content: (await readFile(source, "utf8")).replace(/\r\n?/g, "\n").replace(/\n$/, ""),
	};
}

export async function buildCodebase(article: string, codebase: string): Promise<Codebase> {
	const root = await resolveCodebaseRoot(article, codebase);
	const highlighter = await createShikiHighlighter({ theme: "github-dark" });
	const files: Codebase["files"] = Object.create(null);

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
				const buffer = await readFile(source);
				let content: string | null = null;
				if (!buffer.includes(0)) {
					try { content = new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
					catch { /* Binary files remain visible without a text preview. */ }
				}
				const language = languageForFile(id);
				files[id] = {
					path: id,
					language,
					html: content === null ? null : await highlighter.codeToHtml(content.replace(/\r\n?/g, "\n").replace(/\n$/, ""), language),
				};
				nodes.push({ id, name: entry.name });
			}
			// Do not follow symlinks while enumerating a publicly browsable codebase.
		}
		return nodes;
	}

	return { name: basename(root), tree: await visit(root), files };
}
