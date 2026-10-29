(function () {
  "use strict";

  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const items = new Map();
  let idCounter = 0;
  let isExporting = false;
  let activeTrack = null;
  const BUCKETS = 200;

  // ── DOM ─────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const fileInput = $("fileInput");
  const uploadZone = $("uploadZone");
  const dropRipple = $("dropRipple");
  const trackList = $("trackList");
  const emptyState = $("emptyState");
  const trackCount = $("trackCount");
  const searchInput = $("searchInput");
  const downloadBtn = $("downloadBtn");
  const downloadBtnLabel = $("downloadBtnLabel");
  const exportInfo = $("exportInfo");

  const speedInput = $("speed");
  const speedValDisplay = $("speedVal");
  const amplificationInput = $("amp");
  const amplificationValDisplay = $("ampVal");
  const bassInput = $("bass");
  const bassValDisplay = $("bassVal");
  const fadeInInput = $("fadeIn");
  const fadeInValDisplay = $("fadeInVal");
  const fadeOutInput = $("fadeOut");
  const fadeOutValDisplay = $("fadeOutVal");
  const reverseToggle = $("reverseToggle");
  const autoLevelToggle = $("autoLevelToggle");
  const loopToggle = $("loopToggle");

  const formatSelect = $("format");
  const resetBtn = $("resetBtn");
  const resetPresetsBtn = $("resetPresetsBtn");
  const clearAllBtn = $("clearAllBtn");
  const themeBtn = $("themeBtn");
  const headerStatus = $("headerStatus");
  const headerStatusText = $("headerStatusText");

  const nowName = $("nowName");
  const nowSub = $("nowSub");
  const nowIcon = $("nowIcon");
  const nowCur = $("nowCur");
  const nowTot = $("nowTot");
  const nowProgressBar = $("nowProgressBar");
  const meterRow = $("meterRow");
  const meterBars = [...meterRow.querySelectorAll("span")];

  const statFiles = $("statFiles");
  const statDur = $("statDur");
  const statEst = $("statEst");
  const statMem = $("statMem");

  const libGrid = $("libGrid");
  const libEmpty = $("libEmpty");
  const libRefreshBtn = $("libRefreshBtn");

  // ── Loading Screen ──────────────────────────────────
  const loader = $("loader");
  const loaderFill = $("loaderFill");
  const loaderStatus = $("loaderStatus");

  function setLoader(pct, msg) {
    loaderFill.style.width = pct + "%";
    if (msg) loaderStatus.textContent = msg;
  }
  function hideLoader() {
    setLoader(100, "Siap");
    setTimeout(() => {
      loader.classList.add("hidden");
      setTimeout(() => {
        loader.style.display = "none";
      }, 700);
    }, 350);
  }

  setLoader(10, "Menyiapkan editor…");
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  setTimeout(() => setLoader(45, "Memuat antarmuka…"), 200);
  setTimeout(() => setLoader(80, "Hampir siap…"), 450);
  window.addEventListener("load", () => setTimeout(hideLoader, 500));
  if (document.readyState === "complete") setTimeout(hideLoader, 700);

  // ── Theme ───────────────────────────────────────────
  const savedTheme = localStorage.getItem("alabs-theme");
  if (savedTheme === "light") document.body.classList.add("light");
  updateThemeIcon();
  themeBtn.addEventListener("click", () => {
    document.body.classList.toggle("light");
    localStorage.setItem(
      "alabs-theme",
      document.body.classList.contains("light") ? "light" : "dark",
    );
    updateThemeIcon();
    items.forEach((i) => {
      if (i.status === "loaded" || i.status === "downloaded") drawWaveform(i);
    });
    renderLibrary();
    showToast(
      "success",
      document.body.classList.contains("light") ? "Mode terang" : "Mode gelap",
    );
  });
  function updateThemeIcon() {
    themeBtn.querySelector("i").className = document.body.classList.contains(
      "light",
    )
      ? "bi bi-sun"
      : "bi bi-moon-stars";
  }

  // ── Status bar ──────────────────────────────────────
  function setStatus(state, text) {
    headerStatus.classList.remove("busy", "playing");
    if (state === "busy") headerStatus.classList.add("busy");
    if (state === "playing") headerStatus.classList.add("playing");
    headerStatusText.textContent = text || "Siap";
  }

  // ── Tabs ────────────────────────────────────────────
  const navTabs = document.querySelectorAll(".nav-tab");
  const tabPages = document.querySelectorAll(".tab-page");
  navTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      navTabs.forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      const id = "tab-" + tab.dataset.tab;
      tabPages.forEach((p) => p.classList.toggle("active", p.id === id));
      if (tab.dataset.tab === "library") renderLibrary();
    });
  });

  // ── Stats glow cursor ───────────────────────────────
  document.querySelectorAll(".stat").forEach((el) => {
    el.addEventListener("mousemove", (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    });
  });

  // ── Upload ──────────────────────────────────────────
  fileInput.addEventListener("click", (e) => e.stopPropagation());
  fileInput.addEventListener("change", (e) => {
    handleFiles(e.target.files);
    fileInput.value = "";
  });

  uploadZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadZone.classList.add("dragover");
  });
  uploadZone.addEventListener("dragleave", () =>
    uploadZone.classList.remove("dragover"),
  );
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
  uploadZone.addEventListener("click", (e) => {
    const r = uploadZone.getBoundingClientRect();
    dropRipple.style.left = e.clientX - r.left + "px";
    dropRipple.style.top = e.clientY - r.top + "px";
    dropRipple.style.width = dropRipple.style.height = "100px";
    dropRipple.style.marginLeft = dropRipple.style.marginTop = "-50px";
    dropRipple.classList.remove("animate");
    void dropRipple.offsetWidth;
    dropRipple.classList.add("animate");
  });

  function handleFiles(fileListLike) {
    const files = [...fileListLike].filter(
      (f) =>
        f.type.startsWith("audio/") ||
        /\.(mp3|wav|ogg|aac|m4a|flac)$/i.test(f.name),
    );
    if (!files.length) {
      showToast("warning", "Tidak ada file audio valid");
      return;
    }
    files.forEach(addFileItem);
    refreshEmptyState();
    updateDownloadState();
    updateStats();
    renderLibrary();
    showToast("success", `${files.length} file ditambahkan`);
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
      gainNode: null,
      startTime: 0,
      playDuration: 0,
      offset: 0,
      pauseAt: 0,
      rafId: null,
      rowEl: null,
      baseCanvas: null,
      overlayCanvas: null,
      isPlaying: false,
      isLoop: false,
      _ended: false,
    };
    items.set(id, item);
    renderTrack(item);
    loadAudioFile(item);
  }

  async function loadAudioFile(item) {
    setStatus("busy", "Memuat");
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
    if (item.status === "loaded")
      requestAnimationFrame(() => drawWaveform(item));
    updateDownloadState();
    updateStats();
    renderLibrary();
    if (![...items.values()].some((i) => i.status === "loading"))
      setStatus("idle", "Siap");
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

  // ── Render track ────────────────────────────────────
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
    row.dataset.name = item.file.name.toLowerCase();

    const sizeKb = (item.file.size / 1024).toFixed(0);
    const sizeLabel =
      sizeKb > 1024
        ? (item.file.size / 1024 / 1024).toFixed(1) + " MB"
        : sizeKb + " KB";
    const durationLabel = item.buffer
      ? formatDuration(item.buffer.duration)
      : null;

    let statusHtml = "";
    if (item.status === "loading")
      statusHtml = `<span class="track-status status-loading"><span class="spin"></span>Load</span>`;
    else if (item.status === "loaded")
      statusHtml = `<span class="track-status status-loaded"><i class="bi bi-check"></i>OK</span>`;
    else if (item.status === "processing")
      statusHtml = `<span class="track-status status-processing"><span class="spin"></span>Proses</span>`;
    else if (item.status === "downloaded")
      statusHtml = `<span class="track-status status-downloaded"><i class="bi bi-check-circle"></i>Done</span>`;
    else
      statusHtml = `<span class="track-status status-error"><i class="bi bi-x"></i>Error</span>`;

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

    row.querySelector(".btn-play").addEventListener("click", (e) => {
      e.stopPropagation();
      togglePlay(item);
    });
    row.querySelector(".btn-remove").addEventListener("click", (e) => {
      e.stopPropagation();
      removeItem(item);
    });
    row.addEventListener("click", () => {
      activeTrack = item;
      setActiveTrack(item);
    });

    item.baseCanvas = row.querySelector(".wave-base");
    item.overlayCanvas = row.querySelector(".wave-overlay");

    row.querySelector(".wave-wrap").addEventListener("click", (e) => {
      e.stopPropagation();
      if (!item.buffer) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = Math.min(
        1,
        Math.max(0, (e.clientX - rect.left) / rect.width),
      );
      activeTrack = item;
      setActiveTrack(item);
      seekTo(item, pct);
    });

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
    if (!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  // ── Waveform ────────────────────────────────────────
  function drawWaveform(item) {
    if (!item.peaks || !item.baseCanvas) return;
    const canvas = item.baseCanvas;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 260;
    const h = canvas.clientHeight || 44;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const grad = ctx.createLinearGradient(0, 0, w, 0);
    if (item.status === "error") {
      grad.addColorStop(0, "#f87171");
      grad.addColorStop(1, "#f87171");
    } else if (item.status === "downloaded") {
      grad.addColorStop(0, "#a78bfa");
      grad.addColorStop(1, "#22d3ee");
    } else {
      grad.addColorStop(0, "#22d3ee");
      grad.addColorStop(1, "#f43f8e");
    }

    const n = item.peaks.length;
    const barW = w / n;
    const mid = h / 2;
    ctx.fillStyle = grad;
    for (let i = 0; i < n; i++) {
      const amp = Math.max(item.peaks[i], 0.02) * (mid - 2);
      ctx.globalAlpha = 0.85;
      ctx.fillRect(i * barW, mid - amp, Math.max(barW - 0.8, 1), amp * 2);
    }
    ctx.globalAlpha = 1;
  }

  function drawOverlay(item, progress) {
    const canvas = item.overlayCanvas;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 260;
    const h = canvas.clientHeight || 44;
    if (canvas.width !== w * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const x = progress * w;
    ctx.fillStyle = "rgba(34, 211, 238, 0.13)";
    ctx.fillRect(0, 0, x, h);
    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 1.6;
    ctx.shadowColor = "#22d3ee";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
    ctx.shadowBlur = 0;
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

  // ── Buffer helpers ──────────────────────────────────
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
      for (let i = 0; i < src.length; i++) dst[i] = src[src.length - 1 - i];
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

  // ── Playback (fixed) ────────────────────────────────
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

    let offset = item.pauseAt || 0;
    const buffer = getEffectiveBuffer(item);
    const speedVal = parseFloat(speedInput.value) || 1;
    const finalDur = buffer.duration / speedVal;
    if (offset >= finalDur - 0.03) offset = 0;
    startPlayback(item, offset);
  }

  function seekTo(item, pct) {
    const buffer = getEffectiveBuffer(item);
    const speedVal = parseFloat(speedInput.value) || 1;
    const finalDur = buffer.duration / speedVal;
    const wasPlaying = item.isPlaying;
    if (wasPlaying) stopPlay(item);
    item.pauseAt = Math.min(finalDur - 0.01, Math.max(0, pct * finalDur));
    if (wasPlaying) startPlayback(item, item.pauseAt);
    else drawOverlay(item, item.pauseAt / finalDur);
  }

  function startPlayback(item, offsetSec) {
    if (!item.buffer) return;
    const buffer = getEffectiveBuffer(item);
    const speedVal = parseFloat(speedInput.value) || 1;
    const amplificationDb = parseInt(amplificationInput.value) || 0;
    const bassDb = parseInt(bassInput.value) || 0;
    const fadeIn = parseFloat(fadeInInput.value) || 0;
    const fadeOut = parseFloat(fadeOutInput.value) || 0;

    const finalDuration = buffer.duration / speedVal;
    const offset = Math.max(0, Math.min(offsetSec, finalDuration - 0.01));
    const remaining = finalDuration - offset;
    if (remaining <= 0.01) {
      item.pauseAt = 0;
      return;
    }

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = speedVal;
    source.loop = loopToggle.checked;
    item.isLoop = loopToggle.checked;

    const gain = audioCtx.createGain();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;

    const bassFilter = audioCtx.createBiquadFilter();
    bassFilter.type = "lowshelf";
    bassFilter.frequency.value = 200;
    bassFilter.gain.value = bassDb;

    const ampLinear = Math.pow(10, amplificationDb / 20);
    const startAt = audioCtx.currentTime;

    if (!item.isLoop) {
      const fi = Math.min(fadeIn, remaining * 0.45);
      const fo = Math.min(fadeOut, remaining * 0.45);
      scheduleFade(gain.gain, startAt, ampLinear, fi, fo, remaining);
    } else {
      gain.gain.setValueAtTime(ampLinear, startAt);
    }

    source.connect(bassFilter);
    bassFilter.connect(gain);
    gain.connect(analyser);
    analyser.connect(audioCtx.destination);

    source.start(startAt, offset);
    if (!item.isLoop) source.stop(startAt + remaining);

    item.source = source;
    item.analyser = analyser;
    item.gainNode = gain;
    item.startTime = startAt;
    item.offset = offset;
    item.playDuration = remaining;
    item.isPlaying = true;
    item._ended = false;

    updatePlayButton(item);
    setNowPlaying(item, finalDuration);
    startPlayheadLoop(item, finalDuration, offset);
    setStatus("playing", "Memutar");

    source.onended = () => {
      if (item._ended) return;
      item._ended = true;
      item.source = null;
      item.isPlaying = false;
      item.pauseAt = 0;
      updatePlayButton(item);
      clearOverlay(item);
      clearNowPlaying();
      if (![...items.values()].some((o) => o.isPlaying))
        setStatus("idle", "Siap");
    };
  }

  function stopPlay(item) {
    if (item.isPlaying && item.source) {
      const elapsed = Math.max(0, audioCtx.currentTime - item.startTime);
      const pos = item.offset + elapsed;
      const buffer = getEffectiveBuffer(item);
      const speedVal = parseFloat(speedInput.value) || 1;
      const finalDur = buffer.duration / speedVal;
      item.pauseAt = item.isLoop ? 0 : Math.min(pos, finalDur - 0.02);
      if (item.pauseAt < 0) item.pauseAt = 0;
    }

    if (item.source) {
      item._ended = true;
      try {
        item.source.onended = null;
        item.source.stop();
      } catch (e) {
        /* ignore */
      }
      item.source = null;
    }
    item.isPlaying = false;
    updatePlayButton(item);
    clearOverlay(item);

    if (item.pauseAt > 0 && item.overlayCanvas && item.buffer) {
      const buffer = getEffectiveBuffer(item);
      const speedVal = parseFloat(speedInput.value) || 1;
      drawOverlay(item, item.pauseAt / (buffer.duration / speedVal));
    }

    if (![...items.values()].some((o) => o.isPlaying)) {
      clearNowPlaying();
      setStatus("idle", "Siap");
    }
  }

  function stopAll() {
    items.forEach((o) => {
      if (o.isPlaying) stopPlay(o);
    });
    clearNowPlaying();
    setStatus("idle", "Siap");
  }

  function updatePlayButton(item) {
    const btn = item.rowEl?.querySelector(".btn-play i");
    if (btn)
      btn.className = `bi ${item.isPlaying ? "bi-stop-fill" : "bi-play-fill"}`;
  }

  function startPlayheadLoop(item, finalDur, baseOffset) {
    function step() {
      if (!item.source || !item.isPlaying) return;
      const elapsed = audioCtx.currentTime - item.startTime;
      const total = baseOffset + elapsed;
      const progress = Math.min(1, total / finalDur);
      drawOverlay(item, progress);
      updateMeter(item.analyser);
      nowCur.textContent = formatDuration(Math.min(total, finalDur));
      nowProgressBar.style.width = progress * 100 + "%";
      item.rafId = requestAnimationFrame(step);
    }
    if (item.rafId) cancelAnimationFrame(item.rafId);
    item.rafId = requestAnimationFrame(step);
  }

  // ── Now playing ─────────────────────────────────────
  function setNowPlaying(item, finalDur) {
    nowName.textContent = item.file.name;
    nowSub.textContent = "Playing · " + speedInput.value + "×";
    nowIcon.classList.add("playing");
    nowIcon.querySelector("i").className = "bi bi-music-note-beamed";
    nowTot.textContent = formatDuration(finalDur);
    meterRow.classList.add("is-live");
  }

  function clearNowPlaying() {
    nowName.textContent = "Tidak ada";
    nowSub.textContent = "Klik play pada trek";
    nowIcon.classList.remove("playing");
    nowIcon.querySelector("i").className = "bi bi-music-note";
    meterRow.classList.remove("is-live");
    meterBars.forEach((b) => (b.style.height = "3px"));
    nowCur.textContent = "0:00";
    nowTot.textContent = "0:00";
    nowProgressBar.style.width = "0%";
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

  // ── Remove / state ──────────────────────────────────
  function removeItem(item) {
    stopPlay(item);
    if (item.rowEl) item.rowEl.remove();
    items.delete(item.id);
    if (activeTrack === item) activeTrack = null;
    refreshEmptyState();
    updateDownloadState();
    updateStats();
    renderLibrary();
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

  // ── Stats ───────────────────────────────────────────
  function updateStats() {
    statFiles.textContent = items.size;
    let totalDur = 0,
      mem = 0;
    items.forEach((i) => {
      if (i.buffer) {
        totalDur += i.buffer.duration;
        mem += i.buffer.length * i.buffer.numberOfChannels * 4;
      }
    });
    const speedVal = parseFloat(speedInput.value) || 1;
    statDur.textContent = formatDuration(totalDur);
    statEst.textContent = formatDuration(totalDur / speedVal);
    statMem.textContent =
      mem > 1024 * 1024
        ? (mem / 1024 / 1024).toFixed(1) + " MB"
        : (mem / 1024).toFixed(0) + " KB";
    updateExportInfo(totalDur, speedVal);
  }

  function updateExportInfo(totalDur, speedVal) {
    const format = formatSelect.value;
    const est = totalDur / speedVal;
    const bitrate = format === "mp3" ? 128 : format === "ogg" ? 160 : 1411;
    const sizeMb = (est * bitrate * 1000) / 8 / (1024 * 1024);
    exportInfo.textContent = `Estimasi: ${formatDuration(est)} · ~${sizeMb.toFixed(2)} MB`;
  }

  // ── Library page ────────────────────────────────────
  function renderLibrary() {
    if (!libGrid) return;
    const list = [...items.values()];
    [...libGrid.querySelectorAll(".lib-card")].forEach((el) => el.remove());

    if (list.length === 0) {
      if (libEmpty) libEmpty.style.display = "";
      return;
    }
    if (libEmpty) libEmpty.style.display = "none";

    list.forEach((item) => {
      const card = document.createElement("div");
      card.className = "lib-card";
      const dur = item.buffer ? formatDuration(item.buffer.duration) : "—";
      const sizeKb = (item.file.size / 1024).toFixed(0);
      const sizeLabel =
        sizeKb > 1024
          ? (item.file.size / 1024 / 1024).toFixed(1) + " MB"
          : sizeKb + " KB";
      card.innerHTML = `
        <div class="lib-card-head">
          <div class="lib-card-icon"><i class="bi bi-music-note-beamed"></i></div>
          <div style="min-width:0">
            <div class="lib-card-name" title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</div>
            <div class="lib-card-meta">${sizeLabel} · ${dur}</div>
          </div>
        </div>
        <div class="mini-wave"><canvas></canvas></div>
        <div class="lib-card-tags">
          <span class="lib-tag">${item.status === "loaded" ? "Siap" : item.status === "downloaded" ? "Selesai" : item.status === "error" ? "Error" : "Memuat"}</span>
          <span class="lib-tag">${item.file.type || "audio"}</span>
        </div>
      `;
      card.addEventListener("click", () => {
        const studioTab = document.querySelector('.nav-tab[data-tab="studio"]');
        if (studioTab) studioTab.click();
        activeTrack = item;
        setActiveTrack(item);
        if (item.rowEl)
          item.rowEl.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      libGrid.appendChild(card);

      const cvs = card.querySelector("canvas");
      if (cvs && item.peaks) {
        requestAnimationFrame(() => {
          const dpr = window.devicePixelRatio || 1;
          const w = cvs.clientWidth || 180;
          const h = cvs.clientHeight || 30;
          cvs.width = w * dpr;
          cvs.height = h * dpr;
          const ctx = cvs.getContext("2d");
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, w, h);
          const grad = ctx.createLinearGradient(0, 0, w, 0);
          grad.addColorStop(0, "#22d3ee");
          grad.addColorStop(1, "#f43f8e");
          ctx.fillStyle = grad;
          const n = item.peaks.length;
          const barW = w / n;
          const mid = h / 2;
          for (let i = 0; i < n; i++) {
            const amp = Math.max(item.peaks[i], 0.02) * (mid - 1);
            ctx.globalAlpha = 0.8;
            ctx.fillRect(i * barW, mid - amp, Math.max(barW - 0.6, 1), amp * 2);
          }
          ctx.globalAlpha = 1;
        });
      }
    });
  }

  if (libRefreshBtn)
    libRefreshBtn.addEventListener("click", () => {
      renderLibrary();
      showToast("success", "Library disegarkan");
    });

  // ── Sliders ─────────────────────────────────────────
  speedInput.addEventListener("input", function () {
    speedValDisplay.textContent = parseFloat(this.value).toFixed(1) + "×";
    updateStats();
  });
  speedInput.addEventListener("change", resetDownloadedStatuses);

  amplificationInput.addEventListener("input", function () {
    const v = parseInt(this.value);
    amplificationValDisplay.textContent = (v >= 0 ? "+" : "") + v + " dB";
  });
  amplificationInput.addEventListener("change", resetDownloadedStatuses);

  bassInput.addEventListener("input", function () {
    const v = parseInt(this.value);
    bassValDisplay.textContent = (v >= 0 ? "+" : "") + v + " dB";
  });
  bassInput.addEventListener("change", resetDownloadedStatuses);

  fadeInInput.addEventListener("input", function () {
    fadeInValDisplay.textContent = parseFloat(this.value).toFixed(1) + "s";
  });
  fadeInInput.addEventListener("change", resetDownloadedStatuses);

  fadeOutInput.addEventListener("input", function () {
    fadeOutValDisplay.textContent = parseFloat(this.value).toFixed(1) + "s";
  });
  fadeOutInput.addEventListener("change", resetDownloadedStatuses);

  formatSelect.addEventListener("change", () => {
    resetDownloadedStatuses();
    updateStats();
  });
  autoLevelToggle.addEventListener("change", resetDownloadedStatuses);

  reverseToggle.addEventListener("change", function () {
    trackList.classList.toggle("is-reversed", this.checked);
    items.forEach((i) => {
      i.reversedBuffer = null;
      if (i.isPlaying) stopPlay(i);
      i.pauseAt = 0;
    });
    resetDownloadedStatuses();
  });

  loopToggle.addEventListener("change", function () {
    items.forEach((i) => {
      if (i.isPlaying) {
        const pos = i.pauseAt;
        stopPlay(i);
        startPlayback(i, pos);
      }
    });
  });

  // ── Presets ─────────────────────────────────────────
  const PRESETS = {
    podcast: {
      speed: 1.0,
      amp: 2,
      bass: 3,
      fadeIn: 0.15,
      fadeOut: 0.3,
      reverse: false,
      autoLevel: true,
    },
    nightcore: {
      speed: 1.3,
      amp: 2,
      bass: 2,
      fadeIn: 0.0,
      fadeOut: 0.0,
      reverse: false,
      autoLevel: true,
    },
    slowed: {
      speed: 0.8,
      amp: 1,
      bass: 4,
      fadeIn: 0.0,
      fadeOut: 0.0,
      reverse: false,
      autoLevel: true,
    },
    bass: {
      speed: 1.0,
      amp: 3,
      bass: 10,
      fadeIn: 0.0,
      fadeOut: 0.0,
      reverse: false,
      autoLevel: true,
    },
    lofi: {
      speed: 0.9,
      amp: 0,
      bass: 6,
      fadeIn: 0.2,
      fadeOut: 0.4,
      reverse: false,
      autoLevel: true,
    },
    vocal: {
      speed: 1.0,
      amp: 4,
      bass: -3,
      fadeIn: 0.0,
      fadeOut: 0.0,
      reverse: false,
      autoLevel: true,
    },
  };

  const DEFAULT_PARAMS = {
    speed: 1,
    amp: 0,
    bass: 0,
    fadeIn: 0,
    fadeOut: 0,
    reverse: false,
    autoLevel: false,
  };

  function applyPresetParams(p) {
    setSlider(speedInput, speedValDisplay, p.speed, (v) => v.toFixed(1) + "×");
    setSlider(
      amplificationInput,
      amplificationValDisplay,
      p.amp,
      (v) => (v >= 0 ? "+" : "") + v + " dB",
    );
    setSlider(
      bassInput,
      bassValDisplay,
      p.bass,
      (v) => (v >= 0 ? "+" : "") + v + " dB",
    );
    setSlider(
      fadeInInput,
      fadeInValDisplay,
      p.fadeIn,
      (v) => v.toFixed(1) + "s",
    );
    setSlider(
      fadeOutInput,
      fadeOutValDisplay,
      p.fadeOut,
      (v) => v.toFixed(1) + "s",
    );
    reverseToggle.checked = p.reverse;
    reverseToggle.dispatchEvent(new Event("change"));
    autoLevelToggle.checked = p.autoLevel;
    autoLevelToggle.dispatchEvent(new Event("change"));
    resetDownloadedStatuses();
    updateStats();
  }

  function resetToDefaults() {
    applyPresetParams(DEFAULT_PARAMS);
  }

  // Chip click → apply preset
  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", (e) => {
      if (e.target.closest(".chip-reset")) return; // reset button handled separately
      const p = PRESETS[chip.dataset.p];
      if (!p) return;
      document
        .querySelectorAll(".chip")
        .forEach((c) => c.classList.remove("on"));
      chip.classList.add("on");
      applyPresetParams(p);
      showToast(
        "success",
        `Preset "${chip.querySelector(".chip-label").textContent.trim()}" diterapkan`,
      );
    });
  });

  // Per-chip reset button (×)
  document.querySelectorAll(".chip-reset").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const presetKey = btn.dataset.reset;
      const chip = btn.closest(".chip");
      if (!chip) return;
      const wasActive = chip.classList.contains("on");
      chip.classList.remove("on");
      if (wasActive) {
        resetToDefaults();
        showToast(
          "success",
          `Preset "${chip.querySelector(".chip-label").textContent.trim()}" direset`,
        );
      } else {
        showToast("warning", "Preset tidak aktif");
      }
      void presetKey;
    });
  });

  // Reset ALL presets button
  if (resetPresetsBtn) {
    resetPresetsBtn.addEventListener("click", () => {
      const anyActive = document.querySelectorAll(".chip.on").length > 0;
      document
        .querySelectorAll(".chip")
        .forEach((c) => c.classList.remove("on"));
      if (anyActive) {
        resetToDefaults();
        showToast("success", "Semua preset direset");
      } else {
        showToast("warning", "Tidak ada preset aktif");
      }
    });
  }

  function setSlider(input, display, val, fmt) {
    input.value = val;
    display.textContent = fmt(parseFloat(val));
    input.dispatchEvent(new Event("input"));
  }

  // ── Reset / clear (parameter) ───────────────────────
  resetBtn.addEventListener("click", () => {
    resetToDefaults();
    document.querySelectorAll(".chip").forEach((c) => c.classList.remove("on"));
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
    activeTrack = null;
    refreshEmptyState();
    updateDownloadState();
    updateStats();
    renderLibrary();
    showToast("success", "Semua file dihapus");
  });

  // ── Search ──────────────────────────────────────────
  searchInput.addEventListener("input", function () {
    const q = this.value.trim().toLowerCase();
    items.forEach((item) => {
      if (!item.rowEl) return;
      item.rowEl.classList.toggle(
        "is-hidden",
        q !== "" && !item.file.name.toLowerCase().includes(q),
      );
    });
  });

  // ── Keyboard ────────────────────────────────────────
  document.addEventListener("keydown", (e) => {
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    if (e.key === "Escape") {
      stopAll();
      return;
    }
    if (e.code === "Space" && activeTrack) {
      e.preventDefault();
      togglePlay(activeTrack);
    }
  });

  // ── Download state ──────────────────────────────────
  function resetDownloadedStatuses() {
    let changed = false;
    items.forEach((item) => {
      if (item.status === "downloaded") {
        item.status = "loaded";
        renderTrack(item);
        changed = true;
      }
    });
    if (changed) {
      updateDownloadState();
      renderLibrary();
    }
  }

  function updateDownloadState() {
    const exportable = [...items.values()].filter(
      (i) => i.status === "loaded" || i.status === "downloaded",
    );
    downloadBtn.disabled = exportable.length === 0 || isExporting;
    downloadBtnLabel.textContent =
      exportable.length > 1 ? `Download (${exportable.length})` : "Download";
  }

  // ── Export ──────────────────────────────────────────
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
    setStatus("busy", "Mengekspor");
    const originalLabel = downloadBtnLabel.textContent;
    downloadBtn.querySelector("i").className = "bi bi-hourglass-split";

    const speedVal = parseFloat(speedInput.value);
    const amplificationVal = parseInt(amplificationInput.value);
    const bassVal = parseInt(bassInput.value);
    const fadeIn = parseFloat(fadeInInput.value);
    const fadeOut = parseFloat(fadeOutInput.value);
    const reverseOn = reverseToggle.checked;
    const autoLevel = autoLevelToggle.checked;
    const format = formatSelect.value;

    let done = 0,
      failed = 0;

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
          bassVal,
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

    if (failed === 0)
      showToast(
        "success",
        done > 1 ? `${done} file diunduh` : "Download dimulai",
      );
    else showToast("warning", `${done} ok, ${failed} gagal`);

    isExporting = false;
    downloadBtn.querySelector("i").className = "bi bi-download";
    downloadBtnLabel.textContent = originalLabel;
    updateDownloadState();
    renderLibrary();
    setStatus("idle", "Siap");
  }

  async function processAndExport(
    item,
    speedVal,
    amplificationDb,
    bassDb,
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

    const bassFilter = offlineCtx.createBiquadFilter();
    bassFilter.type = "lowshelf";
    bassFilter.frequency.value = 200;
    bassFilter.gain.value = bassDb;

    source.connect(bassFilter);
    bassFilter.connect(gain);
    gain.connect(offlineCtx.destination);
    source.start(0);
    source.stop(finalDuration);

    const rendered = await offlineCtx.startRendering();
    onProgress?.(0.55);

    if (autoLevel) normalizeBuffer(rendered);
    onProgress?.(0.7);

    let blob;
    if (format === "mp3") blob = encodeMP3(rendered);
    else if (format === "wav") blob = bufferToWave(rendered);
    else blob = new Blob([bufferToWave(rendered)], { type: "audio/ogg" });

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
      for (let i = 0; i < data.length; i++) data[i] *= scale;
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

    for (let i = 0; i < numOfChan; i++) channels.push(buffer.getChannelData(i));

    let offset = 0;
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

  // ── Toast ───────────────────────────────────────────
  function showToast(type, message) {
    const icons = {
      success: "check-circle-fill",
      warning: "exclamation-triangle-fill",
      danger: "x-circle-fill",
    };
    const el = document.createElement("div");
    el.className = `toast t-${type}`;
    el.innerHTML = `<i class="bi bi-${icons[type]}"></i><span>${message}</span><button aria-label="Tutup">&times;</button>`;
    el.querySelector("button").addEventListener("click", () => dismiss());
    $("toastStack").appendChild(el);
    const timer = setTimeout(dismiss, 3200);
    function dismiss() {
      clearTimeout(timer);
      el.classList.add("out");
      setTimeout(() => el.remove(), 250);
    }
  }

  // ── Resize ──────────────────────────────────────────
  let resizeT;
  window.addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      items.forEach((item) => {
        if (item.status === "loaded" || item.status === "downloaded")
          drawWaveform(item);
      });
      renderLibrary();
    }, 150);
  });

  // ── Init ────────────────────────────────────────────
  const yearEl = document.getElementById("footerYear");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
  refreshEmptyState();
  updateDownloadState();
  updateStats();
  setStatus("idle", "Siap");
})();
