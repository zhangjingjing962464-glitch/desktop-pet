// 单一 rAF 循环

type TickCb = (dtSeconds: number) => void;

export class RenderLoop {
  private readonly callbacks = new Set<TickCb>();
  private rafId: number | null = null;
  private lastT = 0;
  private running = false;

  onTick(cb: TickCb): () => void {
    this.callbacks.add(cb);
    return () => this.callbacks.delete(cb);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastT = performance.now();
    const loop = (now: number): void => {
      if (!this.running) return;
      const dt = Math.min(0.1, (now - this.lastT) / 1000); // 限制单帧最大 100ms，防卡顿/休眠后跳跃
      this.lastT = now;
      for (const cb of this.callbacks) {
        try {
          cb(dt);
        } catch (err) {
          console.error('[RenderLoop] callback throw', err);
        }
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }
}
