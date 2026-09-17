# File Converter

A private, browser-based converter hosted on Cloudflare Workers Static Assets. File contents never leave the device. No account, cloud storage backend, API key, or paid conversion provider is required. Converted files can be saved explicitly in a device-local library.

## Supported formats

Exactly ten formats: **PDF, DOCX, Markdown, TXT, HTML, CSV, JSON, JPG, PNG, WebP**. This is a practical selection of common document, data, and image formats, not a measured popularity ranking. JPEG/Markdown/HTM filename aliases count as the same formats.

| Input                     | Outputs                                     |
| ------------------------- | ------------------------------------------- |
| PDF                       | DOCX, Markdown, TXT, HTML, JPG, PNG, WebP   |
| DOCX, Markdown, TXT, HTML | Other formats in this group, plus PDF       |
| CSV                       | JSON, TXT, Markdown, HTML, PDF, DOCX        |
| JSON                      | CSV, TXT, Markdown, HTML, PDF, DOCX         |
| JPG, PNG, WebP            | Other image formats in this group, plus PDF |

44 supported conversion paths. Output selectors expose only compatible formats.

## Run and validate

Node.js 22.13+ or 24+; current Chrome, Edge, Firefox, or Safari. Tests use installed Google Chrome.

```sh
npm ci
npm run dev
npm run build
npm test
npm audit
```

Before installing packages in this repository, follow the package validator requirement in AGENTS.md. Versions are pinned in package-lock.json. Playwright integration tests cover every offered path, actual PDF/DOCX round trips, images, CSV formula protection, malformed inputs, resource limits, HTML sanitization and desktop/mobile UI behavior.

## Deploy

```sh
npx wrangler whoami
npm run deploy
```

If unauthenticated, run `npx wrangler login` locally. CI can use a least-privilege `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` stored as secrets. Never commit tokens. The Wrangler configuration publishes only `dist/`, not source, tests, local tool configuration or credentials. Roll back with `npx wrangler rollback` after inspecting `npx wrangler deployments list`.

## Architecture and privacy

TypeScript/Vite serves a small initial interface; format engines load on demand. PDF.js reads/renders PDFs, Mammoth reads Word, docx writes Word, pdf-lib/fontkit writes PDF, and the browser decodes/encodes images. DOMPurify strips active HTML content. Fonts and libraries are served from the same deployment. There is no analytics, file upload endpoint, or service worker. localStorage holds only the selected display theme; saved file contents remain in IndexedDB. Cloudflare receives normal site requests and request metadata, but no file contents.

Source adapters produce sanitized document blocks or tabular rows, then output adapters serialize supported targets. Download object URLs are revoked on file/format changes, removal, or page exit. Only one conversion runs at a time. Cancel discards results and waits for ongoing parsing to finish; it does not forcibly interrupt synchronous library code.

`public/_headers` supplies CSP, frame restrictions, MIME sniffing protection, referrer restrictions and permissions policy. Reader documents are inserted only after allowlist sanitization; text and table cells use textContent. Scripts, styles, links, embeds and user attributes are removed before rendering. HTML downloads contain sanitized static content and a restrictive CSP. CSV exports escape formula-like cells. No server authentication, tenant database, or conversion API exists, so those attack surfaces are absent.

## Fidelity and limits

- Document conversions preserve text/basic structure, not exact layout. Embedded media, styling, comments, and original pagination may be omitted. DOCX output retains headings but not inline emphasis. Tables become text rows in PDF/DOCX/TXT.
- PDF extraction needs selectable text. No OCR. Scanned-only PDFs can export to images. Mixed PDFs report omitted textless pages. Password-protected PDFs must be unlocked first.
- PDF image export creates one download per page. JPEG uses a white background; animated images export their first frame. Image-to-PDF uses A4 with margins.
- PDF generation uses bundled Noto Sans (Latin, Greek and Cyrillic coverage). Unsupported glyphs produce an error; use DOCX/HTML to preserve other scripts.
- Inputs: 20 MB. Text: one million characters. DOCX archive: 2,000 entries, 40 MB total expanded data, 20 MB per entry, bounded compression ratios. ZIP64/encryption are unsupported.
- Images: 24 megapixels. PDF text: 200 pages; PDF images: 30 pages and 100 MB combined output. Tables: 20,000 data rows and 200 columns.
- CSV's first row must have unique, nonempty headers. CSV-to-JSON preserves strings. JSON must be a nonempty array of objects; nested values become JSON text and missing/null cells become empty strings.
- Parsing uses device memory; file limits reduce resource risk but are not a hard process-memory sandbox. Large hostile files can still stress the tab. Browser-native image decoding occurs before dimensions can be inspected.

## Licenses

Project license: LICENSE. Noto Sans is distributed under SIL Open Font License in `public/fonts/LICENSE.txt`; obtained from the official notofonts/noto-fonts repository. Inter is distributed by @fontsource/inter under OFL. Conversion dependencies retain their respective licenses in installed packages.

## Native readers and saved files

Use **Read selected file** before converting, **Read file** beside a converted download, or **Read** in the saved library. PDFs render one page at a time with previous/next controls, render-size selection, and a selectable text disclosure. Images retain their aspect ratio. Word, Markdown and HTML have sanitized reading views; Word previews retain text and tables but omit images and exact layout. Plain text and formatted JSON support copying. CSV previews show the first 500 data rows and up to 200 columns, with truncation disclosed. The JSON reader accepts any valid JSON value, independent of the converter's array-of-objects restriction.

**Save to library** stores a converted Blob and its metadata in IndexedDB on the current HTTPS origin. The library survives page reloads and browser restarts in the same browser profile. It does not sync across devices. Anyone using that profile can access saved files; the application does not add account authentication or application-level encryption. Browser/OS storage protections apply. Clearing site data or closing a private-browsing session may remove files. Browser eviction remains possible unless the browser grants the user-initiated persistent-storage request; even then clearing site data removes the library. Keep downloaded backups.

Storage schema v1 uses separate metadata and Blob stores. Saves and deletes commit both stores in one transaction. SHA-256 content plus filename identifies saves, so retries and concurrent tab saves do not duplicate or overwrite files with other names. Limits: 200 files, 200 MB total, 100 MB per saved file. Quota/permission failures preserve existing files and leave downloads available. Metadata listing avoids loading all Blob contents. BroadcastChannel refreshes other open tabs after writes; a manual refresh is also available. A blocked database upgrade fails with recovery guidance. Future schema changes must increment the version and migrate existing stores without deleting user data.

Tests cover every reader, PDF navigation, sanitization/no external resource loads, explicit saving, reload and browser-restart persistence, concurrent-save deduplication, deletion, and storage denial. `node scripts/smoke-deployment.mjs https://file-converter.bmorris0565.workers.dev` exercises the deployed converter; browser integration tests exercise storage and previews.

## Display theme

Use the moon button / **Dark mode** switch in the header. On the first visit the app follows the device color scheme and responds to device-theme changes. An explicit light/dark choice is saved locally and synchronized across open tabs. If browser storage is blocked, the switch works for the current visit. A same-origin script applies the theme before the page renders without weakening CSP. PDF pages and images keep their original colors; document reading views follow the interface theme.
