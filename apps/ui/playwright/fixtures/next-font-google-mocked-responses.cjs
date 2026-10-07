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
