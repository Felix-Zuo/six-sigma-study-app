import * as THREE from "three";

export type CinematicTransitionStyle =
  | "folder-extract"
  | "folder-close"
  | "page-turn"
  | "book-open"
  | "book-close";

type TransitionDirection = "forward" | "backward";

type RectShape = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type CinematicTransitionOptions = {
  style: CinematicTransitionStyle;
  direction: TransitionDirection;
  sourceRect?: DOMRect | null;
  sourceElement?: HTMLElement | null;
  commit: () => void | Promise<void>;
  resolveTargetRect: () => DOMRect | null | undefined;
};

export type CinematicTransitionHandle = {
  finished: Promise<void>;
  cancel: () => void;
};

type StageRuntime = {
  host: HTMLDivElement;
  backdrop: HTMLDivElement;
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  rig: THREE.Group;
  shadow: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  paper: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  backPageA: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  backPageB: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  accentEdge: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  folderBack: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  folderFront: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  folderTab: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  bookBack: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  bookSpine: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  frontCoverPivot: THREE.Group;
  frontCover: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  turnPagePivot: THREE.Group;
  turnPage: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  ownerId: number;
  contextLost: boolean;
};

type CinematicQaWindow = Window & {
  __qaCaptureCinematicFrame?: () => string;
  __qaCinematicDurationScale?: number;
  __qaObserveCinematicFrame?: (phase: "depart" | "arrive", progress: number) => void;
};

let runtime: StageRuntime | null = null;
let transitionSequence = 0;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;
const easeOutQuint = (value: number) => 1 - Math.pow(1 - value, 5);
const easeInOutQuint = (value: number) =>
  value < 0.5 ? 16 * Math.pow(value, 5) : 1 - Math.pow(-2 * value + 2, 5) / 2;

function nextTask(delay = 0): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, delay));
}

function safeColor(value: string | undefined, fallback: string): THREE.Color {
  const color = new THREE.Color();
  try {
    color.setStyle(value && value !== "rgba(0, 0, 0, 0)" ? value : fallback);
  } catch {
    color.setStyle(fallback);
  }
  return color;
}

function resolveStageColors(sourceElement?: HTMLElement | null) {
  const appShell = document.querySelector<HTMLElement>(".appShell");
  const sourceStyle = sourceElement ? getComputedStyle(sourceElement) : null;
  const shellStyle = appShell ? getComputedStyle(appShell) : getComputedStyle(document.body);
  const bodyStyle = getComputedStyle(document.body);
  const pageSurface = shellStyle.getPropertyValue("--surface").trim() || "#f7f6f2";
  const surface = sourceStyle?.backgroundColor && sourceStyle.backgroundColor !== "rgba(0, 0, 0, 0)"
    ? sourceStyle.backgroundColor
    : pageSurface || shellStyle.backgroundColor || "#f7f6f2";
  const accent = shellStyle.getPropertyValue("--page-accent").trim() ||
    shellStyle.getPropertyValue("--accent").trim() || "#2f7d70";
  const background = shellStyle.backgroundColor && shellStyle.backgroundColor !== "rgba(0, 0, 0, 0)"
    ? shellStyle.backgroundColor
    : bodyStyle.backgroundColor && bodyStyle.backgroundColor !== "rgba(0, 0, 0, 0)"
      ? bodyStyle.backgroundColor
      : "#f3f1ec";
  return { surface, pageSurface, accent, background };
}

function createRuntime(): StageRuntime {
  const host = document.createElement("div");
  host.className = "cinematicStage";
  host.dataset.cinematicStage = "true";
  host.dataset.contentMode = "geometry-only";
  host.setAttribute("aria-hidden", "true");
  host.hidden = true;

  const backdrop = document.createElement("div");
  backdrop.className = "cinematicStageBackdrop";
  const canvas = document.createElement("canvas");
  canvas.className = "cinematicStageCanvas";
  canvas.dataset.cinematicCanvas = "true";
  host.append(backdrop, canvas);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    // The stage cross-fades as one opaque layer. An alpha WebGL surface can
    // briefly expose a black compositor buffer in Android WebView.
    alpha: false,
    antialias: true,
    powerPreference: "high-performance"
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0xf3f1ec, 1);
  document.body.append(host);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 3000);
  camera.position.z = 1000;

  const rig = new THREE.Group();
  scene.add(rig);
  const geometry = new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
  const paperMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const backMaterialA = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const backMaterialB = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const accentMaterial = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false
  });
  const translucentAccentMaterial = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 1
  });
  const translucentPaperMaterial = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 1
  });
  const shadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x172035,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const shadow = new THREE.Mesh(geometry, shadowMaterial);
  const paper = new THREE.Mesh(geometry, paperMaterial);
  const backPageA = new THREE.Mesh(geometry, backMaterialA);
  const backPageB = new THREE.Mesh(geometry, backMaterialB);
  const accentEdge = new THREE.Mesh(geometry, accentMaterial);
  accentEdge.renderOrder = 30;
  const folderBack = new THREE.Mesh(geometry, translucentAccentMaterial.clone());
  const folderFront = new THREE.Mesh(geometry, translucentAccentMaterial.clone());
  const folderTab = new THREE.Mesh(geometry, translucentAccentMaterial.clone());
  const bookBack = new THREE.Mesh(geometry, translucentAccentMaterial.clone());
  const bookSpine = new THREE.Mesh(geometry, translucentAccentMaterial.clone());
  const frontCoverPivot = new THREE.Group();
  const frontCover = new THREE.Mesh(geometry, translucentAccentMaterial.clone());
  bookBack.material.transparent = false;
  bookSpine.material.transparent = false;
  frontCover.material.depthTest = false;
  frontCover.material.depthWrite = false;
  frontCover.renderOrder = 20;
  const turnPagePivot = new THREE.Group();
  const turnPage = new THREE.Mesh(geometry, translucentPaperMaterial);
  shadow.scale.set(1.035, 1.025, 1);
  shadow.position.set(0.012, -0.014, -28);
  paper.scale.z = 7;
  backPageA.scale.z = 5;
  backPageB.scale.z = 4;
  accentEdge.scale.set(0.012, 0.98, 9);
  accentEdge.position.set(0.493, 0, 2);
  folderBack.scale.set(1.035, 1.02, 7);
  folderBack.position.set(0, 0, -19);
  folderFront.scale.set(1.04, 0.35, 10);
  folderFront.position.set(0, -0.33, 13);
  folderTab.scale.set(0.16, 0.22, 6);
  folderTab.position.set(0.54, 0.29, -13);
  bookBack.scale.set(1.035, 1.025, 8);
  bookBack.position.set(0, 0, -16);
  bookSpine.scale.set(0.032, 1.04, 12);
  bookSpine.position.set(-0.51, 0, 2);
  frontCoverPivot.position.set(-0.5, 0, 16);
  // Hinged children are rotated before the parent rig's non-uniform screen
  // scale. Keep their local depth paper-thin or that depth becomes horizontal
  // width during the hinge turn and visually stretches across the viewport.
  frontCover.scale.set(1.02, 1.02, 0.018);
  frontCover.position.set(0.5, 0, 0);
  frontCoverPivot.add(frontCover);
  turnPagePivot.position.set(-0.5, 0, 19);
  turnPage.scale.set(0.995, 0.99, 0.012);
  turnPage.position.set(0.5, 0, 0);
  turnPagePivot.add(turnPage);
  rig.add(
    shadow,
    folderBack,
    bookBack,
    backPageB,
    backPageA,
    paper,
    accentEdge,
    folderFront,
    folderTab,
    bookSpine,
    frontCoverPivot,
    turnPagePivot
  );

  const created: StageRuntime = {
    host,
    backdrop,
    canvas,
    renderer,
    scene,
    camera,
    rig,
    shadow,
    paper,
    backPageA,
    backPageB,
    accentEdge,
    folderBack,
    folderFront,
    folderTab,
    bookBack,
    bookSpine,
    frontCoverPivot,
    frontCover,
    turnPagePivot,
    turnPage,
    ownerId: 0,
    contextLost: false
  };
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    created.contextLost = true;
    created.host.hidden = true;
  });
  canvas.addEventListener("webglcontextrestored", () => {
    // Recreate the small stage on the next transition instead of trusting
    // partially restored buffers and materials in Android WebView.
    created.contextLost = true;
  });
  return created;
}

function disposeRuntime(stage: StageRuntime) {
  stage.host.hidden = true;
  stage.renderer.dispose();
  stage.host.remove();
}

function ensureRuntime(): StageRuntime {
  let unusable = !runtime || !runtime.host.isConnected || runtime.contextLost;
  if (runtime && !unusable) {
    try {
      unusable = runtime.renderer.getContext().isContextLost();
    } catch {
      unusable = true;
    }
  }
  if (runtime && unusable) {
    disposeRuntime(runtime);
    runtime = null;
  }
  if (!runtime) runtime = createRuntime();
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  runtime.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  runtime.renderer.setSize(width, height, false);
  runtime.camera.aspect = width / height;
  runtime.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(height / (2 * runtime.camera.position.z)));
  runtime.camera.updateProjectionMatrix();
  return runtime;
}

function renderStage(stage: StageRuntime) {
  if (stage.contextLost || stage.renderer.getContext().isContextLost()) {
    throw new Error("Cinematic WebGL context unavailable");
  }
  stage.renderer.render(stage.scene, stage.camera);
}

function notifyQaFrame(phase: "depart" | "arrive", progress: number) {
  try {
    (window as CinematicQaWindow).__qaObserveCinematicFrame?.(phase, progress);
  } catch {
    // QA instrumentation must never change runtime navigation behavior.
  }
}

function normalizedRect(rect?: DOMRect | RectShape | null): RectShape {
  const inset = Math.max(12, Math.min(window.innerWidth, window.innerHeight) * 0.035);
  const fallback = {
    left: inset,
    top: inset,
    width: Math.max(80, window.innerWidth - inset * 2),
    height: Math.max(120, window.innerHeight - inset * 2)
  };
  if (!rect || rect.width < 2 || rect.height < 2) return fallback;
  return {
    left: rect.left,
    top: rect.top,
    width: Math.max(24, rect.width),
    height: Math.max(32, rect.height)
  };
}

function interpolateRect(from: RectShape, to: RectShape, amount: number): RectShape {
  return {
    left: mix(from.left, to.left, amount),
    top: mix(from.top, to.top, amount),
    width: mix(from.width, to.width, amount),
    height: mix(from.height, to.height, amount)
  };
}

function applyRigTransform(
  stage: StageRuntime,
  rect: RectShape,
  z: number,
  rotationX: number,
  rotationY: number,
  rotationZ: number,
  separation: number
) {
  stage.rig.position.set(
    rect.left + rect.width / 2 - window.innerWidth / 2,
    window.innerHeight / 2 - (rect.top + rect.height / 2),
    z
  );
  stage.rig.scale.set(rect.width, rect.height, 1);
  stage.rig.rotation.set(rotationX, rotationY, rotationZ);
  stage.backPageA.position.set(0.012 * separation, -0.012 * separation, -10 * separation);
  stage.backPageB.position.set(0.024 * separation, -0.022 * separation, -18 * separation);
}

function setOpacity(
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>,
  opacity: number
) {
  mesh.material.opacity = clamp01(opacity);
  mesh.visible = mesh.material.opacity > 0.002;
}

function applyStageComposition(
  stage: StageRuntime,
  style: CinematicTransitionStyle,
  phase: "depart" | "arrive",
  rawProgress: number,
  directionSign: number
) {
  const progress = easeInOutQuint(rawProgress);
  const folderStyle = style === "folder-extract" || style === "folder-close";
  const bookStyle = style === "book-open" || style === "book-close";
  const pageStyle = style === "page-turn";

  stage.folderBack.visible = folderStyle;
  stage.folderFront.visible = folderStyle;
  stage.folderTab.visible = folderStyle;
  stage.bookBack.visible = bookStyle;
  stage.bookSpine.visible = bookStyle;
  stage.frontCoverPivot.visible = bookStyle;
  stage.turnPagePivot.visible = pageStyle;
  stage.accentEdge.visible = true;
  stage.accentEdge.scale.set(0.012, 0.98, 9);
  stage.accentEdge.position.set(0.493, 0, 2);
  stage.paper.scale.x = 1;
  stage.paper.material.depthTest = !bookStyle;
  stage.paper.renderOrder = bookStyle ? 10 : 0;
  stage.paper.position.set(0, 0, 0);
  stage.paper.rotation.set(0, 0, 0);
  stage.backPageA.rotation.set(0, 0, 0);
  stage.backPageB.rotation.set(0, 0, 0);
  stage.folderFront.position.set(0, -0.33, 13);
  stage.folderTab.position.set(0.54, 0.29, -13);
  stage.frontCoverPivot.rotation.set(0, 0, 0);
  stage.turnPagePivot.rotation.set(0, 0, 0);
  stage.turnPage.position.set(0.5, 0, 0);

  if (folderStyle) {
    const closing = style === "folder-close";
    const folderAmount = closing
      ? phase === "depart"
        ? progress * 0.66
        : 0.66 + progress * 0.34
      : phase === "depart"
        ? 1 - progress * 0.72
        : (1 - progress) * 0.28;
    setOpacity(stage.folderBack, folderAmount * 0.88);
    setOpacity(stage.folderFront, folderAmount * 0.96);
    setOpacity(stage.folderTab, folderAmount);
    stage.folderFront.position.y = mix(-0.33, -0.29, 1 - folderAmount);
    stage.folderTab.position.y = mix(0.29, 0.25, 1 - folderAmount);
    const extracted = closing ? 1 - folderAmount : 1 - folderAmount * 0.72;
    stage.paper.position.y = mix(-0.055, 0.035, extracted);
    stage.backPageA.position.y -= 0.018 * extracted;
    stage.backPageB.position.y -= 0.028 * extracted;
    return;
  }

  if (pageStyle) {
    const angle = 1.23 * directionSign;
    const turnAmount = phase === "depart" ? progress : 1 - progress;
    stage.turnPagePivot.rotation.y = phase === "depart" ? angle * turnAmount : -angle * turnAmount;
    setOpacity(
      stage.turnPage,
      phase === "depart"
        ? 1 - clamp01((rawProgress - 0.62) / 0.3)
        : clamp01(rawProgress / 0.38)
    );
    stage.turnPage.position.z = 0.012 * Math.sin(rawProgress * Math.PI);
    stage.backPageA.rotation.z = directionSign * Math.sin(rawProgress * Math.PI) * 0.006;
    return;
  }

  if (bookStyle) {
    const closing = style === "book-close";
    let coverAngle: number;
    let coverOpacity = 1;
    if (closing) {
      coverAngle = phase === "depart"
        ? directionSign * mix(1.26, 0.56, progress)
        : directionSign * mix(0.56, 0, progress);
    } else {
      coverAngle = phase === "depart"
        ? directionSign * mix(0, 1.22, progress)
        : directionSign * mix(1.22, 1.42, progress);
      if (phase === "arrive") coverOpacity = 1 - clamp01((rawProgress + 0.02) / 0.34);
    }
    stage.frontCoverPivot.rotation.y = coverAngle;
    setOpacity(stage.frontCover, coverOpacity);
    stage.bookBack.visible = true;
    stage.bookSpine.visible = true;
    stage.paper.scale.x = 0.95;
    stage.paper.position.x = 0.025 + (closing ? mix(0.018, 0, progress) : mix(-0.016, 0.02, progress));
    stage.accentEdge.scale.x = 0.018;
    stage.accentEdge.position.x = -0.455;
  }
}

function animateSegment(
  duration: number,
  cancelled: () => boolean,
  update: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    let previousFrame = performance.now();
    const startedAt = previousFrame;
    let elapsed = 0;
    const frame = (now: number) => {
      if (cancelled()) {
        resolve();
        return;
      }
      // WebView can stop presenting frames while React commits, a screenshot is
      // read back, or the OS briefly stalls the UI thread. Capping one-frame
      // time keeps the camera path continuous instead of teleporting forward.
      elapsed += Math.min(Math.max(0, now - previousFrame), 50);
      previousFrame = now;
      const wallClockExpired = now - startedAt >= Math.max(duration * 2.5, duration + 1200);
      const progress = wallClockExpired ? 1 : clamp01(elapsed / duration);
      try {
        update(progress);
      } catch (error) {
        reject(error);
        return;
      }
      if (progress >= 1) {
        resolve();
      } else {
        requestAnimationFrame(frame);
      }
    };
    requestAnimationFrame(frame);
  });
}

function fallbackTransition(options: CinematicTransitionOptions, cancelled: () => boolean): Promise<void> {
  return (async () => {
    const sourceShell = document.querySelector<HTMLElement>(".appShell");
    const sourceFade = sourceShell?.animate(
      [{ opacity: 1 }, { opacity: 0 }],
      { duration: 150, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" }
    );
    await nextTask(150);
    if (cancelled()) return;
    document.documentElement.dataset.cinematicPhase = "hold";
    await options.commit();
    const targetShell = document.querySelector<HTMLElement>(".appShell");
    if (targetShell) targetShell.style.opacity = "0";
    sourceFade?.cancel();
    if (cancelled()) return;
    document.documentElement.dataset.cinematicPhase = "arrive";
    targetShell?.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 260, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "forwards" }
    );
    await nextTask(280);
    targetShell?.style.removeProperty("opacity");
  })();
}

export function playCinematicTransition(options: CinematicTransitionOptions): CinematicTransitionHandle {
  const transitionId = ++transitionSequence;
  let cancelled = false;
  let cleaned = false;
  let committed = false;
  let sourceFade: Animation | undefined;
  let targetFade: Animation | undefined;
  let stage: StageRuntime | null = null;
  let sourceShell: HTMLElement | null = null;
  let targetShell: HTMLElement | null = null;
  const root = document.documentElement;

  const cancel = () => {
    if (cleaned) return;
    cleaned = true;
    cancelled = true;
    sourceFade?.cancel();
    targetFade?.cancel();
    const ownsRoot = root.dataset.cinematicOwner === String(transitionId);
    const ownsStage = stage?.ownerId === transitionId;
    if (ownsRoot) {
      sourceShell?.style.removeProperty("opacity");
      targetShell?.style.removeProperty("opacity");
    }
    if (stage && ownsStage) {
      stage.host.hidden = true;
      stage.host.removeAttribute("data-style");
      stage.host.removeAttribute("data-phase");
      stage.host.removeAttribute("data-progress");
      stage.host.removeAttribute("data-surface-color");
      stage.host.removeAttribute("data-background-color");
      stage.host.style.removeProperty("opacity");
      stage.ownerId = 0;
    }
    if (ownsRoot) {
      delete root.dataset.cinematicActive;
      delete root.dataset.cinematicPhase;
      delete root.dataset.cinematicOwner;
      delete (window as CinematicQaWindow).__qaCaptureCinematicFrame;
    }
  };

  const sequence = (async () => {
    const requestedDurationScale = Number((window as CinematicQaWindow).__qaCinematicDurationScale);
    const durationScale = Number.isFinite(requestedDurationScale)
      ? Math.max(0.5, Math.min(4, requestedDurationScale))
      : 1;
    const departDuration = 285 * durationScale;
    const arriveDuration = 510 * durationScale;
    root.dataset.cinematicActive = "true";
    root.dataset.cinematicPhase = "depart";
    root.dataset.cinematicOwner = String(transitionId);
    sourceShell = document.querySelector<HTMLElement>(".appShell");
    const colors = resolveStageColors(options.sourceElement);

    try {
      stage = ensureRuntime();
      stage.ownerId = transitionId;
    } catch {
      await fallbackTransition(options, () => cancelled);
      committed = !cancelled;
      return;
    }

    const directionSign = options.direction === "forward" ? -1 : 1;
    const styleSign = options.style === "folder-close" || options.style === "book-close"
      ? -directionSign
      : directionSign;
    const sourceRect = normalizedRect(options.sourceRect);
    const bookStyle = options.style === "book-open" || options.style === "book-close";
    const coverRect = normalizedRect({
      left: window.innerWidth * (bookStyle ? 0.14 : 0.1),
      top: window.innerHeight * (bookStyle ? 0.105 : 0.1),
      width: window.innerWidth * (bookStyle ? 0.72 : 0.8),
      height: window.innerHeight * (bookStyle ? 0.73 : 0.78)
    });

    stage.host.hidden = false;
    stage.host.dataset.style = options.style;
    stage.host.dataset.phase = "depart";
    stage.host.dataset.surfaceColor = colors.surface;
    stage.host.dataset.backgroundColor = colors.background;
    stage.backdrop.style.backgroundColor = colors.background;
    stage.backdrop.style.opacity = "0";
    stage.host.style.opacity = "0";
    const backgroundColor = safeColor(colors.background, "#f3f1ec");
    const sourceSurfaceColor = safeColor(colors.surface, "#f7f6f2");
    const pageSurfaceColor = safeColor(colors.pageSurface, "#f7f6f2");
    const accentColor = safeColor(colors.accent, "#2f7d70");
    const sourceChannels = [sourceSurfaceColor.r, sourceSurfaceColor.g, sourceSurfaceColor.b];
    const sourceSpread = Math.max(...sourceChannels) - Math.min(...sourceChannels);
    const sourceMean = sourceChannels.reduce((sum, value) => sum + value, 0) / sourceChannels.length;
    const coverColor = sourceSpread < 0.08 && sourceMean > 0.58 ? accentColor : sourceSurfaceColor;
    const cinematicBackgroundColor = backgroundColor.clone().offsetHSL(0, -0.015, -0.035);
    stage.renderer.setClearColor(cinematicBackgroundColor, 1);
    stage.paper.material.color.copy(pageSurfaceColor);
    stage.backPageA.material.color.copy(pageSurfaceColor).offsetHSL(0, -0.03, -0.045);
    stage.backPageB.material.color.copy(pageSurfaceColor).offsetHSL(0, -0.05, -0.085);
    stage.accentEdge.material.color.copy(accentColor);
    stage.folderBack.material.color.copy(accentColor).offsetHSL(0, -0.03, -0.08);
    stage.folderFront.material.color.copy(accentColor).offsetHSL(0, -0.04, 0.075);
    stage.folderTab.material.color.copy(accentColor).offsetHSL(0, -0.02, 0.03);
    stage.bookBack.material.color.copy(coverColor).offsetHSL(0, -0.04, -0.105);
    stage.bookSpine.material.color.copy(coverColor).offsetHSL(0, -0.06, -0.18);
    stage.frontCover.material.color.copy(coverColor).offsetHSL(0, -0.025, -0.015);
    stage.turnPage.material.color.copy(pageSurfaceColor).offsetHSL(0, -0.01, 0.025);
    applyRigTransform(stage, sourceRect, 0, 0, 0, 0, 0.25);
    applyStageComposition(stage, options.style, "depart", 0, styleSign);
    renderStage(stage);
    (window as CinematicQaWindow).__qaCaptureCinematicFrame = () => {
      if (stage?.ownerId !== transitionId) return "";
      try {
        renderStage(stage);
        return stage.canvas.toDataURL("image/png");
      } catch {
        return "";
      }
    };

    sourceFade = sourceShell?.animate(
      [{ opacity: 1, offset: 0 }, { opacity: 1, offset: 0.18 }, { opacity: 0, offset: 1 }],
      { duration: 190 * durationScale, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" }
    );

    await animateSegment(departDuration, () => cancelled, (rawProgress) => {
      stage!.host.dataset.progress = rawProgress.toFixed(3);
      const progress = easeOutQuint(rawProgress);
      const rect = interpolateRect(sourceRect, coverRect, progress);
      const lift = Math.sin(progress * Math.PI) * 38 + 118 * progress;
      const yaw = styleSign * mix(0, 0.155, progress);
      const pitch = mix(0, -0.025, progress);
      const roll = styleSign * mix(0, 0.008, progress);
      const separation = mix(0.25, 1.35, Math.sin(progress * Math.PI * 0.75));
      stage!.host.style.opacity = String(clamp01((rawProgress - 0.02) / 0.32));
      applyRigTransform(stage!, rect, lift, pitch, yaw, roll, separation);
      applyStageComposition(stage!, options.style, "depart", rawProgress, styleSign);
      renderStage(stage!);
      notifyQaFrame("depart", rawProgress);
    });

    if (cancelled) return;
    root.dataset.cinematicPhase = "hold";
    stage.host.dataset.phase = "hold";
    await options.commit();
    committed = true;
    sourceFade?.cancel();
    if (cancelled) return;

    targetShell = document.querySelector<HTMLElement>(".appShell");
    if (targetShell) targetShell.style.opacity = "0";
    await nextTask();
    const targetRect = normalizedRect(options.resolveTargetRect());
    root.dataset.cinematicPhase = "arrive";
    stage.host.dataset.phase = "arrive";
    targetFade = targetShell?.animate(
      [
        { opacity: 0, offset: 0 },
        { opacity: 0, offset: 0.48, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
        { opacity: 1, offset: 1 }
      ],
      { duration: arriveDuration, easing: "linear", fill: "forwards" }
    );

    await animateSegment(arriveDuration, () => cancelled, (rawProgress) => {
      stage!.host.dataset.progress = rawProgress.toFixed(3);
      const progress = easeInOutQuint(rawProgress);
      const rect = interpolateRect(coverRect, targetRect, progress);
      const settleWave = Math.sin(rawProgress * Math.PI);
      const lift = mix(118, 0, progress) + settleWave * 24;
      const yaw = styleSign * mix(0.155, 0, progress) - styleSign * settleWave * 0.025;
      const pitch = mix(-0.025, 0, progress) + settleWave * 0.012;
      const roll = styleSign * mix(0.008, 0, progress);
      const separation = mix(1.35, 0.22, progress);
      stage!.host.style.opacity = String(1 - clamp01((rawProgress - 0.48) / 0.42));
      applyRigTransform(stage!, rect, lift, pitch, yaw, roll, separation);
      applyStageComposition(stage!, options.style, "arrive", rawProgress, styleSign);
      renderStage(stage!);
      notifyQaFrame("arrive", rawProgress);
    });

    if (cancelled) return;
    targetFade?.cancel();
    targetShell?.style.removeProperty("opacity");
    stage.host.dataset.phase = "settled";
    root.dataset.cinematicPhase = "settled";
    renderStage(stage);
    await nextTask(34);
  })();

  const finished = sequence.catch(async () => {
    if (cancelled || root.dataset.cinematicOwner !== String(transitionId)) return;
    if (stage?.ownerId === transitionId) stage.host.hidden = true;
    if (!committed) {
      try {
        await options.commit();
        committed = true;
      } catch {
        // The source view remains usable when React itself rejects the update.
      }
    }
    targetShell = document.querySelector<HTMLElement>(".appShell");
    sourceShell?.style.removeProperty("opacity");
    targetShell?.style.removeProperty("opacity");
  }).finally(cancel);

  return { finished, cancel };
}

export function prewarmCinematicTransition() {
  try {
    ensureRuntime();
  } catch {
    // The navigation path retains a DOM fade fallback when WebGL is unavailable.
  }
}
