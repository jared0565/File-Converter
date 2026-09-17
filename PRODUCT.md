# File Converter

<!-- impeccable:product-schema 1 -->

## Platform

web

## Purpose

Convert common documents and images, including PDF, Markdown and Word in both directions. Deploy on Cloudflare from jared0565/File-Converter.

## Assumptions

General-purpose personal and office use. Ten selected formats: PDF, DOCX, Markdown, TXT, HTML, CSV, JSON, JPG, PNG, WebP. These are a practical selection, not a measured popularity ranking. Browser-local processing protects file contents. Layout fidelity and OCR are outside the initial scope.

## Stack

Engineering choice: TypeScript and Vite, static Cloudflare Workers hosting. No file storage or conversion API.

## Reader and library workflows

Users can read all ten supported formats before or after conversion and reopen saved results. Saved files persist locally in IndexedDB in the same browser profile, with explicit saves, downloads and confirmed deletes. Persistence protection is requested by the user and depends on the browser. This is device-local storage, not cloud sync; clearing site data can remove files. Reader layouts prioritize safe readable content over exact Word/HTML fidelity.
