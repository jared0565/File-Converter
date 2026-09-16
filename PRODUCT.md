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
