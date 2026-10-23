import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

/**
 * 배포본에서 HTML 주석을 걷는다. JS·CSS 주석은 압축이 이미 지운다.
 * 개발 메모가 npm 패키지에 그대로 실리지 않게 한다 — 소스에는 남는다.
 */
function stripHtmlComments(): Plugin {
  return {
    name: 'strip-html-comments',
    transformIndexHtml: (html) => html.replace(/<!--[\s\S]*?-->\s*/g, ''),
  };
}

// MCP Apps 리소스는 단일 HTML 문자열로 전달돼야 하므로 JS/CSS를 전부 인라인한다.
export default defineConfig({
  root: 'ui',
  plugins: [stripHtmlComments(), viteSingleFile()],
  build: {
    minify: 'esbuild',
    outDir: '../public/ui',
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: {
      // 서버가 읽는 파일명(public/ui/map.html)과 맞춘다.
      input: fileURLToPath(new URL('./ui/map.html', import.meta.url)),
      output: { entryFileNames: '[name].js' },
    },
  },
});
