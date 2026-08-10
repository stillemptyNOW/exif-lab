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
    /** @type {Blob|null} decoded raster cache (e.g. HEIC → JPEG) */
    decodedBlob: null,
  };

  const HEIC_EXT = new Set(["heic", "heif", "hif", "heics", "heifs"]);
  const RAW_EXT = new Set([
    "dng", "cr2", "cr3", "nef", "arw", "rw2", "orf", "raf", "srw", "pef", "raw",
  ]);

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
    // camera
    "Make", "Model", "LensMake", "LensModel", "Software", "HostComputer",
    "BodySerialNumber", "LensSerialNumber",
    // dates / author
    "DateTimeOriginal", "DateTimeDigitized", "DateTime", "SubSecTimeOriginal",
    "Artist", "Copyright", "ImageDescription", "UserComment",
    // exposure
    "ISO", "FNumber", "ExposureTime", "ShutterSpeed", "FocalLength",
    "FocalLengthIn35mmFilm", "ExposureBiasValue", "BrightnessValue",
    "MaxApertureValue", "DigitalZoomRatio", "Orientation",
    "ExposureProgram", "MeteringMode", "Flash", "WhiteBalance", "ColorSpace",
    "SceneCaptureType", "ExposureMode", "SensingMethod",
    // size
    "PixelXDimension", "PixelYDimension", "XResolution", "YResolution",
    "ResolutionUnit", "ExifVersion",
    // gps
    "GPSLatitude", "GPSLatitudeRef", "GPSLongitude", "GPSLongitudeRef",
    "GPSAltitude", "GPSAltitudeRef", "GPSImgDirection", "GPSSpeed",
    "GPSDateStamp", "GPSTimeStamp", "GPSMapDatum", "GPSVersionID",
  ];

  const PRESETS = {
    iphone15: {
      Make: "Apple",
      Model: "iPhone 15 Pro",
      LensMake: "Apple",
      LensModel: "iPhone 15 Pro back triple camera 6.765mm f/1.78",
      Software: "17.5.1",
      HostComputer: "iPhone 15 Pro",
      FNumber: "1.78",
      FocalLength: "6.765",
      FocalLengthIn35mmFilm: "24",
      ISO: "100",
      ExposureTime: "1/120",
      ShutterSpeed: "1/120",
      Orientation: "1",
      ExposureProgram: "2",
      MeteringMode: "5",
      Flash: "16",
      WhiteBalance: "0",
      ColorSpace: "1",
      SceneCaptureType: "0",
      ExposureMode: "0",
      SensingMethod: "2",
      ResolutionUnit: "2",
      XResolution: "72",
      YResolution: "72",
      ExifVersion: "0232",
      GPSMapDatum: "WGS-84",
      GPSVersionID: "2.3.0.0",
      GPSAltitudeRef: "0",
    },
    pixel8: {
      Make: "Google",
      Model: "Pixel 8",
      LensMake: "Google",
      LensModel: "Pixel 8 back camera 6.81mm f/1.68",
      Software: "HDR+ 1.0.0",
      FNumber: "1.68",
      FocalLength: "6.81",
      FocalLengthIn35mmFilm: "25",
      ISO: "64",
      ExposureTime: "1/100",
      ShutterSpeed: "1/100",
      Orientation: "1",
      ExposureProgram: "2",
      MeteringMode: "2",
      Flash: "16",
      WhiteBalance: "0",
      ColorSpace: "1",
      ResolutionUnit: "2",
      XResolution: "72",
      YResolution: "72",
      ExifVersion: "0232",
    },
    canon: {
      Make: "Canon",
      Model: "Canon EOS R6",
      LensMake: "Canon",
      LensModel: "RF24-105mm F4 L IS USM",
      Software: "Firmware Version 1.8.0",
      FNumber: "4",
      FocalLength: "50",
      FocalLengthIn35mmFilm: "50",
      ISO: "400",
      ExposureTime: "1/250",
      ShutterSpeed: "1/250",
      Orientation: "1",
      ExposureProgram: "3",
      MeteringMode: "5",
      Flash: "0",
      WhiteBalance: "0",
      ColorSpace: "1",
      ResolutionUnit: "2",
      XResolution: "72",
      YResolution: "72",
      ExifVersion: "0232",
    },
  };

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

  function isHeicLike(file, buffer) {
    const ext = extOf(file.name);
    if (HEIC_EXT.has(ext)) return true;
    const t = (file.type || "").toLowerCase();
    if (t.includes("heic") || t.includes("heif")) return true;
    if (!buffer || buffer.byteLength < 16) return false;
    const u8 = new Uint8Array(buffer);
    const tag = String.fromCharCode(u8[4], u8[5], u8[6], u8[7]);
    if (tag !== "ftyp") return false;
    const brands = [];
    brands.push(String.fromCharCode(u8[8], u8[9], u8[10], u8[11]));
    // compatible brands
    for (let i = 16; i + 4 <= Math.min(u8.length, 64); i += 4) {
      brands.push(String.fromCharCode(u8[i], u8[i + 1], u8[i + 2], u8[i + 3]));
    }
    const heicBrands = new Set([
      "heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs",
      "mif1", "msf1", "heif",
    ]);
    return brands.some((b) => heicBrands.has(b));
  }

  function isRawLike(file) {
    return RAW_EXT.has(extOf(file.name));
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error || new Error("FileReader failed"));
      r.readAsDataURL(blob);
    });
  }

  async function heicToJpegBlob(file, quality = 0.92) {
    if (typeof heic2any === "undefined") {
      throw new Error("heic2any не загрузился (CDN). Обнови страницу.");
    }
    const q = Math.min(1, Math.max(0.1, Number(quality) || 0.92));
    // some OS give empty MIME — libheif is happier with a typed blob
    const input =
      file.type && /heic|heif/i.test(file.type)
        ? file
        : new Blob([state.buffer || (await file.arrayBuffer())], {
            type: "image/heic",
          });

    let result;
    try {
      result = await heic2any({
        blob: input,
        toType: "image/jpeg",
        quality: q,
      });
    } catch (err) {
      const msg = String(err && (err.message || err.code) ? err.message || err.code : err);
      throw new Error(
        /format|ERR_|heic|decode/i.test(msg)
          ? "Не удалось декодировать HEIC/HEIF. Файл битый, защищён, или это не HEIC."
          : `HEIC decode: ${msg}`
      );
    }
    const blob = Array.isArray(result) ? result[0] : result;
    if (!(blob instanceof Blob)) throw new Error("HEIC: пустой результат декода");
    // normalize type for piexif / download path
    if (blob.type !== "image/jpeg") {
      return new Blob([blob], { type: "image/jpeg" });
    }
    return blob;
  }

  async function ensureDecodedRaster(file) {
    if (state.decodedBlob) return state.decodedBlob;

    // Native path first (Safari often decodes HEIC; Chrome — PNG/WebP/AVIF)
    try {
      const bmp = await createImageBitmap(file);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = bmp.width;
        canvas.height = bmp.height;
        canvas.getContext("2d").drawImage(bmp, 0, 0);
        const q = Math.min(1, Math.max(0.5, Number(el.jpegQuality.value) || 0.92));
        const dataUrl = canvas.toDataURL("image/jpeg", q);
        state.decodedBlob = dataUrlToBlob(dataUrl);
        return state.decodedBlob;
      } finally {
        if (bmp.close) bmp.close();
      }
    } catch {
      /* fall through */
    }

    if (isHeicLike(file, state.buffer)) {
      state.decodedBlob = await heicToJpegBlob(file, el.jpegQuality.value);
      return state.decodedBlob;
    }

    // Image() fallback for some formats
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error("img decode failed"));
        i.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      if (!canvas.width || !canvas.height) throw new Error("zero dimensions");
      canvas.getContext("2d").drawImage(img, 0, 0);
      const q = Math.min(1, Math.max(0.5, Number(el.jpegQuality.value) || 0.92));
      state.decodedBlob = dataUrlToBlob(canvas.toDataURL("image/jpeg", q));
      return state.decodedBlob;
    } catch {
      if (isRawLike(file)) {
        throw new Error(
          "RAW (CR2/NEF/ARW…) браузер не декодирует. Метаданные — на вкладке «чтение». Для подмены экспортируй JPEG из Lightroom/Photos."
        );
      }
      if (isHeicLike(file, state.buffer)) {
        throw new Error("HEIC не декодировался. Проверь файл или обнови страницу (CDN heic2any).");
      }
      throw new Error(
        "Браузер не смог декодировать картинку для перекодирования. Попробуй JPEG/PNG/WebP или HEIC."
      );
    } finally {
      URL.revokeObjectURL(url);
    }
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
    return [Math.round(num), Math.round(den)];
  }

  /** float → rational with decent precision */
  function floatToRational(x, precision = 100000) {
    if (!Number.isFinite(x)) return null;
    if (Number.isInteger(x)) return [x, 1];
    const den = precision;
    return [Math.round(x * den), den];
  }

  function parseExposure(str) {
    if (str == null || str === "") return null;
    let s = String(str).trim().toLowerCase();
    // "1/120 s", "0.008", "1 sec"
    s = s.replace(/\s*sec(onds?)?\.?/g, "").replace(/\s*s$/g, "").trim();
    if (s.includes("/")) {
      const [a, b] = s.split("/").map((p) => Number(String(p).replace(",", ".")));
      if (a > 0 && b > 0) return [Math.round(a), Math.round(b)];
    }
    const n = Number(String(s).replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return null;
    if (n >= 1) return floatToRational(n, 1000);
    // n < 1 → prefer 1/N
    const den = Math.round(1 / n);
    if (den > 0 && Math.abs(1 / den - n) < 1e-6) return [1, den];
    return floatToRational(n, 1000000);
  }

  function parseFloatSafe(str) {
    if (str == null || str === "") return null;
    if (typeof str === "number" && Number.isFinite(str)) return str;
    let s = String(str).trim();
    // strip units: "5.0 mm", "11 m", "f/1.8"
    s = s.replace(/^f\/?/i, "");
    s = s.replace(/,/g, ".");
    s = s.replace(/[^\d.+\-eE/ ].*$/, "").trim();
    if (s.includes("/")) {
      const [a, b] = s.split("/").map(Number);
      if (b) return a / b;
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  /** "11 deg 0' 0.00\" N" | "11 0 0 N" | "55.7558" | [d,m,s] */
  function parseGpsToDecimal(value) {
    if (value == null || value === "") return null;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (Array.isArray(value) && value.length >= 1) {
      const nums = value.map((v) => {
        if (typeof v === "number") return v;
        if (v && typeof v.numerator === "number") return v.numerator / (v.denominator || 1);
        if (Array.isArray(v) && v.length === 2) return v[0] / (v[1] || 1);
        return Number(v);
      });
      const d = nums[0] || 0;
      const m = nums[1] || 0;
      const s = nums[2] || 0;
      return d + m / 60 + s / 3600;
    }
    const raw = String(value).trim();
    const hemi = /[SWsw]/.test(raw) ? -1 : 1;
    const degMatch = raw.match(
      /(\d+(?:[.,]\d+)?)\s*(?:deg|°)?\s*(\d+(?:[.,]\d+)?)?\s*['′]?\s*(\d+(?:[.,]\d+)?)?\s*["″]?/i
    );
    if (degMatch && (raw.includes("deg") || raw.includes("°") || raw.includes("'") || /[NSWEnswe]/.test(raw))) {
      const d = Number(String(degMatch[1]).replace(",", "."));
      const m = Number(String(degMatch[2] || "0").replace(",", "."));
      const s = Number(String(degMatch[3] || "0").replace(",", "."));
      return hemi * (d + m / 60 + s / 3600);
    }
    return parseFloatSafe(raw);
  }

  function parseOrientation(value) {
    if (value == null || value === "") return "";
    if (typeof value === "number" && value >= 1 && value <= 8) return String(value);
    const s = String(value).toLowerCase();
    const n = parseInt(s, 10);
    if (n >= 1 && n <= 8 && String(n) === s.trim()) return String(n);
    if (s.includes("rotate 180") || s.includes("180")) return "3";
    if (s.includes("270") || s.includes("ccw")) return "8";
    if (s.includes("90") || s.includes("cw")) return "6";
    if (s.includes("mirror horizontal") && s.includes("270")) return "5";
    if (s.includes("mirror") && s.includes("vertical")) return "4";
    if (s.includes("mirror")) return "2";
    if (s.includes("horizontal") || s.includes("normal")) return "1";
    if (n >= 1 && n <= 8) return String(n);
    return "";
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

  function apexAperture(fNumber) {
    // ApertureValue = 2 * log2(FNumber)
    if (!(fNumber > 0)) return null;
    return 2 * (Math.log(fNumber) / Math.log(2));
  }

  function apexShutter(exposureSec) {
    // ShutterSpeedValue = -log2(ExposureTime)
    if (!(exposureSec > 0)) return null;
    return -Math.log(exposureSec) / Math.log(2);
  }

  function parseGpsVersion(str) {
    if (!str) return [2, 3, 0, 0];
    const parts = String(str).split(/[.\s]+/).map((x) => parseInt(x, 10));
    while (parts.length < 4) parts.push(0);
    return parts.slice(0, 4).map((n) => (Number.isFinite(n) ? n : 0));
  }

  function parseGpsTime(str) {
    // "15:30:00" or "15:30:00.5"
    if (!str) return null;
    const m = String(str).trim().match(/^(\d{1,2}):(\d{1,2}):(\d{1,2}(?:\.\d+)?)/);
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const sec = Number(m[3]);
    return [
      [h, 1],
      [min, 1],
      floatToRational(sec, 1000),
    ];
  }

  function normalizeExifDate(str) {
    if (!str) return "";
    let s = String(str).trim();
    // ISO → EXIF
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      s = s.replace(/T/, " ").replace(/-/g, ":").replace(/\.\d+Z?$/, "").replace(/Z$/, "");
    }
    // "2024:08:10 18:30:00"
    if (/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}/.test(s)) return s.slice(0, 19);
    return s;
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
    state.decodedBlob = null;
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
    state.decodedBlob = null;
    state.buffer = await file.arrayBuffer();

    el.dropIdle.classList.add("hidden");
    el.dropActive.classList.remove("hidden");
    el.workPanel.classList.remove("hidden");
    el.fileName.textContent = file.name;
    const heic = isHeicLike(file, state.buffer);
    const label = heic ? "heic" : state.kind;
    el.fileInfo.textContent = `${formatBytes(file.size)} · ${file.type || "unknown type"} · ${label}`;

    setHint("");
    el.readStatus.textContent = "читаем…";
    // preview async (HEIC may need wasm decode)
    showPreview(file);

    try {
      const meta = await readMetadata(file, state.buffer);
      state.meta = meta;
      renderMeta(meta);
      fillForm(meta.flat);
      updateMapsLink();
      el.readStatus.textContent = `${Object.keys(meta.flat).length} полей · ${label}`;
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
    } else if (heic) {
      el.spoofNote.innerHTML =
        "HEIC/HEIF: теги читаются, пиксели декодируются в браузере → JPEG с новыми EXIF. Перекодирование включится автоматически.";
    } else if (isRawLike(file)) {
      el.spoofNote.innerHTML =
        "RAW: метаданные можно прочитать. Перекодирование пикселей в браузере не поддерживается — для подмены нужен JPEG.";
      el.applyBtn.disabled = true;
      el.stripBtn.disabled = true;
    } else if (state.kind === "image" && !isJpeg(file)) {
      el.spoofNote.innerHTML =
        "Файл не JPEG. Подмена: включи перекодирование в JPEG — новые EXIF-теги запишутся в выгрузку. Оригинал на диск не меняется.";
    } else {
      el.spoofNote.innerHTML =
        "Подмена EXIF пишется в <strong>JPEG</strong>. HEIC/PNG/WebP — через перекодирование. Видео — только чтение.";
    }
  }

  async function showPreview(file) {
    if (state.kind === "video") {
      const url = URL.createObjectURL(file);
      el.previewVid.hidden = false;
      el.previewVid.src = url;
      return;
    }

    if (state.kind !== "image") {
      el.previewFallback.classList.remove("hidden");
      el.previewFallback.textContent = "нет превью";
      return;
    }

    const tryUrl = (url) => {
      el.previewImg.hidden = false;
      el.previewFallback.classList.add("hidden");
      el.previewImg.src = url;
      el.previewImg.onerror = () => {
        el.previewImg.hidden = true;
        el.previewFallback.classList.remove("hidden");
        el.previewFallback.textContent = "превью недоступно\n(метаданные читаются)";
      };
    };

    // Direct preview for formats the browser can show
    if (!isHeicLike(file, state.buffer)) {
      tryUrl(URL.createObjectURL(file));
      return;
    }

    el.previewFallback.classList.remove("hidden");
    el.previewFallback.textContent = "декод HEIC…";
    try {
      const blob = await ensureDecodedRaster(file);
      tryUrl(URL.createObjectURL(blob));
    } catch {
      el.previewImg.hidden = true;
      el.previewFallback.classList.remove("hidden");
      el.previewFallback.textContent = "превью HEIC недоступно\n(метаданные читаются)";
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
      if (!input || value == null || value === "") return;
      if (input.tagName === "SELECT") {
        const str = String(value);
        // try exact option match first
        const opts = [...input.options].map((o) => o.value);
        if (opts.includes(str)) {
          input.value = str;
          return;
        }
      }
      input.value = serialize(value);
    };

    set("Make", get("Make"));
    set("Model", get("Model"));
    set("LensMake", get("LensMake"));
    set("LensModel", get("LensModel", "Lens"));
    set("Software", get("Software"));
    set("HostComputer", get("HostComputer"));
    set("BodySerialNumber", get("BodySerialNumber", "SerialNumber"));
    set("LensSerialNumber", get("LensSerialNumber"));

    set("DateTimeOriginal", get("DateTimeOriginal", "CreateDate", "DateCreated"));
    set("DateTimeDigitized", get("DateTimeDigitized", "DateTimeOriginal", "CreateDate"));
    set("DateTime", get("DateTime", "ModifyDate"));
    set("SubSecTimeOriginal", get("SubSecTimeOriginal", "SubsecTimeOriginal"));
    set("Artist", get("Artist", "Creator"));
    set("Copyright", get("Copyright", "Rights"));
    set("ImageDescription", get("ImageDescription", "Description", "Caption"));
    set("UserComment", get("UserComment", "Comment"));

    set("ISO", get("ISO", "ISOSpeedRatings", "PhotographicSensitivity"));
    // FNumber preferred over ApertureValue (APEX)
    const fnum = get("FNumber", "Aperture");
    if (fnum !== "") set("FNumber", fnum);
    const exp = get("ExposureTime");
    if (exp !== "") {
      set("ExposureTime", exp);
      set("ShutterSpeed", exp);
    } else if (get("ShutterSpeed") !== "") {
      set("ShutterSpeed", get("ShutterSpeed"));
      set("ExposureTime", get("ShutterSpeed"));
    }
    set("FocalLength", get("FocalLength"));
    set("FocalLengthIn35mmFilm", get("FocalLengthIn35mmFilm", "FocalLengthIn35mmFormat", "FocalLength35efl"));
    set("ExposureBiasValue", get("ExposureBiasValue", "ExposureCompensation"));
    set("BrightnessValue", get("BrightnessValue", "LightValue"));
    set("MaxApertureValue", get("MaxApertureValue"));
    set("DigitalZoomRatio", get("DigitalZoomRatio"));

    const ori = parseOrientation(get("Orientation"));
    if (ori) {
      const input = el.spoofForm.elements.namedItem("Orientation");
      if (input) input.value = ori;
    }

    set("ExposureProgram", get("ExposureProgram"));
    set("MeteringMode", get("MeteringMode"));
    set("Flash", get("Flash"));
    set("WhiteBalance", get("WhiteBalance"));
    set("ColorSpace", get("ColorSpace"));
    set("SceneCaptureType", get("SceneCaptureType"));
    set("ExposureMode", get("ExposureMode"));
    set("SensingMethod", get("SensingMethod"));

    set("PixelXDimension", get("PixelXDimension", "ExifImageWidth", "ImageWidth"));
    set("PixelYDimension", get("PixelYDimension", "ExifImageHeight", "ImageHeight"));
    set("XResolution", get("XResolution"));
    set("YResolution", get("YResolution"));
    set("ResolutionUnit", get("ResolutionUnit"));
    set("ExifVersion", get("ExifVersion"));

    const lat = parseGpsToDecimal(get("latitude", "GPSLatitude", "Latitude"));
    const lon = parseGpsToDecimal(get("longitude", "GPSLongitude", "Longitude"));
    const alt = parseFloatSafe(get("GPSAltitude", "altitude"));
    if (lat != null) set("GPSLatitude", Math.round(lat * 1e7) / 1e7);
    if (lon != null) set("GPSLongitude", Math.round(lon * 1e7) / 1e7);
    if (alt != null) set("GPSAltitude", alt);

    const latRef = get("GPSLatitudeRef");
    const lonRef = get("GPSLongitudeRef");
    const altRef = get("GPSAltitudeRef");
    if (latRef !== "") set("GPSLatitudeRef", String(latRef).charAt(0).toUpperCase());
    if (lonRef !== "") set("GPSLongitudeRef", String(lonRef).charAt(0).toUpperCase());
    if (altRef !== "" && altRef != null) {
      const ar = String(altRef).toLowerCase();
      set("GPSAltitudeRef", ar.includes("below") || ar === "1" ? "1" : "0");
    }

    set("GPSImgDirection", get("GPSImgDirection", "GPSImgDirection"));
    set("GPSSpeed", get("GPSSpeed"));
    set("GPSDateStamp", get("GPSDateStamp"));
    set("GPSTimeStamp", get("GPSTimeStamp"));
    set("GPSMapDatum", get("GPSMapDatum"));
    set("GPSVersionID", get("GPSVersionID"));
  }

  function updateMapsLink() {
    const lat = parseGpsToDecimal(el.spoofForm.elements.GPSLatitude.value);
    const lon = parseGpsToDecimal(el.spoofForm.elements.GPSLongitude.value);
    if (lat != null && lon != null) {
      el.mapsLink.hidden = false;
      el.mapsLink.href = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;
    } else {
      el.mapsLink.hidden = true;
    }
  }

  el.spoofForm.addEventListener("input", (e) => {
    if (e.target.name && String(e.target.name).startsWith("GPS")) {
      if (e.target.value) state.clearGps = false;
      updateMapsLink();
    }
  });

  el.clearGpsBtn.addEventListener("click", () => {
    [
      "GPSLatitude", "GPSLatitudeRef", "GPSLongitude", "GPSLongitudeRef",
      "GPSAltitude", "GPSAltitudeRef", "GPSImgDirection", "GPSSpeed",
      "GPSDateStamp", "GPSTimeStamp", "GPSMapDatum", "GPSVersionID",
    ].forEach((name) => {
      const input = el.spoofForm.elements.namedItem(name);
      if (input) input.value = "";
    });
    state.clearGps = true;
    updateMapsLink();
    setHint("GPS будет убран при сохранении", "ok");
  });

  // presets
  $$("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.preset;
      if (key === "wipe") {
        el.spoofForm.reset();
        state.clearGps = false;
        setHint("поля очищены", "ok");
        return;
      }
      const preset = PRESETS[key];
      if (!preset) return;
      for (const [name, value] of Object.entries(preset)) {
        const input = el.spoofForm.elements.namedItem(name);
        if (input) input.value = value;
      }
      // fill dates with now if empty
      const now = new Date();
      const p = (n) => String(n).padStart(2, "0");
      const stamp = `${now.getFullYear()}:${p(now.getMonth() + 1)}:${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
      ["DateTimeOriginal", "DateTimeDigitized", "DateTime"].forEach((name) => {
        const input = el.spoofForm.elements.namedItem(name);
        if (input && !input.value) input.value = stamp;
      });
      setHint(`пресет «${key}» применён — даты/GPS можно поправить`, "ok");
    });
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

  function setIfInt(dict, tag, raw) {
    if (raw === "" || raw == null) return;
    const n = parseInt(raw, 10);
    if (Number.isFinite(n)) dict[tag] = n;
  }

  function setIfStr(dict, tag, raw) {
    if (raw === "" || raw == null) return;
    dict[tag] = String(raw);
  }

  function buildExifObj(values) {
    if (typeof piexif === "undefined") throw new Error("piexif не загрузился");

    const z = {};
    const e = {};
    const g = {};

    // —— 0th IFD ——
    setIfStr(z, piexif.ImageIFD.Make, values.Make);
    setIfStr(z, piexif.ImageIFD.Model, values.Model);
    setIfStr(z, piexif.ImageIFD.Software, values.Software);
    setIfStr(z, piexif.ImageIFD.Artist, values.Artist);
    setIfStr(z, piexif.ImageIFD.Copyright, values.Copyright);
    setIfStr(z, piexif.ImageIFD.ImageDescription, values.ImageDescription);
    if (values.HostComputer && piexif.ImageIFD.HostComputer != null) {
      setIfStr(z, piexif.ImageIFD.HostComputer, values.HostComputer);
    }

    const dt = normalizeExifDate(values.DateTime);
    const dto = normalizeExifDate(values.DateTimeOriginal);
    const dtd = normalizeExifDate(values.DateTimeDigitized || values.DateTimeOriginal || values.DateTime);
    if (dt) z[piexif.ImageIFD.DateTime] = dt;
    setIfInt(z, piexif.ImageIFD.Orientation, values.Orientation);

    const xRes = parseFloatSafe(values.XResolution);
    const yRes = parseFloatSafe(values.YResolution);
    if (xRes != null) z[piexif.ImageIFD.XResolution] = floatToRational(xRes, 10000);
    if (yRes != null) z[piexif.ImageIFD.YResolution] = floatToRational(yRes, 10000);
    setIfInt(z, piexif.ImageIFD.ResolutionUnit, values.ResolutionUnit);

    // —— Exif IFD ——
    if (dto) e[piexif.ExifIFD.DateTimeOriginal] = dto;
    if (dtd) e[piexif.ExifIFD.DateTimeDigitized] = dtd;
    setIfStr(e, piexif.ExifIFD.LensMake, values.LensMake);
    setIfStr(e, piexif.ExifIFD.LensModel, values.LensModel);
    setIfStr(e, piexif.ExifIFD.BodySerialNumber, values.BodySerialNumber);
    setIfStr(e, piexif.ExifIFD.LensSerialNumber, values.LensSerialNumber);
    setIfStr(e, piexif.ExifIFD.SubSecTimeOriginal, values.SubSecTimeOriginal);

    if (values.UserComment) {
      // piexif UserComment: ASCII prefix + text
      e[piexif.ExifIFD.UserComment] = values.UserComment;
    }

    if (values.ExifVersion) {
      // "0232" → bytes
      const ver = String(values.ExifVersion).replace(/\D/g, "").padEnd(4, "0").slice(0, 4);
      e[piexif.ExifIFD.ExifVersion] = ver;
    }

    const iso = parseInt(values.ISO, 10);
    if (Number.isFinite(iso)) e[piexif.ExifIFD.ISOSpeedRatings] = iso;

    const fnum = parseFloatSafe(values.FNumber);
    if (fnum != null && fnum > 0) {
      e[piexif.ExifIFD.FNumber] = floatToRational(fnum, 10000);
      const av = apexAperture(fnum);
      if (av != null) e[piexif.ExifIFD.ApertureValue] = floatToRational(av, 100000);
    }

    const expStr = values.ExposureTime || values.ShutterSpeed;
    const expRat = parseExposure(expStr);
    if (expRat) {
      e[piexif.ExifIFD.ExposureTime] = expRat;
      const expSec = expRat[0] / expRat[1];
      const sv = apexShutter(expSec);
      if (sv != null) e[piexif.ExifIFD.ShutterSpeedValue] = floatToRational(sv, 100000);
    }

    const fl = parseFloatSafe(values.FocalLength);
    if (fl != null) e[piexif.ExifIFD.FocalLength] = floatToRational(fl, 10000);

    setIfInt(e, piexif.ExifIFD.FocalLengthIn35mmFilm, values.FocalLengthIn35mmFilm);

    const bias = parseFloatSafe(values.ExposureBiasValue);
    if (bias != null) e[piexif.ExifIFD.ExposureBiasValue] = floatToRational(bias, 1000);

    const bright = parseFloatSafe(values.BrightnessValue);
    if (bright != null) e[piexif.ExifIFD.BrightnessValue] = floatToRational(bright, 10000);

    // MaxApertureValue can be f-number or already APEX — if looks like f-stop (< 32), convert
    const maxAp = parseFloatSafe(values.MaxApertureValue);
    if (maxAp != null) {
      const apex = maxAp > 0 && maxAp < 32 ? apexAperture(maxAp) : maxAp;
      if (apex != null) e[piexif.ExifIFD.MaxApertureValue] = floatToRational(apex, 100000);
    }

    const zoom = parseFloatSafe(values.DigitalZoomRatio);
    if (zoom != null) e[piexif.ExifIFD.DigitalZoomRatio] = floatToRational(zoom, 10000);

    setIfInt(e, piexif.ExifIFD.ExposureProgram, values.ExposureProgram);
    setIfInt(e, piexif.ExifIFD.MeteringMode, values.MeteringMode);
    setIfInt(e, piexif.ExifIFD.Flash, values.Flash);
    setIfInt(e, piexif.ExifIFD.WhiteBalance, values.WhiteBalance);
    setIfInt(e, piexif.ExifIFD.ColorSpace, values.ColorSpace);
    setIfInt(e, piexif.ExifIFD.SceneCaptureType, values.SceneCaptureType);
    setIfInt(e, piexif.ExifIFD.ExposureMode, values.ExposureMode);
    setIfInt(e, piexif.ExifIFD.SensingMethod, values.SensingMethod);
    setIfInt(e, piexif.ExifIFD.PixelXDimension, values.PixelXDimension);
    setIfInt(e, piexif.ExifIFD.PixelYDimension, values.PixelYDimension);

    // —— GPS IFD ——
    const lat = parseGpsToDecimal(values.GPSLatitude);
    const lon = parseGpsToDecimal(values.GPSLongitude);
    const alt = parseFloatSafe(values.GPSAltitude);
    const hasGps =
      !state.clearGps &&
      (lat != null || lon != null || alt != null || values.GPSDateStamp || values.GPSTimeStamp);

    if (hasGps && lat != null && lon != null) {
      g[piexif.GPSIFD.GPSVersionID] = parseGpsVersion(values.GPSVersionID);
      const latRef =
        values.GPSLatitudeRef || (lat >= 0 ? "N" : "S");
      const lonRef =
        values.GPSLongitudeRef || (lon >= 0 ? "E" : "W");
      g[piexif.GPSIFD.GPSLatitudeRef] = latRef;
      g[piexif.GPSIFD.GPSLatitude] = degToDmsRational(lat);
      g[piexif.GPSIFD.GPSLongitudeRef] = lonRef;
      g[piexif.GPSIFD.GPSLongitude] = degToDmsRational(lon);

      if (alt != null) {
        let altRef = values.GPSAltitudeRef;
        if (altRef === "") altRef = alt >= 0 ? "0" : "1";
        g[piexif.GPSIFD.GPSAltitudeRef] = parseInt(altRef, 10) || 0;
        g[piexif.GPSIFD.GPSAltitude] = floatToRational(Math.abs(alt), 1000);
      }

      const dir = parseFloatSafe(values.GPSImgDirection);
      if (dir != null) {
        g[piexif.GPSIFD.GPSImgDirectionRef] = "T";
        g[piexif.GPSIFD.GPSImgDirection] = floatToRational(dir, 1000);
      }
      const speed = parseFloatSafe(values.GPSSpeed);
      if (speed != null) {
        g[piexif.GPSIFD.GPSSpeedRef] = "K";
        g[piexif.GPSIFD.GPSSpeed] = floatToRational(speed, 1000);
      }
      if (values.GPSDateStamp) {
        // YYYY:MM:DD
        let ds = values.GPSDateStamp.replace(/-/g, ":");
        if (/^\d{4}:\d{2}:\d{2}/.test(ds)) g[piexif.GPSIFD.GPSDateStamp] = ds.slice(0, 10);
      }
      const ts = parseGpsTime(values.GPSTimeStamp);
      if (ts) g[piexif.GPSIFD.GPSTimeStamp] = ts;
      if (values.GPSMapDatum) g[piexif.GPSIFD.GPSMapDatum] = values.GPSMapDatum;
    } else if (!state.clearGps && (lat != null) !== (lon != null)) {
      throw new Error("GPS: укажи и широту, и долготу");
    }

    return { "0th": z, Exif: e, GPS: g, "1st": {}, thumbnail: null };
  }

  async function fileToJpegDataUrl(file) {
    if (isJpeg(file) && !el.reencodeCheck.checked) {
      return blobToDataUrl(file);
    }

    // HEIC and other non-JPEG: decode → JPEG data URL
    if (!isJpeg(file) || el.reencodeCheck.checked) {
      if (!isJpeg(file)) el.reencodeCheck.checked = true;
      const blob = await ensureDecodedRaster(file);
      // If cache is already JPEG from heic2any / canvas, use it directly
      if (blob.type === "image/jpeg" || blob.type === "image/jpg") {
        return blobToDataUrl(blob);
      }
      // safety: re-encode whatever we got
      const bmp = await createImageBitmap(blob);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = bmp.width;
        canvas.height = bmp.height;
        canvas.getContext("2d").drawImage(bmp, 0, 0);
        const q = Math.min(1, Math.max(0.5, Number(el.jpegQuality.value) || 0.92));
        return canvas.toDataURL("image/jpeg", q);
      } finally {
        if (bmp.close) bmp.close();
      }
    }

    return blobToDataUrl(file);
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
      if (isRawLike(state.file)) {
        throw new Error("RAW нельзя перекодировать в браузере. Экспортируй JPEG и подмени EXIF уже на нём.");
      }
      const values = formValues();
      if (!isJpeg(state.file)) el.reencodeCheck.checked = true;
      if (!isJpeg(state.file) && !el.reencodeCheck.checked) {
        throw new Error("Для не-JPEG включи перекодирование в JPEG");
      }

      setHint(isHeicLike(state.file, state.buffer) ? "декодируем HEIC → JPEG…" : "собираем jpeg…");
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
      if (isRawLike(state.file)) {
        throw new Error("RAW нельзя перекодировать в браузере.");
      }
      let dataUrl;
      if (isJpeg(state.file) && !el.reencodeCheck.checked) {
        dataUrl = stripDataUrl(await fileToJpegDataUrl(state.file));
      } else {
        el.reencodeCheck.checked = true;
        setHint(isHeicLike(state.file, state.buffer) ? "декодируем HEIC…" : "перекодируем…");
        // decoded raster has no original EXIF container tags
        const blob = await ensureDecodedRaster(state.file);
        dataUrl = await blobToDataUrl(blob);
        // ensure pure JPEG without leftover APP1 if any
        if (blob.type === "image/jpeg") {
          try {
            dataUrl = stripDataUrl(dataUrl);
          } catch {
            /* already clean from canvas/heic path */
          }
        }
      }

      const out = dataUrlToBlob(dataUrl);
      downloadBlob(out, `${baseName(state.file.name)}_clean.jpg`);
      setHint(`метаданные сняты · ${formatBytes(out.size)}`, "ok");
    } catch (err) {
      console.error(err);
      setHint(err.message || String(err), "err");
    } finally {
      el.stripBtn.disabled = false;
    }
  });
})();
