/** House marks drawn for the desk. Used when a lab host refuses its own icon. */
export const HOUSE_SVG = {
  openai:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#1c1914" d="M16 3.2l2.4 7.2h7.6l-6.2 4.4 2.4 7.2L16 17.6l-6.2 4.4 2.4-7.2-6.2-4.4h7.6z"/></svg>',
  anthropic:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#6e2f22" d="M16 5l9 22h-5.2l-1.5-3.8h-6.6L10.2 27H5zm0 8.2L13.6 19h4.8z"/></svg>',
  google:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="10" fill="none" stroke="#2f4a3d" stroke-width="3"/><path fill="#2f4a3d" d="M16 13h10v6H16z"/></svg>',
  deepmind:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="11" cy="16" r="5" fill="#3d3a2e"/><circle cx="21" cy="16" r="5" fill="#3d3a2e" opacity=".7"/></svg>',
  mistral:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#4a3b28" d="M6 24V8l10 8 10-8v16h-5V16l-5 4-5-4v8z"/></svg>',
  huggingface:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="11" fill="none" stroke="#1c1914" stroke-width="2"/><circle cx="12" cy="14" r="1.6" fill="#1c1914"/><circle cx="20" cy="14" r="1.6" fill="#1c1914"/><path fill="none" stroke="#1c1914" stroke-width="2" d="M11 20c2 2.4 8 2.4 10 0"/></svg>',
  microsoft:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#2c3d4f" d="M6 6h9v9H6zm11 0h9v9h-9zM6 17h9v9H6zm11 0h9v9h-9z"/></svg>',
  nvidia:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#3d4a2e" d="M6 22c6-10 14-14 20-15-4 6-6 11-6 15 0 3 2 5 5 6-8 1-14-1-19-6z"/></svg>',
  aws:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="none" stroke="#4a3228" stroke-width="2.2" d="M7 20c3 4 15 4 18 0"/><path fill="#4a3228" d="M10 8h4l8 16h-4.2L10 8zm9 0h4l-3 6h-4z"/></svg>',
  apple:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#2a2a28" d="M21 8c-1 .1-2.2.8-2.8 1.6-.7.8-1.2 1.9-1 3 .1.1 2.4-.4 3.3-1.5.8-1 1.2-2.2.5-3.1zM16 12c-1.6 0-3.1 1-4 1-1.1 0-2.8-1-4.6-1-2.4.1-4.6 1.4-5.8 3.6-2.5 4.3-.6 10.7 1.8 14.2 1.2 1.7 2.6 3.6 4.4 3.5 1.8-.1 2.4-1.1 4.6-1.1s2.7 1.1 4.6 1c1.9 0 3.1-1.7 4.3-3.4 1.3-1.9 1.9-3.8 1.9-3.9-.1 0-3.6-1.4-3.6-5.5 0-3.4 2.8-5.1 2.9-5.2-1.6-2.4-4.1-2.6-5-2.7-1.8-.2-3.4 1-4.5 1z"/></svg>',
  gresearch:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="10" fill="none" stroke="#355046" stroke-width="3"/><circle cx="16" cy="16" r="3" fill="#355046"/></svg>',
  bair:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#4a2e3d" d="M8 7h10c4 0 7 2.4 7 6.2 0 2.6-1.6 4.6-4.2 5.5L25 25h-5.2l-3.6-5.6H13V25H8zm5 4.2v5.2h4.4c1.8 0 2.8-.8 2.8-2.6s-1-2.6-2.8-2.6z"/></svg>',
  mit:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#8a2a22" d="M5 7h5.2v5.4H8.4V25H5zm7.2 0h3.4v18H12.2zm5.2 0H27v3.4h-6.2V14H26v3.4h-6.4V25h-3.4z"/></svg>',
  mittr:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#243044" d="M6 8h20v4.2h-8V24h-4.2V12.2H6z"/></svg>',
  theverge:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#5200ff" d="M4 5h5.4l6.6 13.2L22.6 5H28l-9.6 18.6c-.7 1.4-1.8 2.1-3.3 2.1s-2.6-.7-3.3-2.1z"/></svg>',
};

export function houseSvg(id) {
  return HOUSE_SVG[id] || HOUSE_SVG.openai;
}
