import type { MediaScope } from "@/lib/media/domain";

export const jakartaMonthLabels = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"] as const;
export const driveAssetGridStyle = { gridTemplateColumns: "repeat(auto-fill, minmax(11rem, 1fr))" };
export const driveFolderGridStyle = { gridTemplateColumns: "repeat(auto-fill, minmax(14rem, 1fr))" };
export const itemContextMenuPopupClassName = "z-50 max-h-(--available-height) w-52 overflow-x-hidden overflow-y-auto rounded-4xl bg-popover p-1.5 text-popover-foreground shadow-lg ring-1 ring-foreground/5 outline-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 dark:ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:overflow-hidden data-closed:fade-out-0 data-closed:zoom-out-95";

export const readJson = async <T,>(response: Response): Promise<T> => {
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message = typeof payload === "object"
      && payload !== null
      && "error" in payload
      && typeof payload.error === "string"
      ? payload.error
      : "Media belum dapat diproses. Coba lagi.";
    throw new Error(message);
  }

  return payload as T;
};

export const postMediaAction = async <T,>(scope: MediaScope, body: Record<string, unknown>) => {
  const response = await fetch(`/api/media/${scope}`, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  return readJson<T>(response);
};

export const readImageDimensions = (file: File): Promise<{ height: number | null; width: number | null }> => new Promise<{ height: number | null; width: number | null }>((resolve) => {
  const image = new Image();
  const emptyDimensions = { height: null, width: null };
  const finish = () => resolve({ height: image.naturalHeight || null, width: image.naturalWidth || null });

  image.onerror = () => resolve(emptyDimensions);
  image.onload = finish;

  const reader = new FileReader();
  reader.onerror = () => resolve(emptyDimensions);
  reader.onload = () => {
    if (typeof reader.result === "string") image.src = reader.result;
    else resolve(emptyDimensions);
  };
  reader.readAsDataURL(file);
});

export const putFile = (
  file: File,
  uploadUrl: string,
  onProgress: (progress: number) => void,
) => new Promise<void>((resolve, reject) => {
  const request = new XMLHttpRequest();
  request.open("PUT", uploadUrl);
  request.setRequestHeader("Content-Type", file.type);
  request.upload.addEventListener("progress", (event) => {
    if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
  });
  request.addEventListener("load", () => {
    if (request.status >= 200 && request.status < 300) resolve();
    else reject(new Error("Upload ke penyimpanan gagal. Coba lagi."));
  });
  request.addEventListener("error", () => reject(new Error("Koneksi upload terputus. Coba lagi.")));
  request.send(file);
});

export const getItemDate = (value: string) => {
  const jakartaDate = new Date(new Date(value).getTime() + (7 * 60 * 60 * 1000));
  const day = jakartaDate.getUTCDate();
  const month = jakartaMonthLabels[jakartaDate.getUTCMonth()];
  const year = jakartaDate.getUTCFullYear();
  return `${day} ${month} ${year}`;
};

export function compareFolders(left: { name: string }, right: { name: string }) {
  return left.name.localeCompare(right.name, "id");
}
