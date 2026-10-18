import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ReceiptIcon,
  TitleAndAvatar,
  PresenceSubtitle,
  ConversationHeader,
  ReplyQuoteBlock,
  MessageContent,
  MessageMetadata,
  ReactionsPillList,
  MessageBubble,
  MessageActionBar,
  MessageItem,
  MessageFlatList,
  AttachmentPickerButton,
  EncryptedTextInput,
  SendButton,
  MessageInputBar,
  ConversationView,
  ChatScreen,
} from '../../index.js';

test('Mobile UI: ReceiptIcon returns correct visual tokens for all lifecycle statuses', () => {
  assert.equal(ReceiptIcon({ status: 'PENDING' })?.label, 'Pending');
  assert.equal(ReceiptIcon({ status: 'SENT' })?.label, 'Sent');
  assert.equal(ReceiptIcon({ status: 'DELIVERED' })?.label, 'Delivered');
  assert.equal(ReceiptIcon({ status: 'READ' })?.label, 'Read');
  assert.equal(ReceiptIcon({ status: 'FAILED' })?.label, 'Failed');
});

test('Mobile UI: TitleAndAvatar renders lock badge and title correctly', () => {
  const result = TitleAndAvatar({ title: 'Alice & Bob', isEncrypted: true });
  assert.equal(result.component, 'TitleAndAvatar');
  assert.equal(result.props.title, 'Alice & Bob');
  assert.equal(result.props.lockBadge?.color, '#00A884');
});

test('Mobile UI: PresenceSubtitle accurately formats ONLINE, TYPING, and OFFLINE', () => {
  const typing = PresenceSubtitle({ state: 'TYPING', typingUserName: 'Alice' });
  assert.equal(typing.props.text, 'Alice is typing...');
  assert.equal(typing.props.color, '#00A884');

  const online = PresenceSubtitle({ state: 'ONLINE' });
  assert.equal(online.props.text, 'online');

  const offline = PresenceSubtitle({
    state: 'OFFLINE',
    lastSeen: new Date('2026-10-18T12:00:00Z').toISOString(),
  });
  assert.match(offline.props.text, /last seen today at/);
});

test('Mobile UI: MessageContent handles TEXT, IMAGE, FILE, and LINK types', () => {
  const textContent = MessageContent({ type: 'TEXT', text: 'Hello E2EE' });
  assert.equal(textContent.component, 'MessageContentText');

  const imgContent = MessageContent({
    type: 'IMAGE',
    text: 'Look at this photo',
    attachmentMeta: { thumbnailUrl: 'https://cdn.example.com/thumb.jpg', fileSizeBytes: 1024 },
  });
  assert.equal(imgContent.component, 'MessageContentImage');
  assert.equal(imgContent.isEncrypted, true);

  const fileContent = MessageContent({
    type: 'FILE',
    attachmentMeta: { fileName: 'contract.pdf', fileSizeBytes: 50000, mimeType: 'application/pdf' },
  });
  assert.equal(fileContent.component, 'MessageContentFile');
  assert.equal(fileContent.fileName, 'contract.pdf');

  const linkContent = MessageContent({
    type: 'LINK',
    linkMeta: { url: 'https://signal.org', title: 'Signal Messenger' },
  });
  assert.equal(linkContent.component, 'MessageContentLink');
  assert.equal(linkContent.url, 'https://signal.org');
});

test('Mobile UI: ReactionsPillList calculates total count and highlights reacted pill', () => {
  const reactions = ReactionsPillList({
    reactions: [
      { emoji: '👍', count: 3, userReacted: true },
      { emoji: '❤️', count: 5, userReacted: false },
    ],
  });
  assert.ok(reactions);
  assert.equal(reactions.props.totalCount, 8);
  assert.equal(reactions.props.pills[0]?.userReacted, true);
  assert.equal(reactions.props.pills[0]?.borderColor, '#00A884');
});

test('Mobile UI: MessageActionBar displays edit for sender within window and delete options', () => {
  const senderMenu = MessageActionBar({
    messageId: 'msg-1',
    isOutgoing: true,
    canEdit: true,
  });
  const actionIds = senderMenu.actions.map((a) => a.id);
  assert.ok(actionIds.includes('reply'));
  assert.ok(actionIds.includes('copy'));
  assert.ok(actionIds.includes('edit'));
  assert.ok(actionIds.includes('delete_everyone'));
  assert.ok(actionIds.includes('delete_me'));

  const recipientMenu = MessageActionBar({
    messageId: 'msg-1',
    isOutgoing: false,
    canEdit: false,
  });
  const recipientIds = recipientMenu.actions.map((a) => a.id);
  assert.ok(!recipientIds.includes('edit'));
  assert.ok(!recipientIds.includes('delete_everyone'));
  assert.ok(recipientIds.includes('delete_me'));
});

test('Mobile UI: Input bar guards 10MB attachments and 4,096 char limits', () => {
  const attach = AttachmentPickerButton({ maxSizeBytes: 10 * 1024 * 1024 });
  assert.equal(attach.props.maxSizeBytes, 10485760);

  const inputNearLimit = EncryptedTextInput({
    value: 'A'.repeat(4050),
    maxLength: 4096,
  });
  assert.equal(inputNearLimit.props.isNearLimit, true);
  assert.equal(inputNearLimit.props.isOverLimit, false);
  assert.equal(inputNearLimit.props.charactersRemaining, 46);

  const sendBtnActive = SendButton({ canSend: true });
  assert.equal(sendBtnActive.props.mode, 'SEND');

  const sendBtnVoice = SendButton({ canSend: false });
  assert.equal(sendBtnVoice.props.mode, 'VOICE_RECORD');
});

test('Mobile UI: Full ChatScreen component tree renders cleanly with all parent-child tiers', () => {
  const screen = ChatScreen({
    conversationId: 'c1111111-2222-3333-4444-555555555555',
    conversationTitle: 'Engineering Core',
    currentUserId: 'u1',
    currentDeviceId: 'd1',
    presenceState: 'ONLINE',
    messages: [
      {
        id: 'm1',
        plaintext: 'Hi team, checking in on E2EE keys',
        isOutgoing: false,
        timestamp: new Date().toISOString(),
        status: 'READ',
      },
      {
        id: 'm2',
        plaintext: 'All ratchet keys synchronized smoothly!',
        isOutgoing: true,
        timestamp: new Date().toISOString(),
        status: 'DELIVERED',
        isEdited: true,
      },
    ],
    inputValue: 'Ready for release.',
  });

  assert.equal(screen.component, 'ChatScreen');
  assert.equal(screen.conversationId, 'c1111111-2222-3333-4444-555555555555');

  const tree = screen.renderedTree;
  assert.equal(tree.component, 'ConversationView');
  assert.equal(tree.children.header.component, 'ConversationHeader');
  assert.equal(tree.children.viewport.component, 'MessageFlatList');
  assert.equal(tree.children.viewport.renderedRows.length, 2);
  assert.equal(tree.children.footer.component, 'MessageInputBar');
});
