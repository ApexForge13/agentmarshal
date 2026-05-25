// Shared handoff key for pre-loading a receipt into the public /verify tool.
//
// The trading-desk receipt viewer ("Verify at /verify") stashes a receipt's JSON
// under this localStorage key and opens /verify in a new tab; /verify reads and
// clears it on mount. localStorage (not sessionStorage) because the handoff
// crosses a tab boundary — sessionStorage is not shared with a window.open()
// target, whereas localStorage is same-origin shared and survives the new tab.
// Not a query param: full receipts (with an RFC 3161 timestamp token) exceed
// safe URL lengths.

export const VERIFY_HANDOFF_KEY = 'agentmarshal:verify:receipt';
