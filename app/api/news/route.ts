import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

const NAVER_API_URL = 'https://openapi.naver.com/v1/search/news.json';
const SEARCH_KEYWORDS = ['환율', '달러', '원화', '금리'];

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
  journalist: string;
  url: string;
  originalUrl: string;
  publishedAt: string;
  crawledAt: string;
  isCrawled: boolean;
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
  journalist: string;
} | null> {
  // 네이버 뉴스 링크인지 확인
  if (!url.includes('news.naver.com')) {
    console.log(`[Crawl] 스킵 - 네이버 뉴스 아님: ${url}`);
    return null;
  }

  try {
    const startTime = Date.now();
    console.log(`[Crawl] 크롤링 시작: ${url}`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    if (!response.ok) {
      console.error(`[Crawl] HTTP 오류: ${response.status}`);
      return null;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // 네이버 뉴스 본문 선택자 (여러 형태 지원)
    let content = '';

    // 일반 뉴스 기사
    const articleBody = $('#dic_area').text() ||
                        $('#articeBody').text() ||
                        $('#newsct_article').text() ||
                        $('.newsct_article').text() ||
                        $('article#dic_area').text();

    if (articleBody) {
      content = articleBody.trim();
    }

    // 언론사 추출
    const source = $('.media_end_head_top_logo img').attr('alt') ||
                   $('.press_logo img').attr('alt') ||
                   $('meta[property="og:article:author"]').attr('content') ||
                   '';

    // 기자 이름 추출
    const journalist = $('.media_end_head_journalist_name').text() ||
                       $('.byline_s').text() ||
                       $('.journalist_name').text() ||
                       '';

    const duration = Date.now() - startTime;
    console.log(`[Crawl] 완료 - 본문: ${content.length}자, 언론사: ${source}, 소요시간: ${duration}ms`);

    return {
      content: content.substring(0, 5000), // 최대 5000자
      source: source.trim(),
      journalist: journalist.trim(),
    };
  } catch (error) {
    console.error(`[Crawl] 오류: ${url}`, error);
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
    display: '30',
    start: '1',
    sort: 'date',
  });

  const requestUrl = `${NAVER_API_URL}?${params}`;
  const startTime = Date.now();

  console.log(`[Naver API] 요청 시작 - 키워드: "${query}"`);
  console.log(`[Naver API] URL: ${requestUrl}`);

  const response = await fetch(requestUrl, {
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
    },
  });

  const duration = Date.now() - startTime;

  if (!response.ok) {
    console.error(`[Naver API] 오류 - 키워드: "${query}", 상태: ${response.status}, 소요시간: ${duration}ms`);
    throw new Error(`Naver API error: ${response.status}`);
  }

  const data: NaverNewsResponse = await response.json();
  console.log(`[Naver API] 성공 - 키워드: "${query}", 결과: ${data.items.length}개, 총: ${data.total}개, 소요시간: ${duration}ms`);

  return data.items;
}

export async function GET() {
  const requestTime = new Date().toISOString();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[News API] 요청 시작 - ${requestTime}`);
  console.log(`[News API] 검색 키워드: ${SEARCH_KEYWORDS.join(', ')}`);
  console.log(`${'='.repeat(60)}`);

  try {
    // 1. 네이버 API로 뉴스 검색
    const startTime = Date.now();
    const newsPromises = SEARCH_KEYWORDS.map((keyword) => fetchNews(keyword));
    const newsResults = await Promise.all(newsPromises);
    const apiDuration = Date.now() - startTime;

    // 중복 제거
    const allNews = newsResults.flat();
    const uniqueNews = Array.from(
      new Map(allNews.map((item) => [item.link, item])).values()
    );

    // 날짜순 정렬
    uniqueNews.sort(
      (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
    );

    console.log(`\n[News API] API 완료 - 소요시간: ${apiDuration}ms`);
    console.log(`[News API] 전체: ${allNews.length}개, 중복 제거 후: ${uniqueNews.length}개`);

    // 2. 네이버 뉴스 링크만 필터링하여 크롤링
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[Crawl] 크롤링 시작`);
    console.log(`${'='.repeat(60)}`);

    const crawlStartTime = Date.now();
    const crawledNews: CrawledNewsItem[] = [];

    // 병렬 크롤링 (최대 5개씩)
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
          journalist: crawled?.journalist || '',
          url: news.link,
          originalUrl: news.originallink,
          publishedAt: news.pubDate,
          crawledAt: new Date().toISOString(),
          isCrawled: !!crawled?.content,
        };
      });

      const results = await Promise.all(crawlPromises);
      crawledNews.push(...results);
    }

    const crawlDuration = Date.now() - crawlStartTime;
    const totalDuration = Date.now() - startTime;

    const crawledCount = crawledNews.filter((n) => n.isCrawled).length;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[News API] 크롤링 완료 - 소요시간: ${crawlDuration}ms`);
    console.log(`[News API] 크롤링 성공: ${crawledCount}/${crawledNews.length}개`);
    console.log(`[News API] 총 소요시간: ${totalDuration}ms`);
    console.log(`${'='.repeat(60)}`);

    // 결과값 로그 출력
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[결과] 크롤링된 뉴스 목록`);
    console.log(`${'='.repeat(60)}`);
    crawledNews.forEach((news, index) => {
      console.log(`\n[${index + 1}] ${news.title}`);
      console.log(`    언론사: ${news.source || '알 수 없음'}`);
      console.log(`    기자: ${news.journalist || '알 수 없음'}`);
      console.log(`    발행일: ${news.publishedAt}`);
      console.log(`    크롤링: ${news.isCrawled ? '성공' : '실패'}`);
      console.log(`    본문 길이: ${news.content.length}자`);
      console.log(`    URL: ${news.url}`);
      if (news.content) {
        console.log(`    본문 미리보기: ${news.content.substring(0, 200)}...`);
      }
    });
    console.log(`\n${'='.repeat(60)}\n`);

    return NextResponse.json({
      success: true,
      data: {
        news: crawledNews,
        total: crawledNews.length,
        crawledCount,
        keywords: SEARCH_KEYWORDS,
        timing: {
          api: apiDuration,
          crawl: crawlDuration,
          total: totalDuration,
        },
      },
    });
  } catch (error) {
    console.error('News API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
