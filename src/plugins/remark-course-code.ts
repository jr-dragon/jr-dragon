import type { RemarkPlugin } from "@astrojs/markdown-remark";
import type { Blockquote, Parents } from "mdast";
import { isAbsolute } from "node:path";
import { readCodebaseFile } from "../utils/codebase.server";
import { parseCodeReference } from "../utils/codebase";
import { mergeCourseCodeLines } from "../utils/course-code-lines";

const remarkCourseCode: RemarkPlugin = () => async (tree, file) => {
	if (!file.path?.replaceAll("\\", "/").includes("/src/content/course/")) return;
	const articlePath = file.path;
	const revisions = new Set<string>();

	async function wrapCodeBlocks(parent: Parents) {
		for (let index = 0; index < parent.children.length; index++) {
			const node = parent.children[index];
			if (node.type === "code" && node.meta?.trim()) {
				let filename = node.meta.trim();
				let sourcePath: string | undefined;
				let sourceRevision: string | undefined;
				let startLine = 1;
				let lineMap: string | undefined;
				let external;
				try { external = parseCodeReference(filename); }
				catch (error) { file.fail(error instanceof Error ? error.message : String(error), node); }
				if (external) {
					filename = external.filename;
					const codebase = file.data.astro?.frontmatter?.codebase;
					if (typeof codebase !== "string" || !codebase.trim()) {
						file.fail(`External code block "${filename}" requires a non-empty codebase in frontmatter.`, node);
					}
					if (!filename || isAbsolute(filename)) {
						file.fail("External code block filenames must be non-empty paths relative to codebase.", node);
					}
					try {
						const body = node.value;
						const source = await readCodebaseFile(articlePath, codebase, filename, external.revision);
						node.value = source.content;
						if (external.lineRange) {
							const { start, end } = external.lineRange;
							const lines = source.content === "" ? [] : source.content.split("\n");
							if (end > lines.length) {
								throw new Error(`Line range #L${start}-L${end} exceeds the file's ${lines.length} lines.`);
							}
							node.value = lines.slice(start - 1, end).join("\n");
							startLine = start;
						}
						if (body !== "") {
							const lines = mergeCourseCodeLines(node.value, startLine, body);
							node.value = lines.map((line) => line.content).join("\n");
							lineMap = JSON.stringify(lines.map((line) => [line.number, line.diff ?? null]));
						}
						sourcePath = source.path;
						sourceRevision = source.revision;
						if (sourceRevision) revisions.add(sourceRevision);
					} catch (error) {
						file.fail(`Cannot load external code block "${filename}" from codebase "${codebase}": ${error instanceof Error ? error.message : String(error)}`, node);
					}
					node.meta = filename;
				}
				const figure: Blockquote = {
					type: "blockquote",
					data: {
						hName: "figure",
						hProperties: {
							className: ["course-code-block"],
							...(startLine > 1 && { style: `--code-line-start: ${startLine - 1}` }),
							...(lineMap && { "data-course-code-lines": lineMap }),
						},
					},
					children: [
						{
							type: "paragraph",
							data: { hName: "figcaption" },
							children: [{
								type: "text",
								value: filename,
								...(sourcePath && { data: {
									hName: "button",
									hProperties: {
										type: "button",
										className: ["course-code-file-trigger"],
										"data-codebase-file": sourcePath,
										...(sourceRevision && { "data-codebase-revision": sourceRevision }),
										"aria-haspopup": "dialog",
										"aria-expanded": "false",
										"aria-controls": "course-codebase-dialog",
									},
								} }),
							}],
						},
						node,
					],
				};
				parent.children[index] = figure;
			} else if ("children" in node) {
				await wrapCodeBlocks(node);
			}
		}
	}

	await wrapCodeBlocks(tree);
	if (file.data.astro?.frontmatter) file.data.astro.frontmatter.codebaseRevisions = [...revisions];
};

export default remarkCourseCode;
