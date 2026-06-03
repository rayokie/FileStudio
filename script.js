// --- PROGRAMMATIC SPLASH SCREEN LOGIC ---
function removeSplashScreen() {
    setTimeout(function() {
        const splash = document.getElementById('custom-splash');
        if (splash) {
            splash.style.opacity = '0'; 
            setTimeout(() => splash.remove(), 600); 
        }
    }, 2200); 
}
document.addEventListener('deviceready', removeSplashScreen, false);
if (!window.cordova) { window.addEventListener('load', removeSplashScreen); }


// --- SETUP & DOM ELEMENTS ---
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const navImg2PdfBtn = document.getElementById('nav-img2pdf');
const navPdf2ImgBtn = document.getElementById('nav-pdf2img');
const navHistoryBtn = document.getElementById('nav-history');

const uploadHint = document.getElementById('upload-hint');
const uploadZone = document.getElementById('upload-zone');
const fileInputImg = document.getElementById('file-input-img');
const fileInputPdf = document.getElementById('file-input-pdf');
const cameraInput = document.getElementById('camera-input');
const triggerCameraBtn = document.getElementById('trigger-camera-btn');
const fileList = document.getElementById('file-list');

const optionsContainer = document.getElementById('options-container');
const compressCheckbox = document.getElementById('compress-checkbox');
const customFilenameInput = document.getElementById('custom-filename');
const convertBtn = document.getElementById('convert-btn');
const statusMessage = document.getElementById('status-message');

const historyModal = document.getElementById('history-modal');
const closeHistoryBtn = document.getElementById('close-history');
const historyList = document.getElementById('history-list');

let currentMode = 'img2pdf';
let selectedFiles = [];
let conversionHistory = []; 

// --- LOADER UI ---
function toggleLoader(show, text = "Processing File...") {
    const loader = document.getElementById('loading-overlay');
    const loaderText = document.getElementById('loading-text');
    if (show) {
        loaderText.innerText = text;
        loader.style.display = 'flex';
    } else {
        loader.style.display = 'none';
    }
}

// --- NAV & MODE SWITCHING ---
navImg2PdfBtn.addEventListener('click', () => switchMode('img2pdf'));
navPdf2ImgBtn.addEventListener('click', () => switchMode('pdf2img'));
navHistoryBtn.addEventListener('click', () => historyModal.classList.add('active'));

function switchMode(mode) {
    currentMode = mode;
    selectedFiles = [];
    fileList.textContent = '';
    convertBtn.disabled = true;
    statusMessage.textContent = '';

    if (mode === 'img2pdf') {
        navImg2PdfBtn.classList.add('active');
        navPdf2ImgBtn.classList.remove('active');
        uploadHint.textContent = 'Tap below to select your original images';
        optionsContainer.style.display = 'block';
        triggerCameraBtn.style.display = 'flex'; 
        convertBtn.textContent = 'Convert to PDF';
    } else {
        navPdf2ImgBtn.classList.add('active');
        navImg2PdfBtn.classList.remove('active');
        uploadHint.textContent = 'Tap below to select your original PDF';
        optionsContainer.style.display = 'none';
        triggerCameraBtn.style.display = 'none'; 
        convertBtn.textContent = 'Convert to JPG';
    }
}

// --- FILE SELECTION ---
triggerCameraBtn.addEventListener('click', () => {
    cameraInput.value = ''; 
    cameraInput.click();
});

uploadZone.addEventListener('click', () => {
    if (currentMode === 'img2pdf') {
        fileInputImg.value = ''; 
        fileInputImg.click();
    } else {
        fileInputPdf.value = ''; 
        fileInputPdf.click();
    }
});

function handleFileSelection(e) {
    if (!e.target.files || e.target.files.length === 0) return;
    
    if (e.target === cameraInput) {
        selectedFiles = selectedFiles.concat(Array.from(e.target.files));
    } else {
        selectedFiles = Array.from(e.target.files);
    }
    
    if (selectedFiles.length > 0) {
        convertBtn.disabled = false;
        const fileNames = selectedFiles.map((f, index) => f.name || `Photo_${index + 1}.jpg`).join(', ');
        fileList.textContent = fileNames.length > 50 ? fileNames.substring(0, 47) + '...' : fileNames;
    } else {
        convertBtn.disabled = true;
        fileList.textContent = '';
    }
}

fileInputImg.addEventListener('change', handleFileSelection);
fileInputPdf.addEventListener('change', handleFileSelection);
cameraInput.addEventListener('change', handleFileSelection);

// --- MAIN CONVERT LOGIC ---
convertBtn.addEventListener('click', async () => {
    if (selectedFiles.length === 0) return;
    
    convertBtn.disabled = true;
    statusMessage.textContent = '';
    toggleLoader(true, currentMode === 'img2pdf' ? 'Building PDF Document...' : 'Extracting Images...');

    try {
        if (currentMode === 'img2pdf') {
            await handleImageToPdf();
        } else {
            await handlePdfToImage();
        }
        statusMessage.textContent = 'Conversion Complete!';
        statusMessage.style.color = '#2ea043';
    } catch (error) {
        console.error(error);
        statusMessage.textContent = 'An error occurred during conversion.';
        statusMessage.style.color = '#f85149';
    } finally {
        convertBtn.disabled = false;
        toggleLoader(false);
        setTimeout(() => statusMessage.textContent = '', 4000);
    }
});

// === PDF TO JPG LOGIC ===
async function handlePdfToImage() {
    const file = selectedFiles[0];
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    
    let baseName = customFilenameInput.value.trim() || file.name.replace('.pdf', '');
    
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 }); 
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
        
        let finalName = pdf.numPages > 1 ? `${baseName}_${pageNum}.jpg` : `${baseName}.jpg`;
        await saveAndRecordFile(blob, finalName, "PDF to JPG");
    }
}

// === IMAGE TO PDF LOGIC ===
async function handleImageToPdf() {
    const { jsPDF } = window.jspdf;
    const isCompressed = compressCheckbox.checked;
    const doc = new jsPDF('p', 'pt', 'a4'); 
    
    const targetTotalBytes = 490 * 1024; 
    const bytesPerImage = targetTotalBytes / selectedFiles.length;

    for (let i = 0; i < selectedFiles.length; i++) {
        if (i > 0) doc.addPage();
        
        let imgDataUrl = await readFileAsDataURL(selectedFiles[i]);
        let imgFormat = 'JPEG'; 
        
        if (isCompressed) {
            imgDataUrl = await compressImageStrict(imgDataUrl, bytesPerImage);
        } else {
            const formatMatch = imgDataUrl.match(/data:image\/(.*);/);
            if (formatMatch && formatMatch[1]) {
                imgFormat = formatMatch[1].toUpperCase();
                if(imgFormat === 'SVG+XML') imgFormat = 'SVG'; 
            }
        }

        const props = doc.getImageProperties(imgDataUrl);
        const pdfWidth = doc.internal.pageSize.getWidth();
        const pdfHeight = doc.internal.pageSize.getHeight();
        
        const ratio = Math.min(pdfWidth / props.width, pdfHeight / props.height);
        const width = props.width * ratio;
        const height = props.height * ratio;
        
        const x = (pdfWidth - width) / 2;
        const y = (pdfHeight - height) / 2;
        
        doc.addImage(imgDataUrl, imgFormat, x, y, width, height, undefined, 'FAST');
    }

    const blob = doc.output('blob');
    let finalName = customFilenameInput.value.trim() || 'converted_document';
    await saveAndRecordFile(blob, `${finalName}.pdf`, "Image to PDF");
}

// === HISTORY & NATIVE FILE SAVING SYSTEM ===
function saveAndRecordFile(blob, filename, subFolder) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        conversionHistory.unshift({ filename, url, timestamp });
        updateHistoryUI();

        // 1. Browser Test Fallback (If not running on a real phone)
        if (!window.cordova) {
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            resolve();
            return;
        }

        // 2. Android Native Cordova Save (Writes directly to Main Storage / FileStudio / Subfolder)
        const storageLocation = cordova.file.externalRootDirectory;
        
        window.resolveLocalFileSystemURL(storageLocation, function(dirEntry) {
            dirEntry.getDirectory("FileStudio", {create: true}, function(studioDir) {
                studioDir.getDirectory(subFolder, {create: true}, function(targetDir) {
                    targetDir.getFile(filename, {create: true, exclusive: false}, function(fileEntry) {
                        fileEntry.createWriter(function(fileWriter) {
                            fileWriter.onwriteend = function() {
                                resolve(); // Success!
                            };
                            fileWriter.onerror = function(e) {
                                alert("Write failed: " + e.toString());
                                reject(e);
                            };
                            fileWriter.write(blob);
                        });
                    }, reject);
                }, reject);
            }, reject);
        }, (err) => { 
            alert("Storage error. Please check app permissions."); 
            reject(err); 
        });
    });
}

// --- HISTORY MODAL LOGIC ---
closeHistoryBtn.addEventListener('click', () => historyModal.classList.remove('active'));

function updateHistoryUI() {
    if (conversionHistory.length === 0) {
        historyList.innerHTML = '<div class="empty-history">No files converted yet.</div>';
        return;
    }
    
    historyList.innerHTML = '';
    conversionHistory.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML = `
            <div class="history-info">
                <span class="history-name">${item.filename}</span>
                <span class="history-time">${item.timestamp}</span>
            </div>
            <a href="${item.url}" download="${item.filename}" class="history-action">View</a>
        `;
        historyList.appendChild(div);
    });
}

// --- HELPER FUNCTIONS ---
function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function compressImageStrict(dataUrl, targetBytes) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            let scale = 1;
            if (img.width > 1200) scale = 1200 / img.width;
            
            let width = img.width * scale;
            let height = img.height * scale;
            let quality = 0.7; 
            
            const attemptCompression = () => {
                canvas.width = width;
                canvas.height = height;
                ctx.clearRect(0,0, width, height);
                ctx.fillStyle = '#FFFFFF'; 
                ctx.fillRect(0,0, width, height);
                ctx.drawImage(img, 0, 0, width, height);
                
                const resultUrl = canvas.toDataURL('image/jpeg', quality);
                const approxBytes = Math.round((resultUrl.length * 3) / 4); 

                if (approxBytes > targetBytes && quality > 0.1) {
                    quality -= 0.15;
                    width *= 0.8;
                    height *= 0.8;
                    attemptCompression();
                } else {
                    resolve(resultUrl);
                }
            };
            
            attemptCompression();
        };
        img.src = dataUrl;
    });
}

