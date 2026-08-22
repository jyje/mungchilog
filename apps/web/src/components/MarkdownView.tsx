import { marked } from "marked";
import DOMPurify from "dompurify";

// `marked` deliberately permits raw HTML, but notes can now be written by
// other approved trip members. Sanitize the rendered result before injecting
// it so a shared note remains content, never executable browser code.
export function MarkdownView({ text, className }: { text: string; className?: string }) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const html = DOMPurify.sanitize(marked(trimmed, { async: false, breaks: true, gfm: true }));
  return <div className={`markdown-view${className ? ` ${className}` : ""}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
