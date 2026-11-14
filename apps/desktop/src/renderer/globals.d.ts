import type { TbApi } from '@renderer/../shared/api';

declare global {
  interface Window {
    tb: TbApi;
  }
}
