import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { unstable_cache } from 'next/cache';

const NAVER_FINANCE_URL = 'https://finance.naver.com/marketindex/';
const CACHE_TAG = 'exchange-rate';

interface ExchangeRate {
  currency: string;
  currencyCode: string;
  rate: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
  chartUrl: string;
  time: string;
}

interface ExchangeRateResponse {
  rates: ExchangeRate[];
  updatedAt: string;
}

// 통화 코드 매핑
const CURRENCY_MAP: Record<string, { name: string; code: string }> = {
  usd: { name: '미국 달러', code: 'USD' },
  jpy: { name: '일본 엔 (100엔)', code: 'JPY' },
  eur: { name: '유럽연합 유로', code: 'EUR' },
  cny: { name: '중국 위안', code: 'CNY' },
  gbp: { name: '영국 파운드', code: 'GBP' },
  chf: { name: '스위스 프랑', code: 'CHF' },
  cad: { name: '캐나다 달러', code: 'CAD' },
  aud: { name: '호주 달러', code: 'AUD' },
  hkd: { name: '홍콩 달러', code: 'HKD' },
  twd: { name: '대만 달러', code: 'TWD' },
  sgd: { name: '싱가포르 달러', code: 'SGD' },
  thb: { name: '태국 바트', code: 'THB' },
  php: { name: '필리핀 페소', code: 'PHP' },
  idr: { name: '인도네시아 루피아 (100)', code: 'IDR' },
  vnd: { name: '베트남 동 (100)', code: 'VND' },
  myr: { name: '말레이시아 링깃', code: 'MYR' },
  inr: { name: '인도 루피', code: 'INR' },
  nzd: { name: '뉴질랜드 달러', code: 'NZD' },
};

async function fetchExchangeRates(): Promise<ExchangeRateResponse> {
  console.log('[Exchange Rate] 네이버 금융 크롤링 시작...');
  const startTime = Date.now();

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

  const rates: ExchangeRate[] = [];

  // 메인 환율 (USD, JPY, EUR, CNY)
  $('#exchangeList li').each((_, element) => {
    const $el = $(element);
    const href = $el.find('a.head').attr('href') || '';

    // 통화 코드 추출 (FX_USDKRW -> usd)
    const match = href.match(/FX_(\w+)KRW/);
    if (!match) return;

    const currencyKey = match[1].toLowerCase();
    const currencyInfo = CURRENCY_MAP[currencyKey];
    if (!currencyInfo) return;

    const rateText = $el.find('.value').text().trim().replace(/,/g, '');
    const changeText = $el.find('.change').text().trim().replace(/,/g, '');
    const rate = parseFloat(rateText) || 0;
    const change = parseFloat(changeText) || 0;

    // 상승/하락 판단
    const isUp = $el.find('.head_info').hasClass('point_up');
    const isDown = $el.find('.head_info').hasClass('point_dn');
    const trend: 'up' | 'down' | 'stable' = isUp ? 'up' : isDown ? 'down' : 'stable';

    // 변동률 계산
    const changePercent = rate > 0 ? (change / (rate - change)) * 100 : 0;

    // 차트 URL
    const chartUrl = `https://ssl.pstatic.net/imgfinance/chart/marketindex/FX_${currencyKey.toUpperCase()}KRW.png`;

    // 시간 추출
    const time = $el.find('.time').text().trim();

    rates.push({
      currency: currencyInfo.name,
      currencyCode: currencyInfo.code,
      rate,
      change: isDown ? -change : change,
      changePercent: isDown ? -changePercent : changePercent,
      trend,
      chartUrl,
      time,
    });
  });

  const duration = Date.now() - startTime;
  console.log(`[Exchange Rate] 크롤링 완료 - ${rates.length}개 통화 (${duration}ms)`);

  return {
    rates,
    updatedAt: new Date().toISOString(),
  };
}

// 1분 캐시
const getCachedExchangeRates = unstable_cache(
  fetchExchangeRates,
  [CACHE_TAG],
  {
    revalidate: 60, // 1분
    tags: [CACHE_TAG],
  }
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get('refresh') === 'true';

  try {
    const startTime = Date.now();
    let data: ExchangeRateResponse;
    let isCached = false;

    if (forceRefresh) {
      console.log('[Exchange Rate API] 강제 새로고침');
      data = await fetchExchangeRates();
    } else {
      data = await getCachedExchangeRates();
      const duration = Date.now() - startTime;
      isCached = duration < 500;
    }

    const duration = Date.now() - startTime;
    console.log(`[Exchange Rate API] 응답 완료 - ${isCached ? '캐시 히트' : '새로 조회'} (${duration}ms)`);

    return NextResponse.json({
      success: true,
      data,
      cached: isCached,
      timing: { total: duration },
    });
  } catch (error) {
    console.error('[Exchange Rate API] 오류:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
