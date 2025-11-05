// This file is imported early to set up DOM globals and patch DOMPurify
// before mermaid loads and tries to use it.

import { JSDOM } from "jsdom";
import createDOMPurify from "dompurify";

// Create a minimal DOM environment
const { window } = new JSDOM("<!doctype html><html><body></body></html>");

// Set up global DOM APIs
if (typeof globalThis.window === "undefined") {
  (globalThis as unknown as { window: typeof window }).window = window;
}
if (typeof globalThis.document === "undefined") {
  (globalThis as unknown as { document: Document }).document = window.document;
}
if (typeof globalThis.Node === "undefined") {
  (globalThis as unknown as { Node: typeof Node }).Node = window.Node;
}
if (typeof globalThis.navigator === "undefined") {
  (globalThis as unknown as { navigator: typeof navigator }).navigator =
    window.navigator;
}

// Initialize DOMPurify with our window
const DOMPurify = createDOMPurify(window);

// Patch the dompurify module in node_modules so when mermaid imports it,
// it gets our initialized instance instead of the factory function
// We need to access Bun's module cache or use a different method
// For now, we'll rely on the importmap, but if that doesn't work,
// we'll need to ensure globals are set up so DOMPurify auto-initializes

// Export DOMPurify so it can be used if needed
export { DOMPurify };
