import type { Metadata } from 'next'
import './globals.css'

import { LocaleRuntime } from '@/components/locale-runtime'
import { NavigationFeedback } from '@/components/navigation-feedback'
import { siteConfig } from '@/lib/content'

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.name,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  alternates: {
    canonical: '/',
  },
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/apple-touch-icon.png',
  },
}

const themeScript = `
(function(){
  try {
    var stored = localStorage.getItem('guanzizai:theme');
    var dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', dark);
  } catch (err) {}
})();
`

const localeScript = `
(function(){
  try {
    var stored = localStorage.getItem('guanzizai:locale');
    var languages = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
    var wantsHant = languages.some(function(language) {
      var value = String(language || '').toLowerCase();
      return value === 'zh-hant' || value.indexOf('zh-hant-') === 0 || value === 'zh-tw' || value.indexOf('zh-tw-') === 0 || value === 'zh-hk' || value.indexOf('zh-hk-') === 0 || value === 'zh-mo' || value.indexOf('zh-mo-') === 0;
    });
    var locale = stored === 'zh-Hans' || stored === 'zh-Hant' ? stored : wantsHant ? 'zh-Hant' : 'zh-Hans';
    document.documentElement.lang = locale;
    document.documentElement.dataset.locale = locale;
  } catch (err) {}
})();
`

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hans" data-locale="zh-Hans" suppressHydrationWarning>
      <head>
        <link rel="preload" href="/fonts/guanzizai-cjk-ext-fallback.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://fontsapi.zeoseven.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://fontsapi-storage.zeoseven.com" crossOrigin="anonymous" />
      </head>
      <body>
        <script dangerouslySetInnerHTML={{ __html: localeScript }} />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <LocaleRuntime />
        <NavigationFeedback />
        {children}
      </body>
    </html>
  )
}
