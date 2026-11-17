import type { ComponentProps } from 'react';

export type Part = 'tray' | 'puck' | 'play' | 'pause' | 'tile' | 'buffer' | 'fill' | 'thumb';

type ModelProps = Omit<ComponentProps<'model'>, 'src'> & { part: Part };

/** A `<model>` for one of the generated USDZ files. Styled by `[data-part]` in spatial.css. */
export function Model({ part, ...props }: ModelProps) {
  return <model src={`${import.meta.env.BASE_URL}models/${part}.usdz`} data-part={part} {...props} />;
}
