import { z } from 'zod';

export const mapConfigOutputSchema = {
  baseUrl: z.string().describe('INAVI Maps API 기본 주소 (API Key 경로 앞부분까지)'),
  appkey: z.string().describe('Web SDK 로더 URL에 넣을 API Key'),
};
