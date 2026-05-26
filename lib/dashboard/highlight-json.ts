// JSON → Echo OS .code syntax-highlight spans (.k key, .s string, .n number,
// .b bool/null). Extracted from ReceiptRail (Bubble 16) so the /scope-contracts
// page can render contract JSON with the same highlighting.
//
// Escapes HTML first; inputs are our own serialized objects (receipts, contracts),
// safe post-escape. Returned string is for dangerouslySetInnerHTML inside a
// <pre className="code">.

export function highlightJson(json: string): string {
  const escaped = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'n'; // number
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? 'k' : 's'; // key : string
      } else if (/true|false|null/.test(match)) {
        cls = 'b';
      }
      return `<span class="${cls}">${match}</span>`;
    },
  );
}
