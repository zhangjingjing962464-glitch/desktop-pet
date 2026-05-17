// IPC 通道名常量。统一 'pet:' 前缀。

export const IPC = {
  settings: {
    get: 'pet:settings:get',
    patch: 'pet:settings:patch',
    onChange: 'pet:settings:onChange',
  },
  display: {
    getMetrics: 'pet:display:getMetrics',
  },
  window: {
    setSize: 'pet:window:setSize',
    setPosition: 'pet:window:setPosition',
    setIgnoreMouse: 'pet:window:setIgnoreMouse',
    setAlwaysOnTop: 'pet:window:setAlwaysOnTop',
    focus: 'pet:window:focus',
  },
  menu: {
    popupContext: 'pet:menu:popupContext',
    onResult: 'pet:menu:onResult',
  },
  characters: {
    list: 'pet:characters:list',
    assetUrl: 'pet:characters:assetUrl',
  },
  power: {
    onSuspend: 'pet:power:onSuspend',
    onResume: 'pet:power:onResume',
  },
  cursor: {
    update: 'pet:cursor:update',
  },
  lifecycle: {
    onQuit: 'pet:lifecycle:onQuit',
  },
} as const;
