import { toast } from "@heroui/react";

const promptPrefix = /^(?:\$[ \t]+|\([^()\r\n]+\)[ \t]*>[ \t]*)/;

function highlightCommand(line: HTMLElement, prefix: string, command: string) {
	const document = line.ownerDocument;
	function span(className: string, text: string) {
		const node = document.createElement("span");
		node.className = className;
		node.textContent = text;
		return node;
	}

	const namedPrompt = /^(\()([^()]+)(\)[ \t]*>[ \t]*)$/.exec(prefix);
	const prompt = namedPrompt
		? [span("shell-prompt", namedPrompt[1]), span("shell-prompt-name", namedPrompt[2]), span("shell-prompt", namedPrompt[3])]
		: [span("shell-prompt", prefix)];
	const content = span("shell-command", "");
	let start = 0;
	let index = 0;
	while (index < command.length) {
		const quote = command[index];
		if (quote === "\\") { index += 2; continue; }
		if (quote !== "'" && quote !== '"') { index++; continue; }
		let end = index + 1;
		while (end < command.length) {
			if (quote === '"' && command[end] === "\\") { end += 2; continue; }
			if (command[end] === quote) break;
			end++;
		}
		if (end >= command.length) break;
		content.append(document.createTextNode(command.slice(start, index)), span("shell-string", command.slice(index, end + 1)));
		start = index = end + 1;
	}
	content.append(document.createTextNode(command.slice(start)));
	line.replaceChildren(...prompt, content);
}

export function initializeShellCommandCopy(root: ParentNode = document) {
	for (const line of root.querySelectorAll<HTMLElement>(
		'pre[data-language="shell"] > code > .line, pre[data-language="sh"] > code > .line',
	)) {
		if (line.classList.contains("shell-copy-line")) continue;
		const source = line.textContent ?? "";
		if (!promptPrefix.test(source)) continue;
		const command = source.replace(promptPrefix, "");
		if (!command.trim()) continue;
		highlightCommand(line, source.slice(0, source.length - command.length), command);

		line.closest("pre")?.classList.add("shell-copy-code");
		line.classList.add("shell-copy-line");
		line.setAttribute("role", "button");
		line.tabIndex = 0;
		line.title = "點擊複製指令";
		line.setAttribute("aria-label", `複製指令：${command}`);

		async function copy() {
			// Keep selecting code with the pointer from overwriting the clipboard.
			if (window.getSelection()?.toString()) return;
			try {
				await navigator.clipboard.writeText(command);
				toast.success("已複製指令", { timeout: 2500 });
			} catch {
				toast.danger("無法複製指令", { description: "請手動選取指令後複製。" });
			}
		}

		line.addEventListener("click", () => { void copy(); });
		line.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" && event.key !== " ") return;
			event.preventDefault();
			if (!event.repeat) void copy();
		});
	}

	for (const line of root.querySelectorAll<HTMLElement>(
		".shell-copy-code > code > .line:not(.shell-copy-line)",
	)) {
		line.classList.add("shell-output-line");
	}
}
