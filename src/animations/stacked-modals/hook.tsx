import { useCallback } from 'react';

import { useModal } from './hooks/use-modal';

// This is more complicated than it needs to be.
// The idea is to show a series of modals, and then when the last one is dismissed,
// it will show the first one again.

// You can very easily use it by running just:
// showModal({
//   key: 'modal1',
//   title: 'Modals are fun!',
//   message: "They're versatile, attention-grabbing, and when used appropriately, can significantly enhance the user experience.",
//   onConfirm: () => {
//     showModal({
//       key: 'modal2',
//       title: 'Modals are fun!',
//       message: "They're versatile, attention-grabbing, and when used appropriately, can significantly enhance the user experience.",
//     })
//   },
//   onDismiss: () => {
//     // Do something
//   },
// })
export const useDemoStackedModal = () => {
  const { showModal, clearModal } = useModal();

  const showNextModal = useCallback(
    (
      modals: {
        key: string;
        title: string;
        message: string;
        onConfirm?: () => void;
        onDismiss?: () => void;
      }[],
      index = 0,
    ) => {
      if (index >= modals.length) return;

      const currentModal = modals[index];
      showModal({
        ...currentModal,
        onConfirm: () => {
          if (currentModal.onConfirm) {
            currentModal.onConfirm();
          }
          showNextModal(modals, index + 1);
        },
        onDismiss: () => {
          if (currentModal.onDismiss) {
            currentModal.onDismiss();
          }

          showNextModal(modals, index + 1);
        },
      });
    },
    [showModal],
  );

  const onPress = useCallback(() => {
    const modals = [
      {
        key: 'modal1',
        title: 'Modals are fun!',
        message:
          "They're versatile, attention-grabbing, and when used appropriately, can significantly enhance the user experience.",
      },
      {
        key: 'modal2',
        title: 'Stacked Modals are really fun!',
        message:
          "Yep, they are slightly tricky to get right.\n\nBy confirming you'll find the source code at reactiive.io/demos",
      },
      {
        key: 'modal3',
        title: 'Wait what?',
        message: "You might want to reconsider don't you?",
      },
      {
        key: 'modal4',
        title: 'Are you sure?',
        message: 'You might regret this for the rest of your life.',
      },
      {
        key: 'modal5',
        title: 'Ok, you win.',
        message: 'You can go now, but remember...',
      },
      {
        key: 'modal6',
        title: '...the past is always with you.',
        message: 'Just like the shadow that follows you everywhere.',
      },
      {
        key: 'modal7',
        title: 'You can dismiss me',
        message:
          'But you can also dismiss all the modals by tapping the backdrop',
        onDismiss: () => {
          clearModal('modal7');
        },
      },
    ];

    showNextModal(modals);
  }, [showNextModal, clearModal]);

  return {
    onPress,
  };
};
