import { afterEach, describe, expect, it, vi } from "vitest";
import { getClipboardImageFiles, IMAGE_UPLOAD_CONCURRENCY, mapWithConcurrency, prepareEvidenceFile, prepareEvidenceImageBatch, uploadToSignedUrl } from "./upload-client";

afterEach(() => vi.restoreAllMocks());

describe("evidence upload client", () => {
  it("normalizes supported image MIME types and file extensions", () => {
    expect(prepareEvidenceFile(new File(["image"], "capture.jpg", { type: "image/jpg" })).contentType).toBe("image/jpeg");
    expect(prepareEvidenceFile(new File(["image"], "capture.webp")).contentType).toBe("image/webp");
    expect(prepareEvidenceFile(new File(["text"], "conversation.txt")).contentType).toBe("text/plain");
  });

  it("rejects unsupported, empty, and oversized files before upload", () => {
    expect(() => prepareEvidenceFile(new File(["heic"], "photo.heic", { type: "image/heic" }))).toThrow("PNG, JPG, JPEG, WebP");
    expect(() => prepareEvidenceFile(new File(["heic"], "renamed.jpg", { type: "image/heic" }))).toThrow("PNG, JPG, JPEG, WebP");
    expect(() => prepareEvidenceFile(new File([], "empty.png", { type: "image/png" }))).toThrow("빈 파일");
    expect(() => prepareEvidenceFile(new File([new Uint8Array(8 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }))).toThrow("8MB");
  });

  it("prepares up to five images and keeps per-file validation failures", () => {
    const files = [
      new File(["1"], "one.png", { type: "image/png" }),
      new File(["2"], "two.jpg", { type: "image/jpeg" }),
      new File(["3"], "three.webp", { type: "image/webp" }),
      new File(["4"], "four.png", { type: "image/png" }),
      new File(["not-image"], "notes.txt", { type: "text/plain" }),
    ];

    const batch = prepareEvidenceImageBatch(files);

    expect(batch).toHaveLength(5);
    expect(batch.slice(0, 4).every((item) => item.prepared && !item.error)).toBe(true);
    expect(batch[4]).toMatchObject({ prepared: null, error: expect.stringContaining("이미지 업로드") });
  });

  it("accepts only the remaining image slots and marks overflow files", () => {
    const files = Array.from({ length: 6 }, (_, index) => new File([String(index)], `${index}.png`, { type: "image/png" }));
    const batch = prepareEvidenceImageBatch(files);
    expect(batch.filter((item) => item.prepared)).toHaveLength(5);
    expect(batch[5]).toMatchObject({ prepared: null, error: expect.stringContaining("최대 5장") });
  });

  it("does not spend an available slot on an invalid file", () => {
    const batch = prepareEvidenceImageBatch([
      new File(["text"], "notes.txt", { type: "text/plain" }),
      new File(["one"], "one.png", { type: "image/png" }),
      new File(["two"], "two.png", { type: "image/png" }),
    ], 1);
    expect(batch[0]).toMatchObject({ prepared: null, error: expect.stringContaining("이미지 업로드") });
    expect(batch[1]?.prepared?.file.name).toBe("one.png");
    expect(batch[2]).toMatchObject({ prepared: null, error: expect.stringContaining("최대 5장") });
  });

  it("uses unique progress ids across repeated selections of the same file", () => {
    const file = new File(["one"], "same.png", { type: "image/png", lastModified: 1 });
    expect(prepareEvidenceImageBatch([file])[0]?.id).not.toBe(prepareEvidenceImageBatch([file])[0]?.id);
  });

  it("extracts clipboard images, gives generic images useful names, and ignores text", () => {
    const generic = new File(["png"], "image.png", { type: "image/png" });
    const named = new File(["jpg"], "meeting.jpg", { type: "image/jpeg" });
    const clipboardData = {
      items: [
        { kind: "string", type: "text/plain", getAsFile: () => null },
        { kind: "file", type: "image/png", getAsFile: () => generic },
        { kind: "file", type: "image/jpeg", getAsFile: () => named },
      ],
      files: [],
    } as unknown as Pick<DataTransfer, "items" | "files">;

    const files = getClipboardImageFiles(clipboardData, new Date("2026-09-20T12:34:56.000Z"));

    expect(files).toHaveLength(2);
    expect(files[0]?.name).toMatch(/^pasted-image-20260920-123456-\d+-1\.png$/);
    expect(files[1]?.name).toBe("meeting.jpg");
    expect(getClipboardImageFiles({ items: [{ kind: "string", type: "text/plain", getAsFile: () => null }], files: [] } as any)).toEqual([]);
  });

  it("falls back to clipboard files and leaves unsupported images for per-file validation", () => {
    const gif = new File(["gif"], "image.gif", { type: "image/gif" });
    const files = getClipboardImageFiles({ items: [] as any, files: [gif] as any } as Pick<DataTransfer, "items" | "files">);
    expect(files[0]?.name).toMatch(/\.gif$/);
    expect(prepareEvidenceImageBatch(files)[0]).toMatchObject({ prepared: null, error: expect.stringContaining("PNG, JPG, JPEG, WebP") });
  });

  it("runs batch work with no more than two concurrent uploads", async () => {
    let active = 0;
    let maximum = 0;
    const results = await mapWithConcurrency([1, 2, 3, 4, 5], IMAGE_UPLOAD_CONCURRENCY, async (value) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return value * 2;
    });

    expect(maximum).toBe(2);
    expect(results).toEqual([2, 4, 6, 8, 10].map((value) => ({ status: "fulfilled", value })));
  });

  it("uploads to a signed URL with PUT multipart form data", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const file = new File(["image"], "capture.png", { type: "image/png" });

    await uploadToSignedUrl("https://storage.example/upload?token=signed", file, "signed");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://storage.example/upload?token=signed");
    expect(options?.method).toBe("PUT");
    expect(options?.headers).toEqual({ "x-upsert": "false" });
    expect(options?.body).toBeInstanceOf(FormData);
    const body = options?.body as FormData;
    expect(body.get("cacheControl")).toBe("3600");
    expect(body.get("")).toBeInstanceOf(File);
  });

  it("surfaces storage upload failures with the HTTP status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("failed", { status: 403 }));
    await expect(uploadToSignedUrl("https://storage.example/upload", new File(["image"], "capture.png", { type: "image/png" }))).rejects.toThrow("HTTP 403");
  });
});
