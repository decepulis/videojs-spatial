import { useMemo, useState } from 'react';

/**
 * Whether a pointer is held on any element the handlers are spread onto, so a
 * group of models can share one `--press` and react together in CSS.
 */
export function usePress() {
  const [pressed, setPressed] = useState(false);

  const handlers = useMemo(() => {
    const release = () => setPressed(false);
    return {
      onPointerDown: () => setPressed(true),
      onPointerUp: release,
      onPointerCancel: release,
      onPointerLeave: release,
    };
  }, []);

  return [pressed, handlers] as const;
}
