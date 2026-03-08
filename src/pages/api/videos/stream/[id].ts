import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import fs from 'node:fs';
import { stat } from 'node:fs/promises';

export const config = {
  api: {
    responseLimit: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const { id } = req.query;

  try {
    const video = await prisma.video.findUnique({
      where: { id: id as string },
    });

    if (!video || !video.processedPath || video.status !== "COMPLETED") {
      return res.status(404).send("Video not found or still processing");
    }

    const filePath = video.processedPath;
    
    // Check if file exists to prevent hard crashes
    try {
      await stat(filePath);
    } catch {
      return res.status(404).send("Video file missing on disk");
    }

    const fileStat = await stat(filePath);
    const size = fileStat.size;
    const range = req.headers.range;

    if (range) {
      // Parse Range header (e.g., "bytes=32324-")
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : size - 1;

      if (start >= size) {
        res.status(416);
        res.setHeader("Content-Range", `bytes */${size}`);
        return res.end();
      }

      const chunksize = end - start + 1;
      const file = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": "video/webm",
      });
      
      file.pipe(res);
      
      res.on('close', () => {
        file.destroy();
      });
      
      file.on('error', (err) => {
        console.error('Stream Error:', err);
        if (!res.headersSent) res.status(500).end();
      });
    } else {
      res.writeHead(200, {
        "Content-Length": size,
        "Content-Type": "video/webm",
      });
      const file = fs.createReadStream(filePath);
      file.pipe(res);
      
      res.on('close', () => {
        file.destroy();
      });
      
      file.on('error', (err) => {
        console.error('Stream Error:', err);
        if (!res.headersSent) res.status(500).end();
      });
    }
  } catch (error) {
    console.error("Stream API Error:", error);
    if (!res.headersSent) {
      res.status(500).send("Internal Server Error");
    }
  }
}
