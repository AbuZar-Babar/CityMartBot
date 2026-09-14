() => {
  const result = {};
  
  // Check for PDF embed/object
  const embeds = document.querySelectorAll('embed[type="application/pdf"], object[type="application/pdf"]');
  result.pdfEmbeds = embeds.length;

  // Check for iframes and their src
  const iframes = document.querySelectorAll('iframe');
  result.iframes = Array.from(iframes).map(f => ({
    src: f.src,
    sameOrigin: (() => {
      try { return !!f.contentDocument; } catch(e) { return false; }
    })()
  }));

  // Check for canvas (PDF.js style rendering)
  const canvases = document.querySelectorAll('canvas');
  result.canvasCount = canvases.length;

  // Any text nodes actually containing "Due"
  result.bodyHasDueText = document.body.innerText.includes('Due');

  // If there's an accessible iframe, check inside it too
  if (iframes.length && result.iframes[0].sameOrigin) {
    try {
      result.iframeInnerText = iframes[0].contentDocument.body.innerText.slice(0, 500);
    } catch(e) {
      result.iframeInnerText = 'blocked: ' + e.message;
    }
  }

  return result;
}