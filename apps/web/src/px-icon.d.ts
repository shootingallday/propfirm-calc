import 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'px-icon': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { name: string };
    }
  }
}
