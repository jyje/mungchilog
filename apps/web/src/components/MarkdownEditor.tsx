import { useState } from "react";
import { MarkdownView } from "./MarkdownView";

// Notion-style write/preview toggle over a plain textarea - no rich-text
// editor dependency, just markdown source with a rendered preview tab.
export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const [tab, setTab] = useState<"write" | "preview">("write");

  return (
    <div className="markdown-editor">
      <div className="markdown-editor-tabs">
        <button type="button" className={tab === "write" ? "active" : ""} onClick={() => setTab("write")}>
          작성
        </button>
        <button type="button" className={tab === "preview" ? "active" : ""} onClick={() => setTab("preview")}>
          미리보기
        </button>
      </div>
      {tab === "write" ? (
        <textarea
          className="markdown-editor-textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "메모를 마크다운으로 적어보세요 (# 제목, **굵게**, - 목록, [ ] 체크박스 ...)"}
          rows={rows}
        />
      ) : value.trim() ? (
        <MarkdownView text={value} className="markdown-editor-preview" />
      ) : (
        <p className="meta markdown-editor-empty">아직 내용이 없습니다.</p>
      )}
    </div>
  );
}
