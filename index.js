const URL_PARAMS = new URLSearchParams(window.location.search);
const SB_HOST = URL_PARAMS.get('host') ?? "127.0.0.1";
const SB_PORT = URL_PARAMS.get('port') ?? 8080;
const SB_ENDPOINT = URL_PARAMS.get('endpoint') ?? "/";
const OVERLAY = URL_PARAMS.get('overlay');

const OVERLAY_PATH = `streamelements-export-whazzittoya-2026-05-16/overlays/${OVERLAY}.json`;

async function load() {
    const overlayInfo = await (await fetch(OVERLAY_PATH)).json();

    document.body.style.width = convertToPx(overlayInfo?.settings?.width ?? "1920px");
    document.body.style.height = convertToPx(overlayInfo?.settings?.height ?? "1080px");
    
    const widget = overlayInfo.widgets[0];
    console.log("widget: ", widget);
    

    const widgetData = widget.variables.fieldData;
    const widgetHtml = replaceFieldData(widget.variables.html, widgetData);
    const rawWidgetCss = replaceFieldData(widget.variables.css, widgetData);
    const widgetCss = await inlineCssImports(rawWidgetCss);
    const widgetJs = replaceJsFieldData(widget.variables.js, widgetData);

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
load();

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
