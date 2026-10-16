export interface CodebaseNode {
	id: string;
	name: string;
	children?: CodebaseNode[];
}

export interface CodebaseFile {
	path: string;
	language: string;
	html: string | null;
}

export interface Codebase {
	name: string;
	tree: CodebaseNode[];
	files: Record<string, CodebaseFile>;
}

export function fileAncestors(path: string): string[] {
	const segments = path.split("/");
	return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join("/"));
}
