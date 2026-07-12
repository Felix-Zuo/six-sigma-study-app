export async function waitForVisualIdle(
  evaluate,
  {
    description = "visual idle",
    timeout = 16000,
    rootSelector = ".appShell",
    imageSelector = "img"
  } = {}
) {
  const config = { timeout, rootSelector, imageSelector };
  const expression = `(async () => {
    const config = ${JSON.stringify(config)};
    const started = performance.now();
    const deadline = started + config.timeout;
    const nextFrame = () => new Promise((resolve) => {
      let complete = false;
      const finish = () => {
        if (complete) return;
        complete = true;
        clearTimeout(fallbackTimer);
        resolve();
      };
      const fallbackTimer = setTimeout(finish, 120);
      requestAnimationFrame(finish);
    });
    const selectedRoot = document.querySelector(config.rootSelector);
    const root = selectedRoot ?? document.documentElement;
    const isVisibleImage = (image) => {
      const rect = image.getBoundingClientRect();
      const style = getComputedStyle(image);
      return style.display !== "none" && style.visibility !== "hidden" &&
        rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= innerHeight &&
        rect.right >= 0 && rect.left <= innerWidth;
    };
    const relevantImages = () => Array.from(document.querySelectorAll(config.imageSelector)).filter(isVisibleImage);
    const animationDetails = (animations) => animations.slice(0, 12).map((animation) => {
      const effect = animation.effect;
      const target = effect?.target;
      const timing = effect?.getComputedTiming?.();
      return {
        name: animation.animationName ?? animation.constructor?.name ?? "Animation",
        playState: animation.playState,
        currentTime: Number.isFinite(Number(animation.currentTime)) ? Number(animation.currentTime) : null,
        endTime: Number.isFinite(Number(timing?.endTime)) ? Number(timing.endTime) : null,
        target: target instanceof Element
          ? target.id || target.getAttribute("data-app-view") || target.className || target.tagName
          : null,
        pseudoElement: effect?.pseudoElement ?? null
      };
    });
    const layoutSignature = () => {
      const quantize = (value) => Math.round(value * 10) / 10;
      const selectors = "header, nav, main, section, article, img, [data-section-id], [data-block-id], .appPageContent, .readerPanel, .bottomSheet, .tocPanel";
      const nodes = [root, ...root.querySelectorAll(selectors)];
      const seen = new Set();
      const rects = [];
      for (const node of nodes) {
        if (!(node instanceof Element) || seen.has(node)) continue;
        seen.add(node);
        const rect = node.getBoundingClientRect();
        if (node !== root && (rect.bottom < -200 || rect.top > innerHeight + 200)) continue;
        rects.push([
          node.tagName,
          node.id,
          node.getAttribute("data-app-view"),
          quantize(rect.left),
          quantize(rect.top),
          quantize(rect.width),
          quantize(rect.height)
        ]);
      }
      return JSON.stringify({
        viewport: [innerWidth, innerHeight],
        scroll: [
          Math.round(scrollX),
          Math.round(scrollY),
          document.documentElement.scrollWidth,
          document.documentElement.scrollHeight,
          document.body?.scrollWidth ?? 0,
          document.body?.scrollHeight ?? 0
        ],
        rects
      });
    };

    let previousSignature = null;
    let stableFrames = 0;
    let diagnostics = null;
    while (performance.now() <= deadline) {
      if (document.fonts?.status === "loading") {
        await Promise.race([document.fonts.ready, nextFrame()]);
      }
      await nextFrame();

      const fontsReady = !document.fonts || document.fonts.status === "loaded";
      const images = relevantImages();
      const incompleteImages = images.filter((image) => !image.complete);
      const runningAnimations = document.getAnimations().filter((animation) => animation.playState === "running");
      const signature = layoutSignature();
      const prerequisitesReady = Boolean(selectedRoot) && fontsReady && incompleteImages.length === 0 && runningAnimations.length === 0;
      stableFrames = prerequisitesReady && signature === previousSignature ? stableFrames + 1 : 0;
      previousSignature = signature;
      diagnostics = {
        rootFound: Boolean(selectedRoot),
        fontsReady,
        imageCount: images.length,
        imagesComplete: incompleteImages.length === 0,
        incompleteImages: incompleteImages.slice(0, 8).map((image) => image.currentSrc || image.src),
        runningAnimationCount: runningAnimations.length,
        runningAnimations: animationDetails(runningAnimations),
        stableFrames,
        elapsedMs: Math.round(performance.now() - started)
      };
      if (stableFrames >= 2) {
        return { ok: true, ...diagnostics };
      }
    }
    return { ok: false, ...diagnostics };
  })()`;
  const result = await evaluate(expression);
  if (!result?.ok) {
    throw new Error(`Timed out waiting for ${description}: ${JSON.stringify(result)}`);
  }
  return result;
}
