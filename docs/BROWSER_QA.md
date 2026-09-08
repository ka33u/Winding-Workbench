# Browser acceptance — 2026-09-09

The user explicitly requested browser testing. Tests below were performed through
the native Chrome UI, using accessibility observations and screenshots of the
running application. The local checkout started at published source
`25261a7cc11bddbae7128453ce85b0463f0d478a` and included the positioning fix below.

## Environment and limits

- The existing in-app Site tab was discovered but its browser adapter timed out
  twice. Native control of the Codex application was unavailable.
- Chrome reached the published Site's sign-in page. Application tests therefore
  used `http://localhost:3000/` from the same checkout; hosted authenticated
  interaction was not verified. Access permissions were not changed.
- Chrome page zoom was checked at 100% and 200%, then restored to 100%.
- This is a manual desktop-browser check, not mobile-device coverage, a frame-rate
  benchmark, reduced-motion testing, WebMCP browser execution, or a comparison
  with commercial motor-design software.

## Observed results

| Journey | Browser evidence / result |
| --- | --- |
| Default 36-slot / 4-pole / 2-path / 2-layer, automatic pitch | Valid result, pitch 9, 36 coils; fit-to-width showed the complete stator, crossover channels and terminals. |
| Crossover and arrow readability | Default all-phase, U-only, 12-slot tooth winding, 24-slot single layer and 72-slot four-path diagrams inspected. Leads were separated; crossing bridges and directional arrows remained visible. Dense overview scales require zooming to read individual labels. |
| Phase and branch filters | U phase showed 12 coils; first U branch showed 6. V phase plus L1/L2 filter in a four-layer design showed 12 coils. |
| Display switches | Crossover/leads and direction arrows disappeared when disabled and returned when enabled. |
| Coil selection | Table selection highlighted the corresponding coil and displayed slot/layer details. A positioning defect was found and fixed as described below. |
| Invalid inputs | Empty pole count produced E_RANGE_POLES; 5 poles produced E_POLES_ODD. Correcting to 4 restored valid generation. Modified input disabled Save and displayed the pending-generation state. |
| Unavailable parallel grouping | 36 slots / 4 poles / 3 paths produced E_AUTO_PITCH_NOT_FOUND with underlying E_PATH_PARTITION and suggested verified path counts 1, 2, 4. |
| Presets | 12 slots / 10 poles, 24 slots / 4 poles single layer, and 72 slots / 8 poles / 4 paths generated and rendered successfully. |
| Alternate views | Electrical circuit and radial views rendered for the filtered U branch. Phasor tab selection changed the active view and accessible diagram title. |
| Animation controls | Trace switch activated and deactivated. MMF Play advanced the current angle from 0 to 16 degrees and onward; Pause stopped it at approximately 300 degrees. No quantitative FPS claim. |
| Export / import | Chrome confirmed completed SVG (41.8 KB) and JSON (17.8 KB) downloads for the 12-slot / 10-pole design. Reopening that JSON restored 12 slots, 10 poles, 2 paths, manual pitch 1 and the corresponding valid diagram. Native file-picker text input needed a retry; the application import succeeded. |
| 200% page zoom | Parameter fields stacked, metrics reflowed to two columns, toolbar and footer controls wrapped, and fit-to-width kept the complete diagram and terminal symbols visible. |

## Fix verified in Chrome

Selecting a coil from lower rows could leave the upper part of its drawing above
the viewport. The slot anchor used `scrollIntoView` with `block: nearest`.
Changing this to `block: center` brings the selected coil into view. Selecting
cross-boundary U2-1 after the change showed its roof, slot conductors, continuation
identifier and lead together. Horizontal centering and reduced-motion handling
are preserved.

## Keyboard and narrow-viewport follow-up

The next goal turn audited current source and the prior browser evidence. The
interactive winding and harmonic SVG roots used `role="img"`, and Chrome's
accessibility tree had exposed only the entire image. Following the
[W3C graphics structure guidance](https://www.w3.org/TR/graphics-aria-1.0/) and
[keyboard focus guidance](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/#kbd_roving_tabindex),
the interactive roots now use named groups and preserve their button descendants.
One coil or harmonic is in the Tab sequence at a time; arrow keys and Home/End
navigate inside the graphic. Static SVG exports retain image semantics and omit
keyboard instructions and button state.

Verified in Chrome on the local development server:

- Coil controls appeared individually in the accessibility tree, with coil ID,
  slots, layers, turns, phase, branch and selected state.
- Clicking U1-1 selected it. Right then Enter focused and selected U1-2 and updated
  the inspector. Escape deselected it. One Tab moved to the crossover switch.
- In the harmonic chart, Right changed order 1 to 2 and updated numerical values;
  End selected order 25; Home restored order 1; Tab left the chart for the source link.
- DevTools Device Mode was set to width 390 and height 844 (both verified in its
  controls). The diagram fit to width at 28%; its toolbar, phase controls, leads,
  display switches and SVG export remained inside the narrow card.
- In that viewport, Open and Save had initially become unnamed buttons because
  their text spans were hidden. Added explicit labels and confirmed Chrome then
  reported “打开方案” and “保存方案”.
- This is viewport emulation, not testing on a physical phone. The Mac locked
  while preparing reduced-motion emulation. No reduced-motion command had been
  executed; animation performance and preference-change behavior remain unverified.
- The Chrome test window remained in device emulation when the lock occurred.
  Restore its original mode after the user unlocks the Mac.

Production-build server smoke check: the built Worker ran locally on port 3001
and returned HTTP 200. Its HTML contained both interactive group roles, both
mobile button names, and exactly two graphic Tab entries (one coil and one
harmonic). No server warning appeared for that request. Development HMR had
logged concurrent-renderer warnings and a hydration mismatch involving
Grammarly-injected body attributes; this server-only smoke check does not prove
the absence of client hydration or browser-console issues in the production build.

## Production browser follow-up — 2026-09-09

Mac access recovered. Chrome tested the built Worker at `http://localhost:3000/`
with no HMR client, initially source `7110dbeb21006cdc782769dd6184258ddcad233d`.
The native control connection needed one reset; a malformed address-bar entry
was corrected and the application title and exact local URL were verified before
recording the results below.

- The default production page's Console showed zero messages. DevTools Issues
  identified seven inputs without `id` or `name`. Added field names (and a name
  for the import input), rebuilt, and reloaded: Issues reported zero page errors,
  zero breaking changes, zero possible improvements, and “No issues detected”.
  That reload did emit `Unchecked runtime.lastError: Could not establish
  connection. Receiving end does not exist.` This appears to involve browser
  extension messaging; its exact origin was not confirmed. It is not a clean
  post-fix Console result, and must not be reported as such.
- Enabled both line tracing and MMF playback, then ran DevTools' CSS
  `prefers-reduced-motion: reduce` emulation. Tracing switched off and MMF changed
  from Pause to Play at about 23 degrees. Removed the emulation afterwards;
  the command menu again offered “Emulate … reduce”, confirming no override.
- With the 36-slot default design and both animations enabled, Chrome's FPS
  overlay showed 52.2 and 60.0 FPS in two screenshots of the MMF panel.
- Entered and verified 360 slots, 12 poles, 8 layers, 48 parallel paths. Automatic
  pitch selected 30; generation produced 1,440 coils and passed the connection
  checks. Fit-to-width showed the overall routing at 6% zoom. U-only reduced the
  visible count to 480; first-branch filtering reduced it to 10. At 100% zoom,
  the visible branch segment showed separated crossover levels, crossing bridges,
  direction markers, and its lead terminal. Individual details are not readable
  in the 6% overview; filtering, zoom, and horizontal scrolling are necessary.
- Restored all phases and all branches. With both animations enabled, the MMF
  panel screenshot showed 31.8 FPS; with tracing off and MMF alone it showed
  40.8 FPS. These are sparse overlay samples on this desktop with DevTools open,
  not a sustained benchmark, minimum guarantee, or timing of design generation.
  Large-model rendering performance remains an acceptance limitation.
- Stopped playback, restored the default preset, disabled Device Mode, removed
  reduced-motion emulation, hid the FPS overlay, and closed DevTools.

The local production runner now persists Wrangler state in the project's ignored
`.wrangler/state`, explicitly outside `dist/server`. Verified Wrangler resolves
this explicit path relative to the working directory. This prevents browser smoke
testing from adding runtime SQLite state to the deployment archive.

Still unverified: authenticated hosted interaction, physical mobile devices,
supported-browser WebMCP execution, sustained performance, and comparison with
actual commercial-software engineering samples.
