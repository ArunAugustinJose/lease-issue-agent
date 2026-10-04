import { BadRequestException } from '@nestjs/common';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
export const uploadRoot = () => resolve(process.env.UPLOAD_DIR ?? './uploads');
export interface StoredFile {
  filename: string;
  storageKey: string;
  mimeType: string;
  buffer: Buffer;
}
export async function validateFile(
  file: Express.Multer.File | undefined,
  kind: 'lease' | 'image',
): Promise<StoredFile> {
  if (!file) throw new BadRequestException('Choose a file to upload.');
  const filename = Array.from(basename(file.originalname.replaceAll('\\', '/')))
    .filter((character) => character.charCodeAt(0) >= 32)
    .join('')
    .slice(0, 180);
  const extension = extname(filename).toLowerCase();
  const buffer = file.buffer;
  if (!buffer.length || buffer.length > 10 * 1024 * 1024)
    throw new BadRequestException(
      'Each file must be between 1 byte and 10 MB.',
    );
  const leaseTypes: Record<string, string[]> = {
    '.pdf': ['application/pdf'],
    '.docx': [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    '.txt': ['text/plain'],
  };
  const imageTypes: Record<string, string[]> = {
    '.png': ['image/png'],
    '.jpg': ['image/jpeg'],
    '.jpeg': ['image/jpeg'],
    '.webp': ['image/webp'],
    '.svg': ['image/svg+xml'],
  };
  const types = kind === 'lease' ? leaseTypes : imageTypes;
  if (!types[extension]?.includes(file.mimetype))
    throw new BadRequestException(
      kind === 'lease'
        ? 'Use a PDF, DOCX or TXT lease document.'
        : 'Use PNG, JPEG, WebP or a safe illustrated SVG.',
    );
  if (
    extension === '.pdf' &&
    !buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))
  )
    throw new BadRequestException('This file is not a valid PDF.');
  if (extension === '.docx' && !buffer.subarray(0, 2).equals(Buffer.from('PK')))
    throw new BadRequestException('This file is not a valid DOCX.');
  if (extension === '.txt' && buffer.includes(0))
    throw new BadRequestException(
      'TXT documents must contain plain UTF-8 text.',
    );
  if (kind === 'image') {
    if (extension === '.svg') {
      const svg = buffer.toString('utf8');
      // Only passive fixture-like SVG drawing elements; no external resources, styles or executable markup.
      if (
        !/^\s*<svg\b/.test(svg) ||
        /<!|<\?|\bon\w+\s*=|href\s*=|url\s*\(|javascript:|data:/i.test(svg)
      )
        throw new BadRequestException(
          'SVG must be a passive illustration without scripts or external resources.',
        );
      const allowed = new Set([
        'svg',
        'g',
        'rect',
        'path',
        'line',
        'circle',
        'ellipse',
        'polygon',
        'polyline',
        'text',
        'tspan',
        'title',
        'desc',
      ]);
      for (const tag of svg.matchAll(/<\/?([\w:-]+)/g))
        if (!allowed.has(tag[1]))
          throw new BadRequestException(
            'Unsupported SVG element. Use PNG or JPEG instead.',
          );
    }
    try {
      const metadata = await sharp(buffer, {
        limitInputPixels: 20000000,
      }).metadata();
      if (
        !metadata.width ||
        !metadata.height ||
        metadata.width * metadata.height > 20000000
      )
        throw new Error();
      const expected: Record<string, string> = {
        '.png': 'png',
        '.jpg': 'jpeg',
        '.jpeg': 'jpeg',
        '.webp': 'webp',
        '.svg': 'svg',
      };
      if (metadata.format !== expected[extension]) throw new Error();
    } catch {
      throw new BadRequestException(
        'Could not read the image. Use a valid image below 20 megapixels.',
      );
    }
  }
  return {
    filename,
    storageKey: randomUUID() + extension,
    mimeType: file.mimetype,
    buffer,
  };
}
export async function storeFiles(files: StoredFile[]) {
  await mkdir(uploadRoot(), { recursive: true });
  const written: string[] = [];
  try {
    for (const f of files) {
      await writeFile(resolve(uploadRoot(), f.storageKey), f.buffer, {
        flag: 'wx',
      });
      written.push(f.storageKey);
    }
  } catch (error) {
    await removeFiles(written);
    throw error;
  }
}
export async function removeFiles(keys: string[]) {
  await Promise.all(
    keys.map((key) =>
      unlink(resolve(uploadRoot(), key)).catch(() => undefined),
    ),
  );
}
