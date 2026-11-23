'use client';

// @ts-expect-error - il modulo non espone type declaration
import Color from 'color';
import { CheckCircleIcon } from './check-circle-icon';
import { motion, AnimatePresence } from 'framer-motion';

const ACTIVE_COLOR = '#EF8E52';
const INACTIVE_COLOR = '#B3B1B4';

type CheckboxProps = {
  label: string;
  checked: boolean;
  onPress: () => void;
  disableAnimations?: boolean;
};

const styles = {
  container: {
    padding: '12px 20px',
    border: '1px solid #dfdfdf',
    borderRadius: '60px',
    display: 'flex',
    flexDirection: 'row' as const,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    WebkitBackfaceVisibility: 'hidden',
    WebkitTransform: 'translateZ(0)',
  },
  label: {
    fontSize: '18px',
    color: '#fff',
  },
  iconContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '16px',
  },
} as const;

export const Checkbox = ({
  label,
  checked,
  onPress,
  disableAnimations = false,
}: CheckboxProps) => {
  const fadedActiveColor = Color(ACTIVE_COLOR).alpha(0.1).toString();

  const baseContainerStyle = {
    ...styles.container,
    backgroundColor: checked ? fadedActiveColor : 'transparent',
    borderColor: checked ? ACTIVE_COLOR : INACTIVE_COLOR,
  };

  const baseLabelStyle = {
    ...styles.label,
    userSelect: 'none' as const,
    color: checked ? ACTIVE_COLOR : INACTIVE_COLOR,
  };

  if (disableAnimations) {
    return (
      <div onClick={onPress} style={baseContainerStyle}>
        <span style={baseLabelStyle}>{label}</span>
        {checked && (
          <div style={{ ...styles.iconContainer, marginLeft: '8px' }}>
            <CheckCircleIcon size={18} color={ACTIVE_COLOR} />
          </div>
        )}
      </div>
    );
  }

  return (
    <motion.div
      onClick={onPress}
      style={styles.container}
      layout="position"
      animate={{
        backgroundColor: checked ? fadedActiveColor : 'transparent',
        borderColor: checked ? ACTIVE_COLOR : INACTIVE_COLOR,
      }}
      transition={{
        type: 'spring',
        stiffness: 500,
        damping: 30,
        mass: 1,
      }}
    >
      <motion.span
        layout="position"
        style={{
          ...styles.label,
          userSelect: 'none',
        }}
        animate={{
          color: checked ? ACTIVE_COLOR : INACTIVE_COLOR,
        }}
        transition={{
          type: 'spring',
          stiffness: 500,
          damping: 30,
          mass: 1,
        }}
      >
        {label}
      </motion.span>
      <AnimatePresence mode="wait">
        {checked && (
          <motion.div
            style={styles.iconContainer}
            initial={{ width: 0, opacity: 0, scale: 0.5, marginLeft: 0 }}
            animate={{ width: 'auto', opacity: 1, scale: 1, marginLeft: '8px' }}
            exit={{ width: 0, opacity: 0, scale: 0.5, marginLeft: 0 }}
            transition={{
              type: 'spring',
              stiffness: 500,
              damping: 25,
              mass: 1,
              opacity: { duration: 0.15 },
              width: { type: 'spring', stiffness: 400, damping: 30 },
            }}
          >
            <CheckCircleIcon size={18} color={ACTIVE_COLOR} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};