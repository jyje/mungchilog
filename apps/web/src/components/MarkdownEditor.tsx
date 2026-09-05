import { useEffect, useRef, useState, type FocusEvent } from "react";
import { MarkdownView } from "./MarkdownView";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { PlannerChoiceGroup, PlannerChoiceItem } from "./system/PlannerChoiceGroup";

type EditorMode = "edit" | "read";

// A small Markdown editor with an explicit edit/read flow. Day notes keep a
// local draft until save, which also prevents React rerenders from breaking
// Korean IME composition in the textarea.
export function MarkdownEditor({
  value,
  onChange,
  onSave,
  placeholder,
  rows = 4,
}: {
  value: string;
  onChange?: (text: string) => void;
  onSave?: (text: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const [mode, setMode] = useState<EditorMode>(() => (value.trim() ? "read" : "edit"));
  const [draft, setDraft] = useState(value);
  const [dirty, setDirty] = useState(false);
  const composing = useRef(false);
  const lastExternalValue = useRef(value);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const saveMode = onSave !== undefined;

  // Day notes save explicitly. Keeping their draft inside this component
  // avoids rerendering the whole trip while a Korean IME is composing a
  // syllable. A new saved value still updates an untouched editor.
  useEffect(() => {
    if (!saveMode || value === lastExternalValue.current) return;
    lastExternalValue.current = value;
    if (!dirty && !composing.current) setDraft(value);
  }, [dirty, saveMode, value]);

  useEffect(() => {
    if (!saveMode || !dirty) return;
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty, saveMode]);

  const editorValue = saveMode ? draft : value;

  function change(text: string) {
    if (saveMode) {
      setDraft(text);
      setDirty(text !== value);
      return;
    }
    onChange?.(text);
  }

  function save() {
    if (!onSave || !dirty) return;
    onSave(draft);
    setDirty(false);
    setMode("read");
  }

  function discardUnsavedChanges() {
    const discard = window.confirm("저장하지 않은 메모가 있습니다. 저장하지 않고 나갈까요?");
    if (!discard) {
      requestAnimationFrame(() => textarea.current?.focus());
      return false;
    }
    setDraft(value);
    setDirty(false);
    setMode("read");
    return true;
  }

  function changeMode(next: EditorMode) {
    if (next === "read" && mode === "edit" && saveMode && dirty && !discardUnsavedChanges()) return;
    setMode(next);
  }

  function warnWhenLeavingEditor(event: FocusEvent<HTMLDivElement>) {
    if (!saveMode || !dirty || event.currentTarget.contains(event.relatedTarget)) return;
    discardUnsavedChanges();
  }

  return (
    <div className="markdown-editor" onBlurCapture={warnWhenLeavingEditor}>
      <div className="markdown-editor-tabs">
        <PlannerChoiceGroup value={mode} onValueChange={(next) => next && changeMode(next as EditorMode)} aria-label="메모 보기 방식">
          <PlannerChoiceItem value="edit">편집</PlannerChoiceItem>
          <PlannerChoiceItem value="read">읽기</PlannerChoiceItem>
        </PlannerChoiceGroup>
        {saveMode && (
          <Button type="button" className="markdown-editor-save min-h-11" onClick={save} disabled={!dirty}>
            저장
          </Button>
        )}
      </div>
      {mode === "edit" ? (
        <Textarea
          ref={textarea}
          className="markdown-editor-textarea"
          value={editorValue}
          onChange={(e) => change(e.target.value)}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={() => {
            composing.current = false;
          }}
          placeholder={placeholder ?? "메모를 마크다운으로 적어보세요 (# 제목, **굵게**, - 목록, [ ] 체크박스 ...)"}
          rows={rows}
        />
      ) : editorValue.trim() ? (
        <MarkdownView text={editorValue} className="markdown-editor-preview" />
      ) : (
        <p className="meta markdown-editor-empty">아직 내용이 없습니다.</p>
      )}
    </div>
  );
}
