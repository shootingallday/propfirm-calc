import 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'ui-icon': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { name: string };
    }
  }
}
