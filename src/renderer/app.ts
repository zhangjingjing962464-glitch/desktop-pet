// App 组合层：场景 + 角色 + 动画 + 输入

import * as THREE from 'three';
import { SceneManager } from './three/scene-manager.js';
import { setupLighting } from './three/lighting.js';
import { RenderLoop } from './three/render-loop.js';
import { CharacterLoader } from './character/character-loader.js';
import { CharacterController } from './character/character-controller.js';
import { CharacterCache } from './character/character-cache.js';
import { CharacterRegistry } from './character/character-registry.js';
import { AnimationManager } from './animation/animation-manager.js';
import { RandomScheduler } from './animation/random-scheduler.js';
import { PixelHitTester } from './input/pixel-hit-test.js';
import { WheelZoom } from './input/wheel-zoom.js';
import { DragController } from './input/drag-controller.js';
import { ClickRouter } from './input/click-router.js';
import { ContextMenuTrigger } from './input/context-menu.js';
import { weightedPick } from '@shared/utils/math.js';
import { pickLongestAction } from './animation/longest-action.js';
import { SOCIAL_ANIMS, DRAG_ANIMS, SETTLE_ANIMS } from '@shared/domain/animation.js';
import { cmToPx, computeWindowPx, computeActionWindowPx } from '@shared/constants/physical.js';
import { INTERACTION_TIME_SCALE } from '@shared/constants/time.js';
import { createLogger } from '@shared/utils/logger.js';

const log = createLogger('app');

const UI = {
  loading: document.getElementById('loading-indicator') as HTMLDivElement,
  toast: document.getElementById('toast') as HTMLDivElement,
};

function setLoading(visible: boolean): void {
  if (UI.loading) UI.loading.hidden = !visible;
}

function showToast(text: string, durationMs = 2000): void {
  if (!UI.toast) return;
  UI.toast.textContent = text;
  UI.toast.hidden = false;
  window.setTimeout(() => {
    UI.toast.hidden = true;
  }, durationMs);
}

class App {
  private readonly sceneMgr: SceneManager;
  private readonly renderLoop = new RenderLoop();
  private controller: CharacterController | null = null;
  private animationManager: AnimationManager | null = null;
  private scheduler: RandomScheduler | null = null;
  private hitTester: PixelHitTester | null = null;
  private readonly clickRouter = new ClickRouter();
  private readonly dragController = new DragController();
  private readonly contextMenu = new ContextMenuTrigger();
  private wheelZoom: WheelZoom | null = null;
  private dragResumeRandom: (() => void) | null = null;
  private currentCharacterId: string | null = null;
  private ppi = 96;
  private readonly cache = new CharacterCache();
  private readonly registry = new CharacterRegistry();
  private readonly loader = new CharacterLoader();
  private readonly switchHistory: string[] = [];
  /** 切换角色串行化 */
  private switchInProgress = false;
  private pendingSwitchId: string | null = null;

  /** 动态窗口大小：动作期间扩窗口，idle 时收回 */
  private actionDepth = 0;
  private currentSizeCm = 2;

  constructor(canvas: HTMLCanvasElement) {
    this.sceneMgr = new SceneManager(canvas);
    setupLighting(this.sceneMgr.scene);
  }

  fit(): void {
    this.sceneMgr.resize(window.innerWidth, window.innerHeight);
  }

  async start(): Promise<void> {
    if (!window.pet) throw new Error('preload api (window.pet) 未就绪');

    this.fit();
    window.addEventListener('resize', () => this.fit());

    const settings = await window.pet.settings.get();
    const display = await window.pet.display.getMetrics();
    this.ppi = display.estimatedPpi;
    this.currentSizeCm = settings.sizeCm;
    log.info(`settings: character=${settings.selectedCharacterId} size=${settings.sizeCm}cm ppi=${this.ppi}`);
    // 同步 modelPx 给 SceneManager，确保 frustum 与窗口尺寸匹配
    this.sceneMgr.setModelPx(cmToPx(settings.sizeCm, this.ppi));

    // 注入 GPU 各向异性上限给 loader，让所有材质贴图在缩放后保留瞳孔/睫毛细节
    this.loader.maxAnisotropy = this.sceneMgr.renderer.capabilities.getMaxAnisotropy();
    log.info(`renderer max anisotropy=${this.loader.maxAnisotropy}`);

    // 加载 manifest（M4）
    await this.registry.load();

    // 若 settings 里的角色已从 manifest 移除（如开发删了某些 GLB），回退到第一个可用角色
    let targetCharacterId = settings.selectedCharacterId;
    if (!this.registry.find(targetCharacterId)) {
      const first = this.registry.list()[0]?.id;
      if (first) {
        log.warn(`selectedCharacterId=${targetCharacterId} 已不在 manifest，回退到 ${first}`);
        targetCharacterId = first;
        void window.pet.settings.patch({ selectedCharacterId: first });
      }
    }

    setLoading(true);
    try {
      await this.loadCharacter(targetCharacterId);
    } catch (err) {
      log.error('character load failed', err);
      showToast('角色加载失败');
    } finally {
      setLoading(false);
    }

    // 输入层
    this.installInput(settings.sizeCm);

    // 取消启动预热：5MB GLB 解析阻塞 main thread 影响交互；改为切换时按需加载

    // 监听设置变更（右键切换角色会写设置）
    log.info('[trace] app: registering settings.onChange listener');
    const off = window.pet.settings.onChange((next) => {
      console.warn('[settings-onChange-fired]', JSON.stringify({ selectedCharacterId: next.selectedCharacterId, cur: this.currentCharacterId, sizeCm: next.sizeCm }));
      log.info(`[trace] settings.onChange selectedCharacterId=${next.selectedCharacterId} cur=${this.currentCharacterId} sizeCm=${next.sizeCm}`);
      if (next.selectedCharacterId !== this.currentCharacterId) {
        log.info(`[trace] -> dispatch switchCharacter ${next.selectedCharacterId}`);
        void this.switchCharacter(next.selectedCharacterId);
      }
      if (this.wheelZoom && Math.abs(next.sizeCm - this.wheelZoom.getSizeCm()) > 0.01) {
        this.wheelZoom.setSizeCm(next.sizeCm);
        this.applyWindowSize(next.sizeCm);
      }
    });
    log.info(`[trace] app: settings.onChange listener registered, off=${typeof off}`);

    // 工作-休息-饭点
    window.pet.reminder.onEnterResting(() => void this.onEnterResting());
    window.pet.reminder.onExitResting(() => void this.onExitResting());
    window.pet.reminder.onMealTrigger((meal) => {
      const label = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' }[meal] ?? '吃饭';
      showToast(`${label}时间到啦`, 4000);
      void this.withExpandedWindow(async () => {
        await this.playPick(SOCIAL_ANIMS);
      });
    });

    // 渲染循环
    this.renderLoop.onTick((dt) => {
      this.animationManager?.update(dt);
      this.tickHitTest();
      this.sceneMgr.render();
    });
    this.renderLoop.start();
  }

  private async loadCharacter(id: string): Promise<void> {
    // 串行化：同时只跑一次切换；若再来新请求，记下 pending，跑完后再切
    if (this.switchInProgress) {
      log.info(`switch already running, queue pending=${id}`);
      this.pendingSwitchId = id;
      return;
    }
    this.switchInProgress = true;
    try {
      await this.doLoadCharacter(id);
      // 处理 pending
      while (this.pendingSwitchId && this.pendingSwitchId !== this.currentCharacterId) {
        const next = this.pendingSwitchId;
        this.pendingSwitchId = null;
        await this.doLoadCharacter(next);
      }
      this.pendingSwitchId = null;
    } finally {
      this.switchInProgress = false;
    }
  }

  private async doLoadCharacter(id: string): Promise<void> {
    log.info(`doLoadCharacter id=${id}`);
    // 1. 加载或命中缓存
    let controller = this.cache.get(id);
    if (!controller) {
      const url = await window.pet.characters.assetUrl(id);
      controller = await this.loader.load(id, url);
      const meta = this.registry.find(id);
      this.cache.put(id, controller, meta?.bytes ?? 6_000_000);
    } else {
      log.info(`cache hit id=${id}`);
    }

    if (this.controller === controller) {
      // 已经是当前角色，无需切换
      return;
    }

    // 2. 停掉旧的：scheduler 先停，再 dispose 动画管理器，最后 detach
    if (this.controller) {
      this.scheduler?.stop();
      this.scheduler = null;
      this.animationManager?.dispose();
      this.animationManager = null;
      this.controller.detachFrom(this.sceneMgr.scene);
      this.cache.unlock(this.currentCharacterId ?? '');
    }

    // 3. 装新的
    controller.attachTo(this.sceneMgr.scene);
    this.controller = controller;
    this.currentCharacterId = id;
    this.cache.lock(id);
    this.animationManager = new AnimationManager(controller.mixer, controller.clips);

    this.switchHistory.unshift(id);
    if (this.switchHistory.length > 8) this.switchHistory.length = 8;

    if (this.hitTester) {
      this.hitTester.setModel(controller.root);
    } else {
      this.hitTester = new PixelHitTester(this.sceneMgr.camera, controller.root);
    }

    // 4. 启动 idle + scheduler
    void this.playIdle();
    this.scheduler = new RandomScheduler(this.animationManager, {
      returnToIdle: () => this.playIdle(),
      onActionStart: () => this.enterAction(),
      onActionEnd: () => this.leaveAction(),
    });
    this.scheduler.start();
    log.info(`scheduler started for ${id}`);
  }

  /** 预热历史最近 N 个角色（不挂到场景，仅入缓存） */
  private async warmupRecent(n: number): Promise<void> {
    const list = this.registry.list();
    const candidates = list
      .filter((c) => c.id !== this.currentCharacterId && this.cache.get(c.id) === null)
      .slice(0, n);
    for (const meta of candidates) {
      try {
        const url = await window.pet.characters.assetUrl(meta.id);
        const ctrl = await this.loader.load(meta.id, url);
        this.cache.put(meta.id, ctrl, meta.bytes);
        log.info(`warmup ${meta.id} (cache size=${this.cache.size()})`);
      } catch (err) {
        log.warn(`warmup ${meta.id} failed`, err);
      }
    }
  }

  private async switchCharacter(id: string): Promise<void> {
    setLoading(true);
    try {
      await this.loadCharacter(id);
    } catch (err) {
      log.error('switch character failed', err);
      showToast('切换角色失败');
    } finally {
      setLoading(false);
    }
  }

  private async playIdle(): Promise<void> {
    if (!this.animationManager) return;
    const idleName = this.animationManager.has('Idle_Base')
      ? 'Idle_Base'
      : this.animationManager.has('Idle_In')
        ? 'Idle_In'
        : null;
    if (!idleName) {
      log.warn('no Idle_Base / Idle_In, playing first clip');
      const first = this.controller?.clips.keys().next().value;
      if (first) await this.animationManager.play(first, { loop: THREE.LoopRepeat, repetitions: Infinity });
      return;
    }
    await this.animationManager.play(idleName, { loop: THREE.LoopRepeat, repetitions: Infinity });
  }

  // ---- 输入层 ----

  private installInput(initialSizeCm: number): void {
    const root: Window = window;

    // 右键菜单
    this.contextMenu.attach(root);

    // 点击
    this.clickRouter.attach(root);
    this.clickRouter.onClick(() => void this.onClickModel());

    // 拖拽
    this.dragController.attach(root);
    this.dragController.onChange(({ dragging }) => {
      this.clickRouter.setDragging(dragging);
      if (dragging) {
        this.dragResumeRandom = this.scheduler?.pauseFor('dragging') ?? null;
        void this.enterAction(); // 拖拽期间窗口扩展
        void this.playPick(DRAG_ANIMS, { repeat: true });
      } else {
        this.dragResumeRandom?.();
        this.dragResumeRandom = null;
        void this.leaveAction();
        void this.playPick(SETTLE_ANIMS);
      }
    });

    // 滚轮缩放
    this.wheelZoom = new WheelZoom(initialSizeCm);
    this.wheelZoom.attach(root);
    this.wheelZoom.onChange((cm) => {
      this.applyWindowSize(cm);
      void window.pet.settings.patch({ sizeCm: cm });
    });
  }

  private applyWindowSize(cm: number): void {
    this.currentSizeCm = cm;
    const modelPx = cmToPx(cm, this.ppi);
    const totalPx = this.actionDepth > 0 ? computeActionWindowPx(modelPx) : computeWindowPx(modelPx);
    this.sceneMgr.setModelPx(modelPx);
    void window.pet.window.setSize({ widthPx: totalPx, heightPx: totalPx, anchor: 'center' });
  }

  /** 进入动作：窗口扩到 ACTION 倍数（重入计数，仅 0→1 时实际扩窗口） */
  private async enterAction(): Promise<void> {
    if (this.actionDepth === 0) {
      const modelPx = cmToPx(this.currentSizeCm, this.ppi);
      const totalPx = computeActionWindowPx(modelPx);
      await window.pet.window.setSize({ widthPx: totalPx, heightPx: totalPx, anchor: 'center' });
    }
    this.actionDepth++;
  }

  private async leaveAction(): Promise<void> {
    this.actionDepth = Math.max(0, this.actionDepth - 1);
    if (this.actionDepth === 0) {
      const modelPx = cmToPx(this.currentSizeCm, this.ppi);
      const totalPx = computeWindowPx(modelPx);
      await window.pet.window.setSize({ widthPx: totalPx, heightPx: totalPx, anchor: 'center' });
    }
  }

  private async withExpandedWindow<T>(fn: () => Promise<T>): Promise<T> {
    await this.enterAction();
    try {
      return await fn();
    } finally {
      await this.leaveAction();
    }
  }

  private async onClickModel(): Promise<void> {
    if (!this.animationManager) return;
    await this.withExpandedWindow(async () => {
      await this.playPick(SOCIAL_ANIMS);
    });
    void this.playIdle();
  }

  private restResumeRandom: (() => void) | null = null;

  /** 进入休息：暂停随机调度，播最长动画 */
  private async onEnterResting(): Promise<void> {
    log.info('enter resting');
    showToast('该休息一下啦，小英雄陪你～', 4000);
    this.restResumeRandom = this.scheduler?.pauseFor('resting') ?? null;
    const clip = this.controller ? pickLongestAction(this.controller.clips) : null;
    if (clip && this.animationManager) {
      await this.animationManager.play(clip.name);
      // 播完保持 Idle 循环
      void this.playIdle();
    }
  }

  /** 退出休息：恢复 idle + 随机调度 */
  private async onExitResting(): Promise<void> {
    log.info('exit resting');
    this.restResumeRandom?.();
    this.restResumeRandom = null;
    void this.playIdle();
  }

  private async playPick(names: ReadonlyArray<string>, opts?: { repeat?: boolean }): Promise<void> {
    if (!this.animationManager) return;
    const available = names.filter((n) => this.animationManager?.has(n));
    if (available.length === 0) return;
    const picked = weightedPick(available.map((v) => ({ value: v, weight: 1 })));
    if (opts?.repeat) {
      // 拖拽期间的 Run 循环走原速；不减速否则跑步看上去拖泥带水
      await this.animationManager.play(picked, { loop: THREE.LoopRepeat, repetitions: Infinity });
    } else {
      // 点击触发的 social 动作叠加全局减速，让动作播得清楚一些
      await this.animationManager.play(picked, { loop: THREE.LoopOnce, timeScale: INTERACTION_TIME_SCALE });
    }
  }

  // ---- 鼠标穿透 ----

  private tickHitTest(): void {
    const t = this.hitTester;
    if (!t) return;
    const x = this.lastMouseX;
    const y = this.lastMouseY;
    t.update(x, y, window.innerWidth, window.innerHeight);
    void t.syncWindowState();
  }

  private lastMouseX = -1000;
  private lastMouseY = -1000;
  trackMouse(x: number, y: number): void {
    this.lastMouseX = x;
    this.lastMouseY = y;
  }
}

export async function startApp(): Promise<void> {
  const canvas = document.getElementById('pet-canvas') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('canvas not found');
  const app = new App(canvas);
  // mousemove 必须在 window 上全局追踪（鼠标穿透时 canvas 收不到事件）
  window.addEventListener('mousemove', (e) => app.trackMouse(e.clientX, e.clientY));
  await app.start();
}
