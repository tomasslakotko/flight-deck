/** Safari lacks ReadableStream async iteration; pdf.js getTextContent uses for-await. */
function ensurePdfPolyfills() {
  if (typeof Promise !== "undefined" && typeof Promise.withResolvers !== "function") {
    // Older Safari / WebKit
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Promise as any).withResolvers = function withResolvers() {
      let resolve: (value: unknown) => void;
      let reject: (reason?: unknown) => void;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve: resolve!, reject: reject! };
    };
  }

  if (
    typeof ReadableStream !== "undefined" &&
    !(ReadableStream.prototype as unknown as { [Symbol.asyncIterator]?: unknown })[
      Symbol.asyncIterator
    ]
  ) {
    Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, {
      configurable: true,
      writable: true,
      value: async function* readableStreamAsyncIterator(this: ReadableStream) {
        const reader = this.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) return;
            yield value;
          }
        } finally {
          reader.releaseLock();
        }
      },
    });
  }
}

async function readPageText(page: {
  getTextContent: () => Promise<{ items: Array<Record<string, unknown>> }>;
  streamTextContent: (params?: object) => ReadableStream;
}): Promise<string> {
  try {
    const content = await page.getTextContent();
    return content.items
      .map((item) => (typeof item.str === "string" ? item.str : ""))
      .join(" ");
  } catch {
    // Fallback if getTextContent still trips on stream iteration
    const reader = page.streamTextContent().getReader();
    const chunks: string[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const items = (value as { items?: Array<{ str?: string }> } | undefined)?.items;
      if (!items) continue;
      for (const item of items) {
        if (item?.str) chunks.push(item.str);
      }
    }
    return chunks.join(" ");
  }
}

export async function extractPdfText(file: File): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("PDF import only works in the browser.");
  }
  ensurePdfPolyfills();

  const pdfjs = await import("pdfjs-dist");
  // Same-origin worker — avoids CDN/CORS issues on Add-to-Home-Screen / Safari
  pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs`;

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({
    data,
    useSystemFonts: true,
  }).promise;

  try {
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i += 1) {
      const page = await doc.getPage(i);
      pages.push(await readPageText(page));
    }
    const text = pages.join("\n").replace(/[ \t]+\n/g, "\n").trim();
    if (!text) {
      throw new Error("No text found in that PDF. Try an .ics export or a text-based roster.");
    }
    return text;
  } finally {
    try {
      // pdf.js versions differ: destroy / cleanup / neither
      const anyDoc = doc as {
        destroy?: () => Promise<void> | void;
        cleanup?: () => Promise<void> | void;
      };
      if (typeof anyDoc.destroy === "function") await anyDoc.destroy();
      else if (typeof anyDoc.cleanup === "function") await anyDoc.cleanup();
    } catch {
      // ignore cleanup failures
    }
  }
}
