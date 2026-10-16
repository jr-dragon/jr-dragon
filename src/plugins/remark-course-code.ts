import type { RemarkPlugin } from "@astrojs/markdown-remark";
import type { Blockquote, Parents } from "mdast";
import { isAbsolute } from "node:path";
import { readCodebaseFile } from "../utils/codebase.server";

const remarkCourseCode: RemarkPlugin = () => async (tree, file) => {
	if (!file.path?.replaceAll("\\", "/").includes("/src/content/course/")) return;
	const articlePath = file.path;

	async function wrapCodeBlocks(parent: Parents) {
		for (let index = 0; index < parent.children.length; index++) {
			const node = parent.children[index];
			if (node.type === "code" && node.meta?.trim()) {
				let filename = node.meta.trim();
				let sourcePath: string | undefined;
				const external = /^\{(.*)\}$/.exec(filename);
				if (external) {
					filename = external[1].trim();
					const codebase = file.data.astro?.frontmatter?.codebase;
					if (typeof codebase !== "string" || !codebase.trim()) {
						file.fail(`External code block "${filename}" requires a non-empty codebase in frontmatter.`, node);
					}
					if (!filename || isAbsolute(filename)) {
						file.fail("External code block filenames must be non-empty paths relative to codebase.", node);
					}
					try {
						const source = await readCodebaseFile(articlePath, codebase, filename);
						node.value = source.content;
						sourcePath = source.path;
					} catch (error) {
						file.fail(`Cannot load external code block "${filename}" from codebase "${codebase}": ${error instanceof Error ? error.message : String(error)}`, node);
					}
					node.meta = filename;
				}
				const figure: Blockquote = {
					type: "blockquote",
					data: {
						hName: "figure",
						hProperties: { className: ["course-code-block"] },
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
};

export default remarkCourseCode;
