const memory = new Map<string, string>();

export async function getItem(key: string) {
  return memory.get(key) || null;
}

export async function setItem(key: string, value: string) {
  memory.set(key, value);
}

export async function deleteItem(key: string) {
  memory.delete(key);
}
