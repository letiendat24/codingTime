import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://codingtime.dev';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/', '/settings/', '/learning-history/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
