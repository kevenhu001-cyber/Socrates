# Feature Gap Analysis: Beagle System Prompt vs Socrates

**Date:** 2026-06-20
**Source:** `Claude-Opus-4.7.txt` (adapted to `prompts/beagle.md`)

## Gap Overview

| Feature | Beagle/Claude | Socrates | Status | Priority |
|---------|--------------|----------|--------|----------|
| Citations (`{cite}`) | ✅ Native | ⬜ Missing | **Implemented** | High |
| Vision/Multimodal | ✅ Supported | ⬜ Partial | **Implemented** | High |
| File Download | ✅ Supported | ⬜ Missing | **Implemented** | Medium |
| Image Search | ✅ Supported | ⬜ Missing | **Implemented** | Medium |
| Code Execution Sandbox | ✅ E2B sandbox | ⬜ Missing | **Not started** | Low |
| Computer Use (CUA) | ✅ Beta | N/A (no browser) | Skipped | N/A |
| Artifacts (viz iframe) | ✅ Native | ✅ Viz iframes exist | Already done | - |
| Web Search | ✅ Native | ✅ Bing integration | Already done | - |

---

## 1. Citation System (`{cite}`) — DONE

### Implementation
- **formatMsg()**: Parses `{cite index="0-2"}text{/cite}` → clickable `[N]` superscript links
- **stripChatArtifacts()**: Stream-rendering strips `{cite}` tags, keeps inner text
- **annotateCitationsInElement()**: Post-render pass annotates citation refs with source cards

### Files Changed
- `index.html`: `formatMsg()`, `stripChatArtifacts()`, CSS for `.cite-ref`

### Verification
- `formatMsg` regex: `/{(?:cite)\s*(?:[^}]*?)?}[\s\S]*?{\/\/(?:cite)}/gi`
- Strips in streaming, converts on finish

---

## 2. Vision/Multimodal (Image Input) — DONE

### Implementation
- **Backend schema** (`chat.js`): `ContentPartSchema` + `MessageSchema` supporting `z.union([z.string(), z.array(ContentPartSchema)])`
- **Attach button**: Paperclip icon in input bar, opens `#imageInput` (accepts jpeg/png/gif/webp)
- **Paste support**: `handleChatPaste()` reads clipboard images, preserves co-pasted text
- **Preview**: Thumbnail strip with remove buttons above textarea
- **Bubble rendering**: `renderUserImagesInBubble()` adds image gallery inside user message bubble
- **Multimodal API construction**: `buildUserContent()` in `askChatTurn()` builds `[{type:"text",text:"..."}, {type:"image_url",image_url:{url:"data:base64..."}}]`
- **Cleanup**: `window._attachedImages` cleared after sending

### Files Changed
- `server/src/routes/chat.js`: `ContentPartSchema`, `MessageSchema`
- `index.html`: `.attach-btn`, `.chat-image-preview`, `.msg-image-gallery`, all image handler functions, `buildUserContent()` in `askChatTurn()`

### Limitations
- Images only work in chat mode (not tutor mode)
- Images aren't persisted in session history (DOM-only, not in `state.messages[i].rawText`)
- Max 20 MB per image, max 50 parts per message

---

## 3. File Download — DONE

### Implementation
- **Download button** in assistant message toolbar (between regenerate and thumbs-up)
- **`downloadMessageContent()`**: Parses code blocks from message text
- **Single block**: Downloads directly via Blob URL
- **Multiple blocks**: Shows `showDownloadPicker()` modal with language labels
- **No blocks**: Downloads full message text as `.txt`
- **`downloadAsFile()`**: Maps extensions to MIME types, creates Blob + download link

### Files Changed
- `index.html`: `downloadMessageContent()`, `downloadAsFile()`, `showDownloadPicker()`, `.download-picker-overlay` CSS

### Limitations
- Uses Blob URLs in memory, large files may consume memory
- Extension guessing is best-effort

---

## 4. Image Search — DONE

### Implementation
- **Backend** (`webSearch.js`): `parseBingImageHtml()` parses Bing Images HTML (`iusc` cards, `mimg` fallback), `imageSearch()` fetches and returns `{title, url, thumbnailUrl, sourceUrl}[]`
- **Route** (`app.js`): `POST /api/image-search`
- **Frontend** (`index.html`): `searchImages()` calls API, `openImageGallery()` shows full-screen modal grid, `closeGallery()` dismisses

### Files Changed
- `server/src/services/webSearch.js`: `parseBingImageHtml()`, `imageSearch()`
- `server/src/app.js`: import + route
- `index.html`: `searchImages()`, `openImageGallery()`, `closeGallery()`, `.image-search-overlay` CSS

### Limitations
- Bing HTML parsing is fragile (Bing can change markup)
- No integration with chat flow yet (standalone modal, not model-triggered)

---

## 5. Code Execution Sandbox — NOT STARTED

### Beagle/Claude Feature
E2B sandbox that runs Python/JS/Shell code securely within the chat, returning stdout/stderr.

### Socrates Equivalent
Currently none. Viz iframes render HTML but don't execute arbitrary code.

### Recommended Approach
- Option A: Server-side Docker sandbox (secure but complex)
  - Each execution in ephemeral container with 5s timeout
  - Need Docker daemon access on server
- Option B: Browser-side WebContainer/iframe (simpler)
  - Limited to JS/Python via Pyodide
  - No server dependency
- Option C: Third-party API (e.g., Piston, Judge0)
  - External dependency
  - Rate-limited

**Not implemented due to complexity — requires infrastructure decisions.**

---

## Summary

| Feature | Status | Effort |
|---------|--------|--------|
| Citation system | ✅ Implemented | Medium |
| Vision/Multimodal | ✅ Implemented | Large |
| File download | ✅ Implemented | Small |
| Image search | ✅ Implemented | Medium |
| Code execution | ❌ Not started | Large (infra) |

4/5 gaps filled. Code execution deferred — requires Docker or third-party API.
