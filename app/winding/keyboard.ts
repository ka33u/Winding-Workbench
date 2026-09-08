import type { KeyboardEvent } from 'react';

// Keep one Tab stop in a potentially large drawing; arrow keys move within it.
export function moveGraphicFocus(
  event: KeyboardEvent<SVGGElement>,
  attribute: 'data-coil-id' | 'data-harmonic-order',
) {
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
  if (!keys.includes(event.key) || event.altKey || event.ctrlKey || event.metaKey)
    return null;
  const items = Array.from(
    event.currentTarget.ownerSVGElement?.querySelectorAll<SVGGElement>(
      `[${attribute}]`,
    ) ?? [],
  );
  const index = items.indexOf(event.currentTarget);
  if (index < 0) return null;
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : Math.max(
            0,
            Math.min(
              items.length - 1,
              index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1),
            ),
          );
  event.preventDefault();
  const target = items[next];
  target.focus({ preventScroll: true });
  (target.querySelector('[data-coil-anchor]') ?? target).scrollIntoView({
    block: 'center',
    inline: 'center',
    behavior: 'instant',
  });
  return target.getAttribute(attribute);
}
