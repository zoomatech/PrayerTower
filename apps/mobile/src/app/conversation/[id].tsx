// One conversation, full screen (on wide windows the Messages tab also shows it beside the list).
import { useLocalSearchParams } from 'expo-router';

import { ConversationPane } from '@/components/conversation-pane';
import { Screen } from '@/components/ui';

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen>
      <ConversationPane id={id} />
    </Screen>
  );
}
