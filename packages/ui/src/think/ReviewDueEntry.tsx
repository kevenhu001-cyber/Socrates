/**
 * RN-14 — the restrained way into flashcard review from the learning
 * modes: one quiet capsule ("3 cards due for review today") with the same
 * hairline ring as every other pill. The host shows it only while cards
 * are due and opens the review (packages/ui/src/learn/ReviewSession) on
 * press. No count badge, no colour, no dot.
 */
import { View } from 'react-native';
import { S } from '../look';
import { PillAction } from '../learn/parts';

export interface ReviewDueEntryProps {
  label: string;
  onPress: () => void;
  testID?: string;
}

export function ReviewDueEntry({ label, onPress, testID = 'review-due-entry' }: ReviewDueEntryProps) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', paddingTop: S[100] }}>
      <PillAction size="sm" label={label} onPress={onPress} testID={testID} data={{ reviewEntry: '1' }} />
    </View>
  );
}
