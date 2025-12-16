import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';
import { unstable_cache } from 'next/cache';

const NAVER_API_URL = 'https://openapi.naver.com/v1/search/news.json';
const SEARCH_KEYWORDS = ['환율', '달러', '원화', '금리', '한국은행'];
const CACHE_TAG = 'exchange-rate-analysis';

interface NaverNewsItem {
  title: string;
  originallink: string;
  link: string;
  description: string;
  pubDate: string;
}

interface NaverNewsResponse {
  lastBuildDate: string;
  total: number;
  start: number;
  display: number;
  items: NaverNewsItem[];
}

interface CrawledNewsItem {
  title: string;
  description: string;
  content: string;
  source: string;
  url: string;
  publishedAt: string;
  isCrawled: boolean;
  thumbnail: string;
}

interface AnalysisResult {
  title: string;
  summary: string;
  detailedAnalysis: string;
  keyPoints: string[];
  marketFactors: {
    factor: string;
    impact: 'positive' | 'negative' | 'neutral';
    description: string;
  }[];
  sentiment: {
    overall: 'positive' | 'negative' | 'neutral';
    score: number;
    description: string;
    breakdown: {
      positive: number;
      negative: number;
      neutral: number;
    };
  };
  exchangeOutlook: {
    direction: 'up' | 'down' | 'stable' | 'uncertain';
    shortTerm: string;
    midTerm: string;
    riskFactors: string[];
  };
  investmentTip: string;
  sources: {
    title: string;
    source: string;
    url: string;
    thumbnail: string;
  }[];
  generatedAt: string;
  newsCount: number;
}

// HTML 태그 제거 함수
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

// 네이버 뉴스 본문 크롤링
async function crawlNaverNews(url: string): Promise<{
  content: string;
  source: string;
  thumbnail: string;
} | null> {
  if (!url.includes('news.naver.com')) {
    return null;
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
    });

    if (!response.ok) return null;

    const html = await response.text();
    const $ = cheerio.load(html);

    const content = $('#dic_area').text() ||
                    $('#newsct_article').text() ||
                    $('.newsct_article').text() || '';

    const source = $('.media_end_head_top_logo img').attr('alt') ||
                   $('meta[property="og:article:author"]').attr('content') || '';

    const thumbnail = $('meta[property="og:image"]').attr('content') || '';

    return {
      content: content.trim().substring(0, 3000),
      source: source.trim(),
      thumbnail: thumbnail.trim(),
    };
  } catch {
    return null;
  }
}

async function fetchNews(query: string): Promise<NaverNewsItem[]> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Naver API credentials not configured');
  }

  const params = new URLSearchParams({
    query,
    display: '50',
    start: '1',
    sort: 'date',
  });

  const response = await fetch(`${NAVER_API_URL}?${params}`, {
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
    },
  });

  if (!response.ok) {
    throw new Error(`Naver API error: ${response.status}`);
  }

  const data: NaverNewsResponse = await response.json();
  return data.items;
}

async function analyzeWithOpenAI(news: CrawledNewsItem[]): Promise<AnalysisResult> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // 크롤링된 뉴스만 필터링
  const crawledNews = news.filter(n => n.isCrawled && n.content);

  // 뉴스 본문 합치기
  const newsText = crawledNews
    .slice(0, 30)
    .map((n, i) => `[뉴스 ${i + 1}] ${n.title}\n${n.content.substring(0, 800)}`)
    .join('\n\n');

  console.log(`[OpenAI GPT-4o] 분석 시작 - ${crawledNews.length}개 뉴스`);

  const prompt = `당신은 20년 경력의 외환시장 전문 애널리스트입니다.
금융기관 리서치센터장 수준의 깊이 있는 분석을 제공합니다.

아래 ${crawledNews.length}개의 환율 관련 뉴스를 심층 분석하고 전문가 수준의 종합 리포트를 작성하세요.

[뉴스 목록]
${newsText}

다음 JSON 형식으로 상세하게 응답하세요:
{
  "title": "오늘의 환율 동향을 한 문장으로 요약한 제목",
  "summary": "전체 뉴스를 종합한 핵심 요약 (4-5문장, 구체적인 수치와 함께)",
  "detailedAnalysis": "뉴스 내용을 바탕으로 한 심층 분석 (8-10문장). 현재 환율 상황, 주요 영향 요인, 글로벌 경제 맥락, 국내 경제 상황을 종합적으로 분석",
  "keyPoints": [
    "핵심 포인트 1 - 구체적인 내용과 수치 포함",
    "핵심 포인트 2 - 구체적인 내용과 수치 포함",
    "핵심 포인트 3 - 구체적인 내용과 수치 포함",
    "핵심 포인트 4 - 구체적인 내용과 수치 포함",
    "핵심 포인트 5 - 구체적인 내용과 수치 포함"
  ],
  "marketFactors": [
    {
      "factor": "영향 요인명 (예: 미국 금리 정책)",
      "impact": "positive 또는 negative 또는 neutral",
      "description": "해당 요인이 원/달러 환율에 미치는 영향 설명 (2-3문장)"
    },
    {
      "factor": "두 번째 영향 요인",
      "impact": "positive 또는 negative 또는 neutral",
      "description": "설명"
    },
    {
      "factor": "세 번째 영향 요인",
      "impact": "positive 또는 negative 또는 neutral",
      "description": "설명"
    }
  ],
  "sentiment": {
    "overall": "positive 또는 negative 또는 neutral",
    "score": -1.0에서 1.0 사이 숫자 (소수점 2자리),
    "description": "현재 외환시장 심리 상태에 대한 상세 설명 (3-4문장)",
    "breakdown": {
      "positive": 긍정적 뉴스 비율 (0-100 정수),
      "negative": 부정적 뉴스 비율 (0-100 정수),
      "neutral": 중립적 뉴스 비율 (0-100 정수)
    }
  },
  "exchangeOutlook": {
    "direction": "up 또는 down 또는 stable 또는 uncertain",
    "shortTerm": "향후 1주일 환율 전망 (3-4문장, 예상 범위 포함)",
    "midTerm": "향후 1개월 환율 전망 (3-4문장)",
    "riskFactors": [
      "주의해야 할 리스크 요인 1",
      "주의해야 할 리스크 요인 2",
      "주의해야 할 리스크 요인 3"
    ]
  },
  "investmentTip": "개인 투자자나 환전을 고려하는 사람들을 위한 실용적인 조언 (3-4문장)"
}

반드시 JSON 형식으로만 응답하세요.`;

  // GPT-4o 사용 (현재 가장 강력한 모델)
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  });

  const result = JSON.parse(completion.choices[0].message.content || '{}');
  console.log(`[OpenAI GPT-4o] 분석 완료`);

  return {
    ...result,
    sources: crawledNews.slice(0, 30).map(n => ({
      title: n.title,
      source: n.source,
      url: n.url,
      thumbnail: n.thumbnail,
    })),
    generatedAt: new Date().toISOString(),
    newsCount: crawledNews.length,
  };
}

// 뉴스 분석 실행 함수 (캐싱 대상)
async function performAnalysis(): Promise<AnalysisResult> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[Analyze] 새로운 분석 시작 - ${new Date().toISOString()}`);
  console.log(`${'='.repeat(60)}`);

  // 1. 뉴스 검색
  console.log(`[Step 1] 네이버 뉴스 검색 중...`);
  const startTime = Date.now();
  const newsPromises = SEARCH_KEYWORDS.map(keyword => fetchNews(keyword));
  const newsResults = await Promise.all(newsPromises);

  const allNews = newsResults.flat();
  const uniqueNews = Array.from(
    new Map(allNews.map(item => [item.link, item])).values()
  );
  console.log(`[Step 1] 완료 - ${uniqueNews.length}개 뉴스 (${Date.now() - startTime}ms)`);

  // 2. 크롤링
  console.log(`[Step 2] 뉴스 본문 크롤링 중...`);
  const crawlStartTime = Date.now();
  const crawledNews: CrawledNewsItem[] = [];

  const batchSize = 5;
  for (let i = 0; i < uniqueNews.length; i += batchSize) {
    const batch = uniqueNews.slice(i, i + batchSize);
    const crawlPromises = batch.map(async (news) => {
      const crawled = await crawlNaverNews(news.link);
      return {
        title: stripHtml(news.title),
        description: stripHtml(news.description),
        content: crawled?.content || '',
        source: crawled?.source || '',
        url: news.link,
        publishedAt: news.pubDate,
        isCrawled: !!crawled?.content,
        thumbnail: crawled?.thumbnail || '',
      };
    });
    const results = await Promise.all(crawlPromises);
    crawledNews.push(...results);
  }

  const crawledCount = crawledNews.filter(n => n.isCrawled).length;
  console.log(`[Step 2] 완료 - ${crawledCount}/${crawledNews.length}개 크롤링 (${Date.now() - crawlStartTime}ms)`);

  // 3. OpenAI 분석
  console.log(`[Step 3] OpenAI 분석 중...`);
  const analyzeStartTime = Date.now();

  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
    throw new Error('OpenAI API key not configured');
  }

  const analysis = await analyzeWithOpenAI(crawledNews);
  console.log(`[Step 3] 완료 - (${Date.now() - analyzeStartTime}ms)`);

  const totalDuration = Date.now() - startTime;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[Analyze] 완료 - 총 소요시간: ${totalDuration}ms`);
  console.log(`${'='.repeat(60)}\n`);

  return analysis;
}

// unstable_cache로 캐싱된 분석 함수 (10분 TTL)
const getCachedAnalysis = unstable_cache(
  performAnalysis,
  [CACHE_TAG],
  {
    revalidate: 600, // 10분
    tags: [CACHE_TAG],
  }
);

export async function GET(request: Request) {
  // 강제 새로고침 쿼리 파라미터 확인
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get('refresh') === 'true';

  try {
    const startTime = Date.now();
    let analysis: AnalysisResult;
    let isCached = false;

    if (forceRefresh) {
      // 강제 새로고침: 캐시 우회하고 직접 분석 실행
      console.log('[Analyze API] 강제 새로고침 - 캐시 우회');
      analysis = await performAnalysis();
    } else {
      // 일반 요청: 캐시된 결과 사용
      analysis = await getCachedAnalysis();
      const duration = Date.now() - startTime;
      isCached = duration < 1000; // 빠른 응답이면 캐시 히트로 판단
    }

    const duration = Date.now() - startTime;
    console.log(`[Analyze API] 응답 완료 - ${isCached ? '캐시 히트' : '새로 생성'} (${duration}ms)`);

    return NextResponse.json({
      success: true,
      data: analysis,
      cached: isCached,
      timing: {
        total: duration,
      },
    });
  } catch (error) {
    console.error('[Analyze API] 오류:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
