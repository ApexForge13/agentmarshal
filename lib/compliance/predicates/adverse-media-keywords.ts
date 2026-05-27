// Default financial-crime keyword list for entity_adverse_media_check (Bubble 19).
//
// Eight indicators that map to genuine adverse media in compliance practice. The v1
// composite counts how many DISTINCT keywords appear (case-insensitive) across the
// extracted article content and applies the contract's review/fail thresholds.
// Per-contract overrides are supplied via the composite's static input (keyword_list).

export const DEFAULT_FINANCIAL_CRIME_KEYWORDS = [
  'fraud',
  'investigation',
  'indictment',
  'money laundering',
  'sanctions violation',
  'regulatory action',
  'asset freeze',
  'criminal charges',
] as const;
