import { useState, type ReactNode } from "react";
import { Button, Input, Label, TextField } from "@heroui/react";
import { Collection } from "react-aria-components/Collection";
import { useTreeData } from "react-aria-components/useTreeData";
import { ChevronRight, File, Folder, FolderOpen } from "lucide-react";
import { Sheet, type SheetProps } from "./sheet";
import { FileTree, useFileTree, useFileTreeDrag } from "./file-tree";

function SheetExample({ label, children, ...props }: Omit<SheetProps, "children"> & { label: string; children?: ReactNode }) {
	return <Sheet {...props}>
		<Sheet.Trigger><Button variant="secondary">{label}</Button></Sheet.Trigger>
		<Sheet.Backdrop><Sheet.Content className={!props.placement || props.placement === "top" || props.placement === "bottom" ? "mx-auto max-w-[420px]" : undefined}><Sheet.Dialog>
			<Sheet.Handle /><Sheet.CloseTrigger />
			<Sheet.Header><Sheet.Heading>{label}</Sheet.Heading></Sheet.Header>
			<Sheet.Body>{children ?? <p className="text-sm text-muted">Drag the handle, press Escape, or click outside to dismiss.</p>}</Sheet.Body>
			<Sheet.Footer><Sheet.Close><Button>Done</Button></Sheet.Close></Sheet.Footer>
		</Sheet.Dialog></Sheet.Content></Sheet.Backdrop>
	</Sheet>;
}
interface Node { id: string; name: string; children?: Node[] }
const files: Node[] = [
	{ id: "src", name: "src", children: [
		{ id: "components", name: "components", children: [{ id: "sheet", name: "Sheet.tsx" }, { id: "tree", name: "FileTree.tsx" }] },
		{ id: "pages", name: "pages", children: [{ id: "index", name: "index.astro" }] },
		{ id: "styles", name: "styles", children: [] },
	] },
	{ id: "package", name: "package.json" },
	{ id: "readme", name: "README.md" },
];
const fileIcon = ({ isExpanded, hasChildItems }: { isExpanded: boolean; hasChildItems: boolean }) => hasChildItems ? (isExpanded ? <FolderOpen /> : <Folder />) : <File />;
function StaticTree({ size = "md", showGuideLines = true, reduceMotion = false }: { size?: "sm" | "md" | "lg"; showGuideLines?: boolean | "hover"; reduceMotion?: boolean }) {
	return <FileTree aria-label={`Project files ${size} ${showGuideLines}`} size={size} showGuideLines={showGuideLines} reduceMotion={reduceMotion} defaultExpandedKeys={["src", "components"]} selectionMode="multiple">
		<FileTree.Section><FileTree.Header>Project</FileTree.Header>
			<FileTree.Item id="src" title="src" icon={fileIcon}>
				<FileTree.Indicator><ChevronRight size={14} /></FileTree.Indicator>
				<FileTree.Item id="components" title="components" icon={fileIcon}>
					<FileTree.Item id="sheet" title="Sheet.tsx" icon={<File />} />
					<FileTree.Item id="tree" title="FileTree.tsx" icon={<File />} />
				</FileTree.Item>
				<FileTree.Item id="index" title="index.astro" icon={<File />} />
			</FileTree.Item>
			<FileTree.Item id="package" title="package.json" icon={<File />} />
			<FileTree.Item id="disabled" title="disabled.txt" isDisabled icon={<File />} />
		</FileTree.Section>
	</FileTree>;
}
function DraggableTree() {
	const tree = useTreeData({ initialItems: files, getKey: (item) => item.id, getChildren: (item) => item.children ?? [] });
	const { expandableKeys } = useFileTree({ items: files });
	const [message, setMessage] = useState("Select files, then use the grip to move them. Keyboard: Enter on the grip, arrows, Enter to drop.");
	const { dragAndDropHooks } = useFileTreeDrag({ tree, onMove: (keys, target) => setMessage(`Moved ${keys.size} item(s) ${target.dropPosition} ${target.key}.`) });
	type ManagedNode = (typeof tree.items)[number];
	function renderItem(item: ManagedNode): ReactNode {
		return <FileTree.Item id={item.key} textValue={item.value.name} title={item.value.name} icon={fileIcon} hasChildItems={Boolean(item.value.children)}>
			<Collection items={item.children ?? []}>{renderItem}</Collection>
		</FileTree.Item>;
	}
	return <><FileTree aria-label="Draggable files" items={tree.items} defaultExpandedKeys={expandableKeys} selectionMode="multiple" dragAndDropHooks={dragAndDropHooks}>{renderItem}</FileTree><p role="status" className="mt-4 text-xs text-muted">{message}</p></>;
}
export default function ComponentExamples() {
	const [open, setOpen] = useState(false);
	return <div className="space-y-12">
		<section aria-labelledby="sheet-examples" className="space-y-5">
			<h2 id="sheet-examples" className="text-2xl font-semibold">Sheet</h2>
			<div className="flex flex-wrap gap-3">
				<SheetExample label="Open Sheet" />
				{(["top", "bottom", "left", "right"] as const).map((placement) => <SheetExample key={placement} label={`Open ${placement}`} placement={placement} />)}
				<SheetExample label="Detached" isDetached />
				<SheetExample label="Handle only" isHandleOnly />
				<SheetExample label="Non dismissable" isDismissable={false} />
				<SheetExample label="Non modal" isModal={false} />
				<SheetExample label="Scale background" shouldScaleBackground />
				<SheetExample label="Snap points" snapPoints={[.25, .5, .9]} />
				<SheetExample label="Custom fade" snapPoints={["200px", "50%", .9]} fadeFromIndex={1} />
				<SheetExample label="Nested sheet"><Sheet.NestedRoot><Sheet.Trigger><Button variant="secondary">Open nested sheet</Button></Sheet.Trigger><Sheet.Backdrop><Sheet.Content><Sheet.Dialog><Sheet.Handle /><Sheet.Header><Sheet.Heading>Nested sheet</Sheet.Heading></Sheet.Header><Sheet.Body>Parent remains open and scales behind this sheet.</Sheet.Body><Sheet.Footer><Sheet.Close><Button>Close nested</Button></Sheet.Close></Sheet.Footer></Sheet.Dialog></Sheet.Content></Sheet.Backdrop></Sheet.NestedRoot></SheetExample>
				<SheetExample label="Scrollable content">{Array.from({ length: 30 }, (_, i) => <p key={i} className="py-3">Scrollable paragraph {i + 1}</p>)}</SheetExample>
				<SheetExample label="Edit profile" shouldAutoFocus><TextField><Label>Name</Label><Input defaultValue="J.Dragon" /></TextField></SheetExample>
				{(["opaque", "blur", "transparent"] as const).map((variant) => <Sheet key={variant}><Sheet.Trigger><Button variant="secondary">{variant} backdrop</Button></Sheet.Trigger><Sheet.Backdrop variant={variant}><Sheet.Content><Sheet.Dialog><Sheet.Handle /><Sheet.Header><Sheet.Heading>{variant} backdrop</Sheet.Heading></Sheet.Header><Sheet.Footer><Sheet.Close><Button>Done</Button></Sheet.Close></Sheet.Footer></Sheet.Dialog></Sheet.Content></Sheet.Backdrop></Sheet>)}
				<SheetExample label="Controlled" isOpen={open} onOpenChange={setOpen} />
			</div>
		</section>
		<section aria-labelledby="tree-examples" className="space-y-5">
			<h2 id="tree-examples" className="text-2xl font-semibold">File Tree</h2>
			<div className="grid gap-6 md:grid-cols-3">{(["sm", "md", "lg"] as const).map((size) => <div key={size} className="rounded-2xl border border-border p-4"><h3 className="mb-4 text-sm text-muted">Size: {size}</h3><StaticTree size={size} /></div>)}</div>
			<div className="grid gap-6 md:grid-cols-3"><div className="rounded-2xl border border-border p-4"><h3 className="mb-4 text-sm text-muted">Hover guides</h3><StaticTree showGuideLines="hover" /></div><div className="rounded-2xl border border-border p-4"><h3 className="mb-4 text-sm text-muted">No guides / reduced motion</h3><StaticTree showGuideLines={false} reduceMotion /></div><div className="rounded-2xl border border-border p-4"><h3 className="mb-4 text-sm text-muted">Dynamic collection / drag and drop</h3><DraggableTree /></div></div>
		</section>
	</div>;
}
