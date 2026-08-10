# exif-lab

Чтение и подмена метаданных прямо в браузере. Без сервера, без аккаунта.

**Live:** https://stillemptynow.github.io/exif-lab/

## Что умеет

- **Чтение** EXIF / XMP / IPTC / GPS у JPEG, PNG, WebP, HEIC/HEIF, TIFF, AVIF и соседних контейнеров
- **Видео** — контейнерные поля через MediaInfo (codec, duration, dates, tracks)
- **Подмена EXIF** — запись тегов в JPEG (камера, даты, GPS, ISO, выдержка и т.д.)
- **Очистка** — снять метаданные и скачать чистый JPEG
- Файлы никуда не уходят: всё локально

## Ограничения

| Формат | Чтение | Подмена |
|--------|--------|---------|
| JPEG | да | да |
| PNG / WebP / AVIF | да* | через перекодирование в JPEG |
| HEIC / HEIF | да | да (декод libheif/wasm → JPEG + EXIF) |
| RAW (CR2/NEF/ARW…) | теги, если парсер видит | нет (нужен экспорт в JPEG) |
| Видео (MP4, MOV, WebM…) | да | нет (нужен перекод контейнера) |

\*насколько позволяет контейнер

## Стек

- [exifr](https://github.com/MikeKovarik/exifr) — парсинг
- [piexifjs](https://github.com/hMatoba/piexifjs) — запись EXIF в JPEG
- [heic2any](https://github.com/alexcorvi/heic2any) — декод HEIC/HEIF
- [mediainfo.js](https://github.com/buzz/mediainfo.js) — видео

## Локально

```bash
npx serve .
```

## License

MIT
