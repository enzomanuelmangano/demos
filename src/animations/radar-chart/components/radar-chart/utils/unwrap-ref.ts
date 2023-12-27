// The point is that we want to handle both normal values and skia values in the same way.
// So that's a way of normalizing the values in the same way.
const unwrapRef = <T>(item: T | { current: T }): { current: T } => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  if ('current' in item) {
    return item;
  }
  return { current: item };
};

export { unwrapRef };
