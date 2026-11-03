/** Hands a gzipped file to the browser to save. */
export function download(name: string, data: ArrayBuffer): void {
  const url = URL.createObjectURL(new Blob([data], { type: "application/gzip" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  // The browser has started the download by the time this runs.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
