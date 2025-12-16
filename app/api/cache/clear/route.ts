import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';

const CACHE_TAG = 'exchange-rate-analysis';

export async function POST(request: Request) {
  // 간단한 인증 (선택적)
  const authHeader = request.headers.get('authorization');
  if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 캐시 태그로 무효화 (Next.js 16: 두 번째 인자로 profile 필요)
    revalidateTag(CACHE_TAG, { expire: 0 });

    console.log(`[Cache] '${CACHE_TAG}' 캐시 무효화 완료`);

    return NextResponse.json({
      success: true,
      message: `캐시 '${CACHE_TAG}' 가 무효화되었습니다.`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Cache] 캐시 무효화 실패:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
