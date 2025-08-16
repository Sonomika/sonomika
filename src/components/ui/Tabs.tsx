import React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';

export const Tabs = TabsPrimitive.Root;
export const TabsList: React.FC<React.PropsWithChildren<{}>> = ({ children }) => (
  <TabsPrimitive.List className="tw-inline-flex tw-h-9 tw-items-center tw-justify-center tw-rounded-md tw-bg-neutral-900 tw-p-1 tw-text-neutral-200">
    {children}
  </TabsPrimitive.List>
);

export const TabsTrigger: React.FC<React.PropsWithChildren<{ value: string }>> = ({ value, children }) => (
  <TabsPrimitive.Trigger
    value={value}
    className="tw-inline-flex tw-items-center tw-justify-center tw-whitespace-nowrap tw-rounded tw-px-3 tw-py-1.5 tw-text-sm tw-font-medium tw-ring-offset-neutral-900 data-[state=active]:tw-bg-neutral-800 data-[state=active]:tw-text-white tw-text-neutral-300 hover:tw-text-white focus:tw-outline-none"
  >
    {children}
  </TabsPrimitive.Trigger>
);

export const TabsContent: React.FC<React.PropsWithChildren<{ value: string }>> = ({ value, children }) => (
  <TabsPrimitive.Content value={value} className="tw-mt-3 focus:tw-outline-none">
    {children}
  </TabsPrimitive.Content>
);


