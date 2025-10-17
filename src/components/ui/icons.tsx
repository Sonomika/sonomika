import React from 'react';

type IconProps = {
  className?: string;
};

export const LockedIcon: React.FC<IconProps> = ({ className }) => (
  <svg
    className={className}
    width="15"
    height="15"
    viewBox="0 0 15 15"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M7.85361 1.48959C7.65835 1.29432 7.34176 1.29432 7.1465 1.48959L1.48965 7.14644C1.29439 7.3417 1.29439 7.65829 1.48965 7.85355L3.9645 10.3284L1.64644 12.6464C1.45118 12.8417 1.45118 13.1583 1.64644 13.3536C1.84171 13.5488 2.15829 13.5488 2.35355 13.3536L4.6716 11.0355L7.1465 13.5104C7.34176 13.7057 7.65835 13.7057 7.85361 13.5104L13.5105 7.85355C13.7057 7.65829 13.7057 7.3417 13.5105 7.14644L11.0356 4.67154L13.3535 2.35355C13.5488 2.15829 13.5488 1.84171 13.3535 1.64645C13.1583 1.45118 12.8417 1.45118 12.6464 1.64645L10.3285 3.96443L7.85361 1.48959ZM9.62135 4.67154L7.50005 2.55025L2.55031 7.49999L4.6716 9.62129L9.62135 4.67154ZM5.37871 10.3284L7.50005 12.4497L12.4498 7.49999L10.3285 5.37865L5.37871 10.3284Z"
      fill="currentColor"
      fillRule="evenodd"
      clipRule="evenodd"
    />
  </svg>
);

export const UnlockedIcon: React.FC<IconProps> = ({ className }) => (
  <svg
    className={className}
    width="15"
    height="15"
    viewBox="0 0 15 15"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M7.1465 1.48959C7.34176 1.29432 7.65835 1.29432 7.85361 1.48959L13.5105 7.14644C13.7057 7.3417 13.7057 7.65829 13.5105 7.85355L7.85361 13.5104C7.65835 13.7057 7.34176 13.7057 7.1465 13.5104L1.48965 7.85355C1.29439 7.65829 1.29439 7.3417 1.48965 7.14644L7.1465 1.48959ZM7.50005 2.55025L2.55031 7.49999L7.50005 12.4497L12.4498 7.49999L7.50005 2.55025Z"
      fill="currentColor"
      fillRule="evenodd"
      clipRule="evenodd"
    />
  </svg>
);


// Padlock variants used only in Composition Settings
export const PadlockClosedIcon: React.FC<IconProps> = ({ className }) => (
  <svg
    className={className}
    width="15"
    height="15"
    viewBox="0 0 15 15"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Shackle */}
    <path
      d="M5 6V5.5C5 3.567 6.567 2 8.5 2C10.433 2 12 3.567 12 5.5V6"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
    {/* Body */}
    <rect x="3" y="6" width="9" height="7" rx="1.5" fill="currentColor" />
    {/* Keyhole */}
    <path d="M7.5 9.25a1 1 0 1 1 1 0v1.5h-1v-1.5z" fill="#141414" />
  </svg>
);

export const PadlockOpenIcon: React.FC<IconProps> = ({ className }) => (
  <svg
    className={className}
    width="15"
    height="15"
    viewBox="0 0 15 15"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Open shackle */}
    <path
      d="M5 6V5.5C5 3.567 6.567 2 8.5 2C10.433 2 12 3.567 12 5.5"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
    {/* Body */}
    <rect x="3" y="6" width="9" height="7" rx="1.5" fill="currentColor" />
    {/* Keyhole */}
    <path d="M7.5 9.25a1 1 0 1 1 1 0v1.5h-1v-1.5z" fill="#141414" />
  </svg>
);


export const DiceIcon: React.FC<IconProps> = ({ className }) => (
  <svg
    className={className}
    width="15"
    height="15"
    viewBox="0 0 15 15"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Dice outline */}
    <rect x="2" y="2" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.2" />
    {/* Pips */}
    <circle cx="5" cy="5" r="1" fill="currentColor" />
    <circle cx="10" cy="5" r="1" fill="currentColor" />
    <circle cx="5" cy="10" r="1" fill="currentColor" />
    <circle cx="10" cy="10" r="1" fill="currentColor" />
    <circle cx="7.5" cy="7.5" r="1" fill="currentColor" />
  </svg>
);

