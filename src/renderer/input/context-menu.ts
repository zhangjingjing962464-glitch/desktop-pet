// 右键 → 通知主进程弹出原生菜单

export class ContextMenuTrigger {
  attach(target: HTMLElement | Window): () => void {
    const onCtx = (e: Event): void => {
      const me = e as MouseEvent;
      me.preventDefault();
      void window.pet.menu.popupContext({ x: me.clientX, y: me.clientY });
    };
    target.addEventListener('contextmenu', onCtx);
    return () => target.removeEventListener('contextmenu', onCtx);
  }
}
