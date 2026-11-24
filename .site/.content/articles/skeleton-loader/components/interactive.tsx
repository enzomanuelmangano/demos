'use client';

import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useState,
} from 'react';

import {
  InteractiveBox,
  InteractiveForwardRefProps,
} from '@/components/interactive';
import { RN_TEXT } from '@/lib/rn-text';

export type ContactInfo = {
  name: string;
  email: string;
};

/**
 * Porting di `<Skeleton>` di moti/skeleton (colorMode dark, transition timing
 * 1000ms): un gradiente che scorre orizzontalmente in loop.
 */
const Skeleton = ({
  width,
  height,
  radius,
}: {
  width: number;
  height: number;
  radius?: 'round' | number;
}) => (
  <div
    style={{
      width,
      height,
      borderRadius: radius === 'round' ? height / 2 : (radius ?? 8),
      background:
        'linear-gradient(90deg, #1b1b1b 25%, #3a3a3a 50%, #1b1b1b 75%)',
      backgroundSize: '200% 100%',
      animation: 'skeleton-shimmer 1s linear infinite',
    }}
  />
);

const ContactListSkeleton = () => (
  <div style={styles.container}>
    <Skeleton radius="round" height={50} width={50} />
    <div style={styles.content}>
      <Skeleton height={20} width={180} />
      <div style={styles.spacer} />
      <Skeleton height={15} width={160} />
    </div>
  </div>
);

type ContactListItemProps = {
  contact?: ContactInfo | null;
};

const FADE_IN = 'opacity-0 animate-[fadeIn_1000ms_ease-out_forwards]';
const FADE_IN_SLOW = 'opacity-0 animate-[fadeIn_1500ms_ease-out_forwards]';

const ContactListItem: React.FC<ContactListItemProps> = ({ contact }) => {
  const isLoading = contact == null;

  if (isLoading) {
    return <ContactListSkeleton />;
  }

  return (
    <div style={styles.container} className={FADE_IN}>
      <div style={{ ...styles.circleContainer, ...styles.avatar }}>
        <span style={styles.avatarText}>{contact.name?.[0]}</span>
      </div>
      <div style={styles.content}>
        <span className={FADE_IN_SLOW} style={styles.nameText}>
          {contact.name}
        </span>
        <div style={styles.spacer} />
        <span className={FADE_IN_SLOW} style={styles.emailText}>
          {contact.email}
        </span>
      </div>
    </div>
  );
};

const styles = {
  container: {
    width: 320,
    height: 90,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 20,
    paddingRight: 20,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#ffffff37',
    backgroundColor: '#ffffff04',
    borderRadius: 12,
  },
  avatar: {
    height: 50,
    width: 50,
    borderRadius: 35,
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    marginLeft: 15,
  },
  circleContainer: {
    display: 'flex',
    backgroundColor: '#005CB7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    ...RN_TEXT,
    fontSize: 25,
    color: 'white',
  },
  nameText: {
    ...RN_TEXT,
    fontSize: 18,
    color: '#ffffff',
  },
  emailText: {
    ...RN_TEXT,
    fontSize: 15,
    color: '#d4d4d4',
  },
  spacer: {
    height: 5,
  },
  interactiveContainer: {
    display: 'flex',
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
} satisfies Record<string, React.CSSProperties>;

const DEFAULT_CONTACT = {
  name: 'John Doe',
  email: 'john.doe@example.com',
};

const ContactItemContainer = forwardRef<InteractiveForwardRefProps>(
  (_, ref) => {
    const [contact, setContact] = useState<ContactInfo | null>(DEFAULT_CONTACT);

    const fetchContacts = useCallback(async (delay?: number) => {
      setContact(null);
      await new Promise((resolve) => setTimeout(resolve, delay ?? 0));
      setContact(DEFAULT_CONTACT);
    }, []);

    useImperativeHandle(ref, () => ({
      reset: () => {},
      play: () => {
        fetchContacts(2000);
      },
      pause: () => {},
    }));

    return (
      <div style={styles.interactiveContainer}>
        <ContactListItem contact={contact} />
      </div>
    );
  }
);

ContactItemContainer.displayName = 'ContactItemContainer';

export const InteractiveSkeletonDemo = () => (
  // eslint-disable-next-line react/no-children-prop -- InteractiveBox accetta il tipo componente
  <InteractiveBox children={ContactItemContainer} withPlay />
);

const JustSkeleton = () => (
  <div style={styles.interactiveContainer}>
    <ContactListSkeleton />
  </div>
);

export const InteractiveJustSkeleton = () => (
  // eslint-disable-next-line react/no-children-prop -- InteractiveBox accetta il tipo componente
  <InteractiveBox children={JustSkeleton} />
);

export const InteractiveContactItem = () => (
  // eslint-disable-next-line react/no-children-prop -- InteractiveBox accetta il tipo componente
  <InteractiveBox children={ContactItemContainer} />
);
