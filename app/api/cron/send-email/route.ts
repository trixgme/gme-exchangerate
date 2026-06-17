import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

// 분석 API(maxDuration=300)를 내부 fetch로 호출해 응답을 기다린 뒤 이메일을 발송하므로,
// cron 함수도 동일하게 최대치(300초)로 설정해 분석 도중 함수가 강제 종료되지 않도록 한다.
export const maxDuration = 300;

// Vercel Cron 인증
export async function GET(request: NextRequest) {
  // Cron 인증 확인 (Vercel Cron에서 호출 시)
  const authHeader = request.headers.get('authorization');
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;

  // CRON_SECRET이 설정된 경우에만 검증
  if (process.env.CRON_SECRET && authHeader !== expectedAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Vercel Cron User-Agent 검증 (프로덕션에서만)
  if (process.env.NODE_ENV === 'production') {
    const userAgent = request.headers.get('user-agent');
    if (!userAgent?.includes('vercel-cron')) {
      // 수동 호출도 허용하기 위해 경고만 로그
      console.log('[Cron] Non-Vercel cron request:', userAgent);
    }
  }

  try {
    console.log('[Cron] 환율 브리핑 이메일 발송 시작...');

    // Resend API 키 확인
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    // 1. 분석 API 호출
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const analysisResponse = await fetch(`${baseUrl}/api/news/analyze`);
    const analysisData = await analysisResponse.json();

    if (!analysisData.success || !analysisData.data) {
      throw new Error('분석 데이터를 가져오지 못했습니다.');
    }

    const analysis = analysisData.data;

    // 2. 이메일 HTML 생성
    const emailHtml = generateEmailHtml(analysis);

    // 3. 이메일 발송
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'Exchange Rate <noreply@yourdomain.com>',
      to: process.env.EMAIL_TO?.split(',').map(email => email.trim()).filter(Boolean) || [],
      subject: `[환율 브리핑] ${analysis.title}`,
      html: emailHtml,
    });

    if (error) {
      throw error;
    }

    console.log('[Cron] 이메일 발송 완료:', data);

    return NextResponse.json({
      success: true,
      message: '이메일 발송 완료',
      emailId: data?.id,
    });
  } catch (error) {
    console.error('[Cron] 이메일 발송 실패:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

function generateEmailHtml(analysis: {
  title: string;
  summary: string;
  detailedAnalysis: string;
  keyPoints: string[];
  marketFactors: { factor: string; impact: string; description: string }[];
  sentiment: {
    overall: string;
    score: number;
    description: string;
    breakdown: { positive: number; negative: number; neutral: number };
  };
  exchangeOutlook: {
    direction: string;
    shortTerm: string;
    midTerm: string;
    riskFactors: string[];
  };
  investmentTip: string;
  sources: { title: string; source: string; url: string; thumbnail: string }[];
  currentRate?: {
    usd: number;
    usdChange: number;
    usdTrend: 'up' | 'down' | 'stable';
    jpy: number;
    eur: number;
    cny: number;
    time: string;
  };
  generatedAt: string;
  newsCount: number;
  english?: {
    title: string;
    summary: string;
    detailedAnalysis: string;
    keyPoints: string[];
    marketFactors: { factor: string; description: string }[];
    sentimentDescription: string;
    exchangeOutlook: {
      shortTerm: string;
      midTerm: string;
      riskFactors: string[];
    };
    investmentTip: string;
  };
}): string {
  const directionEmoji = {
    up: '📈 상승 (원화 약세)',
    down: '📉 하락 (원화 강세)',
    stable: '➡️ 보합세',
    uncertain: '❓ 불확실',
  }[analysis.exchangeOutlook.direction] || '❓';

  const sentimentEmoji = {
    positive: '🟢 긍정적',
    negative: '🔴 부정적',
    neutral: '🟡 중립적',
  }[analysis.sentiment.overall] || '🟡';

  const impactColor = (impact: string) => {
    if (impact === 'positive') return '#22c55e';
    if (impact === 'negative') return '#ef4444';
    return '#6b7280';
  };

  const trendColor = (trend: 'up' | 'down' | 'stable') => {
    if (trend === 'up') return '#ef4444';
    if (trend === 'down') return '#3b82f6';
    return '#6b7280';
  };

  const trendArrow = (trend: 'up' | 'down' | 'stable') => {
    if (trend === 'up') return '▲';
    if (trend === 'down') return '▼';
    return '-';
  };

  // 영어 섹션 HTML 생성
  const generateEnglishSection = () => {
    if (!analysis.english) return '';

    const eng = analysis.english;

    const keyPointsHtml = eng.keyPoints.map((point, i) =>
      `<li style="display: flex; margin-bottom: 12px; font-size: 14px; color: #4a4a4a; line-height: 1.5;">
        <span style="display: inline-block; width: 24px; height: 24px; background-color: #3b82f6; color: #fff; border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; margin-right: 12px; flex-shrink: 0;">${i + 1}</span>
        <span>${point}</span>
      </li>`
    ).join('');

    const marketFactorsHtml = eng.marketFactors.map(factor =>
      `<div style="background-color: #f9f9f9; border-radius: 8px; padding: 12px 16px; margin-bottom: 8px; border-left: 4px solid #3b82f6;">
        <p style="margin: 0 0 4px; font-size: 14px; font-weight: 600; color: #1a1a1a;">${factor.factor}</p>
        <p style="margin: 0; font-size: 13px; color: #6b7280;">${factor.description}</p>
      </div>`
    ).join('');

    const riskFactorsHtml = eng.exchangeOutlook.riskFactors.map(risk =>
      `<li style="font-size: 13px; line-height: 1.6; margin-bottom: 4px;">${risk}</li>`
    ).join('');

    return `
          <!-- 영어 버전 구분선 -->
          <tr>
            <td style="padding: 24px;">
              <div style="border-top: 3px solid #3b82f6; margin: 0;"></div>
              <h2 style="margin: 24px 0 0; font-size: 20px; color: #3b82f6; text-align: center;">
                🌐 English Version
              </h2>
            </td>
          </tr>

          <!-- 영어 제목 & 요약 -->
          <tr>
            <td style="padding: 0 24px 24px;">
              <h2 style="margin: 0 0 16px; font-size: 20px; color: #1a1a1a; line-height: 1.4;">
                ${eng.title}
              </h2>
              <p style="margin: 0; font-size: 15px; color: #4a4a4a; line-height: 1.6;">
                ${eng.summary}
              </p>
            </td>
          </tr>

          <!-- 영어 심층 분석 -->
          <tr>
            <td style="padding: 0 24px 24px;">
              <div style="background-color: #f0f9ff; border-radius: 8px; padding: 16px; border-left: 4px solid #3b82f6;">
                <h3 style="margin: 0 0 12px; font-size: 14px; color: #1e40af;">In-Depth Analysis</h3>
                <p style="margin: 0; font-size: 14px; color: #1e3a5f; line-height: 1.7;">
                  ${eng.detailedAnalysis}
                </p>
              </div>
            </td>
          </tr>

          <!-- 영어 핵심 포인트 -->
          <tr>
            <td style="padding: 0 24px 24px;">
              <h3 style="margin: 0 0 16px; font-size: 16px; color: #1a1a1a;">Key Points</h3>
              <ul style="margin: 0; padding: 0; list-style: none;">
                ${keyPointsHtml}
              </ul>
            </td>
          </tr>

          <!-- 영어 시장 심리 & 환율 전망 -->
          <tr>
            <td style="padding: 0 24px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="48%" style="vertical-align: top; padding-right: 12px;">
                    <div style="background-color: #f9f9f9; border-radius: 8px; padding: 16px;">
                      <h3 style="margin: 0 0 12px; font-size: 14px; color: #6b7280; text-transform: uppercase;">Market Sentiment</h3>
                      <p style="margin: 0; font-size: 13px; color: #4a4a4a; line-height: 1.5;">
                        ${eng.sentimentDescription}
                      </p>
                    </div>
                  </td>
                  <td width="48%" style="vertical-align: top; padding-left: 12px;">
                    <div style="background-color: #f9f9f9; border-radius: 8px; padding: 16px;">
                      <h3 style="margin: 0 0 12px; font-size: 14px; color: #6b7280; text-transform: uppercase;">Exchange Rate Outlook</h3>
                      <div style="margin-bottom: 12px;">
                        <p style="margin: 0 0 4px; font-size: 12px; font-weight: 600; color: #1a1a1a;">Short-term (1 week)</p>
                        <p style="margin: 0; font-size: 13px; color: #4a4a4a; line-height: 1.5;">
                          ${eng.exchangeOutlook.shortTerm}
                        </p>
                      </div>
                      <div>
                        <p style="margin: 0 0 4px; font-size: 12px; font-weight: 600; color: #1a1a1a;">Mid-term (1 month)</p>
                        <p style="margin: 0; font-size: 13px; color: #4a4a4a; line-height: 1.5;">
                          ${eng.exchangeOutlook.midTerm}
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- 영어 영향 요인 -->
          <tr>
            <td style="padding: 0 24px 24px;">
              <h3 style="margin: 0 0 16px; font-size: 16px; color: #1a1a1a;">Key Market Factors</h3>
              ${marketFactorsHtml}
            </td>
          </tr>

          <!-- 영어 리스크 요인 -->
          <tr>
            <td style="padding: 0 24px 24px;">
              <div style="background-color: #fef3c7; border-radius: 8px; padding: 16px; border-left: 4px solid #f59e0b;">
                <h3 style="margin: 0 0 12px; font-size: 14px; color: #92400e;">⚠️ Risk Factors to Watch</h3>
                <ul style="margin: 0; padding: 0 0 0 20px; color: #92400e;">
                  ${riskFactorsHtml}
                </ul>
              </div>
            </td>
          </tr>

          <!-- 영어 투자 팁 -->
          <tr>
            <td style="padding: 0 24px 24px;">
              <div style="background-color: #1a1a1a; border-radius: 8px; padding: 16px; color: #ffffff;">
                <h3 style="margin: 0 0 12px; font-size: 14px; color: #ffffff;">💡 Investment Tip</h3>
                <p style="margin: 0; font-size: 14px; line-height: 1.6; opacity: 0.9;">
                  ${eng.investmentTip}
                </p>
              </div>
            </td>
          </tr>`;
  };

  // 환율 정보 HTML 생성
  const exchangeRateHtml = analysis.currentRate && analysis.currentRate.usd > 0 ? `
          <!-- 실시간 환율 -->
          <tr>
            <td style="padding: 0 24px 24px;">
              <div style="background-color: #f0fdf4; border-radius: 8px; padding: 16px; border: 1px solid #bbf7d0;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                  <h3 style="margin: 0; font-size: 14px; color: #166534;">💱 실시간 환율</h3>
                  <span style="font-size: 11px; color: #6b7280;">${analysis.currentRate.time} 기준</span>
                </div>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="25%" style="text-align: center; padding: 8px;">
                      <p style="margin: 0 0 4px; font-size: 11px; color: #6b7280;">USD</p>
                      <p style="margin: 0 0 4px; font-size: 18px; font-weight: 700; color: #1a1a1a;">${analysis.currentRate.usd.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      <p style="margin: 0; font-size: 11px; color: ${trendColor(analysis.currentRate.usdTrend)}; font-weight: 600;">
                        ${trendArrow(analysis.currentRate.usdTrend)} ${Math.abs(analysis.currentRate.usdChange).toFixed(2)}
                      </p>
                    </td>
                    <td width="25%" style="text-align: center; padding: 8px; border-left: 1px solid #e5e5e5;">
                      <p style="margin: 0 0 4px; font-size: 11px; color: #6b7280;">JPY (100)</p>
                      <p style="margin: 0; font-size: 18px; font-weight: 700; color: #1a1a1a;">${analysis.currentRate.jpy.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </td>
                    <td width="25%" style="text-align: center; padding: 8px; border-left: 1px solid #e5e5e5;">
                      <p style="margin: 0 0 4px; font-size: 11px; color: #6b7280;">EUR</p>
                      <p style="margin: 0; font-size: 18px; font-weight: 700; color: #1a1a1a;">${analysis.currentRate.eur.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </td>
                    <td width="25%" style="text-align: center; padding: 8px; border-left: 1px solid #e5e5e5;">
                      <p style="margin: 0 0 4px; font-size: 11px; color: #6b7280;">CNY</p>
                      <p style="margin: 0; font-size: 18px; font-weight: 700; color: #1a1a1a;">${analysis.currentRate.cny.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>
  ` : '';

  return `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>환율 브리핑</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">

          <!-- 헤더 -->
          <tr>
            <td style="background-color: #1a1a1a; color: #ffffff; padding: 24px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 600;">환율 뉴스 브리핑</h1>
              <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.8;">
                ${new Date(analysis.generatedAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
              </p>
            </td>
          </tr>

          ${exchangeRateHtml}

          <!-- 제목 & 요약 -->
          <tr>
            <td style="padding: 24px;">
              <h2 style="margin: 0 0 16px; font-size: 20px; color: #1a1a1a; line-height: 1.4;">
                ${analysis.title}
              </h2>
              <p style="margin: 0; font-size: 15px; color: #4a4a4a; line-height: 1.6;">
                ${analysis.summary}
              </p>
            </td>
          </tr>

          <!-- 구분선 -->
          <tr>
            <td style="padding: 0 24px;">
              <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 0;">
            </td>
          </tr>

          <!-- 시장 심리 & 환율 전망 -->
          <tr>
            <td style="padding: 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="48%" style="vertical-align: top; padding-right: 12px;">
                    <div style="background-color: #f9f9f9; border-radius: 8px; padding: 16px;">
                      <h3 style="margin: 0 0 12px; font-size: 14px; color: #6b7280; text-transform: uppercase;">시장 심리</h3>
                      <p style="margin: 0 0 8px; font-size: 16px; font-weight: 600;">${sentimentEmoji}</p>
                      <p style="margin: 0 0 12px; font-size: 13px; color: #4a4a4a; line-height: 1.5;">
                        ${analysis.sentiment.description}
                      </p>
                      <!-- 시장 심리 비율 -->
                      <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e5e5;">
                        <div style="margin-bottom: 8px;">
                          <div style="display: flex; justify-content: space-between; font-size: 11px; color: #6b7280; margin-bottom: 4px;">
                            <span>긍정</span>
                            <span>${analysis.sentiment.breakdown.positive}%</span>
                          </div>
                          <div style="background-color: #e5e5e5; border-radius: 4px; height: 6px; overflow: hidden;">
                            <div style="background-color: #22c55e; height: 100%; width: ${analysis.sentiment.breakdown.positive}%;"></div>
                          </div>
                        </div>
                        <div style="margin-bottom: 8px;">
                          <div style="display: flex; justify-content: space-between; font-size: 11px; color: #6b7280; margin-bottom: 4px;">
                            <span>부정</span>
                            <span>${analysis.sentiment.breakdown.negative}%</span>
                          </div>
                          <div style="background-color: #e5e5e5; border-radius: 4px; height: 6px; overflow: hidden;">
                            <div style="background-color: #ef4444; height: 100%; width: ${analysis.sentiment.breakdown.negative}%;"></div>
                          </div>
                        </div>
                        <div>
                          <div style="display: flex; justify-content: space-between; font-size: 11px; color: #6b7280; margin-bottom: 4px;">
                            <span>중립</span>
                            <span>${analysis.sentiment.breakdown.neutral}%</span>
                          </div>
                          <div style="background-color: #e5e5e5; border-radius: 4px; height: 6px; overflow: hidden;">
                            <div style="background-color: #6b7280; height: 100%; width: ${analysis.sentiment.breakdown.neutral}%;"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td width="48%" style="vertical-align: top; padding-left: 12px;">
                    <div style="background-color: #f9f9f9; border-radius: 8px; padding: 16px;">
                      <h3 style="margin: 0 0 12px; font-size: 14px; color: #6b7280; text-transform: uppercase;">환율 전망</h3>
                      <p style="margin: 0 0 8px; font-size: 16px; font-weight: 600;">${directionEmoji}</p>
                      <div style="margin-bottom: 12px;">
                        <p style="margin: 0 0 4px; font-size: 12px; font-weight: 600; color: #1a1a1a;">단기 (1주일)</p>
                        <p style="margin: 0; font-size: 13px; color: #4a4a4a; line-height: 1.5;">
                          ${analysis.exchangeOutlook.shortTerm}
                        </p>
                      </div>
                      <div>
                        <p style="margin: 0 0 4px; font-size: 12px; font-weight: 600; color: #1a1a1a;">중기 (1개월)</p>
                        <p style="margin: 0; font-size: 13px; color: #4a4a4a; line-height: 1.5;">
                          ${analysis.exchangeOutlook.midTerm}
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- 심층 분석 -->
          <tr>
            <td style="padding: 0 24px 24px;">
              <div style="background-color: #f0f9ff; border-radius: 8px; padding: 16px; border-left: 4px solid #3b82f6;">
                <h3 style="margin: 0 0 12px; font-size: 14px; color: #1e40af;">심층 분석</h3>
                <p style="margin: 0; font-size: 14px; color: #1e3a5f; line-height: 1.7;">
                  ${analysis.detailedAnalysis}
                </p>
              </div>
            </td>
          </tr>

          <!-- 핵심 포인트 -->
          <tr>
            <td style="padding: 0 24px 24px;">
              <h3 style="margin: 0 0 16px; font-size: 16px; color: #1a1a1a;">핵심 포인트</h3>
              <ul style="margin: 0; padding: 0; list-style: none;">
                ${analysis.keyPoints.map((point, i) => `
                  <li style="display: flex; margin-bottom: 12px; font-size: 14px; color: #4a4a4a; line-height: 1.5;">
                    <span style="display: inline-block; width: 24px; height: 24px; background-color: #1a1a1a; color: #fff; border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; margin-right: 12px; flex-shrink: 0;">${i + 1}</span>
                    <span>${point}</span>
                  </li>
                `).join('')}
              </ul>
            </td>
          </tr>

          <!-- 영향 요인 -->
          <tr>
            <td style="padding: 0 24px 24px;">
              <h3 style="margin: 0 0 16px; font-size: 16px; color: #1a1a1a;">주요 영향 요인</h3>
              ${analysis.marketFactors.map(factor => `
                <div style="background-color: #f9f9f9; border-radius: 8px; padding: 12px 16px; margin-bottom: 8px; border-left: 4px solid ${impactColor(factor.impact)};">
                  <p style="margin: 0 0 4px; font-size: 14px; font-weight: 600; color: #1a1a1a;">${factor.factor}</p>
                  <p style="margin: 0; font-size: 13px; color: #6b7280;">${factor.description}</p>
                </div>
              `).join('')}
            </td>
          </tr>

          <!-- 리스크 요인 -->
          <tr>
            <td style="padding: 0 24px 24px;">
              <div style="background-color: #fef3c7; border-radius: 8px; padding: 16px; border-left: 4px solid #f59e0b;">
                <h3 style="margin: 0 0 12px; font-size: 14px; color: #92400e;">⚠️ 주의 리스크 요인</h3>
                <ul style="margin: 0; padding: 0 0 0 20px; color: #92400e;">
                  ${analysis.exchangeOutlook.riskFactors.map(risk => `
                    <li style="font-size: 13px; line-height: 1.6; margin-bottom: 4px;">${risk}</li>
                  `).join('')}
                </ul>
              </div>
            </td>
          </tr>

          <!-- 투자 팁 -->
          <tr>
            <td style="padding: 0 24px 24px;">
              <div style="background-color: #1a1a1a; border-radius: 8px; padding: 16px; color: #ffffff;">
                <h3 style="margin: 0 0 12px; font-size: 14px; color: #ffffff;">💡 투자 팁</h3>
                <p style="margin: 0; font-size: 14px; line-height: 1.6; opacity: 0.9;">
                  ${analysis.investmentTip}
                </p>
              </div>
            </td>
          </tr>

          <!-- 참고 뉴스 -->
          <tr>
            <td style="padding: 0 24px 24px;">
              <h3 style="margin: 0 0 16px; font-size: 16px; color: #1a1a1a;">📰 참고 뉴스 (${analysis.sources.length}개)</h3>
              <div style="background-color: #f9f9f9; border-radius: 8px; padding: 16px;">
                ${analysis.sources.slice(0, 15).map((source, index) => `
                  <div style="padding: 10px 0; ${index < analysis.sources.slice(0, 15).length - 1 ? 'border-bottom: 1px solid #e5e5e5;' : ''}">
                    <a href="${source.url}" target="_blank" style="text-decoration: none; color: #1a1a1a; display: flex; gap: 12px;">
                      ${source.thumbnail ? `
                        <img src="${source.thumbnail}" alt="" style="width: 60px; height: 60px; object-fit: cover; border-radius: 4px; flex-shrink: 0;" />
                      ` : ''}
                      <div style="flex: 1; min-width: 0;">
                        <p style="margin: 0 0 4px; font-size: 13px; font-weight: 500; line-height: 1.4; color: #1a1a1a;">
                          ${source.title}
                        </p>
                        <p style="margin: 0; font-size: 11px; color: #6b7280;">
                          ${source.source || '언론사 정보 없음'}
                        </p>
                      </div>
                    </a>
                  </div>
                `).join('')}
                ${analysis.sources.length > 15 ? `
                  <p style="margin: 12px 0 0; font-size: 12px; color: #6b7280; text-align: center;">
                    외 ${analysis.sources.length - 15}개 뉴스 더보기...
                  </p>
                ` : ''}
              </div>
            </td>
          </tr>

          ${generateEnglishSection()}

          <!-- 푸터 -->
          <tr>
            <td style="background-color: #f9f9f9; padding: 20px 24px; text-align: center;">
              <p style="margin: 0 0 8px; font-size: 12px; color: #6b7280;">
                분석된 뉴스: ${analysis.newsCount}개 | Analyzed news: ${analysis.newsCount} articles
              </p>
              <p style="margin: 0; font-size: 11px; color: #9ca3af;">
                본 분석은 AI가 생성한 것으로, 투자 판단의 참고자료로만 활용하시기 바랍니다.<br/>
                This analysis is AI-generated and should be used for reference only.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
