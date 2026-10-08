import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitepress';
import { blockwellPalette } from '../../../packages/vue/vite.palette.js';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const REPO = 'https://github.com/l02162010/blockwell';

// BASE is set by the Pages build (/blockwell/docs/).
export default defineConfig({
  base: process.env.BASE ?? '/',
  lang: 'zh-Hant',
  title: 'Blockwell',
  description: '不存 HTML 的區塊式富文本編輯器：JSON 是唯一真相，schema 是安全邊界。',
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ['link', { rel: 'icon', href: `${process.env.BASE ?? '/'}favicon.svg`, type: 'image/svg+xml' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..24,300..500,0..1,0&display=block' }],
  ],
  themeConfig: {
    logo: '/favicon.svg',
    nav: [
      { text: '指南', link: '/guide/getting-started', activeMatch: '/guide/' },
      { text: 'API', link: '/api/blockwell-editor', activeMatch: '/api/' },
      { text: 'Playground', link: 'https://l02162010.github.io/blockwell/playground/' },
    ],
    sidebar: {
      '/guide/': [
        { text: '開始', items: [
          { text: '快速開始', link: '/guide/getting-started' },
          { text: '文件格式', link: '/guide/document' },
          { text: '安全模型', link: '/guide/security' },
        ] },
        { text: '使用編輯器', items: [
          { text: '三種外觀', link: '/guide/variants' },
          { text: '圖片上傳', link: '/guide/uploads' },
          { text: '提及', link: '/guide/mentions' },
          { text: '協作、留言與版本', link: '/guide/collaboration' },
          { text: '儲存與錯誤', link: '/guide/saving' },
        ] },
        { text: '自訂', items: [
          { text: '文字與語言', link: '/guide/messages' },
          { text: '外觀與色盤', link: '/guide/theming' },
          { text: 'Headless：自己做介面', link: '/guide/headless' },
          { text: '自訂指令', link: '/guide/commands' },
        ] },
        { text: '伺服器與資料', items: [
          { text: '後端驗證', link: '/guide/server' },
          { text: '舊內容遷移', link: '/guide/migration' },
        ] },
        { text: '品質', items: [
          { text: '瀏覽器支援與測試', link: '/guide/testing' },
        ] },
      ],
      '/api/': [
        { text: '@blockwell/vue', items: [
          { text: '&lt;BlockwellEditor&gt;', link: '/api/blockwell-editor' },
          { text: '面板元件', link: '/api/panels' },
          { text: 'Headless', link: '/api/headless' },
        ] },
        { text: '@blockwell/core', items: [
          { text: 'Editor', link: '/api/editor' },
          { text: 'Editor 事件', link: '/api/events' },
          { text: '其他匯出', link: '/api/core' },
        ] },
      ],
    },
    socialLinks: [{ icon: 'github', link: REPO }],
    editLink: { pattern: `${REPO}/edit/main/apps/docs/:path`, text: '在 GitHub 上編輯此頁' },
    search: { provider: 'local' },
    outline: { label: '本頁內容', level: [2, 3] },
    docFooter: { prev: '上一頁', next: '下一頁' },
    lastUpdated: { text: '最後更新' },
    footer: { message: 'MIT License', copyright: 'Blockwell' },
  },
  vite: {
    plugins: [blockwellPalette()],
    resolve: {
      alias: {
        '@blockwell/schema': src('../../../packages/schema/src/index.ts'),
        '@blockwell/core': src('../../../packages/core/src/index.ts'),
        '@blockwell/vue': src('../../../packages/vue/src/index.ts'),
      },
    },
    ssr: { noExternal: ['@blockwell/vue', '@blockwell/core', '@blockwell/schema'] },
  },
});
