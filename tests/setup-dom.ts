import { Window } from "happy-dom";

const testWindow = new Window({ url: "http://localhost:4321" });
testWindow.happyDOM.setViewport({ width: 1024, height: 768 });
for (const name of Object.getOwnPropertyNames(testWindow)) {
	if (name in globalThis) continue;
	Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: (testWindow as unknown as Record<string, unknown>)[name] });
}
Object.assign(globalThis, {
	window: testWindow,
	document: testWindow.document,
	navigator: testWindow.navigator,
	Event: testWindow.Event,
	EventTarget: testWindow.EventTarget,
	CustomEvent: testWindow.CustomEvent,
	getComputedStyle: testWindow.getComputedStyle.bind(testWindow),
	requestAnimationFrame: testWindow.requestAnimationFrame.bind(testWindow),
	cancelAnimationFrame: testWindow.cancelAnimationFrame.bind(testWindow),
	IS_REACT_ACT_ENVIRONMENT: true,
});
