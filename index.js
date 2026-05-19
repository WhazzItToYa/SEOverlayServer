const URL_PARAMS = new URLSearchParams(window.location.search);
const SB_HOST = URL_PARAMS.get('host') ?? "127.0.0.1";
const SB_PORT = URL_PARAMS.get('port') ?? 8080;
const SB_ENDPOINT = URL_PARAMS.get('endpoint') ?? "/";
const EXPORT_ROOT_DEFAULT = "ExportedOverlays";
const EXPORT_ROOT = URL_PARAMS.get('root') ?? EXPORT_ROOT_DEFAULT;
const OVERLAY = URL_PARAMS.get('overlay');
const DISPLAY_ONLY = URL_PARAMS.get('display') === "true";
const OVERLAY_ROOT = `${EXPORT_ROOT}/overlays`;
const OVERLAY_PATH = `${OVERLAY_ROOT}/${OVERLAY}.json`;

console.log("Running");
if (OVERLAY) {
    loadOverlay();
} else {
    showCatalog();
}

async function showCatalog() {
    console.log("Displaying catalog");
    const container = document.getElementById("catalog");
    const templateItem = document.getElementById("catalogTemplate");
    container.style.display="block";
    const index = await (await fetch(`${OVERLAY_ROOT}/index.json`)).json();
    for (const overlay of index) {
        // Clone a template element to display the details
        const item = templateItem.cloneNode(true);
        if (overlay.favorite) item.classList.add("favorite");
        item.id = overlay._id;

        // Create a link to the live overlay
        const a = item.querySelector("a");
        const encodedName = encodeURIComponent(overlay.name);
        a.href = `index.html?root=${EXPORT_ROOT}&overlay=${encodedName}`;
        a.innerText = overlay.name;

        // put a link next to it to view the overlay source
        const viewer = a.cloneNode(true);
        viewer.href = `index.html?root=${EXPORT_ROOT}&display=true&overlay=${encodedName}`;
        viewer.innerText = "\u{1F50D}";
        a.insertAdjacentElement('afterend', viewer);
        
        templateItem.insertAdjacentElement('beforebegin', item);
    }
    templateItem.parentElement.removeChild(templateItem);
}

async function loadOverlay() {
    console.log("Showing overlay");
    const overlayInfo = await (await fetch(OVERLAY_PATH)).json();

    const widget = overlayInfo.widgets[0];
    console.log("widget: ", widget);
    
    const assetMap = await loadAssetManifest(`${OVERLAY_ROOT}/assets/asset-manifest.json`);
    const widgetData = replaceAssetValues(widget.variables.fieldData, assetMap);
    const widgetHtml = replaceFieldData(replaceAssets(widget.variables.html, assetMap), widgetData);
    const rawWidgetCss = replaceFieldData(replaceAssets(widget.variables.css, assetMap), widgetData);
    const widgetCss = await inlineCssImports(rawWidgetCss);
    const widgetJs = replaceJsFieldData(replaceAssets(widget.variables.js, assetMap), widgetData);

    const left = convertToPx(widget.css.left);
    const top = convertToPx(widget.css.top);
    const width = convertToPx(widget.css.width);
    const height = convertToPx(widget.css.height);

    const html = `
<!DOCTYPE html>
<html>
    <head>
	<meta charset="UTF-8">
	<!-- Scripts -->
        <script src="https://code.jquery.com/jquery-3.3.1.min.js" integrity="sha256-FgpCb/KJQlLNfOu91ta32o/NMZxltwRo8QtmkMRdAu8=" crossorigin="anonymous"></script>
        <script type="text/javascript" src="https://unpkg.com/@streamerbot/client/dist/streamerbot-client.js"></script>
        
        <!-- CSS -->
        <style>/* --- [Globals] --- */
        ${widgetCss}
	    body {
                width: ${width};
                height: ${height};
		margin: 0;
		overflow: hidden;
	    }
      </style>
  </head>
  <body>
      ${widgetHtml}

      <script>
        let _WIDGET_DATA = {
            "streamerbotClient": {
                "host": "${SB_HOST}",
                "port": ${SB_PORT},
                "endpoint": "${SB_ENDPOINT}"
            },
            "currency": {
                "name": "U.S. Dollar",
                "code": "USD",
                "symbol": "$"
            },
            "fieldData": ${JSON.stringify(widgetData)},
            "overlay": {
                "isEditorMode": false,
                "muted": false
            }
        };

      </script>
      <script type="text/javascript" src="se-compat.js"></script>
      <script>
        ${widgetJs}
      </script>
  </body>
</html>
`
    if (DISPLAY_ONLY) {
        const pre = document.createElement("pre");
        pre.textContent = html;
        document.body.appendChild(pre);
    } else {
        document.body.style.width = convertToPx(overlayInfo?.settings?.width ?? "1920px");
        document.body.style.height = convertToPx(overlayInfo?.settings?.height ?? "1080px");
        
        const iframe = document.createElement("iframe")
        iframe.id = "content";
        iframe.style.position = "absolute";
        iframe.style.left = left;
        iframe.style.top = top;
        iframe.style.width = width;
        iframe.style.height = height;
        
        document.body.appendChild(iframe);
        const doc = iframe.contentDocument;
        doc.open();
        doc.write(html);
        doc.close();
    }
}

// Replaces {{KEY}} with the value for KEY
function replaceFieldData(template, values) {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
        return key in values ? values[key] : match;
    });
}

// Replaces {KEY} with the value for KEY, in a javascritp document.
function replaceJsFieldData(template, values) {
    return template.replace(/(?<!\$)\{([^}]+)\}/g, (match, key) => {
        return key in values ? values[key] : match;
    });
}

// Converts a number into a number of pixels.
function convertToPx(val) {
    const r = _convertToPx(val);
    console.log(`Converted '${val}' to '${r}'`);
    return r;
}
    
function _convertToPx(val) {
    if (val === null || val === "") return "0px";
    if (/px$/.test(val)) return val;
    return `${val}px`;
}

// CSS in a null-origin document cannot import other css, so
// if there are any CSS @imports, fetch and inline them here.
async function inlineCssImports(cssText, fetchFn = fetch) {
    const importRegex = /@import\s+(?:url\()?['"]?([^'")]+)['"]?\)?\s*;/g;

    async function process(css) {
        let match;
        let result = css;

        // Collect all imports first to avoid messing up indices while replacing
        const imports = [];
        while ((match = importRegex.exec(css)) !== null) {
            imports.push({
                fullMatch: match[0],
                url: match[1]
            });
        }

        // Inline each import
        for (const imp of imports) {
            let importedCss = "";

            try {
                const response = await fetchFn(imp.url);
                importedCss = await response.text();

                // Recursively inline imports inside the imported CSS
                importedCss = await process(importedCss);
            } catch (err) {
                console.warn("Failed to inline CSS import:", imp.url, err);
                // Leave the @import as-is if fetch fails
                continue;
            }

            // Replace the @import rule with the actual CSS
            result = result.replace(imp.fullMatch, importedCss);
        }

        return result;
    }

    return process(cssText);
}

// Loads the asset manifest and returns it as a map of originalUrl --> newUrl
async function loadAssetManifest(path)
{
    let manifest = await (await fetch(path)).json();
    return Object.fromEntries(
        Object.entries(manifest).map(([filename, obj]) => [
            obj.originalUrl,
            `${OVERLAY_ROOT}/assets/${filename}`
        ])
    );
}

// Replaces any field which is an asset in the assetMap, with its new url
function replaceAssetValues(fields, assetMap) {
    const result = {};

    for (const [key, value] of Object.entries(fields)) {
        result[key] = value in assetMap ? assetMap[value] : value;
    }

    return result;
}

// Replaces any substring in SOURCE matching an asset in the assetMap, with its mapped URL.
function replaceAssets(source, assetMap) {
    // Escape regex special characters in keys
    const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Sort keys longest-first to avoid partial shadowing
    const keys = Object.keys(assetMap).sort((a, b) => b.length - a.length);

    if (keys.length === 0) return source;

    // Build a single alternation regex: (key1|key2|key3)
    const pattern = keys.map(escape).join("|");
    const regex = new RegExp(pattern, "g");

    return source.replace(regex, match => assetMap[match]);
}
