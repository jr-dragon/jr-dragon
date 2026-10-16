import { useEffect, useRef, useState } from "react";
import { FileCode2, Folder, FolderOpen } from "lucide-react";
import type { Key, Selection } from "react-aria-components";
import { FileTree } from "./file-tree";
import { Sheet } from "./sheet";
import { fileAncestors, type Codebase, type CodebaseNode } from "../utils/codebase";
import "./codebase-explorer.css";

interface Props { codebase: Codebase; revisions?: Record<string, Codebase> }
const noRevisions: Record<string, Codebase> = {};

export default function CodebaseExplorer({ codebase, revisions = noRevisions }: Props) {
	const [isOpen, setOpen] = useState(false);
	const [revision, setRevision] = useState<string | undefined>();
	const [selectedPath, setSelectedPath] = useState<string | null>(null);
	const [expandedKeys, setExpandedKeys] = useState<Set<Key>>(new Set());
	const trigger = useRef<HTMLButtonElement | null>(null);
	const snapshot = revision ? revisions[revision] : codebase;
	const selected = selectedPath ? snapshot?.files[selectedPath] : undefined;

	useEffect(() => {
		const article = document.getElementById("course-article");
		if (!article) return;
		function openFile(event: MouseEvent) {
			const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button[data-codebase-file]") : null;
			const path = button?.dataset.codebaseFile;
			const version = button?.dataset.codebaseRevision;
			const source = version ? Object.hasOwn(revisions, version) ? revisions[version] : undefined : codebase;
			if (!button || !path || !source || !Object.hasOwn(source.files, path)) return;
			trigger.current = button;
			setRevision(version);
			setSelectedPath(path);
			setExpandedKeys(new Set(fileAncestors(path)));
			setOpen(true);
		}
		article.addEventListener("click", openFile);
		return () => article.removeEventListener("click", openFile);
	}, [codebase, revisions]);

	useEffect(() => {
		trigger.current?.setAttribute("aria-expanded", String(isOpen));
	}, [isOpen]);

	function selectFile(keys: Selection) {
		if (keys === "all") return;
		const key = [...keys][0];
		if (key !== undefined && snapshot && Object.hasOwn(snapshot.files, key)) setSelectedPath(String(key));
	}

	function renderNode(node: CodebaseNode): React.ReactNode {
		return <FileTree.Item key={node.id} id={node.id} title={node.name} textValue={node.name}
			icon={node.children ? ({ isExpanded }) => isExpanded ? <FolderOpen /> : <Folder /> : <FileCode2 />}>
			{node.children?.map(renderNode)}
		</FileTree.Item>;
	}

	return <Sheet placement="right" isOpen={isOpen} onOpenChange={setOpen} isHandleOnly
		onAnimationEnd={(open) => { if (!open) trigger.current?.focus(); }}>
		<Sheet.Backdrop variant="opaque">
			<Sheet.Content className="codebase-explorer__sheet">
				<Sheet.Dialog id="course-codebase-dialog" className="codebase-explorer__dialog">
					<Sheet.CloseTrigger aria-label="關閉檔案瀏覽器" />
					<Sheet.Header className="codebase-explorer__header">
						<Sheet.Heading>專案檔案</Sheet.Heading>
						<p className="codebase-explorer__description" title={revision}>
							{snapshot?.commitMessage || "瀏覽這個章節的程式碼"}
						</p>
					</Sheet.Header>
					<Sheet.Body className="codebase-explorer__body" data-sheet-no-drag onKeyDownCapture={(event) => {
						// Dismiss before the tree consumes Escape for its selection handling.
						if (event.key === "Escape") {
							event.preventDefault();
							event.stopPropagation();
							setOpen(false);
						}
					}}>
						<aside className="codebase-explorer__sidebar" aria-label="檔案導覽">
							<p className="codebase-explorer__root"><FolderOpen size={16} aria-hidden="true" />{snapshot?.name}</p>
							<FileTree aria-label="Codebase 檔案" selectionMode="single" selectionBehavior="replace" disallowEmptySelection
								selectedKeys={selectedPath ? [selectedPath] : []} onSelectionChange={selectFile}
								expandedKeys={expandedKeys} onExpandedChange={setExpandedKeys}
								renderEmptyState={() => "沒有檔案"}>
									{snapshot?.tree.map(renderNode)}
							</FileTree>
						</aside>
						<section className="codebase-explorer__preview" aria-label="檔案內容">
							{selected ? <>
								<div className="codebase-explorer__toolbar" aria-live="polite">
									<FileCode2 size={16} aria-hidden="true" />
									<h3>{selected.path}</h3>
								</div>
								{selected.html === null
									? <p className="codebase-explorer__empty">此檔案不支援文字預覽。</p>
									: <div key={`${revision ?? "working"}:${selected.path}`} className="codebase-explorer__code course-code" dangerouslySetInnerHTML={{ __html: selected.html }} />}
							</> : <p className="codebase-explorer__empty">選擇檔案以查看內容。</p>}
						</section>
					</Sheet.Body>
				</Sheet.Dialog>
			</Sheet.Content>
		</Sheet.Backdrop>
	</Sheet>;
}
