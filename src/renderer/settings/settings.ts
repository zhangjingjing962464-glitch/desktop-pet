// 设置面板逻辑：读取 + 渲染 + 写回。Apple Liquid Glass 风格 + 三主题。

import type { UserSettings } from '@shared/domain/settings.js';
import type { CharacterMeta } from '@shared/domain/character.js';

const root = document.getElementById('settings-root') as HTMLElement;

async function bootstrap(): Promise<void> {
  if (!window.pet) {
    root.innerHTML = '<section class="loading">preload api 未就绪</section>';
    return;
  }

  // 标注平台：macOS 用 vibrancy 接管底色，CSS body 应保持 transparent；
  // 其他平台没有 vibrancy，需要 CSS 渐变 fallback
  const ua = navigator.userAgent.toLowerCase();
  const isMac = ua.includes('mac') || (typeof navigator.platform === 'string' && navigator.platform.toLowerCase().includes('mac'));
  document.documentElement.setAttribute('data-platform', isMac ? 'darwin' : 'other');

  const [settings, characters] = await Promise.all([
    window.pet.settings.get(),
    window.pet.characters.list(),
  ]);

  applyTheme(settings.theme);
  render(settings, characters);

  window.pet.settings.onChange((next) => {
    applyTheme(next.theme);
    render(next, characters);
  });
}

/** 根据 settings.theme 写到 <html data-theme=...>，CSS 变量随之切换 */
function applyTheme(theme: UserSettings['theme']): void {
  document.documentElement.setAttribute('data-theme', theme);
}

function render(s: UserSettings, characters: ReadonlyArray<CharacterMeta>): void {
  root.innerHTML = '';
  root.appendChild(buildAppearanceSection(s));
  root.appendChild(buildCharacterSection(s, characters));
  root.appendChild(buildSizeSection(s));
  root.appendChild(buildReminderSection(s));
  root.appendChild(buildWorkRestSection(s));
  root.appendChild(buildMealSection(s));
  root.appendChild(buildBehaviorSection(s));
}

function buildSection(title: string): HTMLElement {
  const section = document.createElement('section');
  section.className = 'card';
  const h2 = document.createElement('h2');
  h2.textContent = title;
  section.appendChild(h2);
  return section;
}

function row(label: string, control: HTMLElement, value?: string): HTMLElement {
  const div = document.createElement('div');
  div.className = 'row';
  const lab = document.createElement('label');
  lab.textContent = label;
  div.appendChild(lab);
  const right = document.createElement('div');
  right.className = 'right';
  if (value !== undefined) {
    const v = document.createElement('span');
    v.className = 'value';
    v.textContent = value;
    right.appendChild(v);
  }
  right.appendChild(control);
  div.appendChild(right);
  return div;
}

/** 通用分段控件：value 数组 + 当前值 + 选中回调 */
function segmented<T extends string>(
  options: ReadonlyArray<{ value: T; label: string }>,
  current: T,
  onPick: (v: T) => void,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'segmented';
  for (const opt of options) {
    const btn = document.createElement('button');
    btn.textContent = opt.label;
    btn.type = 'button';
    if (opt.value === current) btn.classList.add('active');
    btn.addEventListener('click', () => onPick(opt.value));
    wrap.appendChild(btn);
  }
  return wrap;
}

function buildAppearanceSection(s: UserSettings): HTMLElement {
  const section = buildSection('外观');
  const ctrl = segmented(
    [
      { value: 'light', label: '浅色' },
      { value: 'dark', label: '深色' },
      { value: 'system', label: '跟随系统' },
    ] as const,
    s.theme,
    (v) => {
      void window.pet.settings.patch({ theme: v });
    },
  );
  section.appendChild(row('主题', ctrl));
  return section;
}

function buildCharacterSection(s: UserSettings, characters: ReadonlyArray<CharacterMeta>): HTMLElement {
  const section = buildSection('角色');
  // 按 baseId 分组成 <optgroup>，同英雄不同皮肤放一组
  const groups = new Map<string, CharacterMeta[]>();
  for (const c of characters) {
    const arr = groups.get(c.baseId) ?? [];
    arr.push(c);
    groups.set(c.baseId, arr);
  }
  const sorted = Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));

  const select = document.createElement('select');
  for (const [baseId, list] of sorted) {
    if (list.length === 1) {
      const c = list[0]!;
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.displayName;
      if (c.id === s.selectedCharacterId) opt.selected = true;
      select.appendChild(opt);
    } else {
      const group = document.createElement('optgroup');
      group.label = baseId.charAt(0).toUpperCase() + baseId.slice(1);
      for (const c of list) {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = skinSubName(c, baseId);
        if (c.id === s.selectedCharacterId) opt.selected = true;
        group.appendChild(opt);
      }
      select.appendChild(group);
    }
  }
  select.addEventListener('change', () => {
    void window.pet.settings.patch({ selectedCharacterId: select.value });
  });
  section.appendChild(row('选择角色', select));
  return section;
}

/** "Crystal Rose Gwen" 在 Gwen 组里显示为 "Crystal Rose" */
function skinSubName(c: CharacterMeta, baseId: string): string {
  const dn = c.displayName;
  const heroCap = baseId.charAt(0).toUpperCase() + baseId.slice(1);
  const withoutHero = dn.replace(new RegExp(`\\s*${heroCap}\\s*$`, 'i'), '').trim();
  return withoutHero || dn;
}

function buildSizeSection(s: UserSettings): HTMLElement {
  const section = buildSection('大小');
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '1.5';
  input.max = '2.75';
  input.step = '0.25';
  input.value = String(s.sizeCm);
  const valueLabel = document.createElement('span');
  valueLabel.className = 'value';
  valueLabel.textContent = `${s.sizeCm.toFixed(2)} cm`;
  input.addEventListener('input', () => {
    const cm = Number(input.value);
    valueLabel.textContent = `${cm.toFixed(2)} cm`;
  });
  input.addEventListener('change', () => {
    void window.pet.settings.patch({ sizeCm: Number(input.value) });
  });
  const div = document.createElement('div');
  div.className = 'row';
  const lab = document.createElement('label');
  lab.textContent = '待机大小（1.5 ~ 2.75 cm）';
  div.appendChild(lab);
  const right = document.createElement('div');
  right.className = 'right';
  right.append(valueLabel, input);
  div.appendChild(right);
  section.appendChild(div);
  return section;
}

function buildReminderSection(s: UserSettings): HTMLElement {
  const section = buildSection('提醒方式');

  // 1) 通知+提示音（独立开关）
  const soundEnabled = document.createElement('input');
  soundEnabled.type = 'checkbox';
  soundEnabled.checked = s.reminderSoundEnabled;
  soundEnabled.addEventListener('change', () => {
    void window.pet.settings.patch({ reminderSoundEnabled: soundEnabled.checked });
  });
  section.appendChild(row('通知 + 提示音', soundEnabled));

  // 2) 提示音音色选择
  const soundOpts: Array<{ value: typeof s.reminderSoundName; label: string }> = [
    { value: 'Glass', label: 'Glass · 玻璃' },
    { value: 'Hero', label: 'Hero · 英雄' },
    { value: 'Funk', label: 'Funk · 滑稽' },
    { value: 'Pop', label: 'Pop · 弹响' },
    { value: 'Ping', label: 'Ping · 清脆' },
    { value: 'Submarine', label: 'Submarine · 潜艇' },
    { value: 'Bottle', label: 'Bottle · 瓶塞' },
    { value: 'Tink', label: 'Tink · 叮' },
    { value: 'custom', label: '自定义文件…' },
  ];
  const soundSelect = document.createElement('select');
  for (const o of soundOpts) {
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;
    if (o.value === s.reminderSoundName) opt.selected = true;
    soundSelect.appendChild(opt);
  }
  const previewBtn = document.createElement('button');
  previewBtn.type = 'button';
  previewBtn.textContent = '试听';
  previewBtn.addEventListener('click', () => {
    if (s.reminderSoundName === 'custom' && !s.reminderCustomSoundPath) return;
    const sound = s.reminderSoundName === 'custom' ? s.reminderCustomSoundPath! : s.reminderSoundName;
    void window.pet.audio.preview(sound);
  });

  soundSelect.addEventListener('change', async () => {
    const v = soundSelect.value as typeof s.reminderSoundName;
    if (v === 'custom') {
      // 选自定义：弹文件选择框
      const file = await window.pet.dialog.pickAudio();
      if (!file) {
        // 取消：回滚到当前值
        soundSelect.value = s.reminderSoundName;
        return;
      }
      void window.pet.settings.patch({ reminderSoundName: 'custom', reminderCustomSoundPath: file });
    } else {
      void window.pet.settings.patch({ reminderSoundName: v });
    }
  });

  const soundRow = document.createElement('div');
  soundRow.className = 'row';
  const sLab = document.createElement('label');
  sLab.textContent = '提示音音色';
  soundRow.appendChild(sLab);
  const sRight = document.createElement('div');
  sRight.className = 'right';
  sRight.append(previewBtn, soundSelect);
  soundRow.appendChild(sRight);
  section.appendChild(soundRow);

  // 当前自定义文件名（如果选了 custom）
  if (s.reminderSoundName === 'custom' && s.reminderCustomSoundPath) {
    const fileInfo = document.createElement('div');
    fileInfo.style.fontSize = '11px';
    fileInfo.style.color = 'var(--text-tertiary)';
    fileInfo.style.padding = '2px 0 6px';
    fileInfo.style.wordBreak = 'break-all';
    const filename = s.reminderCustomSoundPath.split('/').pop() ?? s.reminderCustomSoundPath;
    fileInfo.textContent = `当前文件：${filename}`;
    section.appendChild(fileInfo);
  }

  // 3) 招牌动作开关（独立）
  const showOff = document.createElement('input');
  showOff.type = 'checkbox';
  showOff.checked = s.reminderShowOffEnabled;
  showOff.addEventListener('change', () => {
    void window.pet.settings.patch({ reminderShowOffEnabled: showOff.checked });
  });
  section.appendChild(row('招牌动作（模型放最大置顶）', showOff));

  // 描述
  const desc = document.createElement('div');
  desc.style.fontSize = '11px';
  desc.style.color = 'var(--text-tertiary)';
  desc.style.padding = '4px 0 0';
  desc.style.lineHeight = '1.5';
  desc.textContent = '两项可同时开启。招牌动作期间模型会切到最顶层、放大显示，按"休息时长"自动恢复。';
  section.appendChild(desc);

  return section;
}

function buildWorkRestSection(s: UserSettings): HTMLElement {
  const section = buildSection('工作 · 休息');

  const work = document.createElement('input');
  work.type = 'number';
  work.min = '1';
  work.max = '180';
  work.value = String(s.workMinutes);
  work.addEventListener('change', () => {
    void window.pet.settings.patch({ workMinutes: Math.max(1, Math.min(180, Number(work.value) | 0)) });
  });
  section.appendChild(row('工作时长（分钟）', work));

  const rest = document.createElement('input');
  rest.type = 'number';
  rest.min = '1';
  rest.max = '60';
  rest.value = String(s.restMinutes);
  rest.addEventListener('change', () => {
    void window.pet.settings.patch({ restMinutes: Math.max(1, Math.min(60, Number(rest.value) | 0)) });
  });
  section.appendChild(row('休息时长（分钟）', rest));

  return section;
}

function buildMealSection(s: UserSettings): HTMLElement {
  const section = buildSection('饭点提醒');
  const labels = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' } as const;
  for (const key of ['breakfast', 'lunch', 'dinner'] as const) {
    const input = document.createElement('input');
    input.type = 'time';
    input.value = s.mealTimes[key];
    input.addEventListener('change', () => {
      void window.pet.settings.patch({
        mealTimes: { ...s.mealTimes, [key]: input.value },
      });
    });
    section.appendChild(row(labels[key], input));
  }
  return section;
}

function buildBehaviorSection(s: UserSettings): HTMLElement {
  const section = buildSection('行为');

  const pause = document.createElement('input');
  pause.type = 'checkbox';
  pause.checked = s.remindersPaused;
  pause.addEventListener('change', () => {
    void window.pet.settings.patch({ remindersPaused: pause.checked });
  });
  section.appendChild(row('暂停所有提醒', pause));

  return section;
}

bootstrap().catch((err) => {
  root.innerHTML = `<section class="loading">加载失败：${String(err)}</section>`;
});
