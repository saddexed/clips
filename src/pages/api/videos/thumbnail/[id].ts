import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import fs from 'node:fs';
import { stat } from 'node:fs/promises';
import { exec } from 'node:child_process';
import util from 'node:util';
import path from 'node:path';

const execAsync = util.promisify(exec);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();
  const { id } = req.query;

  try {
    const video = await prisma.video.findUnique({
      where: { id: id as string },
    });

    if (!video) {
        return res.status(404).end();
    }

    const dataPath = process.env.DATA_PATH || "/app/data";
    const thumbPath = path.join(dataPath, ".thumbnails", `${id}.png`);

    try {
      await stat(thumbPath);
    } catch {
      // Generate a thumbnail frame on the fly if it doesn't already exist
      // We need a source file, prioritize processedPath, then fallback to originalPath
      const sourcePath = video.processedPath || video.originalPath;
      if (!sourcePath) return res.status(404).end();

      try {
        await stat(sourcePath);
        // Ensure directory exists
        const thumbDir = path.dirname(thumbPath);
        await stat(thumbDir).catch(() => fs.promises.mkdir(thumbDir, { recursive: true }));
        
        await execAsync(`ffmpeg -i "${sourcePath}" -ss 00:00:01.000 -vframes 1 "${thumbPath}"`);
      } catch (err) {
        console.error("Failed to generate thumbnail via ffmpeg", err);
        return res.status(404).end();
      }
    }

    try {
      const { size } = await stat(thumbPath);
      res.writeHead(200, {
        "Content-Type": "image/png",
        "Content-Length": size,
        "Cache-Control": "public, max-age=86400",
      });
      
      const fileStream = fs.createReadStream(thumbPath);
      fileStream.pipe(res);
      
      fileStream.on('error', (err) => {
        console.error('Thumbnail stream error:', err);
        if (!res.headersSent) res.status(500).end();
      });
    } catch (err) {
      console.error("Failed to read thumbnail", err);
      if (!res.headersSent) res.status(500).end();
    }
  } catch (error) {
    console.error("Thumbnail API Error:", error);
    if (!res.headersSent) res.status(500).end();
  }
}
