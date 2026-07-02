/* doc-viewer.js — in-page PDF/document viewer using native <dialog> + <iframe>
 *
 * Usage:
 *   Include this script on any page that needs the viewer.
 *   Call openDocViewer(url, title) to open a document.
 *   The <dialog id="doc-viewer-dialog"> must be present in the HTML (or injected by init).
 *
 * HTML expected (or injected by initDocViewer()):
 *   <dialog id="doc-viewer-dialog">
 *     <div class="dv-header">
 *       <span id="doc-viewer-title"></span>
 *       <button id="doc-viewer-close">Close</button>
 *     </div>
 *     <div class="dv-body">
 *       <iframe id="doc-viewer-frame" title="Document viewer"></iframe>
 *     </div>
 *   </dialog>
 */

const MEDIA_BASE = 'https://media.skovgard2026.org';

function buildDocUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path;
  return `${MEDIA_BASE}/${path.replace(/^\//, '')}`;
}

function openDocViewer(path, title) {
  const dialog = document.getElementById('doc-viewer-dialog');
  const frame = document.getElementById('doc-viewer-frame');
  const titleEl = document.getElementById('doc-viewer-title');
  if (!dialog || !frame) return;
  const url = buildDocUrl(path);
  frame.src = url;
  if (titleEl) titleEl.textContent = title || 'Document';
  dialog.showModal();
}

function closeDocViewer() {
  const dialog = document.getElementById('doc-viewer-dialog');
  const frame = document.getElementById('doc-viewer-frame');
  if (frame) frame.src = '';
  if (dialog) dialog.close();
}

function initDocViewer() {
  if (document.getElementById('doc-viewer-dialog')) return;

  const dialog = document.createElement('dialog');
  dialog.id = 'doc-viewer-dialog';
  dialog.className = 'doc-viewer-dialog';
  dialog.innerHTML = `
    <div class="dv-header">
      <span id="doc-viewer-title" class="dv-title"></span>
      <button id="doc-viewer-close" class="dv-close" aria-label="Close document viewer">&#x2715; Close</button>
    </div>
    <div class="dv-body">
      <iframe id="doc-viewer-frame" class="dv-frame" title="Document viewer" src=""></iframe>
    </div>
  `;
  document.body.appendChild(dialog);

  document.getElementById('doc-viewer-close').addEventListener('click', closeDocViewer);

  // Close on backdrop click
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) closeDocViewer();
  });

  // Clear src on close to stop background PDF rendering
  dialog.addEventListener('close', () => {
    const frame = document.getElementById('doc-viewer-frame');
    if (frame) frame.src = '';
  });
}

// Render doc trigger buttons from a docs JSON array into a container element.
// docsJson: [{ title: "...", path: "candidates/slug/docs/file.pdf", type: "pdf" }]
function renderDocButtons(container, docsJson) {
  if (!container || !Array.isArray(docsJson) || docsJson.length === 0) return;
  docsJson.forEach((doc) => {
    const btn = document.createElement('button');
    btn.className = 'doc-trigger-btn';
    btn.type = 'button';
    btn.textContent = doc.title || 'Document';
    btn.addEventListener('click', () => openDocViewer(doc.path, doc.title));
    container.appendChild(btn);
  });
}

document.addEventListener('DOMContentLoaded', initDocViewer);

window.openDocViewer = openDocViewer;
window.closeDocViewer = closeDocViewer;
window.renderDocButtons = renderDocButtons;
