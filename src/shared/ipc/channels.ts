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
    openSettings: 'pet:window:openSettings',
    focus: 'pet:window:focus',
  },
  menu: {
    popupContext: 'pet:menu:popupContext',
    onResult: 'pet:menu:onResult',
  },
  notify: {
    show: 'pet:notify:show',
  },
  reminder: {
    state: 'pet:reminder:state',
    skipRest: 'pet:reminder:skipRest',
    pauseAll: 'pet:reminder:pauseAll',
    /** 推送事件 */
    onEnterResting: 'pet:reminder:onEnterResting',
    onExitResting: 'pet:reminder:onExitResting',
    onMealTrigger: 'pet:reminder:onMealTrigger',
  },
  characters: {
    list: 'pet:characters:list',
    assetUrl: 'pet:characters:assetUrl',
  },
  dialog: {
    pickAudio: 'pet:dialog:pickAudio',
  },
  audio: {
    preview: 'pet:audio:preview',
  },
  power: {
    onSuspend: 'pet:power:onSuspend',
    onResume: 'pet:power:onResume',
  },
  lifecycle: {
    onQuit: 'pet:lifecycle:onQuit',
  },
} as const;
