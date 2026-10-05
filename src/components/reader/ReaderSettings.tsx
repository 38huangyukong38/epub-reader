import type { ReaderPreferences } from "../../domain/models";

interface ReaderSettingsProps {
  preferences: ReaderPreferences;
  paperOpacity?: number;
  onPreferencesChange(value: ReaderPreferences): void;
}

export function ReaderSettings({ preferences, paperOpacity = 0.55, onPreferencesChange }: ReaderSettingsProps) {
  const contentMargin = preferences.contentMargin ?? 24;
  const paperTransparency = Math.round((1 - (preferences.paperOpacity ?? paperOpacity)) * 100);
  return (
    <section className="reader-settings" aria-label="阅读设置">
      <h3>阅读设置</h3>
      <label>字号
        <select aria-label="字号" value={preferences.fontSize} onChange={(event) => onPreferencesChange({ ...preferences, fontSize: Number(event.target.value) })}>
          {[14, 16, 18, 20, 22, 24, 26].map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <label>字体
        <select value={preferences.fontFamily} onChange={(event) => onPreferencesChange({ ...preferences, fontFamily: event.target.value })}>
          <option value="system-ui">系统字体</option><option value="Georgia">Georgia</option><option value="serif">衬线字体</option>
        </select>
      </label>
      <label>行高
        <select value={preferences.lineHeight} onChange={(event) => onPreferencesChange({ ...preferences, lineHeight: Number(event.target.value) })}>
          {[1.4, 1.6, 1.7, 1.9, 2.1].map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <label>正文边距 {contentMargin}px
        <input aria-label="正文边距" type="range" min="12" max="56" step="4" value={contentMargin} onChange={(event) => onPreferencesChange({ ...preferences, contentMargin: Number(event.target.value) })} />
      </label>
      <label>主题
        <select value={preferences.theme} onChange={(event) => onPreferencesChange({ ...preferences, theme: event.target.value as ReaderPreferences["theme"] })}>
          <option value="light">浅色</option><option value="dark">柔和灰蓝</option><option value="sepia">护眼</option>
        </select>
      </label>
      <label className="reader-settings__checkbox">
        <input type="checkbox" aria-label="显示目录栏" checked={preferences.sidebarVisible} onChange={(event) => onPreferencesChange({ ...preferences, sidebarVisible: event.target.checked })} />
        <span>显示目录栏</span>
      </label>
      <label>背景板透明度 {paperTransparency}%
        <input aria-label="背景板透明度" type="range" min="0" max="100" step="5" value={paperTransparency} onChange={(event) => onPreferencesChange({ ...preferences, paperOpacity: (100 - Number(event.target.value)) / 100 })} />
      </label>
    </section>
  );
}

