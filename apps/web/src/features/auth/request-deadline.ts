/** Older iOS browsers may lack AbortSignal.any/timeout. Keep cancellation working. */
export function requestDeadline(
  ms: number,
  external?: AbortSignal | null,
): AbortSignal {
  if (
    typeof AbortSignal.timeout === "function" &&
    (!external || typeof AbortSignal.any === "function")
  ) {
    const timeout = AbortSignal.timeout(ms);
    return external ? AbortSignal.any([external, timeout]) : timeout;
  }
  const controller = new AbortController();
  const cancel = () => {
    clearTimeout(timer);
    controller.abort(external?.reason);
  };
  const timer = setTimeout(() => {
    external?.removeEventListener("abort", cancel);
    controller.abort(new DOMException("请求等待超时", "TimeoutError"));
  }, ms);
  timer.unref?.();
  if (external?.aborted) {
    clearTimeout(timer);
    cancel();
  } else external?.addEventListener("abort", cancel, { once: true });
  return controller.signal;
}
