(function () {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const items = new Map();
  let idCounter = 0;
  let isExporting = false;
  let activeTrack = null;

  // DOM elements
  const fileInput = document.getElementById("fileInput");
  const uploadZone = document.getElementById("uploadZone");
  const trackList = document.getElementById("trackList");
  const emptyState = document.getElementById("emptyState");
  const trackCount = document.getElementById("trackCount");
  const downloadBtn = document.getElementById("downloadBtn");
  const downloadBtnLabel = document.getElementById("downloadBtnLabel");

  // Parameter controls
  const speedInput = document.getElementById("speed");
  const speedValDisplay = document.getElementById("speedVal");
  const amplificationInput = document.getElementById("amp");
  const amplificationValDisplay = document.getElementById("ampVal");
  const fadeInInput = document.getElementById("fadeIn");
  const fadeInValDisplay = document.getElementById("fadeInVal");
  const fadeOutInput = document.getElementById("fadeOut");
  const fadeOutValDisplay = document.getElementById("fadeOutVal");
  const reverseToggle = document.getElementById("reverseToggle");
  const autoLevelToggle = document.getElementById("autoLevelToggle");

  const formatSelect = document.getElementById("format");
  const resetBtn = document.getElementById("resetBtn");
  const clearAllBtn = document.getElementById("clearAllBtn");
  const nowName = document.getElementById("nowName");
  const nowSub = document.getElementById("nowSub");
  const meterRow = document.getElementById("meterRow");
  const meterBars = [...meterRow.querySelectorAll("span")];
  const BUCKETS = 160;

  // File upload
  fileInput.addEventListener("click", (e) => e.stopPropagation());

  fileInput.addEventListener("change", (e) => {
    handleFiles(e.target.files);
    fileInput.value = "";
  });

  uploadZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadZone.classList.add("dragover");
  });

  uploadZone.addEventListener("dragleave", () => {
    uploadZone.classList.remove("dragover");
  });

  uploadZone.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadZone.classList.remove("dragover");
    const files = [...e.dataTransfer.files].filter((f) =>
      f.type.startsWith("audio/"),
    );
    if (!files.length) {
      showToast("warning", "File harus audio");
      return;
    }
    handleFiles(files);
  });

  function handleFiles(fileListLike) {
    const files = [...fileListLike];
    if (!files.length) return;
    files.forEach(addFileItem);
    refreshEmptyState();
    updateDownloadState();
  }

  function addFileItem(file) {
    const id = "f" + ++idCounter;
    const dot = file.name.lastIndexOf(".");
    const name = dot > 0 ? file.name.slice(0, dot) : file.name;
    const item = {
      id,
      file,
      name,
      status: "loading",
      buffer: null,
      reversedBuffer: null,
      peaks: null,
      source: null,
      analyser: null,
      startTime: 0,
      playDuration: 0,
      rafId: null,
      rowEl: null,
      baseCanvas: null,
      overlayCanvas: null,
      isPlaying: false,
    };
    items.set(id, item);
    renderTrack(item);
    loadAudioFile(item);
  }

  async function loadAudioFile(item) {
    try {
      const arr = await item.file.arrayBuffer();
      if (audioCtx.state === "suspended") await audioCtx.resume();
      const buffer = await audioCtx.decodeAudioData(arr);
      item.buffer = buffer;
      item.peaks = computePeaks(buffer, BUCKETS);
      item.status = "loaded";
    } catch (err) {
      console.error("Error loading audio:", err);
      item.status = "error";
    }
    renderTrack(item);
    if (item.status === "loaded") drawWaveform(item);
    updateDownloadState();
  }

  function computePeaks(buffer, buckets) {
    const data = buffer.getChannelData(0);
    const per = Math.max(1, Math.floor(data.length / buckets));
    const peaks = new Float32Array(buckets);
    for (let i = 0; i < buckets; i++) {
      const s = i * per;
      const e = Math.min(s + per, data.length);
      let max = 0;
      for (let j = s; j < e; j++) {
        const v = Math.abs(data[j]);
        if (v > max) max = v;
      }
      peaks[i] = max;
    }
    return peaks;
  }

  function renderTrack(item) {
    let row = item.rowEl;
    if (!row) {
      row = document.createElement("div");
      trackList.appendChild(row);
      item.rowEl = row;
    }

    row.className =
      "track" +
      (item.status === "loaded" ? " is-loaded" : "") +
      (item.status === "error" ? " is-error" : "") +
      (item.status === "processing" ? " is-processing" : "") +
      (item.status === "downloaded" ? " is-downloaded" : "");

    row.dataset.id = item.id;

    const sizeKb = (item.file.size / 1024).toFixed(0);
    const sizeLabel =
      sizeKb > 1024
        ? (item.file.size / 1024 / 1024).toFixed(1) + " MB"
        : sizeKb + " KB";
    const durationLabel = item.buffer
      ? formatDuration(item.buffer.duration)
      : null;

    let statusHtml = "";
    if (item.status === "loading") {
      statusHtml = `<span class="track-status status-loading"><span class="spin"></span>Load</span>`;
    } else if (item.status === "loaded") {
      statusHtml = `<span class="track-status status-loaded"><i class="bi bi-check"></i>OK</span>`;
    } else if (item.status === "processing") {
      statusHtml = `<span class="track-status status-processing"><span class="spin"></span>Proses</span>`;
    } else if (item.status === "downloaded") {
      statusHtml = `<span class="track-status status-downloaded"><i class="bi bi-check-circle"></i>Done</span>`;
    } else {
      statusHtml = `<span class="track-status status-error"><i class="bi bi-x"></i>Error</span>`;
    }

    const iconClass =
      item.status === "error"
        ? "bi-x-octagon"
        : item.status === "downloaded"
          ? "bi-cloud-check"
          : "bi-music-note";
    const playable = item.status === "loaded" || item.status === "downloaded";

    row.innerHTML = `
      <div class="track-top">
        <div class="track-icon"><i class="bi ${iconClass}"></i></div>
        <div class="track-info">
          <div class="track-name" title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</div>
          <div class="track-meta">${sizeLabel}${durationLabel ? " · " + durationLabel : ""}</div>
        </div>
        ${statusHtml}
        <div class="track-actions">
          <button type="button" class="btn-play" title="Play/Stop" ${playable ? "" : "disabled"}>
            <i class="bi ${item.isPlaying ? "bi-stop-fill" : "bi-play-fill"}"></i>
          </button>
          <button type="button" class="btn-remove" title="Hapus" ${item.status === "processing" ? "disabled" : ""}>
            <i class="bi bi-x"></i>
          </button>
        </div>
      </div>
      <div class="wave-wrap" id="wave-${item.id}">
        <canvas class="wave-base"></canvas>
        <canvas class="wave-overlay"></canvas>
      </div>
      <div class="file-progress" id="progress-${item.id}"><div></div></div>
    `;

    const playBtn = row.querySelector(".btn-play");
    const removeBtn = row.querySelector(".btn-remove");

    playBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      togglePlay(item);
    });

    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      removeItem(item);
    });

    row.addEventListener("click", () => {
      activeTrack = item;
      setActiveTrack(item);
    });

    item.baseCanvas = row.querySelector(".wave-base");
    item.overlayCanvas = row.querySelector(".wave-overlay");

    if (item.status === "loaded" || item.status === "downloaded") {
      requestAnimationFrame(() => drawWaveform(item));
    }
  }

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function formatDuration(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function drawWaveform(item) {
    if (!item.peaks || !item.baseCanvas) return;
    const canvas = item.baseCanvas;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 260;
    const h = canvas.clientHeight || 40;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const grad = ctx.createLinearGradient(0, 0, w, 0);
    if (item.status === "error") {
      grad.addColorStop(0, "#ff5c72");
      grad.addColorStop(1, "#ff5c72");
    } else if (item.status === "downloaded") {
      grad.addColorStop(0, "#b18cff");
      grad.addColorStop(1, "#31e0f0");
    } else {
      grad.addColorStop(0, "#31e0f0");
      grad.addColorStop(1, "#ff4f9a");
    }

    const n = item.peaks.length;
    const barW = w / n;
    const mid = h / 2;
    ctx.fillStyle = grad;

    for (let i = 0; i < n; i++) {
      const amp = Math.max(item.peaks[i], 0.02) * (mid - 2);
      const x = i * barW;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(x, mid - amp, Math.max(barW - 1, 1), amp * 2);
    }
    ctx.globalAlpha = 1;
  }

  function removeItem(item) {
    stopPlay(item);
    if (item.rowEl) {
      item.rowEl.remove();
    }
    items.delete(item.id);
    refreshEmptyState();
    updateDownloadState();
  }

  function refreshEmptyState() {
    emptyState.style.display = items.size === 0 ? "" : "none";
    trackCount.textContent = items.size + " file";
  }

  function setActiveTrack(item) {
    items.forEach((o) => {
      if (o.rowEl) o.rowEl.classList.remove("is-active");
    });
    if (item.rowEl) item.rowEl.classList.add("is-active");
  }

  function getEffectiveBuffer(item) {
    if (!reverseToggle.checked) return item.buffer;
    if (!item.reversedBuffer) item.reversedBuffer = reverseBuffer(item.buffer);
    return item.reversedBuffer;
  }

  function reverseBuffer(buffer) {
    const rev = audioCtx.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate,
    );
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const src = buffer.getChannelData(ch);
      const dst = rev.getChannelData(ch);
      for (let i = 0; i < src.length; i++) {
        dst[i] = src[src.length - 1 - i];
      }
    }
    return rev;
  }

  function scheduleFade(param, startRef, ampLinear, fadeIn, fadeOut, totalDur) {
    param.cancelScheduledValues(startRef);
    if (fadeIn > 0.02) {
      param.setValueAtTime(0.0001, startRef);
      param.linearRampToValueAtTime(ampLinear, startRef + fadeIn);
    } else {
      param.setValueAtTime(ampLinear, startRef);
    }
    if (fadeOut > 0.02) {
      const foStart = Math.max(
        startRef + fadeIn,
        startRef + totalDur - fadeOut,
      );
      param.setValueAtTime(ampLinear, foStart);
      param.linearRampToValueAtTime(0.0001, startRef + totalDur);
    }
  }

  function togglePlay(item) {
    if (item.isPlaying) {
      stopPlay(item);
      return;
    }

    items.forEach((o) => {
      if (o.isPlaying) stopPlay(o);
    });

    if (audioCtx.state === "suspended") audioCtx.resume();
    setActiveTrack(item);
    activeTrack = item;

    const buffer = getEffectiveBuffer(item);
    const speedVal = parseFloat(speedInput.value);
    const amplificationDb = parseInt(amplificationInput.value);
    const fadeIn = parseFloat(fadeInInput.value);
    const fadeOut = parseFloat(fadeOutInput.value);

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = speedVal;

    const gain = audioCtx.createGain();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;

    const ampLinear = Math.pow(10, amplificationDb / 20);
    const finalDuration = buffer.duration / speedVal;
    const fi = Math.min(fadeIn, finalDuration * 0.45);
    const fo = Math.min(fadeOut, finalDuration * 0.45);

    scheduleFade(
      gain.gain,
      audioCtx.currentTime,
      ampLinear,
      fi,
      fo,
      finalDuration,
    );

    source.connect(gain);
    gain.connect(analyser);
    analyser.connect(audioCtx.destination);

    const startTime = audioCtx.currentTime;
    source.start(0);
    source.stop(startTime + finalDuration);

    item.source = source;
    item.analyser = analyser;
    item.startTime = startTime;
    item.playDuration = finalDuration;
    item.isPlaying = true;

    updatePlayButton(item);
    setNowPlaying(item);
    startPlayheadLoop(item);

    source.onended = () => {
      item.source = null;
      item.isPlaying = false;
      updatePlayButton(item);
      clearOverlay(item);
      clearNowPlaying();
    };
  }

  function stopPlay(item) {
    if (item.source) {
      try {
        item.source.stop();
      } catch (e) {
        // Ignore
      }
      item.source = null;
    }
    item.isPlaying = false;
    updatePlayButton(item);
    clearOverlay(item);
  }

  function updatePlayButton(item) {
    const btn = item.rowEl?.querySelector(".btn-play i");
    if (btn) {
      btn.className = `bi ${item.isPlaying ? "bi-stop-fill" : "bi-play-fill"}`;
    }
  }

  function startPlayheadLoop(item) {
    function step() {
      if (!item.source || !item.isPlaying) return;
      const progress = Math.min(
        1,
        (audioCtx.currentTime - item.startTime) / item.playDuration,
      );
      drawOverlay(item, progress);
      updateMeter(item.analyser);
      item.rafId = requestAnimationFrame(step);
    }
    item.rafId = requestAnimationFrame(step);
  }

  function drawOverlay(item, progress) {
    const canvas = item.overlayCanvas;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 260;
    const h = canvas.clientHeight || 40;
    if (canvas.width !== w * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const x = progress * w;
    ctx.fillStyle = "rgba(49, 224, 240, 0.15)";
    ctx.fillRect(0, 0, x, h);
    ctx.strokeStyle = "#31e0f0";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  function clearOverlay(item) {
    if (item.rafId) {
      cancelAnimationFrame(item.rafId);
      item.rafId = null;
    }
    const c = item.overlayCanvas;
    if (c) {
      const ctx = c.getContext("2d");
      ctx.clearRect(0, 0, c.width, c.height);
    }
  }

  function setNowPlaying(item) {
    nowName.textContent = item.file.name;
    nowSub.textContent = "Playing · " + speedInput.value + "×";
    meterRow.classList.add("is-live");
  }

  function clearNowPlaying() {
    nowName.textContent = "Tidak ada";
    nowSub.textContent = "Klik play";
    meterRow.classList.remove("is-live");
    meterBars.forEach((b) => (b.style.height = "3px"));
  }

  const meterData = new Uint8Array(32);

  function updateMeter(analyser) {
    if (!analyser) return;
    analyser.getByteTimeDomainData(meterData);
    const step = Math.floor(meterData.length / meterBars.length);
    for (let i = 0; i < meterBars.length; i++) {
      const v = Math.abs(meterData[i * step] - 128) / 128;
      const h = Math.max(3, Math.min(32, v * 80));
      meterBars[i].style.height = h + "px";
    }
  }

  // Sliders
  speedInput.addEventListener("input", function () {
    speedValDisplay.textContent = parseFloat(this.value).toFixed(1) + "×";
  });
  speedInput.addEventListener("change", resetDownloadedStatuses);

  amplificationInput.addEventListener("input", function () {
    const v = parseInt(this.value);
    amplificationValDisplay.textContent = (v >= 0 ? "+" : "") + v + " dB";
  });
  amplificationInput.addEventListener("change", resetDownloadedStatuses);

  fadeInInput.addEventListener("input", function () {
    fadeInValDisplay.textContent = parseFloat(this.value).toFixed(1) + "s";
  });
  fadeInInput.addEventListener("change", resetDownloadedStatuses);

  fadeOutInput.addEventListener("input", function () {
    fadeOutValDisplay.textContent = parseFloat(this.value).toFixed(1) + "s";
  });
  fadeOutInput.addEventListener("change", resetDownloadedStatuses);

  formatSelect.addEventListener("change", resetDownloadedStatuses);
  autoLevelToggle.addEventListener("change", resetDownloadedStatuses);

  reverseToggle.addEventListener("change", function () {
    trackList.classList.toggle("is-reversed", this.checked);
    resetDownloadedStatuses();
  });

  resetBtn.addEventListener("click", () => {
    speedInput.value = 1;
    speedInput.dispatchEvent(new Event("input"));
    amplificationInput.value = 0;
    amplificationInput.dispatchEvent(new Event("input"));
    fadeInInput.value = 0;
    fadeInInput.dispatchEvent(new Event("input"));
    fadeOutInput.value = 0;
    fadeOutInput.dispatchEvent(new Event("input"));
    reverseToggle.checked = false;
    reverseToggle.dispatchEvent(new Event("change"));
    autoLevelToggle.checked = false;
    resetDownloadedStatuses();
    showToast("success", "Parameter direset");
  });

  clearAllBtn.addEventListener("click", () => {
    if (items.size === 0) {
      showToast("warning", "Tidak ada file");
      return;
    }
    items.forEach((item) => {
      stopPlay(item);
      if (item.rowEl) item.rowEl.remove();
    });
    items.clear();
    refreshEmptyState();
    updateDownloadState();
    showToast("success", "Semua file dihapus");
  });

  // Keyboard shortcut
  document.addEventListener("keydown", (e) => {
    if (
      e.target.tagName === "INPUT" ||
      e.target.tagName === "SELECT" ||
      e.target.tagName === "TEXTAREA"
    )
      return;

    if (e.code === "Space" && activeTrack) {
      e.preventDefault();
      togglePlay(activeTrack);
    }
  });

  function resetDownloadedStatuses() {
    let changed = false;
    items.forEach((item) => {
      if (item.status === "downloaded") {
        item.status = "loaded";
        renderTrack(item);
        changed = true;
      }
    });
    if (changed) updateDownloadState();
  }

  function updateDownloadState() {
    const exportable = [...items.values()].filter(
      (i) => i.status === "loaded" || i.status === "downloaded",
    );
    downloadBtn.disabled = exportable.length === 0 || isExporting;
    downloadBtnLabel.textContent =
      exportable.length > 1 ? `Download (${exportable.length})` : "Download";
  }

  downloadBtn.addEventListener("click", downloadAll);

  async function downloadAll() {
    const loadedItems = [...items.values()].filter(
      (i) => i.status === "loaded" || i.status === "downloaded",
    );
    if (!loadedItems.length) {
      showToast("warning", "Upload audio dulu");
      return;
    }

    isExporting = true;
    downloadBtn.disabled = true;
    const originalLabel = downloadBtnLabel.textContent;
    downloadBtn.querySelector("i").className = "bi bi-hourglass-split";

    const speedVal = parseFloat(speedInput.value);
    const amplificationVal = parseInt(amplificationInput.value);
    const fadeIn = parseFloat(fadeInInput.value);
    const fadeOut = parseFloat(fadeOutInput.value);
    const reverseOn = reverseToggle.checked;
    const autoLevel = autoLevelToggle.checked;
    const format = formatSelect.value;

    let done = 0;
    let failed = 0;

    for (const item of loadedItems) {
      item.status = "processing";
      renderTrack(item);
      const progressWrap = document.getElementById(`progress-${item.id}`);
      const progressBar = progressWrap?.querySelector("div");
      progressWrap?.classList.add("show");
      if (progressBar) progressBar.style.width = "15%";

      try {
        const blob = await processAndExport(
          item,
          speedVal,
          amplificationVal,
          fadeIn,
          fadeOut,
          reverseOn,
          autoLevel,
          format,
          (p) => {
            if (progressBar) progressBar.style.width = `${15 + p * 85}%`;
          },
        );

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${item.name}.${format}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);

        item.status = "downloaded";
        done++;
      } catch (err) {
        console.error(err);
        item.status = "loaded";
        failed++;
      } finally {
        if (progressBar) progressBar.style.width = "100%";
        renderTrack(item);
        setTimeout(() => progressWrap?.classList.remove("show"), 600);
      }

      downloadBtnLabel.textContent = `${done + failed}/${loadedItems.length}`;
    }

    if (failed === 0) {
      showToast(
        "success",
        done > 1 ? `${done} file diunduh` : "Download dimulai",
      );
    } else {
      showToast("warning", `${done} ok, ${failed} gagal`);
    }

    isExporting = false;
    downloadBtn.querySelector("i").className = "bi bi-download";
    downloadBtnLabel.textContent = originalLabel;
    updateDownloadState();
  }

  async function processAndExport(
    item,
    speedVal,
    amplificationDb,
    fadeIn,
    fadeOut,
    reverseOn,
    autoLevel,
    format,
    onProgress,
  ) {
    const buffer = reverseOn
      ? item.reversedBuffer ||
        (item.reversedBuffer = reverseBuffer(item.buffer))
      : item.buffer;
    const finalDuration = buffer.duration / speedVal;
    const offlineCtx = new OfflineAudioContext(
      1,
      Math.ceil(buffer.sampleRate * finalDuration),
      buffer.sampleRate,
    );

    const source = offlineCtx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = speedVal;

    const gain = offlineCtx.createGain();
    const ampLinear = Math.pow(10, amplificationDb / 20);
    const fi = Math.min(fadeIn, finalDuration * 0.45);
    const fo = Math.min(fadeOut, finalDuration * 0.45);

    scheduleFade(gain.gain, 0, ampLinear, fi, fo, finalDuration);

    source.connect(gain);
    gain.connect(offlineCtx.destination);
    source.start(0);
    source.stop(finalDuration);

    const rendered = await offlineCtx.startRendering();
    onProgress?.(0.55);

    if (autoLevel) normalizeBuffer(rendered);
    onProgress?.(0.7);

    let blob;
    if (format === "mp3") {
      blob = encodeMP3(rendered);
    } else if (format === "wav") {
      blob = bufferToWave(rendered);
    } else {
      blob = new Blob([bufferToWave(rendered)], { type: "audio/ogg" });
    }

    onProgress?.(1);
    return blob;
  }

  function normalizeBuffer(buffer) {
    const data = buffer.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(data[i]);
      if (v > peak) peak = v;
    }
    if (peak > 0.0001) {
      const scale = Math.min(0.97 / peak, 6);
      for (let i = 0; i < data.length; i++) {
        data[i] *= scale;
      }
    }
  }

  function encodeMP3(buffer) {
    const samples = buffer.getChannelData(0);
    const enc = new lamejs.Mp3Encoder(1, buffer.sampleRate, 128);
    const mp3Data = [];
    const block = 1152;

    for (let i = 0; i < samples.length; i += block) {
      const chunk = samples.subarray(i, i + block);
      const buf = enc.encodeBuffer(floatTo16Bit(chunk));
      if (buf.length) mp3Data.push(buf);
    }

    const end = enc.flush();
    if (end.length) mp3Data.push(end);

    return new Blob(mp3Data, { type: "audio/mp3" });
  }

  function floatTo16Bit(input) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }

  function bufferToWave(buffer) {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const bufArr = new ArrayBuffer(length);
    const view = new DataView(bufArr);
    const channels = [];
    let offset = 0;
    let pos = 0;

    const setUint16 = (d) => {
      view.setUint16(pos, d, true);
      pos += 2;
    };
    const setUint32 = (d) => {
      view.setUint32(pos, d, true);
      pos += 4;
    };

    setUint32(0x46464952);
    setUint32(length - 8);
    setUint32(0x45564157);
    setUint32(0x20746d66);
    setUint32(16);
    setUint16(1);
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2);
    setUint16(16);
    setUint32(0x61746164);
    setUint32(length - pos - 4);

    for (let i = 0; i < numOfChan; i++) {
      channels.push(buffer.getChannelData(i));
    }

    while (pos < length) {
      for (let i = 0; i < numOfChan; i++) {
        let sample = Math.max(-1, Math.min(1, channels[i][offset]));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }

    return new Blob([view], { type: "audio/wav" });
  }

  function showToast(type, message) {
    const icons = {
      success: "check-circle-fill",
      warning: "exclamation-triangle-fill",
      danger: "x-circle-fill",
    };
    const el = document.createElement("div");
    el.className = `toast t-${type}`;
    el.innerHTML = `<i class="bi bi-${icons[type]}"></i><span>${message}</span><button aria-label="Tutup">&times;</button>`;
    el.querySelector("button").addEventListener("click", () => el.remove());
    document.getElementById("toastStack").appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  window.addEventListener("resize", () => {
    items.forEach((item) => {
      if (item.status === "loaded" || item.status === "downloaded") {
        drawWaveform(item);
      }
    });
  });
})();
