interface BackgroundSettingsProps {
  hasImage: boolean;
  enabled: boolean;
  onFile(file: File): void;
  onEnabledChange(enabled: boolean): void;
  onReset(): void;
}

export function BackgroundSettings({ hasImage, enabled, onFile, onEnabledChange, onReset }: BackgroundSettingsProps) {
  return <section className="background-settings" aria-label="阅读背景">
    <h3>阅读背景</h3>
    <input aria-label="选择背景图片" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) onFile(file); }} />
    {hasImage && <><label className="reader-settings__checkbox"><input type="checkbox" checked={enabled} onChange={(event) => onEnabledChange(event.target.checked)} /><span>启用背景</span></label><button type="button" onClick={onReset}>恢复默认背景</button></>}
  </section>;
}
