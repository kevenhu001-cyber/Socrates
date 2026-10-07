export async function shareText(_title: string, _content: string): Promise<'shared' | 'copied'> {
  throw new Error('Sharing is unavailable on this platform');
}
