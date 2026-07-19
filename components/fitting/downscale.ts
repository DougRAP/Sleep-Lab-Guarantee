// components/fitting/downscale.ts
// Client-side image downscale before upload. Phone captures are 3–8MB, which
// exceeds the server-action body limit and wastes the customer's data on a
// bedside connection. A 1600px JPEG is more than enough to read a law tag.
//
// Every failure path returns the original file — a capture is never lost to a
// canvas quirk.

const MAX_EDGE = 1600;
const QUALITY = 0.82;

export async function downscaleImage(file: File): Promise<File> {
  if (typeof document === "undefined" || !file.type.startsWith("image/")) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1_200_000) {
      bitmap.close?.();
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY)
    );
    if (!blob) return file;

    const name = file.name.replace(/\.[^.]+$/, "") || "capture";
    return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
