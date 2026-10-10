# BookNest — shared pink e-book library

Features: responsive pink aesthetic, search and genre filters, favorites, public book catalog, PDF/EPUB/TXT uploads, original-file reading/downloading, browser-saved favorites, demo public-domain classics, and a private upload key.

## Run locally

Requires Node.js 20 or newer.

1. Open a terminal in this folder and run `npm install`.
2. Set a private upload key in your terminal, then start the app.

**Windows PowerShell:**

```powershell
$env:UPLOAD_KEY="replace-this-with-a-long-random-secret"
npm start
```

**macOS/Linux:**

```bash
UPLOAD_KEY="replace-this-with-a-long-random-secret" npm start
```

3. Visit `http://localhost:3000`.
4. Click the pink `+` button to open the upload form. Enter the same `UPLOAD_KEY` value.

Uploaded books are stored in `STORAGE_DIR` (defaults to `./storage`). The browser must access the website through the Node server; opening `index.html` as a `file://` page will not enable shared uploads.

## Deploy for everyone

Deploy the entire project to a Node.js host that supports persistent disk storage. Configure the environment variable `UPLOAD_KEY` to a long random secret. Configure `STORAGE_DIR` to a persistent disk mount path supplied by the host. Do not commit the upload key or `.env` file to GitHub.

The catalog and uploaded files are shared through the server. Favorites and demo reading progress are saved in each visitor's own browser. The upload key is an owner-only shared secret, not a full user-account system; do not share it with ordinary visitors. For a public production service, consider adding owner authentication, moderation, backups, and a managed database/object-storage service.

## Important

- Uploads are limited to PDF, EPUB, and TXT, maximum 50 MB each.
- Uploaded files are public to anyone who can access the site. Only upload files you created, own, or have permission to distribute. Public-domain status can vary by country.
- This demo does not include user accounts, paid books, DRM, or a virus-scanning service. File extension checks are not a guarantee that uploaded files are safe.
- EPUB reading uses EPUB.js and JSZip from a public CDN; an internet connection is needed for those libraries. PDF reading uses the browser's built-in PDF support.
