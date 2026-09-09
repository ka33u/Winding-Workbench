# Browser acceptance — 2026-09-09

Current scope: the user's latest instruction limits winding layers to one or two.
Earlier 4/8-layer and 1,440-coil checks below are historical, not supported current
configurations or outstanding performance requirements.

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

At that point, authenticated hosted interaction, physical mobile devices,
WebMCP execution, sustained performance and commercial engineering comparison
remained unverified. Subsequent evidence is recorded below.

## Animation visibility and two-layer scope follow-up

The user's latest instruction limits the application to single- and double-layer
windings. Removed higher-layer choices and layer-pair filtering; generation,
automatic pitch, import, saved-project restore and WebMCP use the same validation.
Unsupported layer counts return E_RANGE_LAYERS with a single/double-layer remedy.
Old multilayer files are rejected rather than silently converted.

Before that scope change, the new visibility-aware animation logic was tested on
the local production Worker. With MMF playback enabled, scrolling its panel out
of view held the angle at 251.965 degrees across observations; bringing the
heading back into view resumed progress to 271.215 degrees without pressing Play.
Line tracing now uses a paused CSS animation when its diagram is outside the
viewport, and the MMF requestAnimationFrame loop is suspended when not visible.
The hook also responds to document visibility; a background-tab transition has
not yet been verified through the UI. The old eight-layer case gave two 39.5 FPS
samples with both animations enabled, versus the earlier 31.8 sample. These are
not sustained benchmarks and are no longer the product's maximum-size target.

This browser run also identified an unreferenced favicon: the browser requested
/favicon.ico and received 404 although /favicon.svg exists. Added metadata that
references the existing SVG. Post-build browser verification follows below.

After the two-layer change, restarted the production Worker and hard-reloaded
Chrome. The layer menu's complete accessible option list was “单层 双层”. Choosing
single layer and generating 36 slots / 4 poles / 2 paths produced 18 coils and
six coils per phase. Returning to the classic preset rendered a 36-coil double-
layer diagram; the screenshot showed the form and heading both saying 双层.
Chrome's AX value was briefly stale while that field was offscreen, so the
visible screenshot was used to confirm the final state. The FPS overlay and
DevTools were closed, and tracing and playback were off.

An attempted UI import of `/private/tmp/winding-invalid-layers-4.json` stopped at
the native file picker, whose Open control stayed disabled; it was cancelled.
The application-level rejection is verified by automated generation, automatic-
pitch, import and WebMCP tests, not by this incomplete file-picker attempt.
The production request log confirmed `/favicon.svg` returned HTTP 200 after the
metadata fix. The current 34-test suite passes; its 300 single/double-layer
parameter combinations comprise 232 accepted designs and 68 reasoned rejections.

## User's 54-slot / 8-pole / double-layer / pitch-6 case

The in-app browser now supports local production interaction. Its WebMCP tools
registered and executed: 36-slot single-layer generation returned18 coils;
double-layer returned36; requesting layer4 returned E_RANGE_LAYERS and left the
previous valid72-coil design unchanged. Phase switching also updated the visible
diagram. Warning/error logs captured at that checkpoint were empty; this is not
a guarantee that every browser session has no errors.

On the user's54-slot case,2 paths produced54 coils,18 per phase,9 per branch,
kw1=0.9409528389575208 and possiblePaths=[1,2]. The desktop screenshot showed
separated lower routing lanes, explicit bridges and unobscured direction arrows
in the visible area. The390x844 viewport showed theU-only18-coil drawing, all
four view tabs and the branch/zoom controls; the wide diagram scrolls internally.
The viewport override was reset after inspection. This is device emulation,
not a physical-phone test.

After rebuilding the error explanation, started a fresh local production Worker
at localhost:3001 (the previous retained process handle was missing), verified
HTTP200, and navigated the existing local test tab there. Through the actual
form, changing2 to4 paths and pressing Generate displayed E_PATH_COIL_COUNT and
the calculation “每相18个；4路需要每路4.5个线圈”. Restoring2 regenerated the valid
design. U-phase filtering showed18 coils; selecting branch1 showed9 in both the
unrolled heading and table. The circuit view screenshot showed the same nine-
coil branch. The35-test suite, typecheck, lint and production build passed.

Hosted navigation/AX inspection timed out twice despite the published tab title
being present in the browser inventory. No authenticated hosted interaction pass
is claimed. The earlier file chooser attempt also timed out before fixture
assignment. Sustained animation performance, background-tab behavior, actual
commercial-file comparison and physical-device coverage remain open.

## Named MMF control and sustained maximum-model observation

The in-app AX tree exposed the MMF range input as an unnamed slider: its label
had been applied to the surrounding Slider root instead of reaching the input.
Replaced that attribute with an aria-labelledby reference to the visible
“电流相角” text. The installed Base UI1.7 root passes that reference to the thumb
input; no vendored component was changed. After a production rebuild/restart and
reload, AX reported “slider 电流相角”, and querying that named slider succeeded.
Starting playback then pressing Home set0 and paused playback. ArrowRight set1;
End set360; Home returned0. Typecheck, lint and production build passed.

Generated360 slots /12 poles /12 paths /double layers through the form, producing
360 coils and automatic pitch30. With MMF visible and tracing off,13 DOM angle
observations spanned82.87 seconds. Eleven intervals of about5.04 seconds each
advanced at34.91–35.10 degrees/second, consistent with the requested35-degree
playback rate. One27.43-second gap between observation calls was excluded from
rate calculation because the angle could complete multiple turns. These are
coarse angle-continuity measurements, not browser frame-rate measurements; brief
frame drops are not excluded. The read-only browser evaluator does not expose
the performance clock needed by the attempted finer timing observation.

Selecting a second local tab left the original document reporting visible and
its angle advancing. This in-app-browser run therefore did not exercise the
document.hidden branch of the pause hook. The temporary tab was closed, playback
paused, and the user's54/8/a2/double/automaticy6 case restored with angle0. A
fresh captured warning/error log query returned no entries. Standard-browser
background-tab suspension and actual frame-rate profiling remain unverified.
