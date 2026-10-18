import { execFile } from "node:child_process";
import { lstat, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, sep } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const ignoredDirectories = new Set([".git", ".jj", "node_modules"]);

async function git(repository: string, args: string[]) {
	const { stdout } = await execute("git", ["-C", repository, ...args], {
		encoding: "buffer",
		maxBuffer: 32 * 1024 * 1024,
		env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_NO_REPLACE_OBJECTS: "1" },
	});
	return stdout;
}

async function exists(path: string) {
	try { await lstat(path); return true; }
	catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
		throw error;
	}
}

async function withRepository<T>(root: string, read: (repository: string, prefix: string) => Promise<T>): Promise<T> {
	const bundle = `${root}.bundle`;
	// Prefer an explicit bundle over discovering an unrelated ancestor repository.
	if (await exists(join(root, ".git")) || !await exists(bundle)) {
		let repository: string;
		try {
			const topLevel = (await git(root, ["rev-parse", "--show-toplevel"])).toString().trim();
			repository = await realpath(topLevel);
		} catch {
			throw new Error("Versioned code references require a Git repository or an adjacent Git bundle.");
		}
		const prefix = relative(repository, root);
		if (prefix === ".." || prefix.startsWith(`..${sep}`) || isAbsolute(prefix)) {
			throw new Error("codebase must stay inside its Git repository.");
		}
		return read(repository, prefix.split(sep).join("/"));
	}
	const temporary = await mkdtemp(join(tmpdir(), "course-codebase-git-"));
	try {
		const repository = join(temporary, "repository.git");
		await git(temporary, ["clone", "--bare", "--quiet", "--", bundle, repository]);
		return await read(repository, "");
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
}

interface GitEntry { path: string; object: string }

async function snapshot(repository: string, hash: string | undefined, prefix: string) {
	if (hash !== undefined && !/^[0-9a-f]{4,64}$/i.test(hash)) throw new Error("Git Hash must contain 4 to 64 hexadecimal characters.");
	let revision: string;
	try {
		revision = (await git(repository, ["rev-parse", "--verify", "--end-of-options", `${hash ?? "HEAD"}^{commit}`])).toString().trim();
	} catch {
		throw new Error(`Cannot resolve Git commit "${hash ?? "HEAD"}" in codebase.`);
	}
	let treeObject = revision;
	if (prefix) {
		try {
			treeObject = (await git(repository, ["rev-parse", "--verify", "--end-of-options", `${revision}:${prefix}`])).toString().trim();
			if ((await git(repository, ["cat-file", "-t", treeObject])).toString().trim() !== "tree") {
				throw new Error("Not a directory");
			}
		} catch {
			throw new Error(`Codebase directory "${prefix}" does not exist as a directory in Git commit "${revision}".`);
		}
	}
	const tree = (await git(repository, ["ls-tree", "-r", "-z", "--full-tree", treeObject])).toString();
	const entries: GitEntry[] = [];
	for (const line of tree.split("\0")) {
		if (!line) continue;
		const tab = line.indexOf("\t");
		const [mode, type, object] = line.slice(0, tab).split(" ");
		const path = line.slice(tab + 1);
		if (type !== "blob" || !["100644", "100755"].includes(mode)) continue;
		if (path.split("/").slice(0, -1).some((part) => ignoredDirectories.has(part))) continue;
		entries.push({ path, object });
	}
	return { revision, entries };
}

export async function readGitFile(root: string, hash: string | undefined, path: string) {
	return withRepository(root, async (repository, prefix) => {
		const { revision, entries } = await snapshot(repository, hash, prefix);
		const entry = entries.find((entry) => entry.path === path);
		if (!entry) throw new Error(`File "${path}" does not exist as a regular file in Git commit "${hash ?? "HEAD"}".`);
		return { revision, content: await git(repository, ["cat-file", "blob", entry.object]) };
	});
}

export async function readGitTree(root: string, hash?: string) {
	return withRepository(root, async (repository, prefix) => {
		const { revision, entries } = await snapshot(repository, hash, prefix);
		const commitMessage = (await git(repository, ["show", "--no-patch", "--format=%s", "--no-show-signature", revision])).toString().trim();
		const files: { path: string; content: Buffer }[] = [];
		for (const entry of entries) {
			files.push({ path: entry.path, content: await git(repository, ["cat-file", "blob", entry.object]) });
		}
		return { revision, commitMessage, files };
	});
}
