import type { ImageRole, TradeImage } from "./types";

const MAX_IMAGE_SIDE = 1600;
const JPEG_QUALITY = 0.8;

export function createId(): string {
  if ("randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片读取失败"));
    image.src = dataUrl;
  });
}

export async function compressImage(file: File, imageRole: ImageRole): Promise<TradeImage> {
  const originalDataUrl = await readAsDataUrl(file);

  try {
    const image = await loadImage(originalDataUrl);
    const longestSide = Math.max(image.width, image.height);
    const scale = longestSide > MAX_IMAGE_SIDE ? MAX_IMAGE_SIDE / longestSide : 1;
    const width = Math.round(image.width * scale);
    const height = Math.round(image.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器不支持图片压缩");

    context.drawImage(image, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);

    return {
      id: createId(),
      name: file.name,
      type: "image/jpeg",
      size: file.size,
      compressedSize: Math.round((dataUrl.length * 3) / 4),
      imageRole,
      dataUrl,
      createdAt: new Date().toISOString(),
    };
  } catch {
    return {
      id: createId(),
      name: file.name,
      type: file.type || "image/*",
      size: file.size,
      compressedSize: file.size,
      imageRole,
      dataUrl: originalDataUrl,
      createdAt: new Date().toISOString(),
    };
  }
}
