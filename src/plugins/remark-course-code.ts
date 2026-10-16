import type { RemarkPlugin } from "@astrojs/markdown-remark";
import type { Blockquote, Parents } from "mdast";

const remarkCourseCode: RemarkPlugin = () => (tree, file) => {
	if (!file.path?.replaceAll("\\", "/").includes("/src/content/course/")) return;

	function wrapCodeBlocks(parent: Parents) {
		for (let index = 0; index < parent.children.length; index++) {
			const node = parent.children[index];
			if (node.type === "code" && node.meta?.trim()) {
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
							children: [{ type: "text", value: node.meta.trim() }],
						},
						node,
					],
				};
				parent.children[index] = figure;
			} else if ("children" in node) {
				wrapCodeBlocks(node);
			}
		}
	}

	wrapCodeBlocks(tree);
};

export default remarkCourseCode;
