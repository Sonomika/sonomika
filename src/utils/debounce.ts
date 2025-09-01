export type DebouncedFunction<T extends (...args: any[]) => any> = ((...args: Parameters<T>) => void) & {
  cancel: () => void
  flush: () => void
}

export function debounce<T extends (...args: any[]) => any>(fn: T, wait: number = 150): DebouncedFunction<T> {
  let timeoutId: number | undefined
  let lastArgs: Parameters<T> | undefined
  let lastThis: any

  const debounced = function(this: any, ...args: Parameters<T>) {
    lastArgs = args
    lastThis = this
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId)
    }
    timeoutId = window.setTimeout(() => {
      timeoutId = undefined
      fn.apply(lastThis, lastArgs as Parameters<T>)
    }, wait)
  } as DebouncedFunction<T>

  debounced.cancel = () => {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId)
      timeoutId = undefined
    }
  }

  debounced.flush = () => {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId)
      timeoutId = undefined
      fn.apply(lastThis, lastArgs as Parameters<T>)
    }
  }

  return debounced
}


