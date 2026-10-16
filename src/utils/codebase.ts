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
	revision?: string;
	commitMessage?: string;
	tree: CodebaseNode[];
	files: Record<string, CodebaseFile>;
}

export function parseCodeReference(meta: string): { filename: string; revision?: string } | undefined {
	if (!meta.startsWith("{")) return;
	const match = /^\{([^}]*)\}(?:\(([^()]*)\))?$/.exec(meta);
	if (!match) throw new Error('External references must use "{filename}" or "{filename}(Git Hash)".');
	const revision = match[2];
	if (revision !== undefined && !/^[0-9a-f]{4,64}$/i.test(revision)) {
		throw new Error("Git Hash must contain 4 to 64 hexadecimal characters.");
	}
	return { filename: match[1].trim(), revision: revision?.toLowerCase() };
}

export function fileAncestors(path: string): string[] {
	const segments = path.split("/");
	return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join("/"));
}
