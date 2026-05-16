const URL_PARAMS = new URLSearchParams(window.location.search);
const OVERLAY = URL_PARAMS.get('overlay');

const OVERLAY_PATH = `streamelements-export-whazzittoya-2026-05-16/overlays/${OVERLAY}.json`;

async function load() {
    const overlay = await (await fetch(OVERLAY_PATH)).json();

    const widget = overlay.widgets[0];

    const widgetData = widget.variables.fieldData;
    const widgetHtml = replaceFieldData(widget.variables.html, widgetData);
    const widgetCss = replaceFieldData(widget.variables.css, widgetData);
    const widgetJs = widget.variables.js;

    const html = `
<!DOCTYPE html>
<html>
    <head>
	<meta charset="UTF-8">
	<!-- Scripts -->
	<script href="https://cdn.streamelements.com/scripts/jquery_3.3.1.min.js"></script>
        <script type="text/javascript" src="https://unpkg.com/@streamerbot/client/dist/streamerbot-client.js"></script>
        
        <!-- CSS -->
        <style>/* --- [Globals] --- */
	    body {
		width: 1500px;
		height: 500px;
		margin: 0;
		overflow: hidden;
	    }
        ${widgetCss}
      </style>
  </head>
  <body>
      ${widgetHtml}

      <script src="se-compat.js"></script>
      <script>
        let _WIDGET_DATA = {
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

        ${widget.variables.js}
      </script>
  </body>
</html>
`

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.location.href = url;
}
load();

function replaceFieldData(template, values) {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
        return key in values ? values[key] : match;
    });
}
