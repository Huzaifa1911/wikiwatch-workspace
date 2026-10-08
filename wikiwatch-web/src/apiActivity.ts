// One activity state for concurrent backend and Wikipedia requests.
export function createApiActivity({delay = 180, minimum = 300, settle = 120} = {}) {
  let pending = 0, visible = false, shownAt = 0;
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: boolean) => {
    if (visible === next) return;
    visible = next;
    listeners.forEach(listener => listener());
  };
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {listeners.delete(listener);};
    },
    getSnapshot: () => visible,
    begin() {
      pending++;
      clearTimeout(hideTimer);
      if (!visible && !showTimer) showTimer = setTimeout(() => {
        showTimer = undefined;
        if (pending) {shownAt = Date.now(); publish(true);}
      }, delay);
      let finished = false;
      return () => {
        if (finished) return;
        finished = true;
        pending--;
        if (pending) return;
        clearTimeout(showTimer);
        showTimer = undefined;
        if (visible) hideTimer = setTimeout(() => {
          if (!pending) publish(false);
        }, Math.max(settle, minimum - (Date.now() - shownAt)));
      };
    },
  };
}
export const apiActivity = createApiActivity();
export async function withApiActivity<T>(operation: () => Promise<T>): Promise<T> {
  const finish = apiActivity.begin();
  try {return await operation();} finally {finish();}
}
