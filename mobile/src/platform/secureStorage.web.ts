const memory = new Map<string, string>();

function read(key: string) {
  try {
    return typeof localStorage === 'undefined' ? memory.get(key) || null : localStorage.getItem(key);
  } catch {
    return memory.get(key) || null;
  }
}

function write(key: string, value: string) {
  try {
    if (typeof localStorage === 'undefined') memory.set(key, value);
    else localStorage.setItem(key, value);
  } catch {
    memory.set(key, value);
  }
}

function remove(key: string) {
  try {
    if (typeof localStorage === 'undefined') memory.delete(key);
    else localStorage.removeItem(key);
  } catch {
    memory.delete(key);
  }
}

export async function getItem(key: string) {
  return read(key);
}

export async function setItem(key: string, value: string) {
  write(key, value);
}

export async function deleteItem(key: string) {
  remove(key);
}
