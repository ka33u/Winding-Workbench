'use client';
import { useEffect, useRef, useState } from 'react';

/** Keep the user's play setting while suspending work the browser cannot show. */
export function useAnimationVisibility<T extends HTMLElement>() {
  const target = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = target.current;
    if (!element) return;
    let inViewport = false;
    const update = () => setVisible(inViewport && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      inViewport = entry.isIntersecting;
      update();
    });
    observer.observe(element);
    document.addEventListener('visibilitychange', update);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return { target, visible };
}
