# Word Build - Connected (Offline-first WebView bundle)

## Files
- index.html
- styles.css
- app.js
- confetti.browser.min.js (placeholder in this zip)

## How to use in Android WebView
Place the folder contents into:
`app/src/main/assets/`

Then load:
`file:///android_asset/index.html`

## Confetti
Replace `confetti.browser.min.js` with the real file from:
https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js

## Offline dictionary/words (optional)
You can embed JSON directly inside `index.html`:
- `<script id="embedded-words" type="application/json">[...]</script>`
- `<script id="embedded-dict"  type="application/json">{...}</script>`
