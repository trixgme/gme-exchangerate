import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';

// 모든 캐시 태그 정의
const CACHE_TAGS = {
  analysis: 'exchange-rate-analysis',
  rate: 'exchange-rate',
} as const;

export async function POST(request: NextRequest) {
  // 간단한 인증 (선택적)
  const authHeader = request.headers.get('authorization');
  if (process.env.NODE_ENV === 'production' && process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const tag = searchParams.get('tag');

    const clearedTags: string[] = [];

    if (tag) {
      // 특정 태그만 무효화 (expire: 0으로 즉시 만료)
      revalidateTag(tag, { expire: 0 });
      clearedTags.push(tag);
      console.log(`[Cache] '${tag}' 캐시 무효화 완료`);
    } else {
      // 모든 태그 무효화
      for (const cacheTag of Object.values(CACHE_TAGS)) {
        revalidateTag(cacheTag, { expire: 0 });
        clearedTags.push(cacheTag);
        console.log(`[Cache] '${cacheTag}' 캐시 무효화 완료`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `캐시가 무효화되었습니다.`,
      clearedTags,
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

// GET 메서드도 지원 (편의성)
export async function GET(request: NextRequest) {
  return POST(request);
}
