import { NextResponse } from 'next/server';
import { isQueuePaused, setQueuePaused, videoQueue } from '../../../lib/queue';

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
      videoId: j.data?.videoId,
    })));

    return NextResponse.json({
      counts: jobCounts,
      recentJobs: formattedJobs,
      isPaused: await isQueuePaused(),
    });
  } catch (error) {
    console.error('Queue API Error:', error);
    return NextResponse.json({ error: 'Failed to fetch queue statistics' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = body?.action;

    if (action !== 'pause' && action !== 'resume') {
      return NextResponse.json({ error: 'Invalid action. Use pause or resume.' }, { status: 400 });
    }

    const pauseQueue = action === 'pause';
    await setQueuePaused(pauseQueue);

    return NextResponse.json({ success: true, isPaused: pauseQueue });
  } catch (error) {
    console.error('Queue Pause/Resume API Error:', error);
    return NextResponse.json({ error: 'Failed to update queue state' }, { status: 500 });
  }
}
