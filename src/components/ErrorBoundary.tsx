import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
  key: number;
}

/**
 * Si algo falla al dibujar, en vez de dejar la pantalla en blanco muestra qué ha pasado
 * y deja volver a la app. Los datos no se tocan (viven en el almacenamiento, no en la pantalla).
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, key: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('La Cuenta: error al dibujar', error, info.componentStack);
  }

  render() {
    const { error, key } = this.state;
    if (!error) return <div key={key} className="contents">{this.props.children}</div>;
    return (
      <div className="grid min-h-dvh place-items-center bg-paper px-6 text-center">
        <div className="max-w-sm">
          <p className="font-serif text-[40px] leading-none">
            Vaya<span className="text-terracotta">.</span>
          </p>
          <p className="mt-3 text-[15px] text-muted">
            Algo ha fallado al mostrar esta pantalla. Tus datos están a salvo. Haz una captura de esto para arreglarlo:
          </p>
          <pre className="mt-3 max-h-40 overflow-auto rounded-xl bg-sand p-3 text-left font-mono text-[11px] whitespace-pre-wrap text-ink">
            {error.message}
            {'\n'}
            {(error.stack ?? '').split('\n').slice(0, 4).join('\n')}
          </pre>
          <div className="mt-5 grid gap-2">
            <button
              type="button"
              onClick={() => this.setState({ error: null, key: key + 1 })}
              className="rounded-full bg-terracotta py-3.5 font-semibold text-white"
            >
              Volver a la app
            </button>
            <button type="button" onClick={() => location.reload()} className="rounded-full bg-sand py-3 font-semibold">
              Recargar
            </button>
          </div>
        </div>
      </div>
    );
  }
}
