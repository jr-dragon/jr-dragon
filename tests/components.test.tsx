/// <reference types="bun" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Button } from "@heroui/react";
import { Collection } from "react-aria-components/Collection";
import { useTreeData, type TreeData } from "react-aria-components/useTreeData";
import { Sheet, type SheetProps } from "../src/components/sheet";
import { FileTree, useFileTreeDrag } from "../src/components/file-tree";
import { collectTree } from "../src/components/file-tree/use-file-tree";
import { moveTreeItems } from "../src/components/file-tree/use-file-tree-drag";
import { backdropOpacity, closestSnap, snapOffsets, snapPointPixels } from "../src/components/sheet/sheet-gesture";

let root: Root;
let host: HTMLDivElement;
const tick = () => new Promise((resolve) => setTimeout(resolve, 50));
async function render(node: React.ReactNode) { await act(async () => { root.render(node); await tick(); }); }
async function click(element: Element) { await act(async () => { element.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); await act(async () => { await tick(); }); }
function button(text: string) { const result = [...document.querySelectorAll("button")].find((node) => node.textContent === text); if (!result) throw new Error(`Missing button: ${text}`); return result; }
beforeEach(() => {
	host = document.createElement("div"); document.body.append(host); root = createRoot(host);
	Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get() { return this.hasAttribute("data-sheet-drawer") ? 400 : 30; } });
	Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get() { return 384; } });
});
afterEach(async () => { await act(async () => { root.unmount(); await tick(); }); host.remove(); });

function Example(props: Omit<SheetProps, "children">) {
	return <Sheet {...props}><Sheet.Trigger><Button>Open</Button></Sheet.Trigger><Sheet.Backdrop><Sheet.Content><Sheet.Dialog><Sheet.Handle /><Sheet.CloseTrigger /><Sheet.Header><Sheet.Heading>Title</Sheet.Heading></Sheet.Header><Sheet.Body><input aria-label="Name" /></Sheet.Body><Sheet.Footer><Sheet.Close><Button>Done</Button></Sheet.Close></Sheet.Footer></Sheet.Dialog></Sheet.Content></Sheet.Backdrop></Sheet>;
}
describe("Sheet", () => {
	test("opens, labels the dialog, closes and restores focus", async () => {
		let closed = 0;
		await render(<Example onClose={() => closed++} />);
		await act(async () => { button("Open").focus(); }); await click(button("Open"));
		const dialog = document.querySelector('[role="dialog"]')!;
		expect(dialog.getAttribute("aria-modal")).toBe("true");
		expect(document.getElementById(dialog.getAttribute("aria-labelledby")!)?.textContent).toBe("Title");
		await click(button("Done"));
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		expect(closed).toBe(1);
		expect(document.activeElement === button("Open")).toBe(true);
	});
	test("supports controlled state and preserves child onPress", async () => {
		let presses = 0;
		function Controlled() { const [open, setOpen] = useState(false); return <Sheet isOpen={open} onOpenChange={setOpen}><Sheet.Trigger><Button onPress={() => presses++}>Open</Button></Sheet.Trigger><Sheet.Backdrop><Sheet.Content><Sheet.Dialog aria-label="Controlled"><Sheet.Close><Button>Done</Button></Sheet.Close></Sheet.Dialog></Sheet.Content></Sheet.Backdrop></Sheet>; }
		await render(<Controlled />); await click(button("Open"));
		expect(presses).toBe(1); expect(document.querySelector('[aria-label="Controlled"]')).not.toBeNull();
		await click(button("Done")); expect(document.querySelector('[role="dialog"]')).toBeNull();
	});
	test.each(["top", "bottom", "left", "right"] as const)("renders %s placement and detached attributes", async (placement) => {
		await render(<Example defaultOpen placement={placement} isDetached />);
		expect(document.querySelector(`.sheet__content--${placement}[data-sheet-detached]`)).not.toBeNull();
	});
	test("non-dismissable ignores Escape but keeps explicit close working", async () => {
		await render(<Example defaultOpen isDismissable={false} />);
		await act(async () => { document.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await tick(); });
		expect(document.querySelector('[role="dialog"]')).not.toBeNull();
		await click(button("Done")); expect(document.querySelector('[role="dialog"]')).toBeNull();
	});
	test("handle cycles controlled snap points and preventCycle stops cycling", async () => {
		const changes: unknown[] = [];
		function Snaps() { const [snap, setSnap] = useState<number | string | null>(.25); return <Sheet defaultOpen snapPoints={[.25, .5, .9]} activeSnapPoint={snap} onActiveSnapPointChange={(value) => { changes.push(value); setSnap(value); }}><Sheet.Backdrop><Sheet.Content><Sheet.Dialog aria-label="Snaps"><Sheet.Handle /><Sheet.Handle preventCycle aria-label="Fixed handle" /></Sheet.Dialog></Sheet.Content></Sheet.Backdrop></Sheet>; }
		await render(<Snaps />);
		await click(document.querySelector('[aria-label="Fixed handle"]')!); expect(changes).toEqual([]);
		await click(document.querySelector('[aria-label="Drag sheet"]')!); expect(changes).toEqual([.5]);
	});
	test("nested roots retain the parent and restore its scale after closing", async () => {
		await render(<Sheet defaultOpen><Sheet.Backdrop><Sheet.Content><Sheet.Dialog aria-label="Parent"><Sheet.NestedRoot><Sheet.Trigger><Button>Nested</Button></Sheet.Trigger><Sheet.Backdrop><Sheet.Content><Sheet.Dialog aria-label="Child"><Sheet.Close><Button>Close child</Button></Sheet.Close></Sheet.Dialog></Sheet.Content></Sheet.Backdrop></Sheet.NestedRoot></Sheet.Dialog></Sheet.Content></Sheet.Backdrop></Sheet>);
		await click(button("Nested"));
		expect(document.querySelectorAll('[role="dialog"]').length).toBe(2);
		expect((document.querySelector('[data-sheet-drawer]') as HTMLElement).style.getPropertyValue("--sheet-nested-scale")).toBe("0.96");
		await click(button("Close child")); expect(document.querySelectorAll('[role="dialog"]').length).toBe(1);
		expect((document.querySelector('[data-sheet-drawer]') as HTMLElement).style.getPropertyValue("--sheet-nested-scale")).toBe("1");
	});
	test("non-modal sheets leave background content accessible and unlocked", async () => {
		const animations: boolean[] = [];
		await render(<Example defaultOpen isModal={false} onAnimationEnd={(open) => animations.push(open)} />);
		expect(document.querySelector('[role="dialog"]')?.getAttribute("aria-modal")).not.toBe("true");
		expect(host.closest('[aria-hidden="true"]')).toBeNull();
		expect(document.documentElement.style.overflow).not.toBe("hidden");
		await click(button("Done"));
		await act(async () => { await new Promise((resolve) => setTimeout(resolve, 260)); });
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		expect(animations).toEqual([true, false]);
	});
	test("swipe closes, reports release, and handle-only ignores body drags", async () => {
		const releases: boolean[] = [];
		await render(<Example defaultOpen isHandleOnly onRelease={(_, open) => releases.push(open)} />);
		async function swipe(target: Element) { await act(async () => {
			target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, isPrimary: true, button: 0, clientY: 100 }));
			target.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, isPrimary: true, clientY: 280 }));
			target.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, isPrimary: true, clientY: 280 })); await tick();
		}); }
		await swipe(document.querySelector(".sheet__body")!); expect(releases).toEqual([]);
		await swipe(document.querySelector(".sheet__handle")!); expect(releases).toEqual([false]); expect(document.querySelector('[role="dialog"]')).toBeNull();
	});
});

describe("snap calculations", () => {
	test("supports ratios, pixels and percentage values", () => {
		expect([.5, 300, "50%", "300px"].map((point) => snapPointPixels(point, 800))).toEqual([400, 300, 400, 300]);
		expect(snapOffsets([.25, .5, 1], 800, 768)).toEqual([568, 368, 0]);
		expect(closestSnap(340, [568, 368, 0])).toBe(1);
		expect(backdropOpacity(184, [568, 368, 0], 2)).toBe(.5);
	});
});

describe("File Tree", () => {
	test("static nested items expand, select, and disable through RAC", async () => {
		await render(<FileTree aria-label="Files" selectionMode="multiple"><FileTree.Section><FileTree.Header>Project</FileTree.Header><FileTree.Item id="folder" title="Folder"><FileTree.Item id="file" title="file.ts" /></FileTree.Item><FileTree.Item id="locked" title="Locked" isDisabled /></FileTree.Section></FileTree>);
		expect(document.querySelector('[role="treegrid"]')).not.toBeNull();
		expect(document.querySelector('[data-level="2"]')).toBeNull();
		await click(document.querySelector('[slot="chevron"]')!);
		expect(document.querySelector('[data-level="2"]')?.textContent).toContain("file.ts");
		await click(document.querySelector('[data-level="2"]')!);
		expect(document.querySelector('[data-level="2"]')?.getAttribute("data-selected")).toBe("true");
		expect(document.querySelector('[aria-disabled="true"]')?.textContent).toContain("Locked");
	});
	test("dynamic collections, custom indicators, size and guide options render", async () => {
		const items = [{ id: "folder", name: "Folder", children: [{ id: "file", name: "file.ts", children: [] }] }];
		await render(<FileTree aria-label="Dynamic" items={items} size="sm" showGuideLines="hover" reduceMotion defaultExpandedKeys={["folder"]}>{(item) => <FileTree.Item id={item.id} title={item.name}><FileTree.Indicator>+</FileTree.Indicator><Collection items={item.children}>{(child) => <FileTree.Item id={child.id} title={child.name} />}</Collection></FileTree.Item>}</FileTree>);
		expect(document.querySelector(".file-tree--sm[data-reduce-motion]")).not.toBeNull();
		expect(document.querySelector(".file-tree__guide-line--hover")).not.toBeNull();
		expect(document.querySelector(".file-tree__indicator")?.textContent).toBe("+");
	});
	test("filtering prunes branches without mutating the source", () => {
		const items = [{ id: "root", children: [{ id: "keep" }, { id: "remove" }] }, { id: "empty", children: [{ id: "other" }] }];
		const result = collectTree({ items });
		expect(result.expandableKeys).toEqual(["root", "empty"]);
		expect(result.leaves.map((item) => item.id)).toEqual(["keep", "remove", "other"]);
		expect(result.filterTree((item) => item.id === "keep")).toEqual([{ id: "root", children: [{ id: "keep" }] }]);
		expect(items[0].children.length).toBe(2);
	});
	test("moves whole subtrees, rejects cycles, and keeps multi-selection order", async () => {
		interface Node { id: string; children?: Node[] }
		let tree: TreeData<Node>;
		function Harness() { tree = useTreeData<Node>({ initialItems: [{ id: "a", children: [{ id: "child" }] }, { id: "b", children: [] }, { id: "c" }], getKey: (item) => item.id, getChildren: (item) => item.children ?? [] }); useFileTreeDrag({ tree }); return null; }
		await render(<Harness />);
		expect(moveTreeItems(tree!, new Set(["a"]), { type: "item", key: "child", dropPosition: "on" })).toBe(false);
		await act(async () => { expect(moveTreeItems(tree!, new Set(["a", "child"]), { type: "item", key: "b", dropPosition: "on" })).toBe(true); });
		expect(tree!.getItem("a")?.parentKey).toBe("b"); expect(tree!.getItem("child")?.parentKey).toBe("a");
		expect(moveTreeItems(tree!, new Set(["c"]), { type: "item", key: "child", dropPosition: "on" })).toBe(false);
		await act(async () => { moveTreeItems(tree!, new Set(["a", "c"]), { type: "item", key: "b", dropPosition: "before" }); });
		expect(tree!.items.map((item) => item.key)).toEqual(["a", "c", "b"]);
		await act(async () => { moveTreeItems(tree!, new Set(["a", "c"]), { type: "item", key: "b", dropPosition: "on" }); });
		expect(tree!.getItem("b")?.children?.map((item) => item.key)).toEqual(["a", "c"]);
	});
});
