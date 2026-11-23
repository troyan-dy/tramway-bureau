const paths={
brand:'<path d="M7 10.2h18v13.2H7zM10 6h12M13 6l-2 4m8-4 2 4M11 26l-3 3m13-3 3 3M6 27h20"/><path d="M10 13h5v5h-5zm7 0h5v5h-5z" fill="currentColor" stroke="none"/><path d="M10 21h2m8 0h2"/>',
map:'<path d="m2 5 6-2 8 3 6-3v16l-6 3-8-3-6 2zM8 3v16m8-13v16"/>',
flows:'<path d="M2 6h7c4 0 4 12 8 12h5m-3-3 3 3-3 3M2 18h5c2 0 3-3 4-6m2-3c1-2 2-3 4-3h5m-3-3 3 3-3 3"/>',
route:'<circle cx="5" cy="17" r="3"/><circle cx="19" cy="6" r="3"/><path d="M5 14V9c0-2 1-3 3-3h3m8 3v5c0 2-1 3-3 3h-3"/>',
wallet:'<path d="M3 6h17v14H3zM3 6l14-4v4m3 5h-5v4h5"/>',
users:'<circle cx="9" cy="8" r="3"/><path d="M3 19v-2a6 6 0 0 1 12 0v2m1-14a3 3 0 0 1 0 6m2 3a4 4 0 0 1 3 4v1"/>',
head:'<circle cx="12" cy="8" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.7 2.7 0 1 1 4.5 2c-1.4.9-2 1.2-2 3m0 2.5v.2"/>',
menu:'<path d="M4 6h16M4 12h16M4 18h16"/>', play:'<path fill="currentColor" stroke="none" d="m6 3 15 9-15 9z"/>',pause:'<path d="M8 4v16m8-16v16" stroke-width="4"/>',
sound:'<path d="M3 9h4l5-4v14l-5-4H3zm13-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
mute:'<path d="M3 9h4l5-4v14l-5-4H3zm13 0 6 6m0-6-6 6"/>',
ticket:'<path d="M2 6h20v4c-3 0-3 4 0 4v4H2v-4c3 0 3-4 0-4zM16 6v2m0 2v2m0 2v2m0 1v1"/>',
stop:'<path d="M8 21h8m-4 0v-8M7 3h10v10H7zM9 6h6m-6 3h6"/>',
pen:'<path d="m4 16 12-12 4 4L8 20l-5 1zM14 6l4 4"/>',
flag:'<path d="M5 21V4m0 1c5-5 8 4 14-1v10c-6 5-9-4-14 1"/>',
radio:'<path d="M8 11a4 4 0 0 1 8 0M5 8a8 8 0 0 1 14 0M2.5 5a12 12 0 0 1 19 0M9 21l3-9 3 9zm-1-2h8"/>',
fit:'<path d="M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6"/>',
chevron:'<path d="m9 5 7 7-7 7"/>',back:'<path d="m14 5-7 7 7 7"/>',close:'<path d="m5 5 14 14M19 5 5 19"/>',
plus:'<path d="M12 4v16M4 12h16"/>',tram:'<rect x="5" y="5" width="14" height="14" rx="3"/><path d="M8 9h8v4H8zm0 12-2 2m10-2 2 2M8 2h8M9 16h1m4 0h1"/>',
save:'<path d="M3 3h15l3 3v15H3zm4 0v6h9V3M7 21v-8h10v8"/>',
file:'<path d="M5 2h10l4 4v16H5zm10 0v5h4M8 12h8m-8 4h6"/>',
repeat:'<path d="M4 9a8 8 0 1 1 0 7M4 3v6h6"/>',next:'<path d="M3 12h16m-6-6 6 6-6 6"/>',
};
export function ico(name){return '<svg aria-hidden="true" viewBox="0 0 '+(name==='brand'?'32 32':'24 24')+'" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+(paths[name]||'')+'</svg>'}
export const LINE_COLORS=['#ba4c32','#246a86','#806024'];
export function tramArt(color){
return '<svg class="tram-art" aria-hidden="true" viewBox="0 0 146 60"><g stroke="#42534b" stroke-linejoin="round" stroke-linecap="round"><path d="M2 52h142m-128 3h113" fill="none" opacity=".45"/><path d="m33 15 21-12 18 11-20-7-15 8" fill="none" stroke-width="1.3"/><path d="m35 14 62-1 27 5-2 3-101 1-3-3z" fill="#7d8271"/><path d="m15 22 7-4 91-1 15 5 2 21-11 6H22l-8-4z" fill="'+color+'" stroke-width="1.4"/><path d="m16 23 8-3h88l14 4 1 11-13 3H16z" fill="#f2dfac"/><g fill="#658781"><path d="m18 24 5-2v10l-5 1zm9-2h8v10h-8zm12 0h9v10h-9zm13 0h9v10h-9zm13 0h9v10h-9zm13 0h10v10H78zm14 0h9v10h-9zm14 0h7v10h-7zm11 1 7 2 1 8-8-1z"/></g><path d="M24 20v26m89-27v28m-95-8h91m7-2 11-2" fill="none" stroke="#f8d999" stroke-width="1.3"/><path d="M36 20v26m2-11h8v10h-8z" fill="none"/><g fill="#39423d"><circle cx="31" cy="48" r="4"/><circle cx="43" cy="48" r="4"/><circle cx="96" cy="48" r="4"/><circle cx="107" cy="48" r="4"/></g><path d="m120 39 5-1v3l-5 2z" fill="#fbe5a6"/><path d="M50 44h35" stroke="#edc78b"/></g></svg>'
}
