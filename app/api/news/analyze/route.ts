import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';
import { unstable_cache } from 'next/cache';

const NAVER_API_URL = 'https://openapi.naver.com/v1/search/news.json';
const SEARCH_KEYWORDS = ['환율', '달러', '원화', '금리', '한국은행'];
const CACHE_TAG = 'exchange-rate-analysis';

// ========================================
// 네이버 금융 뉴스 크롤링 설정
// 문제 발생 시 false로 변경하여 비활성화
// ========================================
const ENABLE_FINANCE_NEWS_CRAWLING = true;
const NAVER_FINANCE_NEWS_URL = 'https://finance.naver.com/news/news_list.naver?mode=LSS3D&section_id=101&section_id2=258&section_id3=429';

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

interface ExchangeRateInfo {
  usd: number;
  usdChange: number;
  usdTrend: 'up' | 'down' | 'stable';
  jpy: number;
  eur: number;
  cny: number;
  time: string;
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
  currentRate: ExchangeRateInfo;
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

// 네이버 금융에서 실시간 환율 크롤링
async function fetchCurrentExchangeRates(): Promise<ExchangeRateInfo> {
  const NAVER_FINANCE_URL = 'https://finance.naver.com/marketindex/';

  try {
    const response = await fetch(NAVER_FINANCE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
    });

    if (!response.ok) {
      throw new Error(`네이버 금융 접속 실패: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const rates: { [key: string]: { rate: number; change: number; trend: 'up' | 'down' | 'stable' } } = {};
    let time = '';

    $('#exchangeList li').each((_, element) => {
      const $el = $(element);
      const href = $el.find('a.head').attr('href') || '';
      const match = href.match(/FX_(\w+)KRW/);
      if (!match) return;

      const currencyKey = match[1].toLowerCase();
      const rateText = $el.find('.value').text().trim().replace(/,/g, '');
      const changeText = $el.find('.change').text().trim().replace(/,/g, '');
      const rate = parseFloat(rateText) || 0;
      const change = parseFloat(changeText) || 0;

      const isUp = $el.find('.head_info').hasClass('point_up');
      const isDown = $el.find('.head_info').hasClass('point_dn');
      const trend: 'up' | 'down' | 'stable' = isUp ? 'up' : isDown ? 'down' : 'stable';

      rates[currencyKey] = { rate, change: isDown ? -change : change, trend };

      if (!time) {
        time = $el.find('.time').text().trim();
      }
    });

    console.log(`[Exchange Rate] 크롤링 완료 - USD: ${rates.usd?.rate}, JPY: ${rates.jpy?.rate}, EUR: ${rates.eur?.rate}, CNY: ${rates.cny?.rate}`);

    return {
      usd: rates.usd?.rate || 0,
      usdChange: rates.usd?.change || 0,
      usdTrend: rates.usd?.trend || 'stable',
      jpy: rates.jpy?.rate || 0,
      eur: rates.eur?.rate || 0,
      cny: rates.cny?.rate || 0,
      time,
    };
  } catch (error) {
    console.error('[Exchange Rate] 크롤링 실패:', error);
    return {
      usd: 0,
      usdChange: 0,
      usdTrend: 'stable',
      jpy: 0,
      eur: 0,
      cny: 0,
      time: '',
    };
  }
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

// ========================================
// 네이버 금융 뉴스 페이지 크롤링 (환율 전문 뉴스)
// ENABLE_FINANCE_NEWS_CRAWLING = false로 비활성화 가능
// ========================================
async function fetchNaverFinanceNews(): Promise<NaverNewsItem[]> {
  if (!ENABLE_FINANCE_NEWS_CRAWLING) {
    console.log('[Finance News] 크롤링 비활성화됨');
    return [];
  }

  try {
    console.log('[Finance News] 네이버 금융 뉴스 크롤링 시작...');
    const response = await fetch(NAVER_FINANCE_NEWS_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
    });

    if (!response.ok) {
      console.error(`[Finance News] 접속 실패: ${response.status}`);
      return [];
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const newsItems: NaverNewsItem[] = [];

    // 뉴스 리스트에서 항목 추출
    $('.realtimeNewsList .newsList dl').each((_, element) => {
      const $el = $(element);
      const $link = $el.find('.articleSubject a');
      const href = $link.attr('href');
      const title = $link.attr('title') || $link.text().trim();

      if (!href || !title) return;

      // 상대 경로를 절대 경로로 변환
      const fullUrl = href.startsWith('http')
        ? href
        : `https://finance.naver.com${href}`;

      // news.naver.com 링크로 변환 (본문 크롤링을 위해)
      // /news/news_read.naver?article_id=XXX&office_id=YYY -> https://n.news.naver.com/mnews/article/YYY/XXX
      const match = href.match(/article_id=(\d+)&office_id=(\d+)/);
      let naverNewsUrl = fullUrl;
      if (match) {
        naverNewsUrl = `https://n.news.naver.com/mnews/article/${match[2]}/${match[1]}`;
      }

      newsItems.push({
        title: stripHtml(title),
        originallink: fullUrl,
        link: naverNewsUrl,
        description: $el.find('.articleSummary').text().trim() || '',
        pubDate: new Date().toISOString(), // 금융 뉴스 페이지에는 정확한 시간이 없어 현재 시간 사용
      });
    });

    console.log(`[Finance News] 크롤링 완료 - ${newsItems.length}개 뉴스`);
    return newsItems;
  } catch (error) {
    console.error('[Finance News] 크롤링 실패:', error);
    return [];
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

async function analyzeWithOpenAI(news: CrawledNewsItem[], currentRate: ExchangeRateInfo): Promise<Omit<AnalysisResult, 'currentRate'>> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // 크롤링된 뉴스만 필터링
  const crawledNews = news.filter(n => n.isCrawled && n.content);

  // GPT-4o 128K 토큰 지원 → 최대 50개 뉴스, 본문 1000자씩 분석
  const MAX_NEWS_FOR_ANALYSIS = 50;
  const MAX_CONTENT_LENGTH = 1000;

  // 뉴스 본문 합치기
  const newsForAnalysis = crawledNews.slice(0, MAX_NEWS_FOR_ANALYSIS);
  const newsText = newsForAnalysis
    .map((n, i) => `[뉴스 ${i + 1}] ${n.title}\n${n.content.substring(0, MAX_CONTENT_LENGTH)}`)
    .join('\n\n');

  console.log(`[OpenAI GPT-4o] 분석 시작 - ${newsForAnalysis.length}개 뉴스 (전체 ${crawledNews.length}개 중)`);

  // 환율 정보 문자열
  const rateInfo = currentRate.usd > 0
    ? `
[현재 실시간 환율 - ${currentRate.time} 기준]
- 원/달러(USD): ${currentRate.usd.toLocaleString('ko-KR')}원 (${currentRate.usdTrend === 'up' ? '▲' : currentRate.usdTrend === 'down' ? '▼' : '-'}${Math.abs(currentRate.usdChange).toFixed(2)}원)
- 원/엔(JPY 100엔): ${currentRate.jpy.toLocaleString('ko-KR')}원
- 원/유로(EUR): ${currentRate.eur.toLocaleString('ko-KR')}원
- 원/위안(CNY): ${currentRate.cny.toLocaleString('ko-KR')}원

위 실시간 환율을 기준으로 전망을 작성해주세요. 환율 수치는 반드시 현재 환율(${currentRate.usd.toLocaleString('ko-KR')}원)을 기준으로 구체적인 범위를 제시해주세요.
`
    : '';

  const prompt = `당신은 20년 경력의 외환시장 전문 애널리스트입니다.
금융기관 리서치센터장 수준의 깊이 있는 분석을 제공합니다.
${rateInfo}
아래 ${newsForAnalysis.length}개의 환율 관련 뉴스를 심층 분석하고 전문가 수준의 종합 리포트를 작성하세요.

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
    sources: newsForAnalysis.map(n => ({
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

  // 0. 실시간 환율 크롤링
  console.log(`[Step 0] 실시간 환율 크롤링 중...`);
  const currentRate = await fetchCurrentExchangeRates();

  // 1. 뉴스 검색 (API + 금융 페이지 크롤링 병렬 실행)
  console.log(`[Step 1] 네이버 뉴스 검색 중...`);
  const startTime = Date.now();

  // 네이버 검색 API와 금융 뉴스 크롤링 병렬 실행
  const [apiNewsResults, financeNews] = await Promise.all([
    Promise.all(SEARCH_KEYWORDS.map(keyword => fetchNews(keyword))),
    fetchNaverFinanceNews(),
  ]);

  // API 뉴스와 금융 뉴스 병합
  const allNews = [...apiNewsResults.flat(), ...financeNews];
  const uniqueNews = Array.from(
    new Map(allNews.map(item => [item.link, item])).values()
  );

  const apiCount = apiNewsResults.flat().length;
  const financeCount = financeNews.length;
  console.log(`[Step 1] 완료 - API: ${apiCount}개, 금융뉴스: ${financeCount}개 → 중복제거 후 ${uniqueNews.length}개 (${Date.now() - startTime}ms)`);

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

  // 3. OpenAI 분석 (환율 정보 포함)
  console.log(`[Step 3] OpenAI 분석 중...`);
  const analyzeStartTime = Date.now();

  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
    throw new Error('OpenAI API key not configured');
  }

  const analysis = await analyzeWithOpenAI(crawledNews, currentRate);
  console.log(`[Step 3] 완료 - (${Date.now() - analyzeStartTime}ms)`);

  const totalDuration = Date.now() - startTime;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[Analyze] 완료 - 총 소요시간: ${totalDuration}ms`);
  console.log(`${'='.repeat(60)}\n`);

  return {
    ...analysis,
    currentRate,
  };
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
