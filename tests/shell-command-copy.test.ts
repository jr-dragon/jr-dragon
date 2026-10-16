import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import { toast } from "@heroui/react";
import { initializeShellCommandCopy } from "../src/utils/shell-command-copy";

const processor = await createMarkdownProcessor();
let host: HTMLDivElement;
let writeText: ReturnType<typeof spyOn>;
let successToast: ReturnType<typeof spyOn>;
let errorToast: ReturnType<typeof spyOn>;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
	host = document.createElement("div");
	document.body.append(host);
	writeText = spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
	successToast = spyOn(toast, "success").mockReturnValue("success");
	errorToast = spyOn(toast, "danger").mockReturnValue("error");
});

afterEach(() => {
	window.getSelection()?.removeAllRanges();
	writeText.mockRestore();
	successToast.mockRestore();
	errorToast.mockRestore();
	host.remove();
});

async function render(markdown: string) {
	host.innerHTML = (await processor.render(markdown)).code;
	initializeShellCommandCopy(host);
}

test("copies only prompted shell/sh lines, preserving command text and syntax highlighting", async () => {
	await render([
		"```sh", '$ echo "Hello & <world>"  ', "Hello & <world>", "(redis-cli) > PING", "PONG", "$", "```",
		"```shell", "$\tprintf '%s' \"$HOME\"", "#!/bin/sh", "echo plain", "$COMPOSER lint -- --test", "$(which composer)", "```",
		"```bash", "$ echo excluded", "```",
		"```text", "(redis-cli) > excluded", "```",
	].join("\n"));
	const lines = host.querySelectorAll<HTMLElement>(".shell-copy-line");
	expect(lines).toHaveLength(3);
	const commands = ['echo "Hello & <world>"  ', "PING", "printf '%s' \"$HOME\""];
	for (const [index, line] of [...lines].entries()) {
		expect(line.querySelector("span")).not.toBeNull();
		line.click();
		await tick();
		expect(writeText).toHaveBeenLastCalledWith(commands[index]);
		expect(line.dataset.copied).toBeUndefined();
		expect(line.title).toBe("點擊複製指令");
	}
	expect(successToast).toHaveBeenCalledTimes(3);
	expect(successToast).toHaveBeenLastCalledWith("已複製指令", { timeout: 2500 });
	expect(errorToast).not.toHaveBeenCalled();
	expect(host.querySelectorAll('[role="button"]')).toHaveLength(3);
});

test("supports Enter and Space without adding duplicate listeners", async () => {
	await render("```sh\n(redis-cli)>PING\n```");
	initializeShellCommandCopy(host);
	const line = host.querySelector<HTMLElement>(".shell-copy-line")!;
	expect(line.tabIndex).toBe(0);
	expect(line.getAttribute("aria-label")).toBe("複製指令：PING");
	for (const key of ["Enter", " "]) {
		const event = new KeyboardEvent("keydown", { key, cancelable: true });
		line.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
		await tick();
	}
	line.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", repeat: true }));
	line.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
	expect(writeText).toHaveBeenCalledTimes(2);
});

test("colors prompt symbols, shell names, commands, and quoted strings without changing copied text", async () => {
	const command = String.raw`SET "greeting" 'Hello <world> & friends' "say \"hi\"" escaped\"quote '' ""`;
	const source = `(redis-cli) > ${command}`;
	await render(`\`\`\`sh\n${source}\nPONG\n\`\`\``);
	const line = host.querySelector<HTMLElement>(".shell-copy-line")!;
	expect(line.textContent).toBe(source);
	expect([...line.querySelectorAll(".shell-prompt")].map((node) => node.textContent)).toEqual(["(", ") > "]);
	expect(line.querySelector(".shell-prompt-name")?.textContent).toBe("redis-cli");
	expect(line.querySelector(".shell-command")?.textContent).toBe(command);
	expect([...line.querySelectorAll(".shell-string")].map((node) => node.textContent)).toEqual([
		'"greeting"', "'Hello <world> & friends'", String.raw`"say \"hi\""`, "''", '""',
	]);
	expect(line.querySelector("world")).toBeNull();
	line.querySelector<HTMLElement>(".shell-string")!.click();
	await tick();
	expect(writeText).toHaveBeenCalledWith(command);
	expect(host.querySelector(".shell-output-line .shell-command")).toBeNull();
	initializeShellCommandCopy(host);
	expect(line.textContent).toBe(source);
});

test("does not overwrite the clipboard while selecting code", async () => {
	await render("```sh\n$ echo selected\n```");
	const line = host.querySelector<HTMLElement>(".shell-copy-line")!;
	const range = document.createRange();
	range.selectNodeContents(line);
	window.getSelection()?.addRange(range);
	line.click();
	await tick();
	expect(writeText).not.toHaveBeenCalled();
	expect(successToast).not.toHaveBeenCalled();
});

test("reports clipboard rejection without showing success", async () => {
	await render("```shell\n$ echo test\n```");
	writeText.mockRejectedValue(new Error("Permission denied"));
	const line = host.querySelector<HTMLElement>(".shell-copy-line")!;
	line.click();
	await tick();
	expect(line.dataset.copied).toBeUndefined();
	expect(successToast).not.toHaveBeenCalled();
	expect(errorToast).toHaveBeenCalledWith("無法複製指令", { description: "請手動選取指令後複製。" });
});
