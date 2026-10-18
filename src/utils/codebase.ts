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

export interface CodeLineRange {
	start: number;
	end: number;
}

export function parseCodeReference(meta: string): { filename: string; revision?: string; lineRange?: CodeLineRange } | undefined {
	if (!meta.startsWith("{")) return;
	const match = /^\{([^}]*)\}(?:\(([^()]*)\))?$/.exec(meta);
	if (!match) throw new Error('External references must use "{filename}" or "{filename}(Git Hash)".');
	let filename = match[1].trim();
	let lineRange: CodeLineRange | undefined;
	const fragment = filename.lastIndexOf("#L");
	if (fragment !== -1) {
		const range = /^#L(\d+)-L(\d+)$/.exec(filename.slice(fragment));
		if (!range) throw new Error("Line ranges must use #Lstart-Lend.");
		const start = Number(range[1]);
		const end = Number(range[2]);
		if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start) {
			throw new Error("Line ranges require positive safe integers with start <= end.");
		}
		filename = filename.slice(0, fragment).trim();
		lineRange = { start, end };
	}
	const revision = match[2];
	if (revision !== undefined && !/^[0-9a-f]{4,64}$/i.test(revision)) {
		throw new Error("Git Hash must contain 4 to 64 hexadecimal characters.");
	}
	return { filename, revision: revision?.toLowerCase(), ...(lineRange && { lineRange }) };
}

export function fileAncestors(path: string): string[] {
	const segments = path.split("/");
	return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join("/"));
}
