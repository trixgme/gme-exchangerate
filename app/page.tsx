'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MarketFactor {
  factor: string;
  impact: 'positive' | 'negative' | 'neutral';
  description: string;
}

interface AnalysisResult {
  title: string;
  summary: string;
  detailedAnalysis: string;
  keyPoints: string[];
  marketFactors: MarketFactor[];
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
  }[];
  generatedAt: string;
  newsCount: number;
}

interface ApiResponse {
  success: boolean;
  data?: AnalysisResult;
  error?: string;
}

type LoadingStep = 'idle' | 'fetching' | 'crawling' | 'analyzing' | 'done' | 'error';

const LOADING_MESSAGES: Record<LoadingStep, string> = {
  idle: '준비 중...',
  fetching: '뉴스 검색 중...',
  crawling: '본문 크롤링 중...',
  analyzing: 'AI 분석 중...',
  done: '완료!',
  error: '오류 발생',
};

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [loadingStep, setLoadingStep] = useState<LoadingStep>('idle');
  const [progress, setProgress] = useState(0);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAnalysis() {
      try {
        setLoadingStep('fetching');
        setProgress(20);

        const crawlTimer = setTimeout(() => {
          setLoadingStep('crawling');
          setProgress(50);
        }, 2000);

        const analyzeTimer = setTimeout(() => {
          setLoadingStep('analyzing');
          setProgress(80);
        }, 5000);

        const response = await fetch('/api/news/analyze');
        const data: ApiResponse = await response.json();

        clearTimeout(crawlTimer);
        clearTimeout(analyzeTimer);

        if (data.success && data.data) {
          setAnalysis(data.data);
          setLoadingStep('done');
          setProgress(100);
        } else {
          throw new Error(data.error || '분석 실패');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '알 수 없는 오류');
        setLoadingStep('error');
      } finally {
        setLoading(false);
      }
    }

    fetchAnalysis();
  }, []);

  // 로딩 화면
  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container max-w-4xl mx-auto px-4 py-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold tracking-tight">환율 뉴스 브리핑</h1>
            <p className="text-muted-foreground mt-2">AI가 최신 뉴스를 분석하고 있습니다</p>
          </div>

          <Card className="mb-8">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center space-y-4">
                <div className="h-12 w-12 rounded-full border-4 border-muted border-t-primary animate-spin" />
                <p className="font-medium">{LOADING_MESSAGES[loadingStep]}</p>
                <Progress value={progress} className="w-full max-w-xs" />
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader><Skeleton className="h-5 w-24" /></CardHeader>
                <CardContent><Skeleton className="h-20 w-full" /></CardContent>
              </Card>
              <Card>
                <CardHeader><Skeleton className="h-5 w-24" /></CardHeader>
                <CardContent><Skeleton className="h-20 w-full" /></CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 에러 화면
  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-destructive">오류 발생</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => window.location.reload()} className="w-full">
              다시 시도
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!analysis) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* 헤더 */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <h1 className="font-semibold">환율 뉴스 브리핑</h1>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {new Date(analysis.generatedAt).toLocaleString('ko-KR')}
            </span>
            <Badge variant="secondary">{analysis.newsCount}개</Badge>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="container max-w-4xl mx-auto px-4 py-6 space-y-6">

        {/* 요약 카드 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl leading-tight">{analysis.title}</CardTitle>
            <CardDescription className="text-base">{analysis.summary}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg bg-muted p-4">
              <h3 className="font-semibold mb-2">심층 분석</h3>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                {analysis.detailedAnalysis}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 시장 심리 & 환율 전망 */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* 시장 심리 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">시장 심리 분석</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    analysis.sentiment.overall === 'positive' ? 'default' :
                    analysis.sentiment.overall === 'negative' ? 'destructive' : 'secondary'
                  }
                >
                  {analysis.sentiment.overall === 'positive' ? '긍정적' :
                   analysis.sentiment.overall === 'negative' ? '부정적' : '중립적'}
                </Badge>
                <span className="text-sm font-medium">
                  {(analysis.sentiment.score * 100).toFixed(0)}점
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{analysis.sentiment.description}</p>
              <Separator />
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>긍정</span>
                    <span>{analysis.sentiment.breakdown.positive}%</span>
                  </div>
                  <Progress value={analysis.sentiment.breakdown.positive} className="h-1.5" />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>부정</span>
                    <span>{analysis.sentiment.breakdown.negative}%</span>
                  </div>
                  <Progress value={analysis.sentiment.breakdown.negative} className="h-1.5" />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>중립</span>
                    <span>{analysis.sentiment.breakdown.neutral}%</span>
                  </div>
                  <Progress value={analysis.sentiment.breakdown.neutral} className="h-1.5" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 환율 전망 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">환율 전망</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Badge variant="outline" className="text-sm">
                {analysis.exchangeOutlook.direction === 'up' && '📈 상승 (원화 약세)'}
                {analysis.exchangeOutlook.direction === 'down' && '📉 하락 (원화 강세)'}
                {analysis.exchangeOutlook.direction === 'stable' && '➡️ 보합세'}
                {analysis.exchangeOutlook.direction === 'uncertain' && '❓ 불확실'}
              </Badge>
              <Separator />
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium mb-1">단기 (1주일)</p>
                  <p className="text-sm text-muted-foreground">{analysis.exchangeOutlook.shortTerm}</p>
                </div>
                <div>
                  <p className="text-xs font-medium mb-1">중기 (1개월)</p>
                  <p className="text-sm text-muted-foreground">{analysis.exchangeOutlook.midTerm}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 영향 요인 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">주요 영향 요인</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {analysis.marketFactors.map((factor, index) => (
                <div
                  key={index}
                  className={`rounded-lg border p-3 ${
                    factor.impact === 'positive' ? 'border-green-200 bg-green-50 dark:bg-green-950/20' :
                    factor.impact === 'negative' ? 'border-red-200 bg-red-50 dark:bg-red-950/20' :
                    'border-border bg-muted/50'
                  }`}
                >
                  <p className="font-medium text-sm mb-1">{factor.factor}</p>
                  <Badge
                    variant={factor.impact === 'negative' ? 'destructive' : 'secondary'}
                    className="text-xs mb-2"
                  >
                    {factor.impact === 'positive' ? '강세 요인' :
                     factor.impact === 'negative' ? '약세 요인' : '중립'}
                  </Badge>
                  <p className="text-xs text-muted-foreground">{factor.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 핵심 포인트 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">핵심 포인트</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {analysis.keyPoints.map((point, index) => (
                <li key={index} className="flex gap-3 items-start">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                    {index + 1}
                  </span>
                  <span className="text-sm">{point}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* 리스크 */}
        <Alert variant="destructive" className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-200 [&>svg]:text-amber-600">
          <AlertTitle>주의 리스크 요인</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 space-y-1">
              {analysis.exchangeOutlook.riskFactors.map((risk, index) => (
                <li key={index} className="text-sm flex items-start gap-2">
                  <span>•</span>
                  <span>{risk}</span>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>

        {/* 투자 팁 */}
        <Card className="bg-primary text-primary-foreground">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">💡 투자 팁</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm opacity-90 leading-relaxed">{analysis.investmentTip}</p>
          </CardContent>
        </Card>

        {/* 참고 뉴스 */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">참고 뉴스</CardTitle>
              <Badge variant="outline">{analysis.sources.length}개</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px] pr-4">
              <div className="space-y-2">
                {analysis.sources.map((source, index) => (
                  <a
                    key={index}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-2 rounded-md hover:bg-muted transition-colors"
                  >
                    <p className="text-sm font-medium line-clamp-1 hover:text-primary">
                      {source.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {source.source || '언론사 정보 없음'}
                    </p>
                  </a>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* 업데이트 버튼 */}
        <div className="flex justify-center pb-6">
          <Button size="lg" onClick={() => window.location.reload()}>
            🔄 새로고침
          </Button>
        </div>
      </main>

      {/* 푸터 */}
      <footer className="border-t py-6">
        <div className="container max-w-4xl mx-auto px-4 text-center">
          <p className="text-xs text-muted-foreground">
            본 분석은 AI가 생성한 것으로, 투자 판단의 참고자료로만 활용하시기 바랍니다.
          </p>
        </div>
      </footer>
    </div>
  );
}
