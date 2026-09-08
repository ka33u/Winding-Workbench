# Browser acceptance — 2026-09-08

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
