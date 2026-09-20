import { ALLOWED_MIME_TYPES, MAX_IMAGE_EVIDENCE_PER_BOSS, UPLOAD_LIMITS } from "@askboss/shared";

const MIME_BY_EXTENSION: Record<string, (typeof ALLOWED_MIME_TYPES)[number]> = {
  txt: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export interface PreparedEvidenceFile {
  file: File;
  contentType: (typeof ALLOWED_MIME_TYPES)[number];
}

export const IMAGE_UPLOAD_CONCURRENCY = 2;
let imageSelectionSequence = 0;

export type EvidenceUploadStatus = "VALIDATING" | "UPLOADING" | "REGISTERING" | "ANALYZING" | "SUCCEEDED" | "FAILED";

export interface EvidenceUploadProgress {
  id: string;
  name: string;
  status: EvidenceUploadStatus;
  error: string | null;
  evidenceId?: string;
  jobId?: string;
}

export interface PreparedEvidenceImage {
  id: string;
  source: File;
  prepared: PreparedEvidenceFile | null;
  error: string | null;
}

export function prepareEvidenceFile(file: File): PreparedEvidenceFile {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const browserType = file.type.trim().toLowerCase() === "image/jpg" ? "image/jpeg" : file.type.trim().toLowerCase();
  const contentType = browserType
    ? (ALLOWED_MIME_TYPES as readonly string[]).includes(browserType) ? browserType as PreparedEvidenceFile["contentType"] : undefined
    : MIME_BY_EXTENSION[extension];
  if (!contentType) throw new Error("PNG, JPG, JPEG, WebP 이미지 또는 TXT 파일만 업로드할 수 있습니다.");
  if (file.size <= 0) throw new Error("빈 파일은 업로드할 수 없습니다.");
  const limit = contentType === "text/plain" ? UPLOAD_LIMITS.text : UPLOAD_LIMITS.image;
  if (file.size > limit) throw new Error(contentType === "text/plain" ? "TXT 파일은 2MB 이하만 업로드할 수 있습니다." : "이미지는 8MB 이하만 업로드할 수 있습니다.");
  const normalized = file.type === contentType ? file : new File([file], file.name, { type: contentType, lastModified: file.lastModified });
  return { file: normalized, contentType };
}

export function prepareEvidenceImageBatch(files: readonly File[], availableSlots = MAX_IMAGE_EVIDENCE_PER_BOSS): PreparedEvidenceImage[] {
  const selectionId = ++imageSelectionSequence;
  let accepted = 0;
  return files.map((source, index) => {
    const id = `${selectionId}:${source.name}:${source.size}:${source.lastModified}:${index}`;
    try {
      const prepared = prepareEvidenceFile(source);
      if (prepared.contentType === "text/plain") throw new Error("이미지 업로드에서는 PNG, JPG, JPEG, WebP 파일만 선택할 수 있습니다.");
      if (accepted >= Math.max(0, availableSlots)) throw new Error(`이미지는 상사별로 최대 ${MAX_IMAGE_EVIDENCE_PER_BOSS}장까지 등록할 수 있습니다.`);
      accepted += 1;
      return { id, source, prepared, error: null };
    } catch (error) {
      return { id, source, prepared: null, error: error instanceof Error ? error.message : "파일을 검증하지 못했습니다." };
    }
  });
}

export async function mapWithConcurrency<T, R>(items: readonly T[], concurrency: number, worker: (item: T, index: number) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let nextIndex = 0;
  const run = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      try {
        results[index] = { status: "fulfilled", value: await worker(items[index]!, index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, run));
  return results;
}

export async function uploadToSignedUrl(url: string, file: File, _token?: string | null) {
  const body = new FormData();
  body.append("cacheControl", "3600");
  body.append("", file);
  const response = await fetch(url, { method: "PUT", headers: { "x-upsert": "false" }, body });
  if (!response.ok) throw new Error(`파일 저장소 업로드에 실패했습니다. (HTTP ${response.status})`);
}
