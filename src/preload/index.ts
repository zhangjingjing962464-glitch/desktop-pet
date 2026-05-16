// preload 入口：把 api 通过 contextBridge 暴露给 renderer

import { contextBridge } from 'electron';
import { api } from './api.js';

contextBridge.exposeInMainWorld('pet', api);
