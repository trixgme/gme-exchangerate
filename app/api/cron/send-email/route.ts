import { NextResponse } from 'next/server';
import { Resend } from 'resend';

// Vercel Cron 인증
export async function GET(request: Request) {
  // Cron 인증 확인 (Vercel Cron에서 호출 시)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // 개발 환경에서는 허용
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
      to: process.env.EMAIL_TO?.split(',') || [],
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
  sources: { title: string; source: string; url: string }[];
  generatedAt: string;
  newsCount: number;
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
                      <p style="margin: 0; font-size: 13px; color: #4a4a4a; line-height: 1.5;">
                        ${analysis.sentiment.description}
                      </p>
                    </div>
                  </td>
                  <td width="48%" style="vertical-align: top; padding-left: 12px;">
                    <div style="background-color: #f9f9f9; border-radius: 8px; padding: 16px;">
                      <h3 style="margin: 0 0 12px; font-size: 14px; color: #6b7280; text-transform: uppercase;">환율 전망</h3>
                      <p style="margin: 0 0 8px; font-size: 16px; font-weight: 600;">${directionEmoji}</p>
                      <p style="margin: 0; font-size: 13px; color: #4a4a4a; line-height: 1.5;">
                        <strong>단기:</strong> ${analysis.exchangeOutlook.shortTerm}
                      </p>
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

          <!-- 푸터 -->
          <tr>
            <td style="background-color: #f9f9f9; padding: 20px 24px; text-align: center;">
              <p style="margin: 0 0 8px; font-size: 12px; color: #6b7280;">
                분석된 뉴스: ${analysis.newsCount}개
              </p>
              <p style="margin: 0; font-size: 11px; color: #9ca3af;">
                본 분석은 AI가 생성한 것으로, 투자 판단의 참고자료로만 활용하시기 바랍니다.
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
