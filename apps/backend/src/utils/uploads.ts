// Local-disk file storage for tenant-scoped uploads (customer images, etc.).
// Files are saved under apps/backend/uploads/<tenantSchema>/<bucket>/<id>.<ext>
// and served statically at /uploads/... by the Express app.
//
// IMPORTANT: tenantSchema is already validated by validateSchemaName() upstream,
// so it's safe to use as a path segment.

import { mkdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import multer from 'multer';
import { randomBytes } from 'node:crypto';
import { badRequest } from './errors';

export const UPLOADS_ROOT = join(__dirname, '..', '..', 'uploads');

if (!existsSync(UPLOADS_ROOT)) {
  // Created lazily, but pre-create the root so static middleware has a target.
  void mkdir(UPLOADS_ROOT, { recursive: true });
}

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_MIME.has(file.mimetype)) {
      return cb(badRequest(`Unsupported image type: ${file.mimetype}`));
    }
    cb(null, true);
  },
});

export function extForMime(mime: string, fallback: string): string {
  switch (mime) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    default:
      return fallback || '.bin';
  }
}

export async function saveBufferToTenant(opts: {
  tenantSchema: string;
  bucket: string;
  buffer: Buffer;
  mime: string;
  originalName: string;
}): Promise<{ publicPath: string; absolutePath: string }> {
  const { tenantSchema, bucket, buffer, mime, originalName } = opts;
  const dir = join(UPLOADS_ROOT, tenantSchema, bucket);
  await mkdir(dir, { recursive: true });

  const ext = extForMime(mime, extname(originalName).toLowerCase());
  const id = randomBytes(12).toString('hex');
  const fileName = `${id}${ext}`;
  const absolutePath = join(dir, fileName);
  await (await import('node:fs/promises')).writeFile(absolutePath, buffer);

  // Public URL path (served by express.static). Forward slashes for URLs.
  const publicPath = `/uploads/${tenantSchema}/${bucket}/${fileName}`;
  return { publicPath, absolutePath };
}

export async function deletePublicPath(publicPath: string): Promise<void> {
  // Only allow deletions that are clearly inside /uploads/.
  if (!publicPath.startsWith('/uploads/')) return;
  const rel = publicPath.replace(/^\/uploads\//, '');
  const abs = join(UPLOADS_ROOT, rel);
  if (!abs.startsWith(UPLOADS_ROOT)) return; // path traversal guard
  try {
    await unlink(abs);
  } catch {
    // ignore missing
  }
}
