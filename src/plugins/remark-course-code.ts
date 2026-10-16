import type { RemarkPlugin } from "@astrojs/markdown-remark";
import type { Blockquote, Parents } from "mdast";
import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

const remarkCourseCode: RemarkPlugin = () => async (tree, file) => {
	if (!file.path?.replaceAll("\\", "/").includes("/src/content/course/")) return;
	const articleDirectory = dirname(file.path);

	async function wrapCodeBlocks(parent: Parents) {
		for (let index = 0; index < parent.children.length; index++) {
			const node = parent.children[index];
			if (node.type === "code" && node.meta?.trim()) {
				let filename = node.meta.trim();
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
						const root = await realpath(resolve(articleDirectory, codebase.trim()));
						const source = await realpath(resolve(root, filename));
						const relativePath = relative(root, source);
						if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
							throw new Error("Referenced files must stay inside codebase.");
						}
						node.value = (await readFile(source, "utf8")).replace(/\r\n?/g, "\n").replace(/\n$/, "");
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
							children: [{ type: "text", value: filename }],
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
