import { useEffect, useState } from 'react';

export function hasWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      canvas.getContext('webgl2') ||
        canvas.getContext('webgl') ||
        canvas.getContext('experimental-webgl'),
    );
  } catch {
    return false;
  }
}

/** Проверка WebGL при монтировании (SSR-friendly). */
export function useWebGL(): boolean {
  const [supported, setSupported] = useState(true);
  useEffect(() => {
    setSupported(hasWebGL());
  }, []);
  return supported;
}
