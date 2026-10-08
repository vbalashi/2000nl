# PWA asset source (#630)

`index.html` renders the approved identity using the same Inter Latin variable font bundled by Next.js for the app (Google Fonts / Inter, SIL OFL). Serve this directory locally, open in a browser, wait for fonts, and export the PNG source images in `img[data-export]`. They include the versioned any/maskable/monochrome/Apple icons and fixed iOS startup dimensions. Generate the favicon from the 512 PNG at 16/32/48 px. Sources are rectangular, never pre-rounded; the preview masks are illustrative. Native splash is fixed neutral, not driven by cookies.
