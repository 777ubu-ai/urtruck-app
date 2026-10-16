// A picker owns one scheduler; cleanup cancels pending work on close/unmount.
export function createPickerSearchScheduler({
  delay = 250,
  scheduleTimer = setTimeout,
  cancelTimer = clearTimeout,
} = {}) {
  let timer = null;
  let generation = 0;
  const cancel = () => {
    generation += 1;
    if (timer !== null) cancelTimer(timer);
    timer = null;
  };
  return {
    cancel,
    schedule(value, commit) {
      cancel();
      const current = generation;
      timer = scheduleTimer(() => {
        if (current !== generation) return;
        timer = null;
        commit(value);
      }, delay);
    },
  };
}
