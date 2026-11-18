const MAX_INPUT_BYTES = 25 * 1024 * 1024;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('这张图片无法读取。'));
    };
    image.src = url;
  });
}

/**
 * Resize/compress an image before upload.
 * A 4K icon would otherwise be stored and decoded at full size on every page.
 */
export async function resizeImageFile(
  file: File,
  maxSize: number,
  quality = 0.86,
): Promise<File> {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件。');
  if (file.size > MAX_INPUT_BYTES) throw new Error('图片不能超过 25MB。');
  if (file.type === 'image/svg+xml') throw new Error('不支持 SVG，请上传 PNG、JPG 或 WebP。');

  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await createImageBitmap(file);
  } catch {
    source = await loadImage(file);
  }

  const width = source.width;
  const height = source.height;
  if (!width || !height) throw new Error('这张图片尺寸不正确。');

  // Small files are already cheap to serve; keep their original format.
  if (width <= maxSize && height <= maxSize && file.size <= 300 * 1024) {
    if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) source.close();
    return file;
  }

  const scale = Math.min(1, maxSize / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器无法处理这张图片。');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, canvas.width, canvas.height);

  if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) source.close();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/webp', quality);
  });
  if (!blob) throw new Error('图片压缩失败，请换一张图。');

  const extension = blob.type === 'image/png' ? '.png' : '.webp';
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
  return new File([blob], `${baseName}${extension}`, { type: blob.type || 'image/webp' });
}
