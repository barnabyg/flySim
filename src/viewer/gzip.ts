/** Gzips text, as every export is. */
export async function gzip(text: string): Promise<ArrayBuffer> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

/** Reads a file as text, unzipping it first if it is gzipped. */
export async function readMaybeGzipped(file: Blob): Promise<string> {
  const start = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  const gzipped = start[0] === 0x1f && start[1] === 0x8b;
  if (!gzipped) return file.text();
  return new Response(file.stream().pipeThrough(new DecompressionStream("gzip"))).text();
}
