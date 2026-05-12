// Read-only YAML viewer with light keyword coloring. We don't pull in a syntax
// highlighter — a styled <pre> with regex-based span wrapping is plenty for
// the demo and keeps the dependency tree clean.

import { Fragment } from 'react';

export interface PolicyEditorProps {
  yaml: string;
}

const KEY_REGEX = /^(\s*)(-\s+)?([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)(.*)$/;
const COMMENT_REGEX = /^(\s*)(#.*)$/;
const HIGHLIGHT_KEYS = new Set([
  'name',
  'priority',
  'action',
  'flag',
  'description',
  'escalate_to',
]);

export function PolicyEditor({ yaml }: PolicyEditorProps) {
  const lines = yaml.split('\n');
  return (
    <pre className="m-0 whitespace-pre-wrap break-words bg-zinc-950 px-4 py-3 font-mono text-[12px] leading-relaxed text-zinc-300">
      {lines.map((line, i) => (
        <Fragment key={i}>
          {renderLine(line)}
          {'\n'}
        </Fragment>
      ))}
    </pre>
  );
}

function renderLine(line: string) {
  const commentMatch = COMMENT_REGEX.exec(line);
  if (commentMatch) {
    return (
      <>
        <span>{commentMatch[1]}</span>
        <span className="text-zinc-600 italic">{commentMatch[2]}</span>
      </>
    );
  }
  const m = KEY_REGEX.exec(line);
  if (!m) return <span>{line}</span>;
  const [, indent, dash, key, colon, rest] = m;
  const highlighted = HIGHLIGHT_KEYS.has(key);
  const keyClass = highlighted ? 'text-emerald-300' : 'text-sky-300';
  const valueClass = highlightValue(rest);
  return (
    <>
      <span>{indent}</span>
      {dash && <span className="text-zinc-500">{dash}</span>}
      <span className={keyClass}>{key}</span>
      <span className="text-zinc-500">{colon}</span>
      <span className={valueClass}>{rest}</span>
    </>
  );
}

function highlightValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed === 'true' || trimmed === 'false') return 'text-amber-300';
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return 'text-amber-200';
  if (trimmed === 'DENY') return 'text-rose-300';
  if (trimmed === 'HUMAN_REVIEW') return 'text-amber-300';
  if (trimmed === 'ALLOW') return 'text-emerald-300';
  return 'text-zinc-200';
}
