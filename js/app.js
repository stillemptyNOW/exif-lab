(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const state = {
    file: null,
    buffer: null,
    kind: null,
    meta: null,
    clearGps: false,
    mediaInfo: null,
  };

  const el = {
    drop: $("#dropzone"),
    fileInput: $("#fileInput"),
    pickBtn: $("#pickBtn"),
    dropIdle: $("#dropIdle"),
    dropActive: $("#dropActive"),
    previewImg: $("#previewImg"),
    previewVid: $("#previewVid"),
    previewFallback: $("#previewFallback"),
    fileName: $("#fileName"),
    fileInfo: $("#fileInfo"),
    clearBtn: $("#clearBtn"),
    workPanel: $("#workPanel"),
    metaGroups: $("#metaGroups"),
    readEmpty: $("#readEmpty"),
    readStatus: $("#readStatus"),
    rawJson: $("#rawJson"),
    spoofForm: $("#spoofForm"),
    spoofHint: $("#spoofHint"),
    spoofNote: $("#spoofNote"),
    reencodeCheck: $("#reencodeCheck"),
    jpegQuality: $("#jpegQuality"),
    clearGpsBtn: $("#clearGpsBtn"),
    mapsLink: $("#mapsLink"),
    stripBtn: $("#stripBtn"),
    copyJsonBtn: $("#copyJsonBtn"),
    downloadJsonBtn: $("#downloadJsonBtn"),
    applyBtn: $("#applyBtn"),
  };

  const IMAGE_EXT = new Set([
    "jpg", "jpeg", "jpe", "jfif", "png", "webp", "gif", "bmp",
    "heic", "heif", "avif", "tif", "tiff", "dng", "cr2", "nef",
    "arw", "rw2", "orf", "raf", "srw", "pef", "ico",
  ]);

  const VIDEO_EXT = new Set([
    "mp4", "m4v", "mov", "webm", "mkv", "avi", "3gp", "3g2",
    "mts", "m2ts", "wmv", "flv", "ogv", "ts",
  ]);

  const JPEG_EXT = new Set(["jpg", "jpeg", "jpe", "jfif"]);

  const FIELD_MAP = [
    "Make", "Model", "LensModel", "Software",
    "DateTimeOriginal", "DateTime", "Artist", "Copyright", "ImageDescription",
    "ISO", "FNumber", "ExposureTime", "FocalLength", "Orientation",
    "GPSLatitude", "GPSLongitude", "GPSAltitude",
  ];

  function extOf(name = "") {
    const i = name.lastIndexOf(".");
    return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
  }

  function formatBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(2)} MB`;
    return `${(n / 1024 ** 3).toFixed(2)} GB`;
  }

  function detectKind(file) {
    const ext = extOf(file.name);
    const t = (file.type || "").toLowerCase();
    if (t.startsWith("image/") || IMAGE_EXT.has(ext)) return "image";
    if (t.startsWith("video/") || VIDEO_EXT.has(ext)) return "video";
    return "other";
  }

  function isJpeg(file) {
    const ext = extOf(file.name);
    const t = (file.type || "").toLowerCase();
    return JPEG_EXT.has(ext) || t === "image/jpeg" || t === "image/jpg";
  }

  function serialize(value) {
    if (value == null) return "";
    if (value instanceof Date) {
      const p = (n) => String(n).padStart(2, "0");
      return `${value.getFullYear()}:${p(value.getMonth() + 1)}:${p(value.getDate())} ${p(value.getHours())}:${p(value.getMinutes())}:${p(value.getSeconds())}`;
    }
    if (typeof value === "object") {
      if (typeof value.numerator === "number" && typeof value.denominator === "number") {
        if (value.denominator === 1) return String(value.numerator);
        return `${value.numerator}/${value.denominator}`;
      }
      if (Array.isArray(value)) return value.map(serialize).join(", ");
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  }

  function displayValue(value) {
    if (value == null || value === "") return "—";
    if (value instanceof Date) return value.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
    if (typeof value === "number" && Number.isFinite(value)) {
      return Number.isInteger(value) ? String(value) : String(Math.round(value * 1e6) / 1e6);
    }
    if (typeof value === "object") {
      if (typeof value.numerator === "number" && typeof value.denominator === "number") {
        if (value.denominator === 1) return String(value.numerator);
        if (value.numerator === 1) return `1/${value.denominator}`;
        return `${value.numerator}/${value.denominator}`;
      }
      if (Array.isArray(value)) return value.map(displayValue).join(", ");
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  }

  function toRational(num, den = 1) {
    return [Math.round(num), den];
  }

  function parseExposure(str) {
    if (!str) return null;
    const s = String(str).trim();
    if (s.includes("/")) {
      const [a, b] = s.split("/").map(Number);
      if (a > 0 && b > 0) return [Math.round(a), Math.round(b)];
    }
    const n = Number(s);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (n >= 1) return [Math.round(n), 1];
    const den = Math.round(1 / n);
    return den > 0 ? [1, den] : null;
  }

  function parseFloatSafe(str) {
    if (str == null || str === "") return null;
    const n = Number(String(str).replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  function degToDmsRational(deg) {
    const abs = Math.abs(deg);
    const d = Math.floor(abs);
    const mFloat = (abs - d) * 60;
    const m = Math.floor(mFloat);
    const s = (mFloat - m) * 60;
    return [
      [d, 1],
      [m, 1],
      [Math.round(s * 10000), 10000],
    ];
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function baseName(name) {
    const i = name.lastIndexOf(".");
    return i >= 0 ? name.slice(0, i) : name;
  }

  function dataUrlToBlob(dataUrl) {
    const [head, body] = dataUrl.split(",");
    const mime = head.match(/:(.*?);/)[1];
    const bin = atob(body);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function setHint(text, type = "") {
    el.spoofHint.textContent = text || "";
    el.spoofHint.className = "hint" + (type ? ` ${type}` : "");
  }

  $$(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".tab").forEach((b) => {
        b.classList.toggle("active", b === btn);
        b.setAttribute("aria-selected", b === btn ? "true" : "false");
      });
      $$(".tab-panel").forEach((p) => p.classList.add("hidden"));
      $(`#tab-${btn.dataset.tab}`).classList.remove("hidden");
    });
  });

  el.pickBtn.addEventListener("click", () => el.fileInput.click());
  el.drop.addEventListener("click", (e) => {
    if (e.target.closest("button, a, video, input, label")) return;
    if (!state.file) el.fileInput.click();
  });
  el.drop.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && !state.file) {
      e.preventDefault();
      el.fileInput.click();
    }
  });

  el.fileInput.addEventListener("change", () => {
    const f = el.fileInput.files && el.fileInput.files[0];
    if (f) loadFile(f);
  });

  ["dragenter", "dragover"].forEach((ev) => {
    el.drop.addEventListener(ev, (e) => {
      e.preventDefault();
      el.drop.classList.add("dragover");
    });
  });
  ["dragleave", "drop"].forEach((ev) => {
    el.drop.addEventListener(ev, (e) => {
      e.preventDefault();
      el.drop.classList.remove("dragover");
    });
  });
  el.drop.addEventListener("drop", (e) => {
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadFile(f);
  });

  el.clearBtn.addEventListener("click", reset);

  function reset() {
    revokePreviews();
    state.file = null;
    state.buffer = null;
    state.kind = null;
    state.meta = null;
    state.clearGps = false;
    el.fileInput.value = "";
    el.dropIdle.classList.remove("hidden");
    el.dropActive.classList.add("hidden");
    el.workPanel.classList.add("hidden");
    el.metaGroups.innerHTML = "";
    el.rawJson.textContent = "{}";
    el.spoofForm.reset();
    setHint("");
    el.mapsLink.hidden = true;
  }

  function revokePreviews() {
    if (el.previewImg.src) URL.revokeObjectURL(el.previewImg.src);
    if (el.previewVid.src) URL.revokeObjectURL(el.previewVid.src);
    el.previewImg.removeAttribute("src");
    el.previewVid.removeAttribute("src");
    el.previewImg.hidden = true;
    el.previewVid.hidden = true;
    el.previewFallback.classList.add("hidden");
  }

  async function loadFile(file) {
    revokePreviews();
    state.file = file;
    state.kind = detectKind(file);
    state.clearGps = false;
    state.buffer = await file.arrayBuffer();

    el.dropIdle.classList.add("hidden");
    el.dropActive.classList.remove("hidden");
    el.workPanel.classList.remove("hidden");
    el.fileName.textContent = file.name;
    el.fileInfo.textContent = `${formatBytes(file.size)} · ${file.type || "unknown type"} · ${state.kind}`;

    showPreview(file);
    setHint("");
    el.readStatus.textContent = "читаем…";

    try {
      const meta = await readMetadata(file, state.buffer);
      state.meta = meta;
      renderMeta(meta);
      fillForm(meta.flat);
      updateMapsLink();
      el.readStatus.textContent = `${Object.keys(meta.flat).length} полей · ${state.kind}`;
    } catch (err) {
      console.error(err);
      state.meta = { groups: {}, flat: {}, raw: { error: String(err.message || err) } };
      renderMeta(state.meta);
      el.readStatus.textContent = "ошибка чтения";
      setHint(String(err.message || err), "err");
    }

    el.reencodeCheck.checked = state.kind === "image" && !isJpeg(file);
    el.applyBtn.disabled = state.kind === "video" || state.kind === "other";
    el.stripBtn.disabled = state.kind === "video" || state.kind === "other";
    if (state.kind === "video") {
      el.spoofNote.innerHTML =
        "Видео: доступно <strong>чтение</strong> контейнерных метаданных. Подмена/очистка EXIF в браузере без перекодирования не поддерживается.";
    } else if (state.kind === "image" && !isJpeg(file)) {
      el.spoofNote.innerHTML =
        "Файл не JPEG. Подмена: включи перекодирование в JPEG — новые EXIF-теги запишутся в выгрузку. Оригинал на диск не меняется.";
    } else {
      el.spoofNote.innerHTML =
        "Подмена EXIF пишется в <strong>JPEG</strong>. Другие картинки можно перекодировать в JPEG с новыми тегами. Видео — только чтение.";
    }
  }

  function showPreview(file) {
    const url = URL.createObjectURL(file);
    if (state.kind === "image") {
      el.previewImg.hidden = false;
      el.previewImg.src = url;
      el.previewImg.onerror = () => {
        el.previewImg.hidden = true;
        el.previewFallback.classList.remove("hidden");
        el.previewFallback.textContent = "превью недоступно\n(метаданные читаются)";
      };
    } else if (state.kind === "video") {
      el.previewVid.hidden = false;
      el.previewVid.src = url;
    } else {
      el.previewFallback.classList.remove("hidden");
      el.previewFallback.textContent = "нет превью";
    }
  }

  async function readMetadata(file, buffer) {
    const flat = {};
    const groups = {};
    const raw = {};

    groups.File = {
      name: file.name,
      size: file.size,
      sizeHuman: formatBytes(file.size),
      type: file.type || "",
      lastModified: file.lastModified ? new Date(file.lastModified).toISOString() : "",
      extension: extOf(file.name),
      kind: state.kind,
    };
    Object.assign(flat, groups.File);

    if (state.kind === "image" || state.kind === "other") {
      try {
        if (typeof exifr === "undefined") throw new Error("exifr не загрузился");
        const parsed = await exifr.parse(buffer, {
          tiff: true,
          xmp: true,
          icc: true,
          iptc: true,
          jfif: true,
          ihdr: true,
          gps: true,
          interop: true,
          translateKeys: true,
          translateValues: true,
          reviveValues: true,
          sanitize: true,
          mergeOutput: true,
        });
        if (parsed && typeof parsed === "object") {
          raw.exifr = parsed;
          const g = {};
          for (const [k, v] of Object.entries(parsed)) {
            if (v == null || v === "") continue;
            if (k === "unknown" || typeof v === "function") continue;
            g[k] = v;
            flat[k] = v;
          }
          groups.Image = g;
        }
      } catch (e) {
        raw.exifrError = String(e.message || e);
      }

      try {
        const multi = await exifr.parse(buffer, true);
        if (multi && typeof multi === "object") raw.exifrMulti = multi;
      } catch {
        /* ignore */
      }
    }

    if (state.kind === "video" || state.kind === "other") {
      try {
        const vi = await readVideoMeta(file);
        if (vi) {
          raw.mediaInfo = vi.raw;
          groups.Video = vi.flat;
          Object.assign(flat, vi.flat);
        }
      } catch (e) {
        raw.mediaInfoError = String(e.message || e);
      }
    }

    return { groups, flat, raw };
  }

  async function ensureMediaInfo() {
    if (state.mediaInfo) return state.mediaInfo;
    const factory =
      window.mediaInfoFactory ||
      (window.MediaInfo && window.MediaInfo.mediaInfoFactory) ||
      (window.MediaInfoModule && window.MediaInfoModule.mediaInfoFactory);

    if (!factory) {
      throw new Error("MediaInfo не загрузился (CDN / wasm)");
    }

    state.mediaInfo = await factory({
      format: "object",
      locateFile: (wasm) =>
        `https://cdn.jsdelivr.net/npm/mediainfo.js@0.3.5/dist/${wasm}`,
    });
    return state.mediaInfo;
  }

  async function readVideoMeta(file) {
    const mi = await ensureMediaInfo();
    const result = await mi.analyzeData(
      () => file.size,
      (chunkSize, offset) =>
        new Promise((resolve, reject) => {
          const slice = file.slice(offset, offset + chunkSize);
          const reader = new FileReader();
          reader.onload = (e) => {
            if (e.target.error) reject(e.target.error);
            else resolve(new Uint8Array(e.target.result));
          };
          reader.readAsArrayBuffer(slice);
        })
    );

    const flat = {};
    const tracks =
      result && result.media && result.media.track
        ? Array.isArray(result.media.track)
          ? result.media.track
          : [result.media.track]
        : [];

    for (const track of tracks) {
      const type = track["@type"] || track.type || "Track";
      for (const [k, v] of Object.entries(track)) {
        if (k.startsWith("@")) continue;
        if (v == null || v === "") continue;
        flat[`${type}.${k}`] = v;
      }
    }

    const general = tracks.find((t) => (t["@type"] || "") === "General") || {};
    const video = tracks.find((t) => (t["@type"] || "") === "Video") || {};
    const audio = tracks.find((t) => (t["@type"] || "") === "Audio") || {};

    const friendly = {
      format: general.Format || "",
      duration: general.Duration || video.Duration || "",
      overallBitRate: general.OverallBitRate || "",
      encoded_date: general.Encoded_Date || general.Tagged_Date || "",
      tagged_date: general.Tagged_Date || "",
      writingApp: general.Writing_application || general.Encoded_Application || "",
      videoCodec: video.Format || "",
      width: video.Width || "",
      height: video.Height || "",
      frameRate: video.FrameRate || "",
      audioCodec: audio.Format || "",
      audioChannels: audio.Channels || "",
      audioSamplingRate: audio.SamplingRate || "",
    };
    for (const [k, v] of Object.entries(friendly)) {
      if (v !== "" && v != null) flat[k] = v;
    }

    return { flat, raw: result };
  }

  const GROUP_ORDER = ["File", "Image", "Video"];
  const PRIORITY_KEYS = [
    "Make", "Model", "LensModel", "Software", "DateTimeOriginal", "CreateDate",
    "ModifyDate", "DateTime", "Artist", "Copyright", "ImageDescription",
    "ISO", "ISOSpeedRatings", "FNumber", "ExposureTime", "FocalLength",
    "Orientation", "ImageWidth", "ImageHeight", "ExifImageWidth", "ExifImageHeight",
    "latitude", "longitude", "GPSLatitude", "GPSLongitude", "GPSAltitude",
    "format", "duration", "videoCodec", "width", "height", "frameRate",
    "audioCodec", "encoded_date", "writingApp",
  ];

  function renderMeta(meta) {
    el.metaGroups.innerHTML = "";
    const groupNames = [
      ...GROUP_ORDER.filter((g) => meta.groups[g] && Object.keys(meta.groups[g]).length),
      ...Object.keys(meta.groups).filter((g) => !GROUP_ORDER.includes(g)),
    ];

    let total = 0;
    for (const name of groupNames) {
      const data = meta.groups[name];
      const keys = Object.keys(data).filter((k) => data[k] != null && data[k] !== "");
      if (!keys.length) continue;
      total += keys.length;

      keys.sort((a, b) => {
        const ia = PRIORITY_KEYS.indexOf(a);
        const ib = PRIORITY_KEYS.indexOf(b);
        if (ia === -1 && ib === -1) return a.localeCompare(b);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });

      const section = document.createElement("section");
      section.className = "group";
      section.innerHTML = `<h3>${name}</h3>`;
      const table = document.createElement("table");
      table.className = "table";
      const tbody = document.createElement("tbody");
      for (const k of keys) {
        const tr = document.createElement("tr");
        const th = document.createElement("th");
        th.textContent = k;
        const td = document.createElement("td");
        td.textContent = displayValue(data[k]);
        tr.append(th, td);
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      section.appendChild(table);
      el.metaGroups.appendChild(section);
    }

    el.readEmpty.classList.toggle("hidden", total > 0);
    el.rawJson.textContent = JSON.stringify(meta.raw, replacer, 2);
  }

  function replacer(_key, value) {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "bigint") return value.toString();
    if (value instanceof ArrayBuffer) return `ArrayBuffer(${value.byteLength})`;
    if (ArrayBuffer.isView(value)) return `${value.constructor.name}(${value.byteLength})`;
    return value;
  }

  function fillForm(flat) {
    el.spoofForm.reset();
    state.clearGps = false;
    const get = (...keys) => {
      for (const k of keys) {
        if (flat[k] != null && flat[k] !== "") return flat[k];
      }
      return "";
    };

    const set = (name, value) => {
      const input = el.spoofForm.elements.namedItem(name);
      if (!input) return;
      input.value = serialize(value);
    };

    set("Make", get("Make"));
    set("Model", get("Model"));
    set("LensModel", get("LensModel", "Lens"));
    set("Software", get("Software"));
    set("DateTimeOriginal", get("DateTimeOriginal", "CreateDate", "DateCreated"));
    set("DateTime", get("DateTime", "ModifyDate"));
    set("Artist", get("Artist", "Creator"));
    set("Copyright", get("Copyright", "Rights"));
    set("ImageDescription", get("ImageDescription", "Description", "Caption"));
    set("ISO", get("ISO", "ISOSpeedRatings", "PhotographicSensitivity"));
    set("FNumber", get("FNumber", "ApertureValue"));
    set("ExposureTime", get("ExposureTime", "ShutterSpeedValue"));
    set("FocalLength", get("FocalLength"));
    set("Orientation", get("Orientation"));

    const lat = get("latitude", "GPSLatitude", "Latitude");
    const lon = get("longitude", "GPSLongitude", "Longitude");
    const alt = get("GPSAltitude", "altitude");
    if (lat !== "" && lat != null) set("GPSLatitude", lat);
    if (lon !== "" && lon != null) set("GPSLongitude", lon);
    if (alt !== "" && alt != null) set("GPSAltitude", alt);
  }

  function updateMapsLink() {
    const lat = parseFloatSafe(el.spoofForm.elements.GPSLatitude.value);
    const lon = parseFloatSafe(el.spoofForm.elements.GPSLongitude.value);
    if (lat != null && lon != null) {
      el.mapsLink.hidden = false;
      el.mapsLink.href = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;
    } else {
      el.mapsLink.hidden = true;
    }
  }

  el.spoofForm.addEventListener("input", (e) => {
    if (["GPSLatitude", "GPSLongitude"].includes(e.target.name)) updateMapsLink();
  });

  el.clearGpsBtn.addEventListener("click", () => {
    el.spoofForm.elements.GPSLatitude.value = "";
    el.spoofForm.elements.GPSLongitude.value = "";
    el.spoofForm.elements.GPSAltitude.value = "";
    state.clearGps = true;
    updateMapsLink();
    setHint("GPS будет убран при сохранении", "ok");
  });

  el.copyJsonBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(el.rawJson.textContent);
      el.readStatus.textContent = "json скопирован";
    } catch {
      el.readStatus.textContent = "не удалось скопировать";
    }
  });

  el.downloadJsonBtn.addEventListener("click", () => {
    if (!state.file) return;
    const blob = new Blob([el.rawJson.textContent], { type: "application/json" });
    downloadBlob(blob, `${baseName(state.file.name)}.meta.json`);
  });

  function formValues() {
    const v = {};
    for (const name of FIELD_MAP) {
      const input = el.spoofForm.elements.namedItem(name);
      v[name] = input ? String(input.value || "").trim() : "";
    }
    return v;
  }

  function buildExifObj(values) {
    if (typeof piexif === "undefined") throw new Error("piexif не загрузился");

    const z = {};
    const e = {};
    const g = {};

    if (values.Make) z[piexif.ImageIFD.Make] = values.Make;
    if (values.Model) z[piexif.ImageIFD.Model] = values.Model;
    if (values.Software) z[piexif.ImageIFD.Software] = values.Software;
    if (values.Artist) z[piexif.ImageIFD.Artist] = values.Artist;
    if (values.Copyright) z[piexif.ImageIFD.Copyright] = values.Copyright;
    if (values.ImageDescription) z[piexif.ImageIFD.ImageDescription] = values.ImageDescription;
    if (values.DateTime) z[piexif.ImageIFD.DateTime] = values.DateTime;
    if (values.Orientation) z[piexif.ImageIFD.Orientation] = parseInt(values.Orientation, 10);

    if (values.DateTimeOriginal) e[piexif.ExifIFD.DateTimeOriginal] = values.DateTimeOriginal;
    if (values.DateTime) e[piexif.ExifIFD.DateTimeDigitized] = values.DateTime;
    if (values.LensModel) e[piexif.ExifIFD.LensModel] = values.LensModel;

    const iso = parseInt(values.ISO, 10);
    if (Number.isFinite(iso)) e[piexif.ExifIFD.ISOSpeedRatings] = iso;

    const fnum = parseFloatSafe(values.FNumber);
    if (fnum != null) e[piexif.ExifIFD.FNumber] = toRational(Math.round(fnum * 100), 100);

    const exp = parseExposure(values.ExposureTime);
    if (exp) e[piexif.ExifIFD.ExposureTime] = exp;

    const fl = parseFloatSafe(values.FocalLength);
    if (fl != null) e[piexif.ExifIFD.FocalLength] = toRational(Math.round(fl * 100), 100);

    const lat = parseFloatSafe(values.GPSLatitude);
    const lon = parseFloatSafe(values.GPSLongitude);
    const alt = parseFloatSafe(values.GPSAltitude);

    if (!state.clearGps && lat != null && lon != null) {
      g[piexif.GPSIFD.GPSVersionID] = [2, 3, 0, 0];
      g[piexif.GPSIFD.GPSLatitudeRef] = lat >= 0 ? "N" : "S";
      g[piexif.GPSIFD.GPSLatitude] = degToDmsRational(lat);
      g[piexif.GPSIFD.GPSLongitudeRef] = lon >= 0 ? "E" : "W";
      g[piexif.GPSIFD.GPSLongitude] = degToDmsRational(lon);
      if (alt != null) {
        g[piexif.GPSIFD.GPSAltitudeRef] = alt >= 0 ? 0 : 1;
        g[piexif.GPSIFD.GPSAltitude] = toRational(Math.round(Math.abs(alt) * 100), 100);
      }
    }

    return { "0th": z, Exif: e, GPS: g, "1st": {}, thumbnail: null };
  }

  async function fileToJpegDataUrl(file) {
    if (isJpeg(file) && !el.reencodeCheck.checked) {
      return await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
    }

    const bitmap = await loadImageBitmap(file);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d").drawImage(bitmap, 0, 0);
      const q = Math.min(1, Math.max(0.5, Number(el.jpegQuality.value) || 0.92));
      return canvas.toDataURL("image/jpeg", q);
    } finally {
      if (bitmap.close) bitmap.close();
    }
  }

  async function loadImageBitmap(file) {
    try {
      return await createImageBitmap(file);
    } catch {
      const url = URL.createObjectURL(file);
      try {
        const img = await new Promise((resolve, reject) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.onerror = () =>
            reject(
              new Error(
                "Браузер не может декодировать изображение для перекодирования (HEIC/RAW часто не поддерживаются). Используй JPEG/PNG/WebP."
              )
            );
          i.src = url;
        });
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        canvas.getContext("2d").drawImage(img, 0, 0);
        return await createImageBitmap(canvas);
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  }

  function insertExifIntoDataUrl(dataUrl, exifObj) {
    let clean = dataUrl;
    try {
      clean = piexif.remove(dataUrl);
    } catch {
      clean = dataUrl;
    }
    const bytes = piexif.dump(exifObj);
    return piexif.insert(bytes, clean);
  }

  function stripDataUrl(dataUrl) {
    try {
      return piexif.remove(dataUrl);
    } catch {
      return dataUrl;
    }
  }

  el.spoofForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.file || state.kind !== "image") {
      setHint("подмена только для изображений", "err");
      return;
    }

    el.applyBtn.disabled = true;
    setHint("собираем jpeg…");

    try {
      const values = formValues();
      if (!isJpeg(state.file) && !el.reencodeCheck.checked) {
        throw new Error("Для не-JPEG включи перекодирование в JPEG");
      }

      const dataUrl = await fileToJpegDataUrl(state.file);
      const exifObj = buildExifObj(values);
      const outUrl = insertExifIntoDataUrl(dataUrl, exifObj);
      const blob = dataUrlToBlob(outUrl);
      downloadBlob(blob, `${baseName(state.file.name)}_exif.jpg`);
      setHint(`готово · ${formatBytes(blob.size)}`, "ok");
    } catch (err) {
      console.error(err);
      setHint(err.message || String(err), "err");
    } finally {
      el.applyBtn.disabled = false;
    }
  });

  el.stripBtn.addEventListener("click", async () => {
    if (!state.file || state.kind !== "image") {
      setHint("очистка только для изображений", "err");
      return;
    }
    el.stripBtn.disabled = true;
    setHint("снимаем метаданные…");
    try {
      let dataUrl;
      if (isJpeg(state.file) && !el.reencodeCheck.checked) {
        dataUrl = stripDataUrl(await fileToJpegDataUrl(state.file));
      } else {
        el.reencodeCheck.checked = true;
        const bitmap = await loadImageBitmap(state.file);
        try {
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          canvas.getContext("2d").drawImage(bitmap, 0, 0);
          dataUrl = canvas.toDataURL(
            "image/jpeg",
            Math.min(1, Math.max(0.5, Number(el.jpegQuality.value) || 0.92))
          );
        } finally {
          if (bitmap.close) bitmap.close();
        }
      }

      const blob = dataUrlToBlob(dataUrl);
      downloadBlob(blob, `${baseName(state.file.name)}_clean.jpg`);
      setHint(`метаданные сняты · ${formatBytes(blob.size)}`, "ok");
    } catch (err) {
      console.error(err);
      setHint(err.message || String(err), "err");
    } finally {
      el.stripBtn.disabled = false;
    }
  });
})();
