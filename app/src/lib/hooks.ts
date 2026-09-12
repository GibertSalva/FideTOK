"use client";

import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";

type LoaderState<T> = { data: T | null; error: string | null; loading: boolean };

/**
 * Carga asincronica que se repite cuando cambian las dependencias.
 * `reload()` devuelve una promesa que se resuelve cuando termina la nueva carga.
 */
export function useLoader<T>(load: () => Promise<T>, deps: DependencyList) {
  const [state, setState] = useState<LoaderState<T>>({ data: null, error: null, loading: true });
  const [version, setVersion] = useState(0);
  const waiting = useRef<Array<() => void>>([]);

  useEffect(() => {
    let cancelled = false;
    const settle = (next: (previous: LoaderState<T>) => LoaderState<T>) => {
      if (cancelled) return;
      setState(next);
      const resolvers = waiting.current;
      waiting.current = [];
      resolvers.forEach((resolve) => resolve());
    };
    load().then(
      (data) => settle(() => ({ data, error: null, loading: false })),
      (error: unknown) =>
        settle((previous) => ({ ...previous, error: error instanceof Error ? error.message : String(error), loading: false })),
    );
    return () => {
      cancelled = true;
    };
    // Las dependencias las define quien llama (como en useEffect).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  const reload = useCallback(
    () =>
      new Promise<void>((resolve) => {
        waiting.current.push(resolve);
        setVersion((value) => value + 1);
      }),
    [],
  );

  return { ...state, reload };
}
