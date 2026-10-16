import { afterEach, beforeEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import CodebaseExplorer from "../src/components/CodebaseExplorer";
import type { Codebase } from "../src/utils/codebase";

let root: Root;
let host: HTMLDivElement;
let article: HTMLElement;
const tick = () => new Promise((resolve) => setTimeout(resolve, 50));
const codebase: Codebase = {
	name: "codebase",
	tree: [{ id: "src", name: "src", children: [{ id: "src/main.go", name: "main.go" }] }, { id: "go.mod", name: "go.mod" }],
	files: {
		"src/main.go": { path: "src/main.go", language: "go", html: '<pre class="astro-code"><code><span class="line">package main</span></code></pre>' },
		"go.mod": { path: "go.mod", language: "text", html: '<pre class="astro-code"><code><span class="line">module example</span></code></pre>' },
	},
};

async function click(element: HTMLElement) {
	await act(async () => { element.dispatchEvent(new MouseEvent("click", { bubbles: true })); await tick(); });
}
function trigger(path = "src/main.go") {
	return article.querySelector<HTMLButtonElement>(`[data-codebase-file="${path}"]`)!;
}
function row(label: string) {
	return [...document.querySelectorAll<HTMLElement>('[data-slot="file-tree-item"]')].find((node) => node.textContent === label)!;
}

beforeEach(async () => {
	article = document.createElement("article");
	article.id = "course-article";
	article.innerHTML = '<button data-codebase-file="src/main.go" aria-expanded="false">./src/main.go</button><button data-codebase-file="go.mod" aria-expanded="false">./go.mod</button><figcaption>inline.go</figcaption>';
	document.body.append(article);
	host = document.createElement("div"); document.body.append(host); root = createRoot(host);
	await act(async () => { root.render(<CodebaseExplorer codebase={codebase} />); await tick(); });
});
afterEach(async () => {
	await act(async () => { root.unmount(); await tick(); });
	host.remove(); article.remove();
});

test("opens the referenced file, expands its parents, and switches preview on selection", async () => {
	expect(document.querySelector('[role="dialog"]')).toBeNull();
	await act(async () => { trigger().focus(); });
	await click(trigger());
	expect(document.querySelector('[role="dialog"]')?.id).toBe("course-codebase-dialog");
	expect(document.querySelector(".codebase-explorer__code")?.textContent).toBe("package main");
	expect(row("src").getAttribute("data-expanded")).not.toBeNull();
	expect(row("main.go").getAttribute("data-selected")).toBe("true");
	expect(trigger().getAttribute("aria-expanded")).toBe("true");
	await click(row("go.mod"));
	expect(document.querySelector(".codebase-explorer__code")?.textContent).toBe("module example");
	expect(document.querySelector(".codebase-explorer__toolbar h3")?.textContent).toBe("go.mod");
	await click(row("src"));
	expect(document.querySelector(".codebase-explorer__code")?.textContent).toBe("module example");
});

test("Escape closes the sheet and restores focus; another trigger opens its own file", async () => {
	await act(async () => { trigger().focus(); });
	await click(trigger());
	await click(row("go.mod"));
	await act(async () => {
		row("go.mod").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		await tick();
	});
	expect(document.querySelector('[role="dialog"]')).toBeNull();
	expect(trigger().getAttribute("aria-expanded")).toBe("false");
	expect(document.activeElement).toBe(trigger());
	await act(async () => { trigger("go.mod").focus(); });
	await click(trigger("go.mod"));
	expect(document.querySelector(".codebase-explorer__code")?.textContent).toBe("module example");
	await click(document.querySelector<HTMLButtonElement>('[aria-label="關閉檔案瀏覽器"]')!);
	expect(document.querySelector('[role="dialog"]')).toBeNull();
});

test("ordinary captions do not open the explorer and missing previews are explained", async () => {
	await click(article.querySelector("figcaption")!);
	expect(document.querySelector('[role="dialog"]')).toBeNull();
	await act(async () => {
		root.render(<CodebaseExplorer codebase={{ ...codebase, files: { ...codebase.files, "go.mod": { path: "go.mod", language: "text", html: null } } }} />);
		await tick();
	});
	await click(trigger("go.mod"));
	expect(document.querySelector(".codebase-explorer__empty")?.textContent).toContain("不支援文字預覽");
});
