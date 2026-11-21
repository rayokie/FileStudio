'use strict';
const $ = id => document.getElementById(id);

// --- SPLASH (never waits on slow network; fixed short delay) ---
setTimeout(() => {
    const s = $('custom-splash');
    if (!s) return;
    s.style.opacity = '0';
    setTimeout(() => s.remove(), 500);
}, 1200);

// --- STATE & ELEMENTS ---
const el = {
    navImg: $('nav-img2pdf'), navPdf: $('nav-pdf2img'), navHist: $('nav-history'),
    hint: $('upload-hint'), zone: $('upload-zone'), zoneTitle: $('zone-title'),
    inImg: $('file-input-img'), inPdf: $('file-input-pdf'), inCam: $('camera-input'),
    camBtn: $('trigger-camera-btn'), list: $('file-list'),
    summary: $('file-summary'), count: $('file-count'), clear: $('clear-files'),
    options: $('options-container'), slider: $('size-slider'), sizeLabel: $('size-label'), sizeEst: $('size-estimate'), histMeta: $('history-meta'), clearHist: $('clear-history'), pageSize: $('page-size'),
    name: $('custom-filename'), convert: $('convert-btn'), status: $('status-message'),
    modal: $('history-modal'), closeHist: $('close-history'), histList: $('history-list'),
    loader: $('loading-overlay'), loaderText: $('loading-text'), bar: $('progress-bar')
};
let mode = 'img2pdf';
let files = [];            // { file, url }
let history = [];          // { id, name, blob, size, ts }
const LIMITS_KB = [100, 200, 300, 500, 750, 1024, 2048, 3072, 5120, Infinity]; // slider steps; last = original
let busy = false;
let statusTimer;

// --- UI HELPERS ---
const tick = () => new Promise(r => setTimeout(r));
const fmtSize = b => b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`;
const cleanName = (s, fallback) => (s || '').replace(/\.[^.]*$/, '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim().slice(0, 80) || fallback;

function setStatus(msg, type = '') {
    clearTimeout(statusTimer);
    el.status.textContent = msg;
    el.status.className = 'status ' + type;
    if (msg && type !== 'err') statusTimer = setTimeout(() => { el.status.textContent = ''; }, 5000);
}

function showLoader(text, pct) {
    busy = true;
    el.loader.style.display = 'flex';
    el.loaderText.textContent = text;
    el.bar.style.width = (pct || 0) + '%';
}
function hideLoader() { busy = false; el.loader.style.display = 'none'; }

// --- MODE SWITCHING ---
function setMode(next) {
    if (busy) return;
    mode = next;
    clearFiles();
    setStatus('');
    const img = mode === 'img2pdf';
    el.navImg.classList.toggle('active', img);
    el.navPdf.classList.toggle('active', !img);
    el.options.hidden = !img;
    el.camBtn.hidden = !img;
    el.hint.textContent = img ? 'Choose images, drop them here, or take a photo' : 'Choose a PDF to turn into JPG images';
    el.zoneTitle.textContent = img ? 'Choose images' : 'Choose a PDF';
    el.convert.textContent = img ? 'Convert to PDF' : 'Convert to JPG';
}
el.navImg.onclick = () => setMode('img2pdf');
loadHistory();
el.navPdf.onclick = () => setMode('pdf2img');

// --- FILE SELECTION ---
el.zone.onclick = () => { const i = mode === 'img2pdf' ? el.inImg : el.inPdf; i.value = ''; i.click(); };
el.camBtn.onclick = () => { el.inCam.value = ''; el.inCam.click(); };
[el.inImg, el.inPdf, el.inCam].forEach(i => i.addEventListener('change', e => addFiles(e.target.files, e.target === el.inCam)));

['dragenter', 'dragover'].forEach(t => el.zone.addEventListener(t, e => { e.preventDefault(); el.zone.classList.add('drag'); }));
['dragleave', 'drop'].forEach(t => el.zone.addEventListener(t, e => { e.preventDefault(); el.zone.classList.remove('drag'); }));
el.zone.addEventListener('drop', e => addFiles(e.dataTransfer.files, true));

function addFiles(list, append) {
    if (busy || !list || !list.length) return;
    const wantPdf = mode === 'pdf2img';
    const ok = Array.from(list).filter(f => wantPdf ? (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) : f.type.startsWith('image/'));
    const skipped = list.length - ok.length;
    if (skipped) setStatus(`Skipped ${skipped} file${skipped > 1 ? 's' : ''}. Only ${wantPdf ? 'PDF' : 'image'} files work here.`, 'err');
    if (!ok.length) return;

    if (wantPdf || !append) clearFiles(true);
    const next = wantPdf ? ok.slice(0, 1) : ok;
    next.forEach(f => files.push({ file: f, url: wantPdf ? '' : URL.createObjectURL(f) }));
    render();
}

function clearFiles(keepStatus) {
    files.forEach(f => f.url && URL.revokeObjectURL(f.url));
    files = [];
    render();
}
el.clear.onclick = () => { if (!busy) clearFiles(); };

function move(i, d) {
    const j = i + d;
    if (j < 0 || j >= files.length) return;
    [files[i], files[j]] = [files[j], files[i]];
    render();
}

function render() {
    el.list.textContent = '';
    files.forEach((f, i) => {
        const li = document.createElement('li');
        li.className = 'file-item';
        if (f.url) {
            const img = document.createElement('img');
            img.src = f.url; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
            li.appendChild(img);
        } else {
            const d = document.createElement('div');
            d.className = 'pdf-thumb'; d.textContent = 'PDF';
            li.appendChild(d);
        }
        const info = document.createElement('div');
        info.className = 'file-info';
        const n = document.createElement('span'); n.className = 'file-name'; n.textContent = f.file.name || `Photo ${i + 1}`;
        const s = document.createElement('span'); s.className = 'file-size'; s.textContent = (mode === 'img2pdf' ? `Page ${i + 1} · ` : '') + fmtSize(f.file.size);
        info.append(n, s);
        li.appendChild(info);

        const acts = document.createElement('div');
        acts.className = 'file-actions';
        const mk = (label, aria, fn, dis) => {
            const b = document.createElement('button');
            b.type = 'button'; b.textContent = label; b.setAttribute('aria-label', aria); b.disabled = !!dis; b.onclick = fn;
            return b;
        };
        if (mode === 'img2pdf' && files.length > 1) {
            acts.append(mk('↑', 'Move up', () => move(i, -1), i === 0), mk('↓', 'Move down', () => move(i, 1), i === files.length - 1));
        }
        acts.append(mk('✕', 'Remove', () => { if (busy) return; if (f.url) URL.revokeObjectURL(f.url); files.splice(i, 1); render(); }));
        li.appendChild(acts);
        el.list.appendChild(li);
    });
    const n = files.length;
    el.summary.hidden = n === 0;
    el.count.textContent = n === 1 ? '1 file selected' : `${n} files selected`;
    el.convert.disabled = n === 0 || busy;
    updateEstimate();
}

// --- SIZE SLIDER ---
const limitBytes = () => LIMITS_KB[+el.slider.value] * 1024;
const fmtLimit = b => b === Infinity ? 'Original quality' : 'Under ' + fmtSize(b);
function updateEstimate() {
    const lim = limitBytes();
    el.sizeLabel.textContent = fmtLimit(lim);
    const total = files.reduce((n, f) => n + f.file.size, 0);
    el.slider.style.setProperty('--fill', (el.slider.value / el.slider.max * 100) + '%');
    if (!files.length) { el.sizeEst.textContent = 'Add images to see the estimated size.'; return; }
    const overhead = 2048 + files.length * 600;
    if (lim === Infinity || total + overhead <= lim) {
        el.sizeEst.textContent = `Estimated size: about ${fmtSize(total + overhead)}. Images keep full quality.`;
    } else {
        const floor = files.length * 25 * 1024;
        const est = Math.max(Math.min(lim * 0.92, total), Math.min(floor, lim));
        el.sizeEst.textContent = floor > lim
            ? `${files.length} pages may not fit under ${fmtSize(lim)}. Expect about ${fmtSize(floor)} at best.`
            : `Estimated size: about ${fmtSize(est)}, never above ${fmtSize(lim)}.`;
    }
}
el.slider.addEventListener('input', updateEstimate);

// --- CONVERT ---
el.convert.onclick = async () => {
    if (!files.length || busy) return;
    const lib = mode === 'img2pdf' ? window.jspdf : window.pdfjsLib;
    if (!lib) { setStatus('Converter failed to load. Check your connection and reload.', 'err'); return; }
    el.convert.disabled = true;
    setStatus('');
    showLoader(mode === 'img2pdf' ? 'Building PDF…' : 'Reading PDF…', 0);
    try {
        const msg = mode === 'img2pdf' ? await imagesToPdf() : await pdfToImages();
        setStatus(msg, 'ok');
    } catch (err) {
        console.error(err);
        setStatus(err && err.name === 'PasswordException' ? 'This PDF is password protected.' : 'Conversion failed. The file may be damaged or too large.', 'err');
    } finally {
        hideLoader();
        render();
    }
};

// Decode with EXIF orientation applied and draw onto a white canvas, optionally scaled.
async function loadToCanvas(file, maxSide) {
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch {
        bmp = await new Promise((res, rej) => {
            const img = new Image();
            const u = URL.createObjectURL(file);
            img.onload = () => { URL.revokeObjectURL(u); res(img); };
            img.onerror = () => { URL.revokeObjectURL(u); rej(new Error('decode')); };
            img.src = u;
        });
    }
    const w0 = bmp.width, h0 = bmp.height;
    const k = Math.min(1, maxSide / Math.max(w0, h0));
    const c = document.createElement('canvas');
    c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) bmp.close();
    return c;
}

// Re-encode until under the byte budget, shrinking quality first, then size.
function encodeToBudget(canvas, budget) {
    let q = 0.75, c = canvas;
    for (let i = 0; i < 12; i++) {
        const url = c.toDataURL('image/jpeg', q);
        if ((url.length * 3) / 4 <= budget || (q <= 0.3 && Math.max(c.width, c.height) <= 400)) return { url, w: c.width, h: c.height };
        if (q > 0.35) q -= 0.1;
        else if (Math.max(c.width, c.height) > 400) {
            const n = document.createElement('canvas');
            n.width = Math.round(c.width * 0.8); n.height = Math.round(c.height * 0.8);
            n.getContext('2d').drawImage(c, 0, 0, n.width, n.height);
            c = n;
        }
    }
    return { url: c.toDataURL('image/jpeg', 0.3), w: c.width, h: c.height };
}

async function imagesToPdf() {
    const { jsPDF } = window.jspdf;
    const limit = limitBytes(), fit = el.pageSize.value === 'fit';
    const total = files.reduce((n, f) => n + f.file.size, 0);
    const overhead = 2048 + files.length * 600;
    const original = limit === Infinity || total + overhead <= limit;
    let scale = 0.92, blob, tries = original ? 1 : 4;

    for (let t = 0; t < tries; t++) {
        let doc;
        for (let i = 0; i < files.length; i++) {
            showLoader(`${t ? 'Shrinking, attempt ' + (t + 1) + ': ' : ''}page ${i + 1} of ${files.length}…`, ((t * files.length + i) / (tries * files.length)) * 100);
            await tick();
            const canvas = await loadToCanvas(files[i].file, original ? 4000 : 1600);
            let out;
            if (original) out = { url: canvas.toDataURL('image/jpeg', 0.92), w: canvas.width, h: canvas.height };
            else out = encodeToBudget(canvas, Math.max(8 * 1024, (limit - overhead) * scale * (files[i].file.size / total)));
            canvas.width = canvas.height = 0;

            let pw, ph;
            if (fit) { const k = 842 / Math.max(out.w, out.h); pw = out.w * k; ph = out.h * k; }
            const orient = out.w > out.h ? 'l' : 'p';
            const format = fit ? [Math.min(pw, ph), Math.max(pw, ph)] : 'a4';
            if (!doc) doc = new jsPDF({ unit: 'pt', format, orientation: orient, compress: true });
            else doc.addPage(format, orient);
            const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
            const r = Math.min(W / out.w, H / out.h), w = out.w * r, h = out.h * r;
            doc.addImage(out.url, 'JPEG', (W - w) / 2, (H - h) / 2, w, h, undefined, 'FAST');
        }
        blob = doc.output('blob');
        if (original || blob.size <= limit) break;
        scale *= Math.min(0.85, (limit / blob.size) * 0.95);
    }
    showLoader('Saving…', 100);
    const name = cleanName(el.name.value, 'converted_document') + '.pdf';
    await saveFile(blob, name, 'Image to PDF');
    if (!original && blob.size > limit) return `Saved ${name} (${fmtSize(blob.size)}). This many pages can't go under ${fmtSize(limit)}; pick a higher limit.`;
    return `Saved ${name} (${fmtSize(blob.size)})`;
}

async function pdfToImages() {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const file = files[0].file;
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const base = cleanName(el.name.value || file.name, 'document');
    const n = pdf.numPages, out = [];
    try {
        for (let p = 1; p <= n; p++) {
            showLoader(`Rendering page ${p} of ${n}…`, ((p - 1) / n) * 100);
            await tick();
            const page = await pdf.getPage(p);
            const base1 = page.getViewport({ scale: 1 });
            const scale = Math.min(2, 4096 / Math.max(base1.width, base1.height));
            const vp = page.getViewport({ scale });
            const c = document.createElement('canvas');
            c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
            await page.render({ canvasContext: c.getContext('2d'), viewport: vp, background: '#ffffff' }).promise;
            const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
            c.width = c.height = 0;
            page.cleanup();
            out.push({ blob, name: n > 1 ? `${base}_${String(p).padStart(String(n).length, '0')}.jpg` : `${base}.jpg` });
        }
    } finally { pdf.destroy(); }

    if (n > 1 && !window.cordova && window.JSZip) {
        showLoader('Zipping…', 100);
        const zip = new JSZip();
        out.forEach(o => zip.file(o.name, o.blob));
        const zb = await zip.generateAsync({ type: 'blob' });
        await saveFile(zb, `${base}.zip`, 'PDF to JPG');
        return `Saved ${n} pages as ${base}.zip`;
    }
    for (const o of out) await saveFile(o.blob, o.name, 'PDF to JPG');
    return n > 1 ? `Saved ${n} images` : `Saved ${out[0].name}`;
}

// --- SAVING ---
function saveFile(blob, name, sub) {
    const url = URL.createObjectURL(blob);
    addHistory({ id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), name, blob, size: blob.size, ts: Date.now() });

    if (!window.cordova) {
        const a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        return Promise.resolve();
    }
    // Cordova: write to FileStudio/<sub>/<name>
    const getDir = (parent, dirName) => new Promise((res, rej) => parent.getDirectory(dirName, { create: true }, res, rej));
    return new Promise((res, rej) => window.resolveLocalFileSystemURL(cordova.file.externalRootDirectory, res, rej))
        .then(root => getDir(root, 'FileStudio')).then(d => getDir(d, sub))
        .then(d => new Promise((res, rej) => d.getFile(name, { create: true, exclusive: false }, res, rej)))
        .then(fe => new Promise((res, rej) => fe.createWriter(w => { w.onwriteend = res; w.onerror = rej; w.write(blob); }, rej)))
        .catch(e => { throw Object.assign(new Error('Storage error. Check app permissions.'), { cause: e }); });
}

// --- HISTORY (persistent in IndexedDB, survives browser restarts) ---
const DB_NAME = 'filestudio', STORE = 'history';
let dbp;
function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
        if (!window.indexedDB) return rej(new Error('no idb'));
        const r = indexedDB.open(DB_NAME, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    });
    return dbp;
}
async function tx(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
        const t = d.transaction(STORE, mode), out = fn(t.objectStore(STORE));
        t.oncomplete = () => res(out && out.result);
        t.onerror = t.onabort = () => rej(t.error);
    });
}
async function loadHistory() {
    try { history = (await tx('readonly', s => s.getAll())) || []; } catch { history = []; }
    history.sort((a, b) => b.ts - a.ts);
    renderHistory();
}
async function addHistory(item) {
    history.unshift(item);
    renderHistory();
    try {
        await tx('readwrite', s => s.put(item));
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); // ask the browser not to evict
    } catch (e) { console.warn('History not saved to disk', e); setStatus('Converted, but this browser could not save it to history.', 'err'); }
}
async function removeHistory(ids) {
    history = history.filter(h => !ids.includes(h.id));
    renderHistory();
    try { await tx('readwrite', s => ids.forEach(id => s.delete(id))); } catch {}
}
el.clearHist.onclick = () => { if (history.length && confirm(`Delete all ${history.length} saved files from this browser?`)) removeHistory(history.map(h => h.id)); };

function download(item) {
    const u = URL.createObjectURL(item.blob);
    const a = document.createElement('a');
    a.href = u; a.download = item.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 60000);
}

function renderHistory() {
    el.histList.textContent = '';
    const total = history.reduce((n, h) => n + h.size, 0);
    el.histMeta.textContent = history.length ? `${history.length} file${history.length > 1 ? 's' : ''} · ${fmtSize(total)}` : '';
    el.clearHist.hidden = !history.length;
    if (!history.length) {
        const d = document.createElement('div');
        d.className = 'empty-history'; d.textContent = 'Nothing converted yet. Files you convert are saved here.';
        el.histList.appendChild(d);
        return;
    }
    history.forEach(item => {
        const row = document.createElement('div');
        row.className = 'history-item';
        const info = document.createElement('div');
        info.className = 'history-info';
        const n = document.createElement('span'); n.className = 'history-name'; n.textContent = item.name;
        const d = new Date(item.ts);
        const t = document.createElement('span'); t.className = 'history-time';
        t.textContent = `${d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${fmtSize(item.size)}`;
        info.append(n, t);
        row.append(info);

        const btn = (label, cls, fn, aria) => {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'history-action ' + cls; b.textContent = label; b.onclick = fn;
            if (aria) b.setAttribute('aria-label', aria);
            return b;
        };
        const file = new File([item.blob], item.name, { type: item.blob.type });
        if (navigator.canShare && navigator.canShare({ files: [file] })) row.append(btn('Share', 'alt', () => navigator.share({ files: [file] }).catch(() => {})));
        row.append(btn('Save', '', () => download(item)));
        row.append(btn('🗑', 'alt', () => removeHistory([item.id]), 'Delete ' + item.name));
        el.histList.appendChild(row);
    });
}

function openHistory() { renderHistory(); el.modal.classList.add('active'); el.closeHist.focus(); }
function closeHistory() { el.modal.classList.remove('active'); el.navHist.focus(); }
el.navHist.onclick = openHistory;
el.closeHist.onclick = closeHistory;
el.modal.addEventListener('click', e => { if (e.target === el.modal) closeHistory(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && el.modal.classList.contains('active')) closeHistory(); });
document.addEventListener('backbutton', e => { if (el.modal.classList.contains('active')) { e.preventDefault(); closeHistory(); } }, false);

// Stop the browser from opening a file that is dropped outside the drop zone.
['dragover', 'drop'].forEach(t => window.addEventListener(t, e => e.preventDefault()));

setMode('img2pdf');
loadHistory();
