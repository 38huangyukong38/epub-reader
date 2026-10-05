import { useRef } from "react";

interface ImportButtonProps {
  onImport(files: File[]): Promise<void> | void;
}

export function ImportButton({ onImport }: ImportButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        className="import-button__input"
        type="file"
        accept=".epub,application/epub+zip"
        multiple
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          if (files.length) void onImport(files);
        }}
      />
      <button className="import-button" type="button" onClick={() => inputRef.current?.click()}>
        导入 EPUB
      </button>
    </>
  );
}
