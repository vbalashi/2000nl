const path = require("node:path");

const fontFile = (name) => path.join(__dirname, "fonts", name);

module.exports = {
  "https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap": `
    @font-face {
      font-family: 'Inter';
      font-style: normal;
      font-weight: 100 900;
      font-display: swap;
      src: url(${fontFile("inter-latin-variable.woff2")}) format('woff2');
      unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
    }
    @font-face {
      font-family: 'Inter';
      font-style: normal;
      font-weight: 100 900;
      font-display: swap;
      src: url(${fontFile("inter-cyrillic-variable.woff2")}) format('woff2');
      unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116;
    }
  `,
  "https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,200..800;1,200..800&display=swap": `
    @font-face {
      font-family: 'Newsreader';
      font-style: normal;
      font-weight: 200 800;
      font-display: swap;
      src: url(${fontFile("newsreader-latin-variable.woff2")}) format('woff2');
    }
    @font-face {
      font-family: 'Newsreader';
      font-style: italic;
      font-weight: 200 800;
      font-display: swap;
      src: url(${fontFile("newsreader-latin-italic-variable.woff2")}) format('woff2');
    }
  `,
};
