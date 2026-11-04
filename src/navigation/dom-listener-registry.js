// SPDX-License-Identifier: Apache-2.0
function resolveListener(owner, listenerOrMethodName, boundListeners) {
  if (typeof listenerOrMethodName === "function") {
    return listenerOrMethodName;
  }

  if (typeof listenerOrMethodName !== "string") {
    return null;
  }

  if (!boundListeners.has(listenerOrMethodName)) {
    const method = owner?.[listenerOrMethodName];
    if (typeof method !== "function") {
      throw new Error(
        `createDomListenerRegistry: missing method ${listenerOrMethodName}`
      );
    }

    boundListeners.set(listenerOrMethodName, method.bind(owner));
  }

  return boundListeners.get(listenerOrMethodName);
}

/**
 * Create a registry that binds DOM listeners for a shared runtime owner and can clear them as a group.
 * Purpose: centralize addEventListener and removeEventListener lifecycle for navigation and HUD input classes while allowing call sites to register listeners by bound function or owner method name.
 * @param {any} owner Listener owner whose named methods may be resolved and bound when string listener identifiers are supplied.
 * @returns {{listen: (target: any, eventName: string, listenerOrMethodName: string | Function, options?: AddEventListenerOptions | boolean) => () => void, clear: () => void}} Registry with `listen(...)` for attaching a listener and receiving an unsubscribe function plus `clear()` for removing every active listener and clearing cached bound methods.
 * Side effects: does not register listeners immediately, but returned `listen(...)` calls attach DOM event listeners to the provided targets, cache bound owner methods, and mutate internal cleanup state until `clear()` or the returned stop function removes them.
 */
export function createDomListenerRegistry(owner) {
  const boundListeners = new Map();
  const cleanupFns = [];

  function listen(target, eventName, listenerOrMethodName, options) {
    if (!target?.addEventListener) {
      return () => {};
    }

    const listener = resolveListener(owner, listenerOrMethodName, boundListeners);
    if (typeof listener !== "function") {
      return () => {};
    }

    target.addEventListener(eventName, listener, options);

    let isActive = true;
    const stopListening = () => {
      if (!isActive) {
        return;
      }

      isActive = false;
      target.removeEventListener(eventName, listener, options);
      const index = cleanupFns.indexOf(stopListening);
      if (index > -1) {
        cleanupFns.splice(index, 1);
      }
    };

    cleanupFns.push(stopListening);
    return stopListening;
  }

  function clear() {
    while (cleanupFns.length > 0) {
      cleanupFns.pop()();
    }
    boundListeners.clear();
  }

  return {
    clear,
    listen,
  };
}
