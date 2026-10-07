import { Share } from 'react-native';

export async function shareText(title: string, content: string): Promise<'shared'> {
  await Share.share({ title, message: content });
  return 'shared';
}
