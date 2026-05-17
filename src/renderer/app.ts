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
import { DragController } from './input/drag-controller.js';
import { ClickRouter } from './input/click-router.js';
import { ContextMenuTrigger } from './input/context-menu.js';
import { weightedPick } from '@shared/utils/math.js';
import { SOCIAL_ANIMS, DRAG_ANIMS, SETTLE_ANIMS } from '@shared/domain/animation.js';
import { DEFAULT_SIZE_CM, cmToPx } from '@shared/constants/physical.js';
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

  /** 动作期间的引用计数（其他代码可能依赖；窗口已固定，不再扩缩） */
  private actionDepth = 0;

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
    // 用 ResizeObserver 替代 window resize 监听：layout 后 paint 前的同步阶段触发，
    // 避免 commit setSize 后那一帧 drawingBuffer 与 canvas CSS 不匹配导致的跳闪。
    const ro = new ResizeObserver(() => this.fit());
    ro.observe(document.documentElement);

    const settings = await window.pet.settings.get();
    const display = await window.pet.display.getMetrics();
    this.ppi = display.estimatedPpi;
    log.info(`settings: character=${settings.selectedCharacterId} size=${DEFAULT_SIZE_CM}cm ppi=${this.ppi}`);
    // 同步 modelPx 给 SceneManager，确保 frustum 与窗口尺寸匹配
    this.sceneMgr.setModelPx(cmToPx(DEFAULT_SIZE_CM, this.ppi));

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
    this.installInput();

    // 取消启动预热：5MB GLB 解析阻塞 main thread 影响交互；改为切换时按需加载

    // 监听设置变更（右键切换角色会写设置）
    log.info('[trace] app: registering settings.onChange listener');
    const off = window.pet.settings.onChange((next) => {
      console.warn('[settings-onChange-fired]', JSON.stringify({ selectedCharacterId: next.selectedCharacterId, cur: this.currentCharacterId }));
      log.info(`[trace] settings.onChange selectedCharacterId=${next.selectedCharacterId} cur=${this.currentCharacterId}`);
      if (next.selectedCharacterId !== this.currentCharacterId) {
        log.info(`[trace] -> dispatch switchCharacter ${next.selectedCharacterId}`);
        void this.switchCharacter(next.selectedCharacterId);
      }
    });
    log.info(`[trace] app: settings.onChange listener registered, off=${typeof off}`);

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

  private installInput(): void {
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
        void this.enterAction();
        void this.playPick(DRAG_ANIMS, { repeat: true });
      } else {
        this.dragResumeRandom?.();
        this.dragResumeRandom = null;
        void this.leaveAction();
        void this.playPick(SETTLE_ANIMS);
      }
    });
  }

  /** 进入动作：仅维护引用计数（窗口已固定，无需扩缩） */
  private async enterAction(): Promise<void> {
    this.actionDepth++;
  }

  private async leaveAction(): Promise<void> {
    this.actionDepth = Math.max(0, this.actionDepth - 1);
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
  // 鼠标位置来自主进程主动轮询（screen.getCursorScreenPoint），
  // 不依赖 mousemove 事件，避免穿透模式下 forward 在 macOS 失效造成的死锁
  window.pet.cursor.onUpdate(({ x, y }) => app.trackMouse(x, y));
  await app.start();
}
