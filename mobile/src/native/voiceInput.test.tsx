import React from 'react';
import { Text, View } from 'react-native';
import { act, create } from 'react-test-renderer';
import { useVoiceInput } from './voiceInput';

const mockListeners = new Map<string, Set<(event: any) => void>>();
const mockSpeechRecognitionModule = {
  addListener: jest.fn((name: string, listener: (event: any) => void) => {
    const listeners = mockListeners.get(name) || new Set<(event: any) => void>();
    listeners.add(listener);
    mockListeners.set(name, listeners);
    return { remove: jest.fn(() => listeners.delete(listener)) };
  }),
  requestMicrophonePermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  isRecognitionAvailable: jest.fn().mockReturnValue(true),
  start: jest.fn(),
  stop: jest.fn(),
  abort: jest.fn(),
};

jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: mockSpeechRecognitionModule,
}));

function emit(name: string, event: Record<string, unknown> = {}) {
  mockListeners.get(name)?.forEach((listener) => listener(event));
}

function Harness({ value, onChangeText }: { value: string; onChangeText: (value: string) => void }) {
  const voice = useVoiceInput({
    language: 'zh',
    existingText: value,
    onChangeText,
  });
  return (
    <View>
      <Text testID="status">{voice.status}</Text>
      <Text testID="transcript">{voice.liveTranscript}</Text>
      <Text testID="start" onPress={voice.start}>start</Text>
      <Text testID="stop" onPress={voice.stop}>stop</Text>
    </View>
  );
}

describe('useVoiceInput', () => {
  let activeTree: ReturnType<typeof create> | null = null;

  beforeEach(() => {
    mockListeners.clear();
    jest.clearAllMocks();
    mockSpeechRecognitionModule.requestMicrophonePermissionsAsync.mockResolvedValue({ granted: true });
    mockSpeechRecognitionModule.isRecognitionAvailable.mockReturnValue(true);
  });

  afterEach(async () => {
    await act(async () => {
      activeTree?.unmount();
    });
    activeTree = null;
  });

  it('appends final recognition results to the existing draft', async () => {
    const onChangeText = jest.fn();

    await act(async () => {
      activeTree = create(<Harness value="已有内容" onChangeText={onChangeText} />);
    });
    await act(async () => {
      await activeTree!.root.findByProps({ testID: 'start' }).props.onPress();
    });

    expect(mockSpeechRecognitionModule.start).toHaveBeenCalledWith(expect.objectContaining({
      lang: 'zh-CN',
      continuous: true,
      interimResults: true,
    }));

    await act(async () => {
      emit('start');
      emit('result', { isFinal: false, results: [{ transcript: '新的' }] });
    });
    expect(activeTree!.root.findByProps({ testID: 'transcript' }).props.children).toBe('新的');

    await act(async () => {
      emit('result', { isFinal: true, results: [{ transcript: '新的内容' }] });
      activeTree!.root.findByProps({ testID: 'stop' }).props.onPress();
      emit('end');
    });

    expect(onChangeText).toHaveBeenCalledWith('已有内容 新的内容');
    expect(activeTree!.root.findByProps({ testID: 'status' }).props.children).toBe('idle');
  });
});
