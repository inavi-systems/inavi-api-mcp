import { App } from '@modelcontextprotocol/ext-apps';

/** 템플릿 전체가 공유하는 단일 App 인스턴스. 연결(`connect`)은 main.ts가 한 번만 수행한다. */
export const app = new App({ name: 'INAVI Maps View', version: '0.1.0' });
