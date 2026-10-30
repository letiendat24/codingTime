import type { Metadata, Viewport } from 'next';
import { AppShell } from '../components/layout/app-shell';
import './globals.css';
import { Providers } from './providers';

const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://codingtime.dev'
    : 'http://localhost:3000');

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F8F8F6' },
    { media: '(prefers-color-scheme: dark)', color: '#0B0F19' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'CodingTime — Nền Tảng Học Lập Trình Thực Chiến & Video Code-Along',
    template: '%s | CodingTime',
  },
  description:
    'CodingTime là nền tảng học lập trình thực chiến thế hệ mới: Kết hợp video code-along đồng bộ dòng code thời gian thực, môi trường thực hành Monaco tích hợp, hệ thống chấm điểm tự động và đánh giá dự án thực tế.',
  applicationName: 'CodingTime',
  authors: [{ name: 'CodingTime Team', url: siteUrl }],
  generator: 'Next.js',
  keywords: [
    'CodingTime',
    'học lập trình',
    'video code along',
    'lập trình trực tuyến',
    'học code thực chiến',
    'video code sync',
    'web development',
    'typescript',
    'javascript',
    'react',
    'next.js',
    'node.js',
    'luyện tập thuật toán',
    'chấm bài tự động',
    'online judge',
    'project grading',
    'khóa học lập trình',
  ],
  referrer: 'origin-when-cross-origin',
  creator: 'CodingTime',
  publisher: 'CodingTime',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: '/',
    languages: {
      'vi-VN': '/',
      'en-US': '/en',
    },
  },
  openGraph: {
    type: 'website',
    locale: 'vi_VN',
    alternateLocale: ['en_US'],
    url: siteUrl,
    siteName: 'CodingTime',
    title: 'CodingTime — Nền Tảng Học Lập Trình Thực Chiến & Video Code-Along',
    description:
      'Học lập trình thực chiến với video code-along đồng bộ dòng code thời gian thực, workspace Monaco tích hợp, hệ thống chấm thuật toán tự động và đánh giá dự án GitHub.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'CodingTime — Interactive Coding & Video-Code Sync Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CodingTime — Nền Tảng Học Lập Trình Thực Chiến & Video Code-Along',
    description:
      'Học lập trình thực chiến với video code-along đồng bộ thời gian thực, workspace Monaco tích hợp và hệ thống chấm điểm tự động.',
    images: ['/og-image.png'],
    creator: '@codingtime',
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    shortcut: '/favicon.ico',
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: '/manifest.webmanifest',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      url: siteUrl,
      name: 'CodingTime',
      description: 'Nền Tảng Học Lập Trình Thực Chiến & Video Code-Along',
      publisher: {
        '@id': `${siteUrl}/#organization`,
      },
      potentialAction: [
        {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${siteUrl}/courses?q={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      ],
      inLanguage: ['vi-VN', 'en-US'],
    },
    {
      '@type': 'EducationalOrganization',
      '@id': `${siteUrl}/#organization`,
      name: 'CodingTime',
      url: siteUrl,
      logo: `${siteUrl}/icon.svg`,
      description:
        'CodingTime cung cấp giải pháp học lập trình tương tác qua video code-along, thực hành trên nền tảng web IDE và chấm bài tự động.',
      sameAs: ['https://github.com/codingtime'],
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/icon.svg?v=2" type="image/svg+xml" />
        <link rel="icon" href="/favicon-32x32.png?v=2" type="image/png" sizes="32x32" />
        <link rel="icon" href="/favicon-16x16.png?v=2" type="image/png" sizes="16x16" />
        <link rel="shortcut icon" href="/favicon.ico?v=2" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png?v=2" sizes="180x180" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
