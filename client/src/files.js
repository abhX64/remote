function createFilesPanel({ sendControl, getFilesDc }) {
  const els = {
    path: document.getElementById('filesPath'),
    listBtn: document.getElementById('filesListBtn'),
    tableBody: document.querySelector('#filesTable tbody'),
    status: document.getElementById('filesStatus'),
    uploadInput: document.getElementById('fileUploadInput'),
    uploadBtn: document.getElementById('fileUploadBtn'),
  };

  const pendingList = new Map(); // requestId -> resolve
  let currentPath = '';
  let activeDownload = null; // { requestId, name, chunks }
  let activeUpload = null; // { requestId, file }

  function genId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function setStatus(text) {
    els.status.textContent = text;
  }

  function formatBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  function renderEntries(dirPath, entries) {
    currentPath = dirPath;
    els.path.value = dirPath;
    els.tableBody.innerHTML = '';

    const upRow = document.createElement('tr');
    const upCell = document.createElement('td');
    upCell.textContent = '.. (up)';
    upCell.colSpan = 3;
    upCell.style.cursor = 'pointer';
    upCell.addEventListener('click', () => list(dirPath.replace(/[\\/]+$/, '') + '\\..'));
    upRow.appendChild(upCell);
    els.tableBody.appendChild(upRow);

    entries
      .slice()
      .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name))
      .forEach((entry) => {
        const row = document.createElement('tr');

        const nameCell = document.createElement('td');
        nameCell.textContent = (entry.isDir ? '\u{1F4C1} ' : '\u{1F4C4} ') + entry.name;
        if (entry.isDir) {
          nameCell.style.cursor = 'pointer';
          nameCell.addEventListener('click', () => list(dirPath.replace(/[\\/]+$/, '') + '\\' + entry.name));
        }
        row.appendChild(nameCell);

        const sizeCell = document.createElement('td');
        sizeCell.textContent = entry.isDir ? '' : formatBytes(entry.size);
        row.appendChild(sizeCell);

        const actionCell = document.createElement('td');
        if (!entry.isDir) {
          const btn = document.createElement('button');
          btn.textContent = 'Download';
          btn.addEventListener('click', () => download(dirPath.replace(/[\\/]+$/, '') + '\\' + entry.name));
          actionCell.appendChild(btn);
        }
        row.appendChild(actionCell);

        els.tableBody.appendChild(row);
      });
  }

  function list(dirPath) {
    const requestId = genId();
    setStatus('Loading...');
    sendControl({ type: 'list', requestId, path: dirPath });
    pendingList.set(requestId, (msg) => {
      if (msg.error) {
        setStatus(`Error: ${msg.error}`);
        return;
      }
      setStatus('');
      renderEntries(msg.path, msg.entries);
    });
  }

  function download(filePath) {
    const requestId = genId();
    setStatus(`Downloading ${filePath}...`);
    activeDownload = { requestId, name: null, chunks: [] };
    sendControl({ type: 'download', requestId, path: filePath });
  }

  function upload() {
    const file = els.uploadInput.files[0];
    if (!file) {
      setStatus('Choose a file first.');
      return;
    }
    if (!currentPath) {
      setStatus('List a folder first so I know where to upload to.');
      return;
    }
    const requestId = genId();
    const targetPath = currentPath.replace(/[\\/]+$/, '') + '\\' + file.name;
    setStatus(`Uploading ${file.name}...`);
    activeUpload = { requestId, file };
    sendControl({ type: 'upload-start', requestId, path: targetPath, size: file.size });
  }

  async function sendUploadChunks() {
    const filesDc = getFilesDc();
    if (!activeUpload || !filesDc) return;
    const { file, requestId } = activeUpload;
    const CHUNK_SIZE = 200 * 1024;
    for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
      const slice = file.slice(offset, offset + CHUNK_SIZE);
      const buffer = await slice.arrayBuffer();
      filesDc.send(buffer);
      while (filesDc.bufferedAmount > 4 * 1024 * 1024) {
        await new Promise((r) => setTimeout(r, 20));
      }
    }
    sendControl({ type: 'upload-end', requestId });
  }

  function handleControlMessage(msg) {
    if (msg.type === 'list-result') {
      const resolve = pendingList.get(msg.requestId);
      if (resolve) {
        resolve(msg);
        pendingList.delete(msg.requestId);
      }
      return;
    }

    if (msg.type === 'download-start' && activeDownload && activeDownload.requestId === msg.requestId) {
      activeDownload.name = msg.name;
      return;
    }

    if (msg.type === 'download-end' && activeDownload && activeDownload.requestId === msg.requestId) {
      const blob = new Blob(activeDownload.chunks);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = activeDownload.name || 'download';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setStatus(`Downloaded ${activeDownload.name}`);
      activeDownload = null;
      return;
    }

    if (msg.type === 'download-error' && activeDownload && activeDownload.requestId === msg.requestId) {
      setStatus(`Download failed: ${msg.error}`);
      activeDownload = null;
      return;
    }

    if (msg.type === 'upload-ready' && activeUpload && activeUpload.requestId === msg.requestId) {
      sendUploadChunks();
      return;
    }

    if (msg.type === 'upload-complete' && activeUpload && activeUpload.requestId === msg.requestId) {
      setStatus(`Uploaded ${activeUpload.file.name} (${msg.received} bytes)`);
      activeUpload = null;
      list(currentPath);
      return;
    }

    if (msg.type === 'upload-error' && activeUpload && activeUpload.requestId === msg.requestId) {
      setStatus(`Upload failed: ${msg.error}`);
      activeUpload = null;
    }
  }

  function handleFileChunk(arrayBuffer) {
    if (activeDownload) {
      activeDownload.chunks.push(arrayBuffer);
    }
  }

  els.listBtn.addEventListener('click', () => list(els.path.value.trim() || '.'));
  els.uploadBtn.addEventListener('click', upload);

  return { handleControlMessage, handleFileChunk };
}
