import "./style.css";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { api } from "./bridge";
import { applyTheme, themes } from "./themes";
import type { AppState, Page, SearchResult, Song, Theme } from "./types";

const app = document.querySelector<HTMLDivElement>("#app")!;
let state: AppState;
let page: Page = "player";
let selectedId = "";
let libraryQuery = "";
let youtubeResults: SearchResult[] = [];
let youtubeQuery = "";
let busy = false;
let toastTimer = 0;

const icon = (name: string) => {
  const icons: Record<string, string> = {
    library: '<path d="M4 4h5v16H4zM11 4h4v16h-4zM17 4h3v16h-3z"/>',
    player: '<path d="M4 18V8m5 10V4m5 14v-7m5 7V6"/>',
    youtube: '<path d="M9 8l7 4-7 4z"/><rect x="3" y="5" width="18" height="14" rx="5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0015 19.4a1.7 1.7 0 00-1 .6l-.04.08H10l-.04-.08a1.7 1.7 0 00-1-.6 1.7 1.7 0 00-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 004.6 15a1.7 1.7 0 00-.6-1L3.92 14v-4L4 9.96a1.7 1.7 0 00.6-1 1.7 1.7 0 00-.34-1.88L4.2 7.02l2.83-2.83.06.06A1.7 1.7 0 009 4.6a1.7 1.7 0 001-.6l.04-.08h4L14.08 4a1.7 1.7 0 001 .6 1.7 1.7 0 001.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0019.4 9c.08.38.3.73.6 1l.08.04v4L20 14.08c-.3.27-.52.62-.6.92z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 00-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 00-.1-7.8z"/>',
    play: '<path d="M8 5v14l11-7z"/>', stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    prev: '<path d="M19 20L9 12l10-8zM5 19V5"/>', next: '<path d="M5 4l10 8-10 8zM19 5v14"/>',
    shuffle: '<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
    download: '<path d="M12 3v12m-5-5l5 5 5-5M5 21h14"/>', plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L8 18l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2m3 0l-1 15H6L5 6m5 4v7m4-7v7"/>',
    chevron: '<path d="M9 18l6-6-6-6"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] ?? ""}</svg>`;
};

const esc = (value: string) => value.replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]!));
const currentSong = () => state.songs.find(s => s.id === selectedId) ?? state.songs[0];

function shell(): void {
  app.innerHTML = `
    <main class="phone-wrap" style="--phone-scale:${state.settings.windowScale}">
      <section class="phone" aria-label="Eclipse Phone Player">
        <div class="metal-edge"></div><div class="side-key key-a"></div><div class="side-key key-b"></div><div class="side-key key-c"></div>
        <div class="screen">
          <header class="topbar" data-tauri-drag-region>
            <span class="clock" id="clock">00:00</span>
            <div class="island" data-tauri-drag-region><i></i></div>
            <div class="system-icons"><span class="signal">▮▮▮</span><b>5G</b><span class="battery"><i></i></span></div>
          </header>
          <div class="appbar" data-tauri-drag-region>
            <div><p class="eyebrow">ECLIPSE</p><h1 id="page-title">Player</h1></div>
            <div class="app-actions">
              <button class="icon-btn" id="always-on-top" title="Always on top">◇</button>
              <button class="icon-btn danger-hover" id="close-app" title="Hide">×</button>
            </div>
          </div>
          <section id="view" class="view"></section>
          <nav class="tabbar">
            ${tab("library", "library", "Library")}${tab("player", "player", "Player")}${tab("youtube", "youtube", "YouTube")}${tab("downloads", "download", "Downloads")}${tab("settings", "settings", "More")}
          </nav>
          <div class="home-indicator"></div>
        </div>
      </section>
    </main>
    <div id="modal-root"></div><div id="toast" class="toast"></div>`;
  bindShell();
  render();
  startClock();
}

function tab(id: Page, glyph: string, label: string): string {
  return `<button class="tab ${page === id ? "active" : ""}" data-page="${id}">${icon(glyph)}<span>${label}</span></button>`;
}

function bindShell(): void {
  document.querySelectorAll<HTMLElement>("[data-page]").forEach(el => el.onclick = () => { page = el.dataset.page as Page; renderTabs(); render(); });
  document.querySelector<HTMLButtonElement>("#close-app")!.onclick = async () => { try { await getCurrentWindow().hide(); } catch { /* browser preview */ } };
  document.querySelector<HTMLButtonElement>("#always-on-top")!.onclick = async () => {
    state.settings.alwaysOnTop = !state.settings.alwaysOnTop;
    await api.saveSettings(state.settings); try { await getCurrentWindow().setAlwaysOnTop(state.settings.alwaysOnTop); } catch { }
    toast(state.settings.alwaysOnTop ? "Always on top enabled" : "Always on top disabled");
  };
}

function renderTabs(): void {
  document.querySelectorAll<HTMLElement>(".tab").forEach(el => el.classList.toggle("active", el.dataset.page === page));
}

function render(): void {
  const view = document.querySelector<HTMLElement>("#view")!;
  const title = document.querySelector<HTMLElement>("#page-title")!;
  title.textContent = ({ library: "Library", player: "Now Playing", youtube: "YouTube Search", downloads: "Downloads", settings: "Settings" })[page];
  view.className = `view page-${page}`;
  if (page === "library") renderLibrary(view);
  else if (page === "player") renderPlayer(view);
  else if (page === "youtube") renderYouTube(view);
  else if (page === "downloads") renderDownloads(view);
  else renderSettings(view);
}

function renderLibrary(view: HTMLElement): void {
  const q = libraryQuery.toLowerCase();
  const songs = state.songs.filter(s => !q || `${s.artist} ${s.album} ${s.title}`.toLowerCase().includes(q));
  view.innerHTML = `
    <div class="searchbox">${icon("search")}<input id="library-search" value="${esc(libraryQuery)}" placeholder="Search your library"/><button id="add-song">${icon("plus")}</button></div>
    <div class="section-row"><span>${songs.length} songs</span><div class="segmented"><button data-filter="all" class="active">All</button><button data-filter="favorites">Favorites</button></div></div>
    <div id="song-list" class="song-list">${songs.length ? songs.map(songRow).join("") : empty("No matching songs", "Add a song or change your search.")}</div>
    <button class="floating-play" id="random-play">${icon("shuffle")} Random play</button>`;
  const input = document.querySelector<HTMLInputElement>("#library-search")!;
  input.oninput = () => { libraryQuery = input.value; renderLibrary(view); };
  document.querySelector<HTMLButtonElement>("#add-song")!.onclick = () => editSong();
  document.querySelector<HTMLButtonElement>("#random-play")!.onclick = () => { if (songs.length) { selectSong(songs[Math.floor(Math.random() * songs.length)].id); playSelected(); } };
  bindSongRows();
  const all = document.querySelectorAll<HTMLButtonElement>("[data-filter]");
  all.forEach(btn => btn.onclick = () => {
    all.forEach(x => x.classList.remove("active")); btn.classList.add("active");
    document.querySelectorAll<HTMLElement>(".song-row").forEach(row => row.hidden = btn.dataset.filter === "favorites" && row.dataset.favorite !== "true");
  });
}

function songRow(song: Song): string {
  const initials = `${song.artist[0] ?? "?"}${song.title[0] ?? ""}`.toUpperCase();
  return `<article class="song-row ${song.id === selectedId ? "selected" : ""}" data-id="${esc(song.id)}" data-favorite="${song.favorite}">
    <div class="cover" style="--h:${hashHue(song.id)}">${initials}</div><div class="song-copy"><strong>${esc(song.title)}</strong><span>${esc(song.artist)}${song.album ? ` • ${esc(song.album)}` : ""}</span></div>
    <span class="duration">${esc(song.length || "—")}</span><button class="heart ${song.favorite ? "on" : ""}" data-heart="${esc(song.id)}">${icon("heart")}</button><button class="more" data-more="${esc(song.id)}">•••</button>
  </article>`;
}

function bindSongRows(): void {
  document.querySelectorAll<HTMLElement>(".song-row").forEach(row => row.onclick = e => { if ((e.target as Element).closest("button")) return; selectSong(row.dataset.id!); page = "player"; renderTabs(); render(); });
  document.querySelectorAll<HTMLButtonElement>("[data-heart]").forEach(btn => btn.onclick = async () => { const song = state.songs.find(s => s.id === btn.dataset.heart); if (song) { song.favorite = !song.favorite; await api.saveSongs(state.songs); render(); } });
  document.querySelectorAll<HTMLButtonElement>("[data-more]").forEach(btn => btn.onclick = () => songActions(btn.dataset.more!));
}

function renderPlayer(view: HTMLElement): void {
  const song = currentSong();
  if (!song) { view.innerHTML = empty("Your player is ready", "Add a song from Library or YouTube Search."); return; }
  view.innerHTML = `
    <div class="art-card" style="--h:${hashHue(song.id)}"><canvas id="visualizer"></canvas><div class="art-glow"></div><div class="art-monogram">${esc((song.title[0] ?? "E").toUpperCase())}</div><span class="visualizer-label">LIVE VISUALIZER</span></div>
    <div class="now-row"><div><h2>${esc(song.title)}</h2><p>${esc(song.artist)}${song.album ? ` • ${esc(song.album)}` : ""}</p></div><button id="player-favorite" class="favorite-large ${song.favorite ? "on" : ""}">${icon("heart")}</button></div>
    <div class="progress"><i style="width:34%"></i><b style="left:34%"></b></div><div class="time-row"><span>Ready</span><span>${esc(song.length || "Live URL")}</span></div>
    <div class="transport"><button id="shuffle">${icon("shuffle")}</button><button id="previous">${icon("prev")}</button><button id="play" class="primary">${icon("play")}</button><button id="stop">${icon("stop")}</button><button id="next">${icon("next")}</button></div>
    <div class="volume-row"><span>VOL</span><input id="volume" type="range" min="0" max="100" value="${state.settings.volume}"/><output>${state.settings.volume}%</output></div>
    <div class="mode-card"><span>GTA output</span><div class="mode-pills">${(["Car","Speaker","TV"] as const).map(m => `<button data-mode="${m}" class="${state.settings.mode === m ? "active" : ""}">${m}</button>`).join("")}</div></div>
    <div class="up-next"><div class="section-row"><strong>Up next</strong><button data-page="library">View all</button></div>${queue(song.id)}</div>`;
  document.querySelector<HTMLButtonElement>("#play")!.onclick = playSelected;
  document.querySelector<HTMLButtonElement>("#stop")!.onclick = stopPlayback;
  document.querySelector<HTMLButtonElement>("#previous")!.onclick = () => step(-1);
  document.querySelector<HTMLButtonElement>("#next")!.onclick = () => step(1);
  document.querySelector<HTMLButtonElement>("#shuffle")!.onclick = () => { if (state.songs.length) { selectSong(state.songs[Math.floor(Math.random() * state.songs.length)].id); render(); } };
  document.querySelector<HTMLButtonElement>("#player-favorite")!.onclick = async () => { song.favorite = !song.favorite; await api.saveSongs(state.songs); render(); };
  const volume = document.querySelector<HTMLInputElement>("#volume")!;
  volume.oninput = () => { state.settings.volume = +volume.value; document.querySelector<HTMLOutputElement>(".volume-row output")!.value = `${volume.value}%`; };
  volume.onchange = async () => { await api.saveSettings(state.settings); if (state.settings.mode === "Speaker") await api.sendToGame(`/vol speaker ${volume.value}`, true).catch(errorToast); };
  document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach(btn => btn.onclick = async () => { state.settings.mode = btn.dataset.mode as typeof state.settings.mode; await api.saveSettings(state.settings); render(); });
  document.querySelectorAll<HTMLElement>(".queue-row").forEach(row => row.onclick = () => { selectSong(row.dataset.id!); render(); });
  document.querySelector<HTMLElement>("[data-page='library']")!.onclick = () => { page = "library"; renderTabs(); render(); };
  startVisualizer();
}

function queue(current: string): string {
  const index = Math.max(0, state.songs.findIndex(s => s.id === current));
  const items = [...state.songs.slice(index + 1), ...state.songs.slice(0, index)].slice(0, 3);
  return items.map(s => `<div class="queue-row" data-id="${esc(s.id)}"><span class="mini-cover" style="--h:${hashHue(s.id)}"></span><div><strong>${esc(s.title)}</strong><small>${esc(s.artist)}</small></div><span>${esc(s.length || "—")}</span>${icon("chevron")}</div>`).join("") || `<p class="muted">No other songs in the queue.</p>`;
}

function renderYouTube(view: HTMLElement): void {
  view.innerHTML = `
    <form id="youtube-form" class="searchbox youtube-box">${icon("search")}<input id="youtube-query" value="${esc(youtubeQuery)}" placeholder="Songs, artists or videos"/><button class="search-submit" ${busy ? "disabled" : ""}>${busy ? "…" : "Search"}</button></form>
    <div class="dependency-strip ${state.dependencies.ytdlp ? "ready" : "missing"}"><span><i></i>${state.dependencies.ytdlp ? "YouTube engine ready" : "yt-dlp is not installed"}</span>${state.dependencies.ytdlp ? "" : '<button id="install-ytdlp">Install safely</button>'}</div>
    <div class="results">${busy ? loading("Searching YouTube") : youtubeResults.length ? youtubeResults.map(resultRow).join("") : empty("Search without leaving the app", "Results appear here and can be added, copied or downloaded.")}</div>`;
  document.querySelector<HTMLFormElement>("#youtube-form")!.onsubmit = async e => { e.preventDefault(); youtubeQuery = document.querySelector<HTMLInputElement>("#youtube-query")!.value.trim(); if (!youtubeQuery) return; await searchYouTube(); };
  document.querySelector<HTMLButtonElement>("#install-ytdlp")?.addEventListener("click", () => installDependency("ytdlp"));
  document.querySelectorAll<HTMLButtonElement>("[data-result-add]").forEach(btn => btn.onclick = () => addSearchResult(+btn.dataset.resultAdd!));
  document.querySelectorAll<HTMLButtonElement>("[data-result-copy]").forEach(btn => btn.onclick = async () => { await navigator.clipboard.writeText(youtubeResults[+btn.dataset.resultCopy!].url); toast("URL copied"); });
  document.querySelectorAll<HTMLButtonElement>("[data-result-download]").forEach(btn => btn.onclick = () => downloadDialog(youtubeResults[+btn.dataset.resultDownload!].url));
}

function resultRow(r: SearchResult, i: number): string {
  return `<article class="result-row"><div class="video-thumb" style="--h:${hashHue(r.url)}">${icon("youtube")}</div><div class="result-copy"><strong>${esc(r.title)}</strong><span>${esc(r.channel)} • ${esc(r.length || "—")}</span></div><div class="result-actions"><button data-result-add="${i}" title="Add">${icon("plus")}</button><button data-result-copy="${i}" title="Copy URL">⧉</button><button data-result-download="${i}" title="Download">${icon("download")}</button></div></article>`;
}

async function searchYouTube(): Promise<void> {
  if (!state.dependencies.ytdlp) { toast("Install yt-dlp first", true); return; }
  busy = true; render();
  try { youtubeResults = await api.searchYouTube(youtubeQuery); if (!youtubeResults.length) toast("No results found"); }
  catch (e) { errorToast(e); } finally { busy = false; render(); }
}

function renderDownloads(view: HTMLElement): void {
  view.innerHTML = `<div class="hero-card compact"><p class="eyebrow">MEDIA TOOLS</p><h2>Downloads</h2><p>Save audio or video from any selected library song or YouTube result.</p></div>
    <div class="dependency-grid">${dependencyCard("ytdlp", "yt-dlp", "YouTube search and downloads", state.dependencies.ytdlp)}${dependencyCard("ffmpeg", "FFmpeg", "MP3 conversion and video merging", state.dependencies.ffmpeg)}</div>
    <div class="settings-list"><button id="download-current" class="settings-row"><span class="settings-icon">${icon("download")}</span><span><strong>Download selected song</strong><small>${currentSong() ? esc(currentSong()!.title) : "No song selected"}</small></span>${icon("chevron")}</button>
    <button id="open-audio" class="settings-row"><span class="settings-icon">♫</span><span><strong>Downloaded Audio</strong><small>Open the audio folder</small></span>${icon("chevron")}</button>
    <button id="open-video" class="settings-row"><span class="settings-icon">▻</span><span><strong>Downloaded Video</strong><small>Open the video folder</small></span>${icon("chevron")}</button></div>`;
  document.querySelectorAll<HTMLButtonElement>("[data-install]").forEach(btn => btn.onclick = () => installDependency(btn.dataset.install!));
  document.querySelector<HTMLButtonElement>("#download-current")!.onclick = () => currentSong() ? downloadDialog(currentSong()!.url) : toast("Select a song first", true);
  document.querySelector<HTMLButtonElement>("#open-audio")!.onclick = () => api.openDownloads("audio").catch(errorToast);
  document.querySelector<HTMLButtonElement>("#open-video")!.onclick = () => api.openDownloads("video").catch(errorToast);
}

function dependencyCard(id: string, title: string, copy: string, ready: boolean): string {
  return `<article class="dependency-card"><div class="dependency-badge ${ready ? "ready" : ""}">${ready ? "✓" : "!"}</div><div><strong>${title}</strong><small>${copy}</small></div><button data-install="${id}" ${ready ? "disabled" : ""}>${ready ? "Ready" : "Install"}</button></article>`;
}

function renderSettings(view: HTMLElement): void {
  const t = state.settings.theme;
  view.innerHTML = `<div class="settings-scroll">
    <section class="settings-section"><p class="section-label">APPEARANCE</p><div class="theme-carousel">${themes.map(x => `<button class="theme-chip ${t.name === x.name ? "active" : ""}" data-theme="${esc(x.name)}"><i style="--a:${x.accent};--b:${x.accent2}"></i>${esc(x.name)}</button>`).join("")}<button class="theme-chip ${!themes.some(x => x.name === t.name) ? "active" : ""}" data-custom-theme><i style="--a:${t.accent};--b:${t.accent2}"></i>Custom</button></div>
    <button id="edit-theme" class="settings-row"><span class="settings-icon color-wheel"></span><span><strong>Customize theme</strong><small>Colors, glow and glass blur</small></span>${icon("chevron")}</button></section>
    <section class="settings-section"><p class="section-label">PLAYBACK</p><label class="form-row"><span>Game executable</span><input id="game-exe" value="${esc(state.settings.gameExe)}"/></label><label class="form-row"><span>Chat key</span><input id="chat-key" maxlength="1" value="${esc(state.settings.openChatKey)}"/></label><label class="form-row"><span>Download folder</span><input id="download-folder" value="${esc(state.settings.downloadFolder)}" placeholder="Default app folder"/></label></section>
    <section class="settings-section"><p class="section-label">WINDOW</p>${toggleRow("always-top", "Always on top", "Keep the phone above GTA", state.settings.alwaysOnTop)}${toggleRow("close-after", "Hide after play", "Return focus to GTA", state.settings.closeAfterPlay)}
    <label class="form-row range-setting"><span>Phone size <output>${Math.round(state.settings.windowScale * 100)}%</output></span><input id="window-scale" type="range" min="0.75" max="1.15" step="0.05" value="${state.settings.windowScale}"/></label></section>
    <section class="settings-section"><p class="section-label">MIGRATION</p><button id="import-legacy" class="settings-row"><span class="settings-icon">AHK</span><span><strong>Import MusicList.txt</strong><small>Bring your existing AHK library into this app</small></span>${icon("chevron")}</button></section>
    <button id="save-settings" class="primary-wide">Save settings</button></div>`;
  document.querySelectorAll<HTMLButtonElement>("[data-theme]").forEach(btn => btn.onclick = async () => { const theme = themes.find(x => x.name === btn.dataset.theme); if (theme) { state.settings.theme = structuredClone(theme); applyTheme(theme); await api.saveSettings(state.settings); render(); } });
  document.querySelector<HTMLButtonElement>("#edit-theme")!.onclick = themeEditor;
  document.querySelector<HTMLInputElement>("#window-scale")!.oninput = e => { const value = +(e.target as HTMLInputElement).value; state.settings.windowScale = value; document.querySelector<HTMLOutputElement>(".range-setting output")!.value = `${Math.round(value * 100)}%`; document.querySelector<HTMLElement>(".phone-wrap")!.style.setProperty("--phone-scale", String(value)); };
  document.querySelector<HTMLButtonElement>("#import-legacy")!.onclick = async () => { try { const count = await api.importLegacy(); state = await api.state(); selectedId = state.songs[0]?.id ?? ""; toast(`Imported ${count} songs`); render(); } catch (e) { errorToast(e); } };
  document.querySelector<HTMLButtonElement>("#save-settings")!.onclick = saveSettingsForm;
}

function toggleRow(id: string, title: string, copy: string, checked: boolean): string {
  return `<label class="toggle-row"><span><strong>${title}</strong><small>${copy}</small></span><input id="${id}" type="checkbox" ${checked ? "checked" : ""}/><i></i></label>`;
}

async function saveSettingsForm(): Promise<void> {
  state.settings.gameExe = document.querySelector<HTMLInputElement>("#game-exe")!.value.trim() || "GTA5.exe";
  state.settings.openChatKey = document.querySelector<HTMLInputElement>("#chat-key")!.value.trim() || "t";
  state.settings.downloadFolder = document.querySelector<HTMLInputElement>("#download-folder")!.value.trim();
  state.settings.alwaysOnTop = document.querySelector<HTMLInputElement>("#always-top")!.checked;
  state.settings.closeAfterPlay = document.querySelector<HTMLInputElement>("#close-after")!.checked;
  await api.saveSettings(state.settings); try { await getCurrentWindow().setAlwaysOnTop(state.settings.alwaysOnTop); } catch { }
  toast("Settings saved");
}

function editSong(song?: Song): void {
  modal(`<form id="song-form" class="modal-card"><div class="modal-head"><div><p class="eyebrow">LIBRARY</p><h2>${song ? "Edit song" : "Add song"}</h2></div><button type="button" data-close>×</button></div>
    ${field("Artist", "artist", song?.artist ?? "")}${field("Album", "album", song?.album ?? "")}${field("Song title", "title", song?.title ?? "")}${field("YouTube / media URL", "url", song?.url ?? "", "url")}${field("Length", "length", song?.length ?? "")}
    <label class="check-line"><input id="favorite" type="checkbox" ${song?.favorite ? "checked" : ""}/> Favorite</label><button class="primary-wide">${song ? "Save changes" : "Add to library"}</button></form>`);
  document.querySelector<HTMLFormElement>("#song-form")!.onsubmit = async e => {
    e.preventDefault(); const value = (id: string) => (document.querySelector<HTMLInputElement>(`#${id}`)!.value.trim());
    if (!value("artist") || !value("title") || !/^https?:\/\//i.test(value("url"))) { toast("Artist, title and a complete URL are required", true); return; }
    const next: Song = { id: song?.id ?? crypto.randomUUID(), artist: value("artist"), album: value("album"), title: value("title"), url: value("url"), length: value("length"), favorite: document.querySelector<HTMLInputElement>("#favorite")!.checked };
    if (song) state.songs[state.songs.findIndex(s => s.id === song.id)] = next; else state.songs.push(next);
    selectedId = next.id; await api.saveSongs(state.songs); closeModal(); toast(song ? "Song updated" : "Song added"); render();
  };
}

function field(label: string, id: string, value: string, type = "text"): string { return `<label class="modal-field"><span>${label}</span><input id="${id}" type="${type}" value="${esc(value)}"/></label>`; }

function songActions(id: string): void {
  const song = state.songs.find(s => s.id === id); if (!song) return;
  modal(`<div class="modal-card action-sheet"><div class="sheet-grab"></div><div class="sheet-song"><div class="cover" style="--h:${hashHue(song.id)}">${esc(song.title[0] ?? "E")}</div><div><strong>${esc(song.title)}</strong><span>${esc(song.artist)}</span></div></div>
    <button id="action-play">${icon("play")} Play now</button><button id="action-edit">${icon("edit")} Edit song</button><button id="action-download">${icon("download")} Download</button><button id="action-delete" class="danger">${icon("trash")} Delete song</button><button data-close>Cancel</button></div>`);
  document.querySelector<HTMLButtonElement>("#action-play")!.onclick = () => { selectedId = id; closeModal(); page = "player"; renderTabs(); render(); playSelected(); };
  document.querySelector<HTMLButtonElement>("#action-edit")!.onclick = () => { closeModal(); editSong(song); };
  document.querySelector<HTMLButtonElement>("#action-download")!.onclick = () => { closeModal(); downloadDialog(song.url); };
  document.querySelector<HTMLButtonElement>("#action-delete")!.onclick = async () => { if (confirm(`Delete ${song.title}?`)) { state.songs = state.songs.filter(s => s.id !== id); selectedId = state.songs[0]?.id ?? ""; await api.saveSongs(state.songs); closeModal(); render(); } };
}

function themeEditor(): void {
  const t = state.settings.theme;
  const colors: [keyof Theme, string][] = [["background","Background"],["surface","Panel"],["surfaceStrong","Raised panel"],["field","Fields"],["text","Main text"],["muted","Muted text"],["accent","Primary accent"],["accent2","Second accent"],["selected","Selected row"],["danger","Danger"],["success","Success"]];
  modal(`<form id="theme-form" class="modal-card theme-modal"><div class="modal-head"><div><p class="eyebrow">LIVE PREVIEW</p><h2>Custom theme</h2></div><button type="button" data-close>×</button></div><div class="color-grid">${colors.map(([key,label]) => `<label><span>${label}</span><input type="color" data-color="${key}" value="${t[key] as string}"/></label>`).join("")}</div>
    <label class="modal-field"><span>Glow <output>${t.glow}%</output></span><input type="range" min="0" max="100" data-number="glow" value="${t.glow}"/></label><label class="modal-field"><span>Glass blur <output>${t.blur}px</output></span><input type="range" min="0" max="40" data-number="blur" value="${t.blur}"/></label><button class="primary-wide">Save custom theme</button></form>`);
  document.querySelectorAll<HTMLInputElement>("[data-color]").forEach(input => input.oninput = () => { (t as unknown as Record<string,string>)[input.dataset.color!] = input.value; t.name = "Custom"; applyTheme(t); });
  document.querySelectorAll<HTMLInputElement>("[data-number]").forEach(input => input.oninput = () => { (t as unknown as Record<string,number>)[input.dataset.number!] = +input.value; input.parentElement!.querySelector("output")!.textContent = input.dataset.number === "blur" ? `${input.value}px` : `${input.value}%`; applyTheme(t); });
  document.querySelector<HTMLFormElement>("#theme-form")!.onsubmit = async e => { e.preventDefault(); t.name = "Custom"; await api.saveSettings(state.settings); closeModal(); toast("Custom theme saved"); render(); };
}

function downloadDialog(url: string): void {
  modal(`<div class="modal-card"><div class="modal-head"><div><p class="eyebrow">DOWNLOAD</p><h2>Choose format</h2></div><button data-close>×</button></div><button class="download-choice" data-kind="audio"><b>MP3 Audio</b><span>Best audio quality • requires FFmpeg</span></button><button class="download-choice" data-kind="video"><b>MP4 Video</b><span>Best compatible video quality</span></button></div>`);
  document.querySelectorAll<HTMLButtonElement>("[data-kind]").forEach(btn => btn.onclick = async () => { closeModal(); toast("Download started"); try { const path = await api.downloadMedia(url, btn.dataset.kind as "audio"|"video"); toast(`Saved to ${path}`); } catch (e) { errorToast(e); } });
}

async function installDependency(name: string): Promise<void> {
  if (!confirm(`Download and install ${name === "ytdlp" ? "yt-dlp" : "FFmpeg"} into the app tools folder?`)) return;
  toast(`Installing ${name}…`); try { await api.installDependency(name); state = await api.state(); toast(`${name} installed`); render(); } catch (e) { errorToast(e); }
}

function addSearchResult(index: number): void { const r = youtubeResults[index]; editSong({ id: crypto.randomUUID(), artist: r.channel, album: "YouTube", title: r.title, url: r.url, length: r.length, favorite: false }); }
function selectSong(id: string): void { selectedId = id; }

async function playSelected(): Promise<void> {
  const song = currentSong(); if (!song) return;
  const text = state.settings.mode === "Car" ? `/carurl ${song.url}` : song.url;
  try { await api.sendToGame(text, state.settings.mode === "Car"); toast(`${song.title} sent to ${state.settings.mode}`); if (state.settings.closeAfterPlay) { try { await getCurrentWindow().hide(); } catch { } } } catch (e) { errorToast(e); }
}

async function stopPlayback(): Promise<void> {
  const value = state.settings.mode === "Car" ? "/carurl" : state.settings.mode === "TV" ? "/CinemaStopQueue" : "https://www.youtube.com/watch?v=Vbks4abvLEw";
  try { await api.sendToGame(value, state.settings.mode !== "Speaker"); toast("Stop command sent"); } catch (e) { errorToast(e); }
}

function step(delta: number): void { if (!state.songs.length) return; let i = state.songs.findIndex(s => s.id === selectedId); i = (Math.max(i, 0) + delta + state.songs.length) % state.songs.length; selectedId = state.songs[i].id; render(); }

function modal(html: string): void { const root = document.querySelector<HTMLElement>("#modal-root")!; root.innerHTML = `<div class="modal-backdrop">${html}</div>`; root.querySelectorAll<HTMLElement>("[data-close]").forEach(x => x.onclick = closeModal); root.querySelector(".modal-backdrop")!.addEventListener("mousedown", e => { if (e.target === e.currentTarget) closeModal(); }); }
function closeModal(): void { document.querySelector<HTMLElement>("#modal-root")!.innerHTML = ""; }
function empty(title: string, copy: string): string { return `<div class="empty"><div class="empty-orb">♫</div><h3>${title}</h3><p>${copy}</p></div>`; }
function loading(label: string): string { return `<div class="empty"><div class="loader"></div><h3>${label}</h3></div>`; }
function hashHue(value: string): number { let n = 0; for (const c of value) n = (n * 31 + c.charCodeAt(0)) % 360; return n; }
function toast(message: string, danger = false): void { const el = document.querySelector<HTMLElement>("#toast")!; el.textContent = message; el.className = `toast show ${danger ? "danger" : ""}`; window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => el.classList.remove("show"), 3200); }
function errorToast(error: unknown): void { toast(error instanceof Error ? error.message : String(error), true); }

function startClock(): void { const update = () => { const el = document.querySelector("#clock"); if (el) el.textContent = new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit" }).format(new Date()); }; update(); window.setInterval(update, 30_000); }

function startVisualizer(): void {
  const canvas = document.querySelector<HTMLCanvasElement>("#visualizer"); if (!canvas) return; const ctx = canvas.getContext("2d")!; let frame = 0;
  const draw = () => { if (!canvas.isConnected) return; const rect = canvas.getBoundingClientRect(); canvas.width = Math.max(1, rect.width * devicePixelRatio); canvas.height = Math.max(1, rect.height * devicePixelRatio); ctx.scale(devicePixelRatio, devicePixelRatio); ctx.clearRect(0,0,rect.width,rect.height); const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(); const accent2 = getComputedStyle(document.documentElement).getPropertyValue("--accent-2").trim();
    for (let band=0; band<3; band++) { ctx.beginPath(); for(let x=0;x<=rect.width;x+=4){ const y=rect.height*(.45+band*.08)+Math.sin(x*.022+frame*.025+band)*22+Math.sin(x*.008-frame*.015)*18; x===0?ctx.moveTo(x,y):ctx.lineTo(x,y); } ctx.strokeStyle=band===1?accent:accent2; ctx.globalAlpha=.65-band*.12; ctx.lineWidth=2.2-band*.35; ctx.shadowBlur=18; ctx.shadowColor=ctx.strokeStyle; ctx.stroke(); } ctx.globalAlpha=1; frame++; requestAnimationFrame(draw); };
  requestAnimationFrame(draw);
}

async function init(): Promise<void> {
  try {
    state = await api.state(); selectedId = state.songs[0]?.id ?? ""; applyTheme(state.settings.theme); shell();
    await listen<string>("hotkey", async ({ payload }) => {
      if (!state.songs.length) return;
      const previousMode = state.settings.mode;
      state.settings.mode = payload === "random-speaker" ? "Speaker" : payload === "random-tv" ? "TV" : "Car";
      selectedId = state.songs[Math.floor(Math.random() * state.songs.length)].id;
      await playSelected(); state.settings.mode = previousMode;
    }).catch(() => undefined);
  }
  catch (e) { app.innerHTML = `<div class="fatal"><h1>Could not start Eclipse Phone Player</h1><pre>${esc(String(e))}</pre></div>`; }
}

init();
