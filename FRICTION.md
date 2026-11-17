# Friction log: building player controls with spatial CSS

Notes from building this experiment against the
[WebKit blog post](https://webkit.org/blog/18621/introducing-spatial-css-a-developer-preview/) and the
[css-spatial-1 draft](https://drafts.csswg.org/css-spatial-1/) (both read 2026-11-17).

**Everything here comes from authoring, not from running.** The code was written on a machine that can't render a
`<model>` or a portal. So these are places where the docs left me guessing or the design made a player control hard to
build. Each needs a check on a device before it becomes feedback; the last column says what to look for.

Kinds: **design** = the API as specified makes this hard. **spec** = the draft doesn't say. **docs** = the blog post
doesn't say what the preview does. **tooling** = ecosystem.

## Most worth raising

| # | Kind | Friction | What I did | Check on device |
| --- | --- | --- | --- | --- |
| 1 | design | **No pointer coordinates in a portal, so no slider.** §5 says the UA "must not transmit precise coordinates". A timeline, volume slider or any drag control needs a position along an axis. There is no sanctioned alternative (a delta along the target's local axis, a hit position in the model's own space, or a native range-like behaviour). | Cut the track into 23 tile models; which tile was hit is the position. Seeking is quantised to 1/23 of the duration. | What do `clientX`/`offsetX`/`movementX` report on a model? Does the thumb drag do anything? |
| 2 | design | **No way to restyle a model from CSS.** Played/unplayed, hover, disabled, focus and theme colour are material changes. CSS can move, scale and light a model but not tint it or change its opacity (as far as either document says). | Expressed all state as motion: glyphs sink into the puck, bars scale. Anything needing colour would need a second asset and a `src` swap. | Do `opacity`, `filter` or `visibility` affect a model in a portal? Does a `src` swap flash? |
| 3 | design | **No grouping.** `<model>` is void and models can't nest, so a control made of several models (puck + two glyphs) can't be moved as a unit. Anchors are the offered substitute, but they need an empty authored into the asset and still don't give a shared parent transform for arbitrary sets. | Repeated the puck's position and squash in each glyph's transform via shared custom properties. Anchoring is behind a lab switch. | Does a plain wrapper element with a transform move its model children? Does `transform-style: preserve-3d` on a wrapper (§4) do it? |
| 4 | spec | **Auto-fit ignores transforms.** `portal-stage: auto` measures contents "ignoring any transforms", but the blog's own way of laying out models is `transform`. So the fitted stage is the union of the untransformed models (all at the origin), not the scene you built. | Added a tray model whose bounding box encloses the whole layout, purely so the fit comes out right. | With the tray removed, how is the scene scaled? Is content in front of the stage's front face clipped at the glass? |
| 5 | docs | **Which parts of the spec does the preview implement?** The post lists six features; the draft has many more (`spatial: page`, `position: spatial-absolute`, `inset-front`/`inset-back`, `front-limit`, `portal-stage`, `portal-transform`, `environment-intensity`, `environment-rotate`, `z-align-*`). | Built a support table from `CSS.supports()`. | The table. Also: does `CSS.supports('spatial', 'portal')` return false with the flag off? |
| 6 | spec/docs | **How does a model child of a portal get into the back context?** The draft says content not using absolute spatial positioning is drawn on the glass, and Appendix A makes `<model>` its own portal. The blog's models have no `position` yet clearly share the space. | Followed the blog (no `position`); `position: spatial-absolute` is a lab switch. | Which of the two is needed, and do they place the model differently? |

## Smaller gaps

| # | Kind | Friction | What I did | Check on device |
| --- | --- | --- | --- | --- |
| 7 | spec | **`position-anchor: --board#octagon-position`**: the `#name` fragment is in the blog but not in the draft. USD prim names can't contain hyphens, so how `octagon-position` maps to a prim is unclear. | Named the empty `glyph` (no punctuation). | Does `--puck#glyph` resolve? What happens when it doesn't (origin, hidden, ignored)? |
| 8 | spec | **Axis and origin conventions inside a portal.** CSS y points down, USD y points up; the draft doesn't say which way `translateY()` moves a model, or confirm rotation handedness. `transform-origin` is to gain an `auto` initial value meaning the model's own origin, but that is a change to an existing property. | Laid everything out along x and z only, and authored bars with their origin on the left end so `scaleX()` grows rightwards. | Direction of `translateY`/`translateZ`; whether bars scale from their left end or their centre. |
| 9 | docs | **Transitions.** The post says numeric parameters "can be animated and transitioned". It doesn't say whether a transform that changes because a custom property changed transitions, or how smooth many simultaneous model transitions are. | Drive everything through custom properties plus `transition: transform`. | Do press, glyph swap and thumb glide animate or snap? |
| 10 | spec | **Interaction affordances.** Gaze hover is rightly hidden from the page, but nothing says how a model gets the system hover highlight, how the UA knows a model is interactive (a click listener? `role`? `cursor`?), or what focus looks like on a focused model. | `role`, `tabindex` and `aria-label` on one model per control; the others `aria-hidden`. | Is there a hover highlight? A focus ring? Does `pointer-events: none` let hits pass through the fill to the tiles? |
| 11 | spec | **`requestVolumetricScene()` is only in the blog.** No return type, no exit method, no enter/exit events, no pseudo-class like `:fullscreen`, nothing on what happens to the portal's box in the page. A player needs all of these to reflect the state in its UI, the way it does for fullscreen and picture-in-picture. | Call it and log whatever comes back. | Return value; whether events fire; whether the page's controls still drive the video. |
| 12 | spec | **Environment map sources.** `src` takes `<image>`, the preview documents HDR files. Unclear whether `blob:` URLs, PNG, canvas or video work, or whether a rule whose `src` changes is re-read. `environment-map` animates discretely, so lighting can't cross-fade. | Encode the video frame as a tiny `.hdr` blob twice a second and rewrite the rule. | Does "the video itself" light anything? Does it flicker on each update? |
| 13 | design | **The video can't join the scene.** Non-model content stays on the glass in this preview, so the picture and its controls live in different spaces. The obvious player wants the video as a surface in the scene, or as a texture on a model. | Video above, portal below. | — |
| 14 | design | **One element per instance.** 23 identical tiles are 23 `<model>` elements loading the same file. No instancing, and no stated cost per model in a shared portal. | Accepted it. | Load time and frame rate with 30 models. |

## Tooling and assets

| # | Kind | Friction | What I did |
| --- | --- | --- | --- |
| 15 | tooling | **No way to try anything off-device.** No polyfill, and the Simulator needs macOS and Xcode. Development is write, deploy, look. | Offline software render of the models (`models/preview.py`); a flat fallback to test the wiring. |
| 16 | tooling | **CSS tooling doesn't know the syntax.** `@environment-map` and the new properties risk being dropped or rejected by minifiers and linters. | Kept the stylesheets as static files outside the build. |
| 17 | tooling | **No types.** `<model>` isn't in TypeScript's DOM lib or React's JSX types; `requestVolumetricScene` isn't typed. | Local declarations and casts. |
| 18 | design | **A UI needs an asset pipeline.** There are no primitives, so a play triangle is a USDZ file. Building controls means generating or modelling every part, with origins and units chosen to suit CSS. Neither document gives conventions for that (units, up axis, where the origin should be). | Generated meshes with `usd-core`, in metres, origin on the back face. |
| 19 | docs | **Small errors in the post's examples.** The first has `</stye>`; the second drops `spatial: portal` from `.world`, so as written it wouldn't create a shared space. | — |

## What worked well on paper

- Reusing `transform`, `transition`, custom properties, media queries and anchor positioning meant the whole skin is one
  ordinary stylesheet, and state flows the same way as in a 2D Video.js skin (attributes and custom properties in, CSS
  decides what they mean).
- Real units. Sizing the meshes and the layout in centimetres from one table was straightforward.
- `@environment-map` modelled on `@keyframes` reads naturally, and inheriting it from the portal is the right default.
