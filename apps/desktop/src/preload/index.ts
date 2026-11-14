import { contextBridge } from 'electron';
import type { TbApi } from '../shared/api';

// Placeholder: Task 3.3 replaces this marker with the real TbApi.
const tb: TbApi = { ready: true };
contextBridge.exposeInMainWorld('tb', tb);
