import 'react';

declare module 'react' {
  // <model> is in the spatial preview but not in React's types (or most browsers).
  namespace JSX {
    interface IntrinsicElements {
      model: DetailedHTMLProps<HTMLAttributes<HTMLElement> & { src?: string }, HTMLElement>;
    }
  }

  // Custom properties in `style`, which is how state reaches spatial.css.
  interface CSSProperties {
    [property: `--${string}`]: string | number | undefined;
  }
}
