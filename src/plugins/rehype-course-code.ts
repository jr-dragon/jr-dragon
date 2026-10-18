import type { RehypePlugin } from "@astrojs/markdown-remark";
import type { Element, Root } from "hast";

const rehypeCourseCode: RehypePlugin = () => (tree) => {
	function visit(node: Root | Element) {
		if (node.type === "element" && node.tagName === "figure" && typeof node.properties["data-course-code-lines"] === "string") {
			const lines = JSON.parse(node.properties["data-course-code-lines"]) as [number, "+" | "-" | null][];
			delete node.properties["data-course-code-lines"];
			const pre = node.children.find((child): child is Element => child.type === "element" && child.tagName === "pre");
			const code = pre?.children.find((child): child is Element => child.type === "element" && child.tagName === "code");
			const spans = code?.children.filter((child): child is Element => {
				if (child.type !== "element") return false;
				const classes = child.properties.className ?? child.properties.class;
				return Array.isArray(classes) ? classes.includes("line") : typeof classes === "string" && classes.split(/\s+/).includes("line");
			}) ?? [];
			for (const [index, span] of spans.entries()) {
				const line = lines[index];
				if (!line) continue;
				span.properties["data-line-number"] = line[0];
				if (line[1]) span.properties["data-diff"] = line[1];
			}
		}
		for (const child of node.children) if (child.type === "element") visit(child);
	}
	visit(tree);
};

export default rehypeCourseCode;
