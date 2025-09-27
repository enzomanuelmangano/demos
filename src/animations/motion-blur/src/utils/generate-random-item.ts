// Types
export type Item = {
  id: number;
  amount: string;
  address: string;
  emoji: string;
};

// Helper function to generate random items
export const generateRandomItem = (id: number): Item => {
  const emojis = [
    '🫠',
    '💪',
    '🤔',
    '😎',
    '🚀',
    '💡',
    '🌈',
    '🍕',
    '🎉',
    '🦄',
    '🌟',
    '🍀',
    '🎸',
    '🏆',
    '🌺',
    '🍦',
    '🐱',
    '🐶',
    '🦋',
    '🌴',
    '⚡️',
    '🔥',
    '❄️',
    '🌊',
    '🎨',
    '📚',
    '🧠',
    '🧘',
    '🏄',
    '🚴',
    '🏋️',
    '🧗',
    '🎭',
    '🎬',
    '🎧',
    '📷',
  ];
  return {
    id,
    amount: `$ ${(Math.random() * 10000).toFixed(2)}`,
    address: `0x${Math.random().toString(16).substring(2, 5)}..${Math.random()
      .toString(16)
      .substring(2, 4)}`,
    emoji: emojis[Math.floor(Math.random() * emojis.length)],
  };
};
