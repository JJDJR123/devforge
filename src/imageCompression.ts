const MAX_EDGE = 1800;
const COMPRESS_IF_BYTES = 450 * 1024;
const COMPRESSIBLE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

/**
 * 上传前压缩截图/照片：
 * - 小图、GIF、非图片原样上传
 * - 长边超过 1800 或体积较大的图缩小
 * - WebP 质量 0.88，压缩后反而更大则保留原图
 * - 不处理 GIF，避免丢失动画
 */
export async function compressImageForUpload(file: File): Promise<File> {
  if (!COMPRESSIBLE_TYPES.has(file.type)) return file;
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    if (file.size <= COMPRESS_IF_BYTES && longest <= MAX_EDGE) return file;

    const scale = Math.min(1, MAX_EDGE / longest);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', 0.88);
    });
    if (!blob || blob.size >= file.size * 0.95) return file;

    const name = file.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([blob], `${name}.webp`, {
      type: 'image/webp',
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}
