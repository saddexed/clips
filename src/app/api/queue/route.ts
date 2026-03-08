import { NextResponse } from 'next/server';
import { videoQueue } from '../../../lib/queue';

export async function GET() {
  try {
    const jobCounts = await videoQueue.getJobCounts(
      'wait',
      'active',
      'delayed',
      'completed',
      'failed'
    );

    const memoryJobs = await videoQueue.getJobs(['active', 'wait', 'failed'], 0, 10, true);
    
    const formattedJobs = await Promise.all(memoryJobs.map(async (j) => ({
      id: j.id,
      name: j.name,
      progress: j.progress,
      status: await j.getState(),
      failedReason: j.failedReason,
      timestamp: j.timestamp,
    })));

    return NextResponse.json({
      counts: jobCounts,
      recentJobs: formattedJobs,
    });
  } catch (error) {
    console.error('Queue API Error:', error);
    return NextResponse.json({ error: 'Failed to fetch queue statistics' }, { status: 500 });
  }
}
